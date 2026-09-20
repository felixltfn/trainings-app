import { useEffect, useState } from 'react';

import type { ExerciseType, WorkoutSet } from '../db';
import { fmtNum, parseNum, splitTime } from '../logic';

export interface SetValues {
  weight: number;
  value: number; // reps, or seconds for type 'time'
}

export interface Prefill {
  weight: number | null;
  value: number | null;
}

interface Props {
  label: string; // "2", "2 L", or "↓" for the drop set row
  ariaLabel: string;
  type: ExerciseType;
  saved: WorkoutSet | undefined;
  prefill: Prefill;
  onSave: (v: SetValues) => void;
}

const str = (n: number | null | undefined) => (n === null || n === undefined ? '' : fmtNum(n));

// Time exercises are entered as minutes + seconds, everything else as one number.
const asFields = (seconds: number | null) => {
  if (seconds === null) return { value: '', min: '', sec: '' };
  const { min, sec } = splitTime(seconds);
  return { value: String(seconds), min: String(min), sec: String(sec) };
};

export function SetRow({ label, ariaLabel, type, saved, prefill, onSave }: Props) {
  const isTime = type === 'time';
  const savedValue = saved ? (isTime ? saved.duration : saved.reps) : null;
  const initial = asFields(saved ? savedValue : prefill.value);

  const [weight, setWeight] = useState(saved ? str(saved.weight) : str(prefill.weight));
  const [value, setValue] = useState(initial.value);
  const [min, setMin] = useState(initial.min);
  const [sec, setSec] = useState(initial.sec);
  const [touched, setTouched] = useState(false);

  // The prefill arrives late (previous session) and becomes empty after a reset:
  // follow it as long as nothing is saved and the user hasn't typed.
  useEffect(() => {
    if (saved || touched) return;
    const f = asFields(prefill.value);
    setWeight(str(prefill.weight));
    setValue(f.value);
    setMin(f.min);
    setSec(f.sec);
  }, [prefill.weight, prefill.value, saved, touched]);

  // Follow the stored values (compared by content, not object identity)
  const savedKey = saved ? JSON.stringify([saved.id, saved.weight, saved.reps, saved.duration]) : '';
  useEffect(() => {
    setTouched(false);
    if (!saved) return;
    const f = asFields(isTime ? saved.duration : saved.reps);
    setWeight(str(saved.weight));
    setValue(f.value);
    setMin(f.min);
    setSec(f.sec);
  }, [savedKey, saved, isTime]);

  const parsedWeight = parseNum(weight) ?? 0;
  const parsedValue = isTime ? (parseNum(min) ?? 0) * 60 + (parseNum(sec) ?? 0) : parseNum(value);
  const dirty = !!saved && (parsedWeight !== saved.weight || parsedValue !== savedValue);

  const submit = () => {
    if (parsedValue === null || parsedValue <= 0) return;
    onSave({ weight: parsedWeight, value: parsedValue });
  };

  const edit = (setter: (s: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setTouched(true);
    setter(e.target.value);
  };

  const state = saved ? (dirty ? 'dirty' : 'saved') : '';

  return (
    <div className={`set-row${isTime ? ' time' : ''}`}>
      <div className="set-no">{label}</div>
      <input
        className="num-input"
        inputMode="decimal"
        enterKeyHint="next"
        placeholder="kg"
        aria-label={`${ariaLabel} Gewicht`}
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
            aria-label={`${ariaLabel} Minuten`}
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
            aria-label={`${ariaLabel} Sekunden`}
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
          aria-label={`${ariaLabel} Wiederholungen`}
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
  );
}
