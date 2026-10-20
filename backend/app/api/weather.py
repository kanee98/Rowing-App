from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.models import (
    User, UserRole, BoathouseCondition, SafetyFlagStatus, NotificationType
)
from app.schemas.schemas import BoathouseConditionOut, BoathouseConditionUpdate
from app.api.notifications import dispatch_club_notification

router = APIRouter(prefix="/weather", tags=["weather"])

@router.get("/boathouse-conditions", response_model=BoathouseConditionOut)
def get_boathouse_conditions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieve current club boathouse water and weather safety conditions"""
    condition = db.query(BoathouseCondition).filter(
        BoathouseCondition.club_id == current_user.club_id
    ).first()

    if not condition:
        # Default starter condition
        condition = BoathouseCondition(
            club_id=current_user.club_id,
            flag_status=SafetyFlagStatus.GREEN,
            wind_speed_knots=8.0,
            wind_direction="NW Headwind 8 kts",
            water_temp_c=14.5,
            air_temp_c=17.0,
            stream_flow_rate="Moderate Stream (1.2 m/s)",
            safety_notes="River clear. Normal traffic patterns apply. Stay on the starboard side.",
            updated_by_id=current_user.id,
            updated_at=datetime.utcnow()
        )
        db.add(condition)
        db.commit()
        db.refresh(condition)

    return condition

@router.post("/boathouse-conditions", response_model=BoathouseConditionOut)
def update_boathouse_conditions(
    payload: BoathouseConditionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update boathouse weather conditions and safety flag (Coach and Admin only)"""
    if current_user.role not in [UserRole.COACH, UserRole.ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only coaches and administrators can update boathouse safety conditions."
        )

    condition = db.query(BoathouseCondition).filter(
        BoathouseCondition.club_id == current_user.club_id
    ).first()

    if not condition:
        condition = BoathouseCondition(
            club_id=current_user.club_id,
            updated_by_id=current_user.id
        )
        db.add(condition)

    old_flag = condition.flag_status

    if payload.flag_status is not None:
        condition.flag_status = payload.flag_status
    if payload.wind_speed_knots is not None:
        condition.wind_speed_knots = payload.wind_speed_knots
    if payload.wind_direction is not None:
        condition.wind_direction = payload.wind_direction
    if payload.water_temp_c is not None:
        condition.water_temp_c = payload.water_temp_c
    if payload.air_temp_c is not None:
        condition.air_temp_c = payload.air_temp_c
    if payload.stream_flow_rate is not None:
        condition.stream_flow_rate = payload.stream_flow_rate
    if payload.safety_notes is not None:
        condition.safety_notes = payload.safety_notes

    condition.updated_by_id = current_user.id
    condition.updated_at = datetime.utcnow()

    # Automatically dispatch alert if flag status changed to Amber/Red or broadcast requested
    if payload.broadcast_alert or (payload.flag_status and payload.flag_status != old_flag):
        flag_upper = condition.flag_status.value.upper()
        alert_title = f"⚠️ Boathouse Water Safety Notice: {flag_upper} FLAG"
        if condition.flag_status == SafetyFlagStatus.RED:
            alert_msg = f"RED BOARD: River is closed for water outings. All crews transition to indoor Concept2 ergs. Note: {condition.safety_notes}"
        elif condition.flag_status == SafetyFlagStatus.AMBER:
            alert_msg = f"AMBER FLAG: High stream / wind ({condition.wind_speed_knots} kts). 8+ and 4- coxed shells only. No single sculls. Note: {condition.safety_notes}"
        else:
            alert_msg = f"GREEN FLAG: Water cleared for all boat classes. Stream: {condition.stream_flow_rate}. Note: {condition.safety_notes}"

        dispatch_club_notification(
            db=db,
            club_id=current_user.club_id,
            title=alert_title,
            message=alert_msg,
            notif_type="weather_alert",
            link_action="weather",
            exclude_user_id=current_user.id
        )

    db.commit()
    db.refresh(condition)
    return condition
