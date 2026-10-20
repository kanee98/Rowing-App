import enum
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text, Enum, JSON,
    UniqueConstraint
)
from sqlalchemy.orm import relationship
from app.core.database import Base

class UserRole(str, enum.Enum):
    ADMIN = "admin"
    COACH = "coach"
    TRAINER = "trainer"
    ATHLETE = "athlete"

class BoatSidePreference(str, enum.Enum):
    PORT = "port"
    STARBOARD = "starboard"
    BOTH = "both"
    SCULL = "scull"

class EquipmentCategory(str, enum.Enum):
    SINGLE_SCULL_1X = "1x_single_scull"
    DOUBLE_SCULL_2X = "2x_double_scull"
    PAIR_2MINUS = "2-_pair"
    FOUR_4MINUS = "4-_four"
    COXED_FOUR_4PLUS = "4+_coxed_four"
    EIGHT_8PLUS = "8+_eight"
    CONCEPT2_ROWERG = "concept2_rowerg"
    CONCEPT2_BIKEERG = "concept2_bikeerg"
    CONCEPT2_SKIERG = "concept2_skierg"
    GYM_WEIGHTS = "gym_weights"
    OTHER = "other"

class ExerciseCategory(str, enum.Enum):
    ERG_TEST = "erg_test"
    WATER_ENDURANCE = "water_endurance"
    WATER_INTERVALS = "water_intervals"
    ERG_INTERVALS = "erg_intervals"
    STRENGTH_CONDITIONING = "strength_conditioning"
    TECHNIQUE = "technique"
    CROSS_TRAINING = "cross_training"

class SchedulePhase(str, enum.Enum):
    BASE_ENDURANCE = "base_endurance"
    STRENGTH_BUILD = "strength_build"
    RACE_PACE_PEAK = "race_pace_peak"
    TAPER_RECOVERY = "taper_recovery"

class SafetyFlagStatus(str, enum.Enum):
    GREEN = "green"
    AMBER = "amber"
    RED = "red"

class NotificationType(str, enum.Enum):
    SCHEDULE_ASSIGNED = "schedule_assigned"
    PERFORMANCE_LOGGED = "performance_logged"
    VERIFICATION_COMPLETED = "verification_completed"
    WEATHER_ALERT = "weather_alert"
    ANNOUNCEMENT = "announcement"

class TaxonomyNodeStatus(str, enum.Enum):
    ACTIVE = "active"
    ARCHIVED = "archived"
    SOFT_DELETED = "soft_deleted"

class AvailabilityStatus(str, enum.Enum):
    AVAILABLE = "available"
    LIMITED = "limited"
    UNAVAILABLE = "unavailable"

class Club(Base):
    __tablename__ = "clubs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    code = Column(String(64), unique=True, index=True, nullable=False)
    location = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)
    logo_url = Column(String(512), nullable=True)
    benchmark_2k_split_seconds = Column(Float, nullable=True)
    gold_2k_split_seconds = Column(Float, nullable=True)
    athlete_join_policy = Column(String(32), default="approval_required", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    users = relationship("User", back_populates="club", cascade="all, delete-orphan")
    competitions = relationship("Competition", back_populates="club", cascade="all, delete-orphan")
    equipments = relationship("Equipment", back_populates="club", cascade="all, delete-orphan")
    exercises = relationship("Exercise", back_populates="club", cascade="all, delete-orphan")
    schedules = relationship("Schedule", back_populates="club", cascade="all, delete-orphan")
    notifications = relationship("Notification", back_populates="club", cascade="all, delete-orphan")
    boathouse_condition = relationship("BoathouseCondition", back_populates="club", uselist=False, cascade="all, delete-orphan")
    taxonomy_nodes = relationship("TaxonomyNode", back_populates="club", cascade="all, delete-orphan")
    join_requests = relationship("ClubJoinRequest", back_populates="club", cascade="all, delete-orphan")
    invitations = relationship("ClubInvitation", back_populates="club", cascade="all, delete-orphan")

class TaxonomyNode(Base):
    __tablename__ = "taxonomy_nodes"

    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=False)
    parent_id = Column(Integer, ForeignKey("taxonomy_nodes.id"), nullable=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    display_order = Column(Integer, default=0)
    status = Column(Enum(TaxonomyNodeStatus), default=TaxonomyNodeStatus.ACTIVE, nullable=False)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    archived_at = Column(DateTime, nullable=True)
    deleted_at = Column(DateTime, nullable=True)

    club = relationship("Club", back_populates="taxonomy_nodes")
    created_by = relationship("User")
    parent = relationship("TaxonomyNode", remote_side=[id], back_populates="children")
    children = relationship("TaxonomyNode", back_populates="parent", cascade="all, delete-orphan", order_by="TaxonomyNode.display_order")
    schedules = relationship("Schedule", back_populates="taxonomy_node")

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), default=UserRole.ATHLETE, nullable=False)
    
    # Athlete/User specific attributes
    weight_kg = Column(Float, nullable=True)
    height_cm = Column(Float, nullable=True)
    side_preference = Column(Enum(BoatSidePreference), nullable=True)
    avatar_url = Column(String(512), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    club = relationship("Club", back_populates="users")
    performances = relationship("PerformanceEntry", foreign_keys="[PerformanceEntry.athlete_id]", back_populates="athlete")
    verified_performances = relationship("PerformanceEntry", foreign_keys="[PerformanceEntry.verified_by_trainer_id]", back_populates="verified_by_trainer")
    onboarding_progress = relationship("OnboardingProgress", back_populates="user", cascade="all, delete-orphan")
    notifications = relationship("Notification", back_populates="user", cascade="all, delete-orphan")
    schedule_assignments = relationship(
        "ScheduleAssignment",
        foreign_keys="[ScheduleAssignment.user_id]",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    availability_entries = relationship(
        "UserAvailability",
        foreign_keys="[UserAvailability.user_id]",
        back_populates="user",
        cascade="all, delete-orphan",
    )

class ClubJoinRequest(Base):
    __tablename__ = "club_join_requests"
    __table_args__ = (UniqueConstraint("club_id", "email", name="uq_club_join_request_email"),)

    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=False, index=True)
    email = Column(String(255), nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    weight_kg = Column(Float, nullable=True)
    height_cm = Column(Float, nullable=True)
    side_preference = Column(Enum(BoatSidePreference), nullable=True)
    status = Column(String(32), default="pending", nullable=False, index=True)
    reviewed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    review_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    club = relationship("Club", back_populates="join_requests")
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_id])

class ClubInvitation(Base):
    __tablename__ = "club_invitations"

    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=False, index=True)
    email = Column(String(255), nullable=False, index=True)
    role = Column(Enum(UserRole), nullable=False)
    token_hash = Column(String(64), unique=True, nullable=False, index=True)
    invited_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    accepted_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    club = relationship("Club", back_populates="invitations")
    invited_by = relationship("User", foreign_keys=[invited_by_id])

class Competition(Base):
    __tablename__ = "competitions"

    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=False)
    name = Column(String(255), nullable=False)
    location = Column(String(255), nullable=True)
    competition_type = Column(String(64), default="sprint_regatta")
    start_date = Column(DateTime, nullable=False)
    end_date = Column(DateTime, nullable=False)
    target_distance_m = Column(Integer, nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    club = relationship("Club", back_populates="competitions")
    schedules = relationship("Schedule", back_populates="competition")

class Equipment(Base):
    __tablename__ = "equipment"

    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=False)
    name = Column(String(255), nullable=False)
    category = Column(Enum(EquipmentCategory), default=EquipmentCategory.CONCEPT2_ROWERG, nullable=False)
    boat_weight_class = Column(String(64), nullable=True)  # e.g., "75-85kg Midweight"
    serial_number = Column(String(128), nullable=True)
    status = Column(String(64), default="available")  # available, maintenance, in_use
    notes = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    club = relationship("Club", back_populates="equipments")
    exercises = relationship("Exercise", back_populates="equipment")

class Exercise(Base):
    __tablename__ = "exercises"

    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=False)
    equipment_id = Column(Integer, ForeignKey("equipment.id"), nullable=True)
    name = Column(String(255), nullable=False)
    category = Column(Enum(ExerciseCategory), default=ExerciseCategory.ERG_INTERVALS, nullable=False)
    description = Column(Text, nullable=True)
    primary_metric = Column(String(64), default="split_500m") # split_500m, time_seconds, distance_meters, watts, reps_weight
    default_distance_m = Column(Integer, nullable=True)
    default_duration_sec = Column(Integer, nullable=True)
    default_target_split = Column(String(32), nullable=True) # e.g. "1:45.0"
    default_stroke_rate = Column(Integer, nullable=True) # e.g. 28 spm
    target_heart_rate_zone = Column(String(32), nullable=True) # UT2, UT1, AT, TR, AN
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    club = relationship("Club", back_populates="exercises")
    equipment = relationship("Equipment", back_populates="exercises")
    session_exercises = relationship("SessionExercise", back_populates="exercise")
    performances = relationship("PerformanceEntry", back_populates="exercise")

class Schedule(Base):
    __tablename__ = "schedules"

    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=False)
    competition_id = Column(Integer, ForeignKey("competitions.id"), nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    taxonomy_node_id = Column(Integer, ForeignKey("taxonomy_nodes.id"), nullable=True)
    taxonomy_path_snapshot = Column(String(512), nullable=True)
    taxonomy_node_name = Column(String(255), nullable=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    season = Column(String(64), nullable=True)
    phase = Column(Enum(SchedulePhase), default=SchedulePhase.BASE_ENDURANCE)
    start_date = Column(DateTime, nullable=False)
    end_date = Column(DateTime, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    club = relationship("Club", back_populates="schedules")
    competition = relationship("Competition", back_populates="schedules")
    taxonomy_node = relationship("TaxonomyNode", back_populates="schedules")
    sessions = relationship("TrainingSession", back_populates="schedule", cascade="all, delete-orphan")
    assignments = relationship("ScheduleAssignment", back_populates="schedule", cascade="all, delete-orphan")

class ScheduleAssignment(Base):
    __tablename__ = "schedule_assignments"
    __table_args__ = (
        UniqueConstraint("schedule_id", "user_id", name="uq_schedule_assignment_user"),
    )

    id = Column(Integer, primary_key=True, index=True)
    schedule_id = Column(Integer, ForeignKey("schedules.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    assignment_type = Column(String(32), nullable=False)
    assigned_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    schedule = relationship("Schedule", back_populates="assignments")
    user = relationship("User", foreign_keys=[user_id], back_populates="schedule_assignments")
    assigned_by = relationship("User", foreign_keys=[assigned_by_id])

class UserAvailability(Base):
    __tablename__ = "user_availability"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    starts_at = Column(DateTime, nullable=False, index=True)
    ends_at = Column(DateTime, nullable=False, index=True)
    status = Column(Enum(AvailabilityStatus), default=AvailabilityStatus.UNAVAILABLE, nullable=False)
    reason_category = Column(String(64), nullable=True)
    coach_visible_notes = Column(Text, nullable=True)
    private_notes = Column(Text, nullable=True)
    is_safety_restriction = Column(Boolean, default=False, nullable=False)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    user = relationship("User", foreign_keys=[user_id], back_populates="availability_entries")
    created_by = relationship("User", foreign_keys=[created_by_id])

class TrainingSession(Base):
    __tablename__ = "training_sessions"

    id = Column(Integer, primary_key=True, index=True)
    schedule_id = Column(Integer, ForeignKey("schedules.id"), nullable=False)
    trainer_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    taxonomy_node_id = Column(Integer, ForeignKey("taxonomy_nodes.id"), nullable=True)
    taxonomy_path_snapshot = Column(String(512), nullable=True)
    title = Column(String(255), nullable=False)
    day_of_week = Column(Integer, default=0) # 0=Mon, 6=Sun
    session_date = Column(DateTime, nullable=False)
    duration_minutes = Column(Integer, default=60, nullable=False)
    session_type = Column(String(64), default="indoor_erg") # water_rowing, indoor_erg, strength_gym, recovery
    location = Column(String(255), nullable=True)
    instructions = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    schedule = relationship("Schedule", back_populates="sessions")
    taxonomy_node = relationship("TaxonomyNode")
    exercises = relationship("SessionExercise", back_populates="session", cascade="all, delete-orphan")
    performances = relationship("PerformanceEntry", back_populates="session")

class SessionExercise(Base):
    __tablename__ = "session_exercises"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("training_sessions.id"), nullable=False)
    exercise_id = Column(Integer, ForeignKey("exercises.id"), nullable=False)
    order_index = Column(Integer, default=0)
    sets = Column(Integer, default=1)
    target_reps = Column(Integer, nullable=True)
    target_distance_m = Column(Integer, nullable=True)
    target_duration_sec = Column(Integer, nullable=True)
    target_split_seconds = Column(Float, nullable=True)
    target_watts = Column(Float, nullable=True)
    target_heart_rate_zone = Column(String(32), nullable=True)
    target_rpe = Column(Integer, nullable=True)
    target_weight_kg = Column(Float, nullable=True)
    target_reps_or_distance = Column(String(64), nullable=True) # e.g. "4 x 1000m" or "3 x 20 reps"
    target_intensity_split = Column(String(32), nullable=True) # e.g. "1:42.0"
    target_stroke_rate = Column(Integer, nullable=True) # e.g. 30 spm
    rest_interval_sec = Column(Integer, default=120)
    notes = Column(Text, nullable=True)

    session = relationship("TrainingSession", back_populates="exercises")
    exercise = relationship("Exercise", back_populates="session_exercises")

class PerformanceEntry(Base):
    __tablename__ = "performance_entries"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("training_sessions.id"), nullable=True)
    exercise_id = Column(Integer, ForeignKey("exercises.id"), nullable=False)
    athlete_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    recorded_date = Column(DateTime, default=datetime.utcnow)
    
    # Core Rowing Metrics
    actual_distance_m = Column(Integer, nullable=True)
    actual_duration_sec = Column(Float, nullable=True)
    actual_reps = Column(Integer, nullable=True)
    actual_weight_kg = Column(Float, nullable=True)
    avg_split_seconds = Column(Float, nullable=True) # in seconds per 500m (e.g. 100.0 = 1:40.0)
    avg_stroke_rate = Column(Float, nullable=True) # spm
    avg_watts = Column(Float, nullable=True)
    avg_heart_rate = Column(Integer, nullable=True)
    max_heart_rate = Column(Integer, nullable=True)
    perceived_exertion_rpe = Column(Integer, nullable=True) # 1 to 10
    drag_factor = Column(Integer, nullable=True) # Concept2 damper drag factor
    stroke_seat_position = Column(String(32), nullable=True) # Bow, 2, 3, 4, Stroke, Cox
    boat_lineup = Column(String(255), nullable=True)
    athlete_notes = Column(Text, nullable=True)

    # Verification by Trainer
    is_verified = Column(Boolean, default=False)
    verified_by_trainer_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    verified_at = Column(DateTime, nullable=True)
    trainer_feedback = Column(Text, nullable=True)
    trainer_rating = Column(Integer, nullable=True) # 1-5 stars

    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("TrainingSession", back_populates="performances")
    exercise = relationship("Exercise", back_populates="performances")
    athlete = relationship("User", foreign_keys=[athlete_id], back_populates="performances")
    verified_by_trainer = relationship("User", foreign_keys=[verified_by_trainer_id], back_populates="verified_performances")

class OnboardingProgress(Base):
    __tablename__ = "onboarding_progress"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    tour_id = Column(String(64), nullable=False) # e.g. "athlete_quickstart", "coach_schedule_builder", "trainer_verify"
    current_step = Column(Integer, default=0)
    is_completed = Column(Boolean, default=False)
    dismissed = Column(Boolean, default=False)
    last_updated = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="onboarding_progress")

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=False)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    type = Column(String(64), default="announcement", nullable=False)
    link_action = Column(String(255), nullable=True)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="notifications")
    club = relationship("Club", back_populates="notifications")

class BoathouseCondition(Base):
    __tablename__ = "boathouse_conditions"

    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), unique=True, nullable=False)
    flag_status = Column(Enum(SafetyFlagStatus), default=SafetyFlagStatus.GREEN, nullable=False)
    wind_speed_knots = Column(Float, default=8.0)
    wind_direction = Column(String(64), default="NW Headwind 8 kts")
    water_temp_c = Column(Float, default=14.5)
    air_temp_c = Column(Float, default=17.0)
    stream_flow_rate = Column(String(128), default="Moderate Stream (1.2 m/s)")
    safety_notes = Column(Text, default="River clear. Normal traffic patterns apply. Stay on the starboard side.")
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    club = relationship("Club", back_populates="boathouse_condition")
    updated_by = relationship("User")
