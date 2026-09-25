import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';

import { loadProgression } from '../data';
import { getMeta, setMeta } from '../db';
import { fmtNum, parseNum } from '../logic';
import { DEFAULT_PROGRESSION, type ProgressionSettings } from '../progression';
import { setLockScreenSound } from '../signal';

interface Props {
  onClose: () => void;
}

type Draft = Record<keyof ProgressionSettings, string>;

const FIELDS: { key: keyof ProgressionSettings; label: string; unit: string }[] = [
  { key: 'pctMin', label: 'Steigerung Grundübungen ab', unit: '%' },
  { key: 'pctMax', label: 'Steigerung Grundübungen bis', unit: '%' },
  { key: 'weightStep', label: 'Kleinste Gewichtsstufe', unit: 'kg' },
  { key: 'timeStep', label: 'Zeitübungen pro Einheit', unit: 's' },
  { key: 'deloadEvery', label: 'Deload jede … Woche (0 = nie)', unit: '' },
];

const toDraft = (s: ProgressionSettings): Draft =>
  Object.fromEntries(FIELDS.map((f) => [f.key, fmtNum(s[f.key])])) as Draft;

// Returns the parsed settings, or a message saying which value is wrong
function validate(d: Draft): ProgressionSettings | string {
  const n = Object.fromEntries(FIELDS.map((f) => [f.key, parseNum(d[f.key])])) as Record<keyof ProgressionSettings, number | null>;
  if (n.pctMin === null || n.pctMin <= 0) return 'Die untere Steigerung muss größer als 0 % sein.';
  if (n.pctMax === null || n.pctMax < n.pctMin) return 'Die obere Steigerung darf nicht kleiner als die untere sein.';
  if (n.weightStep === null || n.weightStep <= 0) return 'Die Gewichtsstufe muss größer als 0 kg sein.';
  if (n.timeStep === null || n.timeStep <= 0) return 'Die Zeitsteigerung muss größer als 0 s sein.';
  if (n.deloadEvery === null || !Number.isInteger(n.deloadEvery) || n.deloadEvery === 1 || n.deloadEvery < 0)
    return 'Deload: eine ganze Zahl ab 2, oder 0 für nie.';
  return { pctMin: n.pctMin, pctMax: n.pctMax, weightStep: n.weightStep, timeStep: n.timeStep, deloadEvery: n.deloadEvery };
}

export function ProgressionEditor({ onClose }: Props) {
  const stored = useLiveQuery(async () => ({
    settings: await loadProgression(),
    lockScreenSound: (await getMeta<boolean>('lockScreenSound')) ?? true,
  }));
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState('');

  if (!stored) return <div className="screen" />;
  const value = draft ?? toDraft(stored.settings);
  const changed = draft !== null && JSON.stringify(draft) !== JSON.stringify(toDraft(stored.settings));

  const save = async () => {
    const result = validate(value);
    if (typeof result === 'string') {
      setMessage(result);
      return;
    }
    await setMeta('progression', result);
    setDraft(null);
    setMessage('Gespeichert.');
  };

  const toggleSound = async (on: boolean) => {
    await setMeta('lockScreenSound', on);
    setLockScreenSound(on);
  };

  return (
    <div className="screen">
      <button className="back" onClick={onClose}>
        ‹ Einstellungen
      </button>
      <h1 className="title">Wochenziel &amp; Töne</h1>

      <div className="section">
        <p className="small muted">
          Das Wochenziel unter jeder Übung ist ein Vorschlag aus deiner letzten Einheit. Grundübungen steigen um
          diesen Prozentsatz, aufgerundet auf die kleinste Stufe (einzelne Übungen können eine eigene Stufe haben).
        </p>
        {FIELDS.map((f) => (
          <label key={f.key} className="field">
            <span>
              {f.label}
              {f.unit ? ` (${f.unit})` : ''}
            </span>
            <input
              className="input num"
              inputMode="decimal"
              value={value[f.key]}
              placeholder={fmtNum(DEFAULT_PROGRESSION[f.key])}
              onChange={(e) => {
                setMessage('');
                setDraft({ ...value, [f.key]: e.target.value });
              }}
            />
          </label>
        ))}
        {changed && (
          <div className="row section-sm">
            <button className="btn grow" onClick={save}>
              Speichern
            </button>
            <button className="btn secondary grow" onClick={() => setDraft(null)}>
              Verwerfen
            </button>
          </div>
        )}
        {message && <p className="banner section-sm">{message}</p>}
      </div>

      <div className="section">
        <p className="label">Töne</p>
        <label className="check">
          <input type="checkbox" checked={stored.lockScreenSound} onChange={(e) => toggleSound(e.target.checked)} />
          Auch bei gesperrtem Bildschirm piepen
        </label>
        <p className="small muted">
          Dafür spielt die App die Pause als Tonspur ab – Musik aus anderen Apps pausiert, solange ein Timer läuft.
          Ausgeschaltet laufen die Töne mit der Musik zusammen, aber nur bei offener App und ohne Stummschalter.
        </p>
      </div>
    </div>
  );
}
