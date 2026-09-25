import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';

import { db, type Exercise } from '../db';
import { fmtNum, parseNum } from '../logic';
import { Picker } from '../Picker';
import { MUSCLES } from '../seed';

interface Props {
  exerciseId: number | 'new';
  onClose: (savedId?: number) => void;
}

const EMPTY: Omit<Exercise, 'id'> = {
  name: '',
  primaryMuscle: MUSCLES[0],
  secondaryMuscles: [],
  unilateral: false,
  bodyweight: false,
  type: 'reps',
  note: '',
};

export function ExerciseEditor({ exerciseId, onClose }: Props) {
  const stored = useLiveQuery(
    async () => (exerciseId === 'new' ? null : ((await db.exercises.get(exerciseId)) ?? null)),
    [exerciseId],
  );
  const [draft, setDraft] = useState<Omit<Exercise, 'id'> | null>(null);
  const [stepText, setStepText] = useState<string | null>(null); // raw text while typing "2,"
  const usedCount = useLiveQuery(
    async () => (exerciseId === 'new' ? 0 : db.sets.where('exerciseId').equals(exerciseId).count()),
    [exerciseId],
  );

  if (stored === undefined) return <div className="sheet" />;
  const value = draft ?? stored ?? EMPTY;
  const patch = (p: Partial<Exercise>) => setDraft({ ...value, ...p });

  const save = async () => {
    if (!value.name.trim()) return;
    if (exerciseId === 'new') {
      const id = await db.exercises.add(value);
      onClose(id);
    } else {
      await db.exercises.update(exerciseId, value);
      onClose(exerciseId);
    }
  };

  const remove = async () => {
    if (exerciseId === 'new') return;
    if (usedCount) {
      alert(`Diese Übung hat ${usedCount} gespeicherte Sätze und kann nicht gelöscht werden.`);
      return;
    }
    if (!confirm(`„${value.name}“ löschen?`)) return;
    await db.exercises.delete(exerciseId);
    onClose();
  };

  const toggleSecondary = (m: string) =>
    patch({
      secondaryMuscles: value.secondaryMuscles.includes(m)
        ? value.secondaryMuscles.filter((x) => x !== m)
        : [...value.secondaryMuscles, m],
    });

  return (
    <div className="sheet">
      <div className="screen">
        <button className="back" onClick={() => onClose()}>
          ‹ Zurück
        </button>
        <h1 className="title">{exerciseId === 'new' ? 'Neue Übung' : 'Übung'}</h1>

        <label className="field">
          <span>Name</span>
          <input className="input" value={value.name} onChange={(e) => patch({ name: e.target.value })} />
        </label>

        <div className="field">
          <span>Hauptmuskel</span>
          <Picker
            title="Hauptmuskel"
            value={value.primaryMuscle}
            options={MUSCLES.map((m) => ({ value: m, label: m }))}
            onChange={(v) => patch({ primaryMuscle: String(v) })}
          />
        </div>

        <div className="field">
          <span>Nebenmuskeln (zählen als halbe Sätze)</span>
          <div className="chips">
            {MUSCLES.filter((m) => m !== value.primaryMuscle).map((m) => (
              <button
                key={m}
                className={`chip${value.secondaryMuscles.includes(m) ? ' on' : ''}`}
                onClick={() => toggleSecondary(m)}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <label className="check section-sm">
          <input type="checkbox" checked={value.unilateral} onChange={(e) => patch({ unilateral: e.target.checked })} />
          Einseitig (rechts und links, ein Häkchen pro Satz)
        </label>
        <label className="check">
          <input type="checkbox" checked={value.bodyweight} onChange={(e) => patch({ bodyweight: e.target.checked })} />
          Körpergewichtsübung (Gewicht = Zusatzgewicht)
        </label>

        <div className="field">
          <span>Typ</span>
          <div className="segmented">
            <button className={value.type === 'reps' ? 'on' : ''} onClick={() => patch({ type: 'reps' })}>
              Wiederholungen
            </button>
            <button className={value.type === 'time' ? 'on' : ''} onClick={() => patch({ type: 'time' })}>
              Zeit (Sekunden)
            </button>
          </div>
        </div>

        <label className="field">
          <span>Kleinste Gewichtsstufe an diesem Gerät (kg, leer = Standard aus „Wochenziel“)</span>
          <input
            className="input num"
            inputMode="decimal"
            value={stepText ?? (value.weightStep ? fmtNum(value.weightStep) : '')}
            onChange={(e) => {
              setStepText(e.target.value);
              const n = parseNum(e.target.value);
              patch({ weightStep: n !== null && n > 0 ? n : undefined });
            }}
          />
        </label>

        <label className="field">
          <span>Ausführungshinweis</span>
          <textarea className="input" value={value.note} onChange={(e) => patch({ note: e.target.value })} />
        </label>

        <div className="section stack">
          <button className="btn block" disabled={!value.name.trim()} onClick={save}>
            Speichern
          </button>
          {exerciseId !== 'new' && (
            <button className="btn danger block" onClick={remove}>
              Übung löschen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
