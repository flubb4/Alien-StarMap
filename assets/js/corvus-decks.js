// ── CM-90 CORVUS — Interactive Deck Viewer ──────────────────────────────────
// Player-facing: lets the crew browse the ship deck-by-deck with pan/zoom.

// Each deck has clickable rooms defined in NORMALIZED coordinates (0–1) of the
// deck image. Adjust x/y/w/h here to refine room hit-boxes. Origin = top-left.
const CV_DECKS = [
  {
    id: 'A', name: 'UPPER EMERGENCY', sub: 'LIFE SUPPORT · ESCAPE PODS',
    file: 'assets/images/corvus/deck-a.png',
    rooms: [
      { id: 'a-scrub',  name: 'Air Scrubbers',     x: 0.470, y: 0.110, w: 0.090, h: 0.090 },
      { id: 'a-svc-w',  name: 'Service Access W',  x: 0.380, y: 0.260, w: 0.080, h: 0.170 },
      { id: 'a-svc-e',  name: 'Airlock Control',   x: 0.560, y: 0.260, w: 0.080, h: 0.170 },
      { id: 'a-ualock', name: 'Upper Airlock',     x: 0.470, y: 0.275, w: 0.090, h: 0.105 },
      { id: 'a-stor',   name: 'Storage',           x: 0.470, y: 0.430, w: 0.090, h: 0.090 },
      { id: 'a-alock',  name: 'Airlock',           x: 0.470, y: 0.535, w: 0.090, h: 0.090 },
      { id: 'a-eev',    name: 'E.E.V. (Escape Pod)', x: 0.445, y: 0.660, w: 0.140, h: 0.200 },
    ],
  },
  {
    id: 'B', name: 'CARGO BAY', sub: 'MAIN HOLD · LOADING RAMP',
    file: 'assets/images/corvus/deck-b.png',
    rooms: [
      { id: 'b-alock-n', name: 'Top Airlock',       x: 0.470, y: 0.070, w: 0.090, h: 0.090 },
      { id: 'b-cargo',   name: 'Cargo Bay',         x: 0.420, y: 0.190, w: 0.190, h: 0.560 },
      { id: 'b-svc-w',   name: 'Service Corridor W',x: 0.345, y: 0.250, w: 0.075, h: 0.420 },
      { id: 'b-svc-e',   name: 'Service Corridor E',x: 0.610, y: 0.250, w: 0.075, h: 0.420 },
      { id: 'b-ramp',    name: 'Loading Ramp / Airlock', x: 0.430, y: 0.770, w: 0.170, h: 0.120 },
    ],
  },
  {
    id: 'C', name: 'HABITATION', sub: 'CREW QUARTERS · CATWALK',
    file: 'assets/images/corvus/deck-c.png',
    rooms: [
      { id: 'c-cq-w',  name: 'Crew Quarters (West)',  x: 0.330, y: 0.140, w: 0.140, h: 0.180 },
      { id: 'c-cq-e',  name: 'Crew Quarters (East)',  x: 0.530, y: 0.140, w: 0.140, h: 0.180 },
      { id: 'c-cw-n',  name: 'Catwalk (North)',       x: 0.470, y: 0.140, w: 0.060, h: 0.180 },
      { id: 'c-cw-w',  name: 'Catwalk (West)',        x: 0.330, y: 0.330, w: 0.080, h: 0.380 },
      { id: 'c-cw-e',  name: 'Catwalk (East)',        x: 0.590, y: 0.330, w: 0.080, h: 0.380 },
      { id: 'c-open',  name: 'Open to Deck D',        x: 0.410, y: 0.330, w: 0.180, h: 0.380 },
      { id: 'c-cw-s',  name: 'Catwalk (South)',       x: 0.380, y: 0.710, w: 0.240, h: 0.090 },
    ],
  },
  {
    id: 'D', name: 'COMMAND', sub: 'BRIDGE · GALLEY · UPPER ENG',
    file: 'assets/images/corvus/deck-d.png',
    rooms: [
      { id: 'd-stor',  name: 'Storage Overlook',     x: 0.440, y: 0.130, w: 0.130, h: 0.150 },
      { id: 'd-open',  name: 'Open Deck',            x: 0.560, y: 0.130, w: 0.110, h: 0.150 },
      { id: 'd-galley',name: 'Galley',               x: 0.330, y: 0.280, w: 0.160, h: 0.220 },
      { id: 'd-corr',  name: 'Corridor',             x: 0.490, y: 0.280, w: 0.180, h: 0.220 },
      { id: 'd-open-e',name: 'Open to Deck E',       x: 0.380, y: 0.520, w: 0.260, h: 0.300 },
      { id: 'd-svc-w', name: 'Service Door W',       x: 0.290, y: 0.520, w: 0.080, h: 0.300 },
      { id: 'd-svc-e', name: 'Service Door E',       x: 0.650, y: 0.520, w: 0.080, h: 0.300 },
    ],
  },
  {
    id: 'E', name: 'ENGINEERING', sub: 'REACTOR · HANGAR · MED',
    file: 'assets/images/corvus/deck-e.png',
    rooms: [
      { id: 'e-motion',  name: 'Motion Tracker Room', x: 0.460, y: 0.140, w: 0.110, h: 0.090 },
      { id: 'e-reactor', name: 'Reactor Compartment', x: 0.420, y: 0.250, w: 0.180, h: 0.150 },
      { id: 'e-med',     name: 'Medical Facility',    x: 0.310, y: 0.310, w: 0.110, h: 0.190 },
      { id: 'e-eng',     name: 'Engineering',         x: 0.600, y: 0.310, w: 0.110, h: 0.190 },
      { id: 'e-hangar',  name: 'Hangar',              x: 0.340, y: 0.510, w: 0.350, h: 0.300 },
      { id: 'e-ramp',    name: 'Ramp / Airlock',      x: 0.430, y: 0.820, w: 0.170, h: 0.070 },
    ],
  },
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
let cvDragMoved = false;
let cvDragStartX = 0;
let cvDragStartY = 0;
let cvDragPanX = 0;
let cvDragPanY = 0;
let cvKeyHandlerBound = false;
let cvClockTimer = null;
let cvSelectedRoom = null;   // { deckIdx, roomId } or null
const CV_SVG_NS = 'http://www.w3.org/2000/svg';

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
          <svg viewBox="0 0 40 40" width="34" height="34">
            <polygon points="20,3 35,11 35,29 20,37 5,29 5,11" fill="none" stroke="#ff9a3c" stroke-width="1.4"/>
            <circle cx="20" cy="20" r="7" fill="none" stroke="#ff9a3c" stroke-width="1"/>
            <circle cx="20" cy="20" r="2.4" fill="#ff9a3c"/>
            <line x1="6" y1="34" x2="34" y2="6" stroke="#ff9a3c" stroke-width="1" opacity=".55"/>
          </svg>
        </div>
        <div class="cv-title-block">
          <div class="cv-header-title">CM-90 CORVUS · SCHEMATICS</div>
          <div class="cv-header-sub">// CORVUS SALVAGE &amp; RECOVERY · COMMERCIAL SALVAGE VESSEL</div>
        </div>
        <div class="cv-hdr-right">
          <div class="cv-clock" id="cvClock">2183.000 · 00:00:00 SHIP-TIME</div>
          <div class="cv-pill">SCHEMATIC ONLINE</div>
        </div>
        <button class="cv-close" id="cvCloseBtn" type="button">[ ESC ] CLOSE</button>
      </header>

      <div class="cv-tabs" id="cvTabs">${tabs}</div>

      <div class="cv-body">
        <div class="cv-stage-col">

          <div class="cv-title-card">
            <span class="cv-corner tl"></span>
            <span class="cv-corner tr"></span>
            <span class="cv-corner bl"></span>
            <span class="cv-corner br"></span>
            <div class="cv-sheet-title" id="cvSheetTitle">DECK A</div>
            <div class="cv-sheet-sub">
              <span id="cvSheetSub">UPPER EMERGENCY · LIFE SUPPORT</span>
              <span class="cv-tag" id="cvSheetLevel">LEVEL 5/5</span>
              <span class="cv-tag cv-tag--room" id="cvSelectedRoomTag" style="display:none">— SELECT ROOM —</span>
            </div>
          </div>

          <div class="cv-stage-wrap" id="cvStageWrap">
            <div class="cv-stage-hud tl">
              <div>// DECK <span class="v" id="cvHudDeck">A</span></div>
              <div>// FRAME <span class="v" id="cvHudFrame">DK-A/01</span></div>
            </div>
            <div class="cv-stage-hud br">
              <div>SCAN INTEGRITY · <span class="v">98.4%</span></div>
              <div>SCHEMATIC REV · <span class="v">04.21</span></div>
            </div>

            <div class="cv-stage" id="cvStage">
              <div class="cv-deck-frame" id="cvDeckFrame">
                <img id="cvDeckImg" alt="Corvus deck schematic" draggable="false">
                <svg id="cvRooms" class="cv-rooms" viewBox="0 0 1 1" preserveAspectRatio="none"></svg>
              </div>
            </div>

            <div class="cv-zoom-bar">
              <button class="cv-zoom-btn" id="cvZoomOut" type="button" title="Zoom out">−</button>
              <span class="cv-zoom-readout" id="cvZoomReadout">100%</span>
              <button class="cv-zoom-btn" id="cvZoomIn" type="button" title="Zoom in">+</button>
              <button class="cv-zoom-btn cv-reset" id="cvZoomReset" type="button" title="Reset (R)">RESET</button>
            </div>
          </div>

        </div>

        <aside class="cv-profile">
          <div class="cv-profile-head">
            <div class="cv-profile-title">VERTICAL PROFILE</div>
            <div class="cv-profile-sub">// SECTION VIEW · DECKS A–E</div>
          </div>
          <div class="cv-cross" id="cvCross">${profile}</div>
          <div class="cv-spec">
            <div class="cv-spec-title">// VESSEL SPEC</div>
            <div class="cv-spec-grid">${stats}</div>
          </div>
        </aside>
      </div>

      <footer class="cv-footer">
        <div class="cv-hint">
          <kbd>CLICK</kbd> ROOM ·
          <kbd>↑</kbd><kbd>↓</kbd> DECK ·
          <kbd>1</kbd>–<kbd>5</kbd> JUMP ·
          <kbd>WHEEL</kbd> ZOOM ·
          <kbd>DRAG</kbd> PAN ·
          <kbd>R</kbd> RESET ·
          <kbd>ESC</kbd> CLOSE
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
    cvDragMoved = false;
    cvDragStartX = e.clientX;
    cvDragStartY = e.clientY;
    cvDragPanX = cvPanX;
    cvDragPanY = cvPanY;
    stage.classList.add('dragging');
  });

  window.addEventListener('mousemove', (e) => {
    if (!cvDragging) return;
    const dx = e.clientX - cvDragStartX;
    const dy = e.clientY - cvDragStartY;
    if (!cvDragMoved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) cvDragMoved = true;
    cvPanX = cvDragPanX + dx;
    cvPanY = cvDragPanY + dy;
    cvApplyTransform();
  });

  window.addEventListener('mouseup', () => {
    if (!cvDragging) return;
    cvDragging = false;
    stage.classList.remove('dragging');
  });

  // Room click (delegated). SVG rects fire click before stage; if it was a real
  // click (no drag), select the room.
  cvEl('cvRooms').addEventListener('click', (e) => {
    const rect = e.target.closest('.cv-room');
    if (!rect) return;
    e.stopPropagation();
    if (cvDragMoved) return;
    const id = rect.dataset.id;
    if (cvSelectedRoom && cvSelectedRoom.roomId === id) cvClearRoomSelection();
    else cvSelectRoom(id);
  });

  // Click on empty stage = deselect (only if not a drag)
  stage.addEventListener('click', (e) => {
    if (cvDragMoved) return;
    if (e.target.closest('.cv-room')) return;
    cvClearRoomSelection();
  });

  stage.addEventListener('dblclick', (e) => {
    if (e.target.closest('.cv-room')) return;
    cvResetView();
  });

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

  if (e.key === 'Escape') {
    e.preventDefault();
    if (cvSelectedRoom) cvClearRoomSelection();
    else closeCorvusDecks();
    return;
  }
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

  const img = cvEl('cvDeckImg');
  img.onload = () => {
    const frame = cvEl('cvDeckFrame');
    frame.style.setProperty('--cv-deck-ratio', `${img.naturalWidth} / ${img.naturalHeight}`);
  };
  img.src = d.file;

  cvEl('cvSheetTitle').textContent = `DECK ${d.id}`;
  cvEl('cvSheetSub').textContent = `${d.name} · ${d.sub}`;
  cvEl('cvSheetLevel').textContent = `LEVEL ${CV_DECKS.length - idx}/${CV_DECKS.length}`;
  cvEl('cvHudDeck').textContent = d.id;
  cvEl('cvHudFrame').textContent = `DK-${d.id}/01`;

  document.querySelectorAll('#cvTabs .cv-tab').forEach((b, i) => {
    b.classList.toggle('active', i === idx);
  });
  document.querySelectorAll('#cvCross .cv-cross-deck').forEach((b, i) => {
    b.classList.toggle('active', i === idx);
  });

  cvRenderRooms(d);
  cvClearRoomSelection();
  cvResetView();
}

function cvRenderRooms(deck) {
  const svg = cvEl('cvRooms');
  svg.innerHTML = '';
  (deck.rooms || []).forEach(r => {
    const rect = document.createElementNS(CV_SVG_NS, 'rect');
    rect.setAttribute('x', r.x);
    rect.setAttribute('y', r.y);
    rect.setAttribute('width', r.w);
    rect.setAttribute('height', r.h);
    rect.setAttribute('class', 'cv-room');
    rect.dataset.id = r.id;
    rect.dataset.name = r.name;
    // SVG <title> gives a native tooltip on hover
    const title = document.createElementNS(CV_SVG_NS, 'title');
    title.textContent = r.name;
    rect.appendChild(title);
    svg.appendChild(rect);
  });
}

function cvSelectRoom(roomId) {
  const deck = CV_DECKS[cvCurrent];
  const room = (deck.rooms || []).find(r => r.id === roomId);
  if (!room) return;
  cvSelectedRoom = { deckIdx: cvCurrent, roomId };
  document.querySelectorAll('#cvRooms .cv-room').forEach(el => {
    el.classList.toggle('selected', el.dataset.id === roomId);
  });
  const tag = cvEl('cvSelectedRoomTag');
  tag.textContent = `▸ ${room.name.toUpperCase()}`;
  tag.style.display = '';
}

function cvClearRoomSelection() {
  cvSelectedRoom = null;
  document.querySelectorAll('#cvRooms .cv-room').forEach(el => el.classList.remove('selected'));
  const tag = cvEl('cvSelectedRoomTag');
  if (tag) tag.style.display = 'none';
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
