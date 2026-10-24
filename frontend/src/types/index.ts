export type UserRole = 'admin' | 'coach' | 'trainer' | 'athlete';
export type BoatSidePreference = 'port' | 'starboard' | 'both' | 'scull';
export type EquipmentCategory = 
  | '1x_single_scull'
  | '2x_double_scull'
  | '2-_pair'
  | '4-_four'
  | '4+_coxed_four'
  | '8+_eight'
  | 'concept2_rowerg'
  | 'concept2_bikeerg'
  | 'concept2_skierg'
  | 'gym_weights'
  | 'other';

export type ExerciseCategory = 
  | 'erg_test'
  | 'water_endurance'
  | 'water_intervals'
  | 'erg_intervals'
  | 'strength_conditioning'
  | 'technique'
  | 'cross_training';

export type SchedulePhase = 'base_endurance' | 'strength_build' | 'race_pace_peak' | 'taper_recovery';

export interface User {
  id: number;
  club_id: number;
  email: string;
  full_name: string;
  role: UserRole;
  weight_kg?: number;
  height_cm?: number;
  side_preference?: BoatSidePreference;
  avatar_url?: string;
  is_active: boolean;
  created_at: string;
  club_name?: string;
}

export interface Club {
  id: number;
  name: string;
  code: string;
  location?: string;
  description?: string;
  logo_url?: string;
  benchmark_2k_split_seconds?: number;
  gold_2k_split_seconds?: number;
  athlete_join_policy: 'approval_required' | 'invite_only' | 'closed';
  created_at: string;
}

export interface ClubPublic {
  id: number;
  name: string;
  code: string;
  location?: string;
  athlete_join_policy: 'approval_required' | 'invite_only' | 'closed';
}

export interface ClubJoinRequest {
  id: number;
  club_id: number;
  full_name: string;
  email: string;
  weight_kg?: number;
  height_cm?: number;
  side_preference?: BoatSidePreference;
  status: 'pending' | 'approved' | 'rejected';
  review_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface ClubInvitation {
  id: number;
  club_id: number;
  email: string;
  role: UserRole;
  invited_by_id: number;
  expires_at: string;
  accepted_at?: string;
  revoked_at?: string;
  created_at: string;
  token?: string;
  email_queued?: boolean;
}

export interface ClubInvitationPreview {
  club_name: string;
  club_location?: string;
  email: string;
  role: UserRole;
  expires_at: string;
}

export interface Competition {
  id: number;
  club_id: number;
  name: string;
  location?: string;
  competition_type: string;
  start_date: string;
  end_date: string;
  target_distance_m: number;
  notes?: string;
  created_at: string;
}

export interface Equipment {
  id: number;
  club_id: number;
  name: string;
  category: EquipmentCategory;
  boat_weight_class?: string;
  serial_number?: string;
  status: string;
  notes?: string;
  is_active: boolean;
  created_at: string;
}

export interface Exercise {
  id: number;
  club_id: number;
  equipment_id?: number;
  equipment_name?: string;
  name: string;
  category: ExerciseCategory;
  description?: string;
  primary_metric: string;
  default_distance_m?: number;
  default_duration_sec?: number;
  default_target_split?: string;
  default_stroke_rate?: number;
  target_heart_rate_zone?: string;
  is_active: boolean;
  created_at: string;
}

export interface SessionExercise {
  id: number;
  exercise_id: number;
  exercise_name?: string;
  category?: ExerciseCategory;
  order_index: number;
  sets: number;
  target_reps?: number;
  target_distance_m?: number;
  target_duration_sec?: number;
  target_split_seconds?: number;
  target_watts?: number;
  target_heart_rate_zone?: string;
  target_rpe?: number;
  target_weight_kg?: number;
  target_reps_or_distance?: string;
  target_intensity_split?: string;
  target_stroke_rate?: number;
  rest_interval_sec: number;
  notes?: string;
}

export interface TrainingSession {
  status: 'scheduled' | 'cancelled' | 'completed';
  change_reason?: string;
  id: number;
  schedule_id: number;
  trainer_id?: number;
  trainer_name?: string;
  taxonomy_node_id?: number;
  taxonomy_path_snapshot?: string;
  title: string;
  day_of_week: number;
  session_date: string;
  duration_minutes: number;
  session_type: string;
  location?: string;
  instructions?: string;
  created_at: string;
  exercises: SessionExercise[];
}

export type AvailabilityStatus = 'available' | 'limited' | 'unavailable';

export interface AvailabilityEntry {
  id: number;
  user_id: number;
  user_name?: string;
  starts_at: string;
  ends_at: string;
  status: AvailabilityStatus;
  reason_category?: string;
  coach_visible_notes?: string;
  private_notes?: string;
  is_safety_restriction: boolean;
  created_by_id: number;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface AvailabilityConflict {
  user_id: number;
  status: 'available' | 'scheduled' | 'high_load' | 'limited' | 'time_conflict' | 'unavailable' | 'safety_restriction';
  same_day_sessions: number;
  daily_load_minutes: number;
  conflict_titles: string[];
  messages: string[];
  has_safety_restriction: boolean;
}

export interface Schedule {
  id: number;
  club_id: number;
  competition_id?: number;
  competition_name?: string;
  created_by_id: number;
  created_by_name?: string;
  taxonomy_node_id?: number;
  taxonomy_path_snapshot?: string;
  taxonomy_node_name?: string;
  name: string;
  description?: string;
  season?: string;
  phase: SchedulePhase;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: string;
  athlete_ids: number[];
  trainer_ids: number[];
  assigned_athletes: User[];
  assigned_trainers: User[];
  sessions: TrainingSession[];
}

export interface ScheduleAdherence {
  schedule_id: number;
  assigned_athletes: number;
  expected_logs: number;
  completed_logs: number;
  completion_percentage: number;
  target_achievement_percentage?: number;
  sessions: Array<{
    session_id: number;
    title: string;
    session_date: string;
    is_due: boolean;
    expected_logs: number;
    completed_logs: number;
    completion_percentage: number;
    target_achievement_percentage?: number;
  }>;
}

export interface PerformanceEntry {
  id: number;
  session_id?: number;
  session_title?: string;
  exercise_id: number;
  exercise_name?: string;
  category?: ExerciseCategory;
  athlete_id: number;
  athlete_name?: string;
  athlete_weight_kg?: number;
  recorded_date: string;
  actual_distance_m?: number;
  actual_duration_sec?: number;
  actual_reps?: number;
  actual_weight_kg?: number;
  avg_split_seconds?: number;
  avg_split_formatted?: string;
  avg_stroke_rate?: number;
  avg_watts?: number;
  avg_heart_rate?: number;
  max_heart_rate?: number;
  perceived_exertion_rpe?: number;
  drag_factor?: number;
  stroke_seat_position?: string;
  boat_lineup?: string;
  athlete_notes?: string;
  is_verified: boolean;
  verified_by_trainer_id?: number;
  verified_by_trainer_name?: string;
  verified_at?: string;
  trainer_feedback?: string;
  trainer_rating?: number;
  created_at: string;
}

export interface AthleteRankingItem {
  athlete_id: number;
  athlete_name: string;
  weight_kg?: number;
  side_preference?: string;
  total_sessions_completed: number;
  best_2k_split?: string;
  best_2k_time_sec?: number;
  best_2k_watts?: number;
  watts_per_kg_2k?: number;
  best_5k_split?: string;
  best_5k_time_sec?: number;
  avg_verified_rating?: number;
  overall_readiness_score?: number;
  rank: number | null;
  best_2k_recorded_at?: string | null;
  best_5k_recorded_at?: string | null;
}

export interface ExerciseBenchmarkItem {
  exercise_id: number;
  exercise_name: string;
  total_entries: number;
  top_performer_name?: string;
  top_performer_value?: string;
  club_avg_value?: string;
}

export interface CoachAnalyticsSummary {
  window_days: number;
  as_of: string;
  benchmark_definition: string;
  total_athletes: number;
  total_trainers: number;
  total_workouts_logged: number;
  verified_percentage: number;
  active_schedules_count: number;
  target_competitions_count: number;
  athlete_rankings: AthleteRankingItem[];
  exercise_benchmarks: ExerciseBenchmarkItem[];
}

export interface TourStep {
  target: string;
  title: string;
  content: string;
  placement?: string;
  role?: string;
}

export interface TourDefinition {
  tour_id: string;
  name: string;
  role: UserRole;
  description: string;
  steps: TourStep[];
}

export interface OnboardingProgress {
  tour_id: string;
  current_step: number;
  is_completed: boolean;
  dismissed: boolean;
  last_updated: string;
}

export type SafetyFlagStatus = 'green' | 'amber' | 'red';

export interface NotificationItem {
  id: number;
  user_id: number;
  club_id: number;
  title: string;
  message: string;
  type: 'schedule_assigned' | 'performance_logged' | 'verification_completed' | 'weather_alert' | 'announcement' | string;
  link_action?: string;
  is_read: boolean;
  created_at: string;
}

export interface NotificationListResponse {
  items: NotificationItem[];
  unread_count: number;
}

export interface BoathouseCondition {
  id?: number | null;
  club_id: number;
  report_status: 'not_reported' | 'current' | 'outdated';
  report_source?: string | null;
  flag_status?: SafetyFlagStatus | null;
  wind_speed_knots?: number | null;
  wind_direction?: string | null;
  water_temp_c?: number | null;
  air_temp_c?: number | null;
  stream_flow_rate?: string | null;
  safety_notes?: string | null;
  updated_by_id?: number;
  updated_at?: string | null;
  valid_until?: string | null;
}

export type TaxonomyNodeStatus = 'active' | 'archived' | 'soft_deleted';

export interface TaxonomyNode {
  id: number;
  club_id: number;
  parent_id?: number;
  name: string;
  description?: string;
  display_order: number;
  status: TaxonomyNodeStatus;
  created_by_id?: number;
  created_at: string;
  updated_at: string;
  archived_at?: string;
  deleted_at?: string;
  full_path?: string;
  depth?: number;
}

export interface TaxonomyNodeTree {
  id: number;
  club_id: number;
  parent_id?: number;
  name: string;
  description?: string;
  display_order: number;
  status: TaxonomyNodeStatus;
  full_path: string;
  depth: number;
  children: TaxonomyNodeTree[];
}

export interface TaxonomyNodeCreate {
  name: string;
  parent_id?: number;
  description?: string;
  display_order?: number;
}
