import { ref, set, remove, update, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ════════════════════════════════════════════════════════════════
// CHARACTER SHEET SYSTEM
// Firebase path: characters/{playerName}/
// ════════════════════════════════════════════════════════════════

let _csViewingPlayer = null;
let _csDebounce      = {};
let _csAllSheets     = {};
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
  // Always render immediately with whatever we have (empty sheet on first open)
  _csRender(playerName, _csAllSheets[playerName] || {});

  if (_csSubs[playerName]) return; // already listening
  _csSubs[playerName] = true;

  // Sync with Firebase
  onValue(ref(window.db, 'characters/' + playerName), snap => {
    const data = snap.val() || {};
    // Skip self-echo: when our own _csSave write comes back, the snapshot
    // equals the local optimistic state we already applied. Re-rendering
    // here would race with any in-progress UI interaction (e.g. a
    // checkbox just toggled by the same user).
    const prev = _csAllSheets[playerName];
    if (prev && JSON.stringify(prev) === JSON.stringify(data)) return;
    _csAllSheets[playerName] = data;
    if (_csViewingPlayer === playerName) {
      const body = document.getElementById('csBody');
      const overlay = document.getElementById('charSheetOverlay');
      const sheetOpen = overlay && overlay.classList.contains('open');
      if (!sheetOpen) return; // don't touch DOM if sheet isn't visible

      const active = document.activeElement;
      const userFocused = body && body.contains(active);
      if (userFocused) {
        // User is active — do a light targeted patch (skip focused field)
        _csPatchFields(playerName, data, active);
      } else {
        // No focus — safe to do a full re-render
        _csRender(playerName, data);
      }
    }
    if (window.isGM) _csRebuildTabs();
  }, err => {
    console.warn('Character sheet Firebase error:', err.message);
  });
}

// ── Save helpers (on window so event delegation can reach them) ───
window._csSave = function(playerName, path, value) {
  // Optimistic local update — navigate by dots so _csGet can read it back
  if (!_csAllSheets[playerName]) _csAllSheets[playerName] = {};
  const parts = path.split('.');
  let obj = _csAllSheets[playerName];
  for (let i = 0; i < parts.length - 1; i++) {
    if (!obj[parts[i]]) obj[parts[i]] = {};
    obj = obj[parts[i]];
  }
  obj[parts[parts.length - 1]] = value;
  // Firebase path uses / as separator so snap.val() returns nested objects
  // that match the dot-navigation in _csGet
  set(ref(window.db, 'characters/' + playerName + '/' + path.split('.').join('/')), value);
};
window._csDB = function(playerName, path, value) {
  const key = playerName + '\x01' + path;
  clearTimeout(_csDebounce[key]);
  _csDebounce[key] = setTimeout(() => window._csSave(playerName, path, value), _CS_MS);
};


// ── Helper: nested path getter ────────────────────────────────────
function _csGet(obj, path) {
  return path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : ''), obj) || '';
}
function _esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Render ────────────────────────────────────────────────────────
function _csRender(pn, data) {
  const body = document.getElementById('csBody');
  if (!body) return;
  const ro = window.isGM && pn !== window.myName;

  // Text input
  const fi = (path, ph='') =>
    `<input class="cs-inp" type="text" ${ro?'readonly':''} data-pn="${pn}" data-path="${path}"
      value="${_esc(_csGet(data,path))}" placeholder="${ph}">`;

  // Textarea
  const ta = (path, ph='', rows=2) =>
    `<textarea class="cs-inp" rows="${rows}" ${ro?'readonly':''} data-pn="${pn}" data-path="${path}"
      placeholder="${ph}">${_esc(_csGet(data,path))}</textarea>`;

  // Number/small input
  const ni = (path, w=36) =>
    `<input class="cs-inp" type="text" ${ro?'readonly':''} data-pn="${pn}" data-path="${path}"
      value="${_esc(_csGet(data,path))}" style="width:${w}px;text-align:center">`;

  // Attribute score box
  const as = (path) =>
    `<input class="cs-attr-score cs-inp" type="text" ${ro?'readonly':''} data-pn="${pn}" data-path="${path}"
      value="${_esc(_csGet(data,path))}">`;

  // Attribute score with auto stress-response debuff applied (−2 if active).
  // The stored base value is never modified — we just display base − 2 and
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

  // Skill score
  const ss = (path) =>
    `<input class="cs-skill-score cs-inp" type="text" ${ro?'readonly':''} data-pn="${pn}" data-path="${path}"
      value="${_esc(_csGet(data,path))}">`;

  // Stress boxes
  const stressLvl = parseInt(_csGet(data,'stressLevel')) || 0;
  const stressBoxes = Array.from({length:10}, (_,i) =>
    `<div class="cs-stress-box ${i<stressLvl?'filled':''} ${ro?'readonly':''}"
      ${ro?'':` data-stress="${i+1}" data-pn="${pn}"`}>●</div>`
  ).join('');

  // Stress + Panic Responses — aligned with Alien Evolved Edition Core Rules
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
  const renderResp = (list, prefix) => list.map(r => {
    const path = prefix + '.' + r.k;
    const chk = !!_csGet(data, path);
    return `<label class="cs-panic-item${chk?' chk':''}" title="${_esc(r.tip)}">
      <input type="checkbox" ${chk?'checked':''} ${ro?'disabled':''} class="cs-chk" data-pn="${pn}" data-path="${path}"> ${r.label}
    </label>`;
  }).join('');
  const stressRespBoxes = renderResp(STRESS_RESPONSES, 'stressResp');
  const panicRespBoxes  = renderResp(PANIC_RESPONSES,  'panicResp');

  // Roll-mechanic states (Jumpy / Deflated / Mess Up) — they don't modify a
  // stat, they change how pushing/resolving rolls behaves. Surfaced as a
  // prominent banner so the player can't forget mid-session.
  const ROLL_STATES = [
    { k:'Jumpy',    label:'JUMPY',    eff:'PUSH GIVES +2 STRESS' },
    { k:'Deflated', label:'DEFLATED', eff:'CANNOT PUSH ANY ROLL'  },
    { k:'Mess_Up',  label:'MESS UP',  eff:'ACTIONS FAIL · +1 STRESS' },
  ];
  const rollStateBadges = ROLL_STATES
    .filter(s => !!_csGet(data, 'stressResp.' + s.k))
    .map(s => `<div class="cs-active-state">
      <span class="cs-active-icon">⚠</span>
      <span class="cs-active-name">${s.label}</span>
      <span class="cs-active-effect">${s.eff}</span>
    </div>`).join('');
  const rollStatesBlock = rollStateBadges
    ? `<div class="cs-active-states">${rollStateBadges}</div>` : '';

  // Auto-debuff badges on attributes (Stress Response Table p.44)
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
      ${ro?'':` data-dr="${path}" data-pn="${pn}"`}>●</div>`;
  };

  // Weapon rows
  const wrow = (i) => `<tr>
    <td><input class="cs-inp" type="text" ${ro?'readonly':''} data-pn="${pn}" data-path="weapons.${i}.name"
        value="${_esc(_csGet(data,'weapons.'+i+'.name'))}" placeholder="—"></td>
    <td><input class="cs-inp" type="text" ${ro?'readonly':''} data-pn="${pn}" data-path="weapons.${i}.mod"
        value="${_esc(_csGet(data,'weapons.'+i+'.mod'))}" style="width:34px"></td>
    <td><input class="cs-inp" type="text" ${ro?'readonly':''} data-pn="${pn}" data-path="weapons.${i}.dmg"
        value="${_esc(_csGet(data,'weapons.'+i+'.dmg'))}" style="width:34px"></td>
    <td><input class="cs-inp" type="text" ${ro?'readonly':''} data-pn="${pn}" data-path="weapons.${i}.range"
        value="${_esc(_csGet(data,'weapons.'+i+'.range'))}" style="width:46px"></td>
    <td><input class="cs-inp" type="text" ${ro?'readonly':''} data-pn="${pn}" data-path="weapons.${i}.ammo"
        value="${_esc(_csGet(data,'weapons.'+i+'.ammo'))}" style="width:34px"></td>
    <td><input class="cs-inp" type="text" ${ro?'readonly':''} data-pn="${pn}" data-path="weapons.${i}.wt"
        value="${_esc(_csGet(data,'weapons.'+i+'.wt'))}" style="width:34px"></td>
  </tr>`;

  // Gear rows
  const grow = (i) => `<tr>
    <td style="width:20px;text-align:center;color:#334433;font-size:9px">${i+1}</td>
    <td><input class="cs-inp" type="text" ${ro?'readonly':''} data-pn="${pn}" data-path="gear.${i}.name"
        value="${_esc(_csGet(data,'gear.'+i+'.name'))}" placeholder="—"></td>
    <td style="width:60px"><input class="cs-inp" type="text" ${ro?'readonly':''} data-pn="${pn}" data-path="gear.${i}.air"
        value="${_esc(_csGet(data,'gear.'+i+'.air'))}" style="width:54px"></td>
    <td style="width:50px"><input class="cs-inp" type="text" ${ro?'readonly':''} data-pn="${pn}" data-path="gear.${i}.wt"
        value="${_esc(_csGet(data,'gear.'+i+'.wt'))}" style="width:44px"></td>
  </tr>`;

  const fatChk = `<input type="checkbox" ${_csGet(data,'fatigued')?'checked':''} ${ro?'disabled':''} class="cs-chk"
    data-pn="${pn}" data-path="fatigued" style="width:22px;height:22px;accent-color:#88cc44">`;

  body.innerHTML = `
    <div class="cs-section-title">// OPERATIVE PROFILE</div>
    <div class="cs-field-row">
      <div class="cs-field" style="flex:2"><label>NAME</label>${fi('name','Operative designation...')}</div>
      <div class="cs-field" style="flex:2"><label>CAREER</label>${fi('career','Colonial Marine, Roughneck...')}</div>
      <div class="cs-field" style="flex:1"><label>XP</label>${ni('xp',40)}</div>
      <div class="cs-field" style="flex:1"><label>STORY PTS</label>${ni('storyPoints',40)}</div>
    </div>
    <div class="cs-field-row">
      <div class="cs-field"><label>APPEARANCE</label>${ta('appearance','Physical description...',2)}</div>
      <div class="cs-field"><label>PERSONAL AGENDA</label>${ta('agenda','What do you want...',2)}</div>
    </div>
    <div class="cs-field-row">
      <div class="cs-field"><label>TALENTS</label>${ta('talents','Special abilities...',3)}</div>
    </div>
    <div class="cs-field-row">
      <div class="cs-field"><label>BUDDY</label>${fi('buddy','Who do you trust?')}</div>
      <div class="cs-field"><label>RIVAL</label>${fi('rival','Who do you hate?')}</div>
    </div>
    <div class="cs-field-row">
      <div class="cs-field"><label>SIGNATURE ITEM</label>${fi('sigItem','Your most prized possession...')}</div>
    </div>

    <div class="cs-section-title">// ATTRIBUTES & SKILLS</div>
    <div class="cs-attrs">
      <div class="cs-attr-block">
        <div class="cs-attr-name">STRENGTH ${asD('attr.str', !!_csGet(data,'stressResp.Frantic'),       'Frantic')}${strDebuff}</div>
        <div class="cs-skill-row"><span class="cs-skill-name">CLOSE COMBAT</span>${ss('skill.closeCombat')}</div>
        <div class="cs-skill-row"><span class="cs-skill-name">HEAVY MACHINERY</span>${ss('skill.heavyMachinery')}</div>
        <div class="cs-skill-row"><span class="cs-skill-name">STAMINA</span>${ss('skill.stamina')}</div>
      </div>
      <div class="cs-attr-block">
        <div class="cs-attr-name">AGILITY ${asD('attr.agi', !!_csGet(data,'stressResp.Shakes'),        'Shakes')}${agiDebuff}</div>
        <div class="cs-skill-row"><span class="cs-skill-name">MOBILITY</span>${ss('skill.mobility')}</div>
        <div class="cs-skill-row"><span class="cs-skill-name">PILOTING</span>${ss('skill.piloting')}</div>
        <div class="cs-skill-row"><span class="cs-skill-name">RANGED COMBAT</span>${ss('skill.rangedCombat')}</div>
      </div>
      <div class="cs-attr-block">
        <div class="cs-attr-name">WITS ${asD('attr.wit', !!_csGet(data,'stressResp.Tunnel_Vision'), 'Tunnel Vision')}${witDebuff}</div>
        <div class="cs-skill-row"><span class="cs-skill-name">COMTECH</span>${ss('skill.comtech')}</div>
        <div class="cs-skill-row"><span class="cs-skill-name">OBSERVATION</span>${ss('skill.observation')}</div>
        <div class="cs-skill-row"><span class="cs-skill-name">SURVIVAL</span>${ss('skill.survival')}</div>
      </div>
      <div class="cs-attr-block">
        <div class="cs-attr-name">EMPATHY ${asD('attr.emp', !!_csGet(data,'stressResp.Aggravated'),    'Aggravated')}${empDebuff}</div>
        <div class="cs-skill-row"><span class="cs-skill-name">COMMAND</span>${ss('skill.command')}</div>
        <div class="cs-skill-row"><span class="cs-skill-name">MANIPULATION</span>${ss('skill.manipulation')}</div>
        <div class="cs-skill-row"><span class="cs-skill-name">MEDICAL AID</span>${ss('skill.medicalAid')}</div>
      </div>
    </div>

    <div class="cs-section-title">// CONDITION</div>
    <div class="cs-stats" style="margin-bottom:12px">
      <div class="cs-stat-box">
        <div class="cs-stat-label">HEALTH</div>
        <div class="cs-stat-val">${ni('health.cur',30)} <span class="cs-stat-sep">/</span> ${ni('health.max',30)}</div>
      </div>
      <div class="cs-stat-box">
        <div class="cs-stat-label">RESOLVE</div>
        <div class="cs-stat-val">${ni('resolve.cur',30)} <span class="cs-stat-sep">/</span> ${ni('resolve.max',30)}</div>
      </div>
      <div class="cs-stat-box"><div class="cs-stat-label">RADIATION</div><div class="cs-stat-val">${ni('radiation',36)}</div></div>
      <div class="cs-stat-box">
        <div class="cs-stat-label">ENCUMBRANCE</div>
        <div class="cs-stat-val">${ni('encumb.cur',30)} <span class="cs-stat-sep">/</span> ${ni('encumb.max',30)}</div>
      </div>
      <div class="cs-stat-box"><div class="cs-stat-label">CASH ($)</div><div class="cs-stat-val">${ni('cash',60)}</div></div>
      <div class="cs-stat-box"><div class="cs-stat-label">FATIGUED</div><div class="cs-stat-val">${fatChk}</div></div>
    </div>

    ${rollStatesBlock}

    <div class="cs-section-title">// STRESS LEVEL <span class="cs-stress-label" style="color:#446633;font-size:9px;font-weight:normal">${stressLvl}/10</span></div>
    <div class="cs-stress-row">${stressBoxes}</div>

    <div class="cs-section-title">// STRESS RESPONSE <span class="cs-resp-note">D6 + STRESS − RESOLVE · effects on hover</span></div>
    <div class="cs-panic-grid">${stressRespBoxes}</div>

    <div class="cs-section-title">// PANIC RESPONSE <span class="cs-resp-note">D6 + STRESS − RESOLVE · effects on hover</span></div>
    <div class="cs-panic-grid">${panicRespBoxes}</div>

    <div class="cs-section-title">// DEATH ROLLS</div>
    <div class="cs-deathroll">
      <div class="cs-dr-group"><div class="cs-dr-label">SUCCESSES</div>
        <div class="cs-dr-boxes">${dr('dr.s1')}${dr('dr.s2')}${dr('dr.s3')}</div></div>
      <div class="cs-dr-group"><div class="cs-dr-label">FAILURES</div>
        <div class="cs-dr-boxes">${dr('dr.f1')}${dr('dr.f2')}${dr('dr.f3')}</div></div>
    </div>

    <div class="cs-section-title">// SERIOUS INJURIES &amp; MENTAL TRAUMA</div>
    <textarea class="cs-injuries cs-inp" rows="3" ${ro?'readonly':''} data-pn="${pn}" data-path="injuries"
      placeholder="List injuries and trauma...">${_esc(_csGet(data,'injuries'))}</textarea>

    <div class="cs-section-title">// ARMOR</div>
    <div class="cs-field-row">
      <div class="cs-field" style="flex:3"><label>ARMOR NAME</label>${fi('armor.name','M3 Personnel Armor...')}</div>
      <div class="cs-field" style="flex:1"><label>LEVEL</label>${ni('armor.level',40)}</div>
      <div class="cs-field" style="flex:1"><label>WEIGHT</label>${ni('armor.weight',40)}</div>
    </div>

    <div class="cs-section-title">// WEAPONS</div>
    <table class="cs-weapons">
      <thead><tr><th>WEAPON</th><th>MOD</th><th>DMG</th><th>RANGE</th><th>AMMO</th><th>WT</th></tr></thead>
      <tbody>${[0,1,2,3].map(wrow).join('')}</tbody>
    </table>

    <div class="cs-section-title">// GEAR</div>
    <table class="cs-gear">
      <thead><tr><th>#</th><th>ITEM</th><th>AIR/PWR</th><th>WT</th></tr></thead>
      <tbody>${Array.from({length:10},(_,i)=>grow(i)).join('')}</tbody>
    </table>

    <div class="cs-section-title">// TINY ITEMS</div>
    ${ta('tinyItems','Cigarettes, data tapes, drugs, cash...',2)}
  `;

}  // end _csRender

// ── Targeted patch: derived UI that depends on stressResp.* ──────
// Updates the active-states banner and attribute debuff badges in place,
// without rebuilding the rest of the sheet. This is the only safe way
// to refresh after a checkbox toggle: a full innerHTML swap mid-click
// races with the browser's default action and visually undoes the toggle.
function _csPatchDerived(pn, data) {
  const body = document.getElementById('csBody');
  if (!body) return;
  const ro = window.isGM && pn !== window.myName;

  // 1) Roll-state banner (Jumpy / Deflated / Mess Up)
  const ROLL_STATES = [
    { k:'Jumpy',    label:'JUMPY',    eff:'PUSH GIVES +2 STRESS' },
    { k:'Deflated', label:'DEFLATED', eff:'CANNOT PUSH ANY ROLL'  },
    { k:'Mess_Up',  label:'MESS UP',  eff:'ACTIONS FAIL · +1 STRESS' },
  ];
  const active = ROLL_STATES.filter(s => !!_csGet(data, 'stressResp.' + s.k));
  const html = active.map(s => `<div class="cs-active-state">
      <span class="cs-active-icon">⚠</span>
      <span class="cs-active-name">${s.label}</span>
      <span class="cs-active-effect">${s.eff}</span>
    </div>`).join('');
  let banner = body.querySelector('.cs-active-states');
  if (active.length) {
    if (banner) {
      banner.innerHTML = html;
    } else {
      // Insert banner just before the STRESS LEVEL section title
      const titles = body.querySelectorAll('.cs-section-title');
      let stressTitle = null;
      titles.forEach(t => { if (!stressTitle && t.textContent.includes('STRESS LEVEL')) stressTitle = t; });
      if (stressTitle) {
        const div = document.createElement('div');
        div.className = 'cs-active-states';
        div.innerHTML = html;
        stressTitle.parentNode.insertBefore(div, stressTitle);
      }
    }
  } else if (banner) {
    banner.remove();
  }

  // 2) Attribute debuffs and effective scores (STR/AGI/WIT/EMP)
  const debuffMap = [
    { resp:'Frantic',       attr:'str', name:'Frantic',       skill:'Strength'  },
    { resp:'Shakes',        attr:'agi', name:'Shakes',        skill:'Agility'   },
    { resp:'Tunnel_Vision', attr:'wit', name:'Tunnel Vision', skill:'Wits'      },
    { resp:'Aggravated',    attr:'emp', name:'Aggravated',    skill:'Empathy'   },
  ];
  // Map every cs-attr-score input by its data-path (csBody only ever
  // shows one player, so no need to filter by pn — and avoids CSS
  // attribute-selector escaping issues with special chars in names)
  const scoreByPath = {};
  body.querySelectorAll('input.cs-attr-score').forEach(el => {
    if (el.dataset.path) scoreByPath[el.dataset.path] = el;
  });

  for (const d of debuffMap) {
    const inp = scoreByPath['attr.' + d.attr];
    if (!inp) continue;
    const base    = _csGet(data, 'attr.' + d.attr);
    const baseN   = parseInt(base, 10);
    const numeric = !isNaN(baseN);
    const want    = !!_csGet(data, 'stressResp.' + d.resp);
    const isDeb   = want && numeric;
    const eff     = isDeb ? Math.max(0, baseN - 2) : base;
    if (document.activeElement !== inp) inp.value = eff;
    inp.classList.toggle('cs-attr-debuffed', isDeb);
    if (ro || isDeb) inp.setAttribute('readonly', '');
    else             inp.removeAttribute('readonly');

    // Update −2 badge in the .cs-attr-name header
    const nameEl = inp.closest('.cs-attr-block')?.querySelector('.cs-attr-name');
    if (!nameEl) continue;
    let badge = nameEl.querySelector('.cs-stat-debuff');
    if (want && !badge) {
      const span = document.createElement('span');
      span.className = 'cs-stat-debuff';
      span.title = d.name + ': −2 dice on ' + d.skill + ' skills';
      span.textContent = '−2';
      nameEl.appendChild(span);
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
  sel.value = live;                    // keep unsaved keystrokes
  try { sel.focus(); sel.setSelectionRange(start, end); } catch (e) {}
}

// ── ONE-TIME event delegation on the overlay (never re-added) ───
(function _csInitEvents() {
  const overlay = document.getElementById('charSheetOverlay');
  if (!overlay) { setTimeout(_csInitEvents, 200); return; }

  // Text / textarea → debounced save (skip if readonly attr present)
  overlay.addEventListener('input', e => {
    const el = e.target;
    if (el.hasAttribute('readonly')) return;
    const pn = el.dataset.pn, path = el.dataset.path;
    if (!pn || !path) return;
    window._csDB(pn, path, el.value);
  });

  // Checkbox → immediate save + targeted UI refresh (no full re-render,
  // see _csPatchFields for why)
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
      // Instant visual update — don't wait for Firebase
      const row = sb.closest('.cs-stress-row') || sb.parentElement;
      row.querySelectorAll('.cs-stress-box').forEach(box => {
        const bi = parseInt(box.dataset.stress);
        box.classList.toggle('filled', bi <= next);
      });
      // Update label if present
      const lbl = sb.closest('.cs-body, #csBody')?.querySelector('.cs-stress-label');
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
      // Instant visual update
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
