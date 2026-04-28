// ============================================================
// AUDIO TRANSMISSION — GM-controlled, all-clients-synced background audio
// Two engines: YouTube IFrame API + HTML5 <audio> (for MP3 streams, e.g.
// Dropbox-hosted). Firebase state's `kind` field decides which engine plays.
// GM picks a track + play/pause/stop; every client hears the same thing.
// Each client controls its own volume locally (localStorage-persisted).
// Sync via Firebase node session/audio/.
// ============================================================

import { ref, set, onValue, get, remove, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const audioRef  = ref(window.db, 'session/audio');
const offsetRef = ref(window.db, '.info/serverTimeOffset');

let ytPlayer       = null;     // YT.Player instance (set on API ready)
let ytReady        = false;    // YT player is ready for commands
let pendingState   = null;     // state arrived before player was ready
let lastAppliedCmd = 0;        // dedupe Firebase echoes from our own writes
let driftTimer     = null;
let myVolume       = 50;
let preMuteVolume  = 50;
let widgetOpen     = false;
let serverOffset   = 0;        // ms; server clock - local clock (per Firebase)

// Second engine: HTML5 <audio> for MP3 streaming (e.g. Dropbox-hosted tracks).
// Created lazily on first MP3 playback. activeKind tracks which engine the
// current Firebase state is using so we don't try to seek the wrong one.
let audioEl    = null;
let activeKind = null;         // 'youtube' | 'mp3' | null

function _ensureAudioEl() {
  if (audioEl) return audioEl;
  audioEl = new Audio();
  audioEl.preload = 'auto';
  audioEl.volume  = myVolume / 100;
  // GM-only loop: when an MP3 ends and loop is on, write a fresh play-from-0
  // state so every client restarts in lockstep (same approach as YT loop).
  audioEl.addEventListener('ended', () => {
    if (!window.isGM || !loopEnabled) return;
    get(audioRef).then(snap => {
      const d = snap.val();
      if (!d || d.kind !== 'mp3' || !d.src) return;
      set(audioRef, {
        kind:       'mp3',
        src:        d.src,
        label:      d.label || '',
        isPlaying:  true,
        position:   0,
        serverTime: serverTimestamp(),
        cmd:        Date.now()
      });
    });
  });
  audioEl.addEventListener('error', () => {
    const errLab = document.getElementById('audErr');
    if (errLab && window.isGM) {
      errLab.textContent = 'MP3 LOAD FAILED — CHECK URL OR DROPBOX BANDWIDTH LIMIT';
      setTimeout(() => { errLab.textContent = ''; }, 4000);
    }
  });
  return audioEl;
}

// Server-anchored "now" — same reference on every client, immune to local
// clock skew between Windows machines (which routinely differs by 1–2s).
function serverNow() { return Date.now() + serverOffset; }

// Tracks Firebase's clock offset live. .info/serverTimeOffset doesn't need
// auth — it's a built-in metadata path.
onValue(offsetRef, snap => {
  const v = snap.val();
  if (typeof v === 'number') serverOffset = v;
});

// How far apart local playback can drift before we re-seek. Tighter = more
// in-sync but more frequent micro-seeks if the network jitters.
const DRIFT_THRESHOLD_S = 0.4;

// ── Restore per-client volume ────────────────────────────────────────
try {
  const v = parseInt(localStorage.getItem('alien-map-yt-volume') || '50', 10);
  if (!isNaN(v)) myVolume = Math.max(0, Math.min(100, v));
} catch(e) {}

// ── GM-only: loop toggle (persists locally between sessions) ─────────
let loopEnabled = false;
try { loopEnabled = localStorage.getItem('alien-map-yt-loop') === '1'; } catch(e) {}

// ── GM quick-launch presets ──────────────────────────────────────────
// Each preset is either { kind:'mp3', src:'<URL>' } or { kind:'youtube', id:'<11-char>' }.
// For Dropbox: take a per-file share link and replace "&dl=0" with "&raw=1".
const PRESETS = [
  { kind: 'mp3', src: 'https://www.dropbox.com/scl/fi/yl84vqsufyanlkbqshg0m/Welcome-to-Sevastopol.mp3?rlkey=68ot9rrhf92qc4l2kzhjqdf2y&st=9jtrjd8d&raw=1', label: '🛰 STATION I',  title: 'Welcome to Sevastopol' },
  { kind: 'mp3', src: 'https://www.dropbox.com/scl/fi/cz3kf0u56jd8zlueka4r8/Solomons-Galleria.mp3?rlkey=su1onth50h46kz16phbu34u7y&st=4kag4352&raw=1',     label: '🛰 STATION II', title: "Solomon's Galleria" },
  { kind: 'mp3', src: 'https://www.dropbox.com/scl/fi/t29te8pjf8az56mb7m3jt/Quarantine.mp3?rlkey=brfnrj9dkntndhonyymiyp6rt&st=26pu7j5j&raw=1',          label: '🚨 ACTION',     title: 'Quarantine' }
];

// ── Inject all DOM (panel, widget, hidden player host, GM button) ────
// Module scripts run after DOM parsing, so document.body is ready.
(function injectDOM() {
  // Hidden YouTube IFrame host
  const ytHost = document.createElement('div');
  ytHost.id = 'ytPlayer';
  ytHost.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;pointer-events:none;';
  document.body.appendChild(ytHost);

  // GM panel
  const panel = document.createElement('div');
  panel.id = 'audioPanel';
  const presetHTML = PRESETS.map((p, i) =>
    `<button class="aud-preset-btn" title="${p.title}" onclick="audioPlayPreset(${i})">${p.label}</button>`
  ).join('');
  panel.innerHTML = `
    <div class="aud-box">
      <button class="aud-close" onclick="closeAudioPanel()">✕ CLOSE</button>
      <div class="aud-box-title">// AUDIO TRANSMISSION CONTROL</div>
      <div class="aud-state" id="audState">— NO TRACK —</div>
      <div class="aud-section-label">// QUICK LAUNCH</div>
      <div class="aud-presets">${presetHTML}</div>
      <div class="aud-section-label">// CUSTOM TRACK</div>
      <input id="audUrl" type="text" placeholder="https://youtu.be/... or 11-char ID"
        onkeydown="if(event.key==='Enter') audioLoadAndPlay()" autocomplete="off" spellcheck="false"/>
      <div class="aud-err" id="audErr"></div>
      <div class="aud-actions">
        <button class="aud-btn play" onclick="audioLoadAndPlay()">▶ LOAD &amp; PLAY</button>
        <button class="aud-btn" onclick="audioPause()">⏸ PAUSE</button>
        <button class="aud-btn" onclick="audioResume()">▶ RESUME</button>
        <button class="aud-btn stop" onclick="audioStop()">⏹ STOP</button>
      </div>
      <button class="aud-loop-btn" id="audLoopBtn" onclick="audioToggleLoop()">
        🔁 LOOP — <span id="audLoopState">OFF</span>
      </button>
    </div>`;
  document.body.appendChild(panel);

  // Per-client volume widget
  const widget = document.createElement('div');
  widget.id = 'audioWidget';
  widget.innerHTML = `
    <div class="aw-popup" id="awPopup">
      <div class="aw-track" id="awTrack">— NO TRANSMISSION —</div>
      <div class="aw-vol-row">
        <span class="aw-vol-icon" id="awMuteIcon" onclick="audioToggleMute()">🔊</span>
        <input class="aw-vol-slider" id="volSlider" type="range" min="0" max="100" value="50"
          oninput="audioSetVolume(this.value)">
      </div>
    </div>
    <button class="aw-toggle" onclick="audioToggleWidget()">
      <span id="awToggleIcon">🔊</span><span id="awVolLabel">50</span>%
    </button>`;
  document.body.appendChild(widget);

  // GM sidebar button — slot in after the Transmission button
  const gmAnchor = document.querySelector('#gmSection .gm-ho-btn');
  if (gmAnchor) {
    const gmBtn = document.createElement('button');
    gmBtn.className = 'gm-aud-btn gm-dd-btn';
    gmBtn.textContent = 'Audio Transmission';
    gmBtn.onclick = () => window.openAudioPanel();
    gmAnchor.insertAdjacentElement('afterend', gmBtn);
  }
})();

// ── YouTube IFrame API loader ────────────────────────────────────────
(function loadYTAPI() {
  if (window.YT && window.YT.Player) return;
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  tag.async = true;
  document.head.appendChild(tag);
})();

window.onYouTubeIframeAPIReady = function() {
  ytPlayer = new YT.Player('ytPlayer', {
    height: '0',
    width:  '0',
    playerVars: { playsinline: 1, controls: 0, disablekb: 1, modestbranding: 1 },
    events: {
      onReady: () => {
        ytReady = true;
        try { ytPlayer.setVolume(myVolume); } catch(e) {}
        if (pendingState) { applyState(pendingState); pendingState = null; }
      },
      onError: (e) => {
        const errLabel = document.getElementById('audErr');
        if (errLabel && window.isGM) {
          errLabel.textContent = 'PLAYBACK ERROR (' + e.data + ') — VIDEO MAY BE EMBED-RESTRICTED';
          setTimeout(() => { errLabel.textContent = ''; }, 4000);
        }
      },
      onStateChange: (e) => {
        // YT auto-mutes on autoplay when policy is uncertain. Force unmute +
        // re-apply volume each time playback actually starts.
        if (e.data === 1 /* PLAYING */ && ytReady) {
          try {
            if (ytPlayer.isMuted && ytPlayer.isMuted()) ytPlayer.unMute();
            ytPlayer.setVolume(myVolume);
          } catch(err) {}
          // Refresh widget track label now that title metadata is available
          get(audioRef).then(snap => _updateWidgetTrack(snap.val()));
        }
        // ENDED + GM + loop ON → write a fresh "play from 0" state to Firebase.
        // Only the GM does this so all clients restart in lockstep instead of
        // each running their own loop with accumulating drift. Only fires for
        // YouTube tracks; the MP3 engine has its own 'ended' listener.
        if (e.data === 0 /* ENDED */ && window.isGM && loopEnabled && activeKind === 'youtube') {
          get(audioRef).then(snap => {
            const d = snap.val();
            if (!d || !d.videoId) return;
            set(audioRef, {
              ...d,
              isPlaying:  true,
              position:   0,
              serverTime: serverTimestamp(),
              cmd:        Date.now()
            });
          });
        }
      }
    }
  });
};

// ── Parse YouTube URL or 11-char ID ──────────────────────────────────
function parseVideoId(input) {
  if (!input) return null;
  input = String(input).trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(input)) return input;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
    /[?&]v=([A-Za-z0-9_-]{11})/
  ];
  for (const p of patterns) {
    const m = input.match(p);
    if (m) return m[1];
  }
  return null;
}

// ── GM PANEL ─────────────────────────────────────────────────────────
window.openAudioPanel = function() {
  if (!window.isGM) return;
  document.getElementById('audioPanel').classList.add('open');
  _refreshLoopBtn();
  get(audioRef).then(snap => {
    const d = snap.val();
    const urlIn = document.getElementById('audUrl');
    if (d && urlIn && !urlIn.value) {
      if (d.kind === 'mp3') urlIn.value = '[ ' + (d.label || 'mp3') + ' ]';
      else if (d.videoId)   urlIn.value = 'https://youtu.be/' + d.videoId;
    }
    _gmStateLabel(d || null);
  });
};

window.audioToggleLoop = function() {
  if (!window.isGM) return;
  loopEnabled = !loopEnabled;
  try { localStorage.setItem('alien-map-yt-loop', loopEnabled ? '1' : '0'); } catch(e) {}
  _refreshLoopBtn();
};

function _refreshLoopBtn() {
  const btn   = document.getElementById('audLoopBtn');
  const state = document.getElementById('audLoopState');
  if (btn)   btn.classList.toggle('active', loopEnabled);
  if (state) state.textContent = loopEnabled ? 'ON' : 'OFF';
}

window.closeAudioPanel = function() {
  document.getElementById('audioPanel').classList.remove('open');
};

function _gmStateLabel(d) {
  const lab = document.getElementById('audState');
  if (!lab) return;
  if (!d) { lab.textContent = '— NO TRACK —'; return; }
  let title;
  if (d.kind === 'mp3') {
    title = d.label || (d.src ? (d.src.split('/').pop() || '').split('?')[0] : 'mp3');
  } else {
    title = d.videoId || '—';
  }
  lab.textContent = (d.isPlaying ? '▶ PLAYING' : '⏸ PAUSED') + ' — ' + title;
}

function _writePlayState(payload) {
  set(audioRef, {
    ...payload,
    isPlaying:  true,
    position:   0,
    serverTime: serverTimestamp(),  // Firebase resolves to authoritative server time
    cmd:        Date.now()          // local-only echo dedupe key
  });
}

window.audioLoadAndPlay = function() {
  if (!window.isGM) return;
  const url    = document.getElementById('audUrl').value.trim();
  const errLab = document.getElementById('audErr');
  if (!url) return;
  errLab.textContent = '';

  // Try YouTube first; otherwise treat as a generic streaming URL (MP3/etc).
  const ytId = parseVideoId(url);
  if (ytId) {
    _writePlayState({ kind: 'youtube', videoId: ytId });
  } else if (/^https?:\/\//i.test(url)) {
    const filename = (url.split('/').pop() || 'audio').split('?')[0];
    _writePlayState({ kind: 'mp3', src: url, label: filename });
  } else {
    errLab.textContent = 'INVALID URL OR ID';
    setTimeout(() => { errLab.textContent = ''; }, 2200);
  }
};

window.audioPlayPreset = function(index) {
  if (!window.isGM) return;
  const p = PRESETS[index];
  if (!p) return;
  const urlIn  = document.getElementById('audUrl');
  const errLab = document.getElementById('audErr');
  if (errLab) errLab.textContent = '';

  if (p.kind === 'mp3') {
    if (urlIn) urlIn.value = '[ ' + p.title + ' ]';
    _writePlayState({ kind: 'mp3', src: p.src, label: p.title });
  } else {
    if (urlIn) urlIn.value = 'https://youtu.be/' + p.id;
    _writePlayState({ kind: 'youtube', videoId: p.id });
  }
};

// Read the active engine's current playback time (used by Pause).
function _currentPos() {
  if (activeKind === 'youtube' && ytReady) {
    return (ytPlayer.getCurrentTime && ytPlayer.getCurrentTime()) || 0;
  }
  if (activeKind === 'mp3' && audioEl) {
    return audioEl.currentTime || 0;
  }
  return 0;
}

window.audioPause = function() {
  if (!window.isGM) return;
  const pos = _currentPos();
  get(audioRef).then(snap => {
    const d = snap.val();
    if (!d) return;
    set(audioRef, {
      ...d,
      isPlaying:  false,
      position:   pos,
      serverTime: serverTimestamp(),
      cmd:        Date.now()
    });
  });
};

window.audioResume = function() {
  if (!window.isGM) return;
  get(audioRef).then(snap => {
    const d = snap.val();
    if (!d) return;
    set(audioRef, {
      ...d,
      isPlaying:  true,
      position:   d.position || 0,
      serverTime: serverTimestamp(),
      cmd:        Date.now()
    });
  });
};

window.audioStop = function() {
  if (!window.isGM) return;
  remove(audioRef);
};

// ── Apply incoming Firebase state to the local player ────────────────
function applyState(d) {
  // Cleared — stop both engines
  if (!d) {
    _stopAllEngines();
    stopDriftTimer();
    _updateWidgetTrack(null);
    activeKind = null;
    return;
  }

  // Compute server-anchored target position (sentinel-safe).
  const sTime = (typeof d.serverTime === 'number') ? d.serverTime : serverNow();
  const targetPos = d.isPlaying
    ? (d.position || 0) + (serverNow() - sTime) / 1000
    : (d.position || 0);

  if (d.kind === 'mp3' && d.src) {
    _applyMp3State(d, targetPos);
  } else if (d.videoId) {
    // 'youtube' kind, or legacy state without explicit kind
    _applyYoutubeState(d, targetPos);
  } else {
    _stopAllEngines();
    stopDriftTimer();
  }
  _updateWidgetTrack(d);
}

function _stopAllEngines() {
  if (ytReady && ytPlayer.stopVideo) {
    try { ytPlayer.stopVideo(); } catch(e) {}
  }
  if (audioEl) {
    try { audioEl.pause(); audioEl.removeAttribute('src'); audioEl.load(); } catch(e) {}
  }
}

function _applyMp3State(d, targetPos) {
  // Switching from YouTube → silence the YT iframe before MP3 plays.
  if (activeKind === 'youtube' && ytReady) {
    try { ytPlayer.stopVideo(); } catch(e) {}
  }
  activeKind = 'mp3';
  const a = _ensureAudioEl();

  // Load source if it changed (preserves currentTime if same)
  if (a.src !== d.src) {
    a.src = d.src;
    try { a.load(); } catch(e) {}
  }

  // Seek to target position if drifted
  const safePos = Math.max(0, targetPos);
  if (Math.abs((a.currentTime || 0) - safePos) > DRIFT_THRESHOLD_S) {
    try { a.currentTime = safePos; } catch(e) {}
  }

  // Re-apply volume each time (in case browser auto-muted on autoplay)
  a.volume = myVolume / 100;
  a.muted  = myVolume === 0;

  if (d.isPlaying) {
    const p = a.play();
    if (p && p.catch) p.catch(() => {
      const errLab = document.getElementById('audErr');
      if (errLab && window.isGM) {
        errLab.textContent = 'AUTOPLAY BLOCKED — TAP THE PRESET AGAIN';
        setTimeout(() => { errLab.textContent = ''; }, 3000);
      }
    });
    startDriftTimer();
  } else {
    a.pause();
    stopDriftTimer();
  }
}

function _applyYoutubeState(d, targetPos) {
  // Switching from MP3 → silence the audio element first.
  if (activeKind === 'mp3' && audioEl) {
    try { audioEl.pause(); } catch(e) {}
  }
  if (!ytReady) { pendingState = d; return; }
  activeKind = 'youtube';

  const vd         = ytPlayer.getVideoData && ytPlayer.getVideoData();
  const currentVid = (vd && vd.video_id) || null;

  if (currentVid !== d.videoId) {
    if (d.isPlaying) {
      try {
        ytPlayer.loadVideoById({ videoId: d.videoId, startSeconds: Math.max(0, targetPos) });
        if (ytPlayer.isMuted && ytPlayer.isMuted()) ytPlayer.unMute();
        ytPlayer.setVolume(myVolume);
      } catch(e) {}
    } else {
      try { ytPlayer.cueVideoById({ videoId: d.videoId, startSeconds: Math.max(0, targetPos) }); } catch(e) {}
    }
    if (d.isPlaying) startDriftTimer(); else stopDriftTimer();
    return;
  }

  // Same video — sync play/pause + drift
  if (d.isPlaying) {
    const cur = (ytPlayer.getCurrentTime && ytPlayer.getCurrentTime()) || 0;
    if (Math.abs(cur - targetPos) > DRIFT_THRESHOLD_S) {
      try { ytPlayer.seekTo(targetPos, true); } catch(e) {}
    }
    if (ytPlayer.getPlayerState && ytPlayer.getPlayerState() !== 1) {
      try {
        ytPlayer.playVideo();
        if (ytPlayer.isMuted && ytPlayer.isMuted()) ytPlayer.unMute();
        ytPlayer.setVolume(myVolume);
      } catch(e) {}
    }
    startDriftTimer();
  } else {
    try { ytPlayer.pauseVideo(); } catch(e) {}
    stopDriftTimer();
  }
}

function startDriftTimer() {
  if (driftTimer) return;
  driftTimer = setInterval(() => {
    get(audioRef).then(snap => {
      const d = snap.val();
      if (!d || !d.isPlaying) return;
      const sTime = (typeof d.serverTime === 'number') ? d.serverTime : serverNow();
      const tPos  = (d.position || 0) + (serverNow() - sTime) / 1000;
      let cur = 0;
      if (activeKind === 'youtube' && ytReady) {
        cur = (ytPlayer.getCurrentTime && ytPlayer.getCurrentTime()) || 0;
      } else if (activeKind === 'mp3' && audioEl) {
        cur = audioEl.currentTime || 0;
      } else { return; }
      if (Math.abs(cur - tPos) > DRIFT_THRESHOLD_S) {
        if (activeKind === 'youtube' && ytReady) {
          try { ytPlayer.seekTo(tPos, true); } catch(e) {}
        } else if (activeKind === 'mp3' && audioEl) {
          try { audioEl.currentTime = Math.max(0, tPos); } catch(e) {}
        }
      }
    });
  }, 8000);
}
function stopDriftTimer() {
  if (driftTimer) { clearInterval(driftTimer); driftTimer = null; }
}

// ── Firebase watcher — started after login from auth.js ──────────────
window.startAudioWatcher = function() {
  // Show the volume widget for everyone (GM and players)
  const w = document.getElementById('audioWidget');
  if (w) w.style.display = 'flex';
  // Initialize widget from saved volume
  const slider = document.getElementById('volSlider');
  if (slider) slider.value = myVolume;
  const vlab = document.getElementById('awVolLabel');
  if (vlab) vlab.textContent = myVolume;
  _updateMuteIcon();

  onValue(audioRef, snap => {
    const d = snap.val();
    if (d && d.cmd && d.cmd === lastAppliedCmd) return;
    if (d && d.cmd) lastAppliedCmd = d.cmd;
    applyState(d);
    _gmStateLabel(d || null);
  });
};

// ── Volume slider (per-client, persisted to localStorage) ────────────
window.audioSetVolume = function(v) {
  myVolume = Math.max(0, Math.min(100, parseInt(v, 10) || 0));
  if (ytReady) {
    try {
      // If the YT player auto-muted itself (autoplay policy), undo it whenever
      // the user moves the slider above 0.
      if (myVolume > 0 && ytPlayer.isMuted && ytPlayer.isMuted()) ytPlayer.unMute();
      ytPlayer.setVolume(myVolume);
    } catch(e) {}
  }
  if (audioEl) {
    audioEl.volume = myVolume / 100;
    audioEl.muted  = myVolume === 0;
  }
  try { localStorage.setItem('alien-map-yt-volume', String(myVolume)); } catch(e) {}
  const lab = document.getElementById('awVolLabel');
  if (lab) lab.textContent = myVolume;
  const slider = document.getElementById('volSlider');
  if (slider && parseInt(slider.value,10) !== myVolume) slider.value = myVolume;
  _updateMuteIcon();
};

window.audioToggleMute = function() {
  if (myVolume > 0) {
    preMuteVolume = myVolume;
    window.audioSetVolume(0);
  } else {
    window.audioSetVolume(preMuteVolume || 50);
  }
};

function _updateMuteIcon() {
  const ic = document.getElementById('awMuteIcon');
  if (ic) ic.textContent = myVolume === 0 ? '🔇' : (myVolume < 40 ? '🔉' : '🔊');
  const tg = document.getElementById('awToggleIcon');
  if (tg) tg.textContent = myVolume === 0 ? '🔇' : '🔊';
}

window.audioToggleWidget = function() {
  widgetOpen = !widgetOpen;
  const pop = document.getElementById('awPopup');
  if (pop) pop.classList.toggle('open', widgetOpen);
};

function _updateWidgetTrack(d) {
  const trackLab = document.getElementById('awTrack');
  if (!trackLab) return;
  if (!d || (!d.videoId && !d.src)) {
    trackLab.textContent = '— NO TRANSMISSION —';
    return;
  }
  let title = '';
  if (d.kind === 'mp3') {
    title = d.label || (d.src ? (d.src.split('/').pop() || '').split('?')[0] : '');
  } else {
    // YouTube — pull live title from the API if available
    try {
      const vd = ytPlayer && ytPlayer.getVideoData && ytPlayer.getVideoData();
      if (vd && vd.title) title = vd.title;
    } catch(e) {}
    if (!title) title = d.videoId || '';
  }
  trackLab.textContent = (d.isPlaying ? '▶ ' : '⏸ ') + title;
}
