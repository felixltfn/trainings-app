import { useEffect, useState } from 'react';

import { fmtClock } from './logic';
import type { TimerState } from './timer';

interface Props {
  timer: TimerState;
  onChange: (t: TimerState | null) => void;
}

export function RestTimer({ timer, onChange }: Props) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, 250);
    // Refresh immediately when the phone is unlocked again
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);

  const elapsed = (now - timer.startedAt) / 1000;
  const remaining = timer.min - elapsed;
  const done = remaining <= 0;
  const toMax = timer.max - elapsed;

  return (
    <div className={`timer${done ? ' done' : ''}`} role="timer">
      <div className="grow">
        <div className="big-num">{done ? `+${fmtClock(-remaining)}` : fmtClock(remaining)}</div>
        <div className="small timer-sub">
          {done
            ? toMax > 0
              ? `Pause vorbei · max. noch ${fmtClock(toMax)}`
              : 'Obere Pausengrenze erreicht'
            : `Pause · max. ${fmtClock(timer.max)}`}
        </div>
      </div>
      <button className="icon-btn" aria-label="15 Sekunden weniger" onClick={() => onChange({ ...timer, min: timer.min - 15, max: timer.max - 15 })}>
        −15
      </button>
      <button className="icon-btn" aria-label="15 Sekunden mehr" onClick={() => onChange({ ...timer, min: timer.min + 15, max: timer.max + 15 })}>
        +15
      </button>
      <button className="icon-btn" aria-label="Timer schließen" onClick={() => onChange(null)}>
        ✕
      </button>
    </div>
  );
}
