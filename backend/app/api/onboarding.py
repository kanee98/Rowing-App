from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.models import User, OnboardingProgress
from app.schemas.schemas import TourDefinition, OnboardingProgressUpdate, OnboardingProgressOut
from app.api.deps import get_current_user
from app.services.onboarding_service import get_tours_for_role, DEFAULT_TOURS

router = APIRouter(prefix="/onboarding", tags=["onboarding"])

@router.get("/tours", response_model=List[TourDefinition])
def get_available_tours(current_user: User = Depends(get_current_user)):
    """Returns list of interactive tours and guides tailored for the user's role"""
    return get_tours_for_role(current_user.role)

@router.get("/progress", response_model=List[OnboardingProgressOut])
def get_user_onboarding_progress(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    progress_records = db.query(OnboardingProgress).filter(OnboardingProgress.user_id == current_user.id).all()
    return progress_records

@router.post("/progress", response_model=OnboardingProgressOut)
def update_tour_progress(
    payload: OnboardingProgressUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    record = db.query(OnboardingProgress).filter(
        OnboardingProgress.user_id == current_user.id,
        OnboardingProgress.tour_id == payload.tour_id
    ).first()

    if not record:
        record = OnboardingProgress(
            user_id=current_user.id,
            tour_id=payload.tour_id,
            current_step=payload.current_step,
            is_completed=payload.is_completed,
            dismissed=payload.dismissed
        )
        db.add(record)
    else:
        record.current_step = payload.current_step
        record.is_completed = payload.is_completed
        record.dismissed = payload.dismissed

    db.commit()
    db.refresh(record)
    return record
