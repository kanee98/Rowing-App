from fastapi import APIRouter, Depends, HTTPException, Query
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.models import User, UserRole, Schedule, ScheduleAssignment, SessionExercise, PerformanceEntry
from app.schemas.schemas import CoachAnalyticsSummary
from app.api.deps import require_roles
from app.services.analytics_service import calculate_coach_analytics
from app.services.benchmark_service import target_match

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/my-benchmarks")
def get_my_benchmarks(
    current_user: User = Depends(require_roles([UserRole.ATHLETE])),
    db: Session = Depends(get_db),
):
    summary = calculate_coach_analytics(db, current_user.club_id)
    return next(item for item in summary.athlete_rankings if item.athlete_id == current_user.id)


@router.get("/coach-summary", response_model=CoachAnalyticsSummary)
def get_coach_summary(
    window_days: int = Query(90, ge=1, le=3650),
    current_user: User = Depends(require_roles([UserRole.COACH, UserRole.ADMIN, UserRole.TRAINER])),
    db: Session = Depends(get_db),
):
    return calculate_coach_analytics(db, current_user.club_id, window_days)


@router.get("/schedule-adherence/{schedule_id}")
def get_schedule_adherence(
    schedule_id: int,
    current_user: User = Depends(require_roles([UserRole.COACH, UserRole.ADMIN, UserRole.TRAINER])),
    db: Session = Depends(get_db),
):
    query = db.query(Schedule).filter(Schedule.id == schedule_id, Schedule.club_id == current_user.club_id)
    if current_user.role == UserRole.TRAINER:
        query = query.filter(Schedule.assignments.any(ScheduleAssignment.user_id == current_user.id))
    schedule = query.first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    athlete_ids = [assignment.user_id for assignment in schedule.assignments if assignment.assignment_type == "athlete"]
    rows, all_scores = [], []
    total_expected, total_completed = 0, 0
    for session in schedule.sessions:
        if session.status == "cancelled":
            continue
        # Logging identifies exercise types, not prescription blocks. A repeated
        # exercise is counted once per athlete instead of creating impossible work.
        targets = {item.exercise_id: item for item in db.query(SessionExercise).filter(SessionExercise.session_id == session.id).all()}
        is_due = session.session_date <= datetime.now(timezone.utc).replace(tzinfo=None)
        expected = len(athlete_ids) * len(targets) if is_due else 0
        performances = db.query(PerformanceEntry).filter(
            PerformanceEntry.session_id == session.id,
            PerformanceEntry.athlete_id.in_(athlete_ids),
            PerformanceEntry.exercise_id.in_(list(targets)),
        ).order_by(PerformanceEntry.recorded_date.desc(), PerformanceEntry.id.desc()).all() if expected else []
        latest = {}
        for entry in performances:
            latest.setdefault((entry.athlete_id, entry.exercise_id), entry)
        completed = len(latest)
        scores = []
        for entry in latest.values():
            if not entry.is_verified:
                continue
            target = targets[entry.exercise_id]
            sets = max(1, target.sets or 1)
            pairs = [
                (entry.actual_weight_kg, target.target_weight_kg),
                (entry.actual_reps, target.target_reps * sets if target.target_reps else None),
                (entry.avg_watts, target.target_watts),
                (entry.avg_split_seconds, target.target_split_seconds),
                (entry.actual_distance_m, target.target_distance_m * sets if target.target_distance_m else None),
                (entry.actual_duration_sec, target.target_duration_sec * sets if target.target_duration_sec else None),
                (entry.avg_stroke_rate, target.target_stroke_rate),
                (entry.perceived_exertion_rpe, target.target_rpe),
            ]
            matches = [target_match(actual, planned) for actual, planned in pairs if actual is not None and planned is not None]
            if matches:
                scores.append(sum(matches) / len(matches))
        total_expected += expected
        total_completed += completed
        all_scores.extend(scores)
        rows.append({
            "session_id": session.id, "title": session.title, "session_date": session.session_date,
            "is_due": is_due, "expected_logs": expected, "completed_logs": completed,
            "completion_percentage": round(completed / expected * 100, 1) if expected else 0,
            "target_achievement_percentage": round(sum(scores) / len(scores), 1) if scores else None,
        })
    return {
        "schedule_id": schedule.id, "assigned_athletes": len(athlete_ids),
        "expected_logs": total_expected, "completed_logs": total_completed,
        "completion_percentage": round(total_completed / total_expected * 100, 1) if total_expected else 0,
        "target_achievement_percentage": round(sum(all_scores) / len(all_scores), 1) if all_scores else None,
        "sessions": rows,
    }
