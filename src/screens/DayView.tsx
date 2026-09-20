import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';

import { bodyweightFor, deleteWorkout } from '../data';
import { db, type Exercise, type Workout, type WorkoutSet } from '../db';
import { SIDE_LABEL, fmtClock, fmtDuration, fmtNum, parseIsoDate, trainingTime } from '../logic';
import { summarizeWorkout } from '../stats';
import { WorkoutScreen } from './WorkoutScreen';

interface Props {
  date: string;
  onClose: () => void;
}

export function DayView({ date, onClose }: Props) {
  const [editId, setEditId] = useState<number | null>(null);
  const data = useLiveQuery(async () => {
    const workouts = await db.workouts.toArray();
    const sets = await db.sets.toArray();
    const templates = await db.templates.toArray();
    const exercises = new Map((await db.exercises.toArray()).map((e) => [e.id, e]));
    return { workouts, sets, templates, exercises };
  }, [date]);

  if (!data) return <div className="sheet" />;
  if (editId !== null) {
    return (
      <div className="sheet">
        <WorkoutScreen workoutId={editId} mode="edit" onSetDone={() => {}} onClose={() => setEditId(null)} />
      </div>
    );
  }

  const { workouts, sets, templates, exercises } = data;
  const today = workouts.filter((w) => w.date === date).sort((a, b) => a.start - b.start);

  const remove = async (w: Workout) => {
    if (!confirm('Dieses Training wirklich löschen? Das lässt sich nicht rückgängig machen.')) return;
    await deleteWorkout(w.id);
    onClose();
  };

  return (
    <div className="sheet">
      <div className="screen">
        <button className="back" onClick={onClose}>
          ‹ Kalender
        </button>
        <h1 className="title">
          {parseIsoDate(date).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </h1>

        {today.length === 0 && <p className="muted section">Kein Training an diesem Tag.</p>}

        {today.map((w) => {
          const template = templates.find((t) => t.id === w.templateId);
          const summary = summarizeWorkout(w, sets, workouts, exercises);
          // Previous workout of the same training day, for comparison
          const prev = workouts
            .filter((o) => o.templateId === w.templateId && o.start < w.start)
            .sort((a, b) => b.start - a.start)[0];
          const prevSummary = prev ? summarizeWorkout(prev, sets, workouts, exercises) : null;
          const mine = sets.filter((s) => s.workoutId === w.id);
          // Training time: from the first to the last logged set
          const duration = trainingTime(w, sets);
          const prevDuration = prev ? trainingTime(prev, sets) : null;

          return (
            <div key={w.id} className="section">
              <p className="label">{template?.name ?? 'Training'}</p>
              <div className="stats-row">
                <Stat
                  label="Trainingszeit"
                  value={duration ? String(Math.round(duration / 60000)) : '–'}
                  unit="min"
                  delta={duration && prevDuration ? duration - prevDuration : null}
                  fmt={(d) => fmtDuration(Math.abs(d))}
                />
                <Stat
                  label="Volumen"
                  value={fmtNum(Math.round(summary.volume))}
                  unit="kg"
                  delta={prevSummary ? summary.volume - prevSummary.volume : null}
                  fmt={(d) => `${fmtNum(Math.round(Math.abs(d)))} kg`}
                />
                <Stat
                  label="Harte Sätze"
                  value={fmtNum(summary.hardSetTotal)}
                  unit="Sätze"
                  delta={prevSummary ? summary.hardSetTotal - prevSummary.hardSetTotal : null}
                  fmt={(d) => fmtNum(Math.abs(d))}
                />
              </div>
              <p className="small muted">
                {firstLastText(sets, w)}
              </p>
              {prev && (
                <p className="small muted">
                  Vergleich mit {parseIsoDate(prev.date).toLocaleDateString('de-DE')} ({template?.name})
                </p>
              )}
              {w.note && <p className="small">{w.note}</p>}

              <div className="section-sm">
                {[...new Set(mine.map((s) => s.exerciseId))].map((exerciseId) => (
                  <ExerciseBlock
                    key={exerciseId}
                    exercise={exercises.get(exerciseId)}
                    sets={mine.filter((s) => s.exerciseId === exerciseId)}
                    bodyweight={bodyweightFor(w, workouts)}
                  />
                ))}
              </div>

              <div className="section-sm">
                <p className="label">Harte Sätze pro Muskelgruppe</p>
                <table className="table">
                  <tbody>
                    {[...summary.hardSets.entries()]
                      .sort((a, b) => b[1] - a[1])
                      .map(([muscle, n]) => (
                        <tr key={muscle}>
                          <td>{muscle}</td>
                          <td>{fmtNum(n)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              {summary.records.length > 0 && (
                <div className="section-sm">
                  <p className="label">Neue Bestleistungen</p>
                  <table className="table">
                    <tbody>
                      {summary.records.map((r) => (
                        <tr key={r.exercise}>
                          <td>{r.exercise}</td>
                          <td className="accent">{r.text}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="row section-sm">
                <button className="btn secondary grow" onClick={() => setEditId(w.id)}>
                  Bearbeiten
                </button>
                <button className="btn danger" onClick={() => remove(w)}>
                  Löschen
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// "Erster Satz 18:12 · letzter Satz 19:27"
function firstLastText(sets: WorkoutSet[], w: Workout): string {
  const stamps = sets.filter((s) => s.workoutId === w.id).map((s) => s.timestamp);
  if (stamps.length === 0) return 'Keine Sätze eingetragen.';
  const time = (t: number) => new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  return `Erster Satz ${time(Math.min(...stamps))} · letzter Satz ${time(Math.max(...stamps))}`;
}

function Stat({ label, value, unit, delta, fmt }: { label: string; value: string; unit: string; delta: number | null; fmt: (d: number) => string }) {
  return (
    <div className="stat">
      <p className="label">{label}</p>
      <div className="big-num">{value}</div>
      <p className="small muted">{unit}</p>
      {delta !== null && Math.abs(delta) > 0.5 && (
        <p className={`small ${delta > 0 ? 'up' : 'down'}`}>
          {delta > 0 ? '+' : '−'}
          {fmt(delta)}
        </p>
      )}
    </div>
  );
}

function ExerciseBlock({ exercise, sets, bodyweight }: { exercise: Exercise | undefined; sets: WorkoutSet[]; bodyweight: number | null }) {
  if (!exercise) return null;
  const text = (s: WorkoutSet) => {
    const load = exercise.bodyweight ? `${fmtNum((bodyweight ?? 0) + s.weight)} kg (KG)` : `${fmtNum(s.weight)} kg`;
    const value = exercise.type === 'time' ? `${fmtClock(s.duration ?? 0)} min` : `${s.reps} Wdh`;
    return `${load} × ${value}${s.drop ? ' · Drop' : ''}${s.rir !== null ? ` · RIR ${s.rir}` : ''}`;
  };
  return (
    <div className="section-sm">
      <div className="spread">
        <b>{exercise.name}</b>
        <span className="small muted">{exercise.primaryMuscle}</span>
      </div>
      <table className="table">
        <tbody>
          {sets
            .sort((a, b) => a.setNumber - b.setNumber || a.side.localeCompare(b.side))
            .map((s) => (
              <tr key={s.id}>
                <td>
                  {s.setNumber}
                  {s.side !== 'both' ? ` ${SIDE_LABEL[s.side]}` : ''}
                </td>
                <td>{text(s)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
