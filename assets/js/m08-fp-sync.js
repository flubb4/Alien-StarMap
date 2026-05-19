// ── M08 Fragmented Power — Firebase Sync ──────────────────────────────────────
// GM startet via Button im RÄTSEL-Submenu → setzt active=true auf Firebase.
// Watcher öffnet das iframe-Modal bei allen eingeloggten Clients.
// Schließt jeder GM oder Spieler lokal: nur lokal. GM kann via Close-Button
// (oder Re-Klick im Submenu) das Modal für alle nochmal triggern.

import { ref, set, update, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const M08FP_PATH = 'session/puzzle/m08-fp';
const m08FpRef = () => ref(window.db, M08FP_PATH);

let m08FpLastTs = 0;     // letzter empfangener Trigger-Timestamp
let m08FpDismissed = false; // lokal weggeklickt → solange kein neuer Trigger kommt, bleibt's zu

// ── GM: Modal für alle öffnen ──────────────────────────────────────────────────
window.openM08FpPuzzle = function() {
  if (!window.isGM) {
    // Spieler kann nicht selbst öffnen — falls Funktion versehentlich gerufen wird
    return;
  }
  set(m08FpRef(), {
    active: true,
    ts: Date.now(),
    triggeredBy: window.myName || 'GM'
  });
};

// ── GM oder Spieler: Modal nur LOKAL schließen ────────────────────────────────
// GM-Klick auf Close beendet auch die Firebase-Session, damit niemand das Asset
// behalten muss. Spieler-Klick schließt nur lokal.
window.closeM08FpPuzzle = function() {
  m08FpDismissed = true;
  hideLocalModal();
  if (window.isGM) {
    update(m08FpRef(), { active: false });
  }
};

function showLocalModal() {
  const ov = document.getElementById('m08FpOverlay');
  const iframe = document.getElementById('m08FpFrame');
  if (!ov || !iframe) return;
  // Frischer Reload bei jedem Open-Event (cache-bust per ts)
  iframe.src = 'puzzles/m08-fragmented-power.html?t=' + Date.now();
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

// ── Watcher ───────────────────────────────────────────────────────────────────
window.startM08FpWatcher = function() {
  onValue(m08FpRef(), snap => {
    const data = snap.val();
    if (!data || !data.active) {
      m08FpDismissed = false;
      m08FpLastTs = 0;
      hideLocalModal();
      return;
    }
    // Neuer Trigger? → reset dismissed-Flag und Modal aufmachen
    if (data.ts && data.ts !== m08FpLastTs) {
      m08FpLastTs = data.ts;
      m08FpDismissed = false;
    }
    if (m08FpDismissed) return;
    showLocalModal();
  });
};

// ESC schließt Modal (nur outer-Fokus, iframe-Fokus wird vom Browser geschluckt)
document.addEventListener('keydown', e => {
  const ov = document.getElementById('m08FpOverlay');
  if (e.key === 'Escape' && ov && ov.style.display === 'flex') {
    window.closeM08FpPuzzle();
  }
});
