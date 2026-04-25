# Systeme im Überblick

Alle 12 Systeme der StarMap-App. Pro Eintrag: Zweck, CSS-Datei, JS-Datei (nach Split),
Firebase-Pfade, externe Abhängigkeiten.

---

## 1. Auth + Password Screen

**Zweck:** Zwei-Stufen-Passwortschutz. Spieler sehen die Karte, GM bekommt
alle Steuerungen. Session wird in `localStorage` gespeichert.

- CSS: `core.css` (`.pw-*` Klassen)
- JS: `auth.js` (Phase 4b)
- Globals gesetzt: `isGM`, `myName`
- Firebase: keiner (rein lokal)

---

## 2. Firebase Init

**Zweck:** Firebase-App initialisieren, Anonymous Auth, alle `*Ref`-Globals definieren.

- JS: `firebase-init.js` (Phase 4a) — muss **synchron** (kein `defer`) laden
- Globals gesetzt: `db`, `markersRef`, `initiativeRef`, `usersRef`, u. v. m.

---

## 3. Map Core

**Zweck:** Interaktive Canvas-Sternenkarte. Marker setzen/löschen, Zoom, Pan,
Tooltips, Pings, Reiseroute, Heartbeat für Online-Anzeige.

- CSS: `core.css`
- JS: `map-core.js` (Phase 4c)
- Firebase: `/markers`, `/pings`, `/users/{name}/pos`, `/travelRoute`

---

## 4. Initiative Tracker

**Zweck:** GM teilt Initiative-Karten aus (1–10 + NPCs). 6 Animationsstile wählbar.

| Stil | Name | Beschreibung |
|------|------|--------------|
| 1 | Card Flip | Karten einzeln umdrehen |
| 2 | Transmission | WY-Terminal-Typewriter |
| 3 | Slot Machine | Einarmiger Bandit |
| 4 | Red Alert | Militärische Alert-Tafel |
| 5 | Pick From Table | Spieler wählen selbst eine Karte |
| 6 | Alien Hunt | Duck-Hunt-Minispiel |

- CSS: `initiative.css`
- JS: `initiative.js` (Phase 3a)
- Firebase: `/initiative`

---

## 5. Character Sheet

**Zweck:** GM und Spieler sehen/bearbeiten PC-Stats. Attribute, Skills, Stress,
Panic-Checkboxen, Death-Roll-Boxen, Waffen, Gear, Verletzungen.

- CSS: `character-sheet.css`
- JS: `character-sheet.js` (Phase 3c)
- Firebase: `/characters/{name}`

---

## 6. Provisions Tracker

**Zweck:** Vorrats-Manifest. Drei Kategorien: Luftvorrat, Munition, Energie.
Animated Stockpile-View mit fallenden Icons.

- CSS: `provisions.css`
- JS: `provisions.js` (Phase 3b)
- Firebase: `/provisions`

---

## 7. Supply Roll Panel

**Zweck:** Würfelwürfe für einzelne Ressourcen. Alien-Symbole triggern Verbrauch.

- CSS: `provisions.css` (`.sp-*` Klassen)
- JS: `provisions.js` (Phase 3b, zusammen mit Provisions Tracker)
- Firebase: `/supplyRolls`

---

## 8. Clunkkynoost Trade Terminal

**Zweck:** In-Game-Shop. Spieler kaufen/verkaufen Items mit Campaign-Guthaben.
GM verwaltet Guthaben und Inventar.

- CSS: `provisions.css` (`.shop-*` Klassen)
- JS: wird noch zugeordnet (wahrscheinlich eigene `shop.js` oder in `provisions.js`)
- Firebase: `/shop`

---

## 9. Würfel Dürfel

**Zweck:** 1v1-Würfelspiel mit Lobby, Wettoptionen (Standard/Depletion/Bluff),
Runden-System, Leaderboard, History.

- CSS: `wuerfel-duerfel.css`
- JS: `wuerfel-duerfel.js` (Phase 2b)
- Firebase: `/wuerfelduerfel`

---

## 10. XP Award + Chest Animation

**Zweck:** GM vergibt XP an einzelne oder alle Spieler. Spieler sehen
Weyland-Yutani-Terminal-Animation ("Decrypt XP").

- CSS: `xp.css`
- JS: `xp.js` (Phase 2e)  — Achtung: im Dateiplan heißt die Datei `character-sheet.js`
- Firebase: `/xpAward`

---

## 11. Handout Panel + CRT Overlay

**Zweck:** GM schreibt Text, wählt Empfänger, sendet. Spieler sehen
Typewriter-Effekt auf einer animierten CRT-Monitor-Grafik.

- CSS: `handout.css`
- JS: `handout.js` (Phase 2a — erste JS-Extraktion)
- Firebase: `/handout`

---

## 12. Image Board

**Zweck:** GM lädt Bild hoch (oder URL), Spieler können gemeinsam darauf
zeichnen. Cover-Layer verdeckt das Bild initial; GM deckt auf.
NSFW-Filter (Penischeck, Swastika-Check) eingebaut.

- CSS: `image-board.css`
- JS: `image-board.js` (Phase 2d)
- Firebase: `/ibStrokes`, `/ibRevealStrokes`, `/ibCoverData`

---

## 13. Black Veil Panel

**Zweck:** GM-gesichertes Panel mit Kampagnenfragmenten (Datenfragmente /
geheime Missions-Infos). GM schaltet einzelne Karten frei; Spieler sehen
nur freigeschaltete.

- CSS: `black-veil.css`
- JS: `black-veil.js` (Phase 2c)
- Firebase: `/blackVeil`
