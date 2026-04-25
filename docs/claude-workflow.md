# Claude-Workflow

Wie dieses Repo mit Claude Code effizient bearbeitet wird.

## Grundprinzip

Nach dem Split (Phase 1–4) liest Claude nur die 1–2 Dateien, die er wirklich braucht.
Statt 9.962 Zeilen `index.html` pro Anfrage nur noch einige hundert.

**Erwartete Einsparung nach vollständigem Split: 85–95 %.**

## Session-Patterns

### Pattern A — CSS eines Systems ändern

```
Datei öffnen: assets/css/<system>.css
```

Beispiel: CRT-Overlay-Farbe anpassen → nur `assets/css/handout.css` (247 Zeilen).

### Pattern B — JS-Bug in einem Overlay-System

```
Datei öffnen: assets/js/<system>.js
              assets/css/<system>.css  (falls UI-relevant)
```

Beispiel: Würfel-Dürfel-Betting-Bug → nur `assets/js/wuerfel-duerfel.js`.

### Pattern C — Firebase-Pfade oder Globals nachschlagen

```
Datei öffnen: assets/js/firebase-init.js   (alle Ref-Definitionen)
              assets/js/auth.js             (isGM, myName, Session-State)
```

### Pattern D — Map-System (Canvas, Marker, Travel, Zoom)

```
Datei öffnen: assets/js/map-core.js
              assets/css/core.css  (falls Layout-Bug)
```

### Pattern E — Neues System / großer Refactor

```
Datei öffnen: docs/systems.md      (Überblick, Abhängigkeiten)
              docs/structure.md    (Konventionen)
              + betroffene Datei
```

## Dateigrößen nach Phase 4 (Richtwerte)

| Datei | Zeilen |
|-------|--------|
| `index.html` | ~200 |
| `assets/css/core.css` | ~470 |
| `assets/css/initiative.css` | ~560 |
| `assets/css/provisions.css` | ~750 |
| `assets/js/wuerfel-duerfel.js` | ~935 |
| `assets/js/initiative.js` | ~660 |
| `assets/js/map-core.js` | ~380 |
| Alle anderen | < 300 |

## Token-sparende Gewohnheiten

- `Grep`-Tool statt `Read` wenn nur eine Stelle gesucht wird
- `Edit`-Tool statt `Write` für Änderungen (nur Diff gesendet)
- Nie `index.html` öffnen außer um HTML-Gerüst zu ändern
- Firebase-Refs nicht aus dem Kopf — `firebase-init.js` lesen
- Zeilennummern aus dem Split-Plan sind Schätzungen; echte Grenzen
  durch Kommentare wie `// ── END HANDOUT ──` im Code finden

## Wichtige Globals (nach Phase 4)

| Variable | Definiert in | Bedeutung |
|----------|-------------|-----------|
| `db` | `firebase-init.js` | Firebase Database-Instanz |
| `isGM` | `auth.js` | boolean, GM-Modus |
| `myName` | `auth.js` | Spielername (localStorage) |
| `markersRef` | `firebase-init.js` | Firebase-Ref für Marker |
| `initiativeRef` | `firebase-init.js` | Firebase-Ref für Initiative |
| `usersRef` | `firebase-init.js` | Firebase-Ref für Online-Spieler |

Alle Globals laufen über `window.*` — kein ES-Modul-System.
