from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.models import User, UserRole, Schedule, TrainingSession, SessionExercise, PerformanceEntry
from app.schemas.schemas import CoachAnalyticsSummary
from app.api.deps import get_current_user, require_roles
from app.services.analytics_service import calculate_coach_analytics

router = APIRouter(prefix="/analytics", tags=["analytics"])

@router.get("/coach-summary", response_model=CoachAnalyticsSummary)
def get_coach_summary(
    current_user: User = Depends(require_roles([UserRole.COACH, UserRole.ADMIN, UserRole.TRAINER])),
    db: Session = Depends(get_db)
):
    """Returns aggregated athlete rankings, readiness scores, and benchmark comparisons"""
    return calculate_coach_analytics(db, current_user.club_id)

@router.get("/schedule-adherence/{schedule_id}")
def get_schedule_adherence(
    schedule_id: int,
    current_user: User = Depends(require_roles([UserRole.COACH, UserRole.ADMIN, UserRole.TRAINER])),
    db: Session = Depends(get_db),
):
    schedule = db.query(Schedule).filter(Schedule.id == schedule_id, Schedule.club_id == current_user.club_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    athlete_ids = [assignment.user_id for assignment in schedule.assignments if assignment.assignment_type == "athlete"]
    if not athlete_ids:
        athlete_ids = [user.id for user in db.query(User).filter(User.club_id == current_user.club_id, User.role == UserRole.ATHLETE).all()]

    session_rows = []
    total_expected = 0
    total_completed = 0
    all_scores = []
    for training_session in schedule.sessions:
        prescriptions = db.query(SessionExercise).filter(SessionExercise.session_id == training_session.id).all()
        is_due = training_session.session_date <= datetime.utcnow()
        expected = len(athlete_ids) * len(prescriptions) if is_due else 0
        performances = db.query(PerformanceEntry).filter(
            PerformanceEntry.session_id == training_session.id,
            PerformanceEntry.athlete_id.in_(athlete_ids),
        ).all() if athlete_ids else []
        completed_keys = {(entry.athlete_id, entry.exercise_id) for entry in performances}
        completed = len(completed_keys)
        scores = []
        targets = {item.exercise_id: item for item in prescriptions}
        for entry in performances:
            target = targets.get(entry.exercise_id)
            if not target:
                continue
            metric_scores = []
            if target.target_weight_kg and entry.actual_weight_kg:
                metric_scores.append(entry.actual_weight_kg / target.target_weight_kg * 100)
            if target.target_reps and entry.actual_reps:
                metric_scores.append(entry.actual_reps / (target.target_reps * max(1, target.sets)) * 100)
            if target.target_watts and entry.avg_watts:
                metric_scores.append(entry.avg_watts / target.target_watts * 100)
            if target.target_split_seconds and entry.avg_split_seconds:
                metric_scores.append(target.target_split_seconds / entry.avg_split_seconds * 100)
            if target.target_distance_m and entry.actual_distance_m:
                metric_scores.append(entry.actual_distance_m / (target.target_distance_m * max(1, target.sets)) * 100)
            if target.target_duration_sec and entry.actual_duration_sec:
                metric_scores.append(entry.actual_duration_sec / (target.target_duration_sec * max(1, target.sets)) * 100)
            if target.target_stroke_rate and entry.avg_stroke_rate:
                metric_scores.append(entry.avg_stroke_rate / target.target_stroke_rate * 100)
            if target.target_rpe and entry.perceived_exertion_rpe:
                metric_scores.append(entry.perceived_exertion_rpe / target.target_rpe * 100)
            if metric_scores:
                scores.append(sum(min(150.0, score) for score in metric_scores) / len(metric_scores))
        total_expected += expected
        total_completed += completed
        all_scores.extend(scores)
        session_rows.append({
            "session_id": training_session.id,
            "title": training_session.title,
            "session_date": training_session.session_date,
            "is_due": is_due,
            "expected_logs": expected,
            "completed_logs": completed,
            "completion_percentage": round(completed / expected * 100, 1) if expected else 0,
            "target_achievement_percentage": round(sum(scores) / len(scores), 1) if scores else None,
        })
    return {
        "schedule_id": schedule.id,
        "assigned_athletes": len(athlete_ids),
        "expected_logs": total_expected,
        "completed_logs": total_completed,
        "completion_percentage": round(total_completed / total_expected * 100, 1) if total_expected else 0,
        "target_achievement_percentage": round(sum(all_scores) / len(all_scores), 1) if all_scores else None,
        "sessions": session_rows,
    }
