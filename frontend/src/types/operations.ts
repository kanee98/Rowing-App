export interface ClubSession {
  id: number; schedule_id: number; title: string; session_date: string;
  duration_minutes: number; status: 'scheduled' | 'cancelled' | 'completed';
  change_reason?: string; location?: string;
}
export interface AttendanceRow { user_id: number; name: string; rsvp: string; checkin: string | null; note?: string; }
export interface SavedCrew { id: number; name: string; equipment_id: number; seats: Record<string, number>; seat_names?: Record<string, string>; }
export interface BoatReservation { id: number; equipment_id: number; equipment_name: string; crew_id: number; crew_name: string; session_id?: number; starts_at: string; ends_at: string; status: string; }
export interface DamageRecord { id: number; equipment_id: number; description: string; severity: string; created_at: string; resolved_at?: string; resolution?: string; }
export interface OutingRecord { id: number; reservation_id: number; launched_at: string; expected_return_at: string; returned_at?: string; notes?: string; }
export interface EmailDelivery { email_configured: boolean; messages: { id: number; recipient: string; subject: string; status: string; attempts: number; last_error?: string; created_at: string; sent_at?: string }[]; }
