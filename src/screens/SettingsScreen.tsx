import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';

import { exportBackup, importBackup } from '../backup';
import { copyActivePlanVersion } from '../data';
import { db, getActivePlanVersionId, getMeta, setMeta } from '../db';
import { generateTestData, resetEverything } from '../devdata';
import { isoDate, parseIsoDate } from '../logic';
import { ExerciseEditor } from './ExerciseEditor';
import { TemplateEditor } from './TemplateEditor';

type View =
  | { kind: 'root' }
  | { kind: 'templates' }
  | { kind: 'template'; id: number }
  | { kind: 'exercises' }
  | { kind: 'exercise'; id: number | 'new' }
  | { kind: 'plans' };

export function SettingsScreen() {
  const [view, setView] = useState<View>({ kind: 'root' });
  const [message, setMessage] = useState('');
  const [newName, setNewName] = useState(''); // inline name field for a new day / plan version
  const fileInput = useRef<HTMLInputElement>(null);

  const data = useLiveQuery(async () => {
    const activeId = await getActivePlanVersionId();
    const planVersions = await db.planVersions.orderBy('start').reverse().toArray();
    const templates = activeId ? await db.templates.where('planVersionId').equals(activeId).sortBy('order') : [];
    const exercises = (await db.exercises.toArray()).sort((a, b) => a.name.localeCompare(b.name));
    const lastExport = await getMeta<number>('lastExport');
    return { activeId, planVersions, templates, exercises, lastExport };
  }, []);

  if (!data) return <div className="screen" />;
  const { activeId, planVersions, templates, exercises, lastExport } = data;

  if (view.kind === 'template') return <TemplateEditor templateId={view.id} onClose={() => setView({ kind: 'templates' })} />;
  if (view.kind === 'exercise') return <ExerciseEditor exerciseId={view.id} onClose={() => setView({ kind: 'exercises' })} />;

  const run = async (fn: () => Promise<string>) => {
    try {
      setMessage(await fn());
    } catch (e) {
      setMessage(`Fehler: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const addTemplate = async () => {
    const name = newName.trim();
    if (!activeId || !name) return;
    setNewName('');
    const id = await db.templates.add({
      planVersionId: activeId,
      name,
      short: name.slice(0, 1).toUpperCase(),
      order: templates.length,
    });
    setView({ kind: 'template', id });
  };

  const addPlanVersion = async () => {
    const name = newName.trim() || `Mesozyklus ${planVersions.length + 1}`;
    setNewName('');
    await copyActivePlanVersion(name, isoDate(new Date()));
    setMessage('Neue Planversion als Kopie angelegt. Alte Trainings bleiben unverändert.');
  };

  if (view.kind === 'templates') {
    return (
      <Sheet title="Trainingstage" onBack={() => setView({ kind: 'root' })}>
        <div className="list">
          {templates.map((t) => (
            <button key={t.id} className="list-item chevron" onClick={() => setView({ kind: 'template', id: t.id })}>
              <span className="cal-mark">{t.short}</span>
              <span className="grow">{t.name}</span>
            </button>
          ))}
        </div>
        <div className="row section">
          <input
            className="input grow"
            placeholder="Name des neuen Trainingstags"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button className="btn" disabled={!newName.trim()} onClick={addTemplate}>
            + Tag
          </button>
        </div>
      </Sheet>
    );
  }

  if (view.kind === 'exercises') {
    return (
      <Sheet title="Übungen" onBack={() => setView({ kind: 'root' })}>
        <div className="list">
          {exercises.map((e) => (
            <button key={e.id} className="list-item chevron" onClick={() => setView({ kind: 'exercise', id: e.id })}>
              <span className="grow">
                {e.name}
                <br />
                <span className="small muted">
                  {e.primaryMuscle}
                  {e.unilateral ? ' · einseitig' : ''}
                  {e.bodyweight ? ' · KG' : ''}
                  {e.type === 'time' ? ' · Zeit' : ''}
                </span>
              </span>
            </button>
          ))}
        </div>
        <button className="btn block section" onClick={() => setView({ kind: 'exercise', id: 'new' })}>
          + Neue Übung
        </button>
      </Sheet>
    );
  }

  if (view.kind === 'plans') {
    return (
      <Sheet title="Planversionen" onBack={() => setView({ kind: 'root' })}>
        <div className="list">
          {planVersions.map((p) => (
            <div key={p.id} className="list-item">
              <span className="grow">
                <b>{p.name}</b>
                {p.id === activeId && <span className="accent small"> · aktiv</span>}
                <br />
                <span className="small muted">
                  ab {parseIsoDate(p.start).toLocaleDateString('de-DE')}
                  {p.end ? ` bis ${parseIsoDate(p.end).toLocaleDateString('de-DE')}` : ''}
                </span>
              </span>
              {p.id !== activeId && (
                <button
                  className="btn ghost"
                  onClick={async () => {
                    await setMeta('activePlanVersionId', p.id);
                    setMessage(`„${p.name}“ ist jetzt aktiv.`);
                  }}
                >
                  aktiv setzen
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="row section">
          <input
            className="input grow"
            placeholder={`Mesozyklus ${planVersions.length + 1}`}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button className="btn" onClick={addPlanVersion}>
            + Kopie
          </button>
        </div>
        <p className="small muted section-sm">
          Eine neue Planversion kopiert Trainingstage und Slots. Alte Trainings bleiben unverändert und weiter
          auswertbar.
        </p>
        {message && <p className="banner section">{message}</p>}
      </Sheet>
    );
  }

  return (
    <div className="screen">
      <p className="label">Einstellungen</p>
      <h1 className="title">Plan &amp; Daten</h1>

      <div className="section">
        <p className="label">Plan</p>
        <div className="list">
          <button className="list-item chevron" onClick={() => setView({ kind: 'templates' })}>
            <span className="grow">Trainingstage</span>
            <span className="muted">{templates.length}</span>
          </button>
          <button className="list-item chevron" onClick={() => setView({ kind: 'exercises' })}>
            <span className="grow">Übungen</span>
            <span className="muted">{exercises.length}</span>
          </button>
          <button className="list-item chevron" onClick={() => setView({ kind: 'plans' })}>
            <span className="grow">Planversionen</span>
            <span className="muted">{planVersions.length}</span>
          </button>
        </div>
      </div>

      <div className="section">
        <p className="label">Daten</p>
        <p className="small muted">
          Alles liegt nur auf diesem Gerät. Letztes Backup:{' '}
          {lastExport ? new Date(lastExport).toLocaleDateString('de-DE') : 'noch nie'}.
        </p>
        <div className="stack section-sm">
          <button className="btn block" onClick={() => run(exportBackup)}>
            Backup exportieren (JSON)
          </button>
          <button className="btn secondary block" onClick={() => fileInput.current?.click()}>
            Backup importieren
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              if (!confirm('Import ersetzt ALLE Daten auf diesem Gerät. Fortfahren?')) return;
              run(() => importBackup(file));
            }}
          />
        </div>
      </div>

      {import.meta.env.DEV && (
        <div className="section">
          <p className="label">Entwicklung (nur lokal)</p>
          <div className="stack">
            <button className="btn secondary block" onClick={() => run(() => generateTestData(8))}>
              Testdaten erzeugen (8 Wochen)
            </button>
            <button
              className="btn danger block"
              onClick={() => confirm('Datenbank komplett löschen?') && resetEverything()}
            >
              Alles zurücksetzen
            </button>
          </div>
        </div>
      )}

      {message && <p className="banner section">{message}</p>}
    </div>
  );
}

function Sheet({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div className="screen">
      <button className="back" onClick={onBack}>
        ‹ Einstellungen
      </button>
      <h1 className="title">{title}</h1>
      <div className="section">{children}</div>
    </div>
  );
}
