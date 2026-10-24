from datetime import datetime, timezone
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class TextInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)


class RSVPUpdate(BaseModel):
    rsvp: Literal["going", "maybe", "declined"]
    note: str | None = Field(None, max_length=1000)


class CheckinUpdate(BaseModel):
    checkin: Literal["present", "absent", "excused", "no_show"] | None = None


class LifecycleUpdate(BaseModel):
    action: Literal["cancel", "restore", "complete", "reschedule"]
    reason: str = Field(min_length=3, max_length=1000)
    session_date: datetime | None = None
    duration_minutes: int | None = Field(None, ge=1, le=1440)

    @field_validator("reason")
    @classmethod
    def reason_required(cls, value):
        if len(value.strip()) < 3:
            raise ValueError("Explain the reason for this change")
        return value.strip()

    @field_validator("session_date")
    @classmethod
    def utc(cls, value):
        return value.astimezone(timezone.utc).replace(tzinfo=None) if value and value.tzinfo else value


class CrewInput(TextInput):
    name: str = Field(min_length=1, max_length=255)
    equipment_id: int
    seats: dict[str, int]


class ReservationInput(BaseModel):
    crew_id: int
    session_id: int | None = None
    starts_at: datetime
    ends_at: datetime

    @field_validator("starts_at", "ends_at")
    @classmethod
    def utc(cls, value):
        return value.astimezone(timezone.utc).replace(tzinfo=None) if value.tzinfo else value

    @model_validator(mode="after")
    def interval(self):
        if self.ends_at <= self.starts_at:
            raise ValueError("Return time must be after the start time")
        return self


class DamageInput(TextInput):
    equipment_id: int
    severity: Literal["advisory", "grounded"]
    description: str = Field(min_length=3, max_length=2000)


class ResolutionInput(TextInput):
    resolution: str = Field(min_length=3, max_length=2000)


class OutingInput(BaseModel):
    reservation_id: int
    notes: str | None = Field(None, max_length=2000)
