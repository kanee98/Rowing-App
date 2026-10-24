import React, { useState, useEffect } from 'react';
import { User, Club, UserRole } from '../../types';
import { api } from '../../services/api';
import { ShieldCheck, PlusCircle, Copy } from 'lucide-react';
import { MembersManager } from './MembersManager';
import { MembershipManager } from '../membership/MembershipManager';
import { BoathouseWeatherWidget } from '../weather/BoathouseWeatherWidget';
import { useNavigation, useNavigationScroll } from '../../context/NavigationContext';

export const AdminDashboard: React.FC = () => {
  const [club, setClub] = useState<Club | null>(null);
  const [members, setMembers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [invitationRequest, setInvitationRequest] = useState<{ role: UserRole; key: number }>();
  const { destination, navigate } = useNavigation();
  useNavigationScroll(destination.view === 'members' ? 'tour-member-management' : destination.view === 'membership' ? 'membership-center' : destination.view === 'conditions' ? 'boathouse-conditions' : destination.view === 'overview' ? 'tour-club-overview' : undefined, !loading);

  const openInvitation = (role: UserRole) => {
    setInvitationRequest({ role, key: Date.now() });
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [c, mList] = await Promise.all([
        api.getCurrentClub(),
        api.getClubMembers(),
      ]);
      setClub(c);
      setMembers(mList);
    } catch (err) {
      console.warn('Failed loading admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCopyCode = () => {
    if (club?.code) {
      navigator.clipboard.writeText(club.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const athletes = members.filter((m) => m.role === 'athlete' && m.is_active);
  const coaches = members.filter((m) => m.role === 'coach' && m.is_active);
  const trainers = members.filter((m) => m.role === 'trainer' && m.is_active);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
      {/* Top Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-purple-950/80 via-slate-900 to-slate-950 border border-purple-500/30 p-6 sm:p-8 shadow-xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" /> Club Administration
              </span>
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                Club Code: {club?.code || '—'}
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              {club?.name || 'Club'} Administration
            </h2>
            <p className="text-sm text-slate-300 max-w-xl mt-1">
              Manage club staff, roster profiles, roles, and access.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => navigate('operations')} className="rounded-xl bg-sky-600 px-4 py-2.5 text-xs font-bold text-white">Club operations</button>
            <button type="button" onClick={() => openInvitation('coach')} className="flex items-center gap-2 rounded-2xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-400">
              <PlusCircle className="h-4 w-4" /> Invite Coach
            </button>
            <button type="button" onClick={() => openInvitation('trainer')} className="flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs font-bold text-emerald-200 hover:bg-emerald-500/20">
              <PlusCircle className="h-4 w-4" /> Invite Trainer
            </button>
            <button
              onClick={handleCopyCode}
              className="px-4 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 flex items-center gap-2 transition-all"
            >
              <Copy className="w-4 h-4 text-purple-400" />
              <span>{copied ? 'Copied Code!' : `Copy Club Code (${club?.code})`}</span>
            </button>

            <button
              onClick={() => document.getElementById('membership-center')?.scrollIntoView({ behavior: 'smooth' })}
              className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-purple-500/25 flex items-center gap-2 active:scale-95 transition-all"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Manage Access</span>
            </button>
          </div>
        </div>
      </div>

      {/* Vital Metric Cards */}
      <div id="tour-club-overview" className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Athletes
          </span>
          <span className="text-2xl font-black text-white font-mono">{athletes.length}</span>
          <span className="text-[10px] text-slate-500 block mt-1">Active Rowers</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Coaches
          </span>
          <span className="text-2xl font-black text-amber-400 font-mono">{coaches.length}</span>
          <span className="text-[10px] text-slate-500 block mt-1">Head & Squad Coaches</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Trainers
          </span>
          <span className="text-2xl font-black text-emerald-400 font-mono">{trainers.length}</span>
          <span className="text-[10px] text-slate-500 block mt-1">Water & Gym Supervisors</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Total Members
          </span>
          <span className="text-2xl font-black text-purple-400 font-mono">{members.length}</span>
          <span className="text-[10px] text-slate-500 block mt-1">Including suspended accounts</span>
        </div>
      </div>

      <BoathouseWeatherWidget userRole="admin" />
      <div id="membership-center" className="scroll-mt-24">
        <MembershipManager userRole="admin" onChanged={loadData} invitationRequest={invitationRequest} />
      </div>

      <MembersManager onChanged={loadData} />
    </div>
  );
};
