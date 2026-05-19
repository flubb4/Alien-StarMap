// ── M08 Fragmented Power — Firebase Sync ──────────────────────────────────────
// GM-Trigger öffnet das iframe-Modal bei allen Clients. Iframe ↔ Parent über
// postMessage, Parent ↔ Firebase per onValue/update.
//
//  Firebase Pfad:  session/puzzle/m08-fp
//    .active       → bool (Modal sichtbar?)
//    .ts           → Trigger-Timestamp (für Re-Trigger nach lokalem Close)
//    .triggeredBy  → GM-Name
//    .state        → Full Puzzle State Snapshot (synct mit GM-iframe)
//
//  GM-iframe sendet `m08fp-state` mit aktuellem Snapshot → wir schreiben zu
//  Firebase.state. Watcher empfängt Updates und schickt `m08fp-apply` an alle
//  iframes (auch GM, was harmlos ist weil identisch).

import { ref, set, update, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const M08FP_PATH = 'session/puzzle/m08-fp';
const m08FpRef = () => ref(window.db, M08FP_PATH);
const m08FpStateRef = () => ref(window.db, M08FP_PATH + '/state');

let m08FpLastTs = 0;
let m08FpDismissed = false;
let m08FpLastAppliedHash = '';

// ── GM: Modal für alle öffnen ──────────────────────────────────────────────────
window.openM08FpPuzzle = function() {
  if (!window.isGM) { console.warn('[M08FP] only GM can open'); return; }
  if (!window.db) { console.error('[M08FP] window.db missing'); return; }
  // Wir resetten state beim Trigger — frische Session
  set(m08FpRef(), {
    active: true,
    ts: Date.now(),
    triggeredBy: window.myName || 'GM',
    state: null
  }).then(() => console.log('[M08FP] open trigger written'))
    .catch(err => console.error('[M08FP] open failed:', err));
};

// ── GM: Modal für alle schließen / Spieler: lokal ─────────────────────────────
window.closeM08FpPuzzle = function() {
  m08FpDismissed = true;
  hideLocalModal();
  if (window.isGM) {
    update(m08FpRef(), { active: false }).catch(err => console.warn('[M08FP] close write failed:', err));
  }
};

function showLocalModal() {
  const ov = document.getElementById('m08FpOverlay');
  const iframe = document.getElementById('m08FpFrame');
  if (!ov || !iframe) return;
  const role = window.isGM ? 'gm' : 'player';
  iframe.src = 'puzzles/m08-fragmented-power.html?role=' + role + '&t=' + Date.now();
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

// ── postMessage bridge: iframe → parent ──────────────────────────────────────
window.addEventListener('message', e => {
  const m = e.data;
  if (!m || typeof m !== 'object') return;

  if (m.type === 'm08fp-ready') {
    // iframe sagt: ich bin geladen, schick mir den aktuellen Stand
    sendCurrentStateToIframe();
    return;
  }
  if (m.type === 'm08fp-state' && m.snap) {
    // nur der GM darf Updates senden — wir verifizieren über role
    if (m.role === 'gm' && window.isGM) {
      // Hash vergleichen, vermeidet redundante Firebase-Writes
      const h = quickHash(m.snap);
      if (h === m08FpLastAppliedHash) return;
      m08FpLastAppliedHash = h;
      update(m08FpRef(), { state: m.snap })
        .catch(err => console.warn('[M08FP] state write failed:', err));
    }
  }
});

function sendCurrentStateToIframe() {
  const iframe = document.getElementById('m08FpFrame');
  if (!iframe || !iframe.contentWindow) return;
  // Letzten bekannten state vom letzten Firebase-Snapshot ist in
  // m08FpLastSnapState gespeichert — siehe Watcher.
  if (m08FpLastSnapState) {
    try {
      iframe.contentWindow.postMessage({type:'m08fp-apply', snap: m08FpLastSnapState}, '*');
    } catch(e) {}
  }
}

let m08FpLastSnapState = null;

// ── Watcher ──────────────────────────────────────────────────────────────────
window.startM08FpWatcher = function() {
  console.log('[M08FP] startM08FpWatcher() called. isGM=', window.isGM);
  if (!window.db) {
    setTimeout(() => window.startM08FpWatcher(), 500);
    return;
  }
  onValue(m08FpRef(), snap => {
    const data = snap.val();
    if (!data || !data.active) {
      m08FpDismissed = false;
      m08FpLastTs = 0;
      m08FpLastSnapState = null;
      m08FpLastAppliedHash = '';
      hideLocalModal();
      return;
    }
    // Neuer Trigger → Modal wieder öffnen (auch nach lokalem Close)
    if (data.ts && data.ts !== m08FpLastTs) {
      m08FpLastTs = data.ts;
      m08FpDismissed = false;
    }
    if (m08FpDismissed) return;

    // Modal anzeigen falls noch nicht offen
    const ov = document.getElementById('m08FpOverlay');
    if (ov && ov.style.display !== 'flex') showLocalModal();

    // State an iframe weitergeben
    if (data.state) {
      m08FpLastSnapState = data.state;
      const h = quickHash(data.state);
      // Bei GM: nicht zurückschicken wenn's vom GM selbst kommt (Echo-Schutz)
      if (window.isGM && h === m08FpLastAppliedHash) return;
      m08FpLastAppliedHash = h;
      const iframe = document.getElementById('m08FpFrame');
      if (iframe && iframe.contentWindow) {
        try {
          iframe.contentWindow.postMessage({type:'m08fp-apply', snap: data.state}, '*');
        } catch(e) {}
      }
    }
  });
};

// ── kleiner String-Hash für Echo-Vergleich ───────────────────────────────────
function quickHash(obj) {
  try {
    const s = JSON.stringify(obj);
    let h = 0;
    for (let i = 0; i < s.length; i++) { h = ((h<<5)-h) + s.charCodeAt(i); h |= 0; }
    return String(h);
  } catch(e) { return ''; }
}

// ── ESC schließt ─────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  const ov = document.getElementById('m08FpOverlay');
  if (e.key === 'Escape' && ov && ov.style.display === 'flex') {
    window.closeM08FpPuzzle();
  }
});

console.log('[M08FP] sync module loaded');
