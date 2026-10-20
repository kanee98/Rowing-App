import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarPlus, X } from 'lucide-react';
import { Exercise, Schedule, TrainingSession } from '../../types';
import { api } from '../../services/api';
import { createEmptySessionDraft, expandRecurringSession, SessionDraft, SessionEditorForm, sessionDraftToPayload } from './SessionEditorForm';

interface ScheduleSessionModalProps {
  schedule: Schedule | null;
  session?: TrainingSession | null;
  duplicate?: boolean;
  exercises: Exercise[];
  onClose: () => void;
  onSuccess: () => void;
}

const toLocalDateTime = (value: string) => {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const withoutWeekdayPrefix = (title: string) => title.replace(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday):\s*/i, '');

const draftFromSession = (session: TrainingSession): SessionDraft => {
  const exercise = session.exercises[0];
  return {
    client_id: `existing-${session.id}`,
    id: session.id,
    title: withoutWeekdayPrefix(session.title),
    session_date: toLocalDateTime(session.session_date),
    duration_minutes: session.duration_minutes,
    session_type: session.session_type,
    location: session.location || '',
    instructions: session.instructions || '',
    trainer_id: session.trainer_id,
    exercise_id: exercise?.exercise_id || 0,
    exercises: session.exercises.map((item) => ({
      client_id: `existing-exercise-${item.id}`,
      exercise_id: item.exercise_id,
      sets: item.sets,
      target_reps: item.target_reps,
      target_distance_m: item.target_distance_m,
      target_duration_sec: item.target_duration_sec,
      target_split_seconds: item.target_split_seconds,
      target_watts: item.target_watts,
      target_heart_rate_zone: item.target_heart_rate_zone,
      target_rpe: item.target_rpe,
      target_weight_kg: item.target_weight_kg,
      target_stroke_rate: item.target_stroke_rate,
      rest_interval_sec: item.rest_interval_sec,
      notes: item.notes,
    })),
    sets: exercise?.sets || 1,
    target_reps: exercise?.target_reps,
    target_distance_m: exercise?.target_distance_m,
    target_duration_sec: exercise?.target_duration_sec,
    target_split_seconds: exercise?.target_split_seconds,
    target_watts: exercise?.target_watts,
    target_heart_rate_zone: exercise?.target_heart_rate_zone,
    target_rpe: exercise?.target_rpe,
    target_weight_kg: exercise?.target_weight_kg,
    rest_interval_sec: exercise?.rest_interval_sec,
    target_reps_or_distance: exercise?.target_reps_or_distance || '',
    target_intensity_split: exercise?.target_intensity_split || '',
    target_stroke_rate: exercise?.target_stroke_rate,
  };
};

export const ScheduleSessionModal: React.FC<ScheduleSessionModalProps> = ({
  schedule,
  session,
  duplicate = false,
  exercises,
  onClose,
  onSuccess,
}) => {
  const initialDraft = useMemo(() => {
    if (session) {
      const draft = draftFromSession(session);
      return duplicate ? { ...draft, client_id: `copy-${Date.now()}`, id: undefined, title: `${draft.title} copy`, repeat_weeks: 1 } : draft;
    }
    const scheduleDate = schedule?.start_date ? schedule.start_date.slice(0, 10) : new Date().toISOString().slice(0, 10);
    return createEmptySessionDraft(scheduleDate, exercises[0]?.id || 0);
  }, [schedule, session, exercises, duplicate]);
  const [draft, setDraft] = useState<SessionDraft>(initialDraft);
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(initialDraft), [initialDraft]);
  useEffect(() => {
    if (!schedule) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleEscape = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleEscape);
    };
  }, [schedule, onClose]);

  if (!schedule) return null;

  const save = async () => {
    setSaving(true);
    try {
      if (session && !duplicate) {
        await api.updateScheduleSession(schedule.id, session.id, sessionDraftToPayload(draft, session.taxonomy_node_id || schedule.taxonomy_node_id));
      } else {
        const occurrences = expandRecurringSession(draft);
        if (occurrences.some((occurrence) => occurrence.session_date.slice(0, 10) > schedule.end_date.slice(0, 10))) {
          alert('The recurrence extends beyond the schedule end date. Reduce the number of occurrences or extend the schedule.');
          return;
        }
        for (const occurrence of occurrences) {
          await api.addScheduleSession(schedule.id, sessionDraftToPayload(occurrence, schedule.taxonomy_node_id));
        }
      }
      await onSuccess();
      onClose();
    } catch (error: any) {
      alert(`Error saving session: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 bg-slate-950/85 p-0 backdrop-blur-sm sm:p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="schedule-session-title" className="mx-auto grid h-[100dvh] w-full grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-slate-900 text-slate-100 shadow-2xl sm:my-[4dvh] sm:h-[92dvh] sm:max-h-[850px] sm:max-w-4xl sm:rounded-3xl sm:border sm:border-slate-800">
        <header className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300"><CalendarPlus className="h-4 w-4" /></span>
            <div className="min-w-0"><h2 id="schedule-session-title" className="truncate text-sm font-bold text-white">{duplicate ? 'Duplicate session' : session ? 'Edit session' : 'Add session'}</h2><p className="truncate text-xs text-slate-400">{schedule.name}</p></div>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close session editor" className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-50"><X className="h-5 w-5" /></button>
        </header>
        <main className="min-h-0 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 sm:py-6">
          <SessionEditorForm value={draft} exercises={exercises} trainers={schedule.assigned_trainers || []} minDate={schedule.start_date.slice(0, 10)} maxDate={schedule.end_date.slice(0, 10)} allowRecurrence={!session || duplicate} onChange={setDraft} onCancel={onClose} onSave={save} saveLabel={duplicate ? 'Create duplicate' : session ? 'Save changes' : 'Add to schedule'} saving={saving} />
        </main>
      </div>
    </div>,
    document.body,
  );
};
