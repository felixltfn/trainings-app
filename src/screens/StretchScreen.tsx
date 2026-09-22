import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';

import { db } from '../db';
import { fmtClock, fmtDuration, isoDate } from '../logic';
import { beep, unlockAudio } from '../signal';
import { buildSteps, catchUp, elapsedSeconds, loadRun, roundLabel, saveRun, type RunState } from '../stretchRun';

interface Props {
  onClose: () => void;
}

// Keeps the screen awake while the routine runs (Safari supports this since 16.4).
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let lock: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        lock = (await navigator.wakeLock?.request('screen')) ?? null;
      } catch {
        // Not available or denied – the run works anyway, the screen just dims.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') request();
    };
    request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release().catch(() => {});
    };
  }, [active]);
}

export function StretchScreen({ onClose }: Props) {
  const stretches = useLiveQuery(() => db.stretches.orderBy('position').toArray(), []);
  const [run, setRun] = useState<RunState | null>(loadRun);
  const [done, setDone] = useState<{ seconds: number } | null>(null);
  const [now, setNow] = useState(Date.now());

  useWakeLock(run !== null && run.pausedAt === null);

  // One clock for everything; a hidden tab simply catches up on the next tick.
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, 250);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);

  const steps = stretches ? buildSteps(stretches) : [];

  const finish = async (state: RunState, endedAt: number) => {
    const seconds = Math.round((endedAt - state.startedAt) / 1000);
    await db.stretchSessions.add({
      date: isoDate(new Date(endedAt)),
      start: state.startedAt,
      end: endedAt,
      seconds,
    });
    saveRun(null);
    setRun(null);
    setDone({ seconds });
  };

  // Move the run to where it should be now – possibly several steps at once
  useEffect(() => {
    if (!run || steps.length === 0) return;
    const result = catchUp(run, steps, now);
    if (result.stepsPassed === 0 && !result.finished) return;
    if (result.stepsPassed > 0) beep();
    if (result.finished) {
      finish(run, run.stepStartedAt + (steps[steps.length - 1]?.seconds ?? 0) * 1000);
      return;
    }
    setRun(result.run);
    saveRun(result.run);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, steps.length]);

  if (!stretches) return <div className="screen" />;

  // ---------- Finished ----------
  if (done) {
    return (
      <div className="screen stretch">
        <p className="label">Dehnen</p>
        <h1 className="title">Fertig</h1>
        <div className="big-num section">{fmtDuration(done.seconds * 1000)}</div>
        <p className="muted">Die Einheit ist gespeichert.</p>
        <button className="btn block section" onClick={onClose}>
          Zur Startseite
        </button>
      </div>
    );
  }

  // ---------- Not started yet ----------
  if (!run) {
    const total = steps.reduce((sum, s) => sum + (s.seconds ?? 30), 0);
    return (
      <div className="screen stretch">
        <p className="label">Nach dem Training</p>
        <h1 className="title">Dehnen</h1>
        <p className="muted">
          {stretches.length} Übungen, etwa {Math.round(total / 60)} Minuten. Der Ablauf läuft von selbst durch – leg
          das Handy neben dich.
        </p>
        <button
          className="btn block section"
          onClick={() => {
            unlockAudio();
            const started: RunState = { startedAt: Date.now(), index: 0, stepStartedAt: Date.now(), pausedAt: null };
            setRun(started);
            saveRun(started);
          }}
        >
          Dehnen starten
        </button>
        <button className="btn secondary block section-sm" onClick={onClose}>
          Zurück
        </button>
      </div>
    );
  }

  const step = steps[run.index];
  if (!step) return <div className="screen" />;

  const elapsed = elapsedSeconds(run, now);
  const remaining = step.seconds === null ? null : Math.max(0, step.seconds - elapsed);
  const paused = run.pausedAt !== null;

  const update = (next: RunState) => {
    setRun(next);
    saveRun(next);
  };

  const goTo = (index: number) => {
    if (index < 0) return;
    if (index >= steps.length) {
      finish(run, Date.now());
      return;
    }
    update({ ...run, index, stepStartedAt: Date.now(), pausedAt: null });
  };

  const togglePause = () => {
    if (paused) {
      // Shift the start by the time spent paused, so nothing is lost
      const pausedFor = Date.now() - (run.pausedAt ?? Date.now());
      update({ ...run, stepStartedAt: run.stepStartedAt + pausedFor, pausedAt: null });
    } else {
      update({ ...run, pausedAt: Date.now() });
    }
  };

  const exercisesTotal = stretches.length;
  const label = roundLabel(step);

  return (
    <div className="screen stretch">
      <div className="spread">
        <p className="label flush">
          Übung {step.exerciseIndex + 1} von {exercisesTotal}
        </p>
        <p className="label flush">{fmtClock((now - run.startedAt) / 1000)}</p>
      </div>

      {step.kind === 'rest' ? (
        <>
          <h1 className="title section-sm">Pause</h1>
          <div className="stretch-clock">{fmtClock(remaining ?? 0)}</div>
          <p className="muted">
            Als Nächstes: <b>{step.name}</b>
            {label ? ` · ${label}` : ''}
          </p>
        </>
      ) : (
        <>
          <h1 className="title section-sm">{step.name}</h1>
          {label && <p className="accent">{label}</p>}
          <div className="stretch-clock">{step.seconds === null ? fmtClock(elapsed) : fmtClock(remaining ?? 0)}</div>
          {step.seconds === null ? (
            <button className="btn block section-sm" onClick={() => goTo(run.index + 1)}>
              Fertig
            </button>
          ) : null}
          <p className="stretch-note">{step.note}</p>
        </>
      )}

      <div className="stretch-controls">
        <button className="btn secondary" onClick={() => goTo(run.index - 1)}>
          ‹ Zurück
        </button>
        <button className="btn secondary grow" onClick={togglePause}>
          {paused ? 'Weiter' : 'Pause'}
        </button>
        <button className="btn secondary" onClick={() => goTo(run.index + 1)}>
          Überspringen ›
        </button>
      </div>

      <button
        className="btn danger block section-sm"
        onClick={() => {
          if (confirm('Dehnen beenden? Die bisherige Zeit wird gespeichert.')) finish(run, Date.now());
        }}
      >
        Dehnen beenden
      </button>
    </div>
  );
}
