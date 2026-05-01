import { ref, onValue, push, set } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ── MU/TH/UR 6000 — Loyalty Analysis Terminal ────────────────────────────────

const CFG          = window.APP_CONFIG || {};
const WORKER_URL   = CFG.mutherWorkerUrl   || '';
const WORKER_TOKEN = CFG.mutherWorkerToken || '';

let _bayId    = null;
let _ctx      = null;
let _messages = [];    // {role, text, ts} sorted by ts
let _unsubMsgs = null;
let _unsubGm   = null;
let _busy      = false;

// ── Helpers ───────────────────────────────────────────────────────────────────

const $  = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

// ── Public API ─────────────────────────────────────────────────────────────────

window.openMutherTerminal = function (bayId, ctx) {
  _bayId = bayId;
  _ctx   = ctx;
  _messages = [];

  const overlay = $('mutherOverlay');
  if (!overlay) return;

  overlay.classList.toggle('mt-is-gm', !!window.isGM);

  const sub = overlay.querySelector('.mt-subtitle');
  if (sub) sub.textContent =
    `UNIT: ${ctx.desig || '—'}  ·  CONTAINER: ${bayId}  ·  CLASS: ${ctx.cls || '—'}`;

  initGmPanel();
  overlay.style.display = 'flex';
  $('mtInput')?.focus();

  window._authReadyPromise.then(() => subscribeSession(bayId));
};

window.closeMutherTerminal = function () {
  $('mutherOverlay').style.display = 'none';
  if (_unsubMsgs) { _unsubMsgs(); _unsubMsgs = null; }
  if (_unsubGm)   { _unsubGm();   _unsubGm   = null; }
  _bayId    = null;
  _ctx      = null;
  _messages = [];
  _busy     = false;
};

// ── Firebase ──────────────────────────────────────────────────────────────────

function subscribeSession(bayId) {
  if (_unsubMsgs) { _unsubMsgs(); _unsubMsgs = null; }
  if (_unsubGm)   { _unsubGm();   _unsubGm   = null; }

  _unsubMsgs = onValue(ref(window.db, `muthur/sessions/${bayId}/messages`), snap => {
    const raw = snap.val() || {};
    _messages = Object.values(raw).sort((a, b) => a.ts - b.ts);
    renderLog(_messages);
  });

  if (window.isGM) {
    _unsubGm = onValue(ref(window.db, `muthur/gm/${bayId}`), snap => {
      const d = snap.val();
      if (d) updateGmPanel(d.trustScore, d.flags, d.assessment);
    });
  }
}

function writeMsg(bayId, role, text) {
  return push(ref(window.db, `muthur/sessions/${bayId}/messages`), {
    role, text, ts: Date.now(),
  });
}

function writeGmData(bayId, score, flags, assessment) {
  return set(ref(window.db, `muthur/gm/${bayId}`), { trustScore: score, flags, assessment });
}

// ── Render ─────────────────────────────────────────────────────────────────────

function renderLog(msgs) {
  const log = $('mtLog');
  if (!log) return;

  // Preserve loading indicator if present
  const loadingLine = log.querySelector('.mt-loading-line');

  log.innerHTML = '';
  appendLine(log, 'system', 'MU/TH/UR',
    `SESSION INITIATED  ·  UNIT: ${_ctx?.desig || '—'}  ·  CONTAINER: ${_bayId || '—'}`);

  msgs.forEach(m => {
    if (m.role === 'operator') appendLine(log, 'op', 'OPERATOR', m.text);
    else if (m.role === 'muthur') appendLine(log, 'mu', 'MU/TH/UR', m.text);
    else appendLine(log, 'system', 'SYS', m.text);
  });

  if (loadingLine) log.appendChild(loadingLine);
  log.scrollTop = log.scrollHeight;
}

function appendLine(container, cls, who, text) {
  const div = document.createElement('div');
  div.className = `mt-line mt-${cls}`;
  div.innerHTML =
    `<span class="mt-who">${who}</span>` +
    `<span class="mt-sep">›</span>` +
    `<span class="mt-text">${esc(text)}</span>`;
  container.appendChild(div);
}

function appendLoading() {
  const log = $('mtLog');
  if (!log) return;
  const div = document.createElement('div');
  div.className = 'mt-line mt-mu mt-loading-line';
  div.innerHTML =
    `<span class="mt-who">MU/TH/UR</span>` +
    `<span class="mt-sep">›</span>` +
    `<span class="mt-text">PROCESSING<span class="mt-cursor">_</span></span>`;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function removeLoading() {
  $('mtLog')?.querySelector('.mt-loading-line')?.remove();
}

// ── GM Panel ──────────────────────────────────────────────────────────────────

function initGmPanel() {
  const val = $('mtTrustVal');
  const bar = $('mtTrustBar');
  const flg = $('mtFlagList');
  const ass = $('mtAssessment');
  if (val) { val.textContent = '—'; val.className = 'mt-score-val'; }
  if (bar) { bar.style.width = '0'; bar.className = 'mt-score-bar'; }
  if (flg) flg.innerHTML = `<span class="mt-no-flags">// AWAITING ANALYSIS</span>`;
  if (ass) ass.textContent = '';
}

function updateGmPanel(score, flags, assessment) {
  const val = $('mtTrustVal');
  const bar = $('mtTrustBar');
  const flg = $('mtFlagList');
  const ass = $('mtAssessment');

  let cls;
  if (score >= 85)      cls = 'mt-score-clear';
  else if (score >= 60) cls = 'mt-score-nominal';
  else if (score >= 35) cls = 'mt-score-warn';
  else                  cls = 'mt-score-critical';

  if (val) { val.textContent = score; val.className = `mt-score-val ${cls}`; }
  if (bar) { bar.style.width = `${score}%`; bar.className = `mt-score-bar ${cls}`; }
  if (flg) {
    flg.innerHTML = (flags?.length)
      ? flags.map(f => `<div class="mt-flag">${esc(f)}</div>`).join('')
      : `<span class="mt-no-flags">// NO FLAGS</span>`;
  }
  if (ass) ass.textContent = assessment || '';
}

// ── Send ──────────────────────────────────────────────────────────────────────

async function sendQuery() {
  const input = $('mtInput');
  const text  = input?.value.trim();
  if (!text || !_bayId || _busy) return;

  _busy = true;
  const btn = $('mtSendBtn');
  input.value = '';
  if (btn) btn.disabled = true;

  // Snapshot messages NOW before Firebase updates land
  const apiMessages = [
    ..._messages.map(m => ({
      role:    m.role === 'muthur' ? 'assistant' : 'user',
      content: m.text,
    })),
    { role: 'user', content: text },
  ];

  await window._authReadyPromise;
  await writeMsg(_bayId, 'operator', text);

  appendLoading();

  try {
    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'X-Worker-Token': WORKER_TOKEN,
      },
      body: JSON.stringify({
        messages: apiMessages,
        context: {
          desig: _ctx?.desig || '—',
          cls:   _ctx?.cls   || '—',
          bayId: _bayId,
          cond:  _ctx?.cond  || 'intact',
        },
      }),
    });

    if (!res.ok) throw new Error(`Worker responded ${res.status}`);
    const data = await res.json();
    removeLoading();

    await writeMsg(_bayId, 'muthur', data.response || 'NO RESPONSE RECEIVED.');

    if (data.trustScore !== undefined) {
      await writeGmData(_bayId, data.trustScore, data.flags || [], data.assessment || '');
    }
  } catch (err) {
    removeLoading();
    console.error('[MU/TH/UR] Worker error:', err);
    await writeMsg(_bayId, 'muthur', 'COMMUNICATION FAULT. RETRY QUERY.');
  }

  _busy = false;
  if (btn) btn.disabled = false;
  input?.focus();
}

// ── Event wiring ──────────────────────────────────────────────────────────────

$('mtSendBtn')?.addEventListener('click', sendQuery);

$('mtInput')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); sendQuery(); }
});

$('mtCloseBtn')?.addEventListener('click', window.closeMutherTerminal);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('mutherOverlay')?.style.display !== 'none') {
    window.closeMutherTerminal();
  }
});
