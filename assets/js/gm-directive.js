// ============================================================
// GM DIRECTIVE — private roleplay cue to a single operative.
// GM picks one online player + tone, types a short instruction;
// that player gets a short cinematic flash overlay.
// Separate from the heavier Transmission/CRT handout.
// Path: session/directive/{playerId} = { text, tone, ts, from }
// ============================================================

import { ref, set, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

var dirRoot = function (id) { return ref(window.db, 'session/directive/' + id); };

// playerId matches the heartbeat id in map-core.js (set(ref(db,'users/'+myId)))
function nameToId(name) { return 'user_' + name.toUpperCase().replace(/[^A-Z0-9]/g, '_'); }

var gmdSelected = null;   // selected recipient name
var gmdTone     = 'whisper';

var GMD_PRESETS = [
  'Dir wird schwindlig.',
  'Du hörst ein Geräusch hinter dir.',
  'Ein kalter Schauer läuft über deinen Rücken.',
  'Dein Herz beginnt zu rasen.',
  'Du riechst etwas Verbranntes.',
  'Für einen Moment verschwimmt deine Sicht.'
];

// ── GM: open compose panel ────────────────────────────────────
window.openGMDirective = function () {
  if (!window.isGM) return;
  var panel = document.getElementById('gmDirectivePanel');
  panel.classList.add('open');
  gmdSelected = null;
  gmdSetTone('whisper');
  gmdBuildPresets();
  gmdPopulatePlayers();
  gmdUpdateSend();
  document.getElementById('gmdText').value = '';
  document.getElementById('gmdText').focus();
};

window.closeGMDirective = function () {
  document.getElementById('gmDirectivePanel').classList.remove('open');
};

function gmdPopulatePlayers() {
  var list = document.getElementById('gmdPlayerList');
  list.innerHTML = '';
  var players = window._onlinePlayers || new Set();
  var any = false;
  players.forEach(function (name) {
    if (name === window.myName) return; // never target the GM themselves
    any = true;
    var chip = document.createElement('div');
    chip.className = 'gmd-player-chip';
    chip.textContent = name;
    chip.onclick = function () {
      gmdSelected = name;
      list.querySelectorAll('.gmd-player-chip').forEach(function (c) { c.classList.remove('selected'); });
      chip.classList.add('selected');
      gmdUpdateSend();
    };
    list.appendChild(chip);
  });
  if (!any) {
    list.innerHTML = '<span class="gmd-empty">— KEINE OPERATIVEN ONLINE —</span>';
  }
}

window.gmdSetTone = function (tone) {
  gmdTone = tone;
  document.querySelectorAll('#gmDirectivePanel .gmd-tone').forEach(function (t) {
    t.classList.toggle('active', t.dataset.tone === tone);
  });
};
function gmdSetTone(t) { window.gmdSetTone(t); }

function gmdBuildPresets() {
  var wrap = document.getElementById('gmdPresets');
  if (wrap.childElementCount) return; // build once
  GMD_PRESETS.forEach(function (p) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'gmd-preset';
    b.textContent = p;
    b.onclick = function () {
      document.getElementById('gmdText').value = p;
      gmdUpdateSend();
      document.getElementById('gmdText').focus();
    };
    wrap.appendChild(b);
  });
}

function gmdUpdateSend() {
  var btn = document.getElementById('gmdSendBtn');
  var hasText = document.getElementById('gmdText').value.trim().length > 0;
  btn.disabled = !(gmdSelected && hasText);
}

window.sendGMDirective = function () {
  if (!window.isGM) return;
  var text = document.getElementById('gmdText').value.trim();
  if (!gmdSelected || !text) return;

  var payload = { text: text, tone: gmdTone, ts: Date.now(), from: window.myName };
  set(dirRoot(nameToId(gmdSelected)), payload).then(function () {
    closeGMDirective();
  }).catch(function (err) {
    console.error('[gm-directive] send failed:', err);
  });
};

// ── Player: listen for own directives ─────────────────────────
var gmdLastTs = 0;
window.startDirectiveWatcher = function () {
  if (!window.myId) return;
  gmdLastTs = Date.now(); // ignore anything stored before this login
  onValue(dirRoot(window.myId), function (snap) {
    var d = snap.val();
    if (!d || !d.ts || d.ts <= gmdLastTs) return;
    gmdLastTs = d.ts;
    if (window.isGM) return; // GM doesn't flash their own sends
    gmdShow(d.text, d.tone || 'whisper');
  });
};

// ── Player-side flash overlay ─────────────────────────────────
var gmdTimer = null;
var GMD_ICON = { whisper: '✉', body: '☣', danger: '⚠' };
var GMD_LABEL = { whisper: 'PRIVATE DIRECTIVE', body: 'SOMATIC ALERT', danger: 'PRIORITY DIRECTIVE' };
var GMD_DUR = 7000;

function gmdShow(text, tone) {
  var ov = document.getElementById('gmdOverlay');
  if (!ov) return;
  if (gmdTimer) { clearTimeout(gmdTimer); gmdTimer = null; }

  ov.classList.remove('tone-body', 'tone-danger');
  if (tone === 'body') ov.classList.add('tone-body');
  else if (tone === 'danger') ov.classList.add('tone-danger');

  document.getElementById('gmdOvLabel').textContent = GMD_LABEL[tone] || GMD_LABEL.whisper;
  document.getElementById('gmdOvIcon').textContent = GMD_ICON[tone] || GMD_ICON.whisper;
  document.getElementById('gmdOvText').textContent = text;

  // restart card + bar animations (so back-to-back directives replay)
  var card = document.getElementById('gmdOvCard');
  card.classList.remove('closing');
  card.style.animation = 'none';
  void card.offsetWidth;
  card.style.animation = '';
  var bar = document.getElementById('gmdOvBar');
  bar.style.setProperty('--gmd-dur', (GMD_DUR / 1000) + 's');
  bar.style.animation = 'none';
  void bar.offsetWidth;
  bar.style.animation = '';

  ov.classList.add('open');
  gmdTimer = setTimeout(gmdDismiss, GMD_DUR);
}

function gmdDismiss() {
  if (gmdTimer) { clearTimeout(gmdTimer); gmdTimer = null; }
  var ov = document.getElementById('gmdOverlay');
  var card = document.getElementById('gmdOvCard');
  if (!ov || !ov.classList.contains('open')) return;
  card.classList.add('closing');
  setTimeout(function () { ov.classList.remove('open'); card.classList.remove('closing'); }, 400);
}
window.gmdDismiss = gmdDismiss;

// click anywhere on the overlay or any key dismisses early
document.addEventListener('DOMContentLoaded', function () {
  var ov = document.getElementById('gmdOverlay');
  if (ov) ov.addEventListener('click', gmdDismiss);
  var input = document.getElementById('gmdText');
  if (input) input.addEventListener('input', gmdUpdateSend);
});
document.addEventListener('keydown', function (e) {
  var ov = document.getElementById('gmdOverlay');
  if (ov && ov.classList.contains('open')) { gmdDismiss(); return; }
  // GM panel: Ctrl/Cmd+Enter sends
  var panel = document.getElementById('gmDirectivePanel');
  if (panel && panel.classList.contains('open') && (e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    window.sendGMDirective();
  }
});
