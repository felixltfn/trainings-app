import Dexie, { type EntityTable } from 'dexie';

// ---------- Plan (what I intend to do) ----------

export type ExerciseType = 'reps' | 'time';

export interface Exercise {
  id: number;
  name: string;
  primaryMuscle: string;
  secondaryMuscles: string[];
  unilateral: boolean;
  bodyweight: boolean; // weight field = additional load, may be 0
  type: ExerciseType; // 'time' = seconds instead of reps
  note: string;
  weightStep?: number; // smallest weight step of this machine in kg; missing = the default from the settings
}

export interface PlanVersion {
  id: number;
  name: string;
  start: string; // YYYY-MM-DD
  end: string | null;
}

export interface Template {
  id: number;
  planVersionId: number;
  name: string;
  short: string; // label in the calendar, e.g. "A"
  order: number;
}

// Values that differ for one specific exercise in a slot (e.g. Split Squats 8–12)
export interface SlotOverride {
  sets?: number;
  repMin?: number;
  repMax?: number;
  rir?: string;
}

export interface Slot {
  id: number;
  templateId: number;
  position: number;
  name: string;
  exerciseId: number; // default exercise
  alternativeIds: number[];
  sets: number;
  repMin: number; // seconds for type 'time'; 0 = "bis repMax"
  repMax: number;
  rir: string;
  restMin: number; // seconds; 0 = no rest timer
  restMax: number;
  orderFixed: boolean;
  supersetGroup: string | null; // slots with the same group in a template form a superset
  overrides: Record<number, SlotOverride>; // key = exerciseId
}

// ---------- Log (what I actually did) ----------

export interface Workout {
  id: number;
  date: string; // YYYY-MM-DD
  start: number; // epoch ms
  end: number | null; // null = in progress
  templateId: number;
  note: string;
  bodyweight: number | null;
  // Session state so an interrupted workout can be resumed exactly
  slotOrder: number[];
  choices: Record<number, number>; // slotId -> chosen exerciseId
  setCounts: Record<string, number>; // "slotId:exerciseId" -> number of set rows (plan value if missing)
  skippedSlots: number[]; // exercises dropped for this session only
}

export type Side = 'both' | 'left' | 'right';

export interface WorkoutSet {
  id: number;
  workoutId: number;
  exerciseId: number;
  slotId: number | null;
  setNumber: number;
  side: Side;
  weight: number;
  reps: number | null; // null for type 'time'
  duration: number | null; // seconds, only for type 'time'
  rir: number | null;
  drop: boolean;
  timestamp: number;
}

// ---------- Stretching ----------

// One exercise of the stretching routine. Editable in the settings.
export interface Stretch {
  id: number;
  position: number;
  name: string;
  rounds: number; // how often it is done in a row (sides count as rounds)
  perSide: boolean; // true -> "Seite 1 von 2" instead of "Satz 1 von 2"
  seconds: number | null; // null = no countdown, she taps "Fertig" (counted by reps)
  restSeconds: number | null; // pause after each round; null = the standard 5 s
  note: string;
}

export interface StretchSession {
  id: number;
  date: string; // YYYY-MM-DD
  start: number; // epoch ms
  end: number;
  seconds: number; // how long the routine took
}

export interface Meta {
  key: string;
  value: unknown;
}

export const db = new Dexie('training') as Dexie & {
  stretches: EntityTable<Stretch, 'id'>;
  stretchSessions: EntityTable<StretchSession, 'id'>;
  exercises: EntityTable<Exercise, 'id'>;
  planVersions: EntityTable<PlanVersion, 'id'>;
  templates: EntityTable<Template, 'id'>;
  slots: EntityTable<Slot, 'id'>;
  workouts: EntityTable<Workout, 'id'>;
  sets: EntityTable<WorkoutSet, 'id'>;
  meta: EntityTable<Meta, 'key'>;
};

db.version(1).stores({
  exercises: '++id, name',
  planVersions: '++id, start',
  templates: '++id, planVersionId',
  slots: '++id, templateId',
  workouts: '++id, date, templateId, start',
  sets: '++id, workoutId, exerciseId, [exerciseId+workoutId]',
  meta: 'key',
});

// Version 2 added the stretching routine
db.version(2).stores({
  exercises: '++id, name',
  planVersions: '++id, start',
  templates: '++id, planVersionId',
  slots: '++id, templateId',
  workouts: '++id, date, templateId, start',
  sets: '++id, workoutId, exerciseId, [exerciseId+workoutId]',
  meta: 'key',
  stretches: '++id, position',
  stretchSessions: '++id, date',
});

export const TABLES = [
  'exercises',
  'planVersions',
  'templates',
  'slots',
  'workouts',
  'sets',
  'meta',
  'stretches',
  'stretchSessions',
] as const;

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const row = await db.meta.get(key);
  return row?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}

// The plan version shown on the start screen. Falls back to the newest one.
export async function getActivePlanVersionId(): Promise<number | undefined> {
  const stored = await getMeta<number>('activePlanVersionId');
  if (stored && (await db.planVersions.get(stored))) return stored;
  const newest = await db.planVersions.orderBy('start').last();
  return newest?.id;
}
