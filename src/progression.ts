import type { Exercise, Slot, Workout, WorkoutSet } from './db';
import { fmtNum, parseIsoDate, weekStart, type Targets } from './logic';

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

// The suggestion for one set. `value` null = no fixed number, `range` is shown instead.
export interface SetGoal {
  weight: number | null;
  value: number | null;
  range: string | null; // "6–10", "bis 180 s", "RIR 3–4"
}

export interface Goal {
  sets: SetGoal[]; // one entry per suggested set, in set order
  note: string | null;
}

const sameRows = (a: SessionRow[], b: SessionRow[]) =>
  a.length === b.length && a.every((r, i) => r.weight === b[i].weight && r.value === b[i].value);

// "One more rep": added to the weakest set
function oneMore(rows: SessionRow[]): SessionRow[] {
  const i = rows.findIndex((r) => r.value === Math.min(...rows.map((x) => x.value)));
  return rows.map((r, j) => (j === i ? { ...r, value: r.value + 1 } : r));
}

// Brings the list to `count` sets: extra sets repeat the last one, surplus sets are dropped
function fit(rows: SessionRow[], count: number): SessionRow[] {
  return Array.from({ length: count }, (_, i) => rows[Math.min(i, rows.length - 1)]);
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

// Number of sets for the goal. Only chest slots grow: one set per calendar week, up to the
// plan + CHEST_EXTRA_SETS, and only in a session without a weight increase – one change at a time.
function goalSetCount(input: GoalInput, basis: Session, grow: boolean): number {
  const planned = input.targets.sets;
  if (!input.chest) return planned;
  const clamp = (n: number) => Math.min(planned + CHEST_EXTRA_SETS, Math.max(planned, n));
  const lastCount = clamp(basis.rows.length);
  if (!grow) return lastCount;
  const monday = weekStart(parseIsoDate(input.today));
  const beforeThisWeek = input.history.find((s) => !s.deload && s.workout.date < monday);
  const base = beforeThisWeek ? clamp(beforeThisWeek.rows.length) : planned;
  return Math.min(planned + CHEST_EXTRA_SETS, base + 1, lastCount + 1);
}

const fmtRange = (t: Targets, ex: Exercise) => {
  const unit = ex.type === 'time' ? ' s' : ' Wdh';
  if (t.repMin === 0) return `bis ${t.repMax}${unit}`;
  return t.repMin === t.repMax ? `${t.repMax}${unit}` : `${t.repMin}–${t.repMax}${unit}`;
};

const exact = (rows: SessionRow[]): SetGoal[] => rows.map((r) => ({ weight: r.weight, value: r.value, range: null }));

// ---------- Calculation ----------

export function weeklyGoal(input: GoalInput): Goal {
  const { ex, targets, settings } = input;
  // Deload sessions never count as basis: after the deload the cycle continues
  // from the weight that stood before it.
  const basis = input.history.find((s) => !s.deload && s.rows.length > 0);
  const range = fmtRange(targets, ex);

  if (!basis) {
    return {
      sets: Array.from({ length: targets.sets }, () => ({ weight: null, value: null, range })),
      note: ex.type === 'time' ? 'Erste Einheit – so lange, wie es sauber geht.' : 'Erste Einheit – Startgewicht frei wählen.',
    };
  }

  const rows = basis.rows;
  const values = rows.map((r) => r.value);
  const planned = targets.sets;

  if (input.deload) {
    const count = Math.max(1, Math.ceil(planned / 2));
    return {
      sets: fit(rows, count).map((r) => ({ weight: r.weight, value: null, range: `RIR ${DELOAD_RIR}` })),
      note: `Deload-Woche: gleiches Gewicht, ${count} statt ${planned} ${planned === 1 ? 'Satz' : 'Sätze'}, locker bleiben.`,
    };
  }

  const enoughSets = rows.length >= planned;
  const noneMissed = values.every((v) => v >= targets.repMin);
  const withNote = (sets: SetGoal[], note: string | null = null): Goal => {
    const extra = sets.length > rows.length && sets.length > planned;
    const setNote = extra ? 'Heute ein Satz mehr als letztes Mal – mit „+ Satz“ anlegen.' : null;
    return { sets, note: [note, setNote].filter(Boolean).join(' ') || null };
  };

  // Time exercises: +timeStep seconds per set, up to the top of the range
  if (ex.type === 'time') {
    const atTop = values.every((v) => v >= targets.repMax);
    const count = goalSetCount(input, basis, enoughSets && noneMissed && !atTop);
    const next = fit(rows, count).map((r) => ({ ...r, value: Math.min(targets.repMax, r.value + settings.timeStep) }));
    return withNote(exact(next), atTop ? 'Obergrenze erreicht – Zeit halten.' : null);
  }

  if (input.compound) {
    const previous = input.history.filter((s) => !s.deload && s.rows.length > 0)[1];
    if (previous && sameRows(rows, previous.rows)) {
      const count = goalSetCount(input, basis, false);
      return withNote(
        exact(oneMore(fit(rows, count))),
        'Die Übung steht seit zwei Einheiten. Gewicht halten und eine Wiederholung mehr anpeilen.',
      );
    }
    if (enoughSets && noneMissed) {
      // Every set gets heavier by the percentage of its own weight
      const count = goalSetCount(input, basis, false);
      const ups = fit(rows, count).map((r) => ({ r, up: increase(r.weight, ex, input.bodyweight, settings) }));
      // A set whose smallest step is above pctMax gets the range instead of a fixed rep number
      const big = ({ up }: { up: { pct: number } }) => up.pct > settings.pctMax;
      return withNote(
        ups.map((u) => ({ weight: u.up.weight, value: big(u) ? null : u.r.value, range: big(u) ? range : null })),
        ups.some(big)
          ? `Wo die kleinste Stufe mehr als ${fmtNum(settings.pctMax)} % ist, sind weniger Wiederholungen normal.`
          : null,
      );
    }
    const count = goalSetCount(input, basis, false);
    return withNote(exact(noneMissed ? fit(rows, count) : oneMore(fit(rows, count))));
  }

  // Isolation: reps first; once every set reaches the top, one weight step up and back to the bottom
  const atTop = enoughSets && values.every((v) => v >= targets.repMax);
  if (atTop) {
    const count = goalSetCount(input, basis, false);
    const step = stepOf(ex, settings);
    return withNote(
      fit(rows, count).map((r) => ({ weight: Math.round((r.weight + step) * 100) / 100, value: targets.repMin, range: null })),
    );
  }
  const count = goalSetCount(input, basis, enoughSets && noneMissed);
  return withNote(exact(fit(rows, count).map((r) => ({ ...r, value: Math.min(targets.repMax, r.value + 1) }))));
}
