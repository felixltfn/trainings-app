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
  const data = useLiveQuery(async () => {
    const template = await db.templates.get(templateId);
    const slots = await db.slots.where('templateId').equals(templateId).sortBy('position');
    const exercises = new Map((await db.exercises.toArray()).map((e) => [e.id, e]));
    const workoutCount = await db.workouts.where('templateId').equals(templateId).count();
    return { template, slots, exercises, workoutCount };
  }, [templateId]);

  if (!data?.template) return <div className="sheet" />;
  if (openSlot !== null) return <SlotEditor slotId={openSlot} onClose={() => setOpenSlot(null)} />;

  const { template, slots, exercises, workoutCount } = data;

  const renumber = async (list: Slot[]) => {
    await db.transaction('rw', db.slots, async () => {
      for (const [i, s] of list.entries()) await db.slots.update(s.id, { position: i + 1 });
    });
  };

  const move = async (index: number, dir: -1 | 1) => {
    const next = [...slots];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    await renumber(next);
  };

  const addSlot = async () => {
    const firstExercise = [...exercises.values()][0];
    if (!firstExercise) return;
    const id = await db.slots.add({
      templateId,
      position: slots.length + 1,
      name: 'Neuer Slot',
      exerciseId: firstExercise.id,
      alternativeIds: [],
      sets: 3,
      repMin: 8,
      repMax: 12,
      rir: '1–2',
      restMin: 120,
      restMax: 180,
      orderFixed: false,
      supersetGroup: null,
      overrides: {},
    });
    setOpenSlot(id);
  };

  const removeTemplate = async () => {
    if (workoutCount > 0) {
      alert(`Zu diesem Trainingstag gibt es ${workoutCount} Trainings. Er lässt sich nicht löschen.`);
      return;
    }
    if (!confirm(`„${template.name}“ mit allen Slots löschen?`)) return;
    await db.transaction('rw', db.templates, db.slots, async () => {
      await db.slots.where('templateId').equals(templateId).delete();
      await db.templates.delete(templateId);
    });
    onClose();
  };

  return (
    <div className="sheet">
      <div className="screen">
        <button className="back" onClick={onClose}>
          ‹ Zurück
        </button>
        <h1 className="title">{template.name}</h1>

        <div className="pair">
          <label className="field">
            <span>Name</span>
            <input
              className="input"
              defaultValue={template.name}
              onBlur={(e) => db.templates.update(templateId, { name: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Kürzel im Kalender</span>
            <input
              className="input"
              maxLength={2}
              defaultValue={template.short}
              onBlur={(e) => db.templates.update(templateId, { short: e.target.value })}
            />
          </label>
        </div>

        <div className="section">
          <p className="label">Slots</p>
          <div className="list">
            {slots.map((slot, i) => {
              const ex = exercises.get(slot.exerciseId);
              const t = slotTargets(slot, slot.exerciseId);
              return (
                <div key={slot.id} className="list-item">
                  <span className="slot-pos">{slot.position}</span>
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
                    disabled={i === slots.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    ↓
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="section stack">
          <button className="btn block" onClick={addSlot}>
            + Slot hinzufügen
          </button>
          <button className="btn danger block" onClick={removeTemplate}>
            Trainingstag löschen
          </button>
        </div>
      </div>
    </div>
  );
}
