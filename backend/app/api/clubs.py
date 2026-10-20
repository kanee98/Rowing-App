from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import get_password_hash
from app.models.models import Club, User, UserRole
from app.schemas.schemas import ClubOut, ClubSettingsUpdate, UserOut, UserCreate, UserUpdate
from app.api.deps import get_current_user, require_roles

router = APIRouter(prefix="/clubs", tags=["clubs"])

@router.get("/current", response_model=ClubOut)
def get_current_club(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    club = db.query(Club).filter(Club.id == current_user.club_id).first()
    if not club:
        raise HTTPException(status_code=404, detail="Club not found")
    return club

@router.put("/current/settings", response_model=ClubOut)
def update_club_settings(
    payload: ClubSettingsUpdate,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.COACH])),
    db: Session = Depends(get_db),
):
    if payload.athlete_join_policy is not None and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Only an administrator can change the club membership policy")
    club = db.query(Club).filter(Club.id == current_user.club_id).first()
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(club, field, value)
    db.commit()
    db.refresh(club)
    return club

@router.get("/members", response_model=List[UserOut])
def get_club_members(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    members = db.query(User).filter(User.club_id == current_user.club_id).all()
    out = []
    for m in members:
        u = UserOut.model_validate(m)
        u.club_name = current_user.club.name if current_user.club else None
        out.append(u)
    return out

@router.post("/members", response_model=UserOut)
def add_club_member(
    payload: UserCreate,
    current_user: User = Depends(require_roles([UserRole.ADMIN])),
    db: Session = Depends(get_db)
):
    normalized_email = payload.email.strip().lower()
    existing = db.query(User).filter(func.lower(User.email) == normalized_email).first()
    if existing:
        raise HTTPException(status_code=400, detail="User with this email already exists")

    new_user = User(
        club_id=current_user.club_id,
        email=normalized_email,
        hashed_password=get_password_hash(payload.password),
        full_name=payload.full_name,
        role=payload.role,
        weight_kg=payload.weight_kg,
        height_cm=payload.height_cm,
        side_preference=payload.side_preference
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    u = UserOut.model_validate(new_user)
    u.club_name = current_user.club.name if current_user.club else None
    return u

@router.put("/members/{member_id}", response_model=UserOut)
def update_club_member(
    member_id: int,
    payload: UserUpdate,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.COACH])),
    db: Session = Depends(get_db)
):
    target = db.query(User).filter(User.id == member_id, User.club_id == current_user.club_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")
    if current_user.role == UserRole.COACH and (target.role in [UserRole.ADMIN, UserRole.COACH] or payload.role in [UserRole.ADMIN, UserRole.COACH]):
        raise HTTPException(status_code=403, detail="Only an administrator can manage administrator or coach accounts")
    
    update_data = payload.model_dump(exclude_unset=True)
    for field, val in update_data.items():
        setattr(target, field, val)
    
    db.commit()
    db.refresh(target)
    u = UserOut.model_validate(target)
    u.club_name = current_user.club.name if current_user.club else None
    return u
