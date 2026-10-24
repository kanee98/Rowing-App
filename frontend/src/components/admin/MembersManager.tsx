import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { User, UserRole, BoatSidePreference } from '../../types';
import { buttonClass, smallButtonClass, inputClass, FormModal, Field } from '../common/FormPanel';

export const MembersManager: React.FC<{ onChanged?: () => void }> = ({ onChanged }) => {
  const { user, logout } = useAuth();
  const [members, setMembers] = useState<User[]>([]);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editing, setEditing] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const load = async () => { try { setMembers(await api.getClubMembers()); } catch (err: any) { setError(err.message); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  const filtered = useMemo(() => members.filter((member) =>
    (member.full_name + ' ' + member.email).toLowerCase().includes(query.toLowerCase()) &&
    (roleFilter === 'all' || member.role === roleFilter) &&
    (statusFilter === 'all' || member.is_active === (statusFilter === 'active'))), [members, query, roleFilter, statusFilter]);
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (!editing) return;
    setBusy(true); setError('');
    try {
      const profile = { full_name: editing.full_name.trim(), weight_kg: editing.weight_kg ?? null, height_cm: editing.height_cm ?? null, side_preference: editing.side_preference || null };
      await api.updateMember(editing.id, user?.role === 'admin' ? { ...profile, role: editing.role, is_active: editing.is_active } : profile);
      if (editing.id === user?.id && (editing.role !== user.role || !editing.is_active)) { logout(); return; }
      setEditing(null); await load(); onChanged?.();
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };
  return <section id="tour-member-management" className="scroll-mt-24 space-y-4">
    <div><h3 className="text-lg font-extrabold text-white">Club members</h3><p className="mt-1 text-xs text-slate-400">Search profiles and manage access. Suspended members cannot sign in; their history is retained.</p></div>
    {error && !editing && <p role="alert" className="rounded-xl bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
    <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]"><Field label="Search members"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or email" className={inputClass} /></Field><Field label="Role"><select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className={inputClass}><option value="all">All roles</option>{['admin', 'coach', 'trainer', 'athlete'].map((role) => <option key={role} value={role}>{role}</option>)}</select></Field><Field label="Account status"><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={inputClass}><option value="all">All accounts</option><option value="active">Active</option><option value="suspended">Suspended</option></select></Field></div>
    <p className="text-xs text-slate-400">{filtered.length} of {members.length} members</p>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{filtered.map((member) => <article key={member.id} className="space-y-2 rounded-2xl border border-slate-800 bg-slate-900 p-4"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h4 className="truncate font-bold text-white">{member.full_name}</h4><p className="break-words text-xs text-slate-400">{member.email}</p></div><span className={'text-xs font-semibold ' + (member.is_active ? 'text-emerald-300' : 'text-rose-300')}>{member.is_active ? 'Active' : 'Suspended'}</span></div><p className="text-xs capitalize text-slate-300">{member.role} · {member.side_preference || 'Side not set'}{member.weight_kg ? ' · ' + member.weight_kg + ' kg' : ''}</p>{(user?.role === 'admin' || member.role === 'athlete') && <button type="button" className={smallButtonClass} onClick={() => { setEditing({ ...member }); setError(''); }}>Edit {user?.role === 'admin' ? 'profile & access' : 'profile'}</button>}</article>)}</div>
    {!filtered.length && <p className="rounded-xl border border-dashed border-slate-700 p-5 text-center text-sm text-slate-400">{loading ? 'Loading members…' : 'No members match these filters.'}</p>}
    {editing && <FormModal title={'Edit ' + editing.full_name} onClose={() => setEditing(null)}><form onSubmit={save} className="space-y-4">
      {error && <p role="alert" className="rounded-xl bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
      <Field label="Full name"><input required value={editing.full_name} onChange={(event) => setEditing({ ...editing, full_name: event.target.value })} className={inputClass} /></Field>
      <p className="text-xs text-slate-400">{editing.email} · Email changes are confirmed by the member through Account settings.</p>
      <div className="grid grid-cols-2 gap-3"><Field label="Weight (kg)"><input type="number" min="1" step="any" value={editing.weight_kg ?? ''} onChange={(event) => setEditing({ ...editing, weight_kg: event.target.value ? Number(event.target.value) : undefined })} className={inputClass} /></Field><Field label="Height (cm)"><input type="number" min="1" step="any" value={editing.height_cm ?? ''} onChange={(event) => setEditing({ ...editing, height_cm: event.target.value ? Number(event.target.value) : undefined })} className={inputClass} /></Field></div>
      <Field label="Rowing side"><select value={editing.side_preference || ''} onChange={(event) => setEditing({ ...editing, side_preference: event.target.value as BoatSidePreference || undefined })} className={inputClass}><option value="">Not set</option>{['port', 'starboard', 'both', 'scull'].map((side) => <option key={side}>{side}</option>)}</select></Field>
      {user?.role === 'admin' && <div className="grid gap-3 sm:grid-cols-2"><Field label="Club role"><select value={editing.role} onChange={(event) => setEditing({ ...editing, role: event.target.value as UserRole })} className={inputClass}>{['admin', 'coach', 'trainer', 'athlete'].map((role) => <option key={role}>{role}</option>)}</select></Field><Field label="Account access"><select value={editing.is_active ? 'active' : 'suspended'} onChange={(event) => setEditing({ ...editing, is_active: event.target.value === 'active' })} className={inputClass}><option value="active">Active</option><option value="suspended">Suspended</option></select></Field></div>}
      <button disabled={busy} className={buttonClass}>{busy ? 'Saving…' : 'Save changes'}</button>
    </form></FormModal>}
  </section>;
};
