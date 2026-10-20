import { 
  User, UserRole, Club, ClubPublic, ClubJoinRequest, ClubInvitation, ClubInvitationPreview, Competition, Equipment, Exercise, Schedule, ScheduleAdherence, TrainingSession,
  PerformanceEntry, CoachAnalyticsSummary, TourDefinition, OnboardingProgress,
  NotificationItem, NotificationListResponse, BoathouseCondition,
  TaxonomyNode, TaxonomyNodeTree, TaxonomyNodeCreate, AvailabilityEntry,
  AvailabilityConflict, AvailabilityStatus
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

const formatFieldName = (location: unknown): string => {
  const parts = Array.isArray(location)
    ? location.filter((part) => part !== 'body' && part !== 'query')
    : [];
  const raw = String(parts[parts.length - 1] || 'field');
  const labels: Record<string, string> = {
    full_name: 'Full name',
    email: 'Email address',
    password: 'Password',
    club_code: 'Club code',
    weight_kg: 'Weight',
    height_cm: 'Height',
    side_preference: 'Rowing side',
  };
  return labels[raw] || raw.replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
};

const formatApiError = (detail: unknown, status: number): string => {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const messages = detail.map((issue: any) => {
      const field = formatFieldName(issue?.loc);
      const type = String(issue?.type || '');
      let message = String(issue?.msg || 'Please check this value.').replace(/^Value error,\s*/i, '');
      if (type === 'missing') message = 'This field is required.';
      else if (type.includes('email')) message = 'Enter a valid email address.';
      else if (type === 'string_too_short') {
        const minimum = Number(issue?.ctx?.min_length);
        message = Number.isFinite(minimum) ? `Use at least ${minimum} characters.` : 'This value is too short.';
      }
      return `${field}: ${message}`;
    });
    return messages.join(' ');
  }
  return status === 422
    ? 'Please check the highlighted information and try again.'
    : 'Something went wrong. Please try again.';
};

class ApiService {
  private token: string | null = null;

  constructor() {
    try {
      this.token = localStorage.getItem('rowing_auth_token');
    } catch {
      this.token = null;
    }
  }

  setToken(token: string | null) {
    this.token = token;
    try {
      if (token) localStorage.setItem('rowing_auth_token', token);
      else localStorage.removeItem('rowing_auth_token');
    } catch {
      // Keep the in-memory token when browser storage is unavailable.
    }
  }

  getToken(): string | null {
    return this.token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let errorMsg = `HTTP Error: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.detail) errorMsg = formatApiError(errorData.detail, response.status);
      } catch (e) {
        // use default error message
      }
      throw new Error(errorMsg);
    }

    return response.json();
  }

  // Auth & Club Registration
  async registerClub(data: {
    name: string;
    code: string;
    location?: string;
    description?: string;
    admin_name: string;
    admin_email: string;
    admin_password: string;
  }): Promise<{ access_token: string; token_type: string; user: User }> {
    const res = await this.request<{ access_token: string; token_type: string; user: User }>('/auth/register-club', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    this.setToken(res.access_token);
    return res;
  }

  async login(email: string, password: string): Promise<{ access_token: string; token_type: string; user: User }> {
    const res = await this.request<{ access_token: string; token_type: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setToken(res.access_token);
    return res;
  }


  async getMe(): Promise<User> {
    return this.request<User>('/auth/me');
  }

  // Club & Members
  async getCurrentClub(): Promise<Club> {
    return this.request<Club>('/clubs/current');
  }

  async updateClubSettings(data: { benchmark_2k_split_seconds?: number | null; gold_2k_split_seconds?: number | null; athlete_join_policy?: Club['athlete_join_policy'] }): Promise<Club> {
    return this.request<Club>('/clubs/current/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async getClubMembers(): Promise<User[]> {
    return this.request<User[]>('/clubs/members');
  }

  async addClubMember(data: Partial<User> & { password: string }): Promise<User> {
    return this.request<User>('/clubs/members', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async findClub(code: string): Promise<ClubPublic> {
    return this.request<ClubPublic>(`/membership/clubs/${encodeURIComponent(code.trim())}`);
  }

  async requestClubMembership(data: {
    club_code: string; full_name: string; email: string; password: string;
    weight_kg?: number; height_cm?: number; side_preference?: string;
  }): Promise<ClubJoinRequest> {
    return this.request<ClubJoinRequest>('/membership/join-requests', { method: 'POST', body: JSON.stringify(data) });
  }

  async getJoinRequests(): Promise<ClubJoinRequest[]> {
    return this.request<ClubJoinRequest[]>('/membership/join-requests');
  }

  async approveJoinRequest(id: number, notes?: string): Promise<User> {
    return this.request<User>(`/membership/join-requests/${id}/approve`, { method: 'POST', body: JSON.stringify({ notes }) });
  }

  async rejectJoinRequest(id: number, notes?: string): Promise<ClubJoinRequest> {
    return this.request<ClubJoinRequest>(`/membership/join-requests/${id}/reject`, { method: 'POST', body: JSON.stringify({ notes }) });
  }

  async createClubInvitation(data: { email: string; role: UserRole; expires_days?: number }): Promise<ClubInvitation> {
    return this.request<ClubInvitation>('/membership/invitations', { method: 'POST', body: JSON.stringify(data) });
  }

  async getClubInvitations(): Promise<ClubInvitation[]> {
    return this.request<ClubInvitation[]>('/membership/invitations');
  }

  async revokeClubInvitation(id: number): Promise<{ status: string; id: number }> {
    return this.request<{ status: string; id: number }>(`/membership/invitations/${id}`, { method: 'DELETE' });
  }

  async previewClubInvitation(token: string): Promise<ClubInvitationPreview> {
    return this.request<ClubInvitationPreview>(`/membership/invitations/${encodeURIComponent(token)}`);
  }

  async acceptClubInvitation(data: { token: string; full_name: string; password: string; weight_kg?: number; height_cm?: number; side_preference?: string }): Promise<{ access_token: string; token_type: string; user: User }> {
    const response = await this.request<{ access_token: string; token_type: string; user: User }>('/membership/invitations/accept', { method: 'POST', body: JSON.stringify(data) });
    this.setToken(response.access_token);
    return response;
  }

  // Competitions
  async getCompetitions(): Promise<Competition[]> {
    return this.request<Competition[]>('/competitions');
  }

  async createCompetition(data: Partial<Competition>): Promise<Competition> {
    return this.request<Competition>('/competitions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Equipment
  async getEquipment(): Promise<Equipment[]> {
    return this.request<Equipment[]>('/equipment');
  }

  async createEquipment(data: Partial<Equipment>): Promise<Equipment> {
    return this.request<Equipment>('/equipment', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateEquipment(id: number, data: Partial<Equipment>): Promise<Equipment> {
    return this.request<Equipment>(`/equipment/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  async archiveEquipment(id: number): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/equipment/${id}`, { method: 'DELETE' });
  }

  // Exercises
  async getExercises(): Promise<Exercise[]> {
    return this.request<Exercise[]>('/exercises');
  }

  async createExercise(data: Partial<Exercise>): Promise<Exercise> {
    return this.request<Exercise>('/exercises', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateExercise(id: number, data: Partial<Exercise>): Promise<Exercise> {
    return this.request<Exercise>(`/exercises/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  async archiveExercise(id: number): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/exercises/${id}`, { method: 'DELETE' });
  }

  // Schedules
  async getSchedules(taxonomyNodeId?: number): Promise<Schedule[]> {
    const query = taxonomyNodeId ? `?taxonomy_node_id=${taxonomyNodeId}` : '';
    return this.request<Schedule[]>(`/schedules${query}`);
  }

  async createSchedule(data: any): Promise<Schedule> {
    return this.request<Schedule>('/schedules', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateScheduleAssignments(
    scheduleId: number,
    data: { athlete_ids: number[]; trainer_ids: number[] }
  ): Promise<Schedule> {
    return this.request<Schedule>(`/schedules/${scheduleId}/assignments`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async addScheduleSession(scheduleId: number, data: any): Promise<TrainingSession> {
    return this.request<TrainingSession>(`/schedules/${scheduleId}/sessions`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateScheduleSession(scheduleId: number, sessionId: number, data: any): Promise<TrainingSession> {
    return this.request<TrainingSession>(`/schedules/${scheduleId}/sessions/${sessionId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async getScheduleAdherence(scheduleId: number): Promise<ScheduleAdherence> {
    return this.request<ScheduleAdherence>(`/analytics/schedule-adherence/${scheduleId}`);
  }

  // Member availability and assignment conflicts
  async getAvailability(userId?: number): Promise<AvailabilityEntry[]> {
    const query = userId ? `?user_id=${userId}` : '';
    return this.request<AvailabilityEntry[]>(`/availability${query}`);
  }

  async createAvailability(data: {
    user_id?: number;
    starts_at: string;
    ends_at: string;
    status: AvailabilityStatus;
    reason_category?: string;
    coach_visible_notes?: string;
    private_notes?: string;
    is_safety_restriction?: boolean;
  }): Promise<AvailabilityEntry> {
    return this.request<AvailabilityEntry>('/availability', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteAvailability(entryId: number): Promise<{ status: string; id: number }> {
    return this.request<{ status: string; id: number }>(`/availability/${entryId}`, { method: 'DELETE' });
  }

  async checkAssignmentConflicts(data: {
    user_ids: number[];
    sessions: { starts_at: string; duration_minutes: number }[];
    exclude_schedule_id?: number;
  }): Promise<AvailabilityConflict[]> {
    return this.request<AvailabilityConflict[]>('/availability/conflicts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Taxonomy & Periodization Tree
  async getTaxonomyTree(includeArchived: boolean = false, includeDeleted: boolean = false): Promise<TaxonomyNodeTree[]> {
    return this.request<TaxonomyNodeTree[]>(`/taxonomy/tree?include_archived=${includeArchived}&include_deleted=${includeDeleted}`);
  }

  async getTaxonomyNodes(includeArchived: boolean = false): Promise<TaxonomyNode[]> {
    return this.request<TaxonomyNode[]>(`/taxonomy/nodes?include_archived=${includeArchived}`);
  }

  async createTaxonomyNode(data: TaxonomyNodeCreate): Promise<TaxonomyNode> {
    return this.request<TaxonomyNode>('/taxonomy/nodes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateTaxonomyNode(id: number, data: Partial<TaxonomyNodeCreate>): Promise<TaxonomyNode> {
    return this.request<TaxonomyNode>(`/taxonomy/nodes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async moveTaxonomyNode(id: number, targetParentId?: number | null, displayOrder?: number): Promise<TaxonomyNode> {
    return this.request<TaxonomyNode>(`/taxonomy/nodes/${id}/move`, {
      method: 'POST',
      body: JSON.stringify({ target_parent_id: targetParentId, display_order: displayOrder || 0 }),
    });
  }

  async reorderTaxonomyNodes(items: { id: number; display_order: number }[]): Promise<{ status: string; message: string }> {
    return this.request<{ status: string; message: string }>('/taxonomy/reorder', {
      method: 'POST',
      body: JSON.stringify({ items }),
    });
  }

  async archiveTaxonomyNode(id: number): Promise<TaxonomyNode> {
    return this.request<TaxonomyNode>(`/taxonomy/nodes/${id}/archive`, {
      method: 'POST',
    });
  }

  async restoreTaxonomyNode(id: number): Promise<TaxonomyNode> {
    return this.request<TaxonomyNode>(`/taxonomy/nodes/${id}/restore`, {
      method: 'POST',
    });
  }

  async deleteTaxonomyNode(id: number): Promise<{ status: string; deleted_node_id: number; affected_count: number; message: string }> {
    return this.request<{ status: string; deleted_node_id: number; affected_count: number; message: string }>(`/taxonomy/nodes/${id}`, {
      method: 'DELETE',
    });
  }

  async recoverTaxonomyNode(id: number): Promise<TaxonomyNode> {
    return this.request<TaxonomyNode>(`/taxonomy/nodes/${id}/recover`, {
      method: 'POST',
    });
  }

  // Performance
  async getPerformances(params?: {
    athlete_id?: number;
    session_id?: number;
    verified_only?: boolean;
    unverified_only?: boolean;
  }): Promise<PerformanceEntry[]> {
    const query = new URLSearchParams();
    if (params?.athlete_id) query.append('athlete_id', params.athlete_id.toString());
    if (params?.session_id) query.append('session_id', params.session_id.toString());
    if (params?.verified_only) query.append('verified_only', 'true');
    if (params?.unverified_only) query.append('unverified_only', 'true');
    
    return this.request<PerformanceEntry[]>(`/performance?${query.toString()}`);
  }

  async recordPerformance(data: Partial<PerformanceEntry>): Promise<PerformanceEntry> {
    return this.request<PerformanceEntry>('/performance', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async verifyPerformance(performanceId: number, data: {
    is_verified: boolean;
    trainer_feedback?: string;
    trainer_rating?: number;
  }): Promise<PerformanceEntry> {
    return this.request<PerformanceEntry>(`/performance/${performanceId}/verify`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Analytics
  async getCoachSummary(): Promise<CoachAnalyticsSummary> {
    return this.request<CoachAnalyticsSummary>('/analytics/coach-summary');
  }

  // Onboarding & Tours
  async getTours(): Promise<TourDefinition[]> {
    return this.request<TourDefinition[]>('/onboarding/tours');
  }

  async getOnboardingProgress(): Promise<OnboardingProgress[]> {
    return this.request<OnboardingProgress[]>('/onboarding/progress');
  }

  async updateTourProgress(data: {
    tour_id: string;
    current_step: number;
    is_completed?: boolean;
    dismissed?: boolean;
  }): Promise<OnboardingProgress> {
    return this.request<OnboardingProgress>('/onboarding/progress', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Notifications
  async getNotifications(limit: number = 50): Promise<NotificationListResponse> {
    return this.request<NotificationListResponse>(`/notifications?limit=${limit}`);
  }

  async markNotificationRead(id: number): Promise<NotificationItem> {
    return this.request<NotificationItem>(`/notifications/${id}/read`, {
      method: 'PUT',
    });
  }

  async markAllNotificationsRead(): Promise<{ status: string; message: string }> {
    return this.request<{ status: string; message: string }>('/notifications/mark-all-read', {
      method: 'POST',
    });
  }

  async broadcastAnnouncement(data: {
    title: string;
    message: string;
    type?: string;
    target_role?: string;
  }): Promise<{ status: string; recipients_count: number; message: string }> {
    return this.request<{ status: string; recipients_count: number; message: string }>('/notifications/broadcast', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Boathouse Weather & Water Conditions
  async getBoathouseConditions(): Promise<BoathouseCondition> {
    return this.request<BoathouseCondition>('/weather/boathouse-conditions');
  }

  async updateBoathouseConditions(data: Partial<BoathouseCondition> & { broadcast_alert?: boolean }): Promise<BoathouseCondition> {
    return this.request<BoathouseCondition>('/weather/boathouse-conditions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
}

export const api = new ApiService();
