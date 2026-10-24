import hashlib
import secrets
from datetime import datetime, timedelta
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.core.database import get_db
from app.core.security import create_access_token, get_password_hash
from app.models.models import Club, ClubInvitation, ClubJoinRequest, Notification, User, UserRole
from app.services.delivery import queue_email, app_link, email_configured
from app.models.operations import EmailOutbox
from app.schemas.schemas import (
    ClubInvitationAccept, ClubInvitationCreate, ClubInvitationCreated,
    ClubInvitationOut, ClubInvitationPreview, ClubJoinRequestCreate,
    ClubJoinRequestOut, ClubPublicOut, JoinRequestReview, Token, UserOut,
)

router = APIRouter(prefix="/membership", tags=["membership"])

def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

def _find_invitation(db: Session, token: str) -> ClubInvitation:
    invitation = db.query(ClubInvitation).filter(ClubInvitation.token_hash == _token_hash(token)).with_for_update().first()
    if not invitation or invitation.revoked_at or invitation.accepted_at or invitation.expires_at <= datetime.utcnow():
        raise HTTPException(status_code=400, detail="Invitation is invalid, expired, revoked, or already used")
    return invitation


def _cancel_invitation_emails(db, invitation_id):
    db.query(EmailOutbox).filter(EmailOutbox.dedupe_key.like(f'invitation:{invitation_id}:%'), EmailOutbox.status.in_(['pending', 'failed'])).update({'status': 'cancelled', 'body': ''}, synchronize_session=False)

@router.get("/clubs/{club_code}", response_model=ClubPublicOut)
def find_club(club_code: str, db: Session = Depends(get_db)):
    club = db.query(Club).filter(func.upper(Club.code) == club_code.strip().upper()).first()
    if not club:
        raise HTTPException(status_code=404, detail="Club code not found")
    return ClubPublicOut.model_validate(club, from_attributes=True)

@router.post("/join-requests", response_model=ClubJoinRequestOut)
def request_to_join(payload: ClubJoinRequestCreate, db: Session = Depends(get_db)):
    club = db.query(Club).filter(func.upper(Club.code) == payload.club_code.strip().upper()).first()
    if not club:
        raise HTTPException(status_code=404, detail="Club code not found")
    if club.athlete_join_policy == "closed":
        raise HTTPException(status_code=403, detail="This club is not accepting membership requests")
    if club.athlete_join_policy == "invite_only":
        raise HTTPException(status_code=403, detail="This club accepts athletes by invitation only")

    email = payload.email.strip().lower()
    if db.query(User).filter(func.lower(User.email) == email).first():
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    request = db.query(ClubJoinRequest).filter(
        ClubJoinRequest.club_id == club.id,
        func.lower(ClubJoinRequest.email) == email,
    ).first()
    if request and request.status == "pending":
        raise HTTPException(status_code=409, detail="A membership request for this email is already pending")
    if not request:
        request = ClubJoinRequest(club_id=club.id, email=email)
        db.add(request)
    request.full_name = payload.full_name.strip()
    request.hashed_password = get_password_hash(payload.password)
    request.weight_kg = payload.weight_kg
    request.height_cm = payload.height_cm
    request.side_preference = payload.side_preference
    request.status = "pending"
    request.reviewed_by_id = None
    request.reviewed_at = None
    request.review_notes = None
    db.flush()

    reviewers = db.query(User).filter(
        User.club_id == club.id,
        User.role.in_([UserRole.ADMIN, UserRole.COACH]),
        User.is_active == True,
    ).all()
    for reviewer in reviewers:
        db.add(Notification(
            user_id=reviewer.id, club_id=club.id,
            title="New athlete membership request",
            message=f"{request.full_name} requested to join {club.name} as an athlete.",
            type="membership_request", link_action="membership",
        ))
    db.commit()
    db.refresh(request)
    return request

@router.get("/join-requests", response_model=List[ClubJoinRequestOut])
def list_join_requests(
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.COACH])),
    db: Session = Depends(get_db),
):
    return db.query(ClubJoinRequest).filter(
        ClubJoinRequest.club_id == current_user.club_id,
    ).order_by(ClubJoinRequest.status.asc(), ClubJoinRequest.created_at.desc()).all()

@router.post("/join-requests/{request_id}/approve", response_model=UserOut)
def approve_join_request(
    request_id: int,
    payload: JoinRequestReview,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.COACH])),
    db: Session = Depends(get_db),
):
    request = db.query(ClubJoinRequest).filter(
        ClubJoinRequest.id == request_id,
        ClubJoinRequest.club_id == current_user.club_id,
    ).first()
    if not request or request.status != "pending":
        raise HTTPException(status_code=404, detail="Pending membership request not found")
    if db.query(User).filter(func.lower(User.email) == request.email.lower()).first():
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    user = User(
        club_id=request.club_id, email=request.email, hashed_password=request.hashed_password,
        full_name=request.full_name, role=UserRole.ATHLETE, weight_kg=request.weight_kg,
        height_cm=request.height_cm, side_preference=request.side_preference, is_active=True,
    )
    db.add(user)
    request.status = "approved"
    request.hashed_password = get_password_hash(secrets.token_urlsafe(32))
    request.reviewed_by_id = current_user.id
    request.reviewed_at = datetime.utcnow()
    request.review_notes = payload.notes
    queue_email(db, request.club_id, request.email, "Your club membership was approved", f"You can now sign in to {current_user.club.name} using the password you chose.\n{app_link()}")
    db.commit()
    db.refresh(user)
    result = UserOut.model_validate(user)
    result.club_name = current_user.club.name if current_user.club else None
    return result

@router.post("/join-requests/{request_id}/reject", response_model=ClubJoinRequestOut)
def reject_join_request(
    request_id: int,
    payload: JoinRequestReview,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.COACH])),
    db: Session = Depends(get_db),
):
    request = db.query(ClubJoinRequest).filter(
        ClubJoinRequest.id == request_id,
        ClubJoinRequest.club_id == current_user.club_id,
    ).first()
    if not request or request.status != "pending":
        raise HTTPException(status_code=404, detail="Pending membership request not found")
    request.status = "rejected"
    request.hashed_password = get_password_hash(secrets.token_urlsafe(32))
    request.reviewed_by_id = current_user.id
    request.reviewed_at = datetime.utcnow()
    request.review_notes = payload.notes
    queue_email(db, request.club_id, request.email, "Your club membership request was reviewed", f"Your request to join {current_user.club.name} was not approved. Contact the club for details.")
    db.commit()
    db.refresh(request)
    return request

@router.post("/invitations", response_model=ClubInvitationCreated)
def create_invitation(
    payload: ClubInvitationCreate,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.COACH])),
    db: Session = Depends(get_db),
):
    if current_user.role == UserRole.COACH and payload.role != UserRole.ATHLETE:
        raise HTTPException(status_code=403, detail="Coaches may invite athletes only; administrators invite staff")
    email = payload.email.strip().lower()
    if db.query(User).filter(func.lower(User.email) == email).first():
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    existing_invitation = db.query(ClubInvitation).filter(
        ClubInvitation.club_id == current_user.club_id,
        func.lower(ClubInvitation.email) == email,
        ClubInvitation.role == payload.role,
        ClubInvitation.accepted_at.is_(None),
        ClubInvitation.revoked_at.is_(None),
        ClubInvitation.expires_at > datetime.utcnow(),
    ).first()
    if existing_invitation:
        raise HTTPException(status_code=409, detail="An active invitation already exists for this email and role")
    token = secrets.token_urlsafe(32)
    invitation = ClubInvitation(
        club_id=current_user.club_id, email=email, role=payload.role,
        token_hash=_token_hash(token), invited_by_id=current_user.id,
        expires_at=datetime.utcnow() + timedelta(days=payload.expires_days),
    )
    db.add(invitation)
    db.flush()
    queue_email(db, current_user.club_id, email, f"Invitation to {current_user.club.name}",
        f"You have been invited as {payload.role.value}. Create your own account using this single-use link:\n{app_link(invite=token)}\nThis invitation expires in {payload.expires_days} days.", dedupe_key=f'invitation:{invitation.id}:{_token_hash(token)[:16]}')
    db.commit()
    db.refresh(invitation)
    return ClubInvitationCreated(
        **ClubInvitationOut.model_validate(invitation).model_dump(),
        token=token,
        email_queued=email_configured(),
    )

@router.post("/invitations/{invitation_id}/resend", response_model=ClubInvitationCreated)
def resend_invitation(invitation_id: int, current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.COACH])), db: Session = Depends(get_db)):
    invitation = db.query(ClubInvitation).filter(ClubInvitation.id == invitation_id, ClubInvitation.club_id == current_user.club_id).with_for_update().first()
    if not invitation or (current_user.role == UserRole.COACH and invitation.role != UserRole.ATHLETE):
        raise HTTPException(404, "Invitation not found")
    if invitation.accepted_at or invitation.revoked_at:
        raise HTTPException(409, "Create a new invitation for an accepted or revoked invitation")
    token = secrets.token_urlsafe(32)
    _cancel_invitation_emails(db, invitation.id)
    invitation.token_hash, invitation.expires_at = _token_hash(token), datetime.utcnow() + timedelta(days=7)
    queue_email(db, current_user.club_id, invitation.email, f"New invitation link for {current_user.club.name}", f"This replaces your previous invitation. Join as {invitation.role.value}:\n{app_link(invite=token)}\nThe link expires in seven days.", dedupe_key=f'invitation:{invitation.id}:{_token_hash(token)[:16]}')
    db.commit(); db.refresh(invitation)
    return ClubInvitationCreated(**ClubInvitationOut.model_validate(invitation).model_dump(), token=token, email_queued=email_configured())

@router.get("/invitations", response_model=List[ClubInvitationOut])
def list_invitations(
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.COACH])),
    db: Session = Depends(get_db),
):
    query = db.query(ClubInvitation).filter(ClubInvitation.club_id == current_user.club_id)
    if current_user.role == UserRole.COACH:
        query = query.filter(ClubInvitation.role == UserRole.ATHLETE)
    return query.order_by(ClubInvitation.created_at.desc()).limit(100).all()

@router.delete("/invitations/{invitation_id}")
def revoke_invitation(
    invitation_id: int,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.COACH])),
    db: Session = Depends(get_db),
):
    invitation = db.query(ClubInvitation).filter(
        ClubInvitation.id == invitation_id,
        ClubInvitation.club_id == current_user.club_id,
    ).first()
    if not invitation or (current_user.role == UserRole.COACH and invitation.role != UserRole.ATHLETE):
        raise HTTPException(status_code=404, detail="Invitation not found")
    invitation.revoked_at = datetime.utcnow()
    _cancel_invitation_emails(db, invitation.id)
    db.commit()
    return {"status": "revoked", "id": invitation.id}

@router.get("/invitations/{token}", response_model=ClubInvitationPreview)
def preview_invitation(token: str, db: Session = Depends(get_db)):
    invitation = _find_invitation(db, token)
    return ClubInvitationPreview(
        club_name=invitation.club.name, club_location=invitation.club.location,
        email=invitation.email, role=invitation.role, expires_at=invitation.expires_at,
    )

@router.post("/invitations/accept", response_model=Token)
def accept_invitation(payload: ClubInvitationAccept, db: Session = Depends(get_db)):
    invitation = _find_invitation(db, payload.token)
    if db.query(User).filter(func.lower(User.email) == invitation.email.lower()).first():
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    user = User(
        club_id=invitation.club_id, email=invitation.email,
        hashed_password=get_password_hash(payload.password), full_name=payload.full_name.strip(),
        role=invitation.role, weight_kg=payload.weight_kg, height_cm=payload.height_cm,
        side_preference=payload.side_preference, is_active=True,
    )
    db.add(user)
    invitation.accepted_at = datetime.utcnow()
    _cancel_invitation_emails(db, invitation.id)
    db.commit()
    db.refresh(user)
    user_out = UserOut.model_validate(user)
    user_out.club_name = invitation.club.name
    return Token(access_token=create_access_token(subject=user.id), token_type="bearer", user=user_out)
