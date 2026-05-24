import { ref, set, onValue, remove } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ════════════════════════════════════════════════════════════════
// PROJECT BLACK VEIL — TARGETING ANALYSIS TERMINAL
// Spieler tragen pro freigeschaltetem Fragment einen Filter ein.
// Bei korrektem Wert wird der Filter aktiv → Systemliste schrumpft.
// Wenn alle 10 Filter korrekt und exakt 1 System übrig → Queen-Pin auf StarMap.
// ════════════════════════════════════════════════════════════════

const BVT_DB_PATH    = 'session/blackveil/targeting';      // { fragId: chosenOptionId }
const BVT_QUEEN_PATH = 'session/blackveil/queenLocation';  // { x, y, system, ts }

// ── 10 Filter, einer pro Fragment ──
// Reihenfolge & fragId entsprechen BV_FRAGMENTS aus black-veil.js
const BVT_FILTERS = [
  {
    fragId: 1,
    label: 'SURFACE TEMPERATURE PROFILE',
    hint:  'Fragment 01 — KESTREL / SUTTER\'S WORLD',
    options: [
      { id: 'STABLE',          label: 'STABLE / TEMPERATE' },
      { id: 'EXTREME_DIURNAL', label: 'EXTREME DIURNAL CYCLE (±60K)' },
      { id: 'FROZEN',          label: 'CRYOGENIC / FROZEN' },
      { id: 'VOLCANIC_HOT',    label: 'VOLCANIC HOT' },
      { id: 'SCORCHED',        label: 'SCORCHED (>100°C CONSTANT)' }
    ],
    match: 'EXTREME_DIURNAL'
  },
  {
    fragId: 2,
    label: 'ELECTROMAGNETIC FIELD',
    hint:  'Fragment 02 — ATLAS / GJ2092',
    options: [
      { id: 'NONE',         label: 'NONE / NEGLIGIBLE' },
      { id: 'WEAK',         label: 'WEAK BUT STABLE' },
      { id: 'MODERATE',     label: 'MODERATE / EARTH-LIKE' },
      { id: 'STRONG',       label: 'STRONG MAGNETOSPHERE' },
      { id: 'UNSTABLE_BIO', label: 'UNSTABLE / BIOLOGICAL PATTERN' }
    ],
    match: 'UNSTABLE_BIO'
  },
  {
    fragId: 3,
    label: 'ATMOSPHERIC COMPOSITION',
    hint:  'Fragment 03 — PEREGRINE / ARCEON',
    options: [
      { id: 'BREATHABLE', label: 'BREATHABLE (O₂ ~21%)' },
      { id: 'OXY_RICH',   label: 'OXYGEN-RICH (O₂ >25%)' },
      { id: 'TOXIC_CO2',  label: 'TOXIC CO₂-HEAVY (O₂ <8%)' },
      { id: 'METHANE',    label: 'METHANE / REDUCING' },
      { id: 'VACUUM',     label: 'TRACE / VACUUM' }
    ],
    match: 'TOXIC_CO2'
  },
  {
    fragId: 4,
    label: 'INTERNAL HEAT SOURCE',
    hint:  'Fragment 04 — BOYD / JEREMIAH VI',
    options: [
      { id: 'NONE',           label: 'NONE / COLD CORE' },
      { id: 'SOLAR',          label: 'SOLAR-DRIVEN ONLY' },
      { id: 'GEOTHERMAL_OPT', label: 'GEOTHERMAL 38–42°C' },
      { id: 'VOLCANIC_HOT',   label: 'VOLCANIC (>80°C)' },
      { id: 'REACTOR_DECAY',  label: 'RADIOGENIC / REACTOR DECAY' }
    ],
    match: 'GEOTHERMAL_OPT'
  },
  {
    fragId: 5,
    label: 'VACUUM TOLERANCE OF SUBSTRATE',
    hint:  'Fragment 05 — HERMES-7 / VAN MAANEN\'S STAR',
    options: [
      { id: 'STRICT_ATMO',  label: 'REQUIRES ATMOSPHERE' },
      { id: 'PRESSURE_DEP', label: 'PRESSURE-DEPENDENT' },
      { id: 'FACULTATIVE',  label: 'FACULTATIVE (>90s VACUUM)' },
      { id: 'NATIVE',       label: 'VACUUM-NATIVE' }
    ],
    match: 'FACULTATIVE'
  },
  {
    fragId: 6,
    label: 'BIOELECTRIC SIGNATURE',
    hint:  'Fragment 06 — CINDER / KHEPRI-9',
    options: [
      { id: 'SILENT',    label: 'SILENT / NO PATTERN' },
      { id: 'TECH_HZ',   label: 'TECH 50/60 Hz' },
      { id: 'NOISE',     label: 'RANDOM NOISE' },
      { id: 'LOW_FREQ',  label: 'LOW-FREQ PATTERN 0.3–8 Hz' },
      { id: 'HIGH_FREQ', label: 'HIGH-FREQ (>1 kHz)' }
    ],
    match: 'LOW_FREQ'
  },
  {
    fragId: 7,
    label: 'GRAVITATIONAL INDEX',
    hint:  'Fragment 07 — VALIANT / [CLASSIFIED]',
    options: [
      { id: 'LOW',           label: 'LOW (<0.5 G)' },
      { id: 'NEAR_EARTH',    label: 'NEAR-EARTH (0.6–0.8 G)' },
      { id: 'EARTH_OPTIMAL', label: 'OPTIMAL (0.85–0.95 G)' },
      { id: 'HIGH_EARTH',    label: 'HIGH (1.0–1.3 G)' },
      { id: 'CRUSHING',      label: 'CRUSHING (>1.4 G)' }
    ],
    match: 'EARTH_OPTIMAL'
  },
  {
    fragId: 8,
    label: 'STELLAR CLASS',
    hint:  'Fragment 08 — ALCYONE / [CLASSIFIED]',
    options: [
      { id: 'O_BLUE',    label: 'O / BLUE GIANT' },
      { id: 'A_WHITE',   label: 'A / WHITE' },
      { id: 'F_YEL_WHT', label: 'F / YELLOW-WHITE' },
      { id: 'G_YELLOW',  label: 'G / YELLOW (SOL-LIKE)' },
      { id: 'K_ORANGE',  label: 'K / ORANGE' },
      { id: 'M_RED',     label: 'M / RED DWARF' }
    ],
    match: 'K_ORANGE'
  },
  {
    fragId: 9,
    label: 'HYDROLOGICAL DEPTH STRUCTURE',
    hint:  'Fragment 09 — MERIDIAN / [CLASSIFIED]',
    options: [
      { id: 'SURFACE_OCEAN', label: 'SURFACE OCEANS' },
      { id: 'SURFACE_RIVER', label: 'SURFACE RIVERS / LAKES' },
      { id: 'MIXED',         label: 'MIXED SURFACE / SUBSURFACE' },
      { id: 'SUBSURFACE',    label: 'SUBSURFACE ONLY (>200m)' },
      { id: 'FROZEN',        label: 'ICE / FROZEN' },
      { id: 'NONE',          label: 'ARID / NO WATER' }
    ],
    match: 'SUBSURFACE'
  },
  {
    fragId: 10,
    label: 'SEISMIC STABILITY',
    hint:  'Fragment 10 — OMEGA / BLACKSITE THETA',
    options: [
      { id: 'DORMANT',  label: 'DORMANT / QUIET (<0.2 RICHTER)' },
      { id: 'LOW',      label: 'LOW ACTIVITY' },
      { id: 'MODERATE', label: 'MODERATE' },
      { id: 'ACTIVE',   label: 'TECTONICALLY ACTIVE' },
      { id: 'VOLCANIC', label: 'VOLCANIC / UNSTABLE' }
    ],
    match: 'DORMANT'
  }
];

// ── 25 Sternsysteme aus dem Alien-Universum ──
// Attribute-Reihenfolge: [SURFACE_TEMP, EM, ATMO, HEAT, VACUUM, BIO, GRAVITY, STAR, HYDRO, SEISMIC]
const BVT_SYSTEMS = [
  // ── CORE / known colony worlds ──
  { id:'sol',       name:'SOL — EARTH',                sector:'CORE SYSTEMS',
    a:['STABLE','NONE','BREATHABLE','SOLAR','STRICT_ATMO','TECH_HZ','EARTH_OPTIMAL','G_YELLOW','SURFACE_OCEAN','LOW'],
    x: 1340, y: 1080 },
  { id:'lv426',     name:'ZETA² RETICULI — LV-426',    sector:'OUTER VEIL',
    a:['FROZEN','NONE','TOXIC_CO2','NONE','STRICT_ATMO','NOISE','HIGH_EARTH','M_RED','NONE','ACTIVE'],
    x: 1620, y: 760 },
  { id:'lv223',     name:'ZETA² RETICULI — LV-223',    sector:'OUTER VEIL',
    a:['STABLE','WEAK','TOXIC_CO2','VOLCANIC_HOT','PRESSURE_DEP','NOISE','HIGH_EARTH','F_YEL_WHT','NONE','VOLCANIC'],
    x: 1640, y: 740 },
  { id:'thedus',    name:'THEDUS',                     sector:'AMERICAN ARM',
    a:['STABLE','MODERATE','BREATHABLE','SOLAR','STRICT_ATMO','TECH_HZ','NEAR_EARTH','G_YELLOW','MIXED','LOW'],
    x: 1480, y: 1220 },
  { id:'fiorina',   name:'FIORINA 161',                sector:'OUTER RIM',
    a:['SCORCHED','NONE','BREATHABLE','NONE','STRICT_ATMO','SILENT','HIGH_EARTH','M_RED','SURFACE_RIVER','LOW'],
    x: 1900, y: 920 },
  { id:'kg348',     name:'KG-348 — SEVASTOPOL',        sector:'AMERICAN ARM',
    a:['STABLE','NONE','BREATHABLE','SOLAR','STRICT_ATMO','TECH_HZ','EARTH_OPTIMAL','G_YELLOW','FROZEN','DORMANT'],
    x: 460, y: 380 },
  { id:'epsilon',   name:'EPSILON ERIDANI — PINKERTON',sector:'CORE SYSTEMS',
    a:['STABLE','WEAK','BREATHABLE','SOLAR','STRICT_ATMO','NOISE','NEAR_EARTH','K_ORANGE','MIXED','LOW'],
    x: 1180, y: 1140 },
  { id:'tauceti',   name:'TAU CETI — NEW ALBION',      sector:'AMERICAN ARM',
    a:['STABLE','NONE','BREATHABLE','SOLAR','STRICT_ATMO','TECH_HZ','EARTH_OPTIMAL','G_YELLOW','SURFACE_OCEAN','LOW'],
    x: 1280, y: 1280 },
  { id:'wolf359',   name:'WOLF 359 — ANCHORPOINT',     sector:'FRONTIER',
    a:['FROZEN','WEAK','VACUUM','NONE','STRICT_ATMO','SILENT','LOW','M_RED','FROZEN','DORMANT'],
    x: 1080, y: 1480 },
  { id:'betahydri', name:'BETA HYDRI — OLYMPIA',       sector:'CORE SYSTEMS',
    a:['STABLE','NONE','BREATHABLE','SOLAR','STRICT_ATMO','NOISE','EARTH_OPTIMAL','K_ORANGE','SURFACE_OCEAN','LOW'],
    x: 1420, y: 920 },
  { id:'brackens',  name:'BRACKEN\'S WORLD',           sector:'OUTER VEIL',
    a:['EXTREME_DIURNAL','WEAK','BREATHABLE','GEOTHERMAL_OPT','STRICT_ATMO','NOISE','NEAR_EARTH','G_YELLOW','MIXED','MODERATE'],
    x: 1740, y: 540 },
  { id:'deltapav',  name:'DELTA PAVONIS — PYLOS NINE', sector:'INDEPENDENT CORE',
    a:['SCORCHED','NONE','METHANE','NONE','STRICT_ATMO','TECH_HZ','HIGH_EARTH','F_YEL_WHT','NONE','ACTIVE'],
    x: 1080, y: 1660 },
  { id:'thetis5',   name:'THETIS 5',                   sector:'TARTARUS SECTOR',
    a:['STABLE','MODERATE','BREATHABLE','GEOTHERMAL_OPT','STRICT_ATMO','SILENT','NEAR_EARTH','K_ORANGE','SURFACE_OCEAN','LOW'],
    x: 1240, y: 1720 },
  { id:'tartarus7', name:'TARTARUS VII',               sector:'TARTARUS SECTOR',
    a:['EXTREME_DIURNAL','STRONG','TOXIC_CO2','VOLCANIC_HOT','FACULTATIVE','HIGH_FREQ','HIGH_EARTH','M_RED','NONE','VOLCANIC'],
    x: 1380, y: 1820 },
  { id:'crestus',   name:'CRESTUS PRIME',              sector:'CRESTUS CLUSTER',
    a:['STABLE','WEAK','BREATHABLE','SOLAR','STRICT_ATMO','TECH_HZ','NEAR_EARTH','G_YELLOW','SURFACE_RIVER','LOW'],
    x: 2120, y: 540 },
  { id:'sigmadrac', name:'SIGMA DRACONIS — TIRGU MIRES',sector:'OUTER RIM',
    a:['EXTREME_DIURNAL','NONE','TOXIC_CO2','NONE','STRICT_ATMO','NOISE','HIGH_EARTH','M_RED','SUBSURFACE','ACTIVE'],
    x: 2380, y: 460 },
  { id:'alphacrux', name:'ALPHA CRUCIS — PHAETON',     sector:'TRAILWARD',
    a:['VOLCANIC_HOT','STRONG','METHANE','VOLCANIC_HOT','NATIVE','HIGH_FREQ','CRUSHING','O_BLUE','NONE','VOLCANIC'],
    x: 920, y: 1820 },
  { id:'procyon',   name:'PROCYON — SOLOMONS',         sector:'CORE SYSTEMS',
    a:['STABLE','NONE','BREATHABLE','SOLAR','STRICT_ATMO','TECH_HZ','EARTH_OPTIMAL','F_YEL_WHT','MIXED','LOW'],
    x: 1180, y: 1020 },

  // ── Black Veil Mission systems (Spieler kennen sie schon) ──
  { id:'111tauri',  name:'111 TAURI — SUTTER\'S WORLD',sector:'OUTER VEIL',
    a:['EXTREME_DIURNAL','MODERATE','BREATHABLE','SOLAR','STRICT_ATMO','TECH_HZ','NEAR_EARTH','G_YELLOW','SURFACE_RIVER','LOW'],
    x: 1880, y: 480 },
  { id:'gj2092',    name:'GJ 2092 — ATLAS STATION',    sector:'OUTER VEIL',
    a:['STABLE','UNSTABLE_BIO','BREATHABLE','SOLAR','PRESSURE_DEP','NOISE','NEAR_EARTH','M_RED','MIXED','ACTIVE'],
    x: 1820, y: 320 },
  { id:'gl259',     name:'GL 259 — ARCEON STATION',    sector:'OUTER VEIL',
    a:['SCORCHED','NONE','TOXIC_CO2','VOLCANIC_HOT','STRICT_ATMO','SILENT','HIGH_EARTH','F_YEL_WHT','SUBSURFACE','VOLCANIC'],
    x: 2240, y: 660 },
  { id:'289hydrae', name:'289 G. HYDRAE — JEREMIAH VI',sector:'OUTER RIM',
    a:['EXTREME_DIURNAL','WEAK','BREATHABLE','GEOTHERMAL_OPT','STRICT_ATMO','NOISE','NEAR_EARTH','G_YELLOW','MIXED','MODERATE'],
    x: 2480, y: 720 },
  { id:'vanmaanen', name:'VAN MAANEN\'S STAR — HERMES-7',sector:'OUTER RIM',
    a:['SCORCHED','STRONG','VACUUM','NONE','FACULTATIVE','SILENT','HIGH_EARTH','A_WHITE','NONE','VOLCANIC'],
    x: 2680, y: 580 },
  { id:'lambdaaur', name:'LAMBDA AURIGAE — KHEPRI-9',  sector:'OUTER RIM',
    a:['EXTREME_DIURNAL','MODERATE','METHANE','GEOTHERMAL_OPT','PRESSURE_DEP','LOW_FREQ','NEAR_EARTH','M_RED','FROZEN','ACTIVE'],
    x: 2540, y: 380 },

  // ── THE TARGET ──
  { id:'blacksite_theta', name:'BLACKSITE THETA', sector:'[REDACTED]',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','FACULTATIVE','LOW_FREQ','EARTH_OPTIMAL','K_ORANGE','SUBSURFACE','DORMANT'],
    x: 2840, y: 220 }
];

// ── State (Firebase-synced) ──
// bvtState = { [fragId]: chosenOptionId }
let bvtState = {};
let bvtUnlocked = []; // mirror of black-veil unlocked fragments
let bvtView = 'fragments'; // 'fragments' | 'targeting'

window.BVT_FILTERS = BVT_FILTERS;
window.BVT_SYSTEMS = BVT_SYSTEMS;

// ── Firebase ──
function bvtInitFirebase() {
  onValue(ref(window.db, BVT_DB_PATH), snap => {
    bvtState = snap.val() || {};
    if (document.getElementById('bvOverlay').classList.contains('active') && bvtView === 'targeting') {
      bvtRender();
    }
  });
  // Also subscribe to unlock list so targeting view stays in sync
  onValue(ref(window.db, 'session/blackveil/unlocked'), snap => {
    bvtUnlocked = snap.val() ? Object.keys(snap.val()).map(Number) : [];
    if (document.getElementById('bvOverlay').classList.contains('active') && bvtView === 'targeting') {
      bvtRender();
    }
  });
}
window.bvtInit = bvtInitFirebase;

// Reset to fragments view whenever the Black Veil overlay is opened/closed,
// so the two views can't both be visible after reopen.
function bvtResetView() {
  bvtView = 'fragments';
  const panel = document.getElementById('bvtPanel');
  const cards = document.getElementById('bvCardsContainer');
  const btn   = document.getElementById('bvtToggleBtn');
  if (panel) panel.style.display = 'none';
  if (cards) cards.style.display = '';
  if (btn)   btn.textContent = 'TARGETING ANALYSIS ▶';
}
const _bvtOrigOpen  = window.openBVPanel;
const _bvtOrigClose = window.closeBVPanel;
window.openBVPanel  = function(){ bvtResetView(); _bvtOrigOpen?.(); };
window.closeBVPanel = function(){ bvtResetView(); _bvtOrigClose?.(); };

// ── Match-Logik ──
function bvtActiveFilters() {
  // Filter, der vom Spieler korrekt eingetragen wurde UND dessen Fragment freigeschaltet ist
  return BVT_FILTERS.filter(f =>
    bvtUnlocked.includes(f.fragId) &&
    bvtState[f.fragId] === f.match
  );
}

function bvtMatchingSystems() {
  const active = bvtActiveFilters();
  if (!active.length) return BVT_SYSTEMS.slice();
  return BVT_SYSTEMS.filter(sys =>
    active.every(f => sys.a[f.fragId - 1] === f.match)
  );
}

// ── Queen-Pin auf Karte triggern ──
function bvtCheckQueenLock() {
  const matches = bvtMatchingSystems();
  const active  = bvtActiveFilters();
  if (matches.length === 1 && active.length === 10) {
    const queen = matches[0];
    set(ref(window.db, BVT_QUEEN_PATH), {
      x: queen.x, y: queen.y, system: queen.name, ts: Date.now()
    });
  } else {
    // not solved yet
    remove(ref(window.db, BVT_QUEEN_PATH));
  }
}

// ── Spieler-Eingabe ──
window.bvtSetChoice = function(fragId, optionId) {
  const update = { ...bvtState };
  if (optionId === '__none__') {
    delete update[fragId];
  } else {
    update[fragId] = optionId;
  }
  set(ref(window.db, BVT_DB_PATH), Object.keys(update).length ? update : null)
    .then(() => bvtCheckQueenLock());
};

window.bvtClearAll = function() {
  remove(ref(window.db, BVT_DB_PATH));
  remove(ref(window.db, BVT_QUEEN_PATH));
};

// ── View Toggle ──
window.bvtToggleView = function() {
  bvtView = (bvtView === 'targeting') ? 'fragments' : 'targeting';
  document.getElementById('bvtToggleBtn').textContent =
    bvtView === 'targeting' ? '◀ FRAGMENTS' : 'TARGETING ANALYSIS ▶';
  document.getElementById('bvCardsContainer').style.display = bvtView === 'fragments' ? '' : 'none';
  document.getElementById('bvtPanel').style.display          = bvtView === 'targeting' ? 'flex' : 'none';
  if (bvtView === 'targeting') bvtRender();
};

// ── Render ──
function bvtRender() {
  const panel = document.getElementById('bvtPanel');
  if (!panel) return;

  const matches = bvtMatchingSystems();
  const active  = bvtActiveFilters();
  const isSolved = matches.length === 1 && active.length === 10;

  // ── LEFT: 10 Filter ──
  const filtersHtml = BVT_FILTERS.map(f => {
    const isUnlocked = bvtUnlocked.includes(f.fragId);
    const chosen    = bvtState[f.fragId] || '';
    const isCorrect = chosen === f.match;
    const isWrong   = chosen && !isCorrect;

    let cls = 'bvt-filter';
    if (!isUnlocked) cls += ' locked';
    else if (isCorrect) cls += ' active';
    else if (isWrong) cls += ' invalid';

    const status =
      !isUnlocked ? '<span class="bvt-stat locked">— LOCKED</span>' :
      isCorrect   ? '<span class="bvt-stat ok">✓ ACTIVE</span>' :
      isWrong     ? '<span class="bvt-stat err">⚠ INVALID</span>' :
                    '<span class="bvt-stat idle">AWAITING INPUT</span>';

    const opts = '<option value="__none__">— SELECT VALUE —</option>' +
      f.options.map(o =>
        `<option value="${o.id}"${o.id===chosen?' selected':''}>${o.label}</option>`
      ).join('');

    return `<div class="${cls}">
      <div class="bvt-f-hd">
        <span class="bvt-f-num">${String(f.fragId).padStart(2,'0')}/10</span>
        <span class="bvt-f-lbl">${f.label}</span>
        ${status}
      </div>
      <div class="bvt-f-hint">${f.hint}</div>
      <select class="bvt-f-sel" ${isUnlocked?'':'disabled'}
              onchange="bvtSetChoice(${f.fragId}, this.value)">
        ${opts}
      </select>
    </div>`;
  }).join('');

  // ── RIGHT: System list ──
  const counterCls = isSolved ? 'bvt-counter solved'
                   : (matches.length <= 3 ? 'bvt-counter close' : 'bvt-counter');

  const systemsHtml = matches.map(s => {
    const isQueen = isSolved && s.id === 'blacksite_theta';
    return `<div class="bvt-sys${isQueen?' queen':''}">
      <div class="bvt-sys-name">${s.name}</div>
      <div class="bvt-sys-sector">${s.sector}</div>
      ${isQueen ? '<div class="bvt-sys-tag">⚠ TARGET CONFIRMED — XENOMORPH QUEEN</div>' : ''}
    </div>`;
  }).join('') || '<div class="bvt-empty-sys">NO MATCHING SYSTEMS — ONE OR MORE INPUTS INCONSISTENT</div>';

  panel.innerHTML = `
    <div class="bvt-col bvt-col-filters">
      <div class="bvt-col-hd">
        <span class="bvt-col-title">// PARAMETER INPUT</span>
        <button class="bvt-clear-btn" onclick="bvtClearAll()">RESET ALL</button>
      </div>
      <div class="bvt-filters">${filtersHtml}</div>
    </div>
    <div class="bvt-col bvt-col-results">
      <div class="bvt-col-hd">
        <span class="bvt-col-title">// CANDIDATE SYSTEMS</span>
        <span class="${counterCls}">${matches.length} / ${BVT_SYSTEMS.length}</span>
      </div>
      <div class="bvt-active-summary">
        <span>${active.length} / 10 FILTERS ACTIVE</span>
        ${isSolved ? '<span class="bvt-locked-tag">◆ TARGET ACQUIRED — PIN ON STARMAP</span>' : ''}
      </div>
      <div class="bvt-systems">${systemsHtml}</div>
    </div>
  `;
}
window.bvtRender = bvtRender;
