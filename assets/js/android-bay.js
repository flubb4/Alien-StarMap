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
const sealTimers = {};

// ── Pod rendering ─────────────────────────────────────────────────────────────

function renderPod(bayId) {
  const p = pods[bayId];
  const state = p ? (p.state || 'occupied') : 'empty';

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
    el.addEventListener('click', () => openAssignModal(el.dataset.bay));
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAssignModal(el.dataset.bay); }
    });
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
  document.querySelectorAll('#androidBayOverlay .ab-cond-opt').forEach(x => x.classList.remove('ab-sel'));
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

function confirmAssign() {
  if (!openBay || !pickedAndroid || !pickedCond) return;
  const bayId = openBay;
  const android = { ...pickedAndroid };
  const cond = pickedCond;
  closeAssignModal();

  // Immediate local update — grid responds instantly regardless of Firebase
  pods[bayId] = { state: 'sealing', desig: android.desig, cls: android.cls, cond };
  renderGrid();

  // Sync to Firebase (best-effort — other players see it too)
  if (window.db) {
    const bayRef = ref(window.db, `android-bay/pods/${bayId}`);
    set(bayRef, pods[bayId]).catch(err => console.error('[AndroidBay] write error:', err));

    if (sealTimers[bayId]) clearTimeout(sealTimers[bayId]);
    sealTimers[bayId] = setTimeout(() => {
      pods[bayId] = { state: 'occupied', desig: android.desig, cls: android.cls, cond };
      renderGrid();
      set(bayRef, pods[bayId]).catch(err => console.error('[AndroidBay] write error:', err));
      delete sealTimers[bayId];
    }, 4000);
  }
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
    pods = snap.val() || {};
    renderGrid();
  });
});

// ── Event listeners ───────────────────────────────────────────────────────────

// Condition select
document.addEventListener('click', e => {
  const opt = e.target.closest('#androidBayOverlay .ab-cond-opt');
  if (!opt) return;
  document.querySelectorAll('#androidBayOverlay .ab-cond-opt').forEach(x => x.classList.remove('ab-sel'));
  opt.classList.add('ab-sel');
  pickedCond = opt.dataset.cond;
  updateConfirmBtn();
});

// ESC / Enter
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const ao = document.getElementById('abAssignOverlay');
    if (ao?.classList.contains('open')) { closeAssignModal(); return; }
    const overlay = document.getElementById('androidBayOverlay');
    if (overlay?.style.display !== 'none') window.closeAndroidBay();
    return;
  }
  if (e.key === 'Enter') {
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

// ── Public API ────────────────────────────────────────────────────────────────

window.openAndroidBay = function () {
  const overlay = document.getElementById('androidBayOverlay');
  overlay.style.display = 'flex';
  overlay.querySelectorAll('*').forEach(el => el.style.animationPlayState = '');
  placeRivets();
  startClock();
  renderGrid();
};

window.closeAndroidBay = function () {
  const overlay = document.getElementById('androidBayOverlay');
  overlay.querySelectorAll('*').forEach(el => el.style.animationPlayState = 'paused');
  overlay.style.display = 'none';
  closeAssignModal();
  stopClock();
};
