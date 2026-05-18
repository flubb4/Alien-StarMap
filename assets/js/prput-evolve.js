import { ref, set, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ── PR-PUT EVOLUTION CINEMATIC ───────────────────────────────────────────────
// Schematic-style disassemble/reassemble animation.
// GM triggers via window.triggerPrputEvolve(); all logged-in clients play it.

var peRef     = ref(window.db, 'session/cinematic');
var peLastTs  = 0;
var peTimers  = [];
var peRunning = false;

var IMG_OLD = 'assets/images/prput-original.png';
var IMG_NEW = 'assets/images/prput-modified.png';

function peClearTimers() {
  peTimers.forEach(function (t) { clearTimeout(t); });
  peTimers = [];
}
function peAfter(ms, fn) {
  var t = setTimeout(fn, ms);
  peTimers.push(t);
  return t;
}

// ── Shard generation ─────────────────────────────────────────────────────────
// 3x3 grid. Each shard is clip-pathed to its cell of the source image and
// gets randomized destination offsets for the shatter animation.
function peBuildShards(containerId, imgUrl) {
  var c = document.getElementById(containerId);
  if (!c) return;
  c.innerHTML = '';
  var GRID = 3;
  for (var r = 0; r < GRID; r++) {
    for (var col = 0; col < GRID; col++) {
      var s = document.createElement('div');
      s.className = 'pe-shard';
      var x1 = (col / GRID) * 100, y1 = (r / GRID) * 100;
      var x2 = ((col + 1) / GRID) * 100, y2 = ((r + 1) / GRID) * 100;
      s.style.clipPath = 'polygon(' + x1 + '% ' + y1 + '%,' + x2 + '% ' + y1 + '%,' + x2 + '% ' + y2 + '%,' + x1 + '% ' + y2 + '%)';
      s.style.backgroundImage = 'url("' + imgUrl + '")';
      // Destination: vector from center of grid, with randomness
      var cx = col - 1, cy = r - 1; // -1, 0, 1
      var mag = 220 + Math.random() * 100;
      var jitter = (Math.random() - 0.5) * 60;
      var dx = cx === 0 ? jitter : cx * mag + jitter;
      var dy = cy === 0 ? jitter : cy * mag + jitter;
      var rot = (Math.random() - 0.5) * 60;
      var delay = Math.round(Math.random() * 220);
      s.style.setProperty('--dx', dx + 'px');
      s.style.setProperty('--dy', dy + 'px');
      s.style.setProperty('--rot', rot + 'deg');
      s.style.setProperty('--delay', delay + 'ms');
      c.appendChild(s);
    }
  }
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

// ── HUD line helpers ─────────────────────────────────────────────────────────
function peResetHud() {
  document.querySelectorAll('#peHud .pe-hud-line').forEach(function (el) {
    el.classList.remove('visible');
  });
}
function peRevealLine(id, delayMs) {
  peAfter(delayMs, function () {
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.add('visible');
    var box = el.parentElement;
    if (box) box.scrollTop = box.scrollHeight;
  });
}

// ── Animation sequence ───────────────────────────────────────────────────────
// Phases & timing (ms from start):
//   0     boot         old shards fade in, blueprint look
//   500   scan-old     scan line sweeps, callouts pop, baseline log
//   2400  shatter-old  old shards explode, callouts go DEPRECATED
//   3900  compose      empty stage, new component list lights up center
//   6400  shatter-new  new shards fly in from scattered → assembled
//   8000  scan-new     scan line over new schematic
//   9000  reveal       blueprint filter dissolves to real colors, stamp
//   10300 done         skip→close, dismiss hints
function peShow() {
  if (peRunning) peClose(true);
  peRunning = true;

  var overlay  = document.getElementById('prputEvolveOverlay');
  var stage    = document.getElementById('peStage');
  var skipBtn  = document.getElementById('peSkipBtn');
  var closeBtn = document.getElementById('peCloseBtn');
  var hint     = document.getElementById('peFooterHint');

  // Build fresh shards (randomized each play)
  peBuildShards('peShatterOld', IMG_OLD);
  peBuildShards('peShatterNew', IMG_NEW);

  peResetHud();
  closeBtn.classList.add('hidden');
  skipBtn.classList.remove('hidden');
  hint.classList.remove('visible');

  stage.dataset.phase = 'idle';
  overlay.classList.add('open');

  // Phase: boot
  peAfter(60, function () { stage.dataset.phase = 'boot'; });
  peRevealLine('peLine1', 200);

  // Phase: scan-old
  peAfter(500, function () { stage.dataset.phase = 'scan-old'; });
  peRevealLine('peLine2', 700);
  peRevealLine('peLine3', 1400);

  // Phase: shatter-old
  peAfter(2400, function () { stage.dataset.phase = 'shatter-old'; });
  peRevealLine('peLine4', 2500);

  // Phase: compose
  peAfter(3900, function () { stage.dataset.phase = 'compose'; });
  peRevealLine('peLine5', 4000);
  peRevealLine('peLine6', 4700);
  peRevealLine('peLine7', 5400);

  // Phase: shatter-new
  peAfter(6400, function () { stage.dataset.phase = 'shatter-new'; });
  peRevealLine('peLine8', 6500);

  // Phase: scan-new
  peAfter(8000, function () { stage.dataset.phase = 'scan-new'; });
  peRevealLine('peLine9', 8200);

  // Phase: reveal
  peAfter(9700, function () { stage.dataset.phase = 'reveal'; });
  peRevealLine('peLine10', 10100);

  // Done
  peAfter(11000, function () {
    skipBtn.classList.add('hidden');
    closeBtn.classList.remove('hidden');
    hint.classList.add('visible');
    peRunning = false;
  });
}

// Skip jumps to final state
window.peSkip = function () {
  peClearTimers();
  var stage    = document.getElementById('peStage');
  var skipBtn  = document.getElementById('peSkipBtn');
  var closeBtn = document.getElementById('peCloseBtn');
  var hint     = document.getElementById('peFooterHint');

  // Ensure new shards exist (in case skip pressed during boot)
  if (!document.querySelector('#peShatterNew .pe-shard')) {
    peBuildShards('peShatterNew', IMG_NEW);
  }
  stage.dataset.phase = 'reveal';
  document.querySelectorAll('#peHud .pe-hud-line').forEach(function (el) {
    el.classList.add('visible');
  });
  var box = document.querySelector('#peHud .pe-hud-lines');
  if (box) box.scrollTop = box.scrollHeight;
  skipBtn.classList.add('hidden');
  closeBtn.classList.remove('hidden');
  hint.classList.add('visible');
  peRunning = false;
};

window.peClose = function () {
  peClearTimers();
  var overlay = document.getElementById('prputEvolveOverlay');
  var stage   = document.getElementById('peStage');
  overlay.classList.remove('open');
  stage.dataset.phase = 'idle';
  peResetHud();
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
