import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTour } from '../../context/TourContext';
import { 
  Anchor, Compass, ShieldCheck, Dumbbell, Trophy, 
  ChevronDown, CheckCircle2, Sparkles, LogOut, KeyRound, Building2
} from 'lucide-react';
import { NotificationDropdown } from '../notifications/NotificationDropdown';

interface HeaderProps {
  onOpenAuth: (mode: 'login' | 'register') => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenAuth }) => {
  const { user, logout } = useAuth();
  const { availableTours, startTour, isTourCompleted } = useTour();
  const [showTourMenu, setShowTourMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Logo and Club Info */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rowing-600 to-rowing-400 p-0.5 shadow-lg shadow-rowing-500/20 flex items-center justify-center">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Anchor className="w-5 h-5 text-rowing-400 transform -rotate-45" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-extrabold text-base sm:text-lg tracking-tight text-white flex items-center gap-1.5">
                  Regatta<span className="text-rowing-400">Flow</span>
                </h1>
              </div>
              <p className="text-[11px] text-slate-400 font-medium truncate max-w-[140px] sm:max-w-[220px]">
                {user?.club_name || 'Rowing Performance Suite'}
              </p>
            </div>
          </div>

          {/* Center: Role badge for logged-in user */}
          {user && (
            <div className="hidden md:flex items-center bg-slate-950/70 px-3 py-1.5 rounded-xl border border-slate-800 gap-2">
              {user.role === 'coach' && <Trophy className="w-4 h-4 text-amber-400" />}
              {user.role === 'trainer' && <Dumbbell className="w-4 h-4 text-emerald-400" />}
              {user.role === 'athlete' && <Anchor className="w-4 h-4 text-rowing-400" />}
              {user.role === 'admin' && <ShieldCheck className="w-4 h-4 text-purple-400" />}
              <span className="text-xs font-bold text-slate-200 capitalize">{user.role}</span>
              <span className="text-slate-600">|</span>
              <span className="text-xs text-slate-400">{user.club_name}</span>
            </div>
          )}

          {/* Right Actions: Tours Trigger + Notifications + User Menu */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Real-time Notifications Dropdown (for logged-in users) */}
            {user && <NotificationDropdown />}

            {/* Interactive Tour Engine Launcher */}
            <div className="relative">
              <button
                id="tour-guide-trigger-btn"
                onClick={() => setShowTourMenu(!showTourMenu)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/60 shadow-sm transition-all"
              >
                <Compass className="w-4 h-4 text-rowing-400 animate-spin-slow" />
                <span className="hidden sm:inline">Guide & Tours</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {showTourMenu && (
                <div 
                  className="absolute right-0 mt-2 w-72 bg-slate-900 border border-slate-700/80 rounded-2xl p-2 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150"
                  onClick={() => setShowTourMenu(false)}
                >
                  <div className="px-3 py-2 border-b border-slate-800">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Interactive Guided Tours
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Explore end-to-end workflows for your club role anytime.
                    </p>
                  </div>
                  <div className="py-1 space-y-1">
                    {availableTours.map((t) => {
                      const completed = isTourCompleted(t.tour_id);
                      return (
                        <button
                          key={t.tour_id}
                          onClick={() => startTour(t.tour_id)}
                          className="w-full flex items-center justify-between p-2 rounded-xl text-left hover:bg-slate-800/80 text-xs transition-colors group"
                        >
                          <div>
                            <div className="font-semibold text-slate-200 group-hover:text-rowing-300">
                              {t.name}
                            </div>
                            <div className="text-[10px] text-slate-400 line-clamp-1">
                              {t.description}
                            </div>
                          </div>
                          {completed ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 ml-2" />
                          ) : (
                            <span className="text-[10px] font-medium text-rowing-400 px-1.5 py-0.5 rounded bg-rowing-500/10 shrink-0 ml-2">
                              Start
                            </span>
                          )}
                        </button>
                      );
                    })}
                    {availableTours.length === 0 && (
                      <p className="text-xs text-slate-500 px-3 py-2">
                        Sign in to access guided tours for your role.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User Profile / Auth Action */}
            {user ? (
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2 pl-2 border-l border-slate-800 focus:outline-none"
                >
                  <div className="w-8 h-8 rounded-full ring-2 ring-rowing-500/40 overflow-hidden bg-slate-800 shrink-0">
                    {user.avatar_url ? (
                      <img src={user.avatar_url} alt={user.full_name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs font-bold text-rowing-300">
                        {user.full_name.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div className="hidden sm:block text-left">
                    <p className="text-xs font-bold text-slate-200 leading-tight">
                      {user.full_name.split(' ')[0]}
                    </p>
                    <p className="text-[10px] text-slate-400 capitalize">
                      {user.role}
                    </p>
                  </div>
                  <ChevronDown className="w-3 h-3 text-slate-400 hidden sm:block" />
                </button>

                {showUserMenu && (
                  <div 
                    className="absolute right-0 mt-2 w-52 bg-slate-900 border border-slate-700/90 rounded-2xl p-2 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150"
                    onClick={() => setShowUserMenu(false)}
                  >
                    <div className="px-3 py-2 border-b border-slate-800">
                      <p className="text-xs font-bold text-white truncate">{user.full_name}</p>
                      <p className="text-[10px] text-slate-400 truncate">{user.email}</p>
                      <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-rowing-500/20 text-rowing-300">
                        {user.role}
                      </span>
                    </div>

                    <div className="py-1 space-y-0.5">
                      <button
                        onClick={() => onOpenAuth('register')}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors text-left"
                      >
                        <Building2 className="w-3.5 h-3.5 text-purple-400" />
                        <span>Register New Club</span>
                      </button>

                      <div className="my-1 border-t border-slate-800" />

                      <button
                        onClick={logout}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-rose-400 hover:bg-rose-500/10 transition-colors text-left"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onOpenAuth('login')}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white"
                >
                  Log In
                </button>
                <button
                  onClick={() => onOpenAuth('register')}
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-rowing-600 hover:bg-rowing-500 rounded-xl shadow-sm"
                >
                  Join Club
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
