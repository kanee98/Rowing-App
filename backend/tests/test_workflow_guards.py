"""Regression checks for the audited workflows. No database connections needed."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace as Record

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.api.clubs import update_club_member
from app.api.weather import get_boathouse_conditions, update_boathouse_conditions
from app.api.schedules import _validate_session_safety
from app.models.models import UserRole, ExerciseCategory, EquipmentCategory, SafetyFlagStatus
from app.schemas.schemas import BoathouseConditionUpdate, UserUpdate
from app.services.analytics_service import build_athlete_rankings
from app.services.benchmark_service import is_erg_benchmark, target_match
from app.services.safety_service import condition_snapshot


class ReadOnlyDB:
    def __init__(self, value=None, count=0):
        self.value = value
        self.remaining = count

    def query(self, *args):
        return self

    def filter(self, *args):
        return self

    def with_for_update(self):
        return self

    def populate_existing(self):
        return self

    def first(self):
        return self.value

    def count(self):
        return self.remaining

    def add(self, value):
        raise AssertionError("Unexpected database write")

    def commit(self):
        raise AssertionError("Unexpected database commit")


def test_reading_missing_conditions_does_not_fabricate_or_persist_a_report():
    result = get_boathouse_conditions(db=ReadOnlyDB(), current_user=Record(club_id=1))
    assert result.report_status == "not_reported"
    assert result.flag_status is None
    assert result.wind_speed_knots is None
    assert result.updated_at is None


def test_legacy_conditions_are_not_treated_as_observed_measurements():
    legacy = Record(report_source="legacy_unverified", flag_status=SafetyFlagStatus.GREEN, wind_speed_knots=8)
    result = condition_snapshot(legacy, club_id=1)
    assert result.report_status == "not_reported"
    assert result.flag_status is None
    assert result.wind_speed_knots is None


@pytest.mark.parametrize("hours,status", [(1, "current"), (-1, "outdated")])
def test_report_validity_and_zero_measurements_are_preserved(hours, status):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    report = Record(id=1, club_id=1, report_source="manual", valid_until=now + timedelta(hours=hours),
                    updated_at=now, flag_status=SafetyFlagStatus.GREEN, wind_speed_knots=0.0, water_temp_c=None)
    result = condition_snapshot(report, club_id=1, now=now)
    assert result.report_status == status
    assert result.wind_speed_knots == 0.0
    assert result.water_temp_c is None


def test_publishing_requires_an_explicit_flag_and_keeps_unmeasured_fields_empty():
    with pytest.raises(ValidationError):
        BoathouseConditionUpdate()
    report = BoathouseConditionUpdate(flag_status="amber", wind_speed_knots=0)
    assert report.water_temp_c is None
    assert report.wind_speed_knots == 0
    with pytest.raises(ValidationError):
        BoathouseConditionUpdate(flag_status="green", valid_for_hours=0)


@pytest.mark.parametrize("target_role,change", [
    (UserRole.ATHLETE, {"role": "trainer"}),
    (UserRole.ATHLETE, {"role": "coach"}),
    (UserRole.ATHLETE, {"role": "admin"}),
    (UserRole.ATHLETE, {"is_active": False}),
    (UserRole.TRAINER, {"full_name": "Changed"}),
    (UserRole.COACH, {"full_name": "Changed"}),
    (UserRole.ADMIN, {"full_name": "Changed"}),
])
def test_coaches_cannot_change_roles_access_or_staff_accounts(target_role, change):
    target = Record(id=2, role=target_role)
    with pytest.raises(HTTPException) as error:
        update_club_member(2, UserUpdate(**change), current_user=Record(id=1, club_id=1, role=UserRole.COACH), db=ReadOnlyDB(target))
    assert error.value.status_code == 403


@pytest.mark.parametrize("change", [{"role": "athlete"}, {"is_active": False}])
def test_last_active_administrator_cannot_be_removed(change):
    target = Record(id=1, role=UserRole.ADMIN)
    with pytest.raises(HTTPException) as error:
        update_club_member(1, UserUpdate(**change), current_user=Record(id=1, club_id=1, role=UserRole.ADMIN), db=ReadOnlyDB(target, count=0))
    assert error.value.status_code == 400


def exercise(category=ExerciseCategory.ERG_TEST, machine=EquipmentCategory.CONCEPT2_ROWERG):
    return Record(category=category, equipment=Record(category=machine), default_distance_m=2000)


def entry(**changes):
    values = dict(athlete_id=1, exercise_id=1, is_verified=True, actual_distance_m=2000,
                  actual_duration_sec=420.0, avg_watts=300, session_id=10,
                  recorded_date=datetime.now(timezone.utc).replace(tzinfo=None), trainer_rating=None)
    values.update(changes)
    return Record(**values)


@pytest.mark.parametrize("changes", [{"is_verified": False}, {"actual_distance_m": 1000}, {"actual_duration_sec": None}, {"actual_duration_sec": -1}])
def test_incomplete_or_unverified_results_are_not_benchmarks(changes):
    assert not is_erg_benchmark(entry(**changes), exercise(), 2000)


@pytest.mark.parametrize("definition", [
    exercise(category=ExerciseCategory.WATER_ENDURANCE),
    exercise(category=ExerciseCategory.ERG_INTERVALS),
    exercise(machine=EquipmentCategory.CONCEPT2_BIKEERG),
    Record(category=ExerciseCategory.ERG_TEST, equipment=None, default_distance_m=2000),
])
def test_incompatible_protocols_and_unknown_equipment_are_not_ranked(definition):
    assert not is_erg_benchmark(entry(), definition, 2000)


def test_rankings_count_distinct_sessions_and_use_verified_tests_only():
    athlete = Record(id=1, full_name="Athlete", weight_kg=75, side_preference=None)
    records = [entry(), entry(actual_duration_sec=410), entry(actual_duration_sec=300, is_verified=False), entry(session_id=None, actual_duration_sec=415)]
    ranking = build_athlete_rankings([athlete], records, {1: exercise()})[0]
    assert ranking.total_sessions_completed == 1
    assert ranking.best_2k_time_sec == 410
    assert ranking.best_2k_split == "1:42.5"
    assert ranking.overall_readiness_score is None
    assert ranking.rank == 1


def test_athletes_without_comparable_results_remain_unranked_and_ties_share_rank():
    athletes = [Record(id=i, full_name=str(i), weight_kg=None, side_preference=None) for i in [1, 2, 3]]
    rankings = build_athlete_rankings(athletes, [entry(), entry(athlete_id=2), entry(athlete_id=3, is_verified=False)], {1: exercise()})
    assert [item.rank for item in rankings] == [1, 1, None]


def test_exceeding_stroke_rate_and_rpe_does_not_increase_target_match():
    assert target_match(20, 20) == 100
    assert target_match(30, 20) == 50
    assert target_match(10, 5) == 0
    assert target_match(0, 20) == 0


def test_manual_publication_clears_unmeasured_fields_and_keeps_the_explicit_flag():
    class ReportDB(ReadOnlyDB):
        def add(self, value):
            self.value = value

        def commit(self):
            pass

        def refresh(self, value):
            value.id = 1

        def all(self):
            return []

    db = ReportDB()
    payload = BoathouseConditionUpdate(flag_status="amber", wind_speed_knots=0, safety_notes=" Club instructions ")
    result = update_boathouse_conditions(payload, db=db, current_user=Record(id=1, club_id=1, role=UserRole.COACH))
    assert result.flag_status == SafetyFlagStatus.AMBER
    assert result.report_source == "manual"
    assert result.report_status == "current"
    assert result.wind_speed_knots == 0
    assert result.water_temp_c is None
    assert result.safety_notes == "Club instructions"


def test_session_date_changes_recheck_assigned_athletes_safety_restrictions():
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    athlete = Record(id=2, full_name="Athlete")
    restriction = Record(user_id=2, starts_at=now - timedelta(hours=1), ends_at=now + timedelta(hours=1))

    class RestrictionDB(ReadOnlyDB):
        def all(self):
            return [restriction]

    with pytest.raises(HTTPException) as error:
        _validate_session_safety(
            RestrictionDB(), Record(assignments=[Record(user_id=2, user=athlete)]),
            Record(trainer_id=None, session_date=now, duration_minutes=60),
            Record(id=1, club_id=1, role=UserRole.COACH),
        )
    assert error.value.status_code == 409
