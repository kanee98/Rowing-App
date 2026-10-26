import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, Clipboard, Mail, ShieldCheck, UserCheck, UserPlus, X } from 'lucide-react';
import { api } from '../../services/api';
import { Club, ClubInvitation, ClubJoinRequest, UserRole } from '../../types';

interface Props {
  userRole: 'admin' | 'coach';
  onChanged?: () => void;
  invitationRequest?: { role: UserRole; key: number };
}

const roles: { value: UserRole; label: string; description: string }[] = [
  { value: 'coach', label: 'Coach', description: 'Plan training and manage athletes.' },
  { value: 'trainer', label: 'Trainer', description: 'Supervise sessions and verify results.' },
  { value: 'athlete', label: 'Athlete', description: 'View assigned training and log results.' },
  { value: 'admin', label: 'Administrator', description: 'Manage club members and access.' },
];
const field = 'mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-500';
// API timestamps without an offset represent UTC.
const parseDate = (value: string) => new Date(/(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : value + 'Z');

export const MembershipManager: React.FC<Props> = ({ userRole, onChanged, invitationRequest }) => {
  const [requests, setRequests] = useState<ClubJoinRequest[]>([]);
  const [invitations, setInvitations] = useState<ClubInvitation[]>([]);
  const [club, setClub] = useState<Club | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('athlete');
  const [days, setDays] = useState(7);
  const [createdInvite, setCreatedInvite] = useState<{ link: string; email: string; role: UserRole; emailQueued: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const sectionRef = useRef<HTMLElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const roleLabel = roles.find((item) => item.value === role)!.label;

  const load = async () => {
    const [requestData, inviteData, clubData] = await Promise.all([
      api.getJoinRequests(), api.getClubInvitations(), api.getCurrentClub(),
    ]);
    setRequests(requestData); setInvitations(inviteData); setClub(clubData);
  };
  useEffect(() => {
    load().catch((err) => setError(err.message || 'Unable to load membership information. Please refresh.')).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!invitationRequest || userRole !== 'admin') return;
    setRole(invitationRequest.role);
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    emailRef.current?.focus({ preventScroll: true });
  }, [invitationRequest, userRole]);
  const pending = useMemo(() => requests.filter((item) => item.status === 'pending'), [requests]);

  const review = async (item: ClubJoinRequest, approve: boolean) => {
    setBusy(true); setError('');
    try {
      if (approve) await api.approveJoinRequest(item.id);
      else await api.rejectJoinRequest(item.id);
      await load(); onChanged?.();
    } catch (err: any) { setError(err.message); }
    finally { setBusy(false); }
  };
  const invite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      const created = await api.createClubInvitation({ email: email.trim(), role, expires_days: days });
      if (!created.token) throw new Error('The invitation link was not returned. Revoke the pending invitation and create a new one.');
      const link = new URL(window.location.pathname, window.location.origin);
      link.searchParams.set('invite', created.token);
      setCreatedInvite({ link: link.toString(), email: created.email, role: created.role, emailQueued: Boolean(created.email_queued) });
      setCopied(false); setEmail('');
      await load();
    } catch (err: any) { setError(err.message); }
    finally { setBusy(false); }
  };
  const setPolicy = async (policy: Club['athlete_join_policy']) => {
    setBusy(true); setError('');
    try { setClub(await api.updateClubSettings({ athlete_join_policy: policy })); }
    catch (err: any) { setError(err.message); }
    finally { setBusy(false); }
  };
  const revoke = async (item: ClubInvitation) => {
    setBusy(true); setError('');
    try {
      await api.revokeClubInvitation(item.id);
      if (createdInvite?.email === item.email && createdInvite.role === item.role) setCreatedInvite(null);
      await load();
    } catch (err: any) { setError(err.message); }
    finally { setBusy(false); }
  };
  const resend = async (item: ClubInvitation) => {
    setBusy(true); setError('');
    try {
      const created = await api.resendInvitation(item.id);
      if (!created.token) throw new Error('The replacement invitation link was not returned. Please try again.');
      const link = new URL(window.location.pathname, window.location.origin);
      link.searchParams.set('invite', created.token);
      setCreatedInvite({ link: link.toString(), email: created.email, role: created.role, emailQueued: Boolean(created.email_queued) });
      setCopied(false); await load();
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };

  return <div className="space-y-6">
    {error && <div role="alert" className="break-words rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>}
    <section ref={sectionRef} aria-labelledby={id + '-invite-heading'} className="scroll-mt-24 rounded-3xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
      <div className="flex items-center gap-2"><Mail className="h-5 w-5 text-sky-400" /><h3 id={id + '-invite-heading'} className="text-lg font-extrabold text-white">{userRole === 'admin' ? 'Invite coaches, trainers & athletes' : 'Invite an athlete'}</h3></div>
      <p className="mt-1 text-sm text-slate-400">Choose a role, enter their email, then share the invitation link. They create their own account and password.</p>
      <form onSubmit={invite} className="mt-5 space-y-4">
        {userRole === 'admin' && <fieldset disabled={busy}>
          <legend className="mb-2 text-xs font-semibold text-slate-300">Who would you like to invite?</legend>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {roles.map((item) => <label key={item.value} className={'flex cursor-pointer items-start gap-2 rounded-2xl border p-3 ' + (role === item.value ? 'border-sky-400 bg-sky-500/10' : 'border-slate-700 bg-slate-950/50 hover:border-slate-500')}>
              <input type="radio" name={id + '-role'} value={item.value} checked={role === item.value} onChange={() => setRole(item.value)} className="mt-1 accent-sky-500" />
              <span><span className="block text-sm font-bold text-white">{item.label}</span><span className="mt-1 block text-xs text-slate-400">{item.description}</span></span>
            </label>)}
          </div>
        </fieldset>}
        <div className="grid items-end gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
          <label className="text-xs font-semibold text-slate-300" htmlFor={id + '-email'}>{roleLabel} email address
            <input ref={emailRef} id={id + '-email'} type="email" autoComplete="email" required disabled={busy} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" className={field} />
          </label>
          <label className="text-xs font-semibold text-slate-300" htmlFor={id + '-expiry'}>Link expires after
            <select id={id + '-expiry'} disabled={busy} value={days} onChange={(event) => setDays(Number(event.target.value))} className={field}>
              {[1, 7, 14, 30].map((value) => <option key={value} value={value}>{value} {value === 1 ? 'day' : 'days'}</option>)}
            </select>
          </label>
          <button type="submit" disabled={busy} className="flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-sky-400 disabled:opacity-50"><UserPlus className="h-4 w-4" />{busy ? 'Please wait…' : 'Create ' + roleLabel.toLowerCase() + ' invitation'}</button>
        </div>
        <p className="text-xs text-slate-400">Invitations are single-use. When email delivery is configured, invitations are emailed automatically. You can also copy and share the link manually.</p>
      </form>
      {createdInvite && <div role="status" className="mt-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
        <h4 className="break-words font-bold text-emerald-200">Invitation ready for {createdInvite.email}</h4>
        <p className="mt-1 text-xs text-emerald-100/80">{createdInvite.emailQueued ? 'Invitation email has been sent/queued. Delivery status is available to administrators in Operations → Email delivery.' : 'Email delivery is not configured on this server. Copy and send this link manually.'} You can also copy this single-use link. Save it before leaving this page or use Renew link to generate a replacement.</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input aria-label="Invitation link" readOnly value={createdInvite.link} onFocus={(event) => event.target.select()} className="min-w-0 flex-1 rounded-xl border border-emerald-500/20 bg-slate-950/50 px-3 py-2 text-xs text-emerald-100" />
          <button type="button" onClick={async () => {
            try { await navigator.clipboard.writeText(createdInvite.link); setCopied(true); }
            catch { setError('Copy is unavailable in this browser. Select the invitation link and copy it manually.'); }
          }} className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950"><Clipboard className="h-4 w-4" />{copied ? 'Copied!' : 'Copy invitation link'}</button>
        </div>
      </div>}
      <div className="mt-6 border-t border-slate-800 pt-4">
        <h4 className="text-sm font-bold text-slate-200">Recent invitations</h4>
        <div className="mt-3 space-y-2">{invitations.slice(0, 8).map((item) => {
          const status = item.revoked_at ? 'Revoked' : item.accepted_at ? 'Accepted' : parseDate(item.expires_at) < new Date() ? 'Expired' : 'Pending';
          return <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-950/60 p-3 text-xs">
            <ShieldCheck className="h-4 w-4 text-slate-500" /><div className="min-w-0 flex-1"><div className="truncate font-semibold text-slate-200">{item.email}</div><div className="mt-1 text-slate-400">{roles.find((entry) => entry.value === item.role)?.label} · expires {parseDate(item.expires_at).toLocaleString()}</div></div>
            <span className={'font-semibold ' + (status === 'Accepted' ? 'text-emerald-300' : status === 'Pending' ? 'text-amber-300' : 'text-slate-400')}>{status}</span>
            {(status === 'Pending' || status === 'Expired') && <button type="button" disabled={busy} onClick={() => resend(item)} className="rounded-lg px-2 py-1 text-sky-300 hover:bg-sky-500/10 disabled:opacity-40">Renew link / resend</button>}
            {status === 'Pending' && <button type="button" aria-label={'Revoke invitation for ' + item.email} disabled={busy} onClick={() => revoke(item)} className="rounded-lg px-2 py-1 text-rose-300 hover:bg-rose-500/10 disabled:opacity-40">Revoke</button>}
          </div>;
        })}{!invitations.length && <p className="rounded-xl border border-dashed border-slate-700 p-5 text-center text-xs text-slate-400">{loading ? 'Loading invitations…' : 'No invitations yet. Invite your first team member above.'}</p>}</div>
      </div>
    </section>
    <section className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><div className="flex items-center gap-2"><UserCheck className="h-5 w-5 text-emerald-400" /><h3 className="font-extrabold text-white">Athlete membership requests ({pending.length})</h3></div><p className="mt-1 text-xs text-slate-400">Review athlete requests before granting access. Staff join using an administrator's invitation.</p></div>
        {userRole === 'admin' && club && <label className="text-xs font-semibold text-slate-300">Athlete joining policy<select disabled={busy} value={club.athlete_join_policy} onChange={(event) => setPolicy(event.target.value as Club['athlete_join_policy'])} className={field}><option value="approval_required">Requests require approval</option><option value="invite_only">Athletes by invitation only</option><option value="closed">Membership closed</option></select></label>}
      </div>
      <div className="mt-4 space-y-2">{pending.map((item) => <div key={item.id} className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1"><div className="font-bold text-white">{item.full_name}</div><div className="break-words text-xs text-slate-400">{item.email} · requested {parseDate(item.created_at).toLocaleDateString()}</div><div className="mt-1 text-xs text-slate-500">{item.weight_kg ? item.weight_kg + ' kg' : 'Weight not provided'} · {item.side_preference || 'Side not provided'}</div></div>
        <div className="flex gap-2"><button type="button" disabled={busy} onClick={() => review(item, false)} className="flex items-center gap-1 rounded-xl border border-rose-500/30 px-3 py-2 text-xs font-bold text-rose-300 disabled:opacity-40"><X className="h-4 w-4" />Reject</button><button type="button" disabled={busy} onClick={() => review(item, true)} className="flex items-center gap-1 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-40"><Check className="h-4 w-4" />Approve athlete</button></div>
      </div>)}{!pending.length && <p className="rounded-2xl border border-dashed border-slate-700 p-6 text-center text-xs text-slate-400">{loading ? 'Loading requests…' : 'No pending athlete requests.'}</p>}</div>
    </section>
  </div>;
};
