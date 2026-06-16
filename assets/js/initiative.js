import { ref, set, remove, get, push, update, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ============================================================
// INITIATIVE SYSTEM
// ============================================================
const initiativeRef = ref(window.db, 'session/initiative');

let initRound = 1;

onValue(initiativeRef, snap => {
  const data = snap.val();
  if (data && data.dealtAt) {
    // Auto-open for everyone when a new deal happens
    if (data.dealtAt > _clientLoadTs) {
      document.getElementById('initiativeOverlay').classList.add('open');
      const setup = document.getElementById('initSetup');
      if (setup) setup.style.display = window.isGM ? '' : 'none';
      const nextBtn = document.getElementById('initNextRoundBtn');
      if (nextBtn) nextBtn.style.display = window.isGM ? '' : 'none';
    }
  }
  renderInitiative(data);
});

window.openInitiative = function() {
  document.getElementById('initiativeOverlay').classList.add('open');
  const setup = document.getElementById('initSetup');
  if (setup) setup.style.display = window.isGM ? '' : 'none';
  const nextBtn = document.getElementById('initNextRoundBtn');
  if (nextBtn) nextBtn.style.display = window.isGM ? '' : 'none';
  get(ref(window.db, 'session/initiative')).then(snap => renderInitiative(snap.val()));
  if (window.resumeAlienHuntLoop) window.resumeAlienHuntLoop();
};

window.closeInitiative = function() {
  stopAlienHunt();
  document.getElementById('initiativeOverlay').classList.remove('open');
};

window.dealInitiative = function() {
  if (!window.isGM) return;
  pendingSwapName = null;
  pendingGmSwapName = null;

  // Get online players
  const now = Date.now();
  // We'll read current users from the DOM player list
  const playerEls = document.querySelectorAll('#playersList .player-entry');
  const players = [];
  playerEls.forEach(el => {
    const nameEl = el.querySelector('.player-name');
    if (!nameEl) return;
    let name = nameEl.textContent.replace('👑','').replace('YOU','').trim();
    if (!name) return;
    const color = nameEl.style.color || '#ff9a3c';
    players.push({name, color, type:'player'});
  });
  // If no players found in DOM yet, at least add self
  if (players.length === 0 && window.myName) {
    players.push({name: window.myName, color: window.colorFromName(window.myName), type:'player'});
  }

  const npcCount = parseInt(document.getElementById('npcSlotSelect').value) || 0;
  const npcs = [];
  for (let i = 1; i <= npcCount; i++) {
    npcs.push({name: 'NPC / CREATURE ' + i, color:'#c64225', type:'npc'});
  }

  const allEntries = [...players, ...npcs];

  if (currentInitStyle === 'alienhunt') {
    // 10 moving aliens, players shoot to claim a number
    const huntDeck = shuffleDeck(10);
    const huntAliens = {};
    for (let i = 0; i < 10; i++) {
      huntAliens['alien_'+i] = { index:i, value: huntDeck[i], takenBy: '' };
    }
    const huntPlayers = {};
    allEntries.forEach((e,i) => {
      huntPlayers['hp_'+i] = { id:'hp_'+i, name:e.name, color:e.color, type:e.type, alienIndex:-1 };
    });
    alienHuntSavedPos = {}; // reset positions for new round
    set(initiativeRef, {
      style:'alienhunt', round:initRound, dealtAt:Date.now(),
      aliens: huntAliens, players: huntPlayers
    });
  } else {
    // PICK FROM TABLE (default) — 10 face-down cards, players pick their own
    const deckCards = shuffleDeck(10);
    const pickDeck  = {};
    for (let i = 0; i < 10; i++) {
      pickDeck['card_'+i] = { index:i, value: deckCards[i], takenBy: '' };
    }
    const pickPlayers = {};
    allEntries.forEach((e,i) => {
      pickPlayers['pp_'+i] = { id:'pp_'+i, name:e.name, color:e.color, type:e.type, cardIndex: -1 };
    });
    set(initiativeRef, {
      style:'picktable', round:initRound, dealtAt:Date.now(),
      deck: pickDeck, players: pickPlayers, allRevealed: false
    });
  }
};

window.clearInitiative = function() {
  if (!window.isGM) return;
  pendingSwapName = null;
  pendingGmSwapName = null;
  stopAlienHunt();
  alienHuntSavedPos = {};
  remove(initiativeRef);
  initRound = 1;
  document.getElementById('initRoundNum').textContent = '1';
};

window.nextInitiativeRound = function() {
  if (!window.isGM) return;
  initRound++;
  document.getElementById('initRoundNum').textContent = initRound;
  // Redeal with new cards
  dealInitiative();
};

function shuffleDeck(count) {
  // Numbers 1-10, pick `count` unique ones randomly
  const deck = [1,2,3,4,5,6,7,8,9,10];
  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck.slice(0, Math.min(count, 10));
}

let currentInitStyle = 'picktable';
let gmPickingForNpc = null;    // NPC entry the GM is currently picking a card for
let lastPickTableData = null;  // cached data for NPC-selection re-renders
let lastAlienHuntData = null;  // cached data for alien hunt NPC re-renders
let lastInitiativeData = null; // cached data for swap re-renders
let pendingSwapName   = null;  // player name currently in swap-selection mode
let pendingGmSwapName = null;  // GM override swap — no direction restriction, no flag consumption

// Alien Hunt movement state (persists across Firebase re-renders)
let alienHuntAnimFrame  = null;
let alienHuntMoveStates = [];
let alienHuntSavedPos   = {};  // positions saved between re-renders so aliens don't jump
let _alienHuntLoop      = null; // reference to current animLoop closure for pause/resume

function stopAlienHunt() {
  if (alienHuntAnimFrame) { cancelAnimationFrame(alienHuntAnimFrame); alienHuntAnimFrame = null; }
  alienHuntMoveStates.forEach(s => { alienHuntSavedPos[s.id] = { x:s.x, y:s.y, vx:s.vx, vy:s.vy }; });
  alienHuntMoveStates = [];
}

// Pause/resume for external overlays (e.g. Android Bay) — cancels RAF without clearing state
window.pauseAlienHuntLoop = function() {
  if (alienHuntAnimFrame) { cancelAnimationFrame(alienHuntAnimFrame); alienHuntAnimFrame = null; }
};
window.resumeAlienHuntLoop = function() {
  if (_alienHuntLoop && !alienHuntAnimFrame && alienHuntMoveStates.length > 0) {
    alienHuntAnimFrame = requestAnimationFrame(_alienHuntLoop);
  }
};

window.selectInitStyle = function(btn) {
  document.querySelectorAll('.init-style-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentInitStyle = btn.dataset.style;
};

function renderInitiative(data) {
  const area = document.getElementById('initCardsArea');
  const roundEl = document.getElementById('initRoundNum');
  if (!area) return;

  if (!data) {
    area.innerHTML = '<div style="text-align:center;color:var(--im-ink-faint);font-size:11px;letter-spacing:3px;padding:40px 0">AWAITING INITIATIVE DRAW</div>';
    return;
  }

  if (roundEl && data.round) {
    roundEl.textContent = data.round;
    initRound = data.round;
  }

  lastInitiativeData = data;
  const style  = data.style || currentInitStyle;
  const now    = Date.now();

  area.innerHTML = '';

  if (style === 'alienhunt') renderAlienHunt(area, data, now);
  else                       renderPickTable(area, data, now);

  const nextBtn = document.getElementById('initNextRoundBtn');
  if (nextBtn) nextBtn.style.display = window.isGM ? '' : 'none';
}

// ── STYLE 6: ALIEN HUNT (interactive – 10 moving aliens, shoot to claim) ─────
function renderAlienHunt(area, data, now) {
  stopAlienHunt(); // save positions + cancel old rAF

  const aliens     = data.aliens  || {};
  const players    = data.players || {};
  const alienList  = Object.values(aliens).sort((a,b) => a.index - b.index);
  const playerList = Object.values(players);
  const myEntry    = playerList.find(p => p.name === window.myName);
  const myPicked   = myEntry && myEntry.alienIndex >= 0;
  const pickedCount= playerList.filter(p => p.alienIndex >= 0).length;
  const allPicked  = pickedCount >= playerList.length;

  lastAlienHuntData = data;

  // GM NPC picking (same pattern as picktable)
  const unpickedNpcs = window.isGM ? playerList.filter(p => p.type==='npc' && p.alienIndex<0) : [];
  if (gmPickingForNpc) {
    if (!unpickedNpcs.find(p => p.id === gmPickingForNpc.id)) gmPickingForNpc = unpickedNpcs[0] || null;
  } else if (window.isGM) {
    gmPickingForNpc = unpickedNpcs[0] || null;
  }
  const gmCanPickForNpc = window.isGM && !!gmPickingForNpc && (myPicked || !myEntry);
  const canShoot = (!myPicked && !!myEntry) || gmCanPickForNpc;

  // ── Status label ────────────────────────────────────────────────────────────
  const status = document.createElement('div');
  status.className = 'pick-status';
  status.textContent = allPicked
    ? '// ALL OPERATIVES HAVE NEUTRALIZED A XENOMORPH'
    : myPicked
    ? `// XENOMORPH NEUTRALIZED — WAITING FOR OTHERS (${pickedCount}/${playerList.length})`
    : gmCanPickForNpc
    ? `// GM: SHOOT FOR ${gmPickingForNpc.name}`
    : '// SHOOT A XENOMORPH TO CLAIM YOUR INITIATIVE NUMBER';
  area.appendChild(status);

  // ── Player chips ─────────────────────────────────────────────────────────
  const chipsRow = document.createElement('div');
  chipsRow.className = 'pick-players-row';
  playerList.slice().sort((a,b) => a.name.localeCompare(b.name)).forEach(p => {
    const hasPicked  = p.alienIndex >= 0;
    const alienObj   = hasPicked ? alienList.find(a => a.index === p.alienIndex) : null;
    const isTarget   = gmCanPickForNpc && gmPickingForNpc && gmPickingForNpc.id === p.id;
    const chip = document.createElement('div');
    chip.className = 'pick-player-chip' + (hasPicked?' picked-chip':' waiting') + (p.name===window.myName&&!myPicked?' my-turn':'');
    chip.style.cssText = 'border-color:'+p.color+';color:'+p.color+(isTarget?';outline:2px solid '+p.color+';box-shadow:0 0 6px '+p.color:'');
    chip.innerHTML = '<div class="pick-player-dot" style="background:'+p.color+'"></div><span>'+p.name+'</span>'
      + (hasPicked && alienObj ? '<span class="pick-player-card-num" style="color:'+p.color+'">'+alienObj.value+'</span>' : hasPicked ? '<span style="margin-left:4px">✓</span>' : '')
      + (isTarget ? '<span style="margin-left:4px;font-size:9px;opacity:.8"> ◄ NEXT</span>' : '');
    if (window.isGM && p.type==='npc' && !hasPicked) {
      chip.style.cursor = 'pointer';
      chip.title = 'Click to pick for this NPC next';
      chip.addEventListener('click', () => {
        gmPickingForNpc = {id:p.id, name:p.name, color:p.color};
        const a2 = document.getElementById('initCardsArea');
        if (a2 && lastAlienHuntData) { stopAlienHunt(); a2.innerHTML=''; renderAlienHunt(a2, lastAlienHuntData, Date.now()); }
      });
    }
    chipsRow.appendChild(chip);
  });
  area.appendChild(chipsRow);

  // ── Space field ──────────────────────────────────────────────────────────
  const field = document.createElement('div');
  field.className = 'alien-hunt-field';
  field.id = 'alienHuntField';

  const scan = document.createElement('div'); scan.className='hunt-scan-line'; field.appendChild(scan);

  const lbl = document.createElement('div');
  lbl.className = 'hunt-field-label'; lbl.id = 'huntFieldLabel';
  lbl.textContent = canShoot ? '// ENGAGE XENOMORPHS — SHOOT TO CLAIM' : allPicked ? '// ALL TARGETS NEUTRALIZED' : '// AWAITING OPERATIVES';
  field.appendChild(lbl);

  // Starfield (reduced for perf)
  const starColors = ['#ffffff','#aaddff','#ffddaa','#ffaabb','#aaffdd'];
  for (let i = 0; i < 28; i++) {
    const s = document.createElement('div'); s.className='hunt-star';
    const sz = Math.random()<.12?3:Math.random()<.35?2:1;
    s.style.cssText=`left:${(Math.random()*100).toFixed(1)}%;top:${(Math.random()*100).toFixed(1)}%;width:${sz}px;height:${sz}px;animation-delay:${(Math.random()*3).toFixed(2)}s;animation-duration:${(1.5+Math.random()*2).toFixed(1)}s;background:${starColors[Math.floor(Math.random()*starColors.length)]}`;
    field.appendChild(s);
  }

  const emojiTypes = ['👾','👾','👽','👾','👾','🛸','👾','👽','👾','🤖'];

  // ── Build movement states (reuse saved positions across re-renders) ────────
  alienHuntMoveStates = alienList.map((ad, i) => {
    const saved = alienHuntSavedPos['alien_'+ad.index];
    const taken = !!(ad.takenBy && ad.takenBy !== '');
    return {
      id:    'alien_'+ad.index,
      index: ad.index,
      x:     saved ? saved.x  : 8 + Math.random() * 80,
      y:     saved ? saved.y  : 12 + Math.random() * 72,
      vx:    saved ? saved.vx : (Math.random()>.5?1:-1) * (0.007+Math.random()*0.011),
      vy:    saved ? saved.vy : (Math.random()>.5?1:-1) * (0.005+Math.random()*0.008),
      dead:  taken,
      takenBy: ad.takenBy || '',
      value: ad.value
    };
  });

  // ── Create alien elements ─────────────────────────────────────────────────
  alienHuntMoveStates.forEach((state, i) => {
    const ad     = alienList[i];
    const emoji  = emojiTypes[i % emojiTypes.length];
    const taken  = state.dead;
    const taker  = taken ? playerList.find(p => p.name===state.takenBy) : null;
    const tcolor = taker ? taker.color : '#ff9a3c';

    const alien = document.createElement('div');
    alien.className = 'hunt-alien' + (taken ? ' dead' : '');
    alien.id = 'huntalien_alien_' + ad.index;
    alien.style.cssText = `left:${state.x.toFixed(2)}%;top:${state.y.toFixed(2)}%`;

    alien.innerHTML = `
      <div class="hunt-alien-inner">
        <span class="hunt-alien-emoji">${taken?'💀':emoji}</span>
        <span class="hunt-alien-badge" style="background:#06100b;border-color:${taken?tcolor+'88':'#3f3a2c'};color:${taken?tcolor:'#6e6650'}">${taken?ad.value:'?'}</span>
      </div>
      <div class="hunt-alien-name" style="color:${taken?tcolor:'#6e6650'}">${taken?state.takenBy:'???'}</div>
    `;

    if (!taken && canShoot) {
      alien.addEventListener('click', () => {
        if (state.dead) return; // already claimed
        state.dead = true;      // stop movement locally

        // Determine shooter info
        const shooterName  = gmCanPickForNpc ? gmPickingForNpc.name : window.myName;
        const shooterColor = gmCanPickForNpc ? (gmPickingForNpc.color||'#c64225') : (myEntry?myEntry.color:'#ff9a3c');
        const shooterEntry = gmCanPickForNpc ? gmPickingForNpc : myEntry;

        // Local visual shot (animation)
        doAlienShot(alien, { color:shooterColor, card:ad.value }, field);

        // Update name label
        setTimeout(() => {
          const nameEl = alien.querySelector('.hunt-alien-name');
          if (nameEl) { nameEl.textContent = shooterName; nameEl.style.color = shooterColor; }
        }, 300);

        // Firebase write after animation started
        setTimeout(() => {
          if (gmCanPickForNpc) {
            const npc = gmPickingForNpc;
            set(ref(window.db,'session/initiative/aliens/alien_'+ad.index+'/takenBy'), npc.name);
            set(ref(window.db,'session/initiative/players/'+npc.id+'/alienIndex'), ad.index);
          } else if (myEntry) {
            set(ref(window.db,'session/initiative/aliens/alien_'+ad.index+'/takenBy'), window.myName);
            set(ref(window.db,'session/initiative/players/'+myEntry.id+'/alienIndex'), ad.index);
          }
        }, 450);
      });
    }

    field.appendChild(alien);
  });

  area.appendChild(field);

  // Cache DOM refs once after field is in DOM — avoids getElementById on every frame
  alienHuntMoveStates.forEach(s => {
    s.el = field.querySelector('#huntalien_'+s.id) || null;
  });

  // ── Movement loop ────────────────────────────────────────────────────────
  const huntFieldEl = field;
  let lastTs = 0;
  function animLoop(ts) {
    if (!huntFieldEl.isConnected) { stopAlienHunt(); return; }
    if (!document.getElementById('initiativeOverlay')?.classList.contains('open')) {
      cancelAnimationFrame(alienHuntAnimFrame); alienHuntAnimFrame = null; return;
    }
    const dt = Math.min(ts - lastTs, 80);
    lastTs = ts;
    if (dt > 0) {
      alienHuntMoveStates.forEach(s => {
        if (s.dead || !s.el) return;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        if (s.x < 5)  { s.vx =  Math.abs(s.vx); s.x = 5;  }
        if (s.x > 90) { s.vx = -Math.abs(s.vx); s.x = 90; }
        if (s.y < 8)  { s.vy =  Math.abs(s.vy); s.y = 8;  }
        if (s.y > 85) { s.vy = -Math.abs(s.vy); s.y = 85; }
        s.el.style.left = s.x.toFixed(1)+'%';
        s.el.style.top  = s.y.toFixed(1)+'%';
      });
    }
    alienHuntAnimFrame = requestAnimationFrame(animLoop);
  }
  _alienHuntLoop = animLoop;
  alienHuntAnimFrame = requestAnimationFrame(animLoop);

  // ── Final order (shown when all claimed) ─────────────────────────────────
  if (allPicked) {
    const orderLabel = document.createElement('div');
    orderLabel.className = 'init-section-label';
    orderLabel.style.marginTop = '14px';
    orderLabel.textContent = '// INITIATIVE ORDER — LOWEST ACTS FIRST';
    area.appendChild(orderLabel);

    const orderWrap = document.createElement('div');
    orderWrap.className = 'hunt-order-reveal';
    playerList.map(p => ({
      ...p,
      val: p.alienIndex>=0 ? (alienList.find(a=>a.index===p.alienIndex)||{value:99}).value : 99
    })).sort((a,b) => a.val-b.val).forEach((p, i) => {
      const row = document.createElement('div');
      row.className = 'hunt-order-row';
      row.style.cssText = `border-color:${p.color};animation-delay:${i*120}ms`;
      row.innerHTML = `
        <span class="hunt-order-rank">${i+1}.</span>
        <span class="hunt-order-card-num" style="color:${p.color}">${p.val}</span>
        <span class="hunt-order-name" style="color:${p.color}">${p.name}</span>
        <span class="hunt-order-type">${p.type==='npc'?'// NPC':'// OPERATIVE'}</span>
      `;
      orderWrap.appendChild(row);
    });
    area.appendChild(orderWrap);
    const swapPartsH = playerList.map(p => ({
      ...p,
      val: p.alienIndex>=0 ? (alienList.find(a=>a.index===p.alienIndex)||{value:99}).value : 99
    })).sort((a,b) => a.val-b.val);
    renderSwapSection(area, swapPartsH, data, 'alienhunt');
  }
}

function doAlienShot(el, entry, field) {
  el.classList.add('being-hit');

  // Crosshair ping
  const xhair = document.createElement('div');
  xhair.className = 'hunt-crosshair';
  xhair.style.cssText = `left:${el.style.left};top:${el.style.top}`;
  field.appendChild(xhair);
  setTimeout(() => xhair.remove(), 500);

  // Explosion burst
  const boom = document.createElement('div');
  boom.className = 'hunt-explosion';
  boom.textContent = Math.random()<.7?'💥':'🔥';
  boom.style.cssText = `left:${el.style.left};top:${el.style.top}`;
  field.appendChild(boom);
  setTimeout(() => boom.remove(), 750);

  // After flash → death spin + reveal
  setTimeout(() => {
    el.classList.remove('being-hit');
    el.classList.add('dead');

    const inner = el.querySelector('.hunt-alien-inner');
    if (inner) inner.style.animation = 'alienDeathSpin .9s cubic-bezier(.36,.07,.19,.97) forwards';

    const badge = el.querySelector('.hunt-alien-badge');
    if (badge) {
      badge.textContent    = entry.card;
      badge.style.background  = entry.color+'25';
      badge.style.borderColor = entry.color;
      badge.style.color       = entry.color;
      badge.style.fontSize    = '12px';
      badge.style.boxShadow   = `0 0 10px ${entry.color}55`;
      badge.style.animation   = 'huntBadgePop .5s cubic-bezier(.34,1.56,.64,1) .5s both';
    }

    setTimeout(() => {
      const emojiEl = el.querySelector('.hunt-alien-emoji');
      if (emojiEl) { emojiEl.textContent='💀'; emojiEl.style.filter=`drop-shadow(0 0 8px ${entry.color})`; }
    }, 450);
  }, 260);
}

// ── INITIATIVE SWAP ───────────────────────────────────────────────────────────
function renderSwapSection(area, participants, data, style) {
  const swaps = data.swaps || {};
  if (!participants.length) return;

  const secLabel = document.createElement('div');
  secLabel.className = 'init-section-label';
  secLabel.style.marginTop = '14px';
  secLabel.textContent = '// INITIATIVE SWAP — ONCE PER ROUND';
  area.appendChild(secLabel);

  const wrap = document.createElement('div');
  wrap.className = 'hunt-order-reveal';

  const pendingEntry   = pendingSwapName   ? participants.find(x => x.name === pendingSwapName)   : null;
  const pendingGmEntry = pendingGmSwapName ? participants.find(x => x.name === pendingGmSwapName) : null;

  participants.forEach((p, i) => {
    const isMe         = p.name === window.myName;
    const isNpcForGM   = window.isGM && p.type === 'npc';
    const hasSwapped   = swaps[p.name] === true;
    const isPending    = pendingSwapName === p.name;
    const isPendingGm  = pendingGmSwapName === p.name;
    // Normal target: direction-restricted (must have worse/higher val)
    const isTarget     = !!pendingSwapName && !pendingGmSwapName && pendingSwapName !== p.name
                         && pendingEntry && p.val > pendingEntry.val;
    // GM override target: any other entry, no direction restriction
    const isGmTarget   = window.isGM && !!pendingGmSwapName && pendingGmSwapName !== p.name;
    const hasLaterTarget = participants.some(o => o.name !== p.name && !swaps[o.name] && o.val > p.val);
    const canAct       = (isMe || isNpcForGM) && !hasSwapped && hasLaterTarget && !pendingGmSwapName;

    const row = document.createElement('div');
    row.className = 'hunt-order-row';
    if (isPending || isPendingGm)
      row.style.cssText = `border-color:${p.color};background:rgba(255,200,0,0.07);animation-delay:${i*60}ms`;
    else if (isTarget || isGmTarget)
      row.style.cssText = `border-color:rgba(255,154,60,0.5);background:rgba(255,154,60,0.10);cursor:pointer;animation-delay:${i*60}ms`;
    else
      row.style.cssText = `border-color:${p.color}33;animation-delay:${i*60}ms`;

    row.innerHTML = `
      <span class="hunt-order-rank">${i+1}.</span>
      <span class="hunt-order-card-num" style="color:${p.color}">${p.val}</span>
      <span class="hunt-order-name" style="color:${p.color}">${p.name}</span>
      <span class="hunt-order-type">${p.type==='npc'?'// NPC':'// OPERATIVE'}</span>
    `;

    if (isTarget) {
      const hint = document.createElement('span');
      hint.style.cssText = 'font-size:9px;color:var(--im-ink-bright);letter-spacing:1px;margin-left:auto;flex-shrink:0';
      hint.textContent = '⇄ SWAP HERE';
      row.appendChild(hint);
      row.addEventListener('click', () => executeInitiativeSwap(pendingSwapName, p.name, data, style));
    } else if (isGmTarget) {
      const hint = document.createElement('span');
      hint.style.cssText = 'font-size:9px;color:var(--im-gm);letter-spacing:1px;margin-left:auto;flex-shrink:0';
      hint.textContent = '⇄ HIERHER';
      row.appendChild(hint);
      row.addEventListener('click', () => executeGmOverrideSwap(pendingGmSwapName, p.name, data, style));
    }

    if (canAct) {
      const btn = document.createElement('button');
      btn.className = 'init-swap-btn' + (isPending ? ' cancel' : '');
      btn.textContent = isPending ? '✕ ABBRECHEN' : '⇄ TAUSCHEN';
      btn.title = isPending ? 'Tausch abbrechen' : 'Initiative mit einem späteren Spieler tauschen';
      btn.addEventListener('click', e => {
        e.stopPropagation();
        pendingSwapName = isPending ? null : p.name;
        const a = document.getElementById('initCardsArea');
        if (a && lastInitiativeData) { a.innerHTML = ''; renderInitiative(lastInitiativeData); }
      });
      row.appendChild(btn);
    } else if (hasSwapped && (isMe || isNpcForGM)) {
      const used = document.createElement('span');
      used.style.cssText = 'font-size:8px;color:var(--im-ink-faint);letter-spacing:1px;margin-left:auto';
      used.textContent = 'SWAP USED';
      row.appendChild(used);
    }

    // ── GM-only controls ────────────────────────────────────────────────────
    if (window.isGM && !pendingSwapName) {
      // Reset flag button on used swaps
      if (hasSwapped) {
        const resetBtn = document.createElement('button');
        resetBtn.className = 'init-swap-btn init-swap-gm-reset';
        resetBtn.textContent = '× RESET';
        resetBtn.title = 'Swap-Flag zurücksetzen (Spieler kann erneut tauschen)';
        resetBtn.addEventListener('click', e => {
          e.stopPropagation();
          remove(ref(window.db, `session/initiative/swaps/${p.name}`));
        });
        row.appendChild(resetBtn);
      }
      // GM override swap button (all entries, no direction/flag restrictions)
      const gmBtn = document.createElement('button');
      gmBtn.className = 'init-swap-btn init-swap-gm' + (isPendingGm ? ' cancel' : '');
      gmBtn.textContent = isPendingGm ? '✕ CANCEL' : '⇄ GM';
      gmBtn.title = isPendingGm ? 'GM-Tausch abbrechen' : 'GM: Initiative-Werte frei tauschen (kein Token-Verbrauch)';
      gmBtn.addEventListener('click', e => {
        e.stopPropagation();
        pendingGmSwapName = isPendingGm ? null : p.name;
        const a = document.getElementById('initCardsArea');
        if (a && lastInitiativeData) { a.innerHTML = ''; renderInitiative(lastInitiativeData); }
      });
      row.appendChild(gmBtn);
    }

    wrap.appendChild(row);
  });
  area.appendChild(wrap);
}

function executeGmOverrideSwap(nameA, nameB, data, style) {
  const updates = {};
  if (style === 'alienhunt') {
    const players = data.players || {};
    const entA = Object.entries(players).find(([,p]) => p.name === nameA);
    const entB = Object.entries(players).find(([,p]) => p.name === nameB);
    if (!entA || !entB) return;
    const [keyA, pA] = entA; const [keyB, pB] = entB;
    updates['players/'+keyA+'/alienIndex'] = pB.alienIndex;
    updates['players/'+keyB+'/alienIndex'] = pA.alienIndex;
    const aliens = data.aliens || {};
    const akA = Object.keys(aliens).find(k => aliens[k].index === pA.alienIndex);
    const akB = Object.keys(aliens).find(k => aliens[k].index === pB.alienIndex);
    if (akA) updates['aliens/'+akA+'/takenBy'] = pB.name;
    if (akB) updates['aliens/'+akB+'/takenBy'] = pA.name;
  } else if (style === 'picktable') {
    const players = data.players || {};
    const entA = Object.entries(players).find(([,p]) => p.name === nameA);
    const entB = Object.entries(players).find(([,p]) => p.name === nameB);
    if (!entA || !entB) return;
    const [keyA, pA] = entA; const [keyB, pB] = entB;
    const deck = data.deck || {};
    updates['players/'+keyA+'/cardIndex'] = pB.cardIndex;
    updates['players/'+keyB+'/cardIndex'] = pA.cardIndex;
    const ckA = Object.keys(deck).find(k => deck[k].index === pA.cardIndex);
    const ckB = Object.keys(deck).find(k => deck[k].index === pB.cardIndex);
    if (ckA) updates['deck/'+ckA+'/takenBy'] = pB.name;
    if (ckB) updates['deck/'+ckB+'/takenBy'] = pA.name;
  } else {
    const entries = data.entries || {};
    const entA = Object.entries(entries).find(([,e]) => e.name === nameA);
    const entB = Object.entries(entries).find(([,e]) => e.name === nameB);
    if (!entA || !entB) return;
    const [keyA, eA] = entA; const [keyB, eB] = entB;
    updates['entries/'+keyA+'/card'] = eB.card;
    updates['entries/'+keyB+'/card'] = eA.card;
  }
  // No swaps flag — GM override doesn't consume a player's swap token
  update(ref(window.db, 'session/initiative'), updates).then(() => { pendingGmSwapName = null; });
}

function executeInitiativeSwap(nameA, nameB, data, style) {
  const updates = {};

  if (style === 'alienhunt') {
    const players = data.players || {};
    const entA = Object.entries(players).find(([,p]) => p.name === nameA);
    const entB = Object.entries(players).find(([,p]) => p.name === nameB);
    if (!entA || !entB) return;
    const [keyA, pA] = entA; const [keyB, pB] = entB;
    updates['players/'+keyA+'/alienIndex'] = pB.alienIndex;
    updates['players/'+keyB+'/alienIndex'] = pA.alienIndex;
    const aliens = data.aliens || {};
    const akA = Object.keys(aliens).find(k => aliens[k].index === pA.alienIndex);
    const akB = Object.keys(aliens).find(k => aliens[k].index === pB.alienIndex);
    if (akA) updates['aliens/'+akA+'/takenBy'] = pB.name;
    if (akB) updates['aliens/'+akB+'/takenBy'] = pA.name;
  } else if (style === 'picktable') {
    const players = data.players || {};
    const entA = Object.entries(players).find(([,p]) => p.name === nameA);
    const entB = Object.entries(players).find(([,p]) => p.name === nameB);
    if (!entA || !entB) return;
    const [keyA, pA] = entA; const [keyB, pB] = entB;
    const deck = data.deck || {};
    updates['players/'+keyA+'/cardIndex'] = pB.cardIndex;
    updates['players/'+keyB+'/cardIndex'] = pA.cardIndex;
    const ckA = Object.keys(deck).find(k => deck[k].index === pA.cardIndex);
    const ckB = Object.keys(deck).find(k => deck[k].index === pB.cardIndex);
    if (ckA) updates['deck/'+ckA+'/takenBy'] = pB.name;
    if (ckB) updates['deck/'+ckB+'/takenBy'] = pA.name;
  } else {
    const entries = data.entries || {};
    const entA = Object.entries(entries).find(([,e]) => e.name === nameA);
    const entB = Object.entries(entries).find(([,e]) => e.name === nameB);
    if (!entA || !entB) return;
    const [keyA, eA] = entA; const [keyB, eB] = entB;
    updates['entries/'+keyA+'/card'] = eB.card;
    updates['entries/'+keyB+'/card'] = eA.card;
  }

  updates['swaps/'+nameA] = true;
  update(ref(window.db, 'session/initiative'), updates).then(() => { pendingSwapName = null; });
}

// ── STYLE 5: PICK FROM TABLE ─────────────────────────────────────────────────
function renderPickTable(area, data, now) {
  const deck       = data.deck    || {};
  const players    = data.players || {};
  const allRev     = data.allRevealed === true;
  const deckCards  = Object.values(deck).sort((a,b) => a.index - b.index);
  const playerList = Object.values(players);
  const myEntry    = playerList.find(p => p.name === window.myName);
  const myPicked   = myEntry && myEntry.cardIndex >= 0;
  const pickedCount = playerList.filter(p => p.cardIndex >= 0).length;
  const allPicked  = pickedCount >= playerList.length;

  // GM NPC-picking support: track which NPC the GM is assigning a card to next
  lastPickTableData = data;
  const unpickedNpcs = window.isGM ? playerList.filter(p => p.type === 'npc' && p.cardIndex < 0) : [];
  if (gmPickingForNpc) {
    // If the currently selected NPC has already been assigned a card, advance to the next unpicked one
    if (!unpickedNpcs.find(p => p.id === gmPickingForNpc.id)) gmPickingForNpc = unpickedNpcs[0] || null;
  } else if (window.isGM) {
    gmPickingForNpc = unpickedNpcs[0] || null;
  }
  // GM can pick for NPCs only after their own card is chosen (or if the GM has no player entry)
  const gmCanPickForNpc = window.isGM && !!gmPickingForNpc && !allRev && (myPicked || !myEntry);

  // Status
  const status = document.createElement('div');
  status.className = 'pick-status';
  status.textContent = allRev ? '// ALL CARDS REVEALED — ROUND ' + (data.round||1)
    : allPicked ? '// ALL OPERATIVES HAVE DRAWN — AWAITING GM REVEAL'
    : myPicked  ? '// CARD DRAWN — WAITING FOR OTHERS (' + pickedCount + '/' + playerList.length + ')'
    : '// PICK A CARD FROM THE TABLE';
  area.appendChild(status);

  // Player chips
  const chipsRow = document.createElement('div');
  chipsRow.className = 'pick-players-row';
  playerList.sort((a,b)=>a.name.localeCompare(b.name)).forEach(p => {
    const hasPicked = p.cardIndex >= 0;
    const cardObj   = hasPicked ? deckCards.find(c=>c.index===p.cardIndex) : null;
    const isTarget  = gmCanPickForNpc && gmPickingForNpc && gmPickingForNpc.id === p.id;
    const chip = document.createElement('div');
    chip.className = 'pick-player-chip' + (hasPicked?' picked-chip':' waiting') + (p.name===window.myName&&!myPicked?' my-turn':'');
    chip.style.cssText = 'border-color:'+p.color+';color:'+p.color
      + (isTarget ? ';outline:2px solid '+p.color+';box-shadow:0 0 6px '+p.color : '');
    chip.innerHTML = '<div class="pick-player-dot" style="background:'+p.color+'"></div><span>'+p.name+'</span>'
      + (hasPicked ? (allRev&&cardObj ? '<span class="pick-player-card-num" style="color:'+p.color+'">'+cardObj.value+'</span>' : '<span style="margin-left:4px">✓</span>') : '')
      + (isTarget ? '<span style="margin-left:4px;font-size:9px;opacity:.8"> ◄ NEXT</span>' : '');
    if (window.isGM && !allRev && p.type === 'npc' && !hasPicked) {
      chip.style.cursor = 'pointer';
      chip.title = 'Click to pick card for this NPC next';
      chip.addEventListener('click', () => {
        gmPickingForNpc = {id: p.id, name: p.name};
        const a2 = document.getElementById('initCardsArea');
        if (a2 && lastPickTableData) { a2.innerHTML = ''; renderPickTable(a2, lastPickTableData, Date.now()); }
      });
    }
    chipsRow.appendChild(chip);
  });
  area.appendChild(chipsRow);

  // Deck label
  const deckLabel = document.createElement('div');
  deckLabel.className = 'init-section-label';
  deckLabel.textContent = allRev ? '// FINAL DRAW' : gmCanPickForNpc ? '// PICK FOR: ' + gmPickingForNpc.name : myPicked ? '// WAITING FOR OTHERS' : '// PICK A CARD';
  area.appendChild(deckLabel);

  // Card grid
  const grid = document.createElement('div');
  grid.className = 'pick-deck-row';
  deckCards.forEach(card => {
    const taken     = !!(card.takenBy && card.takenBy !== '');
    const takenByMe = card.takenBy === window.myName;
    const takerEntry = playerList.find(p=>p.name===card.takenBy);
    const takerColor = takerEntry ? takerEntry.color : '#ff9a3c';
    const showValue  = takenByMe || allRev;
    const revColor   = takenByMe ? (myEntry&&myEntry.color||'#ff9a3c') : takerColor;

    const isPickable = !taken && (!myPicked || gmCanPickForNpc);
    const wrap = document.createElement('div');
    wrap.className = 'pick-card' + ((takenByMe || (allRev && taken)) ? ' picked' : '') + (isPickable ? ' pickable' : '');
    if (isPickable) wrap.style.cursor = 'pointer';

    const inner = document.createElement('div');
    inner.className = 'pick-card-inner';

    const front = document.createElement('div');
    front.className = 'pick-card-front' + (taken&&!takenByMe?' taken':'');
    front.innerHTML = '<div class="pick-card-suit">🂠</div><div class="pick-card-idx">#'+(card.index+1)+'</div>';

    const back = document.createElement('div');
    back.className = 'pick-card-back';
    back.style.borderColor = showValue ? revColor : '#3f3a2c';
    back.innerHTML = '<div class="pick-card-back-num" style="color:'+(showValue?revColor:'#6e6650')+'">'+(showValue?card.value:'?')+'</div>'
      +'<div class="pick-card-back-name" style="color:'+(showValue?revColor:'#6e6650')+'">'+(takenByMe?window.myName:(allRev&&card.takenBy?card.takenBy:''))+'</div>';

    inner.appendChild(front); inner.appendChild(back); wrap.appendChild(inner);
    grid.appendChild(wrap);

    if (isPickable) {
      wrap.addEventListener('mouseenter', ()=>wrap.classList.add('hovering'));
      wrap.addEventListener('mouseleave', ()=>wrap.classList.remove('hovering'));
      wrap.addEventListener('click', ()=>{
        wrap.classList.remove('hovering');
        if (gmCanPickForNpc) {
          const npc = gmPickingForNpc;
          set(ref(window.db,'session/initiative/players/'+npc.id+'/cardIndex'), card.index);
          set(ref(window.db,'session/initiative/deck/card_'+card.index+'/takenBy'), npc.name);
        } else {
          if (!myEntry) return;
          wrap.classList.add('picked');
          set(ref(window.db,'session/initiative/players/'+myEntry.id+'/cardIndex'), card.index);
          set(ref(window.db,'session/initiative/deck/card_'+card.index+'/takenBy'), window.myName);
        }
      });
    }
  });
  area.appendChild(grid);

  // GM reveal button
  if (window.isGM && allPicked && !allRev) {
    const btn = document.createElement('button');
    btn.className = 'pick-reveal-btn';
    btn.textContent = '👁 Reveal All Cards';
    btn.style.marginTop = '16px';
    btn.onclick = ()=>set(ref(window.db,'session/initiative/allRevealed'), true);
    area.appendChild(btn);
  }

  // Final order after reveal
  if (allRev) {
    const orderLabel = document.createElement('div');
    orderLabel.className = 'init-section-label';
    orderLabel.style.marginTop = '16px';
    orderLabel.textContent = '// INITIATIVE ORDER';
    area.appendChild(orderLabel);
    playerList.map(p=>({
      ...p, val: (p.cardIndex>=0 ? (deckCards.find(c=>c.index===p.cardIndex)||{value:99}).value : 99)
    })).sort((a,b)=>a.val-b.val).forEach((p,i)=>{
      const row = document.createElement('div');
      row.className = 'init-row revealed';
      row.style.animationDelay = (i*150)+'ms';
      row.innerHTML = '<div class="init-row-rank">'+(i+1)+'.</div>'
        +'<div class="init-card" style="border-color:'+p.color+'33">'
        +'<div class="init-card-number" style="color:'+p.color+';border-color:'+p.color+'33">'+p.val+'</div>'
        +'<div class="init-card-info"><div class="init-card-name" style="color:'+p.color+'">'+p.name+'</div>'
        +'<div class="init-card-type">'+(p.type==='npc'?'// NPC / CREATURE':'// OPERATIVE')+'</div></div></div>';
      area.appendChild(row);
    });
    const swapPartsP = playerList.map(p=>({
      ...p, val: p.cardIndex>=0 ? (deckCards.find(c=>c.index===p.cardIndex)||{value:99}).value : 99
    })).sort((a,b)=>a.val-b.val);
    renderSwapSection(area, swapPartsP, data, 'picktable');
  }
}

// ============================================================
// SESSION OPEN/CLOSE SYSTEM
// ============================================================
const sessionRef    = ref(window.db, 'session/isOpen');
window.sessionRef = sessionRef;
const sessionOpenRef = ref(window.db, 'session/openedAt');
let   sessionOpenedAt = 0;

onValue(sessionOpenRef, snap => {
  sessionOpenedAt = snap.val() || 0;
});
let sessionIsOpen = null; // null = unknown (loading)
window.sessionIsOpen = null;
let myLoginData   = null; // store login data until session confirmed open

onValue(sessionRef, snap => {
  const wasOpen = sessionIsOpen;
  sessionIsOpen = snap.val(); // true = open, false/null = closed
  window.sessionIsOpen = sessionIsOpen;

  if (sessionIsOpen === false) {
    // Session closed — show closed screen for non-GM
    if (!window.isGM) {
      document.getElementById('sessionClosedScreen').classList.add('active');
      // Hide map interaction
      document.getElementById('mapWrap').style.pointerEvents = 'none';
      document.getElementById('mapWrap').style.opacity = '0.4';
    }
  } else if (sessionIsOpen === true) {
    // Session open
    document.getElementById('sessionClosedScreen').classList.remove('active');
    document.getElementById('mapWrap').style.pointerEvents = '';
    document.getElementById('mapWrap').style.opacity = '';
  }
  updateSessionBtn();
});

function updateSessionBtn() {
  const btn = document.getElementById('gmSessionBtn');
  if (!btn) return;
  if (sessionIsOpen) {
    btn.textContent = '✓ Session Active — Close Map';
    btn.classList.remove('closing');
  } else {
    btn.textContent = '▶ Open Session for Players';
    btn.classList.add('closing');
    btn.style.borderColor = '#44ff88';
    btn.style.color = '#44ff88';
    btn.classList.remove('closing');
  }
}

window.toggleSession = function() {
  if (!window.isGM) return;
  const next = !sessionIsOpen;
  set(sessionRef, next);
  // When closing: wipe ALL transient state so new joiners start clean
  if (!next) {
    remove(interceptRef);
    remove(travelRef);
    remove(ref(window.db, 'pings'));
  }
};

// On page load — check session state before showing login
// If session is closed and user is not GM, show closed screen immediately
// We handle this by checking after Firebase loads (see onValue above)
// The password screen still shows — GM can always log in
// Non-GM who logs in while closed will see the closed screen
function applySessionGateAfterLogin() {
  if (!window.isGM && sessionIsOpen === false) {
    document.getElementById('sessionClosedScreen').classList.add('active');
    document.getElementById('mapWrap').style.pointerEvents = 'none';
    document.getElementById('mapWrap').style.opacity = '0.4';
  }
}
window.applySessionGateAfterLogin = applySessionGateAfterLogin;
window.updateSessionBtn = updateSessionBtn;

// ============================================================
// INTERCEPTION SYSTEM — USCSS CLUNKKYNOOST
// ============================================================
const interceptRef = ref(window.db, 'session/interception');

// Intercept chance — starts at 20%, increases each jump, stored in Firebase
const BASE_INTERCEPT_CHANCE = 0.20;
const INTERCEPT_INCREASE    = 0.05; // +5% per jump
const MAX_INTERCEPT_CHANCE  = 0.95;
let   currentInterceptChance = BASE_INTERCEPT_CHANCE;

const chanceRef   = ref(window.db, 'session/interceptChance');
const interceptEnabledRef = ref(window.db, 'session/interceptEnabled');
let   interceptEnabled = true;

onValue(interceptEnabledRef, snap => {
  const val = snap.val();
  interceptEnabled = (val === null || val === true); // default on
  const chk = document.getElementById('interceptToggle');
  if (chk) chk.checked = interceptEnabled;
  const btn = document.getElementById('gmInterceptBtn');
  if (btn) {
    btn.disabled = !interceptEnabled;
    btn.style.opacity = interceptEnabled ? '1' : '0.35';
  }
});

window.toggleInterception = function(chk) {
  if (!window.isGM) return;
  set(interceptEnabledRef, chk.checked);
};

window.adjustInterceptChance = function(delta) {
  if (!window.isGM) return;
  const next = Math.min(MAX_INTERCEPT_CHANCE, Math.max(0.05, currentInterceptChance + delta));
  set(chanceRef, next);
};

onValue(chanceRef, snap => {
  const val = snap.val();
  currentInterceptChance = (val !== null && val !== undefined) ? val : BASE_INTERCEPT_CHANCE;
  updateChanceUI();
});

function updateChanceUI() {
  const pct = Math.round(currentInterceptChance * 100);
  const lbl = document.getElementById('chanceLabel');
  const bar = document.getElementById('chanceBarFill');
  if (lbl) lbl.textContent = pct + '%';
  if (bar) bar.style.width = pct + '%';
  // Color shift: green→yellow→red
  if (bar) {
    if (pct < 40)       bar.style.background = 'linear-gradient(to right,#44ff88,#ffcc00)';
    else if (pct < 70)  bar.style.background = 'linear-gradient(to right,#ffcc00,#ff8800)';
    else                bar.style.background = 'linear-gradient(to right,#ff8800,#ff4400)';
  }
}

function increaseInterceptChance() {
  // Only GM/captain updates this
  if (window.myName !== window._captainName && !window.isGM) return;
  const next = Math.min(currentInterceptChance + INTERCEPT_INCREASE, MAX_INTERCEPT_CHANCE);
  set(chanceRef, next);
}

window.resetInterceptChance = function() {
  if (!window.isGM) return;
  set(chanceRef, BASE_INTERCEPT_CHANCE);
};

// Track which intercept events we've already shown (by ts) to avoid double-showing
const _shownIntercepts = new Set();
// Record the time this client loaded — ignore any intercept older than this
const _clientLoadTs = Date.now();

onValue(interceptRef, snap => {
  const data = snap.val();
  if (!data || !data.active) return;

  // Ignore any intercept that predates the current session opening
  // This prevents stale alerts firing for players who join mid-session or after a restart
  const cutoff = Math.max(sessionOpenedAt, _clientLoadTs);
  if (data.ts < cutoff) {
    // Stale — clean it up silently if we're GM
    if (window.isGM) remove(interceptRef);
    return;
  }

  // Show the alert to EVERYONE — deduplicate by timestamp
  if (!_shownIntercepts.has(data.ts)) {
    _shownIntercepts.add(data.ts);

    // Captain stops the travel
    if (travelState && window.myName === window._captainName) {
      const elapsed  = Date.now() - travelState.startTs;
      const fraction = Math.min(elapsed / travelState.durationMs, 1);
      const travelledParsecs = parseFloat(travelState.parsecs) * fraction;
      // Small delay so animation has a moment to show the intercept position
      setTimeout(() => {
        set(positionRef, {x: data.x, y: data.y});
        remove(travelRef);
        advanceDateByTravel(travelledParsecs);
      }, 800);
    }

    showInterceptAlert(data);
  }
});

function rollInterception(fromX, fromY, toX, toY, parsecs) {
  // Always increase chance after each jump (win or lose)
  increaseInterceptChance();
  if (!interceptEnabled) return; // interception disabled by GM
  if (Math.random() > currentInterceptChance) return; // no intercept this time

  // Intercept happens at a random point along the route (30–70%)
  const t = 0.3 + Math.random() * 0.4;
  const ix = Math.round(fromX + (toX - fromX) * t);
  const iy = Math.round(fromY + (toY - fromY) * t);

  set(interceptRef, {
    active: true,
    x: ix, y: iy,
    parsecs: parsecs,
    ts: Date.now()
  });

  // Auto-clear after 60 seconds
  setTimeout(() => {
    remove(interceptRef);
  }, 60000);
}

function showInterceptAlert(data) {
  const el = document.getElementById('interceptAlert');
  if (!el) return;
  document.getElementById('interceptCoords').textContent =
    'INTERCEPT COORDS: ' + Math.round(data.x) + ', ' + Math.round(data.y) +
    '  //  ' + parseFloat(data.parsecs).toFixed(2) + ' PC FROM ORIGIN';
  el.classList.add('open');
  const shopBtn = document.getElementById('interceptShopBtn');
  if (shopBtn) shopBtn.style.display = window.isGM ? 'block' : 'none';

  // Place a hazard marker at intercept point (visible on map)
  if (data.x && data.y) {
    const iid = 'intercept_' + data.ts;
    if (!window.markers[iid]) {
      set(ref(window.db, 'markers/' + iid), {
        id: iid,
        x: data.x, y: data.y,
        name: 'CLUNKKYNOOST',
        note: 'Emergency FTL dropout — interception by USCSS Clunkkynoost',
        type: 'enemy',
        color: '#ff4400',
        author: 'SYSTEM',
        ts: data.ts
      });
    }
  }
}

window.closeInterceptAlert = function() {
  document.getElementById('interceptAlert').classList.remove('open');
  // Captain/GM cleans up Firebase so no one else gets a stale alert
  if (window.isGM || window.myName === window._captainName) {
    remove(interceptRef);
  }
};

// GM manual trigger — fires immediately at current ship position (or midpoint of last route)
window.triggerManualIntercept = function() {
  if (!window.isGM) return;
  const btn = document.getElementById('gmInterceptBtn');
  if (btn) { btn.disabled = true; setTimeout(() => btn.disabled = false, 5000); }

  let ix, iy;
  if (travelState) {
    // Ship is in transit — intercept right now at current anim position
    ix = Math.round(_animShipX !== null ? _animShipX : travelState.fromX);
    iy = Math.round(_animShipY !== null ? _animShipY : travelState.fromY);
  } else if (shipPosition) {
    // Ship is stationary — intercept at ship's location
    ix = Math.round(shipPosition.x);
    iy = Math.round(shipPosition.y);
  } else {
    alert('Place the ship on the map first.');
    if (btn) btn.disabled = false;
    return;
  }

  set(interceptRef, {
    active: true,
    x: ix, y: iy,
    parsecs: '0.00',
    ts: Date.now(),
    manual: true
  });
  setTimeout(() => remove(interceptRef), 60000);
};

// ============================================================
// CAMPAIGN DATE SYSTEM
// ============================================================
const dateRef = ref(window.db, 'session/campaignDate');

// Campaign start: 05 March 2183
let campaignDate = new Date(2183, 2, 5); // month is 0-indexed

const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

function formatCampaignDate(d) {
  return String(d.getDate()).padStart(2,'0') + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
}

function parseCampaignDate(str) {
  // expects "05 MAR 2183"
  const parts = str.trim().toUpperCase().split(' ');
  if (parts.length !== 3) return null;
  const day   = parseInt(parts[0]);
  const month = MONTHS.indexOf(parts[1]);
  const year  = parseInt(parts[2]);
  if (isNaN(day) || month === -1 || isNaN(year)) return null;
  return new Date(year, month, day);
}

onValue(dateRef, snap => {
  const val = snap.val();
  if (val) {
    campaignDate = new Date(val);
  }
  renderDate();
});

function renderDate() {
  const el = document.getElementById('dateDisplay');
  if (el) el.textContent = formatCampaignDate(campaignDate);
  // Show edit button and position controls for GM only
  const editBtn = document.getElementById('dateEditBtn');
  if (editBtn) editBtn.classList.toggle('visible', window.isGM);
  const posBtn = document.getElementById('posBtn');
  if (posBtn) posBtn.style.display = window.isGM ? '' : 'none';
  const gmSec = document.getElementById('gmSection');
  if (gmSec) gmSec.classList.toggle('visible', window.isGM);
  // removePosBtn visibility is also gated — only show if GM AND ship placed
  const remBtn = document.getElementById('removePosBtn');
  if (remBtn) remBtn.style.display = (window.isGM && shipPosition) ? '' : 'none';
  // Show initiative button for everyone after login
  const initBtn = document.getElementById('initViewBtn');
  if (initBtn) initBtn.style.display = '';
}
window.renderDate = renderDate;

window.openDateModal = function() {
  if (!window.isGM) return;
  document.getElementById('dateInputField').value = formatCampaignDate(campaignDate);
  document.getElementById('dateModal').classList.add('open');
  setTimeout(() => document.getElementById('dateInputField').focus(), 50);
};

window.closeDateModal = function() {
  document.getElementById('dateModal').classList.remove('open');
};

window.confirmDate = function() {
  const raw = document.getElementById('dateInputField').value;
  const d   = parseCampaignDate(raw);
  if (!d || isNaN(d.getTime())) {
    document.getElementById('dateInputField').style.borderColor = 'var(--accent2)';
    setTimeout(() => document.getElementById('dateInputField').style.borderColor = '', 1200);
    return;
  }
  set(dateRef, d.getTime());
  closeDateModal();
};

window.adjustDate = function(days) {
  const d = new Date(campaignDate.getTime());
  d.setDate(d.getDate() + days);
  document.getElementById('dateInputField').value = formatCampaignDate(d);
};

// Advance date automatically when travel completes
// Called from animateShip when journey ends
function advanceDateByTravel(parsecs) {
  if (!window.isGM) return; // only captain/GM updates date
  const days = parsecs * 20; // FTL 20 = 20 days/parsec
  const d = new Date(campaignDate.getTime());
  d.setDate(d.getDate() + Math.round(days));
  set(dateRef, d.getTime());
}

// ============================================================
// CAPTAIN SYSTEM
// ============================================================
const captainRef  = ref(window.db, 'session/captain');
const positionRef = ref(window.db, 'session/shipPosition');
const routeRef    = ref(window.db, 'session/route');
const travelRef   = ref(window.db, 'session/travel');

window._captainName = '';
let shipPosition = null;   // {x, y}
let currentRoute = null;   // {fromId, toId}
let travelState  = null;   // {fromX,fromY,toX,toY,startTs,durationMs} or null
let positionMode = false;
let animFrame    = null;

onValue(captainRef, snap => {
  window._captainName = snap.val() || '';
  updateCaptainUI();
  // re-render player list with crown
  const listEl = document.getElementById('playersList');
  if (listEl) {
    // trigger re-render by re-running last users snapshot — just redraw
    window.draw();
  }
});

onValue(positionRef, snap => {
  shipPosition = snap.val() || null;
  const btn = document.getElementById('removePosBtn');
  if (btn) btn.style.display = (window.isGM && shipPosition) ? '' : 'none';
  updateTravelDropdowns();
  updateDistanceDropdowns();
  updateTravelBtn();
  window.draw();
});

onValue(routeRef, snap => {
  currentRoute = snap.val() || null;
  updateTravelDropdownsFromRoute();
  window.draw();
});

onValue(travelRef, snap => {
  travelState = snap.val() || null;
  updateTravelStatus();
  if (travelState) startTravelAnimation();
  else draw();
});

function updateCaptainUI() {
  const isCaptain = (window.myName && window._captainName === window.myName);
  const panel = document.getElementById('captainControls');
  if (panel) panel.style.display = isCaptain ? '' : 'none';
  updateTravelBtn();
}
window.updateCaptainUI = updateCaptainUI;

window.setCaptain = function(name) {
  if (!window.isGM) return; // only GM can assign captain
  if (window._captainName === name) return; // already captain
  set(captainRef, name);
};

// ============================================================
// SHIP POSITION MARKER
// ============================================================
window.togglePositionMode = function() {
  positionMode = !positionMode;
  const btn = document.getElementById('posBtn');
  if (positionMode) {
    btn.classList.add('active');
    btn.textContent = '🎯 Click map to place...';
    canvas.style.cursor = 'crosshair';
  } else {
    btn.classList.remove('active');
    btn.textContent = '📍 Set Ship Position';
    canvas.style.cursor = 'crosshair';
  }
};

window.removePosition = function() {
  remove(positionRef);
  shipPosition = null;
};

// Hook into map click — if positionMode, place ship instead of marker
const _origOpenModal = window.openModal;
window.openModal = function(x, y) {
  if (positionMode) {
    set(positionRef, {x, y});
    positionMode = false;
    const btn = document.getElementById('posBtn');
    if (btn) { btn.classList.remove('active'); btn.textContent = '📍 Set Ship Position'; }
    return;
  }
  _origOpenModal(x, y);
};

function drawShipPosition() {
  if (!shipPosition) return;
  const { ctx, viewScale } = window.getMapState();
  const x = shipPosition.x, y = shipPosition.y;
  const r = 16/viewScale;

  // Outer pulse ring
  ctx.strokeStyle = '#44ff88';
  ctx.lineWidth   = 1.5/viewScale;
  ctx.globalAlpha = 0.35;
  ctx.beginPath(); ctx.arc(x, y, r*2, 0, Math.PI*2); ctx.stroke();
  ctx.globalAlpha = 0.15;
  ctx.beginPath(); ctx.arc(x, y, r*3, 0, Math.PI*2); ctx.stroke();
  ctx.globalAlpha = 1;

  // Cross-hair lines
  ctx.strokeStyle = '#44ff88';
  ctx.lineWidth   = 1/viewScale;
  ctx.globalAlpha = 0.6;
  ctx.beginPath(); ctx.moveTo(x-r*2.5,y); ctx.lineTo(x+r*2.5,y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x,y-r*2.5); ctx.lineTo(x,y+r*2.5); ctx.stroke();
  ctx.globalAlpha = 1;

  // Circle bg
  ctx.fillStyle = 'rgba(4,17,26,0.9)';
  ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#44ff88';
  ctx.lineWidth   = 2/viewScale;
  ctx.shadowColor = '#44ff88'; ctx.shadowBlur = 8/viewScale;
  ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.stroke();
  ctx.shadowBlur  = 0;

  // Ship icon
  ctx.font = (15/viewScale) + 'px serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('🚀', x, y);

  // Label
  ctx.font = 'bold ' + (13/viewScale) + 'px "Share Tech Mono",monospace';
  ctx.textBaseline = 'top'; ctx.textAlign = 'center';
  const label = 'CM-90S CORVUS';
  const lw = ctx.measureText(label).width + 16/viewScale;
  const ly = y+r+2/viewScale;
  ctx.fillStyle = 'rgba(4,17,26,0.96)';
  ctx.fillRect(x-lw/2, ly, lw, 20/viewScale);
  ctx.strokeStyle = '#44ff88'; ctx.lineWidth = 1/viewScale; ctx.globalAlpha = 0.55;
  ctx.strokeRect(x-lw/2, ly, lw, 20/viewScale);
  ctx.globalAlpha = 1;
  ctx.lineJoin = 'round'; ctx.miterLimit = 2;
  ctx.lineWidth = 3/viewScale; ctx.strokeStyle = '#000';
  ctx.strokeText(label, x, y+r+5/viewScale);
  ctx.fillStyle = '#44ff88';
  ctx.fillText(label, x, y+r+5/viewScale);
  ctx.textBaseline = 'alphabetic';
}

// ============================================================
// PERSISTENT ROUTE LINE
// ============================================================
function drawRouteLine() {
  if (!currentRoute) return;
  const { ctx, viewScale } = window.getMapState();
  let a, b;
  if (currentRoute.shipFrom) {
    // Route from ship's current position (or travel destination)
    const pos = (_animShipX !== null) ? {x:_animShipX,y:_animShipY} : shipPosition;
    if (!pos) return;
    a = pos;
  } else {
    a = window.markers[currentRoute.fromId];
  }
  b = window.markers[currentRoute.toId];
  if (!a || !b) return;

  ctx.save();
  ctx.setLineDash([10/viewScale, 6/viewScale]);
  ctx.strokeStyle = '#ffcc00';
  ctx.lineWidth   = 2/viewScale;
  ctx.globalAlpha = 0.7;
  ctx.shadowColor = '#ffcc00'; ctx.shadowBlur = 6/viewScale;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  ctx.setLineDash([]);

  // Midpoint parsec label
  const mx = (a.x+b.x)/2, my = (a.y+b.y)/2;
  const dist = Math.sqrt((b.x-a.x)**2+(b.y-a.y)**2);
  const pc   = (dist/PX_PER_PARSEC).toFixed(2);
  ctx.font = 'bold '+(13/viewScale)+'px "Share Tech Mono",monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  const label = pc+' pc';
  const lw = ctx.measureText(label).width+16/viewScale;
  const lh = 20/viewScale;
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(4,17,26,0.96)';
  ctx.fillRect(mx-lw/2, my-lh-3/viewScale, lw, lh);
  ctx.strokeStyle = '#ffcc00'; ctx.lineWidth = 1/viewScale; ctx.globalAlpha = 0.55;
  ctx.strokeRect(mx-lw/2, my-lh-3/viewScale, lw, lh);
  ctx.globalAlpha = 1;
  ctx.lineJoin = 'round'; ctx.miterLimit = 2;
  ctx.lineWidth = 3/viewScale; ctx.strokeStyle = '#000';
  ctx.shadowBlur = 0;
  ctx.strokeText(label, mx, my-5/viewScale);
  ctx.fillStyle = '#ffcc00';
  ctx.fillText(label, mx, my-5/viewScale);
  ctx.restore();
}

// ============================================================
// TRAVEL ANIMATION
// ============================================================
let _animShipX = null, _animShipY = null;

function startTravelAnimation() {
  if (animFrame) cancelAnimationFrame(animFrame);
  animateShip();
}

function animateShip() {
  if (!travelState) { draw(); return; }
  const now      = Date.now();
  const elapsed  = now - travelState.startTs;
  let   t        = Math.min(elapsed / travelState.durationMs, 1);
  // Ease in-out
  t = t < 0.5 ? 2*t*t : -1+(4-2*t)*t;

  _animShipX = travelState.fromX + (travelState.toX - travelState.fromX) * t;
  _animShipY = travelState.fromY + (travelState.toY - travelState.fromY) * t;

  window.draw();

  if (elapsed < travelState.durationMs) {
    animFrame = requestAnimationFrame(animateShip);
  } else {
    // Travel complete — update ship position to destination
    const completedParsecs = travelState ? parseFloat(travelState.parsecs) : 0;
    _animShipX = null; _animShipY = null;
    if (window.myName === window._captainName) {
      set(positionRef, {x: travelState.toX, y: travelState.toY});
      remove(travelRef);
      advanceDateByTravel(completedParsecs);
    }
    travelState = null;
    updateTravelStatus();
    window.draw();
  }
}

function drawTravelingShip() {
  if (_animShipX === null) return;
  const { ctx, viewScale } = window.getMapState();
  const x = _animShipX, y = _animShipY;
  const r = 14/viewScale;

  // Engine trail
  ctx.save();
  const ang = Math.atan2(travelState ? travelState.toY-travelState.fromY : 0,
                         travelState ? travelState.toX-travelState.fromX : 0);
  const trail = ctx.createLinearGradient(
    x - Math.cos(ang)*50/viewScale, y - Math.sin(ang)*50/viewScale, x, y
  );
  trail.addColorStop(0,'rgba(255,100,0,0)');
  trail.addColorStop(1,'rgba(255,200,50,0.4)');
  ctx.strokeStyle = trail;
  ctx.lineWidth   = 6/viewScale;
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.moveTo(x - Math.cos(ang)*50/viewScale, y - Math.sin(ang)*50/viewScale);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.restore();

  // Glow
  const glow = ctx.createRadialGradient(x,y,0,x,y,r*2.5);
  glow.addColorStop(0,'rgba(255,200,50,0.3)'); glow.addColorStop(1,'transparent');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(x,y,r*2.5,0,Math.PI*2); ctx.fill();

  // Circle
  ctx.fillStyle = 'rgba(4,17,26,0.9)';
  ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#ffcc00'; ctx.lineWidth=2/viewScale;
  ctx.shadowColor='#ffcc00'; ctx.shadowBlur=10/viewScale;
  ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.stroke();
  ctx.shadowBlur=0;

  ctx.font=(15/viewScale)+'px serif';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('🚀',x,y);

  // ETA label
  if (travelState) {
    const remaining = Math.max(0, travelState.durationMs - (Date.now()-travelState.startTs));
    const secs = Math.ceil(remaining/1000);
    const label = 'IN TRANSIT — '+secs+'s';
    ctx.font='bold '+(13/viewScale)+'px "Share Tech Mono",monospace';
    ctx.textBaseline='top'; ctx.textAlign='center';
    const lw=ctx.measureText(label).width+16/viewScale;
    const ly = y+r+2/viewScale;
    ctx.fillStyle='rgba(4,17,26,0.96)';
    ctx.fillRect(x-lw/2,ly,lw,20/viewScale);
    ctx.strokeStyle='#ffcc00'; ctx.lineWidth=1/viewScale; ctx.globalAlpha=0.55;
    ctx.strokeRect(x-lw/2,ly,lw,20/viewScale);
    ctx.globalAlpha=1;
    ctx.lineJoin='round'; ctx.miterLimit=2;
    ctx.lineWidth=3/viewScale; ctx.strokeStyle='#000';
    ctx.strokeText(label,x,y+r+5/viewScale);
    ctx.fillStyle='#ffcc00';
    ctx.fillText(label,x,y+r+5/viewScale);
    ctx.textBaseline='alphabetic';
  }
}

// Captain: start travel
window.startTravel = function() {
  if (window.myName !== window._captainName) return;
  if (travelState) return;
  if (!shipPosition) {
    document.getElementById('travelStatus').textContent='PLACE SHIP POSITION FIRST';
    return;
  }
  const toId = document.getElementById('travelTo').value;
  if (!toId) {
    document.getElementById('travelStatus').textContent='SELECT DESTINATION';
    return;
  }
  const b = window.markers[toId];
  if (!b) return;
  const a = shipPosition; // always start from ship's current position

  const dist     = Math.sqrt((b.x-a.x)**2+(b.y-a.y)**2);
  const parsecs  = dist/PX_PER_PARSEC;
  // Animation: 1 parsec = 3 seconds of animation (so a long trip feels longer)
  const durationMs = Math.max(4000, parsecs * 3000);

  set(travelRef, {
    fromX:a.x, fromY:a.y, toX:b.x, toY:b.y,
    startTs: Date.now(), durationMs,
    fromName:'CM-90S CORVUS', toName:b.name,
    parsecs: parsecs.toFixed(2)
  });
  // Save route for line drawing (use ship position as pseudo-marker)
  set(routeRef, {shipFrom: true, toId});
  // Remove static ship position while traveling
  remove(positionRef);

  // Roll for Clunkkynoost interception — fires partway through travel
  const interceptDelay = durationMs * (0.3 + Math.random() * 0.4);
  setTimeout(() => {
    rollInterception(a.x, a.y, b.x, b.y, parsecs);
  }, interceptDelay);
};

function updateTravelStatus() {
  const el = document.getElementById('travelStatus');
  const btn = document.getElementById('travelBtn');
  if (!el||!btn) return;
  if (travelState) {
    el.className='travel-status active';
    el.textContent='IN TRANSIT: '+travelState.parsecs+' pc';
    btn.className='travel-btn traveling';
    btn.textContent='⏳ IN TRANSIT...';
  } else {
    el.className='travel-status';
    el.textContent='';
    btn.className='travel-btn enabled';
    btn.textContent='🚀 INITIATE JUMP';
    updateTravelBtn();
  }
}

function updateTravelBtn() {
  const btn = document.getElementById('travelBtn');
  if (!btn) return;
  if (travelState) return;
  const isCap = window.myName && window._captainName === window.myName;
  const toV   = document.getElementById('travelTo')?.value;
  const ready = isCap && shipPosition && toV;
  btn.className = 'travel-btn' + (ready?' enabled':'');
}
window.updateTravelBtn = updateTravelBtn;

function updateTravelDropdownsFromRoute() {
  if (!currentRoute) return;
  const t = document.getElementById('travelTo');
  if (t && currentRoute.toId) t.value = currentRoute.toId;
}

// ============================================================
// DISTANCE CALCULATOR
// Grid calibration: map spans X: -23 to +23 (46 squares) across ~2900px of the 3200px image
// Grid origin (0,0) is roughly at pixel (1600, 1033) on the 3200x2067 image
// So 1 parsec ≈ 63px on the source image
// ============================================================
const PX_PER_PARSEC = 63.0;  // pixels per parsec on the 3200px-wide source image
const LY_PER_PARSEC = 3.26156;

let distLineActive = false;
let distFromId = null;
let distToId   = null;

function updateTravelDropdowns() {
  const arr = Object.values(window.markers).sort((a,b)=>a.name.localeCompare(b.name));
  const opts = '<option value="">— Destination —</option>' +
    arr.map(m=>`<option value="${m.id}">${m.name.toUpperCase()}</option>`).join('');
  const t=document.getElementById('travelTo');
  if(t){ const pt=t.value; t.innerHTML=opts; if(pt) t.value=pt; }

  // Update the "from" label to show current ship position status
  const label = document.getElementById('travelFromLabel');
  if (label) {
    if (shipPosition) {
      label.textContent = 'CM-90S CORVUS (CURRENT POS)';
      label.style.color = '#44ff88';
    } else {
      label.textContent = 'NO SHIP PLACED';
      label.style.color = '#ff4400';
    }
  }
  updateTravelDropdownsFromRoute();
}

function updateDistanceDropdowns() {
  const arr = Object.values(window.markers).sort((a,b) => a.name.localeCompare(b.name));
  const fromSel = document.getElementById('distFrom');
  const toSel   = document.getElementById('distTo');
  const prevFrom = fromSel.value;
  const prevTo   = toSel.value;

  const shipOpt = shipPosition
    ? '<option value="__ship__">🚀 CM-90S CORVUS (SHIP)</option>'
    : '';
  const markerOpts = arr.map(m => `<option value="${m.id}">${m.name.toUpperCase()} (${window.typeLabels[m.type]})</option>`).join('');
  const opts = '<option value="">— Select —</option>' + shipOpt + markerOpts;

  fromSel.innerHTML = opts;
  toSel.innerHTML   = opts;

  if (prevFrom) fromSel.value = prevFrom;
  if (prevTo)   toSel.value   = prevTo;
}
window.updateTravelDropdowns = updateTravelDropdowns;
window.updateDistanceDropdowns = updateDistanceDropdowns;

window.calculateDistance = function() {
  const fromId = document.getElementById('distFrom').value;
  const toId   = document.getElementById('distTo').value;
  if (!fromId || !toId || fromId === toId) {
    document.getElementById('distResult').classList.remove('visible');
    return;
  }
  distFromId = fromId;
  distToId   = toId;
  const a = (fromId === '__ship__') ? shipPosition : window.markers[fromId];
  const b = (toId   === '__ship__') ? shipPosition : window.markers[toId];
  if (!a || !b) return;

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distPx = Math.sqrt(dx*dx + dy*dy);
  const parsecs = distPx / PX_PER_PARSEC;
  const ly      = parsecs * LY_PER_PARSEC;

  document.getElementById('distParsecs').textContent = parsecs.toFixed(2) + ' PARSECS';
  document.getElementById('distLY').textContent      = ly.toFixed(2) + ' LIGHT YEARS';

  // Alien RPG: FTL rating = days per parsec (core rulebook)
  // CM-90S Corvus has FTL rating 20
  const FTL_RATING = 20;
  const travelDays = parsecs * FTL_RATING;
  let timeStr = '';
  if (travelDays < 1)        timeStr = Math.round(travelDays * 24) + ' HOURS';
  else if (travelDays < 30)  timeStr = travelDays.toFixed(1) + ' DAYS';
  else if (travelDays < 365) timeStr = (travelDays / 30).toFixed(1) + ' MONTHS';
  else                       timeStr = (travelDays / 365).toFixed(2) + ' YEARS';
  document.getElementById('distExtra').textContent = 'CM-90S CORVUS (FTL 20): ≈ ' + timeStr;

  document.getElementById('distResult').classList.add('visible');
  window.draw(); // redraw to show/update line
};

window.toggleDistLine = function() {
  distLineActive = !distLineActive;
  const btn = document.getElementById('distLineBtn');
  btn.textContent = 'Show Line: ' + (distLineActive ? 'ON' : 'OFF');
  btn.classList.toggle('active', distLineActive);
  window.draw();
};

// Draw distance line on canvas (called inside draw())
function drawDistanceLine() {
  if (!distLineActive || !distFromId || !distToId) return;
  const { ctx, viewScale } = window.getMapState();
  const a = (distFromId === '__ship__') ? shipPosition : window.markers[distFromId];
  const b = (distToId   === '__ship__') ? shipPosition : window.markers[distToId];
  if (!a || !b) return;

  const ax = a.x, ay = a.y;
  const bx = b.x, by = b.y;

  // Dashed yellow line
  ctx.save();
  ctx.setLineDash([8/viewScale, 5/viewScale]);
  ctx.strokeStyle = '#ffcc00';
  ctx.lineWidth   = 1.5/viewScale;
  ctx.globalAlpha = 0.8;
  ctx.shadowColor = '#ffcc00';
  ctx.shadowBlur  = 6/viewScale;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
  ctx.setLineDash([]);

  // Midpoint label
  const mx = (ax+bx)/2, my = (ay+by)/2;
  const dx = bx-ax, dy = by-ay;
  const dist = Math.sqrt(dx*dx+dy*dy);
  const parsecs = (dist / PX_PER_PARSEC).toFixed(2);

  ctx.font = 'bold ' + (13/viewScale) + 'px "Share Tech Mono",monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  const label = parsecs + ' pc';
  const lw = ctx.measureText(label).width + 16/viewScale;
  const lh = 20/viewScale;
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(4,17,26,0.96)';
  ctx.fillRect(mx - lw/2, my - lh - 3/viewScale, lw, lh);
  ctx.strokeStyle = '#ffcc00'; ctx.lineWidth = 1/viewScale; ctx.globalAlpha = 0.55;
  ctx.strokeRect(mx - lw/2, my - lh - 3/viewScale, lw, lh);
  ctx.globalAlpha = 1;
  ctx.lineJoin = 'round'; ctx.miterLimit = 2;
  ctx.lineWidth = 3/viewScale; ctx.strokeStyle = '#000';
  ctx.shadowBlur = 0;
  ctx.strokeText(label, mx, my - 5/viewScale);
  ctx.fillStyle = '#ffcc00';
  ctx.fillText(label, mx, my - 5/viewScale);
  ctx.restore();
}

window.drawShipPosition  = drawShipPosition;
window.drawRouteLine     = drawRouteLine;
window.drawTravelingShip = drawTravelingShip;
window.drawDistanceLine  = drawDistanceLine;

// ---- Init ----
window.resize();

// ═══════════════════════════════════════════════════════════════
//  CLUNKKYNOOST TRADE TERMINAL — v2.0
// ═══════════════════════════════════════════════════════════════
const _SHOP_ICONS = {
  "medkit":       '<svg viewBox="0 0 32 32" fill="none"><rect x="4" y="4" width="24" height="24" rx="2" stroke="#d8b26b" stroke-width="1.5"/><rect x="13" y="9" width="6" height="14" fill="#d8b26b"/><rect x="9" y="13" width="14" height="6" fill="#d8b26b"/></svg>',
  "surgical":     '<svg viewBox="0 0 32 32" fill="none"><line x1="8" y1="8" x2="24" y2="24" stroke="#d8b26b" stroke-width="2" stroke-linecap="round"/><line x1="24" y1="8" x2="8" y2="24" stroke="#d8b26b" stroke-width="1" stroke-linecap="round" opacity="0.5"/><circle cx="8" cy="8" r="3" stroke="#d8b26b" stroke-width="1.5"/><circle cx="24" cy="24" r="3" stroke="#d8b26b" stroke-width="1.5"/></svg>',
  "syringe":      '<svg viewBox="0 0 32 32" fill="none"><rect x="12" y="4" width="8" height="18" rx="2" stroke="#d8b26b" stroke-width="1.5"/><rect x="14" y="2" width="4" height="4" fill="#d8b26b"/><line x1="16" y1="22" x2="16" y2="30" stroke="#d8b26b" stroke-width="1.5" stroke-dasharray="2 2"/><circle cx="16" cy="13" r="3" fill="#d8b26b" opacity="0.4"/></svg>',
  "pills":        '<svg viewBox="0 0 32 32" fill="none"><ellipse cx="10" cy="16" rx="7" ry="4" transform="rotate(-40 10 16)" stroke="#d8b26b" stroke-width="1.5"/><line x1="7.5" y1="12" x2="12.5" y2="20" stroke="#d8b26b" stroke-width="1.5"/><ellipse cx="22" cy="16" rx="7" ry="4" transform="rotate(-40 22 16)" stroke="#d8b26b" stroke-width="1.5"/></svg>',
  "hydr8tion":    '<svg viewBox="0 0 32 32" fill="none"><path d="M11 6 L11 4 L21 4 L21 6" stroke="#d8b26b" stroke-width="1.5"/><rect x="9" y="6" width="14" height="20" rx="3" stroke="#d8b26b" stroke-width="1.5"/><line x1="12" y1="14" x2="20" y2="14" stroke="#d8b26b" stroke-width="1" opacity="0.6"/><line x1="12" y1="18" x2="18" y2="18" stroke="#d8b26b" stroke-width="1" opacity="0.4"/></svg>',
  "knife":        '<svg viewBox="0 0 32 32" fill="none"><path d="M6 26 L20 8 L26 8 L26 12 L10 28 Z" stroke="#d8b26b" stroke-width="1.5" fill="none"/><line x1="6" y1="26" x2="10" y2="28" stroke="#d8b26b" stroke-width="2" stroke-linecap="round"/><line x1="20" y1="12" x2="24" y2="10" stroke="#d8b26b" stroke-width="1" opacity="0.5"/></svg>',
  "pistol":       '<svg viewBox="0 0 32 32" fill="none"><path d="M4 12 L20 12 L20 8 L26 8 L26 12 L28 12 L28 16 L20 16 L20 24 L16 24 L14 20 L8 20 L6 16 L4 16 Z" stroke="#d8b26b" stroke-width="1.5" fill="none"/><line x1="6" y1="14" x2="12" y2="14" stroke="#d8b26b" stroke-width="1"/></svg>',
  "revolver":     '<svg viewBox="0 0 32 32" fill="none"><path d="M4 14 L18 14 L18 10 L22 10 L22 14 L28 14 L28 18 L22 18 L20 22 L14 22 L12 18 L4 18 Z" stroke="#d8b26b" stroke-width="1.5" fill="none"/><circle cx="15" cy="11" r="3" stroke="#d8b26b" stroke-width="1.5"/><circle cx="15" cy="11" r="1.2" fill="#d8b26b" opacity="0.5"/></svg>',
  "stunbaton":    '<svg viewBox="0 0 32 32" fill="none"><line x1="16" y1="28" x2="16" y2="10" stroke="#d8b26b" stroke-width="2"/><path d="M12 10 L14 6 L16 10 L18 6 L20 10" stroke="#d8b26b" stroke-width="1.5" fill="none"/><circle cx="16" cy="10" r="3" stroke="#d8b26b" stroke-width="1.5"/></svg>',
  "grenade":      '<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="20" r="8" stroke="#d8b26b" stroke-width="1.5"/><rect x="13" y="8" width="6" height="6" rx="1" stroke="#d8b26b" stroke-width="1.5"/><line x1="19" y1="8" x2="24" y2="4" stroke="#d8b26b" stroke-width="1.5"/></svg>',
  "shockgrenade": '<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="20" r="8" stroke="#d8b26b" stroke-width="1.5"/><rect x="13" y="8" width="6" height="6" rx="1" stroke="#d8b26b" stroke-width="1.5"/><path d="M14 17 L17 14 L16 18 L19 18 L16 22 L17 18Z" fill="#d8b26b" opacity="0.7"/></svg>',
  "boltgun":      '<svg viewBox="0 0 32 32" fill="none"><rect x="4" y="12" width="20" height="8" rx="1" stroke="#d8b26b" stroke-width="1.5"/><circle cx="26" cy="16" r="4" stroke="#d8b26b" stroke-width="1.5"/><line x1="4" y1="16" x2="2" y2="16" stroke="#d8b26b" stroke-width="2" stroke-linecap="round"/><rect x="10" y="8" width="8" height="4" stroke="#d8b26b" stroke-width="1"/></svg>',
  "motiontracker":'<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="10" stroke="#d8b26b" stroke-width="1.5"/><circle cx="16" cy="16" r="6" stroke="#d8b26b" stroke-width="1" opacity="0.5"/><circle cx="16" cy="16" r="2" fill="#d8b26b"/><line x1="16" y1="6" x2="22" y2="12" stroke="#d8b26b" stroke-width="1.5" stroke-linecap="round"/></svg>',
  "armor":        '<svg viewBox="0 0 32 32" fill="none"><path d="M16 4 L26 8 L26 20 C26 24 21 28 16 30 C11 28 6 24 6 20 L6 8 Z" stroke="#d8b26b" stroke-width="1.5" fill="none"/><line x1="16" y1="10" x2="16" y2="24" stroke="#d8b26b" stroke-width="1" opacity="0.5"/><line x1="10" y1="14" x2="22" y2="14" stroke="#d8b26b" stroke-width="1" opacity="0.5"/></svg>',
  "compressionsuit":'<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="10" r="5" stroke="#d8b26b" stroke-width="1.5"/><path d="M9 26 L9 17 C9 15 12 14 16 14 C20 14 23 15 23 17 L23 26" stroke="#d8b26b" stroke-width="1.5"/><line x1="9" y1="26" x2="23" y2="26" stroke="#d8b26b" stroke-width="1.5"/><line x1="9" y1="20" x2="6" y2="20" stroke="#d8b26b" stroke-width="1.5"/><line x1="23" y1="20" x2="26" y2="20" stroke="#d8b26b" stroke-width="1.5"/></svg>',
  "pressuresuit": '<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="9" r="5" stroke="#d8b26b" stroke-width="1.5"/><rect x="3" y="8" width="5" height="3" rx="1" stroke="#d8b26b" stroke-width="1" opacity="0.6"/><rect x="24" y="8" width="5" height="3" rx="1" stroke="#d8b26b" stroke-width="1" opacity="0.6"/><path d="M8 26 L8 16 C8 14 11 13 16 13 C21 13 24 14 24 16 L24 26" stroke="#d8b26b" stroke-width="1.5"/><line x1="8" y1="26" x2="24" y2="26" stroke="#d8b26b" stroke-width="1.5"/></svg>',
  "kevlar":       '<svg viewBox="0 0 32 32" fill="none"><path d="M8 6 L16 4 L24 6 L26 22 L16 28 L6 22 Z" stroke="#d8b26b" stroke-width="1.5" fill="none"/><line x1="8" y1="12" x2="24" y2="12" stroke="#d8b26b" stroke-width="1" opacity="0.5"/><line x1="8" y1="18" x2="24" y2="18" stroke="#d8b26b" stroke-width="1" opacity="0.5"/></svg>',
  "pdat":         '<svg viewBox="0 0 32 32" fill="none"><rect x="7" y="4" width="18" height="24" rx="2" stroke="#d8b26b" stroke-width="1.5"/><line x1="11" y1="10" x2="21" y2="10" stroke="#d8b26b" stroke-width="1"/><line x1="11" y1="14" x2="21" y2="14" stroke="#d8b26b" stroke-width="1"/><line x1="11" y1="18" x2="17" y2="18" stroke="#d8b26b" stroke-width="1"/><circle cx="16" cy="24" r="1.5" fill="#d8b26b" opacity="0.6"/></svg>',
  "ssdd":         '<svg viewBox="0 0 32 32" fill="none"><rect x="6" y="8" width="20" height="14" rx="2" stroke="#d8b26b" stroke-width="1.5"/><line x1="10" y1="12" x2="14" y2="12" stroke="#d8b26b" stroke-width="1.5"/><line x1="10" y1="16" x2="18" y2="16" stroke="#d8b26b" stroke-width="1.5"/><rect x="18" y="10" width="5" height="10" rx="1" stroke="#d8b26b" stroke-width="1"/><line x1="12" y1="22" x2="12" y2="26" stroke="#d8b26b" stroke-width="1.5"/><line x1="20" y1="22" x2="20" y2="26" stroke="#d8b26b" stroke-width="1.5"/><line x1="10" y1="26" x2="22" y2="26" stroke="#d8b26b" stroke-width="1.5"/></svg>',
  "jack":         '<svg viewBox="0 0 32 32" fill="none"><rect x="14" y="4" width="4" height="24" rx="2" stroke="#d8b26b" stroke-width="1.5"/><rect x="8" y="10" width="16" height="4" rx="1" stroke="#d8b26b" stroke-width="1.5"/><circle cx="10" cy="12" r="2" fill="#d8b26b" opacity="0.5"/><circle cx="22" cy="12" r="2" fill="#d8b26b" opacity="0.5"/></svg>',
  "pulserifle":   '<svg viewBox="0 0 32 32" fill="none"><path d="M2 14 L22 14 L22 11 L28 11 L28 14 L30 14 L30 18 L22 18 L22 22 L18 22 L16 18 L10 18 L8 22 L4 22 L4 18 L2 18 Z" stroke="#d8b26b" stroke-width="1.5" fill="none"/><rect x="22" y="14" width="3" height="4" fill="#d8b26b" opacity="0.3"/><line x1="5" y1="16" x2="14" y2="16" stroke="#d8b26b" stroke-width="1" opacity="0.5"/></svg>',
  "evapistol":    '<svg viewBox="0 0 32 32" fill="none"><path d="M4 13 L18 13 L18 9 L24 9 L24 13 L28 13 L28 17 L18 17 L18 23 L14 23 L12 19 L6 19 L4 17 Z" stroke="#d8b26b" stroke-width="1.5" fill="none"/><line x1="24" y1="11" x2="28" y2="9" stroke="#d8b26b" stroke-width="1" opacity="0.7"/></svg>',
  "espistol":     '<svg viewBox="0 0 32 32" fill="none"><path d="M4 12 L20 12 L20 8 L26 8 L26 12 L28 12 L28 16 L20 16 L20 24 L16 24 L14 20 L8 20 L6 16 L4 16 Z" stroke="#d8b26b" stroke-width="1.5" fill="none"/><circle cx="27" cy="10" r="2" fill="#d8b26b" opacity="0.6"/></svg>',
  "apesuit":      '<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="9" r="4" stroke="#d8b26b" stroke-width="1.5"/><circle cx="16" cy="9" r="2" stroke="#d8b26b" stroke-width="1" opacity="0.5"/><path d="M9 28 L9 17 C9 15 12 14 16 14 C20 14 23 15 23 17 L23 28" stroke="#d8b26b" stroke-width="1.5"/><line x1="9" y1="28" x2="23" y2="28" stroke="#d8b26b" stroke-width="1.5"/><line x1="9" y1="20" x2="4" y2="22" stroke="#d8b26b" stroke-width="1.5"/><line x1="23" y1="20" x2="28" y2="22" stroke="#d8b26b" stroke-width="1.5"/></svg>',
  "scoperifle":   '<svg viewBox="0 0 32 32" fill="none"><path d="M2 15 L24 15 L24 12 L30 12 L30 15 L30 18 L24 18 L24 21 L20 21 L18 18 L8 18 L6 21 L2 21 Z" stroke="#d8b26b" stroke-width="1.5" fill="none"/><circle cx="10" cy="10" r="3" stroke="#d8b26b" stroke-width="1.5"/><line x1="10" y1="7" x2="10" y2="4" stroke="#d8b26b" stroke-width="1.5"/><line x1="10" y1="13" x2="10" y2="15" stroke="#d8b26b" stroke-width="1"/></svg>',
  "xdrugs":       '<svg viewBox="0 0 32 32" fill="none"><rect x="10" y="6" width="6" height="14" rx="2" stroke="#d8b26b" stroke-width="1.5"/><rect x="12" y="4" width="2" height="4" fill="#d8b26b" opacity="0.6"/><rect x="18" y="10" width="5" height="10" rx="2" stroke="#d8b26b" stroke-width="1.5"/><rect x="19" y="8" width="3" height="4" fill="#d8b26b" opacity="0.4"/><path d="M10 16 L16 16" stroke="#d8b26b" stroke-width="1" opacity="0.5"/></svg>',
  "xenosample":   '<svg viewBox="0 0 32 32" fill="none"><ellipse cx="16" cy="14" rx="6" ry="9" stroke="#d8b26b" stroke-width="1.5"/><path d="M10 14 C10 20 22 20 22 14" stroke="#d8b26b" stroke-width="1"/><path d="M13 6 L19 6" stroke="#d8b26b" stroke-width="2" stroke-linecap="round"/><circle cx="16" cy="14" r="2" fill="#d8b26b" opacity="0.4"/></svg>',
  "androidcore":  '<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="12" r="5" stroke="#d8b26b" stroke-width="1.5"/><path d="M11 12 L6 8 M21 12 L26 8" stroke="#d8b26b" stroke-width="1.5"/><rect x="8" y="18" width="16" height="10" rx="2" stroke="#d8b26b" stroke-width="1.5"/><circle cx="12" cy="23" r="1.5" fill="#d8b26b"/><circle cx="20" cy="23" r="1.5" fill="#d8b26b"/></svg>',
  "artifact":     '<svg viewBox="0 0 32 32" fill="none"><polygon points="16,4 28,12 28,20 16,28 4,20 4,12" stroke="#d8b26b" stroke-width="1.5" fill="#11140f"/><circle cx="16" cy="16" r="4" stroke="#d8b26b" stroke-width="1"/><circle cx="16" cy="16" r="1.5" fill="#d8b26b" opacity="0.8"/></svg>',
  "synthblood":   '<svg viewBox="0 0 32 32" fill="none"><path d="M16 4 C16 4 8 14 8 20 C8 24.4 11.6 28 16 28 C20.4 28 24 24.4 24 20 C24 14 16 4 16 4Z" stroke="#d8b26b" stroke-width="1.5" fill="#0a0c0a"/><path d="M12 22 C12 22 14 20 16 22 C18 24 20 22 20 22" stroke="#d8b26b" stroke-width="1" opacity="0.6"/></svg>',
  "datachip":     '<svg viewBox="0 0 32 32" fill="none"><rect x="8" y="8" width="16" height="16" rx="2" stroke="#d8b26b" stroke-width="1.5"/><rect x="12" y="12" width="8" height="8" stroke="#d8b26b" stroke-width="1"/><line x1="8" y1="12" x2="4" y2="12" stroke="#d8b26b" stroke-width="1.5"/><line x1="8" y1="16" x2="4" y2="16" stroke="#d8b26b" stroke-width="1.5"/><line x1="8" y1="20" x2="4" y2="20" stroke="#d8b26b" stroke-width="1.5"/><line x1="24" y1="12" x2="28" y2="12" stroke="#d8b26b" stroke-width="1.5"/><line x1="24" y1="16" x2="28" y2="16" stroke="#d8b26b" stroke-width="1.5"/><line x1="24" y1="20" x2="28" y2="20" stroke="#d8b26b" stroke-width="1.5"/></svg>',
  "plans":        '<svg viewBox="0 0 32 32" fill="none"><rect x="5" y="4" width="22" height="28" rx="1" stroke="#d8b26b" stroke-width="1.5"/><line x1="9" y1="10" x2="23" y2="10" stroke="#d8b26b" stroke-width="1"/><line x1="9" y1="14" x2="23" y2="14" stroke="#d8b26b" stroke-width="1"/><line x1="9" y1="18" x2="17" y2="18" stroke="#d8b26b" stroke-width="1"/><rect x="9" y="21" width="10" height="7" stroke="#d8b26b" stroke-width="1"/></svg>',
  "androidlogs":  '<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="12" r="5" stroke="#d8b26b" stroke-width="1.5"/><path d="M8 28 C8 22 12 20 16 20 C20 20 24 22 24 28" stroke="#d8b26b" stroke-width="1.5"/><line x1="10" y1="9" x2="10" y2="6" stroke="#d8b26b" stroke-width="1.5"/><line x1="22" y1="9" x2="22" y2="6" stroke="#d8b26b" stroke-width="1.5"/></svg>',
  "lifescans":    '<svg viewBox="0 0 32 32" fill="none"><rect x="4" y="6" width="24" height="20" rx="2" stroke="#d8b26b" stroke-width="1.5"/><path d="M7 16 L10 16 L12 10 L15 22 L17 16 L20 16 L22 12 L25 16" stroke="#d8b26b" stroke-width="1.5" fill="none"/></svg>',
  "coordinates":  '<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="10" stroke="#d8b26b" stroke-width="1.5"/><path d="M7 16 L25 16 M16 7 L16 25" stroke="#d8b26b" stroke-width="1" opacity="0.4"/><circle cx="16" cy="16" r="4" stroke="#d8b26b" stroke-width="1"/><circle cx="16" cy="16" r="1.5" fill="#d8b26b"/></svg>',
  "manifest":     '<svg viewBox="0 0 32 32" fill="none"><rect x="6" y="4" width="20" height="26" rx="1" stroke="#d8b26b" stroke-width="1.5"/><line x1="10" y1="9" x2="22" y2="9" stroke="#d8b26b" stroke-width="1"/><line x1="10" y1="13" x2="22" y2="13" stroke="#d8b26b" stroke-width="1"/><line x1="10" y1="17" x2="22" y2="17" stroke="#d8b26b" stroke-width="1"/><line x1="10" y1="21" x2="18" y2="21" stroke="#d8b26b" stroke-width="1"/><circle cx="9" cy="9" r="1" fill="#d8b26b"/><circle cx="9" cy="13" r="1" fill="#d8b26b"/><circle cx="9" cy="17" r="1" fill="#d8b26b"/><circle cx="9" cy="21" r="1" fill="#d8b26b"/></svg>',
  "shotgun":      '<svg viewBox="0 0 32 32" fill="none"><rect x="2" y="13" width="22" height="6" stroke="#d8b26b" stroke-width="1.5"/><rect x="24" y="12" width="6" height="8" rx="1" stroke="#d8b26b" stroke-width="1.5"/><rect x="6" y="19" width="10" height="3" stroke="#d8b26b" stroke-width="1.5"/><line x1="2" y1="16" x2="0" y2="16" stroke="#d8b26b" stroke-width="2"/><line x1="18" y1="13" x2="22" y2="10" stroke="#d8b26b" stroke-width="1"/></svg>',
  "flamer":       '<svg viewBox="0 0 32 32" fill="none"><rect x="3" y="10" width="13" height="6" rx="1" stroke="#d8b26b" stroke-width="1.5"/><rect x="6" y="16" width="5" height="10" rx="2" stroke="#d8b26b" stroke-width="1.5"/><line x1="16" y1="13" x2="22" y2="13" stroke="#d8b26b" stroke-width="2"/><path d="M22 10 Q26 12 28 9 Q27 14 30 16 Q26 15 23 17 Q25 14 22 10Z" stroke="#d8b26b" stroke-width="1" fill="#d8b26b" fill-opacity="0.3"/></svg>',
  "axe":          '<svg viewBox="0 0 32 32" fill="none"><line x1="6" y1="28" x2="22" y2="6" stroke="#d8b26b" stroke-width="2"/><path d="M20 4 L26 5 L26 12 L18 10 Z" stroke="#d8b26b" stroke-width="1.5" fill="#d8b26b" fill-opacity="0.2"/><line x1="6" y1="28" x2="9" y2="29" stroke="#d8b26b" stroke-width="2"/></svg>',
  "torch":        '<svg viewBox="0 0 32 32" fill="none"><rect x="6" y="14" width="14" height="6" rx="2" stroke="#d8b26b" stroke-width="1.5"/><line x1="20" y1="17" x2="26" y2="17" stroke="#d8b26b" stroke-width="2"/><path d="M26 13 Q30 17 26 21 Q28 17 26 13Z" stroke="#d8b26b" stroke-width="1" fill="#d8b26b" fill-opacity="0.3"/><line x1="10" y1="20" x2="10" y2="26" stroke="#d8b26b" stroke-width="1.5"/><line x1="16" y1="20" x2="16" y2="26" stroke="#d8b26b" stroke-width="1.5"/></svg>',
  "harpoon":      '<svg viewBox="0 0 32 32" fill="none"><rect x="4" y="13" width="12" height="5" stroke="#d8b26b" stroke-width="1.5"/><line x1="16" y1="15.5" x2="25" y2="15.5" stroke="#d8b26b" stroke-width="2"/><path d="M25 12 L30 15.5 L25 19 L23 15.5Z" stroke="#d8b26b" stroke-width="1.5" fill="#d8b26b" fill-opacity="0.2"/><path d="M22 13 L24 15.5 L22 18" stroke="#d8b26b" stroke-width="1" opacity="0.6"/><line x1="4" y1="18" x2="6" y2="22" stroke="#d8b26b" stroke-width="1.5"/></svg>',
  "seismic":      '<svg viewBox="0 0 32 32" fill="none"><rect x="10" y="8" width="12" height="18" rx="1" stroke="#d8b26b" stroke-width="1.5"/><circle cx="16" cy="14" r="3" stroke="#d8b26b" stroke-width="1"/><line x1="16" y1="11" x2="16" y2="14" stroke="#d8b26b" stroke-width="1.5"/><line x1="14" y1="20" x2="18" y2="20" stroke="#d8b26b" stroke-width="1" opacity="0.5"/><line x1="13" y1="23" x2="19" y2="23" stroke="#d8b26b" stroke-width="1" opacity="0.5"/></svg>',
  "smoke":        '<svg viewBox="0 0 32 32" fill="none"><rect x="12" y="14" width="8" height="14" rx="1" stroke="#d8b26b" stroke-width="1.5"/><rect x="13" y="11" width="6" height="3" stroke="#d8b26b" stroke-width="1.5"/><path d="M6 9 Q10 5 14 9 Q18 5 22 9 Q26 6 26 11" stroke="#d8b26b" stroke-width="1.5" fill="none" opacity="0.7"/><path d="M9 5 Q13 2 17 5" stroke="#d8b26b" stroke-width="1" opacity="0.4"/></svg>',
  "powercell":    '<svg viewBox="0 0 32 32" fill="none"><rect x="5" y="10" width="20" height="14" rx="1" stroke="#d8b26b" stroke-width="1.5"/><rect x="25" y="14" width="3" height="6" stroke="#d8b26b" stroke-width="1.5"/><line x1="11" y1="14" x2="11" y2="20" stroke="#d8b26b" stroke-width="2"/><line x1="9" y1="17" x2="13" y2="17" stroke="#d8b26b" stroke-width="2"/><line x1="19" y1="17" x2="23" y2="17" stroke="#d8b26b" stroke-width="2"/></svg>',
  "flashlight":   '<svg viewBox="0 0 32 32" fill="none"><rect x="6" y="13" width="14" height="6" rx="1" stroke="#d8b26b" stroke-width="1.5"/><path d="M20 11 L26 9 L26 23 L20 21 Z" stroke="#d8b26b" stroke-width="1.5" fill="#d8b26b" fill-opacity="0.15"/><circle cx="11" cy="16" r="1.5" fill="#d8b26b" opacity="0.6"/><path d="M27 13 L30 11 M27 16 L31 16 M27 19 L30 21" stroke="#d8b26b" stroke-width="1" opacity="0.6"/></svg>',
  "scope":        '<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="9" stroke="#d8b26b" stroke-width="1.5"/><circle cx="16" cy="16" r="5" stroke="#d8b26b" stroke-width="1" opacity="0.4"/><line x1="16" y1="5" x2="16" y2="13" stroke="#d8b26b" stroke-width="1"/><line x1="16" y1="19" x2="16" y2="27" stroke="#d8b26b" stroke-width="1"/><line x1="5" y1="16" x2="13" y2="16" stroke="#d8b26b" stroke-width="1"/><line x1="19" y1="16" x2="27" y2="16" stroke="#d8b26b" stroke-width="1"/><circle cx="16" cy="16" r="1.2" fill="#d8b26b"/></svg>',
  "binoc":        '<svg viewBox="0 0 32 32" fill="none"><rect x="4" y="10" width="10" height="13" rx="2" stroke="#d8b26b" stroke-width="1.5"/><rect x="18" y="10" width="10" height="13" rx="2" stroke="#d8b26b" stroke-width="1.5"/><line x1="14" y1="14" x2="18" y2="14" stroke="#d8b26b" stroke-width="1.5"/><line x1="14" y1="19" x2="18" y2="19" stroke="#d8b26b" stroke-width="1.5"/><circle cx="9" cy="17" r="2" stroke="#d8b26b" stroke-width="1" opacity="0.5"/><circle cx="23" cy="17" r="2" stroke="#d8b26b" stroke-width="1" opacity="0.5"/></svg>',
  "visor":        '<svg viewBox="0 0 32 32" fill="none"><path d="M4 12 L4 20 C4 24 8 26 16 26 C24 26 28 24 28 20 L28 12 Z" stroke="#d8b26b" stroke-width="1.5"/><rect x="6" y="14" width="20" height="6" stroke="#d8b26b" stroke-width="1" fill="#d8b26b" fill-opacity="0.2"/><line x1="8" y1="17" x2="14" y2="17" stroke="#d8b26b" stroke-width="1" opacity="0.7"/><line x1="18" y1="17" x2="24" y2="17" stroke="#d8b26b" stroke-width="1" opacity="0.7"/><line x1="12" y1="10" x2="20" y2="10" stroke="#d8b26b" stroke-width="1.5"/></svg>',
  "holotab":      '<svg viewBox="0 0 32 32" fill="none"><rect x="3" y="22" width="26" height="4" rx="1" stroke="#d8b26b" stroke-width="1.5"/><line x1="7" y1="22" x2="5" y2="28" stroke="#d8b26b" stroke-width="1.5"/><line x1="25" y1="22" x2="27" y2="28" stroke="#d8b26b" stroke-width="1.5"/><polygon points="16,5 23,17 9,17" stroke="#d8b26b" stroke-width="1.5" fill="#d8b26b" fill-opacity="0.18"/><line x1="13" y1="13" x2="19" y2="13" stroke="#d8b26b" stroke-width="1" opacity="0.6"/><circle cx="16" cy="20" r="1.2" fill="#d8b26b" opacity="0.7"/></svg>',
  "badge":        '<svg viewBox="0 0 32 32" fill="none"><polygon points="16,3 19,12 28,13 21,19 23,28 16,23 9,28 11,19 4,13 13,12" stroke="#d8b26b" stroke-width="1.5" fill="#d8b26b" fill-opacity="0.18"/><circle cx="16" cy="16" r="3" stroke="#d8b26b" stroke-width="1"/></svg>',
  "cryokey":      '<svg viewBox="0 0 32 32" fill="none"><circle cx="9" cy="16" r="5" stroke="#d8b26b" stroke-width="1.5"/><line x1="14" y1="16" x2="29" y2="16" stroke="#d8b26b" stroke-width="2"/><line x1="22" y1="16" x2="22" y2="20" stroke="#d8b26b" stroke-width="1.5"/><line x1="26" y1="16" x2="26" y2="22" stroke="#d8b26b" stroke-width="1.5"/><path d="M9 12 L9 20 M5 16 L13 16 M6.5 13.5 L11.5 18.5 M11.5 13.5 L6.5 18.5" stroke="#d8b26b" stroke-width="0.8" opacity="0.7"/></svg>',
  "boots":        '<svg viewBox="0 0 32 32" fill="none"><path d="M8 4 L14 4 L14 20 L21 20 L21 26 L4 26 L4 20 L8 20 Z" stroke="#d8b26b" stroke-width="1.5"/><line x1="4" y1="22" x2="21" y2="22" stroke="#d8b26b" stroke-width="1" opacity="0.5"/><circle cx="26" cy="13" r="1.5" fill="#d8b26b" opacity="0.7"/><circle cx="26" cy="20" r="1.5" fill="#d8b26b" opacity="0.7"/><line x1="24" y1="16.5" x2="28" y2="16.5" stroke="#d8b26b" stroke-width="0.6" opacity="0.5"/></svg>',
  "cryopod":      '<svg viewBox="0 0 32 32" fill="none"><rect x="4" y="6" width="24" height="20" rx="8" stroke="#d8b26b" stroke-width="1.5"/><rect x="8" y="10" width="16" height="12" rx="4" stroke="#d8b26b" stroke-width="1" fill="#d8b26b" fill-opacity="0.12"/><line x1="11" y1="14" x2="21" y2="14" stroke="#d8b26b" stroke-width="1" opacity="0.5"/><line x1="11" y1="17" x2="21" y2="17" stroke="#d8b26b" stroke-width="1" opacity="0.5"/><circle cx="26" cy="16" r="0.8" fill="#d8b26b"/></svg>',
  "crate":        '<svg viewBox="0 0 32 32" fill="none"><rect x="4" y="8" width="24" height="20" stroke="#d8b26b" stroke-width="1.5"/><rect x="4" y="6" width="24" height="4" stroke="#d8b26b" stroke-width="1.5"/><path d="M13 16 Q13 13 16 13 Q19 13 19 16 Q19 18 16 19 L16 21" stroke="#d8b26b" stroke-width="1.5" fill="none"/><circle cx="16" cy="24" r="1" fill="#d8b26b"/><line x1="10" y1="8" x2="10" y2="28" stroke="#d8b26b" stroke-width="0.5" opacity="0.3"/><line x1="22" y1="8" x2="22" y2="28" stroke="#d8b26b" stroke-width="0.5" opacity="0.3"/></svg>'
};

const _SHOP_CATALOG = {
  medical: [
    { id:'medkit',    icon:'medkit',    name:'PERSONAL MEDKIT',
      desc:'MEDICAL AID +2 to give first aid. Single use. Pharmax bandages, wound cauterizer, stim boost. Not a permanent solution — just keeps your guts in until you reach an AutoDoc.',
      price: 80 },
    { id:'surgical',  icon:'surgical',  name:'SURGICAL KIT',
      desc:'MEDICAL AID +2 for first aid and surgery on critical injuries. Base damage 2 if used as a weapon. These nasty-looking instruments can mean life or death — in either direction.',
      price: 300 },
    { id:'naproleve', icon:'syringe',   name:'NAPROLEVE (×3 doses)',
      desc:'Injectable pain reliever. Reduces stress level to zero. Overdose warning: intoxicating. Second dose in same shift: −1 die to all rolls. Recommended for self-inflicted cesareans.',
      price: 90 },
    { id:'neversleep',icon:'pills',     name:'NEVERSLEEP PILLS (×10)',
      desc:'Stress +1 but removes need for sleep for 24 hours. Cannot relieve stress while active. Fast-acting stimulant. Excessive use may cause stroke. Worth it.',
      price: 40 },
    { id:'hydr8tion', icon:'hydr8tion', name:'HYDR8TION (×6 doses)',
      desc:'Electrolyte solution countering hypersleep fatigue. The only drug on the Frontier with zero known side effects. Highly recommended after waking up in a cryo-pod.',
      price: 60 },
  ],
  weapons: [
    { id:'knife',    icon:'knife',       name:'COMBAT KNIFE',
      desc:'Modifier +1, Damage 2, Range A/A. Compact and reliable. When everything else runs dry, you still have this. Every crew member should carry one.',
      price: 80 },
    { id:'pistol',   icon:'pistol',      name:'M4A3 SERVICE PISTOL',
      desc:'Modifier +2, Damage 2, Range A/M, Ammo 2. Standard USCMC 9mm sidearm. Inexpensive and simple. You should always have a backup for your backup — this pistol might as well be it.',
      price: 350 },
    { id:'revolver', icon:'revolver',    name:'.357 MAGNUM REVOLVER',
      desc:'Modifier +1, Damage 3, Range S/M, Ammo 1. Classic high-caliber revolver. Equally popular amongst Frontier Marshals and lowlifes. Hits like a freight loader.',
      price: 450 },
    { id:'stunbaton',icon:'stunbaton',   name:'STUN BATON',
      desc:'Modifier +1, Damage 1 (stun), Power 2. Basically a cattle prod. Designed to keep pests and livestock in order on the Frontier. Touch can incapacitate. Non-lethal. Mostly.',
      price: 120 },
    { id:'grenade',  icon:'grenade',     name:'M40 HEDP GRENADE',
      desc:'Damage 2E, Single use. High Explosive Dual Purpose. Remove red cap, depress trigger, count three seconds. The UPP makes an equivalent. Gustav\'s is real USCMC surplus.',
      price: 200 },
    { id:'shockgrenade',icon:'shockgrenade',name:'G2 ELECTROSHOCK GRENADE',
      desc:'Damage 2E (stun), Single use. Electronic ballbreakers. Propels one meter off the ground before releasing a mega-voltage pulse. Good for crowd control. Better for emergencies.',
      price: 700 },
    { id:'boltgun',  icon:'boltgun',     name:'WATATSUMI DV-303 BOLT GUN',
      desc:'Modifier −1, Damage 3, AP, Single-shot. Construction tool that fires expanding bolts for hull repair. Improvised as a weapon by Frontier rebels in 2106. Nasty at close range.',
      price: 600 },
    { id:'shotgun',  icon:'shotgun',     name:'M37A2 12-GAUGE PUMP ACTION',
      desc:'Modifier +2, Damage 3, Range A/S, Ammo 1. Classic pump-action combat shotgun. USCMC optional issue. Serial number filed off. Came in with the last shipment.',
      price: 750 },
    { id:'vp70',     icon:'pistol',      name:'VP-70MA6 SERVICE PISTOL',
      desc:'Modifier +2, Damage 2, Range A/M, Ammo 2. Modern USCMC sidearm gradually replacing the M4A3. Found in the kit of a Lieutenant who never made it home from Anchorpoint.',
      price: 400 },
    { id:'incinerator',icon:'flamer',    name:'M240 INCINERATOR UNIT',
      desc:'Modifier +1, Damage 2 (fire), Range S/S, Ammo 2. "Bake-a-Flake." Carbine flamethrower with naphtha canisters. Most things retreat from fire. Most.',
      price: 900 },
    { id:'fireaxe',  icon:'axe',         name:'FIRE AXE',
      desc:'Modifier ±0, Damage 2, AP, Range A/A. Every ship has one in the wall. Gustav sells the "spare." When the lights go out, this still works.',
      price: 100 },
    { id:'smokegrenade',icon:'smoke',    name:'SMOKE GRENADE',
      desc:'Single use. Causes no damage. Blocks line-of-sight into, out of, and within the target zone. The difference between an ambush and an escape.',
      price: 350 },
    { id:'harpoon',  icon:'harpoon',     name:'SPACESUB ASSO-400 HARPOON GUN',
      desc:'Modifier ±0, Damage 1, Range S/M, Single-shot. Emergency docking tether. On a hit, the grappling hook attaches. In zero-G: rappel toward heavier mass, or pull lighter mass to you (STRENGTH).',
      price: 550 },
  ],
  tech: [
    { id:'motiontracker',icon:'motiontracker',name:'M314 MOTION TRACKER',
      desc:'Power 5, Range Long. High-powered ultrasonic motion detection. Originally designed for rescue teams. Adopted by the military for obvious reasons. Keep it in your hand at all times.',
      price: 1500 },
    { id:'armor',    icon:'armor',       name:'M3 PERSONNEL ARMOR',
      desc:'Armor Level 2, comm unit, PDT. USCMC standard vest. Rigid plates, ballistic padding, clamshell greaves. Protects against edges and explosions. Not against pulse rounds. Sorry.',
      price: 1500 },
    { id:'compressionsuit',icon:'compressionsuit',name:'IRC MK.50 COMPRESSION SUIT',
      desc:'Air 5, vacuum protection, comm unit, head light. State of the art sixty years ago. Still the most common suit on the Frontier. If you get blown out into space, you want to be in a Mk.50.',
      price: 4500 },
    { id:'pressuresuit',icon:'pressuresuit',name:'IRC MK.35 PRESSURE SUIT',
      desc:'Armor 1, Air 4, vacuum protection, −2 to MOBILITY. Bulky, cumbersome, joints seize with motion. Requires decompression after EVA. It sucks. But space is worse.',
      price: 2200 },
    { id:'kevlar',   icon:'kevlar',      name:'KEVLAR RIOT VEST',
      desc:'Armor Level 1. Lightweight woven synthetic fibers. Standard armor for law enforcement and security across the colonies. Light enough that you\'ll actually wear it.',
      price: 700 },
    { id:'pdat',     icon:'pdat',        name:'SEEGSON P-DAT',
      desc:'COMMAND +1. Personal data tablet. Syncs with Spectrograph Mapping Devices, PDTs, and helmet cams to coordinate a field team. Don\'t lead anyone into the dark without one.',
      price: 700 },
    { id:'ssdd',     icon:'ssdd',        name:'SEEGSON SYSTEM DIAGNOSTIC DEVICE',
      desc:'COMTECH +2. Troubleshoot computer and mechanical systems aboard any ship or station. A skilled engineer can also use it to hack doors and terminals. You didn\'t read that here.',
      price: 450 },
    { id:'jack',     icon:'jack',        name:'MAINTENANCE JACK',
      desc:'HEAVY MACHINERY +1. Opens unpowered airlocks, diverts power at junction boxes. Can be used as a weapon (bonus +1, damage 1). Every roughneck carries one.',
      price: 200 },
    { id:'cuttingtorch',icon:'torch',    name:'CUTTING TORCH',
      desc:'Modifier −1, Damage 3, AP, Range A/A, Power 3. Welding and cutting blowtorch. Through bulkheads, locked doors, and the occasional limb. The Rexim EVA started life as one of these.',
      price: 475 },
    { id:'powercell',icon:'powercell',   name:'POWER CELL',
      desc:'Restores full power supply to one item. Motion trackers, neuro visors, stun batons — anything that runs on juice eats these like candy. Stock up.',
      price: 50 },
    { id:'flashlight',icon:'flashlight', name:'FLASHLIGHT',
      desc:'Removes the effect of darkness in a zone. Range Short. Salvaged from a darkened corridor. The previous owner is no longer using it.',
      price: 75 },
    { id:'opticalscope',icon:'scope',    name:'OPTICAL SCOPE',
      desc:'Increases the range of a pistol or rifle by one category — aimed shots only. Various flavours, including laser-guided green. Mounted with field-glue if Gustav was in a hurry.',
      price: 120 },
    { id:'binoculars',icon:'binoc',      name:'BINOCULARS',
      desc:'OBSERVATION +2 at Long range or more. Rangefinder and night-vision options available. Helps you see what wants to eat you before it sees you.',
      price: 180 },
    { id:'holotab', icon:'holotab',      name:'HOLOTAB STRATEGIC DISPLAY',
      desc:'OBSERVATION & COMMAND +2. High-end strategic analysis platform. 3D holographic projections from scanned or recorded data. Civilian models are illegal in three sectors. Gustav has two.',
      price: 145000 },
  ],
  contraband: [
    { id:'pulserifle',icon:'pulserifle', name:'M41A PULSE RIFLE',
      desc:'Modifier +2, Damage 2, AP, Full Auto, Range S/L, includes grenade launcher. USCMC standard issue. 10mm explosive-tip caseless rounds. Military hardware — illegal for civilians. Gustav asks no questions.',
      price: 5500 },
    { id:'evapistol',icon:'evapistol',  name:'REXIM RXF-M5 EVA PISTOL',
      desc:'Modifier +1, Damage 1, AP, Range S/M, Ammo 4. Armor-piercing laser welder repurposed as a sidearm by J\'Har rebels during the 2106 uprising. Now standard on W-Y commercial fleet. Hard to source.',
      price: 900 },
    { id:'espistol', icon:'espistol',   name:'WEYLAND ES-4 ELECTROSTATIC PISTOL',
      desc:'Modifier +1, Damage 1 (stun), AP, Range S/M. Corporate security only. Blue muzzle-flash. Electrostatically charged AP rounds. Fell out of service — but W-Y never stopped making them.',
      price: 2200 },
    { id:'apesuit',  icon:'apesuit',    name:'W-Y APESUIT',
      desc:'Armor 1, Air 4, Armor 3 vs acid, facehugger protection. W-Y security commando gear. Impervious to caustic substances. If you see people in these suits, the thing they\'re hunting is already looking for you.',
      price: 8500 },
    { id:'scoperifle',icon:'scoperifle',name:'M42A SCOPE RIFLE',
      desc:'Modifier +3, Damage 2, AP, Range M/E, Ammo 2. USCMC semi-automatic sniper rifle. Folding bipod, flash suppressor, adjustable stock. If you see it before it sees you — take the shot.',
      price: 2200 },
    { id:'xdrugs',   icon:'xdrugs',     name:'X-DRUGS (COMBAT STIMS)',
      desc:'The extreme stuff that corporations try to keep off their colonies. Increases strength, endurance, and senses. Prolonged use: hallucinations, seizures, psychosis. USCMC is rumored to be experimenting with new variants.',
      priceMin: 100, priceMax: 300 },
    { id:'ak4047',   icon:'pulserifle', name:'AK-4047 PULSE ASSAULT RIFLE',
      desc:'Modifier +1, Damage 2, AP, Full Auto, Range S/L, Ammo 2. UPP knockoff of the M41A. Cheap, dirty, loud, reliable. Mercenaries swear by it. Customs officers hate it.',
      price: 1100 },
    { id:'f44aa',    icon:'pulserifle', name:'F44AA PULSE RIFLE',
      desc:'Modifier +3, Damage 2, AP, Full Auto, Range S/L, Ammo 3. ⚠ Unreliable. Precursor to the M41A with external aim-assist cable. Almost obsolete. Smugglers love it because customs scanners don\'t flag it as USCMC.',
      price: 2900 },
    { id:'seismic',  icon:'seismic',    name:'SEISMIC SURVEY CHARGE',
      desc:'Damage 3E, Range S/M, Single use. Officially for surveying newly colonized worlds. Unofficially: punches holes through hull plate, bedrock, or whatever\'s in the way.',
      price: 400 },
    { id:'neurovisor',icon:'visor',     name:'NEURO VISOR',
      desc:'COMTECH roll. Power 5, Range Long. Helmet HUD that interfaces with the subconscious of a hypersleeping subject. Skilled users can communicate. Advanced users can manipulate dreams. Read that twice.',
      price: 14500 },
  ],
  specials: [
    { id:'rebuiltm41',icon:'pulserifle',name:'"REBUILT" M41A PULSE RIFLE',
      desc:'Modifier +2, Damage 2, AP, Full Auto, Range S/L, Ammo 3, grenade launcher. ⚠ Unreliable — Gustav\'s own machine-shop mods. Jams on Mess-Up (7+). 20% off retail. Good news first: it shoots.',
      price: 4500 },
    { id:'refurbtracker',icon:'motiontracker',name:'REFURB. M314 MOTION TRACKER',
      desc:'Power 5, Range Long. Same specs as factory. ⚠ Antenna previously fixed with tape. On a Mess-Up (7+) the unit goes dead for one round. Gustav swears he tested it. Once.',
      price: 1200 },
    { id:'halfcells',icon:'powercell',  name:'HALF-CHARGED POWER CELLS (×5)',
      desc:'Bundle of five power cells. Each restores a random amount (roll D6: 1–2 = +1, 3–4 = +2, 5–6 = full). Cheaper than retail, but you don\'t know what you\'re plugging in until you do.',
      price: 150 },
    { id:'foldedapesuit',icon:'apesuit',name:'FOLDED W-Y APESUIT (DAMAGED)',
      desc:'Armor 1, Air 4. ⚠ Acid resistance reduced to Armor 1 (factory is 3). Facehugger protection INTACT. There\'s a hole at the knee. Nothing came through it. Probably. 35% off retail.',
      price: 5500 },
    { id:'bootlegstims',icon:'xdrugs',  name:'BOOTLEG COMBAT STIMS',
      desc:'X-Drug knockoff. Increased strength, endurance, senses. ⚠ On a 1 (D6) per dose: immediate +2 stress + hallucinations for one shift. Quality varies by batch. Don\'t mix labels.',
      priceMin: 60, priceMax: 200 },
    { id:'fakepdt',  icon:'pdat',       name:'COUNTERFEIT PDT IMPLANT',
      desc:'Spoofs a Personal Data Transmitter ID. Pick from Gustav\'s "list of available identities." On scan by a verified W-Y or USCMC system: silent flag, no immediate alert. Surgery required. He knows a guy.',
      price: 1200 },
    { id:'wytablet', icon:'pdat',       name:'BLACK-MARKET W-Y MAINTENANCE TABLET',
      desc:'COMTECH +1 on W-Y systems specifically. Stolen P-DAT pre-loaded with maintenance creds. ONE override code burned in — single-use. After that it\'s just a fancy paperweight.',
      price: 2800 },
    { id:'marshalbadge',icon:'badge',   name:'COLONIAL MARSHAL\'S BADGE',
      desc:'MANIPULATION +1 on Frontier worlds. ⚠ Impersonating a Marshal is a Frontier capital offense. Genuine article. Slight scratch on the back. Gustav declines to describe the previous owner.',
      price: 800 },
    { id:'cryokey',  icon:'cryokey',    name:'HYPERSLEEP OVERRIDE KEY',
      desc:'Bypasses MU/TH/UR crew-revive checks. Wake a crewmate without authorization. Or DON\'T wake one. Used in the Nostromo incident, 2122. Officially never existed.',
      price: 3500 },
    { id:'mysterydata',icon:'datachip', name:'ENCRYPTED DATACHIP — "DO NOT OPEN"',
      desc:'Sealed long-data disc. The labelling is intentional. Gustav doesn\'t know what\'s on it. Buyer pays in cash. Read at your own risk. (GM rolls on hidden table when the chip is accessed.)',
      price: 600 },
    { id:'uppknife', icon:'knife',      name:'CARBON-SCORED UPP COMBAT KNIFE',
      desc:'Modifier +1, Damage 2, Range A/A. Standard knife stats. ✦ MANIPULATION +1 in UPP/Frontier contexts when worn openly. Engraved in Cyrillic: "За отца." Gustav won\'t say where he got it.',
      price: 120 },
    { id:'synthlimbs',icon:'androidcore',name:'SALVAGED SYNTH LIMBS (SET)',
      desc:'Spare arm, spare leg, replacement faceplate. Mismatched skin tones — donor models all different. Critical for repairing an android crewmate. Doesn\'t ask which android.',
      price: 1800 },
    { id:'magboots', icon:'boots',      name:'MAGNETIC BOOTS (STRIPPED MK.35)',
      desc:'+1 to MOBILITY in zero-G. Cut from a damaged Mk.35 pressure suit. The clamps haven\'t failed yet. Not in any of Gustav\'s deliveries, anyway.',
      price: 400 },
    { id:'usedcryo', icon:'cryopod',    name:'USED MK.III CIVILIAN CRYO-POD',
      desc:'Single-occupant hypersleep capsule. Functional. Fits in standard cargo bay — 3h install. Some old brown stains around the drain. The vendor declines all questions about the previous occupant. Asking again costs $100.',
      price: 8000 },
    { id:'shard',    icon:'artifact',   name:'"ENGINEER POTTERY SHARD"',
      desc:'Triangular fragment with concentric engraved pattern. Probably a fake from the Lazarus Prime tourist market. If authentic: Weyland-Yutani will pay obscenely well. If fake: nice paperweight.',
      price: 400 },
    { id:'mysterycrate',icon:'crate',   name:'W-Y "SPECIAL ORDER" CRATE',
      desc:'Sealed shipping container, W-Y branded. Manifest stripped. Gustav genuinely doesn\'t know what\'s inside. Could be premium gear. Could be a refrigerated specimen. Could be empty. (GM rolls on D10 loot table.)',
      price: 1500 },
  ],
  sell: [
    { id:'plans',      icon:'plans',      name:'STATION PLANS',      desc:'Detailed structural schematics for this installation. Someone out there will pay handsomely.',  sellPrice: 400  },
    { id:'androidlogs',icon:'androidlogs',name:'ANDROID MEMORY LOGS', desc:'Recovered synthetic neural recordings. Intact memories fetch premium from the right buyers.',  sellPrice: 800  },
    { id:'lifescans',  icon:'lifescans',  name:'XENO LIFE FORM SCANS',desc:'Biological scan data of extraterrestrial organisms. Weyland-Yutani pays top dollar. So do others.', sellPrice: 2000 },
    { id:'coordinates',icon:'coordinates',name:'UNCHARTED RUINS DATA', desc:'Coordinates and survey data for an unregistered Engineer ruin site. Handle with extreme care.',     sellPrice: 2500 },
    { id:'manifest',   icon:'manifest',   name:'CREW MANIFEST',       desc:'Full personnel records and biometrics for a crew. The kind of data that powerful people want buried.', sellPrice: 600  },
  ],
};

// ── state ──────────────────────────────────────────────────────
let _shopState      = null;
let _shopDismissed  = false;
let _shopCurrentCat = 'medical';
let _shopSeenTs     = 0;
let _shopFirstRead  = true;

function shopRef() { return ref(window.db, 'session/shop'); }

// ── helper: get all items flat ─────────────────────────────────
function _allItems() { return Object.values(_SHOP_CATALOG).flat(); }

// ── Firebase listener ──────────────────────────────────────────
let _shopRenderTimer = null;
onValue(ref(window.db, 'session/shop'), snap => {
  const data = snap.val();
  if (!data) {
    if (_shopState) document.getElementById('shopOverlay').classList.remove('open');
    _shopState = null; _shopFirstRead = true; _shopSeenTs = 0;
    return;
  }
  const incomingTs = data.ts || 0;
  if (_shopFirstRead) {
    _shopSeenTs = incomingTs; _shopFirstRead = false; _shopDismissed = true;
  } else if (incomingTs !== _shopSeenTs) {
    _shopSeenTs = incomingTs; _shopDismissed = false;
  }
  _shopState = data;
  // Debounce: batch rapid Firebase updates (e.g. checkout writing multiple paths)
  clearTimeout(_shopRenderTimer);
  _shopRenderTimer = setTimeout(() => {
    renderShop();
    if (!_shopDismissed) document.getElementById('shopOverlay').classList.add('open');
  }, 80);
});

// ── render ─────────────────────────────────────────────────────
function renderShop() {
  if (!_shopState) return;

  // GM bar
  const gmBar = document.getElementById('shopGmBar');
  if (gmBar) gmBar.style.display = window.isGM ? 'flex' : 'none';

  // My balance
  const bal = (_shopState.balances && _shopState.balances[window.myName] !== undefined)
    ? _shopState.balances[window.myName] : 1200;
  const el = document.getElementById('shopBalAmount');
  if (el) el.textContent = bal.toLocaleString();

  // GM: all-balances panel
  const gmBalPanel = document.getElementById('shopGmBalances');
  const gmBalList  = document.getElementById('shopGmBalList');
  if (gmBalPanel && gmBalList) {
    if (window.isGM && _shopState.balances) {
      gmBalPanel.style.display = 'block';
      const bals = _shopState.balances;
      gmBalList.innerHTML = Object.keys(bals).map(name => `
        <div class="shop-gm-bal-row">
          <span class="shop-gm-bal-name">${name}</span>
          <span class="shop-gm-bal-amount">${Number(bals[name]).toLocaleString()} $</span>
        </div>`).join('');
    } else {
      gmBalPanel.style.display = 'none';
    }
  }

  // Cart badge
  const allCarts = _shopState.carts || {};
  const myCartItems = Object.keys(allCarts[window.myName] || {}).filter(k => allCarts[window.myName][k]);
  const badge = document.getElementById('shopCartBadge');
  if (badge) {
    badge.textContent = myCartItems.length;
    badge.style.display = myCartItems.length ? '' : 'none';
  }

  // GM: pending sells approval panel
  const gmSellPanel = document.getElementById('shopGmSellPanel');
  const gmSellList  = document.getElementById('shopGmSellList');
  if (gmSellPanel && gmSellList) {
    const pending = (_shopState && _shopState.pendingSells) || {};
    const allPending = [];
    Object.keys(pending).forEach(player => {
      Object.keys(pending[player] || {}).forEach(itemId => {
        allPending.push({ player, itemId, ...pending[player][itemId] });
      });
    });
    gmSellPanel.style.display = (window.isGM && allPending.length > 0) ? 'block' : 'none';
    if (allPending.length > 0) {
      gmSellList.innerHTML = allPending.map(p => `
        <div class="shop-gm-bal-row" style="flex-wrap:wrap;gap:4px">
          <span class="shop-gm-bal-name" style="flex:1">${p.player}</span>
          <span style="color:#d8b26b;font-size:9px;flex:2">${p.name}</span>
          <span class="shop-gm-bal-amount">+${p.amount} $</span>
          <div style="display:flex;gap:4px;width:100%;justify-content:flex-end;margin-top:2px">
            <button onclick="shopGMApproveSell('${p.player}','${p.itemId}')"
              style="background:rgba(127,176,105,0.12);border:1px solid #7fb069;color:#7fb069;font-family:inherit;font-weight:500;font-size:9px;padding:4px 11px;cursor:pointer;letter-spacing:0.5px;border-radius:6px">✓ APPROVE</button>
            <button onclick="shopGMRejectSell('${p.player}','${p.itemId}')"
              style="background:rgba(224,106,82,0.12);border:1px solid #e06a52;color:#e06a52;font-family:inherit;font-weight:500;font-size:9px;padding:4px 11px;cursor:pointer;letter-spacing:0.5px;border-radius:6px">✗ REJECT</button>
          </div>
        </div>`).join('');
    }
    // Update sell badge on nav
    const sellBadge = document.getElementById('shopSellBadge');
    if (sellBadge) {
      sellBadge.textContent = allPending.length;
      sellBadge.style.display = (window.isGM && allPending.length > 0) ? '' : 'none';
    }
  }

  // Re-render current category
  shopRenderCategory(_shopCurrentCat);
}

window.shopSetCategory = function(cat, btn) {
  _shopCurrentCat = cat;
  document.querySelectorAll('.shop-nav-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  shopRenderCategory(cat);
};

function shopRenderCategory(cat) {
  // Skip if shop overlay isn't visible - saves CPU when background updates fire
  const overlay = document.getElementById('shopOverlay');
  if (!overlay || !overlay.classList.contains('open')) return;
  const title = document.getElementById('shopCatTitle');
  const grid  = document.getElementById('shopGrid');
  if (!grid) return;

  const labels = {
    medical:'⚕ MEDICAL SUPPLIES', weapons:'⚔ WEAPONS & TOOLS',
    tech:'📡 TECH & EQUIPMENT', contraband:'☣ CONTRABAND',
    specials:'✦ GUSTAV\'S SPECIALS — NO REFUNDS',
    sell:'💰 SELL INTEL', inventory:'🎒 YOUR INVENTORY',
    cart:'🛒 SHOPPING CART'
  };
  if (title) title.textContent = labels[cat] || cat.toUpperCase();

  if (cat === 'inventory') { shopRenderInventory(grid); return; }
  if (cat === 'sell')      { shopRenderSell(grid); return; }
  if (cat === 'cart')      { shopRenderCart(grid); return; }

  const items   = _SHOP_CATALOG[cat] || [];
  const myInv   = (_shopState && _shopState.inventories && _shopState.inventories[window.myName]) || {};
  const allCarts = (_shopState && _shopState.carts) || {};
  const myCart  = allCarts[window.myName] || {};
  const myBal   = (_shopState && _shopState.balances && _shopState.balances[window.myName] !== undefined)
                  ? _shopState.balances[window.myName] : 1200;

  grid.style.display = 'grid';
  grid.innerHTML = items.map(item => {
    const owned    = !!myInv[item.id];
    const inCart   = !!myCart[item.id];
    const minPrice = item.priceMin || item.price || 0;
    const dispPrice = item.priceMin ? item.priceMin + '–' + item.priceMax : item.price;
    const canAfford = owned || myBal >= minPrice;
    const icon = _SHOP_ICONS[item.icon] || '';

    let btnHtml;
    if (owned) {
      btnHtml = `<button class="shop-item-buy" style="opacity:.5;cursor:not-allowed" disabled>OWNED</button>`;
    } else if (inCart) {
      btnHtml = `<button class="shop-item-cart-btn in-cart" onclick="shopRemoveFromCart('${item.id}')">✓ IN CART</button>`;
    } else {
      btnHtml = `<button class="shop-item-cart-btn" onclick="shopAddToCart('${item.id}','${cat}')"
        ${!canAfford ? 'style="opacity:.4;cursor:not-allowed" disabled title="NOT ENOUGH CREDITS"' : ''}>+ CART</button>`;
    }

    return `<div class="shop-item ${owned ? 'owned' : inCart ? 'in-cart' : ''}">
      <div class="shop-item-icon">${icon}</div>
      <div class="shop-item-info">
        <div class="shop-item-name">${item.name}</div>
        <div class="shop-item-desc">${item.desc}</div>
        <div class="shop-item-footer">
          <div><span class="shop-item-price">${dispPrice}</span><span class="shop-item-price-unit"> $</span></div>
          ${btnHtml}
        </div>
      </div>
    </div>`;
  }).join('');
}

// ── SELL tab (GM-approval system) ──────────────────────────────
function shopRenderSell(grid) {
  const items = _SHOP_CATALOG['sell'] || [];
  const myPending = (_shopState && _shopState.pendingSells && _shopState.pendingSells[window.myName]) || {};
  grid.style.display = 'grid';
  grid.innerHTML = items.map(item => {
    const icon = _SHOP_ICONS[item.icon] || '';
    const isPending = !!myPending[item.id];
    let btnHtml;
    if (isPending) {
      btnHtml = `<button class="shop-item-sell" style="opacity:.5;cursor:not-allowed;background:#1a1408;border-color:#4a3a20" disabled>⏳ PENDING</button>`;
    } else {
      btnHtml = `<button class="shop-item-sell" onclick="shopRequestSell('${item.id}')">OFFER TO GM</button>`;
    }
    return `<div class="shop-item ${isPending?'in-cart':''}">
      <div class="shop-item-icon">${icon}</div>
      <div class="shop-item-info">
        <div class="shop-item-name">${item.name}</div>
        <div class="shop-item-desc">${item.desc}</div>
        <div class="shop-item-footer">
          <div><span class="shop-item-price">+${item.sellPrice}</span><span class="shop-item-price-unit"> $</span></div>
          ${btnHtml}
        </div>
      </div>
    </div>`;
  }).join('');
}

// ── REQUEST sell (sends to GM) ──────────────────────────────────
window.shopRequestSell = function(itemId) {
  if (!_shopState || !window.myName) return;
  const item = (_SHOP_CATALOG['sell'] || []).find(x => x.id === itemId);
  if (!item) return;
  set(ref(window.db, 'session/shop/pendingSells/' + window.myName + '/' + itemId), { ts: Date.now(), amount: item.sellPrice, name: item.name });
  shopShowToast('OFFER SENT — AWAITING GM APPROVAL');
};

// ── GM: APPROVE a pending sell ──────────────────────────────────
window.shopGMApproveSell = function(playerName, itemId) {
  if (!_shopState) return;
  const pending = _shopState.pendingSells && _shopState.pendingSells[playerName] && _shopState.pendingSells[playerName][itemId];
  if (!pending) return;
  const curBal = (_shopState.balances && _shopState.balances[playerName] !== undefined)
                 ? _shopState.balances[playerName] : 1200;
  set(ref(window.db, 'session/shop/balances/' + playerName), curBal + pending.amount);
  remove(ref(window.db, 'session/shop/pendingSells/' + playerName + '/' + itemId));
  shopShowToast('APPROVED: ' + playerName + ' +' + pending.amount + ' $');
};

// ── GM: REJECT a pending sell ───────────────────────────────────
window.shopGMRejectSell = function(playerName, itemId) {
  remove(ref(window.db, 'session/shop/pendingSells/' + playerName + '/' + itemId));
  shopShowToast('REJECTED: OFFER DECLINED');
};

// ── CART: add / remove ─────────────────────────────────────────
window.shopAddToCart = function(itemId, cat) {
  if (!_shopState || !window.myName) return;
  const items = _SHOP_CATALOG[cat] || [];
  const item  = items.find(x => x.id === itemId);
  if (!item) return;
  const myInv = (_shopState.inventories && _shopState.inventories[window.myName]) || {};
  if (myInv[itemId]) { shopShowToast('ALREADY OWNED'); return; }
  set(ref(window.db, 'session/shop/carts/' + window.myName + '/' + itemId), true);
  shopShowToast(item.name + ' → CART');
};

window.shopRemoveFromCart = function(itemId) {
  if (!window.myName) return;
  set(ref(window.db, 'session/shop/carts/' + window.myName + '/' + itemId), null);
};

// ── CART view ──────────────────────────────────────────────────
function shopRenderCart(grid) {
  grid.style.display = 'block';
  if (!_shopState) { grid.innerHTML = ''; return; }

  const allCarts = _shopState.carts || {};
  const bals     = _shopState.balances || {};
  const invs     = _shopState.inventories || {};
  const all      = _allItems();

  // Everyone sees everyone's cart
  const players = Object.keys(bals);

  if (!players.length) {
    grid.innerHTML = '<div class="shop-inv-empty">// NO PLAYERS IN SHOP</div>';
    return;
  }

  grid.innerHTML = players.map(name => {
    const cart   = Object.keys(allCarts[name] || {}).filter(k => allCarts[name][k]);
    const myInv  = invs[name] || {};
    const curBal = bals[name] !== undefined ? bals[name] : 1200;
    const isMe   = name === window.myName;

    // Calculate totals using median price for variable items
    let totalMin = 0, totalMax = 0;
    const cartDetails = cart.map(id => {
      const it = all.find(x => x.id === id);
      if (!it) return null;
      const pMin = it.priceMin || it.price || 0;
      const pMax = it.priceMax || it.price || 0;
      totalMin += pMin; totalMax += pMax;
      const dispP = it.priceMin ? it.priceMin + '–' + it.priceMax : it.price;
      return { id, name: it.name, dispP, pMin, pMax };
    }).filter(Boolean);

    const totalStr = totalMin === totalMax ? totalMin.toLocaleString() : totalMin.toLocaleString() + '–' + totalMax.toLocaleString();
    const canAfford = curBal >= totalMin;
    const isEmpty   = !cartDetails.length;

    const itemsHtml = isEmpty
      ? '<div style="font-size:11px;letter-spacing:2px;color:#4a3a20;padding:6px 0">// EMPTY</div>'
      : cartDetails.map(it => `
          <div class="shop-cart-item">
            <span class="shop-cart-item-name">${it.name}</span>
            <span style="display:flex;align-items:center;gap:8px;">
              <span class="shop-cart-item-price">${it.dispP} $</span>
              ${isMe ? `<button class="shop-cart-remove" onclick="shopRemoveFromCart('${it.id}')">✕</button>` : ''}
            </span>
          </div>`).join('');

    const checkoutDisabled = isEmpty || !canAfford ? 'disabled' : '';
    const checkoutTitle    = !canAfford ? 'INSUFFICIENT CREDITS' : isEmpty ? 'CART EMPTY' : '';
    // GM can checkout anyone; player can only checkout themselves
    const showCheckout = isMe || window.isGM;

    return `
      <div class="shop-cart-section">
        <div class="shop-cart-header">
          <span class="shop-cart-player">${name}${isMe ? ' (YOU)' : ''}</span>
          <span class="shop-cart-balance">${curBal.toLocaleString()} $</span>
        </div>
        <div class="shop-cart-items">${itemsHtml}</div>
        ${!isEmpty ? `
        <div class="shop-cart-footer">
          <span class="shop-cart-total">TOTAL: ${totalStr} $</span>
          ${showCheckout ? `<button class="shop-cart-checkout" onclick="shopCheckout('${name}')"
            ${checkoutDisabled} title="${checkoutTitle}">⚡ CHECKOUT</button>` : ''}
        </div>` : ''}
      </div>`;
  }).join('');
}

// ── CHECKOUT ──────────────────────────────────────────────────
window.shopCheckout = function(playerName) {
  if (!_shopState) return;
  if (!window.isGM && playerName !== window.myName) return; // players can only checkout themselves

  const cart   = Object.keys((_shopState.carts && _shopState.carts[playerName]) || {})
                   .filter(k => _shopState.carts[playerName][k]);
  if (!cart.length) { shopShowToast('CART IS EMPTY'); return; }

  const all    = _allItems();
  const myInv  = ((_shopState.inventories && _shopState.inventories[playerName]) || {});
  let curBal   = (_shopState.balances && _shopState.balances[playerName] !== undefined)
                 ? _shopState.balances[playerName] : 1200;

  const purchased = [];
  for (const id of cart) {
    if (myInv[id]) continue; // already owned
    const item  = all.find(x => x.id === id);
    if (!item) continue;
    const price = item.priceMin
      ? Math.floor(Math.random() * (item.priceMax - item.priceMin + 1)) + item.priceMin
      : (item.price || 0);
    if (curBal < price) {
      shopShowToast(playerName + ': INSUFFICIENT CREDITS FOR ' + item.name);
      return;
    }
    curBal -= price;
    purchased.push({ id, price });
  }

  if (!purchased.length) { shopShowToast('NOTHING TO BUY'); return; }

  // Write all at once
  set(ref(window.db, 'session/shop/balances/' + playerName), curBal);
  for (const p of purchased) {
    set(ref(window.db, 'session/shop/inventories/' + playerName + '/' + p.id), true);
    set(ref(window.db, 'session/shop/carts/' + playerName + '/' + p.id), null);
  }

  const total = purchased.reduce((s, p) => s + p.price, 0);
  shopFlash();
  shopShowToast((playerName === window.myName ? '' : playerName + ': ') + purchased.length + ' ITEMS // -' + total + ' $');
};

// ── INVENTORY tab ─────────────────────────────────────────────
function shopRenderInventory(grid) {
  const myInv    = (_shopState && _shopState.inventories && _shopState.inventories[window.myName]) || {};
  const ownedIds = Object.keys(myInv).filter(k => myInv[k]);
  const all      = _allItems();
  grid.style.display = 'block';
  if (!ownedIds.length) {
    grid.innerHTML = '<div class="shop-inv-empty">// INVENTORY EMPTY</div>';
    return;
  }
  grid.innerHTML = '<div class="shop-inv-list">' +
    ownedIds.map(id => {
      const it   = all.find(x => x.id === id);
      const icon = it ? (_SHOP_ICONS[it.icon] || '') : '';
      return `<div class="shop-inv-item">
        <div style="display:flex;align-items:center;gap:14px;">
          <div class="shop-item-icon" style="width:40px;height:40px;">${icon}</div>
          <div class="shop-inv-name">${it ? it.name : id}</div>
        </div>
        <div style="font-size:11px;letter-spacing:2px;color:#7fb27a;">✓ ACQUIRED</div>
      </div>`;
    }).join('') +
  '</div>';
}

window.closeShop = function() {
  _shopDismissed = true;
  document.getElementById('shopOverlay').classList.remove('open');
};

// ── GM controls ────────────────────────────────────────────────
window.shopGMOpen = function() {
  if (!window.isGM) return;
  const names    = window._activePlayerNames || [];
  const balances = {};
  for (const name of names) { if (name) balances[name] = 1200; }
  if (window.myName && balances[window.myName] === undefined) balances[window.myName] = 1200;
  if (!Object.keys(balances).length) balances[window.myName || 'GM'] = 1200;
  set(shopRef(), { open:true, ts:Date.now(), balances, inventories:{}, carts:{} });
  shopShowToast('TRADE TERMINAL OPEN');
};

window.shopGMClose = function() {
  if (!window.isGM) return;
  remove(shopRef());
  document.getElementById('shopOverlay').classList.remove('open');
  document.getElementById('shopBalanceEditor').style.display = 'none';
};

window.shopGMRefreshPlayers = function() {
  if (!window.isGM || !_shopState) return;
  const names   = window._activePlayerNames || [];
  const curBals = { ...(_shopState.balances || {}) };
  let added = 0;
  for (const name of names) {
    if (name && curBals[name] === undefined) { curBals[name] = 1200; added++; }
  }
  if (added > 0) { set(ref(window.db, 'session/shop/balances'), curBals); shopShowToast(added + ' PLAYER(S) ADDED'); }
  else shopShowToast('ALL PLAYERS ALREADY IN SHOP');
};

window.shopGMSetBalances = function() {
  if (!window.isGM || !_shopState) { shopShowToast('SHOP NOT OPEN'); return; }
  const panel  = document.getElementById('shopBalanceEditor');
  const inputs = document.getElementById('shopBalInputs');
  if (!panel || !inputs) return;
  if (panel.style.display === 'block') { panel.style.display = 'none'; return; }
  const current = _shopState.balances || {};
  const names   = Object.keys(current);
  if (!names.length) { shopShowToast('NO PLAYERS — USE ADD PLAYERS FIRST'); return; }
  inputs.innerHTML = names.map(n => `
    <div class="shop-bal-item">
      <span class="shop-bal-label">${n}</span>
      <input id="shopBal_${n}" type="number" value="${current[n] !== undefined ? current[n] : 1200}"
             min="0" max="99999" class="shop-bal-input"/>
      <span style="font-size:13px;color:#8a6d3b;margin-left:4px;">$</span>
    </div>`).join('');
  panel.style.display = 'block';
};

window.shopGMApplyBalances = function() {
  if (!window.isGM || !_shopState) return;
  const newBal = { ...(_shopState.balances || {}) };
  for (const name of Object.keys(newBal)) {
    const inp = document.getElementById('shopBal_' + name);
    if (inp && inp.value.trim() !== '' && !isNaN(parseInt(inp.value))) {
      newBal[name] = parseInt(inp.value);
    }
  }
  set(ref(window.db, 'session/shop/balances'), newBal);
  document.getElementById('shopBalanceEditor').style.display = 'none';
  shopShowToast('BALANCES UPDATED');
};

window.shopGMResetInventories = function() {
  if (!window.isGM || !_shopState) return;
  set(ref(window.db, 'session/shop/inventories'), {});
  set(ref(window.db, 'session/shop/carts'), {});
  shopShowToast('INVENTORIES + CARTS CLEARED');
};

function shopFlash() {
  const c = document.getElementById('shopMainContent');
  if (c) { c.classList.add('shop-flash'); setTimeout(() => c.classList.remove('shop-flash'), 400); }
}

function shopShowToast(msg) {
  const t = document.createElement('div');
  t.style.cssText = 'position:fixed;top:90px;left:50%;transform:translateX(-50%);background:rgba(11,14,12,0.95);border:1px solid rgba(255,154,60,0.4);color:var(--amber-hi);font-family:var(--ui);font-weight:600;font-size:13px;letter-spacing:0.5px;padding:12px 24px;z-index:12000;text-align:center;pointer-events:none;border-radius:10px;backdrop-filter:blur(8px);box-shadow:0 12px 40px rgba(0,0,0,0.5)';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

