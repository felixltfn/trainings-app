import type { Cue } from './signal';

// Rest timer state. It stores timestamps, not a countdown, because iOS pauses
// JavaScript while the screen is locked – the remaining time is always recomputed from the clock.

export interface TimerState {
  startedAt: number; // epoch ms
  min: number; // seconds
  max: number; // seconds
}

const KEY = 'restTimer';

export function loadTimer(): TimerState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as TimerState) : null;
  } catch {
    return null;
  }
}

export function saveTimer(t: TimerState | null): void {
  try {
    if (t) localStorage.setItem(KEY, JSON.stringify(t));
    else localStorage.removeItem(KEY);
  } catch {
    // Private mode: the timer still works for this session.
  }
}

export const WARN_AT = 10; // seconds before the end of the pause

// One beep 10 s before the end, two beeps when the pause is over (start of the next set).
// Cues in the past are dropped by the player, so after ±15 nothing fires twice.
export function timerCues(t: TimerState): Cue[] {
  return [
    { at: t.startedAt + (t.min - WARN_AT) * 1000, kind: 'warn' },
    { at: t.startedAt + t.min * 1000, kind: 'go' },
  ];
}
