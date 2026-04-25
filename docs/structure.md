# Struktur des Repos

## Top-Level

```
Alien StarMap/
├── index.html              Haupt-App (Gerüst + HTML-Overlays)
├── README.md
│
├── assets/
│   ├── css/                ein File pro System (Phase 1 ✓)
│   │   ├── core.css        Layout, Header, Sidebar, Map, Modal, Auth, Ping
│   │   ├── initiative.css  Overlay + 6 Animationsstile
│   │   ├── character-sheet.css
│   │   ├── provisions.css  Supply Roll + Clunkkynoost + Provisions Tracker
│   │   ├── wuerfel-duerfel.css
│   │   ├── xp.css
│   │   ├── handout.css     GM-Panel + CRT-Overlay
│   │   ├── image-board.css
│   │   └── black-veil.css
│   ├── js/                 ein File pro System (Phase 2–4)
│   │   ├── firebase-init.js   SYNC laden (kein defer), alle Refs
│   │   ├── auth.js
│   │   ├── map-core.js
│   │   ├── initiative.js
│   │   ├── character-sheet.js
│   │   ├── provisions.js
│   │   ├── wuerfel-duerfel.js
│   │   ├── handout.js
│   │   ├── image-board.js
│   │   └── black-veil.js
│   └── images/
│       └── starmap.jpg     Sternenkarten-Hintergrundbild
│
├── docs/
│   ├── structure.md        diese Datei
│   ├── claude-workflow.md  Session-Patterns, Token-Tipps
│   ├── systems.md          Alle Systeme im Überblick
│   └── split-plan.md       Migrationsplan (Referenz)
│
├── scripts/
│   └── encrypt.bat         staticrypt AES-256 für GitHub Pages
│
├── config.example.js       Template für config.js (gitignored)
└── .gitignore
```

## Ladestrategie in index.html (nach Phase 4)

```html
<!-- Im <head> — alle CSS parallel -->
<link rel="stylesheet" href="assets/css/core.css">
...

<!-- Vor </body> — firebase-init SYNC, alles andere defer -->
<script src="assets/js/firebase-init.js"></script>
<script defer src="assets/js/auth.js"></script>
<script defer src="assets/js/map-core.js"></script>
...
```

`firebase-init.js` muss **synchron** (kein `defer`) geladen werden, da alle anderen
Skripte `db`, `auth` und die `*Ref`-Variablen als Globals erwarten.

## Regeln

- **Kein Inline-CSS** in `index.html` — nur `<link>`-Tags auf `assets/css/`.
- **Kein ES-Modul-System** — globaler `window`-Scope, einfache `<script src="">` Tags.
- **Globale Variablen** (`isGM`, `myName`, `db`, `markersRef` usw.) bleiben als `window.*`.
- **config.js** nie committen — Passwort-Hashes sind Secrets.
- **Dateinamen:** kleinbuchstaben, Bindestriche, keine Umlaute.

## Was NICHT ins Repo gehört

- `config.js` (Passwort-Hashes)
- Verschlüsselte Build-Outputs
- Persönliche GM-Notizen außerhalb dieser Docs
