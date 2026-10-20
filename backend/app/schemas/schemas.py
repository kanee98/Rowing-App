from typing import List, Optional, Any, Dict, Literal
from datetime import datetime
from pydantic import BaseModel, EmailStr, Field, ConfigDict
from app.models.models import (
    UserRole, BoatSidePreference, EquipmentCategory, ExerciseCategory, SchedulePhase,
    SafetyFlagStatus, NotificationType, TaxonomyNodeStatus, AvailabilityStatus
)

# Auth schemas
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"

class TokenPayload(BaseModel):
    sub: Optional[str] = None

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str = Field(min_length=1, max_length=255)
    role: UserRole = UserRole.ATHLETE
    club_id: Optional[int] = None
    weight_kg: Optional[float] = None
    height_cm: Optional[float] = None
    side_preference: Optional[BoatSidePreference] = None

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    role: Optional[UserRole] = None
    weight_kg: Optional[float] = None
    height_cm: Optional[float] = None
    side_preference: Optional[BoatSidePreference] = None
    avatar_url: Optional[str] = None
    is_active: Optional[bool] = None

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    club_id: int
    email: str
    full_name: str
    role: UserRole
    weight_kg: Optional[float] = None
    height_cm: Optional[float] = None
    side_preference: Optional[BoatSidePreference] = None
    avatar_url: Optional[str] = None
    is_active: bool
    created_at: datetime
    club_name: Optional[str] = None

# Club & Registration Schemas
class ClubCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    code: str = Field(min_length=2, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    location: Optional[str] = None
    description: Optional[str] = None
    admin_name: str = Field(min_length=1, max_length=255)
    admin_email: EmailStr
    admin_password: str = Field(min_length=8)

class ClubOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    code: str
    location: Optional[str] = None
    description: Optional[str] = None
    logo_url: Optional[str] = None
    benchmark_2k_split_seconds: Optional[float] = None
    gold_2k_split_seconds: Optional[float] = None
    athlete_join_policy: str = "approval_required"
    created_at: datetime

class ClubSettingsUpdate(BaseModel):
    benchmark_2k_split_seconds: Optional[float] = Field(None, gt=0)
    gold_2k_split_seconds: Optional[float] = Field(None, gt=0)
    athlete_join_policy: Optional[Literal["approval_required", "invite_only", "closed"]] = None

class ClubPublicOut(BaseModel):
    id: int
    name: str
    code: str
    location: Optional[str] = None
    athlete_join_policy: str

class ClubJoinRequestCreate(BaseModel):
    club_code: str = Field(min_length=2, max_length=64)
    full_name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(min_length=8)
    weight_kg: Optional[float] = Field(None, gt=0)
    height_cm: Optional[float] = Field(None, gt=0)
    side_preference: Optional[BoatSidePreference] = None

class ClubJoinRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    club_id: int
    full_name: str
    email: str
    weight_kg: Optional[float] = None
    height_cm: Optional[float] = None
    side_preference: Optional[BoatSidePreference] = None
    status: str
    review_notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

class JoinRequestReview(BaseModel):
    notes: Optional[str] = Field(None, max_length=1000)

class ClubInvitationCreate(BaseModel):
    email: EmailStr
    role: UserRole
    expires_days: int = Field(7, ge=1, le=30)

class ClubInvitationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    club_id: int
    email: str
    role: UserRole
    invited_by_id: int
    expires_at: datetime
    accepted_at: Optional[datetime] = None
    revoked_at: Optional[datetime] = None
    created_at: datetime

class ClubInvitationCreated(ClubInvitationOut):
    token: str

class ClubInvitationPreview(BaseModel):
    club_name: str
    club_location: Optional[str] = None
    email: str
    role: UserRole
    expires_at: datetime

class ClubInvitationAccept(BaseModel):
    token: str = Field(min_length=20)
    full_name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=8)
    weight_kg: Optional[float] = Field(None, gt=0)
    height_cm: Optional[float] = Field(None, gt=0)
    side_preference: Optional[BoatSidePreference] = None

# Competition Schemas
class CompetitionCreate(BaseModel):
    name: str
    location: Optional[str] = None
    competition_type: Optional[str] = "sprint_regatta"
    start_date: datetime
    end_date: datetime
    target_distance_m: int = Field(gt=0)
    notes: Optional[str] = None

class CompetitionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    club_id: int
    name: str
    location: Optional[str] = None
    competition_type: str
    start_date: datetime
    end_date: datetime
    target_distance_m: int
    notes: Optional[str] = None
    created_at: datetime

# Equipment Schemas
class EquipmentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    category: EquipmentCategory = EquipmentCategory.CONCEPT2_ROWERG
    boat_weight_class: Optional[str] = None
    serial_number: Optional[str] = None
    status: Literal["available", "in_use", "maintenance", "unavailable"] = "available"
    notes: Optional[str] = None
    is_active: Optional[bool] = True

class EquipmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    club_id: int
    name: str
    category: EquipmentCategory
    boat_weight_class: Optional[str] = None
    serial_number: Optional[str] = None
    status: str
    notes: Optional[str] = None
    is_active: bool
    created_at: datetime

# Exercise Schemas
class ExerciseCreate(BaseModel):
    equipment_id: Optional[int] = None
    name: str = Field(min_length=1, max_length=255)
    category: ExerciseCategory = ExerciseCategory.ERG_INTERVALS
    description: Optional[str] = None
    primary_metric: Literal["split_500m", "time_seconds", "distance_meters", "watts", "reps_weight", "stroke_rate", "heart_rate", "rpe"] = "split_500m"
    default_distance_m: Optional[int] = None
    default_duration_sec: Optional[int] = None
    default_target_split: Optional[str] = Field(None, pattern=r"^\d+:[0-5]\d(?:\.\d)?$")
    default_stroke_rate: Optional[int] = None
    target_heart_rate_zone: Optional[str] = None
    is_active: Optional[bool] = True

class ExerciseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    club_id: int
    equipment_id: Optional[int] = None
    equipment_name: Optional[str] = None
    name: str
    category: ExerciseCategory
    description: Optional[str] = None
    primary_metric: str
    default_distance_m: Optional[int] = None
    default_duration_sec: Optional[int] = None
    default_target_split: Optional[str] = None
    default_stroke_rate: Optional[int] = None
    target_heart_rate_zone: Optional[str] = None
    is_active: bool
    created_at: datetime

# Schedule & Session Schemas
class SessionExerciseCreate(BaseModel):
    exercise_id: int
    order_index: Optional[int] = 0
    sets: Optional[int] = 1
    target_reps: Optional[int] = Field(None, ge=1)
    target_distance_m: Optional[int] = Field(None, ge=1)
    target_duration_sec: Optional[int] = Field(None, ge=1)
    target_split_seconds: Optional[float] = Field(None, gt=0)
    target_watts: Optional[float] = Field(None, gt=0)
    target_heart_rate_zone: Optional[str] = None
    target_rpe: Optional[int] = Field(None, ge=1, le=10)
    target_weight_kg: Optional[float] = Field(None, gt=0)
    target_reps_or_distance: Optional[str] = None
    target_intensity_split: Optional[str] = None
    target_stroke_rate: Optional[int] = None
    rest_interval_sec: Optional[int] = 120
    notes: Optional[str] = None

class SessionExerciseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    exercise_id: int
    exercise_name: Optional[str] = None
    category: Optional[ExerciseCategory] = None
    order_index: int
    sets: int
    target_reps: Optional[int] = None
    target_distance_m: Optional[int] = None
    target_duration_sec: Optional[int] = None
    target_split_seconds: Optional[float] = None
    target_watts: Optional[float] = None
    target_heart_rate_zone: Optional[str] = None
    target_rpe: Optional[int] = None
    target_weight_kg: Optional[float] = None
    target_reps_or_distance: Optional[str] = None
    target_intensity_split: Optional[str] = None
    target_stroke_rate: Optional[int] = None
    rest_interval_sec: int
    notes: Optional[str] = None

class TrainingSessionCreate(BaseModel):
    trainer_id: Optional[int] = None
    taxonomy_node_id: Optional[int] = None
    title: str
    day_of_week: Optional[int] = 0
    session_date: datetime
    duration_minutes: int = Field(60, ge=1, le=1440)
    session_type: Optional[str] = "indoor_erg"
    location: Optional[str] = None
    instructions: Optional[str] = None
    exercises: Optional[List[SessionExerciseCreate]] = []

class TrainingSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    schedule_id: int
    trainer_id: Optional[int] = None
    trainer_name: Optional[str] = None
    taxonomy_node_id: Optional[int] = None
    taxonomy_path_snapshot: Optional[str] = None
    title: str
    day_of_week: int
    session_date: datetime
    duration_minutes: int
    session_type: str
    location: Optional[str] = None
    instructions: Optional[str] = None
    created_at: datetime
    exercises: List[SessionExerciseOut] = []

class ScheduleCreate(BaseModel):
    competition_id: Optional[int] = None
    taxonomy_node_id: Optional[int] = None
    name: str
    description: Optional[str] = None
    season: Optional[str] = None
    phase: Optional[SchedulePhase] = SchedulePhase.BASE_ENDURANCE
    start_date: datetime
    end_date: datetime
    is_active: Optional[bool] = True
    athlete_ids: List[int] = Field(default_factory=list)
    trainer_ids: List[int] = Field(default_factory=list)
    sessions: List[TrainingSessionCreate] = Field(default_factory=list)

class ScheduleAssignmentUpdate(BaseModel):
    athlete_ids: List[int] = Field(default_factory=list)
    trainer_ids: List[int] = Field(default_factory=list)

class ScheduleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    club_id: int
    competition_id: Optional[int] = None
    competition_name: Optional[str] = None
    created_by_id: int
    created_by_name: Optional[str] = None
    taxonomy_node_id: Optional[int] = None
    taxonomy_path_snapshot: Optional[str] = None
    taxonomy_node_name: Optional[str] = None
    name: str
    description: Optional[str] = None
    season: Optional[str] = None
    phase: SchedulePhase
    start_date: datetime
    end_date: datetime
    is_active: bool
    created_at: datetime
    athlete_ids: List[int] = []
    trainer_ids: List[int] = []
    assigned_athletes: List[UserOut] = []
    assigned_trainers: List[UserOut] = []
    sessions: List[TrainingSessionOut] = []

# Availability and assignment conflict schemas
class AvailabilityCreate(BaseModel):
    user_id: Optional[int] = None
    starts_at: datetime
    ends_at: datetime
    status: AvailabilityStatus = AvailabilityStatus.UNAVAILABLE
    reason_category: Optional[str] = None
    coach_visible_notes: Optional[str] = None
    private_notes: Optional[str] = None
    is_safety_restriction: bool = False

class AvailabilityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    user_name: Optional[str] = None
    starts_at: datetime
    ends_at: datetime
    status: AvailabilityStatus
    reason_category: Optional[str] = None
    coach_visible_notes: Optional[str] = None
    private_notes: Optional[str] = None
    is_safety_restriction: bool
    created_by_id: int
    source: str = "self"
    created_at: datetime
    updated_at: datetime

class AvailabilitySessionCheck(BaseModel):
    starts_at: datetime
    duration_minutes: int = Field(60, ge=1, le=1440)

class AvailabilityConflictRequest(BaseModel):
    user_ids: List[int]
    sessions: List[AvailabilitySessionCheck]
    exclude_schedule_id: Optional[int] = None

class AvailabilityConflictItem(BaseModel):
    user_id: int
    status: str
    same_day_sessions: int = 0
    daily_load_minutes: int = 0
    conflict_titles: List[str] = []
    messages: List[str] = []
    has_safety_restriction: bool = False

# Performance Entry Schemas
class PerformanceEntryCreate(BaseModel):
    session_id: Optional[int] = None
    exercise_id: int
    schedule_id: Optional[int] = None
    recorded_date: Optional[datetime] = None
    actual_distance_m: Optional[int] = Field(None, gt=0)
    actual_duration_sec: Optional[float] = Field(None, gt=0)
    actual_reps: Optional[int] = Field(None, ge=1)
    actual_weight_kg: Optional[float] = Field(None, gt=0)
    avg_split_seconds: Optional[float] = Field(None, gt=0)
    avg_stroke_rate: Optional[float] = Field(None, gt=0, le=100)
    avg_watts: Optional[float] = Field(None, gt=0)
    avg_heart_rate: Optional[int] = Field(None, ge=20, le=250)
    max_heart_rate: Optional[int] = Field(None, ge=20, le=250)
    perceived_exertion_rpe: Optional[int] = Field(None, ge=1, le=10)
    drag_factor: Optional[int] = Field(None, gt=0, le=300)
    stroke_seat_position: Optional[str] = None
    boat_lineup: Optional[str] = None
    athlete_notes: Optional[str] = None

class PerformanceVerify(BaseModel):
    is_verified: bool = True
    trainer_feedback: Optional[str] = None
    trainer_rating: Optional[int] = Field(None, ge=1, le=5)

class PerformanceEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_id: Optional[int] = None
    session_title: Optional[str] = None
    exercise_id: int
    exercise_name: Optional[str] = None
    category: Optional[ExerciseCategory] = None
    athlete_id: int
    athlete_name: Optional[str] = None
    athlete_weight_kg: Optional[float] = None
    recorded_date: datetime
    actual_distance_m: Optional[int] = None
    actual_duration_sec: Optional[float] = None
    actual_reps: Optional[int] = None
    actual_weight_kg: Optional[float] = None
    avg_split_seconds: Optional[float] = None
    avg_split_formatted: Optional[str] = None
    avg_stroke_rate: Optional[float] = None
    avg_watts: Optional[float] = None
    avg_heart_rate: Optional[int] = None
    max_heart_rate: Optional[int] = None
    perceived_exertion_rpe: Optional[int] = None
    drag_factor: Optional[int] = None
    stroke_seat_position: Optional[str] = None
    boat_lineup: Optional[str] = None
    athlete_notes: Optional[str] = None
    is_verified: bool
    verified_by_trainer_id: Optional[int] = None
    verified_by_trainer_name: Optional[str] = None
    verified_at: Optional[datetime] = None
    trainer_feedback: Optional[str] = None
    trainer_rating: Optional[int] = None
    created_at: datetime

# Onboarding and Tour Schemas
class TourStep(BaseModel):
    target: str
    title: str
    content: str
    placement: Optional[str] = "bottom"
    role: Optional[str] = None

class TourDefinition(BaseModel):
    tour_id: str
    name: str
    role: UserRole
    description: str
    steps: List[TourStep]

class OnboardingProgressUpdate(BaseModel):
    tour_id: str
    current_step: int
    is_completed: bool = False
    dismissed: bool = False

class OnboardingProgressOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    tour_id: str
    current_step: int
    is_completed: bool
    dismissed: bool
    last_updated: datetime

# Analytics & Comparison Schemas
class AthleteRankingItem(BaseModel):
    athlete_id: int
    athlete_name: str
    weight_kg: Optional[float] = None
    side_preference: Optional[str] = None
    total_sessions_completed: int
    best_2k_split: Optional[str] = None
    best_2k_time_sec: Optional[float] = None
    best_2k_watts: Optional[float] = None
    watts_per_kg_2k: Optional[float] = None
    best_5k_split: Optional[str] = None
    best_5k_time_sec: Optional[float] = None
    avg_verified_rating: Optional[float] = None
    overall_readiness_score: Optional[float] = None
    rank: int

class ExerciseBenchmarkItem(BaseModel):
    exercise_id: int
    exercise_name: str
    total_entries: int
    top_performer_name: Optional[str] = None
    top_performer_value: Optional[str] = None
    club_avg_value: Optional[str] = None

class CoachAnalyticsSummary(BaseModel):
    total_athletes: int
    total_trainers: int
    total_workouts_logged: int
    verified_percentage: float
    active_schedules_count: int
    target_competitions_count: int
    athlete_rankings: List[AthleteRankingItem]
    exercise_benchmarks: List[ExerciseBenchmarkItem]

# Notifications Schemas
class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    club_id: int
    title: str
    message: str
    type: str
    link_action: Optional[str] = None
    is_read: bool
    created_at: datetime

class NotificationListResponse(BaseModel):
    items: List[NotificationOut]
    unread_count: int

class NotificationBroadcastRequest(BaseModel):
    title: str
    message: str
    type: str = "announcement"
    target_role: Optional[UserRole] = None # None means entire club

# Boathouse Weather & Safety Conditions Schemas
class BoathouseConditionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    club_id: int
    flag_status: SafetyFlagStatus
    wind_speed_knots: float
    wind_direction: str
    water_temp_c: float
    air_temp_c: float
    stream_flow_rate: str
    safety_notes: str
    updated_by_id: Optional[int] = None
    updated_at: datetime

class BoathouseConditionUpdate(BaseModel):
    flag_status: Optional[SafetyFlagStatus] = None
    wind_speed_knots: Optional[float] = None
    wind_direction: Optional[str] = None
    water_temp_c: Optional[float] = None
    air_temp_c: Optional[float] = None
    stream_flow_rate: Optional[str] = None
    safety_notes: Optional[str] = None
    broadcast_alert: Optional[bool] = False

# Taxonomy Node Schemas
class TaxonomyNodeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    club_id: int
    parent_id: Optional[int] = None
    name: str
    description: Optional[str] = None
    display_order: int
    status: TaxonomyNodeStatus
    created_by_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    archived_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None
    full_path: Optional[str] = None
    depth: Optional[int] = 0

class TaxonomyNodeTree(BaseModel):
    id: int
    club_id: int
    parent_id: Optional[int] = None
    name: str
    description: Optional[str] = None
    display_order: int
    status: TaxonomyNodeStatus
    full_path: str
    depth: int
    children: List["TaxonomyNodeTree"] = []

class TaxonomyNodeCreate(BaseModel):
    name: str
    parent_id: Optional[int] = None
    description: Optional[str] = None
    display_order: Optional[int] = 0

class TaxonomyNodeUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    display_order: Optional[int] = None

class TaxonomyNodeMove(BaseModel):
    target_parent_id: Optional[int] = None # None means make it a root node
    display_order: Optional[int] = 0

class TaxonomyReorderItem(BaseModel):
    id: int
    display_order: int

class TaxonomyReorderRequest(BaseModel):
    items: List[TaxonomyReorderItem]
