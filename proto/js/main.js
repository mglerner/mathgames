// @ts-check
// Browser boot: builds the real environment and hands it to the DOM layer.
import { startApp } from './app.js';

/** @returns {any} */
function safeStorage() {
  try {
    const st = window.localStorage;
    const k = '__kd_probe';
    st.setItem(k, '1');
    st.removeItem(k);
    return st;
  } catch {
    return null;
  }
}

/** @param {number} n */
function randomBytes(n) {
  const a = new Uint8Array(n);
  try {
    crypto.getRandomValues(a);
  } catch {
    for (let i = 0; i < n; i++) a[i] = Math.floor(Math.random() * 256); // ids only, never math
  }
  return a;
}

/** @param {string} name @param {string} text */
function download(name, text) {
  try {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 1500);
    return true;
  } catch {
    return false;
  }
}

// no pinch zoom, no double-tap zoom, no long-press callout
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
}
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

const root = document.getElementById('app');
if (root) {
  startApp(root, {
    doc: document,
    storage: safeStorage(),
    nowMs: () => Date.now(),
    randomBytes,
    search: window.location.search,
    download,
    win: window,
  });
}
