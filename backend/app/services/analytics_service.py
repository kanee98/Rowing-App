from datetime import datetime, timedelta, timezone
from collections import defaultdict
import math

from sqlalchemy.orm import Session
from app.models.models import User, UserRole, PerformanceEntry, Exercise, Schedule, Competition
from app.schemas.schemas import CoachAnalyticsSummary, AthleteRankingItem, ExerciseBenchmarkItem
from app.services.benchmark_service import is_erg_benchmark, matches_protocol


def format_split(seconds: float | None) -> str | None:
    if seconds is None or seconds <= 0:
        return None
    tenths = round(seconds * 10)
    return f"{tenths // 600}:{(tenths % 600) / 10:04.1f}"


def format_duration(seconds: float | None) -> str | None:
    return format_split(seconds)


def build_athlete_rankings(athletes, entries, exercise_map):
    by_athlete = defaultdict(list)
    for entry in entries:
        if entry.exercise_id in exercise_map:
            by_athlete[entry.athlete_id].append(entry)
    ranking_items = []
    for athlete in athletes:
        athlete_entries = by_athlete[athlete.id]
        verified = [entry for entry in athlete_entries if entry.is_verified]
        best = {}
        for distance in (2000, 5000):
            candidates = [entry for entry in verified if is_erg_benchmark(entry, exercise_map[entry.exercise_id], distance)]
            best[distance] = min(candidates, key=lambda entry: entry.actual_duration_sec) if candidates else None
        two, five = best[2000], best[5000]
        ratings = [entry.trainer_rating for entry in verified if entry.trainer_rating is not None]
        # Distinct scheduled sessions only. Standalone pieces remain workout logs.
        sessions = {entry.session_id for entry in athlete_entries if entry.session_id is not None}
        ranking_items.append(AthleteRankingItem(
            athlete_id=athlete.id, athlete_name=athlete.full_name,
            weight_kg=athlete.weight_kg,
            side_preference=athlete.side_preference.value if athlete.side_preference else None,
            total_sessions_completed=len(sessions),
            best_2k_split=format_split(two.actual_duration_sec / 4) if two else None,
            best_2k_time_sec=two.actual_duration_sec if two else None,
            best_2k_watts=two.avg_watts if two else None,
            watts_per_kg_2k=round(two.avg_watts / athlete.weight_kg, 2) if two and two.avg_watts and athlete.weight_kg and athlete.weight_kg > 0 else None,
            best_5k_split=format_split(five.actual_duration_sec / 10) if five else None,
            best_5k_time_sec=five.actual_duration_sec if five else None,
            avg_verified_rating=round(sum(ratings) / len(ratings), 1) if ratings else None,
            overall_readiness_score=None,
            best_2k_recorded_at=two.recorded_date if two else None,
            best_5k_recorded_at=five.recorded_date if five else None,
        ))
    ranking_items.sort(key=lambda item: (item.best_2k_time_sec is None, item.best_2k_time_sec or float("inf"), item.athlete_name.casefold()))
    previous_time, previous_rank = None, None
    for index, item in enumerate(ranking_items):
        if item.best_2k_time_sec is not None:
            item.rank = previous_rank if item.best_2k_time_sec == previous_time else index + 1
            previous_time, previous_rank = item.best_2k_time_sec, item.rank

    return ranking_items


def calculate_coach_analytics(db: Session, club_id: int, window_days: int = 90) -> CoachAnalyticsSummary:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    since = now - timedelta(days=window_days)
    athletes = db.query(User).filter(User.club_id == club_id, User.role == UserRole.ATHLETE, User.is_active == True).all()
    athlete_map = {athlete.id: athlete for athlete in athletes}
    exercises = db.query(Exercise).filter(Exercise.club_id == club_id).all()
    exercise_map = {exercise.id: exercise for exercise in exercises}
    entries = db.query(PerformanceEntry).join(User, PerformanceEntry.athlete_id == User.id).filter(
        User.club_id == club_id, User.role == UserRole.ATHLETE, User.is_active == True,
        PerformanceEntry.recorded_date >= since, PerformanceEntry.recorded_date <= now,
    ).all()
    entries = [entry for entry in entries if entry.exercise_id in exercise_map]
    by_athlete = defaultdict(list)
    by_exercise = defaultdict(list)
    for entry in entries:
        by_athlete[entry.athlete_id].append(entry)
        if entry.is_verified:
            by_exercise[entry.exercise_id].append(entry)

    ranking_items = build_athlete_rankings(athletes, entries, exercise_map)

    benchmarks = []
    # Heart rate, stroke rate and RPE are descriptive measurements, not rankings.
    metric_specs = {
        "split_500m": ("avg_split_seconds", format_split, False),
        "time_seconds": ("actual_duration_sec", format_duration, False),
        "watts": ("avg_watts", lambda value: f"{value:.0f} W", True),
        "distance_meters": ("actual_distance_m", lambda value: f"{value:.0f} m", True),
        "reps_weight": ("actual_weight_kg", lambda value: f"{value:.1f} kg", True),
        "stroke_rate": ("avg_stroke_rate", lambda value: f"{value:.1f} spm", None),
        "heart_rate": ("avg_heart_rate", lambda value: f"{value:.0f} bpm", None),
        "rpe": ("perceived_exertion_rpe", lambda value: f"{value:.1f}/10 RPE", None),
    }
    for exercise in exercises:
        if exercise.primary_metric not in metric_specs:
            continue
        field, formatter, higher_is_better = metric_specs[exercise.primary_metric]
        measured = [(entry, getattr(entry, field)) for entry in by_exercise[exercise.id] if getattr(entry, field) is not None and math.isfinite(getattr(entry, field)) and getattr(entry, field) > 0]
        if not measured:
            continue
        # Publish leaderboard values only for a known, identical protocol.
        comparable = [(entry, value) for entry, value in measured if matches_protocol(entry, exercise)]
        if exercise.primary_metric == "reps_weight":
            rep_counts = {entry.actual_reps for entry, _ in measured}
            comparable = measured if len(rep_counts) == 1 and None not in rep_counts else []
        # Fixed time is required to rank distances; fixed distance to rank times.
        if exercise.primary_metric == "distance_meters" and not exercise.default_duration_sec:
            comparable = []
        if exercise.primary_metric in ("time_seconds", "split_500m") and not exercise.default_distance_m:
            comparable = []
        best_entry, best_value = (None, None)
        if comparable and higher_is_better is not None:
            best_entry, best_value = sorted(comparable, key=lambda item: item[1], reverse=higher_is_better)[0]
        average_entries = comparable if comparable else measured
        benchmarks.append(ExerciseBenchmarkItem(
            exercise_id=exercise.id, exercise_name=exercise.name, total_entries=len(average_entries),
            top_performer_name=athlete_map[best_entry.athlete_id].full_name if best_entry else None,
            top_performer_value=formatter(best_value) if best_entry else None,
            club_avg_value=formatter(sum(value for _, value in average_entries) / len(average_entries)),
        ))

    return CoachAnalyticsSummary(
        window_days=window_days, as_of=now,
        total_athletes=len(athletes),
        total_trainers=db.query(User).filter(User.club_id == club_id, User.role == UserRole.TRAINER, User.is_active == True).count(),
        total_workouts_logged=len(entries),
        verified_percentage=round(sum(entry.is_verified for entry in entries) / len(entries) * 100, 1) if entries else 0,
        active_schedules_count=db.query(Schedule).filter(Schedule.club_id == club_id, Schedule.is_active == True).count(),
        target_competitions_count=db.query(Competition).filter(Competition.club_id == club_id).count(),
        athlete_rankings=ranking_items, exercise_benchmarks=benchmarks,
    )
