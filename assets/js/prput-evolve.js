import { ref, set, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ── PR-PUT EVOLUTION CINEMATIC ───────────────────────────────────────────────
// GM triggers via window.triggerPrputEvolve(); all logged-in clients play the
// animation. Pattern mirrors handout.js: Firebase ref + ts-gated watcher.

var peRef       = ref(window.db, 'session/cinematic');
var peLastTs    = 0;
var peTimers    = [];
var peRunning   = false;

function peClearTimers() {
  peTimers.forEach(function(t) { clearTimeout(t); });
  peTimers = [];
}
function peAfter(ms, fn) {
  var t = setTimeout(fn, ms);
  peTimers.push(t);
  return t;
}

// ── GM trigger ───────────────────────────────────────────────────────────────
window.triggerPrputEvolve = function () {
  if (!window.isGM) return;
  if (!window._authReadyPromise) return;
  window._authReadyPromise.then(function () {
    set(peRef, { type: 'prput-evolve', ts: Date.now() }).catch(function (err) {
      console.error('[prput-evolve] Firebase set failed:', err);
    });
  });
};

// ── Player watcher ───────────────────────────────────────────────────────────
window.startPrputEvolveWatcher = function () {
  peLastTs = Date.now();
  onValue(peRef, function (snap) {
    var data = snap.val();
    if (!data || !data.ts || data.ts <= peLastTs) return;
    if (data.type !== 'prput-evolve') return;
    peLastTs = data.ts;
    peShow();
  });
};

// ── Animation sequence ───────────────────────────────────────────────────────
function peShow() {
  if (peRunning) peClose(true); // restart cleanly if re-fired
  peRunning = true;

  var overlay = document.getElementById('prputEvolveOverlay');
  var stage   = document.getElementById('peStage');
  var hud     = document.getElementById('peHud');
  var skipBtn = document.getElementById('peSkipBtn');
  var closeBtn= document.getElementById('peCloseBtn');
  var hint    = document.getElementById('peFooterHint');

  // Reset HUD lines
  document.querySelectorAll('#peHud .pe-hud-line').forEach(function (el) {
    el.classList.remove('visible');
  });
  hud.removeAttribute('data-show-progress');
  closeBtn.classList.add('hidden');
  skipBtn.classList.remove('hidden');
  hint.classList.remove('visible');

  overlay.classList.add('open');

  // Phase 1: baseline (old) — 1.5s
  stage.dataset.phase = 'old';
  peRevealLine('peLine1', 200);

  // Phase 2: glitch transition — starts 1.6s in, lasts 2.2s
  peAfter(1600, function () {
    stage.dataset.phase = 'glitch';
    hud.setAttribute('data-show-progress', '1');
    peRevealLine('peLine2', 0);
    peRevealLine('peLine3', 600);
    peRevealLine('peLine4', 1200);
  });

  // Phase 3: new — 3.8s in
  peAfter(3800, function () {
    stage.dataset.phase = 'new';
    hud.removeAttribute('data-show-progress');
    peRevealLine('peLine5', 200);
    peRevealLine('peLine6', 700);
    peRevealLine('peLine7', 1200);
    peRevealLine('peLine8', 1700);
  });

  // Phase 4: ready for dismiss — 5.8s in
  peAfter(5800, function () {
    skipBtn.classList.add('hidden');
    closeBtn.classList.remove('hidden');
    hint.classList.add('visible');
    peRunning = false;
  });
}

function peRevealLine(id, delayMs) {
  peAfter(delayMs, function () {
    var el = document.getElementById(id);
    if (el) el.classList.add('visible');
  });
}

// Skip jumps to final state
window.peSkip = function () {
  peClearTimers();
  var stage   = document.getElementById('peStage');
  var hud     = document.getElementById('peHud');
  var skipBtn = document.getElementById('peSkipBtn');
  var closeBtn= document.getElementById('peCloseBtn');
  var hint    = document.getElementById('peFooterHint');

  stage.dataset.phase = 'new';
  hud.removeAttribute('data-show-progress');
  document.querySelectorAll('#peHud .pe-hud-line').forEach(function (el) {
    el.classList.add('visible');
  });
  skipBtn.classList.add('hidden');
  closeBtn.classList.remove('hidden');
  hint.classList.add('visible');
  peRunning = false;
};

window.peClose = function (silent) {
  peClearTimers();
  var overlay = document.getElementById('prputEvolveOverlay');
  var stage   = document.getElementById('peStage');
  overlay.classList.remove('open');
  stage.dataset.phase = 'old';
  document.querySelectorAll('#peHud .pe-hud-line').forEach(function (el) {
    el.classList.remove('visible');
  });
  document.getElementById('peHud').removeAttribute('data-show-progress');
  peRunning = false;
};

// Keyboard: ESC skips during play; any key dismisses when done
document.addEventListener('keydown', function (e) {
  var overlay = document.getElementById('prputEvolveOverlay');
  if (!overlay || !overlay.classList.contains('open')) return;
  if (peRunning) {
    if (e.key === 'Escape') window.peSkip();
    return;
  }
  window.peClose();
});

// Backdrop click dismisses (only when finished)
document.addEventListener('DOMContentLoaded', function () {
  var ov = document.getElementById('prputEvolveOverlay');
  if (ov) ov.addEventListener('click', function (e) {
    if (e.target !== this) return;
    if (!peRunning) window.peClose();
  });
});

// ── END PR-PUT EVOLUTION ─────────────────────────────────────────────────────
