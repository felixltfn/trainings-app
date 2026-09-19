import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { db, getActivePlanVersionId } from '../db';
import { addDays, fmtNum, isoDate, parseIsoDate, weekStart } from '../logic';
import { exerciseSeries, personalRecords, weekHardSets, weeklyTargets } from '../stats';

const axis = { fontSize: 12, fill: 'var(--text-2)' };
const shortDate = (iso: string) => parseIsoDate(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
// Recharts hands over loosely typed values, so the formatters take unknown and narrow themselves.
const tooltipDate = (label: unknown) => (typeof label === 'string' ? shortDate(label) : '');
const tooltipNum = (decimals: number) => (v: unknown) => (typeof v === 'number' ? fmtNum(v, decimals) : '');

export function StatsScreen() {
  const [exerciseId, setExerciseId] = useState<number | null>(null);
  const [week, setWeek] = useState(() => weekStart(new Date()));

  const data = useLiveQuery(async () => {
    const workouts = await db.workouts.toArray();
    const sets = await db.sets.toArray();
    const exercises = new Map((await db.exercises.toArray()).map((e) => [e.id, e]));
    const planVersionId = await getActivePlanVersionId();
    const templates = planVersionId ? await db.templates.where('planVersionId').equals(planVersionId).toArray() : [];
    const slots = (await db.slots.toArray()).filter((s) => templates.some((t) => t.id === s.templateId));
    return { workouts, sets, exercises, templates, slots };
  }, []);

  if (!data) return <div className="screen" />;
  const { workouts, sets, exercises, templates, slots } = data;

  const trained = [...new Set(sets.map((s) => s.exerciseId))]
    .map((id) => exercises.get(id))
    .filter((e) => e !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name));
  const current = exercises.get(exerciseId ?? trained[0]?.id ?? -1);

  const series = current ? exerciseSeries(current, sets, workouts) : [];
  const records = current ? personalRecords(current, series, sets, workouts) : null;

  const weekEnd = addDays(week, 6);
  const done = weekHardSets(week, weekEnd, workouts, sets, exercises);
  const targets = weeklyTargets(slots, exercises, templates.length);
  const muscles = [...new Set([...targets.keys(), ...done.keys()])].sort(
    (a, b) => (targets.get(b) ?? 0) - (targets.get(a) ?? 0),
  );

  return (
    <div className="screen">
      <p className="label">Statistik</p>
      <h1 className="title">Fortschritt</h1>

      <div className="section">
        <p className="label">Harte Sätze pro Woche</p>
        <div className="spread">
          <span className="small muted">
            {shortDate(week)} – {shortDate(weekEnd)}
          </span>
          <div className="row">
            <button className="icon-btn" aria-label="Woche zurück" onClick={() => setWeek(addDays(week, -7))}>
              ‹
            </button>
            <button
              className="icon-btn"
              aria-label="Woche vor"
              disabled={week >= weekStart(new Date())}
              onClick={() => setWeek(addDays(week, 7))}
            >
              ›
            </button>
          </div>
        </div>
        <div className="section-sm">
          {muscles.map((muscle) => {
            const value = done.get(muscle) ?? 0;
            const target = targets.get(muscle) ?? 0;
            const pct = target > 0 ? Math.min(100, (value / target) * 100) : value > 0 ? 100 : 0;
            return (
              <div key={muscle} className="bar-row">
                <span>{muscle}</span>
                <span className="bar-track">
                  <span className="bar-fill" style={{ width: `${pct}%` }} />
                </span>
                <span className="num small">
                  {fmtNum(value)}
                  <span className="muted"> / {fmtNum(target)}</span>
                </span>
              </div>
            );
          })}
          {muscles.length === 0 && <p className="muted">Noch keine Daten.</p>}
        </div>
      </div>

      <div className="section">
        <p className="label">Übung</p>
        {trained.length === 0 ? (
          <p className="muted">Sobald du Sätze einträgst, erscheinen hier Diagramme.</p>
        ) : (
          <select
            className="select"
            value={current?.id ?? ''}
            onChange={(e) => setExerciseId(Number(e.target.value))}
          >
            {trained.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {current && series.length > 0 && (
        <>
          <div className="section">
            <p className="label">{current.type === 'time' ? 'Dauer (s)' : 'Geschätztes 1RM (kg, Epley)'}</p>
            <div className="chart">
              <ResponsiveContainer>
                <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={shortDate} tick={axis} tickLine={false} axisLine={false} />
                  <YAxis tick={axis} tickLine={false} axisLine={false} width={46} />
                  <Tooltip labelFormatter={tooltipDate} formatter={tooltipNum(1)} />
                  {current.type === 'time' ? (
                    <Line type="monotone" dataKey="duration" name="Dauer" stroke="var(--accent)" strokeWidth={2} dot={false} />
                  ) : current.unilateral ? (
                    <>
                      <Line type="monotone" dataKey="e1rmLeft" name="Links" stroke="var(--accent)" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="e1rmRight" name="Rechts" stroke="var(--text-2)" strokeWidth={2} dot={false} />
                    </>
                  ) : (
                    <Line type="monotone" dataKey="e1rm" name="1RM" stroke="var(--accent)" strokeWidth={2} dot={false} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
            {current.unilateral && records?.sideDiff !== null && records !== null && (
              <p className="small muted">
                Rechts liegt {fmtNum(Math.abs(records.sideDiff), 1)} % {records.sideDiff >= 0 ? 'über' : 'unter'} links
                (beste Werte).
              </p>
            )}
          </div>

          <div className="section">
            <p className="label">Volumen pro Einheit (kg)</p>
            <div className="chart">
              <ResponsiveContainer>
                <BarChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={shortDate} tick={axis} tickLine={false} axisLine={false} />
                  <YAxis tick={axis} tickLine={false} axisLine={false} width={46} />
                  <Tooltip labelFormatter={tooltipDate} formatter={tooltipNum(0)} />
                  <Bar dataKey="volume" name="Volumen" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {records && (
            <div className="section">
              <p className="label">Bestleistungen</p>
              <table className="table">
                <tbody>
                  {records.bestE1rm !== null && (
                    <tr>
                      <td>Bestes 1RM</td>
                      <td>{fmtNum(records.bestE1rm, 1)} kg</td>
                    </tr>
                  )}
                  {records.heaviest !== null && (
                    <tr>
                      <td>Schwerste Last</td>
                      <td>{fmtNum(records.heaviest, 1)} kg</td>
                    </tr>
                  )}
                  {records.mostReps !== null && (
                    <tr>
                      <td>Meiste Wiederholungen</td>
                      <td>{records.mostReps}</td>
                    </tr>
                  )}
                  {records.longest !== null && (
                    <tr>
                      <td>Längste Dauer</td>
                      <td>{records.longest} s</td>
                    </tr>
                  )}
                  {records.bestVolume !== null && (
                    <tr>
                      <td>Bestes Volumen</td>
                      <td>{fmtNum(Math.round(records.bestVolume))} kg</td>
                    </tr>
                  )}
                  <tr>
                    <td>Einheiten</td>
                    <td>{series.length}</td>
                  </tr>
                  <tr>
                    <td>Zuletzt</td>
                    <td>{shortDate(series[series.length - 1].date)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      <p className="small muted section">Stand: {isoDate(new Date())}</p>
    </div>
  );
}
