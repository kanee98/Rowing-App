import React, { useEffect, useMemo, useState } from 'react';
import { CalendarOff, Search, ShieldAlert, UserCheck, Users, X } from 'lucide-react';
import { AvailabilityConflict, User } from '../../types';
import { api } from '../../services/api';
import { AvailabilityModal } from '../availability/AvailabilityModal';

interface AssignmentSelectorProps {
  members: User[];
  athleteIds: number[];
  trainerIds: number[];
  onAthleteIdsChange: (ids: number[]) => void;
  onTrainerIdsChange: (ids: number[]) => void;
  sessions?: { starts_at: string; duration_minutes: number }[];
  excludeScheduleId?: number;
}

const EMPTY_SESSIONS: { starts_at: string; duration_minutes: number }[] = [];

export const AssignmentSelector: React.FC<AssignmentSelectorProps> = ({
  members,
  athleteIds,
  trainerIds,
  onAthleteIdsChange,
  onTrainerIdsChange,
  sessions = EMPTY_SESSIONS,
  excludeScheduleId,
}) => {
  const [tab, setTab] = useState<'athlete' | 'trainer'>('athlete');
  const [search, setSearch] = useState('');
  const [conflicts, setConflicts] = useState<Record<number, AvailabilityConflict>>({});
  const [availabilityMember, setAvailabilityMember] = useState<User | undefined>();
  const [availabilityVersion, setAvailabilityVersion] = useState(0);

  useEffect(() => {
    const userIds = members.filter((member) => member.is_active && ['athlete', 'trainer'].includes(member.role)).map((member) => member.id);
    if (!sessions.length || !userIds.length) {
      setConflicts({});
      return;
    }
    let cancelled = false;
    api.checkAssignmentConflicts({ user_ids: userIds, sessions, exclude_schedule_id: excludeScheduleId })
      .then((items) => {
        if (!cancelled) setConflicts(Object.fromEntries(items.map((item) => [item.user_id, item])));
      })
      .catch(() => { if (!cancelled) setConflicts({}); });
    return () => { cancelled = true; };
  }, [members, sessions, excludeScheduleId, availabilityVersion]);

  const activeMembers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return members
      .filter((member) => member.is_active && member.role === tab)
      .filter((member) => !query || member.full_name.toLowerCase().includes(query) || member.email.toLowerCase().includes(query))
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [members, search, tab]);

  const selectedIds = tab === 'athlete' ? athleteIds : trainerIds;
  const setSelectedIds = tab === 'athlete' ? onAthleteIdsChange : onTrainerIdsChange;
  const selectedMembers = members.filter((member) =>
    (member.role === 'athlete' ? athleteIds : trainerIds).includes(member.id)
  );

  const toggle = (id: number) => {
    setSelectedIds(selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id]);
  };

  const assignableMembers = activeMembers.filter((member) => conflicts[member.id]?.status !== 'safety_restriction');
  const allVisibleSelected = assignableMembers.length > 0 && assignableMembers.every((member) => selectedIds.includes(member.id));

  return (
    <div className="space-y-3 rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <UserCheck className="h-4 w-4 text-amber-400" /> Assign this schedule
          </div>
          <p className="mt-0.5 text-[11px] text-slate-400">Only selected athletes and trainers will see this plan.</p>
        </div>
        <div className="flex rounded-xl border border-slate-700 bg-slate-900 p-1">
          {(['athlete', 'trainer'] as const).map((role) => (
            <button
              key={role}
              type="button"
              onClick={() => { setTab(role); setSearch(''); }}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold capitalize transition-colors ${
                tab === role ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              {role}s ({role === 'athlete' ? athleteIds.length : trainerIds.length})
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={`Search ${tab}s by name or email...`}
          className="w-full rounded-xl border border-slate-700 bg-slate-900 py-2 pl-9 pr-3 text-xs text-white outline-none focus:ring-2 focus:ring-amber-500"
        />
      </div>

      <div className="flex items-center justify-between text-[11px]">
        <span className="font-semibold text-slate-400">{activeMembers.length} matching active {tab}s</span>
        <button
          type="button"
          disabled={!assignableMembers.length}
          onClick={() => {
            if (allVisibleSelected) {
              const visibleIds = new Set(assignableMembers.map((member) => member.id));
              setSelectedIds(selectedIds.filter((id) => !visibleIds.has(id)));
            } else {
              setSelectedIds(Array.from(new Set([...selectedIds, ...assignableMembers.map((member) => member.id)])));
            }
          }}
          className="font-bold text-amber-400 hover:text-amber-300 disabled:opacity-40"
        >
          {allVisibleSelected ? 'Clear visible' : 'Select all visible'}
        </button>
      </div>

      <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
        {activeMembers.map((member) => (
          <label key={member.id} className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 hover:bg-slate-800/80">
            <input
              type="checkbox"
              checked={selectedIds.includes(member.id)}
              onChange={() => toggle(member.id)}
              disabled={conflicts[member.id]?.status === 'safety_restriction'}
              className="h-4 w-4 rounded border-slate-600 bg-slate-900 accent-amber-500"
            />
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-amber-300">
              {member.full_name.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-bold text-slate-100">{member.full_name}</div>
              <div className="truncate text-[10px] text-slate-500">{member.email}</div>
            </div>
            {conflicts[member.id] && conflicts[member.id].status !== 'available' && (
              <span
                title={[...conflicts[member.id].messages, ...conflicts[member.id].conflict_titles].join(' · ')}
                className={`rounded-lg px-2 py-1 text-[10px] font-bold ${
                  conflicts[member.id].status === 'safety_restriction' ? 'bg-rose-500/20 text-rose-300' :
                  conflicts[member.id].status === 'unavailable' ? 'bg-red-500/15 text-red-300' :
                  conflicts[member.id].status === 'time_conflict' ? 'bg-orange-500/15 text-orange-300' :
                  conflicts[member.id].status === 'high_load' ? 'bg-fuchsia-500/15 text-fuchsia-300' :
                  conflicts[member.id].status === 'limited' ? 'bg-amber-500/15 text-amber-300' :
                  'bg-sky-500/15 text-sky-300'
                }`}
              >
                {conflicts[member.id].status === 'safety_restriction' && <ShieldAlert className="mr-1 inline h-3 w-3" />}
                {conflicts[member.id].status === 'scheduled'
                  ? `${conflicts[member.id].same_day_sessions} other session${conflicts[member.id].same_day_sessions === 1 ? '' : 's'}`
                  : conflicts[member.id].status === 'high_load'
                  ? `high load · ${conflicts[member.id].daily_load_minutes}m`
                  : conflicts[member.id].status.replace('_', ' ')}
              </span>
            )}
            {conflicts[member.id]?.same_day_sessions > 0 && conflicts[member.id].status !== 'scheduled' && (
              <span className="rounded-lg bg-sky-500/15 px-2 py-1 text-[10px] font-bold text-sky-300">
                {conflicts[member.id].same_day_sessions} scheduled
              </span>
            )}
            <button
              type="button"
              onClick={(event) => { event.preventDefault(); event.stopPropagation(); setAvailabilityMember(member); }}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-700 hover:text-amber-300"
              aria-label={`Manage ${member.full_name}'s availability`}
              title="Manage availability"
            >
              <CalendarOff className="h-3.5 w-3.5" />
            </button>
            {member.side_preference && <span className="text-[10px] uppercase text-slate-500">{member.side_preference}</span>}
          </label>
        ))}
        {!activeMembers.length && (
          <div className="rounded-xl border border-dashed border-slate-700 py-5 text-center text-xs text-slate-500">
            No matching {tab}s found.
          </div>
        )}
      </div>

      {selectedMembers.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-slate-800 pt-3">
          {selectedMembers.map((member) => (
            <button
              key={member.id}
              type="button"
              onClick={() => member.role === 'athlete'
                ? onAthleteIdsChange(athleteIds.filter((id) => id !== member.id))
                : onTrainerIdsChange(trainerIds.filter((id) => id !== member.id))}
              className="flex items-center gap-1 rounded-lg bg-slate-800 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:bg-slate-700"
            >
              <Users className="h-3 w-3" /> {member.full_name} <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}

      <AvailabilityModal
        isOpen={Boolean(availabilityMember)}
        member={availabilityMember}
        onClose={() => setAvailabilityMember(undefined)}
        onChanged={() => setAvailabilityVersion((value) => value + 1)}
      />
    </div>
  );
};
