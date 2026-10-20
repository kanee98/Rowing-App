import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarOff, ShieldAlert, Trash2, X } from 'lucide-react';
import { AvailabilityEntry, AvailabilityStatus, User } from '../../types';
import { api } from '../../services/api';

interface AvailabilityModalProps {
  isOpen: boolean;
  member?: User;
  allowSafetyRestriction?: boolean;
  onClose: () => void;
  onChanged?: () => void;
}

const toLocalInput = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

export const AvailabilityModal: React.FC<AvailabilityModalProps> = ({
  isOpen,
  member,
  allowSafetyRestriction = false,
  onClose,
  onChanged,
}) => {
  const initialStart = new Date();
  initialStart.setMinutes(0, 0, 0);
  const initialEnd = new Date(initialStart.getTime() + 2 * 60 * 60 * 1000);
  const [entries, setEntries] = useState<AvailabilityEntry[]>([]);
  const [startsAt, setStartsAt] = useState(toLocalInput(initialStart));
  const [endsAt, setEndsAt] = useState(toLocalInput(initialEnd));
  const [status, setStatus] = useState<AvailabilityStatus>('unavailable');
  const [reason, setReason] = useState('personal');
  const [coachNotes, setCoachNotes] = useState('');
  const [privateNotes, setPrivateNotes] = useState('');
  const [safetyRestriction, setSafetyRestriction] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const data = await api.getAvailability(member?.id);
    setEntries(data);
  };

  useEffect(() => {
    if (isOpen) load().catch(() => setEntries([]));
  }, [isOpen, member?.id]);

  if (!isOpen) return null;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (new Date(endsAt) <= new Date(startsAt)) {
      alert('The end must be after the start.');
      return;
    }
    setSaving(true);
    try {
      await api.createAvailability({
        user_id: member?.id,
        starts_at: startsAt,
        ends_at: endsAt,
        status,
        reason_category: reason,
        coach_visible_notes: coachNotes || undefined,
        private_notes: privateNotes || undefined,
        is_safety_restriction: allowSafetyRestriction && safetyRestriction,
      });
      setCoachNotes('');
      setPrivateNotes('');
      await load();
      onChanged?.();
    } catch (error: any) {
      alert(`Unable to save availability: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (entryId: number) => {
    try {
      await api.deleteAvailability(entryId);
      await load();
      onChanged?.();
    } catch (error: any) {
      alert(`Unable to remove availability: ${error.message}`);
    }
  };

  const modal = (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-950/85 p-0 backdrop-blur-sm sm:p-4">
      <div className="mx-auto min-h-[100dvh] w-full max-w-2xl space-y-4 bg-slate-900 p-4 shadow-2xl sm:my-[4dvh] sm:min-h-0 sm:max-h-[92dvh] sm:overflow-y-auto sm:rounded-3xl sm:border sm:border-slate-800 sm:p-6">
        <div className="flex items-start justify-between border-b border-slate-800 pb-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-white"><CalendarOff className="h-5 w-5 text-amber-400" /> Availability</h2>
            <p className="mt-1 text-xs text-slate-400">{member ? `Manage ${member.full_name}'s availability` : 'Tell coaches when you are unavailable or limited.'}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={save} className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-300">From
              <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white" required />
            </label>
            <label className="text-xs font-semibold text-slate-300">Until
              <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white" required />
            </label>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-300">Availability
              <select value={status} onChange={(e) => setStatus(e.target.value as AvailabilityStatus)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white">
                <option value="unavailable">Unavailable</option>
                <option value="limited">Limited availability</option>
                <option value="available">Available exception</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-300">Reason category
              <select value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white">
                <option value="personal">Personal commitment</option>
                <option value="work_or_study">Work or study</option>
                <option value="travel">Travel</option>
                <option value="recovery">Recovery</option>
                <option value="medical">Medical restriction</option>
                <option value="club_commitment">Club commitment</option>
              </select>
            </label>
          </div>
          <label className="block text-xs font-semibold text-slate-300">Coach-visible note
            <input value={coachNotes} onChange={(e) => setCoachNotes(e.target.value)} placeholder="e.g. Available after 17:30" className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white" />
          </label>
          {!member && (
            <label className="block text-xs font-semibold text-slate-300">Private note
              <textarea value={privateNotes} onChange={(e) => setPrivateNotes(e.target.value)} placeholder="Visible only to you and administrators" className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white" rows={2} />
            </label>
          )}
          {allowSafetyRestriction && (
            <label className="flex items-start gap-2 rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-xs text-slate-300">
              <input type="checkbox" checked={safetyRestriction} onChange={(e) => setSafetyRestriction(e.target.checked)} className="mt-0.5 accent-rose-500" />
              <span><strong className="flex items-center gap-1 text-rose-300"><ShieldAlert className="h-3.5 w-3.5" /> Safety restriction</strong>This cannot be removed by a coach. Use for medical or safety limits.</span>
            </label>
          )}
          <div className="flex justify-end"><button disabled={saving} className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50">{saving ? 'Saving...' : 'Add availability'}</button></div>
        </form>

        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Current entries</h3>
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-white">
                  <span className="capitalize">{entry.status.replace('_', ' ')}</span>
                  <span className="text-slate-500">·</span><span className="capitalize text-slate-400">{entry.reason_category?.replace('_', ' ')}</span>
                  {entry.is_safety_restriction && <span className="rounded bg-rose-500/10 px-1.5 py-0.5 text-[10px] text-rose-300">Safety restriction</span>}
                </div>
                <div className="mt-1 text-[11px] text-slate-400">{new Date(entry.starts_at).toLocaleString()} – {new Date(entry.ends_at).toLocaleString()}</div>
                {entry.coach_visible_notes && <div className="mt-1 text-[11px] text-slate-300">{entry.coach_visible_notes}</div>}
              </div>
              <button type="button" onClick={() => remove(entry.id)} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-300" aria-label="Remove availability"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          {!entries.length && <div className="rounded-xl border border-dashed border-slate-700 py-5 text-center text-xs text-slate-500">No availability restrictions recorded.</div>}
        </div>
      </div>
    </div>
  );
  return createPortal(modal, document.body);
};
