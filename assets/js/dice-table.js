import { ref, set, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ════════════════════════════════════════════════════════════════
// DICE TABLE — shared skill-roll table (Alien RPG)
// Firebase path: session/diceTable/roll
// ════════════════════════════════════════════════════════════════

const DT_SKILLS = [
  { key:'closeCombat',    label:'CLOSE COMBAT',    attr:'str' },
  { key:'heavyMachinery', label:'HEAVY MACHINERY', attr:'str' },
  { key:'stamina',        label:'STAMINA',         attr:'str' },
  { key:'mobility',       label:'MOBILITY',        attr:'agi' },
  { key:'piloting',       label:'PILOTING',        attr:'agi' },
  { key:'rangedCombat',   label:'RANGED COMBAT',   attr:'agi' },
  { key:'comtech',        label:'COMTECH',         attr:'wit' },
  { key:'observation',    label:'OBSERVATION',     attr:'wit' },
  { key:'survival',       label:'SURVIVAL',        attr:'wit' },
  { key:'command',        label:'COMMAND',         attr:'emp' },
  { key:'manipulation',   label:'MANIPULATION',    attr:'emp' },
  { key:'medicalAid',     label:'MEDICAL AID',     attr:'emp' },
];
const DT_ATTR_LABEL = { str:'STRENGTH', agi:'AGILITY', wit:'WITS', emp:'EMPATHY' };
const DT_ATTR_ORDER = ['str','agi','wit','emp'];
// stress response that debuffs each attribute by −2 (mirrors character sheet)
const DT_DEBUFF = { str:'Frantic', agi:'Shakes', wit:'Tunnel_Vision', emp:'Aggravated' };

// dice skins — base dice only, stress dice always stay yellow
// six: colors for the success-face artwork (geometry from Normal 6.svg)
const DT_SKINS = {
  default: { name:'W-Y STANDARD',   six:{ bg:'#111111', fg:'#ffffff' } },
  acid:    { name:'XENO ACID',      six:{ bg:'#0e2613', fg:'#8aff3c' } },
  void:    { name:'DEEP VOID',      six:{ bg:'#0c1530', fg:'#79e6ff' } },
  rust:    { name:'DERELICT RUST',  six:{ bg:'#54190d', fg:'#f0e6d2' } },
  synth:   { name:'SYNTH WHITE',    six:{ bg:'#ece5d4', fg:'#232b33' } },
  gold:    { name:'CORPORATE GOLD', six:{ bg:'#33220a', fg:'#ffd98c' } },
};

let dtSelected    = null;     // selected roll: 'skill:stamina' | 'attr:str'
let dtMyChar      = null;     // own character sheet data
let dtCharSubbed  = false;
let dtCurrentRoll = null;     // last roll seen
let dtSeenFirst   = false;    // first Firebase snapshot consumed (no toast/anim)
let dtTimers      = [];       // running animation timers

let dtAllChars       = {};    // GM only: full characters mirror (for skin unlocks)
let dtSkinSubbed     = false;
let dtSkinPanelOpen  = false;
let dtSkinViewPlayer = null;  // GM: whose unlocks are shown in the panel
let dtPlayerList     = [];    // GM: known player names

// ── Open / close ──────────────────────────────────────────────────
window.openDiceTable = function() {
  document.getElementById('dtOverlay').classList.add('open');
  dtEnsureCharSub();
  dtEnsureSkinSub();
  dtBuildLayout();
  dtRenderConsole();
  if (dtCurrentRoll) {
    dtRenderDice(dtCurrentRoll, false);
    dtShowResult(dtCurrentRoll);
  }
};

window.closeDiceTable = function() {
  dtClearTimers();
  document.getElementById('dtOverlay').classList.remove('open');
};

// ── Own character sheet subscription ──────────────────────────────
function dtEnsureCharSub() {
  if (dtCharSubbed || !window.myName) return;
  dtCharSubbed = true;
  onValue(ref(window.db, 'characters/' + window.myName), snap => {
    dtMyChar = snap.val() || {};
    if (document.getElementById('dtOverlay').classList.contains('open')) {
      dtRenderConsole();
      dtRenderSkinPanel();
    }
  });
}

// ── Dice skins (stored at characters/{player}/diceSkins) ─────────
function dtEnsureSkinSub() {
  if (dtSkinSubbed || !window.myName) return;
  dtSkinSubbed = true;
  if (window.isGM) {
    onValue(ref(window.db, 'characters'), snap => {
      dtAllChars = snap.val() || {};
      dtRefreshPlayerList();
      dtRenderSkinPanel();
    });
  }
}

function dtMySkinData() {
  return (dtMyChar || {}).diceSkins || {};
}

function dtSkinUnlocked(id, data, gmSelf) {
  return id === 'default' || gmSelf || !!data?.unlocked?.[id];
}

function dtEffectiveSkin() {
  const sel = dtMySkinData().selected;
  if (sel && DT_SKINS[sel] && dtSkinUnlocked(sel, dtMySkinData(), window.isGM)) return sel;
  return 'default';
}

window.dtToggleSkinPanel = function() {
  dtSkinPanelOpen = !dtSkinPanelOpen;
  if (dtSkinPanelOpen) {
    if (!dtSkinViewPlayer) dtSkinViewPlayer = window.myName;
    if (window.isGM) dtRefreshPlayerList();
  }
  dtRenderSkinPanel();
};

function dtRefreshPlayerList() {
  const names = new Set([window.myName]);
  if (window._onlinePlayers) window._onlinePlayers.forEach(n => names.add(n));
  Object.keys(dtAllChars).forEach(n => names.add(n));
  dtPlayerList = [...names].sort();
}

function dtPreviewHTML(id) {
  return `<div class="dt-die dt-die-preview skin-${id} face-5"><div class="dt-num"></div></div>`;
}

function dtRenderSkinPanel() {
  const el = document.getElementById('dtSkinPanel');
  if (!el) return;
  if (!dtSkinPanelOpen) { el.classList.remove('open'); return; }
  el.classList.add('open');

  const isGM    = !!window.isGM;
  const viewing = isGM ? (dtSkinViewPlayer || window.myName) : window.myName;
  const own     = viewing === window.myName;
  const data    = own ? dtMySkinData() : ((dtAllChars[viewing] || {}).diceSkins || {});
  const activeId = own
    ? dtEffectiveSkin()
    : (data.selected && DT_SKINS[data.selected] ? data.selected : 'default');

  let html = `
    <div class="dt-skin-head">
      <span>// DICE SKINS${isGM ? ' — ' + viewing : ''}</span>
      <button class="dt-skin-close" onclick="dtToggleSkinPanel()">✕</button>
    </div>`;

  if (isGM) {
    html += '<div class="dt-skin-tabs">' + dtPlayerList.map(n =>
      `<button class="dt-skin-tab ${n === viewing ? 'active' : ''}" onclick="dtSkinView('${n}')">${n}</button>`
    ).join('') + '</div>';
  }

  html += '<div class="dt-skin-grid">';
  for (const id of Object.keys(DT_SKINS)) {
    const unlocked = dtSkinUnlocked(id, data, own && isGM);
    const active   = activeId === id;
    const click    = own
      ? (unlocked ? `dtPickSkin('${id}')` : '')
      : `dtGMToggleSkin('${viewing}','${id}')`;
    const status = active ? 'ACTIVE' : (unlocked ? 'UNLOCKED' : 'LOCKED');
    html += `
      <button class="dt-skin-card ${active ? 'active' : ''} ${unlocked ? '' : 'locked'}"
        ${click ? `onclick="${click}"` : 'disabled'}>
        ${dtPreviewHTML(id)}
        <div class="dt-skin-name">${DT_SKINS[id].name}</div>
        <div class="dt-skin-status ${unlocked ? 'on' : 'off'}">${status}</div>
      </button>`;
  }
  html += '</div>';

  if (isGM && !own) {
    html += '<div class="dt-skin-hint">// CLICK A SKIN TO UNLOCK / LOCK IT FOR THIS OPERATIVE</div>';
  } else if (isGM && own) {
    html += '<div class="dt-skin-hint">// GM HAS ALL SKINS — SELECT A PLAYER TAB TO MANAGE UNLOCKS</div>';
  }
  el.innerHTML = html;
}

window.dtSkinView = function(name) {
  dtSkinViewPlayer = name;
  dtRenderSkinPanel();
};

window.dtPickSkin = function(id) {
  if (!DT_SKINS[id] || !dtSkinUnlocked(id, dtMySkinData(), window.isGM)) return;
  set(ref(window.db, 'characters/' + window.myName + '/diceSkins/selected'), id);
};

window.dtGMToggleSkin = function(player, id) {
  if (!window.isGM || !DT_SKINS[id] || id === 'default') return;
  const cur = !!(dtAllChars[player] || {}).diceSkins?.unlocked?.[id];
  set(ref(window.db, 'characters/' + player + '/diceSkins/unlocked/' + id), cur ? null : true);
};

// ── Shared roll listener ──────────────────────────────────────────
window._authReadyPromise.then(() => {
  onValue(ref(window.db, 'session/diceTable/roll'), snap => {
    const roll = snap.val();
    // first snapshot = initial state on page load: no toast, no animation
    if (!dtSeenFirst) { dtSeenFirst = true; dtCurrentRoll = roll; return; }
    const isNew = roll && (!dtCurrentRoll || roll.id !== dtCurrentRoll.id);
    dtCurrentRoll = roll;
    if (!roll || !isNew) return;

    const overlay = document.getElementById('dtOverlay');
    if (overlay.classList.contains('open')) {
      dtRenderDice(roll, true);
    } else if (roll.player !== window.myName) {
      dtToast(roll);
    }
  });
});

// ── Layout ────────────────────────────────────────────────────────
function dtBuildLayout() {
  const el = document.getElementById('dtContent');
  if (el.dataset.built) return;
  el.dataset.built = '1';
  el.innerHTML = `
    <button class="dt-close-btn" onclick="closeDiceTable()">✕ CLOSE</button>
    <button class="dt-skins-btn" onclick="dtToggleSkinPanel()">◈ SKINS</button>
    <div id="dtSkinPanel"></div>
    <div class="dt-head">
      <div class="dt-title">DICE TABLE</div>
      <div class="dt-subtitle">// MESS HALL — TACTICAL SURFACE // ALL HANDS //</div>
    </div>
    <div class="dt-main">
      <div class="dt-console" id="dtConsole"></div>
      <div class="dt-stage">
        <div class="dt-table">
          <div class="dt-table-surface">
            <div class="dt-table-grid"></div>
            <div class="dt-table-marking">WEYLAND-YUTANI</div>
            <div class="dt-table-marking dt-table-marking--sub">SURFACE 04 // KEEP CLEAR</div>
            <div class="dt-dice-layer" id="dtDiceLayer"></div>
          </div>
        </div>
        <div class="dt-result" id="dtResult"></div>
      </div>
    </div>`;
}

// ── Roll console (skill picker) ───────────────────────────────────
// attribute value with stress-response debuff applied (−2, min 0),
// same display logic as the character sheet
function dtAttrVal(c, a) {
  const base = parseInt(c.attr?.[a]) || 0;
  return c.stressResp?.[DT_DEBUFF[a]] ? Math.max(0, base - 2) : base;
}
function dtAttrDebuffed(c, a) {
  return !!c.stressResp?.[DT_DEBUFF[a]];
}

function dtGetSelection() {
  if (!dtSelected) return null;
  const c = dtMyChar || {};
  const [type, key] = dtSelected.split(':');
  if (type === 'attr') {
    if (!DT_ATTR_LABEL[key]) return null;
    return { label: DT_ATTR_LABEL[key], base: dtAttrVal(c, key) };
  }
  const s = DT_SKILLS.find(x => x.key === key);
  if (!s) return null;
  return {
    label: s.label,
    base: dtAttrVal(c, s.attr) + (parseInt(c.skill?.[s.key]) || 0),
  };
}

function dtRenderConsole() {
  const el = document.getElementById('dtConsole');
  if (!el) return;
  const c = dtMyChar || {};
  const stress = parseInt(c.stressLevel) || 0;

  let html = `<div class="dt-console-title">// ROLL CONSOLE — ${window.myName || 'OPERATIVE'}</div>`;

  for (const a of DT_ATTR_ORDER) {
    const av  = dtAttrVal(c, a);
    const deb = dtAttrDebuffed(c, a);
    const aSel = dtSelected === 'attr:' + a ? ' selected' : '';
    html += `
      <button class="dt-attr-head${aSel}" onclick="dtSelect('attr:${a}')"
        ${deb ? `title="${DT_DEBUFF[a].replace('_',' ')}: −2"` : ''}>
        <span>${DT_ATTR_LABEL[a]}${deb ? '<span class="dt-debuff-tag">−2</span>' : ''}</span>
        <span class="dt-attr-val${deb ? ' debuffed' : ''}">${av}</span>
      </button>`;
    for (const s of DT_SKILLS.filter(x => x.attr === a)) {
      const sv = parseInt(c.skill?.[s.key]) || 0;
      const sel = dtSelected === 'skill:' + s.key ? ' selected' : '';
      html += `
        <button class="dt-skill-row${sel}" onclick="dtSelect('skill:${s.key}')">
          <span class="dt-skill-name">${s.label}</span>
          <span class="dt-skill-pool">${av}+${sv}</span>
        </button>`;
    }
  }

  const sel = dtGetSelection();
  const total = sel ? sel.base + stress : 0;

  html += `
    <div class="dt-summary">
      <div class="dt-summary-row"><span>BASE DICE</span><span>${sel ? sel.base : '—'}</span></div>
      <div class="dt-summary-row dt-summary-stress"><span>STRESS DICE</span><span>${sel ? stress : '—'}</span></div>
      <div class="dt-summary-row dt-summary-total"><span>POOL</span><span>${sel ? total + ' D6' : '—'}</span></div>
      <div class="dt-summary-row dt-summary-skin"><span>SKIN</span><span>${DT_SKINS[dtEffectiveSkin()].name}</span></div>
    </div>
    <button class="dt-roll-btn" onclick="dtRoll()" ${(!sel || total <= 0) ? 'disabled' : ''}>⬢ THROW DICE</button>`;

  el.innerHTML = html;
}

window.dtSelect = function(key) {
  dtSelected = key;
  dtRenderConsole();
};

// ── Roll action ───────────────────────────────────────────────────
window.dtRoll = function() {
  const sel = dtGetSelection();
  if (!sel) return;
  const stress = parseInt((dtMyChar || {}).stressLevel) || 0;
  if (sel.base + stress <= 0) return;

  const positions = dtScatter(sel.base + stress);
  const mk = (n, off) => Array.from({ length: n }, (_, i) => ({
    v: 1 + Math.floor(Math.random() * 6),
    x: positions[off + i].x,
    y: positions[off + i].y,
    r: Math.floor(Math.random() * 360),
  }));

  const baseDice   = mk(sel.base, 0);
  const stressDice = mk(stress, sel.base);

  // each facehugger (1 on a stress die) adds +1 stress on the sheet;
  // panic only triggers once the stress bar is full (level 10)
  const gain = stressDice.filter(d => d.v === 1).length;
  const stressNow = Math.min(10, stress + gain);
  if (gain > 0) {
    set(ref(window.db, 'characters/' + window.myName + '/stressLevel'), stressNow);
  }

  set(ref(window.db, 'session/diceTable/roll'), {
    id: Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    player: window.myName,
    skill: sel.label,
    skin: dtEffectiveSkin(),
    base: baseDice,
    stress: stressDice,
    stressGain: gain,
    stressNow: stressNow,
    ts: Date.now(),
  });
};

// scatter dice on the table (percent coords, min distance, rejection sampling)
function dtScatter(n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    let best = null;
    for (let t = 0; t < 60; t++) {
      const p = { x: 10 + Math.random() * 76, y: 12 + Math.random() * 70 };
      const dMin = Math.min(Infinity, ...pts.map(q => Math.hypot(p.x - q.x, (p.y - q.y) * 1.4)));
      if (dMin > 16) { best = p; break; }
      if (!best || dMin > best.d) best = { ...p, d: dMin };
    }
    pts.push({ x: best.x, y: best.y });
  }
  return pts;
}

// ── Dice rendering & throw animation ──────────────────────────────
function dtClearTimers() {
  dtTimers.forEach(clearInterval);
  dtTimers.forEach(clearTimeout);
  dtTimers = [];
}

function dtAllDice(roll) {
  const base   = (roll.base   || []).map(d => ({ ...d, stress: false }));
  const stress = (roll.stress || []).map(d => ({ ...d, stress: true }));
  return base.concat(stress);
}

// success-face for base dice: geometry from Normal 6.svg, colors per skin
function dtSixSVG(skinId) {
  const { bg, fg } = (DT_SKINS[skinId] || DT_SKINS.default).six;
  return `
    <svg class="dt-sym dt-sym-six" viewBox="0 0 500 500" aria-hidden="true">
      <rect width="500" height="500" rx="80" ry="80" fill="${bg}"/>
      <rect x="75" y="75" width="350" height="350" rx="55" ry="55" fill="none" stroke="${fg}" stroke-width="16"/>
      <line x1="75" y1="250" x2="210" y2="250" stroke="${fg}" stroke-width="16" stroke-linecap="round"/>
      <line x1="290" y1="250" x2="425" y2="250" stroke="${fg}" stroke-width="16" stroke-linecap="round"/>
      <line x1="250" y1="75" x2="250" y2="210" stroke="${fg}" stroke-width="16" stroke-linecap="round"/>
      <line x1="250" y1="290" x2="250" y2="425" stroke="${fg}" stroke-width="16" stroke-linecap="round"/>
      <polygon points="250,205 295,250 250,295 205,250" fill="${fg}"/>
      <text x="115" y="195" font-family="'Arial Rounded MT Bold','Arial',sans-serif" font-size="115" font-weight="bold" fill="${fg}" text-anchor="middle" dominant-baseline="central">6</text>
    </svg>`;
}

// die-face artwork: stress faces from assets/images/dice/, base 6 per skin
function dtFaceHTML(stress, skin) {
  let s = '<div class="dt-num"></div>';
  if (stress) {
    s += `<img class="dt-sym dt-sym-six" src="assets/images/dice/stress-6.svg" alt="" draggable="false">`;
    s += `<img class="dt-sym dt-sym-panic" src="assets/images/dice/stress-1.png" alt="" draggable="false">`;
  } else {
    s += dtSixSVG(skin);
  }
  return s;
}

function dtRenderDice(roll, animate) {
  const layer = document.getElementById('dtDiceLayer');
  const result = document.getElementById('dtResult');
  if (!layer) return;
  dtClearTimers();
  layer.innerHTML = '';
  layer.classList.toggle('static', !animate);
  if (result) { result.classList.remove('show'); result.innerHTML = ''; }

  const dice = dtAllDice(roll);
  const skin = DT_SKINS[roll.skin] ? roll.skin : 'default';
  let maxSettle = 0;

  dice.forEach((d, i) => {
    const el = document.createElement('div');
    el.className = 'dt-die' + (d.stress ? ' stress' : ' skin-' + skin) + ' face-' + d.v;
    el.style.left = d.x + '%';
    el.style.top  = d.y + '%';
    el.style.setProperty('--rot', d.r + 'deg');
    el.innerHTML = dtFaceHTML(d.stress, skin);
    layer.appendChild(el);

    if (!animate) { el.classList.add('settled'); return; }

    const delay = i * 110;
    const flight = 700;
    maxSettle = Math.max(maxSettle, delay + flight);

    // per-die throw physics: random entry vector + landing bounce direction
    el.style.setProperty('--fx', Math.round(Math.random() * 180 - 90) + 'px');
    el.style.setProperty('--fy', Math.round(380 + Math.random() * 180) + 'px');
    el.style.setProperty('--bx', (Math.random() * 12 - 6).toFixed(1) + 'px');
    el.style.setProperty('--by', (Math.random() * 10 - 8).toFixed(1) + 'px');
    el.classList.add('thrown');
    el.style.animationDelay = delay + 'ms';
    // tumble faces while in flight
    const iv = setInterval(() => {
      el.className = el.className.replace(/face-\d/, 'face-' + (1 + Math.floor(Math.random() * 6)));
    }, 90);
    dtTimers.push(iv);
    dtTimers.push(setTimeout(() => {
      clearInterval(iv);
      el.style.animationDelay = '0ms';
      el.className = el.className.replace(/face-\d/, 'face-' + d.v);
      el.classList.add('settled');
      if (d.v === 6) el.classList.add('six');
      if (d.stress && d.v === 1) el.classList.add('facehugger');
    }, delay + flight));
  });

  if (!animate) {
    dice.forEach((d, i) => {
      const el = layer.children[i];
      if (d.v === 6) el.classList.add('six');
      if (d.stress && d.v === 1) el.classList.add('facehugger');
    });
    return;
  }
  dtTimers.push(setTimeout(() => dtShowResult(roll), maxSettle + 350));
}

function dtResultStats(roll) {
  const dice = dtAllDice(roll);
  const gain = roll.stressGain ?? (roll.stress || []).filter(d => d.v === 1).length;
  return {
    successes: dice.filter(d => d.v === 6).length,
    gain,
    panic: gain > 0 && (roll.stressNow ?? 0) >= 10,
    count: dice.length,
  };
}

function dtShowResult(roll) {
  const result = document.getElementById('dtResult');
  if (!result) return;
  const { successes, gain, panic, count } = dtResultStats(roll);
  result.innerHTML = `
    <span class="dt-result-who">${roll.player} ⟶ ${roll.skill}</span>
    <span class="dt-result-pool">[${count} D6]</span>
    <span class="dt-result-succ ${successes > 0 ? 'good' : 'bad'}">${successes} ${successes === 1 ? 'ERFOLG' : 'ERFOLGE'}</span>
    ${gain > 0 ? `<span class="dt-result-stress">⚠ +${gain} STRESS</span>` : ''}
    ${panic ? '<span class="dt-result-panic">⚠ STRESS MAX — PANIC ROLL!</span>' : ''}`;
  result.classList.add('show');
}

// ── Toast notification (tool closed) ──────────────────────────────
function dtToast(roll) {
  const { successes, gain, panic } = dtResultStats(roll);
  let wrap = document.getElementById('dtToastWrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'dtToastWrap';
    document.body.appendChild(wrap);
  }
  const t = document.createElement('div');
  t.className = 'dt-toast' + (panic ? ' panic' : '');
  t.innerHTML = `
    <div class="dt-toast-head">// DICE TABLE</div>
    <div class="dt-toast-body">${roll.player} würfelt <b>${roll.skill}</b></div>
    <div class="dt-toast-res">${successes} ${successes === 1 ? 'ERFOLG' : 'ERFOLGE'}${gain > 0 ? ` · <b>+${gain} STRESS</b>` : ''}${panic ? ' · <b>PANIC!</b>' : ''}</div>`;
  t.onclick = () => { t.remove(); window.openDiceTable(); };
  wrap.appendChild(t);
  setTimeout(() => t.classList.add('show'), 20);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 7000);
}
