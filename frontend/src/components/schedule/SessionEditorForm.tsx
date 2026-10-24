import React, { useRef, useState } from 'react';
import { CalendarDays, Clock3 } from 'lucide-react';
import { Exercise, User } from '../../types';
import { ExercisePrescriptionBuilder } from './ExercisePrescriptionBuilder';
import { toUtcISOString } from '../../lib/dateTime';

export interface ExercisePrescriptionDraft {
  client_id: string;
  exercise_id: number;
  sets: number;
  target_reps?: number;
  target_distance_m?: number;
  target_duration_sec?: number;
  target_split_seconds?: number;
  target_watts?: number;
  target_heart_rate_zone?: string;
  target_rpe?: number;
  target_weight_kg?: number;
  target_stroke_rate?: number;
  rest_interval_sec?: number;
  notes?: string;
}

export interface SessionDraft {
  client_id: string;
  id?: number;
  title: string;
  session_date: string;
  duration_minutes: number;
  session_type: string;
  location: string;
  instructions: string;
  trainer_id?: number;
  exercises?: ExercisePrescriptionDraft[];
  repeat_weeks?: number;
  // Legacy single-exercise draft fields are retained for existing saved drafts.
  exercise_id: number;
  sets: number;
  target_reps?: number;
  target_distance_m?: number;
  target_duration_sec?: number;
  target_split_seconds?: number;
  target_watts?: number;
  target_heart_rate_zone?: string;
  target_rpe?: number;
  target_weight_kg?: number;
  rest_interval_sec?: number;
  target_reps_or_distance: string;
  target_intensity_split: string;
  target_stroke_rate?: number;
}

export const createEmptySessionDraft = (date: string, exerciseId = 0): SessionDraft => ({
  client_id: `session-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  title: '',
  session_date: `${date}T06:00`,
  duration_minutes: 60,
  session_type: 'indoor_erg',
  location: '',
  instructions: '',
  exercise_id: exerciseId,
  sets: 1,
  rest_interval_sec: 120,
  target_reps_or_distance: '',
  target_intensity_split: '',
  repeat_weeks: 1,
});

const formatSplit = (seconds?: number) => seconds ? `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, '0')}` : undefined;

const legacyPrescription = (session: SessionDraft): ExercisePrescriptionDraft | null => session.exercise_id ? ({
  client_id: `exercise-${session.client_id}`,
  exercise_id: session.exercise_id,
  sets: session.sets,
  target_reps: session.target_reps,
  target_distance_m: session.target_distance_m,
  target_duration_sec: session.target_duration_sec,
  target_split_seconds: session.target_split_seconds,
  target_watts: session.target_watts,
  target_heart_rate_zone: session.target_heart_rate_zone,
  target_rpe: session.target_rpe,
  target_weight_kg: session.target_weight_kg,
  target_stroke_rate: session.target_stroke_rate,
  rest_interval_sec: session.rest_interval_sec,
}) : null;

const prescriptionToPayload = (item: ExercisePrescriptionDraft, index: number) => ({
  exercise_id: item.exercise_id,
  order_index: index + 1,
  sets: item.sets,
  target_reps: item.target_reps,
  target_distance_m: item.target_distance_m,
  target_duration_sec: item.target_duration_sec,
  target_split_seconds: item.target_split_seconds,
  target_watts: item.target_watts,
  target_heart_rate_zone: item.target_heart_rate_zone || undefined,
  target_rpe: item.target_rpe,
  target_weight_kg: item.target_weight_kg,
  target_reps_or_distance: item.target_distance_m ? `${item.sets} × ${item.target_distance_m}m` : item.target_reps ? `${item.sets} × ${item.target_reps} reps` : item.target_duration_sec ? `${item.sets} × ${Math.round(item.target_duration_sec / 60)} min` : undefined,
  target_intensity_split: formatSplit(item.target_split_seconds),
  target_stroke_rate: item.target_stroke_rate,
  rest_interval_sec: item.rest_interval_sec,
  notes: item.notes || undefined,
});

export const sessionDraftToPayload = (session: SessionDraft, taxonomyNodeId?: number) => {
  const legacy = legacyPrescription(session);
  const prescriptions = session.exercises?.length ? session.exercises : legacy ? [legacy] : [];
  return {
    trainer_id: session.trainer_id,
    taxonomy_node_id: taxonomyNodeId,
    title: session.title,
    day_of_week: (new Date(session.session_date).getDay() + 6) % 7,
    session_date: toUtcISOString(session.session_date),
    duration_minutes: session.duration_minutes,
    session_type: session.session_type,
    location: session.location || undefined,
    instructions: session.instructions || undefined,
    exercises: prescriptions.map(prescriptionToPayload),
  };
};

export const expandRecurringSession = (session: SessionDraft): SessionDraft[] => Array.from({ length: Math.max(1, session.repeat_weeks || 1) }, (_, index) => {
  if (index === 0) return session;
  const date = new Date(session.session_date);
  date.setDate(date.getDate() + index * 7);
  const offset = date.getTimezoneOffset() * 60000;
  return { ...session, client_id: `${session.client_id}-week-${index + 1}`, session_date: new Date(date.getTime() - offset).toISOString().slice(0, 16), repeat_weeks: 1 };
});

interface Props {
  value: SessionDraft;
  exercises: Exercise[];
  trainers: User[];
  onChange: (value: SessionDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  minDate?: string;
  maxDate?: string;
  allowRecurrence?: boolean;
  saveLabel?: string;
  saving?: boolean;
  timingLocked?: boolean;
}

export const SessionEditorForm: React.FC<Props> = ({ value, exercises, trainers, onChange, onSave, onCancel, minDate, maxDate, allowRecurrence = true, saveLabel = 'Save session', saving = false, timingLocked = false }) => {
  const [templateName, setTemplateName] = useState('');
  const [templates, setTemplates] = useState<Array<{ name: string; draft: SessionDraft }>>(() => {
    try { return JSON.parse(localStorage.getItem('rowing-session-templates') || '[]'); } catch { return []; }
  });
  const dateInputRef = useRef<HTMLInputElement>(null);
  const timeInputRef = useRef<HTMLInputElement>(null);
  const datePart = value.session_date.slice(0, 10);
  const timePart = value.session_date.includes('T') ? value.session_date.slice(11, 16) : '06:00';
  const weekday = datePart ? new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(new Date(`${datePart}T12:00:00`)) : '';
  const dateOutsideSchedule = !timingLocked && Boolean((minDate && datePart < minDate) || (maxDate && datePart > maxDate));
  const legacy = legacyPrescription(value);
  const prescriptions = value.exercises?.length ? value.exercises : legacy ? [legacy] : [];
  const fieldClass = 'mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-white outline-none focus:ring-2 focus:ring-amber-500';
  const update = <K extends keyof SessionDraft>(field: K, fieldValue: SessionDraft[K]) => onChange({ ...value, [field]: fieldValue });
  const openPicker = (input: HTMLInputElement | null) => { input?.focus(); try { input?.showPicker?.(); } catch { /* focus is the fallback */ } };
  const saveTemplate = () => {
    const name = templateName.trim();
    if (!name) return;
    const next = [...templates.filter((item) => item.name.toLowerCase() !== name.toLowerCase()), { name, draft: { ...value, repeat_weeks: 1 } }];
    setTemplates(next);
    localStorage.setItem('rowing-session-templates', JSON.stringify(next));
    setTemplateName('');
  };

  return <div className="space-y-4">
    <div className="grid grid-cols-1 gap-2 rounded-2xl border border-slate-700 bg-slate-950/50 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
      <select defaultValue="" onChange={(event) => { const template = templates.find((item) => item.name === event.target.value); if (template) onChange({ ...template.draft, client_id: value.client_id, id: value.id, session_date: value.session_date }); event.target.value = ''; }} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white"><option value="">Load a session template...</option>{templates.map((item) => <option key={item.name}>{item.name}</option>)}</select>
      <input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Template name" className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white" />
      <button type="button" onClick={saveTemplate} disabled={!templateName.trim()} className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs font-bold text-sky-300 disabled:opacity-40">Save template</button>
    </div>

    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <label className="text-xs font-semibold text-slate-300 md:col-span-2">Session title<input value={value.title} onChange={(event) => update('title', event.target.value)} placeholder="e.g. Technical water session" className={fieldClass} autoFocus /><span className="mt-1 block text-[10px] font-normal text-slate-500">Describe the workout only—the weekday comes from the date.</span></label>
      <fieldset disabled={timingLocked} className="md:col-span-2 disabled:opacity-60"><legend className="flex items-center gap-2 text-xs font-semibold text-slate-300">When is this session?{weekday && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-300">{weekday}</span>}</legend><div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Session date<div className="mt-1 flex items-center gap-2"><CalendarDays className="h-5 w-5 text-amber-400" /><input ref={dateInputRef} type="date" min={minDate} max={maxDate} value={datePart} onChange={(event) => update('session_date', `${event.target.value}T${timePart}`)} className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-white [color-scheme:dark]" /><button type="button" onClick={() => openPicker(dateInputRef.current)} className="rounded-lg bg-amber-500/15 px-2 py-2 text-amber-300">Choose</button></div></label>
        <label className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Start time<div className="mt-1 flex items-center gap-2"><Clock3 className="h-5 w-5 text-sky-400" /><input ref={timeInputRef} type="time" value={timePart} onChange={(event) => update('session_date', `${datePart}T${event.target.value}`)} className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-white [color-scheme:dark]" /><button type="button" onClick={() => openPicker(timeInputRef.current)} className="rounded-lg bg-sky-500/15 px-2 py-2 text-sky-300">Choose</button></div></label>
      </div>{dateOutsideSchedule && <p className="mt-2 rounded-lg bg-rose-500/10 px-3 py-2 text-[11px] font-semibold text-rose-300">Choose a date from {minDate} to {maxDate}.</p>}</fieldset>
      {allowRecurrence && <label className="text-xs font-semibold text-slate-300">Weekly recurrence<select value={value.repeat_weeks || 1} onChange={(event) => update('repeat_weeks', Number(event.target.value))} className={fieldClass}>{[1, 2, 4, 6, 8, 12].map((count) => <option key={count} value={count}>{count === 1 ? 'Does not repeat' : `Weekly · ${count} occurrences`}</option>)}</select></label>}
      <label className="text-xs font-semibold text-slate-300">Duration (minutes)<input disabled={timingLocked} type="number" min={1} max={1440} value={value.duration_minutes} onChange={(event) => update('duration_minutes', Number(event.target.value))} className={fieldClass} /></label>
      <label className="text-xs font-semibold text-slate-300">Session type<select value={value.session_type} onChange={(event) => update('session_type', event.target.value)} className={fieldClass}><option value="indoor_erg">Indoor erg</option><option value="water_rowing">Water rowing</option><option value="strength_gym">Strength / gym</option><option value="recovery">Recovery</option><option value="cross_training">Cross training</option></select></label>
      <label className="text-xs font-semibold text-slate-300">Assigned trainer<select value={value.trainer_id || ''} onChange={(event) => update('trainer_id', event.target.value ? Number(event.target.value) : undefined)} className={fieldClass}><option value="">Use schedule trainers</option>{trainers.map((trainer) => <option key={trainer.id} value={trainer.id}>{trainer.full_name}</option>)}</select></label>
      <label className="text-xs font-semibold text-slate-300 md:col-span-2">Location<input value={value.location} onChange={(event) => update('location', event.target.value)} className={fieldClass} /></label>
    </div>

    <ExercisePrescriptionBuilder value={prescriptions} exercises={exercises} onChange={(next) => onChange({ ...value, exercises: next })} />
    <label className="block text-xs font-semibold text-slate-300">Session instructions<textarea rows={3} value={value.instructions} onChange={(event) => update('instructions', event.target.value)} placeholder="Warm-up, safety and session-wide coaching notes" className={`${fieldClass} resize-y`} /></label>
    <div className="flex justify-end gap-2 border-t border-slate-800 pt-4"><button type="button" onClick={onCancel} className="px-4 py-2 text-xs font-semibold text-slate-400">Cancel</button><button type="button" onClick={onSave} disabled={saving || !value.title.trim() || !value.session_date || value.duration_minutes < 1 || dateOutsideSchedule || prescriptions.some((item) => !item.exercise_id)} className="rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-slate-950 disabled:opacity-40">{saving ? 'Saving...' : saveLabel}</button></div>
  </div>;
};
