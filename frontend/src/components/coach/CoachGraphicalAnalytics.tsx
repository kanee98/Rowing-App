import React, { useState } from 'react';
import { AthleteRankingItem } from '../../types';
import { 
  BarChart3, Trophy, Zap, Activity, Users, Award, 
  ArrowRight, ShieldCheck, CheckCircle2, ChevronRight, Anchor 
} from 'lucide-react';

interface CoachGraphicalAnalyticsProps {
  rankings: AthleteRankingItem[];
  benchmark2kSplitSeconds?: number;
  gold2kSplitSeconds?: number;
}

const formatSplit = (seconds?: number) => seconds ? `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, '0')}` : null;

export const CoachGraphicalAnalytics: React.FC<CoachGraphicalAnalyticsProps> = ({ rankings, benchmark2kSplitSeconds, gold2kSplitSeconds }) => {
  const [selectedAthleteAId, setSelectedAthleteAId] = useState<number>(rankings[0]?.athlete_id || 1);
  const [selectedAthleteBId, setSelectedAthleteBId] = useState<number>(rankings[1]?.athlete_id || 2);

  // Boat Lineup Builder State
  const [boatType, setBoatType] = useState<'8+' | '4-' | '4x' | '2x' | '2-' | '1x'>('8+');
  const [seats, setSeats] = useState<Record<string, number | null>>({
    'Stroke': rankings[0]?.athlete_id || null,
    '7': rankings[1]?.athlete_id || null,
    '6': rankings[2]?.athlete_id || null,
    '5': rankings[3]?.athlete_id || null,
    '4': rankings[4]?.athlete_id || null,
    '3': null,
    '2': null,
    'Bow': null,
    'Cox': null,
  });

  const athleteA = rankings.find((r) => r.athlete_id === selectedAthleteAId) || rankings[0];
  const athleteB = rankings.find((r) => r.athlete_id === selectedAthleteBId) || rankings[1] || rankings[0];

  // Helper to parse split string (e.g. "1:40.0") into seconds
  const parseSplit = (splitStr?: string): number | null => {
    if (!splitStr) return null;
    const parts = splitStr.split(':');
    if (parts.length === 2) {
      return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
    }
    const parsed = parseFloat(splitStr);
    return Number.isFinite(parsed) ? parsed : null;
  };

  // Calculate boat statistics for currently seated rowers
  const seatedAthleteIds = Object.values(seats).filter((id): id is number => id !== null);
  const seatedAthletes = seatedAthleteIds.map((id) => rankings.find((r) => r.athlete_id === id)).filter(Boolean) as AthleteRankingItem[];

  const knownWeights = seatedAthletes.map((athlete) => athlete.weight_kg).filter((value): value is number => value != null);
  const avgWeight = knownWeights.length ? (knownWeights.reduce((sum, value) => sum + value, 0) / knownWeights.length).toFixed(1) : null;

  const portCount = seatedAthletes.filter((a) => a.side_preference === 'port').length;
  const starboardCount = seatedAthletes.filter((a) => a.side_preference === 'starboard').length;

  const knownSplits = seatedAthletes.map((athlete) => parseSplit(athlete.best_2k_split)).filter((value): value is number => value != null);
  const avg2kSplitSec = knownSplits.length ? knownSplits.reduce((sum, value) => sum + value, 0) / knownSplits.length : undefined;
  const avgBoatSplitFormatted = formatSplit(avg2kSplitSec) || '—';

  const boatSeatsList = {
    '8+': ['Stroke', '7', '6', '5', '4', '3', '2', 'Bow', 'Cox'],
    '4-': ['Stroke', '3', '2', 'Bow'],
    '4x': ['Stroke', '3', '2', 'Bow'],
    '2x': ['Stroke', 'Bow'],
    '2-': ['Stroke', 'Bow'],
    '1x': ['Single Sculler'],
  }[boatType];

  return (
    <div className="space-y-8">
      {/* 1. Visual 2k Split Pace & Readiness Distribution Graph */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-amber-400" />
              <h3 className="text-base sm:text-lg font-extrabold text-white">
                Squad 2,000m Power & Readiness Distribution
              </h3>
            </div>
            <p className="text-xs text-slate-400">
              Verified athlete results and readiness evidence. {benchmark2kSplitSeconds ? `Club benchmark: ${formatSplit(benchmark2kSplitSeconds)} /500m.` : 'No club benchmark configured.'} Missing measurements remain blank.
            </p>
          </div>
          {gold2kSplitSeconds && <span className="text-xs font-bold text-amber-400 font-mono bg-amber-500/10 px-3 py-1 rounded-xl border border-amber-500/20">Club gold standard: {formatSplit(gold2kSplitSeconds)}</span>}
        </div>

        {/* Visual Bar Distribution Chart */}
        <div className="space-y-3 pt-2">
          {rankings.map((ath) => {
            return (
              <div key={ath.athlete_id} className="space-y-1">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-slate-400 font-bold w-4">#{ath.rank}</span>
                    <span className="text-white">{ath.athlete_name}</span>
                    <span className="text-[10px] text-slate-400 uppercase bg-slate-800 px-1.5 py-0.2 rounded font-mono">
                      {ath.side_preference || 'Not set'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 font-mono">
                    <span className="text-amber-300 font-bold text-xs">{ath.best_2k_split || '—'}</span>
                    <span className="text-rowing-400 text-xs hidden sm:inline">{ath.watts_per_kg_2k != null ? `${ath.watts_per_kg_2k} W/kg` : '—'}</span>
                    <span className="text-emerald-400 font-extrabold text-xs">{ath.overall_readiness_score != null ? `${ath.overall_readiness_score}%` : '—'}</span>
                  </div>
                </div>

                {/* Progress Bar with Split Reference Line */}
                <div className="relative w-full h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-500 via-rowing-500 to-emerald-400 transition-all duration-500"
                    style={{ width: `${ath.overall_readiness_score || 0}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Head-to-Head Athlete Capability Comparison */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-rowing-400" />
              <h3 className="text-base sm:text-lg font-extrabold text-white">
                Head-to-Head Seat Race Matrix
              </h3>
            </div>
            <p className="text-xs text-slate-400">
              Select two rowers to compare biometric capacity, aerobic base, and peak power curves.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={selectedAthleteAId}
              onChange={(e) => setSelectedAthleteAId(Number(e.target.value))}
              className="bg-slate-950 border border-rowing-500/50 text-xs text-white rounded-xl px-3 py-2 font-bold"
            >
              {rankings.map((r) => (
                <option key={r.athlete_id} value={r.athlete_id}>
                  Rower A: {r.athlete_name}
                </option>
              ))}
            </select>

            <span className="text-xs font-black text-slate-500">VS</span>

            <select
              value={selectedAthleteBId}
              onChange={(e) => setSelectedAthleteBId(Number(e.target.value))}
              className="bg-slate-950 border border-amber-500/50 text-xs text-white rounded-xl px-3 py-2 font-bold"
            >
              {rankings.map((r) => (
                <option key={r.athlete_id} value={r.athlete_id}>
                  Rower B: {r.athlete_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Head-to-Head Visual Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Athlete A Profile */}
          <div className="bg-slate-950/80 border border-rowing-500/30 rounded-2xl p-5 space-y-4 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-rowing-400">
                  Rower A Profile
                </span>
                <h4 className="text-base font-extrabold text-white">{athleteA.athlete_name}</h4>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-black bg-rowing-500/20 text-rowing-300 font-mono">
                Rank #{athleteA.rank}
              </span>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">2k Peak Split:</span>
                <span className="font-extrabold text-white">{athleteA.best_2k_split || '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">2k Watts:</span>
                <span className="font-extrabold text-amber-400">{athleteA.best_2k_watts != null ? `${athleteA.best_2k_watts}W` : '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Power / Wt (W/kg):</span>
                <span className="font-extrabold text-rowing-300">{athleteA.watts_per_kg_2k != null ? `${athleteA.watts_per_kg_2k} W/kg` : '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">5k Aerobic Split:</span>
                <span className="font-extrabold text-white">{athleteA.best_5k_split || '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Trainer Quality:</span>
                <span className="font-extrabold text-emerald-400">{athleteA.avg_verified_rating != null ? `⭐ ${athleteA.avg_verified_rating}/5` : '—'}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400">Readiness Score:</span>
              <span className="text-lg font-black text-rowing-300 font-mono">
                {athleteA.overall_readiness_score != null ? `${athleteA.overall_readiness_score}%` : '—'}
              </span>
            </div>
          </div>

          {/* Athlete B Profile */}
          <div className="bg-slate-950/80 border border-amber-500/30 rounded-2xl p-5 space-y-4 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                  Rower B Profile
                </span>
                <h4 className="text-base font-extrabold text-white">{athleteB.athlete_name}</h4>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-black bg-amber-500/20 text-amber-300 font-mono">
                Rank #{athleteB.rank}
              </span>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">2k Peak Split:</span>
                <span className="font-extrabold text-white">{athleteB.best_2k_split || '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">2k Watts:</span>
                <span className="font-extrabold text-amber-400">{athleteB.best_2k_watts != null ? `${athleteB.best_2k_watts}W` : '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Power / Wt (W/kg):</span>
                <span className="font-extrabold text-amber-300">{athleteB.watts_per_kg_2k != null ? `${athleteB.watts_per_kg_2k} W/kg` : '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">5k Aerobic Split:</span>
                <span className="font-extrabold text-white">{athleteB.best_5k_split || '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Trainer Quality:</span>
                <span className="font-extrabold text-emerald-400">{athleteB.avg_verified_rating != null ? `⭐ ${athleteB.avg_verified_rating}/5` : '—'}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400">Readiness Score:</span>
              <span className="text-lg font-black text-amber-300 font-mono">
                {athleteB.overall_readiness_score != null ? `${athleteB.overall_readiness_score}%` : '—'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Interactive Boat Lineup & Rigging Seat Builder */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <Anchor className="w-5 h-5 text-emerald-400" />
              <h3 className="text-base sm:text-lg font-extrabold text-white">
                Interactive Boat Lineup & Seat Placement
              </h3>
            </div>
            <p className="text-xs text-slate-400">
              Drag or assign athletes into racing seats. Checks Port/Starboard balance and computes boat average stats.
            </p>
          </div>

          {/* Shell Type Selector */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
            {(['8+', '4-', '4x', '2x', '2-', '1x'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setBoatType(type)}
                className={`px-3 py-1 rounded-lg text-xs font-extrabold transition-all ${
                  boatType === type
                    ? 'bg-emerald-500 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Real-time Computed Boat Lineup Vitals */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950/80 p-4 rounded-2xl border border-slate-800 text-center font-mono">
          <div>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Seated Rowers</span>
            <span className="text-base font-extrabold text-white">{seatedAthletes.length} / {boatSeatsList.length}</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Avg Boat Weight</span>
            <span className="text-base font-extrabold text-rowing-300">{avgWeight ? `${avgWeight} kg` : '—'}</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Port / Starboard</span>
            <span className="text-base font-extrabold text-amber-400">{portCount}P / {starboardCount}S</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Est. Boat 2k Pace</span>
            <span className="text-base font-extrabold text-emerald-400">{avgBoatSplitFormatted}</span>
          </div>
        </div>

        {/* Visual Boat Shell Diagram */}
        <div className="relative bg-slate-950/90 border border-slate-800 rounded-3xl p-6 overflow-x-auto">
          <div className="min-w-[600px] flex items-center justify-between gap-3">
            {/* Bow Point */}
            <div className="w-12 h-12 bg-gradient-to-l from-slate-800 to-emerald-500/40 rounded-l-full flex items-center justify-center text-[10px] font-black text-emerald-300 border border-emerald-500/30">
              BOW
            </div>

            {/* Interactive Seat Cards */}
            <div className="flex-1 grid grid-cols-4 sm:grid-cols-8 gap-2">
              {boatSeatsList.map((seatName) => {
                const assignedId = seats[seatName];
                const ath = rankings.find((r) => r.athlete_id === assignedId);

                return (
                  <div
                    key={seatName}
                    className={`p-2.5 rounded-2xl border transition-all text-center flex flex-col justify-between ${
                      ath
                        ? 'bg-slate-900 border-emerald-500/40 shadow-md'
                        : 'bg-slate-900/40 border-dashed border-slate-800'
                    }`}
                  >
                    <span className="text-[10px] font-extrabold uppercase text-slate-400 block mb-1">
                      {seatName}
                    </span>

                    {ath ? (
                      <div className="space-y-1">
                        <p className="text-xs font-extrabold text-white truncate">
                          {ath.athlete_name.split(' ')[0]}
                        </p>
                        <p className="text-[10px] text-emerald-300 font-mono font-bold">
                          {ath.best_2k_split || '—'}
                        </p>
                        <span className="text-[9px] text-slate-400 block uppercase font-mono">
                          {ath.side_preference || 'Not set'}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-600 font-medium py-2">
                        Empty Seat
                      </span>
                    )}

                    {/* Seat Assignment Dropdown */}
                    <select
                      value={assignedId || ''}
                      onChange={(e) => {
                        const val = e.target.value ? Number(e.target.value) : null;
                        setSeats((prev) => ({ ...prev, [seatName]: val }));
                      }}
                      className="mt-2 w-full bg-slate-950 text-[10px] text-slate-300 border border-slate-800 rounded-lg p-1"
                    >
                      <option value="">Choose Rower</option>
                      {rankings.map((r) => (
                        <option key={r.athlete_id} value={r.athlete_id}>
                          {r.athlete_name} ({r.best_2k_split || 'no 2k result'})
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>

            {/* Stern Point */}
            <div className="w-12 h-12 bg-gradient-to-r from-slate-800 to-rowing-500/40 rounded-r-full flex items-center justify-center text-[10px] font-black text-rowing-300 border border-rowing-500/30">
              STERN
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
