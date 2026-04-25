# Projektplan: Star Map — Multi-File Split

## Kontext

Die Datei `index.html` war ursprünglich **9.962 Zeilen / ~470 KB** groß und enthielt 12 klar
abgrenzbare Systeme. Ziel ist es, CSS und JS in separate Dateien aufzuteilen — für bessere
Performance und massive Token-Ersparnis bei zukünftigen Claude-Sessions.

Das Projekt läuft jetzt in `C:\Users\Daniel\Desktop\Alien\Alien StarMap\` (eigenes Git-Repo).
Die `index.html` ist die Live-Spieler-Karte mit Firebase-Multiplayer (Alien RPG Starmap-Tool).

---

## Systeme in index.html

| System | Typ | Geschätzte Größe |
|--------|-----|-----------------|
| Core Layout CSS | CSS | ~300 Zeilen |
| Initiative Overlay (6 Stile) | CSS + JS | ~1.800 Zeilen |
| Character Sheet | CSS + JS | ~700 Zeilen |
| Provisions Tracker + Supply Roll | CSS + JS | ~1.200 Zeilen |
| Würfel Dürfel (Dice-Minigame) | CSS + JS | ~900 Zeilen |
| XP Award + Chest Animation | CSS + JS | ~300 Zeilen |
| Handout Panel + CRT Overlay | CSS + JS | ~400 Zeilen |
| Image Board (Draw/Reveal) | CSS + JS | ~700 Zeilen |
| Black Veil Panel | CSS + JS | ~250 Zeilen |
| Auth + Password Screen | CSS + JS | ~300 Zeilen |
| Firebase Init (Config, Refs) | JS | ~100 Zeilen |
| Map Core (Canvas, Markers, Travel) | JS | ~600 Zeilen |

---

## Zielstruktur

```
C:\Users\Daniel\Desktop\Alien\Claude Code\
├── index.html                  ← ~200 Zeilen (nur Gerüst + HTML-Overlays + <link>/<script>-Tags)
├── assets/
│   ├── css/
│   │   ├── core.css            ← Layout, Header, Sidebar, Map, Modal, Statusbar, Zoom
│   │   ├── initiative.css      ← Alle 6 Initiative-Stile (inkl. Alien Hunt)
│   │   ├── character-sheet.css ← Character Sheet Overlay + XP Chest/Transmission
│   │   ├── provisions.css      ← Provisions Tracker + Supply Roll Panel
│   │   ├── wuerfel-duerfel.css ← Würfel Dürfel Dice Game
│   │   ├── xp.css              ← XP Award Overlay
│   │   ├── handout.css         ← GM Handout Panel + CRT Monitor Overlay
│   │   ├── image-board.css     ← Image Board Overlay
│   │   └── black-veil.css      ← Black Veil Panel
│   └── js/
│       ├── firebase-init.js    ← Firebase config, initializeApp, db, auth, alle Refs
│       ├── auth.js             ← checkPassword, _doLogin, Session State, localStorage
│       ├── map-core.js         ← Canvas draw, Markers CRUD, Zoom, Pings, Travel, Heartbeat
│       ├── initiative.js       ← renderInitiative + alle 6 Style-Renderer (Transmission,
│       │                          CardFlip, SlotMachine, RedAlert, AlienHunt etc.)
│       ├── character-sheet.js  ← _csRender, _csSave, XP Award, Online Player Tracking
│       ├── provisions.js       ← Provisions Tracker + Supply Roll (spRoll, spWatch etc.)
│       ├── wuerfel-duerfel.js  ← komplettes Würfel-Dürfel-System (Lobby, Betting, Roll,
│       │                          Reveal, Gameover, Leaderboard)
│       ├── handout.js          ← openHandoutPanel, sendHandout, crtShow, crtSkip, crtClose
│       ├── image-board.js      ← Drawing, Reveal strokes, Cover image, NSFW-Check
│       └── black-veil.js       ← BV-Panel, bvToggleFragment, Firebase-Listener
```

---

## Ladestrategie in index.html

```html
<!-- Im <head> — alle CSS parallel -->
<link rel="stylesheet" href="assets/css/core.css">
<link rel="stylesheet" href="assets/css/initiative.css">
<link rel="stylesheet" href="assets/css/character-sheet.css">
<link rel="stylesheet" href="assets/css/provisions.css">
<link rel="stylesheet" href="assets/css/wuerfel-duerfel.css">
<link rel="stylesheet" href="assets/css/xp.css">
<link rel="stylesheet" href="assets/css/handout.css">
<link rel="stylesheet" href="assets/css/image-board.css">
<link rel="stylesheet" href="assets/css/black-veil.css">

<!-- Vor </body> — firebase-init sync, alles andere defer -->
<script src="assets/js/firebase-init.js"></script>           <!-- SYNC: alles hängt davon ab -->
<script defer src="assets/js/auth.js"></script>
<script defer src="assets/js/map-core.js"></script>
<script defer src="assets/js/initiative.js"></script>
<script defer src="assets/js/character-sheet.js"></script>
<script defer src="assets/js/provisions.js"></script>
<script defer src="assets/js/wuerfel-duerfel.js"></script>
<script defer src="assets/js/handout.js"></script>
<script defer src="assets/js/image-board.js"></script>
<script defer src="assets/js/black-veil.js"></script>
```

**Wichtig:** Kein ES-Modul-System, keine Build-Tools. Alle JS-Dateien laufen im globalen
`window`-Scope — bestehende Globals (`isGM`, `myName`, `db`, `markersRef` usw.) bleiben
als `window.*` erhalten. Kein Refactoring nötig, kein Risiko für Breaking Changes.

---

## Migrationsreihenfolge (einfachstes zuerst)

### Phase 1 — CSS auslagern (kein Funktionsrisiko)
Alle `<style>`-Blöcke aus index.html in externe `.css`-Dateien verschieben.
`index.html` bekommt nur noch `<link>`-Tags.
**Test:** Seite laden, prüfen ob Design noch stimmt.

Erkennungsmerkmale der CSS-Blöcke in index.html:
- Beginnen mit `/* ══` oder `/* ──` Kommentaren
- Initiativ-Stile erkennbar an: `/* ═══════════════ STYLE 6: ALIEN HUNT`
- CRT-Bereich: `/* ── CRT HANDOUT OVERLAY (player-side) ── */` ca. Zeile 2508
- Provisions: großer Block mit `.prov-*` Klassen ca. Zeile ~1444

### Phase 2 — Isolierte Overlay-Systeme (in dieser Reihenfolge)

**2a. handout.js** (einfachste Einheit, gut kommentiert)
- Funktionen: `openHandoutPanel`, `closeHandoutPanel`, `hoPopulatePlayers`,
  `hoToggleAll`, `sendHandout`, `startHandoutWatcher`, `crtShow`, `crtSkip`, `crtClose`
- Braucht: `db` (global via firebase-init), `isGM`, `myName` (global via auth)
- JS-Bereich ca. Zeilen 8569–8743

**2b. wuerfel-duerfel.js** (komplett eigenständig)
- Alle `window.wdXxx`-Funktionen + interne `renderWD*`-Funktionen
- Braucht: `db`, `isGM`, `myName`
- JS-Bereich ca. Zeilen 6954–7889

**2c. black-veil.js** (eigenständig)
- Funktionen: `openBVPanel`, `closeBVPanel`, `bvToggleFragment`, `bvRenderCards`,
  `bvRenderToggles`, `bvInitFirebase`, `bvGMAuth`
- Braucht: `db`, `isGM`
- JS-Bereich ca. Zeilen 6782–6960

**2d. image-board.js** (eigenständig, komplex)
- Alle `ib*`-Funktionen + `openImageBoard`, `closeImageBoard`, `clearImageBoard`
- Braucht: `db`, `ibStrokesRef`, `ibRevealStrokesRef`, `ibCoverDataRef` (alle global)
- JS-Bereich ca. Zeilen 7894–8567
- NSFW-Check-Funktionen (`ibCheckForPenis`, `ibSwastikaCheck`) ebenfalls drin

**2e. xp.js** (klein)
- Funktionen: `openXPAward`, `closeXPAward`, `_xpaRender`, `applyXPAward`,
  `startXPChestWatcher`, `xpcShow`, `xpcOpen`, `xpcDismiss`
- Braucht: `db`, `isGM`, `myName`
- JS-Bereich ca. Zeilen 6333–6510

### Phase 3 — Größere abhängige Systeme

**3a. initiative.js**
- `renderInitiative` + alle 6 Style-Renderer:
  `renderTransmission`, `renderCardFlip`, `renderSlotMachine`, `renderRedAlert`,
  `renderAlienHunt`, `stopAlienHunt`, `openInitiative`, `closeInitiative`,
  `dealInitiative`, `clearInitiative`, `nextInitiativeRound`
- Braucht: `db`, `isGM`, `myName`, `initiativeRef`
- JS-Bereich ca. Zeilen 3842–4500+

**3b. provisions.js**
- Provisions Tracker: alle `prov*`-Funktionen
- Supply Roll Panel: `openSupplyPanel`, `closeSupplyPanel`, `spRoll`, `spWatch`,
  `spRenderItems`, `spAddItem`, `spDelete`
- Braucht: `db`, `isGM`, `myName`
- JS-Bereiche: Supply Roll ca. 8743–8992, Provisions ca. 8992–9385

**3c. character-sheet.js**
- `_csRender`, `_csSave`, `_csDB`, online player tracking
- Braucht: `db`, `isGM`, `myName`, `usersRef`
- JS-Bereich ca. Zeilen 6313–6782

### Phase 4 — Kern (letzter Schritt, risikoreichster)

**4a. firebase-init.js**
- `firebaseConfig`-Objekt, `initializeApp`, `getDatabase`, `getAuth`
- Alle `const ...Ref = ref(db, '...')` Definitionen
- Anonymous auth setup
- Ca. Zeilen 3429–3465

**4b. auth.js**
- `PASSWORD_HASH`, `GM_PASSWORD_HASH` (aus `CFG`)
- `checkPassword`, `_doLogin`, `colorFromName`
- localStorage-Persistenz
- Ca. Zeilen 3281–3429

**4c. map-core.js**
- Alles rund um Canvas: `draw`, `drawMarker`, `resize`, `fitMap`, `flashSync`
- View/Zoom: `zoomBy`, `resetView`, `screenToMap`, `mapToScreen`
- Markers CRUD: `openModal`, `confirmMarker`, `cancelMarker`, `updateSidebar`,
  `focusMarker`, `deleteMarker`
- Heartbeat + Pings: `heartbeat`, `sendPing`, `showPing`
- Travel system
- Ca. Zeilen 3465–3842

---

## Token-Ersparnis nach dem Split

| Aufgabe | Heute | Nach Split |
|---------|-------|-----------|
| CRT Overlay ändern | 9.962 Zeilen lesen | ~380 Zeilen (`handout.css` + `handout.js`) |
| Initiative-Stil hinzufügen | 9.962 Zeilen lesen | ~900 Zeilen (`initiative.js` + `initiative.css`) |
| Würfel Dürfel bugfix | 9.962 Zeilen lesen | ~900 Zeilen (`wuerfel-duerfel.js`) |
| Marker-System anfassen | 9.962 Zeilen lesen | ~600 Zeilen (`map-core.js`) |
| Handout senden debuggen | 9.962 Zeilen lesen | ~400 Zeilen (`handout.js`) |

**Erwartete Einsparung pro Session: 85–95 % der gelesenen Zeilen.**

---

## Hinweise für den ausführenden Claude

1. **Immer eine Phase komplett abschließen** bevor die nächste beginnt.
2. **Nach jeder Phase testen:** `index.html` im Browser öffnen, alle Overlays einmal
   aufrufen, Firebase-Verbindung prüfen.
3. **Keine ES-Module verwenden** — einfache `<script src="">` Tags, globaler Scope.
4. **Reihenfolge der `<script defer>`-Tags** muss `firebase-init.js` immer zuerst haben
   (als einziger sync-Script), dann `auth.js`, dann `map-core.js`, dann alles andere.
5. **Zeilennummern im Plan sind Schätzungen** — die tatsächlichen Grenzen durch
   Kommentare wie `// ── END HANDOUT SYSTEM ──` in index.html finden.
6. **Git-Commit nach jeder Phase** damit Rollback möglich ist.
7. Die `assets/js/` und `assets/css/` Verzeichnisse müssen erst angelegt werden —
   sie existieren noch nicht (Stand: 2026-04-25).

---

## Status

- [x] Phase 1 — CSS auslagern
- [x] Phase 2a — handout.js
- [x] Phase 2b — wuerfel-duerfel.js
- [x] Phase 2c — black-veil.js
- [x] Phase 2d — image-board.js
- [x] Phase 2e — xp.js
- [x] Phase 3a — initiative.js
- [x] Phase 3b — provisions.js
- [x] Phase 3c — character-sheet.js
- [ ] Phase 4a — firebase-init.js ← DEPRIORITIZED (main module ~600 Zeilen, genug)
- [ ] Phase 4b — auth.js          ← DEPRIORITIZED
- [ ] Phase 4c — map-core.js      ← DEPRIORITIZED

**Stand 2026-04-25:** Phasen 1–3c abgeschlossen. index.html von 9.962 auf ~1.430 Zeilen
reduziert (−86%). Phase 4 zurückgestellt — cross-dependencies zwischen firebase-init/auth/
map-core sind zu dicht für risikofreie Extraktion. Restlicher Monolith ist handhabbar.
