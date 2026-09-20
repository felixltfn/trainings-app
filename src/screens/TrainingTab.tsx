import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';

import { startWorkout, suggestNextTemplateId } from '../data';
import { db, getActivePlanVersionId, type Slot } from '../db';
import type { TimerState } from '../timer';
import { WorkoutScreen } from './WorkoutScreen';

interface Props {
  onSetDone: (t: TimerState | null) => void;
  onFinished: () => void;
}

export function TrainingTab({ onSetDone, onFinished }: Props) {
  // "‹ Trainingstage" inside a running workout goes back to this list without ending it
  const [showList, setShowList] = useState(false);

  // null = no workout running; undefined = still loading
  const running = useLiveQuery(async () => (await db.workouts.filter((w) => w.end === null).last()) ?? null, []);
  const home = useLiveQuery(async () => {
    const planVersionId = await getActivePlanVersionId();
    const templates = planVersionId ? await db.templates.where('planVersionId').equals(planVersionId).sortBy('order') : [];
    const slotCounts = new Map<number, number>();
    for (const t of templates) slotCounts.set(t.id, await db.slots.where('templateId').equals(t.id).count());
    const nextId = await suggestNextTemplateId(templates.map((t) => t.id));
    return { templates, slotCounts, nextId };
  }, []);

  if (running === undefined || !home) return <div className="screen" />;

  if (running && !showList) {
    const startTimer = (slot: Slot) => {
      if (slot.restMin > 0) onSetDone({ startedAt: Date.now(), min: slot.restMin, max: slot.restMax });
    };
    return (
      <WorkoutScreen
        workoutId={running.id}
        mode="live"
        onSetDone={startTimer}
        onClose={(finishedDate) => {
          setShowList(true);
          if (finishedDate) onFinished();
        }}
      />
    );
  }

  const { templates, slotCounts, nextId } = home;
  const exerciseCount = (n: number | undefined) => `${n ?? 0} ${n === 1 ? 'Übung' : 'Übungen'}`;
  const start = async (id: number) => {
    await startWorkout(id);
    setShowList(false);
  };

  return (
    <div className="screen">
      <p className="label">Training</p>
      <h1 className="title">Trainingstage</h1>

      {running && (
        <div className="section-sm">
          <button className="btn block" onClick={() => setShowList(false)}>
            Laufendes Training fortsetzen
          </button>
          <p className="small muted section-sm">
            Solange ein Training läuft, kannst du keinen zweiten Tag starten. Beende oder verwirf es zuerst.
          </p>
        </div>
      )}

      <div className="section">
        <div className="list">
          {templates.map((t) => (
            <button key={t.id} className="list-item chevron" disabled={!!running} onClick={() => start(t.id)}>
              <span className="cal-mark">{t.short}</span>
              <span className="grow">
                {t.name}
                <span className="muted small"> · {exerciseCount(slotCounts.get(t.id))}</span>
                {t.id === nextId && !running && <span className="accent small"> · als Nächstes</span>}
              </span>
            </button>
          ))}
        </div>
        {templates.length === 0 && <p className="muted">Keine Trainingstage. Lege unter „Einstellungen“ einen an.</p>}
      </div>
    </div>
  );
}
