import React, { useEffect, useState } from 'react';
import { useAuth } from './context/AuthContext';
import { Header } from './components/common/Header';
import { MobileBottomNav } from './components/common/MobileBottomNav';
import { TourOverlay } from './components/tour/TourOverlay';
import { AthleteDashboard } from './components/athlete/AthleteDashboard';
import { CoachDashboard } from './components/coach/CoachDashboard';
import { TrainerDashboard } from './components/trainer/TrainerDashboard';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { AuthModal } from './components/auth/AuthModal';
import { AccountRecovery, AccountSettings } from './components/auth/AccountSettings';
import { OperationsDashboard } from './components/operations/OperationsDashboard';
import { useNavigation } from './context/NavigationContext';
import { LogPerformanceModal } from './components/performance/LogPerformanceModal';
import { MembershipAccessModal } from './components/membership/MembershipAccessModal';
import { api } from './services/api';
import { Exercise } from './types';
import { Anchor, Building2, Users } from 'lucide-react';

export const AppContent: React.FC = () => {
  const { user, loading } = useAuth();
  const { destination } = useNavigation();
  const [recovery, setRecovery] = useState<{ action?: string; token?: string } | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');
  const [membershipOpen, setMembershipOpen] = useState(false);
  const [inviteToken, setInviteToken] = useState<string | undefined>();
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [exercises, setExercises] = useState<Exercise[]>([]);

  const handleOpenAuth = (mode: 'login' | 'register') => {
    setAuthModalMode(mode);
    setAuthModalOpen(true);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('invite') || undefined;
    if (['password_reset', 'email_change'].includes(params.get('account_action') || '') && params.get('token')) {
      setRecovery({ action: params.get('account_action')!, token: params.get('token')! });
      window.history.replaceState({}, '', window.location.pathname + window.location.hash);
    }
    if (token) {
      setInviteToken(token);
      setMembershipOpen(true);
    }
  }, []);

  const openMembership = () => {
    setAuthModalOpen(false);
    setInviteToken(undefined);
    setMembershipOpen(true);
  };

  const closeMembership = () => {
    setMembershipOpen(false);
    if (new URLSearchParams(window.location.search).has('invite')) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  };

  const handleOpenMobileLog = async () => {
    try {
      const exList = await api.getExercises();
      setExercises(exList);
      setIsLogModalOpen(true);
    } catch (e) {
      setIsLogModalOpen(true);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 space-y-3">
        <div className="w-10 h-10 border-4 border-rowing-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-semibold tracking-wider uppercase">Loading RegattaFlow...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col pb-20 md:pb-10 font-sans">
      {/* Top Header Navigation */}
      <Header onOpenAuth={handleOpenAuth} onJoinClub={openMembership} />

      {/* Main Dynamic Role View */}
      <main className="flex-1">
        {!user ? (
          /* Landing / Unauthenticated View */
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-20 flex flex-col items-center justify-center text-center space-y-8">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-rowing-700 to-rowing-400 flex items-center justify-center shadow-2xl shadow-rowing-600/30">
              <Anchor className="w-10 h-10 text-white -rotate-45" />
            </div>

            <div className="space-y-4">
              <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight">
                Regatta<span className="text-rowing-400">Flow</span>
              </h1>
              <p className="text-base sm:text-lg text-slate-300 max-w-xl mx-auto leading-relaxed">
                The complete performance management platform for competitive rowing clubs.
                Track athletes, build lineups, analyse pace and power — in one place.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <button
                onClick={() => handleOpenAuth('login')}
                className="px-8 py-3.5 rounded-2xl bg-rowing-600 hover:bg-rowing-500 text-white font-bold text-sm shadow-lg shadow-rowing-600/30 transition-all flex items-center gap-2"
              >
                <Anchor className="w-4 h-4" />
                Log In to Your Club
              </button>
              <button
                onClick={openMembership}
                className="px-8 py-3.5 rounded-2xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-200 font-bold text-sm border border-sky-500/30 transition-all flex items-center gap-2"
              >
                <Building2 className="w-4 h-4" />
                Join Existing Club
              </button>
              <button
                onClick={() => handleOpenAuth('register')}
                className="px-8 py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold text-sm border border-slate-700 transition-all flex items-center gap-2"
              >
                <Users className="w-4 h-4" />
                Register New Club
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-8 w-full max-w-2xl">
              {[
                { icon: '🏋️', title: 'Athlete Tracking', desc: 'Log erg pieces, water sets, and gym blocks with split, watts, and stroke rate.' },
                { icon: '📊', title: 'Coach Analytics', desc: 'Compare verified rowing tests, explore lineups, and set regatta targets.' },
                { icon: '✅', title: 'Trainer Verification', desc: 'Review submitted performances and give technical coaching feedback.' },
              ].map((f) => (
                <div key={f.title} className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 text-left space-y-2">
                  <span className="text-2xl">{f.icon}</span>
                  <h3 className="text-sm font-extrabold text-white">{f.title}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        ) : destination.view === 'account' ? <AccountSettings /> : destination.view === 'operations' ? <OperationsDashboard /> : (
          <>
            {user.role === 'coach' && <CoachDashboard />}
            {user.role === 'trainer' && <TrainerDashboard />}
            {user.role === 'athlete' && <AthleteDashboard />}
            {user.role === 'admin' && <AdminDashboard />}
          </>
        )}
      </main>

      {/* Interactive Tour Engine Spotlight Overlay */}
      <TourOverlay />

      {/* Mobile Bottom Dock Bar — only shown when authenticated */}
      {user && (
        <MobileBottomNav
          onOpenLogModal={handleOpenMobileLog}
        />
      )}

      {/* Auth Modal (Login & Club Registration) */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialMode={authModalMode}
        onJoinClub={openMembership}
        onForgotPassword={() => { setAuthModalOpen(false); setRecovery({}); }}
      />

      {recovery && <AccountRecovery {...recovery} onClose={() => { setRecovery(null); if (!user) handleOpenAuth('login'); }} />}

      <MembershipAccessModal
        isOpen={membershipOpen}
        onClose={closeMembership}
        inviteToken={inviteToken}
      />

      {/* Global Quick Log Performance Modal (for mobile bottom button) */}
      <LogPerformanceModal
        isOpen={isLogModalOpen}
        onClose={() => setIsLogModalOpen(false)}
        onSuccess={() => {}}
        exercises={exercises}
      />
    </div>
  );
};

export default AppContent;
