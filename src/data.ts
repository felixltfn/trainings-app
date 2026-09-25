import { db, getMeta, type Exercise, type Slot, type Workout, type WorkoutSet } from './db';
import { isoDate } from './logic';
import { DEFAULT_PROGRESSION, isDeloadWeek, sessionRows, type ProgressionSettings, type Session } from './progression';

// ---------- Workouts ----------

export async function startWorkout(templateId: number): Promise<number> {
  const slots = await db.slots.where('templateId').equals(templateId).sortBy('position');
  const now = Date.now();
  return db.workouts.add({
    date: isoDate(new Date(now)),
    start: now,
    end: null,
    templateId,
    note: '',
    bodyweight: null, // only filled in when actually weighed
    slotOrder: slots.map((s) => s.id),
    choices: Object.fromEntries(slots.map((s) => [s.id, s.exerciseId])),
    setCounts: {},
    skippedSlots: [],
  });
}

export async function deleteWorkout(id: number): Promise<void> {
  await db.transaction('rw', db.workouts, db.sets, async () => {
    await db.sets.where('workoutId').equals(id).delete();
    await db.workouts.delete(id);
  });
}

// Bodyweight for a workout; if it wasn't entered, the most recent earlier value is used.
export function bodyweightFor(w: Workout, allWorkouts: Workout[]): number | null {
  if (w.bodyweight !== null) return w.bodyweight;
  let best: Workout | null = null;
  for (const o of allWorkouts) {
    if (o.bodyweight !== null && o.start < w.start && (!best || o.start > best.start)) best = o;
  }
  return best?.bodyweight ?? null;
}

// All earlier sessions of this exercise (any day, any slot), newest first, each with its
// sets and whether it fell into a deload week. Also the bodyweight valid for `current`.
export async function exerciseHistory(
  ex: Exercise,
  current: Workout,
  settings: ProgressionSettings,
): Promise<{ sessions: (Session & { sets: WorkoutSet[] })[]; bodyweight: number | null }> {
  const [sets, workouts, templates, plans] = await Promise.all([
    db.sets.where('exerciseId').equals(ex.id).toArray(),
    db.workouts.toArray(),
    db.templates.toArray(),
    db.planVersions.toArray(),
  ]);
  const planStart = new Map(templates.map((t) => [t.id, plans.find((p) => p.id === t.planVersionId)?.start]));
  const ids = new Set(sets.map((s) => s.workoutId));
  const earlier = workouts
    .filter((w) => ids.has(w.id) && w.id !== current.id && w.start < current.start)
    .sort((a, b) => b.start - a.start);
  const sessions = earlier.map((workout) => {
    const mine = sets.filter((s) => s.workoutId === workout.id).sort((a, b) => a.setNumber - b.setNumber);
    const start = planStart.get(workout.templateId);
    return {
      workout,
      sets: mine,
      rows: sessionRows(mine, ex),
      deload: !!start && isDeloadWeek(start, workout.date, settings.deloadEvery),
    };
  });
  return { sessions, bodyweight: bodyweightFor(current, workouts) };
}

// Progression settings, with defaults for values that were never changed
export async function loadProgression(): Promise<ProgressionSettings> {
  return { ...DEFAULT_PROGRESSION, ...(await getMeta<Partial<ProgressionSettings>>('progression')) };
}

// Suggests the template after the one trained last (in plan order).
export async function suggestNextTemplateId(templateIds: number[]): Promise<number | undefined> {
  if (templateIds.length === 0) return undefined;
  const finished = await db.workouts.orderBy('start').reverse().filter((w) => w.end !== null).first();
  const i = finished ? templateIds.indexOf(finished.templateId) : -1;
  return templateIds[(i + 1) % templateIds.length];
}

// ---------- Plan versions ----------

// An empty training plan (PPL, Upper/Lower, full body, a new mesocycle …)
export async function createPlan(name: string, start: string): Promise<number> {
  const id = await db.planVersions.add({ name, start, end: null });
  await db.meta.put({ key: 'activePlanVersionId', value: id });
  return id;
}

// A copy of an existing plan, including its training days and slots.
// Old workouts keep pointing at the old templates, so their history stays intact.
export async function copyPlan(sourcePlanId: number, name: string, start: string): Promise<number> {
  return db.transaction('rw', [db.planVersions, db.templates, db.slots, db.meta], async () => {
    const newId = await db.planVersions.add({ name, start, end: null });
    const templates = await db.templates.where('planVersionId').equals(sourcePlanId).toArray();
    for (const t of templates) {
      const { id: oldTemplateId, ...rest } = t;
      const templateId = await db.templates.add({ ...rest, planVersionId: newId });
      const slots = await db.slots.where('templateId').equals(oldTemplateId).toArray();
      await db.slots.bulkAdd(slots.map(({ id: _id, ...s }): Omit<Slot, 'id'> => ({ ...s, templateId })));
    }
    await db.meta.put({ key: 'activePlanVersionId', value: newId });
    return newId;
  });
}
