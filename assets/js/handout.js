import { ref, set, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ── HANDOUT SYSTEM ───────────────────────────────────────────────────────────
var handoutRef  = ref(window.db, 'session/handout');
var hoLastTs    = 0;   // ignore handouts already seen before this session
var crtTyping   = false;
var crtRAF      = null;
var crtFullText = '';

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
// Performance: one Text node grown via nodeValue (not N text nodes), and
// rAF-driven typing so updates land on vsync. Scroll forced once per frame.
function crtShow(text) {
  crtFullText = text;
  var overlay  = document.getElementById('crtOverlay');
  var body     = document.getElementById('crtBody');
  var footer   = document.getElementById('crtFooter');
  var skipBtn  = document.getElementById('crtSkipBtn');
  var divider2 = document.getElementById('crtDivider2');
  var led      = document.getElementById('crtLed');
  var glass    = document.getElementById('crtGlass');

  body.innerHTML = '';
  footer.classList.remove('visible');
  divider2.style.opacity = '0';
  skipBtn.classList.remove('hidden');

  var copyBtn = document.getElementById('crtCopyBtn');
  copyBtn.textContent = 'COPY';
  copyBtn.classList.remove('copied');

  led.className = 'crt-led';

  // Power-on animation (remove → reflow → add)
  glass.classList.remove('power-on');
  void glass.offsetWidth;
  glass.classList.add('power-on');

  crtTyping = true;
  if (crtRAF) cancelAnimationFrame(crtRAF);

  overlay.classList.add('open');

  // Single text node grown in place — much cheaper than insertBefore-per-char
  var textNode = document.createTextNode('');
  body.appendChild(textNode);

  // Blinking block cursor follows the text node
  var cursor = document.createElement('span');
  cursor.id = 'crtCursor';
  body.appendChild(cursor);

  var i      = 0;
  var len    = text.length;
  var CPS    = 38; // chars per second (~26ms/char) — multi-char per frame at 60fps
  var t0     = null;

  function step(ts) {
    if (t0 === null) t0 = ts;
    var elapsed = (ts - t0) / 1000;
    var target  = Math.min(len, Math.floor(elapsed * CPS));
    if (target > i) {
      // Append the chunk we're behind on as ONE nodeValue update
      textNode.nodeValue += text.slice(i, target);
      i = target;
      body.scrollTop = body.scrollHeight; // single forced layout per frame
    }
    if (i >= len) {
      crtRAF    = null;
      crtTyping = false;
      cursor.remove();
      skipBtn.classList.add('hidden');
      divider2.style.opacity = '0.45';
      footer.classList.add('visible');
      led.className = 'crt-led steady';
      return;
    }
    crtRAF = requestAnimationFrame(step);
  }
  crtRAF = requestAnimationFrame(step);
}

window.crtSkip = function() {
  if (crtRAF) cancelAnimationFrame(crtRAF);
  crtRAF    = null;
  crtTyping = false;

  var body     = document.getElementById('crtBody');
  var footer   = document.getElementById('crtFooter');
  var skipBtn  = document.getElementById('crtSkipBtn');
  var divider2 = document.getElementById('crtDivider2');
  var led      = document.getElementById('crtLed');

  var cur = document.getElementById('crtCursor');
  if (cur) cur.remove();

  body.textContent = crtFullText;
  body.scrollTop   = body.scrollHeight;

  skipBtn.classList.add('hidden');
  divider2.style.opacity = '0.45';
  footer.classList.add('visible');
  led.className = 'crt-led steady';
};

window.crtCopy = function() {
  var btn = document.getElementById('crtCopyBtn');
  var done = function() {
    btn.textContent = 'COPIED';
    btn.classList.add('copied');
    setTimeout(function() {
      btn.textContent = 'COPY';
      btn.classList.remove('copied');
    }, 1600);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(crtFullText).then(done).catch(function() {
      var ta = document.createElement('textarea');
      ta.value = crtFullText;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch(e) {}
      document.body.removeChild(ta);
      done();
    });
  } else {
    var ta = document.createElement('textarea');
    ta.value = crtFullText;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch(e) {}
    document.body.removeChild(ta);
    done();
  }
};

window.crtClose = function() {
  document.getElementById('crtOverlay').classList.remove('open');
  document.getElementById('crtBody').innerHTML = '';
  document.getElementById('crtFooter').classList.remove('visible');
  document.getElementById('crtSkipBtn').classList.remove('hidden');
  document.getElementById('crtDivider2').style.opacity = '0';
  document.getElementById('crtLed').className = 'crt-led';
  if (crtRAF) { cancelAnimationFrame(crtRAF); crtRAF = null; }
  crtTyping = false;
};

// Keydown: Escape skips during typing; any key closes when done
document.addEventListener('keydown', function(e) {
  var overlay = document.getElementById('crtOverlay');
  if (!overlay || !overlay.classList.contains('open')) return;
  if (crtTyping) {
    if (e.key === 'Escape') window.crtSkip();
    return;
  }
  window.crtClose();
});

// Backdrop click dismisses (only when typing done)
document.addEventListener('DOMContentLoaded', function() {
  var ov = document.getElementById('crtOverlay');
  if (ov) ov.addEventListener('click', function(e) {
    if (e.target !== this) return;
    if (!crtTyping) window.crtClose();
  });
});

// ── END HANDOUT SYSTEM ────────────────────────────────────────────────────────
