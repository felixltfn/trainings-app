import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';

import { db, type Slot } from '../db';
import { slotTargets } from '../logic';
import { SlotEditor } from './SlotEditor';

interface Props {
  templateId: number;
  onClose: () => void;
}

export function TemplateEditor({ templateId, onClose }: Props) {
  const [openSlot, setOpenSlot] = useState<number | null>(null);
  const [draft, setDraft] = useState<{ name: string; short: string } | null>(null);
  const [order, setOrder] = useState<number[] | null>(null); // slot ids while reordering
  const [error, setError] = useState('');

  const data = useLiveQuery(async () => {
    const template = await db.templates.get(templateId);
    const slots = await db.slots.where('templateId').equals(templateId).sortBy('position');
    const exercises = new Map((await db.exercises.toArray()).map((e) => [e.id, e]));
    const workoutCount = await db.workouts.where('templateId').equals(templateId).count();
    // Other days of the same plan – their short labels must stay unique
    const siblings = template
      ? (await db.templates.where('planVersionId').equals(template.planVersionId).toArray()).filter(
          (t) => t.id !== templateId,
        )
      : [];
    return { template, slots, exercises, workoutCount, siblings };
  }, [templateId]);

  if (!data?.template) return <div className="sheet" />;
  if (openSlot !== null) return <SlotEditor slotId={openSlot} onClose={() => setOpenSlot(null)} />;

  const { template, slots, exercises, workoutCount, siblings } = data;
  const value = draft ?? { name: template.name, short: template.short };
  const slotOrder = order ?? slots.map((s) => s.id);
  const orderedSlots = slotOrder.map((id) => slots.find((s) => s.id === id)).filter((s): s is Slot => !!s);
  const dirty = draft !== null || order !== null;

  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= slotOrder.length) return;
    const next = [...slotOrder];
    [next[index], next[j]] = [next[j], next[index]];
    setOrder(next);
  };

  const save = async () => {
    const short = value.short.trim().toUpperCase();
    if (!value.name.trim()) {
      setError('Der Trainingstag braucht einen Namen.');
      return;
    }
    if (!short) {
      setError('Das Kürzel darf nicht leer sein – es steht im Kalender.');
      return;
    }
    const clash = siblings.find((t) => t.short.trim().toUpperCase() === short);
    if (clash) {
      setError(`Das Kürzel „${short}“ gehört schon zu „${clash.name}“. Wähle ein anderes.`);
      return;
    }
    await db.transaction('rw', db.templates, db.slots, async () => {
      await db.templates.update(templateId, { name: value.name.trim(), short });
      for (const [i, id] of slotOrder.entries()) await db.slots.update(id, { position: i + 1 });
    });
    setDraft(null);
    setOrder(null);
    setError('');
    onClose();
  };

  const discard = () => {
    if (dirty && !confirm('Änderungen an diesem Trainingstag verwerfen?')) return;
    setDraft(null);
    setOrder(null);
    setError('');
    onClose();
  };

  const addSlot = async () => {
    const firstExercise = [...exercises.values()][0];
    if (!firstExercise) return;
    const id = await db.slots.add({
      templateId,
      position: slots.length + 1,
      name: 'Neue Übung',
      exerciseId: firstExercise.id,
      alternativeIds: [],
      sets: 3,
      repMin: 8,
      repMax: 12,
      rir: '',
      restMin: 120,
      restMax: 180,
      orderFixed: false,
      supersetGroup: null,
      overrides: {},
    });
    setOrder([...slotOrder, id]);
    setOpenSlot(id);
  };

  const removeTemplate = async () => {
    if (workoutCount > 0) {
      setError(`Zu diesem Trainingstag gibt es ${workoutCount} aufgezeichnete Trainings – er lässt sich nicht löschen.`);
      return;
    }
    if (!confirm(`„${template.name}“ mit allen Übungen löschen?`)) return;
    await db.transaction('rw', db.templates, db.slots, async () => {
      await db.slots.where('templateId').equals(templateId).delete();
      await db.templates.delete(templateId);
    });
    onClose();
  };

  return (
    <div className="sheet">
      <div className="screen">
        <button className="back" onClick={discard}>
          ‹ Zurück
        </button>
        <h1 className="title">{template.name}</h1>

        <div className="pair">
          <label className="field">
            <span>Name</span>
            <input className="input" value={value.name} onChange={(e) => setDraft({ ...value, name: e.target.value })} />
          </label>
          <label className="field">
            <span>Kürzel im Kalender</span>
            <input
              className="input"
              maxLength={2}
              value={value.short}
              onChange={(e) => setDraft({ ...value, short: e.target.value })}
            />
          </label>
        </div>

        <div className="section">
          <p className="label">Übungen</p>
          <div className="list">
            {orderedSlots.map((slot, i) => {
              const ex = exercises.get(slot.exerciseId);
              const t = slotTargets(slot, slot.exerciseId);
              return (
                <div key={slot.id} className="list-item">
                  <span className="slot-pos">{i + 1}</span>
                  <button className="grow chevron list-item" onClick={() => setOpenSlot(slot.id)}>
                    <span className="grow">
                      <b>{slot.name}</b>
                      <br />
                      <span className="small muted">
                        {ex?.name} · {t.sets} Sätze
                        {slot.supersetGroup ? ` · Supersatz ${slot.supersetGroup}` : ''}
                      </span>
                    </span>
                  </button>
                  <button className="icon-btn" aria-label="Nach oben" disabled={i === 0} onClick={() => move(i, -1)}>
                    ↑
                  </button>
                  <button
                    className="icon-btn"
                    aria-label="Nach unten"
                    disabled={i === orderedSlots.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    ↓
                  </button>
                </div>
              );
            })}
          </div>
          <button className="btn secondary block section-sm" onClick={addSlot}>
            + Übung hinzufügen
          </button>
        </div>

        {error && <p className="banner section-sm">{error}</p>}

        <div className="section stack">
          <button className="btn block" onClick={save}>
            Speichern
          </button>
          <button className="btn secondary block" onClick={discard}>
            Verwerfen
          </button>
          <button className="btn danger block" onClick={removeTemplate}>
            Trainingstag löschen
          </button>
        </div>
      </div>
    </div>
  );
}
