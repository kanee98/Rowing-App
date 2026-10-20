import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { Calendar, PlusCircle, BarChart3, CheckSquare, Users, Dumbbell, ShieldCheck } from 'lucide-react';

interface MobileBottomNavProps {
  onOpenLogModal: () => void;
}

// A simple mobile nav that scrolls-to or acts as quick shortcuts per role.
// Tabs are managed internally within each dashboard, so this bar just
// provides role-aware quick actions.
export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ onOpenLogModal }) => {
  const { user } = useAuth();
  if (!user) return null;

  const role = user.role;

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-lg border-t border-slate-800/80 px-2 py-1.5 shadow-2xl">
      <div className="flex items-center justify-around">
        {/* Athlete: quick log button in center */}
        {role === 'athlete' && (
          <>
            <div className="flex flex-col items-center gap-1 py-1 px-3 text-slate-500">
              <Calendar className="w-5 h-5" />
              <span className="text-[10px]">My Plan</span>
            </div>

            {/* Central Fast Log Action Button */}
            <button
              id="tour-mobile-log-btn"
              onClick={onOpenLogModal}
              className="flex flex-col items-center -mt-5"
            >
              <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-rowing-600 to-rowing-400 p-0.5 shadow-lg shadow-rowing-500/30 flex items-center justify-center text-white active:scale-95 transition-transform">
                <PlusCircle className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-bold text-rowing-400 mt-0.5">Log 2k/Erg</span>
            </button>

            <div className="flex flex-col items-center gap-1 py-1 px-3 text-slate-500">
              <BarChart3 className="w-5 h-5" />
              <span className="text-[10px]">History & PB</span>
            </div>
          </>
        )}

        {role === 'coach' && (
          <>
            <div className="flex flex-col items-center gap-1 py-1 px-3 text-slate-400">
              <BarChart3 className="w-5 h-5" />
              <span className="text-[10px]">Analytics</span>
            </div>
            <div className="flex flex-col items-center gap-1 py-1 px-3 text-slate-400">
              <Calendar className="w-5 h-5" />
              <span className="text-[10px]">Calendar</span>
            </div>
            <div className="flex flex-col items-center gap-1 py-1 px-3 text-slate-400">
              <Dumbbell className="w-5 h-5" />
              <span className="text-[10px]">Boathouse</span>
            </div>
          </>
        )}

        {role === 'trainer' && (
          <>
            <div className="flex flex-col items-center gap-1 py-1 px-3 text-slate-400">
              <CheckSquare className="w-5 h-5" />
              <span className="text-[10px]">Verify Queue</span>
            </div>
            <div className="flex flex-col items-center gap-1 py-1 px-3 text-slate-400">
              <Calendar className="w-5 h-5" />
              <span className="text-[10px]">Sessions</span>
            </div>
          </>
        )}

        {role === 'admin' && (
          <>
            <div className="flex flex-col items-center gap-1 py-1 px-3 text-slate-400">
              <ShieldCheck className="w-5 h-5" />
              <span className="text-[10px]">Club Stats</span>
            </div>
            <div className="flex flex-col items-center gap-1 py-1 px-3 text-slate-400">
              <Users className="w-5 h-5" />
              <span className="text-[10px]">Members</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
