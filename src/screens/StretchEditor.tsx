import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';

import { db, type Stretch } from '../db';
import { CHANGE_REST } from '../stretchRun';

interface Props {
  onClose: () => void;
}

export function StretchEditor({ onClose }: Props) {
  const [openId, setOpenId] = useState<number | null>(null);
  const stretches = useLiveQuery(() => db.stretches.orderBy('position').toArray(), []);

  if (!stretches) return <div className="sheet" />;
  if (openId !== null) return <StretchForm id={openId} onClose={() => setOpenId(null)} />;

  const renumber = async (list: Stretch[]) => {
    await db.transaction('rw', db.stretches, async () => {
      for (const [i, s] of list.entries()) await db.stretches.update(s.id, { position: i + 1 });
    });
  };

  const move = async (index: number, dir: -1 | 1) => {
    const next = [...stretches];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    await renumber(next);
  };

  const add = async () => {
    const id = await db.stretches.add({
      position: stretches.length + 1,
      name: 'Neue Dehnübung',
      rounds: 1,
      perSide: false,
      seconds: 30,
      restSeconds: null,
      note: '',
    });
    setOpenId(id);
  };

  return (
    <div className="sheet">
      <div className="screen">
        <button className="back" onClick={onClose}>
          ‹ Einstellungen
        </button>
        <h1 className="title">Dehnplan</h1>
        <p className="small muted">
          Gilt an allen Trainingstagen. Die Reihenfolge ist der Ablauf. Ohne Dauer zählt die Uhr hoch und du tippst
          „Fertig“.
        </p>

        <div className="list section">
          {stretches.map((s, i) => (
            <div key={s.id} className="list-item">
              <span className="slot-pos">{i + 1}</span>
              <button className="grow chevron list-item" onClick={() => setOpenId(s.id)}>
                <span className="grow">
                  <b>{s.name}</b>
                  <br />
                  <span className="small muted">
                    {s.rounds > 1 ? `${s.rounds}× ${s.perSide ? '(je Seite)' : ''} ` : ''}
                    {s.seconds === null ? 'nach Wiederholungen' : `${s.seconds} s`}
                    {s.restSeconds !== null ? ` · Pause ${s.restSeconds} s` : ''}
                  </span>
                </span>
              </button>
              <button className="icon-btn" aria-label="Nach oben" disabled={i === 0} onClick={() => move(i, -1)}>
                ↑
              </button>
              <button
                className="icon-btn"
                aria-label="Nach unten"
                disabled={i === stretches.length - 1}
                onClick={() => move(i, 1)}
              >
                ↓
              </button>
            </div>
          ))}
        </div>

        <button className="btn block section" onClick={add}>
          + Dehnübung
        </button>
      </div>
    </div>
  );
}

function StretchForm({ id, onClose }: { id: number; onClose: () => void }) {
  const stored = useLiveQuery(() => db.stretches.get(id), [id]);
  const [draft, setDraft] = useState<Stretch | null>(null);

  if (!stored) return <div className="sheet" />;
  const value = draft ?? stored;
  const patch = (p: Partial<Stretch>) => setDraft({ ...value, ...p });
  const num = (s: string) => {
    const n = Number(s.replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  };

  const save = async () => {
    const { id: _id, ...fields } = value;
    await db.stretches.update(id, fields);
    onClose();
  };

  const remove = async () => {
    if (!confirm(`„${value.name}“ aus dem Dehnplan löschen?`)) return;
    await db.stretches.delete(id);
    onClose();
  };

  return (
    <div className="sheet">
      <div className="screen">
        <button className="back" onClick={onClose}>
          ‹ Zurück
        </button>
        <h1 className="title">Dehnübung</h1>

        <label className="field">
          <span>Name</span>
          <input className="input" value={value.name} onChange={(e) => patch({ name: e.target.value })} />
        </label>

        <div className="pair">
          <label className="field">
            <span>Durchgänge</span>
            <input
              className="input num"
              inputMode="numeric"
              value={value.rounds}
              onChange={(e) => patch({ rounds: Math.max(1, num(e.target.value)) })}
            />
          </label>
          <label className="field">
            <span>Dauer je Durchgang (s)</span>
            <input
              className="input num"
              inputMode="numeric"
              placeholder="leer = Wiederholungen"
              value={value.seconds ?? ''}
              onChange={(e) => patch({ seconds: e.target.value.trim() === '' ? null : num(e.target.value) })}
            />
          </label>
        </div>

        <label className="check section-sm">
          <input type="checkbox" checked={value.perSide} onChange={(e) => patch({ perSide: e.target.checked })} />
          Durchgänge sind Seiten (zeigt „Seite 1 von 2“)
        </label>

        <label className="field">
          <span>Pause nach jedem Durchgang (s) – leer heißt {CHANGE_REST} s Wechselpause</span>
          <input
            className="input num"
            inputMode="numeric"
            placeholder={String(CHANGE_REST)}
            value={value.restSeconds ?? ''}
            onChange={(e) => patch({ restSeconds: e.target.value.trim() === '' ? null : num(e.target.value) })}
          />
        </label>

        <label className="field">
          <span>Ausführungshinweis</span>
          <textarea className="input" value={value.note} onChange={(e) => patch({ note: e.target.value })} />
        </label>

        <div className="section stack">
          <button className="btn block" onClick={save}>
            Speichern
          </button>
          <button className="btn secondary block" onClick={onClose}>
            Verwerfen
          </button>
          <button className="btn danger block" onClick={remove}>
            Übung löschen
          </button>
        </div>
      </div>
    </div>
  );
}
