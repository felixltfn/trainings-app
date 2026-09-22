import { db, setMeta, type Exercise, type Slot, type SlotOverride, type Stretch } from './db';
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
  ex('Liegestütze', 'Brust', ['Trizeps', 'Vordere Schulter'], { bodyweight: true }),
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
      { name: 'Brust horizontal', ex: 'Liegestütze', alt: ['Brustpresse', 'Bankdrücken'], sets: 3, reps: [6, 10], rir: '1', rest: [120, 180], fixed: true, over: { Bankdrücken: { rir: '1–2' } } },
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

// ---------- One-off corrections for databases created before these plan changes ----------
// Runs once (guarded by a flag in `meta`), so later edits of your own are never overwritten.
export async function applyPlanFixes(): Promise<void> {
  await applyPlanFixes1();
  await applyPlanFixes2();
}

async function applyPlanFixes1(): Promise<void> {
  if (await db.meta.get('planFixes1')) return;

  await db.transaction('rw', [db.exercises, db.slots, db.sets, db.meta], async () => {
    const all = await db.exercises.toArray();
    const sitting = all.find((e) => e.name === 'Beinbeuger sitzend');
    const lying = all.find((e) => e.name === 'Beinbeuger liegend');

    // "Beinbeuger sitzend" is replaced by the lying version everywhere in the plan
    if (sitting && lying) {
      for (const slot of await db.slots.toArray()) {
        const patch: Partial<Slot> = {};
        if (slot.exerciseId === sitting.id) patch.exerciseId = lying.id;
        const alts = slot.alternativeIds.map((id) => (id === sitting.id ? lying.id : id));
        const unique = [...new Set(alts)].filter((id) => id !== (patch.exerciseId ?? slot.exerciseId));
        if (unique.join() !== slot.alternativeIds.join()) patch.alternativeIds = unique;
        if (Object.keys(patch).length > 0) await db.slots.update(slot.id, patch);
      }
      // Only remove the exercise itself when no sets are attached to it
      if ((await db.sets.where('exerciseId').equals(sitting.id).count()) === 0) {
        await db.exercises.delete(sitting.id);
      }
    }

    // Standing calf raise is a bodyweight exercise (weight field = extra load)
    const calf = all.find((e) => e.name === 'Wadenheben stehend');
    if (calf && !calf.bodyweight) await db.exercises.update(calf.id, { bodyweight: true });

    // These pairs are no longer supersets
    const unpair = ['Waden', 'Bauch', 'Brust Isolation', 'Seitliche Schulter'];
    for (const slot of await db.slots.toArray()) {
      if (slot.supersetGroup && unpair.includes(slot.name)) {
        await db.slots.update(slot.id, { supersetGroup: null });
      }
    }

    // Clean up superset groups that lost their partner
    const byTemplate = new Map<number, Slot[]>();
    for (const slot of await db.slots.toArray()) {
      byTemplate.set(slot.templateId, [...(byTemplate.get(slot.templateId) ?? []), slot]);
    }
    for (const group of byTemplate.values()) {
      for (const slot of group) {
        if (slot.supersetGroup && group.filter((s) => s.supersetGroup === slot.supersetGroup).length < 2) {
          await db.slots.update(slot.id, { supersetGroup: null });
        }
      }
    }

    await db.meta.put({ key: 'planFixes1', value: Date.now() });
  });
}

// Upper B: push-ups become the main chest exercise, the chest press an alternative.
// Only touches slots that still have the chest press as their main exercise.
async function applyPlanFixes2(): Promise<void> {
  if (await db.meta.get('planFixes2')) return;

  await db.transaction('rw', [db.exercises, db.templates, db.slots, db.meta], async () => {
    const all = await db.exercises.toArray();
    const press = all.find((e) => e.name === 'Brustpresse');
    const pushUpId =
      all.find((e) => e.name === 'Liegestütze')?.id ??
      (await db.exercises.add({
        name: 'Liegestütze',
        primaryMuscle: 'Brust',
        secondaryMuscles: ['Trizeps', 'Vordere Schulter'],
        unilateral: false,
        bodyweight: true,
        type: 'reps',
        note: '',
      }));

    const upperB = (await db.templates.toArray()).filter((t) => t.name === 'Upper B').map((t) => t.id);
    for (const slot of await db.slots.toArray()) {
      if (!press || !upperB.includes(slot.templateId) || slot.exerciseId !== press.id) continue;
      const alternativeIds = [press.id, ...slot.alternativeIds.filter((id) => id !== press.id && id !== pushUpId)];
      await db.slots.update(slot.id, { exerciseId: pushUpId, alternativeIds });
    }

    await db.meta.put({ key: 'planFixes2', value: Date.now() });
  });
}

// ---------- Stretching routine ----------
// Same on all three training days. Editable in the settings, so this is only the start.
const STRETCHES: Omit<Stretch, 'id' | 'position'>[] = [
  // The deep squat fills the pause between the two cossack squat sets
  {
    name: 'Cossack Squat',
    rounds: 1,
    perSide: false,
    seconds: null, // 6 Wiederholungen je Seite
    restSeconds: null,
    note: 'Seitlicher Ausfallschritt, gestrecktes Bein auf der Ferse. Langsam, Brust aufrecht. 6 Wiederholungen je Seite.',
  },
  {
    name: 'Tiefe Hocke',
    rounds: 1,
    perSide: false,
    seconds: 60,
    restSeconds: null,
    note: 'Fersen bleiben am Boden, Ellenbogen drücken die Knie nach außen.',
  },
  {
    name: 'Cossack Squat',
    rounds: 1,
    perSide: false,
    seconds: null,
    restSeconds: null,
    note: 'Zweiter Durchgang. Seitlicher Ausfallschritt, gestrecktes Bein auf der Ferse. 6 Wiederholungen je Seite.',
  },
  {
    name: 'Vierfüßler auf Ellenbogen, Gesäß nach hinten',
    rounds: 1,
    perSide: false,
    seconds: 60,
    restSeconds: null,
    note: 'Knie weit, Rücken neutral. Langsam vor und zurück schieben, nicht starr halten.',
  },
  {
    name: 'Hüftbeuger im Ausfallschritt',
    rounds: 2,
    perSide: true,
    seconds: 60,
    restSeconds: null,
    note: 'Hinteres Knie am Boden. Gesäß der hinteren Seite aktiv anspannen, Becken aufrichten.',
  },
  {
    name: '90/90 aktiver Wechsel',
    rounds: 1,
    perSide: false,
    seconds: null, // 10 Wechsel
    restSeconds: null,
    note: 'Ohne Hände von einer Seite auf die andere rollen. 10 Wechsel.',
  },
  {
    name: '90/90 Halt mit Anspannung',
    rounds: 2,
    perSide: true,
    seconds: 30,
    restSeconds: null,
    note: '10 s halten, 10 s Schienbein in den Boden drücken, lösen und tiefer gehen, 10 s halten. Rücken lang lassen.',
  },
  {
    name: 'Seitliche Grätsche im Sitzen, erhöht',
    rounds: 2,
    perSide: false,
    seconds: 45,
    restSeconds: 25,
    note: 'Auf 5–10 cm erhöht sitzen, Becken aufrichten. Zwischendurch 10 s die Beine aktiv in den Boden drücken.',
  },
  {
    name: 'Liegende Wirbelsäulendrehung',
    rounds: 2,
    perSide: true,
    seconds: 30,
    restSeconds: null,
    note: 'Locker bleiben, Schultern am Boden lassen.',
  },
  {
    name: 'Kindshaltung',
    rounds: 1,
    perSide: false,
    seconds: 30,
    restSeconds: null,
    note: 'Ruhig atmen.',
  },
  {
    name: 'Oberschenkelvorderseite an der Wand',
    rounds: 2,
    perSide: true,
    seconds: 45,
    restSeconds: null,
    note: 'Fuß an der Wand, Ziel sind die Schulterblätter an der Wand.',
  },
  {
    name: 'Brustdehnung in der Ecke',
    rounds: 1,
    perSide: false,
    seconds: 45,
    restSeconds: null,
    note: 'Arme angewinkelt, Oberkörper langsam nach vorn.',
  },
  {
    name: 'Aushängen an der Stange',
    rounds: 1,
    perSide: false,
    seconds: 45,
    restSeconds: null,
    note: 'Schultern locker, ruhig atmen.',
  },
];

// Fills the stretching table on first start – also for databases that existed before.
export async function seedStretchesIfEmpty(): Promise<void> {
  if ((await db.stretches.count()) > 0) return;
  await db.stretches.bulkAdd(STRETCHES.map((s, i) => ({ ...s, position: i + 1 })));
}

// One-off correction: the cossack squat is two separate entries with the deep squat
// between them, instead of one entry with two sets and a 75 second pause.
// Written so it produces that state no matter what the plan looks like right now.
export async function applyStretchFixes(): Promise<void> {
  if (await db.meta.get('stretchFix2')) return;

  await db.transaction('rw', [db.stretches, db.meta], async () => {
    const plan = await db.stretches.orderBy('position').toArray();
    const cossacks = plan.filter((s) => s.name.startsWith('Cossack'));
    const squat = plan.find((s) => s.name === 'Tiefe Hocke');

    if (cossacks.length >= 1 && squat) {
      // Every cossack entry is a single round without its own pause
      for (const c of cossacks) await db.stretches.update(c.id, { rounds: 1, restSeconds: null, seconds: null });

      // Add the second one if the plan only has one
      let secondId = cossacks[1]?.id;
      if (secondId === undefined) {
        secondId = await db.stretches.add({
          position: 0,
          name: 'Cossack Squat',
          rounds: 1,
          perSide: false,
          seconds: null,
          restSeconds: null,
          note: 'Zweiter Durchgang. Seitlicher Ausfallschritt, gestrecktes Bein auf der Ferse. 6 Wiederholungen je Seite.',
        });
      }

      // Order: cossack, deep squat, cossack, then everything else as before
      const firstId = cossacks[0].id;
      const rest = plan.filter((s) => s.id !== firstId && s.id !== squat.id && s.id !== secondId);
      const ordered = [firstId, squat.id, secondId, ...rest.map((s) => s.id)];
      for (const [i, id] of ordered.entries()) await db.stretches.update(id, { position: i + 1 });
    }

    await db.meta.put({ key: 'stretchFix2', value: Date.now() });
  });
}
