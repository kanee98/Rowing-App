import hashlib
import secrets
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import get_password_hash, verify_password, create_access_token
from app.api.deps import get_current_user
from app.models.models import User, BoatSidePreference
from app.models.operations import AccountAction, utcnow
from app.schemas.schemas import Token, UserOut
from app.services.delivery import queue_email, email_configured, app_link, trigger_delivery
from app.services.club_operations import audit, lock_club

router = APIRouter(prefix="/account", tags=["account settings"])


class ProfileUpdate(BaseModel):
    full_name: str = Field(min_length=1, max_length=255)
    weight_kg: float | None = Field(None, gt=0)
    height_cm: float | None = Field(None, gt=0)
    side_preference: BoatSidePreference | None = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=72)


class EmailChange(BaseModel):
    current_password: str
    new_email: EmailStr


class ResetRequest(BaseModel):
    email: EmailStr


class ActionInput(BaseModel):
    token: str = Field(min_length=20, max_length=256)
    new_password: str | None = Field(None, min_length=8, max_length=72)


def require_mail():
    if not email_configured():
        raise HTTPException(503, "Email delivery is not configured. Contact your club administrator for account recovery.")


def action_token(db, user, purpose, new_email=None):
    db.query(AccountAction).filter(AccountAction.user_id == user.id, AccountAction.purpose == purpose,
        AccountAction.consumed_at.is_(None)).update({"consumed_at": utcnow()}, synchronize_session=False)
    raw = secrets.token_urlsafe(32)
    db.add(AccountAction(user_id=user.id, purpose=purpose, new_email=new_email,
        token_hash=hashlib.sha256(raw.encode()).hexdigest(), expires_at=utcnow() + timedelta(hours=1)))
    return raw


def auth_response(user):
    result = UserOut.model_validate(user)
    result.club_name = user.club.name
    return Token(access_token=create_access_token(user.id, token_version=user.token_version), user=result)


def locked_user(db, user, authenticated=True):
    expected_version = user.token_version
    lock_club(db, user)
    fresh = db.query(User).filter(User.id == user.id).populate_existing().with_for_update().first()
    if not fresh or not fresh.is_active or (authenticated and fresh.token_version != expected_version):
        raise HTTPException(401, 'Your account changed. Please sign in again.')
    return fresh


@router.put("/profile", response_model=UserOut)
def profile(payload: ProfileUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user = locked_user(db, user)
    if not payload.full_name.strip():
        raise HTTPException(422, "Enter your full name")
    for field, value in payload.model_dump().items():
        setattr(user, field, value.strip() if type(value) is str else value)
    audit(db, user, "update_profile", "user", user.id)
    db.commit(); db.refresh(user)
    result = UserOut.model_validate(user); result.club_name = user.club.name
    return result


@router.post("/password", response_model=Token)
def password(payload: PasswordChange, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user = locked_user(db, user)
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(400, "Your current password is incorrect")
    user.hashed_password = get_password_hash(payload.new_password)
    user.token_version += 1
    db.query(AccountAction).filter(AccountAction.user_id == user.id, AccountAction.consumed_at.is_(None)).update({"consumed_at": utcnow()}, synchronize_session=False)
    audit(db, user, "change_password", "user", user.id)
    db.commit(); db.refresh(user)
    return auth_response(user)


@router.post("/email-change")
def email_change(payload: EmailChange, user: User = Depends(get_current_user), db: Session = Depends(get_db), background_tasks: BackgroundTasks = None):
    require_mail()
    user = locked_user(db, user)
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(400, "Your current password is incorrect")
    email = str(payload.new_email).lower()
    if db.query(User).filter(func.lower(User.email) == email).first():
        raise HTTPException(409, "That email is already in use")
    raw = action_token(db, user, "email_change", email)
    queue_email(db, user.club_id, email, "Confirm your new club account email", f"Confirm your new email within one hour:\n{app_link(account_action='email_change', token=raw)}")
    db.commit()
    trigger_delivery(background_tasks)
    return {"message": "A confirmation link has been queued to your new email. Your current email remains active until confirmation."}


@router.post("/forgot-password")
def forgot_password(payload: ResetRequest, db: Session = Depends(get_db), background_tasks: BackgroundTasks = None):
    require_mail()
    user = db.query(User).filter(func.lower(User.email) == str(payload.email).lower(), User.is_active == True).first()
    if user:
        user = locked_user(db, user, authenticated=False)
        # Re-read after the lock: this address may have just been changed.
        if user.email.lower() != str(payload.email).lower():
            return {"message": "If an active account matches that email, a password reset link has been queued."}
        recent = db.query(AccountAction).filter(AccountAction.user_id == user.id, AccountAction.purpose == "password_reset",
            AccountAction.expires_at > utcnow() + timedelta(minutes=55), AccountAction.consumed_at.is_(None)).first()
        if not recent:
            raw = action_token(db, user, "password_reset")
            queue_email(db, user.club_id, user.email, "Reset your club account password", f"Reset your password within one hour:\n{app_link(account_action='password_reset', token=raw)}\nIgnore this message if you did not request it.")
            db.commit()
            trigger_delivery(background_tasks)
    return {"message": "If an active account matches that email, a password reset link has been queued."}


@router.post("/confirm")
def confirm(payload: ActionInput, db: Session = Depends(get_db), background_tasks: BackgroundTasks = None):
    digest = hashlib.sha256(payload.token.encode()).hexdigest()
    action = db.query(AccountAction).filter(AccountAction.token_hash == digest).first()
    if not action or action.consumed_at or action.expires_at <= utcnow():
        raise HTTPException(400, "This link has expired or has already been used. Request a new link.")
    user = db.query(User).filter(User.id == action.user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(400, "This account is unavailable")
    user = locked_user(db, user, authenticated=False)
    action = db.query(AccountAction).filter(AccountAction.token_hash == digest).populate_existing().with_for_update().first()
    if not action or action.consumed_at or action.expires_at <= utcnow():
        raise HTTPException(400, 'This link has expired or has already been used. Request a new link.')
    if action.purpose == "password_reset":
        if not payload.new_password:
            raise HTTPException(422, "Enter a new password")
        user.hashed_password = get_password_hash(payload.new_password)
    elif action.purpose == "email_change":
        if db.query(User).filter(func.lower(User.email) == action.new_email, User.id != user.id).first():
            raise HTTPException(409, "This email is already in use")
        previous_email = user.email
        user.email, user.email_verified_at = action.new_email, utcnow()
        queue_email(db, user.club_id, previous_email, "Your club account email changed", "Your account email was changed after confirmation. Contact your club administrator if you did not request this change.")
    else:
        raise HTTPException(400, "Unsupported account action")
    action.consumed_at = utcnow(); user.token_version += 1
    db.query(AccountAction).filter(AccountAction.user_id == user.id, AccountAction.consumed_at.is_(None)).update({"consumed_at": utcnow()}, synchronize_session=False)
    audit(db, user, action.purpose, "user", user.id)
    db.commit()
    trigger_delivery(background_tasks)
    return {"message": "Account updated. Sign in with your current email and password."}
