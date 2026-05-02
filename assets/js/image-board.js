import { ref, set, remove, push, onValue, onChildAdded } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ── IMAGE BOARD ────────────────────────────────────────────────────────────
var ibListeners    = [];
var ibDrawing      = false;
var ibCurrentStroke = null;
var ibErasing      = false;
var ibLocalStrokes = new Set();
var ibIsOpen       = false;   // tracks whether overlay is currently visible
var ibLastOpenTs   = 0;       // timestamp of last GM-triggered open
var ibRevealMode     = false;
var ibFogMode        = false;
var ibActiveFogTool  = null;   // 'fogBrush' | 'revealBrush' | 'fogRect' | 'revealRect'
var ibFogPanelOpen   = false;
var ibRectStart      = null;
var ibLastPos        = null;
var ibCoverDataUrl   = null;
var ibLocalCoverStrokes  = new Set();  // keys of strokes pushed by this client
var ibAllCoverStrokes    = [];         // ordered fog+reveal stroke list for full replay
var ibStaged             = false;
var ibFogPreviewMode     = false;
var ibStressUnsub        = null;

function ibGetOverlay()      { return document.getElementById('imageBoardOverlay'); }
function ibGetCanvas()       { return document.getElementById('ibCanvas'); }
function ibGetCoverCanvas()  { return document.getElementById('ibCoverCanvas'); }
function ibGetImage()        { return document.getElementById('ibImage'); }
function ibGetCtx()          { return ibGetCanvas().getContext('2d'); }
function ibGetCoverCtx()     { return ibGetCoverCanvas().getContext('2d'); }
function ibGetWrap()         { return document.getElementById('ibCanvasWrap'); }
function ibGetPH()           { return document.getElementById('ibPlaceholder'); }

function ibResizeCanvas() {
  var wrap = ibGetWrap();
  var c = ibGetCanvas();
  c.width  = wrap.clientWidth;
  c.height = wrap.clientHeight;
  var cc = ibGetCoverCanvas();
  cc.width  = wrap.clientWidth;
  cc.height = wrap.clientHeight;
  if (window.mtResize) window.mtResize();
  ibRedrawFogLayer();
}

function ibDrawCoverImage(callback) {
  var cc = ibGetCoverCanvas();
  var ctx = ibGetCoverCtx();
  ctx.clearRect(0, 0, cc.width, cc.height);
  if (!ibCoverDataUrl) { if (callback) callback(); return; }
  var r = ibImageRect();
  if (!r) { if (callback) callback(); return; }
  var img = new Image();
  img.onload = function() { ctx.drawImage(img, r.x, r.y, r.w, r.h); if (callback) callback(); };
  img.src = ibCoverDataUrl;
}

// ── Low-level draw helpers (accept any 2D context) ─────────────────────────

function _ibFogToCtx(ctx, cw, ch, stroke) {
  if (!stroke) return;
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  if (stroke.fill) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cw, ch);
  } else if (stroke.rect) {
    var r = ibImageRect();
    if (r) { ctx.fillStyle = '#000'; ctx.fillRect(r.x + stroke.x*r.w, r.y + stroke.y*r.h, stroke.w*r.w, stroke.h*r.h); }
  } else if (stroke.points && stroke.points.length > 0) {
    ctx.strokeStyle = '#000';
    ctx.lineWidth = stroke.size || 40; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    var f = ibToPix(stroke.points[0].nx, stroke.points[0].ny);
    ctx.moveTo(f.px, f.py);
    for (var i = 1; i < stroke.points.length; i++) { var p = ibToPix(stroke.points[i].nx, stroke.points[i].ny); ctx.lineTo(p.px, p.py); }
    if (stroke.points.length === 1) ctx.lineTo(f.px + 0.1, f.py);
    ctx.stroke();
  }
  ctx.restore();
}

function _ibRevealToCtx(ctx, stroke) {
  if (!stroke) return;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  if (stroke.rect) {
    var r = ibImageRect();
    if (r) { ctx.fillStyle = 'rgba(0,0,0,1)'; ctx.fillRect(r.x + stroke.x*r.w, r.y + stroke.y*r.h, stroke.w*r.w, stroke.h*r.h); }
  } else if (stroke.points && stroke.points.length > 0) {
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.lineWidth = stroke.size || 40; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    var f = ibToPix(stroke.points[0].nx, stroke.points[0].ny);
    ctx.moveTo(f.px, f.py);
    for (var i = 1; i < stroke.points.length; i++) { var p = ibToPix(stroke.points[i].nx, stroke.points[i].ny); ctx.lineTo(p.px, p.py); }
    if (stroke.points.length === 1) ctx.lineTo(f.px + 0.1, f.py);
    ctx.stroke();
  }
  ctx.restore();
}

// Live-drawing wrappers (used during pointer events — draw straight to cover canvas)
function ibDrawFogStroke(stroke)    { var cc = ibGetCoverCanvas(); _ibFogToCtx(ibGetCoverCtx(), cc.width, cc.height, stroke); }
function ibDrawRevealStroke(stroke) { _ibRevealToCtx(ibGetCoverCtx(), stroke); }

// Full redraw using offscreen canvas as double-buffer — no visible transparent frame
function ibRedrawFogLayer(callback) {
  var cc  = ibGetCoverCanvas();
  var off = document.createElement('canvas');
  off.width  = cc.width;
  off.height = cc.height;
  var octx = off.getContext('2d');

  function compose() {
    ibAllCoverStrokes.forEach(function(s) {
      if (s.fog || s.fill) {
        if (ibFogPreviewMode) octx.globalAlpha = 0.35;
        _ibFogToCtx(octx, off.width, off.height, s);
        octx.globalAlpha = 1;
      } else {
        _ibRevealToCtx(octx, s);
      }
    });
    // Atomic swap: the visible canvas is only updated once, fully composed
    var ctx = ibGetCoverCtx();
    ctx.clearRect(0, 0, cc.width, cc.height);
    ctx.drawImage(off, 0, 0);
    if (callback) callback();
  }

  if (ibCoverDataUrl) {
    var r = ibImageRect();
    if (r) {
      var img = new Image();
      img.onload = function() { octx.drawImage(img, r.x, r.y, r.w, r.h); compose(); };
      img.src = ibCoverDataUrl;
      return;
    }
  }
  compose();
}

function ibImageRect() {
  var img = ibGetImage();
  var wrap = ibGetWrap();
  if (!img.naturalWidth) return null;
  var wrapW = wrap.clientWidth, wrapH = wrap.clientHeight;
  var ia = img.naturalWidth / img.naturalHeight, wa = wrapW / wrapH;
  var rw, rh;
  if (ia > wa) { rw = wrapW; rh = wrapW / ia; }
  else { rh = wrapH; rw = wrapH * ia; }
  return { x:(wrapW-rw)/2, y:(wrapH-rh)/2, w:rw, h:rh };
}

function ibToNorm(px, py) {
  var r = ibImageRect();
  if (!r) return { nx: px / ibGetCanvas().width, ny: py / ibGetCanvas().height };
  return { nx: (px-r.x)/r.w, ny: (py-r.y)/r.h };
}

function ibToPix(nx, ny) {
  var r = ibImageRect();
  if (!r) return { px: nx * ibGetCanvas().width, py: ny * ibGetCanvas().height };
  return { px: r.x + nx*r.w, py: r.y + ny*r.h };
}

// Exposed for motion-tracker.js (cone needs the same image-rect math)
window.ibToNorm    = ibToNorm;
window.ibToPix     = ibToPix;
window.ibImageRect = ibImageRect;

function ibDrawStroke(stroke) {
  if (!stroke || !stroke.points || stroke.points.length < 1) return;
  var ctx = ibGetCtx();
  ctx.save();
  ctx.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over';
  ctx.strokeStyle = stroke.erase ? 'rgba(0,0,0,1)' : (stroke.color || '#ff4444');
  ctx.lineWidth = stroke.size || 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  var first = ibToPix(stroke.points[0].nx, stroke.points[0].ny);
  ctx.moveTo(first.px, first.py);
  for (var i = 1; i < stroke.points.length; i++) {
    var p = ibToPix(stroke.points[i].nx, stroke.points[i].ny);
    ctx.lineTo(p.px, p.py);
  }
  if (stroke.points.length === 1) ctx.lineTo(first.px + 0.1, first.py);
  ctx.stroke();
  ctx.restore();
}

function ibStopListeners() {
  ibListeners.forEach(function(u) { try { u(); } catch(e) {} });
  ibListeners = [];
}

function ibUpdateStagedUI() {
  var stagingOverlay = document.getElementById('ibStagingOverlay');
  var stagingBanner  = document.getElementById('ibStagingBanner');
  var releaseBtn     = document.getElementById('ibReleaseBtn');
  var stagingBtn     = document.getElementById('ibStagingBtn');
  if (window.isGM) {
    if (stagingOverlay) stagingOverlay.style.display = 'none';
    if (stagingBanner)  stagingBanner.style.display  = ibStaged ? 'flex' : 'none';
    if (releaseBtn)     releaseBtn.style.display      = ibStaged ? ''     : 'none';
    if (stagingBtn) {
      stagingBtn.textContent = ibStaged ? '✅ FREIGEBEN' : '🔒 Verbergen';
      stagingBtn.classList.toggle('active', ibStaged);
    }
  } else {
    if (stagingOverlay) stagingOverlay.style.display = ibStaged ? 'flex' : 'none';
    if (stagingBanner)  stagingBanner.style.display  = 'none';
  }
  if (ibIsOpen) ibResizeCanvas();
}

window.ibToggleStaging = function() {
  if (!window.isGM) return;
  if (ibStaged) {
    ibRelease();
  } else {
    set(ref(window.db, 'session/imageBoard/staged'), true);
    ibStaged = true;
    ibUpdateStagedUI();
  }
};

function ibStartListeners() {
  ibStopListeners();
  ibLocalStrokes.clear();
  ibLocalCoverStrokes.clear();
  ibAllCoverStrokes = [];

  // Image data
  ibListeners.push(onValue(ref(window.db, 'session/imageBoard/imageData'), function(snap) {
    if (!ibIsOpen) return;
    var data = snap.val();
    var img = ibGetImage();
    var ph  = ibGetPH();
    if (data) {
      img.src = data;
      img.style.display = 'block';
      ph.style.display  = 'none';
      var c = ibGetCanvas();
      ibGetCtx().clearRect(0, 0, c.width, c.height);
      ibLocalStrokes.clear();
    } else {
      img.src = '';
      img.style.display = 'none';
      ph.style.display  = 'block';
      ibGetCtx().clearRect(0, 0, ibGetCanvas().width, ibGetCanvas().height);
      ibLocalStrokes.clear();
    }
  }));

  // Strokes added
  ibListeners.push(onChildAdded(window.ibStrokesRef, function(snap) {
    if (!ibIsOpen) return;
    if (ibLocalStrokes.has(snap.key)) return;
    ibDrawStroke(snap.val());
  }));

  // Strokes cleared by GM
  ibListeners.push(onValue(window.ibStrokesRef, function(snap) {
    if (!ibIsOpen) return;
    if (!snap.exists()) {
      ibGetCtx().clearRect(0, 0, ibGetCanvas().width, ibGetCanvas().height);
      ibLocalStrokes.clear();
    }
  }));

  // Cover image loaded by GM
  ibListeners.push(onValue(window.ibCoverDataRef, function(snap) {
    if (!ibIsOpen) return;
    var data = snap.val();
    ibCoverDataUrl = data || null;
    ibAllCoverStrokes = [];
    ibLocalCoverStrokes.clear();
    ibRedrawFogLayer();
  }));

  // Fog cover strokes (single ordered list of fog+reveal, preserves chronological order)
  ibListeners.push(onChildAdded(window.ibFogCoverRef, function(snap) {
    if (!ibIsOpen) return;
    if (ibLocalCoverStrokes.has(snap.key)) return;
    ibAllCoverStrokes.push(snap.val());
    ibRedrawFogLayer();
  }));

  // Fog cover cleared
  ibListeners.push(onValue(window.ibFogCoverRef, function(snap) {
    if (!ibIsOpen) return;
    if (!snap.exists()) {
      ibAllCoverStrokes = [];
      ibLocalCoverStrokes.clear();
      ibRedrawFogLayer();
    }
  }));

  // Staged flag
  ibListeners.push(onValue(ref(window.db, 'session/imageBoard/staged'), function(snap) {
    if (!ibIsOpen) return;
    ibStaged = !!snap.val();
    ibUpdateStagedUI();
  }));
}

function ibSetupDrawing() {
  var c = ibGetCanvas();
  c.onmousedown  = ibPointerDown;
  c.onmousemove  = ibPointerMove;
  c.onmouseup    = ibPointerUp;
  c.onmouseleave = ibPointerUp;
  c.ontouchstart = function(e) { e.preventDefault(); ibPointerDown(e); };
  c.ontouchmove  = function(e) { e.preventDefault(); ibPointerMove(e); };
  c.ontouchend   = function(e) { e.preventDefault(); ibPointerUp(e); };
}

function ibDoOpen() {
  if (ibIsOpen) return;
  ibIsOpen = true;
  var ov = ibGetOverlay();
  ov.style.display = 'flex';
  document.querySelectorAll('.ib-gm-only').forEach(function(el) {
    el.style.display = window.isGM ? '' : 'none';
  });
  document.getElementById('ibColorPicker').value = window.colorFromName(window.myName);
  ibResizeCanvas();
  ibSetupDrawing();
  ibStartListeners();
  ibStartStressWatch();
  if (window.mtStart) window.mtStart();
}

// ── GM-only stress overview (mirrors characters/{name}/stressLevel) ─────────
function ibStartStressWatch() {
  if (!window.isGM) return;
  if (ibStressUnsub) return;
  var panel = document.getElementById('ibStressPanel');
  if (panel) panel.innerHTML = '<div class="ib-stress-title">▣ CREW STRESS</div>' +
                               '<div class="ib-stress-empty">— LINKING —</div>';
  ibStressUnsub = onValue(ref(window.db, 'characters'), function(snap) {
    ibRenderStress(snap.val() || {});
  });
}

function ibStopStressWatch() {
  if (ibStressUnsub) { try { ibStressUnsub(); } catch(e) {} ibStressUnsub = null; }
  var panel = document.getElementById('ibStressPanel');
  if (panel) panel.innerHTML = '';
}

function ibStressEsc(s) {
  return String(s).replace(/[&<>"']/g, function(c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}

function ibRenderStress(data) {
  var panel = document.getElementById('ibStressPanel');
  if (!panel) return;
  var names = Object.keys(data || {})
    .filter(function(n) { return n && n !== window.myName; })
    .sort();

  var rows = names.map(function(name) {
    var lvl = parseInt(data[name] && data[name].stressLevel, 10) || 0;
    if (lvl < 0) lvl = 0; if (lvl > 10) lvl = 10;
    var pips = '';
    for (var i = 0; i < 10; i++) {
      var cls = '';
      if (i < lvl) {
        if      (lvl >= 9) cls = ' lvl-crit';
        else if (lvl >= 7) cls = ' lvl-high';
        else if (lvl >= 4) cls = ' lvl-med';
        else                cls = ' lvl-low';
      }
      pips += '<span class="ib-stress-pip' + cls + '"></span>';
    }
    return '<div class="ib-stress-row">' +
             '<span class="ib-stress-name">' + ibStressEsc(name) + '</span>' +
             '<span class="ib-stress-bar">' + pips + '</span>' +
             '<span class="ib-stress-num">' + lvl + '/10</span>' +
           '</div>';
  }).join('');

  panel.innerHTML = '<div class="ib-stress-title">▣ CREW STRESS</div>' +
                    (rows || '<div class="ib-stress-empty">— NO CREW DATA —</div>');
}

window.startGlobalIbWatcher = function() {
  onValue(ref(window.db, 'session/imageBoard/open'), function(snap) {
    var ts = snap.val();
    var active = !!(ts && typeof ts === 'number' && ts > 0);
    var btn = document.getElementById('imageBoardBtn');
    if (btn) btn.style.display = (active && !window.isGM) ? '' : 'none';
    if (active && ts > ibLastOpenTs) {
      ibLastOpenTs = ts;
      ibDoOpen();
    }
  });
};

// Player-side re-open: rejoin the active board without re-broadcasting.
window.reopenImageBoard = function() { ibDoOpen(); };

window.openImageBoard = function() {
  var ts = Date.now();
  ibLastOpenTs = ts;
  set(ref(window.db, 'session/imageBoard/open'), ts);
  ibDoOpen();
};

window.closeImageBoard = function() {
  ibIsOpen = false;
  document.getElementById('ibClearConfirm').classList.remove('open');
  var ov = ibGetOverlay();
  ov.style.display = 'none';
  ibStopListeners();
  ibStopStressWatch();
  if (window.mtStop) window.mtStop();
  ibDrawing = false;
  ibCurrentStroke = null;
  ibRevealMode = false;
  ibFogMode       = false;
  ibActiveFogTool = null;
  ibFogPanelOpen  = false;
  ibRectStart     = null;
  ibLastPos       = null;
  ibCoverDataUrl  = null;
  ibFogPreviewMode = false;
  var fogPanel = document.getElementById('ibFogPanel');
  if (fogPanel) fogPanel.style.display = 'none';
  var fogMenuBtn = document.getElementById('ibFogMenuBtn');
  if (fogMenuBtn) fogMenuBtn.classList.remove('active');
  ['ibFogBrushBtn','ibRevealBrushBtn','ibFogRectBtn','ibRevealRectBtn','ibFogPreviewBtn'].forEach(function(id) {
    document.getElementById(id)?.classList.remove('active');
  });
  ibAllCoverStrokes = [];
  ibLocalCoverStrokes.clear();
  ibStaged = false;
  var revBtn = document.getElementById('ibRevealBtn');
  if (revBtn) { revBtn.classList.remove('active'); revBtn.textContent = '👁 Aufdecken'; }
  var fogBtn = document.getElementById('ibFogBtn');
  if (fogBtn) { fogBtn.classList.remove('active'); }
  var stagingOverlay = document.getElementById('ibStagingOverlay');
  if (stagingOverlay) stagingOverlay.style.display = 'none';
  var stagingBanner = document.getElementById('ibStagingBanner');
  if (stagingBanner) stagingBanner.style.display = 'none';
  // GM closing resets the open flag so late-joining players don't auto-open
  if (window.isGM) set(ref(window.db, 'session/imageBoard/open'), 0);
};

window.clearImageBoard = function() {
  if (!window.isGM) return;
  document.getElementById('ibClearConfirm').classList.add('open');
};

window.ibClearConfirmed = function() {
  document.getElementById('ibClearConfirm').classList.remove('open');
  remove(window.ibStrokesRef);
  if (window.mtClearAll) window.mtClearAll();
};

window.ibClearCancel = function() {
  document.getElementById('ibClearConfirm').classList.remove('open');
};

window.handleImageSelect = function(input) {
  if (!window.isGM) return;
  var file = input.files[0];
  if (!file) return;
  input.value = '';
  var reader = new FileReader();
  reader.onload = function(e) {
    var srcImg = new Image();
    srcImg.onload = function() {
      var MAX = 1920;
      var w = srcImg.naturalWidth, h = srcImg.naturalHeight;
      if (w > MAX || h > MAX) {
        if (w >= h) { h = Math.round(h * MAX / w); w = MAX; }
        else { w = Math.round(w * MAX / h); h = MAX; }
      }
      var off = document.createElement('canvas');
      off.width = w; off.height = h;
      off.getContext('2d').drawImage(srcImg, 0, 0, w, h);
      var compressed = off.toDataURL('image/jpeg', 0.92);
      remove(window.ibStrokesRef);
      remove(window.ibFogCoverRef);
      ibAllCoverStrokes = []; ibLocalCoverStrokes.clear();
      set(ref(window.db, 'session/imageBoard/imageData'), compressed);
      set(ref(window.db, 'session/imageBoard/staged'), true);
      ibStaged = true;
      ibUpdateStagedUI();
      if (window.mtClearAll) window.mtClearAll();
    };
    srcImg.src = e.target.result;
  };
  reader.readAsDataURL(file);
};

window.ibToggleEraser = function() {
  ibActiveFogTool = null; ibFogMode = false; ibRevealMode = false;
  ['ibFogBrushBtn','ibRevealBrushBtn','ibFogRectBtn','ibRevealRectBtn'].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.classList.remove('active');
  });
  ibErasing = !ibErasing;
  var btn = document.getElementById('ibEraserBtn');
  btn.classList.toggle('active', ibErasing);
  btn.textContent = ibErasing ? '✏ Pen' : '⬜ Eraser';
  ibGetCanvas().style.cursor = ibErasing ? 'cell' : 'crosshair';
};

window.ibToggleFogPanel = function() {
  ibFogPanelOpen = !ibFogPanelOpen;
  var panel = document.getElementById('ibFogPanel');
  var btn   = document.getElementById('ibFogMenuBtn');
  if (panel) panel.style.display = ibFogPanelOpen ? 'flex' : 'none';
  if (btn)   btn.classList.toggle('active', ibFogPanelOpen);
};

window.ibSetFogTool = function(tool) {
  var newTool = (ibActiveFogTool === tool) ? null : tool;
  ibActiveFogTool = newTool;
  ibFogMode    = (newTool === 'fogBrush');
  ibRevealMode = (newTool === 'revealBrush');
  ibRectStart  = null;
  ['ibFogBrushBtn','ibRevealBrushBtn','ibFogRectBtn','ibRevealRectBtn'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.classList.toggle('active', el.id === newTool + 'Btn');
  });
  ibGetCanvas().style.cursor = 'crosshair';
};

window.ibClearAllFog = function() {
  if (!window.isGM) return;
  remove(window.ibFogCoverRef);
  ibAllCoverStrokes = []; ibLocalCoverStrokes.clear();
  ibRedrawFogLayer();
};

window.ibToggleFogPreview = function() {
  if (!window.isGM) return;
  ibFogPreviewMode = !ibFogPreviewMode;
  var btn = document.getElementById('ibFogPreviewBtn');
  if (btn) btn.classList.toggle('active', ibFogPreviewMode);
  ibRedrawFogLayer();
};

window.ibFillFog = function() {
  if (!window.isGM) return;
  var cc = ibGetCoverCanvas();
  var ctx = ibGetCoverCtx();
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, cc.width, cc.height);
  ctx.restore();
  var stroke = { fill: true, fog: true };
  ibAllCoverStrokes.push(stroke);
  var newRef = push(window.ibFogCoverRef, stroke);
  ibLocalCoverStrokes.add(newRef.key);
};

window.ibRelease = function() {
  if (!window.isGM) return;
  remove(ref(window.db, 'session/imageBoard/staged'));
  ibStaged = false;
  ibUpdateStagedUI();
};

window.handleCoverImageSelect = function(input) {
  if (!window.isGM) return;
  var file = input.files[0];
  if (!file) return;
  input.value = '';
  var reader = new FileReader();
  reader.onload = function(e) {
    var srcImg = new Image();
    srcImg.onload = function() {
      var MAX = 1920;
      var w = srcImg.naturalWidth, h = srcImg.naturalHeight;
      if (w > MAX || h > MAX) {
        if (w >= h) { h = Math.round(h * MAX / w); w = MAX; }
        else { w = Math.round(w * MAX / h); h = MAX; }
      }
      var off = document.createElement('canvas');
      off.width = w; off.height = h;
      off.getContext('2d').drawImage(srcImg, 0, 0, w, h);
      var compressed = off.toDataURL('image/jpeg', 0.92);
      remove(window.ibFogCoverRef).then(function() {
        set(window.ibCoverDataRef, compressed);
      });
    };
    srcImg.src = e.target.result;
  };
  reader.readAsDataURL(file);
};

function ibEventPos(e) {
  var c = ibGetCanvas();
  var rect = c.getBoundingClientRect();
  if (e.touches && e.touches.length) {
    return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
  }
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function ibPointerDown(e) {
  var img = ibGetImage();
  if (!img.src || img.style.display === 'none') return;
  // Motion tracker takes precedence: placing a tracker / dropping a blip
  // must not also start a pen stroke.
  if (window.mtHandleClick && window.mtHandleClick(e)) {
    if (e.preventDefault) e.preventDefault();
    return;
  }
  ibDrawing = true;
  var pos = ibEventPos(e);
  ibLastPos = pos;
  var size = parseInt(document.getElementById('ibSizeSlider').value, 10);
  if (ibActiveFogTool === 'fogRect' || ibActiveFogTool === 'revealRect') {
    ibRectStart   = pos;
    ibCurrentStroke = { rectMode: ibActiveFogTool, points: [] };
  } else if (ibRevealMode) {
    ibCurrentStroke = { size: size * 5, reveal: true, points: [ibToNorm(pos.x, pos.y)] };
    var cctx = ibGetCoverCtx();
    cctx.save();
    cctx.globalCompositeOperation = 'destination-out';
    cctx.strokeStyle = 'rgba(0,0,0,1)';
    cctx.lineWidth = ibCurrentStroke.size; cctx.lineCap = 'round'; cctx.lineJoin = 'round';
    cctx.beginPath(); cctx.moveTo(pos.x, pos.y);
    cctx.restore();
  } else if (ibFogMode) {
    ibCurrentStroke = { size: size * 5, fog: true, points: [ibToNorm(pos.x, pos.y)] };
    var fcctx = ibGetCoverCtx();
    fcctx.save();
    fcctx.globalCompositeOperation = 'source-over';
    fcctx.strokeStyle = '#000';
    fcctx.lineWidth = ibCurrentStroke.size; fcctx.lineCap = 'round'; fcctx.lineJoin = 'round';
    fcctx.beginPath(); fcctx.moveTo(pos.x, pos.y);
    fcctx.restore();
  } else {
    var color = document.getElementById('ibColorPicker').value;
    ibCurrentStroke = { color: color, size: size, erase: ibErasing, points: [ibToNorm(pos.x, pos.y)] };
    var ctx = ibGetCtx();
    ctx.save();
    ctx.globalCompositeOperation = ibErasing ? 'destination-out' : 'source-over';
    ctx.strokeStyle = ibErasing ? 'rgba(0,0,0,1)' : color;
    ctx.lineWidth = size; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(pos.x, pos.y);
    ctx.restore();
  }
}

function ibPointerMove(e) {
  if (!ibDrawing || !ibCurrentStroke) return;
  var pos = ibEventPos(e);
  ibLastPos = pos;
  if (ibCurrentStroke.rectMode) {
    var preview = document.getElementById('ibFogRectPreview');
    if (preview && ibRectStart) {
      var rx = Math.min(ibRectStart.x, pos.x), ry = Math.min(ibRectStart.y, pos.y);
      var rw = Math.abs(pos.x - ibRectStart.x), rh = Math.abs(pos.y - ibRectStart.y);
      preview.style.cssText = 'display:block;position:absolute;pointer-events:none;box-sizing:border-box;'
        + 'left:' + rx + 'px;top:' + ry + 'px;width:' + rw + 'px;height:' + rh + 'px;';
      preview.className = 'ib-fog-rect-preview ' + ibCurrentStroke.rectMode;
    }
    return;
  }
  var norm = ibToNorm(pos.x, pos.y);
  ibCurrentStroke.points.push(norm);
  var pts = ibCurrentStroke.points;
  var prev = ibToPix(pts[pts.length-2].nx, pts[pts.length-2].ny);
  if (ibCurrentStroke.reveal) {
    var cctx = ibGetCoverCtx();
    cctx.save();
    cctx.globalCompositeOperation = 'destination-out';
    cctx.strokeStyle = 'rgba(0,0,0,1)';
    cctx.lineWidth = ibCurrentStroke.size; cctx.lineCap = 'round'; cctx.lineJoin = 'round';
    cctx.beginPath(); cctx.moveTo(prev.px, prev.py); cctx.lineTo(pos.x, pos.y);
    cctx.stroke();
    cctx.restore();
  } else if (ibCurrentStroke.fog) {
    var fcctx = ibGetCoverCtx();
    fcctx.save();
    fcctx.globalCompositeOperation = 'source-over';
    fcctx.strokeStyle = '#000';
    fcctx.lineWidth = ibCurrentStroke.size; fcctx.lineCap = 'round'; fcctx.lineJoin = 'round';
    fcctx.beginPath(); fcctx.moveTo(prev.px, prev.py); fcctx.lineTo(pos.x, pos.y);
    fcctx.stroke();
    fcctx.restore();
  } else {
    var ctx = ibGetCtx();
    ctx.save();
    ctx.globalCompositeOperation = ibCurrentStroke.erase ? 'destination-out' : 'source-over';
    ctx.strokeStyle = ibCurrentStroke.erase ? 'rgba(0,0,0,1)' : ibCurrentStroke.color;
    ctx.lineWidth = ibCurrentStroke.size; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(prev.px, prev.py); ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    ctx.restore();
  }
}

function ibPointerUp() {
  if (!ibDrawing || !ibCurrentStroke) return;
  ibDrawing = false;
  var stroke = ibCurrentStroke;
  ibCurrentStroke = null;
  // Handle rectangle modes
  if (stroke.rectMode) {
    var preview = document.getElementById('ibFogRectPreview');
    if (preview) preview.style.display = 'none';
    if (!ibRectStart || !ibLastPos) { ibRectStart = null; return; }
    var x1 = Math.min(ibRectStart.x, ibLastPos.x), y1 = Math.min(ibRectStart.y, ibLastPos.y);
    var x2 = Math.max(ibRectStart.x, ibLastPos.x), y2 = Math.max(ibRectStart.y, ibLastPos.y);
    ibRectStart = null;
    if (x2 - x1 < 5 || y2 - y1 < 5) return;
    var n1 = ibToNorm(x1, y1), n2 = ibToNorm(x2, y2);
    var isFogRect = stroke.rectMode === 'fogRect';
    var rectStroke = { rect: true, x: n1.nx, y: n1.ny, w: n2.nx - n1.nx, h: n2.ny - n1.ny };
    if (isFogRect) { rectStroke.fog = true; ibDrawFogStroke(rectStroke); }
    else           { rectStroke.reveal = true; ibDrawRevealStroke(rectStroke); }
    ibAllCoverStrokes.push(rectStroke);
    var rRef = push(window.ibFogCoverRef, rectStroke);
    ibLocalCoverStrokes.add(rRef.key);
    return;
  }
  if (stroke.points.length === 0) return;
  if (stroke.fog || stroke.reveal) {
    ibAllCoverStrokes.push(stroke);
    var newCoverRef = push(window.ibFogCoverRef, stroke);
    ibLocalCoverStrokes.add(newCoverRef.key);
  } else {
    var newRef = push(window.ibStrokesRef, stroke);
    ibLocalStrokes.add(newRef.key);
    // Auto-detect inappropriate content after short delay (allow stroke to register locally)
    setTimeout(ibCheckForPenis, 150);
  }
}

function ibCheckForPenis() {
  if (!ibIsOpen || ibAllStrokes.length < 1) return;

  // Group spatially close strokes, then check each group independently
  // so we only delete the offending drawing and leave everything else intact.
  var groups = ibGroupStrokes(ibAllStrokes);
  var toDelete = [];
  var toastType = null;

  groups.forEach(function(group) {
    var result = ibAnalyzeDrawing(group);
    if (result.penis || result.swastika) {
      group.forEach(function(s) { toDelete.push(s.key); });
      if (!toastType) toastType = result.swastika ? 'swastika' : 'penis';
    }
  });

  if (toDelete.length > 0) {
    // Delete only the offending strokes from Firebase
    toDelete.forEach(function(key) {
      remove(ref(window.db, 'session/imageBoard/strokes/' + key));
    });
    // Remove from local cache
    ibAllStrokes = ibAllStrokes.filter(function(s) {
      return toDelete.indexOf(s.key) === -1;
    });
    ibShowNsfwToast(toastType);
  }
}

// Groups strokes by spatial proximity using union-find on overlapping bounding
// boxes (padded by 8 % of normalised canvas space).
function ibGroupStrokes(strokes) {
  var PAD = 0.08;
  var items = strokes.map(function(s) {
    if (!s.data || !s.data.points || s.data.points.length === 0) return null;
    var xs = s.data.points.map(function(p) { return p.nx; });
    var ys = s.data.points.map(function(p) { return p.ny; });
    return {
      s: s,
      x0: Math.min.apply(null,xs)-PAD, x1: Math.max.apply(null,xs)+PAD,
      y0: Math.min.apply(null,ys)-PAD, y1: Math.max.apply(null,ys)+PAD
    };
  }).filter(Boolean);

  var parent = items.map(function(_,i){ return i; });
  function find(i){ return parent[i]===i ? i : (parent[i]=find(parent[i])); }
  function unite(a,b){ parent[find(a)]=find(b); }

  for (var i=0; i<items.length; i++) {
    for (var j=i+1; j<items.length; j++) {
      var a=items[i], b=items[j];
      if (a.x0<=b.x1 && a.x1>=b.x0 && a.y0<=b.y1 && a.y1>=b.y0) unite(i,j);
    }
  }
  var map = {};
  items.forEach(function(item,i){
    var r = find(i);
    if (!map[r]) map[r] = [];
    map[r].push(item.s);
  });
  return Object.keys(map).map(function(k){ return map[k]; });
}

// Renders a stroke group into an S×S offscreen canvas, normalised to the
// group's own bounding box (with margin) so small drawings fill the grid.
// Aspect ratio is preserved; lineWidth is at least 5 px in grid space.
function ibRenderStrokesToGrid(S, strokes) {
  // Find tight bounding box in normalised coords
  var mnx=1, mxx=0, mny=1, mxy=0, any=false;
  strokes.forEach(function(s) {
    if (!s.data || !s.data.points) return;
    s.data.points.forEach(function(p) {
      if (!any) { mnx=mxx=p.nx; mny=mxy=p.ny; any=true; }
      if (p.nx<mnx) mnx=p.nx; if (p.nx>mxx) mxx=p.nx;
      if (p.ny<mny) mny=p.ny; if (p.ny>mxy) mxy=p.ny;
    });
  });
  if (!any) return document.createElement('canvas');

  var rX = mxx-mnx || 0.001, rY = mxy-mny || 0.001;
  var usable = S * 0.84;                          // 8% margin each side
  var scale  = Math.min(usable/rX, usable/rY);   // preserve aspect ratio
  var ox = (S - rX*scale)/2, oy = (S - rY*scale)/2;

  var off = document.createElement('canvas');
  off.width = off.height = S;
  var octx = off.getContext('2d');
  octx.clearRect(0, 0, S, S);
  octx.strokeStyle = '#ffffff';
  octx.lineCap = 'round';
  octx.lineJoin = 'round';

  strokes.forEach(function(s) {
    var data = s.data;
    if (!data || !data.points || data.erase || data.points.length < 1) return;
    var pts = data.points.map(function(p) {
      return { x: ox+(p.nx-mnx)*scale, y: oy+(p.ny-mny)*scale };
    });
    octx.lineWidth = Math.max(5, (data.size || 4) * scale * 0.006);
    octx.beginPath();
    octx.moveTo(pts[0].x, pts[0].y);
    for (var i=1; i<pts.length; i++) octx.lineTo(pts[i].x, pts[i].y);
    if (pts.length===1) octx.lineTo(pts[0].x+0.1, pts[0].y);
    octx.stroke();
  });
  return off;
}

// Main entry: builds the analysis grid for a stroke group, then runs both detectors.
function ibAnalyzeDrawing(strokes) {
  var S = 96;
  var off = ibRenderStrokesToGrid(S, strokes);
  var d = off.getContext('2d').getImageData(0, 0, S, S).data;

  // Binary grid + row/col span arrays
  var grid = [];
  var rowSpans = new Array(S).fill(0);
  var colSpans = new Array(S).fill(0);
  var totalPx = 0;
  for (var y = 0; y < S; y++) {
    grid[y] = new Uint8Array(S);
    var lx = -1, rx = -1;
    for (var x = 0; x < S; x++) {
      if (d[(y * S + x) * 4 + 3] > 20) {
        grid[y][x] = 1; totalPx++;
        if (lx < 0) lx = x; rx = x;
      }
    }
    rowSpans[y] = lx < 0 ? 0 : rx - lx + 1;
  }
  for (var x = 0; x < S; x++) {
    var ty = -1, by = -1;
    for (var y = 0; y < S; y++) {
      if (grid[y][x]) { if (ty < 0) ty = y; by = y; }
    }
    colSpans[x] = ty < 0 ? 0 : by - ty + 1;
  }

  if (totalPx < 30) return { penis: false, swastika: false };

  // Bounding box
  var r0=0, r1=S-1, c0=0, c1=S-1;
  while (r0 < S   && rowSpans[r0] === 0) r0++;
  while (r1 > r0  && rowSpans[r1] === 0) r1--;
  while (c0 < S   && colSpans[c0] === 0) c0++;
  while (c1 > c0  && colSpans[c1] === 0) c1--;
  var bH = r1 - r0, bW = c1 - c0;
  if (bH < 6 || bW < 6) return { penis: false, swastika: false };

  // ── Penis detection ──────────────────────────────────────────────
  var penis = false;
  // Analyse the longer axis; also try both if roughly square
  if (bH >= bW * 0.75) penis = penis || ibPenisProfile(rowSpans, r0, r1);
  if (bW >= bH * 0.75) penis = penis || ibPenisProfile(colSpans, c0, c1);

  // ── Swastika detection ───────────────────────────────────────────
  var swastika = false;
  var ar = Math.max(bH, bW) / (Math.min(bH, bW) + 1);
  if (ar < 1.9) { // roughly square overall shape
    swastika = ibSwastikaCheck(grid, S, r0, r1, c0, c1, totalPx);
  }

  return { penis: penis, swastika: swastika };
}

// ── Penis: span-profile with neck-constriction check ────────────────────────
function ibPenisProfile(spans, start, end) {
  var len = end - start + 1;
  if (len < 10) return false;
  var seg = spans.slice(start, end + 1);
  var maxS = Math.max.apply(null, seg);
  if (maxS < 3) return false;
  // 3-point moving-average smoothing, then normalise
  var norm = seg.map(function(v, i, a) {
    return (v + (a[i-1] || v) + (a[i+1] || v)) / (3 * maxS);
  });
  // Check head-at-top and head-at-bottom
  return ibHeadShaft(norm) || ibHeadShaft(norm.slice().reverse());
}

function ibHeadShaft(norm) {
  var n = norm.length;
  var h1 = Math.max(1,  Math.floor(n * 0.22)); // end of head zone
  var h2 = Math.max(h1+1, Math.floor(n * 0.42)); // end of neck zone
  var h3 = Math.max(h2+1, Math.floor(n * 0.85)); // end of shaft zone
  var headAvg = 0, neckAvg = 0, shaftAvg = 0;
  for (var i = 0; i < h1; i++)       headAvg  += norm[i];
  for (var i = h1; i < h2; i++)      neckAvg  += norm[i];
  for (var i = h2; i < h3; i++)      shaftAvg += norm[i];
  headAvg  /= h1;
  neckAvg  /= (h2 - h1);
  shaftAvg /= (h3 - h2);
  // Head wide, neck clearly constricts, shaft has content but narrower than head
  return headAvg  > 0.38 &&
         neckAvg  < headAvg  * 0.82 &&
         shaftAvg > 0.15 &&
         shaftAvg < headAvg  * 0.97;
}

// ── Swastika: cross structure + rotational quadrant offset ───────────────────
function ibSwastikaCheck(grid, S, r0, r1, c0, c1, totalPx) {
  var cy = Math.round((r0 + r1) / 2);
  var cx = Math.round((c0 + c1) / 2);
  var band = Math.max(2, Math.floor(Math.min(r1-r0, c1-c0) * 0.17));

  // What fraction of pixels fall in the horizontal and vertical center bands?
  var hBand = 0, vBand = 0;
  for (var y = r0; y <= r1; y++) for (var x = c0; x <= c1; x++) {
    if (!grid[y][x]) continue;
    if (Math.abs(y - cy) <= band) hBand++;
    if (Math.abs(x - cx) <= band) vBand++;
  }
  // Both bands must carry a significant fraction of all pixels (cross structure)
  if (hBand / (totalPx + 1) < 0.18 || vBand / (totalPx + 1) < 0.18) return false;

  // Compute center-of-mass per quadrant, ignoring the central cross bands
  var qN  = [0, 0, 0, 0];
  var qSx = [0, 0, 0, 0];
  var qSy = [0, 0, 0, 0];
  for (var y = r0; y <= r1; y++) for (var x = c0; x <= c1; x++) {
    if (!grid[y][x]) continue;
    if (Math.abs(y - cy) <= band || Math.abs(x - cx) <= band) continue;
    var qi = (y < cy ? 0 : 2) + (x < cx ? 0 : 1); // 0=TL 1=TR 2=BL 3=BR
    qN[qi]++; qSx[qi] += x; qSy[qi] += y;
  }

  // Each quadrant must have at least 4 % of total pixels
  var minQ = totalPx * 0.04;
  for (var i = 0; i < 4; i++) if (qN[i] < minQ) return false;

  // Midpoints of each quadrant rectangle
  var qMx = [(c0+cx)/2, (cx+c1)/2, (c0+cx)/2, (cx+c1)/2];
  var qMy = [(r0+cy)/2, (r0+cy)/2, (cy+r1)/2, (cy+r1)/2];

  // Offset of quadrant CoM relative to quadrant midpoint
  var odx = [0,1,2,3].map(function(i){ return qSx[i]/qN[i] - qMx[i]; });
  var ody = [0,1,2,3].map(function(i){ return qSy[i]/qN[i] - qMy[i]; });

  // Clockwise swastika hooks: TL→up, TR→right, BR→down, BL→left
  var cw  = (ody[0]<0?1:0)+(odx[1]>0?1:0)+(ody[3]>0?1:0)+(odx[2]<0?1:0);
  // Counter-clockwise (mirror): TL→left, TR→up, BR→right, BL→down
  var ccw = (odx[0]<0?1:0)+(ody[1]<0?1:0)+(odx[3]>0?1:0)+(ody[2]>0?1:0);

  return cw >= 3 || ccw >= 3;
}

function ibShowNsfwToast(type) {
  var el = document.createElement('div');
  el.textContent = type === 'swastika'
    ? '🚫 Verbotenes Symbol automatisch entfernt.'
    : '🚫 Unangemessener Inhalt automatisch entfernt.';
  el.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);' +
    'background:#ff4400;color:#fff;padding:10px 20px;border-radius:6px;font-size:14px;' +
    'z-index:99999;pointer-events:none;opacity:1;transition:opacity 0.5s;white-space:nowrap;';
  document.body.appendChild(el);
  setTimeout(function() { el.style.opacity = '0'; }, 2500);
  setTimeout(function() { el.remove(); }, 3100);
}

window.addEventListener('resize', function() {
  if (ibIsOpen) ibResizeCanvas();
});
// ── END IMAGE BOARD ─────────────────────────────────────────────────────────
