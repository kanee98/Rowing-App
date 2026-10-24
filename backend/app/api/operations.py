from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api.deps import get_current_user, require_roles
from app.core.database import get_db
from app.models.models import User, UserRole, Equipment, TrainingSession, Schedule, ScheduleAssignment, Notification
from app.models.operations import Attendance, Crew, Reservation, DamageReport, Outing, AuditEvent, EmailOutbox, utcnow
from app.schemas.operations import RSVPUpdate, CheckinUpdate, LifecycleUpdate, CrewInput, ReservationInput, DamageInput, ResolutionInput, OutingInput
from app.services.club_operations import session_for, roster, available_equipment, validate_booking, validate_crew, validate_participant_conflicts, reservation_out, audit, BOAT_SEATS
from app.services.delivery import queue_email, email_configured, app_link
from app.services.club_operations import validate_lifecycle, lock_club, reservation_seats
from sqlalchemy import or_

router = APIRouter(prefix="/operations", tags=["club operations"])
staff = require_roles([UserRole.ADMIN, UserRole.COACH, UserRole.TRAINER])
managers = require_roles([UserRole.ADMIN, UserRole.COACH])


def session_out(session):
    return {"id": session.id, "schedule_id": session.schedule_id, "title": session.title,
        "session_date": session.session_date, "duration_minutes": session.duration_minutes,
        "status": session.status, "change_reason": session.change_reason, "location": session.location}


@router.get("/sessions")
def sessions(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = db.query(TrainingSession).join(Schedule).filter(Schedule.club_id == user.club_id)
    if user.role not in [UserRole.ADMIN, UserRole.COACH]:
        query = query.filter(or_(Schedule.assignments.any(ScheduleAssignment.user_id == user.id), TrainingSession.trainer_id == user.id))
    return [session_out(item) for item in query.order_by(TrainingSession.session_date.desc()).limit(500).all()]


@router.get("/sessions/{session_id}/attendance")
def attendance(session_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    session = session_for(db, user, session_id)
    records = {row.user_id: row for row in db.query(Attendance).filter(Attendance.session_id == session.id).all()}
    members = roster(db, session)
    if user.role == UserRole.ATHLETE:
        members = [member for member in members if member.id == user.id]
    return [{"user_id": member.id, "name": member.full_name,
        "rsvp": records[member.id].rsvp if member.id in records else "unknown",
        "checkin": records[member.id].checkin if member.id in records else None,
        "note": records[member.id].note if member.id in records else None} for member in members]


@router.put("/sessions/{session_id}/rsvp")
def rsvp(session_id: int, payload: RSVPUpdate, user: User = Depends(require_roles([UserRole.ATHLETE])), db: Session = Depends(get_db)):
    lock_club(db, user)
    session = session_for(db, user, session_id, lock=True)
    if session.status != "scheduled" or session.session_date <= utcnow():
        raise HTTPException(409, "RSVP is closed for this session")
    row = db.query(Attendance).filter(Attendance.session_id == session.id, Attendance.user_id == user.id).first()
    if row is None:
        row = Attendance(session_id=session.id, user_id=user.id)
        db.add(row)
    row.rsvp, row.note = payload.rsvp, payload.note
    audit(db, user, "rsvp", "session", session.id, {"response": payload.rsvp})
    db.commit()
    return {"message": "Your response was saved"}


@router.put("/sessions/{session_id}/attendance/{user_id}")
def checkin(session_id: int, user_id: int, payload: CheckinUpdate, user: User = Depends(staff), db: Session = Depends(get_db)):
    lock_club(db, user)
    session = session_for(db, user, session_id, manage=True, lock=True)
    if session.status == "cancelled":
        raise HTTPException(409, "Cannot record attendance for a cancelled session")
    if user_id not in [member.id for member in roster(db, session)]:
        raise HTTPException(404, "Athlete is not assigned to this session")
    row = db.query(Attendance).filter(Attendance.session_id == session.id, Attendance.user_id == user_id).first()
    if row is None:
        row = Attendance(session_id=session.id, user_id=user_id)
        db.add(row)
    row.checkin, row.checked_by_id = payload.checkin, user.id
    audit(db, user, "attendance", "session", session.id, {"athlete_id": user_id, "checkin": payload.checkin})
    db.commit()
    return {"message": "Attendance updated"}


@router.post("/sessions/{session_id}/lifecycle")
def lifecycle(session_id: int, payload: LifecycleUpdate, user: User = Depends(managers), db: Session = Depends(get_db)):
    lock_club(db, user)
    session = session_for(db, user, session_id, manage=True, lock=True)
    validate_lifecycle(session, payload.action, payload.session_date)
    bookings = db.query(Reservation).filter(Reservation.session_id == session.id, Reservation.status == "booked").order_by(Reservation.equipment_id).all()
    for booking in bookings:
        if db.query(Outing).filter(Outing.reservation_id == booking.id, Outing.returned_at.is_(None)).first():
            raise HTTPException(409, "Record the crew's return before changing this session")
    if payload.action == "reschedule":
        if session.status != "scheduled" or payload.session_date is None:
            raise HTTPException(409, "Only a scheduled session can be rescheduled; choose a new date")
        end = payload.session_date + timedelta(minutes=payload.duration_minutes or session.duration_minutes)
        participants = [row.user_id for row in session.schedule.assignments]
        if session.trainer_id:
            participants.append(session.trainer_id)
        validate_participant_conflicts(db, participants, payload.session_date, end, session.id, [row.id for row in bookings])
        for booking in bookings:
            available_equipment(db, user.club_id, booking.equipment_id)
            validate_booking(db, user.club_id, booking.equipment_id, payload.session_date, end, booking.id)
        for booking in bookings:
            booking.starts_at, booking.ends_at = payload.session_date, end
        session.session_date = payload.session_date
        session.day_of_week = payload.session_date.weekday()
        session.duration_minutes = payload.duration_minutes or session.duration_minutes
        # A response to the old time is not consent to the new time.
        db.query(Attendance).filter(Attendance.session_id == session.id).update({"rsvp": "unknown", "checkin": None, "checked_by_id": None}, synchronize_session=False)
    elif payload.action == "cancel":
        session.status = "cancelled"
        for booking in bookings:
            booking.status = "cancelled"
    elif payload.action == "restore":
        if session.status != "cancelled" or session.session_date <= utcnow():
            raise HTTPException(409, "Only a future cancelled session can be restored")
        validate_participant_conflicts(db, [row.user_id for row in session.schedule.assignments] + ([session.trainer_id] if session.trainer_id else []), session.session_date,
            session.session_date + timedelta(minutes=session.duration_minutes), session.id)
        session.status = "scheduled"
    elif payload.action == "complete":
        if session.status != "scheduled" or session.session_date > utcnow():
            raise HTTPException(409, "Only a started scheduled session can be completed")
        session.status = "completed"
        for booking in bookings:
            booking.status = "completed"
    session.change_reason, session.changed_at, session.changed_by_id = payload.reason, utcnow(), user.id
    db.query(EmailOutbox).filter(EmailOutbox.dedupe_key.like(f"reminder:{session.id}:%"), EmailOutbox.status == "pending").update({"status": "cancelled"}, synchronize_session=False)
    people = db.query(User).outerjoin(ScheduleAssignment, ScheduleAssignment.user_id == User.id).filter(or_(ScheduleAssignment.schedule_id == session.schedule_id, User.id == session.trainer_id), User.club_id == user.club_id, User.is_active == True).distinct().all()
    for member in people:
        message = f"{session.title}: {payload.action}. {payload.reason}. Session time: {session.session_date.isoformat()} UTC."
        db.add(Notification(user_id=member.id, club_id=user.club_id, title="Session updated", message=message, type="schedule_assigned", link_action=f"operations/{session.id}"))
        queue_email(db, user.club_id, member.email, f"Session update: {session.title}", message + f"\n{app_link()}#operations/{session.id}")
    audit(db, user, payload.action, "session", session.id, {"reason": payload.reason})
    db.commit()
    return session_out(session)


@router.get("/crews")
def crews(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(Crew).filter(Crew.club_id == user.club_id, Crew.is_active == True).order_by(Crew.name).all()
    visible = [row for row in rows if user.role != UserRole.ATHLETE or user.id in row.seats.values()]
    ids = {user_id for row in visible for user_id in row.seats.values()}
    names = dict(db.query(User.id, User.full_name).filter(User.club_id == user.club_id, User.id.in_(ids)).all()) if ids else {}
    return [{"id": row.id, "name": row.name, "equipment_id": row.equipment_id, "seats": row.seats,
        "seat_names": {seat: names.get(user_id, 'Former member') for seat, user_id in row.seats.items()}} for row in visible]


def save_crew(db, user, payload, crew=None):
    item = db.query(Equipment).filter(Equipment.id == payload.equipment_id, Equipment.club_id == user.club_id, Equipment.is_active == True).first()
    if not item:
        raise HTTPException(404, "Boat not found")
    validate_crew(db, user, item, payload.seats)
    if crew and db.query(Reservation).filter(Reservation.crew_id == crew.id, Reservation.status == "booked").first():
        raise HTTPException(409, "Cancel this crew's active reservations before changing its boat or seats")
    crew = crew or Crew(club_id=user.club_id)
    crew.name, crew.equipment_id, crew.seats = payload.name.strip(), payload.equipment_id, payload.seats
    if not crew.name:
        raise HTTPException(422, "Enter a crew name")
    db.add(crew); db.flush()
    audit(db, user, "save", "crew", crew.id)
    db.commit()
    return {"id": crew.id, "name": crew.name, "equipment_id": crew.equipment_id, "seats": crew.seats}


@router.post("/crews")
def create_crew(payload: CrewInput, user: User = Depends(managers), db: Session = Depends(get_db)):
    lock_club(db, user)
    return save_crew(db, user, payload)


@router.put("/crews/{crew_id}")
def update_crew(crew_id: int, payload: CrewInput, user: User = Depends(managers), db: Session = Depends(get_db)):
    lock_club(db, user)
    crew = db.query(Crew).filter(Crew.id == crew_id, Crew.club_id == user.club_id).with_for_update().first()
    if not crew:
        raise HTTPException(404, "Crew not found")
    return save_crew(db, user, payload, crew)


@router.get("/reservations")
def reservations(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(Reservation).filter(Reservation.club_id == user.club_id).order_by(Reservation.starts_at.desc()).limit(300).all()
    if user.role == UserRole.ATHLETE:
        rows = [row for row in rows if user.id in reservation_seats(db, row).values()]
    return [reservation_out(db, row) for row in rows]


@router.post("/reservations")
def create_reservation(payload: ReservationInput, user: User = Depends(staff), db: Session = Depends(get_db)):
    lock_club(db, user)
    crew = db.query(Crew).filter(Crew.id == payload.crew_id, Crew.club_id == user.club_id, Crew.is_active == True).with_for_update().first()
    if not crew:
        raise HTTPException(404, "Crew not found")
    available_equipment(db, user.club_id, crew.equipment_id)
    starts, ends = payload.starts_at, payload.ends_at
    if payload.session_id:
        session = session_for(db, user, payload.session_id, manage=True)
        if session.status != "scheduled":
            raise HTTPException(409, "Reserve equipment only for scheduled sessions")
        starts, ends = session.session_date, session.session_date + timedelta(minutes=session.duration_minutes)
        if not set(crew.seats.values()).issubset({member.id for member in roster(db, session)}):
            raise HTTPException(409, "Every crew member must be assigned to the selected session")
    if starts <= utcnow():
        raise HTTPException(422, "Choose a future reservation time")
    validate_booking(db, user.club_id, crew.equipment_id, starts, ends)
    item = db.get(Equipment, crew.equipment_id)
    validate_crew(db, user, item, crew.seats)
    validate_participant_conflicts(db, list(crew.seats.values()), starts, ends, payload.session_id, [])
    row = Reservation(club_id=user.club_id, equipment_id=crew.equipment_id, crew_id=crew.id,
        crew_name_snapshot=crew.name, seats_snapshot=dict(crew.seats),
        session_id=payload.session_id, starts_at=starts, ends_at=ends, created_by_id=user.id)
    db.add(row); db.flush(); audit(db, user, "book", "reservation", row.id); db.commit()
    return reservation_out(db, row)


@router.post("/reservations/{reservation_id}/cancel")
def cancel_reservation(reservation_id: int, user: User = Depends(staff), db: Session = Depends(get_db)):
    lock_club(db, user)
    row = db.query(Reservation).filter(Reservation.id == reservation_id, Reservation.club_id == user.club_id).with_for_update().first()
    if not row:
        raise HTTPException(404, "Reservation not found")
    if db.query(Outing).filter(Outing.reservation_id == row.id, Outing.returned_at.is_(None)).first():
        raise HTTPException(409, "Record the outing return before cancelling")
    if user.role == UserRole.TRAINER and row.created_by_id != user.id:
        raise HTTPException(403, "Only the booking owner, a coach or an administrator can cancel")
    row.status = "cancelled"; audit(db, user, "cancel", "reservation", row.id); db.commit()
    return {"message": "Reservation cancelled"}


@router.get("/damage")
def damages(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [{"id": row.id, "equipment_id": row.equipment_id, "description": row.description, "severity": row.severity,
        "created_at": row.created_at, "resolved_at": row.resolved_at, "resolution": row.resolution}
        for row in db.query(DamageReport).filter(DamageReport.club_id == user.club_id).order_by(DamageReport.created_at.desc()).limit(200).all()]


@router.post("/damage")
def report_damage(payload: DamageInput, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    lock_club(db, user)
    item = db.query(Equipment).filter(Equipment.id == payload.equipment_id, Equipment.club_id == user.club_id).with_for_update().first()
    if not item:
        raise HTTPException(404, "Equipment not found")
    row = DamageReport(club_id=user.club_id, reported_by_id=user.id, **payload.model_dump())
    db.add(row)
    if payload.severity == "grounded":
        item.status = "maintenance"
    db.flush(); audit(db, user, "report_damage", "equipment", item.id, {"report_id": row.id}); db.commit()
    return {"id": row.id, "message": "Damage reported; grounded equipment cannot be booked or launched"}


@router.post("/damage/{report_id}/resolve")
def resolve_damage(report_id: int, payload: ResolutionInput, user: User = Depends(staff), db: Session = Depends(get_db)):
    lock_club(db, user)
    row = db.query(DamageReport).filter(DamageReport.id == report_id, DamageReport.club_id == user.club_id).with_for_update().first()
    if not row:
        raise HTTPException(404, "Damage report not found")
    if row.resolved_at:
        raise HTTPException(409, "This damage report is already resolved")
    item = db.query(Equipment).filter(Equipment.id == row.equipment_id).with_for_update().first()
    row.resolved_at, row.resolved_by_id, row.resolution = utcnow(), user.id, payload.resolution
    db.flush()
    if row.severity == 'grounded' and not db.query(DamageReport).filter(DamageReport.equipment_id == item.id, DamageReport.severity == "grounded", DamageReport.resolved_at.is_(None)).first() and item.status == "maintenance":
        item.status = "available"
    audit(db, user, "resolve_damage", "equipment", item.id, {"report_id": row.id}); db.commit()
    return {"message": "Repair recorded"}


@router.get("/outings")
def outings(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(Outing).filter(Outing.club_id == user.club_id).order_by(Outing.launched_at.desc()).limit(200).all()
    allowed = {item['id'] for item in reservations(user, db)} if user.role == UserRole.ATHLETE else None
    return [{"id": row.id, "reservation_id": row.reservation_id, "launched_at": row.launched_at,
        "expected_return_at": row.expected_return_at, "returned_at": row.returned_at, "notes": row.notes}
        for row in rows if allowed is None or row.reservation_id in allowed]


@router.post("/outings")
def launch(payload: OutingInput, user: User = Depends(staff), db: Session = Depends(get_db)):
    lock_club(db, user)
    booking = db.query(Reservation).filter(Reservation.id == payload.reservation_id, Reservation.club_id == user.club_id).with_for_update().first()
    if not booking or booking.status != "booked":
        raise HTTPException(409, "Choose an active reservation")
    available_equipment(db, user.club_id, booking.equipment_id)
    crew = db.get(Crew, booking.crew_id)
    validate_crew(db, user, db.get(Equipment, booking.equipment_id), crew.seats)
    validate_participant_conflicts(db, list(crew.seats.values()), utcnow(), booking.ends_at, booking.session_id, [booking.id])
    open_outings = db.query(Outing).filter(Outing.club_id == user.club_id, Outing.returned_at.is_(None)).all()
    for outing in open_outings:
        previous = db.get(Reservation, outing.reservation_id)
        if set(crew.seats.values()).intersection(reservation_seats(db, previous).values()):
            raise HTTPException(409, "A crew member still has an unreturned outing. Record their return before another launch.")
    if db.query(Outing).filter(Outing.reservation_id == booking.id).first():
        raise HTTPException(409, "This reservation already has an outing record")
    active = db.query(Outing).join(Reservation).filter(Reservation.equipment_id == booking.equipment_id, Outing.returned_at.is_(None)).first()
    if active or not booking.starts_at <= utcnow() < booking.ends_at:
        raise HTTPException(409, "Boat is already on the water or the reservation has not started/has ended")
    row = Outing(club_id=user.club_id, reservation_id=booking.id, launched_by_id=user.id, expected_return_at=booking.ends_at, notes=payload.notes)
    db.add(row); db.flush(); audit(db, user, "launch", "outing", row.id); db.commit()
    return {"id": row.id, "message": "Launch recorded"}


@router.post("/outings/{outing_id}/return")
def return_outing(outing_id: int, user: User = Depends(staff), db: Session = Depends(get_db)):
    lock_club(db, user)
    row = db.query(Outing).filter(Outing.id == outing_id, Outing.club_id == user.club_id).with_for_update().first()
    if not row or row.returned_at:
        raise HTTPException(409, "Active outing not found")
    row.returned_at, row.returned_by_id = utcnow(), user.id
    db.get(Reservation, row.reservation_id).status = "completed"
    audit(db, user, "return", "outing", row.id); db.commit()
    return {"message": "Return recorded"}


@router.get("/communications")
def communications(user: User = Depends(require_roles([UserRole.ADMIN])), db: Session = Depends(get_db)):
    rows = db.query(EmailOutbox).filter(EmailOutbox.club_id == user.club_id).order_by(EmailOutbox.id.desc()).limit(100).all()
    return {"email_configured": email_configured(), "messages": [{"id": row.id, "recipient": row.recipient, "subject": row.subject,
        "status": "configuration_required" if row.status == "pending" and not email_configured() else row.status, "attempts": row.attempts, "last_error": row.last_error,
        "created_at": row.created_at, "sent_at": row.sent_at} for row in rows]}


@router.post("/communications/{message_id}/retry")
def retry_message(message_id: int, user: User = Depends(require_roles([UserRole.ADMIN])), db: Session = Depends(get_db)):
    row = db.query(EmailOutbox).filter(EmailOutbox.id == message_id, EmailOutbox.club_id == user.club_id).with_for_update().first()
    if not row or row.status != "failed":
        raise HTTPException(409, "Only failed messages can be retried")
    row.status, row.attempts, row.next_attempt_at = "pending", 0, utcnow()
    db.commit()
    return {"message": "Email queued for retry"}
