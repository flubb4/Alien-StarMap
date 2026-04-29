import { ref, set, remove, update, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ════════════════════════════════════════════════════════════════
// CHARACTER SHEET SYSTEM — v2 Industrial CRT redesign
// Firebase path: characters/{playerName}/
// ════════════════════════════════════════════════════════════════

let _csViewingPlayer = null;
let _csDebounce      = {};
let _csAllSheets     = {};
window._csAllSheets = _csAllSheets;
const _CS_MS         = 300;

// ── Open / close ──────────────────────────────────────────────────
window.openCharSheet = function() {
  _csViewingPlayer = window.myName;
  document.getElementById('charSheetOverlay').classList.add('open');
  const tabs = document.getElementById('csPlayerTabs');
  if (window.isGM) { tabs.style.display = 'flex'; _csRebuildTabs(); }
  else       { tabs.style.display = 'none'; }
  _csSubscribe(window.myName);
};

window.closeCharSheet = function() {
  document.getElementById('charSheetOverlay').classList.remove('open');
};

// ── GM player tabs ────────────────────────────────────────────────
window.csViewPlayer = function(name) {
  _csViewingPlayer = name;
  document.querySelectorAll('.cs-player-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.player === name));
  _csSubscribe(name);
};

function _csRebuildTabs() {
  const tabs = document.getElementById('csPlayerTabs');
  if (!tabs) return;
  const names = new Set([window.myName]);
  if (window._onlinePlayers) window._onlinePlayers.forEach(n => names.add(n));
  Object.keys(_csAllSheets).forEach(n => names.add(n));
  tabs.innerHTML = [...names].sort().map(n =>
    `<button class="cs-player-tab ${n===_csViewingPlayer?'active':''}"
      data-player="${n}" onclick="csViewPlayer('${n}')">${n}</button>`
  ).join('');
}

// ── Subscribe to a player's sheet in Firebase ─────────────────────
const _csSubs = {};
function _csSubscribe(playerName) {
  _csRender(playerName, _csAllSheets[playerName] || {});

  if (_csSubs[playerName]) return;
  _csSubs[playerName] = true;

  onValue(ref(window.db, 'characters/' + playerName), snap => {
    const data = snap.val() || {};
    const prev = _csAllSheets[playerName];
    if (prev && JSON.stringify(prev) === JSON.stringify(data)) return;
    _csAllSheets[playerName] = data;
    if (_csViewingPlayer === playerName) {
      const body = document.getElementById('csBody');
      const overlay = document.getElementById('charSheetOverlay');
      const sheetOpen = overlay && overlay.classList.contains('open');
      if (!sheetOpen) return;

      const active = document.activeElement;
      const userFocused = body && body.contains(active);
      if (userFocused) {
        _csPatchFields(playerName, data, active);
      } else {
        _csRender(playerName, data);
      }
    }
    if (window.isGM) _csRebuildTabs();
  }, err => {
    console.warn('Character sheet Firebase error:', err.message);
  });
}

// ── Save helpers ──────────────────────────────────────────────────
window._csSave = function(playerName, path, value) {
  if (!_csAllSheets[playerName]) _csAllSheets[playerName] = {};
  const parts = path.split('.');
  let obj = _csAllSheets[playerName];
  for (let i = 0; i < parts.length - 1; i++) {
    if (!obj[parts[i]]) obj[parts[i]] = {};
    obj = obj[parts[i]];
  }
  obj[parts[parts.length - 1]] = value;
  set(ref(window.db, 'characters/' + playerName + '/' + path.split('.').join('/')), value);
};
window._csDB = function(playerName, path, value) {
  const key = playerName + '\x01' + path;
  clearTimeout(_csDebounce[key]);
  _csDebounce[key] = setTimeout(() => window._csSave(playerName, path, value), _CS_MS);
};

// ── Helpers ───────────────────────────────────────────────────────
function _csGet(obj, path) {
  return path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : ''), obj) || '';
}
window._csGet = _csGet;
function _esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Stress / Panic response tables (Alien Evolved Edition Core Rules) ──
// Stress Response Table (p.44): D6 + stress − Resolve
const STRESS_RESPONSES = [
  { k:'Jumpy',         label:'Jumpy',         tip:'#1 — Pushing a roll gives +2 stress (instead of +1).' },
  { k:'Tunnel_Vision', label:'Tunnel Vision', tip:'#2 — All Wits-based skill rolls get −2 dice.' },
  { k:'Aggravated',    label:'Aggravated',    tip:'#3 — All Empathy-based skill rolls get −2 dice.' },
  { k:'Shakes',        label:'Shakes',        tip:'#4 — All Agility-based skill rolls get −2 dice.' },
  { k:'Frantic',       label:'Frantic',       tip:'#5 — All Strength-based skill rolls get −2 dice.' },
  { k:'Deflated',      label:'Deflated',      tip:'#6 — You cannot push any skill rolls.' },
  { k:'Mess_Up',       label:'Mess Up',       tip:'#7+ — Your action fails outright; +1 stress.' },
];
// Panic Response Table (p.73): D6 + stress − Resolve
const PANIC_RESPONSES = [
  { k:'Spooked',     label:'Spooked',     tip:'2–3 — Stress level +1.' },
  { k:'Noisy',       label:'Noisy',       tip:'4–6 — Nearby enemies are alerted to your presence.' },
  { k:'Twitchy',     label:'Twitchy',     tip:'7–8 — Make an immediate supply roll (air/ammo/power).' },
  { k:'Lose_Item',   label:'Lose Item',   tip:'9–10 — You lose a weapon or important item.' },
  { k:'Paranoid',    label:'Paranoid',    tip:'11 — Cannot give or receive help on skill rolls.' },
  { k:'Hesitant',    label:'Hesitant',    tip:'12 — Auto #10 initiative card until panic ends.' },
  { k:'Freeze',      label:'Freeze',      tip:'13 — Lose your next turn; no interrupt actions.' },
  { k:'Seek_Cover',  label:'Seek Cover',  tip:'14 — Take full cover (interrupt). Stress −1, lose next turn.' },
  { k:'Scream',      label:'Scream',      tip:'15 — Lose next turn. Stress −1. Allies in zone roll panic.' },
  { k:'Flee',        label:'Flee',        tip:'16 — Move to adjacent zone. Stress −1; allies in start zone +1 stress.' },
  { k:'Frenzy',      label:'Frenzy',      tip:'17 — Attack the nearest target until panic ends.' },
  { k:'Catatonic',   label:'Catatonic',   tip:'18+ — You collapse and cannot move until panic ends.' },
];
// Roll-mechanic states surfaced as a banner above the stress section.
const ROLL_STATES = [
  { k:'Jumpy',    label:'JUMPY',    eff:'PUSH GIVES +2 STRESS' },
  { k:'Deflated', label:'DEFLATED', eff:'CANNOT PUSH ANY ROLL'  },
  { k:'Mess_Up',  label:'MESS UP',  eff:'ACTIONS FAIL · +1 STRESS' },
];
// Attribute → stress-response that debuffs it (Stress Response Table p.44).
const DEBUFF_MAP = [
  { resp:'Frantic',       attr:'str', name:'Frantic',       skill:'Strength'  },
  { resp:'Shakes',        attr:'agi', name:'Shakes',        skill:'Agility'   },
  { resp:'Tunnel_Vision', attr:'wit', name:'Tunnel Vision', skill:'Wits'      },
  { resp:'Aggravated',    attr:'emp', name:'Aggravated',    skill:'Empathy'   },
];

// ── Render ────────────────────────────────────────────────────────
function _csRender(pn, data) {
  const body = document.getElementById('csBody');
  if (!body) return;
  const ro = window.isGM && pn !== window.myName;

  // ── primitive helpers ─────────────────────────────────────────
  const fi = (path, ph='') =>
    `<input class="cs-inp" type="text" ${ro?'readonly':''} data-pn="${pn}" data-path="${path}"
      value="${_esc(_csGet(data,path))}" placeholder="${ph}">`;
  const ta = (path, ph='', rows=2) =>
    `<textarea class="cs-inp" rows="${rows}" ${ro?'readonly':''} data-pn="${pn}" data-path="${path}"
      placeholder="${ph}">${_esc(_csGet(data,path))}</textarea>`;
  const ni = (path, w=40, extraClass='') =>
    `<input class="cs-inp ${extraClass}" type="text" ${ro?'readonly':''} data-pn="${pn}" data-path="${path}"
      value="${_esc(_csGet(data,path))}" style="width:${w}px;text-align:center">`;

  // attribute score with auto stress-response debuff applied (−2 if active).
  // Stored base value is never modified — we just display base − 2 and
  // lock the input while the debuff is active so the original isn't lost.
  const asD = (path, deb, name) => {
    const base = _csGet(data, path);
    const baseN = parseInt(base, 10);
    const numeric = !isNaN(baseN);
    const active = deb && numeric;
    const eff = active ? Math.max(0, baseN - 2) : base;
    const cls = 'cs-attr-score cs-inp' + (active ? ' cs-attr-debuffed' : '');
    const tip = active ? `BASE ${baseN} − 2 (${name}) = ${eff}` : '';
    return `<input class="${cls}" type="text" ${(ro||active)?'readonly':''} data-pn="${pn}" data-path="${path}"
      value="${_esc(eff)}"${tip?` title="${_esc(tip)}"`:''}>`;
  };
  const ss = (path) =>
    `<input class="cs-skill-score cs-inp" type="text" ${ro?'readonly':''} data-pn="${pn}" data-path="${path}"
      value="${_esc(_csGet(data,path))}">`;

  // Stress level boxes (10)
  const stressLvl = parseInt(_csGet(data,'stressLevel')) || 0;
  const stressBoxes = Array.from({length:10}, (_,i) =>
    `<div class="cs-stress-box ${i<stressLvl?'filled':''} ${ro?'readonly':''}"
      ${ro?'':` data-stress="${i+1}" data-pn="${pn}"`}></div>`
  ).join('');

  // Stress / Panic checkbox row builder
  const renderResp = (list, prefix) => list.map(r => {
    const path = prefix + '.' + r.k;
    const chk = !!_csGet(data, path);
    return `<label class="cs-panic-item${chk?' chk':''}" title="${_esc(r.tip)}">
      <input type="checkbox" ${chk?'checked':''} ${ro?'disabled':''} class="cs-chk" data-pn="${pn}" data-path="${path}"> <span>${r.label}</span>
    </label>`;
  }).join('');
  const stressRespBoxes = renderResp(STRESS_RESPONSES, 'stressResp');
  const panicRespBoxes  = renderResp(PANIC_RESPONSES,  'panicResp');

  // Roll-state banner (Jumpy / Deflated / Mess Up)
  const rollStateHtml = ROLL_STATES
    .filter(s => !!_csGet(data, 'stressResp.' + s.k))
    .map(s => `<div class="cs-active-state">
      <span class="cs-active-icon">⚠</span>
      <span class="cs-active-name">${s.label}</span>
      <span class="cs-active-effect">${s.eff}</span>
    </div>`).join('');

  // −2 badge in attribute headers
  const debuff = (path, label) =>
    _csGet(data, path) ? `<span class="cs-stat-debuff" title="${_esc(label)}">−2</span>` : '';
  const strDebuff = debuff('stressResp.Frantic',       'Frantic: −2 dice on Strength skills');
  const agiDebuff = debuff('stressResp.Shakes',        'Shakes: −2 dice on Agility skills');
  const witDebuff = debuff('stressResp.Tunnel_Vision', 'Tunnel Vision: −2 dice on Wits skills');
  const empDebuff = debuff('stressResp.Aggravated',    'Aggravated: −2 dice on Empathy skills');

  // Death roll boxes
  const dr = (path) => {
    const filled = !!_csGet(data, path);
    return `<div class="cs-dr-box ${filled?'filled':''} ${ro?'readonly':''}"
      ${ro?'':` data-dr="${path}" data-pn="${pn}"`}></div>`;
  };

  // Vital toggle (label + hidden checkbox styled as button via :has())
  const togBtn = (path, label) => {
    const chk = !!_csGet(data, path);
    return `<label class="cs-vital-toggle">
      <input type="checkbox" class="cs-chk" ${chk?'checked':''} ${ro?'disabled':''}
        data-pn="${pn}" data-path="${path}"><span>${label}</span>
    </label>`;
  };

  // Weapon row
  const wrow = (i) => `<tr>
    <td><input type="text" ${ro?'readonly':''} data-pn="${pn}" data-path="weapons.${i}.name"
        value="${_esc(_csGet(data,'weapons.'+i+'.name'))}" placeholder="—"></td>
    <td class="num-col"><input class="cs-num" type="text" ${ro?'readonly':''} data-pn="${pn}" data-path="weapons.${i}.mod"
        value="${_esc(_csGet(data,'weapons.'+i+'.mod'))}" placeholder="—"></td>
    <td class="num-col"><input class="cs-num" type="text" ${ro?'readonly':''} data-pn="${pn}" data-path="weapons.${i}.dmg"
        value="${_esc(_csGet(data,'weapons.'+i+'.dmg'))}" placeholder="—"></td>
    <td><input type="text" ${ro?'readonly':''} data-pn="${pn}" data-path="weapons.${i}.range"
        value="${_esc(_csGet(data,'weapons.'+i+'.range'))}" placeholder="range"></td>
    <td class="num-col"><input class="cs-num" type="text" ${ro?'readonly':''} data-pn="${pn}" data-path="weapons.${i}.ammo"
        value="${_esc(_csGet(data,'weapons.'+i+'.ammo'))}" placeholder="—"></td>
    <td class="num-col"><input class="cs-num" type="text" ${ro?'readonly':''} data-pn="${pn}" data-path="weapons.${i}.wt"
        value="${_esc(_csGet(data,'weapons.'+i+'.wt'))}" placeholder="—"></td>
  </tr>`;

  // Gear row (10 slots) — keeps existing schema { name, air, wt }
  const grow = (i) => `<tr>
    <td class="idx-col">${String(i+1).padStart(2,'0')}</td>
    <td><input type="text" ${ro?'readonly':''} data-pn="${pn}" data-path="gear.${i}.name"
        value="${_esc(_csGet(data,'gear.'+i+'.name'))}" placeholder="— slot ${String(i+1).padStart(2,'0')} —"></td>
    <td style="width:60px"><input type="text" ${ro?'readonly':''} data-pn="${pn}" data-path="gear.${i}.air"
        value="${_esc(_csGet(data,'gear.'+i+'.air'))}" placeholder="—"></td>
    <td class="num-col"><input class="cs-num" type="text" ${ro?'readonly':''} data-pn="${pn}" data-path="gear.${i}.wt"
        value="${_esc(_csGet(data,'gear.'+i+'.wt'))}" placeholder="—"></td>
  </tr>`;

  // ── Page assembly ─────────────────────────────────────────────
  body.innerHTML = `
    <!-- TITLE BLOCK -->
    <div class="cs-title-block">
      <span class="cs-corner tl"></span><span class="cs-corner tr"></span>
      <span class="cs-corner bl"></span><span class="cs-corner br"></span>
      <h1 class="cs-sheet-title">CHARACTER SHEET</h1>
      <div class="cs-sheet-sub">
        <span>ASSET RECOVERY DIVISION</span>
        <span class="cs-tag">CLASSIFIED · EYES ONLY</span>
        <span>OPERATIVE · ${_esc(pn)}</span>
      </div>
    </div>

    <!-- §01 IDENTITY (full width) -->
    <div class="cs-panel">
      <div class="cs-panel-head">
        <div class="cs-panel-title">§ 01 · IDENTITY</div>
        <div class="cs-panel-meta">OPERATOR INPUT</div>
      </div>
      <div class="cs-panel-body">
        <div class="cs-field-row cols-4">
          <div class="cs-field"><label>NAME / DESIGNATION</label>${fi('name','— operative designation —')}</div>
          <div class="cs-field"><label>CAREER</label>${fi('career','— colonial marine, roughneck —')}</div>
          <div class="cs-field"><label>BUDDY</label>${fi('buddy','— who do you trust —')}</div>
          <div class="cs-field"><label>RIVAL</label>${fi('rival','— who do you hate —')}</div>
        </div>
        <div class="cs-field-row cols-2">
          <div class="cs-field"><label>APPEARANCE</label>${ta('appearance','— physical description / distinguishing marks —',2)}</div>
          <div class="cs-field"><label>PERSONAL AGENDA</label>${ta('agenda','— classified objectives —',2)}</div>
        </div>
      </div>
    </div>

    <!-- ─── 3-COLUMN GRID ─── -->
    <div class="cs-grid">

      <!-- COLUMN 1 -->
      <div class="cs-col">

        <!-- §02 ATTRIBUTES & SKILLS -->
        <div class="cs-panel">
          <div class="cs-panel-head">
            <div class="cs-panel-title">§ 02 · ATTRIBUTES &nbsp;/&nbsp; SKILLS</div>
            <div class="cs-panel-meta">SCORES · 1–5</div>
          </div>
          <div class="cs-panel-body">
            <div class="cs-attrs">
              <div class="cs-attr-block">
                <div class="cs-attr-name"><span>STRENGTH</span>${strDebuff}${asD('attr.str', !!_csGet(data,'stressResp.Frantic'),       'Frantic')}</div>
                <div class="cs-skill-row"><span class="cs-skill-name">CLOSE COMBAT</span>${ss('skill.closeCombat')}</div>
                <div class="cs-skill-row"><span class="cs-skill-name">HEAVY MACHINERY</span>${ss('skill.heavyMachinery')}</div>
                <div class="cs-skill-row"><span class="cs-skill-name">STAMINA</span>${ss('skill.stamina')}</div>
              </div>
              <div class="cs-attr-block">
                <div class="cs-attr-name"><span>AGILITY</span>${agiDebuff}${asD('attr.agi', !!_csGet(data,'stressResp.Shakes'),        'Shakes')}</div>
                <div class="cs-skill-row"><span class="cs-skill-name">MOBILITY</span>${ss('skill.mobility')}</div>
                <div class="cs-skill-row"><span class="cs-skill-name">PILOTING</span>${ss('skill.piloting')}</div>
                <div class="cs-skill-row"><span class="cs-skill-name">RANGED COMBAT</span>${ss('skill.rangedCombat')}</div>
              </div>
              <div class="cs-attr-block">
                <div class="cs-attr-name"><span>WITS</span>${witDebuff}${asD('attr.wit', !!_csGet(data,'stressResp.Tunnel_Vision'), 'Tunnel Vision')}</div>
                <div class="cs-skill-row"><span class="cs-skill-name">COMTECH</span>${ss('skill.comtech')}</div>
                <div class="cs-skill-row"><span class="cs-skill-name">OBSERVATION</span>${ss('skill.observation')}</div>
                <div class="cs-skill-row"><span class="cs-skill-name">SURVIVAL</span>${ss('skill.survival')}</div>
              </div>
              <div class="cs-attr-block">
                <div class="cs-attr-name"><span>EMPATHY</span>${empDebuff}${asD('attr.emp', !!_csGet(data,'stressResp.Aggravated'),    'Aggravated')}</div>
                <div class="cs-skill-row"><span class="cs-skill-name">COMMAND</span>${ss('skill.command')}</div>
                <div class="cs-skill-row"><span class="cs-skill-name">MANIPULATION</span>${ss('skill.manipulation')}</div>
                <div class="cs-skill-row"><span class="cs-skill-name">MEDICAL AID</span>${ss('skill.medicalAid')}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- §03 TALENTS -->
        <div class="cs-panel">
          <div class="cs-panel-head">
            <div class="cs-panel-title">§ 03 · TALENTS</div>
            <div class="cs-panel-meta">SPECIALIZATIONS</div>
          </div>
          <div class="cs-panel-body">
            ${ta('talents','— list talents (one per line) —',5)}
          </div>
        </div>

        <!-- §04 PROGRESSION -->
        <div class="cs-panel">
          <div class="cs-panel-head">
            <div class="cs-panel-title">§ 04 · PROGRESSION</div>
            <div class="cs-panel-meta">OPERATOR RESOURCES</div>
          </div>
          <div class="cs-panel-body">
            <div class="cs-xp-grid">
              <div class="cs-xp-cell">
                <div class="cs-xp-lbl">EXPERIENCE</div>
                <input class="cs-xp-val" type="text" ${ro?'readonly':''} data-pn="${pn}" data-path="xp"
                  value="${_esc(_csGet(data,'xp'))}" placeholder="0">
              </div>
              <div class="cs-xp-cell story">
                <div class="cs-xp-lbl">STORY POINTS</div>
                <input class="cs-xp-val" type="text" ${ro?'readonly':''} data-pn="${pn}" data-path="storyPoints"
                  value="${_esc(_csGet(data,'storyPoints'))}" placeholder="0">
              </div>
              <div class="cs-xp-cell cash">
                <div class="cs-xp-lbl">CASH · $</div>
                <input class="cs-xp-val" type="text" ${ro?'readonly':''} data-pn="${pn}" data-path="cash"
                  value="${_esc(_csGet(data,'cash'))}" placeholder="0">
              </div>
            </div>
          </div>
        </div>

      </div>

      <!-- COLUMN 2 -->
      <div class="cs-col">

        <!-- §05 VITALS -->
        <div class="cs-panel">
          <div class="cs-panel-head">
            <div class="cs-panel-title">§ 05 · VITALS</div>
            <div class="cs-panel-meta">BIOMETRIC READOUT</div>
          </div>
          <div class="cs-panel-body">
            <div class="cs-vitals">
              <div class="cs-vital health">
                <div class="cs-vital-label">HEALTH</div>
                <div class="cs-vital-readout">
                  ${ni('health.cur',38)}<span class="cs-stat-sep">/</span>${ni('health.max',38)}
                </div>
              </div>
              <div class="cs-vital resolve">
                <div class="cs-vital-label">RESOLVE</div>
                <div class="cs-vital-readout">
                  ${ni('resolve.cur',38)}<span class="cs-stat-sep">/</span>${ni('resolve.max',38)}
                </div>
              </div>
              <div class="cs-vital radiation">
                <div class="cs-vital-label">RADIATION</div>
                <div class="cs-vital-readout">${ni('radiation',38)}</div>
              </div>
              <div class="cs-vital">
                <div class="cs-vital-label">STATUS</div>
                <div class="cs-vital-toggles">
                  ${togBtn('fatigued','FATIGUED')}
                </div>
              </div>
            </div>

            <div class="cs-divider"></div>

            <!-- Roll-state banner (Jumpy / Deflated / Mess Up) -->
            <div class="cs-active-states" id="csActiveStates">${rollStateHtml}</div>

            <div class="cs-vital-label" style="margin-bottom:6px">
              STRESS LEVEL
              <span class="cs-stress-label" id="csStressLabel">${stressLvl}/10</span>
            </div>
            <div class="cs-stress-row">${stressBoxes}</div>
          </div>
        </div>

        <!-- §06 STRESS RESPONSE -->
        <div class="cs-panel">
          <div class="cs-panel-head">
            <div class="cs-panel-title">§ 06 · STRESS RESPONSE</div>
            <div class="cs-panel-meta">D6 + STRESS − RESOLVE</div>
          </div>
          <div class="cs-panel-body">
            <div class="cs-hazard"></div>
            <div class="cs-panic-grid">${stressRespBoxes}</div>
          </div>
        </div>

        <!-- §07 PANIC RESPONSE -->
        <div class="cs-panel">
          <div class="cs-panel-head">
            <div class="cs-panel-title">§ 07 · PANIC RESPONSE</div>
            <div class="cs-panel-meta">PSYCHOLOGICAL LOG</div>
          </div>
          <div class="cs-panel-body">
            <div class="cs-hazard"></div>
            <div class="cs-panic-grid">${panicRespBoxes}</div>
          </div>
        </div>

        <!-- §08 DEATH ROLLS -->
        <div class="cs-panel">
          <div class="cs-panel-head">
            <div class="cs-panel-title">§ 08 · DEATH ROLLS</div>
            <div class="cs-panel-meta"><span style="color:var(--cs-rust)">◉</span> BROKEN STATE ONLY</div>
          </div>
          <div class="cs-panel-body">
            <div class="cs-deathroll">
              <div class="cs-dr-group cs-dr-success">
                <div class="cs-dr-label">SUCCESSES</div>
                <div class="cs-dr-boxes">${dr('dr.s1')}${dr('dr.s2')}${dr('dr.s3')}</div>
              </div>
              <div class="cs-dr-group">
                <div class="cs-dr-label">FAILURES</div>
                <div class="cs-dr-boxes">${dr('dr.f1')}${dr('dr.f2')}${dr('dr.f3')}</div>
              </div>
            </div>
          </div>
        </div>

      </div>

      <!-- COLUMN 3 -->
      <div class="cs-col">

        <!-- §09 WEAPONS -->
        <div class="cs-panel">
          <div class="cs-panel-head">
            <div class="cs-panel-title">§ 09 · WEAPONS</div>
            <div class="cs-panel-meta">LOADOUT · ARMED</div>
          </div>
          <div class="cs-panel-body">
            <table class="cs-tbl cs-weapons">
              <thead><tr>
                <th style="width:32%">WEAPON</th>
                <th style="width:12%">MOD</th>
                <th style="width:12%">DMG</th>
                <th style="width:18%">RANGE</th>
                <th style="width:13%">AMMO</th>
                <th style="width:13%">WT</th>
              </tr></thead>
              <tbody>${[0,1,2,3].map(wrow).join('')}</tbody>
            </table>
          </div>
        </div>

        <!-- §10 ARMOR -->
        <div class="cs-panel">
          <div class="cs-panel-head">
            <div class="cs-panel-title">§ 10 · ARMOR</div>
            <div class="cs-panel-meta">PROTECTIVE RATING</div>
          </div>
          <div class="cs-panel-body">
            <div class="cs-armor-row cs-armor-head">
              <span>DESIGNATION</span><span>WT</span><span>LVL</span>
            </div>
            <div class="cs-armor-row">
              <input type="text" ${ro?'readonly':''} data-pn="${pn}" data-path="armor.name"
                value="${_esc(_csGet(data,'armor.name'))}" placeholder="— M3 personnel armor —">
              <input class="cs-num" type="text" ${ro?'readonly':''} data-pn="${pn}" data-path="armor.weight"
                value="${_esc(_csGet(data,'armor.weight'))}" placeholder="—">
              <input class="cs-num" type="text" ${ro?'readonly':''} data-pn="${pn}" data-path="armor.level"
                value="${_esc(_csGet(data,'armor.level'))}" placeholder="—">
            </div>
          </div>
        </div>

        <!-- §11 GEAR -->
        <div class="cs-panel">
          <div class="cs-panel-head">
            <div class="cs-panel-title">§ 11 · GEAR</div>
            <div class="cs-panel-meta">10 SLOTS · WT TRACKED</div>
          </div>
          <div class="cs-panel-body">
            <table class="cs-tbl cs-gear">
              <thead><tr>
                <th style="width:24px">#</th>
                <th>ITEM</th>
                <th style="width:60px">AIR/PWR</th>
                <th style="width:48px">WT</th>
              </tr></thead>
              <tbody>${Array.from({length:10},(_,i)=>grow(i)).join('')}</tbody>
            </table>

            <div class="cs-divider"></div>
            <div class="cs-field" style="margin-top:4px">
              <label>TINY ITEMS</label>
              ${ta('tinyItems','— cigarettes, data tapes, drugs, cash —',2)}
            </div>

            <div class="cs-signature">
              <div class="cs-field" style="margin:0">
                <label>⚑ SIGNATURE ITEM</label>
                ${fi('sigItem','— item of personal significance —')}
              </div>
            </div>
          </div>
        </div>

        <!-- §12 ENCUMBRANCE -->
        <div class="cs-panel">
          <div class="cs-panel-head">
            <div class="cs-panel-title">§ 12 · ENCUMBRANCE</div>
            <div class="cs-panel-meta">LOAD · STRENGTH × 2</div>
          </div>
          <div class="cs-panel-body">
            <div class="cs-enc-wrap">
              <div class="cs-enc-track">
                <div class="cs-enc-fill" id="csEncFill" style="width:0%"></div>
              </div>
              <div class="cs-enc-vals">
                ${ni('encumb.cur',38)}<span class="cs-enc-sep">/</span>${ni('encumb.max',38)}
              </div>
            </div>
            <div class="cs-enc-note">MANUAL · UPDATE FROM GEAR &amp; WEAPONS</div>
          </div>
        </div>

      </div>
    </div>

    <!-- §13 INJURIES (full width) -->
    <div class="cs-panel" style="margin-top:14px">
      <div class="cs-panel-head">
        <div class="cs-panel-title">§ 13 · SERIOUS INJURIES &amp; MENTAL TRAUMA</div>
        <div class="cs-panel-meta"><span style="color:var(--cs-rust)">⚠</span> MEDICAL LOG · CLASSIFIED</div>
      </div>
      <div class="cs-panel-body">
        <div class="cs-hazard"></div>
        <textarea class="cs-injuries" rows="3" ${ro?'readonly':''} data-pn="${pn}" data-path="injuries"
          placeholder="— critical injuries / trauma conditions / long-term damage —">${_esc(_csGet(data,'injuries'))}</textarea>
      </div>
    </div>

    <!-- FOOTER -->
    <div class="cs-footer">
      <div>WEYLAND–YUTANI CORPORATION · ASSET RECOVERY DIVISION</div>
      <div>FORM CS-7 · REV 4.11-EVOLVED · OPERATIVE: ${_esc(pn)}</div>
    </div>
  `;

  // Update the encumbrance fill bar on initial render
  _csUpdateEncFill(data);
}

// ── Encumbrance progress bar (visual only — values are still manual) ──
function _csUpdateEncFill(data) {
  const fill = document.getElementById('csEncFill');
  if (!fill) return;
  const cur = parseFloat(_csGet(data, 'encumb.cur')) || 0;
  const max = parseFloat(_csGet(data, 'encumb.max')) || 0;
  const pct = max > 0 ? Math.min(100, (cur / max) * 100) : 0;
  fill.style.width = pct + '%';
}

// ── Targeted patch: derived UI that depends on stressResp.* ──────
// Updates the active-states banner and attribute debuff badges in place,
// without rebuilding the rest of the sheet. This is the only safe way
// to refresh after a checkbox toggle: a full innerHTML swap mid-click
// races with the browser's default action and visually undoes the toggle.
function _csPatchDerived(pn, data) {
  const body = document.getElementById('csBody');
  if (!body) return;
  const ro = window.isGM && pn !== window.myName;

  // Source of truth: the live checkbox DOM. Firebase echoes can briefly
  // carry stale snapshots that would revive a debuff the user just cleared.
  const respState = (key) => {
    const cb = body.querySelector(
      'input.cs-chk[data-path="stressResp.' + key + '"]'
    );
    return cb ? !!cb.checked : !!_csGet(data, 'stressResp.' + key);
  };

  // 1) Roll-state banner (stable host)
  const active = ROLL_STATES.filter(s => respState(s.k));
  const html = active.map(s => `<div class="cs-active-state">
      <span class="cs-active-icon">⚠</span>
      <span class="cs-active-name">${s.label}</span>
      <span class="cs-active-effect">${s.eff}</span>
    </div>`).join('');
  const banner = document.getElementById('csActiveStates');
  if (banner) banner.innerHTML = html;

  // 2) Attribute debuffs and effective scores (STR/AGI/WIT/EMP)
  const scoreByPath = {};
  body.querySelectorAll('input.cs-attr-score').forEach(el => {
    if (el.dataset.path) scoreByPath[el.dataset.path] = el;
  });

  for (const d of DEBUFF_MAP) {
    const inp = scoreByPath['attr.' + d.attr];
    if (!inp) continue;
    const base    = _csGet(data, 'attr.' + d.attr);
    const baseN   = parseInt(base, 10);
    const numeric = !isNaN(baseN);
    const want    = respState(d.resp);
    const isDeb   = want && numeric;
    const eff     = isDeb ? Math.max(0, baseN - 2) : base;
    if (document.activeElement !== inp) inp.value = eff;
    inp.classList.toggle('cs-attr-debuffed', isDeb);
    if (ro || isDeb) inp.setAttribute('readonly', '');
    else             inp.removeAttribute('readonly');

    // −2 badge in the .cs-attr-name header
    const nameEl = inp.closest('.cs-attr-block')?.querySelector('.cs-attr-name');
    if (!nameEl) continue;
    let badge = nameEl.querySelector('.cs-stat-debuff');
    if (want && !badge) {
      const span = document.createElement('span');
      span.className = 'cs-stat-debuff';
      span.title = d.name + ': −2 dice on ' + d.skill + ' skills';
      span.textContent = '−2';
      // Insert badge before the score input (badge shows next to attr name)
      nameEl.insertBefore(span, inp);
    } else if (!want && badge) {
      badge.remove();
    }
  }
}

// ── Live patch on incoming Firebase data while the sheet is open ───
// Strategy depends on what the user is currently focused on:
//  - Checkbox (.cs-chk): NEVER re-render. The change handler already saved
//    locally and the browser's default action put the DOM in the right state.
//    A re-render here would race with the click and snap the box back.
//    We only patch the derived UI (banner, attribute debuffs).
//  - Text/textarea: preserve in-flight value + caret, then re-render.
//  - Anything else: full re-render.
function _csPatchFields(playerName, data, focused) {
  if (focused && focused.classList && focused.classList.contains('cs-chk')) {
    _csPatchDerived(playerName, data);
    return;
  }
  const isText = focused && (focused.tagName === 'TEXTAREA' ||
    (focused.tagName === 'INPUT' && (focused.type === 'text' || focused.type === '')));
  if (!isText) { _csRender(playerName, data); return; }
  const fp    = focused.dataset.path;
  const start = focused.selectionStart;
  const end   = focused.selectionEnd;
  const live  = focused.value;
  _csRender(playerName, data);
  if (!fp) return;
  const sel = document.querySelector('#csBody [data-path="' + fp + '"]');
  if (!sel) return;
  sel.value = live;
  try { sel.focus(); sel.setSelectionRange(start, end); } catch (e) {}
}

// ── ONE-TIME event delegation on the overlay ─────────────────────
(function _csInitEvents() {
  const overlay = document.getElementById('charSheetOverlay');
  if (!overlay) { setTimeout(_csInitEvents, 200); return; }

  // Text / textarea → debounced save
  overlay.addEventListener('input', e => {
    const el = e.target;
    if (el.hasAttribute('readonly')) return;
    const pn = el.dataset.pn, path = el.dataset.path;
    if (!pn || !path) return;
    window._csDB(pn, path, el.value);
    // Live-update encumbrance fill bar when its inputs change
    if (path === 'encumb.cur' || path === 'encumb.max') {
      _csUpdateEncFill(_csAllSheets[pn] || {});
    }
  });

  // Checkbox → immediate save + targeted UI refresh
  overlay.addEventListener('change', e => {
    const el = e.target;
    if (!el.classList.contains('cs-chk') || el.disabled) return;
    const pn = el.dataset.pn, path = el.dataset.path;
    if (!pn || !path) return;
    window._csSave(pn, path, el.checked);
    if (path.indexOf('stressResp.') === 0) {
      _csPatchDerived(pn, _csAllSheets[pn] || {});
    }
  });

  // Stress box OR death roll click — instant DOM update then Firebase save
  overlay.addEventListener('click', e => {
    // ── Stress ──
    const sb = e.target.closest('.cs-stress-box:not(.readonly)');
    if (sb) {
      const pn = sb.dataset.pn, lvl = parseInt(sb.dataset.stress);
      if (!pn) return;
      const cur = parseInt(_csGet(_csAllSheets[pn]||{}, 'stressLevel')) || 0;
      const next = (cur === lvl) ? lvl - 1 : lvl;
      const row = sb.closest('.cs-stress-row') || sb.parentElement;
      row.querySelectorAll('.cs-stress-box').forEach(box => {
        const bi = parseInt(box.dataset.stress);
        box.classList.toggle('filled', bi <= next);
      });
      const lbl = document.getElementById('csStressLabel');
      if (lbl) lbl.textContent = next + '/10';
      window._csSave(pn, 'stressLevel', next);
      return;
    }
    // ── Death roll ──
    const db2 = e.target.closest('.cs-dr-box:not(.readonly)');
    if (db2) {
      const pn = db2.dataset.pn, path = db2.dataset.dr;
      if (!pn || !path) return;
      const cur = !!_csGet(_csAllSheets[pn]||{}, path);
      db2.classList.toggle('filled', !cur);
      window._csSave(pn, path, !cur);
    }
  });
})();

// ── Track online players for GM tabs ─────────────────────────────
onValue(ref(window.db, 'users'), snap => {
  const data = snap.val() || {};
  window._onlinePlayers = new Set(
    Object.values(data)
      .filter(u => u.name && !u.name.startsWith('OPERATIVE-'))
      .map(u => u.name)
  );
  if (window.isGM && document.getElementById('csPlayerTabs') &&
      document.getElementById('csPlayerTabs').style.display !== 'none') {
    _csRebuildTabs();
  }
});
