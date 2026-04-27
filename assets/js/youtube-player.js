// ============================================================
// YOUTUBE PLAYER — GM-controlled, all-clients-synced background audio
// GM picks a track + play/pause/stop; all players hear the same thing.
// Each client controls its own volume locally (localStorage-persisted).
// Sync via Firebase node session/audio/.
// ============================================================

import { ref, set, onValue, get, remove } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const audioRef = ref(window.db, 'session/audio');

let ytPlayer       = null;     // YT.Player instance (set on API ready)
let ytReady        = false;    // YT player is ready for commands
let pendingState   = null;     // state arrived before player was ready
let lastAppliedCmd = 0;        // dedupe Firebase echoes from our own writes
let driftTimer     = null;
let myVolume       = 50;
let preMuteVolume  = 50;
let widgetOpen     = false;

// ── Restore per-client volume ────────────────────────────────────────
try {
  const v = parseInt(localStorage.getItem('alien-map-yt-volume') || '50', 10);
  if (!isNaN(v)) myVolume = Math.max(0, Math.min(100, v));
} catch(e) {}

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
  panel.innerHTML = `
    <div class="aud-box">
      <button class="aud-close" onclick="closeAudioPanel()">✕ CLOSE</button>
      <div class="aud-box-title">// AUDIO TRANSMISSION CONTROL</div>
      <div class="aud-state" id="audState">— NO TRACK —</div>
      <input id="audUrl" type="text" placeholder="https://youtu.be/... or 11-char ID"
        onkeydown="if(event.key==='Enter') audioLoadAndPlay()" autocomplete="off" spellcheck="false"/>
      <div class="aud-err" id="audErr"></div>
      <div class="aud-actions">
        <button class="aud-btn play" onclick="audioLoadAndPlay()">▶ LOAD &amp; PLAY</button>
        <button class="aud-btn" onclick="audioPause()">⏸ PAUSE</button>
        <button class="aud-btn" onclick="audioResume()">▶ RESUME</button>
        <button class="aud-btn stop" onclick="audioStop()">⏹ STOP</button>
      </div>
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
    gmBtn.className = 'gm-aud-btn';
    gmBtn.textContent = '🎵 Audio Transmission';
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
  get(audioRef).then(snap => {
    const d = snap.val();
    const urlIn = document.getElementById('audUrl');
    if (d && d.videoId) {
      if (!urlIn.value) urlIn.value = 'https://youtu.be/' + d.videoId;
      _gmStateLabel(d);
    } else {
      _gmStateLabel(null);
    }
  });
};

window.closeAudioPanel = function() {
  document.getElementById('audioPanel').classList.remove('open');
};

function _gmStateLabel(d) {
  const lab = document.getElementById('audState');
  if (!lab) return;
  if (!d) { lab.textContent = '— NO TRACK —'; return; }
  lab.textContent = (d.isPlaying ? '▶ PLAYING' : '⏸ PAUSED') + ' — ' + d.videoId;
}

window.audioLoadAndPlay = function() {
  if (!window.isGM) return;
  const url     = document.getElementById('audUrl').value;
  const videoId = parseVideoId(url);
  const errLab  = document.getElementById('audErr');
  if (!videoId) {
    errLab.textContent = 'INVALID URL OR ID';
    setTimeout(() => { errLab.textContent = ''; }, 2200);
    return;
  }
  errLab.textContent = '';
  set(audioRef, {
    videoId,
    isPlaying:  true,
    position:   0,
    serverTime: Date.now(),
    cmd:        Date.now()
  });
};

window.audioPause = function() {
  if (!window.isGM || !ytReady) return;
  const pos = (ytPlayer.getCurrentTime && ytPlayer.getCurrentTime()) || 0;
  get(audioRef).then(snap => {
    const d = snap.val() || {};
    if (!d.videoId) return;
    set(audioRef, {
      videoId:    d.videoId,
      isPlaying:  false,
      position:   pos,
      serverTime: Date.now(),
      cmd:        Date.now()
    });
  });
};

window.audioResume = function() {
  if (!window.isGM) return;
  get(audioRef).then(snap => {
    const d = snap.val() || {};
    if (!d.videoId) return;
    set(audioRef, {
      videoId:    d.videoId,
      isPlaying:  true,
      position:   d.position || 0,
      serverTime: Date.now(),
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
  // Cleared — stop everything
  if (!d || !d.videoId) {
    if (ytReady && ytPlayer.stopVideo) {
      try { ytPlayer.stopVideo(); } catch(e) {}
    }
    stopDriftTimer();
    _updateWidgetTrack(null);
    return;
  }
  if (!ytReady) { pendingState = d; return; }

  const vd          = ytPlayer.getVideoData && ytPlayer.getVideoData();
  const currentVid  = (vd && vd.video_id) || null;
  const targetPos   = d.isPlaying
    ? (d.position || 0) + (Date.now() - (d.serverTime || Date.now())) / 1000
    : (d.position || 0);

  if (currentVid !== d.videoId) {
    if (d.isPlaying) {
      try { ytPlayer.loadVideoById({ videoId: d.videoId, startSeconds: Math.max(0, targetPos) }); } catch(e) {}
    } else {
      try { ytPlayer.cueVideoById({ videoId: d.videoId, startSeconds: Math.max(0, targetPos) }); } catch(e) {}
    }
    if (d.isPlaying) startDriftTimer(); else stopDriftTimer();
    _updateWidgetTrack(d);
    return;
  }

  // Same video — sync play/pause + drift
  if (d.isPlaying) {
    const cur = (ytPlayer.getCurrentTime && ytPlayer.getCurrentTime()) || 0;
    if (Math.abs(cur - targetPos) > 1.5) {
      try { ytPlayer.seekTo(targetPos, true); } catch(e) {}
    }
    if (ytPlayer.getPlayerState && ytPlayer.getPlayerState() !== 1) {
      try { ytPlayer.playVideo(); } catch(e) {}
    }
    startDriftTimer();
  } else {
    try { ytPlayer.pauseVideo(); } catch(e) {}
    stopDriftTimer();
  }
  _updateWidgetTrack(d);
}

function startDriftTimer() {
  if (driftTimer) return;
  driftTimer = setInterval(() => {
    if (!ytReady) return;
    get(audioRef).then(snap => {
      const d = snap.val();
      if (!d || !d.isPlaying) return;
      const tPos = (d.position || 0) + (Date.now() - (d.serverTime || Date.now())) / 1000;
      const cur  = (ytPlayer.getCurrentTime && ytPlayer.getCurrentTime()) || 0;
      if (Math.abs(cur - tPos) > 1.5) {
        try { ytPlayer.seekTo(tPos, true); } catch(e) {}
      }
    });
  }, 12000);
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
  if (ytReady) { try { ytPlayer.setVolume(myVolume); } catch(e) {} }
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
  if (!d || !d.videoId) {
    trackLab.textContent = '— NO TRANSMISSION —';
    return;
  }
  // Try to read the actual video title from the YT API once it's loaded
  let title = '';
  try {
    const vd = ytPlayer && ytPlayer.getVideoData && ytPlayer.getVideoData();
    if (vd && vd.title) title = vd.title;
  } catch(e) {}
  trackLab.textContent = (d.isPlaying ? '▶ ' : '⏸ ') + (title || d.videoId);
}
