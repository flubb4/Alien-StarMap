import { ref, set, remove, get, update, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ════════════════════════════════════════════════════════
// PROJECT BLACK VEIL — Fragment System (Firebase synced)
// ════════════════════════════════════════════════════════
const BV_FRAGMENTS = [
  { id:1,  android:'AX-31',         name:'"KESTREL"',   mission:"111 TAURI — SUTTER'S WORLD",    param:'SURFACE TEMPERATURE',       value:'[ +58°C / −08°C ]',           bar:88, context:'Extreme diurnal cycle confirmed. Surface peaks 58–62°C, drops to −8°C at night. Delta: 66–74K. Biological activity concentrated in subsurface layers.', status:[['CORRUPTION','OK','ok'],['GEOLOGY','ARID','ok'],['ATMO','BREATHABLE','ok'],['ORBIT','0.87 AU','ok']], ts:'2184.11.04 / 07:33:19' },
  { id:2,  android:'AX-44',         name:'"ATLAS"',      mission:'GJ2092 — ATLAS STATION',        param:'ELECTROMAGNETIC FIELD',      value:'[ UNSTABLE / 0.3µT ]',        bar:22, context:'Weak, irregular EM field. Sensor interference 60–80% of readings. No stable orbit possible. Anomaly: field shows biologically-patterned fluctuation frequency.', status:[['CORRUPTION','34.7%','warn'],['EM ANOMALY','ACTIVE','crit'],['ORBIT','UNSTABLE','warn'],['ANDROID','COMPROMISED','crit']], ts:'2184.12.17 / 14:02:57' },
  { id:3,  android:'AX-47',         name:'"PEREGRINE"',  mission:'GL259 — ARCEON STATION',        param:'ATMOSPHERIC COMPOSITION',   value:'[ CO₂ 3.1% / O₂ 6.8% ]',     bar:32, context:'Biologically aggressive atmosphere. CO₂ exceeds tolerance threshold ×6. O₂ at 6.8% — lethal without filter in <4min. For target organism: optimal.', status:[['CORRUPTION','12.3%','ok'],['ATMO','TOXIC','warn'],['FILTER','REQUIRED','warn'],['ORBIT','STABLE','ok']], ts:'2185.01.08 / 09:15:44' },
  { id:4,  android:'AX-62 "BOYD"',  name:'',             mission:'289 G. HYDRAE — JEREMIAH VI',   param:'OPTIMAL NEST TEMPERATURE',  value:'[ 38–42°C CONSTANT ]',        bar:95, context:'Xenomorph activity increases significantly near 38–42°C heat sources. Reproduction rate +340%. Reactor cores, geothermal, or volcanic activity confirmed as nest substrate.', status:[['CORRUPTION','MINIMAL','ok'],['NEST DENSITY','HIGH','warn'],['HEAT SOURCE','INTERNAL','ok'],['STATUS','EXTRACTED','ok']], ts:'2185.01.24 / 22:48:11' },
  { id:5,  android:'HALVERSON E.',   name:'"HERMES-7"',   mission:"VAN MAANEN'S STAR",             param:'VACUUM TOLERANCE',          value:'[ SURVIVAL: >90s ]',          bar:75, context:'Organism survives brief vacuum exposure without protection. 90–120s documented. Conclusion: target planet does not require a stable atmosphere as a base requirement.', status:[['CORRUPTION','8.1%','ok'],['ATMO','FACULTATIVE','ok'],['VACUUM','SURVIVES','warn'],['STATION','OFFLINE','crit']], ts:'2184.09.30 / 03:17:22' },
  { id:6,  android:'AX-80',         name:'"CINDER"',     mission:'LAMBDA AURIGAE — KHEPRI-9',     param:'BIOELECTRIC SIGNAL PATTERN',value:'[ 0.3–8 Hz ]',                bar:61, context:'Low-frequency bioelectric pulses, 0.3–8Hz. Identical to known xenomorph communication patterns. Range: 12–40km underground. Probable function: colony coordination.', status:[['CORRUPTION','29.4%','warn'],['FREQUENCY','0.3–8 Hz','warn'],['RANGE','12–40 km','ok'],['ANDROID','REPURPOSED','crit']], ts:'2185.02.11 / 18:55:03' },
  { id:7,  android:'AX-92',         name:'"VALIANT"',    mission:'████████ — [CLASSIFIED]',       param:'GRAVITATIONAL INDEX',       value:'[ 0.7–1.1 G ]',              bar:80, context:'Queen prefers near-Earth gravity for reproductive processes. Below 0.6G: egg morphology unstable. Above 1.2G: drone mobility restricted. Optimum: 0.85–0.95G.', status:[['CORRUPTION','41.2%','warn'],['ACCESS','RESTRICTED','warn'],['GRAVITY','0.89G TYP','ok'],['MISSION','CLASSIFIED','crit']], ts:'2185.03.██ / ██:██:██' },
  { id:8,  android:'AX-101',        name:'"ALCYONE"',    mission:'████████ — [CLASSIFIED]',       param:'RADIATION / STELLAR TYPE',  value:'[ UV HIGH / K-TYPE STAR ]',   bar:58, context:'Target planet orbits K-type star. UV 1.4–1.8× Sol standard. Vegetation minimal. Xeno-melanin absorbs UV without damage — favors dominance on barren rocky worlds.', status:[['CORRUPTION','38.7%','warn'],['STAR TYPE','K / ORANGE','ok'],['UV INDEX','1.4–1.8×','warn'],['MISSION','CLASSIFIED','crit']], ts:'2185.04.██ / ██:██:██' },
  { id:9,  android:'AX-117',        name:'"MERIDIAN"',   mission:'████████ — [CLASSIFIED]',       param:'HYDROLOGICAL DEPTH STRUCTURE',value:'[ SUBSURFACE ONLY ]',        bar:92, context:'Water reserves exclusively below 200m depth. Surface appears dry and arid — no visible waterways. Subsurface caverns with thermal streams confirmed. Ideal concealed breeding conditions.', status:[['CORRUPTION','55.1%','crit'],['SURFACE','ARID','ok'],['DEPTH','>200m','ok'],['MISSION','CLASSIFIED','crit']], ts:'2185.05.██ / ██:██:██' },
  { id:10, android:'AX-133',        name:'"OMEGA"',      mission:'BLACKSITE THETA — [CRITICAL]',  param:'SEISMIC STABILITY',         value:'[ QUIET ZONE / <0.2 RICHTER ]',bar:12, context:'Planet geologically inert. Basalt cave systems stable for >10 million years. Structural integrity: maximum. Only known planetary class with optimal combination of ALL 10 parameters.', status:[['CORRUPTION','67.3%','crit'],['SEISMIC','0.18 RICHTER','ok'],['CAVES','STABLE >10Ma','ok'],['STATUS','FINAL FRAGMENT','crit']], ts:'████.██.██ / ██:██:██' },
];

let bvGMAuthed = false;
const BV_DB_PATH = 'session/blackveil/unlocked';

// ── Listen for changes in Firebase and update UI in real-time ──
function bvInitFirebase() {
  const bvRef = ref(window.db, BV_DB_PATH);
  onValue(bvRef, snap => {
    const unlocked = snap.val() ? Object.keys(snap.val()).map(Number) : [];
    bvUpdateBtnState(unlocked);
    if (document.getElementById('bvOverlay').classList.contains('active')) {
      bvRenderCards(unlocked);
      if (bvGMAuthed) bvRenderToggles(unlocked);
    }
  });
}

function bvGetUnlocked(cb) {
  get(ref(window.db, BV_DB_PATH)).then(snap => {
    cb(snap.val() ? Object.keys(snap.val()).map(Number) : []);
  });
}

function bvSaveUnlocked(arr) {
  const data = {};
  arr.forEach(id => { data[id] = true; });
  set(ref(window.db, BV_DB_PATH), arr.length ? data : null);
}

function bvUpdateBtnState(unlocked) {
  const btn = document.getElementById('bvBtn');
  if (!btn) return;
  if (unlocked.length > 0 || bvGMAuthed) {
    btn.classList.add('unlocked');
    btn.title = `Project Black Veil — ${unlocked.length}/10 fragments unlocked`;
  } else {
    btn.classList.remove('unlocked');
    btn.title = 'Project Black Veil — locked (no fragments unlocked yet)';
  }
}

window.openBVPanel = function() {
  bvGetUnlocked(unlocked => {
    document.getElementById('bvOverlay').classList.add('active');
    bvRenderCards(unlocked);
    if (bvGMAuthed) bvRenderToggles(unlocked);
  });
};

window.closeBVPanel = function() {
  document.getElementById('bvOverlay').classList.remove('active');
};

window.bvToggleGMPanel = function() {
  document.getElementById('bvGMPanel').classList.toggle('active');
};

window.bvGMAuth = async function() {
  const pw = document.getElementById('bvGMPw').value;
  const err = document.getElementById('bvGMErr');
  if ((await window.sha256Hex(pw)) === window.GM_PASSWORD_HASH) {
    bvGMAuthed = true;
    document.getElementById('bvGMLogin').style.display = 'none';
    document.getElementById('bvGMControls').style.display = 'block';
    err.textContent = '';
    // GM can always open panel
    document.getElementById('bvBtn').classList.add('unlocked');
    bvGetUnlocked(u => bvRenderToggles(u));
  } else {
    err.textContent = '— ACCESS DENIED';
    document.getElementById('bvGMPw').value = '';
    setTimeout(() => { err.textContent = ''; }, 1500);
  }
};

window.bvToggleFragment = function(id) {
  bvGetUnlocked(unlocked => {
    let next;
    if (unlocked.includes(id)) {
      next = unlocked.filter(x => x !== id);
    } else {
      next = [...unlocked, id].sort((a,b) => a-b);
    }
    bvSaveUnlocked(next);
  });
};

window.bvUnlockAll = function() {
  bvSaveUnlocked(BV_FRAGMENTS.map(f => f.id));
};
window.bvLockAll = function() {
  bvSaveUnlocked([]);
};

function bvRenderToggles(unlocked) {
  const grid = document.getElementById('bvToggleGrid');
  if (!grid) return;
  grid.innerHTML = BV_FRAGMENTS.map(f => {
    const on = unlocked.includes(f.id);
    return `<div class="bv-toggle-row">
      <div><span class="bv-toggle-id">${String(f.id).padStart(2,'0')}/10</span>${f.android} ${f.name}</div>
      <button class="bv-toggle-btn ${on?'on':''}" onclick="bvToggleFragment(${f.id})">
        ${on ? '✓ ACTIVE' : '— LOCKED'}
      </button>
    </div>`;
  }).join('');
}

function bvRenderCards(unlocked) {
  const c = document.getElementById('bvCardsContainer');
  if (!c) return;
  if (unlocked.length === 0) {
    c.innerHTML = `<div class="bv-empty">
      <div class="bv-empty-icon">🧬</div>
      <div>NO FRAGMENTS UNLOCKED</div>
      <div style="margin-top:8px;font-size:10px;opacity:.5;">AWAITING GM AUTHORIZATION</div>
    </div>`;
    return;
  }
  const frags = BV_FRAGMENTS.filter(f => unlocked.includes(f.id));
  c.innerHTML = `<div class="bv-cards-grid">${frags.map(f => `
    <div class="bv-frag-card">
      <div class="bv-fc-hd">
        <div>
          <div class="bv-fc-num">FRAGMENT ${String(f.id).padStart(2,'0')} / 10</div>
          <div class="bv-fc-aid">${f.android} <span style="font-size:11px;color:#4a8866">${f.name}</span></div>
        </div>
        <div class="bv-fc-cls">BLACK VEIL</div>
      </div>
      <div class="bv-fc-bd">
        <div class="bv-fc-mission">MISSION: <b>${f.mission}</b></div>
        <div>
          <div class="bv-fc-plbl">PARAMETER: ${f.param}</div>
          <div class="bv-fc-pval">${f.value}</div>
        </div>
        <div>
          <div class="bv-bar-lbl"><span>${f.param}</span><span>${f.bar}%</span></div>
          <div class="bv-bar-track"><div class="bv-bar-fill" style="width:${f.bar}%"></div></div>
        </div>
        <div class="bv-ctx">
          <div class="bv-ctx-lbl">ENVIRONMENTAL CONTEXT</div>
          ${f.context}
        </div>
        <div class="bv-sg">${f.status.map(([l,v,c])=>`<div>
          <span class="bv-sl">${l}</span>
          <span class="bv-sv ${c}">${v}</span>
        </div>`).join('')}</div>
      </div>
      <div class="bv-fc-ft">
        <span>${f.ts}</span>
        <span>HELIOS / ARD</span>
        <div class="bv-dot-live"></div>
      </div>
    </div>`).join('')}
  </div>`;
}


// Close on background click / Escape
document.getElementById('bvOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('bvOverlay')) closeBVPanel();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.getElementById('bvOverlay').classList.contains('active')) {
    closeBVPanel();
  }
});

// Init when Firebase is ready (call after auth)
function bvInit() {
  bvInitFirebase();
  bvGetUnlocked(bvUpdateBtnState);
}
