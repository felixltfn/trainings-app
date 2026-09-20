import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';

import { Picker } from '../Picker';
import { db, type Slot } from '../db';
import { ExerciseEditor } from './ExerciseEditor';

interface Props {
  slotId: number;
  onClose: () => void;
}

const GROUPS = ['1', '2', '3', '4'];

export function SlotEditor({ slotId, onClose }: Props) {
  const stored = useLiveQuery(() => db.slots.get(slotId), [slotId]);
  const exercises = useLiveQuery(async () => (await db.exercises.toArray()).sort((a, b) => a.name.localeCompare(b.name)), []);
  const [draft, setDraft] = useState<Slot | null>(null);
  const [newExercise, setNewExercise] = useState<false | 'default' | 'alternative'>(false);

  if (!stored || !exercises) return <div className="sheet" />;
  const value = draft ?? stored;
  const patch = (p: Partial<Slot>) => setDraft({ ...value, ...p });
  const nameOf = (id: number) => exercises.find((e) => e.id === id)?.name ?? '?';

  const save = async () => {
    const { id: _id, ...fields } = value;
    await db.slots.update(slotId, fields);
    onClose();
  };

  const discard = () => {
    if (draft && !confirm('Änderungen an dieser Übung verwerfen?')) return;
    setDraft(null);
    onClose();
  };

  const remove = async () => {
    if (!confirm('Diese Übung aus dem Plan löschen? Bereits eingetragene Sätze bleiben erhalten.')) return;
    await db.slots.delete(slotId);
    onClose();
  };

  if (newExercise) {
    return (
      <ExerciseEditor
        exerciseId="new"
        onClose={(id) => {
          if (id !== undefined) {
            if (newExercise === 'default') patch({ exerciseId: id });
            else patch({ alternativeIds: [...value.alternativeIds, id] });
          }
          setNewExercise(false);
        }}
      />
    );
  }

  const inSlot = [value.exerciseId, ...value.alternativeIds];

  return (
    <div className="sheet">
      <div className="screen">
        <button className="back" onClick={discard}>
          ‹ Zurück
        </button>
        <h1 className="title">Übung im Plan</h1>

        <label className="field">
          <span>Bezeichnung (z. B. „Brust schräg“)</span>
          <input className="input" value={value.name} onChange={(e) => patch({ name: e.target.value })} />
        </label>

        <div className="field">
          <span>Standardübung</span>
          <Picker
            title="Standardübung"
            value={value.exerciseId}
            options={exercises.map((e) => ({ value: e.id, label: e.name, hint: e.primaryMuscle }))}
            onChange={(v) => patch({ exerciseId: Number(v) })}
          />
        </div>
        <button className="btn ghost" onClick={() => setNewExercise('default')}>
          + Neue Übung anlegen und als Standard setzen
        </button>

        <div className="field">
          <span>Alternativen</span>
          <div className="chips">
            {value.alternativeIds.map((id) => (
              <button
                key={id}
                className="chip on"
                onClick={() => patch({ alternativeIds: value.alternativeIds.filter((x) => x !== id) })}
              >
                {nameOf(id)} ✕
              </button>
            ))}
          </div>
          <div className="section-sm">
            <Picker
              title="Alternative hinzufügen"
              value=""
              placeholder="Alternative hinzufügen …"
              options={exercises
                .filter((e) => !inSlot.includes(e.id))
                .map((e) => ({ value: e.id, label: e.name, hint: e.primaryMuscle }))}
              onChange={(v) => patch({ alternativeIds: [...value.alternativeIds, Number(v)] })}
            />
          </div>
          <button className="btn ghost" onClick={() => setNewExercise('alternative')}>
            + Neue Übung anlegen und als Alternative hinzufügen
          </button>
        </div>

        <div className="pair">
          <label className="field">
            <span>Sätze</span>
            <input
              className="input num"
              inputMode="numeric"
              value={value.sets}
              onChange={(e) => patch({ sets: Number(e.target.value) || 0 })}
            />
          </label>
          <div className="field">
            <span>Supersatz-Gruppe</span>
            <Picker
              title="Supersatz-Gruppe"
              value={value.supersetGroup ?? ''}
              options={[{ value: '', label: 'keine' }, ...GROUPS.map((g) => ({ value: g, label: `Gruppe ${g}` }))]}
              onChange={(v) => patch({ supersetGroup: String(v) || null })}
            />
          </div>
        </div>

        <div className="pair">
          <label className="field">
            <span>Pause min (Sek.)</span>
            <input
              className="input num"
              inputMode="numeric"
              value={value.restMin}
              onChange={(e) => patch({ restMin: Number(e.target.value) || 0 })}
            />
          </label>
          <label className="field">
            <span>Pause max (Sek.)</span>
            <input
              className="input num"
              inputMode="numeric"
              value={value.restMax}
              onChange={(e) => patch({ restMax: Number(e.target.value) || 0 })}
            />
          </label>
        </div>

        <p className="small muted section-sm">
          Übungen mit derselben Supersatz-Gruppe machst du direkt hintereinander.
        </p>

        <div className="section stack">
          <button className="btn block" onClick={save}>
            Speichern
          </button>
          <button className="btn secondary block" onClick={discard}>
            Verwerfen
          </button>
          <button className="btn danger block" onClick={remove}>
            Aus dem Plan löschen
          </button>
        </div>
      </div>
    </div>
  );
}
