import { PerformanceEntry } from '../types';

export interface DisplayMetric { label: string; value: string; }

const duration = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, '0')}`;

export const performanceMetrics = (entry: PerformanceEntry): DisplayMetric[] => {
  if (entry.actual_reps || entry.actual_weight_kg) {
    return [
      entry.actual_reps ? { label: 'Reps', value: String(entry.actual_reps) } : null,
      entry.actual_weight_kg ? { label: 'Load', value: `${entry.actual_weight_kg} kg` } : null,
      entry.actual_reps && entry.actual_weight_kg ? { label: 'Volume', value: `${Math.round(entry.actual_reps * entry.actual_weight_kg)} kg·reps` } : null,
      entry.perceived_exertion_rpe ? { label: 'RPE', value: `${entry.perceived_exertion_rpe}/10` } : null,
      entry.avg_heart_rate ? { label: 'Avg HR', value: `${entry.avg_heart_rate} bpm` } : null,
    ].filter(Boolean) as DisplayMetric[];
  }
  return [
    entry.actual_distance_m ? { label: 'Distance', value: `${entry.actual_distance_m.toLocaleString()}m` } : null,
    entry.actual_duration_sec ? { label: 'Duration', value: duration(entry.actual_duration_sec) } : null,
    entry.avg_split_formatted ? { label: 'Split /500m', value: entry.avg_split_formatted } : null,
    entry.avg_watts ? { label: 'Watts', value: `${Math.round(entry.avg_watts)}W` } : null,
    entry.avg_stroke_rate ? { label: 'Cadence', value: `${entry.avg_stroke_rate} spm` } : null,
    entry.avg_heart_rate ? { label: 'Avg HR', value: `${entry.avg_heart_rate} bpm` } : null,
    entry.perceived_exertion_rpe ? { label: 'RPE', value: `${entry.perceived_exertion_rpe}/10` } : null,
  ].filter(Boolean) as DisplayMetric[];
};

export const primaryPerformanceValue = (entry: PerformanceEntry) => performanceMetrics(entry)[0]?.value || 'Result recorded';
