// ── M08 Fragmented Power — Firebase Sync (sequence model) ─────────────────────
// GM-Trigger öffnet das iframe-Modal bei allen Clients. Das Puzzle ist eine
// Zünd-Sequenz: jeder Spieler darf Kerne antippen — kein GM-Flaschenhals.
//
//  Firebase Pfad:  session/puzzle/m08-fp
//    .active       → bool (Modal sichtbar?)
//    .ts           → Trigger-Timestamp (Re-Trigger nach lokalem Close)
//    .triggeredBy  → GM-Name
//    .state        → { progress:[coreId,…], faults:N }  (geteilter Rätselzustand)
//
//  iframe → parent:  m08fp-ready              → aktuellen Stand anfordern
//                    m08fp-set {state}         → neuen geteilten Zustand schreiben
//  parent → iframe:  m08fp-apply {state}       → Zustand anwenden

import { ref, set, update, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const FP_PATH = 'session/puzzle/m08-fp';
const fpRef = () => ref(window.db, FP_PATH);
const fpStateRef = () => ref(window.db, FP_PATH + '/state');

let fpLastTs = 0;
let fpDismissed = false;
let fpLastState = null;

// ── GM: Modal für alle öffnen ─────────────────────────────────────────────────
window.openM08FpPuzzle = function () {
  if (!window.isGM) { console.warn('[M08FP] only GM can open'); return; }
  if (!window.db) { console.error('[M08FP] window.db missing'); return; }
  set(fpRef(), {
    active: true,
    ts: Date.now(),
    triggeredBy: window.myName || 'GM',
    state: { progress: [], faults: 0 }
  }).then(() => console.log('[M08FP] open trigger written'))
    .catch(err => console.error('[M08FP] open failed:', err));
};

// ── GM: für alle schließen / Spieler: lokal ───────────────────────────────────
window.closeM08FpPuzzle = function () {
  fpDismissed = true;
  hideLocalModal();
  if (window.isGM) {
    update(fpRef(), { active: false }).catch(err => console.warn('[M08FP] close write failed:', err));
  }
};

function showLocalModal() {
  const ov = document.getElementById('m08FpOverlay');
  const iframe = document.getElementById('m08FpFrame');
  if (!ov || !iframe) return;
  const role = window.isGM ? 'gm' : 'player';
  const nameParam = window.myName ? '&name=' + encodeURIComponent(window.myName) : '';
  iframe.src = 'puzzles/m08-fragmented-power.html?role=' + role + nameParam + '&t=' + Date.now();
  ov.style.display = 'flex';
  setTimeout(() => { try { iframe.contentWindow.focus(); } catch (e) {} }, 200);
}

function hideLocalModal() {
  const ov = document.getElementById('m08FpOverlay');
  const iframe = document.getElementById('m08FpFrame');
  if (!ov || !iframe) return;
  ov.style.display = 'none';
  iframe.src = 'about:blank';
}

// ── postMessage bridge: iframe → parent ───────────────────────────────────────
window.addEventListener('message', e => {
  const m = e.data;
  if (!m || typeof m !== 'object') return;

  if (m.type === 'm08fp-ready') {
    pushStateToIframe();
    return;
  }
  if (m.type === 'm08fp-set' && m.state && typeof m.state === 'object') {
    const clean = {
      progress: Array.isArray(m.state.progress) ? m.state.progress : [],
      faults: typeof m.state.faults === 'number' ? m.state.faults : 0
    };
    set(fpStateRef(), clean).catch(err => console.warn('[M08FP] state write failed:', err));
    return;
  }
});

function pushStateToIframe() {
  const iframe = document.getElementById('m08FpFrame');
  if (!iframe || !iframe.contentWindow) return;
  try {
    iframe.contentWindow.postMessage({ type: 'm08fp-apply', state: fpLastState || { progress: [], faults: 0 } }, '*');
  } catch (e) {}
}

// ── Watcher ────────────────────────────────────────────────────────────────────
window.startM08FpWatcher = function () {
  console.log('[M08FP] startM08FpWatcher() called. isGM=', window.isGM);
  if (!window.db) { setTimeout(() => window.startM08FpWatcher(), 500); return; }
  onValue(fpRef(), snap => {
    const data = snap.val();
    if (!data || !data.active) {
      fpDismissed = false; fpLastTs = 0; fpLastState = null;
      hideLocalModal();
      return;
    }
    if (data.ts && data.ts !== fpLastTs) { fpLastTs = data.ts; fpDismissed = false; }
    if (fpDismissed) return;

    const ov = document.getElementById('m08FpOverlay');
    if (ov && ov.style.display !== 'flex') showLocalModal();

    fpLastState = data.state || { progress: [], faults: 0 };
    const iframe = document.getElementById('m08FpFrame');
    if (iframe && iframe.contentWindow) {
      try { iframe.contentWindow.postMessage({ type: 'm08fp-apply', state: fpLastState }, '*'); } catch (e) {}
    }
  });
};

// ── ESC schließt ───────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  const ov = document.getElementById('m08FpOverlay');
  if (e.key === 'Escape' && ov && ov.style.display === 'flex') window.closeM08FpPuzzle();
});

console.log('[M08FP] sync module loaded (sequence model)');
