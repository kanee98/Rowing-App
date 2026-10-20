import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Dumbbell,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { Competition, Exercise, SchedulePhase, TaxonomyNode, User } from '../../types';
import { api } from '../../services/api';
import { TaxonomySelector } from '../taxonomy/TaxonomySelector';
import { AssignmentSelector } from './AssignmentSelector';
import { createEmptySessionDraft, expandRecurringSession, SessionDraft, SessionEditorForm, sessionDraftToPayload } from './SessionEditorForm';

interface CreateScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  competitions: Competition[];
  exercises: Exercise[];
  members: User[];
}

const STEPS = [
  { label: 'Details', shortLabel: 'Plan' },
  { label: 'Participants', shortLabel: 'People' },
  { label: 'Sessions', shortLabel: 'Sessions' },
  { label: 'Review & publish', shortLabel: 'Review' },
];

export const CreateScheduleModal: React.FC<CreateScheduleModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  competitions,
  exercises,
  members,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [season, setSeason] = useState('');
  const [phase, setPhase] = useState<SchedulePhase>('base_endurance');
  const [selectedTaxonomyNode, setSelectedTaxonomyNode] = useState<TaxonomyNode | null>(null);
  const [competitionId, setCompetitionId] = useState<number | ''>('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [submitting, setSubmitting] = useState(false);
  const [athleteIds, setAthleteIds] = useState<number[]>([]);
  const [trainerIds, setTrainerIds] = useState<number[]>([]);
  const [sessions, setSessions] = useState<SessionDraft[]>([]);
  const [editingSession, setEditingSession] = useState<SessionDraft | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setStep(0);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )).filter((element) => element.offsetParent !== null);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const expandedSessions = useMemo(() => sessions.flatMap(expandRecurringSession), [sessions]);
  const plannedSessions = useMemo(() => expandedSessions.map((session) => ({
    starts_at: session.session_date.length === 16 ? `${session.session_date}:00` : session.session_date,
    duration_minutes: session.duration_minutes,
  })), [expandedSessions]);

  const selectedAthletes = members.filter((member) => athleteIds.includes(member.id));
  const selectedTrainers = members.filter((member) => trainerIds.includes(member.id));
  const selectedCompetition = competitions.find((competition) => competition.id === Number(competitionId));

  if (!isOpen) return null;

  const goNext = () => {
    if (step === 0) {
      if (!name.trim()) return alert('Enter a schedule title.');
      if (!startDate || !endDate || new Date(endDate) < new Date(startDate)) return alert('Choose a valid schedule date range.');
    }
    if (step === 1 && athleteIds.length === 0) return alert('Select at least one athlete for this schedule.');
    if (step === 2 && sessions.length === 0) return alert('Create at least one training session.');
    if (step === 2 && expandedSessions.some((session) => session.session_date.slice(0, 10) > endDate)) return alert('A recurring session extends beyond the schedule end date. Reduce its occurrences or extend the schedule.');
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  };

  const handleSubmit = async () => {
    if (step !== STEPS.length - 1) return;
    if (!athleteIds.length) {
      setStep(1);
      alert('Select at least one athlete for this schedule.');
      return;
    }
    setSubmitting(true);
    try {
      await api.createSchedule({
        name,
        description,
        season: season || undefined,
        phase,
        taxonomy_node_id: selectedTaxonomyNode?.id,
        competition_id: competitionId ? Number(competitionId) : undefined,
        start_date: new Date(startDate).toISOString(),
        end_date: new Date(endDate).toISOString(),
        is_active: true,
        athlete_ids: athleteIds,
        trainer_ids: trainerIds,
        sessions: expandedSessions.map((session) => sessionDraftToPayload({
          ...session,
          trainer_id: session.trainer_id || trainerIds[0],
        }, selectedTaxonomyNode?.id)),
      });
      setName(''); setDescription(''); setSeason(''); setPhase('base_endurance');
      setCompetitionId(''); setSelectedTaxonomyNode(null); setAthleteIds([]); setTrainerIds([]); setSessions([]);
      onSuccess();
      onClose();
    } catch (error: any) {
      alert(`Error creating schedule: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const fieldClass = 'w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-xs text-white outline-none focus:ring-2 focus:ring-amber-500';

  const modal = (
    <div className="fixed inset-0 z-50 bg-slate-950/85 p-0 backdrop-blur-sm sm:p-4" role="presentation">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-schedule-title"
        className="mx-auto grid h-[100dvh] w-full grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden border-slate-800 bg-slate-900 text-slate-100 shadow-2xl sm:my-[4dvh] sm:h-[92dvh] sm:max-h-[900px] sm:max-w-5xl sm:rounded-3xl sm:border"
      >
        <header className="border-b border-slate-800 bg-slate-900/95 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400"><Calendar className="h-4 w-4" /></div>
              <div className="min-w-0">
                <h2 id="create-schedule-title" className="truncate text-sm font-bold text-white sm:text-base">Create Squad Training Block</h2>
                <p className="hidden text-xs text-slate-400 sm:block">Build the plan, choose its roster, then review before publishing.</p>
              </div>
            </div>
            <button type="button" onClick={onClose} disabled={submitting} autoFocus className="shrink-0 rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-50" aria-label="Close schedule builder"><X className="h-5 w-5" /></button>
          </div>

          <nav className="mt-3 flex gap-1 overflow-x-auto pb-1 sm:mt-4 sm:grid sm:grid-cols-4" aria-label="Schedule creation steps">
            {STEPS.map((item, index) => (
              <button
                key={item.label}
                type="button"
                onClick={() => index <= step && setStep(index)}
                disabled={index > step}
                aria-current={step === index ? 'step' : undefined}
                className={`flex min-w-[112px] items-center gap-2 rounded-xl px-3 py-2 text-left text-[11px] font-bold transition-colors sm:min-w-0 ${
                  step === index ? 'bg-amber-500 text-slate-950' :
                  index < step ? 'bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20' :
                  'bg-slate-800/70 text-slate-500'
                }`}
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] ${step === index ? 'bg-slate-950/15' : 'bg-slate-950/60'}`}>
                  {index < step ? <Check className="h-3 w-3" /> : index + 1}
                </span>
                <span className="sm:hidden">{item.shortLabel}</span><span className="hidden sm:inline">{item.label}</span>
              </button>
            ))}
          </nav>
        </header>

        <main className="min-h-0 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 sm:py-6">
          <div className="mx-auto w-full max-w-4xl">
            {step === 0 && (
              <section className="space-y-5" aria-labelledby="details-heading">
                <div><h3 id="details-heading" className="text-lg font-extrabold text-white">Plan details</h3><p className="text-xs text-slate-400">Define the training window, purpose, and periodization branch.</p></div>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <label className="text-xs font-semibold text-slate-300 lg:col-span-2">Schedule title
                    <input value={name} onChange={(e) => setName(e.target.value)} className={`${fieldClass} mt-1 text-sm font-medium`} required />
                  </label>
                  <label className="text-xs font-semibold text-slate-300">Target competition
                    <select value={competitionId} onChange={(e) => setCompetitionId(e.target.value ? Number(e.target.value) : '')} className={`${fieldClass} mt-1`}>
                      <option value="">General season training</option>
                      {competitions.map((competition) => <option key={competition.id} value={competition.id}>🏆 {competition.name} ({competition.target_distance_m}m)</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-slate-300">Season label
                    <input value={season} onChange={(e) => setSeason(e.target.value)} className={`${fieldClass} mt-1`} />
                  </label>
                  <label className="text-xs font-semibold text-slate-300">Training phase
                    <select value={phase} onChange={(e) => setPhase(e.target.value as SchedulePhase)} className={`${fieldClass} mt-1`}>
                      <option value="base_endurance">Base Aerobic Endurance (UT2)</option>
                      <option value="strength_build">Strength & Hypertrophy Build</option>
                      <option value="race_pace_peak">Race Pace Peak</option>
                      <option value="taper_recovery">Taper & Regatta Recovery</option>
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-xs font-semibold text-slate-300">Start date<input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={`${fieldClass} mt-1 px-2`} required /></label>
                    <label className="text-xs font-semibold text-slate-300">End date<input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={`${fieldClass} mt-1 px-2`} required /></label>
                  </div>
                  <div className="lg:col-span-2"><TaxonomySelector selectedNodeId={selectedTaxonomyNode?.id} onSelectNode={setSelectedTaxonomyNode} label="Training periodization branch" placeholder="Select or create a branch..." /></div>
                  <label className="text-xs font-semibold text-slate-300 lg:col-span-2">Coaching instructions and focus
                    <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} className={`${fieldClass} mt-1 resize-y`} />
                  </label>
                </div>
              </section>
            )}

            {step === 1 && (
              <section className="space-y-4" aria-labelledby="participants-heading">
                <div><h3 id="participants-heading" className="text-lg font-extrabold text-white">Participants</h3><p className="text-xs text-slate-400">Search athletes and trainers. Availability and workload warnings use the planned session times.</p></div>
                <AssignmentSelector members={members} athleteIds={athleteIds} trainerIds={trainerIds} onAthleteIdsChange={setAthleteIds} onTrainerIdsChange={setTrainerIds} sessions={plannedSessions} />
              </section>
            )}

            {step === 2 && (
              <section className="space-y-4" aria-labelledby="sessions-heading">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div><h3 id="sessions-heading" className="text-lg font-extrabold text-white">Included sessions</h3><p className="text-xs text-slate-400">Create the workouts in this schedule and optionally assign a selected trainer to each one.</p></div>
                  <button type="button" onClick={() => setEditingSession(createEmptySessionDraft(startDate, exercises[0]?.id || 0))} className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-400"><Plus className="h-4 w-4" />Add session</button>
                </div>

                {editingSession && (
                  <div className="rounded-2xl border border-amber-500/30 bg-slate-950/70 p-4 sm:p-5">
                    <div className="mb-4"><h4 className="text-sm font-bold text-white">{sessions.some((session) => session.client_id === editingSession.client_id) ? 'Edit session' : 'Create session'}</h4><p className="text-[11px] text-slate-400">This session will be assigned to the schedule when it is published.</p></div>
                    <SessionEditorForm
                      value={editingSession}
                      exercises={exercises}
                      trainers={selectedTrainers}
                      minDate={startDate}
                      maxDate={endDate}
                      onChange={setEditingSession}
                      onCancel={() => setEditingSession(null)}
                      onSave={() => {
                        setSessions((current) => current.some((session) => session.client_id === editingSession.client_id)
                          ? current.map((session) => session.client_id === editingSession.client_id ? editingSession : session)
                          : [...current, editingSession]);
                        setEditingSession(null);
                      }}
                      saveLabel={sessions.some((session) => session.client_id === editingSession.client_id) ? 'Update session' : 'Add to schedule'}
                    />
                  </div>
                )}

                {sessions.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-700 p-8 text-center text-xs text-slate-400">No sessions yet. Add the first workout for this schedule.</div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {sessions.map((session) => {
                      const prescribedExercises = session.exercises?.length ? session.exercises : [];
                      const exercise = exercises.find((item) => item.id === (prescribedExercises[0]?.exercise_id || session.exercise_id));
                      const trainer = members.find((member) => member.id === session.trainer_id);
                      return (
                        <article key={session.client_id} className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4 sm:p-5">
                          <div className="flex items-start justify-between gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rowing-500/15 text-rowing-300"><Dumbbell className="h-4 w-4" /></div><span className="rounded-lg bg-slate-800 px-2 py-1 text-[10px] font-bold uppercase text-slate-300">{session.session_type.replace(/_/g, ' ')}</span></div>
                          <h4 className="mt-3 text-sm font-bold text-white">{session.title}</h4>{(session.repeat_weeks || 1) > 1 && <span className="mt-1 inline-flex rounded-lg bg-purple-500/10 px-2 py-1 text-[10px] font-bold text-purple-300">Repeats weekly · {session.repeat_weeks} times</span>}
                          <div className="mt-3 space-y-1.5 text-[11px] text-slate-400">
                            <div className="flex items-center gap-2"><Calendar className="h-3.5 w-3.5" />{new Date(session.session_date).toLocaleString()}</div>
                            <div className="flex items-center gap-2"><Clock className="h-3.5 w-3.5" />{session.duration_minutes} minutes</div>
                            {session.location && <div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5" />{session.location}</div>}
                            <div className="flex items-center gap-2"><Users className="h-3.5 w-3.5" />{athleteIds.length} athletes · {trainer ? trainer.full_name : `${trainerIds.length} schedule trainers`}</div>
                          </div>
                          {exercise && <div className="mt-3 rounded-xl bg-slate-900 p-3 text-[11px] text-slate-300">{exercise.name}{prescribedExercises.length > 1 ? ` + ${prescribedExercises.length - 1} more` : ''}{!prescribedExercises.length && session.target_reps_or_distance ? ` · ${session.target_reps_or_distance}` : ''}</div>}
                          <div className="mt-4 flex justify-end gap-2 border-t border-slate-800 pt-3">
                            <button type="button" onClick={() => setSessions((current) => [...current, { ...session, client_id: `session-${Date.now()}-${Math.random().toString(36).slice(2)}`, title: `${session.title} copy`, exercises: session.exercises?.map((item) => ({ ...item, client_id: `exercise-${Date.now()}-${Math.random().toString(36).slice(2)}` })) }])} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/10"><Copy className="h-3.5 w-3.5" />Duplicate</button>
                            <button type="button" onClick={() => setEditingSession({ ...session })} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-bold text-sky-300 hover:bg-sky-500/10"><Pencil className="h-3.5 w-3.5" />Edit</button>
                            <button type="button" onClick={() => { setSessions((current) => current.filter((item) => item.client_id !== session.client_id)); if (editingSession?.client_id === session.client_id) setEditingSession(null); }} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-bold text-rose-300 hover:bg-rose-500/10"><Trash2 className="h-3.5 w-3.5" />Remove</button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {step === 3 && (
              <section className="space-y-5" aria-labelledby="review-heading">
                <div><h3 id="review-heading" className="text-lg font-extrabold text-white">Review and publish</h3><p className="text-xs text-slate-400">Confirm the plan and recipients before notifications are sent.</p></div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <article className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-amber-300">Training plan</h4>
                    <div className="mt-3 text-base font-extrabold text-white">{name}</div>
                    <div className="mt-2 space-y-1 text-xs text-slate-400"><div>{season ? `${season} · ` : ''}{phase.replace('_', ' ')}</div><div>{new Date(startDate).toLocaleDateString()} – {new Date(endDate).toLocaleDateString()}</div>{selectedCompetition && <div className="flex items-center gap-1 text-amber-300"><Trophy className="h-3.5 w-3.5" />{selectedCompetition.name}</div>}</div>
                  </article>
                  <article className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-sky-300">Recipients</h4>
                    <div className="mt-3 flex gap-3"><span className="rounded-xl bg-sky-500/10 px-3 py-2 text-xs font-bold text-sky-300">{selectedAthletes.length} athletes</span><span className="rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300">{selectedTrainers.length} trainers</span></div>
                    <div className="mt-3 flex flex-wrap gap-1.5">{[...selectedAthletes, ...selectedTrainers].slice(0, 8).map((member) => <span key={member.id} className="rounded-lg bg-slate-800 px-2 py-1 text-[10px] text-slate-300">{member.full_name}</span>)}{selectedAthletes.length + selectedTrainers.length > 8 && <span className="px-2 py-1 text-[10px] text-slate-500">+{selectedAthletes.length + selectedTrainers.length - 8} more</span>}</div>
                  </article>
                </div>
                <article className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-300">Sessions ({expandedSessions.length})</h4>
                  <div className="mt-3 divide-y divide-slate-800">{expandedSessions.map((session) => <div key={session.client_id} className="flex flex-col justify-between gap-1 py-3 text-xs sm:flex-row sm:items-center"><span className="font-semibold text-white">{session.title}</span><span className="text-slate-400">{new Date(session.session_date).toLocaleString()} · {session.duration_minutes}m</span></div>)}</div>
                </article>
              </section>
            )}
          </div>
        </main>

        <footer className="flex items-center justify-between gap-3 border-t border-slate-800 bg-slate-900/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-4">
          <button type="button" onClick={onClose} disabled={submitting} className="hidden px-3 py-2 text-xs font-semibold text-slate-400 hover:text-white disabled:opacity-50 sm:block">Cancel</button>
          <span className="text-[11px] font-semibold text-slate-500 sm:hidden">{step + 1} / {STEPS.length}</span>
          <div className="ml-auto flex items-center gap-2">
            {step > 0 && <button type="button" onClick={() => setStep((current) => current - 1)} disabled={submitting} className="flex items-center gap-1.5 rounded-xl border border-slate-700 px-3.5 py-2.5 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-50"><ArrowLeft className="h-4 w-4" />Back</button>}
            {step < STEPS.length - 1 ? (
              <button type="button" onClick={goNext} className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-400">Continue<ArrowRight className="h-4 w-4" /></button>
            ) : (
              <button type="button" onClick={handleSubmit} disabled={submitting} className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-amber-500/20 disabled:opacity-50 sm:px-5">{submitting ? 'Publishing...' : `Publish to ${athleteIds.length}`}<CheckCircle2 className="h-4 w-4" /></button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};
