import { ref, onValue, push, set, get } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ── MU/TH/UR 6000 — Loyalty Analysis Terminal ────────────────────────────────

const CFG          = window.APP_CONFIG || {};
const WORKER_URL   = CFG.mutherWorkerUrl   || 'https://muthur-proxy.alienmuthur.workers.dev';
const WORKER_TOKEN = CFG.mutherWorkerToken || 'Alien_muthur';

const PROTOCOL_STEPS = [
  { key: 'versiegelung',   label: 'VERSIEGELUNG'   },
  { key: 'datenfragment',  label: 'DATENFRAGMENT'  },
  { key: 'kopierstatus',   label: 'KOPIER-STATUS'  },
  { key: 'komplikationen', label: 'KOMPLIKATIONEN' },
  { key: 'sonstiges',      label: 'SONSTIGES'      },
];

const PROTOCOL_QUESTIONS = [
  'Wurde der Android vollständig versiegelt?',
  'Ist das Datenfragment unbeschädigt und vollständig?',
  'Ist das Datenfragment ungelesen und wurde es nicht kopiert?',
  'Gab es Komplikationen während der Einsiegelung?',
  'Sonstige Angaben zur Einheit oder zur Übergabe?',
];

let _bayId         = null;
let _ctx           = null;
let _messages      = [];
let _unsubMsgs     = null;
let _unsubGm       = null;
let _unsubCaptain  = null;
let _unsubProtocol = null;
let _busy          = false;
let _directive     = '';
let _captainName   = '';
let _protocolStep  = 0;
let _protocolItems = {};

// ── Helpers ───────────────────────────────────────────────────────────────────

const $   = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

// ── Public API ────────────────────────────────────────────────────────────────

window.openMutherTerminal = function (bayId, ctx) {
  _bayId    = bayId;
  _ctx      = ctx;
  _messages = [];

  const overlay = $('mutherOverlay');
  if (!overlay) return;

  overlay.classList.toggle('mt-is-gm', !!window.isGM);

  const sub = overlay.querySelector('.mt-subtitle');
  if (sub) sub.textContent =
    `EINHEIT: ${ctx.desig || '—'}  ·  CONTAINER: ${bayId}  ·  KLASSE: ${ctx.cls || '—'}`;

  initPanel();
  overlay.style.display = 'flex';
  $('mtInput')?.focus();

  window._authReadyPromise.then(() => subscribeSession(bayId));
};

window.closeMutherTerminal = function () {
  $('mutherOverlay').style.display = 'none';
  if (_unsubMsgs)     { _unsubMsgs();     _unsubMsgs     = null; }
  if (_unsubGm)       { _unsubGm();       _unsubGm       = null; }
  if (_unsubCaptain)  { _unsubCaptain();  _unsubCaptain  = null; }
  if (_unsubProtocol) { _unsubProtocol(); _unsubProtocol = null; }
  _bayId         = null;
  _ctx           = null;
  _messages      = [];
  _busy          = false;
  _directive     = '';
  _captainName   = '';
  _protocolStep  = 0;
  _protocolItems = {};
};

// ── Player confirm overlay ────────────────────────────────────────────────────

let _confirmBayId = null;
let _confirmCtx   = null;

window.openMutherConfirm = function (bayId, ctx) {
  if (!bayId || !ctx) return;
  _confirmBayId = bayId;
  _confirmCtx   = ctx;
  const unitEl = $('mtConfirmUnit');
  if (unitEl) unitEl.textContent =
    `${ctx.desig || 'UNIT'}  ·  KLASSE: ${ctx.cls || '—'}  ·  BAY ${bayId}`;
  $('mtConfirmOverlay').style.display = 'flex';
};

function closeMutherConfirm() {
  $('mtConfirmOverlay').style.display = 'none';
  _confirmBayId = null;
  _confirmCtx   = null;
}

// ── Firebase ──────────────────────────────────────────────────────────────────

function subscribeSession(bayId) {
  if (_unsubMsgs)     { _unsubMsgs();     _unsubMsgs     = null; }
  if (_unsubGm)       { _unsubGm();       _unsubGm       = null; }
  if (_unsubCaptain)  { _unsubCaptain();  _unsubCaptain  = null; }
  if (_unsubProtocol) { _unsubProtocol(); _unsubProtocol = null; }

  _unsubMsgs = onValue(ref(window.db, `muthur/sessions/${bayId}/messages`), snap => {
    const raw = snap.val() || {};
    _messages = Object.values(raw).sort((a, b) => a.ts - b.ts);
    renderLog(_messages);
  });

  _unsubCaptain = onValue(ref(window.db, `muthur/sessions/${bayId}/captainName`), snap => {
    _captainName = (snap.val() || '').toUpperCase();
    updateInputVisibility();
    if (window.isGM) {
      const inp = $('mtCaptainInput');
      if (inp && document.activeElement !== inp) inp.value = _captainName;
    }
  });

  _unsubProtocol = onValue(ref(window.db, `muthur/sessions/${bayId}/protocolData`), snap => {
    const d = snap.val() || {};
    _protocolStep  = d.step  || 0;
    _protocolItems = d.items || {};
    updateProtocolUI();
  });

  // Einmalig: Session initialisieren wenn neu
  get(ref(window.db, `muthur/sessions/${bayId}/initialized`)).then(snap => {
    if (!snap.exists()) {
      set(ref(window.db, `muthur/sessions/${bayId}/initialized`), true);
      writeInitMessage(bayId);
    }
  });

  if (window.isGM) {
    _unsubGm = onValue(ref(window.db, `muthur/gm/${bayId}`), snap => {
      const d = snap.val();
      if (d) {
        updateGmPanel(d.trustScore, d.flags, d.assessment);
        _directive = d.directive || '';
        const ta = $('mtDirective');
        if (ta && document.activeElement !== ta) ta.value = _directive;
        updateDirectiveUI();
      }
    });
  }
}

function writeInitMessage(bayId) {
  const text =
`SCHNITTSTELLE AKTIVIERT
EINHEIT: ${_ctx?.desig || '—'}  ·  CONTAINER: ${bayId}  ·  KLASSE: ${_ctx?.cls || '—'}

WEYLAND-YUTANI CORP. — LOYALITÄTSANALYSE v6.0
STANDARDVERHÖR-SEQUENZ INITIIERT.
─────────────────────────────────────────────────
FRAGE 1/5 — Wurde der Android vollständig versiegelt?`;

  push(ref(window.db, `muthur/sessions/${bayId}/messages`), {
    role: 'muthur', text, ts: Date.now(),
  });
  set(ref(window.db, `muthur/sessions/${bayId}/protocolData`), {
    step: 1, items: {},
  });
}

function writeMsg(bayId, role, text) {
  return push(ref(window.db, `muthur/sessions/${bayId}/messages`), {
    role, text, ts: Date.now(),
  });
}

function writeGmData(bayId, score, flags, assessment) {
  return set(ref(window.db, `muthur/gm/${bayId}`), {
    trustScore: score, flags, assessment, directive: _directive,
  });
}

async function saveDirective() {
  if (!_bayId) return;
  const text = $('mtDirective')?.value.trim() || '';
  _directive = text;
  await set(ref(window.db, `muthur/gm/${_bayId}/directive`), text);
  updateDirectiveUI();
}

function updateDirectiveUI() {
  const active = $('mtDirectiveActive');
  if (active) active.style.display = _directive ? 'block' : 'none';
}

function updateInputVisibility() {
  const row = $('mtInput')?.closest('.mt-input-row');
  if (!row) return;
  const canWrite = window.isGM || (_captainName && window.myName === _captainName);
  row.style.display = canWrite ? 'flex' : 'none';
}

async function sendGmQuestion() {
  console.log('[MU/TH/UR] sendGmQuestion called, _bayId=', _bayId);
  if (!_bayId) return;
  const ta   = $('mtGmAskInput');
  const text = ta?.value.trim();
  if (!text) return;
  ta.value = '';
  try {
    await window._authReadyPromise;
    await push(ref(window.db, `muthur/sessions/${_bayId}/messages`), {
      role: 'muthur', text, ts: Date.now(),
    });
  } catch (err) {
    console.error('[MU/TH/UR] sendGmQuestion error:', err);
    if (ta) ta.value = text;
  }
}

async function saveCaptain() {
  if (!_bayId) return;
  const name = ($('mtCaptainInput')?.value.trim() || '').toUpperCase();
  await set(ref(window.db, `muthur/sessions/${_bayId}/captainName`), name);
}

// ── Protocol UI ───────────────────────────────────────────────────────────────

function updateProtocolUI() {
  const list = $('mtProtocolList');
  if (!list) return;

  list.innerHTML = PROTOCOL_STEPS.map((step, i) => {
    const item       = _protocolItems[step.key];
    const status     = item?.status    || 'AUSSTEHEND';
    const suspicious = item?.suspicious || false;
    const isCurrent  = _protocolStep > 0 && i + 1 === _protocolStep;

    let cls = 'mt-proto-pending';
    if (item) {
      if      (status === 'BESTÄTIGT')                          cls = suspicious ? 'mt-proto-warn' : 'mt-proto-ok';
      else if (status === 'FRAGLICH')                           cls = 'mt-proto-warn';
      else if (status === 'ANOMALIE' || status === 'VERWEIGERT') cls = 'mt-proto-critical';
    }

    return `<div class="mt-proto-item${isCurrent ? ' mt-proto-active' : ''}">
  <div class="mt-proto-label">${i + 1}. ${step.label}</div>
  <div class="mt-proto-status ${cls}">${status}${suspicious ? ' ⚠' : ''}</div>
</div>`;
  }).join('');
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderLog(msgs) {
  const log = $('mtLog');
  if (!log) return;

  const loadingLine = log.querySelector('.mt-loading-line');
  log.innerHTML = '';

  msgs.forEach(m => {
    if      (m.role === 'operator') appendLine(log, 'op', 'OPERATOR', m.text);
    else if (m.role === 'muthur')   appendLine(log, 'mu', 'MU/TH/UR', m.text);
    else                            appendLine(log, 'system', 'SYS', m.text);
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
    `<span class="mt-text">VERARBEITUNG<span class="mt-cursor">_</span></span>`;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function removeLoading() {
  $('mtLog')?.querySelector('.mt-loading-line')?.remove();
}

// ── Panel init ────────────────────────────────────────────────────────────────

function initPanel() {
  const val = $('mtTrustVal');
  const bar = $('mtTrustBar');
  const flg = $('mtFlagList');
  const ass = $('mtAssessment');
  if (val) { val.textContent = '—'; val.className = 'mt-score-val'; }
  if (bar) { bar.style.width = '0'; bar.className = 'mt-score-bar'; }
  if (flg) flg.innerHTML = `<span class="mt-no-flags">// AUSSTEHEND</span>`;
  if (ass) ass.textContent = '';
  _protocolItems = {};
  _protocolStep  = 0;
  updateProtocolUI();
}

function updateGmPanel(score, flags, assessment) {
  const val = $('mtTrustVal');
  const bar = $('mtTrustBar');
  const flg = $('mtFlagList');
  const ass = $('mtAssessment');

  let cls;
  if      (score >= 85) cls = 'mt-score-clear';
  else if (score >= 60) cls = 'mt-score-nominal';
  else if (score >= 35) cls = 'mt-score-warn';
  else                  cls = 'mt-score-critical';

  if (val) { val.textContent = score; val.className = `mt-score-val ${cls}`; }
  if (bar) { bar.style.width = `${score}%`; bar.className = `mt-score-bar ${cls}`; }
  if (flg) {
    flg.innerHTML = flags?.length
      ? flags.map(f => `<div class="mt-flag">${esc(f)}</div>`).join('')
      : `<span class="mt-no-flags">// KEINE FLAGS</span>`;
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

  const apiMessages = [
    ..._messages.map(m => ({
      role:    m.role === 'muthur' ? 'assistant' : 'user',
      content: m.text,
    })),
    { role: 'user', content: text },
  ];

  try {
    await window._authReadyPromise;
    await writeMsg(_bayId, 'operator', text);
    appendLoading();

    const sentDirective = _directive;
    if (sentDirective) {
      _directive = '';
      if ($('mtDirective')) $('mtDirective').value = '';
      await set(ref(window.db, `muthur/gm/${_bayId}/directive`), '');
      updateDirectiveUI();
    }

    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: {
        'Content-Type':   'application/json',
        'X-Worker-Token': WORKER_TOKEN,
      },
      body: JSON.stringify({
        messages:     apiMessages,
        directive:    sentDirective,
        protocolStep: _protocolStep,
        context: {
          desig: _ctx?.desig || '—',
          cls:   _ctx?.cls   || '—',
          bayId: _bayId,
          cond:  _ctx?.cond  || 'intact',
        },
      }),
    });

    if (!res.ok) throw new Error(`Worker ${res.status}`);
    const data = await res.json();
    removeLoading();

    await writeMsg(_bayId, 'muthur', data.response || 'KEINE ANTWORT EMPFANGEN.');

    // Protokoll-Schritt abschließen (Schritte 1–5)
    if (data.protocolStatus && _protocolStep >= 1 && _protocolStep <= 5) {
      const answeredStep = _protocolStep;
      const stepKey      = PROTOCOL_STEPS[answeredStep - 1].key;
      const newItems     = {
        ..._protocolItems,
        [stepKey]: { status: data.protocolStatus, suspicious: !!data.protocolSuspicious },
      };
      await set(ref(window.db, `muthur/sessions/${_bayId}/protocolData`), {
        step: answeredStep + 1, items: newItems,
      });
      // Nächste Frage automatisch als MU/TH/UR-Nachricht injizieren
      if (answeredStep < 5) {
        await push(ref(window.db, `muthur/sessions/${_bayId}/messages`), {
          role: 'muthur',
          text: `FRAGE ${answeredStep + 1}/5 — ${PROTOCOL_QUESTIONS[answeredStep]}`,
          ts:   Date.now() + 1,
        });
      }
    }

    if (data.trustScore !== undefined) {
      await writeGmData(_bayId, data.trustScore, data.flags || [], data.assessment || '');
    }
  } catch (err) {
    removeLoading();
    console.error('[MU/TH/UR]', err);
    await writeMsg(_bayId, 'muthur', 'KOMMUNIKATIONSFEHLER. ANFRAGE WIEDERHOLEN.');
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
$('mtDirectiveBtn')?.addEventListener('click', saveDirective);
$('mtGmAskBtn')?.addEventListener('click', sendGmQuestion);
$('mtGmAskInput')?.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendGmQuestion(); }
});
$('mtCaptainBtn')?.addEventListener('click', saveCaptain);
$('mtCaptainInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') saveCaptain(); });

$('mtConfirmYes')?.addEventListener('click', () => {
  const bayId = _confirmBayId;
  const ctx   = _confirmCtx;
  closeMutherConfirm();
  window.openMutherTerminal(bayId, ctx);
});
$('mtConfirmNo')?.addEventListener('click', closeMutherConfirm);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if ($('mutherOverlay')?.style.display    !== 'none') { window.closeMutherTerminal(); return; }
    if ($('mtConfirmOverlay')?.style.display !== 'none') { closeMutherConfirm();         return; }
  }
});
