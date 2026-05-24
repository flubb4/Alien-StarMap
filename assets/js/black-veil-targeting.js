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

  // ── Additional candidate worlds ──
  { id:'tantalus',     name:'TANTALUS',                   sector:'TARTARUS SECTOR',
    a:['EXTREME_DIURNAL','NONE','METHANE','GEOTHERMAL_OPT','STRICT_ATMO','NOISE','EARTH_OPTIMAL','G_YELLOW','MIXED','MODERATE'],
    x: 1320, y: 1880 },
  { id:'tracon',       name:'TRACON',                     sector:'INDEPENDENT CORE',
    a:['STABLE','NONE','BREATHABLE','GEOTHERMAL_OPT','STRICT_ATMO','TECH_HZ','HIGH_EARTH','K_ORANGE','MIXED','LOW'],
    x: 1080, y: 1540 },
  { id:'bellerophon',  name:'BELLEROPHON',                sector:'CORE SYSTEMS',
    a:['STABLE','WEAK','TOXIC_CO2','SOLAR','STRICT_ATMO','LOW_FREQ','NEAR_EARTH','G_YELLOW','MIXED','LOW'],
    x: 1240, y: 1140 },
  { id:'eta_cas',      name:'ETA CASSIOPEIAE',            sector:'FRONTIER',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','VOLCANIC_HOT','STRICT_ATMO','SILENT','HIGH_EARTH','A_WHITE','SUBSURFACE','ACTIVE'],
    x: 580, y: 320 },
  { id:'ophiuchi70',   name:'70 OPHIUCHI — V\'KAR',       sector:'OUTER VEIL',
    a:['STABLE','MODERATE','BREATHABLE','SOLAR','PRESSURE_DEP','LOW_FREQ','HIGH_EARTH','K_ORANGE','SUBSURFACE','MODERATE'],
    x: 820, y: 680 },
  { id:'hyades',       name:'HYADES — KORN STATION',      sector:'OUTER RIM',
    a:['EXTREME_DIURNAL','NONE','BREATHABLE','NONE','STRICT_ATMO','NOISE','NEAR_EARTH','K_ORANGE','MIXED','DORMANT'],
    x: 2620, y: 460 },
  { id:'delphi',       name:'DELPHI',                     sector:'CORE SYSTEMS',
    a:['STABLE','NONE','BREATHABLE','SOLAR','STRICT_ATMO','TECH_HZ','EARTH_OPTIMAL','K_ORANGE','SURFACE_OCEAN','LOW'],
    x: 1380, y: 1180 },
  { id:'avraham',      name:'AVRAHAM — TRADE HUB',        sector:'INDEPENDENT CORE',
    a:['STABLE','NONE','BREATHABLE','SOLAR','STRICT_ATMO','LOW_FREQ','NEAR_EARTH','G_YELLOW','MIXED','DORMANT'],
    x: 1140, y: 1380 },
  { id:'wormtown',     name:'WORMTOWN — FAR REACH',       sector:'FRONTIER',
    a:['SCORCHED','NONE','VACUUM','NONE','FACULTATIVE','SILENT','HIGH_EARTH','M_RED','SUBSURFACE','DORMANT'],
    x: 480, y: 1880 },
  { id:'galsworthy',   name:'GALSWORTHY',                 sector:'FRONTIER',
    a:['STABLE','UNSTABLE_BIO','BREATHABLE','SOLAR','STRICT_ATMO','NOISE','NEAR_EARTH','F_YEL_WHT','SUBSURFACE','DORMANT'],
    x: 2940, y: 1180 },
  { id:'mururoa2',     name:'MURUROA II',                 sector:'CRESTUS CLUSTER',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','NONE','STRICT_ATMO','NOISE','HIGH_EARTH','M_RED','NONE','ACTIVE'],
    x: 2080, y: 480 },
  { id:'hephaistos',   name:'HEPHAISTOS',                 sector:'TARTARUS SECTOR',
    a:['VOLCANIC_HOT','WEAK','METHANE','GEOTHERMAL_OPT','STRICT_ATMO','SILENT','EARTH_OPTIMAL','F_YEL_WHT','FROZEN','VOLCANIC'],
    x: 1460, y: 1940 },
  { id:'roanoke',      name:'ROANOKE',                    sector:'OUTER VEIL',
    a:['EXTREME_DIURNAL','NONE','BREATHABLE','SOLAR','FACULTATIVE','TECH_HZ','NEAR_EARTH','G_YELLOW','MIXED','LOW'],
    x: 760, y: 540 },
  { id:'bara_cath',    name:'BARA CATHEDRALE',            sector:'TARTARUS SECTOR',
    a:['STABLE','NONE','METHANE','NONE','FACULTATIVE','SILENT','HIGH_EARTH','K_ORANGE','FROZEN','DORMANT'],
    x: 1280, y: 2000 },
  { id:'glaxus',       name:'GLAXUS — MINING MOON',       sector:'TRAILWARD',
    a:['SCORCHED','NONE','VACUUM','GEOTHERMAL_OPT','STRICT_ATMO','TECH_HZ','LOW','M_RED','SUBSURFACE','LOW'],
    x: 1180, y: 1820 },
  { id:'frost',        name:'FROST',                      sector:'OUTER RIM',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','BREATHABLE','NONE','STRICT_ATMO','NOISE','HIGH_EARTH','M_RED','SUBSURFACE','MODERATE'],
    x: 2780, y: 280 },
  { id:'lapchet',      name:'LAPCHET',                    sector:'CORE SYSTEMS',
    a:['STABLE','UNSTABLE_BIO','BREATHABLE','GEOTHERMAL_OPT','STRICT_ATMO','NOISE','EARTH_OPTIMAL','G_YELLOW','MIXED','DORMANT'],
    x: 1480, y: 1240 },
  { id:'damascus',     name:'DAMASCUS',                   sector:'CORE SYSTEMS',
    a:['STABLE','UNSTABLE_BIO','BREATHABLE','SOLAR','FACULTATIVE','TECH_HZ','EARTH_OPTIMAL','K_ORANGE','MIXED','DORMANT'],
    x: 1240, y: 1240 },
  { id:'kaaba',        name:'KAABA',                      sector:'CORE SYSTEMS',
    a:['STABLE','NONE','BREATHABLE','SOLAR','STRICT_ATMO','TECH_HZ','EARTH_OPTIMAL','G_YELLOW','SURFACE_OCEAN','DORMANT'],
    x: 1420, y: 1320 },
  { id:'steeple',      name:'STEEPLE-MASON',              sector:'FRONTIER',
    a:['SCORCHED','NONE','TOXIC_CO2','VOLCANIC_HOT','STRICT_ATMO','SILENT','HIGH_EARTH','F_YEL_WHT','FROZEN','ACTIVE'],
    x: 320, y: 940 },
  { id:'caldwell',     name:'CALDWELL',                   sector:'AMERICAN ARM',
    a:['STABLE','NONE','BREATHABLE','SOLAR','STRICT_ATMO','TECH_HZ','EARTH_OPTIMAL','G_YELLOW','SURFACE_OCEAN','LOW'],
    x: 1540, y: 1320 },
  { id:'glamour',      name:'GLAMOUR',                    sector:'INDEPENDENT CORE',
    a:['STABLE','WEAK','BREATHABLE','SOLAR','STRICT_ATMO','TECH_HZ','NEAR_EARTH','K_ORANGE','SURFACE_RIVER','LOW'],
    x: 980, y: 1480 },
  { id:'thurnish',     name:'THURNISH',                   sector:'CRESTUS CLUSTER',
    a:['EXTREME_DIURNAL','NONE','BREATHABLE','NONE','STRICT_ATMO','LOW_FREQ','HIGH_EARTH','G_YELLOW','MIXED','ACTIVE'],
    x: 2240, y: 380 },
  { id:'carthage',     name:'CARTHAGE',                   sector:'CORE SYSTEMS',
    a:['STABLE','WEAK','BREATHABLE','GEOTHERMAL_OPT','STRICT_ATMO','TECH_HZ','EARTH_OPTIMAL','G_YELLOW','MIXED','LOW'],
    x: 1300, y: 980 },
  { id:'brakari',      name:'BRAKARI',                    sector:'FRONTIER',
    a:['FROZEN','NONE','TOXIC_CO2','NONE','STRICT_ATMO','SILENT','HIGH_EARTH','M_RED','SUBSURFACE','ACTIVE'],
    x: 2980, y: 720 },
  { id:'nuovo_dur',    name:'NUOVO DURANGO',              sector:'AMERICAN ARM',
    a:['EXTREME_DIURNAL','NONE','BREATHABLE','NONE','FACULTATIVE','NOISE','NEAR_EARTH','G_YELLOW','MIXED','LOW'],
    x: 1620, y: 1380 },
  { id:'europa_x',     name:'EUROPA-X',                   sector:'CORE SYSTEMS',
    a:['FROZEN','UNSTABLE_BIO','BREATHABLE','NONE','PRESSURE_DEP','LOW_FREQ','HIGH_EARTH','A_WHITE','FROZEN','LOW'],
    x: 1160, y: 920 },
  { id:'procyon_b',    name:'PROCYON B',                  sector:'CORE SYSTEMS',
    a:['STABLE','NONE','BREATHABLE','GEOTHERMAL_OPT','FACULTATIVE','TECH_HZ','HIGH_EARTH','F_YEL_WHT','MIXED','LOW'],
    x: 1180, y: 1020 },
  { id:'ascalon',      name:'ASCALON',                    sector:'TARTARUS SECTOR',
    a:['EXTREME_DIURNAL','WEAK','BREATHABLE','GEOTHERMAL_OPT','STRICT_ATMO','SILENT','NEAR_EARTH','M_RED','MIXED','MODERATE'],
    x: 1380, y: 1780 },
  { id:'leper_col',    name:'LEPER COLONY',               sector:'TRAILWARD',
    a:['SCORCHED','NONE','TOXIC_CO2','NONE','FACULTATIVE','LOW_FREQ','LOW','M_RED','NONE','ACTIVE'],
    x: 1620, y: 1880 },
  { id:'tracinium',    name:'TRACINIUM',                  sector:'FRONTIER',
    a:['EXTREME_DIURNAL','NONE','BREATHABLE','NONE','STRICT_ATMO','SILENT','NEAR_EARTH','F_YEL_WHT','SURFACE_RIVER','LOW'],
    x: 2360, y: 240 },
  { id:'sphere_mag',   name:'SPHERE — MAGELLAN',          sector:'OUTER RIM',
    a:['STABLE','NONE','BREATHABLE','GEOTHERMAL_OPT','STRICT_ATMO','NOISE','HIGH_EARTH','G_YELLOW','MIXED','LOW'],
    x: 380, y: 460 },
  { id:'hodgson9',     name:'HODGSON THETA-9',            sector:'TARTARUS SECTOR',
    a:['STABLE','UNSTABLE_BIO','BREATHABLE','NONE','FACULTATIVE','TECH_HZ','HIGH_EARTH','F_YEL_WHT','MIXED','MODERATE'],
    x: 1180, y: 1960 },
  { id:'pylos_prime',  name:'PYLOS PRIME',                sector:'INDEPENDENT CORE',
    a:['STABLE','WEAK','BREATHABLE','SOLAR','STRICT_ATMO','TECH_HZ','EARTH_OPTIMAL','G_YELLOW','MIXED','LOW'],
    x: 1020, y: 1620 },
  { id:'weyland_isles',name:'WEYLAND-ISLES OUTPOST',      sector:'OUTER RIM',
    a:['STABLE','UNSTABLE_BIO','BREATHABLE','NONE','STRICT_ATMO','NOISE','HIGH_EARTH','M_RED','SUBSURFACE','MODERATE'],
    x: 660, y: 280 },
  { id:'kronos_prime', name:'KRONOS PRIME',               sector:'CORE SYSTEMS',
    a:['EXTREME_DIURNAL','NONE','BREATHABLE','GEOTHERMAL_OPT','STRICT_ATMO','LOW_FREQ','EARTH_OPTIMAL','K_ORANGE','MIXED','LOW'],
    x: 1500, y: 1080 },
  { id:'sheherazade',  name:'SHEHERAZADE',                sector:'AMERICAN ARM',
    a:['STABLE','NONE','TOXIC_CO2','SOLAR','STRICT_ATMO','TECH_HZ','NEAR_EARTH','K_ORANGE','MIXED','LOW'],
    x: 1660, y: 1220 },
  { id:'parnassus',    name:'PARNASSUS',                  sector:'CORE SYSTEMS',
    a:['STABLE','NONE','BREATHABLE','SOLAR','STRICT_ATMO','TECH_HZ','EARTH_OPTIMAL','K_ORANGE','SURFACE_OCEAN','LOW'],
    x: 1380, y: 1020 },
  { id:'sirius_c',     name:'SIRIUS C',                   sector:'CORE SYSTEMS',
    a:['STABLE','WEAK','BREATHABLE','GEOTHERMAL_OPT','STRICT_ATMO','TECH_HZ','HIGH_EARTH','A_WHITE','SURFACE_RIVER','LOW'],
    x: 1280, y: 1140 },
  { id:'barnards',     name:'BARNARD\'S STAR',            sector:'FRONTIER',
    a:['STABLE','WEAK','BREATHABLE','NONE','FACULTATIVE','SILENT','NEAR_EARTH','M_RED','FROZEN','DORMANT'],
    x: 320, y: 1140 },
  { id:'groombridge',  name:'GROOMBRIDGE 34',             sector:'OUTER VEIL',
    a:['SCORCHED','UNSTABLE_BIO','METHANE','VOLCANIC_HOT','STRICT_ATMO','LOW_FREQ','HIGH_EARTH','M_RED','NONE','ACTIVE'],
    x: 880, y: 580 },
  { id:'kapteyn',      name:'KAPTEYN',                    sector:'INDEPENDENT CORE',
    a:['EXTREME_DIURNAL','NONE','TOXIC_CO2','NONE','STRICT_ATMO','NOISE','HIGH_EARTH','M_RED','NONE','LOW'],
    x: 920, y: 1700 },
  { id:'aldebaran',    name:'ALDEBARAN OUTPOST',          sector:'OUTER RIM',
    a:['STABLE','NONE','BREATHABLE','VOLCANIC_HOT','STRICT_ATMO','NOISE','HIGH_EARTH','K_ORANGE','SUBSURFACE','ACTIVE'],
    x: 2880, y: 460 },
  { id:'rigel_harbour',name:'RIGEL HARBOUR',              sector:'AMERICAN ARM',
    a:['STABLE','NONE','BREATHABLE','GEOTHERMAL_OPT','STRICT_ATMO','TECH_HZ','EARTH_OPTIMAL','A_WHITE','MIXED','MODERATE'],
    x: 1480, y: 1440 },
  { id:'omega_st',     name:'OMEGA STATION',              sector:'CRESTUS CLUSTER',
    a:['EXTREME_DIURNAL','NONE','BREATHABLE','NONE','STRICT_ATMO','NOISE','HIGH_EARTH','G_YELLOW','MIXED','DORMANT'],
    x: 2180, y: 620 },
  { id:'vespucci',     name:'VESPUCCI',                   sector:'CORE SYSTEMS',
    a:['STABLE','NONE','BREATHABLE','SOLAR','FACULTATIVE','TECH_HZ','NEAR_EARTH','G_YELLOW','MIXED','LOW'],
    x: 1240, y: 1080 },
  { id:'cavendish',    name:'CAVENDISH',                  sector:'FRONTIER',
    a:['STABLE','UNSTABLE_BIO','BREATHABLE','GEOTHERMAL_OPT','STRICT_ATMO','NOISE','HIGH_EARTH','F_YEL_WHT','MIXED','MODERATE'],
    x: 2960, y: 1480 },
  { id:'mena3',        name:'MENA III',                   sector:'OUTER VEIL',
    a:['STABLE','NONE','TOXIC_CO2','NONE','STRICT_ATMO','LOW_FREQ','HIGH_EARTH','G_YELLOW','MIXED','LOW'],
    x: 740, y: 740 },
  { id:'shajn',        name:'SHAJN',                      sector:'TARTARUS SECTOR',
    a:['EXTREME_DIURNAL','NONE','BREATHABLE','NONE','STRICT_ATMO','NOISE','HIGH_EARTH','M_RED','SUBSURFACE','ACTIVE'],
    x: 1340, y: 2000 },
  { id:'nickerson',    name:'NICKERSON',                  sector:'AMERICAN ARM',
    a:['STABLE','NONE','BREATHABLE','SOLAR','STRICT_ATMO','TECH_HZ','HIGH_EARTH','K_ORANGE','SURFACE_OCEAN','LOW'],
    x: 1580, y: 1280 },
  { id:'eos_sunrise',  name:'EOS — SUNRISE STATION',      sector:'OUTER VEIL',
    a:['STABLE','UNSTABLE_BIO','BREATHABLE','SOLAR','STRICT_ATMO','TECH_HZ','HIGH_EARTH','G_YELLOW','SURFACE_OCEAN','LOW'],
    x: 2020, y: 720 },
  { id:'astraea2',     name:'ASTRAEA-2',                  sector:'OUTER VEIL',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','BREATHABLE','GEOTHERMAL_OPT','STRICT_ATMO','NOISE','NEAR_EARTH','M_RED','FROZEN','MODERATE'],
    x: 1880, y: 580 },
  { id:'castlemount',  name:'CASTLEMOUNT',                sector:'FRONTIER',
    a:['SCORCHED','NONE','BREATHABLE','NONE','STRICT_ATMO','SILENT','HIGH_EARTH','M_RED','FROZEN','DORMANT'],
    x: 440, y: 1660 },
  { id:'erebus',       name:'EREBUS',                     sector:'OUTER RIM',
    a:['STABLE','UNSTABLE_BIO','TOXIC_CO2','SOLAR','STRICT_ATMO','LOW_FREQ','NEAR_EARTH','K_ORANGE','SUBSURFACE','ACTIVE'],
    x: 2540, y: 280 },
  { id:'thanatos5',    name:'THANATOS V',                 sector:'OUTER RIM',
    a:['EXTREME_DIURNAL','WEAK','TOXIC_CO2','NONE','FACULTATIVE','NOISE','NEAR_EARTH','M_RED','SUBSURFACE','DORMANT'],
    x: 2920, y: 320 },
  { id:'helios_prime', name:'HELIOS PRIME',               sector:'CORE SYSTEMS',
    a:['SCORCHED','NONE','BREATHABLE','GEOTHERMAL_OPT','STRICT_ATMO','TECH_HZ','EARTH_OPTIMAL','F_YEL_WHT','SURFACE_RIVER','LOW'],
    x: 1320, y: 1000 },
  { id:'calanth',      name:'CALANTH',                    sector:'OUTER VEIL',
    a:['STABLE','NONE','TOXIC_CO2','NONE','STRICT_ATMO','LOW_FREQ','HIGH_EARTH','K_ORANGE','MIXED','MODERATE'],
    x: 1960, y: 460 },
  { id:'marrow',       name:'MARROW',                     sector:'TRAILWARD',
    a:['SCORCHED','NONE','BREATHABLE','NONE','FACULTATIVE','SILENT','LOW','M_RED','SUBSURFACE','DORMANT'],
    x: 1480, y: 1980 },
  { id:'aethra',       name:'AETHRA',                     sector:'CORE SYSTEMS',
    a:['STABLE','NONE','BREATHABLE','SOLAR','STRICT_ATMO','TECH_HZ','HIGH_EARTH','K_ORANGE','SURFACE_OCEAN','LOW'],
    x: 1400, y: 1240 },
  { id:'niveris',      name:'NIVERIS',                    sector:'OUTER RIM',
    a:['EXTREME_DIURNAL','NONE','BREATHABLE','NONE','STRICT_ATMO','LOW_FREQ','HIGH_EARTH','M_RED','FROZEN','ACTIVE'],
    x: 2780, y: 540 },

  // ── Decoy worlds (near-target false positives) ──
  // Each matches 8–9 of 10 filters → stays in the candidate list until late.
  { id:'blacksite_gamma', name:'BLACKSITE GAMMA',         sector:'OUTER RIM',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','FACULTATIVE','LOW_FREQ','EARTH_OPTIMAL','K_ORANGE','MIXED','LOW'],
    x: 2720, y: 360 },
  { id:'tartarus12',     name:'TARTARUS XII',             sector:'TARTARUS SECTOR',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','FACULTATIVE','LOW_FREQ','EARTH_OPTIMAL','G_YELLOW','SUBSURFACE','DORMANT'],
    x: 1440, y: 1860 },
  { id:'nehrunmar3',     name:'NEHRUNMAR III',            sector:'OUTER VEIL',
    a:['STABLE','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','FACULTATIVE','LOW_FREQ','EARTH_OPTIMAL','K_ORANGE','SUBSURFACE','DORMANT'],
    x: 1980, y: 600 },
  { id:'phlegethon4',    name:'PHLEGETHON IV',            sector:'TRAILWARD',
    a:['EXTREME_DIURNAL','WEAK','TOXIC_CO2','GEOTHERMAL_OPT','FACULTATIVE','LOW_FREQ','EARTH_OPTIMAL','K_ORANGE','SUBSURFACE','DORMANT'],
    x: 1020, y: 1760 },

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

// ── Mini-Map Rendering ──
const BVT_MAP_W = 3200, BVT_MAP_H = 2067;
let bvtMapImg = null;
let bvtAnimReq = null;
let bvtZoom = 1, bvtPanX = 0, bvtPanY = 0;
let bvtDrag = null;

function bvtLoadMapImg() {
  if (bvtMapImg) return;
  bvtMapImg = new Image();
  bvtMapImg.src = 'assets/images/starmap.jpg';
  bvtMapImg.onload = () => { if (bvtView === 'targeting') bvtDrawMiniMap(); };
}

window.bvtResetMapView = function() {
  bvtZoom = 1; bvtPanX = 0; bvtPanY = 0;
  bvtDrawMiniMap();
};

// Global window handlers (attached once, target current canvas)
window.addEventListener('mousemove', e => {
  if (!bvtDrag) return;
  const dx = e.clientX - bvtDrag.sx, dy = e.clientY - bvtDrag.sy;
  bvtPanX = bvtDrag.px + dx;
  bvtPanY = bvtDrag.py + dy;
  bvtDrawMiniMap();
});
window.addEventListener('mouseup', () => {
  if (!bvtDrag) return;
  const c = document.getElementById('bvtMiniMap');
  if (c) c.style.cursor = 'grab';
  bvtDrag = null;
});

function bvtAttachMapEvents() {
  const canvas = document.getElementById('bvtMiniMap');
  if (!canvas || canvas._bvtAttached) return;
  canvas._bvtAttached = true;

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.18 : 1/1.18;
    const newZoom = Math.max(1, Math.min(10, bvtZoom * factor));
    const k = newZoom / bvtZoom;
    bvtPanX = mx - (mx - bvtPanX) * k;
    bvtPanY = my - (my - bvtPanY) * k;
    bvtZoom = newZoom;
    bvtDrawMiniMap();
  }, { passive: false });

  canvas.addEventListener('mousedown', e => {
    bvtDrag = { sx: e.clientX, sy: e.clientY, px: bvtPanX, py: bvtPanY };
    canvas.style.cursor = 'grabbing';
  });
  canvas.style.cursor = 'grab';
}

function bvtDrawPin(ctx, x, y, isQueen, t) {
  if (isQueen) {
    const phase = (t % 1400) / 1400;
    const r = 14 + Math.sin(phase * Math.PI * 2) * 5;
    ctx.strokeStyle = '#ff3a3a';
    ctx.globalAlpha = 0.4 + 0.5 * Math.sin(phase * Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.stroke();
    ctx.globalAlpha = 0.18;
    ctx.beginPath(); ctx.arc(x, y, r + 8, 0, Math.PI*2); ctx.stroke();
    ctx.globalAlpha = 1;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, 14);
    glow.addColorStop(0, 'rgba(255,58,58,0.85)');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#ff3a3a';
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI*2); ctx.fill();
  } else {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, 11);
    glow.addColorStop(0, 'rgba(77,255,145,0.55)');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#4dff91';
    ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI*2); ctx.stroke();
  }
}

function bvtDrawMiniMap() {
  const canvas = document.getElementById('bvtMiniMap');
  if (!canvas) return;
  const wrap = canvas.parentElement;
  if (!wrap) return;
  const cw = wrap.clientWidth;
  const ch = wrap.clientHeight;
  if (cw < 10 || ch < 10) return;
  if (canvas.width !== cw || canvas.height !== ch) {
    canvas.width = cw; canvas.height = ch;
  }
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000a10';
  ctx.fillRect(0, 0, cw, ch);

  // Fit map preserving aspect ratio + zoom/pan
  const baseScale = Math.min(cw / BVT_MAP_W, ch / BVT_MAP_H);
  const scale = baseScale * bvtZoom;
  const dw = BVT_MAP_W * scale, dh = BVT_MAP_H * scale;
  const dx = (cw - dw) / 2 + bvtPanX;
  const dy = (ch - dh) / 2 + bvtPanY;
  if (bvtMapImg && bvtMapImg.complete) {
    ctx.globalAlpha = 0.55;
    ctx.drawImage(bvtMapImg, dx, dy, dw, dh);
    ctx.globalAlpha = 1;
  }
  // Border
  ctx.strokeStyle = '#1a3320';
  ctx.lineWidth = 1;
  ctx.strokeRect(dx + 0.5, dy + 0.5, dw - 1, dh - 1);

  const matches = bvtMatchingSystems();
  const isSolved = matches.length === 1 && bvtActiveFilters().length === 10;
  const t = Date.now();

  matches.forEach(sys => {
    const px = dx + sys.x * scale;
    const py = dy + sys.y * scale;
    const isQueen = isSolved && sys.id === 'blacksite_theta';
    bvtDrawPin(ctx, px, py, isQueen, t);
  });

  // Queen label
  if (isSolved) {
    const q = matches[0];
    const px = dx + q.x * scale;
    const py = dy + q.y * scale;
    ctx.font = 'bold 12px "Share Tech Mono",monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const label = '⚠ ' + q.name + ' ⚠';
    const w = ctx.measureText(label).width + 14;
    const ly = py + 22;
    ctx.fillStyle = 'rgba(20,0,0,0.9)';
    ctx.fillRect(px - w/2, ly, w, 18);
    ctx.strokeStyle = '#ff3a3a';
    ctx.lineWidth = 1;
    ctx.strokeRect(px - w/2, ly, w, 18);
    ctx.fillStyle = '#ff8888';
    ctx.fillText(label, px, ly + 3);
    ctx.textBaseline = 'alphabetic';
  }
}
window.bvtDrawMiniMap = bvtDrawMiniMap;

function bvtAnimLoop() {
  if (bvtView !== 'targeting') { bvtAnimReq = null; return; }
  const matches = bvtMatchingSystems();
  const isSolved = matches.length === 1 && bvtActiveFilters().length === 10;
  if (!isSolved) { bvtAnimReq = null; return; }
  bvtDrawMiniMap();
  bvtAnimReq = requestAnimationFrame(bvtAnimLoop);
}

window.addEventListener('resize', () => { if (bvtView === 'targeting') bvtDrawMiniMap(); });

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

  // ── RIGHT: Mini-Map + compact list ──
  const counterCls = isSolved ? 'bvt-counter solved'
                   : (matches.length <= 3 ? 'bvt-counter close' : 'bvt-counter');

  const showList = matches.length > 0 && matches.length <= 12;
  const listHtml = !showList ? '' : matches.map(s => {
    const isQueen = isSolved && s.id === 'blacksite_theta';
    return `<div class="bvt-sys-row${isQueen?' queen':''}">
      <span class="bvt-sys-dot"></span>
      <span class="bvt-sys-name">${s.name}</span>
      <span class="bvt-sys-sector">${s.sector}</span>
    </div>`;
  }).join('');

  const noMatchHtml = matches.length === 0
    ? '<div class="bvt-empty-sys">NO MATCHING SYSTEMS — INPUT INCONSISTENT</div>' : '';

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
        <span class="bvt-col-title">// CANDIDATE STAR MAP</span>
        <span class="${counterCls}">${matches.length} / ${BVT_SYSTEMS.length}</span>
      </div>
      <div class="bvt-active-summary">
        <span>${active.length} / 10 FILTERS ACTIVE</span>
        ${isSolved ? '<span class="bvt-locked-tag">◆ TARGET ACQUIRED</span>' : ''}
      </div>
      <div class="bvt-map-wrap">
        <canvas id="bvtMiniMap"></canvas>
        <div class="bvt-map-controls">
          <button class="bvt-map-ctrl" onclick="bvtResetMapView()" title="Reset view">⟲ FIT</button>
          <div class="bvt-map-hint">⊙ WHEEL: ZOOM · DRAG: PAN</div>
        </div>
      </div>
      ${noMatchHtml}
      ${showList ? `<div class="bvt-sys-list">${listHtml}</div>` : ''}
    </div>
  `;

  // Make sure image is loading and start animation
  bvtLoadMapImg();
  // Render map after layout settles, attach zoom/pan handlers
  requestAnimationFrame(() => { bvtAttachMapEvents(); bvtDrawMiniMap(); });
  // Start pulse loop only if Queen is locked
  if (isSolved && !bvtAnimReq) bvtAnimReq = requestAnimationFrame(bvtAnimLoop);
}
window.bvtRender = bvtRender;
