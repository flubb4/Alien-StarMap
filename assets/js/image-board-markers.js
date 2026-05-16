// ── Image Board — player markers + GM pins ───────────────────────────────
// Mirrors the Corvus marker system. Drops a colored dot per player ("I'm here")
// and lets the GM pin labeled markers (NPCs, threats, objects) on the same
// image. Coordinates are normalized to the image rect so they survive zoom and
// resize. Lives independently on top of #ibCanvasWrap.

import {
  ref, onValue, set, remove, push, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

let ibmkMode          = null;   // null | 'marker' | 'pin'
let ibmkMarkers       = {};
let ibmkPins          = {};
let ibmkUnsubMarkers  = null;
let ibmkUnsubPins     = null;
let ibmkInited        = false;
let ibmkResizeObs     = null;

const IBMK_PATH      = 'session/imageBoard/markers';
const IBMK_PIN_PATH  = 'session/imageBoard/gmPins';

function ibmkRef()      { return ref(window.db, IBMK_PATH); }
function ibmkPinsRef()  { return ref(window.db, IBMK_PIN_PATH); }
function ibmkMyRef(id)  { return ref(window.db, IBMK_PATH + '/' + id); }
function ibmkPinRef(id) { return ref(window.db, IBMK_PIN_PATH + '/' + id); }

function ibmkIdentity() {
  let id    = window.myId;
  let name  = window.myName;
  let color = window.selectedColor;
  if (!id && name) id = 'user_' + String(name).toUpperCase().replace(/[^A-Z0-9]/g, '_');
  if (!id) {
    console.warn('[IB-Markers] cannot place marker — window.myId not set. Are you logged in?');
    return null;
  }
  return { id, name: name || 'OPERATIVE', color: color || '#ff9a3c' };
}

function ibmkEsc(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// ── Init: build layer + attach observers (idempotent) ─────────────────────
function ibmkInit() {
  if (ibmkInited) return;
  const wrap = document.getElementById('ibCanvasWrap');
  if (!wrap) return;
  ibmkInited = true;

  let layer = document.getElementById('ibMarkerLayer');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'ibMarkerLayer';
    layer.className = 'ib-marker-layer';
    wrap.appendChild(layer);
  }

  layer.addEventListener('click', ibmkOnLayerClick);

  // Re-render whenever the canvas-wrap (and therefore the image) changes size
  if (window.ResizeObserver) {
    ibmkResizeObs = new ResizeObserver(() => ibmkRender());
    ibmkResizeObs.observe(wrap);
  } else {
    window.addEventListener('resize', ibmkRender);
  }

  // Image swap → reposition once the new natural size is known
  const img = document.getElementById('ibImage');
  if (img) img.addEventListener('load', () => setTimeout(ibmkRender, 30));
}

// Click on the marker layer (only fires when layer is interactive).
// Marker / pin elements stopPropagation, so this only fires on empty deck.
function ibmkOnLayerClick(e) {
  if (!ibmkMode) return;
  if (e.target.closest('.ib-marker, .ib-gmpin')) return;

  const wrap = document.getElementById('ibCanvasWrap');
  if (!wrap || !window.ibToNorm) return;
  const r = wrap.getBoundingClientRect();
  const px = e.clientX - r.left;
  const py = e.clientY - r.top;
  const norm = window.ibToNorm(px, py);
  if (!norm) return;
  if (norm.nx < 0 || norm.nx > 1 || norm.ny < 0 || norm.ny > 1) return;

  if (ibmkMode === 'pin' && window.isGM) ibmkDropGMPin(norm.nx, norm.ny);
  else if (ibmkMode === 'marker')        ibmkDropMyMarker(norm.nx, norm.ny);
}

async function ibmkDropMyMarker(nx, ny) {
  const me = ibmkIdentity();
  if (!me || !window.db) return;
  try {
    await set(ibmkMyRef(me.id), {
      name: me.name, color: me.color, nx, ny, ts: serverTimestamp(),
    });
  } catch (err) { console.warn('[IB-Markers] set failed:', err); }
}

async function ibmkRemoveMyMarker() {
  const me = ibmkIdentity();
  if (!me || !window.db) return;
  try { await remove(ibmkMyRef(me.id)); }
  catch (err) { console.warn('[IB-Markers] remove failed:', err); }
}

async function ibmkDropGMPin(nx, ny) {
  if (!window.isGM || !window.db) return;
  const label = (window.prompt('Pin-Label? (z.B. „Alien", „NPC: Silas")') || '').trim();
  if (!label) return;
  try { await push(ibmkPinsRef(), { label, nx, ny, ts: serverTimestamp() }); }
  catch (err) { console.warn('[IB-Markers] pin add failed:', err); }
}

async function ibmkRemoveGMPin(pinId) {
  if (!window.isGM || !window.db || !pinId) return;
  try { await remove(ibmkPinRef(pinId)); }
  catch (err) { console.warn('[IB-Markers] pin remove failed:', err); }
}

// ── Firebase listeners ────────────────────────────────────────────────────
function ibmkSubscribe() {
  if (!window.db) return;
  if (!ibmkUnsubMarkers) {
    ibmkUnsubMarkers = onValue(ibmkRef(), (snap) => {
      ibmkMarkers = snap.val() || {};
      ibmkRender();
    });
  }
  if (!ibmkUnsubPins) {
    ibmkUnsubPins = onValue(ibmkPinsRef(), (snap) => {
      ibmkPins = snap.val() || {};
      ibmkRender();
    });
  }
}
function ibmkUnsubscribe() {
  if (ibmkUnsubMarkers) { ibmkUnsubMarkers(); ibmkUnsubMarkers = null; }
  if (ibmkUnsubPins)    { ibmkUnsubPins();    ibmkUnsubPins    = null; }
}

// ── Rendering ─────────────────────────────────────────────────────────────
function ibmkRender() {
  const layer = document.getElementById('ibMarkerLayer');
  if (!layer) return;
  const r = (typeof window.ibImageRect === 'function') ? window.ibImageRect() : null;
  layer.innerHTML = '';
  if (!r) return;

  const me   = ibmkIdentity();
  const myId = me ? me.id : null;

  // Player markers
  Object.entries(ibmkMarkers).forEach(([uid, m]) => {
    if (!m) return;
    const mine = uid === myId;
    const el = document.createElement('div');
    el.className = 'ib-marker' + (mine ? ' is-mine' : '');
    el.style.left = (r.x + m.nx * r.w) + 'px';
    el.style.top  = (r.y + m.ny * r.h) + 'px';
    el.style.setProperty('--ib-mk-color', m.color || '#ff9a3c');
    el.title = (m.name || 'OP') + (mine ? ' (du)' : '');
    el.dataset.uid = uid;
    el.innerHTML = `
      <div class="ib-marker-dot"></div>
      <div class="ib-marker-label">${ibmkEsc(m.name || 'OP')}</div>
    `;
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (mine) ibmkRemoveMyMarker();
    });
    layer.appendChild(el);
  });

  // GM pins
  Object.entries(ibmkPins).forEach(([pinId, p]) => {
    if (!p) return;
    const el = document.createElement('div');
    el.className = 'ib-gmpin';
    el.style.left = (r.x + p.nx * r.w) + 'px';
    el.style.top  = (r.y + p.ny * r.h) + 'px';
    el.title = (p.label || 'PIN') + (window.isGM ? ' (Klick = entfernen)' : '');
    el.dataset.pinId = pinId;
    el.innerHTML = `
      <div class="ib-gmpin-dot"></div>
      <div class="ib-gmpin-label">${ibmkEsc(p.label || 'PIN')}</div>
    `;
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (window.isGM && window.confirm(`Pin "${p.label}" entfernen?`)) ibmkRemoveGMPin(pinId);
    });
    layer.appendChild(el);
  });
}

// ── Mode toggles ──────────────────────────────────────────────────────────
function ibmkUpdateUI() {
  const wrap = document.getElementById('ibCanvasWrap');
  if (wrap) {
    wrap.classList.toggle('ib-marker-mode', ibmkMode === 'marker');
    wrap.classList.toggle('ib-pin-mode',    ibmkMode === 'pin');
  }
  const mkBtn  = document.getElementById('ibMarkerBtn');
  const pinBtn = document.getElementById('ibPinBtn');
  if (mkBtn)  mkBtn.classList.toggle('active',  ibmkMode === 'marker');
  if (pinBtn) pinBtn.classList.toggle('active', ibmkMode === 'pin');
}

window.ibmkToggleMode = function() {
  ibmkInit();
  ibmkMode = (ibmkMode === 'marker') ? null : 'marker';
  ibmkUpdateUI();
};

window.ibmkTogglePinMode = function() {
  if (!window.isGM) return;
  ibmkInit();
  ibmkMode = (ibmkMode === 'pin') ? null : 'pin';
  ibmkUpdateUI();
};

window.ibmkClearMine = function() {
  ibmkRemoveMyMarker();
};

// Hook called by image-board.js if available; otherwise we subscribe always.
window.ibmkOnOpen = function() {
  ibmkInit();
  ibmkSubscribe();
  ibmkRender();
  const pinBtn = document.getElementById('ibPinBtn');
  if (pinBtn) pinBtn.style.display = window.isGM ? '' : 'none';
};
window.ibmkOnClose = function() {
  ibmkMode = null;
  ibmkUpdateUI();
  // Keep subscriptions alive — cheap; lets the system show up instantly next time
};

// Auto-bootstrap once auth + DOM are ready, so the feature works even if
// image-board.js doesn't explicitly call ibmkOnOpen.
(window._authReadyPromise || Promise.resolve()).then(() => {
  const boot = () => { ibmkInit(); ibmkSubscribe(); };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
});
