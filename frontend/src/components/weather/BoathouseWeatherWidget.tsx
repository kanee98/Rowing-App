import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { BoathouseCondition, SafetyFlagStatus } from '../../types';
import { AlertTriangle, Edit3, ShieldCheck, ShieldAlert, X } from 'lucide-react';

interface Props { userRole?: string; onConditionUpdated?: () => void; }
const field = 'mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white';
const utcDate = (value: string) => new Date(/(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : value + 'Z');

export const BoathouseWeatherWidget: React.FC<Props> = ({ userRole, onConditionUpdated }) => {
  const [condition, setCondition] = useState<BoathouseCondition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [flag, setFlag] = useState<SafetyFlagStatus | ''>('');
  const [wind, setWind] = useState('');
  const [direction, setDirection] = useState('');
  const [water, setWater] = useState('');
  const [air, setAir] = useState('');
  const [stream, setStream] = useState('');
  const [notes, setNotes] = useState('');
  const [validHours, setValidHours] = useState(6);
  const [broadcast, setBroadcast] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState('');

  const fetchConditions = async () => {
    try { setCondition(await api.getBoathouseConditions()); setError(''); }
    catch { setError('Conditions could not be refreshed. Current safety status is unavailable.'); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    fetchConditions();
    const interval = setInterval(fetchConditions, 60000);
    return () => clearInterval(interval);
  }, []);

  const openEditor = () => {
    // Reconfirm the flag on every publication. Never preselect permission.
    setFlag('');
    setWind(condition?.wind_speed_knots?.toString() ?? '');
    setDirection(condition?.wind_direction ?? '');
    setWater(condition?.water_temp_c?.toString() ?? '');
    setAir(condition?.air_temp_c?.toString() ?? '');
    setStream(condition?.stream_flow_rate ?? '');
    setNotes(condition?.safety_notes ?? '');
    setSaveError(''); setIsModalOpen(true);
  };
  const handleUpdate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!flag || submitting) return;
    setSubmitting(true); setSaveError('');
    try {
      const numberOrNull = (value: string) => value.trim() === '' ? null : Number(value);
      const updated = await api.updateBoathouseConditions({
        flag_status: flag, wind_speed_knots: numberOrNull(wind),
        wind_direction: direction.trim() || null, water_temp_c: numberOrNull(water),
        air_temp_c: numberOrNull(air), stream_flow_rate: stream.trim() || null,
        safety_notes: notes.trim() || null, valid_for_hours: validHours, broadcast_alert: broadcast,
      });
      setCondition(updated); setError(''); setIsModalOpen(false); onConditionUpdated?.();
    } catch (err: any) { setSaveError(err.message || 'Unable to publish this report. Please try again.'); }
    finally { setSubmitting(false); }
  };

  const expired = condition?.valid_until ? utcDate(condition.valid_until).getTime() <= Date.now() : true;
  const current = !error && condition?.report_status === 'current' && !expired;
  const status = current ? condition!.flag_status : null;
  const outdated = !!condition?.updated_at && !current && !error;
  const style = status === 'green' ? 'border-emerald-500/30 text-emerald-300'
    : status === 'red' ? 'border-rose-500/30 text-rose-300' : 'border-amber-500/30 text-amber-200';
  const Icon = status === 'green' ? ShieldCheck : status === 'red' ? ShieldAlert : AlertTriangle;
  const title = loading ? 'Loading safety report…' : error ? 'Safety status unavailable'
    : outdated ? 'Outdated safety report' : !current ? 'Conditions not reported' : status!.toUpperCase() + ' FLAG';
  const metrics = [
    { label: 'Wind speed', value: condition?.wind_speed_knots != null ? condition.wind_speed_knots + ' kts' : 'Not reported' },
    { label: 'Wind direction', value: condition?.wind_direction || 'Not reported' },
    { label: 'Water temperature', value: condition?.water_temp_c != null ? condition.water_temp_c + ' °C' : 'Not reported' },
    { label: 'Air temperature', value: condition?.air_temp_c != null ? condition.air_temp_c + ' °C' : 'Not reported' },
  ];

  return <>
    <section id="boathouse-conditions" className={'scroll-mt-24 space-y-4 rounded-3xl border bg-slate-900 p-5 sm:p-6 ' + style}>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div><div className="flex items-center gap-2"><Icon className="h-5 w-5 shrink-0" /><h3 className="font-extrabold">{title}</h3></div>
          <p className="mt-2 text-xs text-slate-300">{error || (current ? 'Reported by club staff. Follow the instructions below and your club safety policy.' : 'Ask a coach or administrator to confirm current conditions before relying on this report.')}</p>
        </div>
        {(userRole === 'coach' || userRole === 'admin') && <button type="button" onClick={openEditor} className="flex shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700"><Edit3 className="h-4 w-4" />Publish safety report</button>}
      </div>
      {condition?.updated_at && <p className="text-xs text-slate-400">Reported {utcDate(condition.updated_at).toLocaleString()} · {condition.valid_until ? 'Valid until ' + utcDate(condition.valid_until).toLocaleString() : 'Validity not confirmed'}{!current && condition.flag_status ? ' · Last reported flag: ' + condition.flag_status : ''}</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{metrics.map((metric) => <div key={metric.label} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3"><p className="text-xs text-slate-400">{metric.label}</p><p className="mt-1 text-sm font-bold text-slate-100">{metric.value}</p></div>)}</div>
      <p className="text-xs text-slate-300"><span className="font-semibold">Water current:</span> {condition?.stream_flow_rate || 'Not reported'}</p>
      <p className="whitespace-pre-wrap text-sm text-slate-200">{condition?.safety_notes || 'No club instructions reported.'}</p>
      {error && <button type="button" onClick={fetchConditions} className="text-xs font-bold underline">Retry refresh</button>}
    </section>
    {isModalOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-3 backdrop-blur-sm">
      <section role="dialog" aria-modal="true" aria-labelledby="safety-report-title" className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800 p-5"><div><h3 id="safety-report-title" className="font-extrabold">Publish observed conditions</h3><p className="mt-1 text-xs text-slate-400">Leave unmeasured values empty. Confirm the safety flag.</p></div><button type="button" aria-label="Close safety report" onClick={() => setIsModalOpen(false)} className="rounded-lg p-2 hover:bg-slate-800"><X className="h-5 w-5" /></button></header>
        <form onSubmit={handleUpdate} className="overflow-y-auto p-5">
          <fieldset disabled={submitting} className="space-y-4">
            {saveError && <p role="alert" className="rounded-xl bg-rose-500/10 p-3 text-sm text-rose-200">{saveError}</p>}
            <label className="block text-xs font-semibold">Safety flag<select required value={flag} onChange={(event) => setFlag(event.target.value as SafetyFlagStatus | '')} className={field}><option value="">Select the current flag</option><option value="green">Green</option><option value="amber">Amber</option><option value="red">Red</option></select></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-semibold">Wind speed (knots)<input type="number" min="0" step="any" value={wind} onChange={(event) => setWind(event.target.value)} className={field} /></label>
              <label className="text-xs font-semibold">Wind direction<input maxLength={64} value={direction} onChange={(event) => setDirection(event.target.value)} className={field} /></label>
              <label className="text-xs font-semibold">Water temperature (°C)<input type="number" step="any" value={water} onChange={(event) => setWater(event.target.value)} className={field} /></label>
              <label className="text-xs font-semibold">Air temperature (°C)<input type="number" step="any" value={air} onChange={(event) => setAir(event.target.value)} className={field} /></label>
            </div>
            <label className="block text-xs font-semibold">Water current (optional)<input maxLength={128} value={stream} onChange={(event) => setStream(event.target.value)} className={field} /></label>
            <label className="block text-xs font-semibold">Club restrictions and instructions<textarea rows={3} maxLength={4000} value={notes} onChange={(event) => setNotes(event.target.value)} className={field} /></label>
            <label className="block text-xs font-semibold">Report validity<select value={validHours} onChange={(event) => setValidHours(Number(event.target.value))} className={field}>{[1, 3, 6, 12, 24].map((hours) => <option key={hours} value={hours}>{hours} {hours === 1 ? 'hour' : 'hours'}</option>)}</select></label>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={broadcast} onChange={(event) => setBroadcast(event.target.checked)} />Notify club members in the app</label>
            <div className="flex justify-end gap-2 border-t border-slate-800 pt-4"><button type="button" onClick={() => setIsModalOpen(false)} className="rounded-xl px-4 py-2 text-sm text-slate-400">Cancel</button><button type="submit" className="rounded-xl bg-rowing-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40" disabled={submitting || !flag}>{submitting ? 'Publishing…' : 'Publish report'}</button></div>
          </fieldset>
        </form>
      </section>
    </div>}
  </>;
};
