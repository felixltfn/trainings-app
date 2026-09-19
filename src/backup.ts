import { TABLES, db, setMeta } from './db';
import { isoDate } from './logic';

interface Backup {
  format: 'trainings-app';
  version: 1;
  exportedAt: string;
  tables: Record<string, unknown[]>;
}

async function collect(): Promise<Backup> {
  const tables: Record<string, unknown[]> = {};
  for (const name of TABLES) tables[name] = await db.table(name).toArray();
  return { format: 'trainings-app', version: 1, exportedAt: new Date().toISOString(), tables };
}

// Share sheet on iOS, plain download on the desktop.
export async function exportBackup(): Promise<string> {
  const backup = await collect();
  const filename = `training-backup-${isoDate(new Date())}.json`;
  const file = new File([JSON.stringify(backup, null, 2)], filename, { type: 'application/json' });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      await setMeta('lastExport', Date.now());
      return 'Backup geteilt.';
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
  await setMeta('lastExport', Date.now());
  return `${filename} gespeichert.`;
}

// Replaces all data with the contents of the backup file.
export async function importBackup(file: File): Promise<string> {
  const parsed: unknown = JSON.parse(await file.text());
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    (parsed as Backup).format !== 'trainings-app' ||
    typeof (parsed as Backup).tables !== 'object'
  ) {
    throw new Error('Das ist keine Backup-Datei dieser App.');
  }
  const backup = parsed as Backup;
  const counts: string[] = [];

  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const name of TABLES) {
      const rows = backup.tables[name] ?? [];
      await db.table(name).clear();
      await db.table(name).bulkAdd(rows);
      counts.push(`${rows.length} ${name}`);
    }
  });
  return `Wiederhergestellt: ${counts.join(', ')}.`;
}
