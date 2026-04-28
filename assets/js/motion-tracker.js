// ============================================================
// MOTION TRACKER (image board)
// Players place a 90° cone on a tactical map; the GM drops blips
// inside any active cone. Blips render only as polar sector hints
// (slice × distance band) — never as exact points. Atmospheric,
// classic Alien tracker feel. Auto-expire after ~9 s.
//
// Loads after image-board.js. Hooks into the IB canvas via
// window.mtHandleClick(e), called from ibPointerDown.
// ============================================================

import {
  ref, set, remove, onValue
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ── Config ────────────────────────────────────────────────────
const MT_FOV       = Math.PI / 2;          // 90° cone (total)
const MT_HALF_FOV  = MT_FOV / 2;
const MT_RANGE     = 0.20;                 // 20% of min(image w/h)
const MT_SLICES    = 3;                    // angular slices per cone
const MT_BANDS     = 4;                    // distance bands per cone
const MT_BLIP_TTL  = 9000;                 // visible lifetime (ms)
const MT_BLIP_RM   = 12000;                // hard remove from DB (ms)
const MT_SWEEP_MS  = 2200;                 // cone sweep period (ms)

// ── Module state ──────────────────────────────────────────────
let mtTrackers   = {};
let mtBlips      = {};
let mtMode       = null;       // null | 'placing' | 'aiming' | 'blip'
let mtPending    = null;       // {nx,ny} during aiming phase
let mtCursor     = { x: 0, y: 0 };
let mtRafId      = null;
let mtListeners  = [];
let mtRunning    = false;
let mtKeyHandler = null;
let mtMoveHandler = null;

// ── Public lifecycle ──────────────────────────────────────────
window.mtStart = function() {
  if (mtRunning) return;
  mtRunning = true;
  mtAttachListeners();
  mtAttachInput();
  mtUpdateButtons();
  mtUpdateHint();
  mtLoop();
};

window.mtStop = function() {
  if (!mtRunning) return;
  mtRunning = false;
  mtMode = null;
  mtPending = null;
  mtListeners.forEach(u => { try { u(); } catch (e) {} });
  mtListeners = [];
  if (mtRafId) cancelAnimationFrame(mtRafId);
  mtRafId = null;
  mtTrackers = {};
  mtBlips = {};
  if (mtKeyHandler) { document.removeEventListener('keydown', mtKeyHandler); mtKeyHandler = null; }
  if (mtMoveHandler) {
    const wrap = document.getElementById('ibCanvasWrap');
    if (wrap) wrap.removeEventListener('mousemove', mtMoveHandler);
    mtMoveHandler = null;
  }
  mtUpdateButtons();
  mtUpdateHint();
  mtClearCanvas();
};

// Wipe everything (used by ib clear / new image / new cover)
window.mtClearAll = function() {
  remove(window.mtTrackersRef);
  remove(window.mtBlipsRef);
};

// ── Button handlers ───────────────────────────────────────────
window.mtToggleTrackerPlacement = function() {
  if (mtMode === 'placing' || mtMode === 'aiming') {
    mtMode = null; mtPending = null;
  } else if (mtTrackers[window.myId]) {
    // Player already has a tracker — clicking again removes it.
    remove(ref(window.db, 'session/imageBoard/motionTrackers/' + window.myId));
    mtMode = null; mtPending = null;
  } else {
    mtMode = 'placing'; mtPending = null;
  }
  mtUpdateButtons();
  mtUpdateHint();
};

window.mtToggleBlipMode = function() {
  if (!window.isGM) return;
  mtMode = (mtMode === 'blip') ? null : 'blip';
  mtPending = null;
  mtUpdateButtons();
  mtUpdateHint();
};

// Called from image-board.js ibPointerDown — return true = consumed.
window.mtHandleClick = function(e) {
  if (!mtMode) return false;
  const c = document.getElementById('ibCanvas');
  if (!c || !window.ibToNorm) return false;
  const rect = c.getBoundingClientRect();
  const cx = (e.touches && e.touches[0]) ? e.touches[0].clientX : e.clientX;
  const cy = (e.touches && e.touches[0]) ? e.touches[0].clientY : e.clientY;
  const px = cx - rect.left;
  const py = cy - rect.top;
  const norm = window.ibToNorm(px, py);
  if (!norm) return true;

  if (mtMode === 'placing') {
    mtPending = { nx: norm.nx, ny: norm.ny };
    mtCursor.x = px; mtCursor.y = py;
    mtMode = 'aiming';
    mtUpdateHint();
    return true;
  }

  if (mtMode === 'aiming' && mtPending) {
    const dx = norm.nx - mtPending.nx;
    const dy = norm.ny - mtPending.ny;
    if (dx === 0 && dy === 0) return true;
    const angle = Math.atan2(dy, dx);
    const id = window.myId;
    const tracker = {
      id,
      ownerId: window.myId,
      ownerName: window.myName,
      color: window.colorFromName(window.myName),
      nx: mtPending.nx,
      ny: mtPending.ny,
      angle,
      range: MT_RANGE,
      ts: Date.now()
    };
    set(ref(window.db, 'session/imageBoard/motionTrackers/' + id), tracker);
    mtPending = null;
    mtMode = null;
    mtUpdateButtons();
    mtUpdateHint();
    return true;
  }

  if (mtMode === 'blip' && window.isGM) {
    const id = 'b_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const blip = { id, nx: norm.nx, ny: norm.ny, ts: Date.now() };
    set(ref(window.db, 'session/imageBoard/motionBlips/' + id), blip);
    setTimeout(() => {
      remove(ref(window.db, 'session/imageBoard/motionBlips/' + id));
    }, MT_BLIP_RM);
    return true;
  }

  return false;
};

// ── Listeners & input ─────────────────────────────────────────
function mtAttachListeners() {
  mtListeners.push(onValue(window.mtTrackersRef, snap => {
    mtTrackers = snap.val() || {};
    mtUpdateButtons();
  }));
  mtListeners.push(onValue(window.mtBlipsRef, snap => {
    mtBlips = snap.val() || {};
  }));
}

function mtAttachInput() {
  const wrap = document.getElementById('ibCanvasWrap');
  if (wrap) {
    mtMoveHandler = e => {
      const rect = wrap.getBoundingClientRect();
      mtCursor.x = e.clientX - rect.left;
      mtCursor.y = e.clientY - rect.top;
    };
    wrap.addEventListener('mousemove', mtMoveHandler);
  }
  mtKeyHandler = e => {
    if (e.key === 'Escape' && mtMode) {
      mtMode = null;
      mtPending = null;
      mtUpdateButtons();
      mtUpdateHint();
    }
  };
  document.addEventListener('keydown', mtKeyHandler);
}

// ── UI helpers ────────────────────────────────────────────────
function mtUpdateButtons() {
  const tBtn = document.getElementById('mtTrackerBtn');
  const bBtn = document.getElementById('mtBlipBtn');
  if (tBtn) {
    const hasMine = !!(mtTrackers && mtTrackers[window.myId]);
    tBtn.classList.toggle('active', mtMode === 'placing' || mtMode === 'aiming');
    if (mtMode === 'placing' || mtMode === 'aiming') {
      tBtn.textContent = '✋ Abbrechen';
    } else if (hasMine) {
      tBtn.textContent = '✕ Tracker entfernen';
    } else {
      tBtn.textContent = '📡 Motion Tracker';
    }
  }
  if (bBtn) {
    bBtn.classList.toggle('active', mtMode === 'blip');
    bBtn.textContent = (mtMode === 'blip') ? '✋ Blip-Modus aus' : '🎯 Blip setzen';
  }
}

function mtUpdateHint() {
  const hint = document.getElementById('mtHint');
  if (!hint) return;
  if (mtMode === 'placing') {
    hint.innerHTML = 'TRACKER POSITION WÄHLEN — KLICK AUF DIE KARTE <span class="mt-kbd">ESC</span>';
    hint.classList.add('visible');
  } else if (mtMode === 'aiming') {
    hint.innerHTML = 'RICHTUNG WÄHLEN — KLICK FÜR KEGEL-AUSRICHTUNG <span class="mt-kbd">ESC</span>';
    hint.classList.add('visible');
  } else if (mtMode === 'blip') {
    hint.innerHTML = 'BLIP-MODUS — KLICK PLATZIERT KONTAKT <span class="mt-kbd">ESC</span>';
    hint.classList.add('visible');
  } else {
    hint.classList.remove('visible');
    hint.innerHTML = '';
  }
}

// ── Render loop ───────────────────────────────────────────────
function mtLoop() {
  if (!mtRunning) return;
  mtDraw();
  mtRafId = requestAnimationFrame(mtLoop);
}

window.mtResize = function() {
  const c = document.getElementById('ibTrackerCanvas');
  const wrap = document.getElementById('ibCanvasWrap');
  if (!c || !wrap) return;
  c.width  = wrap.clientWidth;
  c.height = wrap.clientHeight;
};

function mtClearCanvas() {
  const c = document.getElementById('ibTrackerCanvas');
  if (!c) return;
  c.getContext('2d').clearRect(0, 0, c.width, c.height);
}

function mtDraw() {
  const c = document.getElementById('ibTrackerCanvas');
  const wrap = document.getElementById('ibCanvasWrap');
  if (!c || !wrap || !window.ibImageRect) return;

  if (c.width !== wrap.clientWidth || c.height !== wrap.clientHeight) {
    c.width = wrap.clientWidth;
    c.height = wrap.clientHeight;
  }

  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);

  const rect = window.ibImageRect();
  if (!rect) return;

  const now = Date.now();
  const trackers = Object.values(mtTrackers || {});
  const blips    = Object.values(mtBlips || {}).filter(b => now - b.ts < MT_BLIP_TTL);

  trackers.forEach(t => mtDrawTracker(ctx, rect, t, blips, now));

  // Ghost cone while player is aiming
  if (mtMode === 'aiming' && mtPending && window.ibToPix) {
    const center = window.ibToPix(mtPending.nx, mtPending.ny);
    const dx = mtCursor.x - center.px;
    const dy = mtCursor.y - center.py;
    const angle = Math.atan2(dy, dx);
    const ghost = {
      nx: mtPending.nx, ny: mtPending.ny,
      angle, range: MT_RANGE,
      color: window.colorFromName(window.myName)
    };
    mtDrawConeOutline(ctx, rect, ghost, true);
  }
}

function mtRangePx(rect, t) {
  return (t.range || MT_RANGE) * Math.min(rect.w, rect.h);
}

function mtDrawConeOutline(ctx, rect, t, ghost) {
  const center = window.ibToPix(t.nx, t.ny);
  const rangePx = mtRangePx(rect, t);
  const a1 = t.angle - MT_HALF_FOV;
  const a2 = t.angle + MT_HALF_FOV;
  const color = t.color || '#44ddff';

  ctx.save();
  ctx.strokeStyle = ghost ? 'rgba(255,200,80,0.55)' : mtAlpha(color, 0.65);
  ctx.fillStyle   = ghost ? 'rgba(255,200,80,0.05)' : mtAlpha(color, 0.07);
  ctx.lineWidth = 1.5;

  ctx.beginPath();
  ctx.moveTo(center.px, center.py);
  ctx.arc(center.px, center.py, rangePx, a1, a2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  if (!ghost) {
    // Distance bands
    ctx.strokeStyle = mtAlpha(color, 0.2);
    ctx.lineWidth = 1;
    for (let b = 1; b < MT_BANDS; b++) {
      const r = rangePx * (b / MT_BANDS);
      ctx.beginPath();
      ctx.arc(center.px, center.py, r, a1, a2);
      ctx.stroke();
    }
    // Slice dividers
    for (let s = 1; s < MT_SLICES; s++) {
      const a = a1 + (a2 - a1) * (s / MT_SLICES);
      ctx.beginPath();
      ctx.moveTo(center.px, center.py);
      ctx.lineTo(center.px + Math.cos(a) * rangePx, center.py + Math.sin(a) * rangePx);
      ctx.stroke();
    }
    // Owner pip + label
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(center.px, center.py, 3.5, 0, Math.PI * 2);
    ctx.fill();

    if (t.ownerName) {
      ctx.font = '10px "Share Tech Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const labelOffset = 8;
      const labelX = center.px;
      const labelY = center.py + labelOffset;
      const txt = t.ownerName.toUpperCase();
      const w = ctx.measureText(txt).width + 8;
      ctx.fillStyle = 'rgba(4,8,10,0.78)';
      ctx.fillRect(labelX - w / 2, labelY - 1, w, 13);
      ctx.fillStyle = color;
      ctx.fillText(txt, labelX, labelY);
    }
  }

  ctx.restore();
}

function mtDrawTracker(ctx, rect, t, blips, now) {
  mtDrawConeOutline(ctx, rect, t, false);

  const center = window.ibToPix(t.nx, t.ny);
  const rangePx = mtRangePx(rect, t);
  const a1 = t.angle - MT_HALF_FOV;
  const sliceArc = MT_FOV / MT_SLICES;
  const bandLen  = rangePx / MT_BANDS;
  const color    = t.color || '#44ddff';

  // ── Sweep ──────────────────────────────────────────────────
  const sweepPhase = ((now - (t.ts || 0)) % MT_SWEEP_MS) / MT_SWEEP_MS;
  const sweepEnd   = a1 + MT_FOV * sweepPhase;
  const sweepStart = sweepEnd - MT_FOV * 0.20;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(center.px, center.py);
  ctx.arc(center.px, center.py, rangePx, Math.max(a1, sweepStart), Math.min(a1 + MT_FOV, sweepEnd));
  ctx.closePath();
  const grad = ctx.createRadialGradient(center.px, center.py, 0, center.px, center.py, rangePx);
  grad.addColorStop(0,   mtAlpha(color, 0.0));
  grad.addColorStop(0.6, mtAlpha(color, 0.10));
  grad.addColorStop(1,   mtAlpha(color, 0.22));
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();

  // ── Blips → sector cells ──────────────────────────────────
  blips.forEach(b => {
    const bp = window.ibToPix(b.nx, b.ny);
    const dx = bp.px - center.px;
    const dy = bp.py - center.py;
    const dist = Math.hypot(dx, dy);
    if (dist > rangePx) return;

    let dAngle = Math.atan2(dy, dx) - t.angle;
    while (dAngle >  Math.PI) dAngle -= 2 * Math.PI;
    while (dAngle < -Math.PI) dAngle += 2 * Math.PI;
    if (Math.abs(dAngle) > MT_HALF_FOV) return;

    const sliceIdx = Math.min(MT_SLICES - 1, Math.max(0, Math.floor((dAngle + MT_HALF_FOV) / sliceArc)));
    const bandIdx  = Math.min(MT_BANDS - 1,  Math.max(0, Math.floor(dist / bandLen)));

    const cellA1 = a1 + sliceIdx * sliceArc;
    const cellA2 = cellA1 + sliceArc;
    const cellR1 = bandIdx * bandLen;
    const cellR2 = (bandIdx + 1) * bandLen;

    const age   = now - b.ts;
    const fade  = Math.max(0, 1 - age / MT_BLIP_TTL);
    const pulse = 0.55 + 0.45 * Math.abs(Math.sin(age * 0.011));
    const alpha = pulse * fade;

    ctx.save();
    ctx.beginPath();
    ctx.arc(center.px, center.py, cellR2, cellA1, cellA2);
    ctx.arc(center.px, center.py, cellR1, cellA2, cellA1, true);
    ctx.closePath();

    ctx.globalAlpha = alpha * 0.55;
    ctx.fillStyle = '#ff2200';
    ctx.fill();

    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#ff3a1a';
    ctx.lineWidth = 1.8;
    ctx.shadowColor = '#ff2200';
    ctx.shadowBlur  = 14;
    ctx.stroke();
    ctx.restore();
  });
}

// "#rrggbb" + alpha 0..1 → "rgba(...)"
function mtAlpha(hex, a) {
  if (!hex || hex[0] !== '#' || hex.length < 7) return `rgba(255,68,0,${a})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}
