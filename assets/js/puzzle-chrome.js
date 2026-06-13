// ══ PUZZLE CHROME ════════════════════════════════════════════════════════════
// Shared W-Y terminal shell for the embedded puzzles: role parsing, boot
// sequence, clock, console log, header fill, GM-panel toggle and the
// iframe↔parent postMessage helpers. Puzzle-specific logic lives in its own
// engine file and talks to the parent through PGC.send / PGC.onApply.
//
//   postMessage (keyed by CONFIG.prefix):
//     iframe → parent : {type: P+'-ready'}            — request current state
//                       (engine-specific set/guess/reset messages)
//     parent → iframe : {type: P+'-apply', state}     — apply shared state
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  'use strict';
  const params = new URLSearchParams(location.search);
  const ROLE = params.get('role') || 'standalone';
  const MY_NAME = params.get('name') || '';
  const IS_GM = ROLE === 'gm';
  const IS_EMBEDDED = ROLE === 'gm' || ROLE === 'player';
  document.body.classList.add('role-' + ROLE);

  function nowTs() {
    const d = new Date();
    return String(d.getHours()).padStart(2, '0') + ':' +
           String(d.getMinutes()).padStart(2, '0') + ':' +
           String(d.getSeconds()).padStart(2, '0');
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const PGC = {
    role: ROLE, myName: MY_NAME, isGM: IS_GM, isEmbedded: IS_EMBEDDED,
    prefix: null,
    esc, nowTs,
    _log: [],
    _applyCb: null,
    view: 'boot',

    send(msg) { if (!IS_EMBEDDED) return; try { parent.postMessage(msg, '*'); } catch (e) {} },
    onApply(cb) { this._applyCb = cb; },

    setText(id, t) { const el = document.getElementById(id); if (el) el.textContent = t; },

    log(type, who, msg) {
      this._log.push({ type, who, msg, ts: nowTs() });
      if (this._log.length > 60) this._log.shift();
      this.renderConsole();
    },
    renderConsole() {
      const con = document.getElementById('pg-console');
      if (!con) return;
      con.innerHTML = this._log.map(l =>
        '<div class="line ' + l.type + '"><span class="ts">[' + l.ts + ']</span>' +
        '<span class="who">' + esc(l.who) + '</span><span class="msg">' + l.msg + '</span></div>'
      ).join('');
      con.scrollTop = con.scrollHeight;
    },

    showView(v) {
      this.view = v;
      const boot = document.getElementById('pg-boot');
      const main = document.getElementById('pg-main');
      const succ = document.getElementById('pg-success');
      if (boot) boot.style.display = v === 'boot' ? '' : 'none';
      if (main) main.style.display = v === 'main' ? 'block' : 'none';
      if (succ) succ.classList.toggle('show', v === 'success');
    },
    showSuccess() { this.showView('success'); },

    fillHeader(cfg) {
      this.setText('pg-op', IS_GM ? 'GAME MASTER'
        : (ROLE === 'player' ? (MY_NAME ? MY_NAME.toUpperCase() : 'OPERATIVE') : 'STANDALONE'));
      const ascii = document.getElementById('pg-ascii');
      if (ascii && cfg.ascii) ascii.textContent = cfg.ascii;
      this.setText('pg-node', cfg.node || '');
    },
    startClock(cfg) {
      const el = document.getElementById('pg-clock');
      if (!el) return;
      const tick = () => { el.textContent = (cfg.stardate || '2184.290') + ' / ' + nowTs(); };
      tick(); setInterval(tick, 1000);
    },
    runBoot(cfg, onDone) {
      const host = document.getElementById('pg-boot');
      if (!host) { onDone(); return; }
      host.innerHTML = (cfg.bootLines || []).map(l =>
        '<div class="boot-line ' + (l.cls || '') + '">&gt; ' + l.text + '</div>'
      ).join('') + '<div class="boot-line blink">&gt; LOADING INTERFACE</div>';
      const lines = host.querySelectorAll('.boot-line');
      let t = 200;
      lines.forEach((ln, i) => {
        const d = (cfg.bootLines && cfg.bootLines[i]) ? (cfg.bootLines[i].delay || (t += 280)) : (t += 320);
        setTimeout(() => ln.classList.add('show'), d);
      });
      setTimeout(() => { if (this.view === 'boot') onDone(); }, (cfg.bootDuration || 3600));
    },

    toggleGmPanel() { const p = document.getElementById('pg-gm-panel'); if (p) p.classList.toggle('show'); },

    // engine entry point: fills chrome, runs boot, wires apply + GM keys
    init(cfg, onReady) {
      this.prefix = cfg.prefix;
      this.fillHeader(cfg);
      this.startClock(cfg);
      window.addEventListener('message', e => {
        const m = e.data;
        if (!m || typeof m !== 'object') return;
        if (m.type === cfg.prefix + '-apply' && this._applyCb) this._applyCb(m.state || {});
      });
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape') { try { parent.postMessage({ type: 'puzzle-esc' }, '*'); } catch (x) {} }
        if (!IS_GM) return;
        if (e.key === 'g' || e.key === 'G') this.toggleGmPanel();
        if (e.key === 'r' || e.key === 'R') { if (window.pgReset) window.pgReset(); }
      });
      this.runBoot(cfg, () => {
        this.showView('main');
        if (cfg.introLog) this.log('system', 'SYS', esc(cfg.introLog));
        if (onReady) onReady();
      });
      if (IS_EMBEDDED) this.send({ type: cfg.prefix + '-ready' });
    }
  };

  window.PGC = PGC;
})();
