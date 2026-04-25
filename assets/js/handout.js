import { ref, set, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ── HANDOUT SYSTEM ───────────────────────────────────────────────────────────
var handoutRef = ref(window.db, 'session/handout');
var hoLastTs   = 0;   // ignore handouts already seen before this session
var crtTyping  = false;
var crtSkipped = false;
var crtInterval = null;

// ── GM: open panel, populate player list ─────────────────────────────────────
window.openHandoutPanel = function() {
  if (!window.isGM) return;
  document.getElementById('handoutPanel').classList.add('open');
  hoPopulatePlayers();
};

window.closeHandoutPanel = function() {
  document.getElementById('handoutPanel').classList.remove('open');
};

function hoPopulatePlayers() {
  var list = document.getElementById('hoPlayerList');
  list.innerHTML = '';
  document.getElementById('hoAll').checked = false;
  // Build from the live online players set
  var players = window._onlinePlayers || new Set();
  players.forEach(function(name) {
    if (name === window.myName) return; // don't include the GM
    var chip = document.createElement('label');
    chip.className = 'ho-player-chip';
    chip.innerHTML = '<input type="checkbox" value="' + name + '"> ' + name;
    chip.querySelector('input').addEventListener('change', function() {
      chip.classList.toggle('selected', this.checked);
      if (!this.checked) document.getElementById('hoAll').checked = false;
    });
    list.appendChild(chip);
  });
  if (list.children.length === 0) {
    list.innerHTML = '<span style="color:#2a4433;font-size:10px;letter-spacing:1px">NO OPERATIVES ONLINE</span>';
  }
}

window.hoToggleAll = function(cb) {
  document.querySelectorAll('#hoPlayerList .ho-player-chip input').forEach(function(inp) {
    inp.checked = cb.checked;
    inp.closest('label').classList.toggle('selected', cb.checked);
  });
};

window.sendHandout = function() {
  if (!window.isGM) return;
  var text = document.getElementById('hoText').value.trim();
  if (!text) return;

  // Collect targets
  var allChecked = document.getElementById('hoAll').checked;
  var targets;
  if (allChecked) {
    targets = 'all';
  } else {
    targets = [];
    document.querySelectorAll('#hoPlayerList .ho-player-chip input:checked').forEach(function(inp) {
      targets.push(inp.value);
    });
    if (targets.length === 0) { alert('Bitte mindestens einen Spieler auswählen.'); return; }
  }

  var ts = Date.now();
  set(handoutRef, { text: text, targets: targets, ts: ts }).then(function() {
    document.getElementById('hoText').value = '';
    closeHandoutPanel();
  });
};

// ── Player: listen for incoming handouts ──────────────────────────────────────
window.startHandoutWatcher = function() {
  hoLastTs = Date.now(); // ignore anything already in Firebase before login
  onValue(handoutRef, function(snap) {
    var data = snap.val();
    if (!data || !data.ts || data.ts <= hoLastTs) return;
    hoLastTs = data.ts;

    // Check if this player is a target
    var isTarget = false;
    if (data.targets === 'all') {
      isTarget = !window.isGM; // GMs sent it, they don't receive it
    } else if (Array.isArray(data.targets)) {
      isTarget = data.targets.indexOf(window.myName) !== -1;
    }
    if (!isTarget) return;

    crtShow(data.text);
  });
};

// ── CRT display ───────────────────────────────────────────────────────────────
function crtShow(text) {
  var overlay = document.getElementById('crtOverlay');
  var body    = document.getElementById('crtBody');
  var footer  = document.getElementById('crtFooter');

  body.innerHTML = '';
  footer.classList.remove('visible');
  crtSkipped = false;
  crtTyping  = true;
  if (crtInterval) clearInterval(crtInterval);

  overlay.classList.add('open');

  // Add blinking cursor element
  var cursor = document.createElement('span');
  cursor.id = 'crtCursor';
  body.appendChild(cursor);

  var chars  = text.split('');
  var i      = 0;
  var DELAY  = 28; // ms per character

  crtInterval = setInterval(function() {
    if (i >= chars.length) {
      clearInterval(crtInterval);
      crtInterval = null;
      crtTyping   = false;
      cursor.remove();
      footer.classList.add('visible');
      return;
    }
    // Insert character before cursor
    var ch = chars[i++];
    var node = document.createTextNode(ch);
    body.insertBefore(node, cursor);
    // Auto-scroll
    body.scrollTop = body.scrollHeight;
  }, DELAY);
}

window.crtSkip = function() {
  // Instantly show full text
  if (crtInterval) clearInterval(crtInterval);
  crtInterval = null;
  crtTyping   = false;
  crtSkipped  = true;
  var body   = document.getElementById('crtBody');
  var footer = document.getElementById('crtFooter');
  // Rebuild with full text (retrieve from last handout — reconstruct from body nodes)
  var full = body.innerText || body.textContent;
  // Remove cursor if present
  var cur = document.getElementById('crtCursor');
  if (cur) cur.remove();
  footer.classList.add('visible');
};

function crtClose() {
  document.getElementById('crtOverlay').classList.remove('open');
  document.getElementById('crtBody').innerHTML = '';
  document.getElementById('crtFooter').classList.remove('visible');
  if (crtInterval) { clearInterval(crtInterval); crtInterval = null; }
  crtTyping = false;
}

// Dismiss on any key press (after typing done)
document.addEventListener('keydown', function(e) {
  var overlay = document.getElementById('crtOverlay');
  if (!overlay || !overlay.classList.contains('open')) return;
  if (crtTyping) return;
  crtClose();
});
// Dismiss on click — wired up once after DOM ready
document.addEventListener('DOMContentLoaded', function() {
  var ov = document.getElementById('crtOverlay');
  if (ov) ov.addEventListener('click', function(e) {
    if (e.target.classList.contains('crt-skip-btn')) return;
    if (!crtTyping) crtClose();
  });
});

// ── END HANDOUT SYSTEM ────────────────────────────────────────────────────────
