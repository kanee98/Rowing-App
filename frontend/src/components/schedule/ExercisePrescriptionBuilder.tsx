import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, ChevronDown, ChevronUp, Copy, Plus, Search, Trash2, X } from 'lucide-react';
import { Exercise, ExerciseCategory } from '../../types';
import { api } from '../../services/api';
import type { ExercisePrescriptionDraft } from './SessionEditorForm';

interface Props {
  value: ExercisePrescriptionDraft[];
  exercises: Exercise[];
  onChange: (value: ExercisePrescriptionDraft[]) => void;
}

const makePrescription = (exercise?: Exercise): ExercisePrescriptionDraft => ({
  client_id: `exercise-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  exercise_id: exercise?.id || 0,
  sets: 1,
  target_distance_m: exercise?.default_distance_m,
  target_duration_sec: exercise?.default_duration_sec,
  target_split_seconds: exercise?.default_target_split ? Number(exercise.default_target_split.split(':')[0]) * 60 + Number(exercise.default_target_split.split(':')[1]) : undefined,
  target_stroke_rate: exercise?.default_stroke_rate,
  target_heart_rate_zone: exercise?.target_heart_rate_zone,
  rest_interval_sec: 120,
});

const fieldClass = 'mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-xs text-white outline-none focus:ring-2 focus:ring-amber-500';

export const ExercisePrescriptionBuilder: React.FC<Props> = ({ value, exercises, onChange }) => {
  const [catalog, setCatalog] = useState(exercises);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(value[0]?.client_id || '');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<ExerciseCategory>('erg_intervals');
  const [newMetric, setNewMetric] = useState('split_500m');
  useEffect(() => setCatalog(exercises), [exercises]);
  const matching = useMemo(() => {
    const query = search.trim().toLowerCase();
    return catalog.filter((exercise) => !query || exercise.name.toLowerCase().includes(query) || exercise.category.toLowerCase().includes(query));
  }, [catalog, search]);

  const update = (clientId: string, patch: Partial<ExercisePrescriptionDraft>) => onChange(value.map((item) => item.client_id === clientId ? { ...item, ...patch } : item));
  const move = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= value.length) return;
    const next = [...value];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    onChange(next);
  };

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-950/50 p-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div><h4 className="text-xs font-bold uppercase tracking-wider text-amber-300">Exercise prescription</h4><p className="mt-1 text-[10px] text-slate-500">Add each piece in order. Fields adapt to the exercise’s primary metric.</p></div>
        <div className="flex gap-2"><button type="button" onClick={() => setShowCreate(true)} className="flex items-center justify-center gap-1.5 rounded-xl border border-amber-500/40 px-3 py-2 text-[10px] font-bold text-amber-300"><Plus className="h-3.5 w-3.5" />New library exercise</button><button type="button" disabled={!catalog.length} onClick={() => { const next = makePrescription(catalog[0]); onChange([...value, next]); setExpandedId(next.client_id); }} className="flex items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-3 py-2 text-[10px] font-bold text-slate-950 disabled:opacity-40"><Plus className="h-3.5 w-3.5" />Add exercise</button></div>
      </div>
      <div className="relative mt-3"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter the exercise catalog..." className="w-full rounded-xl border border-slate-700 bg-slate-900 py-2 pl-9 pr-3 text-xs text-white" /></div>

      {value.length === 0 && (matching.length ? <button type="button" onClick={() => { const next = makePrescription(matching[0]); onChange([next]); setExpandedId(next.client_id); }} className="mt-3 w-full rounded-xl border border-dashed border-slate-700 p-6 text-xs font-semibold text-slate-400 hover:border-amber-500/50 hover:text-amber-300">Add the first exercise</button> : <button type="button" onClick={() => setShowCreate(true)} className="mt-3 w-full rounded-xl border border-dashed border-amber-500/40 p-6 text-xs font-semibold text-amber-300">The library is empty — create the first exercise</button>)}

      <div className="mt-3 space-y-3">
        {value.map((item, index) => {
          const exercise = catalog.find((candidate) => candidate.id === item.exercise_id);
          const expanded = expandedId === item.client_id;
          const isStrength = exercise?.category === 'strength_conditioning' || exercise?.primary_metric === 'reps_weight';
          const isRowing = Boolean(exercise && ['erg_test', 'erg_intervals', 'water_endurance', 'water_intervals', 'technique'].includes(exercise.category));
          const usesDistance = isRowing || exercise?.primary_metric === 'distance_meters';
          const usesDuration = isRowing || exercise?.primary_metric === 'time_seconds' || exercise?.primary_metric === 'distance_meters';
          const usesWatts = isRowing || exercise?.primary_metric === 'watts';
          const usesStrokeRate = isRowing || exercise?.primary_metric === 'stroke_rate';
          const totalDistance = item.target_distance_m ? item.sets * item.target_distance_m : undefined;
          const totalReps = item.target_reps ? item.sets * item.target_reps : undefined;
          const totalMinutes = item.target_duration_sec ? item.sets * item.target_duration_sec / 60 : undefined;
          const splitMinutes = Math.floor((item.target_split_seconds || 0) / 60);
          const splitSeconds = Number(((item.target_split_seconds || 0) % 60).toFixed(1));
          return (
            <article key={item.client_id} className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/70">
              <div className="flex items-center gap-2 p-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-[10px] font-bold text-slate-300">{index + 1}</span>
                <button type="button" onClick={() => setExpandedId(expanded ? '' : item.client_id)} className="min-w-0 flex-1 text-left"><span className="block truncate text-xs font-bold text-white">{exercise?.name || 'Choose an exercise'}</span><span className="text-[10px] text-slate-500">{exercise?.primary_metric.replace(/_/g, ' ') || 'No metric selected'}</span></button>
                <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move exercise up" className="rounded p-1 text-slate-400 disabled:opacity-20"><ChevronUp className="h-4 w-4" /></button>
                <button type="button" onClick={() => move(index, 1)} disabled={index === value.length - 1} aria-label="Move exercise down" className="rounded p-1 text-slate-400 disabled:opacity-20"><ChevronDown className="h-4 w-4" /></button>
                <button type="button" onClick={() => { const copy = { ...item, client_id: `exercise-${Date.now()}-${Math.random().toString(36).slice(2)}` }; onChange([...value.slice(0, index + 1), copy, ...value.slice(index + 1)]); setExpandedId(copy.client_id); }} aria-label="Duplicate exercise" className="rounded p-1 text-sky-300"><Copy className="h-4 w-4" /></button>
                <button type="button" onClick={() => onChange(value.filter((candidate) => candidate.client_id !== item.client_id))} aria-label="Remove exercise" className="rounded p-1 text-rose-300"><Trash2 className="h-4 w-4" /></button>
              </div>

              {expanded && <div className="border-t border-slate-800 p-4">
                <label className="text-xs font-semibold text-slate-300">Exercise
                  <select value={item.exercise_id || ''} onChange={(event) => {
                    const selected = catalog.find((candidate) => candidate.id === Number(event.target.value));
                    const defaults = makePrescription(selected);
                    onChange(value.map((candidate) => candidate.client_id === item.client_id ? { ...defaults, client_id: item.client_id } : candidate));
                  }} className={fieldClass}><option value="">Select exercise...</option>{matching.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.category.replace(/_/g, ' ')}</option>)}</select>
                </label>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="text-xs font-semibold text-slate-300">Sets / intervals<input type="number" min={1} value={item.sets} onChange={(event) => update(item.client_id, { sets: Number(event.target.value) })} className={fieldClass} /></label>
                  {isStrength && <label className="text-xs font-semibold text-slate-300">Reps per set<input type="number" min={1} value={item.target_reps || ''} onChange={(event) => update(item.client_id, { target_reps: event.target.value ? Number(event.target.value) : undefined })} className={fieldClass} /></label>}
                  {isStrength && <label className="text-xs font-semibold text-slate-300">Load (kg)<input type="number" min={0.1} step={0.5} value={item.target_weight_kg || ''} onChange={(event) => update(item.client_id, { target_weight_kg: event.target.value ? Number(event.target.value) : undefined })} className={fieldClass} /></label>}
                  {usesDistance && <label className="text-xs font-semibold text-slate-300">Distance per set (m)<input type="number" min={1} value={item.target_distance_m || ''} onChange={(event) => update(item.client_id, { target_distance_m: event.target.value ? Number(event.target.value) : undefined })} className={fieldClass} /></label>}
                  {usesDuration && <label className="text-xs font-semibold text-slate-300">Work per set (min)<input type="number" min={0.1} step={0.1} value={item.target_duration_sec ? item.target_duration_sec / 60 : ''} onChange={(event) => update(item.client_id, { target_duration_sec: event.target.value ? Math.round(Number(event.target.value) * 60) : undefined })} className={fieldClass} /></label>}
                  {isRowing && <label className="text-xs font-semibold text-slate-300">Target /500m split<div className="mt-1 flex items-center gap-1"><input type="number" min={0} value={item.target_split_seconds ? splitMinutes : ''} onChange={(event) => update(item.client_id, { target_split_seconds: event.target.value ? Number(event.target.value) * 60 + splitSeconds : undefined })} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-2 py-2.5 text-center text-xs text-white" /><span>:</span><input type="number" min={0} max={59.9} step={0.1} value={item.target_split_seconds ? splitSeconds : ''} onChange={(event) => update(item.client_id, { target_split_seconds: event.target.value ? splitMinutes * 60 + Number(event.target.value) : undefined })} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-2 py-2.5 text-center text-xs text-white" /></div></label>}
                  {usesWatts && <label className="text-xs font-semibold text-slate-300">Target watts<input type="number" min={1} value={item.target_watts || ''} onChange={(event) => update(item.client_id, { target_watts: event.target.value ? Number(event.target.value) : undefined })} className={fieldClass} /></label>}
                  {usesStrokeRate && <label className="text-xs font-semibold text-slate-300">Stroke rate (SPM)<input type="number" min={1} value={item.target_stroke_rate || ''} onChange={(event) => update(item.client_id, { target_stroke_rate: event.target.value ? Number(event.target.value) : undefined })} className={fieldClass} /></label>}
                  <label className="text-xs font-semibold text-slate-300">Rest between sets (sec)<input type="number" min={0} value={item.rest_interval_sec ?? ''} onChange={(event) => update(item.client_id, { rest_interval_sec: event.target.value ? Number(event.target.value) : undefined })} className={fieldClass} /></label>
                  <label className="text-xs font-semibold text-slate-300">Heart-rate zone<select value={item.target_heart_rate_zone || ''} onChange={(event) => update(item.client_id, { target_heart_rate_zone: event.target.value || undefined })} className={fieldClass}><option value="">Not specified</option>{['UT2', 'UT1', 'AT', 'TR', 'AN', 'Strength'].map((zone) => <option key={zone}>{zone}</option>)}</select></label>
                  <label className="text-xs font-semibold text-slate-300">Target RPE<select value={item.target_rpe || ''} onChange={(event) => update(item.client_id, { target_rpe: event.target.value ? Number(event.target.value) : undefined })} className={fieldClass}><option value="">Not specified</option>{Array.from({ length: 10 }, (_, rpe) => <option key={rpe + 1} value={rpe + 1}>{rpe + 1}/10</option>)}</select></label>
                  <label className="text-xs font-semibold text-slate-300 sm:col-span-2 lg:col-span-4">Exercise notes<input value={item.notes || ''} onChange={(event) => update(item.client_id, { notes: event.target.value })} placeholder="Technique cue or modification specific to this exercise" className={fieldClass} /></label>
                </div>
                {(totalDistance || totalReps || totalMinutes) && <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-emerald-500/5 p-3 text-[10px] text-slate-300"><span className="flex items-center gap-1 font-bold text-emerald-300"><BarChart3 className="h-3.5 w-3.5" />Calculated volume</span>{totalDistance && <span>{totalDistance.toLocaleString()}m</span>}{totalReps && <span>{totalReps} reps</span>}{totalMinutes && <span>{Number(totalMinutes.toFixed(1))} min</span>}</div>}
              </div>}
            </article>
          );
        })}
      </div>
      {showCreate && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/85 p-4"><form onSubmit={async (event) => { event.preventDefault(); setCreating(true); try { const created = await api.createExercise({ name: newName, category: newCategory, primary_metric: newMetric }); setCatalog((current) => [...current, created]); const next = makePrescription(created); onChange([...value, next]); setExpandedId(next.client_id); setShowCreate(false); setNewName(''); } catch (error: any) { alert(error.message); } finally { setCreating(false); } }} className="w-full max-w-md space-y-4 rounded-3xl border border-slate-700 bg-slate-900 p-5"><div className="flex items-center justify-between"><div><h4 className="font-extrabold text-white">Create library exercise</h4><p className="text-[11px] text-slate-400">Create the reusable definition now; enrich its optional defaults later in Exercise library.</p></div><button type="button" onClick={() => setShowCreate(false)}><X className="h-5 w-5 text-slate-400" /></button></div><label className="block text-xs font-semibold text-slate-300">Name<input autoFocus required value={newName} onChange={(event) => setNewName(event.target.value)} className={fieldClass} /></label><label className="block text-xs font-semibold text-slate-300">Category<select value={newCategory} onChange={(event) => setNewCategory(event.target.value as ExerciseCategory)} className={fieldClass}>{['erg_test', 'erg_intervals', 'water_endurance', 'water_intervals', 'strength_conditioning', 'technique', 'cross_training'].map((category) => <option key={category} value={category}>{category.replace(/_/g, ' ')}</option>)}</select></label><label className="block text-xs font-semibold text-slate-300">Primary analytics metric<select value={newMetric} onChange={(event) => setNewMetric(event.target.value)} className={fieldClass}>{['split_500m', 'time_seconds', 'distance_meters', 'watts', 'reps_weight', 'stroke_rate', 'heart_rate', 'rpe'].map((metric) => <option key={metric} value={metric}>{metric.replace(/_/g, ' ')}</option>)}</select></label><button disabled={creating} className="w-full rounded-xl bg-amber-500 py-2.5 text-xs font-bold text-slate-950 disabled:opacity-50">{creating ? 'Creating…' : 'Create and add to session'}</button></form></div>}
    </div>
  );
};
