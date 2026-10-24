from typing import List, Any
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import verify_password, get_password_hash, create_access_token
from app.models.models import User, Club, UserRole
from app.schemas.schemas import Token, LoginRequest, ClubCreate, UserCreate, UserOut
from app.api.deps import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/register-club", response_model=Token)
def register_club(payload: ClubCreate, db: Session = Depends(get_db)):
    normalized_email = payload.admin_email.strip().lower()
    # Check if club code or admin email exists
    existing_club = db.query(Club).filter(Club.code == payload.code.upper()).first()
    if existing_club:
        raise HTTPException(status_code=400, detail="Club code already registered. Please choose another code.")
    
    existing_user = db.query(User).filter(func.lower(User.email) == normalized_email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="User email already registered.")

    # 1. Create Club
    club = Club(
        name=payload.name,
        code=payload.code.upper(),
        location=payload.location,
        description=payload.description
    )
    db.add(club)
    db.flush()

    # 2. Create Club Admin
    admin_user = User(
        club_id=club.id,
        email=normalized_email,
        hashed_password=get_password_hash(payload.admin_password),
        full_name=payload.admin_name,
        role=UserRole.ADMIN
    )
    db.add(admin_user)
    db.flush()

    # New clubs start clean. Coaches build their real equipment and exercise
    # libraries in the UI; demo data is available only through an explicit action.
    db.commit()
    db.refresh(admin_user)

    # 3. Generate JWT
    access_token = create_access_token(subject=admin_user.id)
    user_out = UserOut.model_validate(admin_user)
    user_out.club_name = club.name

    return Token(
        access_token=access_token,
        token_type="bearer",
        user=user_out
    )

@router.post("/login", response_model=Token)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(func.lower(User.email) == payload.email.strip().lower()).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Account is deactivated")

    access_token = create_access_token(subject=user.id, token_version=user.token_version)
    user_out = UserOut.model_validate(user)
    if user.club:
        user_out.club_name = user.club.name

    return Token(
        access_token=access_token,
        token_type="bearer",
        user=user_out
    )

@router.post("/login-form", response_model=Token)
def login_form(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(func.lower(User.email) == form_data.username.strip().lower()).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Account is deactivated")
    access_token = create_access_token(subject=user.id, token_version=user.token_version)
    user_out = UserOut.model_validate(user)
    if user.club:
        user_out.club_name = user.club.name
    return Token(access_token=access_token, token_type="bearer", user=user_out)

@router.get("/me", response_model=UserOut)
def get_current_user_info(current_user: User = Depends(get_current_user)):
    user_out = UserOut.model_validate(current_user)
    if current_user.club:
        user_out.club_name = current_user.club.name
    return user_out
