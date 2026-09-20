import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';

import { exportBackup, importBackup } from '../backup';
import { copyPlan, createPlan } from '../data';
import { db, getActivePlanVersionId, getMeta, setMeta } from '../db';
import { generateTestData, resetEverything } from '../devdata';
import { isoDate } from '../logic';
import { ExerciseEditor } from './ExerciseEditor';
import { TemplateEditor } from './TemplateEditor';

type View =
  | { kind: 'root' }
  | { kind: 'plans' }
  | { kind: 'plan'; id: number }
  | { kind: 'template'; id: number; planId: number }
  | { kind: 'exercises' }
  | { kind: 'exercise'; id: number | 'new' };

export function SettingsScreen() {
  const [view, setView] = useState<View>({ kind: 'root' });
  const [message, setMessage] = useState('');
  const [newName, setNewName] = useState(''); // inline name field for a new plan or training day
  const fileInput = useRef<HTMLInputElement>(null);

  const data = useLiveQuery(async () => {
    const activeId = await getActivePlanVersionId();
    const plans = await db.planVersions.orderBy('start').reverse().toArray();
    const dayCounts = new Map<number, number>();
    for (const p of plans) dayCounts.set(p.id, await db.templates.where('planVersionId').equals(p.id).count());
    const exercises = (await db.exercises.toArray()).sort((a, b) => a.name.localeCompare(b.name));
    const lastExport = await getMeta<number>('lastExport');
    return { activeId, plans, dayCounts, exercises, lastExport };
  }, []);

  // The training days of the plan currently opened
  const openPlanId = view.kind === 'plan' ? view.id : view.kind === 'template' ? view.planId : null;
  const days = useLiveQuery(
    async () => (openPlanId ? db.templates.where('planVersionId').equals(openPlanId).sortBy('order') : []),
    [openPlanId],
  );

  if (!data) return <div className="screen" />;
  const { activeId, plans, dayCounts, exercises, lastExport } = data;
  const activePlan = plans.find((p) => p.id === activeId);

  if (view.kind === 'template')
    return <TemplateEditor templateId={view.id} onClose={() => setView({ kind: 'plan', id: view.planId })} />;
  if (view.kind === 'exercise')
    return <ExerciseEditor exerciseId={view.id} onClose={() => setView({ kind: 'exercises' })} />;

  const run = async (fn: () => Promise<string>) => {
    try {
      setMessage(await fn());
    } catch (e) {
      setMessage(`Fehler: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const addPlan = async (copyFrom: number | null) => {
    const name = newName.trim() || (copyFrom ? 'Kopie' : 'Neuer Plan');
    setNewName('');
    const id = copyFrom ? await copyPlan(copyFrom, name, isoDate(new Date())) : await createPlan(name, isoDate(new Date()));
    setView({ kind: 'plan', id });
  };

  const addDay = async (planId: number) => {
    const name = newName.trim();
    if (!name) return;
    setNewName('');
    const id = await db.templates.add({
      planVersionId: planId,
      name,
      short: name.slice(0, 1).toUpperCase(),
      order: days?.length ?? 0,
    });
    setView({ kind: 'template', id, planId });
  };

  const deletePlan = async (planId: number, name: string) => {
    const templates = await db.templates.where('planVersionId').equals(planId).toArray();
    const used = await db.workouts.where('templateId').anyOf(templates.map((t) => t.id)).count();
    if (used > 0) {
      alert(`Zu „${name}“ gibt es ${used} aufgezeichnete Trainings. Der Plan lässt sich nicht löschen.`);
      return;
    }
    if (!confirm(`Trainingsplan „${name}“ mit allen Trainingstagen löschen?`)) return;
    await db.transaction('rw', [db.planVersions, db.templates, db.slots], async () => {
      for (const t of templates) await db.slots.where('templateId').equals(t.id).delete();
      await db.templates.bulkDelete(templates.map((t) => t.id));
      await db.planVersions.delete(planId);
    });
    setView({ kind: 'plans' });
  };

  // ---------- Single plan with its training days ----------
  if (view.kind === 'plan') {
    const plan = plans.find((p) => p.id === view.id);
    if (!plan || !days) return <div className="screen" />;
    return (
      <Sheet title={plan.name} back="Trainingspläne" onBack={() => setView({ kind: 'plans' })}>
        <label className="field">
          <span>Name des Plans</span>
          <input
            className="input"
            defaultValue={plan.name}
            onBlur={(e) => e.target.value.trim() && db.planVersions.update(plan.id, { name: e.target.value.trim() })}
          />
        </label>

        {plan.id === activeId ? (
          <p className="banner section-sm">Dieser Plan ist aktiv – seine Tage erscheinen unter „Training“.</p>
        ) : (
          <button
            className="btn block section-sm"
            onClick={async () => {
              await setMeta('activePlanVersionId', plan.id);
              setMessage(`„${plan.name}“ ist jetzt aktiv.`);
            }}
          >
            Diesen Plan aktiv setzen
          </button>
        )}

        <div className="section">
          <p className="label">Trainingstage</p>
          <div className="list">
            {days.map((t) => (
              <button
                key={t.id}
                className="list-item chevron"
                onClick={() => setView({ kind: 'template', id: t.id, planId: plan.id })}
              >
                <span className="cal-mark">{t.short}</span>
                <span className="grow">{t.name}</span>
              </button>
            ))}
          </div>
          {days.length === 0 && <p className="muted small">Noch keine Trainingstage in diesem Plan.</p>}
          <div className="row section-sm">
            <input
              className="input grow"
              placeholder="z. B. Push"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button className="btn" disabled={!newName.trim()} onClick={() => addDay(plan.id)}>
              + Tag
            </button>
          </div>
        </div>

        <div className="section stack">
          <button className="btn secondary block" onClick={() => addPlan(plan.id)}>
            Diesen Plan kopieren
          </button>
          <button className="btn danger block" onClick={() => deletePlan(plan.id, plan.name)}>
            Plan löschen
          </button>
        </div>
        {message && <p className="banner section">{message}</p>}
      </Sheet>
    );
  }

  // ---------- All plans ----------
  if (view.kind === 'plans') {
    return (
      <Sheet title="Trainingspläne" back="Einstellungen" onBack={() => setView({ kind: 'root' })}>
        <p className="small muted">
          Lege hier verschiedene Pläne an – etwa PPL, Upper/Lower oder Ganzkörper. Der aktive Plan bestimmt, welche
          Trainingstage unter „Training“ auftauchen. Aufgezeichnete Trainings bleiben immer erhalten.
        </p>
        <div className="list section-sm">
          {plans.map((p) => (
            <button key={p.id} className="list-item chevron" onClick={() => setView({ kind: 'plan', id: p.id })}>
              <span className="grow">
                <b>{p.name}</b>
                {p.id === activeId && <span className="accent small"> · aktiv</span>}
                <br />
                <span className="small muted">
                  {dayCounts.get(p.id) ?? 0} {dayCounts.get(p.id) === 1 ? 'Trainingstag' : 'Trainingstage'}
                </span>
              </span>
            </button>
          ))}
        </div>
        <div className="row section">
          <input
            className="input grow"
            placeholder="z. B. PPL"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button className="btn" onClick={() => addPlan(null)}>
            + Plan
          </button>
        </div>
        {activeId && (
          <button className="btn secondary block section-sm" onClick={() => addPlan(activeId)}>
            Aktiven Plan kopieren
          </button>
        )}
        {message && <p className="banner section">{message}</p>}
      </Sheet>
    );
  }

  // ---------- Exercises ----------
  if (view.kind === 'exercises') {
    return (
      <Sheet title="Übungen" back="Einstellungen" onBack={() => setView({ kind: 'root' })}>
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

  // ---------- Root ----------
  return (
    <div className="screen">
      <p className="label">Einstellungen</p>
      <h1 className="title">Pläne &amp; Daten</h1>

      <div className="section">
        <p className="label">Plan</p>
        <div className="list">
          <button className="list-item chevron" onClick={() => setView({ kind: 'plans' })}>
            <span className="grow">
              Trainingspläne
              <br />
              <span className="small muted">aktiv: {activePlan?.name ?? 'keiner'}</span>
            </span>
            <span className="muted">{plans.length}</span>
          </button>
          <button className="list-item chevron" onClick={() => setView({ kind: 'exercises' })}>
            <span className="grow">Übungen</span>
            <span className="muted">{exercises.length}</span>
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

function Sheet({
  title,
  back,
  onBack,
  children,
}: {
  title: string;
  back: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="screen">
      <button className="back" onClick={onBack}>
        ‹ {back}
      </button>
      <h1 className="title">{title}</h1>
      <div className="section">{children}</div>
    </div>
  );
}
