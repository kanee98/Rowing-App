"""DB-free rules; integration tests use an explicitly isolated MySQL database."""
from datetime import datetime, timedelta
from types import SimpleNamespace as Record
import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from app.models.models import EquipmentCategory
from app.schemas.operations import CrewInput, DamageInput, ResolutionInput, ReservationInput
from app.schemas.schemas import TrainingSessionCreate
from app.services import club_operations as rules


def test_completed_session_cannot_be_cancelled():
    with pytest.raises(HTTPException) as error:
        rules.validate_lifecycle(Record(status='completed', session_date=datetime(2026, 1, 1)), 'cancel', None)
    assert error.value.status_code == 409


def test_reschedule_cannot_move_session_into_the_past():
    with pytest.raises(HTTPException) as error:
        rules.validate_lifecycle(Record(status='scheduled', session_date=datetime(2026, 1, 1)), 'reschedule', datetime(2000, 1, 1))
    assert error.value.status_code == 422


@pytest.mark.parametrize('schema,data', [
    (CrewInput, {'name': '   ', 'equipment_id': 1, 'seats': {'Single': 1}}),
    (DamageInput, {'equipment_id': 1, 'severity': 'grounded', 'description': '   '}),
    (ResolutionInput, {'resolution': '   '}),
])
def test_operational_records_require_meaningful_text(schema, data):
    with pytest.raises(ValidationError):
        schema(**data)


def test_reservation_normalizes_offsets_and_rejects_reversed_interval():
    value = ReservationInput(crew_id=1, starts_at='2027-01-01T06:00:00+05:30', ends_at='2027-01-01T07:00:00+05:30')
    assert value.starts_at == datetime(2027, 1, 1, 0, 30)
    with pytest.raises(ValidationError):
        ReservationInput(crew_id=1, starts_at=value.ends_at, ends_at=value.starts_at)


def test_session_dates_are_utc_and_weekday_is_derived_from_the_date():
    session = TrainingSessionCreate(title='Test', session_date='2027-01-01T00:30:00+05:30', day_of_week=6)
    assert session.session_date == datetime(2026, 12, 31, 19)
    assert session.day_of_week == 3


class Query:
    def __init__(self, rows): self.rows = rows
    def filter(self, *args): return self
    def order_by(self, *args): return self
    def with_for_update(self, *args, **kwargs): return self
    def join(self, *args): return self
    def outerjoin(self, *args): return self
    def distinct(self): return self
    def all(self): return self.rows
    def first(self): return next(iter(self.rows), None)


class BookingDB:
    def query(self, model, *args):
        from app.models.operations import Reservation
        return Query([Record(id=4, crew_id=9, session_id=None, seats_snapshot={'Single': 12})] if model is Reservation else [])
    def get(self, model, key): return Record(seats={'Single': 12})


def test_athlete_cannot_be_booked_in_two_crews_on_different_boats():
    with pytest.raises(HTTPException) as error:
        rules.validate_participant_conflicts(BookingDB(), [12], datetime(2027, 1, 1), datetime(2027, 1, 1, 1))
    assert error.value.status_code == 409


def test_duplicate_crew_seats_rejected_before_database_access():
    with pytest.raises(HTTPException) as error:
        rules.validate_crew(None, Record(club_id=1), Record(category=EquipmentCategory.DOUBLE_SCULL_2X), {'Bow': 12, 'Stroke': 12})
    assert error.value.status_code == 422


def test_overlapping_sessions_in_one_new_plan_are_rejected():
    proposed = [Record(session_date=datetime(2027, 1, 1, 6), duration_minutes=90), Record(session_date=datetime(2027, 1, 1, 7), duration_minutes=60)]
    with pytest.raises(HTTPException) as error:
        rules.validate_proposed_sessions(proposed)
    assert error.value.status_code == 409


def test_back_to_back_sessions_in_one_plan_are_allowed():
    rules.validate_proposed_sessions([Record(session_date=datetime(2027, 1, 1, 6), duration_minutes=60), Record(session_date=datetime(2027, 1, 1, 7), duration_minutes=60)])


def test_editing_a_saved_crew_does_not_rewrite_historical_reservation_members():
    original = Record(seats_snapshot={'Single': 12}, crew_id=9)
    # Saved crew 9 now contains athlete 14. History must retain athlete 12.
    db = Record(get=lambda model, key: Record(seats={'Single': 14}))
    assert rules.reservation_seats(db, original) == {'Single': 12}
