import { useEffect, useState } from 'react';

import type { ExerciseType, Side, WorkoutSet } from '../db';
import { SIDE_LABEL, fmtNum, parseNum, splitTime } from '../logic';

export interface SideValues {
  side: Side;
  weight: number;
  value: number; // reps, or seconds for type 'time'
}

export interface Prefill {
  weight: number | null;
  value: number | null;
}

// One side of a set: 'both' for normal exercises, 'right' and 'left' for unilateral ones
export interface SetLine {
  side: Side;
  saved: WorkoutSet | undefined;
  prefill: Prefill;
}

interface Props {
  label: string; // "2", or "↓" for the drop set row
  ariaLabel: string;
  type: ExerciseType;
  lines: SetLine[];
  onSave: (values: SideValues[]) => void;
}

interface Fields {
  weight: string;
  value: string;
  min: string;
  sec: string;
  touched: boolean;
}

type FieldName = 'weight' | 'value' | 'min' | 'sec';

const str = (n: number | null | undefined) => (n === null || n === undefined ? '' : fmtNum(n));

// Time exercises are entered as minutes + seconds, everything else as one number.
const asFields = (seconds: number | null) => {
  if (seconds === null) return { value: '', min: '', sec: '' };
  const { min, sec } = splitTime(seconds);
  return { value: String(seconds), min: String(min), sec: String(sec) };
};

const fromPrefill = (p: Prefill): Fields => ({ weight: str(p.weight), ...asFields(p.value), touched: false });

const fromSaved = (s: WorkoutSet, isTime: boolean): Fields => ({
  weight: str(s.weight),
  ...asFields(isTime ? s.duration : s.reps),
  touched: false,
});

// All sides of one set with a single ✓ – both sides are saved in one step.
export function SetRow({ label, ariaLabel, type, lines, onSave }: Props) {
  const isTime = type === 'time';
  const [fields, setFields] = useState<Fields[]>(() =>
    lines.map((l) => (l.saved ? fromSaved(l.saved, isTime) : fromPrefill(l.prefill))),
  );

  // The prefill arrives late (previous session) and becomes empty after a reset:
  // follow it as long as nothing is saved and the user hasn't typed.
  const prefillKey = JSON.stringify(lines.map((l) => [l.prefill.weight, l.prefill.value]));
  useEffect(() => {
    setFields((prev) => lines.map((l, i) => (!l.saved && !prev[i]?.touched ? fromPrefill(l.prefill) : prev[i])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillKey]);

  // Follow the stored values (compared by content, not object identity)
  const savedKey = JSON.stringify(lines.map((l) => (l.saved ? [l.saved.id, l.saved.weight, l.saved.reps, l.saved.duration] : null)));
  useEffect(() => {
    setFields(lines.map((l) => (l.saved ? fromSaved(l.saved, isTime) : fromPrefill(l.prefill))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey, isTime]);

  const parsed = fields.map((f) => ({
    weight: parseNum(f.weight) ?? 0,
    value: isTime ? (parseNum(f.min) ?? 0) * 60 + (parseNum(f.sec) ?? 0) : parseNum(f.value),
  }));

  const savedValue = (s: WorkoutSet) => (isTime ? s.duration : s.reps);
  const allSaved = lines.every((l) => l.saved);
  const dirty = lines.some((l, i) => l.saved && (parsed[i].weight !== l.saved.weight || parsed[i].value !== savedValue(l.saved)));

  const submit = () => {
    const values: SideValues[] = [];
    for (const [i, l] of lines.entries()) {
      const { weight, value } = parsed[i];
      if (value === null || value <= 0) return;
      values.push({ side: l.side, weight, value });
    }
    onSave(values);
  };

  // Typing on the first side (right) fills the other side too, until that one is edited itself
  const edit = (line: number, name: FieldName) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setFields((prev) =>
      prev.map((f, i) => {
        if (i === line) return { ...f, [name]: text, touched: true };
        if (line === 0 && !f.touched && !lines[i].saved) return { ...f, [name]: text };
        return f;
      }),
    );
  };

  const input = (line: number, name: FieldName, placeholder: string, aria: string, last: boolean) => (
    <input
      key={`${name}-${lines[line].side}`}
      className="num-input"
      inputMode={name === 'weight' ? 'decimal' : 'numeric'}
      pattern={name === 'weight' ? undefined : '[0-9]*'}
      enterKeyHint={last ? 'done' : 'next'}
      placeholder={placeholder}
      aria-label={aria}
      value={fields[line]?.[name] ?? ''}
      onChange={edit(line, name)}
      onFocus={(e) => e.target.select()}
      onKeyDown={last ? (e) => e.key === 'Enter' && submit() : undefined}
    />
  );

  const state = allSaved ? (dirty ? 'dirty' : 'saved') : '';
  const multi = lines.length > 1;

  return (
    <div className={`set-row${isTime ? ' time' : ''}${multi ? ' multi' : ''}`}>
      {lines.map((l, i) => {
        const aria = `${ariaLabel}${l.side !== 'both' ? ` ${SIDE_LABEL[l.side]}` : ''}`;
        const lastLine = i === lines.length - 1;
        return [
          <div key={`no-${l.side}`} className="set-no">
            {i === 0 ? label : ''}
            {l.side !== 'both' && <small>{SIDE_LABEL[l.side]}</small>}
          </div>,
          input(i, 'weight', 'kg', `${aria} Gewicht`, false),
          ...(isTime
            ? [
                input(i, 'min', 'Min', `${aria} Minuten`, false),
                input(i, 'sec', 'Sek', `${aria} Sekunden`, lastLine),
              ]
            : [
                input(i, 'value', 'Wdh', `${aria} Wiederholungen`, lastLine),
              ]),
          i === 0 ? (
            <button
              key="done"
              className={`done-btn ${state}`}
              aria-label={allSaved ? `${ariaLabel} aktualisieren` : `${ariaLabel} speichern`}
              onClick={submit}
            >
              ✓
            </button>
          ) : null,
        ];
      })}
    </div>
  );
}
