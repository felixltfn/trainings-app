import { useEffect, useState } from 'react';

import type { ExerciseType, Side, WorkoutSet } from '../db';
import { SIDE_LABEL, fmtNum, parseNum, splitTime } from '../logic';

export interface SetValues {
  weight: number;
  value: number; // reps, or seconds for type 'time'
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

// Time exercises are entered as minutes + seconds, everything else as one number.
const asFields = (seconds: number | null) => {
  if (seconds === null) return { value: '', min: '', sec: '' };
  const { min, sec } = splitTime(seconds);
  return { value: String(seconds), min: String(min), sec: String(sec) };
};

export function SetRow({ setNumber, side, type, saved, prefill, showDetails, onSave, onDelete }: Props) {
  const isTime = type === 'time';
  const savedValue = saved ? (isTime ? saved.duration : saved.reps) : null;
  const initial = asFields(saved ? savedValue : prefill.value);

  const [weight, setWeight] = useState(saved ? str(saved.weight) : str(prefill.weight));
  const [value, setValue] = useState(initial.value);
  const [min, setMin] = useState(initial.min);
  const [sec, setSec] = useState(initial.sec);
  const [rir, setRir] = useState(str(saved?.rir));
  const [drop, setDrop] = useState(saved?.drop ?? false);
  const [touched, setTouched] = useState(false);

  // The previous session loads asynchronously: fill it in as long as the user hasn't typed yet.
  useEffect(() => {
    if (saved || touched) return;
    const f = asFields(prefill.value);
    setWeight(str(prefill.weight));
    setValue(f.value);
    setMin(f.min);
    setSec(f.sec);
  }, [prefill.weight, prefill.value, saved, touched]);

  // Reset local state when the stored values change (compared by content, not object identity)
  const savedKey = saved ? JSON.stringify([saved.id, saved.weight, saved.reps, saved.duration, saved.rir, saved.drop]) : '';
  useEffect(() => {
    if (!saved) return;
    const f = asFields(isTime ? saved.duration : saved.reps);
    setWeight(str(saved.weight));
    setValue(f.value);
    setMin(f.min);
    setSec(f.sec);
    setRir(str(saved.rir));
    setDrop(saved.drop);
    setTouched(false);
  }, [savedKey, saved, isTime]);

  const parsedWeight = parseNum(weight) ?? 0;
  const parsedValue = isTime ? (parseNum(min) ?? 0) * 60 + (parseNum(sec) ?? 0) : parseNum(value);
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
  const label = `Satz ${setNumber} ${SIDE_LABEL[side]}`;

  return (
    <>
      <div className={`set-row${isTime ? ' time' : ''}`}>
        <div className="set-no">
          {setNumber}
          {side !== 'both' && <small>{SIDE_LABEL[side]}</small>}
        </div>
        <input
          className="num-input"
          inputMode="decimal"
          enterKeyHint="next"
          placeholder="kg"
          aria-label={`${label} Gewicht`}
          value={weight}
          onChange={edit(setWeight)}
          onFocus={(e) => e.target.select()}
        />
        {isTime ? (
          <>
            <input
              className="num-input"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="Min"
              aria-label={`${label} Minuten`}
              value={min}
              onChange={edit(setMin)}
              onFocus={(e) => e.target.select()}
            />
            <input
              className="num-input"
              inputMode="numeric"
              pattern="[0-9]*"
              enterKeyHint="done"
              placeholder="Sek"
              aria-label={`${label} Sekunden`}
              value={sec}
              onChange={edit(setSec)}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </>
        ) : (
          <input
            className="num-input"
            inputMode="numeric"
            pattern="[0-9]*"
            enterKeyHint="done"
            placeholder="Wdh"
            aria-label={`${label} Wiederholungen`}
            value={value}
            onChange={edit(setValue)}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        )}
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
