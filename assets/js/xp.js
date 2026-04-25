import { ref, set, remove, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ── XP Award System ───────────────────────────────────────────────
const XP_QUESTIONS = [
  { id:'participated', label:'Hast du an der Session teilgenommen?',                                                          xp: 1 },
  { id:'agenda',       label:'Hast du etwas riskiert oder geopfert, um bei deiner persönlichen Agenda weiterzukommen?',       xp: 1 },
  { id:'buddy',        label:'Hast du dein Leben riskiert für deinen Buddy PC?',                                              xp: 1 },
  { id:'rival',        label:'Hast du deinen Rivalen PC herausgefordert oder dich ihm widersetzt?',                           xp: 1 },
  { id:'panic',        label:'Hast du einen Panik Roll gemacht?',                                                             xp: 1 },
  { id:'event',        label:'Hast du ein gefährliches Event überstanden (gewalttätig oder nicht gewalttätig)?',              xp: 1 },
  { id:'discovery',    label:'Hast du eine große Entdeckung gemacht?',                                                        xp: 1 },
  { id:'outstanding',  label:'Hast du eine herausragende Leistung getätigt?',                                                 xp: 1 },
  { id:'money',        label:'Hast du Geld verdient?',                                                                        xp: 1 },
];

function _xpaGetPlayers() {
  const names = new Set();
  if (window._onlinePlayers) window._onlinePlayers.forEach(n => names.add(n));
  Object.keys(_csAllSheets).forEach(n => names.add(n));
  // Remove GM from list
  if (window.isGM && window.myName) names.delete(window.myName);
  return [...names].sort();
}

window.openXPAward = function() {
  if (!window.isGM) return;
  const overlay = document.getElementById('xpAwardOverlay');
  overlay.classList.add('open');
  _xpaRender();
};

window.closeXPAward = function() {
  document.getElementById('xpAwardOverlay').classList.remove('open');
};

function _xpaRender() {
  const players = _xpaGetPlayers();
  const wrap = document.getElementById('xpaTableWrap');
  if (!players.length) {
    wrap.innerHTML = '<p style="color:#44ff8877;text-align:center;letter-spacing:2px;margin-top:40px;">KEINE SPIELER ONLINE</p>';
    return;
  }

  let html = '<table class="xpa-table"><thead><tr>';
  html += '<th class="xpa-q-head">FRAGE</th>';
  players.forEach(p => { html += `<th>${p.toUpperCase()}</th>`; });
  html += '</tr></thead><tbody>';

  XP_QUESTIONS.forEach(q => {
    html += `<tr>`;
    html += `<td class="xpa-q-cell">${q.label}<span class="xpa-xp-badge">+${q.xp} XP</span></td>`;
    players.forEach(p => {
      html += `<td class="xpa-check-cell"><input type="checkbox" class="xpa-check" data-player="${p}" data-qid="${q.id}" data-xp="${q.xp}" onchange="_xpaUpdateTotals()"></td>`;
    });
    html += '</tr>';
  });

  // Totals row
  html += '<tr class="xpa-total-row"><td class="xpa-q-cell">TOTAL XP DIESE SESSION</td>';
  players.forEach(p => {
    html += `<td id="xpa-total-${p}" class="xpa-total-cell">0</td>`;
  });
  html += '</tr></tbody></table>';
  wrap.innerHTML = html;
}

window._xpaUpdateTotals = function() {
  const players = _xpaGetPlayers();
  const totals = {};
  players.forEach(p => { totals[p] = 0; });
  document.querySelectorAll('.xpa-check:checked').forEach(cb => {
    totals[cb.dataset.player] = (totals[cb.dataset.player] || 0) + parseInt(cb.dataset.xp);
  });
  players.forEach(p => {
    const el = document.getElementById('xpa-total-' + p);
    if (el) el.textContent = '+' + (totals[p] || 0);
  });
};

window.applyXPAward = function() {
  if (!window.isGM) return;
  const players = _xpaGetPlayers();
  const totals = {};
  players.forEach(p => { totals[p] = 0; });
  document.querySelectorAll('.xpa-check:checked').forEach(cb => {
    totals[cb.dataset.player] = (totals[cb.dataset.player] || 0) + parseInt(cb.dataset.xp);
  });

  players.forEach(p => {
    if (!totals[p]) return;
    const cur = parseInt(_csGet(_csAllSheets[p] || {}, 'xp')) || 0;
    window._csSave(p, 'xp', cur + totals[p]);
    // Write chest notification to Firebase for each player
    set(ref(window.db, 'session/xpChest/' + p), { amount: totals[p], ts: Date.now() });
  });

  // Flash confirmation
  const msg = document.getElementById('xpaAwardedMsg');
  msg.style.opacity = '1';
  setTimeout(() => { msg.style.opacity = '0'; }, 3000);

  // Uncheck all boxes
  document.querySelectorAll('.xpa-check').forEach(cb => { cb.checked = false; });
  _xpaUpdateTotals();
};

// ── XP Chest (player-side animation) ─────────────────────────────
window.startXPChestWatcher = function() {
  if (!window.myName) return;
  const chestRef = ref(window.db, 'session/xpChest/' + window.myName);
  onValue(chestRef, snap => {
    const data = snap.val();
    if (!data || !data.amount) return;
    // Only show if chest was written recently (within 60s) to avoid old triggers on reconnect
    if (Date.now() - (data.ts || 0) > 60000) return;
    xpcShow(data.amount);
  });
};

let _xpcAmount = 0;
let _xpcOpened = false;

window.xpcShow = function(amount) {
  _xpcAmount = amount;
  _xpcOpened = false;
  document.getElementById('xpcRecipient').textContent = window.myName || 'OPERATIVE';
  document.getElementById('xpcPrompt').style.display = '';
  document.getElementById('xpcScramble').style.display = 'none';
  document.getElementById('xpcScramble').classList.remove('done');
  document.getElementById('xpcXpLabel').style.display = 'none';
  document.getElementById('xpcCloseBtn').classList.remove('visible');
  document.getElementById('xpChestOverlay').classList.add('visible');
};

window.xpcOpen = function() {
  if (_xpcOpened) return;
  _xpcOpened = true;

  const prompt   = document.getElementById('xpcPrompt');
  const scramble = document.getElementById('xpcScramble');
  const label    = document.getElementById('xpcXpLabel');
  const closeBtn = document.getElementById('xpcCloseBtn');

  prompt.style.display = 'none';
  scramble.style.display = 'block';

  const finalText = '+' + _xpcAmount + ' XP';
  const glyphs = '!#$%&?@▓▒░█▄▀■□▪▫◆◇○●╬╪╫╩╦═╠║│─┼';
  const totalFrames = 32;
  let frame = 0;

  const timer = setInterval(() => {
    frame++;
    const revealCount = Math.floor((frame / totalFrames) * finalText.length);
    let display = finalText.slice(0, revealCount);
    for (let i = revealCount; i < finalText.length; i++) {
      display += finalText[i] === ' ' ? ' ' : glyphs[Math.floor(Math.random() * glyphs.length)];
    }
    scramble.textContent = display;

    if (frame >= totalFrames) {
      clearInterval(timer);
      scramble.textContent = finalText;
      scramble.classList.add('done');
      label.style.display = 'block';
      setTimeout(() => closeBtn.classList.add('visible'), 600);
    }
  }, 45);
};

window.xpcDismiss = function() {
  document.getElementById('xpChestOverlay').classList.remove('visible');
  if (window.myName) remove(ref(window.db, 'session/xpChest/' + window.myName));
};
