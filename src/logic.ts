import type { Exercise, Slot, SlotOverride, Workout, WorkoutSet } from './db';

// ---------- Dates (always local time, never UTC) ----------

export function isoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function parseIsoDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Monday of the week containing d, as YYYY-MM-DD
export function weekStart(d: Date): string {
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  return isoDate(monday);
}

export function addDays(iso: string, days: number): string {
  const d = parseIsoDate(iso);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

// ---------- Formatting (German number format) ----------

export function fmtNum(n: number, maxDecimals = 2): string {
  return n.toLocaleString('de-DE', { maximumFractionDigits: maxDecimals });
}

// Accepts "82,5" as well as "82.5". Returns null for empty or invalid input.
export function parseNum(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function fmtDuration(ms: number): string {
  const min = Math.round(ms / 60000);
  return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;
}

export function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtRest(min: number, max: number): string {
  if (min === 0 && max === 0) return '–';
  const one = (s: number) => (s < 120 && s % 60 !== 0 ? `${s} s` : `${fmtNum(s / 60, 1)} min`);
  if (min === max) return one(min);
  // "90 s–2 min" or "2–3 min"
  if (min % 60 === 0 && max % 60 === 0) return `${min / 60}–${max / 60} min`;
  return `${one(min)}–${one(max)}`;
}

// Reps are shown as a bare range ("5–10"), time keeps its unit ("bis 180 s").
export function fmtTarget(t: Targets, type: Exercise['type']): string {
  const unit = type === 'time' ? ' s' : '';
  if (t.repMin === 0) return `bis ${t.repMax}${unit}`;
  if (t.repMin === t.repMax) return `${t.repMax}${unit}`;
  return `${t.repMin}–${t.repMax}${unit}`;
}

// One set as "50 kg × 8" or "10 kg × 0:35 min"; bodyweight without extra load shows "KG"
export function fmtSet(weight: number, value: number, ex: Exercise): string {
  const w = ex.bodyweight && weight === 0 ? 'KG' : `${fmtNum(weight)} kg`;
  return `${w} × ${ex.type === 'time' ? `${fmtClock(value)} min` : value}`;
}

// ---------- Slot targets (with per-exercise overrides) ----------

export interface Targets {
  sets: number;
  repMin: number;
  repMax: number;
  rir: string;
}

export function slotTargets(slot: Slot, exerciseId: number): Targets {
  const o: SlotOverride = slot.overrides[exerciseId] ?? {};
  return {
    sets: o.sets ?? slot.sets,
    repMin: o.repMin ?? slot.repMin,
    repMax: o.repMax ?? slot.repMax,
    rir: o.rir ?? slot.rir,
  };
}

// ---------- Load, 1RM, volume ----------

// Bodyweight exercises: bodyweight from the workout plus additional weight
export function setLoad(set: WorkoutSet, ex: Exercise, bodyweight: number | null): number {
  return ex.bodyweight ? (bodyweight ?? 0) + set.weight : set.weight;
}

// Epley formula. One rep = the weight itself.
export function epley(load: number, reps: number): number {
  if (reps <= 0) return 0;
  return reps === 1 ? load : load * (1 + reps / 30);
}

export function setVolume(set: WorkoutSet, ex: Exercise, bodyweight: number | null): number {
  return set.reps ? setLoad(set, ex, bodyweight) * set.reps : 0;
}

// ---------- Hard sets ----------

// A hard set is one working set: drop sets don't count, left + right of a unilateral set count once.
export function hardSetCount(sets: WorkoutSet[]): Map<number, number> {
  const seen = new Set<string>();
  const perExercise = new Map<number, number>();
  for (const s of sets) {
    if (s.drop) continue;
    const key = `${s.workoutId}:${s.exerciseId}:${s.setNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);
    perExercise.set(s.exerciseId, (perExercise.get(s.exerciseId) ?? 0) + 1);
  }
  return perExercise;
}

// Primary muscle counts fully, secondary muscles count half.
export function hardSetsPerMuscle(sets: WorkoutSet[], exercises: Map<number, Exercise>): Map<string, number> {
  const result = new Map<string, number>();
  const add = (m: string, n: number) => result.set(m, (result.get(m) ?? 0) + n);
  for (const [exerciseId, count] of hardSetCount(sets)) {
    const ex = exercises.get(exerciseId);
    if (!ex) continue;
    add(ex.primaryMuscle, count);
    for (const m of ex.secondaryMuscles) add(m, count / 2);
  }
  return result;
}

// ---------- Sides and set rows ----------

// Unilateral exercises start with the right side
export function sidesOf(ex: Exercise): WorkoutSet['side'][] {
  return ex.unilateral ? ['right', 'left'] : ['both'];
}

// Number of set rows shown for this slot today (planned, added, or already logged)
export function slotRowCount(slot: Slot, workout: Workout, exerciseId: number, logged: WorkoutSet[]): number {
  const planned = workout.setCounts[`${slot.id}:${exerciseId}`] ?? slotTargets(slot, exerciseId).sets;
  return Math.max(planned, ...logged.map((s) => s.setNumber), 1);
}

// True when every row of the slot has a working set on every side
export function slotComplete(slot: Slot, workout: Workout, ex: Exercise, sets: WorkoutSet[]): boolean {
  const mine = sets.filter((s) => s.slotId === slot.id && s.exerciseId === ex.id && !s.drop);
  const rows = slotRowCount(slot, workout, ex.id, mine);
  for (let n = 1; n <= rows; n++) {
    for (const side of sidesOf(ex)) {
      if (!mine.some((s) => s.setNumber === n && s.side === side)) return false;
    }
  }
  return true;
}

// Pause after the last set of an exercise, no matter how long the pause between its sets is
export const EXERCISE_CHANGE_REST = 60;

export const SIDE_LABEL: Record<WorkoutSet['side'], string> = { both: '', left: 'L', right: 'R' };

// Training time = from the first to the last logged set. Only if that is not
// possible (no sets) we fall back to the start/end times of the session.
export function trainingTime(w: Workout, sets: WorkoutSet[]): number | null {
  const stamps = sets.filter((s) => s.workoutId === w.id).map((s) => s.timestamp);
  if (stamps.length >= 2) return Math.max(...stamps) - Math.min(...stamps);
  return w.end ? w.end - w.start : null;
}

// 150 -> { min: 2, sec: 30 }
export function splitTime(totalSeconds: number): { min: number; sec: number } {
  return { min: Math.floor(totalSeconds / 60), sec: totalSeconds % 60 };
}
