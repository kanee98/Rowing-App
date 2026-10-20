import React, { useState, useEffect } from 'react';
import { Exercise, TrainingSession, PerformanceEntry } from '../../types';
import { api } from '../../services/api';
import { X, Flame, Zap, Heart, Activity, CheckCircle2, Clock } from 'lucide-react';
import confetti from 'canvas-confetti';

interface LogPerformanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (entry: PerformanceEntry) => void;
  initialSession?: TrainingSession | null;
  exercises: Exercise[];
}

export const LogPerformanceModal: React.FC<LogPerformanceModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialSession,
  exercises,
}) => {
  const [selectedExerciseId, setSelectedExerciseId] = useState<number>(
    exercises[0]?.id || 0
  );
  const [distanceM, setDistanceM] = useState<number | ''>('');
  const [actualReps, setActualReps] = useState<number | ''>('');
  const [actualWeightKg, setActualWeightKg] = useState<number | ''>('');
  const [timeMin, setTimeMin] = useState<string>('');
  const [timeSec, setTimeSec] = useState<string>('');
  const [calculatedSplit, setCalculatedSplit] = useState<string>('—');
  const [calculatedWatts, setCalculatedWatts] = useState<number | null>(null);
  const [actualWatts, setActualWatts] = useState<number | ''>('');
  const [strokeRate, setStrokeRate] = useState<number | ''>('');
  const [avgHeartRate, setAvgHeartRate] = useState<number | ''>('');
  const [dragFactor, setDragFactor] = useState<number | ''>('');
  const [rpe, setRpe] = useState<number | ''>('');
  const [seatPosition, setSeatPosition] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (exercises.length > 0 && !selectedExerciseId) {
      setSelectedExerciseId(exercises[0].id);
    }
  }, [exercises]);

  useEffect(() => {
    const prescription = initialSession?.exercises?.[0];
    if (!prescription) return;
    setSelectedExerciseId(prescription.exercise_id);
  }, [initialSession]);

  // Recalculate Split & Watts whenever distance or time changes
  useEffect(() => {
    const totalSec = parseFloat(timeMin || '0') * 60 + parseFloat(timeSec || '0');
    const dist = typeof distanceM === 'number' ? distanceM : 0;

    if (dist > 0 && totalSec > 0) {
      const splitSec = (totalSec / dist) * 500.0;
      const m = Math.floor(splitSec / 60);
      const s = (splitSec % 60).toFixed(1);
      setCalculatedSplit(`${m}:${parseFloat(s) < 10 ? '0' : ''}${s}`);

      const pacePerMeter = splitSec / 500.0;
      if (pacePerMeter > 0) {
        const w = Math.round(2.80 / Math.pow(pacePerMeter, 3));
        setCalculatedWatts(w);
      }
    } else {
      setCalculatedSplit('—');
      setCalculatedWatts(null);
    }
  }, [distanceM, timeMin, timeSec]);

  if (!isOpen) return null;

  const selectedExercise = exercises.find((exercise) => exercise.id === selectedExerciseId);
  const selectedPrescription = initialSession?.exercises?.find((item) => item.exercise_id === selectedExerciseId);
  const prescribedExerciseIds = initialSession?.exercises?.map((item) => item.exercise_id) || [];
  const selectableExercises = prescribedExerciseIds.length ? exercises.filter((exercise) => prescribedExerciseIds.includes(exercise.id)) : exercises;
  const isStrength = selectedExercise?.category === 'strength_conditioning' || selectedExercise?.primary_metric === 'reps_weight';
  const isRowing = Boolean(selectedExercise && ['erg_test', 'erg_intervals', 'water_endurance', 'water_intervals', 'technique'].includes(selectedExercise.category));
  const isErg = Boolean(selectedExercise && ['erg_test', 'erg_intervals'].includes(selectedExercise.category));
  const recordsDistance = isRowing || selectedExercise?.primary_metric === 'distance_meters';
  const recordsTime = isRowing || selectedExercise?.primary_metric === 'time_seconds' || selectedExercise?.primary_metric === 'distance_meters';
  const recordsWatts = isRowing || selectedExercise?.primary_metric === 'watts';
  const recordsStrokeRate = isRowing || selectedExercise?.primary_metric === 'stroke_rate';
  const selectExercise = (exerciseId: number) => {
    setSelectedExerciseId(exerciseId);
    setDistanceM('');
    setActualReps('');
    setActualWeightKg('');
    setTimeMin('');
    setTimeSec('');
    setStrokeRate('');
    setActualWatts('');
    setRpe('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const totalSec = parseFloat(timeMin || '0') * 60 + parseFloat(timeSec || '0');
      const entry = await api.recordPerformance({
        exercise_id: selectedExerciseId,
        session_id: initialSession?.id,
        actual_distance_m: recordsDistance && typeof distanceM === 'number' ? distanceM : undefined,
        actual_duration_sec: recordsTime && totalSec > 0 ? totalSec : undefined,
        actual_reps: isStrength && typeof actualReps === 'number' ? actualReps : undefined,
        actual_weight_kg: isStrength && typeof actualWeightKg === 'number' ? actualWeightKg : undefined,
        avg_stroke_rate: recordsStrokeRate && typeof strokeRate === 'number' ? strokeRate : undefined,
        avg_watts: !isRowing && recordsWatts && typeof actualWatts === 'number' ? actualWatts : undefined,
        avg_heart_rate: typeof avgHeartRate === 'number' ? avgHeartRate : undefined,
        drag_factor: isRowing && typeof dragFactor === 'number' ? dragFactor : undefined,
        perceived_exertion_rpe: typeof rpe === 'number' ? rpe : undefined,
        stroke_seat_position: seatPosition || undefined,
        athlete_notes: notes,
      });

      try {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.7 },
        });
      } catch (err) {}

      onSuccess(entry);
      onClose();
    } catch (err: any) {
      alert(`Error logging workout: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const rpeLabels: Record<number, string> = {
    1: '1 - Rest / Very Light Recovery',
    3: '3 - Easy UT2 Aerobic Pace',
    5: '5 - Moderate Aerobic Steady State',
    7: '7 - Hard Aerobic Threshold (AT)',
    8: '8 - Very Hard / Regatta Pace',
    9: '9 - Extremely Hard / 2k Test',
    10: '10 - Maximum All-Out Exhaustion',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-slate-100 animate-in fade-in zoom-in-95 duration-150 my-8">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <span className="text-xs font-bold text-rowing-400 uppercase tracking-wider">
              {initialSession ? `Session: ${initialSession.title}` : 'Dock / Boathouse Log'}
            </span>
            <h2 className="text-lg sm:text-xl font-extrabold text-white">
              Record Workout Performance
            </h2>
          </div>

          {selectedPrescription && (
            <div className="rounded-xl border border-rowing-500/20 bg-rowing-500/5 p-3 text-xs text-slate-300">
              <p className="mb-1 font-bold uppercase tracking-wide text-rowing-300">Coach prescription — reference only</p>
              <p>
                {selectedPrescription.sets > 1 ? `${selectedPrescription.sets} sets` : '1 set'}
                {selectedPrescription.target_reps ? ` · ${selectedPrescription.target_reps} reps` : ''}
                {selectedPrescription.target_distance_m ? ` · ${selectedPrescription.target_distance_m} m` : ''}
                {selectedPrescription.target_weight_kg ? ` · ${selectedPrescription.target_weight_kg} kg` : ''}
                {selectedPrescription.target_stroke_rate ? ` · ${selectedPrescription.target_stroke_rate} spm` : ''}
                {selectedPrescription.target_rpe ? ` · RPE ${selectedPrescription.target_rpe}` : ''}
              </p>
            </div>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          {/* Exercise Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Exercise / Piece Prescribed
            </label>
            <select
              value={selectedExerciseId}
              onChange={(e) => selectExercise(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-rowing-500 font-medium"
            >
              {selectableExercises.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name} ({ex.category.replace('_', ' ')})
                </option>
              ))}
            </select>
          </div>

          {isStrength ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div><label className="mb-1.5 block text-xs font-semibold text-slate-300">Completed reps</label><input type="number" min={1} value={actualReps} onChange={(event) => setActualReps(event.target.value ? Number(event.target.value) : '')} placeholder="e.g. 25" className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-sm text-white" required /></div>
              <div><label className="mb-1.5 block text-xs font-semibold text-slate-300">Working load (kg)</label><input type="number" min={0.1} step={0.5} value={actualWeightKg} onChange={(event) => setActualWeightKg(event.target.value ? Number(event.target.value) : '')} placeholder="e.g. 80" className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-sm text-white" required /></div>
            </div>
          ) : <div className={`grid grid-cols-1 gap-3 ${recordsDistance && recordsTime ? 'sm:grid-cols-2' : ''}`}>
            {recordsDistance && <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Actual Distance (Meters)
              </label>
              <input
                type="number"
                value={distanceM}
                onChange={(e) => setDistanceM(e.target.value ? Number(e.target.value) : '')}
                placeholder="2000"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-rowing-500"
                required
              />
            </div>}

            {recordsTime && <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Total Duration (MM : SS.S)
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={timeMin}
                  onChange={(e) => setTimeMin(e.target.value)}
                  placeholder="06"
                  className="w-16 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-center text-white font-mono focus:outline-none focus:ring-2 focus:ring-rowing-500"
                  required
                />
                <span className="text-slate-500 font-bold">:</span>
                <input
                  type="text"
                  value={timeSec}
                  onChange={(e) => setTimeSec(e.target.value)}
                  placeholder="40.0"
                  className="w-24 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-center text-white font-mono focus:outline-none focus:ring-2 focus:ring-rowing-500"
                  required
                />
              </div>
            </div>}
          </div>}

          {/* Instant Computed Split & Power Display Cards */}
          {isRowing && <div className={`grid gap-3 p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 ${isErg ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-rowing-500/10 text-rowing-400 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                  Computed /500m Split
                </p>
                <p className="text-lg font-extrabold text-white font-mono">
                  {calculatedSplit}
                </p>
              </div>
            </div>

            {isErg && <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                  Concept2 Est. Watts
                </p>
                <p className="text-lg font-extrabold text-amber-400 font-mono">
                  {calculatedWatts === null ? '—' : `${calculatedWatts} W`}
                </p>
              </div>
            </div>}
          </div>}

          {!isRowing && recordsWatts && <div><label className="mb-1 block text-xs font-semibold text-slate-300">Actual average power (watts)</label><input type="number" min={1} value={actualWatts} onChange={(event) => setActualWatts(event.target.value ? Number(event.target.value) : '')} className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white" required /></div>}

          {/* Stroke Rate, Heart Rate, Drag Factor */}
          <div className={`grid gap-3 ${isRowing ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1'}`}>
            {recordsStrokeRate && <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Stroke Rate (SPM)
              </label>
              <input
                type="number"
                value={strokeRate}
                onChange={(e) => setStrokeRate(e.target.value ? Number(e.target.value) : '')}
                placeholder="Optional"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-rowing-500"
              />
            </div>}

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Avg HR (BPM)
              </label>
              <input
                type="number"
                value={avgHeartRate}
                onChange={(e) => setAvgHeartRate(e.target.value ? Number(e.target.value) : '')}
                placeholder="Optional"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-rowing-500"
              />
            </div>

            {isRowing && <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Drag Factor
              </label>
              <input
                type="number"
                value={dragFactor}
                onChange={(e) => setDragFactor(e.target.value ? Number(e.target.value) : '')}
                placeholder="Optional"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-rowing-500"
              />
            </div>}
          </div>

          {/* Seat Position & Boat Lineup */}
          <div className={`grid grid-cols-1 gap-3 ${isRowing ? 'sm:grid-cols-2' : ''}`}>
            {isRowing && <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Boat / Seat Position
              </label>
              <select
                value={seatPosition}
                onChange={(e) => setSeatPosition(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-rowing-500"
              >
                <option value="">Select boat or erg position</option>
                <option value="Concept2 Erg">Concept2 Ergometer</option>
                <option value="Single (1x)">Single Scull (1x)</option>
                <option value="Double (2x) - Bow">Double (2x) - Bow</option>
                <option value="Double (2x) - Stroke">Double (2x) - Stroke</option>
                <option value="Four (4-) - Stroke">Four (4-) - Stroke</option>
                <option value="Eight (8+) - Engine Room (4/5/6)">Eight (8+) - Engine Room (4/5/6)</option>
                <option value="Eight (8+) - Bow Pair (1/2)">Eight (8+) - Bow Pair (1/2)</option>
              </select>
            </div>}

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Perceived Exertion (RPE)</label>
              <select value={rpe} onChange={(e) => setRpe(e.target.value ? Number(e.target.value) : '')} required className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200">
                <option value="">Select effort</option>
                {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{rpeLabels[value] || `${value}/10 Effort`}</option>)}
              </select>
              <span className="text-[10px] text-slate-400 font-medium truncate block">
                {typeof rpe === 'number' ? (rpeLabels[rpe] || `${rpe}/10 Effort`) : 'Required for session-load analytics'}
              </span>
            </div>
          </div>

          {/* Athlete Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              {isStrength ? 'Athlete Notes & Lifting Quality' : isRowing ? 'Athlete Notes & Race Rhythm Sensation' : 'Athlete Notes'}
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Negative split the last 500m, high leg drive, good catch lock..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rowing-500"
            />
          </div>

          {/* Submit Action */}
          <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-rowing-600 to-rowing-500 hover:from-rowing-500 hover:to-rowing-400 rounded-xl shadow-lg shadow-rowing-500/25 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Save & Submit for Verification'}
              <CheckCircle2 className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
