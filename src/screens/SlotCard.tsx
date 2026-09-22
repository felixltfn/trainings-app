import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';

import { previousSession } from '../data';
import { db, type Exercise, type Side, type Slot, type Workout, type WorkoutSet } from '../db';
import {
  EXERCISE_CHANGE_REST,
  SIDE_LABEL,
  WEIGHT_STEP,
  fmtClock,
  fmtNum,
  fmtRest,
  reachedTop,
  sidesOf,
  slotComplete,
  slotRowCount,
  slotTargets,
} from '../logic';
import { Picker } from '../Picker';
import { SetRow, type Prefill, type SetValues } from './SetRow';

interface Props {
  slot: Slot;
  workout: Workout;
  exercises: Map<number, Exercise>;
  sets: WorkoutSet[]; // all sets of this workout
  partner: string | null; // superset partner label
  partnerSlots: Slot[]; // the other slots of this superset (empty if none)
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (dir: -1 | 1) => void;
  onRest: (min: number, max: number) => void; // seconds
  onSkip: () => void;
}

export function SlotCard({ slot, workout, exercises, sets, partner, partnerSlots, canMoveUp, canMoveDown, onMove, onRest, onSkip }: Props) {
  const [showDetails, setShowDetails] = useState(false);
  // Set numbers with a drop set row that isn't saved yet
  const [openDrops, setOpenDrops] = useState<number[]>([]);
  // Rows that were reset stay empty instead of showing last time's values
  const [cleared, setCleared] = useState<string[]>([]);

  const exerciseId = workout.choices[slot.id] ?? slot.exerciseId;
  const ex = exercises.get(exerciseId);
  const previous = useLiveQuery(() => previousSession(exerciseId, workout), [exerciseId, workout.id, workout.start]);

  if (!ex) return null;

  const targets = slotTargets(slot, exerciseId);
  const sides = sidesOf(ex);
  const mine = sets.filter((s) => s.slotId === slot.id && s.exerciseId === exerciseId);
  const key = `${slot.id}:${exerciseId}`;
  const rowCount = slotRowCount(slot, workout, exerciseId, mine);
  // Sets done with another exercise of this slot (after switching) stay visible as a hint
  const otherExercises = [...new Set(sets.filter((s) => s.slotId === slot.id && s.exerciseId !== exerciseId).map((s) => s.exerciseId))];

  const prevSets = previous?.sets ?? [];
  const prevBySide = (side: Side) => prevSets.filter((s) => s.side === side && !s.drop);
  // Progression: last time every set of this side hit the top of the range -> more weight today
  const progressed = new Map<Side, boolean>(sides.map((side) => [side, reachedTop(prevBySide(side), ex, targets)]));

  const savedSet = (n: number, side: Side, drop: boolean) =>
    mine.find((s) => s.setNumber === n && s.side === side && s.drop === drop);

  const clearKey = (n: number, side: Side, drop: boolean) => `${n}:${side}:${drop}`;

  const prefillFor = (n: number, side: Side, drop: boolean): Prefill => {
    if (drop || cleared.includes(clearKey(n, side, drop))) return { weight: null, value: null };
    const list = prevBySide(side);
    const p = list.find((s) => s.setNumber === n) ?? list[list.length - 1];
    if (!p) return { weight: ex.bodyweight ? 0 : null, value: null };
    // Only the weight is carried over – reps are entered fresh every time
    if (progressed.get(side)) {
      const maxWeight = Math.max(...list.map((s) => s.weight));
      return { weight: maxWeight + WEIGHT_STEP, value: null };
    }
    return { weight: p.weight, value: null };
  };

  const lastText = (n: number, side: Side): string => {
    const p = prevBySide(side).find((s) => s.setNumber === n);
    if (!p) return '';
    const v = ex.type === 'time' ? `${fmtClock(p.duration ?? 0)} min` : `${p.reps}`;
    const w = ex.bodyweight && p.weight === 0 ? 'KG' : `${fmtNum(p.weight)} kg`;
    return `zuletzt ${w} × ${v}`;
  };

  const save = async (n: number, side: Side, drop: boolean, v: SetValues) => {
    const existing = savedSet(n, side, drop);
    const fields = {
      weight: v.weight,
      reps: ex.type === 'time' ? null : v.value,
      duration: ex.type === 'time' ? v.value : null,
    };
    setCleared(cleared.filter((c) => c !== clearKey(n, side, drop)));
    if (existing) {
      await db.sets.update(existing.id, fields);
      return;
    }
    const record: Omit<WorkoutSet, 'id'> = {
      workoutId: workout.id,
      exerciseId,
      slotId: slot.id,
      setNumber: n,
      side,
      drop,
      rir: null,
      timestamp: Date.now(),
      ...fields,
    };
    const id = await db.sets.add(record);
    // Start the rest timer once all sides of this row are done
    const done = new Set(mine.filter((s) => s.setNumber === n && s.drop === drop).map((s) => s.side));
    done.add(side);
    if (!sides.every((s) => done.has(s)) || slot.restMin <= 0) return;
    // Last set of the exercise (and of its superset partners): fixed change-over pause
    const after = [...sets, { ...record, id }];
    const exerciseDone = [slot, ...partnerSlots].every((s) => {
      const e = exercises.get(workout.choices[s.id] ?? s.exerciseId);
      return !e || slotComplete(s, workout, e, after);
    });
    if (exerciseDone) onRest(EXERCISE_CHANGE_REST, EXERCISE_CHANGE_REST);
    else onRest(slot.restMin, slot.restMax);
  };

  // Reset: the entries of this set are deleted and the fields stay empty
  const resetSet = async (n: number) => {
    await db.sets.bulkDelete(mine.filter((s) => s.setNumber === n).map((s) => s.id));
    setCleared([
      ...cleared,
      ...sides.flatMap((side) => [clearKey(n, side, false), clearKey(n, side, true)]),
    ]);
  };

  // Delete: the row disappears, later sets move up one number
  const deleteSet = async (n: number) => {
    await db.transaction('rw', db.sets, db.workouts, async () => {
      await db.sets.bulkDelete(mine.filter((s) => s.setNumber === n).map((s) => s.id));
      for (const s of mine.filter((s) => s.setNumber > n)) {
        await db.sets.update(s.id, { setNumber: s.setNumber - 1 });
      }
      await db.workouts.update(workout.id, {
        setCounts: { ...workout.setCounts, [key]: Math.max(1, rowCount - 1) },
      });
    });
    setOpenDrops(openDrops.filter((d) => d !== n));
  };

  const addSet = () => db.workouts.update(workout.id, { setCounts: { ...workout.setCounts, [key]: rowCount + 1 } });

  const choose = (id: number) => db.workouts.update(workout.id, { choices: { ...workout.choices, [slot.id]: id } });

  // Today's hint: all planned sets done and at the top of the range
  const doneNow = sides.every((side) => reachedTop(mine.filter((s) => s.side === side && !s.drop), ex, targets));
  const progressSides = sides.filter((s) => progressed.get(s));
  const options = [slot.exerciseId, ...slot.alternativeIds];

  return (
    <section className="slot">
      <div className="slot-head">
        <span className="slot-pos">{slot.position}</span>
        <span className="label grow flush">{slot.name}</span>
        <button className="icon-btn" aria-label="Nach oben" disabled={!canMoveUp} onClick={() => onMove(-1)}>
          ↑
        </button>
        <button className="icon-btn" aria-label="Nach unten" disabled={!canMoveDown} onClick={() => onMove(1)}>
          ↓
        </button>
      </div>

      {options.length > 1 ? (
        <Picker
          big
          title="Übung für diesen Slot"
          value={exerciseId}
          options={options.map((id) => ({
            value: id,
            label: exercises.get(id)?.name ?? '?',
            hint: id === slot.exerciseId ? 'Standard' : 'Alternative',
          }))}
          onChange={(v) => choose(Number(v))}
        />
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
        <p className="small muted">Auch erfasst: {otherExercises.map((id) => exercises.get(id)?.name).join(', ')}</p>
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

        {Array.from({ length: rowCount }, (_, i) => i + 1).map((n) => {
          const hasDrop = mine.some((s) => s.setNumber === n && s.drop) || openDrops.includes(n);
          return (
            <div key={`${exerciseId}-${n}`}>
              {sides.map((side) => (
                <div key={side}>
                  <SetRow
                    label={`${n}${side !== 'both' ? ` ${SIDE_LABEL[side]}` : ''}`}
                    ariaLabel={`Satz ${n} ${SIDE_LABEL[side]}`}
                    type={ex.type}
                    saved={savedSet(n, side, false)}
                    prefill={prefillFor(n, side, false)}
                    onSave={(v) => save(n, side, false, v)}
                  />
                  <div className="last">{lastText(n, side)}</div>
                </div>
              ))}

              {hasDrop &&
                sides.map((side) => (
                  <div key={`drop-${side}`}>
                    <SetRow
                      label={`↓${side !== 'both' ? ` ${SIDE_LABEL[side]}` : ''}`}
                      ariaLabel={`Dropsatz zu Satz ${n} ${SIDE_LABEL[side]}`}
                      type={ex.type}
                      saved={savedSet(n, side, true)}
                      prefill={{ weight: null, value: null }}
                      onSave={(v) => save(n, side, true, v)}
                    />
                    <div className="last">Zusatz mit reduziertem Gewicht</div>
                  </div>
                ))}

              {showDetails && (
                <div className="set-extra">
                  {!hasDrop && (
                    <button className="toggle-btn" onClick={() => setOpenDrops([...openDrops, n])}>
                      + Dropsatz
                    </button>
                  )}
                  <button className="toggle-btn" onClick={() => resetSet(n)}>
                    Satz {n} zurücksetzen
                  </button>
                  <button className="toggle-btn" disabled={rowCount === 1} onClick={() => deleteSet(n)}>
                    Satz {n} löschen
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showDetails && (
        <p className="small muted">
          Dropsatz: nach dem normalen Satz das Gewicht reduzieren und noch so viele Wiederholungen wie möglich
          anhängen — die Zeile mit ↓ ist dieser Zusatz. Zurücksetzen leert die Felder eines Satzes.
        </p>
      )}

      <div className="slot-actions">
        <button className="btn secondary grow" onClick={addSet}>
          + Satz
        </button>
        <button className="btn secondary" onClick={() => setShowDetails(!showDetails)}>
          {showDetails ? 'Fertig' : 'Übung bearbeiten'}
        </button>
      </div>
      {showDetails && (
        <button className="btn danger block section-sm" onClick={onSkip}>
          Übung heute streichen
        </button>
      )}
    </section>
  );
}
