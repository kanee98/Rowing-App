import React, { useEffect, useState } from 'react';
import { Building2, CheckCircle2, KeyRound, Search, UserPlus, X } from 'lucide-react';
import { api } from '../../services/api';
import { BoatSidePreference, ClubInvitationPreview, ClubPublic } from '../../types';
import { useAuth } from '../../context/AuthContext';

interface Props { isOpen: boolean; onClose: () => void; inviteToken?: string; }
const field = 'w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-rowing-500';

export const MembershipAccessModal: React.FC<Props> = ({ isOpen, onClose, inviteToken }) => {
  const { acceptInvitation } = useAuth();
  const [clubCode, setClubCode] = useState(''); const [club, setClub] = useState<ClubPublic | null>(null);
  const [preview, setPreview] = useState<ClubInvitationPreview | null>(null);
  const [fullName, setFullName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [weight, setWeight] = useState<number | ''>(''); const [side, setSide] = useState<BoatSidePreference | ''>('');
  const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [complete, setComplete] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setError(''); setComplete(false);
    if (inviteToken) {
      setLoading(true);
      api.previewClubInvitation(inviteToken).then((result) => { setPreview(result); setEmail(result.email); }).catch((err) => setError(err.message)).finally(() => setLoading(false));
    } else { setPreview(null); }
  }, [isOpen, inviteToken]);

  if (!isOpen) return null;
  const findClub = async () => { setLoading(true); setError(''); try { setClub(await api.findClub(clubCode)); } catch (err: any) { setClub(null); setError(err.message); } finally { setLoading(false); } };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!inviteToken && !club) {
      await findClub();
      return;
    }
    setLoading(true); setError('');
    try {
      if (inviteToken) {
        await acceptInvitation({ token: inviteToken, full_name: fullName, password, weight_kg: weight || undefined, side_preference: side || undefined });
        window.history.replaceState({}, '', window.location.pathname); onClose();
      } else {
        await api.requestClubMembership({ club_code: clubCode, full_name: fullName, email, password, weight_kg: weight || undefined, side_preference: side || undefined });
        setComplete(true);
      }
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  };

  return <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-950/90 p-4 backdrop-blur-sm"><div className="my-8 w-full max-w-lg rounded-3xl border border-slate-700 bg-slate-900 p-5 shadow-2xl sm:p-7">
    <div className="flex items-start justify-between"><div className="flex gap-3"><div className="rounded-xl bg-rowing-500/15 p-2.5 text-rowing-300">{inviteToken ? <KeyRound className="h-5 w-5" /> : <Building2 className="h-5 w-5" />}</div><div><h2 className="text-lg font-extrabold text-white">{inviteToken ? 'Accept club invitation' : 'Join an existing club'}</h2><p className="text-xs text-slate-400">{inviteToken ? 'Create your account using this secure invitation.' : 'Athletes request access; a coach or administrator reviews it.'}</p></div></div><button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button></div>
    {error && <div role="alert" className="mt-4 break-words rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs leading-relaxed text-rose-200">{error}</div>}
    {complete ? <div className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center"><CheckCircle2 className="mx-auto h-9 w-9 text-emerald-400" /><h3 className="mt-2 font-bold text-white">Request sent to {club?.name}</h3><p className="mt-1 text-xs text-slate-300">A coach or administrator must approve your request before you can sign in.</p><button onClick={onClose} className="mt-4 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950">Done</button></div> : <form onSubmit={submit} className="mt-5 space-y-4">
      {!inviteToken && !club && <div><label className="mb-1 block text-xs font-semibold text-slate-300">Club code</label><div className="flex gap-2"><input value={clubCode} onChange={(e) => setClubCode(e.target.value.toUpperCase())} className={field} placeholder="Enter the code provided by your club" required /><button type="button" onClick={findClub} disabled={loading || !clubCode.trim()} className="flex items-center gap-1 rounded-xl bg-rowing-600 px-4 text-xs font-bold text-white disabled:opacity-40"><Search className="h-4 w-4" /> Find</button></div></div>}
      {(club || preview) && <div className="rounded-2xl border border-rowing-500/25 bg-rowing-500/5 p-4"><div className="flex items-start justify-between gap-3"><div><div className="font-bold text-white">{club?.name || preview?.club_name}</div><div className="text-xs text-slate-400">{club?.location || preview?.club_location || 'Location not specified'}{preview ? ` · Invitation for ${preview.role}` : ''}</div></div>{club && <button type="button" onClick={() => { setClub(null); setError(''); }} className="shrink-0 text-[11px] font-semibold text-rowing-300 hover:text-rowing-200">Different club</button>}</div>{club?.athlete_join_policy === 'invite_only' && <div className="mt-2 text-xs text-amber-300">This club is invitation-only. Ask an administrator for a secure invitation link.</div>}{club?.athlete_join_policy === 'closed' && <div className="mt-2 text-xs text-rose-300">This club is not accepting requests.</div>}</div>}
      {(preview || (club && club.athlete_join_policy === 'approval_required')) && <><label className="block text-xs font-semibold text-slate-300">Full name<input value={fullName} onChange={(e) => setFullName(e.target.value)} className={field} required /></label>{!preview && <label className="block text-xs font-semibold text-slate-300">Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} required /></label>}{preview && <div className="text-xs text-slate-400">Account email: <span className="font-semibold text-slate-200">{preview.email}</span></div>}<label className="block text-xs font-semibold text-slate-300">Create password<input type="password" minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={field} required /></label>{(!preview || preview.role === 'athlete') && <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-300">Weight in kg <span className="text-slate-500">(optional)</span><input type="number" min="1" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value ? Number(e.target.value) : '')} className={field} /></label><label className="text-xs font-semibold text-slate-300">Rowing side <span className="text-slate-500">(optional)</span><select value={side} onChange={(e) => setSide(e.target.value as BoatSidePreference | '')} className={field}><option value="">Not set</option><option value="scull">Scull</option><option value="port">Port</option><option value="starboard">Starboard</option><option value="both">Both</option></select></label></div>}<button disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-rowing-600 py-3 text-sm font-bold text-white disabled:opacity-50"><UserPlus className="h-4 w-4" />{loading ? 'Submitting…' : inviteToken ? 'Create account and join' : 'Request to join'}</button></>}
    </form>}
  </div></div>;
};
