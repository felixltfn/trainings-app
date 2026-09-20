import { useLiveQuery } from 'dexie-react-hooks';

import { startWorkout, suggestNextTemplateId } from '../data';
import { db, getActivePlanVersionId, getMeta } from '../db';
import { addDays, fmtDuration, fmtNum, isoDate, parseIsoDate, trainingTime, weekStart } from '../logic';
import { summarizeWorkout, weeklyStreak } from '../stats';

interface Props {
  onGoToWorkout: () => void;
  onOpenDay: (date: string) => void;
  onGoToSettings: () => void;
}

const DAY_MS = 86400000;
const WORKOUTS_PER_WEEK = 3;

export function OverviewScreen({ onGoToWorkout, onOpenDay, onGoToSettings }: Props) {
  const data = useLiveQuery(async () => {
    const planVersionId = await getActivePlanVersionId();
    const templates = planVersionId ? await db.templates.where('planVersionId').equals(planVersionId).sortBy('order') : [];
    const workouts = await db.workouts.toArray();
    const sets = await db.sets.toArray();
    const exercises = new Map((await db.exercises.toArray()).map((e) => [e.id, e]));
    const running = workouts.find((w) => w.end === null) ?? null;
    const nextId = await suggestNextTemplateId(templates.map((t) => t.id));
    const lastExport = await getMeta<number>('lastExport');
    return { templates, workouts, sets, exercises, running, nextId, lastExport };
  }, []);

  if (!data) return <div className="screen" />;
  const { templates, workouts, sets, exercises, running, nextId, lastExport } = data;

  const next = templates.find((t) => t.id === nextId);
  const finished = workouts.filter((w) => w.end !== null).sort((a, b) => b.start - a.start);
  const last = finished[0];
  const lastTemplate = last ? templates.find((t) => t.id === last.templateId) : undefined;
  const lastSummary = last ? summarizeWorkout(last, sets, workouts, exercises) : null;

  // This week, Monday to Sunday
  const from = weekStart(new Date());
  const to = addDays(from, 6);
  const thisWeek = workouts.filter((w) => w.end !== null && w.date >= from && w.date <= to);
  const weekTime = thisWeek.reduce((sum, w) => sum + (trainingTime(w, sets) ?? 0), 0);
  const weekSets = thisWeek.reduce((sum, w) => sum + summarizeWorkout(w, sets, workouts, exercises).hardSetTotal, 0);

  const streak = weeklyStreak(workouts, WORKOUTS_PER_WEEK);

  const exportDue = workouts.length > 0 && (!lastExport || Date.now() - lastExport > 14 * DAY_MS);

  const start = async (templateId: number) => {
    await startWorkout(templateId);
    onGoToWorkout();
  };

  return (
    <div className="screen">
      <p className="label">
        {new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>
      <h1 className="title">Übersicht</h1>

      {exportDue && (
        <button className="banner section-sm" onClick={onGoToSettings}>
          <span className="grow">
            {lastExport
              ? `Letztes Backup vor ${Math.floor((Date.now() - lastExport) / DAY_MS)} Tagen.`
              : 'Noch kein Backup exportiert.'}{' '}
            Jetzt sichern ›
          </span>
        </button>
      )}

      {running ? (
        <div className="section">
          <p className="label">Läuft gerade</p>
          <div className="big-num">{templates.find((t) => t.id === running.templateId)?.name ?? 'Training'}</div>
          <p className="muted">
            {sets.filter((s) => s.workoutId === running.id).length} Sätze eingetragen
          </p>
          <button className="btn block" onClick={onGoToWorkout}>
            Training fortsetzen
          </button>
        </div>
      ) : (
        next && (
          <div className="section">
            <p className="label">Als Nächstes</p>
            <div className="big-num">{next.name}</div>
            <button className="btn block section-sm" onClick={() => start(next.id)}>
              {next.name} starten
            </button>
          </div>
        )
      )}

      <div className="section">
        <p className="label">Wochen-Streak</p>
        <div className="row">
          <div className="big-num streak-num">{streak.current}</div>
          <div className="grow small">
            {streak.current === 0
              ? `Noch ${streak.missing} ${streak.missing === 1 ? 'Training' : 'Trainings'} diese Woche, dann startet die Streak.`
              : streak.missing > 0
                ? `${streak.current === 1 ? 'Woche' : 'Wochen'} in Folge mit ${WORKOUTS_PER_WEEK} Trainings. Diese Woche fehlen noch ${streak.missing}.`
                : `${streak.current === 1 ? 'Woche' : 'Wochen'} in Folge mit ${WORKOUTS_PER_WEEK} Trainings. Diese Woche ist geschafft.`}
            {streak.best > streak.current && <span className="muted"> Rekord: {streak.best} Wochen.</span>}
          </div>
        </div>
      </div>

      <div className="section">
        <p className="label">Diese Woche</p>
        <div className="stats-row">
          <div className="stat">
            <p className="label">Trainings</p>
            <div className="big-num">
              {thisWeek.length}
              <span className="muted"> / {WORKOUTS_PER_WEEK}</span>
            </div>
          </div>
          <div className="stat">
            <p className="label">Harte Sätze</p>
            <div className="big-num">{fmtNum(weekSets)}</div>
          </div>
          <div className="stat">
            <p className="label">Zeit</p>
            <div className="big-num">{weekTime ? fmtDuration(weekTime) : '–'}</div>
          </div>
        </div>
      </div>

      {last && lastSummary && (
        <div className="section">
          <p className="label">Letztes Training</p>
          <button className="list-item chevron" onClick={() => onOpenDay(last.date)}>
            <span className="grow">
              <b>{lastTemplate?.name ?? 'Training'}</b>
              <br />
              <span className="small muted">
                {parseIsoDate(last.date).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long' })}
                {' · '}
                {fmtDuration(trainingTime(last, sets) ?? 0)}
                {' · '}
                {fmtNum(Math.round(lastSummary.volume))} kg
              </span>
            </span>
          </button>
          {lastSummary.records.length > 0 && (
            <p className="small accent section-sm">
              Neue Bestleistungen: {lastSummary.records.map((r) => r.exercise).join(', ')}
            </p>
          )}
        </div>
      )}

      {workouts.length === 0 && (
        <p className="muted section">
          Noch kein Training aufgezeichnet. Starte oben deinen nächsten Trainingstag – der Plan steht schon bereit.
        </p>
      )}

      <p className="small muted section">Stand: {isoDate(new Date())}</p>
    </div>
  );
}
