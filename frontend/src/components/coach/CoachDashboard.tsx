import React, { useState, useEffect } from 'react';
import { Club, CoachAnalyticsSummary, Schedule, ScheduleAdherence, Competition, Equipment, Exercise, TrainingSession, User } from '../../types';
import { api } from '../../services/api';
import { 
  Trophy, Calendar, PlusCircle, BarChart3, Dumbbell, ShieldCheck, 
  Users, Activity, Zap, CheckCircle2, ChevronRight, Filter, Anchor, Waves, ArrowUpRight, Megaphone, X,
  Copy, FolderTree, Pencil
} from 'lucide-react';
import { CreateScheduleModal } from '../schedule/CreateScheduleModal';
import { EditScheduleAssignmentsModal } from '../schedule/EditScheduleAssignmentsModal';
import { ScheduleSessionModal } from '../schedule/ScheduleSessionModal';
import { ScheduleCalendar } from '../calendar/ScheduleCalendar';
import { CoachGraphicalAnalytics } from './CoachGraphicalAnalytics';
import { BoathouseWeatherWidget } from '../weather/BoathouseWeatherWidget';
import { TaxonomyTreeManager } from '../taxonomy/TaxonomyTreeManager';
import { EquipmentManager, ExerciseManager } from '../catalog/CatalogManagers';
import { MembershipManager } from '../membership/MembershipManager';

const splitToSeconds = (value: string): number | null => {
  if (!value.trim()) return null;
  const parts = value.trim().split(':');
  const seconds = parts.length === 2 ? Number(parts[0]) * 60 + Number(parts[1]) : Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
};
const secondsToSplit = (value?: number) => value ? `${Math.floor(value / 60)}:${(value % 60).toFixed(1).padStart(4, '0')}` : '';

export const CoachDashboard: React.FC = () => {
  const [summary, setSummary] = useState<CoachAnalyticsSummary | null>(null);
  const [club, setClub] = useState<Club | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);
  const [exercisesList, setExercisesList] = useState<Exercise[]>([]);
  const [members, setMembers] = useState<User[]>([]);
  const [adherence, setAdherence] = useState<Record<number, ScheduleAdherence>>({});
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<'analytics' | 'calendar' | 'schedules' | 'competitions' | 'taxonomy' | 'conditions' | 'equipment' | 'exercises' | 'membership'>('analytics');
  const [benchmarkSplit, setBenchmarkSplit] = useState('');
  const [goldSplit, setGoldSplit] = useState('');
  const [isCreateScheduleOpen, setIsCreateScheduleOpen] = useState(false);
  const [editingAssignments, setEditingAssignments] = useState<Schedule | null>(null);
  const [sessionModal, setSessionModal] = useState<{ schedule: Schedule; session?: TrainingSession; duplicate?: boolean } | null>(null);

  // New Competition Form State
  const [showCompModal, setShowCompModal] = useState(false);
  const [compName, setCompName] = useState('');
  const [compLocation, setCompLocation] = useState('');
  const [compDist, setCompDist] = useState<number | ''>('');
  const [compStartDate, setCompStartDate] = useState('');
  const [compEndDate, setCompEndDate] = useState('');

  // Team Announcement Broadcast State
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcastRole, setBroadcastRole] = useState<string>('all');
  const [broadcasting, setBroadcasting] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [sumData, scData, compData, eqData, exData, memberData, clubData] = await Promise.all([
        api.getCoachSummary(),
        api.getSchedules(),
        api.getCompetitions(),
        api.getEquipment(),
        api.getExercises(),
        api.getClubMembers(),
        api.getCurrentClub(),
      ]);
      setSummary(sumData);
      setSchedules(scData);
      setCompetitions(compData);
      setEquipmentList(eqData);
      setExercisesList(exData);
      setMembers(memberData);
      setClub(clubData);
      setBenchmarkSplit(secondsToSplit(clubData.benchmark_2k_split_seconds));
      setGoldSplit(secondsToSplit(clubData.gold_2k_split_seconds));
      const adherenceResults = await Promise.all(scData.map(async (schedule) => {
        try { return await api.getScheduleAdherence(schedule.id); } catch { return null; }
      }));
      setAdherence(Object.fromEntries(adherenceResults.filter(Boolean).map((item) => [item!.schedule_id, item!])));
    } catch (err) {
      console.warn('Failed loading coach data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateCompetition = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createCompetition({
        name: compName,
        location: compLocation,
        target_distance_m: Number(compDist),
        start_date: new Date(compStartDate).toISOString(),
        end_date: new Date(compEndDate).toISOString(),
      });
      setShowCompModal(false);
      setCompName('');
      setCompLocation(''); setCompDist(''); setCompStartDate(''); setCompEndDate('');
      loadData();
    } catch (err: any) {
      alert(`Error creating competition: ${err.message}`);
    }
  };

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    setBroadcasting(true);
    try {
      await api.broadcastAnnouncement({
        title: broadcastTitle,
        message: broadcastMsg,
        type: 'announcement',
        target_role: broadcastRole === 'all' ? undefined : broadcastRole
      });
      setShowBroadcastModal(false);
      setBroadcastTitle('');
      setBroadcastMsg('');
      alert('Announcement broadcast successfully sent to squad members!');
    } catch (err: any) {
      alert(`Error broadcasting announcement: ${err.message}`);
    } finally {
      setBroadcasting(false);
    }
  };

  const saveBenchmarks = async (event: React.FormEvent) => {
    event.preventDefault();
    if (benchmarkSplit && !splitToSeconds(benchmarkSplit)) return alert('Enter the benchmark as M:SS.s');
    if (goldSplit && !splitToSeconds(goldSplit)) return alert('Enter the gold standard as M:SS.s');
    const updated = await api.updateClubSettings({ benchmark_2k_split_seconds: splitToSeconds(benchmarkSplit), gold_2k_split_seconds: splitToSeconds(goldSplit) });
    setClub(updated);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
      {/* Top Banner & Quick Metrics */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-amber-950/80 via-slate-900 to-slate-950 border border-amber-500/30 p-6 sm:p-8 shadow-xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5" /> Head Coach Command Suite
              </span>
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                {summary?.verified_percentage ?? 0}% Log Verification Rate
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Squad Performance & Seat Selection Analytics
            </h2>
            <p className="text-sm text-slate-300 max-w-2xl mt-1">
              Compare 2k/5k splits, power-to-weight ratios, and composite Readiness Scores to construct your fastest racing lineups.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowBroadcastModal(true)}
              className="px-4 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-sm flex items-center gap-2 transition-all"
            >
              <Megaphone className="w-4 h-4 text-purple-400" />
              <span>Broadcast Alert</span>
            </button>

            <button
              id="tour-schedule-builder-btn"
              onClick={() => setIsCreateScheduleOpen(true)}
              className="px-5 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-bold text-sm shadow-lg shadow-amber-500/25 flex items-center gap-2 active:scale-95 transition-all"
            >
              <PlusCircle className="w-5 h-5" />
              <span>Create Schedule</span>
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('analytics')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
            activeTab === 'analytics'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <BarChart3 className="w-4 h-4" /> Graphical Analytics & Seat Racing
        </button>

        <button
          onClick={() => setActiveTab('calendar')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
            activeTab === 'calendar'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Calendar className="w-4 h-4" /> Training Calendar & Regattas
        </button>

        <button
          id="tour-competition-manager"
          onClick={() => setActiveTab('competitions')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
            activeTab === 'competitions'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Trophy className="w-4 h-4" /> Target Competitions ({competitions.length})
        </button>

        <button
          onClick={() => setActiveTab('schedules')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
            activeTab === 'schedules'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Calendar className="w-4 h-4" /> Training Schedules ({schedules.length})
        </button>

        <button
          onClick={() => setActiveTab('taxonomy')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
            activeTab === 'taxonomy'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <FolderTree className="w-4 h-4" /> Periodization & Taxonomy
        </button>

        <button
          onClick={() => setActiveTab('conditions')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
            activeTab === 'conditions'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Waves className="w-4 h-4" /> Conditions
        </button>
        <button id="tour-equipment-exercise-catalog" onClick={() => setActiveTab('equipment')} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${activeTab === 'equipment' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'}`}>
          <Anchor className="w-4 h-4" /> Equipment
        </button>
        <button onClick={() => setActiveTab('exercises')} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${activeTab === 'exercises' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'}`}>
          <Dumbbell className="w-4 h-4" /> Exercise library
        </button>
        <button onClick={() => setActiveTab('membership')} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${activeTab === 'membership' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'}`}>
          <Users className="w-4 h-4" /> Membership
        </button>
      </div>

      {/* TAB 1: Athlete Comparison Analytics Matrix + Graphical Visualizers */}
      {activeTab === 'analytics' && (
        <div id="tour-coach-analytics-matrix" className="space-y-8">
          {/* Graphical Analytics Component */}
          {summary?.athlete_rankings && summary.athlete_rankings.length > 0 && (
            <CoachGraphicalAnalytics rankings={summary.athlete_rankings} benchmark2kSplitSeconds={club?.benchmark_2k_split_seconds} gold2kSplitSeconds={club?.gold_2k_split_seconds} />
          )}

          <div className="space-y-4">
            <div>
              <h3 className="text-base sm:text-lg font-extrabold text-white">
                Detailed Squad Leaderboard Table
              </h3>
              <p className="text-xs text-slate-400">
                Sorted by the available verified 2k pace, watts/kg, and trainer-rating evidence. Missing data is never estimated.
              </p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950/80 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-4 px-4">Rank & Athlete</th>
                      <th className="py-4 px-3">Side / Rig</th>
                      <th className="py-4 px-3">Weight</th>
                      <th className="py-4 px-3 text-amber-300">2k PB Split</th>
                      <th className="py-4 px-3">2k Watts</th>
                      <th className="py-4 px-3 text-rowing-400">Power/Wt (W/kg)</th>
                      <th className="py-4 px-3">5k Split</th>
                      <th className="py-4 px-3">Trainer Rating</th>
                      <th className="py-4 px-4 text-right">Readiness Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-medium">
                    {summary?.athlete_rankings?.map((ath) => (
                      <tr 
                        key={ath.athlete_id}
                        className="hover:bg-slate-800/40 transition-colors group"
                      >
                        <td className="py-3.5 px-4 flex items-center gap-3">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${
                            ath.rank === 1 ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-400/30' :
                            ath.rank === 2 ? 'bg-slate-300 text-slate-950' :
                            ath.rank === 3 ? 'bg-amber-700 text-white' : 'bg-slate-800 text-slate-400'
                          }`}>
                            {ath.rank}
                          </span>
                          <div>
                            <div className="font-bold text-white group-hover:text-amber-300 transition-colors">
                              {ath.athlete_name}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              {ath.total_sessions_completed} logged pieces
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-slate-800 text-slate-300">
                            {ath.side_preference || 'Not set'}
                          </span>
                        </td>

                        <td className="py-3.5 px-3 font-mono">
                          {ath.weight_kg ? `${ath.weight_kg} kg` : '—'}
                        </td>

                        <td className="py-3.5 px-3 font-mono font-bold text-white text-sm">
                          {ath.best_2k_split || '—'}
                        </td>

                        <td className="py-3.5 px-3 font-mono text-amber-400 font-semibold">
                          {ath.best_2k_watts ? `${ath.best_2k_watts}W` : '—'}
                        </td>

                        <td className="py-3.5 px-3 font-mono text-rowing-400 font-bold">
                          {ath.watts_per_kg_2k ? `${ath.watts_per_kg_2k} W/kg` : '—'}
                        </td>

                        <td className="py-3.5 px-3 font-mono">
                          {ath.best_5k_split || '—'}
                        </td>

                        <td className="py-3.5 px-3 font-mono">
                          {ath.avg_verified_rating ? `⭐ ${ath.avg_verified_rating}/5` : '—'}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <div className="inline-flex items-center gap-2">
                            <div className="w-16 bg-slate-800 rounded-full h-2 overflow-hidden hidden sm:block">
                              <div 
                                className="bg-gradient-to-r from-amber-500 to-emerald-400 h-full rounded-full" 
                                style={{ width: `${Math.min(100, ath.overall_readiness_score || 0)}%` }}
                              />
                            </div>
                            <span className="font-mono font-extrabold text-sm text-emerald-400">
                              {ath.overall_readiness_score != null ? `${ath.overall_readiness_score}%` : '—'}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB: Interactive Calendar */}
      {activeTab === 'calendar' && (
        <ScheduleCalendar
          schedules={schedules}
          competitions={competitions}
          userRole="coach"
          onAddSession={() => setIsCreateScheduleOpen(true)}
        />
      )}

      {/* TAB 2: Target Competitions & Regattas */}
      {activeTab === 'competitions' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-extrabold text-white">
                Target Competitions & Regatta Goals
              </h3>
              <p className="text-xs text-slate-400">
                Schedules and workouts are calibrated specifically against these regattas.
              </p>
            </div>
            <button
              onClick={() => setShowCompModal(true)}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md flex items-center gap-1.5"
            >
              <PlusCircle className="w-4 h-4" /> Add Competition
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {competitions.map((c) => (
              <div 
                key={c.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/10 text-amber-300 border border-amber-500/20">
                      {c.competition_type.replace('_', ' ')} • {c.target_distance_m}m
                    </span>
                    <h4 className="text-base font-extrabold text-white mt-1.5">
                      {c.name}
                    </h4>
                    {c.location && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        📍 {c.location}
                      </p>
                    )}
                  </div>
                  <Trophy className="w-6 h-6 text-amber-400 shrink-0" />
                </div>

                <div className="text-xs text-slate-300 bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
                  <div className="flex items-center justify-between text-slate-400 mb-1">
                    <span>Regatta Window:</span>
                    <span className="font-mono text-white">
                      {new Date(c.start_date).toLocaleDateString()} - {new Date(c.end_date).toLocaleDateString()}
                    </span>
                  </div>
                  {c.notes && <p className="text-slate-400 text-[11px] mt-1">{c.notes}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: Training Schedules */}
      {activeTab === 'schedules' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-extrabold text-white">
                Training Macrocycles & Schedules
              </h3>
              <p className="text-xs text-slate-400">
                Multi-week training periods assigned across the rowing club.
              </p>
            </div>
            <button
              onClick={() => setIsCreateScheduleOpen(true)}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md flex items-center gap-1.5"
            >
              <PlusCircle className="w-4 h-4" /> Create Schedule
            </button>
          </div>

          <div className="space-y-4">
            {schedules.map((sc) => (
              <div 
                key={sc.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rowing-500/20 text-rowing-300">
                        {sc.phase.replace('_', ' ')}
                      </span>
                      {sc.competition_name && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/20 text-amber-300">
                          🏆 Target: {sc.competition_name}
                        </span>
                      )}
                    </div>
                    <h4 className="text-base font-extrabold text-white mt-1">
                      {sc.name}
                    </h4>
                    <p className="text-xs text-slate-400">
                      {sc.season ? `${sc.season} • ` : ''}{new Date(sc.start_date).toLocaleDateString()} to {new Date(sc.end_date).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <span className="text-xs font-bold text-slate-300 font-mono">
                      {sc.sessions.length} Prescribed Sessions
                    </span>
                    <button
                      type="button"
                      onClick={() => setSessionModal({ schedule: sc })}
                      className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[10px] font-bold text-emerald-300 hover:bg-emerald-500/20"
                    >
                      <PlusCircle className="h-3.5 w-3.5" /> Add session
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingAssignments(sc)}
                      className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[10px] font-bold text-amber-300 hover:bg-amber-500/20"
                    >
                      Manage assignments
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                  <span className="rounded-lg bg-sky-500/10 px-2 py-1 font-semibold text-sky-300">
                    {sc.athlete_ids?.length || 0} athletes
                  </span>
                  <span className="rounded-lg bg-emerald-500/10 px-2 py-1 font-semibold text-emerald-300">
                    {sc.trainer_ids?.length || 0} trainers
                  </span>
                  {(!sc.athlete_ids?.length && !sc.trainer_ids?.length) && (
                    <span className="rounded-lg bg-purple-500/10 px-2 py-1 font-semibold text-purple-300">Legacy club-wide schedule</span>
                  )}
                  {sc.assigned_trainers?.map((trainer) => (
                    <span key={trainer.id}>Trainer: {trainer.full_name}</span>
                  ))}
                </div>

                {sc.description && (
                  <p className="text-xs text-slate-300 bg-slate-950/50 p-2.5 rounded-xl border border-slate-800/60">
                    {sc.description}
                  </p>
                )}

                {adherence[sc.id] && (
                  <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
                    <div><div className="flex items-center justify-between text-[10px] font-bold text-slate-400"><span>Workout completion</span><span>{adherence[sc.id].completed_logs}/{adherence[sc.id].expected_logs} logs · {adherence[sc.id].completion_percentage}%</span></div><div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-500" style={{ width: `${Math.min(100, adherence[sc.id].completion_percentage)}%` }} /></div></div>
                    <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-center"><div className="text-[9px] font-bold uppercase text-amber-400">Target achievement</div><div className="text-sm font-extrabold text-amber-200">{adherence[sc.id].target_achievement_percentage != null ? `${adherence[sc.id].target_achievement_percentage}%` : 'No results'}</div></div>
                  </div>
                )}

                {/* Session pills preview */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                  {sc.sessions.map((sess) => (
                    <div key={sess.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/80 p-2.5 text-xs">
                      <div className="min-w-0"><div className="truncate font-semibold text-slate-200">{sess.title}</div><div className="mt-0.5 text-[10px] text-slate-500">{new Date(sess.session_date).toLocaleString()} · {sess.duration_minutes}m</div></div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="hidden text-[10px] font-bold uppercase text-slate-400 sm:inline">{sess.session_type.replace(/_/g, ' ')}</span>
                        <button type="button" onClick={() => setSessionModal({ schedule: sc, session: sess, duplicate: true })} aria-label={`Duplicate ${sess.title}`} className="rounded-lg p-2 text-emerald-300 hover:bg-emerald-500/10"><Copy className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => setSessionModal({ schedule: sc, session: sess })} aria-label={`Edit ${sess.title}`} className="rounded-lg p-2 text-sky-300 hover:bg-sky-500/10"><Pencil className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'conditions' && <div className="space-y-6"><BoathouseWeatherWidget userRole="coach" /><form onSubmit={saveBenchmarks} className="rounded-3xl border border-slate-800 bg-slate-900 p-5"><h3 className="font-extrabold text-white">Club 2k comparison standards</h3><p className="mt-1 text-xs text-slate-400">Optional reference lines for charts. These are club settings—not athlete results.</p><div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"><label className="text-xs font-semibold text-slate-300">Benchmark split /500m<input value={benchmarkSplit} onChange={(e) => setBenchmarkSplit(e.target.value)} placeholder="M:SS.s" className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label><label className="text-xs font-semibold text-slate-300">Gold standard /500m<input value={goldSplit} onChange={(e) => setGoldSplit(e.target.value)} placeholder="M:SS.s" className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label><button className="self-end rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950">Save standards</button></div></form></div>}
      {activeTab === 'equipment' && <EquipmentManager items={equipmentList} onRefresh={loadData} />}
      {activeTab === 'exercises' && <ExerciseManager items={exercisesList} equipment={equipmentList} onRefresh={loadData} />}
      {activeTab === 'membership' && <MembershipManager userRole="coach" onChanged={loadData} />}

      {/* TAB 5: Periodization & Unlimited-Depth Taxonomy Manager */}
      {activeTab === 'taxonomy' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
          <TaxonomyTreeManager userRole="coach" onTreeChanged={loadData} />
        </div>
      )}

      {/* Create Schedule Modal */}
      <CreateScheduleModal
        isOpen={isCreateScheduleOpen}
        onClose={() => setIsCreateScheduleOpen(false)}
        onSuccess={() => loadData()}
        competitions={competitions}
        exercises={exercisesList}
        members={members}
      />

      <EditScheduleAssignmentsModal
        schedule={editingAssignments}
        members={members}
        onClose={() => setEditingAssignments(null)}
        onSuccess={() => loadData()}
      />

      <ScheduleSessionModal
        schedule={sessionModal?.schedule || null}
        session={sessionModal?.session}
        duplicate={sessionModal?.duplicate}
        exercises={exercisesList}
        onClose={() => setSessionModal(null)}
        onSuccess={() => loadData()}
      />

      {/* Create Competition Modal */}
      {showCompModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-white">Add Target Regatta / Competition</h3>
            <form onSubmit={handleCreateCompetition} className="space-y-3">
              <input
                type="text"
                placeholder="Competition name"
                value={compName}
                onChange={(e) => setCompName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white"
                required
              />
              <input
                type="text"
                placeholder="Regatta Location / Course"
                value={compLocation}
                onChange={(e) => setCompLocation(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white"
              />
              <input
                type="number"
                placeholder="Target Distance (meters, e.g. 2000)"
                value={compDist}
                onChange={(e) => setCompDist(e.target.value ? Number(e.target.value) : '')}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white"
                required
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={compStartDate}
                  onChange={(e) => setCompStartDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  required
                />
                <input
                  type="date"
                  value={compEndDate}
                  onChange={(e) => setCompEndDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCompModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-500 text-slate-950 font-bold rounded-xl text-xs"
                >
                  Save Regatta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Broadcast Announcement Modal */}
      {showBroadcastModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
                  <Megaphone className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-white">Broadcast Announcement</h3>
              </div>
              <button
                onClick={() => setShowBroadcastModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleBroadcast} className="space-y-3.5 pt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Target Audience</label>
                <select
                  value={broadcastRole}
                  onChange={(e) => setBroadcastRole(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                >
                  <option value="all">Entire Club (Athletes, Trainers & Coaches)</option>
                  <option value="athlete">Athletes Only</option>
                  <option value="trainer">Trainers Only</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Headline / Title</label>
                <input
                  type="text"
                  value={broadcastTitle}
                  onChange={(e) => setBroadcastTitle(e.target.value)}
                  placeholder="e.g. Saturday 6:30 AM Outing Moved to Indoor Ergs"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Detailed Message</label>
                <textarea
                  rows={3}
                  value={broadcastMsg}
                  onChange={(e) => setBroadcastMsg(e.target.value)}
                  placeholder="e.g. Due to 20kt crosswinds, all crews will do the 8x500m erg piece instead of water rows. Arrive by 6:15 AM."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBroadcastModal(false)}
                  className="px-3 py-2 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={broadcasting}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg transition-all"
                >
                  {broadcasting ? 'Sending...' : 'Send Broadcast'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
