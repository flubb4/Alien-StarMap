# Alien StarMap

Live-Spielerkarte für die Recall-Authority-Kampagne (Alien RPG).  
Firebase Realtime Database — synchronisiert zwischen GM und allen Spielern in Echtzeit.

## Features

| System | GM | Spieler |
|--------|----|---------|
| Interaktive Sternenkarte (Canvas) | Marker setzen/löschen, Intercept-Alarm | Karte ansehen, Reise verfolgen |
| Initiative Tracker | Karten austeilen (6 Animationsstile) | eigene Karte sehen |
| Charakter-Sheet | alle PCs lesen/schreiben | eigenes Sheet |
| Provisions Tracker | Vorräte verwalten | lesen |
| Supply Roll Panel | Würfelwürfe für Ressourcen | eigene Würfe |
| Würfel Dürfel | Würfelspiel starten/moderieren | mitspielen |
| XP Award | XP vergeben mit Chest-Animation | XP empfangen |
| Handout Panel | Texte an Spieler schicken | CRT-Typewriter-Effekt |
| Image Board | Bilder zeichnen/aufdecken | mitzeichnen |
| Black Veil | Fragmente freischalten | freigeschaltete lesen |
| Clunkkynoost Trade Terminal | Guthaben verwalten | kaufen/verkaufen |

## Tech Stack

- Vanilla JS (ES Modules via Firebase CDN, keine Build-Tools)
- Firebase Realtime Database + Anonymous Auth
- Alle Styles in `assets/css/` (9 Dateien), JS folgt in Phases 2–4

## Struktur

```
Alien StarMap/
├── index.html              Haupt-App
├── assets/
│   ├── css/                9 System-CSS-Dateien
│   ├── js/                 System-JS-Dateien (Phase 2–4)
│   └── images/
│       └── starmap.jpg
├── docs/
│   ├── structure.md        Ordner-Layout & Konventionen
│   ├── claude-workflow.md  Token-sparende Session-Patterns
│   ├── systems.md          Alle 12 Systeme im Überblick
│   └── split-plan.md       Migrationsplan CSS→JS-Split
├── scripts/
│   └── encrypt.bat         staticrypt AES-256
├── config.example.js       Passwort-Hash-Template
└── .gitignore
```

## Setup

1. `config.example.js` → `config.js` kopieren und Hashes eintragen:
   ```
   echo -n "deinPasswort" | openssl dgst -sha256
   ```
2. Im Browser öffnen (kein Webserver nötig für lokale Tests ohne Firebase).
3. Für Live-Betrieb: eigene Firebase-Daten in `index.html` → `firebaseConfig` eintragen.

## Split-Status

- [x] Phase 1 — CSS ausgelagert (9 Dateien in `assets/css/`)
- [ ] Phase 2 — Overlay-Systeme (handout, wuerfel-duerfel, black-veil, image-board, xp)
- [ ] Phase 3 — Größere Systeme (initiative, provisions, character-sheet)
- [ ] Phase 4 — Kern (firebase-init, auth, map-core)
