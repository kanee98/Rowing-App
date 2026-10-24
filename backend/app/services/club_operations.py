from datetime import timedelta
from fastapi import HTTPException
from sqlalchemy import or_
from app.models.models import Club, Equipment, User, UserRole, UserAvailability, AvailabilityStatus, TrainingSession, Schedule, ScheduleAssignment
from app.models.operations import Reservation, Crew, DamageReport, Outing, AuditEvent, utcnow

BOAT_SEATS = {
    "1x_single_scull": ["Single"], "2x_double_scull": ["Bow", "Stroke"],
    "2-_pair": ["Bow", "Stroke"], "4-_four": ["Bow", "2", "3", "Stroke"],
    "4+_coxed_four": ["Bow", "2", "3", "Stroke", "Cox"],
    "8+_eight": ["Bow", "2", "3", "4", "5", "6", "7", "Stroke", "Cox"],
}


def audit(db, user, action, entity, entity_id, details=None):
    db.add(AuditEvent(club_id=user.club_id, actor_id=user.id, action=action, entity=entity, entity_id=entity_id, details=details))


def lock_club(db, user):
    # A short per-club transaction mutex establishes one lock order across
    # scheduling, bookings, lifecycle and membership changes. Different clubs
    # remain independent; no process-local lock is used.
    db.query(Club).filter(Club.id == user.club_id).with_for_update().first()


def session_for(db, user, session_id, manage=False, lock=False):
    query = db.query(TrainingSession).join(Schedule).filter(TrainingSession.id == session_id, Schedule.club_id == user.club_id)
    if lock:
        query = query.with_for_update()
    session = query.first()
    if not session:
        raise HTTPException(404, "Session not found")
    if user.role not in [UserRole.ADMIN, UserRole.COACH]:
        assigned = db.query(ScheduleAssignment).filter(ScheduleAssignment.schedule_id == session.schedule_id, ScheduleAssignment.user_id == user.id).first()
        if not assigned and session.trainer_id != user.id:
            raise HTTPException(404, "Session not found")
    if manage and user.role not in [UserRole.ADMIN, UserRole.COACH, UserRole.TRAINER]:
        raise HTTPException(403, "Only assigned staff can manage this session")
    return session


def roster(db, session):
    return db.query(User).join(ScheduleAssignment, ScheduleAssignment.user_id == User.id).filter(
        ScheduleAssignment.schedule_id == session.schedule_id,
        ScheduleAssignment.assignment_type == "athlete", User.is_active == True,
        User.role == UserRole.ATHLETE,
    ).order_by(User.full_name).all()


def available_equipment(db, club_id, equipment_id):
    # Serialize bookings, repairs and launches on the same equipment row.
    item = db.query(Equipment).filter(Equipment.id == equipment_id, Equipment.club_id == club_id).with_for_update().first()
    if not item or not item.is_active:
        raise HTTPException(404, "Equipment not found or archived")
    if item.status != "available" or db.query(DamageReport).filter(DamageReport.equipment_id == item.id, DamageReport.severity == "grounded", DamageReport.resolved_at.is_(None)).first():
        raise HTTPException(409, "This equipment is unavailable or grounded for repair")
    return item


def validate_booking(db, club_id, equipment_id, starts_at, ends_at, exclude_id=None):
    query = db.query(Reservation).filter(Reservation.club_id == club_id, Reservation.equipment_id == equipment_id,
        Reservation.status == "booked", Reservation.starts_at < ends_at, Reservation.ends_at > starts_at)
    if exclude_id:
        query = query.filter(Reservation.id != exclude_id)
    if query.first():
        raise HTTPException(409, "This boat is already reserved during the selected time")


def validate_crew(db, user, item, seats):
    allowed = BOAT_SEATS.get(item.category.value)
    if allowed is None:
        raise HTTPException(400, "Choose a rowing boat for a crew")
    if set(seats) != set(allowed):
        raise HTTPException(422, "Assign every rower and cox seat for this boat")
    ids = list(seats.values())
    if len(set(ids)) != len(ids):
        raise HTTPException(422, "An athlete can occupy only one seat")
    users = db.query(User).filter(User.id.in_(ids), User.club_id == user.club_id, User.is_active == True, User.role == UserRole.ATHLETE).all()
    if len(users) != len(ids):
        raise HTTPException(400, "Every seat must contain an active athlete from this club")


def validate_participant_conflicts(db, user_ids, starts_at, ends_at, exclude_session=None, exclude_reservations=None):
    if not user_ids:
        return
    # Lock participants in a stable order: competing bookings for different boats
    # must not race through the same athlete's conflict check.
    db.query(User).filter(User.id.in_(user_ids)).order_by(User.id).with_for_update().all()
    unavailable = db.query(UserAvailability).filter(UserAvailability.user_id.in_(user_ids), UserAvailability.starts_at < ends_at,
        UserAvailability.ends_at > starts_at, or_(UserAvailability.status == AvailabilityStatus.UNAVAILABLE, UserAvailability.is_safety_restriction == True)).first()
    if unavailable:
        raise HTTPException(409, "A participant has marked this time unavailable")
    sessions = db.query(TrainingSession).outerjoin(ScheduleAssignment, ScheduleAssignment.schedule_id == TrainingSession.schedule_id).filter(
        or_(ScheduleAssignment.user_id.in_(user_ids), TrainingSession.trainer_id.in_(user_ids)), TrainingSession.status == "scheduled", TrainingSession.session_date < ends_at).distinct().all()
    for session in sessions:
        if session.id != exclude_session and session.session_date + timedelta(minutes=session.duration_minutes) > starts_at:
            raise HTTPException(409, f"A participant is already assigned to {session.title} during this time")
    bookings = db.query(Reservation).filter(Reservation.status == "booked", Reservation.starts_at < ends_at, Reservation.ends_at > starts_at).all()
    for booking in bookings:
        if (exclude_reservations is None and exclude_session and booking.session_id == exclude_session) or (exclude_reservations is not None and booking.id in exclude_reservations):
            continue
        if set(user_ids).intersection(reservation_seats(db, booking).values()):
            raise HTTPException(409, "A crew member is already reserved for another outing during this time")


def validate_lifecycle(session, action, new_date):
    if action in ('reschedule', 'cancel', 'complete') and session.status != 'scheduled':
        raise HTTPException(409, "Only scheduled sessions support this action")
    if action == 'reschedule' and (new_date is None or new_date <= utcnow()):
        raise HTTPException(422, "Choose a future date and time for the session")
    if action == 'restore' and (session.status != 'cancelled' or session.session_date <= utcnow()):
        raise HTTPException(409, "Only future cancelled sessions can be restored")


def validate_proposed_sessions(sessions):
    end = None
    for session in sorted(sessions, key=lambda item: item.session_date):
        if end and session.session_date < end:
            raise HTTPException(409, 'Sessions in the same plan overlap. Choose separate times for the assigned participants.')
        end = session.session_date + timedelta(minutes=session.duration_minutes)


def reservation_seats(db, reservation):
    return reservation.seats_snapshot if reservation.seats_snapshot is not None else db.get(Crew, reservation.crew_id).seats


def reservation_out(db, reservation):
    crew = db.get(Crew, reservation.crew_id)
    item = db.get(Equipment, reservation.equipment_id)
    return {"id": reservation.id, "equipment_id": reservation.equipment_id, "equipment_name": item.name,
        "crew_id": crew.id, "crew_name": reservation.crew_name_snapshot or crew.name, "session_id": reservation.session_id,
        "starts_at": reservation.starts_at, "ends_at": reservation.ends_at, "status": reservation.status}
