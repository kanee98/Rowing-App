from datetime import timedelta, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.models import (
    Schedule, TrainingSession, SessionExercise, User, UserRole, Competition, Exercise,
    TaxonomyNode, TaxonomyNodeStatus, ScheduleAssignment, UserAvailability
)
from app.schemas.schemas import (
    ScheduleCreate, ScheduleOut, TrainingSessionCreate, TrainingSessionOut,
    ScheduleAssignmentUpdate, UserOut
)
from app.api.deps import get_current_user, require_roles
from app.services.club_operations import lock_club, validate_participant_conflicts, validate_proposed_sessions
from app.api.taxonomy import compute_node_full_path, get_node_descendant_ids

router = APIRouter(prefix="/schedules", tags=["schedules"])

def _validated_assignees(db: Session, club_id: int, user_ids: List[int], role: UserRole) -> List[User]:
    unique_ids = list(dict.fromkeys(user_ids))
    if not unique_ids:
        return []
    users = db.query(User).filter(
        User.id.in_(unique_ids),
        User.club_id == club_id,
        User.role == role,
        User.is_active == True,
    ).all()
    if len(users) != len(unique_ids):
        raise HTTPException(
            status_code=400,
            detail=f"One or more selected {role.value}s are invalid, inactive, or belong to another club",
        )
    by_id = {user.id: user for user in users}
    return [by_id[user_id] for user_id in unique_ids]

def _validate_session_exercises(db: Session, club_id: int, sessions) -> None:
    exercise_ids = {item.exercise_id for session in sessions for item in session.exercises}
    if not exercise_ids:
        return
    valid_ids = {row[0] for row in db.query(Exercise.id).filter(
        Exercise.id.in_(exercise_ids),
        Exercise.club_id == club_id,
        Exercise.is_active == True,
    ).all()}
    if valid_ids != exercise_ids:
        raise HTTPException(status_code=400, detail="A selected exercise is invalid, archived, or belongs to another club")

def _validate_session_safety(db: Session, schedule: Schedule, payload: TrainingSessionCreate, current_user: User, exclude_session=None) -> None:
    users = {assignment.user_id: assignment.user for assignment in schedule.assignments if assignment.user is not None}
    if payload.trainer_id:
        for trainer in _validated_assignees(db, current_user.club_id, [payload.trainer_id], UserRole.TRAINER):
            users[trainer.id] = trainer
    _ensure_no_safety_restrictions(db, list(users.values()), [payload], current_user)
    from app.services.club_operations import validate_participant_conflicts
    start = payload.session_date.astimezone(timezone.utc).replace(tzinfo=None) if payload.session_date.tzinfo else payload.session_date
    validate_participant_conflicts(db, list(users), start, start + timedelta(minutes=payload.duration_minutes), exclude_session)

def _set_assignments(
    db: Session,
    schedule: Schedule,
    athletes: List[User],
    trainers: List[User],
    assigned_by_id: int,
) -> None:
    existing = {assignment.user_id: assignment for assignment in schedule.assignments}
    desired = {user.id: (user, "athlete") for user in athletes}
    desired.update({user.id: (user, "trainer") for user in trainers})

    for user_id, assignment in existing.items():
        if user_id not in desired:
            db.delete(assignment)

    for user_id, (_, assignment_type) in desired.items():
        if user_id in existing:
            existing[user_id].assignment_type = assignment_type
            existing[user_id].assigned_by_id = assigned_by_id
        else:
            db.add(ScheduleAssignment(
                schedule_id=schedule.id,
                user_id=user_id,
                assignment_type=assignment_type,
                assigned_by_id=assigned_by_id,
            ))
    db.flush()
    db.expire(schedule, ["assignments"])

def _ensure_no_safety_restrictions(
    db: Session,
    users: List[User],
    sessions,
    current_user: User,
) -> None:
    if current_user.role == UserRole.ADMIN or not users or not sessions:
        return
    entries = db.query(UserAvailability).filter(
        UserAvailability.user_id.in_([user.id for user in users]),
        UserAvailability.is_safety_restriction == True,
    ).all()
    blocked_ids = set()
    for entry in entries:
        for session in sessions:
            starts_at = session.session_date
            if starts_at.tzinfo is not None:
                starts_at = starts_at.astimezone(timezone.utc).replace(tzinfo=None)
            ends_at = starts_at + timedelta(minutes=session.duration_minutes or 60)
            if entry.starts_at < ends_at and entry.ends_at > starts_at:
                blocked_ids.add(entry.user_id)
                break
    if blocked_ids:
        names = ", ".join(user.full_name for user in users if user.id in blocked_ids)
        raise HTTPException(
            status_code=409,
            detail=f"Safety restriction prevents assignment for: {names}",
        )

def _schedule_out(schedule: Schedule, db: Session) -> ScheduleOut:
    result = ScheduleOut.model_validate(schedule)
    if schedule.competition:
        result.competition_name = schedule.competition.name
    if schedule.created_by_id:
        creator = db.query(User).filter(User.id == schedule.created_by_id).first()
        if creator:
            result.created_by_name = creator.full_name

    athlete_users = [a.user for a in schedule.assignments if a.assignment_type == "athlete" and a.user]
    trainer_users = [a.user for a in schedule.assignments if a.assignment_type == "trainer" and a.user]
    result.athlete_ids = [user.id for user in athlete_users]
    result.trainer_ids = [user.id for user in trainer_users]
    result.assigned_athletes = [UserOut.model_validate(user) for user in athlete_users]
    result.assigned_trainers = [UserOut.model_validate(user) for user in trainer_users]

    sessions_out = []
    for session in schedule.sessions:
        session_out = TrainingSessionOut.model_validate(session)
        if session.trainer_id:
            trainer = db.query(User).filter(User.id == session.trainer_id).first()
            if trainer:
                session_out.trainer_name = trainer.full_name
        for session_exercise in session_out.exercises:
            exercise = db.query(Exercise).filter(Exercise.id == session_exercise.exercise_id).first()
            if exercise:
                session_exercise.exercise_name = exercise.name
                session_exercise.category = exercise.category
        sessions_out.append(session_out)
    result.sessions = sessions_out
    return result

@router.get("", response_model=List[ScheduleOut])
def list_schedules(
    taxonomy_node_id: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(Schedule).filter(Schedule.club_id == current_user.club_id)

    # Coaches/admins manage the club calendar. Athletes/trainers see schedules
    # explicitly assigned to them plus legacy schedules that have no assignments.
    if current_user.role in [UserRole.ATHLETE, UserRole.TRAINER]:
        query = query.filter(or_(
            ~Schedule.assignments.any(),
            Schedule.assignments.any(ScheduleAssignment.user_id == current_user.id),
        ))

    # Filter by taxonomy branch (includes all descendants)
    if taxonomy_node_id:
        descendant_ids = get_node_descendant_ids(taxonomy_node_id, current_user.club_id, db)
        target_ids = list(descendant_ids) + [taxonomy_node_id]
        query = query.filter(Schedule.taxonomy_node_id.in_(target_ids))

    schedules = query.order_by(Schedule.start_date.desc()).all()
    return [_schedule_out(schedule, db) for schedule in schedules]

@router.get("/{schedule_id}", response_model=ScheduleOut)
def get_schedule(
    schedule_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    s = db.query(Schedule).filter(Schedule.id == schedule_id, Schedule.club_id == current_user.club_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Schedule not found")
    if current_user.role in [UserRole.ATHLETE, UserRole.TRAINER]:
        if s.assignments and not any(a.user_id == current_user.id for a in s.assignments):
            raise HTTPException(status_code=404, detail="Schedule not found")
    return _schedule_out(s, db)

@router.post("", response_model=ScheduleOut)
def create_schedule(
    payload: ScheduleCreate,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.COACH])),
    db: Session = Depends(get_db)
):
    lock_club(db, current_user)
    trainer_ids = list(dict.fromkeys(
        payload.trainer_ids + [session.trainer_id for session in payload.sessions if session.trainer_id]
    ))
    if not payload.athlete_ids:
        raise HTTPException(status_code=400, detail="Select at least one athlete for this schedule")
    validate_proposed_sessions(payload.sessions)
    _validate_session_exercises(db, current_user.club_id, payload.sessions)
    athletes = _validated_assignees(db, current_user.club_id, payload.athlete_ids, UserRole.ATHLETE)
    trainers = _validated_assignees(db, current_user.club_id, trainer_ids, UserRole.TRAINER)
    _ensure_no_safety_restrictions(db, athletes + trainers, payload.sessions, current_user)
    for proposed in payload.sessions:
        start = proposed.session_date.astimezone(timezone.utc).replace(tzinfo=None) if proposed.session_date.tzinfo else proposed.session_date
        validate_participant_conflicts(db, [person.id for person in athletes + trainers], start, start + timedelta(minutes=proposed.duration_minutes))

    # Snapshot taxonomy node path if provided
    taxonomy_path = None
    taxonomy_name = None
    if payload.taxonomy_node_id:
        t_node = db.query(TaxonomyNode).filter(
            TaxonomyNode.id == payload.taxonomy_node_id,
            TaxonomyNode.club_id == current_user.club_id
        ).first()
        if t_node:
            taxonomy_path = compute_node_full_path(t_node, db)
            taxonomy_name = t_node.name

    schedule = Schedule(
        club_id=current_user.club_id,
        created_by_id=current_user.id,
        competition_id=payload.competition_id,
        taxonomy_node_id=payload.taxonomy_node_id,
        taxonomy_path_snapshot=taxonomy_path,
        taxonomy_node_name=taxonomy_name,
        name=payload.name,
        description=payload.description,
        season=payload.season,
        phase=payload.phase,
        start_date=payload.start_date,
        end_date=payload.end_date,
        is_active=payload.is_active
    )
    db.add(schedule)
    db.flush()
    _set_assignments(db, schedule, athletes, trainers, current_user.id)

    for s_in in payload.sessions:
        sess_taxonomy_path = taxonomy_path
        if s_in.taxonomy_node_id and s_in.taxonomy_node_id != payload.taxonomy_node_id:
            sess_node = db.query(TaxonomyNode).filter(
                TaxonomyNode.id == s_in.taxonomy_node_id,
                TaxonomyNode.club_id == current_user.club_id
            ).first()
            if sess_node:
                sess_taxonomy_path = compute_node_full_path(sess_node, db)

        ts = TrainingSession(
            schedule_id=schedule.id,
            trainer_id=s_in.trainer_id or (trainers[0].id if trainers else None),
            taxonomy_node_id=s_in.taxonomy_node_id or payload.taxonomy_node_id,
            taxonomy_path_snapshot=sess_taxonomy_path,
            title=s_in.title,
            day_of_week=s_in.day_of_week,
            session_date=s_in.session_date,
            duration_minutes=s_in.duration_minutes,
            session_type=s_in.session_type,
            location=s_in.location,
            instructions=s_in.instructions
        )
        db.add(ts)
        db.flush()

        for idx, ex_in in enumerate(s_in.exercises):
            se = SessionExercise(
                session_id=ts.id,
                exercise_id=ex_in.exercise_id,
                order_index=ex_in.order_index or idx + 1,
                sets=ex_in.sets or 1,
                target_reps=ex_in.target_reps,
                target_distance_m=ex_in.target_distance_m,
                target_duration_sec=ex_in.target_duration_sec,
                target_split_seconds=ex_in.target_split_seconds,
                target_watts=ex_in.target_watts,
                target_heart_rate_zone=ex_in.target_heart_rate_zone,
                target_rpe=ex_in.target_rpe,
                target_weight_kg=ex_in.target_weight_kg,
                target_reps_or_distance=ex_in.target_reps_or_distance,
                target_intensity_split=ex_in.target_intensity_split,
                target_stroke_rate=ex_in.target_stroke_rate,
                rest_interval_sec=ex_in.rest_interval_sec or 120,
                notes=ex_in.notes
            )
            db.add(se)

    db.commit()
    db.refresh(schedule)

    # Notify only the selected people.
    try:
        from app.api.notifications import dispatch_notification
        comp_info = f" targeting {schedule.competition.name}" if schedule.competition else ""
        notification_args = dict(
            db=db, club_id=current_user.club_id,
            title=f"📋 New Schedule Assigned: {schedule.name}",
            message=f"Coach {current_user.full_name} assigned you a training plan ({schedule.phase.replace('_', ' ')}{comp_info}) with {len(payload.sessions)} sessions.",
            notif_type="schedule_assigned", link_action=f"schedules/{schedule.id}",
        )
        for user in athletes + trainers:
            dispatch_notification(user_id=user.id, **notification_args)
        db.commit()
    except Exception:
        pass

    return get_schedule(schedule.id, current_user, db)

@router.put("/{schedule_id}/assignments", response_model=ScheduleOut)
def update_schedule_assignments(
    schedule_id: int,
    payload: ScheduleAssignmentUpdate,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.COACH])),
    db: Session = Depends(get_db),
):
    lock_club(db, current_user)
    schedule = db.query(Schedule).filter(
        Schedule.id == schedule_id,
        Schedule.club_id == current_user.club_id,
    ).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    athletes = _validated_assignees(db, current_user.club_id, payload.athlete_ids, UserRole.ATHLETE)
    if not athletes:
        raise HTTPException(status_code=400, detail="A schedule must remain assigned to at least one athlete")
    trainers = _validated_assignees(db, current_user.club_id, payload.trainer_ids, UserRole.TRAINER)
    _ensure_no_safety_restrictions(db, athletes + trainers, schedule.sessions, current_user)
    for session in schedule.sessions:
        if session.status != 'scheduled':
            continue
        validate_participant_conflicts(db, [person.id for person in athletes + trainers], session.session_date,
            session.session_date + timedelta(minutes=session.duration_minutes), session.id)
    from app.models.operations import Reservation, Crew
    selected_athletes = {person.id for person in athletes}
    for booking in db.query(Reservation).join(TrainingSession, TrainingSession.id == Reservation.session_id).filter(TrainingSession.schedule_id == schedule.id, Reservation.status == 'booked').all():
        if not set(db.get(Crew, booking.crew_id).seats.values()).issubset(selected_athletes):
            raise HTTPException(409, detail='Cancel linked crew reservations before removing those athletes from the schedule')
    previous_users = {assignment.user_id: assignment.user for assignment in schedule.assignments}
    previous_ids = set(previous_users)
    _set_assignments(db, schedule, athletes, trainers, current_user.id)
    db.flush()

    try:
        from app.api.notifications import dispatch_notification
        for user in athletes + trainers:
            if user.id not in previous_ids:
                dispatch_notification(
                    db=db,
                    user_id=user.id,
                    club_id=current_user.club_id,
                    title=f"📋 Schedule Assigned: {schedule.name}",
                    message=f"Coach {current_user.full_name} assigned you to {schedule.name}.",
                    notif_type="schedule_assigned",
                    link_action=f"schedules/{schedule.id}",
                )
        selected_ids = {user.id for user in athletes + trainers}
        for user_id in previous_ids - selected_ids:
            removed_user = previous_users[user_id]
            if removed_user:
                dispatch_notification(
                    db=db,
                    user_id=user_id,
                    club_id=current_user.club_id,
                    title=f"Schedule assignment changed: {schedule.name}",
                    message=f"You are no longer assigned to {schedule.name}.",
                    notif_type="schedule_assigned",
                    link_action="schedules",
                )
    except Exception:
        pass

    db.commit()
    db.refresh(schedule)
    return _schedule_out(schedule, db)

@router.post("/{schedule_id}/sessions", response_model=TrainingSessionOut)
def add_session_to_schedule(
    schedule_id: int,
    payload: TrainingSessionCreate,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.COACH])),
    db: Session = Depends(get_db)
):
    lock_club(db, current_user)
    schedule = db.query(Schedule).filter(Schedule.id == schedule_id, Schedule.club_id == current_user.club_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    if payload.trainer_id:
        _validated_assignees(db, current_user.club_id, [payload.trainer_id], UserRole.TRAINER)
    _validate_session_exercises(db, current_user.club_id, [payload])
    _validate_session_safety(db, schedule, payload, current_user)

    taxonomy_node_id = payload.taxonomy_node_id or schedule.taxonomy_node_id
    taxonomy_path = schedule.taxonomy_path_snapshot
    if taxonomy_node_id:
        node = db.query(TaxonomyNode).filter(
            TaxonomyNode.id == taxonomy_node_id,
            TaxonomyNode.club_id == current_user.club_id,
        ).first()
        if not node:
            raise HTTPException(status_code=400, detail="Invalid taxonomy node")
        taxonomy_path = compute_node_full_path(node, db)

    ts = TrainingSession(
        schedule_id=schedule.id,
        trainer_id=payload.trainer_id,
        taxonomy_node_id=taxonomy_node_id,
        taxonomy_path_snapshot=taxonomy_path,
        title=payload.title,
        day_of_week=payload.day_of_week,
        session_date=payload.session_date,
        duration_minutes=payload.duration_minutes,
        session_type=payload.session_type,
        location=payload.location,
        instructions=payload.instructions
    )
    db.add(ts)
    db.flush()

    for idx, ex_in in enumerate(payload.exercises):
        se = SessionExercise(
            session_id=ts.id,
            exercise_id=ex_in.exercise_id,
            order_index=ex_in.order_index or idx + 1,
            sets=ex_in.sets or 1,
            target_reps=ex_in.target_reps,
            target_distance_m=ex_in.target_distance_m,
            target_duration_sec=ex_in.target_duration_sec,
            target_split_seconds=ex_in.target_split_seconds,
            target_watts=ex_in.target_watts,
            target_heart_rate_zone=ex_in.target_heart_rate_zone,
            target_rpe=ex_in.target_rpe,
            target_weight_kg=ex_in.target_weight_kg,
            target_reps_or_distance=ex_in.target_reps_or_distance,
            target_intensity_split=ex_in.target_intensity_split,
            target_stroke_rate=ex_in.target_stroke_rate,
            rest_interval_sec=ex_in.rest_interval_sec or 120,
            notes=ex_in.notes
        )
        db.add(se)

    db.commit()
    db.refresh(ts)
    tso = TrainingSessionOut.model_validate(ts)
    if ts.trainer_id:
        trainer = db.query(User).filter(User.id == ts.trainer_id).first()
        tso.trainer_name = trainer.full_name if trainer else None
    for item in tso.exercises:
        exercise = db.query(Exercise).filter(Exercise.id == item.exercise_id).first()
        if exercise:
            item.exercise_name = exercise.name
            item.category = exercise.category
    return tso

@router.put("/{schedule_id}/sessions/{session_id}", response_model=TrainingSessionOut)
def update_schedule_session(
    schedule_id: int,
    session_id: int,
    payload: TrainingSessionCreate,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.COACH])),
    db: Session = Depends(get_db),
):
    lock_club(db, current_user)
    schedule = db.query(Schedule).filter(
        Schedule.id == schedule_id,
        Schedule.club_id == current_user.club_id,
    ).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    session = db.query(TrainingSession).filter(
        TrainingSession.id == session_id,
        TrainingSession.schedule_id == schedule.id,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Training session not found")

    if payload.trainer_id:
        _validated_assignees(db, current_user.club_id, [payload.trainer_id], UserRole.TRAINER)
    _validate_session_exercises(db, current_user.club_id, [payload])
    _validate_session_safety(db, schedule, payload, current_user, session.id)
    from app.models.operations import Reservation
    start = payload.session_date.astimezone(timezone.utc).replace(tzinfo=None) if payload.session_date.tzinfo else payload.session_date
    if start != session.session_date or payload.duration_minutes != session.duration_minutes:
        raise HTTPException(409, detail="Use Operations → Reschedule to change the time, recheck conflicts and notify participants")
    if session.status != "scheduled":
        raise HTTPException(409, detail="Restore a cancelled session before editing it")

    taxonomy_node_id = payload.taxonomy_node_id or schedule.taxonomy_node_id
    taxonomy_path = schedule.taxonomy_path_snapshot
    if taxonomy_node_id:
        node = db.query(TaxonomyNode).filter(
            TaxonomyNode.id == taxonomy_node_id,
            TaxonomyNode.club_id == current_user.club_id,
        ).first()
        if not node:
            raise HTTPException(status_code=400, detail="Invalid taxonomy node")
        taxonomy_path = compute_node_full_path(node, db)

    session.trainer_id = payload.trainer_id
    session.taxonomy_node_id = taxonomy_node_id
    session.taxonomy_path_snapshot = taxonomy_path
    session.title = payload.title
    session.day_of_week = start.weekday()
    session.session_date = start
    session.duration_minutes = payload.duration_minutes
    session.session_type = payload.session_type
    session.location = payload.location
    session.instructions = payload.instructions

    db.query(SessionExercise).filter(SessionExercise.session_id == session.id).delete(synchronize_session=False)
    for index, exercise in enumerate(payload.exercises):
        db.add(SessionExercise(
            session_id=session.id,
            exercise_id=exercise.exercise_id,
            order_index=exercise.order_index or index + 1,
            sets=exercise.sets or 1,
            target_reps=exercise.target_reps,
            target_distance_m=exercise.target_distance_m,
            target_duration_sec=exercise.target_duration_sec,
            target_split_seconds=exercise.target_split_seconds,
            target_watts=exercise.target_watts,
            target_heart_rate_zone=exercise.target_heart_rate_zone,
            target_rpe=exercise.target_rpe,
            target_weight_kg=exercise.target_weight_kg,
            target_reps_or_distance=exercise.target_reps_or_distance,
            target_intensity_split=exercise.target_intensity_split,
            target_stroke_rate=exercise.target_stroke_rate,
            rest_interval_sec=exercise.rest_interval_sec or 120,
            notes=exercise.notes,
        ))

    db.commit()
    db.refresh(session)
    output = TrainingSessionOut.model_validate(session)
    if session.trainer_id:
        trainer = db.query(User).filter(User.id == session.trainer_id).first()
        output.trainer_name = trainer.full_name if trainer else None
    for item in output.exercises:
        exercise = db.query(Exercise).filter(Exercise.id == item.exercise_id).first()
        if exercise:
            item.exercise_name = exercise.name
            item.category = exercise.category
    return output
