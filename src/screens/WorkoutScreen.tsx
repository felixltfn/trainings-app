import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';

import { deleteWorkout } from '../data';
import { db, type Slot } from '../db';
import { fmtDuration, fmtNum, parseNum } from '../logic';
import { SlotCard } from './SlotCard';

interface Props {
  workoutId: number;
  mode: 'live' | 'edit'; // edit = a finished workout opened from the calendar
  onSetDone: (slot: Slot) => void;
  onClose: (finishedDate: string | null) => void;
}

export function WorkoutScreen({ workoutId, mode, onSetDone, onClose }: Props) {
  const workout = useLiveQuery(() => db.workouts.get(workoutId), [workoutId]);
  const template = useLiveQuery(async () => (workout ? db.templates.get(workout.templateId) : undefined), [workout?.templateId]);
  const slots = useLiveQuery(
    async () => (workout ? db.slots.where('templateId').equals(workout.templateId).sortBy('position') : []),
    [workout?.templateId],
  );
  const exercises = useLiveQuery(async () => new Map((await db.exercises.toArray()).map((e) => [e.id, e])), []);
  const sets = useLiveQuery(() => db.sets.where('workoutId').equals(workoutId).toArray(), [workoutId]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, []);

  if (!workout || !slots || !exercises || !sets) return <div className="screen" />;

  // Session order: stored order first, slots added to the template later are appended
  const byId = new Map(slots.map((s) => [s.id, s]));
  const ordered = [
    ...workout.slotOrder.map((id) => byId.get(id)).filter((s): s is Slot => !!s),
    ...slots.filter((s) => !workout.slotOrder.includes(s.id)),
  ];

  // Free slots swap with the next free slot; fixed slots never move.
  const neighbour = (index: number, dir: -1 | 1): number => {
    for (let i = index + dir; i >= 0 && i < ordered.length; i += dir) {
      if (!ordered[i].orderFixed) return i;
    }
    return -1;
  };

  const move = (index: number, dir: -1 | 1) => {
    const j = neighbour(index, dir);
    if (j < 0) return;
    const order = ordered.map((s) => s.id);
    [order[index], order[j]] = [order[j], order[index]];
    db.workouts.update(workout.id, { slotOrder: order });
  };

  const partnerOf = (slot: Slot): string | null => {
    if (!slot.supersetGroup) return null;
    const others = slots.filter((s) => s.id !== slot.id && s.supersetGroup === slot.supersetGroup);
    if (others.length === 0) return null;
    return others
      .map((o) => `${o.position}. ${exercises.get(workout.choices[o.id] ?? o.exerciseId)?.name ?? o.name}`)
      .join(', ');
  };

  const finish = async () => {
    if (sets.length === 0 && !confirm('Noch kein Satz eingetragen. Trotzdem beenden?')) return;
    await db.workouts.update(workout.id, { end: Date.now() });
    onClose(workout.date);
  };

  const cancel = async () => {
    if (!confirm('Dieses Training mit allen Sätzen löschen?')) return;
    await deleteWorkout(workout.id);
    onClose(null);
  };

  const elapsed = (workout.end ?? now) - workout.start;

  return (
    <div className="screen">
      {mode === 'edit' && (
        <button className="back" onClick={() => onClose(null)}>
          ‹ Zurück
        </button>
      )}
      <p className="label">{mode === 'live' ? 'Läuft' : 'Bearbeiten'} · {fmtDuration(elapsed)}</p>
      <h1 className="title">{template?.name ?? 'Training'}</h1>

      <div className="pair section-sm">
        <label className="field">
          <span>Körpergewicht (kg)</span>
          <input
            className="input num"
            inputMode="decimal"
            defaultValue={workout.bodyweight === null ? '' : fmtNum(workout.bodyweight)}
            onBlur={(e) => db.workouts.update(workout.id, { bodyweight: parseNum(e.target.value) })}
          />
        </label>
        {mode === 'edit' && (
          <label className="field">
            <span>Datum</span>
            <input
              className="input"
              type="date"
              defaultValue={workout.date}
              onBlur={(e) => e.target.value && db.workouts.update(workout.id, { date: e.target.value })}
            />
          </label>
        )}
      </div>

      <div className="section">
        {ordered.map((slot, i) => (
          <SlotCard
            key={slot.id}
            slot={slot}
            workout={workout}
            exercises={exercises}
            sets={sets}
            partner={partnerOf(slot)}
            canMoveUp={neighbour(i, -1) >= 0}
            canMoveDown={neighbour(i, 1) >= 0}
            onMove={(dir) => move(i, dir)}
            onSetDone={onSetDone}
          />
        ))}
      </div>

      <label className="field">
        <span>Notiz</span>
        <textarea
          className="input"
          defaultValue={workout.note}
          onBlur={(e) => db.workouts.update(workout.id, { note: e.target.value })}
        />
      </label>

      <div className="section stack">
        {mode === 'live' ? (
          <>
            <button className="btn block" onClick={finish}>
              Training beenden
            </button>
            <button className="btn danger block" onClick={cancel}>
              Training verwerfen
            </button>
          </>
        ) : (
          <button className="btn block" onClick={() => onClose(null)}>
            Fertig
          </button>
        )}
      </div>
    </div>
  );
}
