import type { Exercise, Slot, Workout, WorkoutSet } from './db';
import { fmtClock, fmtNum, parseIsoDate, weekStart, type Targets } from './logic';

// ---------- Settings (editable under Einstellungen → Wochenziel) ----------

export interface ProgressionSettings {
  pctMin: number; // weight increase of the main lifts, lower end in %
  pctMax: number; // upper end in % – above it the reps are expected to drop
  weightStep: number; // smallest weight step in kg, unless the exercise has its own
  timeStep: number; // seconds added per session for time exercises
  deloadEvery: number; // every n-th week is a deload week; 0 = never
}

export const DEFAULT_PROGRESSION: ProgressionSettings = {
  pctMin: 3,
  pctMax: 5,
  weightStep: 2.5,
  timeStep: 5,
  deloadEvery: 6,
};

export const CHEST_EXTRA_SETS = 2; // chest slots may grow by at most this many sets over the plan
export const DELOAD_RIR = '3–4';

// ---------- Weeks of the cycle ----------

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// 1 … deloadEvery, counted in calendar weeks (Mon–Sun) from the start of the plan
export function cycleWeek(planStart: string, date: string, deloadEvery: number): number {
  const from = parseIsoDate(weekStart(parseIsoDate(planStart))).getTime();
  const to = parseIsoDate(weekStart(parseIsoDate(date))).getTime();
  const weeks = Math.round((to - from) / WEEK_MS); // round: a DST change shifts by one hour
  return deloadEvery > 0 ? (((weeks % deloadEvery) + deloadEvery) % deloadEvery) + 1 : weeks + 1;
}

export function isDeloadWeek(planStart: string, date: string, deloadEvery: number): boolean {
  return deloadEvery > 1 && cycleWeek(planStart, date, deloadEvery) === deloadEvery;
}

// ---------- One earlier session, reduced to one row per set ----------

export interface SessionRow {
  weight: number;
  value: number; // reps, or seconds for time exercises
}

export interface Session {
  workout: Workout;
  deload: boolean;
  rows: SessionRow[]; // working sets in set order; drop sets are left out
}

// Unilateral sets count with their weaker side, so the goal is reachable on both.
export function sessionRows(sets: WorkoutSet[], ex: Exercise): SessionRow[] {
  const byNumber = new Map<number, WorkoutSet[]>();
  for (const s of sets) {
    if (!s.drop) byNumber.set(s.setNumber, [...(byNumber.get(s.setNumber) ?? []), s]);
  }
  return [...byNumber.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, list]) => ({
      weight: Math.min(...list.map((s) => s.weight)),
      value: Math.min(...list.map((s) => (ex.type === 'time' ? s.duration : s.reps) ?? 0)),
    }));
}

// ---------- Kind of slot ----------

// Main lifts: the first three slots of a day with a rep range up to 10
export function isCompound(slot: Slot, ex: Exercise, targets: Targets): boolean {
  return ex.type === 'reps' && slot.position <= 3 && targets.repMax <= 10;
}

export function isChest(ex: Exercise): boolean {
  return ex.primaryMuscle === 'Brust';
}

// ---------- The goal ----------

export interface GoalInput {
  ex: Exercise;
  targets: Targets; // today's slot targets
  compound: boolean;
  chest: boolean;
  history: Session[]; // earlier sessions of this exercise, newest first (deload weeks included)
  deload: boolean; // today is in a deload week
  today: string; // YYYY-MM-DD of the workout
  bodyweight: number | null;
  settings: ProgressionSettings;
}

export interface Goal {
  lastLabel: string; // "Letztes Mal" or "Vor dem Deload"
  last: string | null; // "3 × 8 mit 50 kg"; null before the first session
  target: string; // "3 × 8 mit 52,5 kg"
  note: string | null;
  newWeight: number | null; // suggested weight if it differs from last time (prefill of the weight fields)
}

const sameRows = (a: SessionRow[], b: SessionRow[]) =>
  a.length === b.length && a.every((r, i) => r.weight === b[i].weight && r.value === b[i].value);

// "One more rep": added to the weakest set
function oneMore(values: number[]): number[] {
  const i = values.indexOf(Math.min(...values));
  return values.map((v, j) => (j === i ? v + 1 : v));
}

// Brings the list to `count` sets: extra sets repeat the last value, surplus sets are dropped
function fit(values: number[], count: number): number[] {
  return Array.from({ length: count }, (_, i) => values[Math.min(i, values.length - 1)]);
}

export function stepOf(ex: Exercise, settings: ProgressionSettings): number {
  return ex.weightStep && ex.weightStep > 0 ? ex.weightStep : settings.weightStep;
}

// +pctMin % of the load, rounded up to whole weight steps – at least one step.
// Bodyweight exercises: the percentage refers to bodyweight + extra weight.
function increase(weight: number, ex: Exercise, bodyweight: number | null, settings: ProgressionSettings) {
  const step = stepOf(ex, settings);
  const load = ex.bodyweight ? (bodyweight ?? 0) + weight : weight;
  const steps = Math.max(1, Math.ceil((load * settings.pctMin) / 100 / step - 1e-9));
  const next = Math.round((weight + steps * step) * 100) / 100;
  const pct = load > 0 ? ((steps * step) / load) * 100 : Infinity;
  return { weight: next, pct };
}

// Chest slots may grow by one set per calendar week, up to the plan + CHEST_EXTRA_SETS.
// All other slots keep the planned number of sets.
function goalSetCount(input: GoalInput, basis: Session, success: boolean): number {
  const planned = input.targets.sets;
  if (!input.chest) return planned;
  const clamp = (n: number) => Math.min(planned + CHEST_EXTRA_SETS, Math.max(planned, n));
  const lastCount = clamp(basis.rows.length);
  if (!success) return lastCount;
  const monday = weekStart(parseIsoDate(input.today));
  const beforeThisWeek = input.history.find((s) => !s.deload && s.workout.date < monday);
  const base = beforeThisWeek ? clamp(beforeThisWeek.rows.length) : planned;
  return Math.min(planned + CHEST_EXTRA_SETS, base + 1, lastCount + 1);
}

// ---------- Formatting ----------

function fmtValues(values: number[], ex: Exercise): string {
  const same = values.every((v) => v === values[0]);
  const time = ex.type === 'time';
  const minutes = time && values.some((v) => v >= 60);
  const one = (v: number) => (minutes ? fmtClock(v) : String(v));
  const unit = time ? (minutes ? ' min' : ' s') : '';
  const side = ex.unilateral ? ' je Seite' : '';
  return same ? `${values.length} × ${one(values[0])}${unit}${side}` : `${values.map(one).join('/')}${unit}${side}`;
}

function fmtWeight(weights: number[], ex: Exercise): string {
  const lo = Math.min(...weights);
  const hi = Math.max(...weights);
  if (ex.bodyweight && hi === 0) return ex.type === 'time' ? '' : ' mit Körpergewicht';
  const range = lo === hi ? fmtNum(hi) : `${fmtNum(lo)}–${fmtNum(hi)}`;
  return ex.bodyweight ? ` mit KG + ${range} kg` : ` mit ${range} kg`;
}

const fmtRange = (t: Targets, ex: Exercise) => {
  const unit = ex.type === 'time' ? ' s' : '';
  if (t.repMin === 0) return `bis ${t.repMax}${unit}`;
  return t.repMin === t.repMax ? `${t.repMax}${unit}` : `${t.repMin}–${t.repMax}${unit}`;
};

const setsWord = (n: number) => `${n} ${n === 1 ? 'Satz' : 'Sätze'}`;

// ---------- Calculation ----------

export function weeklyGoal(input: GoalInput): Goal {
  const { ex, targets, settings } = input;
  // Deload sessions never count as basis: after the deload the cycle continues
  // from the weight that stood before it.
  const basis = input.history.find((s) => !s.deload && s.rows.length > 0);
  const lastLabel = input.history[0]?.deload && !input.deload ? 'Vor dem Deload' : 'Letztes Mal';

  if (!basis) {
    return {
      lastLabel,
      last: null,
      target: `${setsWord(targets.sets)} im Bereich ${fmtRange(targets, ex)}`,
      note: ex.type === 'time' ? 'Erste Einheit – so lange, wie es sauber geht.' : 'Erste Einheit – Startgewicht frei wählen.',
      newWeight: null,
    };
  }

  const values = basis.rows.map((r) => r.value);
  const weights = basis.rows.map((r) => r.weight);
  const topWeight = Math.max(...weights);
  const last = `${fmtValues(values, ex)}${fmtWeight(weights, ex)}`;
  const goal = (target: string, note: string | null = null, newWeight: number | null = null): Goal => ({
    lastLabel,
    last,
    target,
    note,
    newWeight,
  });

  if (input.deload) {
    const sets = Math.max(1, Math.ceil(targets.sets / 2));
    return goal(`${setsWord(sets)}${fmtWeight(weights, ex)}, RIR ${DELOAD_RIR}`, 'Deload-Woche: gleiches Gewicht, halbe Sätze, locker bleiben.');
  }

  const planned = targets.sets;
  const enoughSets = basis.rows.length >= planned;
  const noneMissed = values.every((v) => v >= targets.repMin);
  const sets = goalSetCount(input, basis, enoughSets && noneMissed);

  // Time exercises: 5 s more than last time, up to the top of the range
  if (ex.type === 'time') {
    const atTop = values.every((v) => v >= targets.repMax);
    const next = fit(values, sets).map((v) => Math.min(targets.repMax, v + settings.timeStep));
    return goal(
      `${fmtValues(next, ex)}${fmtWeight(weights, ex)}`,
      atTop ? 'Obergrenze erreicht – Zeit halten.' : null,
    );
  }

  if (input.compound) {
    const previous = input.history.filter((s) => !s.deload && s.rows.length > 0)[1];
    if (previous && sameRows(basis.rows, previous.rows)) {
      return goal(
        `${fmtValues(oneMore(fit(values, sets)), ex)}${fmtWeight(weights, ex)}`,
        'Die Übung steht seit zwei Einheiten. Gewicht halten und eine Wiederholung mehr anpeilen.',
      );
    }
    if (enoughSets && noneMissed) {
      const up = increase(topWeight, ex, input.bodyweight, settings);
      const big = up.pct > settings.pctMax;
      return goal(
        big
          ? `${setsWord(sets)} im Bereich ${fmtRange(targets, ex)}${fmtWeight([up.weight], ex)}`
          : `${fmtValues(fit(values, sets), ex)}${fmtWeight([up.weight], ex)}`,
        big ? `Kleinste Stufe ist mehr als ${fmtNum(settings.pctMax)} % – weniger Wiederholungen sind normal.` : null,
        up.weight,
      );
    }
    if (!noneMissed) return goal(`${fmtValues(oneMore(fit(values, sets)), ex)}${fmtWeight(weights, ex)}`);
    return goal(`${fmtValues(fit(values, sets), ex)}${fmtWeight(weights, ex)}`);
  }

  // Isolation: reps first; once every set reaches the top, one weight step up and back to the bottom
  const atTop = enoughSets && values.every((v) => v >= targets.repMax);
  if (atTop) {
    const next = Math.round((topWeight + stepOf(ex, settings)) * 100) / 100;
    return goal(`${fmtValues(fit([targets.repMin], sets), ex)}${fmtWeight([next], ex)}`, null, next);
  }
  const next = fit(values, sets).map((v) => Math.min(targets.repMax, v + 1));
  return goal(`${fmtValues(next, ex)}${fmtWeight(weights, ex)}`);
}
