from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.deps import get_current_user, require_roles
from app.models.models import User, UserRole, BoathouseCondition
from app.schemas.schemas import BoathouseConditionOut, BoathouseConditionUpdate
from app.api.notifications import dispatch_club_notification
from app.services.safety_service import condition_snapshot

router = APIRouter(prefix="/weather", tags=["weather"])


@router.get("/boathouse-conditions", response_model=BoathouseConditionOut)
def get_boathouse_conditions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    condition = db.query(BoathouseCondition).filter(
        BoathouseCondition.club_id == current_user.club_id
    ).first()
    return condition_snapshot(condition, current_user.club_id)


@router.post("/boathouse-conditions", response_model=BoathouseConditionOut)
def update_boathouse_conditions(
    payload: BoathouseConditionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.COACH, UserRole.ADMIN])),
):
    condition = db.query(BoathouseCondition).filter(
        BoathouseCondition.club_id == current_user.club_id
    ).first()
    old_flag = condition.flag_status if condition and condition.report_source == "manual" else None
    if condition is None:
        condition = BoathouseCondition(club_id=current_user.club_id)
        db.add(condition)

    # Publishing replaces the observation snapshot. Empty optional inputs clear
    # old measurements rather than making stale values look newly observed.
    for key, value in payload.model_dump(exclude={"broadcast_alert", "valid_for_hours"}).items():
        setattr(condition, key, (value.strip() or None) if type(value) is str else value)
    condition.report_source = "manual"
    condition.updated_by_id = current_user.id
    condition.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    condition.valid_until = condition.updated_at + timedelta(hours=payload.valid_for_hours)

    if payload.broadcast_alert or condition.flag_status != old_flag:
        label = condition.flag_status.value.upper()
        notes = condition.safety_notes or "No additional club instructions supplied."
        dispatch_club_notification(
            db=db, club_id=current_user.club_id,
            title=f"Boathouse safety report: {label}",
            message=f"A club coach or administrator reported {label}. Follow the club's current safety instructions. {notes}",
            notif_type="weather_alert", link_action="weather", exclude_user_id=current_user.id,
        )
    db.commit()
    db.refresh(condition)
    return condition_snapshot(condition, current_user.club_id)
