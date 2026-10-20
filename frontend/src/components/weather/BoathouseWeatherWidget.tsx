import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { BoathouseCondition, SafetyFlagStatus } from '../../types';
import { 
  Waves, Wind, Thermometer, AlertTriangle, ShieldCheck, 
  ShieldAlert, Edit3, X, Sparkles, CheckCircle2, Flag
} from 'lucide-react';

interface BoathouseWeatherWidgetProps {
  userRole?: string;
  onConditionUpdated?: () => void;
}

export const BoathouseWeatherWidget: React.FC<BoathouseWeatherWidgetProps> = ({ 
  userRole, 
  onConditionUpdated 
}) => {
  const [condition, setCondition] = useState<BoathouseCondition | null>(null);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Edit form state
  const [flagStatus, setFlagStatus] = useState<SafetyFlagStatus>('green');
  const [windSpeed, setWindSpeed] = useState<number>(8.0);
  const [windDirection, setWindDirection] = useState<string>('NW Headwind 8 kts');
  const [waterTemp, setWaterTemp] = useState<number>(14.5);
  const [airTemp, setAirTemp] = useState<number>(17.0);
  const [streamFlow, setStreamFlow] = useState<string>('Moderate Stream (1.2 m/s)');
  const [safetyNotes, setSafetyNotes] = useState<string>('');
  const [broadcastAlert, setBroadcastAlert] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState(false);

  const fetchConditions = async () => {
    try {
      const data = await api.getBoathouseConditions();
      setCondition(data);
      setFlagStatus(data.flag_status);
      setWindSpeed(data.wind_speed_knots);
      setWindDirection(data.wind_direction);
      setWaterTemp(data.water_temp_c);
      setAirTemp(data.air_temp_c);
      setStreamFlow(data.stream_flow_rate);
      setSafetyNotes(data.safety_notes);
    } catch (e) {
      console.warn('Failed to load boathouse weather conditions', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConditions();
    const interval = setInterval(fetchConditions, 60000); // 1 min refresh
    return () => clearInterval(interval);
  }, []);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const updated = await api.updateBoathouseConditions({
        flag_status: flagStatus,
        wind_speed_knots: windSpeed,
        wind_direction: windDirection,
        water_temp_c: waterTemp,
        air_temp_c: airTemp,
        stream_flow_rate: streamFlow,
        safety_notes: safetyNotes,
        broadcast_alert: broadcastAlert
      });
      setCondition(updated);
      setIsModalOpen(false);
      if (onConditionUpdated) onConditionUpdated();
    } catch (err) {
      console.error('Failed to update boathouse conditions', err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !condition) {
    return (
      <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 animate-pulse text-slate-500 text-xs">
        Loading boathouse water & weather safety status...
      </div>
    );
  }

  const isCoachOrAdmin = userRole === 'coach' || userRole === 'admin';
  const flag = condition?.flag_status || 'green';

  const flagConfig = {
    green: {
      label: 'GREEN FLAG',
      subtitle: 'River Open • All Shells Cleared',
      badgeBg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
      dotColor: 'bg-emerald-400',
      icon: ShieldCheck,
      description: 'Normal water navigation. Novices and single sculls cleared for water training.'
    },
    amber: {
      label: 'AMBER FLAG',
      subtitle: 'Caution • 8+ & 4- Coxed Only',
      badgeBg: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
      dotColor: 'bg-amber-400',
      icon: AlertTriangle,
      description: 'High stream / strong wind advisory. No single sculls or un-coxed small boats allowed.'
    },
    red: {
      label: 'RED FLAG (RED BOARD)',
      subtitle: 'River Closed • Erg Session Only',
      badgeBg: 'bg-rose-500/10 border-rose-500/30 text-rose-300',
      dotColor: 'bg-rose-500',
      icon: ShieldAlert,
      description: 'Severe weather or hazardous river stream. All on-water outings canceled. Move to RowErgs.'
    }
  }[flag];

  const FlagIcon = flagConfig.icon;

  return (
    <>
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
        {/* Header with Live Flag */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-2xl border ${flagConfig.badgeBg} flex items-center justify-center shrink-0`}>
              <FlagIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-black tracking-wider uppercase border ${flagConfig.badgeBg}`}>
                  <span className={`w-2 h-2 rounded-full ${flagConfig.dotColor} animate-ping`} />
                  {flagConfig.label}
                </span>
                <span className="text-xs font-bold text-slate-200">
                  {flagConfig.subtitle}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {condition?.safety_notes || flagConfig.description}
              </p>
            </div>
          </div>

          {isCoachOrAdmin && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-rowing-300 bg-rowing-500/10 hover:bg-rowing-500/20 border border-rowing-500/30 transition-all shrink-0 self-start sm:self-center"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Update Conditions</span>
            </button>
          )}
        </div>

        {/* 4-Metric Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Wind */}
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-3 space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[10px] font-bold uppercase tracking-wider">Wind & Gusts</span>
              <Wind className="w-3.5 h-3.5 text-sky-400" />
            </div>
            <div className="text-sm font-black text-white font-mono">
              {condition?.wind_speed_knots} kts
            </div>
            <p className="text-[10px] text-slate-400 truncate">
              {condition?.wind_direction}
            </p>
          </div>

          {/* River Stream */}
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-3 space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[10px] font-bold uppercase tracking-wider">River Stream</span>
              <Waves className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <div className="text-sm font-black text-white font-mono">
              {condition?.stream_flow_rate.split(' ')[0] || '1.2 m/s'}
            </div>
            <p className="text-[10px] text-slate-400 truncate">
              {condition?.stream_flow_rate}
            </p>
          </div>

          {/* Water Temp */}
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-3 space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[10px] font-bold uppercase tracking-wider">Water Temp</span>
              <Thermometer className="w-3.5 h-3.5 text-teal-400" />
            </div>
            <div className="text-sm font-black text-white font-mono">
              {condition?.water_temp_c}°C
            </div>
            <p className="text-[10px] text-slate-400">
              {condition && condition.water_temp_c < 10 ? 'Cold Shock Risk' : 'Optimal'}
            </p>
          </div>

          {/* Air Temp */}
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-3 space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[10px] font-bold uppercase tracking-wider">Air Temp</span>
              <Thermometer className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="text-sm font-black text-white font-mono">
              {condition?.air_temp_c}°C
            </div>
            <p className="text-[10px] text-slate-400">
              {new Date(condition?.updated_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} report
            </p>
          </div>
        </div>
      </div>

      {/* Edit Boathouse Safety Conditions Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto">
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl text-slate-100 animate-in fade-in zoom-in-95 duration-150 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center">
                  <Flag className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">
                    Update Boathouse Water & Weather Safety
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Set current safety flag and broadcast conditions to all club crews
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdate} className="space-y-4 pt-4">
              {/* Flag Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Water Safety Flag Status</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { val: 'green', label: 'Green Flag', desc: 'All clear', color: 'border-emerald-500 text-emerald-400 bg-emerald-500/10' },
                    { val: 'amber', label: 'Amber Flag', desc: '8+ & 4- only', color: 'border-amber-500 text-amber-300 bg-amber-500/10' },
                    { val: 'red', label: 'Red Flag', desc: 'River closed', color: 'border-rose-500 text-rose-300 bg-rose-500/10' },
                  ].map((f) => (
                    <button
                      type="button"
                      key={f.val}
                      onClick={() => setFlagStatus(f.val as SafetyFlagStatus)}
                      className={`p-3 rounded-2xl border text-center transition-all ${
                        flagStatus === f.val
                          ? `${f.color} ring-2 ring-white/20 font-bold shadow-lg`
                          : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <span className="text-xs font-bold block">{f.label}</span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">{f.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Wind Speed & Direction */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">Wind Speed (Knots)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={windSpeed}
                    onChange={(e) => setWindSpeed(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">Wind Direction</label>
                  <input
                    type="text"
                    value={windDirection}
                    onChange={(e) => setWindDirection(e.target.value)}
                    placeholder="e.g. NW Cross-Headwind 14 kts"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                    required
                  />
                </div>
              </div>

              {/* Water & Air Temp */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">Water Temp (°C)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={waterTemp}
                    onChange={(e) => setWaterTemp(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">Air Temp (°C)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={airTemp}
                    onChange={(e) => setAirTemp(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                    required
                  />
                </div>
              </div>

              {/* Stream Flow */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Stream / Water Current</label>
                <input
                  type="text"
                  value={streamFlow}
                  onChange={(e) => setStreamFlow(e.target.value)}
                  placeholder="e.g. Strong Ebb Tide (1.8 m/s)"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  required
                />
              </div>

              {/* Safety Instructions */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Boathouse Safety & Traffic Notice</label>
                <textarea
                  rows={2}
                  value={safetyNotes}
                  onChange={(e) => setSafetyNotes(e.target.value)}
                  placeholder="e.g. Caution around the railway bridge cut. High wash from tour cruisers."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              {/* Broadcast toggle */}
              <div className="flex items-center gap-2 p-3 bg-slate-950 rounded-xl border border-slate-800">
                <input
                  type="checkbox"
                  id="broadcastAlertCheck"
                  checked={broadcastAlert}
                  onChange={(e) => setBroadcastAlert(e.target.checked)}
                  className="rounded text-rowing-500 bg-slate-900 border-slate-700"
                />
                <label htmlFor="broadcastAlertCheck" className="text-xs text-slate-300 cursor-pointer">
                  Broadcast notification alert to all squad members immediately
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl bg-rowing-600 hover:bg-rowing-500 text-white font-bold text-xs shadow-lg transition-all"
                >
                  {submitting ? 'Updating...' : 'Publish Conditions'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
