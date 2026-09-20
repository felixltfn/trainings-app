import { db, type Slot, type Workout, type WorkoutSet } from './db';
import { isoDate } from './logic';

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
    bodyweight: await latestBodyweight(),
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

async function latestBodyweight(): Promise<number | null> {
  const all = await db.workouts.orderBy('start').reverse().toArray();
  return all.find((w) => w.bodyweight !== null)?.bodyweight ?? null;
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

// The last earlier session of this exercise (any day, any slot) with its sets.
export async function previousSession(
  exerciseId: number,
  current: Workout,
): Promise<{ workout: Workout; sets: WorkoutSet[] } | null> {
  const sets = await db.sets.where('exerciseId').equals(exerciseId).toArray();
  const workoutIds = [...new Set(sets.map((s) => s.workoutId))].filter((id) => id !== current.id);
  const workouts = (await db.workouts.bulkGet(workoutIds)).filter(
    (w): w is Workout => w !== undefined && w.start < current.start,
  );
  if (workouts.length === 0) return null;
  const last = workouts.reduce((a, b) => (b.start > a.start ? b : a));
  const lastSets = sets.filter((s) => s.workoutId === last.id).sort((a, b) => a.setNumber - b.setNumber);
  return { workout: last, sets: lastSets };
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
