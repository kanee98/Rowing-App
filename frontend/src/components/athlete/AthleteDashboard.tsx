import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Schedule, TrainingSession, Exercise, PerformanceEntry, AthleteRankingItem } from '../../types';
import { utcDate } from '../../lib/dateTime';
import { api } from '../../services/api';
import { performanceMetrics } from '../../lib/performanceMetrics';
import { 
  Trophy, Calendar, PlusCircle, CheckCircle, Clock, Zap, Activity, 
  ChevronRight, Sparkles, MessageSquare, Star, Award, Dumbbell, Waves, CalendarOff
} from 'lucide-react';
import { LogPerformanceModal } from '../performance/LogPerformanceModal';
import { ScheduleCalendar } from '../calendar/ScheduleCalendar';
import { BoathouseWeatherWidget } from '../weather/BoathouseWeatherWidget';
import { AvailabilityModal } from '../availability/AvailabilityModal';
import { useDashboardTab, useNavigation, useNavigationScroll } from '../../context/NavigationContext';

export const AthleteDashboard: React.FC = () => {
  const { user } = useAuth();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [performances, setPerformances] = useState<PerformanceEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [viewTab, setViewTab] = useDashboardTab(['today', 'calendar', 'history', 'conditions'] as const, 'today');
  const { destination, navigate } = useNavigation();
  const [benchmark, setBenchmark] = useState<AthleteRankingItem | null>(null);
  useNavigationScroll(viewTab === 'conditions' ? 'boathouse-conditions' : viewTab === 'history' ? destination.target ? `performance-${destination.target}` : 'tour-verification-status' : destination.target ? 'tour-schedule-calendar' : 'athlete-navigation', !loading && (viewTab !== 'history' || !destination.target || performances.some((item) => item.id === destination.target)));
  useEffect(() => { if (destination.view === 'today' && destination.target) setSelectedScheduleId(destination.target); }, [destination.revision]);
  const [selectedScheduleId, setSelectedScheduleId] = useState<number | null>(null);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);

  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [selectedSessionForLog, setSelectedSessionForLog] = useState<TrainingSession | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [scList, exList, perfList, benchmarkData] = await Promise.all([
        api.getSchedules(),
        api.getExercises(),
        api.getPerformances({ athlete_id: user?.id }),
        api.getMyBenchmarks(),
      ]);
      setSchedules(scList);
      setExercises(exList);
      setPerformances(perfList);
      setBenchmark(benchmarkData);
    } catch (err) {
      console.warn('Failed loading athlete dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);
  useEffect(() => {
    if (loading || viewTab !== 'history' || !destination.target) return;
    let active = true;
    api.getPerformances({ performance_id: destination.target }).then((items) => {
      if (active && items.length) setPerformances((old) => old.some((item) => item.id === items[0].id) ? old : [...items, ...old]);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [loading, destination.revision, viewTab]);

  const best2k = { avg_split_formatted: benchmark?.best_2k_split, avg_watts: benchmark?.best_2k_watts };
  const best5k = { avg_split_formatted: benchmark?.best_5k_split };

  const activeSchedule = schedules.find((schedule) => schedule.id === selectedScheduleId)
    || schedules.find((schedule) => schedule.is_active)
    || schedules[0];

  const openQuickLog = (session?: TrainingSession) => {
    setSelectedSessionForLog(session || null);
    setIsLogModalOpen(true);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
      {/* Welcome & Quick CTA Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-rowing-900 via-slate-900 to-slate-950 border border-rowing-500/30 p-6 sm:p-8 shadow-xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rowing-500/20 text-rowing-300 border border-rowing-500/30 flex items-center gap-1.5">
                <Waves className="w-3.5 h-3.5" /> Athlete Command Center
              </span>
              {activeSchedule?.competition_name && (
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20 flex items-center gap-1">
                  <Trophy className="w-3.5 h-3.5" /> Target: {activeSchedule.competition_name}
                </span>
              )}
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Ready to pull, {user?.full_name?.split(' ')[0]}?
            </h2>
            <p className="text-sm text-slate-300 max-w-xl mt-1">
              Check today's prescribed rowing pieces, keep split pace tight, and submit your power numbers for coach & trainer review.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              id="tour-log-performance-btn"
              onClick={() => openQuickLog()}
              className="px-5 py-3 rounded-2xl bg-gradient-to-r from-rowing-500 to-rowing-600 hover:from-rowing-400 hover:to-rowing-500 text-white font-bold text-sm shadow-lg shadow-rowing-500/25 flex items-center gap-2 active:scale-95 transition-all"
            >
              <PlusCircle className="w-5 h-5" />
              <span>Quick Log Workout</span>
            </button>
          </div>
        </div>

        {/* Decorative background glow */}
        <div className="absolute right-0 top-0 -mt-8 -mr-8 w-64 h-64 bg-rowing-500/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* Athlete Personal Bests Matrix */}
      <div id="tour-personal-bests" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Verified 2k · Last 90 days</span>
            <Trophy className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-black text-white font-mono">
              {best2k?.avg_split_formatted || '—'}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
              <Zap className="w-3 h-3 text-amber-400" />
              {best2k?.avg_watts ? `${best2k.avg_watts} Watts` : 'No result yet'}
            </div>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Power / Weight (2k)</span>
            <Zap className="w-4 h-4 text-rowing-400" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-black text-rowing-400 font-mono">
              {best2k?.avg_watts && user?.weight_kg 
                ? `${(best2k.avg_watts / user.weight_kg).toFixed(2)} W/kg` 
                : '—'}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {user?.weight_kg ? `Weight: ${user.weight_kg} kg` : 'Weight not recorded'}
              {user?.side_preference ? ` (${user.side_preference})` : ''}
            </div>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Verified 5k · Last 90 days</span>
            <Activity className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-black text-white font-mono">
              {best5k?.avg_split_formatted || '—'}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Comparable Concept2 RowErg tests
            </div>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Workouts Logged</span>
            <Award className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-black text-purple-400 font-mono">
              {performances.length} recent logs
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {performances.filter(p => p.is_verified).length} Verified by Trainers
            </div>
          </div>
        </div>
      </div>

      {/* Live Boathouse Water & Weather Conditions */}
      <BoathouseWeatherWidget userRole="athlete" />

      {/* Navigation Sub-Tabs */}
      <div id="athlete-navigation" className="scroll-mt-24 flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
        <button
          onClick={() => setViewTab('today')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
            viewTab === 'today'
              ? 'bg-rowing-500/20 text-rowing-300 border border-rowing-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Activity className="w-4 h-4" /> Prescribed Workouts & Feedback
        </button>

        <button
          onClick={() => setViewTab('calendar')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
            viewTab === 'calendar'
              ? 'bg-rowing-500/20 text-rowing-300 border border-rowing-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Calendar className="w-4 h-4" /> Interactive Workout Calendar
        </button>
        <button
          onClick={() => setAvailabilityOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-all"
        >
          <CalendarOff className="w-4 h-4" /> My Availability
        </button>
        <button type="button" onClick={() => navigate('operations')} className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white">Attendance & RSVP</button>
      </div>

      {viewTab === 'calendar' ? (
        <ScheduleCalendar
          schedules={schedules}
          userRole="athlete"
          onSelectSession={(sess) => openQuickLog(sess)}
        />
      ) : (
        /* Main Grid: My Training Schedule vs Recent Performance Activity */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left 7 cols: Assigned Schedule & Sessions */}
          <div id="tour-schedule-calendar" className={'scroll-mt-24 lg:col-span-7 space-y-4 ' + (viewTab === 'history' ? 'hidden' : '')}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-rowing-400" />
                <h3 className="text-base sm:text-lg font-extrabold text-white">
                  Assigned Training Schedule
                </h3>
              </div>
              <div className="flex items-center gap-2">
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
                <span className="text-xs text-slate-400 font-medium">
                  Phase: <span className="text-rowing-300 uppercase font-bold">{activeSchedule?.phase?.replace('_', ' ')}</span>
                </span>
              </div>
            </div>

            {activeSchedule?.assigned_trainers?.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-[11px] text-slate-300">
                <span className="font-bold text-emerald-400">Your trainers:</span>
                {activeSchedule.assigned_trainers.map((trainer) => (
                  <span key={trainer.id}>{trainer.full_name}</span>
                ))}
              </div>
            )}

          {activeSchedule?.sessions && activeSchedule.sessions.length > 0 ? (
            <div className="space-y-3">
              {activeSchedule.sessions.map((sess, idx) => (
                <div
                  key={sess.id}
                  className="bg-slate-900/90 border border-slate-800 hover:border-rowing-500/50 rounded-2xl p-4 sm:p-5 transition-all shadow-md group"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-800 text-slate-300">
                          {sess.session_type.replace('_', ' ')}
                        </span>
                        {sess.location && (
                          <span className="text-xs text-slate-400 font-medium">
                            📍 {sess.location}
                          </span>
                        )}
                      </div>
                      <h4 className="text-base font-bold text-white mt-1 group-hover:text-rowing-300 transition-colors">
                        {sess.title}
                      </h4>
                      <p className="mt-1 text-xs capitalize text-slate-400">{sess.status}{sess.change_reason ? ' · ' + sess.change_reason : ''}</p>
                      <button type="button" className="mt-2 rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white" onClick={() => navigate(`operations/${sess.id}`)}>RSVP / Attendance</button>
                    </div>

                    <button
                      disabled={sess.status === 'cancelled'} onClick={() => openQuickLog(sess)}
                      className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rowing-500/20 hover:bg-rowing-500/30 text-rowing-300 text-xs font-bold border border-rowing-500/30 transition-all shrink-0 self-start sm:self-center"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>{sess.status === 'cancelled' ? 'Cancelled' : 'Log This Piece'}</span>
                    </button>
                  </div>

                  {sess.instructions && (
                    <p className="text-xs text-slate-300 my-2.5 leading-relaxed bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/60">
                      💡 {sess.instructions}
                    </p>
                  )}

                  {/* Prescribed Exercises List */}
                  {sess.exercises && sess.exercises.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {sess.exercises.map((se) => (
                        <div key={se.id} className="flex flex-col justify-between gap-1.5 rounded-lg bg-slate-950/60 px-2.5 py-2 text-xs sm:flex-row sm:items-center">
                          <span className="font-semibold text-slate-200">{se.exercise_name}</span>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-400 font-mono">
                            {se.target_reps_or_distance && <span>{se.target_reps_or_distance}</span>}
                            {se.target_intensity_split && <span className="text-rowing-300">Split: {se.target_intensity_split}</span>}
                            {se.target_watts && <span className="text-amber-300">{se.target_watts}W</span>}
                            {se.target_stroke_rate && <span>{se.target_stroke_rate} spm</span>}
                            {se.target_heart_rate_zone && <span>{se.target_heart_rate_zone}</span>}
                            {se.target_rpe && <span>RPE {se.target_rpe}/10</span>}
                            {se.target_weight_kg && <span>{se.target_weight_kg}kg</span>}
                            {se.rest_interval_sec > 0 && <span>{se.rest_interval_sec}s rest</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400">
              No sessions scheduled for this week.
            </div>
          )}
        </div>

        {/* Right 5 cols: Performance Activity & Trainer Feedback */}
        <div id="tour-verification-status" className={'scroll-mt-24 space-y-4 ' + (viewTab === 'history' ? 'lg:col-span-12' : 'lg:col-span-5')}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-emerald-400" />
              <h3 className="text-base sm:text-lg font-extrabold text-white">
                Recent Logs & Trainer Ratings
              </h3>
            </div>
          </div>

          <div className="space-y-3">
            {performances.map((perf) => (
              <div 
                key={perf.id}
                id={`performance-${perf.id}`}
                className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-md space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h5 className="text-xs font-bold text-white">
                      {perf.exercise_name}
                    </h5>
                    <p className="text-[10px] text-slate-400">{new Date(perf.recorded_date).toLocaleDateString()} · {perf.category?.replace(/_/g, ' ')}</p>
                  </div>

                  {perf.is_verified ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <CheckCircle className="w-3 h-3" /> Verified
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                      <Clock className="w-3 h-3" /> Pending Review
                    </span>
                  )}
                </div>

                {/* Metrics Pill Grid */}
                <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-800/80 bg-slate-950/70 p-2 text-center font-mono sm:grid-cols-4">{performanceMetrics(perf).map((metric) => <div key={metric.label}><span className="block text-[9px] uppercase tracking-wider text-slate-500">{metric.label}</span><span className="text-xs font-bold text-white">{metric.value}</span></div>)}</div>

                {/* Athlete notes if any */}
                {perf.athlete_notes && (
                  <p className="text-[11px] text-slate-300 italic">
                    "{perf.athlete_notes}"
                  </p>
                )}

                {/* Trainer Feedback Callout */}
                {perf.trainer_feedback && (
                  <div className="bg-emerald-950/30 border border-emerald-500/20 rounded-xl p-2.5 space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-emerald-400 flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" /> Trainer Feedback:
                      </span>
                      {perf.trainer_rating && (
                        <div className="flex items-center gap-0.5 text-amber-400">
                          {Array.from({ length: perf.trainer_rating }).map((_, i) => (
                            <Star key={i} className="w-3 h-3 fill-amber-400" />
                          ))}
                        </div>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-200 leading-snug">
                      {perf.trainer_feedback}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
          {/* End right panel col */}
        </div>
        {/* End 12-col grid */}
      </div>
      )}
      {/* End calendar vs grid ternary */}

      {/* Quick Log Performance Modal */}
      <LogPerformanceModal
        isOpen={isLogModalOpen}
        onClose={() => setIsLogModalOpen(false)}
        onSuccess={() => {
          loadData();
        }}
        initialSession={selectedSessionForLog}
        exercises={exercises}
      />
      <AvailabilityModal
        isOpen={availabilityOpen}
        allowSafetyRestriction
        onClose={() => setAvailabilityOpen(false)}
      />
    </div>
  );
};
