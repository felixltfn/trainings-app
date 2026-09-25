import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';

import { deleteWorkout, loadProgression } from '../data';
import { db, type Slot } from '../db';
import { fmtDuration, fmtNum, parseNum } from '../logic';
import { DELOAD_RIR, isDeloadWeek } from '../progression';
import { SlotCard } from './SlotCard';

interface Props {
  workoutId: number;
  mode: 'live' | 'edit'; // edit = a finished workout opened from the calendar
  onRest: (min: number, max: number) => void; // seconds
  onClose: (finishedDate: string | null) => void;
}

export function WorkoutScreen({ workoutId, mode, onRest, onClose }: Props) {
  const workout = useLiveQuery(() => db.workouts.get(workoutId), [workoutId]);
  const template = useLiveQuery(async () => (workout ? db.templates.get(workout.templateId) : undefined), [workout?.templateId]);
  const slots = useLiveQuery(
    async () => (workout ? db.slots.where('templateId').equals(workout.templateId).sortBy('position') : []),
    [workout?.templateId],
  );
  const exercises = useLiveQuery(async () => new Map((await db.exercises.toArray()).map((e) => [e.id, e])), []);
  const sets = useLiveQuery(() => db.sets.where('workoutId').equals(workoutId).toArray(), [workoutId]);
  const settings = useLiveQuery(loadProgression, []);
  const plan = useLiveQuery(async () => (template ? db.planVersions.get(template.planVersionId) : undefined), [template?.planVersionId]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, []);

  if (!workout || !slots || !exercises || !sets || !settings) return <div className="screen" />;

  const deload = !!plan && isDeloadWeek(plan.start, workout.date, settings.deloadEvery);

  // Session order: stored order first, slots added to the template later are appended.
  // Exercises skipped for today are left out.
  const byId = new Map(slots.map((s) => [s.id, s]));
  const skipped = workout.skippedSlots ?? [];
  const ordered = [
    ...workout.slotOrder.map((id) => byId.get(id)).filter((s): s is Slot => !!s),
    ...slots.filter((s) => !workout.slotOrder.includes(s.id)),
  ].filter((s) => !skipped.includes(s.id));

  // Any exercise can be moved during the session (a machine may be busy).
  // "fest" from the plan stays visible as a hint only.
  const neighbour = (index: number, dir: -1 | 1): number => {
    const j = index + dir;
    return j >= 0 && j < ordered.length ? j : -1;
  };

  const move = (index: number, dir: -1 | 1) => {
    const j = neighbour(index, dir);
    if (j < 0) return;
    const order = ordered.map((s) => s.id);
    [order[index], order[j]] = [order[j], order[index]];
    db.workouts.update(workout.id, { slotOrder: order });
  };

  const partnerSlotsOf = (slot: Slot): Slot[] =>
    slot.supersetGroup
      ? slots.filter((s) => s.id !== slot.id && s.supersetGroup === slot.supersetGroup && !skipped.includes(s.id))
      : [];

  const partnerOf = (slot: Slot): string | null => {
    const others = partnerSlotsOf(slot);
    if (others.length === 0) return null;
    return others
      .map((o) => `${o.position}. ${exercises.get(workout.choices[o.id] ?? o.exerciseId)?.name ?? o.name}`)
      .join(', ');
  };

  // Skipping only affects this session and can be undone right below the list,
  // so it needs no confirmation. Sets already entered stay saved.
  const skip = (slot: Slot) => db.workouts.update(workout.id, { skippedSlots: [...skipped, slot.id] });

  const unskip = (slotId: number) =>
    db.workouts.update(workout.id, { skippedSlots: skipped.filter((id) => id !== slotId) });

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

  // Same definition as in the day view: first set to last set (while running: until now)
  const stamps = sets.map((s) => s.timestamp);
  const elapsed = stamps.length ? (workout.end ?? now) - Math.min(...stamps) : 0;

  return (
    <div className="screen">
      <button className="back" onClick={() => onClose(null)}>
        ‹ {mode === 'live' ? 'Trainingstage' : 'Zurück'}
      </button>
      <p className="label">
        {mode === 'live' ? 'Läuft' : 'Bearbeiten'}
        {stamps.length > 0 && ` · Trainingszeit ${fmtDuration(elapsed)}`}
      </p>
      <h1 className="title">{template?.name ?? 'Training'}</h1>
      {deload && (
        <p className="banner section-sm">
          Deload-Woche: gleiches Gewicht wie zuletzt, halbe Sätze, RIR {DELOAD_RIR}.
        </p>
      )}

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
            partnerSlots={partnerSlotsOf(slot)}
            settings={settings}
            deload={deload}
            canMoveUp={neighbour(i, -1) >= 0}
            canMoveDown={neighbour(i, 1) >= 0}
            onMove={(dir) => move(i, dir)}
            onRest={onRest}
            onSkip={() => skip(slot)}
          />
        ))}
      </div>

      {skipped.length > 0 && (
        <div className="section-sm">
          <p className="label">Heute gestrichen</p>
          <div className="list">
            {skipped.map((id) => (
              <div key={id} className="list-item">
                <span className="grow">{byId.get(id)?.name ?? 'Übung'}</span>
                <button className="btn ghost" onClick={() => unskip(id)}>
                  zurückholen
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

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
              Training speichern
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
