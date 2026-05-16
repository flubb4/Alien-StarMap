// ── CM-90 CORVUS — Interactive Deck Viewer ──────────────────────────────────
// Players drop one marker per person to say "I'm here". Markers sync live via
// Firebase. The right-hand profile strip shows who is on each deck.

import {
  ref, onValue, set, remove, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const CV_DECKS = [
  { id: 'A', name: 'UPPER EMERGENCY', sub: 'LIFE SUPPORT · ESCAPE PODS',  file: 'assets/images/corvus/deck-a.png' },
  { id: 'B', name: 'CARGO BAY',       sub: 'MAIN HOLD · LOADING RAMP',    file: 'assets/images/corvus/deck-b.png' },
  { id: 'C', name: 'HABITATION',      sub: 'CREW QUARTERS · CATWALK',     file: 'assets/images/corvus/deck-c.png' },
  { id: 'D', name: 'COMMAND',         sub: 'BRIDGE · GALLEY · UPPER ENG', file: 'assets/images/corvus/deck-d.png' },
  { id: 'E', name: 'ENGINEERING',     sub: 'REACTOR · HANGAR · MED',      file: 'assets/images/corvus/deck-e.png' },
];

const CV_STATS = [
  ['CLASS',  'CM-90'],
  ['TYPE',   'COMM. SALVAGE'],
  ['CREW',   '6 MAX'],
  ['LENGTH', '32.5 M'],
  ['HEIGHT', '11.2 M'],
  ['MASS',   '210 T'],
  ['POWER',  'FUSION'],
  ['MANUF.', 'GEMINI APEX'],
];

// ── State ──────────────────────────────────────────────────────────────────
let cvCurrent    = 0;
let cvZoom       = 1;
let cvPanX       = 0;
let cvPanY       = 0;
let cvDragging   = false;
let cvDragMoved  = false;
let cvDragStartX = 0;
let cvDragStartY = 0;
let cvDragPanX   = 0;
let cvDragPanY   = 0;
let cvKeyHandlerBound = false;
let cvClockTimer = null;

let cvMarkers     = {};        // { uid: { name, color, deck, x, y, ts } }
let cvMarkersUnsub = null;     // Firebase off() callback

function cvEl(id) { return document.getElementById(id); }
function cvMarkersRef() { return ref(window.db, 'session/corvusMarkers'); }
function cvMyMarkerRef() { return ref(window.db, 'session/corvusMarkers/' + window.myId); }

// ── Build overlay ──────────────────────────────────────────────────────────
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
      <div class="cv-cd-head">
        <span class="cv-cd-id">DECK ${d.id}</span>
        <span class="cv-cd-name">${d.name}</span>
      </div>
      <div class="cv-cd-roster" data-deck="${d.id}"></div>
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
              <span class="cv-tag cv-tag--hint">CLICK TO DROP MARKER</span>
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
                <div id="cvMarkerLayer" class="cv-marker-layer"></div>
              </div>
            </div>

            <div class="cv-zoom-bar">
              <button class="cv-zoom-btn" id="cvZoomOut" type="button" title="Zoom out">−</button>
              <span class="cv-zoom-readout" id="cvZoomReadout">100%</span>
              <button class="cv-zoom-btn" id="cvZoomIn" type="button" title="Zoom in">+</button>
              <button class="cv-zoom-btn cv-reset" id="cvZoomReset" type="button" title="Reset (R)">RESET</button>
              <span class="cv-zoom-sep"></span>
              <button class="cv-zoom-btn cv-clear-btn" id="cvClearMarker" type="button" title="Remove your marker">✕ MEIN MARKER</button>
            </div>
          </div>

        </div>

        <aside class="cv-profile">
          <div class="cv-profile-head">
            <div class="cv-profile-title">CREW POSITIONS</div>
            <div class="cv-profile-sub">// VERTICAL PROFILE · DECKS A–E</div>
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
          <kbd>CLICK</kbd> DROP MARKER ·
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

// ── Event wiring ───────────────────────────────────────────────────────────
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
    // ignore clicks on roster pills (they have their own purpose)
    if (e.target.closest('.cv-roster-pill')) return;
    cvSwitchDeck(+row.dataset.idx);
  });

  cvEl('cvZoomIn').addEventListener('click',    () => cvSetZoom(cvZoom * 1.25));
  cvEl('cvZoomOut').addEventListener('click',   () => cvSetZoom(cvZoom / 1.25));
  cvEl('cvZoomReset').addEventListener('click', cvResetView);
  cvEl('cvClearMarker').addEventListener('click', cvRemoveMyMarker);

  const stage = cvEl('cvStageWrap');

  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    cvSetZoom(cvZoom * factor);
  }, { passive: false });

  stage.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    cvDragging   = true;
    cvDragMoved  = false;
    cvDragStartX = e.clientX;
    cvDragStartY = e.clientY;
    cvDragPanX   = cvPanX;
    cvDragPanY   = cvPanY;
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

  // Click on the deck = drop my marker at that spot.
  // Click on a marker that's mine = remove it.
  cvEl('cvDeckFrame').addEventListener('click', (e) => {
    if (cvDragMoved) return;

    const ownMarker = e.target.closest('.cv-marker.is-mine');
    if (ownMarker) {
      cvRemoveMyMarker();
      return;
    }
    // Click on someone else's marker: do nothing (don't reposition through them)
    if (e.target.closest('.cv-marker')) return;

    cvDropMyMarker(e);
  });

  stage.addEventListener('dblclick', (e) => {
    if (e.target.closest('.cv-marker')) return;
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
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

  if (e.key === 'Escape')             { e.preventDefault(); closeCorvusDecks(); return; }
  if (e.key === 'ArrowUp')             { e.preventDefault(); cvSwitchDeck(cvCurrent - 1); return; }
  if (e.key === 'ArrowDown')           { e.preventDefault(); cvSwitchDeck(cvCurrent + 1); return; }
  if (e.key === 'r' || e.key === 'R')  { e.preventDefault(); cvResetView(); return; }
  if (e.key === '+' || e.key === '=')  { e.preventDefault(); cvSetZoom(cvZoom * 1.25); return; }
  if (e.key === '-' || e.key === '_')  { e.preventDefault(); cvSetZoom(cvZoom / 1.25); return; }
  if (/^[1-5]$/.test(e.key))           { e.preventDefault(); cvSwitchDeck(+e.key - 1); return; }
}

// ── Deck switching ─────────────────────────────────────────────────────────
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
  cvEl('cvSheetSub').textContent   = `${d.name} · ${d.sub}`;
  cvEl('cvSheetLevel').textContent = `LEVEL ${CV_DECKS.length - idx}/${CV_DECKS.length}`;
  cvEl('cvHudDeck').textContent    = d.id;
  cvEl('cvHudFrame').textContent   = `DK-${d.id}/01`;

  document.querySelectorAll('#cvTabs .cv-tab').forEach((b, i) => b.classList.toggle('active', i === idx));
  document.querySelectorAll('#cvCross .cv-cross-deck').forEach((b, i) => b.classList.toggle('active', i === idx));

  cvRenderMarkers();
  cvResetView();
}

// ── Zoom / pan ─────────────────────────────────────────────────────────────
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

// ── Marker logic ───────────────────────────────────────────────────────────
function cvEventToNorm(e) {
  const frame = cvEl('cvDeckFrame');
  const r = frame.getBoundingClientRect();
  const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  const y = Math.max(0, Math.min(1, (e.clientY - r.top)  / r.height));
  return { x, y };
}

async function cvDropMyMarker(e) {
  if (!window.myId || !window.db) return;
  const { x, y } = cvEventToNorm(e);
  const deck = CV_DECKS[cvCurrent].id;
  try {
    await set(cvMyMarkerRef(), {
      name:  window.myName || 'OPERATIVE',
      color: window.selectedColor || '#ff9a3c',
      deck, x, y,
      ts: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Could not set Corvus marker:', err);
  }
}

async function cvRemoveMyMarker() {
  if (!window.myId || !window.db) return;
  try { await remove(cvMyMarkerRef()); }
  catch (err) { console.warn('Could not remove Corvus marker:', err); }
}

function cvSubscribeMarkers() {
  if (cvMarkersUnsub) return;
  cvMarkersUnsub = onValue(cvMarkersRef(), (snap) => {
    cvMarkers = snap.val() || {};
    cvRenderMarkers();
    cvRenderRoster();
  });
}
function cvUnsubscribeMarkers() {
  if (cvMarkersUnsub) { cvMarkersUnsub(); cvMarkersUnsub = null; }
}

function cvRenderMarkers() {
  const layer = cvEl('cvMarkerLayer');
  if (!layer) return;
  layer.innerHTML = '';
  const currentDeckId = CV_DECKS[cvCurrent].id;

  Object.entries(cvMarkers).forEach(([uid, m]) => {
    if (!m || m.deck !== currentDeckId) return;
    const mine = uid === window.myId;
    const el = document.createElement('div');
    el.className = 'cv-marker' + (mine ? ' is-mine' : '');
    el.style.left  = (m.x * 100) + '%';
    el.style.top   = (m.y * 100) + '%';
    el.style.setProperty('--cv-mk-color', m.color || '#ff9a3c');
    el.title = m.name + (mine ? ' (du)' : '');
    el.innerHTML = `
      <div class="cv-marker-dot"></div>
      <div class="cv-marker-label">${cvEsc(m.name || 'OP')}</div>
    `;
    layer.appendChild(el);
  });
}

function cvRenderRoster() {
  const counts = {}; // deckId -> [{name, color, mine}]
  Object.entries(cvMarkers).forEach(([uid, m]) => {
    if (!m || !m.deck) return;
    (counts[m.deck] = counts[m.deck] || []).push({
      name: m.name || 'OP',
      color: m.color || '#ff9a3c',
      mine: uid === window.myId,
    });
  });

  document.querySelectorAll('#cvCross .cv-cd-roster').forEach((node) => {
    const deckId = node.dataset.deck;
    const list = counts[deckId] || [];
    if (list.length === 0) {
      node.innerHTML = '<span class="cv-roster-empty">— empty —</span>';
      return;
    }
    node.innerHTML = list.map(p => `
      <span class="cv-roster-pill${p.mine ? ' is-mine' : ''}" style="--cv-pill-color:${p.color}">
        <span class="cv-roster-dot"></span>${cvEsc(p.name)}
      </span>
    `).join('');
  });
}

function cvEsc(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// ── Clock ──────────────────────────────────────────────────────────────────
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

  // Wait for anon-auth before subscribing (Firebase rules require auth != null)
  (window._authReadyPromise || Promise.resolve()).then(cvSubscribeMarkers);
};

window.closeCorvusDecks = function closeCorvusDecks() {
  const ov = cvEl('corvusOverlay');
  if (ov) ov.classList.remove('open');
  cvStopClock();
  cvUnsubscribeMarkers();
};
