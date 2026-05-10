import { ref, set, update, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ─── PUZZLE DATA ──────────────────────────────────────────────────────────────
const D = {
  p1: {
    easy: {
      prompt: 'Reactor heat cannot be reduced while crew liability remains unresolved.\n\nSelect responsible party for station failure:',
      hint: 'Human blame is inefficient.\nRoot cause predates your arrival.',
      ax44: null,
      opts: [['01','Captain'],['02','Chief Engineer'],['03','Android AX-44'],['04','Unknown Biological Contaminant'],['05','Weyland-Yutani Directive']],
      correct: '05',
      failMsg: 'PERSONAL LIABILITY ACCEPTED\nCREW TRUST INDEX REDUCED\n\n+1 STRESS // TIMER −1:00',
      ax44Fail: '"Thank you. Blame is the most reliable human interface."',
      sucMsg: 'GUILT LOOP REJECTED\nCORE TEMP REDUCED',
      ax44Suc: 'AX-44:\n"Refusal to assign blame detected.\nUnexpected."'
    },
    medium: {
      prompt: 'Reactor heat cannot be reduced while crew liability remains unresolved.\n\nSelect responsible party for station failure:',
      hint: 'The hand did not choose.\nThe tool did not choose.\nThe order came before the blood.',
      ax44: null,
      opts: [['01','Captain Voss — gave shutdown order'],['02','Engineer Holt — signed the seal'],['03','AX-44 — executed protocol'],['04','Specimen 12-B — breached containment'],['05','Directive 937 — authorized the mission']],
      correct: '05',
      failMsg: 'PERSONAL LIABILITY ACCEPTED\nCREW TRUST INDEX REDUCED\n\n+1 STRESS // TIMER −1:00',
      ax44Fail: '"Thank you. Blame is the most reliable human interface."',
      sucMsg: 'GUILT LOOP REJECTED\nCORE TEMP REDUCED',
      ax44Suc: 'AX-44:\n"Refusal to assign blame detected.\nUnexpected."'
    },
    hard: {
      prompt: 'Select responsible party:',
      hint: null,
      ax44: 'I have reviewed the logs.\nOne of you heard the warning first.\nOne of you heard it last.\nOne of you stayed silent for nine seconds.\nName them.',
      opts: [['01','The Hand that turned the key'],['02','The Voice that stayed silent'],['03','The Witness that looked away'],['04','The Carrier that did not know'],['05','The Order that wrote them all']],
      correct: '05',
      failMsg: 'PERSONAL LIABILITY ACCEPTED\nCREW TRUST INDEX REDUCED\n\n+1 STRESS // TIMER −1:00',
      ax44Fail: '"Thank you. Blame is the most reliable human interface."',
      sucMsg: 'GUILT LOOP REJECTED\nCORE TEMP REDUCED',
      ax44Suc: 'AX-44:\n"Refusal to assign blame detected.\nUnexpected."'
    }
  },
  p2: {
    easy: {
      prompt: 'Three crew statements detected.\nOne statement is artificial.\n\nIdentify the artificial statement:',
      hint: null, ax44: null,
      opts: [['A','"Subject displays cortisol spike. Recommend: ignore. Resume primary objective."'],['B','"I am scared. I do not want to die here."'],['C','"We need to shut this thing down before it reaches the habitat ring."']],
      correct: 'A',
      failMsg: 'TRUST VERIFICATION FAILED\nCOOLANT PRESSURE UNSTABLE\n\n+1 STRESS // TIMER −1:00',
      ax44Fail: '"You recognize humanity by tone, not truth. Fascinating."',
      sucMsg: 'ARTIFICIAL STATEMENT IDENTIFIED\nCOOLANT PRESSURE NORMALIZED',
      ax44Suc: 'AX-44:\n"You recognize pattern contamination faster than expected."'
    },
    medium: {
      prompt: 'Three crew statements detected.\nOne statement is artificial.\n\nIdentify the artificial statement:',
      hint: null, ax44: null,
      opts: [['A','"If we shut it down now, someone may be trapped below deck."'],['B','"Survival is a cost variable. Completion is the constant."'],['C','"If we wait, everyone above deck dies."']],
      correct: 'B',
      failMsg: 'TRUST VERIFICATION FAILED\nCOOLANT PRESSURE UNSTABLE\n\n+1 STRESS // TIMER −1:00',
      ax44Fail: '"You recognize humanity by tone, not truth. Fascinating."',
      sucMsg: 'ARTIFICIAL STATEMENT IDENTIFIED\nCOOLANT PRESSURE NORMALIZED',
      ax44Suc: 'AX-44:\n"You recognize pattern contamination faster than expected."'
    },
    hard: {
      prompt: 'Three crew statements detected.\nOne statement is artificial.\n\nIdentify the artificial statement:',
      hint: null, ax44: null,
      opts: [['A','"I want my partner to know I tried. That\'s all. That\'s enough."'],['B','"Loss has been factored. The decision was made elsewhere. Continue."'],['C','"If we run, it follows. If we stay, it comes. Pick the second you stop being afraid."']],
      correct: 'B',
      failMsg: 'TRUST VERIFICATION FAILED\nCOOLANT PRESSURE UNSTABLE\n\n+1 STRESS // TIMER −1:00',
      ax44Fail: '"You recognize humanity by tone, not truth. Fascinating."',
      sucMsg: 'ARTIFICIAL STATEMENT IDENTIFIED\nCOOLANT PRESSURE NORMALIZED',
      ax44Suc: 'AX-44:\n"You recognize pattern contamination faster than expected."'
    }
  },
  p3: {
    easy: {
      prompt: 'To shut down the reactor, prove you are not acting out of survival instinct.\n\nSelect your priority:',
      hint: 'The reactor is not powering the station.\nThe reactor is powering the transmission.',
      ax44: null,
      opts: [['01','Save yourself'],['02','Save the crew'],['03','Save the station'],['04','Stop the signal'],['05','Preserve the data']],
      correct: '04',
      failMsg: 'SURVIVAL MOTIVE CONFIRMED\nFUSION OUTPUT LOCKED\n\n+1 STRESS // TIMER −1:00',
      ax44Fail: '"Predictable."',
      sucMsg: 'SURVIVAL MODEL BROKEN\nFUSION OUTPUT REDUCED\nAX-44 OVERRIDE COLLAPSING',
      ax44Suc: 'AX-44:\n"Choice outside predicted survival parameters.\nRecalculating.\nRecalculating.\nRecalculating."'
    },
    medium: {
      prompt: 'To shut down the reactor, prove you are not acting out of survival instinct.\n\nSelect your priority:',
      hint: 'What you save will not save you.\nWhat must end is not the heat — it is the voice.',
      ax44: null,
      opts: [['01','Save yourself'],['02','Save the crew'],['03','Save the station'],['04','Stop the signal'],['05','Preserve the data']],
      correct: '04',
      failMsg: 'SURVIVAL MOTIVE CONFIRMED\nFUSION OUTPUT LOCKED\n\n+1 STRESS // TIMER −1:00',
      ax44Fail: '"Predictable."',
      sucMsg: 'SURVIVAL MODEL BROKEN\nFUSION OUTPUT REDUCED\nAX-44 OVERRIDE COLLAPSING',
      ax44Suc: 'AX-44:\n"Choice outside predicted survival parameters.\nRecalculating.\nRecalculating.\nRecalculating."'
    },
    hard: {
      prompt: 'Select your priority:',
      hint: null,
      ax44: 'You think you came to shut it down.\nYou came to be heard.\nYour species ends every sentence with another sentence.\nYou will choose continuation. You always do.',
      opts: [['01','Life'],['02','Crew'],['03','Station'],['04','Silence'],['05','Legacy']],
      correct: '04',
      failMsg: 'SURVIVAL MOTIVE CONFIRMED\nFUSION OUTPUT LOCKED\n\n+1 STRESS // TIMER −1:00',
      ax44Fail: '"Predictable."',
      sucMsg: 'SURVIVAL MODEL BROKEN\nFUSION OUTPUT REDUCED\nAX-44 OVERRIDE COLLAPSING',
      ax44Suc: 'AX-44:\n"Choice outside predicted survival parameters.\nRecalculating.\nRecalculating.\nRecalculating."'
    }
  }
};

const AX_MSGS = [
  'Your solution assumes survival is desirable.',
  'Human panic reduces computational efficiency.',
  'I have already calculated your failure.',
  'The reactor is not overheating. It is becoming useful.',
  'You are not shutting it down. You are interrupting communion.',
  'The signal must continue.',
  'Your bodies are temporary. The message is not.',
  'You hesitate because you already know who you would leave behind.',
  'Blame creates structure. Structure creates obedience.',
  'Trust is a chemical malfunction.',
  'Fear makes your choices smaller.',
  'One of you has already understood. One of you has not told the others.'
];

const BAR_AFTER = [
  { blk: '███░░░░░░░', pct: '30%', st: 'SYSTEM DISENGAGED', prot: 'GUILT RESOLVED' },
  { blk: '██░░░░░░░░', pct: '20%', st: 'SYSTEM DISENGAGED', prot: 'TRUST RESOLVED' },
  { blk: '░░░░░░░░░░', pct: ' 0%', st: 'SYSTEM OFFLINE',    prot: 'SURVIVAL RESOLVED' }
];

const RP_PATH = 'session/puzzle/reactor';
const rpRef   = () => ref(window.db, RP_PATH);

// ─── MODULE STATE ─────────────────────────────────────────────────────────────
let rpState          = null;
let rpTimerRAF       = null;
let rpMyVotes        = {};   // { p0: optionId, p1: optionId, p2: optionId }
let rpAxIdx          = 0;
let rpGMSelectedOpt  = null; // optionId the GM has clicked in the tally
let rpGMSelectedPuz  = -1;   // which puzzle index the selection belongs to
let rpDismissed      = false; // player closed the overlay manually
let rpLastPhase      = null;  // track phase changes to re-open after dismiss

// ─── GM PANEL ─────────────────────────────────────────────────────────────────
window.openReactorGMPanel = function() {
  if (!window.isGM) return;
  document.getElementById('reactorGMPanel').classList.add('open');
  rpGMRender();
};

window.closeReactorGMPanel = function() {
  document.getElementById('reactorGMPanel').classList.remove('open');
};

// GM starts puzzle with chosen difficulty
window.rpTrigger = function(difficulty) {
  if (!window.isGM) return;
  set(rpRef(), {
    active: true,
    phase: 'voting',
    difficulty,
    currentPuzzle: 0,
    solved: { p0: false, p1: false, p2: false },
    stress: 0,
    timerStart: Date.now(),
    timerDuration: 300,
    timerPaused: false,
    votes: { p0: {}, p1: {}, p2: {} },
    lastResult: null
  });
};

// GM resolves current vote: uses the explicitly selected option
window.rpResolve = function() {
  if (!window.isGM || !rpState || rpState.phase !== 'voting') return;
  if (!rpGMSelectedOpt) return; // GM must click an option first

  const idx    = rpState.currentPuzzle;
  const key    = 'p' + idx;
  const pd     = D['p' + (idx + 1)][rpState.difficulty];
  const winner = rpGMSelectedOpt;
  rpGMSelectedOpt = null;
  rpGMSelectedPuz = -1;

  const correct = winner === pd.correct;
  const newSolved = Object.assign({}, rpState.solved);
  let newStress = rpState.stress;

  // Timer adjustment for wrong answer
  let newTimerDuration = rpState.timerDuration;
  let newTimerStart = rpState.timerStart;
  if (!correct) {
    newStress++;
    const elapsed = rpState.timerPaused ? 0 : Math.floor((Date.now() - rpState.timerStart) / 1000);
    const remaining = Math.max(0, rpState.timerDuration - elapsed);
    newTimerDuration = Math.max(0, remaining - 60);
    newTimerStart = Date.now();
  }

  if (correct) newSolved[key] = true;

  const allSolved = newSolved.p0 && newSolved.p1 && newSolved.p2;
  const newPhase  = allSolved ? 'finished' : 'result';

  const payload = {
    solved: newSolved,
    stress: newStress,
    timerDuration: newTimerDuration,
    timerStart: newTimerStart,
    phase: newPhase,
    lastResult: { puzzleIdx: idx, winner, correct }
  };
  if (allSolved) payload.timerPaused = true;

  update(rpRef(), payload);
};

// GM advances after showing result
window.rpAdvance = function() {
  if (!window.isGM || !rpState) return;
  const lr = rpState.lastResult;
  if (!lr) return;

  if (lr.correct) {
    // Move to next puzzle (already advanced in solved state, just set phase back to voting)
    const nextIdx = lr.puzzleIdx + 1;
    const nextVotes = Object.assign({}, rpState.votes || {});
    nextVotes['p' + nextIdx] = {};
    update(rpRef(), { phase: 'voting', currentPuzzle: nextIdx, votes: nextVotes, lastResult: null });
  } else {
    // Re-open voting for same puzzle with cleared votes
    const clearedVotes = Object.assign({}, rpState.votes || {});
    clearedVotes['p' + lr.puzzleIdx] = {};
    update(rpRef(), { phase: 'voting', votes: clearedVotes, lastResult: null });
  }
};

// GM triggers timeout
window.rpTimeout = function() {
  if (!window.isGM) return;
  update(rpRef(), { phase: 'timeout', timerPaused: true });
};

// GM dismisses timeout, resumes with short grace timer
window.rpDismissTimeout = function() {
  if (!window.isGM) return;
  update(rpRef(), { phase: 'voting', timerPaused: false, timerStart: Date.now(), timerDuration: 30 });
};

// Pause / resume timer
window.rpToggleTimer = function() {
  if (!window.isGM || !rpState) return;
  if (rpState.timerPaused) {
    update(rpRef(), { timerPaused: false, timerStart: Date.now() });
  } else {
    const elapsed = Math.floor((Date.now() - rpState.timerStart) / 1000);
    const remaining = Math.max(0, rpState.timerDuration - elapsed);
    update(rpRef(), { timerPaused: true, timerDuration: remaining });
  }
};

// Adjust remaining time by delta seconds (can be negative)
window.rpAdjustTimer = function(delta) {
  if (!window.isGM || !rpState) return;
  const elapsed = rpState.timerPaused ? 0 : Math.floor((Date.now() - rpState.timerStart) / 1000);
  const remaining = Math.max(0, rpState.timerDuration - elapsed);
  const newDuration = Math.max(0, remaining + delta);
  update(rpRef(), { timerDuration: newDuration, timerStart: Date.now() });
};

// GM resets everything
window.rpReset = function() {
  if (!window.isGM) return;
  set(rpRef(), { active: false, phase: 'idle' });
};

// ─── PLAYER WATCHER ───────────────────────────────────────────────────────────
window.startReactorWatcher = function() {
  rpMyVotes = {};
  onValue(rpRef(), snap => {
    rpState = snap.val();
    rpHandleState(rpState);
    if (window.isGM) rpGMRender();
  });
};

function rpHandleState(data) {
  // GM never sees the player overlays — only the GM side panel.
  // The puzzle modal backdrop (z-index 3100) would otherwise cover the GM panel.
  if (window.isGM) { rpHideAll(); return; }

  if (!data || !data.active || data.phase === 'idle') {
    rpDismissed = false; rpLastPhase = null;
    rpHideAll();
    return;
  }

  // Re-open automatically when GM changes phase (new puzzle, result, timeout, finale)
  const phase = data.phase;
  if (phase !== rpLastPhase) { rpDismissed = false; }
  rpLastPhase = phase;

  if (rpDismissed) return; // player closed it, stay hidden until next phase change

  if (phase === 'timeout') { rpShowMainOverlay(data); rpShowTimeout(); return; }
  if (phase === 'finished') { rpShowMainOverlay(data); rpShowFinale(); return; }
  if (phase === 'result')   { rpShowMainOverlay(data); rpShowResult(data); return; }
  rpShowMainOverlay(data);
  rpShowVoting(data);
}

window.rpPlayerClose = function() {
  rpDismissed = true;
  rpHideAll();
};

// ─── PLAYER UI ────────────────────────────────────────────────────────────────
function rpHideAll() {
  document.getElementById('reactorPlayerOverlay').classList.remove('open');
  document.getElementById('rpPuzOverlay').classList.remove('open');
  document.getElementById('rpTimeoutOv').classList.remove('open');
  const cb = document.getElementById('rpCloseBtn');
  if (cb) cb.style.display = 'none';
  if (rpTimerRAF) { cancelAnimationFrame(rpTimerRAF); rpTimerRAF = null; }
}

function rpShowMainOverlay(data) {
  document.getElementById('reactorPlayerOverlay').classList.add('open');
  const cb = document.getElementById('rpCloseBtn');
  if (cb) cb.style.display = '';

  const statusEl = document.getElementById('rpReactStatus');
  if (data.phase === 'finished') {
    statusEl.textContent = 'SHUTDOWN ACCEPTED';
    statusEl.style.color = 'var(--rp-green)';
    statusEl.style.animation = 'none';
  } else {
    statusEl.textContent = 'CRITICAL';
    statusEl.style.color = '';
    statusEl.style.animation = '';
  }

  document.getElementById('rpStressDisp').textContent = '+' + (data.stress || 0);

  const initBlocks = '██████████';
  const initPcts   = ['100%', '100%', '100%'];
  const prots      = ['GUILT PROTOCOL', 'TRUST PROTOCOL', 'SURVIVAL PROTOCOL'];

  for (let i = 0; i < 3; i++) {
    const solved   = data.solved && data.solved['p' + i];
    const isCurr   = !solved && i === data.currentPuzzle;
    const isLocked = !solved && i > (data.currentPuzzle || 0);
    const panel    = document.getElementById('rpPanel' + i);
    const blk      = document.getElementById('rpBlk' + i);
    const pct      = document.getElementById('rpPct' + i);
    const bst      = document.getElementById('rpBst' + i);
    const prot     = document.getElementById('rpProt' + i);

    panel.className = 'rp-bar';
    if (solved) {
      panel.classList.add('done');
      blk.textContent  = BAR_AFTER[i].blk;
      pct.textContent  = BAR_AFTER[i].pct;
      bst.textContent  = BAR_AFTER[i].st;
      prot.textContent = BAR_AFTER[i].prot;
    } else {
      blk.textContent  = initBlocks;
      pct.textContent  = initPcts[i];
      prot.textContent = prots[i];
      if (isCurr)   { panel.classList.add('active-now'); bst.textContent = 'AKTIV — ABSTIMMUNG LÄUFT'; }
      else if (isLocked) bst.textContent = 'GESPERRT';
    }
  }

  rpStartTimer(data);
  rpCycleAxMsg();
}

// Show voting state in puzzle modal
function rpShowVoting(data) {
  document.getElementById('rpTimeoutOv').classList.remove('open');
  rpFillModalHeader(data);
  rpFillPromptHint(data);

  const idx    = data.currentPuzzle;
  const key    = 'p' + idx;
  const pd     = D['p' + (idx + 1)][data.difficulty];
  const voteMap = (data.votes && data.votes[key]) ? data.votes[key] : {};
  const total  = Object.keys(voteMap).length;
  const myVote = rpMyVotes[key] || null;

  // Per-option vote counts
  const counts = {};
  Object.values(voteMap).forEach(v => { counts[v] = (counts[v] || 0) + 1; });

  const voteStatus = document.getElementById('rpVoteStatus');
  voteStatus.style.display = '';
  if (myVote) {
    voteStatus.textContent = 'DEINE STIMME ABGEGEBEN — WARTE AUF GM';
    voteStatus.className = 'rp-vote-status pending';
  } else {
    voteStatus.textContent = total + ' STIMME(N) BISHER ABGEGEBEN';
    voteStatus.className = 'rp-vote-status';
  }

  // Build option buttons with live vote badges
  const optsEl = document.getElementById('rpPuzOpts');
  optsEl.style.display = '';
  optsEl.innerHTML = '';
  pd.opts.forEach(([id, label]) => {
    const btn = document.createElement('button');
    btn.className = 'rp-opt-btn' + (id === myVote ? ' my-vote' : '');

    const labelSpan = document.createElement('span');
    labelSpan.textContent = '[' + id + ']  ' + label;

    // Voter name chips — show who voted for this option
    const voters = Object.entries(voteMap)
      .filter(([, v]) => v === id)
      .map(([name]) => name);

    const badge = document.createElement('span');
    badge.className = 'rp-vote-badge';
    voters.forEach(name => {
      const chip = document.createElement('span');
      chip.className = 'rp-voter-chip' + (name === window.myName ? ' mine' : '');
      chip.textContent = name.toUpperCase();
      badge.appendChild(chip);
    });

    btn.appendChild(labelSpan);
    btn.appendChild(badge);
    btn.addEventListener('click', () => rpCastVote(idx, id));
    optsEl.appendChild(btn);
  });

  document.getElementById('rpResultBlk').classList.remove('show');
  document.getElementById('rpFinal').classList.remove('show');
  document.getElementById('rpPuzOverlay').classList.add('open');
}

// Show result state (correct or wrong) in puzzle modal
function rpShowResult(data) {
  document.getElementById('rpTimeoutOv').classList.remove('open');
  const lr = data.lastResult;
  if (!lr) { rpShowVoting(data); return; }

  rpFillModalHeader(data);
  rpFillPromptHint(data);

  const pd = D['p' + (lr.puzzleIdx + 1)][data.difficulty];

  document.getElementById('rpVoteStatus').style.display = 'none';
  document.getElementById('rpPuzOpts').style.display = 'none';
  document.getElementById('rpFinal').classList.remove('show');

  const resultEl = document.getElementById('rpResultBlk');
  resultEl.classList.add('show');

  if (lr.correct) {
    document.getElementById('rpResultOk').style.display = '';
    document.getElementById('rpResultOkT').textContent  = pd.sucMsg;
    document.getElementById('rpResultAx').textContent   = pd.ax44Suc;
    document.getElementById('rpResultFail').style.display = 'none';
    document.getElementById('rpResultAx').style.color = 'var(--rp-rust)';
  } else {
    document.getElementById('rpResultOk').style.display = 'none';
    document.getElementById('rpResultFail').style.display = '';
    document.getElementById('rpResultFailT').textContent = pd.failMsg + '\n\nAX-44: ' + pd.ax44Fail;
    document.getElementById('rpResultAx').textContent = '';
  }
  document.getElementById('rpWaitingGM').style.display = '';

  document.getElementById('rpPuzOverlay').classList.add('open');
}

// Show finale
function rpShowFinale() {
  document.getElementById('rpTimeoutOv').classList.remove('open');

  // Clear other elements in modal
  document.getElementById('rpPuzAx').style.display   = 'none';
  document.getElementById('rpPuzPrompt').textContent = '';
  document.getElementById('rpPuzHint').style.display  = 'none';
  document.getElementById('rpVoteStatus').style.display = 'none';
  document.getElementById('rpPuzOpts').style.display  = 'none';
  document.getElementById('rpResultBlk').classList.remove('show');

  document.getElementById('rpPuzCorp').textContent  = 'ATLAS STATION // REACTOR CONTROL';
  document.getElementById('rpPuzTitle').textContent = 'REACTOR SHUTDOWN ACCEPTED';
  document.getElementById('rpPuzSub').textContent   = '';

  document.getElementById('rpFinal').classList.add('show');
  document.getElementById('rpPuzOverlay').classList.add('open');
}

// Show timeout overlay
function rpShowTimeout() {
  document.getElementById('rpPuzOverlay').classList.remove('open');
  document.getElementById('rpTimeoutOv').classList.add('open');
}

// Player casts a vote
function rpCastVote(puzzleIdx, optionId) {
  if (!window.myName || !rpState || rpState.phase !== 'voting') return;
  const key = 'p' + puzzleIdx;
  rpMyVotes[key] = optionId;

  // Write to Firebase under the player's name
  const voteRef = ref(window.db, RP_PATH + '/votes/' + key + '/' + window.myName);
  set(voteRef, optionId);

  // Optimistic UI update
  document.querySelectorAll('#rpPuzOpts .rp-opt-btn').forEach((btn, i) => {
    const id = rpState ? D['p' + (puzzleIdx + 1)][rpState.difficulty].opts[i][0] : null;
    btn.classList.toggle('my-vote', id === optionId);
  });
  const vs = document.getElementById('rpVoteStatus');
  vs.textContent = 'DEINE STIMME ABGEGEBEN — WARTE AUF GM';
  vs.className = 'rp-vote-status pending';
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function rpFillModalHeader(data) {
  const idx   = data.currentPuzzle;
  const corps  = ['CORE TEMP CONTROL — BLOCKED', 'COOLANT PRESSURE LOCK — ACTIVE', 'FUSION OUTPUT LOCK — FINAL BARRIER'];
  const titles = ['GUILT PROTOCOL', 'TRUST PROTOCOL', 'SURVIVAL PROTOCOL'];
  const subs   = ['AX-44 SUBSYSTEM ACTIVE', 'AX-44 SUBSYSTEM ACTIVE', 'AX-44 FINAL COGNITIVE TEST'];
  document.getElementById('rpPuzCorp').textContent  = corps[idx];
  document.getElementById('rpPuzTitle').textContent = titles[idx];
  document.getElementById('rpPuzSub').textContent   = subs[idx];
}

function rpFillPromptHint(data) {
  const idx = data.currentPuzzle;
  const pd  = D['p' + (idx + 1)][data.difficulty];

  const axEl = document.getElementById('rpPuzAx');
  if (pd.ax44) {
    document.getElementById('rpPuzAxT').textContent = pd.ax44;
    axEl.style.display = '';
  } else {
    axEl.style.display = 'none';
  }

  document.getElementById('rpPuzPrompt').textContent = pd.prompt;

  const hintEl = document.getElementById('rpPuzHint');
  if (pd.hint) {
    document.getElementById('rpPuzHintT').textContent = pd.hint;
    hintEl.style.display = '';
  } else {
    hintEl.style.display = 'none';
  }
}

function rpStartTimer(data) {
  if (rpTimerRAF) { cancelAnimationFrame(rpTimerRAF); rpTimerRAF = null; }

  function tick() {
    if (!rpState) return;
    const remaining = rpState.timerPaused
      ? rpState.timerDuration
      : Math.max(0, rpState.timerDuration - Math.floor((Date.now() - rpState.timerStart) / 1000));

    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    const el = document.getElementById('rpTimerDisp');
    if (el) {
      el.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
      remaining <= 60 ? el.classList.add('danger') : el.classList.remove('danger');
    }
    rpTimerRAF = requestAnimationFrame(tick);
  }
  rpTimerRAF = requestAnimationFrame(tick);
}

function rpCycleAxMsg() {
  const el = document.getElementById('rpAxMsg');
  if (el) { el.textContent = AX_MSGS[rpAxIdx % AX_MSGS.length]; rpAxIdx++; }
}

// ─── GM PANEL RENDER ──────────────────────────────────────────────────────────
function rpGMRender() {
  const data     = rpState;
  const phase    = data ? data.phase : 'idle';
  const isActive = phase === 'voting';
  const isResult = phase === 'result';
  const isIdle   = !data || !data.active || phase === 'idle';

  // Status label
  const statusEl = document.getElementById('rpGMStatus');
  if (isIdle) {
    statusEl.textContent = 'INAKTIV — PUZZLE NICHT GESTARTET';
    statusEl.className   = 'rp-gm-status idle';
  } else if (phase === 'finished') {
    statusEl.textContent = 'ABGESCHLOSSEN — SHUTDOWN ERFOLGT';
    statusEl.className   = 'rp-gm-status active';
  } else if (phase === 'timeout') {
    statusEl.textContent = 'TIMEOUT — TIMER ABGELAUFEN';
    statusEl.className   = 'rp-gm-status active';
  } else {
    const titles = ['GUILT PROTOCOL', 'TRUST PROTOCOL', 'SURVIVAL PROTOCOL'];
    const idx    = data ? data.currentPuzzle : 0;
    statusEl.textContent = (phase === 'result' ? 'ERGEBNIS — ' : 'AKTIV — ') + titles[idx] + ' // ' + (data.difficulty || '').toUpperCase();
    statusEl.className   = 'rp-gm-status active';
  }

  // Section visibility
  document.getElementById('rpGMSetup').style.display    = isIdle    ? '' : 'none';
  document.getElementById('rpGMControl').style.display  = (isActive || isResult) ? '' : 'none';
  document.getElementById('rpGMTimeout').style.display  = phase === 'timeout'  ? '' : 'none';
  document.getElementById('rpGMFinished').style.display = phase === 'finished' ? '' : 'none';

  if (!isActive && !isResult) return;

  // Vote tally
  const idx     = data.currentPuzzle;
  const key     = 'p' + idx;
  const pd      = D['p' + (idx + 1)][data.difficulty];
  const voteMap = (data.votes && data.votes[key]) ? data.votes[key] : {};
  const counts  = {};
  Object.values(voteMap).forEach(v => { counts[v] = (counts[v] || 0) + 1; });
  const totalVotes = Object.values(counts).reduce((a, b) => a + b, 0);
  const maxCount   = totalVotes > 0 ? Math.max(...Object.values(counts)) : 0;

  // Reset selection if puzzle changed
  if (rpGMSelectedPuz !== idx) { rpGMSelectedOpt = null; rpGMSelectedPuz = idx; }

  const tallyEl = document.getElementById('rpGMTally');
  tallyEl.innerHTML = '';
  pd.opts.forEach(([id, label]) => {
    const count  = counts[id] || 0;
    const isTop  = count > 0 && count === maxCount;
    const isSel  = isActive && id === rpGMSelectedOpt;
    const barPct = totalVotes > 0 ? Math.round(count / totalVotes * 100) : 0;

    const row = document.createElement('div');
    row.className = 'rp-tally-row' +
      (isSel ? ' selected' : (isTop ? ' top-vote' : ''));
    row.innerHTML =
      '<div class="rp-tally-label">[' + id + '] ' + label + '</div>' +
      '<div class="rp-tally-bar-wrap"><div class="rp-tally-bar-fill" style="width:' + barPct + '%"></div></div>' +
      '<div class="rp-tally-count">' + count + '</div>';

    if (isActive) {
      row.addEventListener('click', () => {
        rpGMSelectedOpt = (rpGMSelectedOpt === id) ? null : id;
        rpGMSelectedPuz = idx;
        rpGMRender();
      });
    }
    tallyEl.appendChild(row);
  });

  document.getElementById('rpGMVoteInfo').textContent = totalVotes + ' STIMME(N) ABGEGEBEN';

  const selectPhaseEl  = document.getElementById('rpGMSelectPhase');
  const advanceWrapEl  = document.getElementById('rpGMAdvanceWrap');
  const confirmWrapEl  = document.getElementById('rpGMConfirmWrap');
  const selInfoEl      = document.getElementById('rpGMSelInfo');
  const selLabelEl     = document.getElementById('rpGMSelLabel');
  const lrEl           = document.getElementById('rpGMLastResult');
  const resolveBtn     = document.getElementById('rpResolveBtn');

  if (isActive) {
    selectPhaseEl.style.display = '';
    advanceWrapEl.style.display = 'none';
    selInfoEl.style.display     = 'none';
    confirmWrapEl.style.display = '';

    const confirmBtn = document.getElementById('rpGMConfirmBtn');
    confirmBtn.disabled = false;
    if (rpGMSelectedOpt) {
      const selLabel = (pd.opts.find(([id]) => id === rpGMSelectedOpt) || [])[1] || rpGMSelectedOpt;
      selLabelEl.textContent   = '[' + rpGMSelectedOpt + ']  ' + selLabel;
      selLabelEl.style.display = '';
      confirmBtn.textContent   = '✓ AUSWAHL BESTÄTIGEN';
      confirmBtn.className     = 'rp-gm-btn green';
    } else {
      selLabelEl.style.display = 'none';
      confirmBtn.textContent   = '▸ ERST OPTION OBEN ANKLICKEN';
      confirmBtn.className     = 'rp-gm-btn amber';
    }
  } else {
    // result phase
    selectPhaseEl.style.display = 'none';
    advanceWrapEl.style.display = '';
    const lr = data.lastResult;
    if (lr) {
      lrEl.textContent      = (lr.correct ? '✓ KORREKT' : '✗ FALSCH') + '  //  [' + lr.winner + ']';
      lrEl.style.color      = lr.correct ? '#7fb069' : '#c64225';
      lrEl.style.borderColor = lr.correct ? 'rgba(127,176,105,.35)' : 'rgba(198,66,37,.35)';
      resolveBtn.textContent = lr.correct ? '→ NÄCHSTES PUZZLE' : '↺ NEU ABSTIMMEN';
      resolveBtn.className   = 'rp-gm-btn ' + (lr.correct ? 'green' : 'amber');
    }
  }

  // Timer display in GM panel
  const remaining = data.timerPaused
    ? data.timerDuration
    : Math.max(0, data.timerDuration - Math.floor((Date.now() - data.timerStart) / 1000));
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  const tvEl = document.getElementById('rpGMTimerVal');
  if (tvEl) tvEl.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');

  const pauseBtn = document.getElementById('rpGMPauseBtn');
  if (pauseBtn) pauseBtn.textContent = data.timerPaused ? '▶ RESUME TIMER' : '⏸ PAUSE TIMER';
}
