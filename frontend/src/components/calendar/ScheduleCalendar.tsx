import React, { useState } from 'react';
import { utcDate } from '../../lib/dateTime';
import { useNavigation } from '../../context/NavigationContext';
import { TrainingSession, Schedule, Competition } from '../../types';
import { 
  ChevronLeft, ChevronRight, Calendar as CalendarIcon, Trophy, 
  Dumbbell, Waves, Activity, Clock, PlusCircle, CheckCircle2,
  GitBranch, Filter
} from 'lucide-react';

interface ScheduleCalendarProps {
  schedules: Schedule[];
  competitions?: Competition[];
  onSelectSession?: (session: TrainingSession) => void;
  onAddSession?: (date: Date) => void;
  userRole?: string;
}

export const ScheduleCalendar: React.FC<ScheduleCalendarProps> = ({
  schedules,
  competitions = [],
  onSelectSession,
  onAddSession,
  userRole,
}) => {
  const { navigate } = useNavigation();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
  const [taxonomyFilter, setTaxonomyFilter] = useState<string>('all');

  // Month navigation
  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const today = new Date();
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const daysInMonth = lastDayOfMonth.getDate();
  const startDayOfWeek = (firstDayOfMonth.getDay() + 6) % 7; // Monday start (0=Mon, 6=Sun)

  // Extract unique taxonomy paths
  const uniqueTaxonomies = Array.from(
    new Set(
      schedules
        .map((s) => s.taxonomy_path_snapshot || s.taxonomy_node_name)
        .filter(Boolean) as string[]
    )
  );

  // Flatten all sessions across schedules with optional taxonomy filter
  const allSessions: (TrainingSession & { scheduleName: string; competitionName?: string; taxonomyPath?: string })[] = [];
  schedules.forEach((sc) => {
    const scPath = sc.taxonomy_path_snapshot || sc.taxonomy_node_name || '';
    if (taxonomyFilter !== 'all' && !scPath.toLowerCase().includes(taxonomyFilter.toLowerCase())) {
      return;
    }

    sc.sessions?.forEach((sess) => {
      allSessions.push({
        ...sess,
        scheduleName: sc.name,
        competitionName: sc.competition_name,
        taxonomyPath: sess.taxonomy_path_snapshot || scPath,
      });
    });
  });

  // Helper to get sessions on a specific date
  const getSessionsForDate = (date: Date) => {
    return allSessions.filter((s) => {
      const sDate = new Date(s.session_date);
      return (
        sDate.getFullYear() === date.getFullYear() &&
        sDate.getMonth() === date.getMonth() &&
        sDate.getDate() === date.getDate()
      );
    });
  };

  // Helper to get competitions on a specific date
  const getCompetitionsForDate = (date: Date) => {
    return competitions.filter((c) => {
      const sDate = new Date(c.start_date);
      const eDate = new Date(c.end_date);
      return date >= new Date(sDate.getFullYear(), sDate.getMonth(), sDate.getDate()) &&
             date <= new Date(eDate.getFullYear(), eDate.getMonth(), eDate.getDate());
    });
  };

  // Days grid calculation
  const calendarDays: { date: Date; isCurrentMonth: boolean }[] = [];
  
  // Previous month padding
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    calendarDays.push({
      date: new Date(year, month - 1, prevMonthLastDay - i),
      isCurrentMonth: false,
    });
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    calendarDays.push({
      date: new Date(year, month, d),
      isCurrentMonth: true,
    });
  }

  // Next month padding to fill grid
  const remainingCells = 42 - calendarDays.length;
  for (let d = 1; d <= remainingCells; d++) {
    calendarDays.push({
      date: new Date(year, month + 1, d),
      isCurrentMonth: false,
    });
  }

  const selectedDaySessions = getSessionsForDate(selectedDay);
  const selectedDayCompetitions = getCompetitionsForDate(selectedDay);

  const getSessionBadgeColor = (type: string) => {
    switch (type) {
      case 'indoor_erg':
        return 'bg-rowing-500/20 text-rowing-300 border-rowing-500/30';
      case 'water_rowing':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'strength_gym':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      default:
        return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
    }
  };

  const getSessionIcon = (type: string) => {
    switch (type) {
      case 'water_rowing':
        return <Waves className="w-3 h-3" />;
      case 'strength_gym':
        return <Dumbbell className="w-3 h-3" />;
      case 'indoor_erg':
      default:
        return <Activity className="w-3 h-3" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Calendar Header Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-3xl shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-rowing-500/10 border border-rowing-500/30 flex items-center justify-center text-rowing-400">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-extrabold text-white">
              {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
            </h3>
            <p className="text-xs text-slate-400">
              {allSessions.length} total scheduled training blocks • {competitions.length} regatta targets
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Taxonomy Periodization Branch Filter */}
          {uniqueTaxonomies.length > 0 && (
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1 text-xs">
              <Filter className="w-3.5 h-3.5 text-rowing-400" />
              <select
                value={taxonomyFilter}
                onChange={(e) => setTaxonomyFilter(e.target.value)}
                className="bg-transparent text-xs text-slate-200 focus:outline-none max-w-[180px] truncate"
              >
                <option value="all" className="bg-slate-900 text-white">All Taxonomy Branches</option>
                {uniqueTaxonomies.map((tax, idx) => (
                  <option key={idx} value={tax} className="bg-slate-900 text-white">
                    {tax}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={() => {
              setCurrentDate(new Date());
              setSelectedDay(new Date());
            }}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors"
          >
            Today
          </button>
          
          <div className="flex items-center bg-slate-950 rounded-xl border border-slate-800 p-0.5">
            <button
              onClick={prevMonth}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={nextMonth}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {(userRole === 'coach' || userRole === 'admin') && onAddSession && (
            <button
              onClick={() => onAddSession(selectedDay)}
              className="px-3.5 py-1.5 rounded-xl bg-rowing-600 hover:bg-rowing-500 text-xs font-bold text-white shadow-md flex items-center gap-1.5"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Add Session</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Grid: Calendar Month View + Selected Day Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 8 Cols: Month Calendar Grid */}
        <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-xl">
          {/* Day of Week Headers */}
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold uppercase tracking-wider text-slate-400 pb-3 border-b border-slate-800">
            <div>Mon</div>
            <div>Tue</div>
            <div>Wed</div>
            <div>Thu</div>
            <div>Fri</div>
            <div>Sat</div>
            <div>Sun</div>
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5 pt-2">
            {calendarDays.map(({ date, isCurrentMonth }, idx) => {
              const dateSessions = getSessionsForDate(date);
              const dateCompetitions = getCompetitionsForDate(date);
              const isSelected =
                selectedDay.getFullYear() === date.getFullYear() &&
                selectedDay.getMonth() === date.getMonth() &&
                selectedDay.getDate() === date.getDate();
              const isToday =
                today.getFullYear() === date.getFullYear() &&
                today.getMonth() === date.getMonth() &&
                today.getDate() === date.getDate();

              return (
                <div
                  key={idx}
                  onClick={() => setSelectedDay(date)}
                  className={`min-h-[70px] sm:min-h-[90px] p-1 sm:p-2 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'bg-slate-800/90 border-rowing-400 ring-2 ring-rowing-500/40 shadow-lg'
                      : isToday
                      ? 'bg-slate-950/80 border-rowing-500/60 hover:bg-slate-800/50'
                      : isCurrentMonth
                      ? 'bg-slate-950/40 border-slate-800/80 hover:bg-slate-800/30'
                      : 'bg-slate-950/20 border-slate-800/30 opacity-40 hover:opacity-70'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-bold font-mono ${
                        isToday
                          ? 'w-5 h-5 rounded-full bg-rowing-500 text-white flex items-center justify-center'
                          : isSelected
                          ? 'text-rowing-300'
                          : 'text-slate-300'
                      }`}
                    >
                      {date.getDate()}
                    </span>

                    {dateCompetitions.length > 0 && (
                      <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    )}
                  </div>

                  {/* Session Preview Badges */}
                  <div className="space-y-1 mt-1">
                    {dateCompetitions.map((comp) => (
                      <div
                        key={comp.id}
                        className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/30 truncate"
                        title={comp.name}
                      >
                        🏆 {comp.name}
                      </div>
                    ))}

                    {dateSessions.slice(0, 2).map((sess) => (
                      <div
                        key={sess.id}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold border truncate flex items-center gap-1 ${getSessionBadgeColor(
                          sess.session_type
                        )}`}
                        title={sess.title}
                      >
                        {getSessionIcon(sess.session_type)}
                        <span className="truncate">{sess.title}</span>
                      </div>
                    ))}

                    {dateSessions.length > 2 && (
                      <span className="text-[8px] font-bold text-slate-500 block text-right">
                        +{dateSessions.length - 2} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right 4 Cols: Selected Day Detail Panel */}
        <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4 flex flex-col">
          <div className="pb-3 border-b border-slate-800">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Selected Day Detail
            </span>
            <h4 className="text-base font-extrabold text-white">
              {selectedDay.toLocaleDateString('default', {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </h4>
          </div>

          {/* Competitions on this day */}
          {selectedDayCompetitions.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1">
                <Trophy className="w-3.5 h-3.5" /> Target Regatta
              </span>
              {selectedDayCompetitions.map((comp) => (
                <div
                  key={comp.id}
                  className="bg-amber-950/30 border border-amber-500/30 rounded-2xl p-3 space-y-1 text-xs"
                >
                  <h5 className="font-extrabold text-amber-200">{comp.name}</h5>
                  <p className="text-amber-300/80 text-[11px]">
                    📍 {comp.location || 'Official Course'} • {comp.target_distance_m}m
                  </p>
                  {comp.notes && (
                    <p className="text-slate-300 text-[10px] pt-1">{comp.notes}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Scheduled Sessions */}
          <div className="space-y-3 flex-1 overflow-y-auto max-h-[420px]">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Workouts & Sessions ({selectedDaySessions.length})
            </span>

            {selectedDaySessions.length === 0 ? (
              <div className="bg-slate-950/40 border border-slate-800/60 rounded-2xl p-6 text-center text-slate-400 text-xs">
                No training sessions scheduled for this date.
              </div>
            ) : (
              selectedDaySessions.map((sess) => (
                <div
                  key={sess.id}
                  onClick={() => sess.status !== 'cancelled' && onSelectSession?.(sess)}
                  className="bg-slate-950/80 border border-slate-800 hover:border-rowing-500/50 rounded-2xl p-3.5 shadow space-y-2 cursor-pointer transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border flex items-center gap-1 ${getSessionBadgeColor(
                        sess.session_type
                      )}`}
                    >
                      {getSessionIcon(sess.session_type)}
                      {sess.session_type.replace('_', ' ')}
                    </span>
                    {sess.location && (
                      <span className="text-[10px] text-slate-400 font-mono">
                        📍 {sess.location}
                      </span>
                    )}
                  </div>

                  <h5 className="text-xs font-bold text-white group-hover:text-rowing-300 transition-colors">
                    {sess.title}
                  </h5>
                  <p className={'text-xs capitalize ' + (sess.status === 'cancelled' ? 'text-rose-300' : 'text-slate-400')}>{sess.status}{sess.change_reason ? ' · ' + sess.change_reason : ''}</p>
                  <button type="button" onClick={(event) => { event.stopPropagation(); navigate(`operations/${sess.id}`); }} className="rounded-lg bg-sky-500/15 px-3 py-2 text-xs font-bold text-sky-200">RSVP / Attendance / Manage</button>

                  {sess.instructions && (
                    <p className="text-[11px] text-slate-300 bg-slate-900/60 p-2 rounded-xl border border-slate-800/50 leading-relaxed">
                      💡 {sess.instructions}
                    </p>
                  )}

                  {/* Exercises Prescribed */}
                  {sess.exercises && sess.exercises.length > 0 && (
                    <div className="space-y-1 pt-1">
                      {sess.exercises.map((se) => (
                        <div
                          key={se.id}
                          className="flex items-center justify-between text-[11px] bg-slate-900/40 px-2 py-1 rounded-lg"
                        >
                          <span className="font-medium text-slate-200 truncate">
                            {se.exercise_name}
                          </span>
                          <span className="font-mono text-rowing-300 font-bold text-[10px] shrink-0 ml-2">
                            {se.target_reps_or_distance || se.target_intensity_split || ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
