from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.core.database import get_db
from app.models.models import (
    AvailabilityStatus,
    Schedule,
    ScheduleAssignment,
    TrainingSession,
    User,
    UserAvailability,
    UserRole,
)
from app.schemas.schemas import (
    AvailabilityConflictItem,
    AvailabilityConflictRequest,
    AvailabilityCreate,
    AvailabilityOut,
)

router = APIRouter(prefix="/availability", tags=["availability"])


def _naive_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def _target_user(db: Session, current_user: User, user_id: Optional[int]) -> User:
    target_id = user_id or current_user.id
    target = db.query(User).filter(User.id == target_id, User.club_id == current_user.club_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Club member not found")
    if target.id != current_user.id and current_user.role not in [UserRole.COACH, UserRole.ADMIN]:
        raise HTTPException(status_code=403, detail="You can only manage your own availability")
    return target


def _availability_out(entry: UserAvailability, current_user: User) -> AvailabilityOut:
    source = "self" if entry.created_by_id == entry.user_id else (
        entry.created_by.role.value if entry.created_by else "staff"
    )
    output = AvailabilityOut.model_validate(entry)
    output.user_name = entry.user.full_name if entry.user else None
    output.source = source
    if current_user.id != entry.user_id and current_user.role != UserRole.ADMIN:
        output.private_notes = None
    return output


@router.get("", response_model=List[AvailabilityOut])
def list_availability(
    user_id: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target = _target_user(db, current_user, user_id)
    entries = db.query(UserAvailability).filter(
        UserAvailability.user_id == target.id
    ).order_by(UserAvailability.starts_at.asc()).all()
    return [_availability_out(entry, current_user) for entry in entries]


@router.post("", response_model=AvailabilityOut)
def create_availability(
    payload: AvailabilityCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target = _target_user(db, current_user, payload.user_id)
    starts_at = _naive_utc(payload.starts_at)
    ends_at = _naive_utc(payload.ends_at)
    if ends_at <= starts_at:
        raise HTTPException(status_code=400, detail="Availability end must be after its start")
    if payload.is_safety_restriction and target.id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Only the member or an administrator can create a safety restriction")

    entry = UserAvailability(
        user_id=target.id,
        starts_at=starts_at,
        ends_at=ends_at,
        status=payload.status,
        reason_category=payload.reason_category,
        coach_visible_notes=payload.coach_visible_notes,
        private_notes=payload.private_notes,
        is_safety_restriction=payload.is_safety_restriction,
        created_by_id=current_user.id,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return _availability_out(entry, current_user)


@router.delete("/{entry_id}")
def delete_availability(
    entry_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entry = db.query(UserAvailability).join(User, UserAvailability.user_id == User.id).filter(
        UserAvailability.id == entry_id,
        User.club_id == current_user.club_id,
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Availability entry not found")
    can_manage = entry.user_id == current_user.id or current_user.role in [UserRole.COACH, UserRole.ADMIN]
    if not can_manage:
        raise HTTPException(status_code=403, detail="You cannot remove this availability entry")
    if entry.is_safety_restriction and current_user.role == UserRole.COACH and entry.created_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="A coach cannot remove a member's safety restriction")
    db.delete(entry)
    db.commit()
    return {"status": "deleted", "id": entry_id}


@router.post("/conflicts", response_model=List[AvailabilityConflictItem])
def check_assignment_conflicts(
    payload: AvailabilityConflictRequest,
    current_user: User = Depends(require_roles([UserRole.COACH, UserRole.ADMIN])),
    db: Session = Depends(get_db),
):
    user_ids = list(dict.fromkeys(payload.user_ids))
    users = db.query(User).filter(
        User.id.in_(user_ids),
        User.club_id == current_user.club_id,
        User.is_active == True,
    ).all() if user_ids else []
    if len(users) != len(user_ids):
        raise HTTPException(status_code=400, detail="One or more members are invalid, inactive, or belong to another club")
    if not payload.sessions:
        return [AvailabilityConflictItem(user_id=user.id, status="available") for user in users]

    planned_sessions = [
        (_naive_utc(item.starts_at), item.duration_minutes) for item in payload.sessions
    ]
    earliest = min(starts_at for starts_at, _ in planned_sessions) - timedelta(days=1)
    latest = max(starts_at + timedelta(minutes=duration) for starts_at, duration in planned_sessions) + timedelta(days=1)
    availability = db.query(UserAvailability).filter(
        UserAvailability.user_id.in_(user_ids),
        UserAvailability.starts_at < latest,
        UserAvailability.ends_at > earliest,
    ).all() if user_ids else []

    session_query = db.query(TrainingSession, ScheduleAssignment).join(
        Schedule, TrainingSession.schedule_id == Schedule.id
    ).join(
        ScheduleAssignment, ScheduleAssignment.schedule_id == Schedule.id
    ).filter(
        Schedule.club_id == current_user.club_id,
        ScheduleAssignment.user_id.in_(user_ids),
        TrainingSession.session_date >= earliest,
        TrainingSession.session_date <= latest,
    )
    if payload.exclude_schedule_id:
        session_query = session_query.filter(Schedule.id != payload.exclude_schedule_id)
    existing_sessions = session_query.all()

    results = []
    for user in users:
        messages: List[str] = []
        conflict_titles: List[str] = []
        same_day_session_ids = set()
        has_time_conflict = False
        has_unavailable = False
        has_limited = False
        has_safety = False
        daily_load = {}
        for planned_start, planned_duration in planned_sessions:
            daily_load[planned_start.date()] = daily_load.get(planned_start.date(), 0) + planned_duration

        user_existing = {
            session.id: session
            for session, assignment in existing_sessions
            if assignment.user_id == user.id
        }
        for existing in user_existing.values():
            if existing.session_date.date() in daily_load:
                same_day_session_ids.add(existing.id)
                daily_load[existing.session_date.date()] += existing.duration_minutes or 60

        for planned_start, planned_duration in planned_sessions:
            planned_end = planned_start + timedelta(minutes=planned_duration)
            for entry in availability:
                if entry.user_id != user.id or entry.starts_at >= planned_end or entry.ends_at <= planned_start:
                    continue
                has_safety = has_safety or entry.is_safety_restriction
                has_unavailable = has_unavailable or entry.status == AvailabilityStatus.UNAVAILABLE
                has_limited = has_limited or entry.status == AvailabilityStatus.LIMITED
                label = entry.reason_category or entry.status.value.replace("_", " ")
                note = f": {entry.coach_visible_notes}" if entry.coach_visible_notes else ""
                message = f"{label}{note}"
                if message not in messages:
                    messages.append(message)

            for existing in user_existing.values():
                existing_end = existing.session_date + timedelta(minutes=existing.duration_minutes or 60)
                if existing.session_date < planned_end and existing_end > planned_start:
                    has_time_conflict = True
                    if existing.title not in conflict_titles:
                        conflict_titles.append(existing.title)

        max_daily_load = max(daily_load.values(), default=0)
        if has_safety:
            status = "safety_restriction"
        elif has_unavailable:
            status = "unavailable"
        elif has_time_conflict:
            status = "time_conflict"
        elif has_limited:
            status = "limited"
        elif max_daily_load > 180:
            status = "high_load"
        elif same_day_session_ids:
            status = "scheduled"
        else:
            status = "available"
        results.append(AvailabilityConflictItem(
            user_id=user.id,
            status=status,
            same_day_sessions=len(same_day_session_ids),
            daily_load_minutes=max_daily_load,
            conflict_titles=conflict_titles,
            messages=messages,
            has_safety_restriction=has_safety,
        ))
    return results
