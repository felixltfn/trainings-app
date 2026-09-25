# Trainings-App — Projektregeln

PWA zum Protokollieren von Krafttraining. Vite + React + TypeScript, Dexie (IndexedDB),
Recharts, vite-plugin-pwa. Kein Backend — alle Daten liegen nur auf Felix' iPhone.

Live: https://felixltfn.github.io/trainings-app/?v=2 · Repo: github.com/felixltfn/trainings-app
Deploy: `git push` auf `main` → GitHub Actions (baut mit `BASE_PATH=/trainings-app/`) → Pages.

## Regel 1: Plandaten ändern = immer zwei Stellen

`src/seed.ts` wird **nur bei leerer Datenbank** ausgeführt. Eine Änderung an den Startdaten
(Übungen, Slots, Supersätze, Kürzel) erreicht eine bereits installierte App deshalb NIE.
Jede Planänderung braucht zusätzlich einen Schritt in `applyPlanFixes()` — einmalig,
abgesichert über ein Flag in der `meta`-Tabelle, damit spätere eigene Änderungen von
Felix nicht überschrieben werden. Danach am besten im Browser gegenprüfen: alten Zustand
künstlich herstellen, neu laden, Daten auslesen.

## Regel 2: Datenmodell ändern = Migration mitliefern

Neue oder umbenannte Felder in `workouts`/`sets` (z. B. `extraSets` → `setCounts`) brauchen
denselben Weg, sonst stolpern bestehende Einträge. Vor größeren Umbauten Felix ans
JSON-Backup erinnern.

## Regel 3: Manifest und Icons nie in den Service-Worker-Cache

iOS liest beide beim Hinzufügen zum Home-Bildschirm. Eine veraltete Kopie im Cache führt
zum grauen Platzhalter-Icon. `public/manifest.webmanifest` ist deshalb handgeschrieben,
`workbox.globPatterns` deckt nur js/css/html ab.

## Regel 4: Keine nativen `<select>`, `alert()`, `prompt()`

Safari rendert das native Auswahlmenü in einer Serifenschrift und ignoriert CSS — dafür
gibt es `src/Picker.tsx`. `alert`/`prompt` werden in manchen Umgebungen stillschweigend
blockiert; Meldungen gehören inline in die Oberfläche (`.banner`).

## Regel 5: Töne nur über die Tonspur in `src/signal.ts`

iOS stoppt JavaScript bei gesperrtem Bildschirm. Nie per Timer/Effect „jetzt piepen“ —
stattdessen `scheduleCues()` mit Zeitpunkten aufrufen; daraus wird eine Audiospur mit
eingebauten Tönen. Wiederholte Aufrufe mit denselben Tönen sind ein No-op.

## Testen

- Dev-Server: `preview_start` mit Name `trainings-app` (`.claude/launch.json`, Port 5199).
- Im Browser-Konsolen-Tool Module direkt importieren: `const { db } = await import('/src/db.ts')`
  (ebenso `/src/data.ts`, `/src/logic.ts`). Damit alten Zustand herstellen (Meta-Flag löschen,
  Slot zurücksetzen, ein „gestriges“ Training mit Sätzen anlegen), `location.reload()`, dann auslesen.
- Danach aufräumen: `db.close(); await db.delete(); localStorage.clear()`.
- Deploy prüfen ohne `gh` (nicht installiert): `curl -s https://api.github.com/repos/felixltfn/trainings-app/actions/runs?per_page=1`
  und im Live-Bundle nach einem neuen String greppen.
