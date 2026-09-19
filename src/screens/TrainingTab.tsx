import { useLiveQuery } from 'dexie-react-hooks';

import { startWorkout, suggestNextTemplateId } from '../data';
import { db, getActivePlanVersionId, getMeta, type Slot } from '../db';
import type { TimerState } from '../timer';
import { WorkoutScreen } from './WorkoutScreen';

interface Props {
  onSetDone: (t: TimerState | null) => void;
  onFinished: (date: string) => void;
}

const DAY_MS = 86400000;

export function TrainingTab({ onSetDone, onFinished }: Props) {
  // A workout without end time is the one in progress
  // null = no workout running; undefined = still loading
  const running = useLiveQuery(async () => (await db.workouts.filter((w) => w.end === null).last()) ?? null, []);
  const home = useLiveQuery(async () => {
    const planVersionId = await getActivePlanVersionId();
    const templates = planVersionId ? await db.templates.where('planVersionId').equals(planVersionId).sortBy('order') : [];
    const slotCounts = new Map<number, number>();
    for (const t of templates) slotCounts.set(t.id, await db.slots.where('templateId').equals(t.id).count());
    const nextId = await suggestNextTemplateId(templates.map((t) => t.id));
    const lastExport = await getMeta<number>('lastExport');
    const workoutCount = await db.workouts.count();
    return { templates, slotCounts, nextId, lastExport, workoutCount };
  }, []);

  if (running === undefined || !home) return <div className="screen" />;

  if (running) {
    const startTimer = (slot: Slot) => {
      if (slot.restMin > 0) onSetDone({ startedAt: Date.now(), min: slot.restMin, max: slot.restMax });
    };
    return (
      <WorkoutScreen
        workoutId={running.id}
        mode="live"
        onSetDone={startTimer}
        onClose={(date) => {
          onSetDone(null);
          if (date) onFinished(date);
        }}
      />
    );
  }

  const { templates, slotCounts, nextId, lastExport, workoutCount } = home;
  const next = templates.find((t) => t.id === nextId);
  const exportDue = workoutCount > 0 && (!lastExport || Date.now() - lastExport > 14 * DAY_MS);
  const start = (id: number) => startWorkout(id);
  const exerciseCount = (n: number | undefined) => `${n ?? 0} ${n === 1 ? 'Übung' : 'Übungen'}`;

  return (
    <div className="screen">
      <p className="label">
        {new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>
      <h1 className="title">Training</h1>

      {exportDue && (
        <div className="banner section-sm">
          <span className="grow">
            {lastExport
              ? `Letztes Backup vor ${Math.floor((Date.now() - lastExport) / DAY_MS)} Tagen.`
              : 'Noch kein Backup exportiert.'}{' '}
            Export unter Einstellungen.
          </span>
        </div>
      )}

      {next && (
        <div className="section">
          <p className="label">Als Nächstes</p>
          <div className="big-num">{next.name}</div>
          <p className="muted">{exerciseCount(slotCounts.get(next.id))}</p>
          <button className="btn block" onClick={() => start(next.id)}>
            {next.name} starten
          </button>
        </div>
      )}

      <div className="section">
        <p className="label">Alle Trainingstage</p>
        <div className="list">
          {templates.map((t) => (
            <button key={t.id} className="list-item chevron" onClick={() => start(t.id)}>
              <span className="cal-mark">{t.short}</span>
              <span className="grow">
                {t.name}
                <span className="muted small"> · {exerciseCount(slotCounts.get(t.id))}</span>
              </span>
            </button>
          ))}
        </div>
        {templates.length === 0 && <p className="muted">Keine Trainingstage. Lege unter Einstellungen einen an.</p>}
      </div>
    </div>
  );
}
