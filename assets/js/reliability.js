import { ref, onValue, set, get, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ── Crew Reliability — persistent HUD bar, -10..+10 ──────────────────────────
//
// Firebase: crew/reliability = { value, updatedAt, updatedBy, lastReason, lastDelta }
// Public API: window.adjustReliability(delta, reason?)  — clamped, additive
//             window.setReliability(value, reason?)     — GM-only absolute set

const REL_PATH = 'crew/reliability';
const MIN = -10;
const MAX =  10;

let _current = 0;
let _initialized = false;

function clamp(n) { return Math.max(MIN, Math.min(MAX, n)); }

function tierFor(v) {
  if (v >=  6) return 'pos-high';
  if (v >=  1) return 'pos-mid';
  if (v ===  0) return 'neutral';
  if (v >= -4) return 'neg-mid';
  return 'neg-high';
}

function render(value) {
  const fill   = document.getElementById('relBarFill');
  const valEl  = document.getElementById('relValue');
  if (!fill || !valEl) return;

  const v = clamp(value);
  const tier = tierFor(v);

  // Map value to bar position. Track represents full -10..+10 range.
  // Fill grows from the center (50%) toward the value.
  const pct = (v / MAX) * 50; // -50..+50
  if (v >= 0) {
    fill.style.left  = '50%';
    fill.style.width = `${pct}%`;
  } else {
    fill.style.left  = `${50 + pct}%`;
    fill.style.width = `${-pct}%`;
  }
  fill.dataset.tier = tier;

  valEl.textContent = v > 0 ? `+${v}` : String(v);
  valEl.dataset.tier = tier;
}

function showDelta(delta) {
  const el = document.getElementById('relDelta');
  if (!el || !delta) return;
  el.textContent = delta > 0 ? `+${delta}` : String(delta);
  el.classList.remove('up', 'down');
  el.classList.add(delta > 0 ? 'up' : 'down', 'show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 1800);
}

function applyGmVisibility() {
  const hud = document.getElementById('reliabilityHud');
  if (!hud) return;
  hud.classList.toggle('is-gm', !!window.isGM);
}

async function writeValue(newValue, reason, delta) {
  await window._authReadyPromise;
  return set(ref(window.db, REL_PATH), {
    value: clamp(newValue),
    updatedAt: serverTimestamp(),
    updatedBy: window.myName || '—',
    lastReason: reason || '',
    lastDelta: delta || 0,
  });
}

async function adjustReliability(delta, reason) {
  const d = Math.trunc(Number(delta) || 0);
  if (!d) return _current;
  const next = clamp(_current + d);
  if (next === _current) return _current; // already at boundary
  try {
    await writeValue(next, reason || '', d);
    // optimistic local delta flash; onValue will confirm the new value
    showDelta(d);
  } catch (err) {
    console.error('[Reliability] write failed:', err);
  }
  return next;
}

async function setReliability(value, reason) {
  const v = clamp(Math.trunc(Number(value) || 0));
  const d = v - _current;
  try {
    await writeValue(v, reason || '', d);
    if (d) showDelta(d);
  } catch (err) {
    console.error('[Reliability] set failed:', err);
  }
  return v;
}

function bindGmButtons() {
  document.getElementById('relMinusBtn')?.addEventListener('click', () => adjustReliability(-1, 'GM manual'));
  document.getElementById('relPlusBtn')?.addEventListener('click',  () => adjustReliability(+1, 'GM manual'));
}

function init() {
  if (_initialized) return;
  _initialized = true;
  bindGmButtons();
  render(0);

  window._authReadyPromise.then(() => {
    applyGmVisibility();
    onValue(ref(window.db, REL_PATH), snap => {
      const data = snap.val();
      const v = (data && typeof data.value === 'number') ? data.value : 0;
      _current = clamp(v);
      render(_current);
      applyGmVisibility(); // in case isGM resolved after first paint
    });
  });
}

// Re-check GM visibility after login — auth.js sets window.isGM only after
// the user submits the password screen, which can be long after DOMContentLoaded.
function watchLogin() {
  let applied = false;
  const iv = setInterval(() => {
    if (window._loggedIn) {
      applyGmVisibility();
      if (!applied && window.isGM) applied = true;
    }
    // stop polling once we've confirmed visibility post-login, or after 2 minutes
  }, 1000);
  setTimeout(() => clearInterval(iv), 120000);
}

document.addEventListener('DOMContentLoaded', () => {
  init();
  watchLogin();
});

window.adjustReliability = adjustReliability;
window.setReliability    = setReliability;
window.getReliability    = () => _current;
