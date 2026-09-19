import { useEffect, useState } from 'react';

import type { ExerciseType, Side, WorkoutSet } from '../db';
import { SIDE_LABEL, fmtNum, parseNum } from '../logic';

export interface SetValues {
  weight: number;
  value: number; // reps or seconds
  rir: number | null;
  drop: boolean;
}

export interface Prefill {
  weight: number | null;
  value: number | null;
}

interface Props {
  setNumber: number;
  side: Side;
  type: ExerciseType;
  saved: WorkoutSet | undefined;
  prefill: Prefill;
  showDetails: boolean;
  onSave: (v: SetValues) => void;
  onDelete: () => void;
}

const str = (n: number | null | undefined) => (n === null || n === undefined ? '' : fmtNum(n));

export function SetRow({ setNumber, side, type, saved, prefill, showDetails, onSave, onDelete }: Props) {
  const savedValue = saved ? (type === 'time' ? saved.duration : saved.reps) : null;
  const [weight, setWeight] = useState(saved ? str(saved.weight) : str(prefill.weight));
  const [value, setValue] = useState(saved ? str(savedValue) : str(prefill.value));
  const [rir, setRir] = useState(str(saved?.rir));
  const [drop, setDrop] = useState(saved?.drop ?? false);
  const [touched, setTouched] = useState(false);

  // The previous session loads asynchronously: fill it in as long as the user hasn't typed yet.
  useEffect(() => {
    if (saved || touched) return;
    setWeight(str(prefill.weight));
    setValue(str(prefill.value));
  }, [prefill.weight, prefill.value, saved, touched]);

  // Reset local state when the stored values change (compared by content, not object identity)
  const savedKey = saved ? JSON.stringify([saved.id, saved.weight, saved.reps, saved.duration, saved.rir, saved.drop]) : '';
  useEffect(() => {
    if (!saved) return;
    setWeight(str(saved.weight));
    setValue(str(type === 'time' ? saved.duration : saved.reps));
    setRir(str(saved.rir));
    setDrop(saved.drop);
    setTouched(false);
  }, [savedKey]);

  const parsedWeight = parseNum(weight) ?? 0;
  const parsedValue = parseNum(value);
  const parsedRir = parseNum(rir);
  const dirty =
    !!saved &&
    (parsedWeight !== saved.weight || parsedValue !== savedValue || parsedRir !== saved.rir || drop !== saved.drop);

  const submit = () => {
    if (parsedValue === null || parsedValue <= 0) return;
    onSave({ weight: parsedWeight, value: parsedValue, rir: parsedRir, drop });
  };

  const edit = (setter: (s: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setTouched(true);
    setter(e.target.value);
  };

  const state = saved ? (dirty ? 'dirty' : 'saved') : '';

  return (
    <>
      <div className="set-row">
        <div className="set-no">
          {setNumber}
          {side !== 'both' && <small>{SIDE_LABEL[side]}</small>}
        </div>
        <input
          className="num-input"
          inputMode="decimal"
          enterKeyHint="next"
          placeholder="kg"
          aria-label={`Satz ${setNumber} ${SIDE_LABEL[side]} Gewicht`}
          value={weight}
          onChange={edit(setWeight)}
          onFocus={(e) => e.target.select()}
        />
        <input
          className="num-input"
          inputMode="numeric"
          pattern="[0-9]*"
          enterKeyHint="done"
          placeholder={type === 'time' ? 's' : 'Wdh'}
          aria-label={`Satz ${setNumber} ${SIDE_LABEL[side]} ${type === 'time' ? 'Sekunden' : 'Wiederholungen'}`}
          value={value}
          onChange={edit(setValue)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <button className={`done-btn ${state}`} aria-label={saved ? 'Satz aktualisieren' : 'Satz speichern'} onClick={submit}>
          ✓
        </button>
      </div>
      {showDetails && (
        <div className="set-row set-extra">
          <span />
          <input
            className="num-input small-font"
            inputMode="decimal"
            placeholder="RIR"
            aria-label="RIR"
            value={rir}
            onChange={edit(setRir)}
          />
          <button
            className={`toggle-btn${drop ? ' on' : ''}`}
            aria-pressed={drop}
            onClick={() => {
              setTouched(true);
              setDrop(!drop);
            }}
          >
            Dropsatz
          </button>
          <button className="toggle-btn" aria-label="Satz löschen" disabled={!saved} onClick={onDelete}>
            ✕
          </button>
        </div>
      )}
    </>
  );
}
