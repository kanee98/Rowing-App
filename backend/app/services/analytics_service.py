from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from app.models.models import User, UserRole, PerformanceEntry, Exercise, Schedule, Competition, TrainingSession
from app.schemas.schemas import CoachAnalyticsSummary, AthleteRankingItem, ExerciseBenchmarkItem

def format_split(seconds: float | None) -> str | None:
    if seconds is None or seconds <= 0:
        return None
    mins = int(seconds // 60)
    secs = seconds % 60
    return f"{mins}:{secs:04.1f}"

def format_duration(seconds: float | None) -> str | None:
    if seconds is None or seconds <= 0:
        return None
    mins = int(seconds // 60)
    secs = seconds % 60
    return f"{mins}:{secs:04.1f}"

def calculate_coach_analytics(db: Session, club_id: int) -> CoachAnalyticsSummary:
    # 1. Total counts
    athletes = db.query(User).filter(User.club_id == club_id, User.role == UserRole.ATHLETE).all()
    trainers_count = db.query(User).filter(User.club_id == club_id, User.role == UserRole.TRAINER).count()
    total_entries = db.query(PerformanceEntry).join(User, PerformanceEntry.athlete_id == User.id)\
        .filter(User.club_id == club_id).count()
    verified_entries = db.query(PerformanceEntry).join(User, PerformanceEntry.athlete_id == User.id)\
        .filter(User.club_id == club_id, PerformanceEntry.is_verified == True).count()
    
    verified_pct = (verified_entries / total_entries * 100.0) if total_entries > 0 else 0.0
    active_schedules_count = db.query(Schedule).filter(Schedule.club_id == club_id, Schedule.is_active == True).count()
    competitions_count = db.query(Competition).filter(Competition.club_id == club_id).count()

    # 2. Athlete Rankings Calculation
    # Find 2K and 5K exercises
    ex_2k = db.query(Exercise).filter(Exercise.club_id == club_id, Exercise.default_distance_m == 2000).first()
    ex_5k = db.query(Exercise).filter(Exercise.club_id == club_id, Exercise.default_distance_m == 5000).first()

    ranking_items = []
    for a in athletes:
        # Fetch best 2k
        best_2k_entry = None
        if ex_2k:
            best_2k_entry = db.query(PerformanceEntry)\
                .filter(PerformanceEntry.athlete_id == a.id, PerformanceEntry.exercise_id == ex_2k.id)\
                .order_by(PerformanceEntry.avg_split_seconds.asc()).first()
        
        # Fallback if no specific 2k exercise, check any 2000m logged
        if not best_2k_entry:
            best_2k_entry = db.query(PerformanceEntry)\
                .filter(PerformanceEntry.athlete_id == a.id, PerformanceEntry.actual_distance_m == 2000)\
                .order_by(PerformanceEntry.avg_split_seconds.asc()).first()

        # Fetch best 5k
        best_5k_entry = None
        if ex_5k:
            best_5k_entry = db.query(PerformanceEntry)\
                .filter(PerformanceEntry.athlete_id == a.id, PerformanceEntry.exercise_id == ex_5k.id)\
                .order_by(PerformanceEntry.avg_split_seconds.asc()).first()
        if not best_5k_entry:
            best_5k_entry = db.query(PerformanceEntry)\
                .filter(PerformanceEntry.athlete_id == a.id, PerformanceEntry.actual_distance_m == 5000)\
                .order_by(PerformanceEntry.avg_split_seconds.asc()).first()

        # Total sessions completed
        sessions_count = db.query(PerformanceEntry).filter(PerformanceEntry.athlete_id == a.id).count()

        # Average trainer rating
        avg_rating = db.query(func.avg(PerformanceEntry.trainer_rating))\
            .filter(PerformanceEntry.athlete_id == a.id, PerformanceEntry.trainer_rating != None).scalar()

        # Watts/kg calculation
        w_kg = None
        if best_2k_entry and best_2k_entry.avg_watts and a.weight_kg and a.weight_kg > 0:
            w_kg = round(best_2k_entry.avg_watts / a.weight_kg, 2)

        # Composite Readiness Score (0 - 100)
        # 1. 2k Split component (1:30 is 100%, 2:10 is 40%)
        # 2. Watts/kg component (>5.0 w/kg is top tier)
        # 3. Volume and trainer rating
        weighted_scores = []
        if best_2k_entry and best_2k_entry.avg_split_seconds:
            # 90s (1:30) -> 100, 120s (2:00) -> 60
            raw_split_score = max(30.0, min(100.0, 100 - (best_2k_entry.avg_split_seconds - 90) * 1.5))
            weighted_scores.append((raw_split_score, 60.0))
        if w_kg:
            weighted_scores.append((min(100.0, w_kg * 20.0), 25.0))
        if avg_rating:
            weighted_scores.append(((float(avg_rating) / 5.0) * 100.0, 15.0))
        readiness = (
            sum(score * weight for score, weight in weighted_scores) / sum(weight for _, weight in weighted_scores)
            if weighted_scores else None
        )

        ranking_items.append(AthleteRankingItem(
            athlete_id=a.id,
            athlete_name=a.full_name,
            weight_kg=a.weight_kg,
            side_preference=a.side_preference.value if a.side_preference else None,
            total_sessions_completed=sessions_count,
            best_2k_split=format_split(best_2k_entry.avg_split_seconds) if best_2k_entry else None,
            best_2k_time_sec=best_2k_entry.actual_duration_sec if best_2k_entry else None,
            best_2k_watts=best_2k_entry.avg_watts if best_2k_entry else None,
            watts_per_kg_2k=w_kg,
            best_5k_split=format_split(best_5k_entry.avg_split_seconds) if best_5k_entry else None,
            best_5k_time_sec=best_5k_entry.actual_duration_sec if best_5k_entry else None,
            avg_verified_rating=round(float(avg_rating), 1) if avg_rating else None,
            overall_readiness_score=round(readiness, 1) if readiness is not None else None,
            rank=1
        ))

    # Sort athletes by overall readiness / best 2k
    ranking_items.sort(
        key=lambda x: (x.overall_readiness_score is not None, x.overall_readiness_score or 0, -(x.best_2k_time_sec or 9999)),
        reverse=True,
    )
    for idx, item in enumerate(ranking_items):
        item.rank = idx + 1

    # 3. Exercise benchmarks
    exercises = db.query(Exercise).filter(Exercise.club_id == club_id).all()
    benchmarks = []
    for ex in exercises:
        entries = db.query(PerformanceEntry).filter(PerformanceEntry.exercise_id == ex.id).all()
        if entries:
            metric_values = []
            higher_is_better = False
            if ex.primary_metric == "reps_weight":
                metric_values = [(entry, entry.actual_weight_kg) for entry in entries if entry.actual_weight_kg]
                higher_is_better = True
                formatter = lambda value: f"{value:.1f} kg"
            elif ex.primary_metric == "watts":
                metric_values = [(entry, entry.avg_watts) for entry in entries if entry.avg_watts]
                higher_is_better = True
                formatter = lambda value: f"{value:.0f} W"
            elif ex.primary_metric == "distance_meters":
                metric_values = [(entry, entry.actual_distance_m) for entry in entries if entry.actual_distance_m]
                higher_is_better = True
                formatter = lambda value: f"{value:.0f} m"
            elif ex.primary_metric == "time_seconds":
                metric_values = [(entry, entry.actual_duration_sec) for entry in entries if entry.actual_duration_sec]
                formatter = format_duration
            else:
                metric_values = [(entry, entry.avg_split_seconds) for entry in entries if entry.avg_split_seconds]
                formatter = format_split
            if not metric_values:
                continue
            best_entry, best_value = sorted(metric_values, key=lambda item: item[1], reverse=higher_is_better)[0]
            average_value = sum(value for _, value in metric_values) / len(metric_values)
            top_athlete = db.query(User).filter(User.id == best_entry.athlete_id).first()
            benchmarks.append(ExerciseBenchmarkItem(
                exercise_id=ex.id,
                exercise_name=ex.name,
                total_entries=len(entries),
                top_performer_name=top_athlete.full_name if top_athlete else "N/A",
                top_performer_value=formatter(best_value),
                club_avg_value=formatter(average_value),
            ))

    return CoachAnalyticsSummary(
        total_athletes=len(athletes),
        total_trainers=trainers_count,
        total_workouts_logged=total_entries,
        verified_percentage=round(verified_pct, 1),
        active_schedules_count=active_schedules_count,
        target_competitions_count=competitions_count,
        athlete_rankings=ranking_items,
        exercise_benchmarks=benchmarks
    )
