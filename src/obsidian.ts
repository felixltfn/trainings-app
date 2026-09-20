// Markdown export for Obsidian: one file with a section per workout.
import { db, type Exercise, type Workout, type WorkoutSet } from './db';
import { bodyweightFor } from './data';
import { SIDE_LABEL, fmtClock, fmtDuration, fmtNum, isoDate, parseIsoDate, trainingTime } from './logic';
import { summarizeWorkout } from './stats';

function workoutSection(
  w: Workout,
  templateName: string,
  sets: WorkoutSet[],
  workouts: Workout[],
  exercises: Map<number, Exercise>,
): string {
  const mine = sets.filter((s) => s.workoutId === w.id).sort((a, b) => a.timestamp - b.timestamp);
  const summary = summarizeWorkout(w, sets, workouts, exercises);
  const bw = bodyweightFor(w, workouts);
  const time = trainingTime(w, sets);
  const weekday = parseIsoDate(w.date).toLocaleDateString('de-DE', { weekday: 'long' });

  const lines = [`## ${w.date} — ${templateName}`, ''];
  lines.push(`- Tag: ${weekday}`);
  if (time) lines.push(`- Trainingszeit: ${fmtDuration(time)}`);
  lines.push(`- Volumen: ${fmtNum(Math.round(summary.volume))} kg`);
  lines.push(`- Harte Sätze: ${fmtNum(summary.hardSetTotal)}`);
  if (bw !== null) lines.push(`- Körpergewicht: ${fmtNum(bw)} kg`);
  if (summary.records.length > 0) {
    lines.push(`- Bestleistungen: ${summary.records.map((r) => `${r.exercise} (${r.text})`).join(', ')}`);
  }
  lines.push('');

  for (const exerciseId of [...new Set(mine.map((s) => s.exerciseId))]) {
    const ex = exercises.get(exerciseId);
    if (!ex) continue;
    lines.push(`### ${ex.name}`, '', '| Satz | Gewicht | Leistung |', '| --- | --- | --- |');
    for (const s of mine.filter((x) => x.exerciseId === exerciseId).sort((a, b) => a.setNumber - b.setNumber)) {
      const no = `${s.setNumber}${s.side !== 'both' ? ` ${SIDE_LABEL[s.side]}` : ''}${s.drop ? ' ↓' : ''}`;
      const load = ex.bodyweight ? `${fmtNum((bw ?? 0) + s.weight)} kg (KG)` : `${fmtNum(s.weight)} kg`;
      const value = ex.type === 'time' ? `${fmtClock(s.duration ?? 0)} min` : `${s.reps} Wdh`;
      lines.push(`| ${no} | ${load} | ${value} |`);
    }
    lines.push('');
  }

  if (w.note) lines.push(`> ${w.note}`, '');
  return lines.join('\n');
}

export async function buildMarkdown(): Promise<{ filename: string; text: string }> {
  const workouts = (await db.workouts.toArray()).filter((w) => w.end !== null).sort((a, b) => b.start - a.start);
  const sets = await db.sets.toArray();
  const exercises = new Map((await db.exercises.toArray()).map((e) => [e.id, e]));
  const templates = new Map((await db.templates.toArray()).map((t) => [t.id, t.name]));
  const today = isoDate(new Date());

  const head = [
    '---',
    'tags: [training]',
    `exported: ${today}`,
    `workouts: ${workouts.length}`,
    '---',
    '',
    '# Trainingslog',
    '',
    `Export vom ${parseIsoDate(today).toLocaleDateString('de-DE')} · ${workouts.length} Trainings, neueste zuerst.`,
    '',
  ].join('\n');

  const body = workouts
    .map((w) => workoutSection(w, templates.get(w.templateId) ?? 'Training', sets, workouts, exercises))
    .join('\n');

  return { filename: `Trainingslog ${today}.md`, text: `${head}\n${body}` };
}

// Share sheet on iOS (save straight into the Obsidian vault), download on the desktop.
export async function exportMarkdown(): Promise<string> {
  const { filename, text } = await buildMarkdown();
  const file = new File([text], filename, { type: 'text/markdown' });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return 'Markdown geteilt – in Obsidian im Vault-Ordner sichern.';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'Abgebrochen.';
    }
  }

  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return `${filename} gespeichert.`;
}
