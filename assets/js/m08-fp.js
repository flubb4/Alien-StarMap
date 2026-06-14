// ══ M08 FRAGMENTED POWER — SEQUENCE DEDUCTION ENGINE ═════════════════════════
// Six dormant reactor cores must be brought online in one exact order. The order
// is NOT shown anywhere in the terminal — the crew derives it from physical clues
// at the table (constraint logic). Tap a core to try to bring it online:
//   • correct next core  → it locks ONLINE (gets its sequence number)
//   • wrong core          → reject: the whole chain trips back to zero + a fault
// Solve = all cores online in the right order. Cooperative: any role taps; the
// shared progress lives in Firebase via the parent (no GM bottleneck).
//
//   shared state : { progress:[coreId,…], faults:N }
//   iframe → parent : {type:'m08fp-set', state}     — write new shared state
//   parent → iframe : {type:'m08fp-apply', state}   — apply shared state
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  'use strict';
  const CFG = window.PUZZLE_CONFIG || {};
  const PGC = window.PGC;
  const P = CFG.prefix || 'm08fp';
  const SOL = CFG.solution || [];
  const cores = CFG.cores || [];
  const byId = {}; cores.forEach(c => { byId[c.id] = c; });

  let state = { progress: [], faults: 0, reject: null };
  let solved = false;
  let locked = false;
  let lastRejectN = 0;
  let rejectTimer = null;

  const faultLines = [
    'SEQUENZFEHLER — Bus-Schutzschaltung ausgelöst. Kette zurückgesetzt.',
    'ÜBERLAST. Kondensatoren entladen. Reihenfolge erneut prüfen.',
    'KASKADEN-ABSCHALTUNG. Der Reaktor brummt bedrohlich auf.',
    'KRITISCH: Schutzrelais glühen. Noch ein Fehlschlag und der Kern riegelt ab.'
  ];

  // ── DOM build ────────────────────────────────────────────────────────────────
  function build() {
    const host = document.getElementById('fp-cores');
    host.innerHTML = '';
    cores.forEach(c => {
      const el = document.createElement('div');
      el.className = 'fp-core';
      el.dataset.id = c.id;
      el.innerHTML =
        '<span class="fc-order"></span>' +
        '<span class="fc-icon">' + (c.icon || '◈') + '</span>' +
        '<span class="fc-name">' + PGC.esc(c.name || c.id) + '</span>' +
        '<span class="fc-sub">' + PGC.esc(c.sub || '') + '</span>' +
        '<span class="fc-status">DORMANT</span>';
      el.addEventListener('click', () => onTap(c.id));
      host.appendChild(el);
      c._el = el;
    });
  }

  function onTap(id) {
    if (solved || locked || PGC.view !== 'main') return;
    if (state.progress.includes(id)) return;                 // already online
    const expected = SOL[state.progress.length];
    if (id === expected) {
      const next = { progress: state.progress.concat([id]), faults: state.faults };
      commit(next, 'ok', byId[id].name + ' ONLINE. (' + next.progress.length + '/' + SOL.length + ')');
    } else {
      const f = state.faults + 1;
      const n = (state.reject && state.reject.n || 0) + 1;
      locked = true;
      setTimeout(() => { locked = false; }, 600);
      // reject ist Teil des geteilten Zustands → alle Clients sehen die rote Umrandung
      commit({ progress: [], faults: f, reject: { id: id, n: n } }, 'err',
             faultLines[Math.min(f - 1, faultLines.length - 1)]);
    }
  }

  function clearRejects() {
    cores.forEach(c => c._el.classList.remove('reject'));
  }
  function flashReject(id) {
    clearRejects();
    const el = byId[id] && byId[id]._el;
    if (!el) return;
    void el.offsetWidth;
    el.classList.add('reject');
    clearTimeout(rejectTimer);
    rejectTimer = setTimeout(clearRejects, 700);
  }

  // commit = update local + render + push to parent (shared truth)
  function commit(next, logType, logMsg) {
    state = next;
    if (logMsg) PGC.log(logType, 'CORE', PGC.esc(logMsg));
    render();
    PGC.send({ type: P + '-set', state: state });
  }

  // ── render ───────────────────────────────────────────────────────────────────
  function render() {
    cores.forEach(c => {
      const pos = state.progress.indexOf(c.id);
      const online = pos >= 0;
      c._el.classList.toggle('online', online);
      c._el.querySelector('.fc-order').textContent = online ? (pos + 1) : '';
      c._el.querySelector('.fc-status').textContent = online ? 'ONLINE' : 'DORMANT';
    });

    // geteiltes Reject-Feedback: neue Fehl-Auswahl bei ALLEN Clients blinken lassen;
    // kein aktives Reject (z. B. nach GM-Reset) → alle roten Umrandungen löschen
    const rj = state.reject;
    if (rj && rj.n && rj.n !== lastRejectN) {
      lastRejectN = rj.n;
      flashReject(rj.id);
    } else if (!rj) {
      lastRejectN = 0;
      clearTimeout(rejectTimer);
      clearRejects();
    }

    PGC.setText('pg-online', state.progress.length + ' / ' + SOL.length);
    PGC.setText('pg-faults', state.faults);
    const fc = document.getElementById('pg-fault-cell');
    if (fc) fc.classList.toggle('warn', state.faults > 0);

    const nowSolved = state.progress.length === SOL.length && SOL.length > 0 &&
                      SOL.every((id, i) => state.progress[i] === id);
    if (nowSolved && !solved) onSolve();
  }

  function onSolve() {
    solved = true;
    PGC.log('ok', 'SYS', PGC.esc(CFG.solveLog || 'Sequenz korrekt. Reaktor synchronisiert.'));
    setTimeout(() => PGC.showSuccess(), 1400);
  }

  // ── shared state from parent ───────────────────────────────────────────────────
  PGC.onApply(s => {
    state = {
      progress: Array.isArray(s.progress) ? s.progress.slice() : [],
      faults: s.faults || 0,
      reject: (s.reject && typeof s.reject === 'object') ? { id: s.reject.id, n: s.reject.n || 0 } : null
    };
    if (state.progress.length !== SOL.length) solved = false;
    if (PGC.view === 'main') render();
  });

  // ── GM controls ────────────────────────────────────────────────────────────────
  window.pgReset = function () {
    if (!PGC.isGM && PGC.isEmbedded) return;
    solved = false;
    commit({ progress: [], faults: 0 }, 'warn', 'GM: Sequenz zurückgesetzt. Alle Kerne dormant.');
  };
  window.pgForceSolve = function () {
    if (!PGC.isGM && PGC.isEmbedded) return;
    commit({ progress: SOL.slice(), faults: state.faults }, 'warn', 'GM: Force solve.');
  };
  window.pgTogglePanel = function () { PGC.toggleGmPanel(); };

  // ── GM clue-kit panel ──────────────────────────────────────────────────────────
  function fillGmPanel() {
    const sol = document.getElementById('gm-solution');
    if (sol) sol.innerHTML = SOL.map((id, i) =>
      '<li>' + (i + 1) + '. <strong>' + PGC.esc((byId[id] || {}).name || id) + '</strong></li>').join('');
    const cl = document.getElementById('gm-clues');
    if (cl) cl.innerHTML = (CFG.clues || []).map(c => {
      if (typeof c === 'string') return '<li>' + c + '</li>';
      return '<li>' + (c.clue || '') + (c.fundort ? '<span class="fundort">Fundort: ' + c.fundort + '</span>' : '') + '</li>';
    }).join('');
  }

  // ── init ─────────────────────────────────────────────────────────────────────
  build();
  fillGmPanel();
  PGC.init(CFG, () => { render(); });
})();
