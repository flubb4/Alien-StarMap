import { ref, set, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ════════════════════════════════════════════════════════════════
// PANIC ROLL — W-Y NEURO-SYNC bio-monitor reveal
// Roll: D6 + stress − resolve (Alien Evolved Edition, Panic Table p.73)
// Broadcast: session/panicRoll = { id, player, d6, stress, resolve, total, key, ts }
// Auto-effects are written by the triggering client only.
// ════════════════════════════════════════════════════════════════

// sev: calm=green, low=chart yellow, mid=amber, high=rust
const PR_TABLE = [
  { min: -99, max: 1,  key: 'Composed',   label: 'COMPOSED',   sev: 'calm', tip: 'Keeping it together. No effect — for now.' },
  { min: 2,   max: 3,  key: 'Spooked',    label: 'SPOOKED',    sev: 'low',  tip: 'Stress level +1.' },
  { min: 4,   max: 6,  key: 'Noisy',      label: 'NOISY',      sev: 'low',  tip: 'Nearby enemies are alerted to your presence.' },
  { min: 7,   max: 8,  key: 'Twitchy',    label: 'TWITCHY',    sev: 'low',  tip: 'Make an immediate supply roll (air/ammo/power).' },
  { min: 9,   max: 10, key: 'Lose_Item',  label: 'LOSE ITEM',  sev: 'mid',  tip: 'You lose a weapon or important item.' },
  { min: 11,  max: 11, key: 'Paranoid',   label: 'PARANOID',   sev: 'mid',  tip: 'Cannot give or receive help on skill rolls.' },
  { min: 12,  max: 12, key: 'Hesitant',   label: 'HESITANT',   sev: 'mid',  tip: 'Auto #10 initiative card until panic ends.' },
  { min: 13,  max: 13, key: 'Freeze',     label: 'FREEZE',     sev: 'mid',  tip: 'Lose your next turn; no interrupt actions.' },
  { min: 14,  max: 14, key: 'Seek_Cover', label: 'SEEK COVER', sev: 'high', tip: 'Take full cover (interrupt). Stress −1, lose next turn.' },
  { min: 15,  max: 15, key: 'Scream',     label: 'SCREAM',     sev: 'high', tip: 'Lose next turn. Stress −1. Allies in zone roll panic.' },
  { min: 16,  max: 16, key: 'Flee',       label: 'FLEE',       sev: 'high', tip: 'Move to adjacent zone. Stress −1; allies in start zone +1 stress.' },
  { min: 17,  max: 17, key: 'Frenzy',     label: 'FRENZY',     sev: 'high', tip: 'Attack the nearest target until panic ends.' },
  { min: 18,  max: 999,key: 'Catatonic',  label: 'CATATONIC',  sev: 'high', tip: 'You collapse and cannot move until panic ends.' },
];

const PR_COLORS = {  // must match core.css tokens
  calm: '#7fb069',   // --green
  low:  '#d4d168',   // --chart
  mid:  '#ff9a3c',   // --amber
  high: '#c64225',   // --rust
  base: '#7fb069',
};

function prRowFor(total) {
  return PR_TABLE.find(r => total >= r.min && total <= r.max) || PR_TABLE[PR_TABLE.length - 1];
}

// ── Trigger (button in character sheet §07) ───────────────────────
window.prArmOrFire = function(btn, pn) {
  if (btn.classList.contains('armed')) {
    clearTimeout(btn._prT);
    btn.classList.remove('armed');
    btn.textContent = '⚠ PANIC ROLL';
    prFire(pn);
    return;
  }
  btn.classList.add('armed');
  btn.textContent = 'SICHER?';
  btn._prT = setTimeout(() => {
    btn.classList.remove('armed');
    btn.textContent = '⚠ PANIC ROLL';
  }, 3000);
};

function prFire(pn) {
  const data    = (window._csAllSheets && window._csAllSheets[pn]) || {};
  const stress  = parseInt(window._csGet(data, 'stressLevel'))  || 0;
  const resolve = parseInt(window._csGet(data, 'resolve.cur'))  || 0;
  const d6      = 1 + Math.floor(Math.random() * 6);
  const total   = d6 + stress - resolve;
  const row     = prRowFor(total);

  set(ref(window.db, 'session/panicRoll'), {
    id: Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    player: pn, d6, stress, resolve, total, key: row.key, ts: Date.now(),
  });

  // auto-effects — only this (triggering) client writes them
  if (row.key !== 'Composed')  window._csSave(pn, 'panicResp.' + row.key, true);
  if (row.key === 'Spooked')   window._csSave(pn, 'stressLevel', Math.min(10, stress + 1));
  if (row.key === 'Seek_Cover' || row.key === 'Scream' || row.key === 'Flee')
    window._csSave(pn, 'stressLevel', Math.max(0, stress - 1));
}

// ── Shared listener — every client plays the reveal ───────────────
let prSeenFirst = false, prLastId = null;
window._authReadyPromise.then(() => {
  onValue(ref(window.db, 'session/panicRoll'), snap => {
    const ev = snap.val();
    if (!prSeenFirst) { prSeenFirst = true; prLastId = ev && ev.id; return; }
    if (!ev || ev.id === prLastId) return;
    prLastId = ev.id;
    if (Date.now() - (ev.ts || 0) > 60000) return;
    prShow(ev);
  });
});

// Local preview without Firebase broadcast (GM testing / debugging)
window._prPreview = function(total, player) {
  const d6 = Math.min(6, Math.max(1, total ?? 4));
  prShow({ id: 'preview', player: player || window.myName || 'PREVIEW',
           d6, stress: Math.max(0, (total ?? 4) - d6), resolve: 0,
           total: total ?? 4, ts: Date.now() });
};

// ── Heartbeat audio (real sample, no synthesis) ───────────────────
// Loop in assets/audio/pr-heartbeat.mp3 (~100 BPM source); playbackRate
// follows the displayed BPM. Missing file / blocked autoplay fail silently.
const PR_AUDIO_BPM = 100;
let prAudio;
function prAudioStart() {
  if (prAudio === undefined) {
    prAudio = new Audio('assets/audio/pr-heartbeat.mp3');
    prAudio.loop = true;
    prAudio.volume = 0.55;
    try { prAudio.preservesPitch = false; } catch (e) {}
  }
  prAudio.currentTime = 0;
  prAudio.playbackRate = 0.7;
  prAudio.play().catch(() => {});
}
function prAudioRate(bpm) {
  if (!prAudio) return;
  prAudio.playbackRate = Math.max(0.6, Math.min(1.7, bpm / PR_AUDIO_BPM));
}
function prAudioStop() {
  if (prAudio) prAudio.pause();
}

// ── Overlay / animation ───────────────────────────────────────────
let prActive = null;   // { ev, raf, bpmTimer, timers:[], ekg:{...} }

function prWrap() {
  let w = document.getElementById('prWrap');
  if (!w) {
    w = document.createElement('div');
    w.id = 'prWrap';
    document.body.appendChild(w);
  }
  return w;
}

function prEsc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function prShow(ev) {
  if (!window.myName && !window.isGM) return;   // only logged-in session members
  if (prActive) prTeardown(false);   // new event replaces a running one
  const row  = prRowFor(ev.total);
  const wrap = prWrap();

  wrap.innerHTML = `
    <div class="pr-stage sev-${row.sev}" id="prStage">
      <div class="pr-flash"></div>
      <div class="pr-card">
        <div class="pr-head">
          <span class="pr-head-title">W-Y NEURO-SYNC</span>
          <span class="pr-head-dots">···</span>
          <span class="pr-head-crew">CREW: ${prEsc(ev.player).toUpperCase()}</span>
        </div>
        <div class="pr-sub" id="prSub">PSYCH EVAL IN PROGRESS</div>
        <div class="pr-ekg-box">
          <canvas class="pr-ekg" id="prEkg"></canvas>
          <div class="pr-bpm"><span class="pr-bpm-heart">♥</span><span id="prBpmVal">71</span> BPM</div>
        </div>
        <div class="pr-calc" id="prCalc">
          D6 [<span class="pr-d6" id="prD6">?</span>] + STRESS ${ev.stress} − RESOLVE ${ev.resolve}
          <span class="pr-eq" id="prEq">= ${ev.total}</span>
        </div>
        <div class="pr-result">
          <div class="pr-res-label">${row.label}</div>
          <div class="pr-res-tip">${prEsc(row.tip)}</div>
        </div>
        <div class="pr-hint">// ANTIPPEN ZUM SCHLIESSEN</div>
      </div>
    </div>`;

  prActive = { ev, row, raf: 0, timers: [], t0: performance.now(), mode: 'ramp', dismissable: false };
  wrap.className = 'pr-arriving';

  prStartEkg();
  prAudioStart();

  const later = (fn, ms) => prActive.timers.push(setTimeout(fn, ms));

  later(() => { wrap.className = 'pr-ekg-phase'; }, 550);
  later(() => { wrap.className = 'pr-calc-phase'; prSpinD6(ev.d6); }, 2550);
  later(() => { wrap.className = 'pr-glitch'; }, 4050);
  later(() => {
    wrap.className = 'pr-revealed';
    prActive.mode = ({ Catatonic: 'flatline', Frenzy: 'chaos', Composed: 'calmdown' })[row.key] || 'steady';
    const sub = document.getElementById('prSub');
    if (sub) sub.textContent = 'PSYCH EVAL COMPLETE — RESPONSE CLASS ' + Math.max(ev.total, 1);
  }, 4350);
  later(() => {
    prActive.dismissable = true;
    const stage = document.getElementById('prStage');
    if (stage) stage.onclick = prDismiss;
  }, 5350);
}

// D6 digit flickers slot-machine style, then locks
function prSpinD6(finalVal) {
  const el = document.getElementById('prD6');
  if (!el || !prActive) return;
  let n = 0;
  const iv = setInterval(() => {
    n++;
    el.textContent = 1 + Math.floor(Math.random() * 6);
    if (n >= 18) {
      clearInterval(iv);
      el.textContent = finalVal;
      el.classList.add('locked');
      const eq = document.getElementById('prEq');
      if (eq) eq.classList.add('show');
    }
  }, 55);
  prActive.timers.push(iv);
}

function prDismiss() {
  if (!prActive || !prActive.dismissable) return;
  prTeardown(true);
}

function prTeardown(animated) {
  const wrap = prWrap();
  prAudioStop();
  if (prActive) {
    cancelAnimationFrame(prActive.raf);
    prActive.timers.forEach(t => { clearTimeout(t); clearInterval(t); });
  }
  const done = () => { wrap.className = ''; wrap.innerHTML = ''; };
  if (animated) {
    wrap.className = 'pr-closing';
    setTimeout(done, 420);
  } else done();
  prActive = null;
}

// ── EKG canvas ────────────────────────────────────────────────────
function prStartEkg() {
  const cv = document.getElementById('prEkg');
  if (!cv || !prActive) return;
  const ctx = cv.getContext('2d');
  const a   = prActive;
  const sevW = { calm: 0.25, low: 0.5, mid: 0.75, high: 1 }[a.row.sev];
  const bpmTarget = Math.max(72, Math.min(155, 76 + a.ev.total * 5));

  const pts = [];
  let beatT = 0;

  function resize() {
    const r = cv.getBoundingClientRect();
    cv.width = Math.max(2, Math.round(r.width * devicePixelRatio));
    cv.height = Math.max(2, Math.round(r.height * devicePixelRatio));
  }
  resize();

  // one QRS-ish spike shape sampled over beat phase 0..1
  function wave(phase, amp) {
    if (phase < 0.06) return -amp * 0.18 * Math.sin(phase / 0.06 * Math.PI);       // P
    if (phase < 0.10) return  amp * 0.25 * Math.sin((phase - 0.06) / 0.04 * Math.PI);
    if (phase < 0.16) return -amp * Math.sin((phase - 0.10) / 0.06 * Math.PI);     // QRS spike
    if (phase < 0.30) return  amp * 0.30 * Math.sin((phase - 0.16) / 0.14 * Math.PI); // T
    return 0;
  }

  function frame(now) {
    if (!prActive) return;
    const t = (now - a.t0) / 1000;
    const p = Math.min(1, t / 3.8);                    // ramp progress until reveal
    const H = cv.height, W = cv.width, mid = H * 0.56;

    // rhythm speed + amplitude escalate with progress & severity
    let bps, amp, jitter = 0;
    if (a.mode === 'ramp' || a.mode === 'steady') {
      const k = a.mode === 'steady' ? 1 : p;
      bps = (72 + (bpmTarget - 72) * k) / 60;
      amp = H * (0.14 + 0.30 * k * sevW);
      jitter = k * sevW * H * 0.015;
    } else if (a.mode === 'calmdown') {
      bps = 68 / 60; amp = H * 0.14;
    } else if (a.mode === 'flatline') {
      bps = 0; amp = 0; jitter = H * 0.002;
    } else { // chaos
      bps = 2.4; amp = H * 0.42; jitter = H * 0.05;
    }

    // 3 sub-samples per frame so narrow QRS spikes aren't skipped
    const SUB = 3;
    for (let s = 0; s < SUB; s++) {
      beatT += bps / 60 / SUB;                         // beats per frame (~60fps)
      if (beatT >= 1) beatT -= 1;
      pts.push(mid + wave(beatT, amp) + (Math.random() - 0.5) * 2 * jitter);
    }
    const maxPts = Math.floor(W / (2 * devicePixelRatio));
    while (pts.length > maxPts) pts.shift();

    // color follows escalation
    const col = a.mode === 'calmdown' ? PR_COLORS.calm
              : a.mode === 'flatline' ? PR_COLORS.high
              : a.mode === 'chaos'    ? PR_COLORS.high
              : prLerpColor(p * sevW);
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 2 * devicePixelRatio;
    ctx.strokeStyle = col;
    ctx.shadowColor = col;
    ctx.shadowBlur = 6 * devicePixelRatio;
    ctx.beginPath();
    pts.forEach((py, i) => {
      const px = W - (pts.length - i) * 2 * devicePixelRatio;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    });
    ctx.stroke();

    // BPM readout
    const bv = document.getElementById('prBpmVal');
    if (bv) {
      const shown = a.mode === 'flatline' ? 0
                  : a.mode === 'calmdown' ? 68
                  : a.mode === 'chaos'    ? bpmTarget + Math.floor(Math.random() * 9)
                  : Math.round(71 + (bpmTarget - 71) * p);
      bv.textContent = shown;
      a.mode === 'flatline' ? prAudioStop() : prAudioRate(shown);
    }

    a.raf = requestAnimationFrame(frame);
  }
  a.raf = requestAnimationFrame(frame);
}

// green → yellow → amber → rust, k in 0..1
function prLerpColor(k) {
  const stops = [PR_COLORS.calm, PR_COLORS.low, PR_COLORS.mid, PR_COLORS.high];
  const x = Math.max(0, Math.min(0.999, k)) * (stops.length - 1);
  const i = Math.floor(x), f = x - i;
  const c1 = stops[i], c2 = stops[i + 1];
  const hx = c => [1, 3, 5].map(j => parseInt(c.slice(j, j + 2), 16));
  const [r1, g1, b1] = hx(c1), [r2, g2, b2] = hx(c2);
  return `rgb(${Math.round(r1 + (r2 - r1) * f)},${Math.round(g1 + (g2 - g1) * f)},${Math.round(b1 + (b2 - b1) * f)})`;
}
