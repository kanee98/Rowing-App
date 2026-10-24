import React, { useEffect, useState } from 'react';
import { AthleteRankingItem, Equipment } from '../../types';
import { api } from '../../services/api';
import { Field, inputClass, buttonClass } from '../common/FormPanel';
import { useNavigation } from '../../context/NavigationContext';
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
  const { navigate } = useNavigation();
  const [boats, setBoats] = useState<Equipment[]>([]);
  const [crewName, setCrewName] = useState('');
  const [boatId, setBoatId] = useState('');
  const [boatSearch, setBoatSearch] = useState('');
  const [savingCrew, setSavingCrew] = useState(false);
  const [crewError, setCrewError] = useState('');
  const [crewSaved, setCrewSaved] = useState(false);
  const [savedCrewId, setSavedCrewId] = useState<number | null>(null);
  useEffect(() => { api.getEquipment().then(setBoats).catch((err) => setCrewError(err.message)); }, []);
  const [selectedAthleteAId, setSelectedAthleteAId] = useState<number>(rankings[0]?.athlete_id || 1);
  const [selectedAthleteBId, setSelectedAthleteBId] = useState<number>(rankings[1]?.athlete_id || 2);

  // Boat Lineup Builder State
  const [boatType, setBoatType] = useState<'8+' | '4-' | '4x' | '2x' | '2-' | '1x'>('8+');
  const [seats, setSeats] = useState<Record<string, number | null>>({});
  useEffect(() => { setCrewSaved(false); }, [seats, crewName, boatId]);

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

  const boatSeatsList = {
    '8+': ['Stroke', '7', '6', '5', '4', '3', '2', 'Bow', 'Cox'],
    '4-': ['Stroke', '3', '2', 'Bow'],
    '4x': ['Stroke', '3', '2', 'Bow'],
    '2x': ['Stroke', 'Bow'],
    '2-': ['Stroke', 'Bow'],
    '1x': ['Single Sculler'],
  }[boatType];

  // Calculate boat statistics for currently seated rowers
  const seatedAthleteIds = Array.from(new Set(boatSeatsList.filter((seat) => seat !== 'Cox').map((seat) => seats[seat]).filter((id): id is number => id != null)));
  const seatedAthletes = seatedAthleteIds.map((id) => rankings.find((r) => r.athlete_id === id)).filter(Boolean) as AthleteRankingItem[];

  const knownWeights = seatedAthletes.map((athlete) => athlete.weight_kg).filter((value): value is number => value != null);
  const avgWeight = knownWeights.length ? (knownWeights.reduce((sum, value) => sum + value, 0) / knownWeights.length).toFixed(1) : null;

  const portCount = seatedAthletes.filter((a) => a.side_preference === 'port').length;
  const starboardCount = seatedAthletes.filter((a) => a.side_preference === 'starboard').length;

  const knownSplits = seatedAthletes.map((athlete) => parseSplit(athlete.best_2k_split)).filter((value): value is number => value != null);
  const avg2kSplitSec = knownSplits.length ? knownSplits.reduce((sum, value) => sum + value, 0) / knownSplits.length : undefined;
  const avgBoatSplitFormatted = formatSplit(avg2kSplitSec) || '—';

  const categoryForPreview: Record<string, string> = { '8+': '8+_eight', '4-': '4-_four', '2x': '2x_double_scull', '2-': '2-_pair', '1x': '1x_single_scull' };
  const matchingBoats = boats.filter((boat) => boat.category === categoryForPreview[boatType]);
  const saveLineup = async (event: React.FormEvent) => {
    event.preventDefault(); setSavingCrew(true); setCrewError(''); setCrewSaved(false);
    try {
      const positions = Object.fromEntries(boatSeatsList.map((seat) => [seat === 'Single Sculler' ? 'Single' : seat, seats[seat]]));
      const result = await api.operation<{ id: number }>('/crews' + (savedCrewId ? '/' + savedCrewId : ''), savedCrewId ? 'PUT' : 'POST', { name: crewName.trim(), equipment_id: Number(boatId), seats: positions });
      setSavedCrewId(result.id);
      setCrewSaved(true);
    } catch (err: any) { setCrewError(err.message); } finally { setSavingCrew(false); }
  };


  return (
    <div className="space-y-8">
      <section className="space-y-5 rounded-3xl border border-slate-800 bg-slate-900 p-6">
        <div><h3 className="text-lg font-extrabold text-white">Verified 2k RowErg test results</h3>
          <p className="mt-1 text-xs text-slate-400">Bar length shows recorded test duration. These are measured results, not a readiness score. {benchmark2kSplitSeconds ? 'Club reference split: ' + formatSplit(benchmark2kSplitSeconds) + ' /500m.' : 'No club reference configured.'}</p>
          {gold2kSplitSeconds && <p className="mt-1 text-xs text-amber-300">Club gold reference: {formatSplit(gold2kSplitSeconds)} /500m</p>}
        </div>
        <div className="space-y-4">{rankings.map((athlete) => <div key={athlete.athlete_id}>
          <div className="flex items-center justify-between gap-3 text-xs"><span className="font-semibold text-white">{athlete.rank != null ? '#' + athlete.rank + ' ' : ''}{athlete.athlete_name}</span><span className="text-amber-200">{athlete.best_2k_split ? athlete.best_2k_split + ' /500m' : 'No eligible verified test'}</span></div>
          {athlete.best_2k_time_sec != null && <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-950"><div className="h-full rounded-full bg-rowing-500" style={{ width: (athlete.best_2k_time_sec / Math.max(...rankings.map((item) => item.best_2k_time_sec || 0)) * 100) + '%' }} /></div>}
        </div>)}</div>
      </section>

      {/* 2. Head-to-Head Athlete Capability Comparison */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-rowing-400" />
              <h3 className="text-base sm:text-lg font-extrabold text-white">
                Athlete benchmark comparison
              </h3>
            </div>
            <p className="text-xs text-slate-400">
              Compare verified test results from the selected period. This is not an on-water seat race.
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
                {athleteA.rank != null ? '2k rank #' + athleteA.rank : 'Unranked'}
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
              <span className="text-xs font-bold text-slate-400">Scheduled sessions logged:</span>
              <span className="text-lg font-black text-rowing-300 font-mono">
                {athleteA.total_sessions_completed}
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
                {athleteB.rank != null ? '2k rank #' + athleteB.rank : 'Unranked'}
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
              <span className="text-xs font-bold text-slate-400">Scheduled sessions logged:</span>
              <span className="text-lg font-black text-amber-300 font-mono">
                {athleteB.total_sessions_completed}
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
              Assign athletes to seats to explore a lineup. Mean erg results are descriptive and do not predict boat speed.
            </p>
          </div>

          {/* Shell Type Selector */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
            {(['8+', '4-', '4x', '2x', '2-', '1x'] as const).map((type) => (
              <button
                key={type}
                onClick={() => { setBoatType(type); setBoatId(''); setCrewSaved(false); setSavedCrewId(null); }}
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
        <form onSubmit={saveLineup} className="space-y-3 rounded-2xl border border-slate-700 bg-slate-950/50 p-4">
          <h4 className="text-sm font-bold text-white">Save this lineup as a club crew</h4>
          <p className="text-xs text-slate-400">Fill every seat, including the cox, then choose a real club boat. Unsaved seat previews are temporary. Saved crews can be edited and reserved in Operations.</p>
          {crewError && <p role="alert" className="text-xs text-rose-300">{crewError}</p>}
          {crewSaved && <p role="status" className="text-xs text-emerald-300">Crew saved. Open Operations → Saved crews to edit or reserve it.</p>}
          <div className="grid gap-3 sm:grid-cols-3"><Field label="Crew name"><input required maxLength={255} value={crewName} onChange={(event) => setCrewName(event.target.value)} className={inputClass} /></Field><Field label="Search matching boats"><input value={boatSearch} onChange={(event) => setBoatSearch(event.target.value)} className={inputClass} /></Field><Field label="Club boat"><select required value={boatId} onChange={(event) => setBoatId(event.target.value)} className={inputClass}><option value="">Choose an actual boat</option>{matchingBoats.filter((boat) => String(boat.id) === boatId || boat.name.toLowerCase().includes(boatSearch.toLowerCase())).map((boat) => <option key={boat.id} value={boat.id}>{boat.name} · {boat.status}</option>)}</select></Field></div>
          {!matchingBoats.length && <p className="text-xs text-amber-200">No club equipment matches this preview class. Choose a supported class and add the real boat in Equipment first.</p>}
          <div className="flex flex-wrap gap-2"><button disabled={savingCrew || !boatId || !crewName.trim() || boatSeatsList.some((seat) => !seats[seat])} className={buttonClass}>{savingCrew ? 'Saving…' : 'Save crew'}</button><button type="button" onClick={() => navigate('operations')} className="rounded-xl border border-slate-600 px-4 py-2 text-xs font-bold text-sky-200">Open saved crews & reservations</button></div>
        </form>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950/80 p-4 rounded-2xl border border-slate-800 text-center font-mono">
          <div>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Seated Rowers</span>
            <span className="text-base font-extrabold text-white">{seatedAthletes.length} / {boatSeatsList.filter((seat) => seat !== 'Cox').length}</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Mean rower weight</span>
            <span className="text-base font-extrabold text-rowing-300">{avgWeight ? `${avgWeight} kg` : '—'}</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Port / Starboard</span>
            <span className="text-base font-extrabold text-amber-400">{portCount}P / {starboardCount}S</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Mean rower erg split</span>
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
                        <option key={r.athlete_id} value={r.athlete_id} disabled={Object.entries(seats).some(([seat, id]) => seat !== seatName && boatSeatsList.includes(seat) && id === r.athlete_id)}>
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
