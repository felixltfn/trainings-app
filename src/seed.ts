import { db, setMeta, type Exercise, type Slot, type SlotOverride } from './db';
import { isoDate } from './logic';

// Muscle groups used for "hard sets per muscle and week". New exercises pick from this list.
export const MUSCLES = [
  'Brust',
  'Lat',
  'Oberer Rücken',
  'Vordere Schulter',
  'Seitliche Schulter',
  'Hintere Schulter',
  'Bizeps',
  'Trizeps',
  'Unterarme',
  'Unterer Rücken',
  'Bauch',
  'Quadrizeps',
  'Beinbeuger',
  'Gesäß',
  'Adduktoren',
  'Abduktoren',
  'Waden',
] as const;

// ---------- Start data from the plan. Only used once, on first launch. ----------

type SeedExercise = Omit<Exercise, 'id' | 'note'>;
const ex = (
  name: string,
  primaryMuscle: string,
  secondaryMuscles: string[],
  opts: Partial<Pick<Exercise, 'unilateral' | 'bodyweight' | 'type'>> = {},
): SeedExercise => ({
  name,
  primaryMuscle,
  secondaryMuscles,
  unilateral: opts.unilateral ?? false,
  bodyweight: opts.bodyweight ?? false,
  type: opts.type ?? 'reps',
});

// Each exercise exists exactly once, even if it appears in several days or slots.
const EXERCISES: SeedExercise[] = [
  ex('Schrägbankdrücken Smith', 'Brust', ['Vordere Schulter', 'Trizeps']),
  ex('Obere-Brust-Maschine', 'Brust', ['Vordere Schulter', 'Trizeps']),
  ex('Klimmzüge', 'Lat', ['Oberer Rücken', 'Bizeps'], { bodyweight: true }),
  ex('Latzug', 'Lat', ['Oberer Rücken', 'Bizeps']),
  ex('Dips', 'Brust', ['Trizeps', 'Vordere Schulter'], { bodyweight: true }),
  ex('Brustpresse', 'Brust', ['Trizeps', 'Vordere Schulter']),
  ex('Rudern am Kabel', 'Oberer Rücken', ['Lat', 'Bizeps', 'Hintere Schulter']),
  ex('Rudern einseitig an der Maschine', 'Oberer Rücken', ['Lat', 'Bizeps', 'Hintere Schulter'], { unilateral: true }),
  ex('Butterfly', 'Brust', []),
  ex('Seitheben am Kabel einseitig', 'Seitliche Schulter', [], { unilateral: true }),
  ex('Seitheben Maschine beidseitig', 'Seitliche Schulter', []),
  ex('Trizeps über Kopf am Kabel (Seil)', 'Trizeps', []),
  ex('Skullcrusher SZ-Stange', 'Trizeps', []),
  ex('Trizeps-Pushdown', 'Trizeps', []),
  ex('Preacher Curls mit SZ-Stange', 'Bizeps', ['Unterarme']),
  ex('Freie Bizepscurls', 'Bizeps', ['Unterarme'], { unilateral: true }),
  ex('Rückenstrecker', 'Unterer Rücken', ['Gesäß', 'Beinbeuger']),
  ex('Kniebeugen', 'Quadrizeps', ['Gesäß', 'Adduktoren']),
  ex('Beinpresse', 'Quadrizeps', ['Gesäß']),
  ex('Bulgarische Split Squats', 'Quadrizeps', ['Gesäß', 'Adduktoren'], { unilateral: true }),
  ex('Rumänisches Kreuzheben', 'Beinbeuger', ['Gesäß', 'Unterer Rücken']),
  ex('Kreuzheben', 'Gesäß', ['Beinbeuger', 'Unterer Rücken', 'Quadrizeps']),
  ex('Beinbeuger liegend', 'Beinbeuger', []),
  ex('Beinstrecker', 'Quadrizeps', []),
  ex('Wadenheben stehend', 'Waden', [], { bodyweight: true }),
  ex('Wadenheben an der Beinpresse', 'Waden', []),
  ex('Adduktoren-Maschine', 'Adduktoren', []),
  ex('Abduktoren-Maschine', 'Abduktoren', ['Gesäß']),
  ex('Cable Crunch', 'Bauch', []),
  ex('Bauchrolle', 'Bauch', []),
  ex('Hanging Knee Raises', 'Bauch', [], { bodyweight: true }),
  ex('Plank', 'Bauch', [], { bodyweight: true, type: 'time' }),
  ex('Plank mit Gewichtsweste', 'Bauch', [], { type: 'time' }),
  ex('Bankdrücken', 'Brust', ['Trizeps', 'Vordere Schulter']),
  ex('Klimmzüge Neutralgriff', 'Lat', ['Oberer Rücken', 'Bizeps'], { bodyweight: true }),
  ex('Schulterdrücken Kurzhantel', 'Vordere Schulter', ['Seitliche Schulter', 'Trizeps']),
  ex('Schulterdrücken Maschine', 'Vordere Schulter', ['Seitliche Schulter', 'Trizeps']),
  ex('Überzüge am Kabel', 'Lat', []),
  ex('Reverse Butterfly an der Maschine', 'Hintere Schulter', ['Oberer Rücken']),
  ex('Reverse Butterfly an der Maschine einseitig', 'Hintere Schulter', ['Oberer Rücken'], { unilateral: true }),
  ex('Hammercurls am Kabel', 'Bizeps', ['Unterarme']),
  ex('Bizepscurls hinter dem Rücken am Kabel', 'Bizeps', [], { unilateral: true }),
];

interface SeedSlot {
  name: string;
  ex: string;
  alt?: string[];
  sets: number;
  reps: [number, number];
  rir: string;
  rest: [number, number];
  fixed?: boolean;
  ss?: string;
  over?: Record<string, SlotOverride>;
}

const TEMPLATES: { name: string; short: string; slots: SeedSlot[] }[] = [
  {
    name: 'Upper A',
    short: 'A',
    slots: [
      { name: 'Brust schräg', ex: 'Schrägbankdrücken Smith', alt: ['Obere-Brust-Maschine'], sets: 3, reps: [6, 10], rir: '1–2', rest: [120, 180], fixed: true },
      { name: 'Vertikalzug', ex: 'Klimmzüge', alt: ['Latzug'], sets: 3, reps: [5, 10], rir: '1', rest: [120, 180], fixed: true },
      { name: 'Brust Dehnung', ex: 'Dips', alt: ['Brustpresse'], sets: 3, reps: [6, 12], rir: '1', rest: [120, 180], fixed: true },
      { name: 'Horizontalzug', ex: 'Rudern am Kabel', alt: ['Rudern einseitig an der Maschine'], sets: 3, reps: [8, 12], rir: '0–1', rest: [120, 120] },
      { name: 'Brust Isolation', ex: 'Butterfly', sets: 3, reps: [10, 15], rir: '0', rest: [90, 120], ss: '1' },
      { name: 'Seitliche Schulter', ex: 'Seitheben am Kabel einseitig', alt: ['Seitheben Maschine beidseitig'], sets: 3, reps: [10, 20], rir: '0', rest: [90, 90], ss: '1' },
      { name: 'Trizeps lang', ex: 'Trizeps über Kopf am Kabel (Seil)', alt: ['Skullcrusher SZ-Stange', 'Trizeps-Pushdown'], sets: 3, reps: [12, 20], rir: '0–1', rest: [90, 120], ss: '2' },
      { name: 'Bizeps', ex: 'Preacher Curls mit SZ-Stange', alt: ['Freie Bizepscurls'], sets: 3, reps: [8, 12], rir: '0–1', rest: [90, 120], ss: '2' },
      { name: 'Unterer Rücken', ex: 'Rückenstrecker', sets: 3, reps: [10, 15], rir: '1–2', rest: [120, 120] },
    ],
  },
  {
    name: 'Lower',
    short: 'L',
    slots: [
      { name: 'Kniebeuge', ex: 'Kniebeugen', alt: ['Beinpresse', 'Bulgarische Split Squats'], sets: 3, reps: [5, 8], rir: '1–3', rest: [180, 180], fixed: true, over: { 'Bulgarische Split Squats': { repMin: 8, repMax: 12 } } },
      { name: 'Hüftstreckung', ex: 'Rumänisches Kreuzheben', alt: ['Kreuzheben'], sets: 3, reps: [6, 10], rir: '2–3', rest: [180, 180], fixed: true },
      { name: 'Beinbeuger', ex: 'Beinbeuger liegend', sets: 3, reps: [8, 12], rir: '0–1', rest: [90, 120], ss: '1' },
      { name: 'Beinstrecker', ex: 'Beinstrecker', sets: 3, reps: [10, 15], rir: '0–1', rest: [90, 120], ss: '1' },
      { name: 'Waden', ex: 'Wadenheben stehend', alt: ['Wadenheben an der Beinpresse'], sets: 4, reps: [8, 15], rir: '0–1', rest: [90, 90] },
      { name: 'Adduktoren', ex: 'Adduktoren-Maschine', sets: 3, reps: [10, 15], rir: '0–1', rest: [90, 120], ss: '3' },
      { name: 'Abduktoren', ex: 'Abduktoren-Maschine', sets: 3, reps: [10, 20], rir: '0–1', rest: [90, 120], ss: '3' },
      { name: 'Bauch', ex: 'Cable Crunch', alt: ['Bauchrolle', 'Hanging Knee Raises'], sets: 3, reps: [8, 15], rir: '0–1', rest: [90, 90] },
      { name: 'Rumpf statisch', ex: 'Plank', alt: ['Plank mit Gewichtsweste'], sets: 1, reps: [0, 180], rir: 'kurz vor Formverlust', rest: [0, 0], fixed: true, over: { 'Plank mit Gewichtsweste': { repMin: 20, repMax: 40 } } },
    ],
  },
  {
    name: 'Upper B',
    short: 'B',
    slots: [
      { name: 'Brust horizontal', ex: 'Brustpresse', alt: ['Bankdrücken'], sets: 3, reps: [6, 10], rir: '1', rest: [120, 180], fixed: true, over: { Bankdrücken: { rir: '1–2' } } },
      { name: 'Vertikalzug', ex: 'Klimmzüge Neutralgriff', alt: ['Latzug'], sets: 3, reps: [5, 10], rir: '1', rest: [120, 180], fixed: true },
      { name: 'Schulterdrücken', ex: 'Schulterdrücken Kurzhantel', alt: ['Schulterdrücken Maschine'], sets: 3, reps: [6, 10], rir: '1–2', rest: [120, 180], fixed: true },
      { name: 'Lat Isolation', ex: 'Überzüge am Kabel', sets: 3, reps: [10, 15], rir: '0–1', rest: [120, 120] },
      { name: 'Brust Isolation', ex: 'Butterfly', sets: 3, reps: [10, 15], rir: '0', rest: [90, 120], ss: '1' },
      { name: 'Hintere Schulter', ex: 'Reverse Butterfly an der Maschine', alt: ['Reverse Butterfly an der Maschine einseitig'], sets: 3, reps: [10, 20], rir: '0', rest: [90, 120], ss: '1' },
      { name: 'Trizeps', ex: 'Trizeps-Pushdown', alt: ['Trizeps über Kopf am Kabel (Seil)'], sets: 3, reps: [10, 15], rir: '0–1', rest: [90, 120], ss: '2' },
      { name: 'Arm-Beuger', ex: 'Hammercurls am Kabel', alt: ['Bizepscurls hinter dem Rücken am Kabel'], sets: 3, reps: [10, 15], rir: '0–1', rest: [90, 120], ss: '2' },
      { name: 'Seitliche Schulter', ex: 'Seitheben am Kabel einseitig', alt: ['Seitheben Maschine beidseitig'], sets: 3, reps: [10, 20], rir: '0', rest: [90, 90] },
    ],
  },
];

// Fills an empty database with the plan. Does nothing if data already exists.
export async function seedIfEmpty(): Promise<void> {
  await db.transaction('rw', [db.exercises, db.planVersions, db.templates, db.slots, db.meta], async () => {
    if ((await db.planVersions.count()) > 0) return;

    const ids = new Map<string, number>();
    for (const e of EXERCISES) {
      ids.set(e.name, await db.exercises.add({ ...e, note: '' }));
    }
    const idOf = (name: string): number => {
      const id = ids.get(name);
      if (id === undefined) throw new Error(`Seed: unknown exercise "${name}"`);
      return id;
    };

    const today = isoDate(new Date());
    const planVersionId = await db.planVersions.add({ name: 'Mesozyklus 1', start: today, end: null });

    for (const [order, t] of TEMPLATES.entries()) {
      const templateId = await db.templates.add({ planVersionId, name: t.name, short: t.short, order });
      const slots = t.slots.map((s, i) => {
        const overrides: Record<number, SlotOverride> = {};
        for (const [name, o] of Object.entries(s.over ?? {})) overrides[idOf(name)] = o;
        return {
          templateId,
          position: i + 1,
          name: s.name,
          exerciseId: idOf(s.ex),
          alternativeIds: (s.alt ?? []).map(idOf),
          sets: s.sets,
          repMin: s.reps[0],
          repMax: s.reps[1],
          rir: s.rir,
          restMin: s.rest[0],
          restMax: s.rest[1],
          orderFixed: s.fixed ?? false,
          supersetGroup: s.ss ?? null,
          overrides,
        } satisfies Omit<Slot, 'id'>;
      });
      await db.slots.bulkAdd(slots);
    }
    await setMeta('activePlanVersionId', planVersionId);
  });
}
