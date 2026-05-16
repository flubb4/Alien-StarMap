// ── CM-90 CORVUS — Interactive Deck Viewer ──────────────────────────────────
// Player-facing: lets the crew browse the ship deck-by-deck with pan/zoom.

const CV_DECKS = [
  { id: 'A', name: 'UPPER EMERGENCY',  sub: 'LIFE SUPPORT · ESCAPE PODS',     file: 'assets/images/corvus/deck-a.png' },
  { id: 'B', name: 'CARGO BAY',        sub: 'MAIN HOLD · LOADING RAMP',       file: 'assets/images/corvus/deck-b.png' },
  { id: 'C', name: 'HABITATION',       sub: 'CREW QUARTERS · CATWALK',        file: 'assets/images/corvus/deck-c.png' },
  { id: 'D', name: 'COMMAND',          sub: 'BRIDGE · GALLEY · UPPER ENG',    file: 'assets/images/corvus/deck-d.png' },
  { id: 'E', name: 'ENGINEERING',      sub: 'REACTOR · HANGAR · MED',         file: 'assets/images/corvus/deck-e.png' },
];

const CV_STATS = [
  ['CLASS',    'CM-90'],
  ['TYPE',     'COMM. SALVAGE'],
  ['CREW',     '6 MAX'],
  ['LENGTH',   '32.5 M'],
  ['HEIGHT',   '11.2 M'],
  ['MASS',     '210 T'],
  ['POWER',    'FUSION'],
  ['MANUF.',   'GEMINI APEX'],
];

let cvCurrent = 0;     // index into CV_DECKS
let cvZoom    = 1;
let cvPanX    = 0;
let cvPanY    = 0;
let cvDragging = false;
let cvDragStartX = 0;
let cvDragStartY = 0;
let cvDragPanX = 0;
let cvDragPanY = 0;
let cvKeyHandlerBound = false;
let cvClockTimer = null;

function cvEl(id) { return document.getElementById(id); }

function cvBuildOverlay() {
  if (cvEl('corvusOverlay')) return;

  const tabs = CV_DECKS.map((d, i) => `
    <button class="cv-tab" data-idx="${i}" type="button">
      <span class="cv-tab-id">DECK ${d.id}</span>
      <span class="cv-tab-name">${d.name}</span>
    </button>
  `).join('');

  const profile = CV_DECKS.map((d, i) => `
    <div class="cv-cross-deck" data-idx="${i}">
      <div class="cv-cd-id">DECK ${d.id}</div>
      <div class="cv-cd-name">${d.name}</div>
    </div>
  `).join('');

  const stats = CV_STATS.map(([k, v]) =>
    `<span class="k">${k}</span><span class="v">${v}</span>`
  ).join('');

  const html = `
    <div id="corvusOverlay" role="dialog" aria-modal="true" aria-label="CM-90 Corvus deck viewer">

      <header class="cv-header">
        <div class="cv-mark">
          <svg viewBox="0 0 40 40" width="38" height="38">
            <polygon points="20,3 35,11 35,29 20,37 5,29 5,11" fill="none" stroke="#f5a623" stroke-width="1.4"/>
            <circle cx="20" cy="20" r="7" fill="none" stroke="#f5a623" stroke-width="1"/>
            <circle cx="20" cy="20" r="2.4" fill="#f5a623"/>
            <line x1="6" y1="34" x2="34" y2="6" stroke="#f5a623" stroke-width="1" opacity=".55"/>
          </svg>
        </div>
        <div class="cv-title-block">
          <div class="cv-eyebrow">// CORVUS SALVAGE &amp; RECOVERY // SCHEMATICS</div>
          <div class="cv-title">CM-90 CORVUS</div>
          <div class="cv-subtitle">COMMERCIAL SALVAGE VESSEL · <span id="cvDeckSub">DECK A · UPPER EMERGENCY</span></div>
        </div>
        <div class="cv-hdr-right">
          <div class="cv-clock" id="cvClock">2183.000 · 00:00:00 SHIP-TIME</div>
          <div class="cv-pill">SCHEMATIC ONLINE</div>
        </div>
        <button class="cv-close-btn" id="cvCloseBtn" type="button">[ ESC ] CLOSE</button>
      </header>

      <div class="cv-tabs" id="cvTabs">${tabs}</div>

      <div class="cv-body">
        <div class="cv-stage-wrap" id="cvStageWrap">
          <span class="cv-stage-corner tl"></span>
          <span class="cv-stage-corner tr"></span>
          <span class="cv-stage-corner bl"></span>
          <span class="cv-stage-corner br"></span>

          <div class="cv-stage-hud tl">
            <div>// DECK <span class="v" id="cvHudDeck">A</span></div>
            <div>// LEVEL <span class="v" id="cvHudLevel">5/5</span></div>
          </div>
          <div class="cv-stage-hud br">
            <div>FRAME REF · <span class="v">DK-A/01</span></div>
            <div>SCAN INTEGRITY · <span class="v">98.4%</span></div>
          </div>

          <div class="cv-stage" id="cvStage">
            <img id="cvDeckImg" alt="Corvus deck schematic" draggable="false">
          </div>

          <div class="cv-zoom-bar">
            <button class="cv-zoom-btn" id="cvZoomOut" type="button" title="Zoom out">−</button>
            <span class="cv-zoom-readout" id="cvZoomReadout">100%</span>
            <button class="cv-zoom-btn" id="cvZoomIn" type="button" title="Zoom in">+</button>
            <button class="cv-zoom-btn" id="cvZoomReset" type="button" title="Reset (R)" style="width:auto;padding:0 10px;font-size:10px;letter-spacing:2px;">RESET</button>
          </div>
        </div>

        <aside class="cv-profile">
          <div class="cv-profile-title">// VERTICAL PROFILE</div>
          <div class="cv-profile-sub">SECTION VIEW · DECKS A–E</div>
          <div class="cv-cross" id="cvCross">${profile}</div>
          <div class="cv-ship-silhouette">
            <div class="lbl">// VESSEL SPEC</div>
            <div class="cv-ship-stats">${stats}</div>
          </div>
        </aside>
      </div>

      <footer class="cv-footer">
        <div class="cv-hint">
          <kbd>↑</kbd><kbd>↓</kbd> deck ·
          <kbd>1</kbd>–<kbd>5</kbd> jump ·
          <kbd>wheel</kbd> zoom ·
          <kbd>drag</kbd> pan ·
          <kbd>R</kbd> reset ·
          <kbd>ESC</kbd> close
        </div>
        <div>WEYLAND-YUTANI CORP · CLASSIFIED · 2183</div>
      </footer>
    </div>
  `;

  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  document.body.appendChild(wrap.firstElementChild);

  cvBindEvents();
}

function cvBindEvents() {
  cvEl('cvCloseBtn').addEventListener('click', closeCorvusDecks);

  cvEl('cvTabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.cv-tab');
    if (!btn) return;
    cvSwitchDeck(+btn.dataset.idx);
  });

  cvEl('cvCross').addEventListener('click', (e) => {
    const row = e.target.closest('.cv-cross-deck');
    if (!row) return;
    cvSwitchDeck(+row.dataset.idx);
  });

  cvEl('cvZoomIn').addEventListener('click',    () => cvSetZoom(cvZoom * 1.25));
  cvEl('cvZoomOut').addEventListener('click',   () => cvSetZoom(cvZoom / 1.25));
  cvEl('cvZoomReset').addEventListener('click', cvResetView);

  const stage = cvEl('cvStageWrap');

  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    cvSetZoom(cvZoom * factor);
  }, { passive: false });

  stage.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    cvDragging = true;
    cvDragStartX = e.clientX;
    cvDragStartY = e.clientY;
    cvDragPanX = cvPanX;
    cvDragPanY = cvPanY;
    stage.classList.add('dragging');
  });

  window.addEventListener('mousemove', (e) => {
    if (!cvDragging) return;
    cvPanX = cvDragPanX + (e.clientX - cvDragStartX);
    cvPanY = cvDragPanY + (e.clientY - cvDragStartY);
    cvApplyTransform();
  });

  window.addEventListener('mouseup', () => {
    if (!cvDragging) return;
    cvDragging = false;
    stage.classList.remove('dragging');
  });

  stage.addEventListener('dblclick', cvResetView);

  if (!cvKeyHandlerBound) {
    document.addEventListener('keydown', cvOnKey);
    cvKeyHandlerBound = true;
  }
}

function cvOnKey(e) {
  const ov = cvEl('corvusOverlay');
  if (!ov || !ov.classList.contains('open')) return;
  // ignore when typing in an input
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

  if (e.key === 'Escape')       { e.preventDefault(); closeCorvusDecks(); return; }
  if (e.key === 'ArrowUp')      { e.preventDefault(); cvSwitchDeck(cvCurrent - 1); return; }
  if (e.key === 'ArrowDown')    { e.preventDefault(); cvSwitchDeck(cvCurrent + 1); return; }
  if (e.key === 'r' || e.key === 'R') { e.preventDefault(); cvResetView(); return; }
  if (e.key === '+' || e.key === '=') { e.preventDefault(); cvSetZoom(cvZoom * 1.25); return; }
  if (e.key === '-' || e.key === '_') { e.preventDefault(); cvSetZoom(cvZoom / 1.25); return; }
  if (/^[1-5]$/.test(e.key))    { e.preventDefault(); cvSwitchDeck(+e.key - 1); return; }
}

function cvSwitchDeck(idx) {
  if (idx < 0 || idx >= CV_DECKS.length) return;
  cvCurrent = idx;
  const d = CV_DECKS[idx];

  cvEl('cvDeckImg').src = d.file;
  cvEl('cvDeckSub').textContent = `DECK ${d.id} · ${d.name}`;
  cvEl('cvHudDeck').textContent = d.id;
  cvEl('cvHudLevel').textContent = `${CV_DECKS.length - idx}/${CV_DECKS.length}`;

  document.querySelectorAll('#cvTabs .cv-tab').forEach((b, i) => {
    b.classList.toggle('active', i === idx);
  });
  document.querySelectorAll('#cvCross .cv-cross-deck').forEach((b, i) => {
    b.classList.toggle('active', i === idx);
  });

  cvResetView();
}

function cvSetZoom(z) {
  cvZoom = Math.max(0.5, Math.min(5, z));
  cvApplyTransform();
  cvEl('cvZoomReadout').textContent = Math.round(cvZoom * 100) + '%';
}

function cvApplyTransform() {
  const stage = cvEl('cvStage');
  if (!stage) return;
  stage.style.transform = `translate(${cvPanX}px, ${cvPanY}px) scale(${cvZoom})`;
}

function cvResetView() {
  cvZoom = 1; cvPanX = 0; cvPanY = 0;
  cvApplyTransform();
  const r = cvEl('cvZoomReadout');
  if (r) r.textContent = '100%';
}

function cvStartClock() {
  if (cvClockTimer) return;
  const tick = () => {
    const el = cvEl('cvClock');
    if (!el) return;
    const now = new Date();
    const doy = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    el.textContent = `2183.${String(doy).padStart(3, '0')} · ${hh}:${mm}:${ss} SHIP-TIME`;
  };
  tick();
  cvClockTimer = setInterval(tick, 1000);
}

function cvStopClock() {
  if (cvClockTimer) { clearInterval(cvClockTimer); cvClockTimer = null; }
}

// ── Public API ─────────────────────────────────────────────────────────────
window.openCorvusDecks = function openCorvusDecks(startDeck) {
  cvBuildOverlay();
  const ov = cvEl('corvusOverlay');
  ov.classList.add('open');

  let idx = 0;
  if (typeof startDeck === 'string') {
    const i = CV_DECKS.findIndex(d => d.id.toUpperCase() === startDeck.toUpperCase());
    if (i >= 0) idx = i;
  } else if (typeof startDeck === 'number') {
    idx = Math.max(0, Math.min(CV_DECKS.length - 1, startDeck));
  }
  cvSwitchDeck(idx);
  cvStartClock();
};

window.closeCorvusDecks = function closeCorvusDecks() {
  const ov = cvEl('corvusOverlay');
  if (ov) ov.classList.remove('open');
  cvStopClock();
};
