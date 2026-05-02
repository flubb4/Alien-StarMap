import { ref, onValue, set, onDisconnect } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ── Android Storage Bay ───────────────────────────────────────────────────────

const BAY_IDS = ['BAY-01','BAY-02','BAY-03','BAY-04','BAY-05',
                 'BAY-06','BAY-07','BAY-08','BAY-09','BAY-10'];

const ROSTER = [
  { desig: 'AX-31 "KESTREL"',   cls: 'BLACK VEIL' },
  { desig: 'AX-44 "ATLAS"',     cls: 'BLACK VEIL' },
  { desig: 'AX-47 "PEREGRINE"', cls: 'BLACK VEIL' },
  { desig: 'AX-62 "BOYD"',      cls: 'BLACK VEIL' },
  { desig: 'AX-17 "HERMES-7"',  cls: 'BLACK VEIL' },
  { desig: 'AX-80 "CINDER"',    cls: 'BLACK VEIL' },
  { desig: 'AX-92 "VALIANT"',   cls: 'BLACK VEIL' },
  { desig: 'AX-101 "ALCYONE"',  cls: 'BLACK VEIL' },
  { desig: 'AX-117 "MERIDIAN"', cls: 'BLACK VEIL' },
  { desig: 'AX-133 "OMEGA"',    cls: 'BLACK VEIL' },
  { desig: 'DVS-7741 "SILAS"',  cls: 'ROUGHNECK'  },
  { desig: 'AX-417 "KAI"',      cls: 'STATION'    },
  { desig: 'NX-9',               cls: 'HELIOS-CLS' },
];

let pods = {};
let openBay = null;
let pickedAndroid = null;
let pickedCond = null;
let manageBay = null;
let manageCond = null;
const sealTimers = {};

// Per-pod render signature; lets us patch only changed pods on Firebase update
const _lastSig = {};
let _gridDelegated = false;
let _bayUnsub = null;

// ── Session sync (everyone sees the same view) ───────────────────────────────
const SESSION_PATH = 'android-bay/session';
let _session       = null;     // last-seen session snapshot
let _isDriver      = false;    // I opened this session
let _isSpectator   = false;    // I joined someone else's session
let _sessionUnsub  = null;
let _dismissedTs   = 0;        // last invite-ts I declined
let _onDisconnectRef = null;   // driver-only: pending Firebase cleanup if tab dies

const log = (...a) => { if (window.DEBUG) console.log(...a); };

function podSig(p) {
  if (!p) return 'empty';
  return `${p.state || 'occupied'}|${p.desig || ''}|${p.cls || ''}|${p.cond || ''}`;
}

// ── Pod rendering ─────────────────────────────────────────────────────────────

function renderPod(bayId) {
  const p = pods[bayId];
  const state = p ? (p.state || 'occupied') : 'empty';

  if (state === 'scanning') {
    return `<div class="ab-pod" data-state="scanning" data-bay="${bayId}" tabindex="-1">
      <div class="ab-photo"></div><div class="ab-tint"></div>
      <div class="ab-scan-flash"></div>
      <div class="ab-hud">
        <div class="ab-hud-top">
          <span class="ab-id"><span class="ab-led"></span>${bayId}</span>
          <span class="ab-state" style="color:var(--ab-amber)">SCANNING</span>
        </div>
        <div class="ab-hud-mid"></div>
        <div class="ab-hud-bot">
          <div class="ab-name-row"><span class="ab-name">— IDENTIFYING —</span><span class="ab-cls-tag">INTAKE</span></div>
          <div class="ab-chips"><span class="ab-chip ab-warn">SCAN<span class="ab-dot"></span></span></div>
        </div>
      </div>
    </div>`;
  }

  if (state === 'empty') {
    return `<div class="ab-pod" data-state="empty" data-bay="${bayId}" tabindex="0">
      <div class="ab-photo"></div><div class="ab-tint"></div>
      <div class="ab-hover-glow"></div>
      <div class="ab-hover-prompt">▸ SLOT AVAILABLE ◂<small>CLICK TO ASSIGN UNIT</small></div>
      <div class="ab-hud">
        <div class="ab-hud-top">
          <span class="ab-id"><span class="ab-led"></span>${bayId}</span>
          <span class="ab-state">EMPTY</span>
        </div>
        <div class="ab-hud-mid"></div>
        <div class="ab-hud-bot">
          <div class="ab-name-row"><span class="ab-name">— UNASSIGNED —</span><span class="ab-cls-tag">VACANT</span></div>
          <div class="ab-chips"><span class="ab-chip">IDLE<span class="ab-dot" style="background:#3a4250;box-shadow:0 0 4px #3a4250"></span></span></div>
        </div>
      </div>
    </div>`;
  }

  if (state === 'sealing') {
    return `<div class="ab-pod" data-state="sealing" data-bay="${bayId}" tabindex="0">
      <div class="ab-photo"></div><div class="ab-tint"></div>
      <div class="ab-vapor"><span></span><span></span><span></span></div>
      <div class="ab-sweep"></div>
      <div class="ab-hud">
        <div class="ab-hud-top">
          <span class="ab-id"><span class="ab-led"></span>${bayId}</span>
          <span class="ab-state">SEALING</span>
        </div>
        <div class="ab-hud-mid"></div>
        <div class="ab-hud-bot">
          <div class="ab-progress-wrap">
            <div class="ab-progress-label"><span>PRESSURIZING</span><span>—%</span></div>
            <div class="ab-progress"></div>
          </div>
          <div class="ab-name-row"><span class="ab-name">${p.desig} · INTAKE</span><span class="ab-cls-tag">${p.cls}</span></div>
          <div class="ab-chips">
            <span class="ab-chip ab-warn">SEAL<span class="ab-dot"></span></span>
            <span class="ab-chip ab-warn">PRESS<span class="ab-dot"></span></span>
          </div>
        </div>
      </div>
    </div>`;
  }

  // occupied
  const isDmg = (p.cond === 'damaged');
  const vitChip = isDmg
    ? `<span class="ab-chip ab-err">VIT<span class="ab-dot"></span></span>`
    : `<span class="ab-chip ab-ok">VIT<span class="ab-dot"></span></span>`;
  const datChip = isDmg
    ? `<span class="ab-chip ab-warn">DAT<span class="ab-dot"></span></span>`
    : `<span class="ab-chip ab-ok">DAT<span class="ab-dot"></span></span>`;
  const stateLbl = isDmg
    ? `<span class="ab-state" style="color:var(--ab-red);border-color:var(--ab-red)">FAULT</span>`
    : `<span class="ab-state">SEALED</span>`;
  const glitch = isDmg ? `<div class="ab-glitch"><span></span><span></span><span></span></div>` : '';

  return `<div class="ab-pod" data-state="occupied" data-cond="${p.cond || 'intact'}" data-bay="${bayId}" tabindex="0">
    <div class="ab-photo"></div><div class="ab-tint"></div>
    <div class="ab-reticle"></div>${glitch}
    <div class="ab-hover-glow"></div>
    <div class="ab-hover-prompt">▸ UNIT SEALED ◂<small>CLICK TO MANAGE</small></div>
    <div class="ab-hud">
      <div class="ab-hud-top">
        <span class="ab-id"><span class="ab-led"></span>${bayId}</span>${stateLbl}
      </div>
      <div class="ab-hud-mid"></div>
      <div class="ab-hud-bot">
        <div class="ab-name-row"><span class="ab-name">${p.desig}</span><span class="ab-cls-tag">${p.cls}</span></div>
        <div class="ab-chips">${vitChip}${datChip}<span class="ab-chip">SYNC<span class="ab-dot"></span></span></div>
      </div>
    </div>
  </div>`;
}

function fullRenderGrid() {
  const grid = document.getElementById('abGrid');
  if (!grid) return;
  grid.innerHTML = BAY_IDS.map(renderPod).join('');
  BAY_IDS.forEach(id => {
    _lastSig[id] = podSig(pods[id]);
    bindPodHover(grid.querySelector(`.ab-pod[data-bay="${id}"]`));
  });
  if (!_gridDelegated) {
    bindGridDelegation(grid);
    _gridDelegated = true;
  }
  updateCounter();
}

// Public name kept; now patches only changed pods instead of replacing the whole grid
function renderGrid() {
  const grid = document.getElementById('abGrid');
  if (!grid) return;
  if (grid.childElementCount === 0) { fullRenderGrid(); return; }

  let changed = false;
  for (const id of BAY_IDS) {
    const sig = podSig(pods[id]);
    if (sig === _lastSig[id]) continue;
    _lastSig[id] = sig;
    changed = true;
    const oldEl = grid.querySelector(`.ab-pod[data-bay="${id}"]`);
    if (!oldEl) continue;
    const tmp = document.createElement('template');
    tmp.innerHTML = renderPod(id).trim();
    const newEl = tmp.content.firstElementChild;
    oldEl.replaceWith(newEl);
    bindPodHover(newEl);
  }
  if (changed) updateCounter();
}

function updateCounter() {
  const n = BAY_IDS.filter(id => pods[id]).length;
  const valEl = document.querySelector('#androidBayOverlay .ab-val');
  if (valEl) valEl.textContent = String(n).padStart(2, '0');
  const sealEl = document.getElementById('abSealReadout');
  if (sealEl) sealEl.textContent = `${n} / 10 LOCKED`;
}

function bindPodHover(el) {
  if (!el) return;
  const glow = el.querySelector('.ab-hover-glow');
  const prompt = el.querySelector('.ab-hover-prompt');
  if (!glow && !prompt) return;
  el.addEventListener('mouseenter', () => {
    if (glow) glow.style.opacity = '1';
    if (prompt) prompt.style.opacity = '1';
  });
  el.addEventListener('mouseleave', () => {
    if (glow) glow.style.opacity = '0';
    if (prompt) prompt.style.opacity = '0';
  });
}

function bindGridDelegation(grid) {
  grid.addEventListener('click', e => {
    if (_isSpectator) return;
    const pod = e.target.closest('.ab-pod');
    if (!pod || !grid.contains(pod)) return;
    const state = pod.dataset.state;
    const bayId = pod.dataset.bay;
    if (state === 'empty') {
      openAssignModal(bayId);
    } else if (state === 'occupied') {
      if (window.isGM) openManageModal(bayId);
      else window.openMutherConfirm?.(bayId, pods[bayId]);
    }
  });
  grid.addEventListener('keydown', e => {
    if (_isSpectator) return;
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const pod = e.target.closest('.ab-pod');
    if (!pod || !grid.contains(pod)) return;
    e.preventDefault();
    pod.click();
  });
}

// ── Assign modal ──────────────────────────────────────────────────────────────

function renderRoster() {
  const assigned = new Set(BAY_IDS.map(id => pods[id]?.desig).filter(Boolean));
  const listEl = document.getElementById('abAndroidList');
  if (!listEl) return;
  const available = ROSTER.filter(a => !assigned.has(a.desig));
  if (available.length === 0) {
    listEl.innerHTML = `<div style="padding:16px;color:var(--ab-ink-dim);letter-spacing:.3em;font-size:10px">NO UNITS AVAILABLE</div>`;
    return;
  }
  listEl.innerHTML = available.map(a => `
    <div class="ab-android-opt" data-desig="${a.desig}" data-cls="${a.cls}">
      <span class="ab-av"></span>
      <span class="ab-desig">${a.desig}</span>
      <span class="ab-opt-cls">${a.cls}</span>
    </div>`).join('');
  listEl.querySelectorAll('.ab-android-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      if (_isSpectator) return;
      listEl.querySelectorAll('.ab-android-opt').forEach(x => x.classList.remove('ab-sel'));
      opt.classList.add('ab-sel');
      pickedAndroid = { desig: opt.dataset.desig, cls: opt.dataset.cls };
      updateConfirmBtn();
      writeSessionField('assignModal/picked', pickedAndroid);
    });
  });
}

function updateConfirmBtn() {
  const btn = document.getElementById('abConfirmBtn');
  if (btn) btn.disabled = !(pickedAndroid && pickedCond);
}

function openAssignModal(bayId) {
  if (_isSpectator) return;
  openBay = bayId;
  pickedAndroid = null;
  pickedCond = null;
  const targetEl = document.getElementById('abTargetBay');
  if (targetEl) targetEl.textContent = bayId;
  document.querySelectorAll('#abAssignOverlay .ab-cond-opt').forEach(x => x.classList.remove('ab-sel'));
  renderRoster();
  updateConfirmBtn();
  document.getElementById('abAssignOverlay')?.classList.add('open');
  // Freeze pod animations while modal is open
  document.getElementById('abGrid')?.style.setProperty('animation-play-state', 'paused');
  document.querySelectorAll('#abGrid *').forEach(el => el.style.animationPlayState = 'paused');
  writeSessionField('assignModal', { bay: bayId, picked: null, cond: null });
}

function closeAssignModal() {
  if (_isSpectator) return;
  document.getElementById('abAssignOverlay')?.classList.remove('open');
  openBay = null;
  // Resume pod animations
  document.querySelectorAll('#abGrid *').forEach(el => el.style.animationPlayState = '');
  writeSessionField('assignModal', null);
}

// ── Manage modal ──────────────────────────────────────────────────────────────

function openManageModal(bayId) {
  if (_isSpectator) return;
  manageBay = bayId;
  const p = pods[bayId];
  manageCond = p?.cond || 'intact';
  const bayEl  = document.getElementById('abManageBay');
  const desigEl = document.getElementById('abManageDesig');
  if (bayEl)  bayEl.textContent  = bayId;
  if (desigEl) desigEl.textContent = p?.desig || '—';
  document.querySelectorAll('#abManageOverlay .ab-cond-opt').forEach(x => {
    x.classList.toggle('ab-sel', x.dataset.cond === manageCond);
  });
  updateManageConfirmBtn();
  const interrogateRow = document.getElementById('mtInterrogateRow');
  if (interrogateRow) interrogateRow.style.display = window.isGM ? 'block' : 'none';
  document.getElementById('abManageOverlay')?.classList.add('open');
  document.querySelectorAll('#abGrid *').forEach(el => el.style.animationPlayState = 'paused');
  writeSessionField('manageModal', { bay: bayId, cond: manageCond });
}

function closeManageModal() {
  if (_isSpectator) return;
  document.getElementById('abManageOverlay')?.classList.remove('open');
  manageBay = null;
  manageCond = null;
  document.querySelectorAll('#abGrid *').forEach(el => el.style.animationPlayState = '');
  writeSessionField('manageModal', null);
}

function updateManageConfirmBtn() {
  const btn = document.getElementById('abManageConfirmBtn');
  if (btn) btn.disabled = !manageCond;
}

function confirmManage() {
  if (_isSpectator) return;
  if (!manageBay || !manageCond) return;
  const bayId = manageBay;
  const p = pods[bayId];
  if (!p) return;
  const updated = { ...p, cond: manageCond };
  closeManageModal();
  pods[bayId] = updated;
  renderGrid();
  window._authReadyPromise.then(() => {
    set(ref(window.db, `android-bay/pods/${bayId}`), updated)
      .then(() => log('[AndroidBay] manage write OK:', bayId))
      .catch(err => console.error('[AndroidBay] manage write FAILED:', bayId, err.code, err.message));
  });
}

function releaseUnit() {
  if (_isSpectator) return;
  if (!manageBay) return;
  const bayId = manageBay;
  closeManageModal();
  pods[bayId] = null;
  renderGrid();
  window._authReadyPromise.then(() => {
    set(ref(window.db, `android-bay/pods/${bayId}`), null)
      .then(() => log('[AndroidBay] release write OK:', bayId))
      .catch(err => console.error('[AndroidBay] release write FAILED:', bayId, err.code, err.message));
  });
}

function confirmAssign() {
  if (_isSpectator) return;
  if (!openBay || !pickedAndroid || !pickedCond) return;
  const bayId = openBay;
  const android = { ...pickedAndroid };
  const cond = pickedCond;
  closeAssignModal();

  // Alte MU/TH/UR-Session für diesen Bay löschen
  window._authReadyPromise.then(() => {
    set(ref(window.db, `muthur/sessions/${bayId}`), null);
    set(ref(window.db, `muthur/gm/${bayId}`), null);
  });

  // Phase 1: scan animation (local only, not written to Firebase)
  pods[bayId] = { state: 'scanning', desig: android.desig, cls: android.cls, cond };
  renderGrid();

  setTimeout(() => {
    // Phase 2: sealing
    pods[bayId] = { state: 'sealing', desig: android.desig, cls: android.cls, cond };
    renderGrid();

    window._authReadyPromise.then(() => {
      const bayRef = ref(window.db, `android-bay/pods/${bayId}`);
      set(bayRef, pods[bayId])
        .then(() => log('[AndroidBay] sealing write OK:', bayId))
        .catch(err => console.error('[AndroidBay] sealing write FAILED:', bayId, err.code, err.message));

      if (sealTimers[bayId]) clearTimeout(sealTimers[bayId]);
      sealTimers[bayId] = setTimeout(() => {
        pods[bayId] = { state: 'occupied', desig: android.desig, cls: android.cls, cond };
        renderGrid();
        set(bayRef, pods[bayId])
          .then(() => {
            log('[AndroidBay] occupied write OK:', bayId);
            // Terminal automatisch öffnen sobald Android versiegelt ist
            window.openMutherTerminal?.(bayId, pods[bayId]);
          })
          .catch(err => console.error('[AndroidBay] occupied write FAILED:', bayId, err.code, err.message));
        delete sealTimers[bayId];
      }, 1500);
    });
  }, 400);
}

// ── CRT Canvas (scanlines + vignette, drawn once on open) ────────────────────

function initCRTCanvas() {
  const canvas = document.getElementById('abCRTCanvas');
  if (!canvas) return;
  const w = canvas.offsetWidth;
  const h = canvas.offsetHeight;
  if (!w || !h) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  // Scanlines — one dark horizontal pixel every 3px
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);

  // Vignette — radial gradient from transparent centre to dark edges
  const outerR = Math.sqrt(w * w + h * h) / 2;
  const vg = ctx.createRadialGradient(w / 2, h / 2, outerR * 0.55, w / 2, h / 2, outerR);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
}

// ── Clock ─────────────────────────────────────────────────────────────────────

let _clockBase = 0;
let _clockInterval = null;

function startClock() {
  if (_clockInterval) return;
  _clockBase = Date.now();
  _clockInterval = setInterval(() => {
    const el = document.getElementById('abClock');
    if (!el) return;
    const elapsed = Math.floor((Date.now() - _clockBase) / 1000);
    const base = 4 * 3600 + 32 * 60 + 11 + elapsed;
    const h = String(Math.floor(base / 3600) % 24).padStart(2, '0');
    const m = String(Math.floor(base / 60) % 60).padStart(2, '0');
    const s = String(base % 60).padStart(2, '0');
    el.textContent = `2183.118 · ${h}:${m}:${s} SHIP-TIME`;
  }, 1000);
}

function stopClock() {
  clearInterval(_clockInterval);
  _clockInterval = null;
}

// ── Rivets ────────────────────────────────────────────────────────────────────

function placeRivets() {
  const r = document.getElementById('abRivets');
  if (!r || r.childElementCount > 0) return;
  [22, 80, 160, 240].forEach(x => {
    [{ top:22, left:x }, { top:22, right:x }, { bottom:22, left:x }, { bottom:22, right:x }]
      .forEach(pos => {
        const d = document.createElement('div');
        d.className = 'ab-rivet';
        Object.entries(pos).forEach(([k, v]) => d.style[k] = v + 'px');
        r.appendChild(d);
      });
  });
}

// ── Firebase listener (attached on open, detached on close) ──────────────────

function attachBayListener() {
  if (_bayUnsub) return;
  window._authReadyPromise.then(() => {
    if (_bayUnsub) return; // open/close raced
    _bayUnsub = onValue(ref(window.db, 'android-bay/pods'), snap => {
      const raw = snap.val() || {};
      log('[AndroidBay] onValue fired — Firebase data:', raw);
      // Preserve local in-transition states (scanning is local-only; sealing has an active timer)
      BAY_IDS.forEach(id => {
        const local = pods[id];
        if (local?.state === 'scanning' || (local?.state === 'sealing' && sealTimers[id])) {
          raw[id] = local;
        }
      });
      // Heal sealing pods where the local timer was lost (e.g. page reload)
      Object.entries(raw).forEach(([bayId, pod]) => {
        if (pod?.state === 'sealing' && !sealTimers[bayId]) {
          const healed = { ...pod, state: 'occupied' };
          raw[bayId] = healed;
          log('[AndroidBay] healing stuck sealing pod:', bayId);
          set(ref(window.db, `android-bay/pods/${bayId}`), healed)
            .catch(err => console.error('[AndroidBay] heal write FAILED:', bayId, err.code, err.message));
        }
      });
      pods = raw;
      renderGrid();
    });
  });
}

function detachBayListener() {
  if (typeof _bayUnsub === 'function') _bayUnsub();
  _bayUnsub = null;
}

// ── Session sync helpers ─────────────────────────────────────────────────────

function writeSessionField(field, val) {
  if (!_isDriver) return Promise.resolve();
  return window._authReadyPromise.then(() =>
    set(ref(window.db, `${SESSION_PATH}/${field}`), val)
  ).catch(err => console.error('[AndroidBay] session write failed:', field, err));
}

function writeFullSession(obj) {
  if (!_isDriver) return Promise.resolve();
  return window._authReadyPromise.then(() =>
    set(ref(window.db, SESSION_PATH), obj)
  ).then(armOnDisconnect)
   .catch(err => console.error('[AndroidBay] session write failed:', err));
}

function armOnDisconnect() {
  if (_onDisconnectRef) return;
  _onDisconnectRef = onDisconnect(ref(window.db, SESSION_PATH));
  _onDisconnectRef.remove().catch(err =>
    console.error('[AndroidBay] onDisconnect arm failed:', err));
}

function disarmOnDisconnect() {
  const handle = _onDisconnectRef;
  _onDisconnectRef = null;
  if (!handle) return Promise.resolve();
  return handle.cancel().catch(err =>
    console.error('[AndroidBay] onDisconnect cancel failed:', err));
}

function clearSession() {
  return disarmOnDisconnect()
    .then(() => window._authReadyPromise)
    .then(() => set(ref(window.db, SESSION_PATH), null))
    .catch(err => console.error('[AndroidBay] session clear failed:', err));
}

window._writeBaySession = writeSessionField;
window._isBayDriver = () => _isDriver;

function startSessionListener() {
  if (_sessionUnsub) return;
  window._authReadyPromise.then(() => {
    if (_sessionUnsub) return;
    _sessionUnsub = onValue(ref(window.db, SESSION_PATH), snap => {
      const next = snap.val();
      handleSessionChange(_session, next);
      _session = next;
    });
  });
}

function handleSessionChange(prev, next) {
  // Don't react until user is actually logged in (window.myId only valid post-login)
  if (!window._loggedIn) return;
  // Session ended (driver closed)
  if (!next) {
    hideInviteModal();
    if (_isSpectator) {
      _isSpectator = false;
      window._bayIsSpectator = false;
      document.body.classList.remove('bay-spectator');
      doLocalClose();
    }
    return;
  }
  // Own session — no action needed (we're driving, UI is already in sync)
  if (next.driverId === window.myId) return;

  const isNew = !prev || prev.ts !== next.ts;

  // New session, I'm not joined → offer invite (unless I dismissed this exact one)
  if (isNew && !_isSpectator && next.ts > _dismissedTs) {
    showInviteModal(next);
  }

  // Already joined → mirror remote UI changes
  if (_isSpectator) applyRemoteSession(next);
}

function showInviteModal(s) {
  const overlay = document.getElementById('abInviteOverlay');
  const nameEl  = document.getElementById('abInviteName');
  if (!overlay) return;
  if (nameEl) nameEl.textContent = (s.driver || '—').toUpperCase();
  overlay.style.display = 'flex';
}

function hideInviteModal() {
  const overlay = document.getElementById('abInviteOverlay');
  if (overlay) overlay.style.display = 'none';
}

function acceptInvite() {
  hideInviteModal();
  window.openAndroidBay({ spectator: true });
}

function declineInvite() {
  if (_session) _dismissedTs = _session.ts;
  hideInviteModal();
}

function applyRemoteSession(s) {
  if (!s) return;
  // Mirror assign modal
  if (s.assignModal) spectatorOpenAssign(s.assignModal);
  else               spectatorCloseAssign();
  // Mirror manage modal
  if (s.manageModal) spectatorOpenManage(s.manageModal);
  else               spectatorCloseManage();
  // Muthur sync delegated to muthur.js
  window._bayMuthurSync?.(s.muthurOpen || null);
}

function spectatorOpenAssign(state) {
  const overlay = document.getElementById('abAssignOverlay');
  if (!overlay) return;
  const targetEl = document.getElementById('abTargetBay');
  if (targetEl) targetEl.textContent = state.bay || '—';
  // Render roster so we can highlight what driver picked
  renderRoster();
  document.querySelectorAll('#abAndroidList .ab-android-opt').forEach(el => {
    el.classList.toggle('ab-sel', !!state.picked && el.dataset.desig === state.picked.desig);
  });
  document.querySelectorAll('#abAssignOverlay .ab-cond-opt').forEach(el => {
    el.classList.toggle('ab-sel', el.dataset.cond === state.cond);
  });
  overlay.classList.add('open');
}

function spectatorCloseAssign() {
  document.getElementById('abAssignOverlay')?.classList.remove('open');
}

function spectatorOpenManage(state) {
  const overlay = document.getElementById('abManageOverlay');
  if (!overlay) return;
  const p = pods[state.bay];
  const bayEl   = document.getElementById('abManageBay');
  const desigEl = document.getElementById('abManageDesig');
  if (bayEl)   bayEl.textContent   = state.bay;
  if (desigEl) desigEl.textContent = p?.desig || '—';
  document.querySelectorAll('#abManageOverlay .ab-cond-opt').forEach(el => {
    el.classList.toggle('ab-sel', el.dataset.cond === state.cond);
  });
  // Spectators never see Interrogate row (GM-only)
  const interrogateRow = document.getElementById('mtInterrogateRow');
  if (interrogateRow) interrogateRow.style.display = 'none';
  overlay.classList.add('open');
}

function spectatorCloseManage() {
  document.getElementById('abManageOverlay')?.classList.remove('open');
}

// Pure local close (no Firebase write). Used by both driver-end and spectator-end paths.
function doLocalClose() {
  detachBayListener();
  const overlay = document.getElementById('androidBayOverlay');
  if (overlay) {
    overlay.querySelectorAll('*').forEach(el => el.style.animationPlayState = 'paused');
    overlay.style.display = 'none';
  }
  document.getElementById('abAssignOverlay')?.classList.remove('open');
  document.getElementById('abManageOverlay')?.classList.remove('open');
  openBay = null;
  manageBay = null;
  pickedAndroid = null;
  pickedCond = null;
  manageCond = null;
  stopClock();
  if (window.resumeAlienHuntLoop) window.resumeAlienHuntLoop();
  if (document.getElementById('mutherOverlay')?.style.display !== 'none') {
    window.closeMutherTerminal?.();
  }
}

// ── Event listeners ───────────────────────────────────────────────────────────

// Condition select
document.addEventListener('click', e => {
  if (_isSpectator) return;
  const aOpt = e.target.closest('#abAssignOverlay .ab-cond-opt');
  if (aOpt) {
    document.querySelectorAll('#abAssignOverlay .ab-cond-opt').forEach(x => x.classList.remove('ab-sel'));
    aOpt.classList.add('ab-sel');
    pickedCond = aOpt.dataset.cond;
    updateConfirmBtn();
    writeSessionField('assignModal/cond', pickedCond);
    return;
  }
  const mOpt = e.target.closest('#abManageOverlay .ab-cond-opt');
  if (mOpt) {
    document.querySelectorAll('#abManageOverlay .ab-cond-opt').forEach(x => x.classList.remove('ab-sel'));
    mOpt.classList.add('ab-sel');
    manageCond = mOpt.dataset.cond;
    updateManageConfirmBtn();
    writeSessionField('manageModal/cond', manageCond);
  }
});

// ESC / Enter
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    // Let muthur.js handle ESC when its overlay is open
    if (document.getElementById('mutherOverlay')?.style.display !== 'none') return;
    if (_isSpectator) {
      const overlay = document.getElementById('androidBayOverlay');
      if (overlay?.style.display !== 'none') window.closeAndroidBay();
      return;
    }
    const mo = document.getElementById('abManageOverlay');
    if (mo?.classList.contains('open')) { closeManageModal(); return; }
    const ao = document.getElementById('abAssignOverlay');
    if (ao?.classList.contains('open')) { closeAssignModal(); return; }
    const overlay = document.getElementById('androidBayOverlay');
    if (overlay?.style.display !== 'none') window.closeAndroidBay();
    return;
  }
  if (e.key === 'Enter') {
    if (_isSpectator) return;
    const mo = document.getElementById('abManageOverlay');
    if (mo?.classList.contains('open')) {
      const btn = document.getElementById('abManageConfirmBtn');
      if (btn && !btn.disabled) confirmManage();
      return;
    }
    const ao = document.getElementById('abAssignOverlay');
    if (ao?.classList.contains('open')) {
      const btn = document.getElementById('abConfirmBtn');
      if (btn && !btn.disabled) confirmAssign();
    }
  }
});

// Button wiring (runs immediately — module scripts load after body HTML is ready)
document.getElementById('abConfirmBtn')?.addEventListener('click', confirmAssign);
document.getElementById('abCancelBtn')?.addEventListener('click', closeAssignModal);
document.getElementById('abCloseBtn')?.addEventListener('click', () => window.closeAndroidBay());
document.getElementById('abAssignOverlay')?.addEventListener('click', e => {
  if (e.target === document.getElementById('abAssignOverlay')) closeAssignModal();
});
document.getElementById('abManageConfirmBtn')?.addEventListener('click', confirmManage);
document.getElementById('abManageCancelBtn')?.addEventListener('click', closeManageModal);
document.getElementById('abReleaseBtn')?.addEventListener('click', releaseUnit);
document.getElementById('abInterrogateBtn')?.addEventListener('click', () => {
  if (!manageBay) return;
  const bayId = manageBay;
  const p = pods[bayId];
  if (!p) return;
  closeManageModal();
  window.openMutherTerminal?.(bayId, p);
});
document.getElementById('abManageOverlay')?.addEventListener('click', e => {
  if (e.target === document.getElementById('abManageOverlay')) closeManageModal();
});

// ── Public API ────────────────────────────────────────────────────────────────

window.openAndroidBay = function (opts = {}) {
  // Auto-spectator: if another driver is already running a session, join as spectator
  // instead of overwriting it. Prevents two-driver races on the header-button path.
  let asSpectator = !!opts.spectator;
  if (!asSpectator && _session && _session.driverId && _session.driverId !== window.myId) {
    asSpectator = true;
  }
  _isDriver    = !asSpectator;
  _isSpectator = asSpectator;
  window._bayIsSpectator = _isSpectator;
  document.body.classList.toggle('bay-spectator', _isSpectator);

  const banner = document.getElementById('abDriverBanner');
  if (banner) {
    banner.textContent = asSpectator
      ? `VIEWING ${(_session?.driver || 'GM').toUpperCase()}'S SESSION`
      : '';
    banner.style.display = asSpectator ? 'flex' : 'none';
  }

  if (window.pauseAlienHuntLoop) window.pauseAlienHuntLoop();
  const overlay = document.getElementById('androidBayOverlay');
  overlay.style.display = 'flex';
  overlay.querySelectorAll('*').forEach(el => el.style.animationPlayState = '');
  placeRivets();
  startClock();
  fullRenderGrid();
  initCRTCanvas();
  attachBayListener();

  if (_isDriver) {
    const newSession = {
      driver:      window.myName || '—',
      driverId:    window.myId   || '—',
      ts:          Date.now(),
      bayOpen:     true,
      assignModal: null,
      manageModal: null,
      muthurOpen:  null,
    };
    _session = newSession;
    writeFullSession(newSession);
  } else if (_session) {
    applyRemoteSession(_session);
  }
};

window.closeAndroidBay = function () {
  const wasDriver = _isDriver;
  _isDriver    = false;
  _isSpectator = false;
  window._bayIsSpectator = false;
  document.body.classList.remove('bay-spectator');

  doLocalClose();

  if (wasDriver) clearSession();
};

// Wire invite buttons + start global session listener
document.getElementById('abInviteJoinBtn')?.addEventListener('click', acceptInvite);
document.getElementById('abInviteDismissBtn')?.addEventListener('click', declineInvite);
startSessionListener();
