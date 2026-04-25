// ============================================================
// MAP CORE
// Canvas, markers, pan/zoom, modal, sidebar, heartbeat, pings.
// Loads after firebase-init.js (window.db, window._authReadyPromise)
// and auth.js (window.colorFromName, window.isGM, post-login window.myName).
// ============================================================

import { ref, set, onValue, remove } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const db = window.db;

// ---- Refs ----
const markersRef = ref(db, 'markers');
const usersRef   = ref(db, 'users');
const pingsRef   = ref(db, 'pings');

// ---- Map dimensions ----
const MAP_W = 3200, MAP_H = 2067;

// ---- Module state ----
let markers = {};
window.markers = markers;

window.selectedType  = window.selectedType  || 'colony';
window.selectedColor = window.selectedColor || '#00e5ff';

let pendingClick  = null;

// Placeholder identity until auth.js populates window.myName / window.myId
if (!window.myId) {
  window.myId   = 'user_' + Math.random().toString(36).substr(2,8);
  window.myName = 'OPERATIVE-' + window.myId.slice(-4).toUpperCase();
}

let viewX = 0, viewY = 0, viewScale = 1;
let panStart = null;

const typeIcons  = {colony:'🏭',hazard:'☢',ship:'🚀',ruin:'💀',resource:'⚡',enemy:'👾',note:'📡',mission:'🎯'};
const typeLabels = {colony:'COLONY',hazard:'HAZARD',ship:'VESSEL',ruin:'RUINS',resource:'RESOURCE',enemy:'HOSTILE',note:'SIGNAL',mission:'MISSION'};
window.typeIcons  = typeIcons;
window.typeLabels = typeLabels;

document.getElementById('myName').textContent = window.myName;

// ---- Canvas & Image ----
const canvas = document.getElementById('mapCanvas');
const ctx    = canvas.getContext('2d');
const wrap   = document.getElementById('mapWrap');
window.getMapState = function() { return { ctx, viewScale }; };

const mapImg = new Image();
mapImg.src = 'assets/images/starmap.jpg';
mapImg.onload = () => { resize(); fitMap(); };

function resize() {
  canvas.width  = wrap.clientWidth;
  canvas.height = wrap.clientHeight;
  draw();
}
window.resize = resize;
window.addEventListener('resize', resize);

function fitMap() {
  const scaleX = canvas.width  / MAP_W;
  const scaleY = canvas.height / MAP_H;
  viewScale = Math.min(scaleX, scaleY);
  viewX = (canvas.width  - MAP_W * viewScale) / 2;
  viewY = (canvas.height - MAP_H * viewScale) / 2;
  draw();
}

// ---- Firebase live listener ----
onValue(markersRef, snapshot => {
  markers = snapshot.val() || {};
  window.markers = markers;
  draw();
  updateSidebar();
  flashSync();
});

onValue(usersRef, snapshot => {
  const users = snapshot.val() || {};
  const now = Date.now();
  const active = Object.values(users).filter(u => now - u.ts < 15000 && u.name && !u.name.startsWith('OPERATIVE-'));
  const n = active.length;
  document.getElementById('onlineCount').textContent =
    `● ${n} OPERATIVE${n!==1?'S':''} ONLINE`;
  document.getElementById('playerCount').textContent = n;

  const list = document.getElementById('playersList');
  if (!active.length) { list.innerHTML = ''; return; }
  window._activePlayerNames = active.map(u => u.name);
  window._wdActiveUsers = active;
  const captainName = window._captainName || '';
  list.innerHTML = active.map(u => {
    const isMe   = u.name === window.myName;
    const isCap  = u.name === captainName;
    const gmAttr = window.isGM ? `onclick="setCaptain('${u.name}')" title="Click to make Captain" style="cursor:pointer"` : '';
    return `<div class="player-entry ${isCap ? 'player-captain' : ''}" ${gmAttr}>
      <div class="player-dot" style="background:${u.color};box-shadow:0 0 6px ${u.color};flex-shrink:0"></div>
      <div class="player-name" style="color:${u.color};flex:1">${u.name}${isCap ? ' 👑' : ''}</div>
      ${isMe ? '<div class="player-you">YOU</div>' : ''}
    </div>`;
  }).join('');
  if (window.updateCaptainUI) window.updateCaptainUI();
});

function flashSync() {
  const el = document.getElementById('syncStatus');
  el.textContent = 'SYNCED ✓'; el.style.color = '#44ff88';
  setTimeout(() => { el.textContent = 'SYNCHRONIZED'; el.style.color = ''; }, 1200);
}

// ---- Draw ----
function draw() {
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle = '#000a10';
  ctx.fillRect(0,0,W,H);
  ctx.save();
  ctx.translate(viewX, viewY);
  ctx.scale(viewScale, viewScale);
  if (mapImg.complete) ctx.drawImage(mapImg, 0, 0, MAP_W, MAP_H);
  Object.values(markers).forEach(drawMarker);
  if (window.drawRouteLine)    window.drawRouteLine();
  if (window.drawDistanceLine) window.drawDistanceLine();
  if (window.drawShipPosition) window.drawShipPosition();
  if (window.drawTravelingShip) window.drawTravelingShip();
  ctx.restore();
}
window.draw = draw;

function drawMarker(m) {
  const x = m.x, y = m.y;
  const color = m.color || '#00e5ff';
  const icon  = typeIcons[m.type] || '📍';

  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5 / viewScale;
  ctx.beginPath(); ctx.arc(x, y, 22/viewScale, 0, Math.PI*2); ctx.stroke();
  ctx.globalAlpha = 0.09;
  ctx.beginPath(); ctx.arc(x, y, 34/viewScale, 0, Math.PI*2); ctx.stroke();
  ctx.globalAlpha = 1;

  const stemH = 32/viewScale;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5/viewScale;
  ctx.globalAlpha = 0.8;
  ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x, y-stemH); ctx.stroke();
  ctx.globalAlpha = 1;

  const r = 14/viewScale;
  const cy2 = y - stemH - r;
  const glow = ctx.createRadialGradient(x, cy2, 0, x, cy2, r*2.2);
  glow.addColorStop(0, color + '30');
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(x, cy2, r*2.2, 0, Math.PI*2); ctx.fill();

  ctx.fillStyle = 'rgba(4,17,26,0.92)';
  ctx.beginPath(); ctx.arc(x, cy2, r, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5/viewScale;
  ctx.beginPath(); ctx.arc(x, cy2, r, 0, Math.PI*2); ctx.stroke();

  ctx.font = (13/viewScale) + 'px serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(icon, x, cy2);

  ctx.font = 'bold ' + (9/viewScale) + 'px "Share Tech Mono",monospace';
  ctx.textBaseline = 'top'; ctx.textAlign = 'center';
  const labelY = y - stemH + 4/viewScale;
  const lw = ctx.measureText(m.name.toUpperCase()).width + 10/viewScale;
  ctx.fillStyle = 'rgba(4,17,26,0.82)';
  ctx.fillRect(x - lw/2, labelY - 1/viewScale, lw, 13/viewScale);
  ctx.fillStyle = color;
  ctx.fillText(m.name.toUpperCase(), x, labelY);
  ctx.textBaseline = 'alphabetic';
}

// ---- Pan / Zoom ----
function screenToMap(sx, sy) { return { x:(sx-viewX)/viewScale, y:(sy-viewY)/viewScale }; }
function mapToScreen(mx, my) { return { x:mx*viewScale+viewX,   y:my*viewScale+viewY   }; }

// mousedown handled by ping system below
canvas.addEventListener('mousemove', e => {
  if (panStart) {
    const dx=e.clientX-panStart.x, dy=e.clientY-panStart.y;
    if (Math.abs(dx)>4||Math.abs(dy)>4) {
      panStart.moved=true; viewX=panStart.vx+dx; viewY=panStart.vy+dy; draw();
    }
  }
  const rect=canvas.getBoundingClientRect();
  const cx=e.clientX-rect.left, cy=e.clientY-rect.top;
  const mp=screenToMap(cx,cy);

  let hovered=null;
  Object.values(markers).forEach(m => {
    const sc=mapToScreen(m.x,m.y);
    if (Math.hypot(cx-(sc.x), cy-(sc.y-32-14)) < 20) hovered=m;
  });
  const tt=document.getElementById('tooltip');
  if (hovered) {
    tt.classList.add('visible');
    document.getElementById('ttName').textContent=hovered.name.toUpperCase();
    document.getElementById('ttMeta').textContent=typeLabels[hovered.type]+' • '+(hovered.author||'UNKNOWN');
    document.getElementById('ttNote').textContent=hovered.note||'';
    tt.style.left=(cx+16)+'px'; tt.style.top=(cy-20)+'px';
  } else { tt.classList.remove('visible'); }
  document.getElementById('coordDisplay').textContent='COORDS: '+Math.round(mp.x)+', '+Math.round(mp.y);
});
canvas.addEventListener('mouseup', e => {
  if (panStart&&!panStart.moved) {
    const rect=canvas.getBoundingClientRect();
    const pos=screenToMap(e.clientX-rect.left, e.clientY-rect.top);
    window.openModal(pos.x,pos.y);
  }
  panStart=null;
});
canvas.addEventListener('mouseleave', ()=>{ panStart=null; });
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const rect=canvas.getBoundingClientRect();
  const cx=e.clientX-rect.left, cy=e.clientY-rect.top;
  const factor=e.deltaY<0?1.12:0.89;
  const ns=Math.max(0.2,Math.min(6,viewScale*factor));
  viewX=cx-(cx-viewX)*(ns/viewScale); viewY=cy-(cy-viewY)*(ns/viewScale); viewScale=ns; draw();
},{passive:false});

function zoomBy(factor) {
  const cx=canvas.width/2, cy=canvas.height/2;
  const ns=Math.max(0.2,Math.min(6,viewScale*factor));
  viewX=cx-(cx-viewX)*(ns/viewScale); viewY=cy-(cy-viewY)*(ns/viewScale); viewScale=ns; draw();
}
window.zoomBy = zoomBy;
function resetView() { fitMap(); }
window.resetView = resetView;

// ---- Modal ----
function openModal(x,y) {
  pendingClick={x,y};
  document.getElementById('markerName').value='';
  document.getElementById('markerNote').value='';
  document.getElementById('modal').classList.add('open');
  setTimeout(()=>document.getElementById('markerName').focus(),50);
}
window.openModal = openModal;
function cancelMarker() { document.getElementById('modal').classList.remove('open'); pendingClick=null; }
window.cancelMarker = cancelMarker;

function confirmMarker() {
  const name=document.getElementById('markerName').value.trim();
  if (!name) { document.getElementById('markerName').style.borderColor='var(--accent2)'; return; }
  document.getElementById('markerName').style.borderColor='';
  const id='mk_'+Date.now()+'_'+Math.random().toString(36).substr(2,5);
  const marker={
    id, x:pendingClick.x, y:pendingClick.y, name,
    note:document.getElementById('markerNote').value.trim(),
    type:window.selectedType, color:window.selectedColor, author:window.myName, ts:Date.now()
  };
  set(ref(db,'markers/'+id), marker);
  document.getElementById('modal').classList.remove('open');
  pendingClick=null;
}
window.confirmMarker = confirmMarker;

document.getElementById('travelTo')?.addEventListener('change', () => window.updateTravelBtn?.());
document.getElementById('modal').addEventListener('keydown', e=>{
  if (e.key==='Enter'&&!e.shiftKey) confirmMarker();
  if (e.key==='Escape') cancelMarker();
});

// ---- Type / Color ----
window.selectType = function(btn) {
  document.querySelectorAll('.marker-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active'); window.selectedType=btn.dataset.type;
};
window.selectColor = function(sw) {
  document.querySelectorAll('.color-swatch').forEach(s=>s.classList.remove('active'));
  sw.classList.add('active'); window.selectedColor=sw.dataset.color;
  document.getElementById('myDot').style.background=window.selectedColor;
};

// ---- Sidebar ----
function updateSidebar() {
  if (window.updateDistanceDropdowns) window.updateDistanceDropdowns();
  if (window.updateTravelDropdowns)   window.updateTravelDropdowns();
  if (window.updateTravelBtn)         window.updateTravelBtn();
  const list=document.getElementById('markersList');
  const arr=Object.values(markers);
  document.getElementById('markerCount').textContent=arr.length;
  if (!arr.length) { list.innerHTML='<div class="no-markers">NO MARKERS PLACED<br>CLICK THE MAP TO ADD</div>'; return; }
  list.innerHTML=arr.slice().sort((a,b)=>b.ts-a.ts).map(m=>`
    <div class="marker-item" onclick="focusMarker('${m.id}')">
      <div style="font-size:12px;color:${m.color}">${typeIcons[m.type]}</div>
      <div class="marker-item-info">
        <div class="marker-item-name" style="color:${m.color}">${m.name.toUpperCase()}</div>
        <div class="marker-item-meta">${typeLabels[m.type]} • ${m.author}</div>
      </div>
      <button class="marker-item-del" onclick="deleteMarker('${m.id}',event)">✕</button>
    </div>`).join('');
}
window.focusMarker = function(id) {
  const m=markers[id]; if(!m) return;
  viewX=canvas.width/2 -m.x*viewScale;
  viewY=canvas.height/2-m.y*viewScale;
  draw();
};
window.deleteMarker = function(id,e) {
  e.stopPropagation();
  remove(ref(db,'markers/'+id));
};

// ---- Heartbeat ----
function heartbeat() {
  if (!window._loggedIn) return;   // don't write ghost users before login
  const myColor = window.colorFromName(window.myName);
  set(ref(db,'users/'+window.myId), {name:window.myName, color:myColor, ts:Date.now()});
}
window.heartbeat = heartbeat;
setInterval(heartbeat, 5000);
// heartbeat called after login now, not on init

// ---- PING SYSTEM ----
let holdTimer = null;
let holdStartPos = null;

canvas.addEventListener('mousedown', e => {
  if (e.button === 0) {
    panStart = {x:e.clientX, y:e.clientY, vx:viewX, vy:viewY, moved:false};
    // Start hold timer for ping
    holdStartPos = {x:e.clientX, y:e.clientY};
    holdTimer = setTimeout(() => {
      if (!panStart || !panStart.moved) {
        const rect = canvas.getBoundingClientRect();
        const pos  = screenToMap(e.clientX - rect.left, e.clientY - rect.top);
        sendPing(pos.x, pos.y);
        panStart = null; // prevent click-to-place marker
      }
    }, 600);
  }
});

canvas.addEventListener('mouseup', e => {
  clearTimeout(holdTimer);
  holdTimer = null;
});

function sendPing(x, y) {
  const pingId = 'ping_' + Date.now() + '_' + window.myId;
  set(ref(db, 'pings/' + pingId), {
    x, y, author: window.myName, color: window.colorFromName(window.myName), ts: Date.now()
  });
  // Auto-remove after 3s
  setTimeout(() => remove(ref(db, 'pings/' + pingId)), 3000);
}

// Listen for pings and animate them
onValue(pingsRef, snapshot => {
  const pings = snapshot.val() || {};
  const now   = Date.now();
  Object.values(pings).forEach(p => {
    if (now - p.ts > 3000) return; // stale
    showPing(p);
  });
});

function showPing(p) {
  const sc = mapToScreen(p.x, p.y);
  const el = document.createElement('div');
  el.className = 'ping-el';
  el.style.color = p.color;
  el.style.borderColor = p.color;
  el.style.boxShadow   = `0 0 8px ${p.color}`;
  el.style.left = (sc.x - 15) + 'px';
  el.style.top  = (sc.y - 15) + 'px';

  // Label
  const label = document.createElement('div');
  label.style.cssText = `position:absolute;top:-18px;left:50%;transform:translateX(-50%);
    font-size:9px;font-family:"Share Tech Mono",monospace;color:${p.color};
    white-space:nowrap;letter-spacing:1px;text-shadow:0 0 6px ${p.color}`;
  label.textContent = p.author;
  el.appendChild(label);

  wrap.appendChild(el);
  setTimeout(() => el.remove(), 1000);

  // Second ring with delay
  setTimeout(() => {
    const el2 = el.cloneNode(true);
    el2.style.animationDelay = '0.2s';
    wrap.appendChild(el2);
    setTimeout(() => el2.remove(), 1200);
  }, 100);
}
