import type { UserRole } from '../types';

const views: Record<UserRole, string[]> = {
  coach: ['analytics', 'calendar', 'schedules', 'competitions', 'taxonomy', 'conditions', 'equipment', 'exercises', 'membership', 'verify', 'operations', 'account'],
  athlete: ['today', 'calendar', 'history', 'conditions', 'operations', 'account'],
  trainer: ['verify', 'sessions', 'conditions', 'operations', 'account'],
  admin: ['overview', 'members', 'membership', 'conditions', 'operations', 'account'],
};

export const resolveDestination = (role: UserRole | undefined, action: string) => {
  const [raw, target] = action.replace(/^#/, '').split('/');
  const aliases: Record<string, string> = {
    weather: 'conditions',
    schedules: role === 'athlete' ? 'today' : role === 'trainer' ? 'sessions' : 'schedules',
    history: role === 'athlete' ? 'history' : role === 'coach' ? 'analytics' : 'verify',
  };
  const candidate = aliases[raw] || raw;
  const allowed = role ? views[role] : [];
  return {
    view: allowed.includes(candidate) ? candidate : allowed[0] || '',
    target: /^\d+$/.test(target || '') && Number.isSafeInteger(Number(target)) && Number(target) > 0 ? Number(target) : undefined,
  };
};
