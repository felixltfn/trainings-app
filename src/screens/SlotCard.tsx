import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';

import { previousSession } from '../data';
import { db, type Exercise, type Side, type Slot, type Workout, type WorkoutSet } from '../db';
import { SIDE_LABEL, WEIGHT_STEP, fmtClock, fmtNum, fmtRest, reachedTop, sidesOf, slotTargets } from '../logic';
import { SetRow, type Prefill, type SetValues } from './SetRow';

interface Props {
  slot: Slot;
  workout: Workout;
  exercises: Map<number, Exercise>;
  sets: WorkoutSet[]; // all sets of this workout
  partner: string | null; // superset partner label
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (dir: -1 | 1) => void;
  onSetDone: (slot: Slot) => void;
}

export function SlotCard({ slot, workout, exercises, sets, partner, canMoveUp, canMoveDown, onMove, onSetDone }: Props) {
  const [showDetails, setShowDetails] = useState(false);
  const exerciseId = workout.choices[slot.id] ?? slot.exerciseId;
  const ex = exercises.get(exerciseId);
  const previous = useLiveQuery(() => previousSession(exerciseId, workout), [exerciseId, workout.id, workout.start]);

  if (!ex) return null;

  const targets = slotTargets(slot, exerciseId);
  const sides = sidesOf(ex);
  const mine = sets.filter((s) => s.slotId === slot.id && s.exerciseId === exerciseId);
  const extraKey = `${slot.id}:${exerciseId}`;
  const rowCount = Math.max(
    targets.sets + (workout.extraSets[extraKey] ?? 0),
    ...mine.map((s) => s.setNumber),
  );
  // Sets done with another exercise of this slot (after switching) stay visible as a hint
  const otherExercises = [...new Set(sets.filter((s) => s.slotId === slot.id && s.exerciseId !== exerciseId).map((s) => s.exerciseId))];

  const prevSets = previous?.sets ?? [];
  const prevBySide = (side: Side) => prevSets.filter((s) => s.side === side && !s.drop);
  // Progression: last time every set of this side hit the top of the range -> more weight today
  const progressed = new Map<Side, boolean>(sides.map((side) => [side, reachedTop(prevBySide(side), ex, targets)]));

  const prefillFor = (setNumber: number, side: Side): Prefill => {
    const list = prevBySide(side);
    const p = list.find((s) => s.setNumber === setNumber) ?? list[list.length - 1];
    if (!p) return { weight: ex.bodyweight ? 0 : null, value: null };
    const value = ex.type === 'time' ? p.duration : p.reps;
    if (progressed.get(side)) {
      const maxWeight = Math.max(...list.map((s) => s.weight));
      return { weight: maxWeight + WEIGHT_STEP, value: targets.repMin || value };
    }
    return { weight: p.weight, value };
  };

  const lastText = (setNumber: number, side: Side): string => {
    const p = prevBySide(side).find((s) => s.setNumber === setNumber);
    if (!p) return '';
    const v = ex.type === 'time' ? fmtClock(p.duration ?? 0) + ' min' : `${p.reps}`;
    const w = ex.bodyweight && p.weight === 0 ? 'KG' : `${fmtNum(p.weight)} kg`;
    return `zuletzt ${w} × ${v}`;
  };

  const save = async (setNumber: number, side: Side, v: SetValues) => {
    const existing = mine.find((s) => s.setNumber === setNumber && s.side === side);
    const fields = {
      weight: v.weight,
      reps: ex.type === 'time' ? null : v.value,
      duration: ex.type === 'time' ? v.value : null,
      rir: existing?.rir ?? null, // RIR is no longer entered; old values stay untouched
      drop: v.drop,
    };
    if (existing) {
      await db.sets.update(existing.id, fields);
      return;
    }
    await db.sets.add({
      workoutId: workout.id,
      exerciseId,
      slotId: slot.id,
      setNumber,
      side,
      timestamp: Date.now(),
      ...fields,
    });
    // Start the rest timer once all sides of this set are done
    const doneSides = new Set(mine.filter((s) => s.setNumber === setNumber).map((s) => s.side));
    doneSides.add(side);
    if (sides.every((s) => doneSides.has(s))) onSetDone(slot);
  };

  // Reset: the entry is deleted, the row stays and is prefilled again.
  const reset = async (setNumber: number, side: Side) => {
    const existing = mine.find((s) => s.setNumber === setNumber && s.side === side);
    if (existing) await db.sets.delete(existing.id);
  };

  // Remove row: only for sets added with "+ Satz" – entry and row disappear.
  const removeRow = async (setNumber: number) => {
    await db.sets.bulkDelete(mine.filter((s) => s.setNumber === setNumber).map((s) => s.id));
    const extra = Math.max(0, (workout.extraSets[extraKey] ?? 0) - 1);
    await db.workouts.update(workout.id, { extraSets: { ...workout.extraSets, [extraKey]: extra } });
  };

  const choose = (id: number) => db.workouts.update(workout.id, { choices: { ...workout.choices, [slot.id]: id } });

  const addSet = () =>
    db.workouts.update(workout.id, {
      extraSets: { ...workout.extraSets, [extraKey]: rowCount - targets.sets + 1 },
    });

  // Today's hint: all planned sets done and at the top of the range
  const doneNow = sides.every((side) =>
    reachedTop(
      mine.filter((s) => s.side === side),
      ex,
      targets,
    ),
  );
  const progressSides = sides.filter((s) => progressed.get(s));

  const options = [slot.exerciseId, ...slot.alternativeIds];

  return (
    <section className="slot">
      <div className="slot-head">
        <span className="slot-pos">{slot.position}</span>
        <span className="label grow flush">
          {slot.name}
        </span>
        <button className="icon-btn" aria-label="Nach oben" disabled={!canMoveUp} onClick={() => onMove(-1)}>
          ↑
        </button>
        <button className="icon-btn" aria-label="Nach unten" disabled={!canMoveDown} onClick={() => onMove(1)}>
          ↓
        </button>
      </div>

      {options.length > 1 ? (
        <select className="select slot-select" value={exerciseId} onChange={(e) => choose(Number(e.target.value))}>
          {options.map((id) => (
            <option key={id} value={id}>
              {exercises.get(id)?.name ?? '?'}
              {id === slot.exerciseId ? '' : ' (Alt.)'}
            </option>
          ))}
        </select>
      ) : (
        <div className="h2 slot-select">{ex.name}</div>
      )}

      <div className="slot-info">
        <span>
          Pause <b>{fmtRest(slot.restMin, slot.restMax)}</b>
        </span>
        {partner && <span>Supersatz mit {partner}</span>}
        {ex.unilateral && <span>einseitig</span>}
        {ex.bodyweight && <span>KG + Zusatzgewicht</span>}
      </div>
      {ex.note && <p className="small muted">{ex.note}</p>}

      {progressSides.length > 0 && (
        <div className="hint">
          ↑ Mehr Gewicht{ex.unilateral ? ` (${progressSides.map((s) => SIDE_LABEL[s]).join(' + ')})` : ''}: letztes
          Mal oberes Ende erreicht
        </div>
      )}
      {doneNow && <div className="hint">✓ Oberes Ende erreicht – nächstes Mal +{fmtNum(WEIGHT_STEP)} kg</div>}
      {otherExercises.length > 0 && (
        <p className="small muted">
          Auch erfasst: {otherExercises.map((id) => exercises.get(id)?.name).join(', ')}
        </p>
      )}

      <div className="sets">
        <div className={`set-head${ex.type === 'time' ? ' time' : ''}`}>
          <span />
          <span>{ex.bodyweight ? '+ kg' : 'kg'}</span>
          {ex.type === 'time' ? (
            <>
              <span>Min</span>
              <span>Sek</span>
            </>
          ) : (
            <span />
          )}
          <span />
        </div>
        {Array.from({ length: rowCount }, (_, i) => i + 1).map((n) =>
          sides.map((side) => (
            <div key={`${exerciseId}-${n}-${side}`}>
              <SetRow
                setNumber={n}
                side={side}
                type={ex.type}
                saved={mine.find((s) => s.setNumber === n && s.side === side)}
                prefill={prefillFor(n, side)}
                showDetails={showDetails}
                extraRow={n > targets.sets}
                onSave={(v) => save(n, side, v)}
                onReset={() => reset(n, side)}
                onRemoveRow={() => removeRow(n)}
              />
              <div className="last">{lastText(n, side)}</div>
            </div>
          )),
        )}
      </div>

      {showDetails && (
        <p className="small muted">
          Dropsatz: Satz, bei dem du sofort Gewicht reduzierst und weitermachst. Markierte Dropsätze zählen in der
          Statistik nicht als eigener harter Satz. Zurücksetzen leert einen falsch eingetragenen Satz.
        </p>
      )}

      <div className="slot-actions">
        <button className="btn secondary grow" onClick={addSet}>
          + Satz
        </button>
        <button className={`btn secondary${showDetails ? ' on' : ''}`} onClick={() => setShowDetails(!showDetails)}>
          {showDetails ? 'Fertig' : 'Satz bearbeiten'}
        </button>
      </div>
    </section>
  );
}
