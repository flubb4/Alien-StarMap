// ── M08 Memory Integration — Firebase Sync ─────────────────────────────────
// GM-Trigger öffnet das iframe-Modal bei allen Clients. Iframe ↔ Parent über
// postMessage, Parent ↔ Firebase per onValue/update.
//
//  Firebase Pfad:  session/puzzle/m08-mi
//    .active       → bool (Modal sichtbar?)
//    .ts           → Trigger-Timestamp (für Re-Trigger nach lokalem Close)
//    .triggeredBy  → GM-Name
//    .state        → Full Puzzle State Snapshot (synct mit GM-iframe)
//    .orders       → { playerName: ['personal','medical','security'] } (Player-Votes)

import { ref, set, update, onValue, remove } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const MI_PATH = 'session/puzzle/m08-mi';
const miRef = () => ref(window.db, MI_PATH);
const miOrdersRef = () => ref(window.db, MI_PATH + '/orders');

let miLastTs = 0;
let miDismissed = false;
let miLastAppliedHash = '';
let miLastSnapState = null;
let miLastOrders = null;

// ── GM: Modal für alle öffnen ─────────────────────────────────────────────
window.openM08MiPuzzle = function() {
  if (!window.isGM) { console.warn('[M08MI] only GM can open'); return; }
  if (!window.db) { console.error('[M08MI] window.db missing'); return; }
  set(miRef(), {
    active: true,
    ts: Date.now(),
    triggeredBy: window.myName || 'GM',
    state: null,
    orders: null
  }).then(() => console.log('[M08MI] open trigger written'))
    .catch(err => console.error('[M08MI] open failed:', err));
};

// ── GM/Player: Modal lokal schließen ──────────────────────────────────────
window.closeM08MiPuzzle = function() {
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

// ── postMessage bridge: iframe → parent ───────────────────────────────────
window.addEventListener('message', e => {
  const m = e.data;
  if (!m || typeof m !== 'object') return;

  if (m.type === 'm08mi-ready') {
    sendCurrentStateToIframe();
    return;
  }

  if (m.type === 'm08mi-state' && m.snap) {
    if (m.role === 'gm' && window.isGM) {
      // Orders aus dem GM-Snap entfernen — die leben separat (top-level)
      const snapForWrite = Object.assign({}, m.snap);
      delete snapForWrite.orders;
      const h = quickHash(snapForWrite);
      if (h === miLastAppliedHash) return;
      miLastAppliedHash = h;
      update(miRef(), { state: snapForWrite })
        .catch(err => console.warn('[M08MI] state write failed:', err));
    }
    return;
  }

  if (m.type === 'm08mi-order' && m.name && Array.isArray(m.order)) {
    // Jeder Spieler schreibt nur seinen eigenen Eintrag
    update(miOrdersRef(), { [m.name]: m.order })
      .catch(err => console.warn('[M08MI] order write failed:', err));
    return;
  }

  if (m.type === 'm08mi-order-clear' && m.name) {
    remove(ref(window.db, MI_PATH + '/orders/' + m.name))
      .catch(err => console.warn('[M08MI] order clear failed:', err));
    return;
  }

  if (m.type === 'm08mi-clear-orders') {
    if (!window.isGM) return;
    remove(miOrdersRef())
      .catch(err => console.warn('[M08MI] orders clear failed:', err));
    return;
  }
});

function sendCurrentStateToIframe() {
  const iframe = document.getElementById('m08MiFrame');
  if (!iframe || !iframe.contentWindow) return;
  if (miLastSnapState) {
    const merged = Object.assign({}, miLastSnapState, { orders: miLastOrders || {} });
    try {
      iframe.contentWindow.postMessage({ type: 'm08mi-apply', snap: merged }, '*');
    } catch (e) {}
  }
}

// ── Watcher ───────────────────────────────────────────────────────────────
window.startM08MiWatcher = function() {
  console.log('[M08MI] startM08MiWatcher() called. isGM=', window.isGM);
  if (!window.db) {
    setTimeout(() => window.startM08MiWatcher(), 500);
    return;
  }
  onValue(miRef(), snap => {
    const data = snap.val();
    if (!data || !data.active) {
      miDismissed = false;
      miLastTs = 0;
      miLastSnapState = null;
      miLastOrders = null;
      miLastAppliedHash = '';
      hideLocalModal();
      return;
    }
    if (data.ts && data.ts !== miLastTs) {
      miLastTs = data.ts;
      miDismissed = false;
    }
    if (miDismissed) return;

    const ov = document.getElementById('m08MiOverlay');
    if (ov && ov.style.display !== 'flex') showLocalModal();

    miLastOrders = data.orders || {};

    if (data.state) {
      miLastSnapState = data.state;
      const h = quickHash({ s: data.state, o: miLastOrders });
      if (window.isGM && h === miLastAppliedHash) return;
      miLastAppliedHash = h;
      const merged = Object.assign({}, data.state, { orders: miLastOrders });
      const iframe = document.getElementById('m08MiFrame');
      if (iframe && iframe.contentWindow) {
        try {
          iframe.contentWindow.postMessage({ type: 'm08mi-apply', snap: merged }, '*');
        } catch (e) {}
      }
    } else {
      // State noch nicht geschrieben — Orders trotzdem reichen
      const iframe = document.getElementById('m08MiFrame');
      if (iframe && iframe.contentWindow) {
        try {
          iframe.contentWindow.postMessage({ type: 'm08mi-apply', snap: { orders: miLastOrders } }, '*');
        } catch (e) {}
      }
    }
  });
};

function quickHash(obj) {
  try {
    const s = JSON.stringify(obj);
    let h = 0;
    for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
    return String(h);
  } catch (e) { return ''; }
}

// ── ESC schließt ─────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  const ov = document.getElementById('m08MiOverlay');
  if (e.key === 'Escape' && ov && ov.style.display === 'flex') {
    window.closeM08MiPuzzle();
  }
});

console.log('[M08MI] sync module loaded');
