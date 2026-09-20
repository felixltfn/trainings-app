# Trainings-App

Eine Web-App zum Protokollieren von Krafttraining, gebaut als PWA (Progressive Web App): Du legst sie auf dem iPhone auf den Home-Bildschirm und benutzt sie wie eine normale App.

**Alle Daten bleiben auf deinem Gerät.** Kein Konto, kein Server, keine Cloud. Das heißt auch: Wenn du die App vom Home-Bildschirm löschst, sind die Daten weg — deshalb gibt es Backups (siehe unten).

Technik: Vite + React + TypeScript, Dexie.js (IndexedDB) als Datenbank, Recharts für die Diagramme, vite-plugin-pwa für Manifest und Service Worker.

---

## 1. Lokal starten (auf dem Mac)

```bash
npm install
```

```bash
npm run dev
```

Danach zeigt das Terminal eine Adresse wie `http://localhost:5173`. Die im Browser öffnen — fertig. Beim allerersten Start füllt sich die Datenbank automatisch mit deinem Plan (Upper A, Lower, Upper B).

Weitere Befehle:

```bash
npm run build
```

baut die fertige Version in den Ordner `dist/` (und prüft dabei die Typen).

---

## 2. Auf GitHub veröffentlichen (einmalig)

### Schritt 1: Repository anlegen

1. Auf [github.com](https://github.com) einloggen, oben rechts auf **+** → **New repository**.
2. Name z. B. `trainings-app`. Sichtbarkeit: **Private** ist in Ordnung — GitHub Pages funktioniert bei einem kostenlosen Konto allerdings nur mit **Public**. Wenn du dir unsicher bist: **Public** wählen, in der App stehen keine Geheimnisse.
3. Kein README, kein .gitignore ankreuzen (das gibt es hier schon). Auf **Create repository**.

### Schritt 2: Diesen Ordner hochladen

GitHub zeigt dir nach dem Anlegen die Adresse des Repositories. Im Terminal in diesem Ordner:

```bash
git remote add origin https://github.com/DEIN-NAME/trainings-app.git
```

```bash
git branch -M main && git push -u origin main
```

`DEIN-NAME` durch deinen GitHub-Benutzernamen ersetzen. Beim ersten Push fragt Git nach Benutzername und Passwort — als Passwort brauchst du einen *Personal Access Token* (GitHub → Settings → Developer settings → Personal access tokens), oder du meldest dich vorher mit der GitHub-App/`gh auth login` an.

### Schritt 3: GitHub Pages einschalten

1. Im Repository auf **Settings** (oben rechts im Repo-Menü).
2. Links auf **Pages**.
3. Bei **Build and deployment → Source** den Punkt **GitHub Actions** auswählen. Sonst nichts einstellen.

Das war's: Der Workflow in `.github/workflows/deploy.yml` baut die App bei jedem Push auf `main` und veröffentlicht sie.

### Schritt 4: Warten und Adresse holen

1. Im Repository auf **Actions**. Dort läuft „Deploy to GitHub Pages" (grüner Haken = fertig, dauert ein bis zwei Minuten).
2. Die Adresse steht danach unter **Settings → Pages** ganz oben und sieht so aus:
   `https://DEIN-NAME.github.io/trainings-app/`

Ab jetzt gilt: Änderungen committen und pushen → nach ein paar Minuten ist die neue Version online.

---

## 3. Aufs iPhone holen

> **Wichtig:** Safari und die App auf dem Home-Bildschirm haben **getrennte Speicher**. Was du in Safari einträgst, taucht in der Home-Bildschirm-App **nicht** auf. Trag deshalb erst Daten ein, **nachdem** du die App zum Home-Bildschirm hinzugefügt hast.

1. **Safari** auf dem iPhone öffnen (nicht Chrome — nur Safari kann das).
2. Die Adresse aus Schritt 4 eingeben.
3. Unten auf das **Teilen-Symbol** (Quadrat mit Pfeil nach oben).
4. Nach unten scrollen zu **Zum Home-Bildschirm**.
5. Namen bestätigen → **Hinzufügen**.
6. Die App vom **Home-Bildschirm** starten (nicht mehr über Safari) und erst dann anfangen einzutragen.

Die App läuft danach auch ohne Internet. Eine neue Version holt sie sich automatisch, wenn du online bist und die App neu startest.

---

## 4. Backup: exportieren und wiederherstellen

Die Daten liegen nur auf dem iPhone. Ein iPhone-Backup über iCloud sichert sie zwar mit, aber verlass dich nicht darauf — exportier lieber regelmäßig. Die App erinnert dich, wenn der letzte Export mehr als 14 Tage her ist.

### Exportieren

1. Tab **Plan** → **Backup exportieren (JSON)**.
2. Auf dem iPhone öffnet sich das Teilen-Menü: Sichern in Dateien, per AirDrop auf den Mac, in iCloud Drive legen oder an dich selbst mailen.
3. Am Mac lädt der Browser die Datei stattdessen direkt herunter (`training-backup-JJJJ-MM-TT.json`).

### Wiederherstellen

1. Tab **Plan** → **Backup importieren**.
2. Die JSON-Datei auswählen.
3. Sicherheitsabfrage bestätigen.

**Achtung:** Der Import **ersetzt alle Daten** auf dem Gerät durch den Inhalt der Datei. Er ergänzt sie nicht.

---

## 5. Wie die App aufgebaut ist

Plan und Protokoll sind getrennt: Der Plan sagt, was du tun willst, das Protokoll, was du getan hast. So bleiben alte Trainings auswertbar, auch wenn du den Plan änderst.

| Datei | Inhalt |
| --- | --- |
| `src/db.ts` | Datenbank-Tabellen und ihre Felder |
| `src/seed.ts` | Dein Plan als Startdaten (nur beim allerersten Start) |
| `src/logic.ts` | Rechnen und Formatieren (1RM, harte Sätze, Progression, Datumsformate) |
| `src/data.ts` | Datenbank-Abfragen (letzte Einheit, Training starten, Planversion kopieren) |
| `src/stats.ts` | Auswertungen für Tagesansicht und Statistik |
| `src/backup.ts` | Export und Import |
| `src/stretchRun.ts` | Ablauf des Dehnens: Schritte bauen, Zeit nachrechnen, Zustand sichern |
| `src/screens/` | Die Bildschirme: Start, Training, Kalender, Statistik, Plan, Dehnen |

**Startseite:** zeigt den nächsten Trainingstag, die Wochen-Streak (wie viele Wochen in Folge du dreimal trainiert hast — eine Woche mit weniger als drei Trainings setzt sie zurück, die laufende Woche zählt erst ab dem dritten Training), die laufende Woche und das letzte Training.

**Trainingszeit:** wird vom ersten bis zum letzten eingetragenen Satz gemessen, nicht vom Öffnen der App. Aufwärmen vor dem ersten Satz zählt also nicht mit.

**Tabellen:** `exercises` (Übungen — jede genau einmal), `planVersions` (Mesozyklen), `templates` (Trainingstage), `slots` (Positionen im Trainingstag mit Standardübung, Alternativen, Sätzen, Wiederholungsbereich, RIR, Pause), `workouts` (durchgeführte Einheiten), `sets` (einzelne Sätze), `meta` (Kleinkram wie das Datum des letzten Backups).

**Neuer Mesozyklus:** Plan → Planversionen → „+ Kopie". Das kopiert Trainingstage und Slots in eine neue Version, die du frei änderst. Alte Trainings zeigen weiter die Werte, mit denen du sie gemacht hast.

---

## 6. Wenn etwas nicht klappt

| Problem | Ursache und Lösung |
| --- | --- |
| Nach dem Deploy nur eine weiße Seite | `Settings → Pages → Source` steht nicht auf **GitHub Actions**, oder der Workflow ist noch nicht durchgelaufen (siehe Tab **Actions**). |
| Auf dem iPhone fehlen Daten, die du in Safari eingetragen hast | Getrennte Speicher (siehe Abschnitt 3). Die Daten stehen noch in Safari — dort exportieren und in der Home-Bildschirm-App importieren. |
| Neue Version erscheint nicht | App komplett schließen (App-Umschalter, nach oben wischen) und mit Internetverbindung neu starten. |
| Der Pausentimer scheint zu schnell zu laufen | Er rechnet absichtlich mit Uhrzeiten, nicht mit einem Zähler — nach dem Entsperren zeigt er die tatsächlich vergangene Zeit. |
