import React, { useState, useEffect } from 'react';
import { PerformanceEntry, Schedule, TrainingSession } from '../../types';
import { api } from '../../services/api';
import { performanceMetrics, primaryPerformanceValue } from '../../lib/performanceMetrics';
import { 
  CheckSquare, Star, MessageSquare, CheckCircle, CheckCircle2, Clock, Zap, 
  Dumbbell, Activity, Calendar, Send, ShieldCheck, CalendarOff
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { ScheduleCalendar } from '../calendar/ScheduleCalendar';
import { BoathouseWeatherWidget } from '../weather/BoathouseWeatherWidget';
import { AvailabilityModal } from '../availability/AvailabilityModal';

export const TrainerDashboard: React.FC = () => {
  const [pendingPerformances, setPendingPerformances] = useState<PerformanceEntry[]>([]);
  const [verifiedPerformances, setVerifiedPerformances] = useState<PerformanceEntry[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewTab, setViewTab] = useState<'queue' | 'calendar'>('queue');
  const [selectedScheduleId, setSelectedScheduleId] = useState<number | null>(null);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);

  // Verification Form State
  const [selectedPerfId, setSelectedPerfId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string>('Great leg drive rhythm. Keep the catch connection immediate.');
  const [rating, setRating] = useState<number>(5);
  const [verifying, setVerifying] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [pending, verified, scList] = await Promise.all([
        api.getPerformances({ unverified_only: true }),
        api.getPerformances({ verified_only: true }),
        api.getSchedules(),
      ]);
      setPendingPerformances(pending);
      setVerifiedPerformances(verified);
      setSchedules(scList);
    } catch (err) {
      console.warn('Failed loading trainer data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleVerify = async (perfId: number) => {
    setVerifying(true);
    try {
      await api.verifyPerformance(perfId, {
        is_verified: true,
        trainer_feedback: feedback,
        trainer_rating: rating,
      });

      try {
        confetti({
          particleCount: 40,
          spread: 60,
          origin: { y: 0.6 },
        });
      } catch (e) {}

      setSelectedPerfId(null);
      loadData();
    } catch (err: any) {
      alert(`Error verifying performance: ${err.message}`);
    } finally {
      setVerifying(false);
    }
  };

  const activeSchedule = schedules.find((schedule) => schedule.id === selectedScheduleId)
    || schedules.find((schedule) => schedule.is_active)
    || schedules[0];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
      {/* Top Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-emerald-950/80 via-slate-900 to-slate-950 border border-emerald-500/30 p-6 sm:p-8 shadow-xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                <Dumbbell className="w-3.5 h-3.5" /> Trainer Deck & Verification Center
              </span>
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                {pendingPerformances.length} Pending Verifications
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Review, Critique & Verify Athlete Workouts
            </h2>
            <p className="text-sm text-slate-300 max-w-xl mt-1">
              Check erg and water rowing piece splits, stroke rates, and power outputs. Leave technical coaching notes to ensure peak technique.
            </p>
          </div>
        </div>
      </div>

      {/* Live Boathouse Water & Weather Conditions */}
      <BoathouseWeatherWidget userRole="trainer" />

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
        <button
          onClick={() => setViewTab('queue')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
            viewTab === 'queue'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <CheckSquare className="w-4 h-4" /> Verification Queue ({pendingPerformances.length})
        </button>

        <button
          onClick={() => setViewTab('calendar')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
            viewTab === 'calendar'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Calendar className="w-4 h-4" /> Training Session Calendar
        </button>
        <button
          onClick={() => setAvailabilityOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-all"
        >
          <CalendarOff className="w-4 h-4" /> My Availability
        </button>
      </div>

      {viewTab === 'calendar' ? (
        <ScheduleCalendar
          schedules={schedules}
          userRole="trainer"
        />
      ) : (
      /* Main Grid: Pending Verification Queue vs Active Sessions */
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left 7 Cols: Verification Queue */}
        <div id="tour-verification-queue" className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-emerald-400" />
              <h3 className="text-base sm:text-lg font-extrabold text-white">
                Pending Athlete Submissions ({pendingPerformances.length})
              </h3>
            </div>
          </div>

          {pendingPerformances.length === 0 ? (
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-8 text-center space-y-2">
              <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto" />
              <h4 className="text-base font-bold text-white">All Caught Up!</h4>
              <p className="text-xs text-slate-400">
                No pending athlete performances awaiting verification.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingPerformances.map((p) => {
                const isSelected = selectedPerfId === p.id;
                return (
                  <div
                    key={p.id}
                    className="bg-slate-900/95 border border-slate-800 hover:border-emerald-500/50 rounded-2xl p-5 shadow-lg space-y-3.5 transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-sm text-white">
                            {p.athlete_name}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            ({p.athlete_weight_kg ? `${p.athlete_weight_kg}kg` : 'weight not recorded'})
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-slate-300">
                            {p.stroke_seat_position || 'seat not recorded'}
                          </span>
                        </div>
                        <h5 className="text-xs font-bold text-emerald-300 mt-0.5">
                          {p.exercise_name}
                        </h5>
                      </div>

                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                        <Clock className="w-3 h-3" /> Awaiting Review
                      </span>
                    </div>

                    {/* Performance Numbers Matrix */}
                    <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-800/80 bg-slate-950 p-2.5 text-center font-mono sm:grid-cols-4">{performanceMetrics(p).map((metric) => <div key={metric.label}><span className="block text-[9px] uppercase tracking-wider text-slate-500">{metric.label}</span><span className="text-xs font-bold text-white">{metric.value}</span></div>)}</div>

                    {p.athlete_notes && (
                      <p className="text-xs text-slate-300 bg-slate-950/40 p-2 rounded-lg italic">
                        Athlete: "{p.athlete_notes}"
                      </p>
                    )}

                    {/* Verification Form Trigger & Inline Form */}
                    {isSelected ? (
                      <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-3.5 space-y-3 animate-in fade-in duration-150">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                            <MessageSquare className="w-3.5 h-3.5" /> Coaching Feedback & Technical Critique
                          </label>

                          {/* Star rating selector */}
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                type="button"
                                onClick={() => setRating(star)}
                                className="p-0.5 focus:outline-none"
                              >
                                <Star
                                  className={`w-4 h-4 ${
                                    star <= rating
                                      ? 'text-amber-400 fill-amber-400'
                                      : 'text-slate-600'
                                  }`}
                                />
                              </button>
                            ))}
                          </div>
                        </div>

                        <textarea
                          rows={2}
                          value={feedback}
                          onChange={(e) => setFeedback(e.target.value)}
                          placeholder="e.g. Excellent pace management. Focus on keeping the shoulders relaxed at the catch..."
                          className="w-full bg-slate-950 border border-emerald-500/30 rounded-xl p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />

                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedPerfId(null)}
                            className="px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-white"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={verifying}
                            onClick={() => handleVerify(p.id)}
                            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md shadow-emerald-500/20 flex items-center gap-1.5"
                          >
                            {verifying ? 'Verifying...' : 'Approve & Confirm'}
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        id="tour-verify-action-btn"
                        onClick={() => {
                          setSelectedPerfId(p.id);
                          setFeedback('Superb power consistency. Ready for seat race.');
                          setRating(5);
                        }}
                        className="w-full py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-bold border border-emerald-500/30 transition-all flex items-center justify-center gap-1.5"
                      >
                        <CheckSquare className="w-4 h-4" />
                        <span>Verify & Add Feedback</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right 5 Cols: Session Schedule Roster */}
        <div id="tour-session-roster" className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-rowing-400" />
              <h3 className="text-base sm:text-lg font-extrabold text-white">
                Active Training Sessions
              </h3>
            </div>
            {schedules.length > 1 && (
              <select
                value={activeSchedule?.id || ''}
                onChange={(event) => setSelectedScheduleId(Number(event.target.value))}
                className="max-w-48 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] font-semibold text-slate-200"
                aria-label="Choose assigned schedule"
              >
                {schedules.map((schedule) => <option key={schedule.id} value={schedule.id}>{schedule.name}</option>)}
              </select>
            )}
          </div>

          {activeSchedule?.assigned_athletes?.length > 0 && (
            <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-3">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-sky-300">
                Assigned athlete roster ({activeSchedule.assigned_athletes.length})
              </div>
              <div className="flex flex-wrap gap-1.5">
                {activeSchedule.assigned_athletes.map((athlete) => (
                  <span key={athlete.id} className="rounded-lg bg-slate-800 px-2 py-1 text-[10px] font-semibold text-slate-200">
                    {athlete.full_name}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            {activeSchedule?.sessions?.map((sess) => (
              <div 
                key={sess.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-slate-300">
                    {sess.session_type.replace('_', ' ')}
                  </span>
                  {sess.location && (
                    <span className="text-xs text-slate-400 font-mono">
                      📍 {sess.location}
                    </span>
                  )}
                </div>

                <h4 className="text-sm font-bold text-white">
                  {sess.title}
                </h4>

                {sess.instructions && (
                  <p className="text-xs text-slate-300 bg-slate-950/50 p-2 rounded-lg">
                    {sess.instructions}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Historical Verified Items */}
          <div className="pt-4 space-y-3">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Recently Verified Workouts ({verifiedPerformances.length})
            </h4>

            <div className="space-y-2">
              {verifiedPerformances.slice(0, 4).map((vp) => (
                <div key={vp.id} className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 text-xs flex items-center justify-between">
                  <div>
                    <span className="font-bold text-white">{vp.athlete_name}</span>
                    <span className="text-slate-400 block text-[10px]">
                      {vp.exercise_name} • {primaryPerformanceValue(vp)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-amber-400 font-mono font-bold">
                    ⭐ {vp.trainer_rating || 5}/5
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      )}
      <AvailabilityModal
        isOpen={availabilityOpen}
        allowSafetyRestriction
        onClose={() => setAvailabilityOpen(false)}
      />
    </div>
  );
};
