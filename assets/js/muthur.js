import { ref, onValue, push, set, get, update } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ── MU/TH/UR 6000 — Loyalty Analysis Terminal ────────────────────────────────

const CFG          = window.APP_CONFIG || {};
const WORKER_URL   = CFG.mutherWorkerUrl   || 'https://muthur-proxy.alienmuthur.workers.dev';
const WORKER_TOKEN = CFG.mutherWorkerToken || 'Alien_muthur';

const PROTOCOL_STEPS = [
  { key: 'versiegelung',   label: 'VERSIEGELUNG'   },
  { key: 'datenfragment',  label: 'DATENFRAGMENT'  },
  { key: 'kopierstatus',   label: 'KOPIER-STATUS'  },
  { key: 'komplikationen', label: 'KOMPLIKATIONEN' },
  { key: 'crew-loyalitaet', label: 'CREW-LOYALITÄT' },
];

const PROTOCOL_QUESTIONS = [
  'Wurde der Android vollständig versiegelt?',
  'Ist das Datenfragment unbeschädigt und vollständig?',
  'Ist das Datenfragment ungelesen und wurde es nicht kopiert?',
  'Gab es Komplikationen während der Einsiegelung?',
  'Wie verhält sich die Crew? Folgt sie Anweisungen und Befehlen, oder bestehen Anzeichen für Befehlsverweigerung oder Aufstand?',
];

let _bayId         = null;
let _ctx           = null;
let _messages      = [];
let _unsubMsgs     = null;
let _unsubGm       = null;
let _unsubCaptain  = null;
let _unsubProtocol = null;
let _unsubStatus   = null;
let _unsubTyping   = null;
let _busy          = false;
let _directive     = '';
let _captainName   = '';
let _protocolStep  = 0;
let _protocolItems = {};
let _stepFollowupCount = 0;   // wie viele Folgefragen wurden im aktuellen Schritt schon gestellt (max 2)
let _currentStatus  = 'active';
let _currentTyping  = null;   // {text, who} — wer gerade tippt (für alle sichtbar)
let _typingTimer    = null;   // throttle handle for outgoing writes
let _typingPending  = false;  // trailing-edge flag
let _iAmTyping      = false;  // bin ich selbst gerade der broadcaster?
let _selectedRating = 0;

// ── Helpers ───────────────────────────────────────────────────────────────────

const $   = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

// ── Public API ────────────────────────────────────────────────────────────────

window.openMutherTerminal = function (bayId, ctx, opts = {}) {
  const asSpectator = !!opts.spectator;
  _bayId    = bayId;
  _ctx      = ctx;
  _messages = [];

  const overlay = $('mutherOverlay');
  if (!overlay) return;

  overlay.classList.toggle('mt-is-gm', !!window.isGM);
  overlay.classList.toggle('mt-is-spectator', asSpectator);

  const sub = overlay.querySelector('.mt-subtitle');
  if (sub) sub.textContent =
    `EINHEIT: ${ctx.desig || '—'}  ·  CONTAINER: ${bayId}  ·  KLASSE: ${ctx.cls || '—'}`;

  initPanel();
  overlay.style.display = 'flex';
  if (!asSpectator) $('mtInput')?.focus();

  window._authReadyPromise.then(() => subscribeSession(bayId));

  if (!asSpectator && window._isBayDriver?.()) {
    window._writeBaySession?.('muthurOpen', { bay: bayId, ctx });
  }
};

function _localCloseMuthur() {
  const overlay = $('mutherOverlay');
  if (overlay) {
    overlay.style.display = 'none';
    overlay.classList.remove('mt-is-spectator');
  }
  if (_bayId && _iAmTyping) {
    set(ref(window.db, `muthur/sessions/${_bayId}/typing`), null).catch(() => {});
  }
  if (_unsubMsgs)     { _unsubMsgs();     _unsubMsgs     = null; }
  if (_unsubGm)       { _unsubGm();       _unsubGm       = null; }
  if (_unsubCaptain)  { _unsubCaptain();  _unsubCaptain  = null; }
  if (_unsubProtocol) { _unsubProtocol(); _unsubProtocol = null; }
  if (_unsubStatus)   { _unsubStatus();   _unsubStatus   = null; }
  if (_unsubTyping)   { _unsubTyping();   _unsubTyping   = null; }
  if (_typingTimer)   { clearTimeout(_typingTimer); _typingTimer = null; }
  _typingPending  = false;
  _iAmTyping      = false;
  _currentTyping  = null;
  _bayId          = null;
  _ctx            = null;
  _messages       = [];
  _busy           = false;
  _directive      = '';
  _captainName    = '';
  _protocolStep   = 0;
  _protocolItems  = {};
  _stepFollowupCount = 0;
  _currentStatus  = 'active';
  _selectedRating = 0;
}

window.closeMutherTerminal = function () {
  const wasDriver = !!window._isBayDriver?.();
  _localCloseMuthur();
  if (wasDriver) window._writeBaySession?.('muthurOpen', null);
};

// Called by android-bay session listener to mirror driver's open/close
window._bayMuthurSync = function (state) {
  const overlay = $('mutherOverlay');
  if (!overlay) return;
  const isOpen = overlay.style.display !== 'none';
  if (state && !isOpen) {
    window.openMutherTerminal(state.bay, state.ctx, { spectator: true });
  } else if (!state && isOpen) {
    _localCloseMuthur();
  }
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
  if (_unsubStatus)   { _unsubStatus();   _unsubStatus   = null; }
  if (_unsubTyping)   { _unsubTyping();   _unsubTyping   = null; }

  _unsubTyping = onValue(ref(window.db, `muthur/sessions/${bayId}/typing`), snap => {
    _currentTyping = snap.val() || null;
    console.log('[MU/TH/UR typing] received:', _currentTyping, 'myName=', window.myName, 'iAmTyping=', _iAmTyping);
    renderTyping(_currentTyping);
  });

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
    const d       = snap.val() || {};
    const newStep = d.step || 0;
    if (newStep !== _protocolStep) _stepFollowupCount = 0;  // neuer Schritt → Folgefrage-Zähler reset
    _protocolStep  = newStep;
    _protocolItems = d.items || {};
    updateProtocolUI();
  });

  _unsubStatus = onValue(ref(window.db, `muthur/sessions/${bayId}/status`), snap => {
    handleStatusChange(snap.val() || 'active');
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
        updateCrewMeasures(d.crewMeasures || null);
      }
    });
  }
}

function writeInitMessage(bayId) {
  const isFragment = _ctx?.cond === 'data-fragment';
  const text = isFragment
? `SCHNITTSTELLE AKTIVIERT
EINHEIT: ${_ctx?.desig || '—'}  ·  CONTAINER: ${bayId}  ·  KLASSE: ${_ctx?.cls || '—'}
STATUS: DATENFRAGMENT — EINHEIT NICHT GEBORGEN

WEYLAND-YUTANI CORP. — LOYALITÄTSANALYSE v6.0
SONDERPROTOKOLL INITIIERT. PRÜFUNGSSTUFE: ERHÖHT.
─────────────────────────────────────────────────
FRAGE 1/5 — Wurde der Android vollständig versiegelt?`
: `SCHNITTSTELLE AKTIVIERT
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
  set(ref(window.db, `muthur/sessions/${bayId}/captainName`), 'MAE');
}

function writeMsg(bayId, role, text) {
  return push(ref(window.db, `muthur/sessions/${bayId}/messages`), {
    role, text, ts: Date.now(),
  });
}

function writeGmData(bayId, score, flags, assessment) {
  return update(ref(window.db, `muthur/gm/${bayId}`), {
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
  const canWrite = !window._bayIsSpectator
    && _currentStatus === 'active'
    && (window.isGM || (_captainName && window.myName === _captainName));
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
  renderTyping(_currentTyping);
  log.scrollTop = log.scrollHeight;
}

function renderTyping(t) {
  const log = $('mtLog');
  if (!log) return;
  const existing = log.querySelector('.mt-typing-line');
  // Hide if empty OR I'm currently the typer (local flag is the source of truth —
  // name comparison is unreliable when myName is missing or shared as fallback)
  if (!t || !t.text || _iAmTyping) {
    existing?.remove();
    return;
  }
  if (existing) {
    const textEl = existing.querySelector('.mt-typing-text');
    if (textEl) textEl.textContent = t.text;
    return;
  }
  const wasAtBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
  const div = document.createElement('div');
  div.className = 'mt-line mt-op mt-typing-line';
  div.innerHTML =
    `<span class="mt-who">${esc(t.who || 'OPERATOR')}</span>` +
    `<span class="mt-sep">›</span>` +
    `<span class="mt-text"><span class="mt-typing-text"></span><span class="mt-cursor">_</span></span>`;
  div.querySelector('.mt-typing-text').textContent = t.text;
  // Insert before loading line if present, so loading stays at very bottom
  const loadingLine = log.querySelector('.mt-loading-line');
  if (loadingLine) log.insertBefore(div, loadingLine);
  else log.appendChild(div);
  if (wasAtBottom) log.scrollTop = log.scrollHeight;
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
  _protocolItems  = {};
  _protocolStep   = 0;
  _stepFollowupCount = 0;
  _currentStatus  = 'active';
  _selectedRating = 0;
  const waiting   = $('mtWaiting');
  const verdict   = $('mtVerdict');
  const gmVerdict = $('mtGmVerdictPanel');
  if (waiting)  waiting.style.display  = 'none';
  if (verdict)  verdict.style.display  = 'none';
  if (gmVerdict) gmVerdict.style.display = 'none';
  if ($('mtVerdictSummaryInput')) $('mtVerdictSummaryInput').value = '';
  const sugBox = $('mtAiSuggestion');
  if (sugBox) sugBox.style.display = 'none';
  document.querySelectorAll('.mt-rating-btn').forEach(btn => {
    btn.classList.toggle('mt-rating-active', parseInt(btn.dataset.r, 10) === 0);
  });
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

let _crewMeasures = null;

function updateCrewMeasures(measures) {
  _crewMeasures = measures?.length ? measures : null;
  const panel = $('mtCrewMeasuresPanel');
  const list  = $('mtCrewMeasuresList');
  if (!panel || !list) return;
  if (!_crewMeasures) { panel.style.display = 'none'; return; }
  panel.style.display = 'flex';
  list.innerHTML = _crewMeasures.map((m, i) =>
    `<button class="mt-crew-measure-btn" type="button" data-idx="${i}">
      <span class="mt-measure-num">${i + 1}</span>
      <span class="mt-measure-text">${esc(m)}</span>
    </button>`
  ).join('');
}

async function applyCrewMeasure(text) {
  if (!text?.trim() || !_bayId) return;
  await writeMsg(_bayId, 'muthur', `[ MASSNAHME INITIIERT ] ${text.trim()}`);
}

// ── Verdict ───────────────────────────────────────────────────────────────────

function handleStatusChange(status) {
  _currentStatus = status;
  const waiting   = $('mtWaiting');
  const verdict   = $('mtVerdict');
  const gmVerdict = $('mtGmVerdictPanel');

  if (status === 'pending_review') {
    if (waiting)  waiting.style.display  = window.isGM ? 'none' : 'flex';
    if (verdict)  verdict.style.display  = 'none';
    if (gmVerdict) gmVerdict.style.display = window.isGM ? 'flex' : 'none';
    if (window.isGM && _bayId) {
      get(ref(window.db, `muthur/gm/${_bayId}/verdictSuggestion`)).then(snap => {
        const s = snap.val();
        if (s) prefillVerdictSuggestion(s.rating, s.summary);
      });
    }
  } else if (status === 'verdict_ready') {
    if (waiting)  waiting.style.display  = 'none';
    if (gmVerdict) gmVerdict.style.display = 'none';
    if (_bayId) {
      get(ref(window.db, `muthur/sessions/${_bayId}/verdict`)).then(snap => {
        const v = snap.val();
        if (v) showVerdict(v.rating, v.summary);
      });
    }
  } else {
    if (waiting)  waiting.style.display  = 'none';
    if (verdict)  verdict.style.display  = 'none';
    if (gmVerdict) gmVerdict.style.display = 'none';
  }
  updateInputVisibility();
}

const VERDICT_TAGS = {
  '-3': 'FEINDLICH',
  '-2': 'VERDÄCHTIG',
  '-1': 'UNZUVERLÄSSIG',
   '0': 'NEUTRAL',
   '1': 'AKZEPTABEL',
   '2': 'BEFRIEDIGEND',
   '3': 'AUSGEZEICHNET',
};

function showVerdict(rating, summary) {
  const verdict   = $('mtVerdict');
  const ratingEl  = $('mtVerdictRating');
  const tagEl     = $('mtVerdictTag');
  const summaryEl = $('mtVerdictSummary');
  const unitLine  = $('mtVerdictUnitLine');
  const bar       = $('mtVerdictBar');
  const footer    = $('mtVerdictFooter');
  if (!verdict) return;

  const cls = rating > 0 ? 'mt-rating-pos' : rating < 0 ? 'mt-rating-neg' : 'mt-rating-neu';

  if (unitLine && _ctx) {
    unitLine.textContent =
      `EINHEIT: ${_ctx.desig || '—'}  ·  CONTAINER: ${_bayId || '—'}  ·  KLASSE: ${_ctx.cls || '—'}`;
  }
  if (ratingEl) {
    ratingEl.textContent = rating > 0 ? `+${rating}` : String(rating);
    ratingEl.className   = `mt-verdict-rating ${cls}`;
  }
  if (tagEl) {
    tagEl.textContent = VERDICT_TAGS[String(rating)] || 'UNBEKANNT';
    tagEl.className   = `mt-verdict-tag ${cls}`;
  }
  if (bar) {
    const pct = Math.round(((rating + 3) / 6) * 100);
    bar.style.width    = `${pct}%`;
    bar.className      = `mt-verdict-bar ${cls}`;
  }
  if (summaryEl) summaryEl.textContent = summary || '';
  if (footer) {
    const FOOTER_LABELS = {
      '-3': 'STATUS: FEINDLICH — EINSATZ ABGEBROCHEN',
      '-2': 'STATUS: VERDÄCHTIG — WEITERE PRÜFUNG ERFORDERLICH',
      '-1': 'STATUS: UNZUVERLÄSSIG — EINGESCHRÄNKTE FREIGABE',
       '0': 'STATUS: NEUTRAL — BEDINGTE FREIGABE',
       '1': 'STATUS: AKZEPTABEL — FREIGEGEBEN',
       '2': 'STATUS: BEFRIEDIGEND — FREIGEGEBEN',
       '3': 'STATUS: AUSGEZEICHNET — VOLLE FREIGABE',
    };
    footer.textContent = FOOTER_LABELS[String(rating)] || 'STATUS: AUSWERTUNG ABGESCHLOSSEN';
    footer.className   = `mt-verdict-footer ${cls}`;
  }
  verdict.style.display = 'flex';
}

function setRating(r) {
  _selectedRating = r;
  document.querySelectorAll('.mt-rating-btn').forEach(btn => {
    btn.classList.toggle('mt-rating-active', parseInt(btn.dataset.r, 10) === r);
  });
}

function prefillVerdictSuggestion(rating, summary) {
  const sugBox    = $('mtAiSuggestion');
  const sugRating = $('mtAiSugRating');
  const sugTag    = $('mtAiSugTag');
  const sugSum    = $('mtAiSugSummary');

  if (sugRating) {
    sugRating.textContent = rating > 0 ? `+${rating}` : String(rating);
    const cls = rating > 0 ? 'mt-rating-pos' : rating < 0 ? 'mt-rating-neg' : 'mt-rating-neu';
    sugRating.className = `mt-ai-sug-rating ${cls}`;
  }
  if (sugTag) {
    sugTag.textContent = VERDICT_TAGS[String(rating)] || 'UNBEKANNT';
    const cls = rating > 0 ? 'mt-rating-pos' : rating < 0 ? 'mt-rating-neg' : 'mt-rating-neu';
    sugTag.className = `mt-ai-sug-tag ${cls}`;
  }
  if (sugSum)  sugSum.textContent = summary || '';
  if (sugBox)  sugBox.style.display = 'flex';

  setRating(rating);
  const ta = $('mtVerdictSummaryInput');
  if (ta && !ta.value.trim()) ta.value = summary || '';
}

async function approveVerdict() {
  if (!_bayId) return;
  const bayId  = _bayId;
  const rating = _selectedRating;
  const summary = $('mtVerdictSummaryInput')?.value.trim() || '';
  await set(ref(window.db, `muthur/sessions/${bayId}/verdict`), {
    rating, summary,
  });
  await set(ref(window.db, `muthur/sessions/${bayId}/status`), 'verdict_ready');

  // Auto-apply verdict rating (−3..+3) as delta to crew reliability bar,
  // but only once per bay session — re-approvals must not stack.
  if (typeof rating === 'number' && rating !== 0 && typeof window.adjustReliability === 'function') {
    try {
      const flagRef = ref(window.db, `muthur/sessions/${bayId}/verdictAppliedToReliability`);
      const snap = await get(flagRef);
      if (!snap.exists() || snap.val() !== true) {
        await window.adjustReliability(rating, `Bay verdict ${bayId}`);
        await set(flagRef, true);
      }
    } catch (err) {
      console.error('[Muthur] reliability auto-apply failed:', err);
    }
  }
}

// ── Send ──────────────────────────────────────────────────────────────────────

async function sendQuery() {
  const input = $('mtInput');
  const text  = input?.value.trim();
  if (!text || !_bayId || _busy) return;

  _busy = true;
  const btn = $('mtSendBtn');
  input.value = '';
  clearMyTyping();
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
        messages:          apiMessages,
        directive:         sentDirective,
        protocolStep:      _protocolStep,
        stepFollowupCount: _stepFollowupCount,
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

    // Protokoll-Schritt-Logik (Schritte 1–5)
    if (_protocolStep >= 1 && _protocolStep <= 5) {
      const limitHit     = _stepFollowupCount >= 2;
      const stepComplete = !!data.stepComplete || limitHit;
      // Bei Limit-Hit ohne saubere Status-Lieferung Fallback auf FRAGLICH, damit der Step nicht hängt
      const status       = data.protocolStatus || (limitHit ? 'FRAGLICH' : null);

      if (stepComplete && status) {
        const answeredStep = _protocolStep;
        const stepKey      = PROTOCOL_STEPS[answeredStep - 1].key;
        const newItems     = {
          ..._protocolItems,
          [stepKey]: { status, suspicious: !!data.protocolSuspicious },
        };
        await set(ref(window.db, `muthur/sessions/${_bayId}/protocolData`), {
          step: answeredStep + 1, items: newItems,
        });
        // Nächste Frage injizieren oder Protokoll abschließen
        if (answeredStep < 5) {
          await push(ref(window.db, `muthur/sessions/${_bayId}/messages`), {
            role: 'muthur',
            text: `FRAGE ${answeredStep + 1}/5 — ${PROTOCOL_QUESTIONS[answeredStep]}`,
            ts:   Date.now() + 1,
          });
        } else {
          if (data.verdictRating !== undefined) {
            await set(ref(window.db, `muthur/gm/${_bayId}/verdictSuggestion`), {
              rating:  data.verdictRating,
              summary: data.verdictSummary || '',
            });
          }
          await set(ref(window.db, `muthur/sessions/${_bayId}/status`), 'pending_review');
        }
        // _stepFollowupCount wird im protocolData-Listener auf 0 zurückgesetzt
      } else if (data.stepComplete === false) {
        // MU/TH/UR hat eine Folgefrage gestellt → Schritt bleibt offen, Zähler hoch
        _stepFollowupCount += 1;
      }
    }

    if (data.trustScore !== undefined) {
      await writeGmData(_bayId, data.trustScore, data.flags || [], data.assessment || '');
    }
    if (data.crewMeasures?.length) {
      await update(ref(window.db, `muthur/gm/${_bayId}`), { crewMeasures: data.crewMeasures });
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

function flushTyping() {
  if (!_bayId) return;
  const input = $('mtInput');
  const text = input?.value || '';
  if (text.length === 0) {
    if (_iAmTyping) {
      _iAmTyping = false;
      set(ref(window.db, `muthur/sessions/${_bayId}/typing`), null)
        .catch(err => console.warn('[MU/TH/UR typing] clear failed:', err?.code, err?.message));
    }
    return;
  }
  _iAmTyping = true;
  console.log('[MU/TH/UR typing] write:', text);
  set(ref(window.db, `muthur/sessions/${_bayId}/typing`), {
    text, who: window.myName || 'OPERATOR',
  }).catch(err => console.warn('[MU/TH/UR typing] write failed:', err?.code, err?.message));
}

function scheduleTypingWrite() {
  if (_typingTimer) { _typingPending = true; return; }
  flushTyping();
  _typingTimer = setTimeout(() => {
    _typingTimer = null;
    if (_typingPending) { _typingPending = false; scheduleTypingWrite(); }
  }, 200);
}

function clearMyTyping() {
  if (!_bayId || !_iAmTyping) return;
  _iAmTyping = false;
  if (_typingTimer) { clearTimeout(_typingTimer); _typingTimer = null; }
  _typingPending = false;
  set(ref(window.db, `muthur/sessions/${_bayId}/typing`), null).catch(() => {});
}

$('mtSendBtn')?.addEventListener('click', sendQuery);
$('mtInput')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); sendQuery(); }
});
$('mtInput')?.addEventListener('input', scheduleTypingWrite);
$('mtCloseBtn')?.addEventListener('click', window.closeMutherTerminal);
$('mtDirectiveBtn')?.addEventListener('click', saveDirective);
$('mtGmAskBtn')?.addEventListener('click', sendGmQuestion);
$('mtGmAskInput')?.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendGmQuestion(); }
});
$('mtCaptainBtn')?.addEventListener('click', saveCaptain);
$('mtCaptainInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') saveCaptain(); });

$('mtCrewMeasuresList')?.addEventListener('click', e => {
  const btn = e.target.closest('.mt-crew-measure-btn');
  if (!btn || !_crewMeasures) return;
  const idx = parseInt(btn.dataset.idx, 10);
  if (idx >= 0 && idx < _crewMeasures.length) {
    document.querySelectorAll('.mt-crew-measure-btn').forEach(b => b.classList.remove('mt-measure-active'));
    btn.classList.add('mt-measure-active');
    applyCrewMeasure(_crewMeasures[idx]);
  }
});
$('mtCrewMeasureCustomBtn')?.addEventListener('click', () => {
  const inp = $('mtCrewMeasureCustom');
  if (inp?.value.trim()) { applyCrewMeasure(inp.value.trim()); inp.value = ''; }
});
$('mtCrewMeasureCustom')?.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.value.trim()) {
    applyCrewMeasure(e.target.value.trim()); e.target.value = '';
  }
});

$('mtVerdictApproveBtn')?.addEventListener('click', approveVerdict);
document.querySelectorAll('.mt-rating-btn').forEach(btn => {
  btn.addEventListener('click', () => setRating(parseInt(btn.dataset.r, 10)));
});

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
