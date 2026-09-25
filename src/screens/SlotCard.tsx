import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';

import { exerciseHistory } from '../data';
import { db, type Exercise, type Side, type Slot, type Workout, type WorkoutSet } from '../db';
import {
  EXERCISE_CHANGE_REST,
  SIDE_LABEL,
  fmtNum,
  fmtRest,
  fmtSet,
  sidesOf,
  slotComplete,
  slotRowCount,
  slotTargets,
} from '../logic';
import { Picker } from '../Picker';
import { isChest, isCompound, weeklyGoal, type ProgressionSettings } from '../progression';
import { SetRow, type Prefill, type SetLine, type SideValues } from './SetRow';

interface Props {
  slot: Slot;
  workout: Workout;
  exercises: Map<number, Exercise>;
  sets: WorkoutSet[]; // all sets of this workout
  partner: string | null; // superset partner label
  partnerSlots: Slot[]; // the other slots of this superset (empty if none)
  settings: ProgressionSettings;
  deload: boolean; // this workout lies in a deload week
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (dir: -1 | 1) => void;
  onRest: (min: number, max: number) => void; // seconds
  onSkip: () => void;
}

export function SlotCard({
  slot,
  workout,
  exercises,
  sets,
  partner,
  partnerSlots,
  settings,
  deload,
  canMoveUp,
  canMoveDown,
  onMove,
  onRest,
  onSkip,
}: Props) {
  const [showDetails, setShowDetails] = useState(false);
  // Set numbers with a drop set row that isn't saved yet
  const [openDrops, setOpenDrops] = useState<number[]>([]);
  // Rows that were reset stay empty instead of showing last time's values
  const [cleared, setCleared] = useState<string[]>([]);

  const exerciseId = workout.choices[slot.id] ?? slot.exerciseId;
  const ex = exercises.get(exerciseId);
  const history = useLiveQuery(
    async () => (ex ? exerciseHistory(ex, workout, settings) : null),
    [ex, workout.id, workout.start, settings],
  );

  if (!ex) return null;

  const targets = slotTargets(slot, exerciseId);
  const sides = sidesOf(ex);
  const mine = sets.filter((s) => s.slotId === slot.id && s.exerciseId === exerciseId);
  const key = `${slot.id}:${exerciseId}`;
  const rowCount = slotRowCount(slot, workout, exerciseId, mine);
  // Sets done with another exercise of this slot (after switching) stay visible as a hint
  const otherExercises = [...new Set(sets.filter((s) => s.slotId === slot.id && s.exerciseId !== exerciseId).map((s) => s.exerciseId))];

  // The goal is only a suggestion per set: it prefills the weight, nothing else depends on it
  const goal = history
    ? weeklyGoal({
        ex,
        targets,
        compound: isCompound(slot, ex, targets),
        chest: isChest(ex),
        history: history.sessions,
        deload,
        today: workout.date,
        bodyweight: history.bodyweight,
        settings,
      })
    : null;

  const prevSets = history?.sessions[0]?.sets ?? [];
  const prevBySide = (side: Side) => prevSets.filter((s) => s.side === side && !s.drop);

  const savedSet = (n: number, side: Side, drop: boolean) =>
    mine.find((s) => s.setNumber === n && s.side === side && s.drop === drop);

  const clearKey = (n: number, side: Side, drop: boolean) => `${n}:${side}:${drop}`;

  const prefillFor = (n: number, side: Side, drop: boolean): Prefill => {
    if (drop || cleared.includes(clearKey(n, side, drop))) return { weight: null, value: null };
    const target = goal?.sets[n - 1];
    if (target?.weight != null) return { weight: target.weight, value: null };
    const list = prevBySide(side);
    const p = list.find((s) => s.setNumber === n) ?? list[list.length - 1];
    if (!p) return { weight: ex.bodyweight ? 0 : null, value: null };
    // Only the weight is carried over – reps are entered fresh every time
    return { weight: p.weight, value: null };
  };

  const linesFor = (n: number, drop: boolean): SetLine[] =>
    sides.map((side) => ({ side, saved: savedSet(n, side, drop), prefill: prefillFor(n, side, drop) }));

  const lastText = (n: number): string => {
    const parts = sides.flatMap((side) => {
      const p = prevBySide(side).find((s) => s.setNumber === n);
      if (!p) return [];
      const value = (ex.type === 'time' ? p.duration : p.reps) ?? 0;
      return [`${side !== 'both' ? `${SIDE_LABEL[side]} ` : ''}${fmtSet(p.weight, value, ex)}`];
    });
    return parts.length ? `zuletzt ${parts.join(' · ')}` : '';
  };

  // Today's suggestion for set n, shown next to "zuletzt"
  const goalText = (n: number): string => {
    const g = goal?.sets[n - 1];
    if (!g) return '';
    if (g.weight === null) return `Ziel ${g.range ?? ''}`;
    if (g.value !== null) return `Ziel ${fmtSet(g.weight, g.value, ex)}`;
    const w = ex.bodyweight && g.weight === 0 ? 'KG' : `${fmtNum(g.weight)} kg`;
    return `Ziel ${w}, ${g.range ?? ''}`;
  };

  // All sides of a set are saved in one step; the rest timer starts when something new was added
  const save = async (n: number, drop: boolean, values: SideValues[]) => {
    const timestamp = Date.now();
    const added: WorkoutSet[] = [];
    await db.transaction('rw', db.sets, async () => {
      for (const v of values) {
        const existing = savedSet(n, v.side, drop);
        const fields = {
          weight: v.weight,
          reps: ex.type === 'time' ? null : v.value,
          duration: ex.type === 'time' ? v.value : null,
        };
        if (existing) {
          await db.sets.update(existing.id, fields);
          continue;
        }
        const record: Omit<WorkoutSet, 'id'> = {
          workoutId: workout.id,
          exerciseId,
          slotId: slot.id,
          setNumber: n,
          side: v.side,
          drop,
          rir: null,
          timestamp,
          ...fields,
        };
        added.push({ ...record, id: await db.sets.add(record) });
      }
    });
    setCleared(cleared.filter((c) => !values.some((v) => c === clearKey(n, v.side, drop))));
    if (added.length === 0 || slot.restMin <= 0) return;
    // Last set of the exercise (and of its superset partners): fixed change-over pause
    const after = [...sets, ...added];
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
        {ex.unilateral && <span>einseitig, rechts zuerst</span>}
        {ex.bodyweight && <span>KG + Zusatzgewicht</span>}
      </div>
      {ex.note && <p className="small muted">{ex.note}</p>}

      {goal?.note && <div className="goal">{goal.note}</div>}
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
              <SetRow
                label={`${n}`}
                ariaLabel={`Satz ${n}`}
                type={ex.type}
                lines={linesFor(n, false)}
                onSave={(v) => save(n, false, v)}
              />
              <div className="last">
                {lastText(n) && <span>{lastText(n)}</span>}
                {goalText(n) && <b className="goal-set">{goalText(n)}</b>}
              </div>

              {hasDrop && (
                <>
                  <SetRow
                    label="↓"
                    ariaLabel={`Dropsatz zu Satz ${n}`}
                    type={ex.type}
                    lines={linesFor(n, true)}
                    onSave={(v) => save(n, true, v)}
                  />
                  <div className="last">Zusatz mit reduziertem Gewicht</div>
                </>
              )}

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
