import { ref, set, remove, push, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ── SUPPLY ROLL PANEL — MU/TH/UR 9000 redesign ───────────────────────────────
var spView    = null;
var spUnsub   = null;
var spItems   = {};
var spRolling = {};   // per-item: { itemId: true } while animating

// ── Die helpers ───────────────────────────────────────────────────────────────
var SP_FACES = {
  1:['c'], 2:['tl','br'], 3:['tl','c','br'],
  4:['tl','tr','bl','br'], 5:['tl','tr','c','bl','br'],
  6:['tl','tr','ml','mr','bl','br'],
};
function spD6() { return 1 + Math.floor(Math.random() * 6); }
function spDieHTML(face, cls) {
  var dots = SP_FACES[face] || [];
  return '<div class="sp-die ' + (face === 1 ? 'one ' : '') + (cls || '') + '">' +
    dots.map(function(p) { return '<span class="sp-dot ' + p + '"></span>'; }).join('') + '</div>';
}

// ── Audio ─────────────────────────────────────────────────────────────────────
var spACtx = null;
function spBeep(freq, ms, vol) {
  try {
    if (!spACtx) spACtx = new (window.AudioContext || window.webkitAudioContext)();
    var t = spACtx.currentTime;
    var o = spACtx.createOscillator(), g = spACtx.createGain();
    o.type = 'square'; o.frequency.value = freq || 820;
    g.gain.setValueAtTime(vol || 0.04, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (ms || 40) / 1000);
    o.connect(g).connect(spACtx.destination);
    o.start(t); o.stop(t + (ms || 40) / 1000 + 0.01);
  } catch(e) {}
}

// ── Normalize item (backwards compat: rating/maxRating → pts/max) ─────────────
function spNorm(raw) {
  return {
    name: raw.name || '?',
    pts:  +(raw.pts  != null ? raw.pts  : (raw.rating    != null ? raw.rating    : 3)),
    max:  +(raw.max  != null ? raw.max  : (raw.maxRating != null ? raw.maxRating : 6)),
  };
}

// ── Open / Close ──────────────────────────────────────────────────────────────
window.openSupplyPanel = function() {
  document.getElementById('supplyPanel').classList.add('open');
  spView = window.myName;
  spRenderTabs();
  spWatch(spView);
  setTimeout(function() {
    var el = document.getElementById('spNewName'); if (el) el.focus();
  }, 60);
};
window.closeSupplyPanel = function() {
  document.getElementById('supplyPanel').classList.remove('open');
  if (spUnsub) { spUnsub(); spUnsub = null; }
};

// ── GM Tabs ───────────────────────────────────────────────────────────────────
function spRenderTabs() {
  var tabs = document.getElementById('spTabs');
  if (!tabs) return;
  tabs.innerHTML = '';
  if (!window.isGM) return;
  var all = [window.myName];
  if (window._onlinePlayers) window._onlinePlayers.forEach(function(n) {
    if (n !== window.myName) all.push(n);
  });
  all.forEach(function(name) {
    var btn = document.createElement('button');
    btn.className = 'sp-tab' + (name === spView ? ' active' : '');
    btn.textContent = name;
    btn.onclick = function() {
      spView = name;
      spRenderTabs();
      spWatch(name);
      var sec = document.getElementById('spAddSection');
      if (sec) sec.style.display = (name === window.myName) ? '' : 'none';
    };
    tabs.appendChild(btn);
  });
}

// ── Firebase watcher ──────────────────────────────────────────────────────────
function spWatch(callsign) {
  if (spUnsub) { spUnsub(); spUnsub = null; }
  spUnsub = onValue(ref(window.db, 'session/playerSupplies/' + callsign), function(snap) {
    spItems = snap.val() || {};
    spRenderItems(callsign);
  });
}

// ── Render ────────────────────────────────────────────────────────────────────
function spRenderItems(callsign) {
  var list    = document.getElementById('spItemList');
  var countEl = document.getElementById('spListCount');
  if (!list) return;
  var keys = Object.keys(spItems);
  if (countEl) countEl.textContent = keys.length + ' ITEM' + (keys.length === 1 ? '' : 'S');

  if (keys.length === 0) {
    list.innerHTML = '<div class="sp-empty">NO SUPPLIES REGISTERED<br>' +
      '<span style="font-size:9px;color:var(--sp-amber-d)">ADD AN ITEM ABOVE TO BEGIN SUPPLY-ROLL TRACKING</span></div>';
    return;
  }

  // Save rolling cards BEFORE clearing — innerHTML='' detaches but doesn't destroy nodes
  var saved = {};
  keys.forEach(function(id) {
    if (spRolling[id]) {
      var el = document.getElementById('spCard_' + id);
      if (el) saved[id] = el;
    }
  });

  list.innerHTML = '';
  keys.forEach(function(id) {
    // Re-attach the saved card as-is so the running animation is not interrupted
    if (saved[id]) { list.appendChild(saved[id]); return; }

    var item    = spNorm(spItems[id]);
    var dep     = item.pts <= 0;
    var canEdit = (callsign === window.myName || window.isGM);

    var pips = '';
    for (var i = 0; i < item.max; i++)
      pips += '<span class="sp-pip' + (i < item.pts ? ' on' : '') + '"></span>';

    var card = document.createElement('div');
    card.className = 'sp-item' + (dep ? ' sp-dep' : '');
    card.id = 'spCard_' + id;
    card.innerHTML =
      '<div class="sp-item-top">' +
        '<div class="sp-item-name">' + spEsc(item.name) + '</div>' +
        (canEdit ? '<button class="sp-del-btn" onclick="spDelete(\'' + callsign + '\',\'' + id + '\')">×</button>' : '') +
      '</div>' +
      '<div class="sp-item-body">' +
        '<div class="sp-pts-block">' +
          '<span class="sp-pts-label">SUPPLY LVL</span>' +
          '<div class="sp-pts-row">' +
            '<button class="sp-sbtn" onclick="spChangePts(\'' + callsign + '\',\'' + id + '\',-1)"' +
              (!canEdit || dep ? ' disabled' : '') + '>−</button>' +
            '<span class="sp-pts-val">' + item.pts + '</span>' +
            '<span class="sp-pts-slash">/</span>' +
            '<span class="sp-pts-max">' + item.max + '</span>' +
            '<button class="sp-sbtn" onclick="spChangePts(\'' + callsign + '\',\'' + id + '\',1)"' +
              (!canEdit || item.pts >= item.max ? ' disabled' : '') + '>+</button>' +
          '</div>' +
        '</div>' +
        '<div class="sp-pips" id="spPips_' + id + '">' + pips + '</div>' +
        '<button class="sp-roll-btn" id="spRollBtn_' + id + '" ' +
          'onclick="spRoll(\'' + callsign + '\',\'' + id + '\')"' +
          (dep || !canEdit ? ' disabled' : '') + '>' +
          (dep ? '[ DEPLETED ]' : '[ ROLL ' + item.pts + 'D6 ]') +
        '</button>' +
      '</div>' +
      '<div class="sp-dice-tray" id="spTray_' + id + '"></div>';
    list.appendChild(card);
  });
}

function spEsc(s) {
  return String(s).replace(/[&<>"']/g, function(c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}

// ── Add item ──────────────────────────────────────────────────────────────────
window.spAddItem = function() {
  var el = document.getElementById('spNewName');
  var name = ((el ? el.value : '') || '').trim().toUpperCase();
  if (!name) return;
  push(ref(window.db, 'session/playerSupplies/' + window.myName), { name:name, pts:3, max:6 });
  if (el) { el.value = ''; el.focus(); }
  spBeep(900, 30);
};

// ── Delete ────────────────────────────────────────────────────────────────────
window.spDelete = function(callsign, itemId) {
  remove(ref(window.db, 'session/playerSupplies/' + callsign + '/' + itemId));
  spBeep(400, 40);
};

// ── Stepper ───────────────────────────────────────────────────────────────────
window.spChangePts = function(callsign, itemId, dir) {
  var raw = spItems[itemId]; if (!raw) return;
  var item = spNorm(raw);
  var next = Math.max(0, Math.min(item.max, item.pts + dir));
  if (next === item.pts) return;
  set(ref(window.db, 'session/playerSupplies/' + callsign + '/' + itemId + '/pts'), next);
  spBeep(820, 30);
};

// ── Roll ──────────────────────────────────────────────────────────────────────
window.spRoll = function(callsign, itemId) {
  if (spRolling[itemId]) return;
  var raw = spItems[itemId]; if (!raw) return;
  var item = spNorm(raw);
  if (item.pts <= 0) return;

  spRolling[itemId] = true;
  spBeep(820, 40);

  var N = item.pts, finals = [];
  for (var i = 0; i < N; i++) finals.push(spD6());

  var tray = document.getElementById('spTray_' + itemId);
  if (!tray) { spRolling[itemId] = false; return; }
  tray.classList.add('active');

  var shuffleCount = 0;
  function shuffle() {
    tray.innerHTML = finals.map(function() { return spDieHTML(spD6(), 'rolling'); }).join('');
    if (++shuffleCount < 10) { setTimeout(shuffle, 80); return; }
    // Lock one by one
    var idx = 0;
    function lockNext() {
      if (idx >= N) {
        // All locked — apply verdict
        tray.innerHTML = finals.map(function(v) { return spDieHTML(v, v===1?'locked':''); }).join('');
        var ones   = finals.filter(function(v) { return v===1; }).length;
        var newPts = Math.max(0, item.pts - ones);
        var verdict, vclass;
        if      (ones === 0)  { verdict = 'HOLDING // LVL ' + item.pts; vclass = 'hold'; }
        else if (newPts === 0){ verdict = 'DEPLETED'; vclass = 'dep'; spBeep(180, 400, 0.05); }
        else                  { verdict = 'DRAIN −' + ones + ' // LVL ' + newPts; vclass = 'drain'; spBeep(320, 120, 0.05); }
        tray.insertAdjacentHTML('beforeend',
          '<div class="sp-roll-verdict ' + vclass + '">› ' + verdict + '</div>');

        // Flash drained pips before Firebase re-renders
        if (ones > 0) {
          var ph = document.getElementById('spPips_' + itemId);
          if (ph) {
            var onPips = Array.prototype.slice.call(ph.querySelectorAll('.sp-pip.on'));
            for (var k = onPips.length - 1; k >= onPips.length - ones && k >= 0; k--)
              onPips[k].classList.add('justDrained');
          }
        }

        // After display delay: write to Firebase (triggers re-render) or re-render locally
        setTimeout(function() {
          spRolling[itemId] = false;
          if (ones > 0) {
            set(ref(window.db, 'session/playerSupplies/' + callsign + '/' + itemId + '/pts'), newPts);
          } else {
            spRenderItems(callsign);
          }
        }, ones === 0 ? 1400 : 2000);
        return;
      }
      tray.innerHTML = finals.map(function(v, i) {
        return i <= idx ? spDieHTML(v, v===1?'locked':'') : spDieHTML(spD6(), 'rolling');
      }).join('');
      spBeep(finals[idx] === 1 ? 220 : 500 + finals[idx] * 60, 25, 0.03);
      idx++;
      setTimeout(lockNext, 90);
    }
    lockNext();
  }
  shuffle();
};

// Enter key for prompt input
document.addEventListener('DOMContentLoaded', function() {
  var inp = document.getElementById('spNewName');
  if (inp) inp.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); window.spAddItem(); }
  });
});

window.startSupplyPanel = function() {};
// ── END SUPPLY ROLL PANEL ─────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════════════════════
// PROVISIONS TRACKER — Supply Manifest · Deck C (1:1 Claude Design port)
// ══════════════════════════════════════════════════════════════════════════════
(function() {
  const RATIONS_PATH = 'session/rations';
  const KEYS = ['standard', 'premium', 'bar', 'beer'];

  // Item config — sizes match the design sprites (42x54 / 42x54 / 46x20 / 24x44)
  const ITEM_TYPES = {
    standard: { w: 42, h: 54 },
    premium:  { w: 42, h: 54 },
    bar:      { w: 46, h: 20 },
    beer:     { w: 24, h: 44 },
  };
  // Stockpile lane assignments — share a single floor, split horizontally
  const LANES = {
    standard: { xMin: 0.02, xMax: 0.26 },
    premium:  { xMin: 0.26, xMax: 0.42 },
    bar:      { xMin: 0.44, xMax: 0.70 },
    beer:     { xMin: 0.72, xMax: 0.98 },
  };
  const THRESHOLDS = {
    standard: { low: 8,  crit: 3 },
    premium:  { low: 4,  crit: 2 },
    bar:      { low: 10, crit: 4 },
    beer:     { low: 6,  crit: 2 },
  };
  function statusOf(key, v) {
    const t = THRESHOLDS[key];
    if (v <= t.crit) return 'critical';
    if (v <= t.low)  return 'low';
    return 'nominal';
  }

  // Local state
  let _counts = { standard: 0, premium: 0, bar: 0, beer: 0 };
  let _items = [];          // {id, type, el}
  let _allPlaced = [];      // collision list: {id, type, ex, ey, w, h}
  let _nextId = 1;
  let _panelOpen = false;
  let _initialized = false; // first Firebase callback seeds silently

  // ─── Sprite SVG (1:1 ported from design sprites.jsx, flat-color to avoid id collisions) ──
  function spriteSVG(type) {
    if (type === 'standard' || type === 'premium') {
      const premium = type === 'premium';
      const body = premium ? '#4f4222' : '#3a3828';
      const label = premium ? '#d8b26b' : '#8a7d5a';
      const title = premium ? 'MRE-A' : 'MRE-S';
      const sub = premium ? 'GRADE-I' : 'STD';
      const gold = premium
        ? '<rect x="3" y="9" width="36" height="1.5" fill="#d8b26b" opacity="0.6"/><rect x="3" y="48.5" width="36" height="1.5" fill="#d8b26b" opacity="0.6"/>'
        : '';
      return `<svg width="42" height="54" viewBox="0 0 42 54" style="display:block">
        <rect x="3" y="5" width="36" height="46" fill="${body}" stroke="#000" stroke-width="1"/>
        <rect x="3" y="5" width="36" height="4" fill="#1a1812"/>
        <line x1="3" y1="7" x2="39" y2="7" stroke="#000" stroke-width="0.5" stroke-dasharray="2 1"/>
        <line x1="3" y1="51" x2="39" y2="51" stroke="#1a1812" stroke-width="2"/>
        <rect x="8" y="18" width="26" height="18" fill="${label}" opacity="0.85"/>
        <text x="21" y="28" text-anchor="middle" font-size="6" font-family="monospace" fill="#0a0c0a" font-weight="700">${title}</text>
        <text x="21" y="34" text-anchor="middle" font-size="4" font-family="monospace" fill="#0a0c0a">${sub}</text>
        ${gold}
        <rect x="5" y="7" width="2" height="42" fill="#fff" opacity="0.06"/>
      </svg>`;
    }
    if (type === 'bar') {
      return `<svg width="46" height="20" viewBox="0 0 46 20" style="display:block">
        <polygon points="0,10 6,4 6,16" fill="#2a331f" stroke="#000" stroke-width="0.5"/>
        <polygon points="46,10 40,4 40,16" fill="#2a331f" stroke="#000" stroke-width="0.5"/>
        <rect x="6" y="2" width="34" height="16" fill="#2e382a" stroke="#000" stroke-width="0.8"/>
        <rect x="6" y="8" width="34" height="1" fill="#d8b26b" opacity="0.7"/>
        <rect x="6" y="11" width="34" height="0.5" fill="#d8b26b" opacity="0.4"/>
        <text x="23" y="7" text-anchor="middle" font-size="4" font-family="monospace" fill="#d8b26b" font-weight="700">N-BAR</text>
        <text x="23" y="16" text-anchor="middle" font-size="3.2" font-family="monospace" fill="#d8b26b">2400kJ</text>
        <line x1="2" y1="10" x2="6" y2="10" stroke="#000" stroke-width="0.4"/>
        <line x1="40" y1="10" x2="44" y2="10" stroke="#000" stroke-width="0.4"/>
      </svg>`;
    }
    if (type === 'beer') {
      return `<svg width="24" height="44" viewBox="0 0 24 44" style="display:block">
        <rect x="1" y="1" width="22" height="3" fill="#3a3a42" stroke="#000" stroke-width="0.5"/>
        <rect x="1" y="4" width="22" height="36" fill="#5a5a62" stroke="#000" stroke-width="0.5"/>
        <rect x="1" y="40" width="22" height="3" fill="#3a3a42" stroke="#000" stroke-width="0.5"/>
        <rect x="1" y="14" width="22" height="16" fill="#8a2a20"/>
        <rect x="1" y="14" width="22" height="1" fill="#d8b26b"/>
        <rect x="1" y="29" width="22" height="1" fill="#d8b26b"/>
        <text x="12" y="21" text-anchor="middle" font-size="3.5" font-family="monospace" fill="#f0e6c8" font-weight="700">KRVK</text>
        <text x="12" y="26" text-anchor="middle" font-size="2.8" font-family="monospace" fill="#f0e6c8">LAGER</text>
        <circle cx="12" cy="2.5" r="0.8" fill="#1a1a1e"/>
      </svg>`;
    }
    return '';
  }

  // ─── Placement (1:1 port of design's computePlacement — shared collision) ──
  function computePlacement(type, floorEl) {
    const cfg = ITEM_TYPES[type];
    const rect = floorEl.getBoundingClientRect();
    const lane = LANES[type];
    const slack = 0.05;
    const laneLeft  = rect.width * Math.max(0.005, lane.xMin - slack);
    const laneRight = rect.width * Math.min(0.995, lane.xMax + slack);
    const laneW = Math.max(1, laneRight - laneLeft - cfg.w);
    const layerH = rect.height - 36;
    const floorBaseY = layerH - cfg.h;
    const others = _allPlaced;

    const attempts = 12;
    let best = null;
    for (let a = 0; a < attempts; a++) {
      const x = laneLeft + Math.random() * laneW;
      let supportY = floorBaseY;
      for (const p of others) {
        const overlapW = Math.min(x + cfg.w, p.ex + p.w) - Math.max(x, p.ex);
        const minOverlap = Math.min(cfg.w, p.w) * 0.2;
        if (overlapW > minOverlap) {
          const candidate = p.ey - cfg.h * (0.86 + Math.random() * 0.08);
          if (candidate < supportY) supportY = candidate;
        }
      }
      const score = supportY + (Math.random() - 0.5) * cfg.h * 0.4;
      if (!best || score > best.score) best = { x, ey: supportY, score };
    }

    const ex = best.x + (Math.random() - 0.5) * 3;
    const ey = Math.max(-cfg.h * 0.5, best.ey + (Math.random() - 0.5) * 1.5);
    const rf = (Math.random() - 0.5) * 26;
    const r0 = (Math.random() - 0.5) * 220;
    const r1 = rf + (Math.random() - 0.5) * 18;
    const sx = ex + (Math.random() - 0.5) * 160;
    const z = Math.round((layerH - ey) * 10) + Math.floor(Math.random() * 5);
    return { sx, ex, ey, r0, r1, rf, z };
  }

  function _createItemEl(id, type, p, phase) {
    const el = document.createElement('div');
    el.className = 'sm-item ' + phase;
    el.dataset.id = id;
    el.style.setProperty('--sx', p.sx + 'px');
    el.style.setProperty('--ex', p.ex + 'px');
    el.style.setProperty('--ey', p.ey + 'px');
    el.style.setProperty('--r0', p.r0 + 'deg');
    el.style.setProperty('--r1', p.r1 + 'deg');
    el.style.setProperty('--rf', p.rf + 'deg');
    el.style.zIndex = p.z;
    if (phase === 'settled') {
      el.style.transform = `translate(${p.ex}px, ${p.ey}px) rotate(${p.rf}deg)`;
    }
    el.innerHTML = spriteSVG(type);
    return el;
  }

  function _seedItems(type, n) {
    const floor = document.getElementById('smStockpile');
    const layer = document.getElementById('smItemsLayer');
    if (!floor || !layer) return;
    const cfg = ITEM_TYPES[type];
    for (let i = 0; i < n; i++) {
      const placement = computePlacement(type, floor);
      const id = _nextId++;
      _allPlaced.push({ id, type, ex: placement.ex, ey: placement.ey, w: cfg.w, h: cfg.h });
      const el = _createItemEl(id, type, placement, 'settled');
      layer.appendChild(el);
      _items.push({ id, type, el });
    }
  }

  function _dropItems(type, n) {
    const floor = document.getElementById('smStockpile');
    const layer = document.getElementById('smItemsLayer');
    if (!floor || !layer || n <= 0) return;
    n = Math.min(n, 30);
    const cfg = ITEM_TYPES[type];
    for (let i = 0; i < n; i++) {
      const placement = computePlacement(type, floor);
      const id = _nextId++;
      _allPlaced.push({ id, type, ex: placement.ex, ey: placement.ey, w: cfg.w, h: cfg.h });
      const el = _createItemEl(id, type, placement, 'dropping');
      layer.appendChild(el);
      _items.push({ id, type, el });
      // Snap to settled transform after animation ends
      setTimeout(() => {
        el.classList.remove('dropping');
        el.style.transform = `translate(${placement.ex}px, ${placement.ey}px) rotate(${placement.rf}deg)`;
      }, 950 + i * 40);
    }
  }

  function _consumeItems(type, n) {
    if (n <= 0) return;
    const toRemove = [];
    for (let i = _items.length - 1; i >= 0 && toRemove.length < n; i--) {
      if (_items[i].type === type && !_items[i].el.classList.contains('consuming')) {
        toRemove.push(_items[i]);
      }
    }
    for (const r of toRemove) {
      r.el.classList.add('consuming');
      _allPlaced = _allPlaced.filter(p => p.id !== r.id);
      _items = _items.filter(x => x.id !== r.id);
      setTimeout(() => { if (r.el.parentNode) r.el.parentNode.removeChild(r.el); }, 450);
    }
  }

  function _clearScene() {
    const layer = document.getElementById('smItemsLayer');
    if (layer) layer.innerHTML = '';
    _items = [];
    _allPlaced = [];
  }

  function _reseed() {
    _clearScene();
    for (const k of KEYS) _seedItems(k, _counts[k]);
  }

  // ── Scott / Crew quotes (preserved — Scott tied to bar, Crew tied to beer) ──
  const SCOTT_QUOTES = [
    { min:25, status:'// SCOTT-STATUS: OPTIMAL',            quote:'Müsliriegel-Vorrat gesichert. Scott strahlt. Alles ist gut. Die Welt ist schön.',           color:'#44ff88' },
    { min:16, status:'// SCOTT-STATUS: ZUFRIEDEN',          quote:'"Ich hab noch genug. Nicht anfassen. Nein, wirklich. HÄNDE WEG."',                           color:'#88cc44' },
    { min:10, status:'// SCOTT-STATUS: ANGESPANNT',         quote:'Scott zählt seine Riegel. Zweimal. Er gibt jemandem böse Blicke.',                           color:'#ffcc00' },
    { min: 5, status:'// SCOTT-STATUS: KRITISCH',           quote:'"Wer hat meinen Müsliriegel angerührt?! ICH RIECHE ES AN EUCH."',                            color:'#ff8800' },
    { min: 2, status:'// SCOTT-STATUS: NOTFALL',            quote:'Scott schläft mit den verbleibenden Riegeln unterm Kopfkissen. Sicherheitsprotokoll aktiv.', color:'#ff4400' },
    { min: 1, status:'// SCOTT-STATUS: LETZTE RATION',      quote:'"DEN LETZTEN. RÜHRT. KEINER. AN." [Stimme bricht leicht]',                                   color:'#ff2200' },
    { min: 0, status:'// SCOTT-STATUS: BESTAND ERSCHÖPFT',  quote:'⚠ SCOTT OHNE MÜSLIRIEGEL. EVAKUIERUNG EMPFOHLEN. ALLE IN DECKUNG. WIR WIEDERHOLEN: IN DECKUNG. ⚠', color:'#ff0000' },
  ];
  const BIER_QUOTES = [
    { min:20, status:'// CREW-MORAL: AUSGEZEICHNET',  quote:'Vorräte voll. Gustav hat bereits drei. Scott erklärt das mit "Akklimatisierung". Keiner widerspricht.',                     color:'#44ff88' },
    { min:16, status:'// CREW-MORAL: SEHR GUT',       quote:'Silas schlägt Trinkspiele vor. Julian sagt nein. Silas macht es trotzdem. Julian macht mit.',                              color:'#66ee66' },
    { min:12, status:'// CREW-MORAL: GUT',            quote:'Ausreichend. Mae zählt heimlich ihren Anteil. Nicht heimlich genug. Isabella hat es gesehen.',                             color:'#88cc44' },
    { min: 8, status:'// CREW-MORAL: ANGESPANNT',     quote:'Knapp. Gustav sagt, er brauche kein Bier. Alle wissen: Lüge. Gustav weiß es auch.',                                       color:'#ccaa00' },
    { min: 6, status:'// CREW-MORAL: ANGESPANNT',     quote:'Silas ist still. Das ist schlimmer als wenn Silas redet. Scott beobachtet Silas besorgt.',                                 color:'#ffcc00' },
    { min: 4, status:'// CREW-MORAL: KRITISCH',       quote:'Letzte Reserven. Julian erstellt eine Rationierungstabelle. Niemand befolgt sie. Julian auch nicht.',                      color:'#ff9900' },
    { min: 3, status:'// CREW-MORAL: KRITISCH',       quote:'Mae hat das letzte Bier "sichergestellt". Für medizinische Zwecke. Niemand glaubt ihr. Isabella notiert es.',              color:'#ff8800' },
    { min: 2, status:'// CREW-MORAL: KRITISCH',       quote:'Scott schaut wehmütig in eine leere Flasche. Gustav fragt ob er das braucht. Scott sagt "Ja."',                            color:'#ff6600' },
    { min: 1, status:'// CREW-MORAL: ROT',            quote:'"Wer hat das letzte Bier?" — Alle zeigen auf Silas. Silas zeigt auf Gustav. Gustav zeigt auf Mae.',                        color:'#ff4400' },
    { min: 0, status:'// CREW-MORAL: KOLLAPS',        quote:'KEIN BIER. Gustav weint. Silas weint anders. Mae "weint nicht", trinkt Desinfektionsmittel. Isabella schreibt Protokoll.', color:'#ff0000' },
  ];
  function scottQuote(n) { return SCOTT_QUOTES.find(q => n >= q.min) || SCOTT_QUOTES[SCOTT_QUOTES.length-1]; }
  function bierQuote(n)  { return BIER_QUOTES.find(q => n >= q.min)  || BIER_QUOTES[BIER_QUOTES.length-1]; }

  // ─── UI text/status update ──
  function _setStatusEl(el, status) {
    if (!el) return;
    el.className = 'sm-status ' + status;
    el.textContent = status.toUpperCase();
  }
  function _setReadout(id, n, status) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = String(n).padStart(3, '0') + ' UNT · <span class="sm-status ' + status + '">' + status.toUpperCase() + '</span>';
  }
  function _updateUIText(c) {
    // Count inputs (don't clobber if user is typing)
    KEYS.forEach(k => {
      const inp = document.querySelector('#rationsPanel [data-count="' + k + '"]');
      if (inp && document.activeElement !== inp) inp.value = c[k];
    });
    // Status tags
    KEYS.forEach(k => {
      const tag = document.querySelector('#rationsPanel [data-status="' + k + '"]');
      _setStatusEl(tag, statusOf(k, c[k]));
    });
    // Readouts
    const total = c.standard + c.premium;
    const totalStatus = total <= 5 ? 'critical' : total <= 12 ? 'low' : 'nominal';
    _setReadout('smReadoutRations', total, totalStatus);
    _setReadout('smReadoutBar',     c.bar,  statusOf('bar', c.bar));
    _setReadout('smReadoutBeer',    c.beer, statusOf('beer', c.beer));

    // Scott / Crew quotes
    const sq = scottQuote(c.bar);
    const qs = document.getElementById('rationsScottStatus');
    const qq = document.getElementById('rationsScottQuote');
    if (qs) { qs.textContent = sq.status; qs.style.color = sq.color; }
    if (qq) { qq.textContent = sq.quote;  qq.style.color = sq.color; }

    const bq = bierQuote(c.beer);
    const bs = document.getElementById('rationsBierStatus');
    const bt = document.getElementById('rationsBierQuote');
    if (bs) { bs.textContent = bq.status; bs.style.color = bq.color; }
    if (bt) { bt.textContent = bq.quote;  bt.style.color = bq.color; }

    // Header button
    const btn = document.getElementById('rationsBtn');
    if (btn) {
      btn.classList.remove('rations-low', 'muesli-crisis');
      if (c.beer === 0 || c.bar === 0 || total === 0) { btn.textContent = '🚨 PROVISIONS'; btn.classList.add('muesli-crisis'); }
      else if (c.bar <= 3 || total <= 4 || c.beer <= 3) { btn.textContent = '⚠ PROVISIONS'; btn.classList.add('rations-low'); }
      else { btn.textContent = '🍫 PROVISIONS'; }
    }
  }

  // ─── Firebase data reducer (one-shot schema migration from old keys) ──
  function _normalize(raw) {
    return {
      standard: +(raw.standard != null ? raw.standard : (raw.food   != null ? raw.food   : 0)) || 0,
      premium:  +(raw.premium  != null ? raw.premium  : 0) || 0,
      bar:      +(raw.bar      != null ? raw.bar      : (raw.muesli != null ? raw.muesli : 0)) || 0,
      beer:     +(raw.beer     != null ? raw.beer     : (raw.bier   != null ? raw.bier   : 0)) || 0,
    };
  }

  function _onFirebase(snap) {
    const next = _normalize(snap.val() || {});
    const prev = _counts;
    _counts = next;
    _updateUIText(next);

    // Animate only when panel is visible (stockpile sized)
    if (_panelOpen) {
      if (!_initialized) {
        _reseed();
        _initialized = true;
      } else {
        for (const k of KEYS) {
          const d = next[k] - prev[k];
          if (d > 0) _dropItems(k, d);
          else if (d < 0) _consumeItems(k, -d);
        }
      }
    }
  }

  // ─── Input wiring (type-to-set) ──
  function _bindInputs() {
    document.querySelectorAll('#rationsPanel [data-count]').forEach(el => {
      el.addEventListener('focus', (e) => e.target.select());
      el.addEventListener('input', (e) => {
        const type = el.dataset.count;
        const raw = String(e.target.value).replace(/[^0-9]/g, '');
        const n = raw === '' ? 0 : Math.max(0, Math.min(999, parseInt(raw, 10)));
        window._authReadyPromise.then(() => update(ref(window.db, RATIONS_PATH), { [type]: n }));
      });
    });
  }

  // ─── Clock ──
  function _startClock() {
    (function tick() {
      const el = document.getElementById('smClock');
      if (el) {
        const d = new Date();
        const pad = n => String(n).padStart(2, '0');
        el.textContent = pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds()) + 'Z';
      }
      setTimeout(tick, 1000);
    })();
  }

  // ─── Public API ──
  window.startRationsPanel = function() {
    // Everyone sees the button — no more Scott-only gating
    const btn = document.getElementById('rationsBtn');
    if (btn) btn.style.display = 'inline-block';

    _bindInputs();
    _startClock();

    window._authReadyPromise.then(() => {
      onValue(ref(window.db, RATIONS_PATH), _onFirebase);
    });
  };

  window.openRationsPanel = function() {
    document.getElementById('rationsPanel').classList.add('open');
    _panelOpen = true;
    // Wait for layout so stockpile has real dimensions, then seed
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        _reseed();
        _initialized = true;
      });
    });
  };

  window.closeRationsPanel = function() {
    _panelOpen = false;
    _initialized = false;
    _clearScene();
    document.getElementById('rationsPanel').classList.remove('open');
  };

  window.adjustRation = function(type, delta) {
    const cur = Math.max(0, Math.min(999, (_counts[type] || 0) + delta));
    window._authReadyPromise.then(() => update(ref(window.db, RATIONS_PATH), { [type]: cur }));
  };

  // Kept for backward compat with any lingering markup; no-op for the new design.
  window.setRation = function() {};
})();
// ── END PROVISIONS TRACKER ────────────────────────────────────────────────────
