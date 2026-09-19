import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';

import { bodyweightFor } from '../data';
import { db } from '../db';
import { fmtNum, isoDate, setVolume } from '../logic';
import { DayView } from './DayView';

interface Props {
  openDay: string | null;
  onOpenDay: (date: string | null) => void;
}

const DOW = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const WORKOUTS_PER_WEEK = 3;

export function CalendarScreen({ openDay, onOpenDay }: Props) {
  const today = new Date();
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const touchX = useRef<number | null>(null);

  const data = useLiveQuery(async () => {
    const workouts = await db.workouts.toArray();
    const sets = await db.sets.toArray();
    const templates = new Map((await db.templates.toArray()).map((t) => [t.id, t]));
    const exercises = new Map((await db.exercises.toArray()).map((e) => [e.id, e]));
    return { workouts, sets, templates, exercises };
  }, []);

  if (!data) return <div className="screen" />;
  const { workouts, sets, templates, exercises } = data;

  const year = month.getFullYear();
  const m = month.getMonth();
  const first = new Date(year, m, 1);
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const leading = (first.getDay() + 6) % 7; // Monday = 0
  const cells = Array.from({ length: Math.ceil((leading + daysInMonth) / 7) * 7 }, (_, i) =>
    new Date(year, m, i - leading + 1),
  );

  const monthWorkouts = workouts.filter((w) => w.date.startsWith(`${year}-${String(m + 1).padStart(2, '0')}`));
  const monthVolume = monthWorkouts.reduce((sum, w) => {
    const bw = bodyweightFor(w, workouts);
    return (
      sum +
      sets
        .filter((s) => s.workoutId === w.id)
        .reduce((v, s) => {
          const ex = exercises.get(s.exerciseId);
          return ex ? v + setVolume(s, ex, bw) : v;
        }, 0)
    );
  }, 0);
  const target = Math.round((daysInMonth / 7) * WORKOUTS_PER_WEEK);

  const shift = (delta: number) => setMonth(new Date(year, m + delta, 1));

  return (
    <div className="screen">
      <p className="label">Kalender</p>
      <div className="spread">
        <h1 className="title">{month.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</h1>
        <div className="row">
          <button className="icon-btn" aria-label="Vorheriger Monat" onClick={() => shift(-1)}>
            ‹
          </button>
          <button className="icon-btn" aria-label="Nächster Monat" onClick={() => shift(1)}>
            ›
          </button>
        </div>
      </div>

      <div className="stats-row section-sm">
        <div className="stat">
          <p className="label">Trainings</p>
          <div className="big-num">{monthWorkouts.length}</div>
        </div>
        <div className="stat">
          <p className="label">Soll</p>
          <div className="big-num muted">{target}</div>
        </div>
        <div className="stat">
          <p className="label">Volumen</p>
          <div className="big-num">{fmtNum(Math.round(monthVolume / 1000))}<span className="small"> t</span></div>
        </div>
      </div>

      <div
        className="cal-grid section"
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX.current === null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          if (Math.abs(dx) > 50) shift(dx < 0 ? 1 : -1);
          touchX.current = null;
        }}
      >
        {DOW.map((d) => (
          <div key={d} className="cal-dow">
            {d}
          </div>
        ))}
        {cells.map((d) => {
          const iso = isoDate(d);
          const dayWorkouts = workouts.filter((w) => w.date === iso);
          const classes = [
            'cal-day',
            d.getMonth() !== m ? 'other' : '',
            iso === isoDate(today) ? 'today' : '',
            dayWorkouts.length ? 'has' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button key={iso} className={classes} onClick={() => onOpenDay(iso)}>
              <span className="d">{d.getDate()}</span>
              {dayWorkouts.map((w) => (
                <span key={w.id} className="cal-mark">
                  {templates.get(w.templateId)?.short ?? '•'}
                </span>
              ))}
            </button>
          );
        })}
      </div>

      {openDay && <DayView date={openDay} onClose={() => onOpenDay(null)} />}
    </div>
  );
}
