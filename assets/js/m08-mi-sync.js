// ── M08 Memory Integration — Firebase Sync (logic-grid model) ─────────────────
// GM-Trigger öffnet das iframe-Modal bei allen Clients. Das Puzzle ist ein
// Logik-Gitter: Fragmente + Sektoren den vier Bänken zuordnen. Jeder Spieler darf
// jede Zuordnung schalten — kein GM-Flaschenhals.
//
//  Firebase Pfad:  session/puzzle/m08-mi
//    .active       → bool (Modal sichtbar?)
//    .ts           → Trigger-Timestamp
//    .triggeredBy  → GM-Name
//    .state        → { banks:[{frag,sector}…], attempts:N, solved:bool }
//
//  iframe → parent:  m08mi-ready              → aktuellen Stand anfordern
//                    m08mi-set {state}         → neuen geteilten Zustand schreiben
//  parent → iframe:  m08mi-apply {state}       → Zustand anwenden

import { ref, set, update, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const MI_PATH = 'session/puzzle/m08-mi';
const miRef = () => ref(window.db, MI_PATH);
const miStateRef = () => ref(window.db, MI_PATH + '/state');

const EMPTY_STATE = () => ({ banks: [ {frag:null,sector:null}, {frag:null,sector:null}, {frag:null,sector:null}, {frag:null,sector:null} ], attempts: 0, solved: false });

let miLastTs = 0;
let miDismissed = false;
let miLastState = null;

// ── GM: Modal für alle öffnen ─────────────────────────────────────────────────
window.openM08MiPuzzle = function () {
  if (!window.isGM) { console.warn('[M08MI] only GM can open'); return; }
  if (!window.db) { console.error('[M08MI] window.db missing'); return; }
  set(miRef(), {
    active: true,
    ts: Date.now(),
    triggeredBy: window.myName || 'GM',
    state: EMPTY_STATE()
  }).then(() => console.log('[M08MI] open trigger written'))
    .catch(err => console.error('[M08MI] open failed:', err));
};

// ── GM: für alle schließen / Spieler: lokal ───────────────────────────────────
window.closeM08MiPuzzle = function () {
  miDismissed = true;
  hideLocalModal();
  if (window.isGM) {
    update(miRef(), { active: false }).catch(err => console.warn('[M08MI] close write failed:', err));
  }
};

function showLocalModal() {
  const ov = document.getElementById('m08MiOverlay');
  const iframe = document.getElementById('m08MiFrame');
  if (!ov || !iframe) return;
  const role = window.isGM ? 'gm' : 'player';
  const nameParam = window.myName ? '&name=' + encodeURIComponent(window.myName) : '';
  iframe.src = 'puzzles/m08-memory-integration.html?role=' + role + nameParam + '&t=' + Date.now();
  ov.style.display = 'flex';
  setTimeout(() => { try { iframe.contentWindow.focus(); } catch (e) {} }, 200);
}

function hideLocalModal() {
  const ov = document.getElementById('m08MiOverlay');
  const iframe = document.getElementById('m08MiFrame');
  if (!ov || !iframe) return;
  ov.style.display = 'none';
  iframe.src = 'about:blank';
}

// ── postMessage bridge: iframe → parent ───────────────────────────────────────
window.addEventListener('message', e => {
  const m = e.data;
  if (!m || typeof m !== 'object') return;

  if (m.type === 'm08mi-ready') {
    pushStateToIframe();
    return;
  }
  if (m.type === 'm08mi-set' && m.state && typeof m.state === 'object') {
    const src = Array.isArray(m.state.banks) ? m.state.banks : [];
    const banks = [];
    for (let i = 0; i < 4; i++) {
      const b = src[i] || {};
      banks.push({ frag: b.frag || null, sector: b.sector || null });
    }
    const clean = {
      banks,
      attempts: typeof m.state.attempts === 'number' ? m.state.attempts : 0,
      solved: !!m.state.solved
    };
    // flash ({n}) mitschreiben, damit alle Clients die rote Umrandung sehen;
    // bei Reset/Änderung fehlt es → Firebase entfernt den Knoten → Umrandung verschwindet überall
    if (m.state.flash && typeof m.state.flash === 'object') {
      clean.flash = { n: typeof m.state.flash.n === 'number' ? m.state.flash.n : 0 };
    }
    set(miStateRef(), clean).catch(err => console.warn('[M08MI] state write failed:', err));
    return;
  }
});

function pushStateToIframe() {
  const iframe = document.getElementById('m08MiFrame');
  if (!iframe || !iframe.contentWindow) return;
  try {
    iframe.contentWindow.postMessage({ type: 'm08mi-apply', state: miLastState || EMPTY_STATE() }, '*');
  } catch (e) {}
}

// ── Watcher ────────────────────────────────────────────────────────────────────
window.startM08MiWatcher = function () {
  console.log('[M08MI] startM08MiWatcher() called. isGM=', window.isGM);
  if (!window.db) { setTimeout(() => window.startM08MiWatcher(), 500); return; }
  onValue(miRef(), snap => {
    const data = snap.val();
    if (!data || !data.active) {
      miDismissed = false; miLastTs = 0; miLastState = null;
      hideLocalModal();
      return;
    }
    if (data.ts && data.ts !== miLastTs) { miLastTs = data.ts; miDismissed = false; }
    if (miDismissed) return;

    const ov = document.getElementById('m08MiOverlay');
    if (ov && ov.style.display !== 'flex') showLocalModal();

    miLastState = data.state || EMPTY_STATE();
    const iframe = document.getElementById('m08MiFrame');
    if (iframe && iframe.contentWindow) {
      try { iframe.contentWindow.postMessage({ type: 'm08mi-apply', state: miLastState }, '*'); } catch (e) {}
    }
  });
};

// ── ESC schließt ───────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  const ov = document.getElementById('m08MiOverlay');
  if (e.key === 'Escape' && ov && ov.style.display === 'flex') window.closeM08MiPuzzle();
});

console.log('[M08MI] sync module loaded (logic-grid model)');
