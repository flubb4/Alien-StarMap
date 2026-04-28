import { ref, get, push, remove } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const bcRef = () => ref(window.db, 'gmBroadcast');

window.openGMBroadcast = function () {
  document.getElementById('gm-broadcast-panel').classList.add('open');
  refreshBCList();
};

window.closeGMBroadcast = function () {
  document.getElementById('gm-broadcast-panel').classList.remove('open');
};

function refreshBCList() {
  const list = document.getElementById('gm-bc-list');
  list.innerHTML = '<span class="gm-bc-empty">LADE…</span>';
  window._authReadyPromise.then(() => {
    get(bcRef()).then(snap => {
      list.innerHTML = '';
      if (!snap.exists()) {
        list.innerHTML = '<span class="gm-bc-empty">— noch keine Einträge —</span>';
        return;
      }
      const data = snap.val();
      Object.entries(data).forEach(([key, val]) => {
        if (!val || !val.trim()) return;
        const row = document.createElement('div');
        row.className = 'gm-bc-row';
        const text = document.createElement('span');
        text.className = 'gm-bc-row-text';
        text.textContent = val.trim();
        const del = document.createElement('button');
        del.className = 'gm-bc-del';
        del.textContent = '×';
        del.onclick = () => deleteBCEntry(key);
        row.appendChild(text);
        row.appendChild(del);
        list.appendChild(row);
      });
    }).catch(() => {
      list.innerHTML = '<span class="gm-bc-empty">Fehler beim Laden.</span>';
    });
  });
}

window.addBCEntry = function () {
  const input = document.getElementById('gm-bc-new');
  const text = input.value.trim();
  if (!text) return;
  window._authReadyPromise.then(() => {
    push(bcRef(), text).then(() => {
      input.value = '';
      refreshBCList();
    });
  });
};

function deleteBCEntry(key) {
  window._authReadyPromise.then(() => {
    remove(ref(window.db, 'gmBroadcast/' + key)).then(refreshBCList);
  });
}

document.getElementById('gm-bc-new').addEventListener('keydown', e => {
  if (e.key === 'Enter') window.addBCEntry();
});
