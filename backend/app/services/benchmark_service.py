"""Explicit protocol eligibility; never infer a benchmark from its display name."""
import math

from app.models.models import EquipmentCategory, ExerciseCategory


def is_erg_benchmark(entry, exercise, distance: int) -> bool:
    equipment = exercise.equipment
    return bool(
        entry.is_verified
        and exercise.category == ExerciseCategory.ERG_TEST
        and equipment is not None
        and equipment.category == EquipmentCategory.CONCEPT2_ROWERG
        and exercise.default_distance_m == distance
        and entry.actual_distance_m == distance
        and entry.actual_duration_sec is not None
        and math.isfinite(entry.actual_duration_sec)
        and entry.actual_duration_sec > 0
    )


def target_match(actual: float, target: float) -> float:
    """Closeness to a prescription, not an incentive to exceed RPE or rate."""
    if not math.isfinite(actual) or not math.isfinite(target) or target <= 0:
        return 0.0
    return max(0.0, 100.0 * (1.0 - abs(actual - target) / target))


def matches_protocol(entry, exercise) -> bool:
    """An exercise label alone is insufficient to compare different workloads."""
    if exercise.default_distance_m is None and exercise.default_duration_sec is None:
        return False
    if exercise.default_distance_m is not None and entry.actual_distance_m != exercise.default_distance_m:
        return False
    if exercise.default_duration_sec is not None and entry.actual_duration_sec != exercise.default_duration_sec:
        return False
    return True
