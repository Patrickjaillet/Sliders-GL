// §2.4 roadmap UI/UX — Sortie viewport sur un second écran
//
// Pour la performance live (projection, multi-écran), on détache le rendu du
// viewport dans une seconde fenêtre. On y parvient de façon portable (web,
// PWA, Tauri) en capturant le flux du canvas WebGL via captureStream() et en
// l'affichant dans un <video> plein écran dans une fenêtre popup. L'utilisateur
// glisse la fenêtre sur son second écran puis la passe en plein écran.

import { toast } from '../io/actions.js';

let _popWin = null;

/** Ouvre (ou ramène au premier plan) la fenêtre miroir du viewport. */
export function popOutViewport() {
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('glc'));
  if (!canvas) { toast('No viewport canvas found', 'warn'); return; }

  if (_popWin && !_popWin.closed) { _popWin.focus(); return; }

  let stream;
  try {
    stream = /** @type {any} */ (canvas).captureStream(60);
  } catch {
    toast('Viewport mirroring not supported by this browser', 'err');
    return;
  }

  const win = window.open('', 'zgl-viewport-mirror', 'width=1280,height=720');
  if (!win) {
    toast('Popup blocked — allow popups to pop out the viewport', 'warn');
    return;
  }
  _popWin = win;

  win.document.title = 'Z-GL — Viewport';
  win.document.documentElement.style.cssText = 'margin:0;height:100%;background:#000';
  win.document.body.style.cssText =
    'margin:0;height:100vh;background:#000;display:flex;align-items:center;justify-content:center;overflow:hidden';

  const video = /** @type {any} */ (win.document.createElement('video'));
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.style.cssText = 'width:100%;height:100%;object-fit:contain;background:#000';
  video.srcObject = stream;
  win.document.body.appendChild(video);

  const hint = /** @type {any} */ (win.document.createElement('div'));
  hint.textContent = 'Drag to your second display · double-click = fullscreen · Esc closes';
  hint.style.cssText =
    'position:fixed;bottom:12px;left:50%;transform:translateX(-50%);font:12px sans-serif;' +
    'color:#aaa;background:rgba(0,0,0,.55);padding:4px 12px;border-radius:4px;transition:opacity .5s';
  win.document.body.appendChild(hint);
  setTimeout(() => { hint.style.opacity = '0'; }, 4000);

  win.document.body.addEventListener('dblclick', () => {
    if (win.document.fullscreenElement) win.document.exitFullscreen?.();
    else win.document.documentElement.requestFullscreen?.();
  });
  win.addEventListener('keydown', (e) => { if (e.key === 'Escape') win.close(); });
  win.addEventListener('beforeunload', () => { _popWin = null; });

  video.play?.().catch(() => {});

  const btn = document.getElementById('popoutViewportBtn');
  if (btn) btn.classList.add('active');
  toast('Viewport popped out — drag to your second screen', 'ok');
}

/** Ferme la fenêtre miroir si elle est ouverte. */
export function closeViewportPopout() {
  if (_popWin && !_popWin.closed) _popWin.close();
  _popWin = null;
  const btn = document.getElementById('popoutViewportBtn');
  if (btn) btn.classList.remove('active');
}

/** Bascule l'état de la fenêtre miroir. */
export function toggleViewportPopout() {
  if (_popWin && !_popWin.closed) closeViewportPopout();
  else popOutViewport();
}
