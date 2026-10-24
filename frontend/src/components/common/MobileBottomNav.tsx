import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigation } from '../../context/NavigationContext';
import { Calendar, PlusCircle, BarChart3, CheckSquare, Users, ClipboardList, ShieldCheck } from 'lucide-react';

interface Props { onOpenLogModal: () => void; }
const items = {
  athlete: [{ view: 'today', label: 'My Plan', Icon: Calendar }, { view: 'history', label: 'History', Icon: BarChart3 }, { view: 'operations', label: 'RSVP / Club', Icon: ClipboardList }],
  coach: [{ view: 'analytics', label: 'Analytics', Icon: BarChart3 }, { view: 'calendar', label: 'Calendar', Icon: Calendar }, { view: 'operations', label: 'Operations', Icon: ClipboardList }, { view: 'membership', label: 'Members', Icon: Users }],
  trainer: [{ view: 'verify', label: 'Verify Queue', Icon: CheckSquare }, { view: 'sessions', label: 'Sessions', Icon: Calendar }, { view: 'operations', label: 'Operations', Icon: ClipboardList }],
  admin: [{ view: 'overview', label: 'Club Stats', Icon: ShieldCheck }, { view: 'members', label: 'Members', Icon: Users }, { view: 'membership', label: 'Invitations', Icon: PlusCircle }, { view: 'operations', label: 'Operations', Icon: ClipboardList }],
};

export const MobileBottomNav: React.FC<Props> = ({ onOpenLogModal }) => {
  const { user } = useAuth();
  const { destination, navigate } = useNavigation();
  if (!user) return null;
  const links = items[user.role];
  return <nav aria-label="Dashboard navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-800 bg-slate-950/95 px-2 pb-[env(safe-area-inset-bottom)] pt-1.5 backdrop-blur-lg md:hidden">
    <div className="flex items-center justify-around">
      {links.map(({ view, label, Icon }, index) => <React.Fragment key={view}>
        <button type="button" onClick={() => navigate(view)} aria-current={destination.view === view ? 'page' : undefined} className={'flex min-h-12 min-w-14 flex-col items-center justify-center gap-1 rounded-xl px-2 py-1 text-[10px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-rowing-400 ' + (destination.view === view ? 'bg-rowing-500/10 text-rowing-300' : 'text-slate-400 hover:text-white')}>
          <Icon className="h-5 w-5" />{label}
        </button>
        {user.role === 'athlete' && index === 0 && <button type="button" id="tour-mobile-log-btn" onClick={onOpenLogModal} className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl bg-rowing-600 px-4 py-2 text-[10px] font-bold text-white"><PlusCircle className="h-5 w-5" />Log workout</button>}
      </React.Fragment>)}
    </div>
  </nav>;
};
