import { ref, set } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ════════════════════════════════════════════════════════════════
// SKILL ROLL — shared Alien-RPG dice-pool roll
// Used by the Dice Table and by Würfel Dürfel's skill actions, so the
// pool math + stress gain + table publish live in exactly one place.
// Firebase path published to: session/diceTable/roll
// ════════════════════════════════════════════════════════════════

// stress response that debuffs each attribute by −2 (mirrors character sheet)
export const SR_DEBUFF = { str:'Frantic', agi:'Shakes', wit:'Tunnel_Vision', emp:'Aggravated' };

// skill key → governing attribute (mirrors the character sheet / dice table)
export const SR_SKILL_ATTR = {
  closeCombat:'str', heavyMachinery:'str', stamina:'str',
  mobility:'agi',    piloting:'agi',       rangedCombat:'agi',
  comtech:'wit',     observation:'wit',    survival:'wit',
  command:'emp',     manipulation:'emp',   medicalAid:'emp',
};

// attribute value with stress-response debuff applied (−2, min 0)
export function srAttrVal(c, a) {
  const base = parseInt(c?.attr?.[a]) || 0;
  return c?.stressResp?.[SR_DEBUFF[a]] ? Math.max(0, base - 2) : base;
}

// pool components for a skill (by key) or a bare attribute
export function srPool(c, { attr, skill }) {
  const a = skill ? SR_SKILL_ATTR[skill] : attr;
  const base = srAttrVal(c, a) + (skill ? (parseInt(c?.skill?.[skill]) || 0) : 0);
  const stress = parseInt(c?.stressLevel) || 0;
  return { attrKey: a, base, stress, total: base + stress };
}

// scatter dice on the table — identical recipe to dtScatter so the
// published roll renders the same on the shared surface
function srScatter(n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    let best = null;
    for (let t = 0; t < 60; t++) {
      const p = { x: 10 + Math.random() * 76, y: 12 + Math.random() * 70 };
      const dMin = Math.min(Infinity, ...pts.map(q => Math.hypot(p.x - q.x, (p.y - q.y) * 1.4)));
      if (dMin > 16) { best = p; break; }
      if (!best || dMin > best.d) best = { ...p, d: dMin };
    }
    pts.push({ x: best.x, y: best.y });
  }
  return pts;
}

// Roll a pool, apply stress gain, optionally publish to the dice table.
// Returns { roll, successes, gain, stressNow, base, stress } — successes
// is available synchronously to the caller even though the on-table
// animation plays out asynchronously for every client.
export async function srRoll(db, { player, char, attr, skill, label, skin = 'default', publish = true, applyStress = true, includeStress = true }) {
  const { base: baseN, stress: stressRaw } = srPool(char, { attr, skill });
  const stressN = includeStress ? stressRaw : 0;
  const positions = srScatter(baseN + stressN);
  const mk = (n, off) => Array.from({ length: n }, (_, i) => ({
    v: 1 + Math.floor(Math.random() * 6),
    x: positions[off + i].x,
    y: positions[off + i].y,
    r: Math.floor(Math.random() * 360),
  }));

  const baseDice   = mk(baseN, 0);
  const stressDice = mk(stressN, baseN);

  // each facehugger (1 on a stress die) adds +1 stress on the sheet
  const gain = stressDice.filter(d => d.v === 1).length;
  const stressNow = Math.min(10, stressN + gain);
  if (applyStress && gain > 0 && player) {
    set(ref(db, 'characters/' + player + '/stressLevel'), stressNow);
  }

  const successes = baseDice.concat(stressDice).filter(d => d.v === 6).length;

  const roll = {
    id: Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    player, skill: label, skin,
    base: baseDice, stress: stressDice,
    stressGain: gain, stressNow,
    ts: Date.now(),
  };

  if (publish) {
    await set(ref(db, 'session/diceTable/roll'), roll);
  }

  return { roll, successes, gain, stressNow, base: baseN, stress: stressN };
}
