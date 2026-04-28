// ============================================================
// PASSWORD GATE & LOGIN
// SHA-256 hashes of player + GM passwords.
// Inline defaults work on GitHub Pages; config.js can override locally.
// Loads after firebase-init.js (relies on window.db, window._authReadyPromise).
// ============================================================

import { ref, set, get, remove } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const CFG = window.APP_CONFIG || {};
const PASSWORD_HASH    = CFG.playerPasswordHash || '1fb565c514350bd302b6311e93127aa2720342b57851517e0cb6fbcb637800c2';
const GM_PASSWORD_HASH = CFG.gmPasswordHash     || '7cde34385c69f449cfd4e43c3237ab91900108005e17796fe61b4c001cd9633d';
window.GM_PASSWORD_HASH = GM_PASSWORD_HASH;

async function sha256Hex(str) {
  const buf  = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}
window.sha256Hex = sha256Hex;

let isGM = false;
window.isGM = false;

// Assign a deterministic color from a callsign string
function colorFromName(name) {
  const palette = [
    '#00e5ff','#ff4400','#ffcc00','#44ff88',
    '#ff44cc','#cc88ff','#ff8800','#00ffaa',
    '#ff6688','#88ccff','#aaff44','#ff99cc'
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}
window.colorFromName = colorFromName;

window.checkPassword = async function() {
  const pwInput   = document.getElementById('pwInput');
  const unInput   = document.getElementById('pwUsername');
  const err       = document.getElementById('pwError');
  const btn       = document.querySelector('.pw-btn');
  const username  = unInput.value.trim();

  if (!username) {
    err.textContent = 'ENTER YOUR CALLSIGN';
    unInput.classList.add('error');
    setTimeout(() => { unInput.classList.remove('error'); err.textContent=''; }, 1500);
    return;
  }
  const inputHash = await sha256Hex(pwInput.value);
  if (inputHash !== PASSWORD_HASH && inputHash !== GM_PASSWORD_HASH) {
    err.textContent = 'ACCESS DENIED — INVALID CREDENTIALS';
    pwInput.classList.add('error');
    pwInput.value = '';
    setTimeout(() => { pwInput.classList.remove('error'); err.textContent=''; }, 1500);
    return;
  }
  isGM = (inputHash === GM_PASSWORD_HASH);
  window.isGM = isGM;

  // Non-GM trying to log in while session is closed
  if (!isGM && window.sessionIsOpen === false) {
    err.textContent = 'SESSION OFFLINE — AWAIT GM';
    pwInput.classList.add('error');
    pwInput.value = '';
    setTimeout(() => { pwInput.classList.remove('error'); err.textContent=''; }, 2000);
    return;
  }

  const nameUpper = username.toUpperCase();

  // GMs skip the allowedUsers check
  if (isGM) {
    _doLogin(nameUpper);
    return;
  }

  // Players: verify name exists in Firebase allowedUsers
  if (btn) { btn.disabled = true; btn.textContent = 'VERIFYING...'; }
  err.textContent = '';

  window._authReadyPromise.then(() => {
    get(ref(window.db, 'allowedUsers')).then(snap => {
      const allowed = snap.val() || {};
      // allowedUsers can be { NAME: true } or { NAME: { ... } } — just check key existence
      const names = Object.keys(allowed).map(n => n.toUpperCase());
      if (!names.includes(nameUpper)) {
        err.textContent = 'CALLSIGN NOT RECOGNISED — CONTACT GM';
        pwInput.classList.add('error');
        unInput.classList.add('error');
        pwInput.value = '';
        if (btn) { btn.disabled = false; btn.textContent = 'Access Map'; }
        setTimeout(() => {
          pwInput.classList.remove('error');
          unInput.classList.remove('error');
          err.textContent = '';
        }, 2500);
        return;
      }
      if (btn) { btn.disabled = false; btn.textContent = 'Access Map'; }
      _doLogin(nameUpper);
    }).catch(() => {
      // Firebase read failed (not authenticated yet?) — block login
      err.textContent = 'AUTHENTICATION ERROR — TRY AGAIN';
      if (btn) { btn.disabled = false; btn.textContent = 'Access Map'; }
    });
  });
};

function _doLogin(nameUpper) {
  // GM opening a closed session — auto-open it with a timestamp
  if (isGM) {
    window._authReadyPromise.then(() => remove(ref(window.db, 'wuerfelduerfel')));
  }
  if (isGM && !window.sessionIsOpen) {
    set(window.sessionRef, true);
    set(ref(window.db, 'session/openedAt'), Date.now());
  }

  // Set identity — color is deterministic from name so it's always the same
  const myName = nameUpper;
  window.myName = myName;
  window.myId   = 'user_' + myName.replace(/[^A-Z0-9]/g,'_');
  window.selectedColor = colorFromName(myName);

  // Persist in localStorage so they don't have to retype
  try { localStorage.setItem('alien-map-username', myName); } catch(e) {}

  document.getElementById('myName').textContent  = myName + (isGM ? ' 🎖' : '');
  document.getElementById('myDot').style.background = window.selectedColor;
  document.querySelectorAll('.color-swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.color === window.selectedColor);
  });

  const screen = document.getElementById('passwordScreen');
  const scans  = document.getElementById('pwScanlines');
  screen.style.transition = 'opacity 0.6s ease';
  screen.style.opacity = '0';
  window._authReadyPromise.then(() => {
    setTimeout(() => {
      screen.remove();
      scans.remove();
      window._loggedIn = true;
      window.heartbeat?.();
      window.renderDate?.();
      window.applySessionGateAfterLogin?.();
      window.updateSessionBtn?.();
      window.bvInit?.();
      window.startGlobalIbWatcher?.();
      window.startHandoutWatcher?.();
      window.startSupplyPanel?.();
      window.startRationsPanel?.();
      window.startXPChestWatcher?.();
      window.startAudioWatcher?.();
    }, 300);
  });
}

// Pre-fill username if returning user
try {
  const saved = localStorage.getItem('alien-map-username');
  if (saved) document.getElementById('pwUsername').value = saved;
} catch(e) {}

// Focus username input on load
document.getElementById('pwUsername').focus();

// ── GM BROADCAST — render stored memories on login screen ─────
const BC_PALETTE = [
  { c: '#6e6650', min: 0.45, max: 0.65 },
  { c: '#ff9a3c', min: 0.25, max: 0.40 },
  { c: '#7fb069', min: 0.25, max: 0.38 },
  { c: '#b9a98c', min: 0.22, max: 0.35 },
  { c: '#c64225', min: 0.22, max: 0.35 },
];

function bcRand(a, b) { return a + Math.random() * (b - a); }

function renderBroadcastMessages(msgs) {
  const layer = document.getElementById('gm-msg-layer');
  if (!layer) return;
  layer.innerHTML = '';

  const W = window.innerWidth, H = window.innerHeight;
  // Login form exclusion zone (center column)
  const cx1 = W * 0.5 - 260, cx2 = W * 0.5 + 260;
  const cy1 = H * 0.06,      cy2 = H * 0.70;

  // Estimated dimensions for 13px Share Tech Mono + letter-spacing:2px
  const CHAR_W = 9.5, MSG_H = 20, PAD = 28, MARGIN = 18;
  const placed = [];

  function canPlace(x, y, w) {
    // Reject if inside center exclusion zone
    if (x < cx2 + 30 && x + w > cx1 - 30 && y < cy2 + 16 && y + MSG_H > cy1 - 16) return false;
    // Reject if overlaps an already-placed message
    for (const p of placed) {
      if (x < p.x + p.w + PAD && x + w + PAD > p.x &&
          y < p.y + MSG_H + PAD && y + MSG_H + PAD > p.y) return false;
    }
    return true;
  }

  msgs.forEach((msg, i) => {
    if (!msg.trim()) return;
    const el = document.createElement('span');
    el.className = 'gm-msg';
    el.textContent = msg.trim();

    const pal     = BC_PALETTE[i % BC_PALETTE.length];
    const opacity = bcRand(pal.min, pal.max).toFixed(2);
    const rot     = bcRand(-8, 8).toFixed(1);
    const delay   = (i * 0.5 + bcRand(0.2, 0.7)).toFixed(2);
    const estW    = msg.trim().length * CHAR_W;

    let x, y, ok = false;
    for (let t = 0; t < 200; t++) {
      x = bcRand(MARGIN, Math.max(MARGIN, W - estW - MARGIN));
      y = bcRand(MARGIN, Math.max(MARGIN, H - MSG_H - MARGIN));
      if (canPlace(x, y, estW)) { ok = true; break; }
    }
    if (!ok) return; // skip message if no room found

    placed.push({ x, y, w: estW });
    el.style.left            = x + 'px';
    el.style.top             = y + 'px';
    el.style.color           = pal.c;
    el.style.transform       = `rotate(${rot}deg)`;
    el.style.transitionDelay = delay + 's';
    layer.appendChild(el);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => { el.style.opacity = opacity; })
    );
  });
}
window.renderBroadcastMessages = renderBroadcastMessages;

window._authReadyPromise.then(() => {
  get(ref(window.db, 'session/broadcast')).then(snap => {
    if (!snap.exists()) return;
    const data = snap.val();
    const msgs = (typeof data === 'object' && data !== null)
      ? Object.values(data).filter(s => s && s.trim())
      : [];
    renderBroadcastMessages(msgs);
  }).catch(() => {});
});
