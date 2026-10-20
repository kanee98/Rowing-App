from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.models import PerformanceEntry, User, UserRole, Exercise, TrainingSession, Schedule, ScheduleAssignment, SessionExercise
from app.schemas.schemas import PerformanceEntryCreate, PerformanceEntryOut, PerformanceVerify
from app.api.deps import get_current_user, require_roles
from app.services.analytics_service import format_split

router = APIRouter(prefix="/performance", tags=["performance"])

def compute_rowing_metrics(payload: PerformanceEntryCreate, derive_erg_watts: bool) -> tuple[float | None, float | None, float | None]:
    """Calculates split, duration, and Concept2 watts automatically if missing"""
    split_sec = payload.avg_split_seconds
    dur_sec = payload.actual_duration_sec
    dist_m = payload.actual_distance_m
    watts = payload.avg_watts

    if dist_m and dur_sec and not split_sec:
        # split per 500m
        split_sec = (dur_sec / dist_m) * 500.0
    
    if dist_m and split_sec and not dur_sec:
        dur_sec = (dist_m / 500.0) * split_sec

    if derive_erg_watts and split_sec and not watts:
        # Standard Concept2 formula: Watts = 2.80 / (pace_sec / 500) ^ 3
        # pace_sec per 500m is split_sec / 500 in pace seconds: pace = split_sec
        # Formula: Watts = 2.80 / (split_sec / 500) ^ 3 ... wait: pace is seconds per meter -> (split_sec / 500)
        pace_per_meter = split_sec / 500.0
        if pace_per_meter > 0:
            watts = round(2.80 / (pace_per_meter ** 3), 1)

    return split_sec, dur_sec, watts

@router.get("", response_model=List[PerformanceEntryOut])
def list_performances(
    athlete_id: Optional[int] = None,
    session_id: Optional[int] = None,
    verified_only: Optional[bool] = None,
    unverified_only: Optional[bool] = None,
    limit: int = Query(50, le=200),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(PerformanceEntry).join(User, PerformanceEntry.athlete_id == User.id)\
        .filter(User.club_id == current_user.club_id)

    # If current user is athlete, default to viewing their own unless coach/admin/trainer
    if current_user.role == UserRole.ATHLETE:
        query = query.filter(PerformanceEntry.athlete_id == current_user.id)
    elif athlete_id:
        query = query.filter(PerformanceEntry.athlete_id == athlete_id)

    if session_id:
        query = query.filter(PerformanceEntry.session_id == session_id)
    if verified_only:
        query = query.filter(PerformanceEntry.is_verified == True)
    if unverified_only:
        query = query.filter(PerformanceEntry.is_verified == False)

    entries = query.order_by(PerformanceEntry.recorded_date.desc()).limit(limit).all()
    
    out = []
    for e in entries:
        po = PerformanceEntryOut.model_validate(e)
        po.avg_split_formatted = format_split(e.avg_split_seconds)
        if e.athlete:
            po.athlete_name = e.athlete.full_name
            po.athlete_weight_kg = e.athlete.weight_kg
        if e.exercise:
            po.exercise_name = e.exercise.name
            po.category = e.exercise.category
        if e.session:
            po.session_title = e.session.title
        if e.verified_by_trainer:
            po.verified_by_trainer_name = e.verified_by_trainer.full_name
        out.append(po)
    return out

@router.post("", response_model=PerformanceEntryOut)
def record_performance(
    payload: PerformanceEntryCreate,
    current_user: User = Depends(require_roles([UserRole.ATHLETE])),
    db: Session = Depends(get_db)
):
    exercise = db.query(Exercise).filter(
        Exercise.id == payload.exercise_id,
        Exercise.club_id == current_user.club_id,
        Exercise.is_active == True,
    ).first()
    if not exercise:
        raise HTTPException(status_code=400, detail="Exercise not found or archived")
    if payload.session_id:
        session = db.query(TrainingSession).join(Schedule, TrainingSession.schedule_id == Schedule.id).filter(
            TrainingSession.id == payload.session_id,
            Schedule.club_id == current_user.club_id,
            Schedule.assignments.any(ScheduleAssignment.user_id == current_user.id),
        ).first()
        if not session:
            raise HTTPException(status_code=403, detail="This session is not assigned to you")
        is_prescribed = db.query(SessionExercise.id).filter(
            SessionExercise.session_id == session.id,
            SessionExercise.exercise_id == exercise.id,
        ).first()
        if not is_prescribed:
            raise HTTPException(status_code=400, detail="Exercise is not prescribed in this session")
    split_sec, dur_sec, watts = compute_rowing_metrics(
        payload,
        derive_erg_watts=exercise.category.value in ["erg_test", "erg_intervals"],
    )

    entry = PerformanceEntry(
        session_id=payload.session_id, exercise_id=payload.exercise_id, athlete_id=current_user.id,
        recorded_date=payload.recorded_date or datetime.utcnow(), actual_distance_m=payload.actual_distance_m,
        actual_duration_sec=dur_sec, actual_reps=payload.actual_reps, actual_weight_kg=payload.actual_weight_kg,
        avg_split_seconds=split_sec, avg_stroke_rate=payload.avg_stroke_rate, avg_watts=watts,
        avg_heart_rate=payload.avg_heart_rate, max_heart_rate=payload.max_heart_rate,
        perceived_exertion_rpe=payload.perceived_exertion_rpe, drag_factor=payload.drag_factor,
        stroke_seat_position=payload.stroke_seat_position, boat_lineup=payload.boat_lineup,
        athlete_notes=payload.athlete_notes, is_verified=False,
    )
    db.add(entry); db.commit(); db.refresh(entry)
    po = PerformanceEntryOut.model_validate(entry)
    po.avg_split_formatted = format_split(entry.avg_split_seconds); po.athlete_name = current_user.full_name
    po.exercise_name = exercise.name; po.category = exercise.category
    try:
        from app.api.notifications import dispatch_notification
        split_txt = f" ({po.avg_split_formatted}/500m)" if po.avg_split_seconds else ""
        for recipient in db.query(User).filter(User.club_id == current_user.club_id, User.role.in_([UserRole.TRAINER, UserRole.COACH]), User.id != current_user.id).all():
            dispatch_notification(db=db, user_id=recipient.id, club_id=current_user.club_id, title=f"📥 New Workout: {current_user.full_name}", message=f"{current_user.full_name} submitted a {exercise.name} session{split_txt}. Ready for technical verification.", notif_type="performance_logged", link_action="verify")
        db.commit()
    except Exception:
        pass
    return po

@router.post("/{performance_id}/verify", response_model=PerformanceEntryOut)
def verify_performance(
    performance_id: int,
    payload: PerformanceVerify,
    current_user: User = Depends(require_roles([UserRole.TRAINER, UserRole.COACH, UserRole.ADMIN])),
    db: Session = Depends(get_db)
):
    entry = db.query(PerformanceEntry).join(User, PerformanceEntry.athlete_id == User.id)\
        .filter(PerformanceEntry.id == performance_id, User.club_id == current_user.club_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Performance entry not found")

    entry.is_verified = payload.is_verified
    entry.verified_by_trainer_id = current_user.id
    entry.verified_at = datetime.utcnow()
    entry.trainer_feedback = payload.trainer_feedback
    entry.trainer_rating = payload.trainer_rating

    db.commit()
    db.refresh(entry)

    # Dispatch notification to the athlete
    try:
        from app.api.notifications import dispatch_notification
        ex_name = entry.exercise.name if entry.exercise else "Workout Piece"
        rating_suffix = f" ({payload.trainer_rating}/5)" if payload.trainer_rating is not None else ""
        fb_snippet = f' "{payload.trainer_feedback[:60]}..."' if payload.trainer_feedback else ""
        dispatch_notification(
            db=db,
            user_id=entry.athlete_id,
            club_id=current_user.club_id,
            title=f"✅ Workout Verified{rating_suffix}",
            message=f"{current_user.full_name} verified your {ex_name} performance.{fb_snippet}",
            notif_type="verification_completed",
            link_action="history"
        )
        db.commit()
    except Exception:
        pass

    po = PerformanceEntryOut.model_validate(entry)
    po.avg_split_formatted = format_split(entry.avg_split_seconds)
    if entry.athlete:
        po.athlete_name = entry.athlete.full_name
    if entry.exercise:
        po.exercise_name = entry.exercise.name
        po.category = entry.exercise.category
    po.verified_by_trainer_name = current_user.full_name
    return po
