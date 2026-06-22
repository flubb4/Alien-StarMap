import { ref, set, onValue, remove } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ════════════════════════════════════════════════════════════════
// PROJECT BLACK VEIL — TARGETING ANALYSIS TERMINAL
// Spieler tragen pro freigeschaltetem Fragment einen Filter ein.
// Bei korrektem Wert wird der Filter aktiv → Systemliste schrumpft.
// Wenn alle 10 Filter korrekt und exakt 1 System übrig → Queen-Pin auf StarMap.
// ════════════════════════════════════════════════════════════════

// Per-player: each operative fills only their own fragments' choices.
const bvtStatePath   = () => 'characters/' + window.myName + '/blackveil/targeting'; // { fragId: chosenOptionId }
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

// ── 100 Sternsysteme — gruppen-basiertes Match-Pattern ──
// Attribute-Reihenfolge: [SURFACE_TEMP, EM, ATMO, HEAT, VACUUM, BIO, GRAVITY, STAR, HYDRO, SEISMIC]
// Reduktion (F1->F10 sequentiell): 100 -> 80 -> 75 -> 63 -> 52 -> 40 -> 30 -> 15 -> 8 -> 1
const BVT_SYSTEMS = [
  { id:'sol', name:'SOL — EARTH', sector:'CORE SYSTEMS',
    a:['VOLCANIC_HOT','STRONG','TOXIC_CO2','REACTOR_DECAY','NATIVE','LOW_FREQ','LOW','A_WHITE','SUBSURFACE','MODERATE'],
    x: 1340, y: 1080 },
  { id:'thedus', name:'THEDUS', sector:'AMERICAN ARM',
    a:['STABLE','STRONG','METHANE','GEOTHERMAL_OPT','NATIVE','SILENT','CRUSHING','M_RED','SUBSURFACE','LOW'],
    x: 1480, y: 1220 },
  { id:'wolf359', name:'WOLF 359 — ANCHORPOINT', sector:'FRONTIER',
    a:['SCORCHED','WEAK','VACUUM','REACTOR_DECAY','PRESSURE_DEP','HIGH_FREQ','LOW','O_BLUE','FROZEN','VOLCANIC'],
    x: 1080, y: 1480 },
  { id:'kg348', name:'KG-348 — SEVASTOPOL', sector:'AMERICAN ARM',
    a:['VOLCANIC_HOT','MODERATE','TOXIC_CO2','GEOTHERMAL_OPT','PRESSURE_DEP','LOW_FREQ','LOW','F_YEL_WHT','SUBSURFACE','LOW'],
    x: 460, y: 380 },
  { id:'epsilon', name:'EPSILON ERIDANI — PINKERTON', sector:'CORE SYSTEMS',
    a:['SCORCHED','STRONG','TOXIC_CO2','GEOTHERMAL_OPT','STRICT_ATMO','HIGH_FREQ','CRUSHING','G_YELLOW','SURFACE_RIVER','LOW'],
    x: 1180, y: 1140 },
  { id:'wormtown', name:'WORMTOWN — FAR REACH', sector:'FRONTIER',
    a:['SCORCHED','WEAK','TOXIC_CO2','VOLCANIC_HOT','NATIVE','SILENT','HIGH_EARTH','F_YEL_WHT','SUBSURFACE','LOW'],
    x: 480, y: 1880 },
  { id:'galsworthy', name:'GALSWORTHY', sector:'FRONTIER',
    a:['STABLE','UNSTABLE_BIO','OXY_RICH','GEOTHERMAL_OPT','PRESSURE_DEP','TECH_HZ','LOW','O_BLUE','SUBSURFACE','ACTIVE'],
    x: 2940, y: 1180 },
  { id:'crestus', name:'CRESTUS PRIME', sector:'CRESTUS CLUSTER',
    a:['STABLE','MODERATE','VACUUM','VOLCANIC_HOT','NATIVE','NOISE','NEAR_EARTH','G_YELLOW','SUBSURFACE','LOW'],
    x: 2120, y: 540 },
  { id:'alphacrux', name:'ALPHA CRUCIS — PHAETON', sector:'TRAILWARD',
    a:['FROZEN','UNSTABLE_BIO','METHANE','VOLCANIC_HOT','STRICT_ATMO','NOISE','CRUSHING','O_BLUE','FROZEN','DORMANT'],
    x: 920, y: 1820 },
  { id:'pylos_prime', name:'PYLOS PRIME', sector:'INDEPENDENT CORE',
    a:['STABLE','MODERATE','METHANE','GEOTHERMAL_OPT','FACULTATIVE','HIGH_FREQ','LOW','O_BLUE','SURFACE_OCEAN','ACTIVE'],
    x: 1020, y: 1620 },
  { id:'sirius_c', name:'SIRIUS C', sector:'CORE SYSTEMS',
    a:['STABLE','NONE','TOXIC_CO2','NONE','FACULTATIVE','NOISE','LOW','F_YEL_WHT','MIXED','LOW'],
    x: 1280, y: 1140 },
  { id:'barnards', name:'BARNARD\'S STAR', sector:'FRONTIER',
    a:['FROZEN','MODERATE','METHANE','GEOTHERMAL_OPT','STRICT_ATMO','LOW_FREQ','LOW','F_YEL_WHT','SUBSURFACE','ACTIVE'],
    x: 320, y: 1140 },
  { id:'caldwell', name:'CALDWELL', sector:'AMERICAN ARM',
    a:['STABLE','UNSTABLE_BIO','VACUUM','GEOTHERMAL_OPT','PRESSURE_DEP','LOW_FREQ','CRUSHING','A_WHITE','FROZEN','VOLCANIC'],
    x: 1540, y: 1320 },
  { id:'tracon', name:'TRACON', sector:'INDEPENDENT CORE',
    a:['VOLCANIC_HOT','UNSTABLE_BIO','VACUUM','NONE','FACULTATIVE','NOISE','HIGH_EARTH','K_ORANGE','NONE','ACTIVE'],
    x: 1080, y: 1540 },
  { id:'nuovo_dur', name:'NUOVO DURANGO', sector:'AMERICAN ARM',
    a:['STABLE','STRONG','BREATHABLE','SOLAR','NATIVE','LOW_FREQ','CRUSHING','A_WHITE','SURFACE_RIVER','VOLCANIC'],
    x: 1620, y: 1380 },
  { id:'europa_x', name:'EUROPA-X', sector:'CORE SYSTEMS',
    a:['STABLE','UNSTABLE_BIO','TOXIC_CO2','REACTOR_DECAY','STRICT_ATMO','LOW_FREQ','EARTH_OPTIMAL','A_WHITE','FROZEN','LOW'],
    x: 1160, y: 920 },
  { id:'carthage', name:'CARTHAGE', sector:'CORE SYSTEMS',
    a:['STABLE','MODERATE','OXY_RICH','VOLCANIC_HOT','FACULTATIVE','NOISE','NEAR_EARTH','K_ORANGE','FROZEN','MODERATE'],
    x: 1300, y: 980 },
  { id:'thomson_st', name:'THOMSON STATION', sector:'FRONTIER',
    a:['SCORCHED','UNSTABLE_BIO','VACUUM','REACTOR_DECAY','PRESSURE_DEP','NOISE','EARTH_OPTIMAL','G_YELLOW','FROZEN','LOW'],
    x: 2700, y: 1700 },
  { id:'tunguska', name:'TUNGUSKA DRIFT', sector:'FRONTIER',
    a:['FROZEN','UNSTABLE_BIO','OXY_RICH','SOLAR','PRESSURE_DEP','TECH_HZ','LOW','G_YELLOW','NONE','MODERATE'],
    x: 720, y: 180 },
  { id:'new_sparta', name:'NEW SPARTA', sector:'CORE SYSTEMS',
    a:['FROZEN','MODERATE','OXY_RICH','REACTOR_DECAY','PRESSURE_DEP','SILENT','NEAR_EARTH','O_BLUE','FROZEN','ACTIVE'],
    x: 1500, y: 1140 },
  { id:'111tauri', name:'111 TAURI — SUTTER\'S WORLD', sector:'OUTER VEIL',
    a:['EXTREME_DIURNAL','STRONG','VACUUM','NONE','NATIVE','TECH_HZ','CRUSHING','O_BLUE','SURFACE_RIVER','LOW'],
    x: 1880, y: 480 },
  { id:'fiorina', name:'FIORINA 161', sector:'OUTER RIM',
    a:['EXTREME_DIURNAL','NONE','VACUUM','NONE','PRESSURE_DEP','SILENT','HIGH_EARTH','A_WHITE','SURFACE_RIVER','DORMANT'],
    x: 1900, y: 920 },
  { id:'shajn', name:'SHAJN', sector:'TARTARUS SECTOR',
    a:['EXTREME_DIURNAL','NONE','TOXIC_CO2','NONE','NATIVE','SILENT','CRUSHING','K_ORANGE','SURFACE_RIVER','ACTIVE'],
    x: 1340, y: 2000 },
  { id:'tauceti', name:'TAU CETI — NEW ALBION', sector:'AMERICAN ARM',
    a:['EXTREME_DIURNAL','STRONG','METHANE','SOLAR','NATIVE','SILENT','NEAR_EARTH','G_YELLOW','NONE','VOLCANIC'],
    x: 1280, y: 1280 },
  { id:'betahydri', name:'BETA HYDRI — OLYMPIA', sector:'CORE SYSTEMS',
    a:['EXTREME_DIURNAL','STRONG','OXY_RICH','NONE','STRICT_ATMO','TECH_HZ','LOW','A_WHITE','MIXED','ACTIVE'],
    x: 1420, y: 920 },
  { id:'gj2092', name:'GJ 2092 — ATLAS STATION', sector:'OUTER VEIL',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','BREATHABLE','VOLCANIC_HOT','FACULTATIVE','TECH_HZ','CRUSHING','F_YEL_WHT','SUBSURFACE','DORMANT'],
    x: 1820, y: 320 },
  { id:'tantalus', name:'TANTALUS', sector:'TARTARUS SECTOR',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','BREATHABLE','SOLAR','FACULTATIVE','LOW_FREQ','LOW','K_ORANGE','SUBSURFACE','DORMANT'],
    x: 1320, y: 1880 },
  { id:'bellerophon', name:'BELLEROPHON', sector:'CORE SYSTEMS',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','OXY_RICH','SOLAR','PRESSURE_DEP','HIGH_FREQ','HIGH_EARTH','G_YELLOW','SURFACE_OCEAN','VOLCANIC'],
    x: 1240, y: 1140 },
  { id:'sphere_mag', name:'SPHERE — MAGELLAN', sector:'OUTER RIM',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','OXY_RICH','NONE','NATIVE','LOW_FREQ','LOW','A_WHITE','MIXED','DORMANT'],
    x: 380, y: 460 },
  { id:'nickerson', name:'NICKERSON', sector:'AMERICAN ARM',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','METHANE','NONE','NATIVE','LOW_FREQ','HIGH_EARTH','O_BLUE','SURFACE_OCEAN','ACTIVE'],
    x: 1580, y: 1280 },
  { id:'procyon', name:'PROCYON — SOLOMONS', sector:'CORE SYSTEMS',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','BREATHABLE','REACTOR_DECAY','STRICT_ATMO','HIGH_FREQ','NEAR_EARTH','A_WHITE','SUBSURFACE','DORMANT'],
    x: 1180, y: 1020 },
  { id:'procyon_b', name:'PROCYON B', sector:'CORE SYSTEMS',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','BREATHABLE','NONE','NATIVE','LOW_FREQ','EARTH_OPTIMAL','K_ORANGE','MIXED','LOW'],
    x: 1180, y: 1020 },
  { id:'delphi', name:'DELPHI', sector:'CORE SYSTEMS',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','OXY_RICH','NONE','STRICT_ATMO','LOW_FREQ','LOW','F_YEL_WHT','NONE','LOW'],
    x: 1380, y: 1180 },
  { id:'vespucci', name:'VESPUCCI', sector:'CORE SYSTEMS',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','BREATHABLE','NONE','FACULTATIVE','LOW_FREQ','CRUSHING','O_BLUE','SURFACE_OCEAN','LOW'],
    x: 1240, y: 1080 },
  { id:'avraham', name:'AVRAHAM — TRADE HUB', sector:'INDEPENDENT CORE',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','BREATHABLE','GEOTHERMAL_OPT','NATIVE','HIGH_FREQ','LOW','K_ORANGE','NONE','DORMANT'],
    x: 1140, y: 1380 },
  { id:'bara_cath', name:'BARA CATHEDRALE', sector:'TARTARUS SECTOR',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','OXY_RICH','SOLAR','STRICT_ATMO','SILENT','NEAR_EARTH','K_ORANGE','SUBSURFACE','DORMANT'],
    x: 1280, y: 2000 },
  { id:'pellucid', name:'PELLUCID', sector:'OUTER VEIL',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','BREATHABLE','NONE','NATIVE','SILENT','CRUSHING','O_BLUE','SURFACE_OCEAN','MODERATE'],
    x: 860, y: 820 },
  { id:'gl259', name:'GL 259 — ARCEON STATION', sector:'OUTER VEIL',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','VOLCANIC_HOT','FACULTATIVE','TECH_HZ','HIGH_EARTH','K_ORANGE','SURFACE_RIVER','DORMANT'],
    x: 2240, y: 660 },
  { id:'sigmadrac', name:'SIGMA DRACONIS — TIRGU MIRES', sector:'OUTER RIM',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','NONE','NATIVE','HIGH_FREQ','NEAR_EARTH','G_YELLOW','SURFACE_RIVER','DORMANT'],
    x: 2380, y: 460 },
  { id:'lv426', name:'ZETA² RETICULI — LV-426', sector:'OUTER VEIL',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','SOLAR','NATIVE','HIGH_FREQ','LOW','K_ORANGE','FROZEN','VOLCANIC'],
    x: 1620, y: 760 },
  { id:'lv223', name:'ZETA² RETICULI — LV-223', sector:'OUTER VEIL',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','REACTOR_DECAY','FACULTATIVE','NOISE','CRUSHING','A_WHITE','SUBSURFACE','ACTIVE'],
    x: 1640, y: 740 },
  { id:'deltapav', name:'DELTA PAVONIS — PYLOS NINE', sector:'INDEPENDENT CORE',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','VOLCANIC_HOT','NATIVE','LOW_FREQ','HIGH_EARTH','M_RED','FROZEN','VOLCANIC'],
    x: 1080, y: 1660 },
  { id:'steeple', name:'STEEPLE-MASON', sector:'FRONTIER',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','VOLCANIC_HOT','PRESSURE_DEP','TECH_HZ','NEAR_EARTH','A_WHITE','SUBSURFACE','DORMANT'],
    x: 320, y: 940 },
  { id:'roanoke', name:'ROANOKE', sector:'OUTER VEIL',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','VOLCANIC_HOT','PRESSURE_DEP','TECH_HZ','CRUSHING','K_ORANGE','SURFACE_RIVER','DORMANT'],
    x: 760, y: 540 },
  { id:'glamour', name:'GLAMOUR', sector:'INDEPENDENT CORE',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','SOLAR','FACULTATIVE','HIGH_FREQ','LOW','K_ORANGE','FROZEN','VOLCANIC'],
    x: 980, y: 1480 },
  { id:'tracinium', name:'TRACINIUM', sector:'FRONTIER',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','VOLCANIC_HOT','PRESSURE_DEP','SILENT','EARTH_OPTIMAL','K_ORANGE','NONE','DORMANT'],
    x: 2360, y: 240 },
  { id:'aethra', name:'AETHRA', sector:'CORE SYSTEMS',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','REACTOR_DECAY','FACULTATIVE','TECH_HZ','EARTH_OPTIMAL','K_ORANGE','SURFACE_OCEAN','MODERATE'],
    x: 1400, y: 1240 },
  { id:'brakari', name:'BRAKARI', sector:'FRONTIER',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','VOLCANIC_HOT','NATIVE','TECH_HZ','CRUSHING','A_WHITE','MIXED','LOW'],
    x: 2980, y: 720 },
  { id:'289hydrae', name:'289 G. HYDRAE — JEREMIAH VI', sector:'OUTER RIM',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','PRESSURE_DEP','SILENT','CRUSHING','K_ORANGE','NONE','LOW'],
    x: 2480, y: 720 },
  { id:'brackens', name:'BRACKEN\'S WORLD', sector:'OUTER VEIL',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','STRICT_ATMO','NOISE','CRUSHING','O_BLUE','FROZEN','VOLCANIC'],
    x: 1740, y: 540 },
  { id:'hephaistos', name:'HEPHAISTOS', sector:'TARTARUS SECTOR',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','STRICT_ATMO','TECH_HZ','LOW','O_BLUE','SURFACE_RIVER','DORMANT'],
    x: 1460, y: 1940 },
  { id:'lapchet', name:'LAPCHET', sector:'CORE SYSTEMS',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','PRESSURE_DEP','TECH_HZ','NEAR_EARTH','G_YELLOW','SUBSURFACE','ACTIVE'],
    x: 1480, y: 1240 },
  { id:'thetis5', name:'THETIS 5', sector:'TARTARUS SECTOR',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','PRESSURE_DEP','SILENT','EARTH_OPTIMAL','K_ORANGE','FROZEN','DORMANT'],
    x: 1240, y: 1720 },
  { id:'rigel_harbour', name:'RIGEL HARBOUR', sector:'AMERICAN ARM',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','STRICT_ATMO','HIGH_FREQ','HIGH_EARTH','K_ORANGE','NONE','VOLCANIC'],
    x: 1480, y: 1440 },
  { id:'helios_prime', name:'HELIOS PRIME', sector:'CORE SYSTEMS',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','PRESSURE_DEP','TECH_HZ','HIGH_EARTH','F_YEL_WHT','SURFACE_RIVER','MODERATE'],
    x: 1320, y: 1000 },
  { id:'sheherazade', name:'SHEHERAZADE', sector:'AMERICAN ARM',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','NATIVE','TECH_HZ','NEAR_EARTH','O_BLUE','MIXED','DORMANT'],
    x: 1660, y: 1220 },
  { id:'leper_col', name:'LEPER COLONY', sector:'TRAILWARD',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','NATIVE','TECH_HZ','CRUSHING','O_BLUE','SURFACE_RIVER','MODERATE'],
    x: 1620, y: 1880 },
  { id:'kapteyn', name:'KAPTEYN', sector:'INDEPENDENT CORE',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','NATIVE','HIGH_FREQ','LOW','M_RED','SURFACE_RIVER','VOLCANIC'],
    x: 920, y: 1700 },
  { id:'tartarus7', name:'TARTARUS VII', sector:'TARTARUS SECTOR',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','NATIVE','NOISE','HIGH_EARTH','K_ORANGE','NONE','VOLCANIC'],
    x: 1380, y: 1820 },
  { id:'parnassus', name:'PARNASSUS', sector:'CORE SYSTEMS',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','PRESSURE_DEP','SILENT','EARTH_OPTIMAL','K_ORANGE','MIXED','MODERATE'],
    x: 1380, y: 1020 },
  { id:'vanmaanen', name:'VAN MAANEN\'S STAR — HERMES-7', sector:'OUTER RIM',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','FACULTATIVE','SILENT','CRUSHING','M_RED','FROZEN','DORMANT'],
    x: 2680, y: 580 },
  { id:'hyades', name:'HYADES — KORN STATION', sector:'OUTER RIM',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','FACULTATIVE','NOISE','CRUSHING','G_YELLOW','MIXED','MODERATE'],
    x: 2620, y: 460 },
  { id:'ophiuchi70', name:'70 OPHIUCHI — V\'KAR', sector:'OUTER VEIL',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','FACULTATIVE','TECH_HZ','HIGH_EARTH','A_WHITE','SUBSURFACE','MODERATE'],
    x: 820, y: 680 },
  { id:'glaxus', name:'GLAXUS — MINING MOON', sector:'TRAILWARD',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','FACULTATIVE','NOISE','NEAR_EARTH','M_RED','SUBSURFACE','DORMANT'],
    x: 1180, y: 1820 },
  { id:'marrow', name:'MARROW', sector:'TRAILWARD',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','FACULTATIVE','HIGH_FREQ','HIGH_EARTH','F_YEL_WHT','SURFACE_OCEAN','DORMANT'],
    x: 1480, y: 1980 },
  { id:'hodgson9', name:'HODGSON THETA-9', sector:'TARTARUS SECTOR',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','FACULTATIVE','TECH_HZ','EARTH_OPTIMAL','M_RED','SUBSURFACE','ACTIVE'],
    x: 1180, y: 1960 },
  { id:'cavendish', name:'CAVENDISH', sector:'FRONTIER',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','FACULTATIVE','SILENT','EARTH_OPTIMAL','K_ORANGE','FROZEN','VOLCANIC'],
    x: 2960, y: 1480 },
  { id:'castlemount', name:'CASTLEMOUNT', sector:'FRONTIER',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','FACULTATIVE','NOISE','LOW','K_ORANGE','SUBSURFACE','LOW'],
    x: 440, y: 1660 },
  { id:'kaaba', name:'KAABA', sector:'CORE SYSTEMS',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','FACULTATIVE','NOISE','NEAR_EARTH','K_ORANGE','NONE','LOW'],
    x: 1420, y: 1320 },
  { id:'ascalon', name:'ASCALON', sector:'TARTARUS SECTOR',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','FACULTATIVE','TECH_HZ','EARTH_OPTIMAL','M_RED','NONE','ACTIVE'],
    x: 1380, y: 1780 },
  { id:'lambdaaur', name:'LAMBDA AURIGAE — KHEPRI-9', sector:'OUTER RIM',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','FACULTATIVE','LOW_FREQ','NEAR_EARTH','K_ORANGE','MIXED','VOLCANIC'],
    x: 2540, y: 380 },
  { id:'thanatos5', name:'THANATOS V', sector:'OUTER RIM',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','FACULTATIVE','LOW_FREQ','LOW','G_YELLOW','SURFACE_OCEAN','ACTIVE'],
    x: 2920, y: 320 },
  { id:'aldebaran', name:'ALDEBARAN OUTPOST', sector:'OUTER RIM',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','FACULTATIVE','LOW_FREQ','NEAR_EARTH','M_RED','SUBSURFACE','ACTIVE'],
    x: 2880, y: 460 },
  { id:'weyland_isles', name:'WEYLAND-ISLES OUTPOST', sector:'OUTER RIM',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','FACULTATIVE','LOW_FREQ','LOW','A_WHITE','SURFACE_OCEAN','LOW'],
    x: 660, y: 280 },
  { id:'mururoa2', name:'MURUROA II', sector:'CRESTUS CLUSTER',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','FACULTATIVE','LOW_FREQ','CRUSHING','G_YELLOW','SURFACE_OCEAN','LOW'],
    x: 2080, y: 480 },
  { id:'frost', name:'FROST', sector:'OUTER RIM',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','FACULTATIVE','LOW_FREQ','HIGH_EARTH','F_YEL_WHT','SUBSURFACE','ACTIVE'],
    x: 2780, y: 280 },
  { id:'astraea2', name:'ASTRAEA-2', sector:'OUTER VEIL',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','FACULTATIVE','LOW_FREQ','LOW','F_YEL_WHT','SURFACE_RIVER','VOLCANIC'],
    x: 1880, y: 580 },
  { id:'eos_sunrise', name:'EOS — SUNRISE STATION', sector:'OUTER VEIL',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','FACULTATIVE','LOW_FREQ','NEAR_EARTH','A_WHITE','MIXED','MODERATE'],
    x: 2020, y: 720 },
  { id:'omega_st', name:'OMEGA STATION', sector:'CRESTUS CLUSTER',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','FACULTATIVE','LOW_FREQ','HIGH_EARTH','K_ORANGE','SUBSURFACE','ACTIVE'],
    x: 2180, y: 620 },
  { id:'calanth', name:'CALANTH', sector:'OUTER VEIL',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','FACULTATIVE','LOW_FREQ','LOW','F_YEL_WHT','SUBSURFACE','LOW'],
    x: 1960, y: 460 },
  { id:'niveris', name:'NIVERIS', sector:'OUTER RIM',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','FACULTATIVE','LOW_FREQ','CRUSHING','M_RED','FROZEN','MODERATE'],
    x: 2780, y: 540 },
  { id:'thurnish', name:'THURNISH', sector:'CRESTUS CLUSTER',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','FACULTATIVE','LOW_FREQ','NEAR_EARTH','M_RED','SUBSURFACE','DORMANT'],
    x: 2240, y: 380 },
  { id:'groombridge', name:'GROOMBRIDGE 34', sector:'OUTER VEIL',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','FACULTATIVE','LOW_FREQ','HIGH_EARTH','M_RED','NONE','DORMANT'],
    x: 880, y: 580 },
  { id:'mena3', name:'MENA III', sector:'OUTER VEIL',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','FACULTATIVE','LOW_FREQ','NEAR_EARTH','M_RED','SURFACE_OCEAN','VOLCANIC'],
    x: 740, y: 740 },
  { id:'eta_cas', name:'ETA CASSIOPEIAE', sector:'FRONTIER',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','FACULTATIVE','LOW_FREQ','NEAR_EARTH','M_RED','SUBSURFACE','VOLCANIC'],
    x: 580, y: 320 },
  { id:'tartarus12', name:'TARTARUS XII', sector:'TARTARUS SECTOR',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','FACULTATIVE','LOW_FREQ','EARTH_OPTIMAL','A_WHITE','SUBSURFACE','DORMANT'],
    x: 1440, y: 1860 },
  { id:'phlegethon4', name:'PHLEGETHON IV', sector:'TRAILWARD',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','FACULTATIVE','LOW_FREQ','EARTH_OPTIMAL','O_BLUE','SUBSURFACE','DORMANT'],
    x: 1020, y: 1760 },
  { id:'nehrunmar3', name:'NEHRUNMAR III', sector:'OUTER VEIL',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','FACULTATIVE','LOW_FREQ','EARTH_OPTIMAL','G_YELLOW','NONE','VOLCANIC'],
    x: 1980, y: 600 },
  { id:'kronos_prime', name:'KRONOS PRIME', sector:'CORE SYSTEMS',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','FACULTATIVE','LOW_FREQ','EARTH_OPTIMAL','O_BLUE','SURFACE_OCEAN','ACTIVE'],
    x: 1500, y: 1080 },
  { id:'erebus', name:'EREBUS', sector:'OUTER RIM',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','FACULTATIVE','LOW_FREQ','EARTH_OPTIMAL','A_WHITE','SURFACE_OCEAN','VOLCANIC'],
    x: 2540, y: 280 },
  { id:'gemini_xi', name:'GEMINI XI', sector:'AMERICAN ARM',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','FACULTATIVE','LOW_FREQ','EARTH_OPTIMAL','O_BLUE','MIXED','DORMANT'],
    x: 1700, y: 1280 },
  { id:'pylos_seven', name:'PYLOS-7', sector:'INDEPENDENT CORE',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','FACULTATIVE','LOW_FREQ','EARTH_OPTIMAL','M_RED','FROZEN','VOLCANIC'],
    x: 1080, y: 1580 },
  { id:'blacksite_gamma', name:'BLACKSITE GAMMA', sector:'OUTER RIM',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','FACULTATIVE','LOW_FREQ','EARTH_OPTIMAL','K_ORANGE','MIXED','ACTIVE'],
    x: 2720, y: 360 },
  { id:'kamino7', name:'KAMINO-7', sector:'OUTER RIM',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','FACULTATIVE','LOW_FREQ','EARTH_OPTIMAL','K_ORANGE','FROZEN','VOLCANIC'],
    x: 2600, y: 200 },
  { id:'revenant', name:'REVENANT', sector:'TRAILWARD',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','FACULTATIVE','LOW_FREQ','EARTH_OPTIMAL','K_ORANGE','SURFACE_OCEAN','LOW'],
    x: 760, y: 1620 },
  { id:'damascus', name:'DAMASCUS', sector:'CORE SYSTEMS',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','FACULTATIVE','LOW_FREQ','EARTH_OPTIMAL','K_ORANGE','NONE','VOLCANIC'],
    x: 1240, y: 1240 },
  { id:'atrocity_falls', name:'ATROCITY FALLS', sector:'TRAILWARD',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','FACULTATIVE','LOW_FREQ','EARTH_OPTIMAL','K_ORANGE','FROZEN','VOLCANIC'],
    x: 920, y: 1900 },
  { id:'shimmer_bay', name:'SHIMMER BAY', sector:'OUTER RIM',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','FACULTATIVE','LOW_FREQ','EARTH_OPTIMAL','K_ORANGE','MIXED','DORMANT'],
    x: 2900, y: 380 },
  { id:'chrysalis_3', name:'CHRYSALIS-3', sector:'TARTARUS SECTOR',
    // Final decoy: matches F1-F9 perfectly, fails only F10 (tectonically active)
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','FACULTATIVE','LOW_FREQ','EARTH_OPTIMAL','K_ORANGE','SUBSURFACE','ACTIVE'],
    x: 1240, y: 1900 },
  { id:'blacksite_theta', name:'BLACKSITE THETA', sector:'[REDACTED]',
    a:['EXTREME_DIURNAL','UNSTABLE_BIO','TOXIC_CO2','GEOTHERMAL_OPT','FACULTATIVE','LOW_FREQ','EARTH_OPTIMAL','K_ORANGE','SUBSURFACE','DORMANT'],
    x: 2840, y: 220 },
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
  // Player's own targeting choices
  onValue(ref(window.db, bvtStatePath()), snap => {
    bvtState = snap.val() || {};
    if (document.getElementById('bvOverlay').classList.contains('active') && bvtView === 'targeting') {
      bvtRender();
    }
  });
  // Which fragments this client may work: GM sees all, players only their own drops
  if (window.isGM) {
    bvtUnlocked = (window.BV_ALL_IDS || []).slice();
  } else {
    onValue(ref(window.db, 'characters/' + window.myName + '/blackveil/unlocked'), snap => {
      bvtUnlocked = snap.val() ? Object.keys(snap.val()).map(Number) : [];
      if (document.getElementById('bvOverlay').classList.contains('active') && bvtView === 'targeting') {
        bvtRender();
      }
    });
  }
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
  if (btn)   { btn.textContent = 'Targeting Analysis'; btn.classList.remove('on'); }
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
  set(ref(window.db, bvtStatePath()), Object.keys(update).length ? update : null)
    .then(() => bvtCheckQueenLock());
};

window.bvtClearAll = function() {
  remove(ref(window.db, bvtStatePath()));
  remove(ref(window.db, BVT_QUEEN_PATH));
};

// ── View Toggle ──
window.bvtToggleView = function() {
  bvtView = (bvtView === 'targeting') ? 'fragments' : 'targeting';
  const tBtn = document.getElementById('bvtToggleBtn');
  tBtn.textContent = bvtView === 'targeting' ? '◀ Fragments' : 'Targeting Analysis';
  tBtn.classList.toggle('on', bvtView === 'targeting');
  document.getElementById('bvCardsContainer').style.display = bvtView === 'fragments' ? '' : 'none';
  document.getElementById('bvtPanel').style.display          = bvtView === 'targeting' ? 'flex' : 'none';
  if (bvtView === 'targeting') bvtRender();
};

// ── Mini-Map Rendering ──
const BVT_MAP_W = 3200, BVT_MAP_H = 2067;
let bvtMapImg = null;
let bvtAnimReq = null;
// Absolute map origin (top-left of the drawn image) within canvas pixels.
// null = "fit & centered" (computed on first draw).
let bvtZoom = 1;
let bvtMapX = null, bvtMapY = null;
let bvtDrag = null;

function bvtLoadMapImg() {
  if (bvtMapImg) return;
  bvtMapImg = new Image();
  bvtMapImg.src = 'assets/images/starmap.jpg';
  bvtMapImg.onload = () => { if (bvtView === 'targeting') bvtDrawMiniMap(); };
}

function bvtBaseScale(canvas) {
  return Math.min(canvas.width / BVT_MAP_W, canvas.height / BVT_MAP_H);
}

window.bvtResetMapView = function() {
  bvtZoom = 1;
  bvtMapX = null; bvtMapY = null;  // will re-center on next draw
  bvtDrawMiniMap();
};

// Global window handlers (attached once)
window.addEventListener('mousemove', e => {
  if (!bvtDrag) return;
  bvtMapX = bvtDrag.mx + (e.clientX - bvtDrag.sx);
  bvtMapY = bvtDrag.my + (e.clientY - bvtDrag.sy);
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
    if (newZoom === bvtZoom) return;
    const base = bvtBaseScale(canvas);
    const oldScale = base * bvtZoom;
    const newScale = base * newZoom;
    // Mouse position in map-space (3200x2067) BEFORE the zoom
    const mapPtX = (mx - bvtMapX) / oldScale;
    const mapPtY = (my - bvtMapY) / oldScale;
    // Solve for new bvtMapX/Y so the same map point lands under the mouse
    bvtMapX = mx - mapPtX * newScale;
    bvtMapY = my - mapPtY * newScale;
    bvtZoom = newZoom;
    bvtDrawMiniMap();
  }, { passive: false });

  canvas.addEventListener('mousedown', e => {
    bvtDrag = { sx: e.clientX, sy: e.clientY, mx: bvtMapX, my: bvtMapY };
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
    // Reticle marker — visible but lets the star show through center
    const glow = ctx.createRadialGradient(x, y, 0, x, y, 13);
    glow.addColorStop(0, 'rgba(77,255,145,0.35)');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI*2); ctx.fill();
    // Outer thin ring
    ctx.strokeStyle = 'rgba(77,255,145,0.55)';
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI*2); ctx.stroke();
    // Main bright ring
    ctx.strokeStyle = '#88ffbb';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI*2); ctx.stroke();
    // Small center dot
    ctx.fillStyle = '#4dff91';
    ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI*2); ctx.fill();
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
  const baseScale = bvtBaseScale(canvas);
  const scale = baseScale * bvtZoom;
  const dw = BVT_MAP_W * scale, dh = BVT_MAP_H * scale;
  // First-draw or post-reset: center the map
  if (bvtMapX === null || bvtMapY === null) {
    bvtMapX = (cw - dw) / 2;
    bvtMapY = (ch - dh) / 2;
  }
  const dx = bvtMapX, dy = bvtMapY;
  if (bvtMapImg && bvtMapImg.complete) {
    ctx.globalAlpha = 0.78;
    ctx.drawImage(bvtMapImg, dx, dy, dw, dh);
    ctx.globalAlpha = 1;
  }
  // Border
  ctx.strokeStyle = '#1e3329';
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
      !isUnlocked ? '<span class="bvt-stat locked">LOCKED</span>' :
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
        <div>
          <span class="bvt-col-kicker">Targeting Analysis</span>
          <span class="bvt-col-title">Parameter Input</span>
        </div>
        <button class="bv-btn bv-btn--danger bv-btn--sm" onclick="bvtClearAll()">Reset All</button>
      </div>
      <div class="bvt-filters">${filtersHtml}</div>
    </div>
    <div class="bvt-col bvt-col-results">
      <div class="bvt-col-hd">
        <div>
          <span class="bvt-col-kicker">Match Candidates</span>
          <span class="bvt-col-title">Candidate Star Map</span>
        </div>
        <span class="${counterCls}">${matches.length} / ${BVT_SYSTEMS.length}</span>
      </div>
      <div class="bvt-active-summary">
        <span>${active.length} / 10 Filters Active</span>
        ${isSolved ? '<span class="bvt-locked-tag">◆ TARGET ACQUIRED</span>' : ''}
      </div>
      <div class="bvt-map-wrap">
        <canvas id="bvtMiniMap"></canvas>
        <div class="bvt-map-controls">
          <button class="bvt-map-ctrl" onclick="bvtResetMapView()" title="Reset view">⟲ Fit</button>
          <div class="bvt-map-hint">Wheel: Zoom · Drag: Pan</div>
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
