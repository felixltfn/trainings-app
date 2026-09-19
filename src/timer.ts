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
