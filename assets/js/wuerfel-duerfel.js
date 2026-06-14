import { ref, set, remove, get, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { srRoll, srPool } from "./skill-roll.js?v=2";


// ════════════════════════════════════════════════════════
// WÜRFEL DÜRFEL — 1v1 Dice Gambling Minigame
// ════════════════════════════════════════════════════════

// ── State ────────────────────────────────────────────────
let wdState = null;
let wdMyRole = null;
window._wdCurrentBet = 1;
window._wdBluffCall = null;
window._wdDismissed = false;
window._wdLastTs = null;
window._wdRollInterval = null;
window._wdActiveUsers = window._wdActiveUsers || [];

// ── Firebase listener ────────────────────────────────────
window._authReadyPromise.then(() => {
  onValue(ref(window.db, 'wuerfelduerfel'), snap => {
    const d = snap.val();
    wdState = d;
    const overlay = document.getElementById('wdOverlay');
    if (!d) {
      if (overlay.classList.contains('open') && !window.isGM && !window._wdLeaderboard) overlay.classList.remove('open');
      const rb = document.getElementById('wdRejoinBar');
      if (rb) rb.style.display = 'none';
      return;
    }
    if (window._wdLeaderboard) return; // Don't overwrite leaderboard view
    // Determine role — player-name check takes priority so GM can fight
    if (d.p1 === window.myName) wdMyRole = 'p1';
    else if (d.p2 === window.myName) wdMyRole = 'p2';
    else if (window.isGM) wdMyRole = 'gm';
    else wdMyRole = 'spectator';

    // Reset dismissed flag when new game starts
    if (d.ts !== window._wdLastTs) { window._wdDismissed = false; }

    // Reset transient skill-action state on phase / round change
    if (d.phase !== window._wdActionPhase) { window._wdActionHint = ''; window._wdActionPhase = d.phase; }
    if (d.round !== window._wdActionRound) {
      window._wdRerollArmed = false; window._wdCheatSeenTs = null; window._wdActionRound = d.round;
    }
    if (d.phase !== 'reveal') { window._wdRevealSig = null; window._wdShownRolls = null; }
    // GM resolves a pending cheat contest by rolling the victim's OBSERVATION
    if (window.isGM && d.cheatContest && d.cheatContest.status === 'pending'
        && window._wdContestHandled !== d.cheatContest.ts) {
      window._wdContestHandled = d.cheatContest.ts;
      wdResolveCheatContest(d.cheatContest);
    }
    if (!d.cheatContest) window._wdContestHandled = null;

    const isParticipant = wdMyRole === 'p1' || wdMyRole === 'p2' || wdMyRole === 'gm';
    const gameActive = d.phase && d.phase !== 'lobby' && d.phase !== 'gameover';

    // Auto-open for participants (not if they dismissed)
    if (isParticipant && !window._wdDismissed) {
      overlay.classList.add('open');
    }
    // Spectators don't auto-open — they get a watch button
    if (wdMyRole === 'spectator' && !overlay.classList.contains('open')) {
      const rejoinBar = document.getElementById('wdRejoinBar');
      if (rejoinBar) rejoinBar.style.display = gameActive ? '' : 'none';
      return;
    }

    // Show/hide rejoin bar
    const rejoinBar = document.getElementById('wdRejoinBar');
    if (rejoinBar) {
      if (isParticipant && window._wdDismissed && gameActive) {
        rejoinBar.dataset.label = 'REJOIN';
        rejoinBar.style.display = '';
      } else if (wdMyRole === 'spectator' && gameActive) {
        rejoinBar.dataset.label = 'WATCH';
        rejoinBar.style.display = '';
      } else {
        rejoinBar.style.display = 'none';
      }
      const btn = rejoinBar.querySelector('button');
      if (btn) btn.textContent = `🎲 WÜRFEL DÜRFEL — ${rejoinBar.dataset.label||'WATCH'}`;
    }

    const el = document.getElementById('wdContent');
    renderWD(el, d);

    // Cheater learns the outcome of the secret observation probe.
    // Flags set here are applied by the reveal's post-render step (which runs
    // on the 100ms timer scheduled inside renderWD), once the dice are placed.
    const cc = d.cheatContest;
    if (cc && cc.status === 'resolved' && cc.cheater === window.myName
        && window._wdCheatSeenTs !== cc.ts) {
      window._wdCheatSeenTs = cc.ts;
      if (cc.caught) {
        window._wdRerollArmed = false;
        window._wdActionHint = '🃏 ERWISCHT — 0 PUNKTE DIESE RUNDE';
      } else {
        window._wdRerollArmed = true;
        window._wdActionHint = '🃏 UNBEMERKT — WÄHLE EINEN NICHT-SECHSER ZUM NEU WERFEN';
      }
      const obsDice = { base: (cc.obsRoll || []).map(v => ({ v })), stress: [] };
      wdShowSkillRoll('👁 GEGNER-OBSERVATION', obsDice, cc.obsSucc, {
        tone: cc.caught ? 'fail' : 'ok',
        result: cc.caught
          ? 'ERWISCHT — OBS ' + cc.obsSucc + ' ≥ DEIN ' + cc.manipSucc
          : 'UNBEMERKT — OBS ' + cc.obsSucc + ' < DEIN ' + cc.manipSucc,
        note: cc.caught
          ? 'Diese Runde gibt es 0 Punkte für dich.'
          : 'Klicke einen deiner Nicht-Sechser an, um ihn neu zu werfen.',
      });
    }
  });
});

window.wdRejoin = function() {
  window._wdDismissed = false;
  document.getElementById('wdOverlay').classList.add('open');
  const rejoinBar = document.getElementById('wdRejoinBar');
  if (rejoinBar) rejoinBar.style.display = 'none';
  if (wdState) { const el = document.getElementById('wdContent'); renderWD(el, wdState); }
};

// ── Public entry points ───────────────────────────────────
window.openWuerfelLobby = function() {
  if (!window.isGM) return;
  window._authReadyPromise.then(() => {
    remove(ref(window.db, 'wuerfelduerfel')).then(() => {
      const ts = Date.now();
      set(ref(window.db, 'wuerfelduerfel'), {
        phase: 'lobby', mode: 'classic',
        p1: '', p2: '', hostGM: window.myName,
        round: 0,
        ts: ts
      });
      window._wdCurrentBet = 1;
      window._wdBluffCall = null;
      window._wdDismissed = false;
      window._wdLastTs = ts;
      document.getElementById('wdOverlay').classList.add('open');
    });
  });
};

window.closeWD = function() {
  window._wdDismissed = true;
  window._wdLeaderboard = false;
  if (wdState) window._wdLastTs = wdState.ts;
  document.getElementById('wdOverlay').classList.remove('open');
};

window.wdGMClose = function() {
  if (!window.isGM) return;
  window._authReadyPromise.then(() => {
    remove(ref(window.db, 'wuerfelduerfel'));
    window._wdLeaderboard = false;
    document.getElementById('wdOverlay').classList.remove('open');
  });
};

async function wdSaveStats(d) {
  if (!d.champion || !d.p1 || !d.p2) return;
  const winner = d.champion;
  const loser = d.p1 === winner ? d.p2 : d.p1;
  const isDepletion = d.mode === 'depletion';
  for (const [player, won] of [[winner, true], [loser, false]]) {
    const key = player.replace(/[.#$/[\]\s]/g, '_');
    const sRef = ref(window.db, `wuerfelduerfel_stats/${key}`);
    const snap = await get(sRef);
    const s = snap.val() || {};
    await set(sRef, {
      name: player,
      wins:          (s.wins          || 0) + (won ? 1 : 0),
      losses:        (s.losses        || 0) + (won ? 0 : 1),
      classicWins:   (s.classicWins   || 0) + (!isDepletion && won ? 1 : 0),
      depletionWins: (s.depletionWins || 0) + (isDepletion  && won ? 1 : 0),
      lastGame: Date.now()
    });
  }
}

window.wdSetMode = function(mode) {
  if (!window.isGM) return;
  set(ref(window.db, 'wuerfelduerfel/mode'), mode);
};

window.wdSelectFighter = function(name) {
  if (!window.isGM || !wdState) return;
  const d = wdState;
  let p1 = d.p1 || '', p2 = d.p2 || '';
  if (p1 === name) { p1 = ''; }
  else if (p2 === name) { p2 = ''; }
  else if (!p1) { p1 = name; }
  else if (!p2) { p2 = name; }
  else { p1 = name; } // replace p1
  set(ref(window.db, 'wuerfelduerfel/p1'), p1);
  set(ref(window.db, 'wuerfelduerfel/p2'), p2);
};

window.wdStartGame = function() {
  if (!window.isGM || !wdState) return;
  const d = wdState;
  if (!d.p1 || !d.p2) return;
  const ts = Date.now();
  window._wdLastTs = ts;
  set(ref(window.db, 'wuerfelduerfel'), {
    phase: 'betting',
    mode: d.mode || 'classic',
    p1: d.p1, p2: d.p2,
    hostGM: window.myName,
    round: 1,
    dice: { [d.p1]: 10, [d.p2]: 10 },
    bets: {},
    rolls: {},
    bluffCalls: {},
    scores: { [d.p1]: 0, [d.p2]: 0 },
    usedBets: { [d.p1]: [], [d.p2]: [] },
    actionsUsed: {
      [d.p1]: { focus: false, intimidate: false, cheat: false },
      [d.p2]: { focus: false, intimidate: false, cheat: false },
    },
    intimidatedRound: {},
    cheatContest: null,
    history: [],
    tiePot: 0,
    ts: ts,
    champion: '',
    roundCapHit: false,
    depletionOver: false
  });
  window._wdCurrentBet = 1;
  window._wdBluffCall = null;
  window._wdActionHint = '';
  window._wdRerollArmed = false;
  window._wdActionRound = 1;
  window._wdActionPhase = 'betting';
  window._wdCheatSeenTs = null;
  window._wdContestHandled = null;
  _wdRollFired = false;
};

// ── Bet controls ─────────────────────────────────────────
window.wdChangeBet = function(delta) {
  if (!wdState) return;
  const myDice = wdState.dice[window.myName] || 1;
  window._wdCurrentBet = Math.max(1, Math.min(myDice, (window._wdCurrentBet || 1) + delta));
  const el = document.getElementById('wdBetVal');
  if (el) el.textContent = window._wdCurrentBet;
};

window.wdSelectDepletionBet = function(n) {
  if (!wdState) return;
  const d = wdState;
  const used = (d.usedBets && d.usedBets[window.myName]) || [];
  if (used.includes(n)) return;
  window._wdCurrentBet = n;
  // Re-render to reflect selection
  const el = document.getElementById('wdContent');
  if (el) renderWD(el, d);
};

window.wdChangeBluff = function(delta) {
  if (!wdState) return;
  const myDice = wdState.dice[window.myName] || 1;
  const cur = window._wdBluffCall;
  if (cur === null) { window._wdBluffCall = delta > 0 ? 1 : null; }
  else {
    const next = cur + delta;
    window._wdBluffCall = next < 0 ? null : Math.min(myDice, next);
  }
  const el = document.getElementById('wdBluffVal');
  if (el) el.textContent = window._wdBluffCall === null ? '—' : window._wdBluffCall;
};

window.wdLockBet = function() {
  if (!wdState || !window.myName) return;
  const d = wdState;
  const me = window.myName;
  if (me !== d.p1 && me !== d.p2) return;
  const bet = window._wdCurrentBet || 1;
  const myDice = d.dice[me] || 1;
  if (bet < 1 || bet > myDice) return;
  // In depletion mode, bet must not be already used
  if (d.mode === 'depletion') {
    const used = (d.usedBets && d.usedBets[me]) || [];
    if (used.includes(bet)) return;
  }
  set(ref(window.db, `wuerfelduerfel/bets/${me}`), bet);
  const intimidated = (d.intimidatedRound || {})[me] === (d.round || 1);
  if (d.mode === 'depletion' && !intimidated && window._wdBluffCall !== null) {
    set(ref(window.db, `wuerfelduerfel/bluffCalls/${me}`), window._wdBluffCall);
  }
};

// ── Roll (GM-triggered internally after both lock) ──────
let _wdRollFired = false;
function wdDoRoll(d) {
  if (!window.isGM) return;
  if (_wdRollFired) return;
  _wdRollFired = true;
  const p1 = d.p1, p2 = d.p2;
  const dice1 = d.bets[p1] || d.dice[p1] || 10;
  const dice2 = d.bets[p2] || d.dice[p2] || 10;

  function roll(n) { return Array.from({length:n}, () => Math.ceil(Math.random()*6)); }

  const r1 = roll(dice1), r2 = roll(dice2);
  const s1 = r1.filter(v => v===6).length;
  const s2 = r2.filter(v => v===6).length;
  const betDiff = Math.abs((d.bets[p1]||0) - (d.bets[p2]||0));

  set(ref(window.db, 'wuerfelduerfel/phase'), 'rolling');
  setTimeout(() => {
    set(ref(window.db, 'wuerfelduerfel/rolls'), {
      [p1]: r1, [p2]: r2,
      sixes: { [p1]: s1, [p2]: s2 },
      betDiff: betDiff
    });
    set(ref(window.db, 'wuerfelduerfel/phase'), 'reveal');
  }, 2200);
}

// ── Transfer math ────────────────────────────────────────
function wdCalcTransfer(d) {
  const p1 = d.p1, p2 = d.p2;
  const rolls = d.rolls || {};
  const sixes = (rolls.sixes) || {};
  const s1 = sixes[p1] || 0, s2 = sixes[p2] || 0;
  const b1 = (d.bets||{})[p1] || 0, b2 = (d.bets||{})[p2] || 0;
  const betDiff = Math.abs(b1 - b2);
  const transfer = Math.max(1, betDiff);
  let winner = null, loser = null;
  if (s1 > s2) { winner = p1; loser = p2; }
  else if (s2 > s1) { winner = p2; loser = p1; }
  // Tie
  let tiePot = d.tiePot || 0;
  let isTie = (s1 === s2);
  let riskBonus = 0;
  const loserBet = loser ? ((d.bets||{})[loser] || 0) : 0;
  if (loser && loserBet >= 8) riskBonus = 1;
  // Bluff bonus (depletion, winner only)
  let bluffBonus = 0;
  if (d.mode === 'depletion' && winner && d.bluffCalls) {
    const call = d.bluffCalls[winner];
    const winnerSixes = sixes[winner] || 0;
    const winnerBet = (d.bets||{})[winner] || 0;
    if (call !== undefined && call !== null && call === winnerSixes) {
      bluffBonus = winnerBet;
    }
  }
  return { s1, s2, winner, loser, betDiff, tiePot, riskBonus, transfer, isTie, bluffBonus };
}

window.wdNextRound = function() {
  if (!window.isGM || !wdState) return;
  const d = wdState;
  const { winner, loser, transfer, isTie, riskBonus, bluffBonus, tiePot } = wdCalcTransfer(d);
  const p1 = d.p1, p2 = d.p2;

  let dice = { ...d.dice };
  let newTiePot = d.tiePot || 0;
  let scores = { ...(d.scores || {}) };
  let usedBets = { [p1]: [...((d.usedBets||{})[p1]||[])], [p2]: [...((d.usedBets||{})[p2]||[])] };
  const round = d.round || 1;
  const rolls = d.rolls || {};
  const sixes = (rolls.sixes) || {};

  // Record used bets
  const b1 = (d.bets||{})[p1], b2 = (d.bets||{})[p2];
  if (b1 && !usedBets[p1].includes(b1)) usedBets[p1].push(b1);
  if (b2 && !usedBets[p2].includes(b2)) usedBets[p2].push(b2);

  // A cheater caught by the opponent's observation scores 0 this round
  const contest = d.cheatContest;
  const caughtPlayer = (contest && contest.status === 'resolved' && contest.caught) ? contest.cheater : null;
  // intimidation suppresses the victim's bluff bonus for the affected round
  const intim = d.intimidatedRound || {};

  if (d.mode === 'depletion') {
    // Point-based: score += sixes rolled this round (+ bluff bonus for correct call)
    const s1 = sixes[p1]||0, s2 = sixes[p2]||0;
    let bonus1 = 0, bonus2 = 0;
    if (d.bluffCalls) {
      if (intim[p1] !== round && d.bluffCalls[p1] !== undefined && d.bluffCalls[p1] !== null && d.bluffCalls[p1] === s1) bonus1 = b1||0;
      if (intim[p2] !== round && d.bluffCalls[p2] !== undefined && d.bluffCalls[p2] !== null && d.bluffCalls[p2] === s2) bonus2 = b2||0;
    }
    let add1 = s1 + bonus1, add2 = s2 + bonus2;
    if (caughtPlayer === p1) add1 = 0;
    if (caughtPlayer === p2) add2 = 0;
    scores[p1] = (scores[p1]||0) + add1;
    scores[p2] = (scores[p2]||0) + add2;
  } else {
    if (isTie) {
      dice[p1] = Math.max(0, dice[p1] - 1);
      dice[p2] = Math.max(0, dice[p2] - 1);
      newTiePot += 2;
    } else if (winner && loser) {
      const totalTransfer = transfer + riskBonus + bluffBonus + (newTiePot > 0 ? newTiePot : 0);
      dice[loser] = Math.max(0, dice[loser] - totalTransfer);
      dice[winner] = dice[winner] + totalTransfer;
      newTiePot = 0;
      scores[winner] = (scores[winner] || 0) + 1;
    }
  }

  // History entry
  const hist = [...(d.history || [])];
  const histResult = d.mode === 'depletion'
    ? `${p1}:${scores[p1]} / ${p2}:${scores[p2]}`
    : (isTie ? 'TIE' : `${winner} WINS`);
  hist.unshift({ round, result: histResult, dice: { ...dice } });
  if (hist.length > 8) hist.pop();

  // Check game-over conditions
  const newRound = round + 1;
  let phase = 'betting';
  let champion = '';
  let roundCapHit = false;
  let depletionOver = false;

  if (d.mode === 'depletion') {
    if (round >= 10) {
      phase = 'gameover'; roundCapHit = true;
      champion = scores[p1] >= scores[p2] ? p1 : p2;
    } else {
      // No valid bets left for either player?
      for (const pn of [p1, p2]) {
        const used = usedBets[pn];
        if (used.length >= 10) { phase = 'gameover'; depletionOver = true; champion = scores[p1] >= scores[p2] ? p1 : p2; break; }
      }
    }
  } else {
    if (dice[p1] <= 0 || dice[p2] <= 0) {
      phase = 'gameover';
      champion = dice[p1] > dice[p2] ? p1 : p2;
    }
  }

  const update = {
    phase, round: phase === 'betting' ? newRound : round,
    dice, scores, usedBets, bets: {}, rolls: {}, bluffCalls: {},
    actionsUsed: d.actionsUsed || { [p1]: {}, [p2]: {} },
    intimidatedRound: intim,
    cheatContest: null,
    tiePot: newTiePot, history: hist, champion,
    roundCapHit, depletionOver,
    p1: d.p1, p2: d.p2, hostGM: d.hostGM,
    mode: d.mode, ts: d.ts
  };
  if (phase === 'gameover') wdSaveStats(update);
  window._wdCurrentBet = 1;
  window._wdBluffCall = null;
  _wdRollFired = false;
  set(ref(window.db, 'wuerfelduerfel'), update);
};

// ════════════════════════════════════════════════════════
// SKILL ACTIONS — once per duel, decided by a real Alien skill roll
// ════════════════════════════════════════════════════════

// which fighter am I (own-name first so a fighting GM uses their own sheet)
function wdMe() {
  if (!wdState) return null;
  if (wdMyRole === 'p1') return wdState.p1;
  if (wdMyRole === 'p2') return wdState.p2;
  return null;
}
function wdOpponentOf(name) {
  if (!wdState) return null;
  return name === wdState.p1 ? wdState.p2 : wdState.p1;
}

async function wdFetchChar(name) {
  try {
    const snap = await get(ref(window.db, 'characters/' + name));
    return snap.val() || {};
  } catch (e) { return {}; }
}

// fighters without a usable sheet (e.g. a GM-run NPC) still get a fair pool
function wdEnsurePool(char, opts) {
  const p = srPool(char, opts);
  if (p.total > 0) return char;
  return { ...char, attr: { ...(char.attr || {}), [p.attrKey]: 4 } };
}

function wdSkinFor(char) {
  const sel = char && char.diceSkins && char.diceSkins.selected;
  return sel || 'default';
}

// ── Skill-roll result popup (shows the acting player WHAT they rolled) ──
const WD_PIPS = ['⚀','⚁','⚂','⚃','⚄','⚅'];

// roll: { base:[{v}], stress:[{v}] }; opts: { tone, note, btn, onClose }
function wdShowSkillRoll(label, roll, successes, opts = {}) {
  const old = document.getElementById('wdSkillRoll');
  if (old) old.remove();
  const baseDice = (roll.base || []).map(d =>
    `<div class="wd-sr-die${d.v === 6 ? ' six' : ''}">${WD_PIPS[d.v - 1]}</div>`).join('');
  const stressDice = (roll.stress || []).map(d =>
    `<div class="wd-sr-die stress${d.v === 6 ? ' six' : ''}${d.v === 1 ? ' hug' : ''}">${WD_PIPS[d.v - 1]}</div>`).join('');
  const tone = opts.tone || (successes >= 1 ? 'ok' : 'fail');
  const resultTxt = opts.result || (successes >= 1
    ? successes + (successes === 1 ? ' ERFOLG' : ' ERFOLGE')
    : 'KEIN ERFOLG');
  const wrap = document.createElement('div');
  wrap.id = 'wdSkillRoll';
  wrap.className = 'wd-sr-overlay';
  wrap.innerHTML = `
    <div class="wd-sr-panel ${tone}">
      <div class="wd-sr-label">${label}</div>
      <div class="wd-sr-dice">${baseDice}${stressDice}</div>
      <div class="wd-sr-result">${resultTxt}</div>
      ${opts.note ? `<div class="wd-sr-note">${opts.note}</div>` : ''}
      <button class="wd-sr-btn" onclick="wdCloseSkillRoll()">${opts.btn || 'WEITER'}</button>
    </div>`;
  wrap.onclick = (e) => { if (e.target === wrap) window.wdCloseSkillRoll(); };
  document.body.appendChild(wrap);
  window._wdSkillRollCb = opts.onClose || null;
}

window.wdCloseSkillRoll = function() {
  const el = document.getElementById('wdSkillRoll');
  if (el) el.remove();
  const cb = window._wdSkillRollCb; window._wdSkillRollCb = null;
  if (cb) cb();
};

// 🎯 KONZENTRIEREN — reveal phase, own board, WITS roll → reroll a non-six
window.wdActionFocus = async function() {
  if (!wdState || wdState.phase !== 'reveal' || window._wdActionBusy) return;
  const me = wdMe();
  if (!me) return;
  if (((wdState.actionsUsed || {})[me] || {}).focus) return;
  window._wdActionBusy = true;
  try {
    let char = await wdFetchChar(me);
    char = wdEnsurePool(char, { attr: 'wit' });
    const { roll, successes } = await srRoll(window.db, {
      player: me, char, attr: 'wit',
      label: 'KONZENTRIEREN (WITS)', skin: wdSkinFor(char), publish: true, includeStress: false,
    });
    if (successes >= 1) {
      window._wdRerollArmed = true;
      window._wdActionHint = '🎯 ' + successes + ' ERFOLG — WÄHLE EINEN NICHT-SECHSER ZUM NEU WERFEN';
    } else {
      window._wdRerollArmed = false;
      window._wdActionHint = '🎯 KONZENTRIEREN FEHLGESCHLAGEN — KEIN ERFOLG';
    }
    await set(ref(window.db, 'wuerfelduerfel/actionsUsed/' + me + '/focus'), true);
    wdShowSkillRoll('🎯 KONZENTRIEREN — WITS', roll, successes, {
      note: successes >= 1 ? 'Klicke danach einen deiner Nicht-Sechser an, um ihn neu zu werfen.' : 'Kein Erfolg — kein Neuwurf.',
    });
  } finally { window._wdActionBusy = false; }
};

// 🃏 SCHUMMELN — reveal phase, MANIPULATION roll, then opponent OBSERVATION probe
window.wdActionCheat = async function() {
  if (!wdState || wdState.phase !== 'reveal' || window._wdActionBusy) return;
  const me = wdMe();
  if (!me) return;
  if (((wdState.actionsUsed || {})[me] || {}).cheat) return;
  const opp = wdOpponentOf(me);
  window._wdActionBusy = true;
  try {
    let char = await wdFetchChar(me);
    char = wdEnsurePool(char, { skill: 'manipulation' });
    const { roll, successes } = await srRoll(window.db, {
      player: me, char, skill: 'manipulation',
      label: 'SCHUMMELN (MANIPULATION)', skin: wdSkinFor(char), publish: true, includeStress: false,
    });
    window._wdActionHint = '🃏 MANIPULATION ' + successes + ' — GEGNER BEOBACHTET…';
    await set(ref(window.db, 'wuerfelduerfel/actionsUsed/' + me + '/cheat'), true);
    await set(ref(window.db, 'wuerfelduerfel/cheatContest'), {
      cheater: me, target: opp, manipSucc: successes,
      obsSucc: 0, caught: false, status: 'pending', ts: Date.now(),
    });
    wdShowSkillRoll('🃏 SCHUMMELN — MANIPULATION', roll, successes, {
      tone: successes >= 1 ? 'ok' : 'fail',
      result: successes + (successes === 1 ? ' ERFOLG' : ' ERFOLGE'),
      note: 'Der Gegner würfelt jetzt verdeckt OBSERVATION dagegen …',
    });
  } finally { window._wdActionBusy = false; }
};

// 😠 EINSCHÜCHTERN — betting phase, MANIPULATION roll → block opponent's next bluff
window.wdActionIntimidate = async function() {
  if (!wdState || wdState.phase !== 'betting' || window._wdActionBusy) return;
  const me = wdMe();
  if (!me) return;
  if (((wdState.actionsUsed || {})[me] || {}).intimidate) return;
  const opp = wdOpponentOf(me);
  window._wdActionBusy = true;
  try {
    let char = await wdFetchChar(me);
    char = wdEnsurePool(char, { skill: 'manipulation' });
    const { roll, successes } = await srRoll(window.db, {
      player: me, char, skill: 'manipulation',
      label: 'EINSCHÜCHTERN (MANIPULATION)', skin: wdSkinFor(char), publish: true, includeStress: false,
    });
    if (successes >= 1) {
      window._wdActionHint = '😠 GELUNGEN — ' + opp + ' KANN NÄCHSTE RUNDE NICHT ANSAGEN';
    } else {
      window._wdActionHint = '😠 EINSCHÜCHTERN FEHLGESCHLAGEN';
    }
    await set(ref(window.db, 'wuerfelduerfel/actionsUsed/' + me + '/intimidate'), true);
    wdShowSkillRoll('😠 EINSCHÜCHTERN — MANIPULATION', roll, successes, {
      note: successes >= 1
        ? opp + ' kann nächste Runde keine Ansage machen.'
        : 'Kein Erfolg — der Gegner bleibt unbeeindruckt.',
    });
    if (successes >= 1) {
      await set(ref(window.db, 'wuerfelduerfel/intimidatedRound/' + opp), (wdState.round || 1) + 1);
    }
  } finally { window._wdActionBusy = false; }
};

// GM-side: roll the cheat victim's OBSERVATION and write the verdict
async function wdResolveCheatContest(contest) {
  if (!window.isGM) return;
  let char = await wdFetchChar(contest.target);
  char = wdEnsurePool(char, { skill: 'observation' });
  const { roll, successes: obsSucc } = await srRoll(window.db, {
    player: contest.target, char, skill: 'observation',
    label: 'OBSERVATION (SCHUMMEL-CHECK)', skin: wdSkinFor(char), publish: true, includeStress: false,
  });
  const obsRoll = (roll.base || []).concat(roll.stress || []).map(d => d.v);
  const caught = obsSucc >= contest.manipSucc;
  await set(ref(window.db, 'wuerfelduerfel/cheatContest'), { ...contest, obsSucc, obsRoll, caught, status: 'resolved' });
}

// make my non-six dice clickable for a single secret/concentration reroll
function wdArmReroll(me) {
  const layer = document.getElementById('wdDice-' + me);
  if (!layer) return;
  [...layer.children].forEach((el, i) => {
    if (el.classList.contains('six')) return;
    el.classList.add('wd-rerollable');
    el.onclick = () => window.wdDoReroll(me, i);
  });
}

window.wdDoReroll = function(me, idx) {
  if (!wdState || !window._wdRerollArmed) return;
  const rolls = wdState.rolls || {};
  const arr = [...((rolls[me]) || [])];
  if (idx < 0 || idx >= arr.length || arr[idx] === 6) return;
  arr[idx] = 1 + Math.floor(Math.random() * 6);
  const sixes = { ...(rolls.sixes || {}) };
  sixes[me] = arr.filter(v => v === 6).length;
  window._wdRerollArmed = false;
  window._wdActionHint = '';
  set(ref(window.db, 'wuerfelduerfel/rolls'), { ...rolls, [me]: arr, sixes });
};

// reapply transient local state (hint text + reroll arming) after a render
function wdApplyLocalRevealState(d) {
  const hint = document.getElementById('wdActionHint');
  if (hint) hint.textContent = window._wdActionHint || '';
  if (window._wdRerollArmed && (wdMyRole === 'p1' || wdMyRole === 'p2')) {
    wdArmReroll(wdMe());
  }
}

// ── Render dispatcher ────────────────────────────────────
function renderWD(el, d) {
  // Keep title/subtitle
  let inner = `<div class="wd-corner tl"></div><div class="wd-corner tr"></div><div class="wd-corner bl"></div><div class="wd-corner br"></div>`;
  inner += `<div class="wd-title">WÜRFEL DÜRFEL</div><div class="wd-subtitle">// 1v1 DICE COMBAT //</div>`;
  if (wdMyRole === 'gm') {
    inner += `<button class="wd-close-btn" onclick="wdGMClose()">✕ END GAME</button>`;
  } else {
    inner += `<button class="wd-close-btn" onclick="closeWD()">✕ CLOSE</button>`;
  }
  inner += `<button class="wd-lb-header-btn" onclick="wdOpenLeaderboard()">📊 STANDINGS</button>`;

  if (!d.phase || d.phase === 'lobby') { inner += renderWDLobby(d); }
  else if (d.phase === 'betting')  { inner += renderWDBetting(d); }
  else if (d.phase === 'rolling')  { inner += renderWDRolling(d); }
  else if (d.phase === 'reveal')   { inner += renderWDReveal(d); }
  else if (d.phase === 'gameover') { inner += renderWDGameover(d); }

  el.innerHTML = inner;

  // Post-render: kick off roll check or reveal animation
  if (d.phase === 'rolling') {
    if (window._wdRollInterval) clearInterval(window._wdRollInterval);
    window._wdRollInterval = setInterval(() => {
      document.querySelectorAll('.wd-die-anim').forEach(die => {
        die.textContent = ['⚀','⚁','⚂','⚃','⚄','⚅'][Math.floor(Math.random()*6)];
      });
    }, 120);
  } else {
    if (window._wdRollInterval) { clearInterval(window._wdRollInterval); window._wdRollInterval = null; }
  }

  if (d.phase === 'reveal') {
    // animate only when the dice themselves changed (entry or a reroll);
    // sub-renders (actions, cheat contest) place the dice settled, no replay
    const sig = JSON.stringify(d.rolls || {});
    const animate = sig !== window._wdRevealSig;
    window._wdRevealSig = sig;
    setTimeout(() => wdAnimateReveal(d, animate), 100);
  }

  // Restore the transient action hint after a betting re-render
  if (d.phase === 'betting') {
    const h = document.getElementById('wdActionHint');
    if (h) h.textContent = window._wdActionHint || '';
  }

  // Auto-trigger roll when both bets locked (GM only)
  if (d.phase === 'betting' && window.isGM) {
    const bets = d.bets || {};
    if (bets[d.p1] && bets[d.p2]) {
      setTimeout(() => {
        if (wdState && wdState.phase === 'betting' && wdState.bets && wdState.bets[d.p1] && wdState.bets[d.p2]) {
          set(ref(window.db, 'wuerfelduerfel/phase'), 'rolling').then(() => wdDoRoll(d));
        }
      }, 800);
    }
  }
}

// ── LOBBY ────────────────────────────────────────────────
function renderWDLobby(d) {
  if (!window.isGM) {
    return `<div class="wd-waiting">// WAITING FOR GM //<br><br>🎲</div>`;
  }
  const users = (window._wdActiveUsers || []);
  const p1 = d.p1 || '', p2 = d.p2 || '';
  const mode = d.mode || 'classic';

  const chips = users.map(u => {
    const cls = u.name === p1 ? 'p1' : (u.name === p2 ? 'p2' : '');
    const tag = u.name === p1 ? ' [F1]' : (u.name === p2 ? ' [F2]' : '');
    return `<div class="wd-user-chip ${cls}" onclick="wdSelectFighter('${u.name}')">${u.name}${tag}</div>`;
  }).join('');

  const canStart = p1 && p2;
  return `
    <div class="wd-lobby">
      <div class="wd-lobby-fighters">
        <div class="wd-fighter-slot ${p1 ? 'filled' : ''}">
          <div class="wd-fighter-slot-label">// FIGHTER 1</div>
          <div class="wd-fighter-name">${p1 || '—'}</div>
        </div>
        <div class="wd-vs-text">VS</div>
        <div class="wd-fighter-slot ${p2 ? 'filled' : ''}">
          <div class="wd-fighter-slot-label">// FIGHTER 2</div>
          <div class="wd-fighter-name">${p2 || '—'}</div>
        </div>
      </div>
      <div>
        <div class="wd-subtitle" style="text-align:left;margin-bottom:8px;">// SELECT FIGHTERS</div>
        <div class="wd-lobby-users">${chips || '<span style="color:var(--dim);font-size:10px">NO PLAYERS ONLINE</span>'}</div>
      </div>
      <div>
        <div class="wd-subtitle" style="text-align:left;margin-bottom:8px;">// SELECT MODE</div>
        <div class="wd-mode-row">
          <div class="wd-mode-card ${mode==='classic'?'active':''}" onclick="wdSetMode('classic')">
            <h3>⚀ CLASSIC</h3>
            <p>Unlimited rounds. Each bet risks any number of your dice. Win by wiping out your opponent.</p>
          </div>
          <div class="wd-mode-card ${mode==='depletion'?'active':''}" onclick="wdSetMode('depletion')">
            <h3>☠ DEPLETION + DEAD MAN'S BLUFF</h3>
            <p>Each bet value (1–10) usable only once per game. Predict your sixes for a bonus transfer. 10-round hard cap.</p>
          </div>
        </div>
      </div>
      <button class="wd-start-btn" onclick="wdStartGame()" ${canStart?'':'disabled'}>
        ${canStart ? `⚔ BEGIN — ${p1} vs ${p2}` : 'SELECT BOTH FIGHTERS'}
      </button>
    </div>`;
}

// ── BETTING ─────────────────────────────────────────────
function renderWDBetting(d) {
  const p1 = d.p1, p2 = d.p2;
  const bets = d.bets || {};
  const scores = d.scores || {};
  const dice = d.dice || {};
  const round = d.round || 1;
  const mode = d.mode || 'classic';
  const isPlayer = (wdMyRole === 'p1' || wdMyRole === 'p2');
  const me = (wdMyRole === 'p1') ? p1 : (wdMyRole === 'p2' ? p2 : null);
  const myLocked = me && !!bets[me];
  const p1Locked = !!bets[p1], p2Locked = !!bets[p2];

  const roundsLeft = 10 - round;
  const depWarn = (mode === 'depletion' && roundsLeft <= 2) ? 'wd-rounds-warn' : '';

  const vsCol = `
    <div class="wd-vs-col">
      <div class="wd-vs-text">VS</div>
      <div class="wd-round-label">ROUND</div>
      <div class="wd-round-num">${round}</div>
      ${mode==='depletion' ? `<div class="wd-round-label ${depWarn}">${roundsLeft} LEFT</div>` : ''}
      <div class="wd-lock-status" style="margin-top:8px">
        <div class="${p1Locked?'locked':'waiting'}">${p1}: ${p1Locked?'✓ LOCKED':'BETTING...'}</div>
        <div class="${p2Locked?'locked':'waiting'}">${p2}: ${p2Locked?'✓ LOCKED':'BETTING...'}</div>
      </div>
    </div>`;

  function boardHTML(pname, isMe) {
    const myDice = dice[pname] || 0;
    const locked = !!bets[pname];
    const pts = scores[pname] || 0;
    // In depletion mode show numeric point total; classic shows win-pip dots
    const scoreDisplay = mode === 'depletion'
      ? `<div style="font-size:11px;letter-spacing:2px;color:var(--amber);margin-top:4px;">${pts} PTS</div>`
      : `<div class="wd-score-row">${Array.from({length:Math.max(pts,0)},()=>`<div class="wd-score-pip win"></div>`).join('')}</div>`;

    let betUI = '';
    if (isMe && !locked) {
      if (mode === 'classic') {
        window._wdCurrentBet = Math.max(1, Math.min(myDice, window._wdCurrentBet || 1));
        const val = window._wdCurrentBet;
        betUI = `
          <div class="wd-bet-input">
            <div class="wd-bet-label">// BET (DICE TO RISK)</div>
            <div class="wd-stepper">
              <button class="wd-step-btn" onclick="wdChangeBet(-1)">−</button>
              <div class="wd-step-val" id="wdBetVal">${val}</div>
              <button class="wd-step-btn" onclick="wdChangeBet(1)">+</button>
            </div>
          </div>`;
        betUI += `<button class="wd-lock-btn" onclick="wdLockBet()" ${window._wdCurrentBet<1||window._wdCurrentBet>myDice?'disabled':''}>🔒 LOCK BET</button>`;
      } else {
        // Depletion: all 1–10 always available; used ones crossed out
        const used = (d.usedBets||{})[pname] || [];
        const selBet = window._wdCurrentBet || 1;
        const btns = Array.from({length:10},(_,i)=>i+1).map(n => {
          const isUsed = used.includes(n);
          const cls = isUsed ? 'used' : (n===selBet ? 'selected' : '');
          return `<button class="wd-dep-btn ${cls}" onclick="wdSelectDepletionBet(${n})">${n}</button>`;
        }).join('');
        const bluffVal = window._wdBluffCall === null ? '—' : window._wdBluffCall;
        const selUsed = used.includes(window._wdCurrentBet||1);
        const blocked = (d.intimidatedRound||{})[pname] === (d.round||1);
        const bluffRow = blocked
          ? `<div class="wd-bluff-row"><div class="wd-bluff-label wd-intimidated">😠 EINGESCHÜCHTERT — KEINE ANSAGE DIESE RUNDE</div></div>`
          : `<div class="wd-bluff-row">
              <div class="wd-bluff-label">// PREDICT SIXES (OPTIONAL BONUS)</div>
              <button class="wd-step-btn" style="width:28px;height:28px;font-size:14px" onclick="wdChangeBluff(-1)">−</button>
              <div class="wd-bluff-val" id="wdBluffVal">${bluffVal}</div>
              <button class="wd-step-btn" style="width:28px;height:28px;font-size:14px" onclick="wdChangeBluff(1)">+</button>
            </div>`;
        const aUsed = (d.actionsUsed||{})[pname] || {};
        betUI = `
          <div class="wd-bet-input">
            <div class="wd-bet-label">// DICE TO ROLL (ONCE PER GAME)</div>
            <div class="wd-dep-grid">${btns}</div>
            ${bluffRow}
          </div>
          <button class="wd-lock-btn" onclick="wdLockBet()" ${selUsed?'disabled':''}>🔒 LOCK BET</button>
          <div class="wd-action-bar">
            <button class="wd-action-btn intimidate" data-tip="MANIPULATION-Wurf gegen den Gegner. Bei ≥1 Erfolg darf er in der nächsten Runde keine Bluff-Ansage machen." ${aUsed.intimidate?'disabled':''} onclick="wdActionIntimidate()"><span>😠 EINSCHÜCHTERN${aUsed.intimidate?' ✓':''}</span><span class="wd-action-sub">MANIPULATION</span></button>
          </div>
          <div class="wd-action-hint" id="wdActionHint"></div>`;
      }
    } else if (locked && isMe) {
      betUI = `<div style="margin-top:12px;color:var(--green);font-size:11px;letter-spacing:2px;">✓ BET LOCKED</div>`;
    } else if (!isMe && (isPlayer || wdMyRole === 'spectator')) {
      // opponent / spectator board — hidden bet info
      betUI = locked ? `<div style="margin-top:12px;color:var(--green);font-size:11px;letter-spacing:2px;">✓ LOCKED</div>` :
                       `<div style="margin-top:12px;color:var(--dim);font-size:11px;letter-spacing:2px;">BETTING...</div>`;
      if (mode === 'depletion') {
        const oppUsed = (d.usedBets||{})[pname] || [];
        const btns = Array.from({length:10},(_,i)=>i+1).map(n => {
          const isUsed = oppUsed.includes(n);
          return `<div class="wd-dep-btn ${isUsed?'used':'hidden-slot'}">${isUsed?n:'?'}</div>`;
        }).join('');
        betUI += `<div class="wd-dep-grid" style="margin-top:8px">${btns}</div>`;
      }
    } else if (window.isGM && !isMe) {
      // GM spectating a board they're not playing — sees actual bets
      betUI = `<div style="margin-top:10px;font-size:11px;color:var(--amber);letter-spacing:2px;">BET: ${bets[pname]||'—'}</div>`;
      if (mode === 'depletion') {
        const oppUsed = (d.usedBets||{})[pname] || [];
        const btns = Array.from({length:10},(_,i)=>i+1).map(n => {
          const isUsed = oppUsed.includes(n);
          return `<div class="wd-dep-btn ${isUsed?'used':''}">${n}</div>`;
        }).join('');
        betUI += `<div class="wd-dep-grid" style="margin-top:8px">${btns}</div>`;
      }
    }

    const diceLabel = mode === 'depletion' ? 'DICE IN POOL' : 'DICE REMAINING';
    return `
      <div class="wd-board ${isMe?'my-board':''} ${locked?'locked':''}">
        <div class="wd-board-name">${pname}${isMe?' (YOU)':''}</div>
        <div class="wd-board-dice">${mode==='depletion' ? pts : myDice}</div>
        <div class="wd-board-dice-label">${mode==='depletion' ? 'POINTS' : diceLabel}</div>
        ${scoreDisplay}
        ${betUI}
      </div>`;
  }

  const board1 = boardHTML(p1, wdMyRole==='p1');
  const board2 = boardHTML(p2, wdMyRole==='p2');

  return `
    <div class="wd-bet-layout">
      ${board1}${vsCol}${board2}
    </div>
    ${wdHistoryHTML(d)}`;
}

// ── ROLLING ───────────────────────────────────────────────
function renderWDRolling(d) {
  const n1 = (d.bets&&d.bets[d.p1]) || d.dice[d.p1]||0;
  const n2 = (d.bets&&d.bets[d.p2]) || d.dice[d.p2]||0;
  const dice1 = Array.from({length:n1},()=>`<div class="wd-die-anim">⚀</div>`).join('');
  const dice2 = Array.from({length:n2},()=>`<div class="wd-die-anim">⚀</div>`).join('');
  return `
    <div class="wd-rolling-wrap">
      <div class="wd-slam-text">WÜRFELN!</div>
      <div style="margin-top:16px;font-size:10px;letter-spacing:3px;color:var(--dim)">${d.p1}</div>
      <div class="wd-rolling-dice-row">${dice1}</div>
      <div style="margin-top:10px;font-size:10px;letter-spacing:3px;color:var(--dim)">${d.p2}</div>
      <div class="wd-rolling-dice-row">${dice2}</div>
    </div>`;
}

// ── REVEAL ────────────────────────────────────────────────
function renderWDReveal(d) {
  const mode = d.mode || 'classic';
  const calc = wdCalcTransfer(d);
  const { winner, loser, isTie, transfer, riskBonus, bluffBonus, tiePot } = calc;
  const p1 = d.p1, p2 = d.p2;
  const rolls = d.rolls || {};
  const r1 = rolls[p1] || [], r2 = rolls[p2] || [];
  const s1 = (rolls.sixes||{})[p1]||0, s2 = (rolls.sixes||{})[p2]||0;

  function boardReveal(pname, rollArr) {
    const wl = winner === pname ? 'winner' : (loser === pname ? 'loser' : '');
    return `
      <div class="wd-reveal-board ${wl}" id="wdBoard-${pname}">
        <div class="wd-reveal-name">${pname}</div>
        <div class="wd-dice-table" id="wdDice-${pname}"></div>
        <div class="wd-sixes-count" id="wdSixes-${pname}"></div>
        <div class="wd-transfer-label" id="wdXfer-${pname}" style="opacity:0"></div>
      </div>`;
  }

  // Result label
  const isViewer = wdMyRole === 'p1' || wdMyRole === 'p2';
  let resultText, resultCls;
  if (mode === 'depletion') {
    // No win/lose in depletion — just round result
    resultText = isTie ? 'DRAW' : (winner + ' LEADS');
    resultCls = isTie ? 'tie' : 'win';
  } else {
    if (isViewer) {
      const me = wdMyRole === 'p1' ? p1 : p2;
      resultText = isTie ? 'TIE' : (winner===me ? 'YOU WIN!' : 'YOU LOSE!');
      resultCls = isTie ? 'tie' : (winner===me ? 'win' : 'lose');
    } else {
      resultText = isTie ? 'TIE' : (winner ? winner + ' WINS' : '');
      resultCls = isTie ? 'tie' : 'win';
    }
  }
  let myResult = `<div class="wd-result-banner ${resultCls}" id="wdResultBanner" style="opacity:0">${resultText}</div>`;

  let gmMath = '';
  if (window.isGM) {
    const b1 = (d.bets||{})[p1]||0, b2 = (d.bets||{})[p2]||0;
    if (mode === 'depletion') {
      const ccm = d.cheatContest;
      const caughtM = (ccm && ccm.status === 'resolved' && ccm.caught) ? ccm.cheater : null;
      const pts1 = caughtM===p1 ? 0 : s1 + (bluffBonus && winner===p1 ? bluffBonus : 0);
      const pts2 = caughtM===p2 ? 0 : s2 + (bluffBonus && winner===p2 ? bluffBonus : 0);
      gmMath = `
        <div class="wd-gm-math" id="wdGMmath" style="opacity:0">
          <div>DICE ROLLED: <span class="hi">${p1}=${b1}</span> vs <span class="hi">${p2}=${b2}</span></div>
          <div>SIXES: <span class="hi">${p1}=${s1}</span> vs <span class="hi">${p2}=${s2}</span></div>
          <div>POINTS THIS ROUND: <span class="hi">${p1}+${pts1}</span> / <span class="hi">${p2}+${pts2}</span></div>
          ${bluffBonus ? `<div>BLUFF BONUS: <span class="hi">+${bluffBonus}</span> pts to <span class="hi">${winner}</span></div>` : ''}
          ${caughtM ? `<div>CHEAT CAUGHT: <span class="hi">${caughtM}</span> → 0 pts (obs ${ccm.obsSucc} ≥ manip ${ccm.manipSucc})</div>` : ''}
        </div>`;
    } else {
      const totalXfer = transfer + riskBonus + bluffBonus + (winner?tiePot:0);
      gmMath = `
        <div class="wd-gm-math" id="wdGMmath" style="opacity:0">
          <div>BETS: <span class="hi">${p1}=${b1}</span> vs <span class="hi">${p2}=${b2}</span> → diff=<span class="hi">${Math.abs(b1-b2)}</span></div>
          <div>SIXES: <span class="hi">${p1}=${s1}</span> vs <span class="hi">${p2}=${s2}</span></div>
          ${isTie ? `<div>TIE — each loses 1 die to pot (pot now <span class="hi">${(d.tiePot||0)+2}</span>)</div>` :
            `<div>TRANSFER: base=<span class="hi">${transfer}</span>${riskBonus?` +risk=<span class="hi">${riskBonus}</span>`:''}${bluffBonus?` +bluff=<span class="hi">${bluffBonus}</span>`:''}${tiePot>0?` +pot=<span class="hi">${tiePot}</span>`:''}  → TOTAL=<span class="hi">${totalXfer}</span></div>`}
        </div>`;
    }
    myResult += gmMath + `<button class="wd-next-btn" id="wdNextBtn" style="opacity:0" onclick="wdNextRound()">→ NEXT ROUND</button>`;
  }

  // CAUGHT banner — visible to everyone when an opponent's observation flags a cheat
  const cc = d.cheatContest;
  let caughtBanner = '';
  if (cc && cc.status === 'resolved' && cc.caught) {
    caughtBanner = `<div class="wd-caught-banner">🃏 ${cc.cheater} BEIM SCHUMMELN ERWISCHT — 0 PUNKTE</div>`;
  }

  // Skill-action bar for the acting fighter (depletion only)
  let actionBar = '';
  if (mode === 'depletion' && (wdMyRole === 'p1' || wdMyRole === 'p2')) {
    const me = wdMyRole === 'p1' ? p1 : p2;
    const aUsed = (d.actionsUsed||{})[me] || {};
    actionBar = `
      <div class="wd-action-bar" id="wdActionBar" style="opacity:0">
        <button class="wd-action-btn focus" data-tip="WITS-Wurf. Bei ≥1 Erfolg darfst du einen deiner Nicht-Sechser neu werfen." ${aUsed.focus?'disabled':''} onclick="wdActionFocus()"><span>🎯 KONZENTRIEREN${aUsed.focus?' ✓':''}</span><span class="wd-action-sub">WITS</span></button>
        <button class="wd-action-btn cheat" data-tip="Heimlicher Neuwurf via MANIPULATION. Der Gegner würfelt verdeckt OBSERVATION dagegen — schafft er ≥ deine Erfolge, wirst du erwischt: 0 Punkte diese Runde." ${aUsed.cheat?'disabled':''} onclick="wdActionCheat()"><span>🃏 SCHUMMELN${aUsed.cheat?' ✓':''}</span><span class="wd-action-sub">MANIPULATION vs. OBSERVATION</span></button>
      </div>
      <div class="wd-action-hint" id="wdActionHint"></div>`;
  }

  return `
    <div class="wd-reveal-layout">
      ${boardReveal(p1,r1)}
      ${boardReveal(p2,r2)}
    </div>
    ${caughtBanner}
    ${myResult}
    ${actionBar}
    ${wdHistoryHTML(d)}`;
}

// ── Reveal dice (dice-table style) ─────────────────────────
const WD_SIX_COLORS = {
  pc1: { bg:'#33220a', fg:'#ffc370' },  // amber / gold
  pc2: { bg:'#54190d', fg:'#f0e6d2' },  // derelict rust
};

// success-face for the 6 — geometry from the dice-table six artwork
function wdSixSVG(pc) {
  const { bg, fg } = WD_SIX_COLORS[pc] || WD_SIX_COLORS.pc1;
  return `
    <svg class="wd-sym wd-sym-six" viewBox="0 0 500 500" aria-hidden="true">
      <rect width="500" height="500" rx="80" ry="80" fill="${bg}"/>
      <rect x="75" y="75" width="350" height="350" rx="55" ry="55" fill="none" stroke="${fg}" stroke-width="16"/>
      <line x1="75" y1="250" x2="210" y2="250" stroke="${fg}" stroke-width="16" stroke-linecap="round"/>
      <line x1="290" y1="250" x2="425" y2="250" stroke="${fg}" stroke-width="16" stroke-linecap="round"/>
      <line x1="250" y1="75" x2="250" y2="210" stroke="${fg}" stroke-width="16" stroke-linecap="round"/>
      <line x1="250" y1="290" x2="250" y2="425" stroke="${fg}" stroke-width="16" stroke-linecap="round"/>
      <polygon points="250,205 295,250 250,295 205,250" fill="${fg}"/>
      <text x="115" y="195" font-family="'Arial Rounded MT Bold','Arial',sans-serif" font-size="115" font-weight="bold" fill="${fg}" text-anchor="middle" dominant-baseline="central">6</text>
    </svg>`;
}

// scatter dice on the board (percent coords, min distance, rejection sampling)
function wdScatter(n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    let best = null;
    for (let t = 0; t < 60; t++) {
      const p = { x: 14 + Math.random() * 72, y: 18 + Math.random() * 64 };
      const dMin = Math.min(Infinity, ...pts.map(q => Math.hypot(p.x - q.x, (p.y - q.y) * 1.4)));
      if (dMin > 24) { best = p; break; }
      if (!best || dMin > best.d) best = { ...p, d: dMin };
    }
    pts.push({ x: best.x, y: best.y });
  }
  return pts;
}

// spawn one player's dice onto their board; throws them (animate) or
// places them already settled. Each die carries data-idx = roll index so
// a reroll can map a clicked die back to the rolls array. Returns dice count.
// animSet: null = throw every die; a Set = throw only those indices (others land
// static, in place) — used so a single reroll re-tumbles just its own die.
function wdThrowDice(pname, pc, rollArr, animate = true, animSet = null, round = 0) {
  const layer = document.getElementById(`wdDice-${pname}`);
  if (!layer) return 0;
  layer.innerHTML = '';
  // stable scatter per round+player so re-renders/rerolls don't reshuffle the table
  window._wdPos = window._wdPos || {};
  const key = round + ':' + pname;
  let pos = window._wdPos[key];
  if (!pos || pos.length !== rollArr.length) {
    pos = wdScatter(rollArr.length).map(p => ({ x: p.x, y: p.y, rot: Math.floor(Math.random() * 360) }));
    window._wdPos[key] = pos;
  }
  const partial = animSet !== null;
  rollArr.forEach((v, i) => {
    const el = document.createElement('div');
    el.className = `wd-die ${pc} face-${v}`;
    el.dataset.idx = i;
    el.style.left = pos[i].x + '%';
    el.style.top  = pos[i].y + '%';
    el.style.setProperty('--rot', pos[i].rot + 'deg');
    el.innerHTML = `<div class="wd-num"></div>` + wdSixSVG(pc);
    layer.appendChild(el);

    const throwThis = animate && (animSet === null || animSet.has(i));
    if (!throwThis) {
      el.classList.add('settled');
      if (v === 6) el.classList.add('six');
      return;
    }

    const delay = partial ? 0 : i * 110;
    el.classList.add('thrown');
    el.style.animationDelay = delay + 'ms';
    // tumble faces while in flight
    const iv = setInterval(() => {
      el.className = el.className.replace(/face-\d/, 'face-' + (1 + Math.floor(Math.random() * 6)));
    }, 90);
    setTimeout(() => {
      clearInterval(iv);
      el.className = el.className.replace(/face-\d/, 'face-' + v);
      el.classList.add('settled');
      if (v === 6) el.classList.add('six');
    }, delay + 650);
  });
  return rollArr.length;
}

// indices where two roll arrays differ (length mismatch ⇒ all changed)
function wdDiffIdx(prev, next) {
  const s = new Set();
  const n = Math.max((prev || []).length, (next || []).length);
  for (let i = 0; i < n; i++) if ((prev || [])[i] !== (next || [])[i]) s.add(i);
  return s;
}

// ── Reveal cinematic animation ─────────────────────────────
function wdAnimateReveal(d, animate = true) {
  const p1 = d.p1, p2 = d.p2;
  const rolls = d.rolls || {};
  const r1 = rolls[p1]||[], r2 = rolls[p2]||[];
  const s1 = (rolls.sixes||{})[p1]||0, s2 = (rolls.sixes||{})[p2]||0;
  const { winner, loser, transfer, isTie, riskBonus, bluffBonus, tiePot } = wdCalcTransfer(d);

  // A reroll = same round already shown, only some dice changed. Then we re-tumble
  // ONLY the changed dice and skip the full cinematic (labels just refresh in place).
  const prev = window._wdShownRolls;
  const sameRound = prev && prev.round === d.round;
  if (!sameRound) window._wdPos = {};   // new reveal → reshuffle the table once
  const isReroll = animate && sameRound;
  const set1 = isReroll ? wdDiffIdx(prev.rolls[p1], r1) : null;
  const set2 = isReroll ? wdDiffIdx(prev.rolls[p2], r2) : null;
  window._wdShownRolls = { round: d.round, rolls: { [p1]: r1.slice(), [p2]: r2.slice() } };

  const A = (animate && !isReroll) ? 1 : 0;   // full cinematic only on a fresh reveal
  const STEP = 110;       // stagger between dice (same as dice table)
  const FLIGHT = 650;     // dtThrow duration

  // Step 1: both players' dice fly in (or land instantly), dice-table style
  const n1 = wdThrowDice(p1, 'pc1', r1, animate, set1, d.round);
  const n2 = wdThrowDice(p2, 'pc2', r2, animate, set2, d.round);
  let t = ((Math.max(n1, n2) - 1) * STEP + FLIGHT + 350) * A;

  // Step 5: show sixes counts
  setTimeout(() => {
    const el1 = document.getElementById(`wdSixes-${p1}`);
    const el2 = document.getElementById(`wdSixes-${p2}`);
    if (el1) el1.textContent = `${s1} SIX${s1!==1?'ES':''}`;
    if (el2) el2.textContent = `${s2} SIX${s2!==1?'ES':''}`;
  }, t);
  t += 500 * A;

  // Step 6: winner glow / loser dim (already CSS via .winner/.loser)
  // Step 7: transfer / points labels
  const cc = d.cheatContest;
  const caughtP = (cc && cc.status === 'resolved' && cc.caught) ? cc.cheater : null;
  setTimeout(() => {
    const xf1 = document.getElementById(`wdXfer-${p1}`);
    const xf2 = document.getElementById(`wdXfer-${p2}`);
    if (xf1 && xf2) {
      if (d.mode === 'depletion') {
        const pts1 = caughtP===p1 ? 0 : s1 + (bluffBonus && winner===p1 ? bluffBonus : 0);
        const pts2 = caughtP===p2 ? 0 : s2 + (bluffBonus && winner===p2 ? bluffBonus : 0);
        xf1.textContent = caughtP===p1 ? 'CAUGHT — +0 PTS' : `+${pts1} PTS`;
        xf1.className = 'wd-transfer-label ' + (caughtP===p1?'lose':'gain'); xf1.style.opacity='1';
        xf2.textContent = caughtP===p2 ? 'CAUGHT — +0 PTS' : `+${pts2} PTS`;
        xf2.className = 'wd-transfer-label ' + (caughtP===p2?'lose':'gain'); xf2.style.opacity='1';
      } else if (isTie) {
        xf1.textContent = '−1 DIE (TIE TAX)'; xf1.className='wd-transfer-label lose'; xf1.style.opacity='1';
        xf2.textContent = '−1 DIE (TIE TAX)'; xf2.className='wd-transfer-label lose'; xf2.style.opacity='1';
      } else if (winner) {
        const totalXfer = transfer + riskBonus + bluffBonus + (tiePot > 0 ? tiePot : 0);
        const wx = winner===p1?xf1:xf2, lx = winner===p1?xf2:xf1;
        wx.textContent = `+${totalXfer} DICE`; wx.className='wd-transfer-label gain'; wx.style.opacity='1';
        lx.textContent = `−${totalXfer} DICE`; lx.className='wd-transfer-label lose'; lx.style.opacity='1';
      }
    }
  }, t);
  t += 600 * A;

  // Step 8: result banner
  setTimeout(() => {
    const banner = document.getElementById('wdResultBanner');
    if (banner) { banner.classList.add('animate'); banner.style.opacity = '1'; }
    const math = document.getElementById('wdGMmath');
    if (math) math.style.opacity = '1';
  }, t);
  t += 400 * A;

  // Step 9: next round button + action bar, then reapply local action state
  setTimeout(() => {
    const btn = document.getElementById('wdNextBtn');
    if (btn) btn.style.opacity = '1';
    const bar = document.getElementById('wdActionBar');
    if (bar) bar.style.opacity = '1';
    wdApplyLocalRevealState(d);
  }, t);
}

// ── GAMEOVER ──────────────────────────────────────────────
function renderWDGameover(d) {
  const champ = d.champion || '';
  const dice = d.dice || {};
  const scores = d.scores || {};
  const p1 = d.p1, p2 = d.p2;
  const isDepletion = d.mode === 'depletion';
  let sub = '';
  if (isDepletion) {
    const reason = d.roundCapHit ? '10 ROUNDS — MOST POINTS WINS' : 'ALL BETS EXHAUSTED';
    sub = `<div class="wd-champion-sub">${reason}</div>
           <div style="color:var(--dim);font-size:11px;letter-spacing:2px">${p1}: ${scores[p1]||0} PTS &nbsp;|&nbsp; ${p2}: ${scores[p2]||0} PTS</div>`;
  } else if (d.roundCapHit) {
    sub = `<div class="wd-champion-sub">10 ROUNDS PLAYED — MOST DICE WINS</div>
           <div style="color:var(--dim);font-size:11px;letter-spacing:2px">${p1}: ${dice[p1]||0} DICE &nbsp;|&nbsp; ${p2}: ${dice[p2]||0} DICE</div>`;
  } else {
    const total = (dice[p1]||0)+(dice[p2]||0);
    sub = `<div class="wd-champion-sub">HOLDS ALL ${total} DICE</div>`;
  }
  const againBtn = window.isGM ? `<button class="wd-again-btn" onclick="openWuerfelLobby()">↺ PLAY AGAIN</button>` : '';
  return `
    <div class="wd-gameover">
      <div style="font-size:10px;letter-spacing:4px;color:var(--dim);margin-bottom:12px">// GAME OVER //</div>
      <div class="wd-champion-name">${champ}</div>
      ${sub}
      <div style="margin-top:20px">${againBtn}<button class="wd-lb-btn" onclick="wdOpenLeaderboard()">📊 STANDINGS</button></div>
    </div>
    ${wdHistoryHTML(d)}`;
}

// ── Leaderboard ───────────────────────────────────────────
window.wdOpenLeaderboard = async function() {
  window._wdLeaderboard = true;
  const el = document.getElementById('wdContent');
  const header = `<div class="wd-title">WÜRFEL DÜRFEL</div><div class="wd-subtitle">// HALL OF CHAMPIONS //</div><button class="wd-close-btn" onclick="closeWD()">✕ CLOSE</button>`;
  el.innerHTML = header + `<div style="text-align:center;color:var(--dim);font-size:11px;letter-spacing:2px;padding:40px">LOADING RECORDS...</div>`;
  document.getElementById('wdOverlay').classList.add('open');
  try {
    await window._authReadyPromise;
    const snap = await get(ref(window.db, 'wuerfelduerfel_stats'));
    if (window._wdLeaderboard) {
      el.innerHTML = header + renderWDLeaderboard(snap.val() || {});
    }
  } catch(e) {
    if (window._wdLeaderboard) {
      el.innerHTML = header + `<div style="text-align:center;color:var(--rust);font-size:11px;letter-spacing:2px;padding:40px">ERROR LOADING RECORDS</div>`;
    }
  }
};

window.wdResetLeaderboard = async function() {
  if (!window.isGM) return;
  if (!confirm('Reset the entire WD leaderboard? This cannot be undone.')) return;
  await window._authReadyPromise;
  await remove(ref(window.db, 'wuerfelduerfel_stats'));
  wdOpenLeaderboard();
};

function renderWDLeaderboard(stats) {
  const players = Object.values(stats)
    .filter(p => p && p.name)
    .sort((a, b) => (b.wins||0)-(a.wins||0) || (a.losses||0)-(b.losses||0));
  if (!players.length) {
    const resetBtn = window.isGM ? `<div style="margin-top:16px"><button onclick="wdResetLeaderboard()" style="background:transparent;border:1px solid rgba(198,66,37,0.35);color:rgba(198,66,37,0.8);font-family:'Share Tech Mono',monospace;font-size:9px;padding:6px 16px;cursor:pointer;letter-spacing:2px" onmouseover="this.style.borderColor='var(--rust)';this.style.color='var(--rust)'" onmouseout="this.style.borderColor='rgba(198,66,37,0.35)';this.style.color='rgba(198,66,37,0.8)'">⚠ RESET LEADERBOARD</button></div>` : '';
    return `<div style="text-align:center;color:var(--dim);padding:50px 20px;font-size:11px;letter-spacing:3px">// NO RECORDS YET //${resetBtn}</div>`;
  }
  const rows = players.map((p, i) => {
    const total = (p.wins||0)+(p.losses||0);
    const rate  = total > 0 ? Math.round((p.wins/total)*100) : 0;
    const rankColor = i===0 ? 'var(--amber-hi)' : i===1 ? '#c9c2ad' : i===2 ? 'var(--amber)' : 'var(--dim-2)';
    const nameColor = i===0 ? 'var(--amber-hi)' : 'var(--bone-2)';
    return `<tr>
      <td style="color:${rankColor};font-size:10px;width:36px">#${i+1}</td>
      <td style="text-align:left;padding-left:12px;color:${nameColor}">${p.name}</td>
      <td style="color:var(--green)">${p.wins||0}</td>
      <td style="color:var(--rust)">${p.losses||0}</td>
      <td style="color:var(--dim)">${total}</td>
      <td style="color:var(--amber)">${rate}%</td>
      <td style="color:var(--dim-2);font-size:9px;letter-spacing:0">${p.classicWins||0}C&nbsp;/&nbsp;${p.depletionWins||0}D</td>
    </tr>`;
  }).join('');
  const resetBtn = window.isGM ? `<div style="text-align:center;margin-top:20px">
    <button onclick="wdResetLeaderboard()" style="background:transparent;border:1px solid rgba(198,66,37,0.35);color:rgba(198,66,37,0.8);font-family:'Share Tech Mono',monospace;font-size:9px;padding:6px 16px;cursor:pointer;letter-spacing:2px;transition:all 0.2s" onmouseover="this.style.borderColor='var(--rust)';this.style.color='var(--rust)'" onmouseout="this.style.borderColor='rgba(198,66,37,0.35)';this.style.color='rgba(198,66,37,0.8)'">⚠ RESET LEADERBOARD</button>
  </div>` : '';
  return `<div class="wd-leaderboard">
    <table class="wd-lb-table">
      <thead><tr>
        <th style="text-align:left">&nbsp;</th>
        <th style="text-align:left;padding-left:12px">FIGHTER</th>
        <th>W</th><th>L</th><th>G</th><th>WIN%</th><th>C/D</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${resetBtn}
  </div>`;
}

// ── History strip ─────────────────────────────────────────
function wdHistoryHTML(d) {
  const hist = d.history || [];
  if (!hist.length) return '';
  const items = hist.slice(0,8).map(h =>
    `<div class="wd-history-item">R${h.round}: <span class="hi">${h.result}</span></div>`
  ).join('');
  return `<div class="wd-history"><div class="wd-history-title">// ROUND HISTORY</div><div class="wd-history-list">${items}</div></div>`;
}

// Close on overlay background click
document.getElementById('wdOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('wdOverlay')) {
    if (window.isGM) wdGMClose(); else closeWD();
  }
});

// Close on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.getElementById('wdOverlay').classList.contains('open')) {
    if (window.isGM) wdGMClose(); else closeWD();
  }
});
