import type { Exercise, Slot, Workout, WorkoutSet } from './db';
import { bodyweightFor } from './data';
import {
  addDays,
  epley,
  fmtClock,
  hardSetsPerMuscle,
  parseIsoDate,
  setLoad,
  setVolume,
  slotTargets,
  weekStart,
} from './logic';

export interface WorkoutSummary {
  volume: number;
  hardSets: Map<string, number>;
  hardSetTotal: number;
  records: { exercise: string; text: string }[];
}

// Everything the day view shows about one workout.
export function summarizeWorkout(
  workout: Workout,
  allSets: WorkoutSet[],
  allWorkouts: Workout[],
  exercises: Map<number, Exercise>,
): WorkoutSummary {
  const bw = bodyweightFor(workout, allWorkouts);
  const mine = allSets.filter((s) => s.workoutId === workout.id);
  let volume = 0;
  for (const s of mine) {
    const ex = exercises.get(s.exerciseId);
    if (ex) volume += setVolume(s, ex, bw);
  }
  const hardSets = hardSetsPerMuscle(mine, exercises);
  const hardSetTotal = [...hardSets.values()].reduce((a, b) => a + b, 0);

  // A record = a better best than in any earlier workout with that exercise
  const records: WorkoutSummary['records'] = [];
  for (const exerciseId of new Set(mine.map((s) => s.exerciseId))) {
    const ex = exercises.get(exerciseId);
    if (!ex) continue;
    const score = (s: WorkoutSet, w: Workout) =>
      ex.type === 'time' ? (s.duration ?? 0) : epley(setLoad(s, ex, bodyweightFor(w, allWorkouts)), s.reps ?? 0);
    const today = Math.max(...mine.filter((s) => s.exerciseId === exerciseId).map((s) => score(s, workout)));
    const earlier = allSets
      .filter((s) => s.exerciseId === exerciseId && s.workoutId !== workout.id)
      .map((s) => {
        const w = allWorkouts.find((x) => x.id === s.workoutId);
        return w && w.start < workout.start ? score(s, w) : 0;
      });
    const best = earlier.length ? Math.max(...earlier) : 0;
    if (today > best && best > 0) {
      records.push({
        exercise: ex.name,
        text: ex.type === 'time' ? `${fmtClock(Math.round(today))} min` : `1RM ${today.toFixed(1)} kg`,
      });
    }
  }
  return { volume, hardSets, hardSetTotal, records };
}

// Weekly target from the plan: average hard sets per training day × 3 days per week.
export function weeklyTargets(slots: Slot[], exercises: Map<number, Exercise>, templateCount: number): Map<string, number> {
  const result = new Map<string, number>();
  if (templateCount === 0) return result;
  const add = (m: string, n: number) => result.set(m, (result.get(m) ?? 0) + n);
  for (const slot of slots) {
    const ex = exercises.get(slot.exerciseId);
    if (!ex) continue;
    const sets = slotTargets(slot, slot.exerciseId).sets;
    add(ex.primaryMuscle, sets);
    for (const m of ex.secondaryMuscles) add(m, sets / 2);
  }
  for (const [m, n] of result) result.set(m, (n / templateCount) * 3);
  return result;
}

export interface SeriesPoint {
  date: string;
  e1rm: number | null;
  e1rmLeft: number | null;
  e1rmRight: number | null;
  volume: number;
  duration: number | null;
}

// One point per workout in which the exercise was trained, oldest first.
export function exerciseSeries(
  exercise: Exercise,
  allSets: WorkoutSet[],
  allWorkouts: Workout[],
): SeriesPoint[] {
  const sets = allSets.filter((s) => s.exerciseId === exercise.id);
  const workouts = allWorkouts
    .filter((w) => sets.some((s) => s.workoutId === w.id))
    .sort((a, b) => a.start - b.start);

  return workouts.map((w) => {
    const bw = bodyweightFor(w, allWorkouts);
    const mine = sets.filter((s) => s.workoutId === w.id);
    const best = (list: WorkoutSet[]) =>
      list.length ? Math.max(...list.map((s) => epley(setLoad(s, exercise, bw), s.reps ?? 0))) : null;
    return {
      date: w.date,
      e1rm: exercise.type === 'time' ? null : best(mine),
      e1rmLeft: exercise.unilateral ? best(mine.filter((s) => s.side === 'left')) : null,
      e1rmRight: exercise.unilateral ? best(mine.filter((s) => s.side === 'right')) : null,
      volume: mine.reduce((sum, s) => sum + setVolume(s, exercise, bw), 0),
      duration: exercise.type === 'time' ? Math.max(...mine.map((s) => s.duration ?? 0)) : null,
    };
  });
}

export interface PersonalRecords {
  bestE1rm: number | null;
  heaviest: number | null;
  mostReps: number | null;
  longest: number | null;
  bestVolume: number | null;
  sideDiff: number | null; // percent, right vs left
}

export function personalRecords(exercise: Exercise, series: SeriesPoint[], sets: WorkoutSet[], workouts: Workout[]): PersonalRecords {
  const mine = sets.filter((s) => s.exerciseId === exercise.id);
  const max = (ns: (number | null)[]) => {
    const vals = ns.filter((n): n is number => n !== null && Number.isFinite(n));
    return vals.length ? Math.max(...vals) : null;
  };
  const loads = mine.map((s) => {
    const w = workouts.find((x) => x.id === s.workoutId);
    return w ? setLoad(s, exercise, bodyweightFor(w, workouts)) : s.weight;
  });
  const left = max(series.map((p) => p.e1rmLeft));
  const right = max(series.map((p) => p.e1rmRight));
  return {
    bestE1rm: max(series.map((p) => p.e1rm)),
    heaviest: loads.length ? Math.max(...loads) : null,
    mostReps: max(mine.map((s) => s.reps)),
    longest: max(mine.map((s) => s.duration)),
    bestVolume: max(series.map((p) => p.volume)),
    sideDiff: left && right ? ((right - left) / left) * 100 : null,
  };
}

// Hard sets per muscle inside one week (Monday–Sunday)
export function weekHardSets(
  fromDate: string,
  toDate: string,
  workouts: Workout[],
  sets: WorkoutSet[],
  exercises: Map<number, Exercise>,
): Map<string, number> {
  const ids = new Set(workouts.filter((w) => w.date >= fromDate && w.date <= toDate).map((w) => w.id));
  return hardSetsPerMuscle(
    sets.filter((s) => ids.has(s.workoutId)),
    exercises,
  );
}



// ---------- Weekly streak ----------

export interface Streak {
  current: number; // weeks in a row with enough workouts
  best: number;
  thisWeek: number; // workouts done in the running week
  missing: number; // workouts still needed this week
}

// A week (Monday–Sunday) counts when at least `goal` workouts were finished in it.
// The running week never breaks the streak – it just doesn't count yet.
export function weeklyStreak(workouts: Workout[], goal = 3, today = new Date()): Streak {
  const perWeek = new Map<string, number>();
  for (const w of workouts) {
    if (w.end === null) continue;
    const week = weekStart(parseIsoDate(w.date));
    perWeek.set(week, (perWeek.get(week) ?? 0) + 1);
  }

  const thisWeekStart = weekStart(today);
  const thisWeek = perWeek.get(thisWeekStart) ?? 0;

  let current = thisWeek >= goal ? 1 : 0;
  for (let week = addDays(thisWeekStart, -7); (perWeek.get(week) ?? 0) >= goal; week = addDays(week, -7)) {
    current++;
  }

  // Longest streak ever, for the record line
  let best = 0;
  let run = 0;
  const weeks = [...perWeek.keys()].sort();
  for (const [i, week] of weeks.entries()) {
    const previous = weeks[i - 1];
    const isNext = previous !== undefined && addDays(previous, 7) === week;
    run = (perWeek.get(week) ?? 0) >= goal ? (isNext ? run + 1 : 1) : 0;
    best = Math.max(best, run);
  }

  return { current, best: Math.max(best, current), thisWeek, missing: Math.max(0, goal - thisWeek) };
}
