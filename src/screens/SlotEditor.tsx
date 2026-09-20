import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';

import { db, type Slot, type SlotOverride } from '../db';
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

  const remove = async () => {
    if (!confirm('Diesen Slot löschen? Bereits eingetragene Sätze bleiben erhalten.')) return;
    await db.slots.delete(slotId);
    onClose();
  };

  const setOverride = (exerciseId: number, field: keyof SlotOverride, raw: string) => {
    const overrides = { ...value.overrides };
    const entry: SlotOverride = { ...overrides[exerciseId] };
    if (raw.trim() === '') delete entry[field];
    else if (field === 'rir') entry.rir = raw;
    else entry[field] = Number(raw);
    if (Object.keys(entry).length === 0) delete overrides[exerciseId];
    else overrides[exerciseId] = entry;
    patch({ overrides });
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
        <button className="back" onClick={onClose}>
          ‹ Zurück
        </button>
        <h1 className="title">Slot</h1>

        <label className="field">
          <span>Slot-Name (z. B. „Brust schräg“)</span>
          <input className="input" value={value.name} onChange={(e) => patch({ name: e.target.value })} />
        </label>

        <label className="field">
          <span>Standardübung</span>
          <select className="select" value={value.exerciseId} onChange={(e) => patch({ exerciseId: Number(e.target.value) })}>
            {exercises.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
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
          <select
            className="select section-sm"
            value=""
            onChange={(e) => {
              const id = Number(e.target.value);
              if (id) patch({ alternativeIds: [...value.alternativeIds, id] });
            }}
          >
            <option value="">Alternative hinzufügen …</option>
            {exercises
              .filter((e) => !inSlot.includes(e.id))
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
          </select>
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
          <label className="field">
            <span>RIR (nur Plannotiz)</span>
            <input className="input" value={value.rir} onChange={(e) => patch({ rir: e.target.value })} />
          </label>
        </div>

        <div className="pair">
          <label className="field">
            <span>Wdh/Sek. von</span>
            <input
              className="input num"
              inputMode="numeric"
              value={value.repMin}
              onChange={(e) => patch({ repMin: Number(e.target.value) || 0 })}
            />
          </label>
          <label className="field">
            <span>bis</span>
            <input
              className="input num"
              inputMode="numeric"
              value={value.repMax}
              onChange={(e) => patch({ repMax: Number(e.target.value) || 0 })}
            />
          </label>
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

        <label className="check section-sm">
          <input type="checkbox" checked={value.orderFixed} onChange={(e) => patch({ orderFixed: e.target.checked })} />
          Reihenfolge fest (lässt sich im Training nicht verschieben)
        </label>

        <label className="field">
          <span>Supersatz-Gruppe (gleiche Gruppe = Supersatz)</span>
          <select
            className="select"
            value={value.supersetGroup ?? ''}
            onChange={(e) => patch({ supersetGroup: e.target.value || null })}
          >
            <option value="">keine</option>
            {GROUPS.map((g) => (
              <option key={g} value={g}>
                Gruppe {g}
              </option>
            ))}
          </select>
        </label>

        <div className="section">
          <p className="label">Abweichende Werte je Übung</p>
          <p className="small muted">Leer lassen heißt: Wert aus dem Slot gilt.</p>
          {inSlot.map((id) => {
            const o = value.overrides[id] ?? {};
            return (
              <div key={id} className="section-sm">
                <b>{nameOf(id)}</b>
                <div className="row section-sm">
                  <input
                    className="input num"
                    inputMode="numeric"
                    placeholder="Sätze"
                    value={o.sets ?? ''}
                    onChange={(e) => setOverride(id, 'sets', e.target.value)}
                  />
                  <input
                    className="input num"
                    inputMode="numeric"
                    placeholder="von"
                    value={o.repMin ?? ''}
                    onChange={(e) => setOverride(id, 'repMin', e.target.value)}
                  />
                  <input
                    className="input num"
                    inputMode="numeric"
                    placeholder="bis"
                    value={o.repMax ?? ''}
                    onChange={(e) => setOverride(id, 'repMax', e.target.value)}
                  />
                  <input
                    className="input"
                    placeholder="RIR"
                    value={o.rir ?? ''}
                    onChange={(e) => setOverride(id, 'rir', e.target.value)}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="section stack">
          <button className="btn block" onClick={save}>
            Speichern
          </button>
          <button className="btn danger block" onClick={remove}>
            Slot löschen
          </button>
        </div>
      </div>
    </div>
  );
}
