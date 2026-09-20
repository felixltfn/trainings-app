import type { Stretch } from './db';

export const CHANGE_REST = 5; // standard pause between two rounds

export interface Step {
  kind: 'exercise' | 'rest';
  name: string; // exercise name, or the next one during a pause
  round: number;
  rounds: number;
  perSide: boolean;
  seconds: number | null; // null = counts up until "Fertig" (only for exercises)
  note: string;
  exerciseIndex: number; // which exercise of the plan, for "Übung 4 von 12"
}

// Turns the plan into a flat list: every round of every exercise, with the pauses in between.
export function buildSteps(stretches: Stretch[]): Step[] {
  const plan = [...stretches].sort((a, b) => a.position - b.position);
  const steps: Step[] = [];

  plan.forEach((s, exerciseIndex) => {
    for (let round = 1; round <= Math.max(1, s.rounds); round++) {
      steps.push({
        kind: 'exercise',
        name: s.name,
        round,
        rounds: Math.max(1, s.rounds),
        perSide: s.perSide,
        seconds: s.seconds,
        note: s.note,
        exerciseIndex,
      });
      const lastRound = round === Math.max(1, s.rounds);
      const isLast = exerciseIndex === plan.length - 1 && lastRound;
      if (!isLast) {
        steps.push({
          kind: 'rest',
          name: '',
          round,
          rounds: Math.max(1, s.rounds),
          perSide: s.perSide,
          // The exercise's own pause applies between its rounds; after the last
          // round the standard change-over pause leads into the next exercise.
          seconds: lastRound ? CHANGE_REST : (s.restSeconds ?? CHANGE_REST),
          note: '',
          exerciseIndex,
        });
      }
    }
  });

  // A pause announces what comes next
  steps.forEach((step, i) => {
    if (step.kind === 'rest') {
      const next = steps[i + 1];
      step.name = next?.name ?? '';
      step.round = next?.round ?? 1;
      step.rounds = next?.rounds ?? 1;
      step.perSide = next?.perSide ?? false;
    }
  });

  return steps;
}

export function roundLabel(step: Step): string {
  if (step.rounds <= 1) return '';
  return step.perSide ? `Seite ${step.round} von ${step.rounds}` : `Satz ${step.round} von ${step.rounds}`;
}

// ---------- Saved state, so the run survives a locked screen or a closed app ----------

export interface RunState {
  startedAt: number; // when the whole routine started
  index: number; // current step
  stepStartedAt: number; // when the current step started
  pausedAt: number | null; // set while paused
}

const KEY = 'stretchRun';

export function loadRun(): RunState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RunState) : null;
  } catch {
    return null;
  }
}

export function saveRun(run: RunState | null): void {
  try {
    if (run) localStorage.setItem(KEY, JSON.stringify(run));
    else localStorage.removeItem(KEY);
  } catch {
    // Private mode: the run still works for this session.
  }
}

export interface Advanced {
  run: RunState;
  finished: boolean;
  stepsPassed: number; // how many timers ran out since the last look
}

// Moves the run forward to where it should be *now*. While the phone was locked
// several steps may have passed, so this loops instead of stepping once.
export function catchUp(run: RunState, steps: Step[], now = Date.now()): Advanced {
  if (run.pausedAt !== null) return { run, finished: false, stepsPassed: 0 };

  let { index, stepStartedAt } = run;
  let stepsPassed = 0;

  while (index < steps.length) {
    const seconds = steps[index].seconds;
    if (seconds === null) break; // counts up, waits for "Fertig"
    if (now - stepStartedAt < seconds * 1000) break;
    stepStartedAt += seconds * 1000;
    index++;
    stepsPassed++;
  }

  return {
    run: { ...run, index, stepStartedAt },
    finished: index >= steps.length,
    stepsPassed,
  };
}

export function elapsedSeconds(run: RunState, now = Date.now()): number {
  const until = run.pausedAt ?? now;
  return Math.max(0, (until - run.stepStartedAt) / 1000);
}
