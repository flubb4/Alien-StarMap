import { ref, onValue, set } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

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

function renderGrid() {
  const grid = document.getElementById('abGrid');
  if (!grid) return;
  grid.innerHTML = BAY_IDS.map(renderPod).join('');
  bindEmptyClicks();
  bindOccupiedClicks();
  updateCounter();
}

function updateCounter() {
  const n = BAY_IDS.filter(id => pods[id] && pods[id] !== null).length;
  const valEl = document.querySelector('#androidBayOverlay .ab-val');
  if (valEl) valEl.textContent = String(n).padStart(2, '0');
  const sealEl = document.getElementById('abSealReadout');
  if (sealEl) sealEl.textContent = `${n} / 10 LOCKED`;
}

function bindEmptyClicks() {
  document.querySelectorAll('#abGrid .ab-pod[data-state="empty"]').forEach(el => {
    const glow   = el.querySelector('.ab-hover-glow');
    const prompt = el.querySelector('.ab-hover-prompt');
    el.addEventListener('click',      () => openAssignModal(el.dataset.bay));
    el.addEventListener('keydown',    e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAssignModal(el.dataset.bay); } });
    el.addEventListener('mouseenter', () => { if (glow) glow.style.opacity = '1'; if (prompt) prompt.style.opacity = '1'; });
    el.addEventListener('mouseleave', () => { if (glow) glow.style.opacity = '0'; if (prompt) prompt.style.opacity = '0'; });
  });
}

function bindOccupiedClicks() {
  document.querySelectorAll('#abGrid .ab-pod[data-state="occupied"]').forEach(el => {
    const glow   = el.querySelector('.ab-hover-glow');
    const prompt = el.querySelector('.ab-hover-prompt');
    el.addEventListener('click',      () => openManageModal(el.dataset.bay));
    el.addEventListener('keydown',    e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openManageModal(el.dataset.bay); } });
    el.addEventListener('mouseenter', () => { if (glow) glow.style.opacity = '1'; if (prompt) prompt.style.opacity = '1'; });
    el.addEventListener('mouseleave', () => { if (glow) glow.style.opacity = '0'; if (prompt) prompt.style.opacity = '0'; });
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
      listEl.querySelectorAll('.ab-android-opt').forEach(x => x.classList.remove('ab-sel'));
      opt.classList.add('ab-sel');
      pickedAndroid = { desig: opt.dataset.desig, cls: opt.dataset.cls };
      updateConfirmBtn();
    });
  });
}

function updateConfirmBtn() {
  const btn = document.getElementById('abConfirmBtn');
  if (btn) btn.disabled = !(pickedAndroid && pickedCond);
}

function openAssignModal(bayId) {
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
}

function closeAssignModal() {
  document.getElementById('abAssignOverlay')?.classList.remove('open');
  openBay = null;
  // Resume pod animations
  document.querySelectorAll('#abGrid *').forEach(el => el.style.animationPlayState = '');
}

// ── Manage modal ──────────────────────────────────────────────────────────────

function openManageModal(bayId) {
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
  document.getElementById('abManageOverlay')?.classList.add('open');
  document.querySelectorAll('#abGrid *').forEach(el => el.style.animationPlayState = 'paused');
}

function closeManageModal() {
  document.getElementById('abManageOverlay')?.classList.remove('open');
  manageBay = null;
  manageCond = null;
  document.querySelectorAll('#abGrid *').forEach(el => el.style.animationPlayState = '');
}

function updateManageConfirmBtn() {
  const btn = document.getElementById('abManageConfirmBtn');
  if (btn) btn.disabled = !manageCond;
}

function confirmManage() {
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
      .then(() => console.log('[AndroidBay] manage write OK:', bayId))
      .catch(err => console.error('[AndroidBay] manage write FAILED:', bayId, err.code, err.message));
  });
}

function releaseUnit() {
  if (!manageBay) return;
  const bayId = manageBay;
  closeManageModal();
  pods[bayId] = null;
  renderGrid();
  window._authReadyPromise.then(() => {
    set(ref(window.db, `android-bay/pods/${bayId}`), null)
      .then(() => console.log('[AndroidBay] release write OK:', bayId))
      .catch(err => console.error('[AndroidBay] release write FAILED:', bayId, err.code, err.message));
  });
}

function confirmAssign() {
  if (!openBay || !pickedAndroid || !pickedCond) return;
  const bayId = openBay;
  const android = { ...pickedAndroid };
  const cond = pickedCond;
  closeAssignModal();

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
        .then(() => console.log('[AndroidBay] sealing write OK:', bayId))
        .catch(err => console.error('[AndroidBay] sealing write FAILED:', bayId, err.code, err.message));

      if (sealTimers[bayId]) clearTimeout(sealTimers[bayId]);
      sealTimers[bayId] = setTimeout(() => {
        pods[bayId] = { state: 'occupied', desig: android.desig, cls: android.cls, cond };
        renderGrid();
        set(bayRef, pods[bayId])
          .then(() => console.log('[AndroidBay] occupied write OK:', bayId))
          .catch(err => console.error('[AndroidBay] occupied write FAILED:', bayId, err.code, err.message));
        delete sealTimers[bayId];
      }, 4000);
    });
  }, 700);
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

// ── Firebase listener ─────────────────────────────────────────────────────────

// Render immediately with empty pods so the grid is never blank on open
renderGrid();

window._authReadyPromise.then(() => {
  onValue(ref(window.db, 'android-bay/pods'), snap => {
    const raw = snap.val() || {};
    console.log('[AndroidBay] onValue fired — Firebase data:', JSON.stringify(raw));
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
        console.log('[AndroidBay] healing stuck sealing pod:', bayId);
        set(ref(window.db, `android-bay/pods/${bayId}`), healed)
          .then(() => console.log('[AndroidBay] heal write OK:', bayId))
          .catch(err => console.error('[AndroidBay] heal write FAILED:', bayId, err.code, err.message));
      }
    });
    pods = raw;
    renderGrid();
  });
});

// ── Event listeners ───────────────────────────────────────────────────────────

// Condition select
document.addEventListener('click', e => {
  const aOpt = e.target.closest('#abAssignOverlay .ab-cond-opt');
  if (aOpt) {
    document.querySelectorAll('#abAssignOverlay .ab-cond-opt').forEach(x => x.classList.remove('ab-sel'));
    aOpt.classList.add('ab-sel');
    pickedCond = aOpt.dataset.cond;
    updateConfirmBtn();
    return;
  }
  const mOpt = e.target.closest('#abManageOverlay .ab-cond-opt');
  if (mOpt) {
    document.querySelectorAll('#abManageOverlay .ab-cond-opt').forEach(x => x.classList.remove('ab-sel'));
    mOpt.classList.add('ab-sel');
    manageCond = mOpt.dataset.cond;
    updateManageConfirmBtn();
  }
});

// ESC / Enter
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const mo = document.getElementById('abManageOverlay');
    if (mo?.classList.contains('open')) { closeManageModal(); return; }
    const ao = document.getElementById('abAssignOverlay');
    if (ao?.classList.contains('open')) { closeAssignModal(); return; }
    const overlay = document.getElementById('androidBayOverlay');
    if (overlay?.style.display !== 'none') window.closeAndroidBay();
    return;
  }
  if (e.key === 'Enter') {
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
document.getElementById('abManageOverlay')?.addEventListener('click', e => {
  if (e.target === document.getElementById('abManageOverlay')) closeManageModal();
});

// ── Public API ────────────────────────────────────────────────────────────────

window.openAndroidBay = function () {
  if (window.pauseAlienHuntLoop) window.pauseAlienHuntLoop();
  const overlay = document.getElementById('androidBayOverlay');
  overlay.style.display = 'flex';
  overlay.querySelectorAll('*').forEach(el => el.style.animationPlayState = '');
  placeRivets();
  startClock();
  renderGrid();
  initCRTCanvas();
};

window.closeAndroidBay = function () {
  const overlay = document.getElementById('androidBayOverlay');
  overlay.querySelectorAll('*').forEach(el => el.style.animationPlayState = 'paused');
  overlay.style.display = 'none';
  closeAssignModal();
  closeManageModal();
  stopClock();
  if (window.resumeAlienHuntLoop) window.resumeAlienHuntLoop();
};
