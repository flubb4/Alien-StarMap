// ══ M08 MEMORY INTEGRATION — LOGIC-GRID DEDUCTION ENGINE ═════════════════════
// The fragmented profile is rebuilt by slotting memory fragments into the right
// banks AND assigning each bank its correct sector. Both pairings are pinned by
// physical constraint clues (Einstein/Zebra style) — pure deduction, no guessing.
// The terminal validates ONLY the complete arrangement (right/wrong), so the crew
// has to reason it out rather than trial-and-error their way in.
//
//   shared state : { banks:[{frag,sector}…], attempts:N, solved:bool }
//   iframe → parent : {type:'m08mi-set', state}     — write new shared state
//   parent → iframe : {type:'m08mi-apply', state}   — apply shared state
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  'use strict';
  const CFG = window.PUZZLE_CONFIG || {};
  const PGC = window.PGC;
  const P = CFG.prefix || 'm08mi';
  const FRAGS = CFG.fragments || [];
  const SECTORS = CFG.sectors || [];
  const SOL = CFG.solution || [];
  const N = SOL.length;
  const fragById = {}; FRAGS.forEach(f => { fragById[f.id] = f; });
  const secById = {}; SECTORS.forEach(s => { secById[s.id] = s; });
  const fragOpts = [null].concat(FRAGS.map(f => f.id));
  const secOpts = [null].concat(SECTORS.map(s => s.id));

  function emptyBanks() { return Array.from({ length: N }, () => ({ frag: null, sector: null })); }
  let state = { banks: emptyBanks(), attempts: 0, solved: false };
  let successShown = false;

  function normalize(s) {
    const banks = emptyBanks();
    const src = (s && Array.isArray(s.banks)) ? s.banks : [];
    for (let i = 0; i < N; i++) {
      const b = src[i] || {};
      banks[i] = {
        frag: fragOpts.includes(b.frag) ? b.frag : null,
        sector: secOpts.includes(b.sector) ? b.sector : null
      };
    }
    return { banks, attempts: (s && s.attempts) || 0, solved: !!(s && s.solved) };
  }

  // ── DOM build ───────────────────────────────────────────────────────────────
  function build() {
    const host = document.getElementById('mi-banks');
    host.innerHTML = '';
    for (let i = 0; i < N; i++) {
      const card = document.createElement('div');
      card.className = 'mi-bank';
      card.dataset.pos = i;
      card.innerHTML =
        '<div class="mb-head">BANK-' + (i + 1) + '</div>' +
        '<div class="mi-cyc frag empty"><span class="cyc-label">FRAGMENT</span><span class="cyc-val">—</span><span class="cyc-name"></span></div>' +
        '<div class="mi-cyc sector empty"><span class="cyc-label">SEKTOR</span><span class="cyc-val">—</span></div>';
      card.querySelector('.frag').addEventListener('click', () => cycle(i, 'frag'));
      card.querySelector('.sector').addEventListener('click', () => cycle(i, 'sector'));
      host.appendChild(card);
    }
    const leg = document.getElementById('mi-fragments');
    if (leg) leg.innerHTML = FRAGS.map(f =>
      '<span class="frag-ref"><span class="fr-glyph">' + f.glyph + '</span>' + PGC.esc(f.id) + '</span>').join('');
    document.getElementById('mi-submit').addEventListener('click', submit);
  }

  function cycle(pos, kind) {
    if (state.solved || PGC.view !== 'main') return;
    const opts = kind === 'frag' ? fragOpts : secOpts;
    const cur = state.banks[pos][kind];
    const next = opts[(opts.indexOf(cur) + 1) % opts.length];
    const banks = state.banks.map(b => ({ frag: b.frag, sector: b.sector }));
    banks[pos][kind] = next;
    commit({ banks, attempts: state.attempts, solved: false });
  }

  function submit() {
    if (state.solved || PGC.view !== 'main') return;
    const banks = state.banks;
    if (!banks.every(b => b.frag && b.sector)) {
      PGC.log('warn', 'SYS', 'Zuordnung unvollständig — jede Bank braucht Fragment und Sektor.');
      flashAll();
      return;
    }
    const fr = banks.map(b => b.frag), se = banks.map(b => b.sector);
    const noDup = new Set(fr).size === N && new Set(se).size === N;
    const correct = noDup && SOL.every((s, i) => banks[i].frag === s.frag && banks[i].sector === s.sector);
    if (correct) {
      commit({ banks: banks.map(b => ({ frag: b.frag, sector: b.sector })), attempts: state.attempts, solved: true },
        'ok', 'INTEGRITÄTSPRÜFUNG BESTANDEN. Profil rekonstruiert.');
    } else {
      const a = state.attempts + 1;
      PGC.log('err', 'SYS', 'INTEGRITÄTSPRÜFUNG FEHLGESCHLAGEN (' + a + '). Konfiguration inkonsistent.');
      flashAll();
      commit({ banks: banks.map(b => ({ frag: b.frag, sector: b.sector })), attempts: a, solved: false });
    }
  }

  function flashAll() {
    document.querySelectorAll('.mi-bank').forEach(c => {
      c.classList.remove('bad'); void c.offsetWidth; c.classList.add('bad');
    });
  }

  function commit(next, logType, logMsg) {
    state = normalize(next);
    if (logMsg) PGC.log(logType || 'system', 'CORE', PGC.esc(logMsg));
    render();
    PGC.send({ type: P + '-set', state: state });
  }

  // ── render ───────────────────────────────────────────────────────────────────
  function render() {
    state.banks.forEach((b, i) => {
      const card = document.querySelector('.mi-bank[data-pos="' + i + '"]');
      if (!card) return;
      const fc = card.querySelector('.frag'), sc = card.querySelector('.sector');
      const f = fragById[b.frag], s = secById[b.sector];
      fc.classList.toggle('empty', !b.frag);
      fc.querySelector('.cyc-val').textContent = f ? f.glyph : '—';
      fc.querySelector('.cyc-name').textContent = f ? f.id : '';
      sc.classList.toggle('empty', !b.sector);
      sc.querySelector('.cyc-val').textContent = s ? (s.short || s.id) : '—';
    });
    PGC.setText('pg-attempts', state.attempts);
    maybeSolve();
  }

  function maybeSolve() {
    if (state.solved && !successShown) {
      successShown = true;
      PGC.log('ok', 'SYS', PGC.esc(CFG.solveLog || 'Profil rekonstruiert. AX-17 stabilisiert.'));
      setTimeout(() => PGC.showSuccess(), 1400);
    }
  }

  // ── shared state from parent ───────────────────────────────────────────────────
  PGC.onApply(s => {
    state = normalize(s);
    if (!state.solved) successShown = false;
    if (PGC.view === 'main') render();
  });

  // ── GM controls ────────────────────────────────────────────────────────────────
  window.pgReset = function () {
    if (!PGC.isGM && PGC.isEmbedded) return;
    successShown = false;
    commit({ banks: emptyBanks(), attempts: 0, solved: false }, 'warn', 'GM: Bänke geleert, Zähler zurückgesetzt.');
  };
  window.pgForceSolve = function () {
    if (!PGC.isGM && PGC.isEmbedded) return;
    commit({ banks: SOL.map(s => ({ frag: s.frag, sector: s.sector })), attempts: state.attempts, solved: true },
      'warn', 'GM: Force solve.');
  };
  window.pgTogglePanel = function () { PGC.toggleGmPanel(); };

  // ── GM clue-kit panel ──────────────────────────────────────────────────────────
  function fillGmPanel() {
    const sol = document.getElementById('gm-solution');
    if (sol) sol.innerHTML = SOL.map((s, i) => {
      const f = fragById[s.frag] || {}, sec = secById[s.sector] || {};
      return '<li>BANK-' + (i + 1) + ': <strong>' + (f.glyph || '') + ' ' + PGC.esc(s.frag) + '</strong> / ' + PGC.esc(sec.id || s.sector) + '</li>';
    }).join('');
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
