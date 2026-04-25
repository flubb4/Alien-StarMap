import { ref, set, remove, get, push, update, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ── SUPPLY ROLL PANEL ─────────────────────────────────────────────────────────
var spRef      = ref(window.db, 'session/playerSupplies');
var spView     = null;   // callsign currently shown
var spUnsub    = null;   // current firebase listener unsubscribe
var spItems    = {};     // local cache: { itemId: {name,type,rating,maxRating} }
var spNewRating = 3;     // selected rating in add-form
var spRolling  = false;  // lock during animation

// ── Open / Close ──────────────────────────────────────────────────────────────
window.openSupplyPanel = function() {
  document.getElementById('supplyPanel').classList.add('open');
  spView = window.myName;
  spBuildRatingPicker();
  spRenderTabs();
  spWatch(spView);
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
  // My own tab first
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
      // Show/hide add form: only for own items
      document.getElementById('spAddSection').style.display = (name === window.myName) ? '' : 'none';
    };
    tabs.appendChild(btn);
  });
}

// ── Firebase watcher for one player ──────────────────────────────────────────
function spWatch(callsign) {
  if (spUnsub) { spUnsub(); spUnsub = null; }
  spUnsub = onValue(ref(window.db, 'session/playerSupplies/' + callsign), function(snap) {
    spItems = snap.val() || {};
    spRenderItems(callsign);
  });
}

// ── Render item list ──────────────────────────────────────────────────────────
function spRenderItems(callsign) {
  var list = document.getElementById('spItemList');
  if (!list) return;
  list.innerHTML = '';
  var keys = Object.keys(spItems);
  if (keys.length === 0) {
    var empty = document.createElement('div');
    empty.className = 'sp-empty';
    empty.textContent = 'NO SUPPLY ITEMS — ADD ONE BELOW';
    list.appendChild(empty);
    return;
  }
  keys.forEach(function(id) {
    var item = spItems[id];
    var type = item.type || 'air';
    var rating = item.rating != null ? item.rating : item.maxRating;
    var maxRating = item.maxRating || 6;
    var canEdit = (callsign === window.myName || window.isGM);

    var card = document.createElement('div');
    card.className = 'sp-item';
    card.id = 'spItem_' + id;

    // Dots row
    var dotsHtml = '';
    for (var d = 1; d <= 6; d++) {
      dotsHtml += '<div class="sp-dot ' + (d <= rating ? 'filled ' + type : 'empty') + '"></div>';
    }

    card.innerHTML =
      '<span class="sp-item-name">' + item.name + '</span>' +
      '<span class="sp-type-badge ' + type + '">' + type.toUpperCase() + '</span>' +
      '<div class="sp-dots">' + dotsHtml + '</div>' +
      '<button class="sp-roll-btn" id="spRollBtn_' + id + '" onclick="spRoll(\'' + callsign + '\',\'' + id + '\')"' + (rating === 0 ? ' disabled' : '') + '>🎲 ROLL</button>' +
      (canEdit ? '<button class="sp-del-btn" onclick="spDelete(\'' + callsign + '\',\'' + id + '\')">✕</button>' : '') +
      '<div class="sp-roll-area" id="spRollArea_' + id + '"></div>';

    list.appendChild(card);
  });
}

// ── Supply Roll ───────────────────────────────────────────────────────────────
window.spRoll = function(callsign, itemId) {
  if (spRolling) return;
  var item = spItems[itemId];
  if (!item) return;
  var n = item.rating != null ? item.rating : item.maxRating;
  if (n <= 0) return;
  n = Math.min(n, 6);
  spRolling = true;

  var btn = document.getElementById('spRollBtn_' + itemId);
  if (btn) btn.disabled = true;

  // Roll N d6
  var results = [];
  for (var i = 0; i < n; i++) results.push(Math.floor(Math.random() * 6) + 1);
  var aliens = results.filter(function(r) { return r === 1; }).length;
  var newRating = Math.max(0, n - aliens);

  spAnimateRoll(itemId, item.type || 'air', results, function() {
    // Write to Firebase (3s after result shown — Firebase update clears the dice area)
    set(ref(window.db, 'session/playerSupplies/' + callsign + '/' + itemId + '/rating'), newRating);
    spRolling = false;
    // Re-enable button immediately (in case Firebase doesn't re-fire for unchanged value)
    setTimeout(function() {
      var b = document.getElementById('spRollBtn_' + itemId);
      if (b && newRating > 0) b.disabled = false;
    }, 80);
  });
};

// ── Dice animation ────────────────────────────────────────────────────────────
function spAnimateRoll(itemId, type, results, cb) {
  var area = document.getElementById('spRollArea_' + itemId);
  if (!area) { cb(); return; }
  area.innerHTML = '';

  // Create dice elements
  var diceRow = document.createElement('div');
  diceRow.className = 'sp-dice-row';
  var dies = results.map(function() {
    var d = document.createElement('div');
    d.className = 'sp-die rolling';
    d.textContent = '?';
    diceRow.appendChild(d);
    return d;
  });
  area.appendChild(diceRow);

  // Spin phase (~500ms)
  var spins = 0;
  var spinInterval = setInterval(function() {
    dies.forEach(function(d) { d.textContent = Math.floor(Math.random() * 6) + 1; });
    spins++;
    if (spins >= 8) {
      clearInterval(spinInterval);
      // Reveal final values one by one
      results.forEach(function(val, i) {
        setTimeout(function() {
          var isAlien = val === 1;
          dies[i].className = 'sp-die ' + (isAlien ? 'alien popped' : 'normal popped');
          if (isAlien) {
            dies[i].textContent = '';
            dies[i].innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 27" width="22" height="30" style="display:block"><path d="M10 1C5.5 1 2 5.8 2 11.5c0 5.5 3 10.2 5.5 12.2V27h2v-2.5h1V27h2v-3.3C15 21.7 18 17 18 11.5 18 5.8 14.5 1 10 1z" fill="#1a0500" stroke="#ff6600" stroke-width="1.3"/><path d="M5 9.5q5-3.5 10 0" fill="none" stroke="#ff8833" stroke-width="0.9"/><path d="M4 13.5q6-4.5 12 0" fill="none" stroke="#ff8833" stroke-width="0.9"/><ellipse cx="7.5" cy="16" rx="2" ry="2.6" fill="#ff4400"/><ellipse cx="12.5" cy="16" rx="2" ry="2.6" fill="#ff4400"/></svg>';
          } else {
            dies[i].textContent = val;
          }
        }, i * 80);
      });
      // Show result text after all dice revealed, then wait 3s before Firebase write
      setTimeout(function() {
        var aliens = results.filter(function(r) { return r === 1; }).length;
        var newRating = Math.max(0, results.length - aliens);
        var resDiv = document.createElement('div');
        if (aliens === 0) {
          resDiv.className = 'sp-result-text good';
          resDiv.textContent = 'NO ALIEN SYMBOLS — SUPPLY HOLDS';
        } else if (newRating === 0) {
          resDiv.className = 'sp-result-text dead';
          resDiv.textContent = aliens + ' ALIEN SYMBOL' + (aliens > 1 ? 'S' : '') + ' — SUPPLY EXHAUSTED!';
        } else {
          resDiv.className = 'sp-result-text bad';
          resDiv.textContent = aliens + ' ALIEN SYMBOL' + (aliens > 1 ? 'S' : '') + ' — RATING: ' + results.length + ' → ' + newRating;
        }
        area.appendChild(resDiv);
        // Wait 3 seconds so player can read the result before Firebase re-renders the list
        setTimeout(cb, 3000);
      }, results.length * 80 + 150);
    }
  }, 60);
}

// ── Add item ──────────────────────────────────────────────────────────────────
window.spAddItem = function() {
  var name = (document.getElementById('spNewName').value || '').trim();
  if (!name) return;
  var type = document.getElementById('spNewType').value;
  push(ref(window.db, 'session/playerSupplies/' + window.myName), {
    name: name, type: type, rating: spNewRating, maxRating: spNewRating
  });
  document.getElementById('spNewName').value = '';
  spNewRating = 3;
  spBuildRatingPicker();
};

// ── Delete item ───────────────────────────────────────────────────────────────
window.spDelete = function(callsign, itemId) {
  remove(ref(window.db, 'session/playerSupplies/' + callsign + '/' + itemId));
};

// ── Rating picker for add-form ────────────────────────────────────────────────
function spBuildRatingPicker() {
  var picker = document.getElementById('spRatingPicker');
  if (!picker) return;
  picker.innerHTML = '';
  for (var i = 1; i <= 6; i++) {
    (function(val) {
      var dot = document.createElement('div');
      dot.className = 'sp-pick-dot ' + (val <= spNewRating ? 'sel-air' : 'unsel');
      dot.title = 'Rating ' + val;
      dot.onclick = function() {
        spNewRating = val;
        // Update color based on current type selection
        var type = document.getElementById('spNewType').value;
        spUpdatePickerColor(type);
      };
      picker.appendChild(dot);
    })(i);
  }
}

function spUpdatePickerColor(type) {
  var dots = document.querySelectorAll('#spRatingPicker .sp-pick-dot');
  dots.forEach(function(d, i) {
    d.className = 'sp-pick-dot ' + ((i + 1) <= spNewRating ? 'sel-' + type : 'unsel');
  });
}

// Re-color picker when type changes
document.addEventListener('DOMContentLoaded', function() {
  var typeSelect = document.getElementById('spNewType');
  if (typeSelect) typeSelect.addEventListener('change', function() {
    spUpdatePickerColor(this.value);
  });
});

window.startSupplyPanel = function() {
  // Nothing to pre-load; panel opens on demand
};
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
