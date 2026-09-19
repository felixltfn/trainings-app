// Test data for trying out the statistics. Only reachable from the settings screen in `npm run dev`.
import { startWorkout } from './data';
import { db, getActivePlanVersionId, type Slot } from './db';
import { isoDate, sidesOf, slotTargets } from './logic';

export async function generateTestData(weeks = 8): Promise<string> {
  const planVersionId = await getActivePlanVersionId();
  if (!planVersionId) return 'Kein Plan vorhanden.';
  const templates = await db.templates.where('planVersionId').equals(planVersionId).sortBy('order');
  const exercises = new Map((await db.exercises.toArray()).map((e) => [e.id, e]));
  let created = 0;

  for (let week = weeks; week >= 1; week--) {
    for (const [i, template] of templates.entries()) {
      const day = new Date();
      day.setDate(day.getDate() - week * 7 + i * 2);
      const start = day.getTime() - 90 * 60000;
      const workoutId = await startWorkout(template.id);
      await db.workouts.update(workoutId, { date: isoDate(day), start, end: start + 75 * 60000, bodyweight: 78 });

      const slots: Slot[] = await db.slots.where('templateId').equals(template.id).sortBy('position');
      for (const slot of slots) {
        const ex = exercises.get(slot.exerciseId);
        if (!ex) continue;
        const targets = slotTargets(slot, ex.id);
        // Weights grow slowly over the weeks, reps wobble inside the range
        const base = ex.bodyweight ? 0 : 20 + (ex.id % 7) * 10;
        const weight = ex.type === 'time' ? 0 : base + (weeks - week) * 2.5;
        for (let n = 1; n <= targets.sets; n++) {
          for (const side of sidesOf(ex)) {
            const spread = targets.repMax - Math.max(targets.repMin, 1);
            const value = Math.max(targets.repMin, 1) + ((n + week) % (spread + 1));
            await db.sets.add({
              workoutId,
              exerciseId: ex.id,
              slotId: slot.id,
              setNumber: n,
              side,
              // right side a touch stronger, so the left/right comparison shows something
              weight: side === 'right' ? Math.round(weight * 1.05 * 2) / 2 : weight,
              reps: ex.type === 'time' ? null : value,
              duration: ex.type === 'time' ? 60 + (weeks - week) * 5 : null,
              rir: 1,
              drop: false,
              timestamp: start + n * 120000,
            });
          }
        }
      }
      created++;
    }
  }
  return `${created} Test-Trainings angelegt.`;
}

export async function resetEverything(): Promise<void> {
  await db.delete();
  location.reload();
}
