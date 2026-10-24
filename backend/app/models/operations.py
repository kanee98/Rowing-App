from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, JSON, UniqueConstraint
from app.core.database import Base


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Attendance(Base):
    __tablename__ = "session_attendance"
    __table_args__ = (UniqueConstraint("session_id", "user_id", name="uq_attendance_session_user"),)
    id = Column(Integer, primary_key=True)
    session_id = Column(Integer, ForeignKey("training_sessions.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    rsvp = Column(String(16), default="unknown", nullable=False)
    checkin = Column(String(16), nullable=True)
    note = Column(Text, nullable=True)
    checked_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)


class Crew(Base):
    __tablename__ = "crews"
    id = Column(Integer, primary_key=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    equipment_id = Column(Integer, ForeignKey("equipment.id"), nullable=False)
    seats = Column(JSON, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)


class Reservation(Base):
    __tablename__ = "equipment_reservations"
    id = Column(Integer, primary_key=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=False, index=True)
    equipment_id = Column(Integer, ForeignKey("equipment.id"), nullable=False, index=True)
    crew_id = Column(Integer, ForeignKey("crews.id"), nullable=False)
    crew_name_snapshot = Column(String(255), nullable=True)
    seats_snapshot = Column(JSON, nullable=True)
    session_id = Column(Integer, ForeignKey("training_sessions.id"), nullable=True, index=True)
    starts_at = Column(DateTime, nullable=False, index=True)
    ends_at = Column(DateTime, nullable=False)
    status = Column(String(16), default="booked", nullable=False)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)


class DamageReport(Base):
    __tablename__ = "equipment_damage_reports"
    id = Column(Integer, primary_key=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=False, index=True)
    equipment_id = Column(Integer, ForeignKey("equipment.id"), nullable=False, index=True)
    reported_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    description = Column(Text, nullable=False)
    severity = Column(String(16), nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    resolved_at = Column(DateTime, nullable=True)
    resolved_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    resolution = Column(Text, nullable=True)


class Outing(Base):
    __tablename__ = "outings"
    id = Column(Integer, primary_key=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=False, index=True)
    reservation_id = Column(Integer, ForeignKey("equipment_reservations.id"), unique=True, nullable=False)
    launched_at = Column(DateTime, default=utcnow, nullable=False)
    expected_return_at = Column(DateTime, nullable=False)
    returned_at = Column(DateTime, nullable=True)
    launched_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    returned_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    notes = Column(Text, nullable=True)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id = Column(Integer, primary_key=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=False, index=True)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String(64), nullable=False)
    entity = Column(String(64), nullable=False)
    entity_id = Column(Integer, nullable=True)
    details = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)


class AccountAction(Base):
    __tablename__ = "account_actions"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    purpose = Column(String(32), nullable=False)
    token_hash = Column(String(64), unique=True, nullable=False)
    new_email = Column(String(255), nullable=True)
    expires_at = Column(DateTime, nullable=False)
    consumed_at = Column(DateTime, nullable=True)


class EmailOutbox(Base):
    __tablename__ = "email_outbox"
    id = Column(Integer, primary_key=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=True, index=True)
    recipient = Column(String(255), nullable=False)
    subject = Column(String(255), nullable=False)
    body = Column(Text, nullable=False)
    dedupe_key = Column(String(191), unique=True, nullable=True)
    status = Column(String(16), default="pending", nullable=False, index=True)
    attempts = Column(Integer, default=0, nullable=False)
    next_attempt_at = Column(DateTime, default=utcnow, nullable=False)
    sent_at = Column(DateTime, nullable=True)
    last_error = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
