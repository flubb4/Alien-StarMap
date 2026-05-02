// ============================================================
// FIREBASE INITIALIZATION
// Firebase Realtime Database for live marker sync.
// Must load FIRST — exposes window.db, window._authReadyPromise,
// and the most-used Refs that other modules rely on.
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyB_DSkCG0QXX-iXJ2YL1o0-w4DF_BXijts",
  authDomain: "alien-map-d031c.firebaseapp.com",
  databaseURL: "https://alien-map-d031c-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "alien-map-d031c",
  storageBucket: "alien-map-d031c.firebasestorage.app",
  messagingSenderId: "718901661590",
  appId: "1:718901661590:web:ab929525f876568c2c17b7",
  measurementId: "G-SDG5BCSXY9"
};

const app  = initializeApp(firebaseConfig);
const db   = getDatabase(app);
const auth = getAuth(app);

window.db = db;

// Most-used Refs exposed for other modules
window.ibStrokesRef       = ref(db, 'session/imageBoard/strokes');
window.ibCoverDataRef     = ref(db, 'session/imageBoard/coverImageData');
window.ibFogCoverRef      = ref(db, 'session/imageBoard/fogCover'); // single ordered list of fog+reveal strokes
window.mtTrackersRef      = ref(db, 'session/imageBoard/motionTrackers');
window.mtBlipsRef         = ref(db, 'session/imageBoard/motionBlips');

// ── Anonymous auth ─────────────────────────────────────────────
// Firebase rules require auth != null for all writes.
// signInAnonymously() fires silently on page load — users see nothing.
let _authReadyResolve;
const _authReadyPromise = new Promise(resolve => { _authReadyResolve = resolve; });
window._authReadyPromise = _authReadyPromise;

signInAnonymously(auth).catch(err => {
  console.warn('Anonymous auth failed:', err.code);
  _authReadyResolve(); // unblock even on failure so app doesn't hang
});
onAuthStateChanged(auth, user => {
  if (user) { console.log('Firebase auth ready — uid:', user.uid); _authReadyResolve(); }
});
