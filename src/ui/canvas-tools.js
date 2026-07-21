// Phase 4 roadmap UI/UX — Outils du viewport / canvas
//
// Regroupe les fonctionnalités liées au canvas WebGL (#glc), toutes
// non destructives pour le rendu :
//   • 4.1 — HUD repliable (touche H) : FPS, résolution, frame, temps
//   • 4.2 — Guides : safe-zones, croix centrale, règle (maintien R)
//   • 4.3 — Zoom / pan (Ctrl+molette, glisser clic-milieu, Ctrl+0)
//   • 4.4 — Copier l'image dans le presse-papiers (Ctrl+Shift+C)
//   • 4.5 — Comparaison avant/après (maintien B) sur image de référence
//   • 5.2 — Menu contextuel du canvas (clic droit)

import { state } from '../core/state.js';
import { toast } from '../io/actions.js';
import { doResize } from '../gl/renderer.js';
import { safeLocalGet, safeLocalSet } from '../core/utils.js';
import { toggleCanvasGizmos } from './canvas-gizmos.js';
import { popOutViewport } from './viewport-popout.js';
import { exportScreenshot } from '../export/export.js';

let _cw = null;   // #cwrap
let _glc = null;  // #glc
let _overlay = null;     // <canvas> 2D de guides (4.2)
let _octx = null;

// ── État zoom/pan (4.3) ───────────────────────────────────────────────
let _zoom = 1, _panX = 0, _panY = 0;

// ── État guides (4.2) ─────────────────────────────────────────────────
let _guides = false;   // safe-zones + croix (toggle)
let _ruler = false;    // règle (maintien R)

// ── État HUD (4.1) ────────────────────────────────────────────────────
let _hudOn = safeLocalGet('sl_hud', '1') !== '0';

// ── Référence avant/après (4.5) ───────────────────────────────────────
let _refURL = null;
let _compareEl = null;
let _splitFrac = 0.5;

// ════════════════════════════════════════════════════════════════════
// Capture de frame (sert à 4.4, 4.5, 5.2). Le renderer principal utilise
// preserveDrawingBuffer:true → on peut lire #glc directement.
// ════════════════════════════════════════════════════════════════════
function _captureBlob() {
  return new Promise((resolve) => {
    if (!_glc) return resolve(null);
    try { _glc.toBlob(b => resolve(b), 'image/png'); }
    catch { resolve(null); }
  });
}
function _captureDataURL() {
  try { return _glc ? _glc.toDataURL('image/png') : null; }
  catch { return null; }
}

// ════════════════════════════════════════════════════════════════════
// 4.4 — Copier l'image courante dans le presse-papiers
// ════════════════════════════════════════════════════════════════════
export async function copyFrameToClipboard() {
  const blob = await _captureBlob();
  if (!blob) { toast('Could not capture frame', 'err'); return; }
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
      _flashCanvas('Copied!');
      toast('Frame copied to clipboard', 'ok');
    } else {
      throw new Error('Clipboard image API unavailable');
    }
  } catch {
    // Repli : téléchargement
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'z-gl-frame.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Clipboard blocked — downloaded PNG instead', 'warn');
  }
}

// Petit flash "Copied!" sur le canvas
function _flashCanvas(text) {
  if (!_cw) return;
  const f = document.createElement('div');
  f.className = 'canvas-flash';
  f.textContent = text;
  _cw.appendChild(f);
  requestAnimationFrame(() => f.classList.add('show'));
  setTimeout(() => { f.classList.remove('show'); setTimeout(() => f.remove(), 250); }, 700);
}

// ════════════════════════════════════════════════════════════════════
// 4.1 — HUD repliable
// ════════════════════════════════════════════════════════════════════
export function toggleHUD(force) {
  _hudOn = force !== undefined ? force : !_hudOn;
  if (_cw) _cw.classList.toggle('hud-off', !_hudOn);
  safeLocalSet('sl_hud', _hudOn ? '1' : '0');
}

// ════════════════════════════════════════════════════════════════════
// 4.3 — Zoom / pan (transform CSS, sans toucher iResolution)
// ════════════════════════════════════════════════════════════════════
function _applyTransform() {
  if (!_glc) return;
  if (_zoom === 1 && _panX === 0 && _panY === 0) {
    _glc.style.transform = '';
    _cw?.classList.remove('zoomed');
  } else {
    _glc.style.transform = `translate(${_panX}px, ${_panY}px) scale(${_zoom})`;
    _cw?.classList.add('zoomed');
  }
}
export function resetZoom() {
  _zoom = 1; _panX = 0; _panY = 0;
  _applyTransform();
}
function _onWheel(e) {
  if (!e.ctrlKey && !e.metaKey) return; // Ctrl+molette uniquement
  e.preventDefault();
  const prev = _zoom;
  const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
  _zoom = Math.max(0.5, Math.min(8, _zoom * factor));
  // Zoom centré sur le curseur
  const rect = _cw.getBoundingClientRect();
  const cx = e.clientX - rect.left - rect.width / 2;
  const cy = e.clientY - rect.top - rect.height / 2;
  const ratio = _zoom / prev;
  _panX = cx - (cx - _panX) * ratio;
  _panY = cy - (cy - _panY) * ratio;
  _applyTransform();
}
let _panning = false, _panSX = 0, _panSY = 0;
function _onPanDown(e) {
  if (e.button !== 1) return; // bouton du milieu
  e.preventDefault();
  _panning = true; _panSX = e.clientX - _panX; _panSY = e.clientY - _panY;
  _cw.style.cursor = 'grabbing';
}
function _onPanMove(e) {
  if (!_panning) return;
  _panX = e.clientX - _panSX; _panY = e.clientY - _panSY;
  _applyTransform();
}
function _onPanUp() {
  if (!_panning) return;
  _panning = false; _cw.style.cursor = '';
}

// §8.2 — pinch-zoom + two-finger pan
let _touchDist = 0, _touchMidX = 0, _touchMidY = 0;
function _touchInfo(t) {
  const dx = t[0].clientX - t[1].clientX;
  const dy = t[0].clientY - t[1].clientY;
  return {
    dist: Math.hypot(dx, dy),
    mx: (t[0].clientX + t[1].clientX) / 2,
    my: (t[0].clientY + t[1].clientY) / 2,
  };
}
function _onTouchStart(e) {
  if (e.touches.length !== 2) return;
  e.preventDefault();
  const info = _touchInfo(e.touches);
  _touchDist = info.dist; _touchMidX = info.mx; _touchMidY = info.my;
}
function _onTouchMove(e) {
  if (e.touches.length !== 2) return;
  e.preventDefault();
  const info = _touchInfo(e.touches);
  // pan = déplacement du point milieu
  _panX += info.mx - _touchMidX;
  _panY += info.my - _touchMidY;
  // zoom = rapport des distances
  if (_touchDist > 0) {
    const prev = _zoom;
    _zoom = Math.max(0.5, Math.min(8, _zoom * (info.dist / _touchDist)));
    const rect = _cw.getBoundingClientRect();
    const cx = info.mx - rect.left - rect.width / 2;
    const cy = info.my - rect.top - rect.height / 2;
    const ratio = _zoom / prev;
    _panX = cx - (cx - _panX) * ratio;
    _panY = cy - (cy - _panY) * ratio;
  }
  _touchDist = info.dist; _touchMidX = info.mx; _touchMidY = info.my;
  _applyTransform();
}

// ════════════════════════════════════════════════════════════════════
// 4.2 — Guides (safe-zones, croix, règle) sur canvas 2D overlay
// ════════════════════════════════════════════════════════════════════
function _resizeOverlay() {
  if (!_overlay || !_cw) return;
  const r = _cw.getBoundingClientRect();
  _overlay.width = Math.max(1, Math.round(r.width));
  _overlay.height = Math.max(1, Math.round(r.height));
  _drawGuides();
}
function _drawGuides() {
  if (!_octx || !_overlay) return;
  const w = _overlay.width, h = _overlay.height;
  _octx.clearRect(0, 0, w, h);
  if (!_guides && !_ruler) { _overlay.style.display = 'none'; return; }
  _overlay.style.display = 'block';

  if (_guides) {
    // Safe-zones (90% / 80%) + croix centrale
    _octx.strokeStyle = 'rgba(255,255,255,0.35)';
    _octx.lineWidth = 1;
    for (const frac of [0.9, 0.8]) {
      const mw = w * (1 - frac) / 2, mh = h * (1 - frac) / 2;
      _octx.strokeRect(mw, mh, w - 2 * mw, h - 2 * mh);
    }
    _octx.beginPath();
    _octx.moveTo(w / 2, 0); _octx.lineTo(w / 2, h);
    _octx.moveTo(0, h / 2); _octx.lineTo(w, h / 2);
    _octx.strokeStyle = 'rgba(255,255,255,0.5)';
    _octx.stroke();
  }
  if (_ruler) {
    // Règle en pixels sur les bords
    _octx.strokeStyle = 'rgba(120,200,255,0.7)';
    _octx.fillStyle = 'rgba(120,200,255,0.9)';
    _octx.font = '9px monospace';
    _octx.lineWidth = 1;
    const step = 50;
    _octx.beginPath();
    for (let x = 0; x <= w; x += step) {
      _octx.moveTo(x, 0); _octx.lineTo(x, 8);
      if (x > 0) _octx.fillText(String(x), x + 2, 16);
    }
    for (let y = 0; y <= h; y += step) {
      _octx.moveTo(0, y); _octx.lineTo(8, y);
      if (y > 0) _octx.fillText(String(y), 2, y + 10);
    }
    _octx.stroke();
  }
}
export function toggleGuides(force) {
  _guides = force !== undefined ? force : !_guides;
  _drawGuides();
}
function _setRuler(on) {
  if (_ruler === on) return;
  _ruler = on;
  _drawGuides();
}

// ════════════════════════════════════════════════════════════════════
// 4.5 — Comparaison avant/après
// ════════════════════════════════════════════════════════════════════
export function saveReference() {
  const url = _captureDataURL();
  if (!url) { toast('Could not capture reference', 'err'); return; }
  _refURL = url;
  toast('Reference frame saved — hold B to compare', 'ok');
}
function _buildCompare() {
  if (_compareEl || !_cw) return;
  _compareEl = document.createElement('div');
  _compareEl.className = 'canvas-compare';
  _compareEl.innerHTML = `
    <img class="cc-ref" alt="reference frame" draggable="false"/>
    <div class="cc-split"><div class="cc-handle">⇆</div></div>
    <div class="cc-label cc-label-ref">REF</div>
    <div class="cc-label cc-label-live">LIVE</div>`;
  _cw.appendChild(_compareEl);

  // Glisser la ligne de séparation
  const split = _compareEl.querySelector('.cc-split');
  const onMove = (e) => {
    const r = _cw.getBoundingClientRect();
    _splitFrac = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    _layoutCompare();
  };
  split.addEventListener('mousedown', (e) => {
    e.preventDefault(); e.stopPropagation();
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', () => document.removeEventListener('mousemove', onMove), { once: true });
  });
}
function _layoutCompare() {
  if (!_compareEl) return;
  const pct = (_splitFrac * 100).toFixed(1) + '%';
  const ref = _compareEl.querySelector('.cc-ref');
  const split = _compareEl.querySelector('.cc-split');
  ref.style.clipPath = `inset(0 ${(100 - _splitFrac * 100).toFixed(1)}% 0 0)`;
  split.style.left = pct;
}
function _showCompare(on) {
  if (on) {
    if (!_refURL) return; // rien à comparer
    _buildCompare();
    _compareEl.querySelector('.cc-ref').src = _refURL;
    _layoutCompare();
    _compareEl.classList.add('open');
  } else if (_compareEl) {
    _compareEl.classList.remove('open');
  }
}

// ════════════════════════════════════════════════════════════════════
// 5.2 — Menu contextuel du canvas
// ════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════
// Outil pick — clic → coordonnée UV/fragCoord dans le shader
// ════════════════════════════════════════════════════════════════════
let _pickMode = false;
let _pickEl = null;

export function isPickModeActive() { return _pickMode; }

export function togglePickMode(force) {
  _pickMode = force !== undefined ? !!force : !_pickMode;
  if (_pickMode) {
    _cw.classList.add('pick-active');
    _buildPickOverlay();
    _cw.addEventListener('click', _onPickClick);
  } else {
    _cw.classList.remove('pick-active');
    _cw.removeEventListener('click', _onPickClick);
    if (_pickEl) { _pickEl.remove(); _pickEl = null; }
  }
  return _pickMode;
}

function _buildPickOverlay() {
  if (_pickEl || !_cw) return;
  _pickEl = document.createElement('div');
  _pickEl.id = 'pickOverlay';
  _pickEl.style.cssText = [
    'position:absolute', 'bottom:40px', 'left:8px', 'z-index:60',
    'background:rgba(0,0,0,0.65)', 'border:1px solid rgba(255,255,255,0.15)',
    'border-radius:4px', 'padding:4px 8px',
    "font:10px 'JetBrains Mono',monospace", 'color:rgba(255,255,255,0.85)',
    'pointer-events:none', 'transition:opacity .2s',
  ].join(';');
  _pickEl.textContent = 'Pick — cliquer le canvas pour lire les coordonnées';
  _cw.appendChild(_pickEl);
}

function _onPickClick(e) {
  if (!_pickMode || !_cw) return;
  const r = _cw.getBoundingClientRect();
  const u = (e.clientX - r.left) / r.width;
  const v = 1 - (e.clientY - r.top) / r.height;
  const fx = Math.round(u * r.width), fy = Math.round(v * r.height);
  const uStr = u.toFixed(4), vStr = v.toFixed(4);
  if (_pickEl) _pickEl.innerHTML = `UV: (${uStr}, ${vStr})<br>fragCoord: (${fx}, ${fy})`;
  toast(`Picked UV (${uStr}, ${vStr})`, 'ok');
  // Store on state.cam3 for shader access
  if (state.cam3 && typeof state.cam3 === 'object') {
    state.cam3.pickUV = [u, v];
  }
}

let _ctxEl = null;
function _closeCtx() { if (_ctxEl) { _ctxEl.remove(); _ctxEl = null; } }
function _openCtx(x, y) {
  _closeCtx();
  const items = [
    { label: 'Save screenshot (PNG)', fn: () => exportScreenshot() },
    { label: 'Copy frame', fn: copyFrameToClipboard },
    { label: 'Set as reference', fn: saveReference },
    { label: _hudOn ? 'Hide HUD' : 'Show HUD', fn: () => toggleHUD() },
    { label: _guides ? 'Hide guides' : 'Show guides', fn: () => toggleGuides() },
    { label: 'Toggle position gizmos', fn: () => toggleCanvasGizmos() },
    { label: _pickMode ? '✓ Disable pick mode' : 'Pick mode UV', fn: () => togglePickMode() },
    { label: 'Pop out viewport', fn: () => popOutViewport() },
    { label: 'Reset zoom', fn: resetZoom },
  ];
  const menu = document.createElement('div');
  menu.className = 'canvas-ctx';
  menu.setAttribute('role', 'menu');
  for (const it of items) {
    const b = document.createElement('button');
    b.className = 'canvas-ctx-item';
    b.type = 'button';
    b.textContent = it.label;
    b.addEventListener('click', () => { _closeCtx(); it.fn(); });
    menu.appendChild(b);
  }
  document.body.appendChild(menu);
  // Position dans la fenêtre
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  menu.style.left = Math.min(x, window.innerWidth - mw - 4) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - mh - 4) + 'px';
  _ctxEl = menu;
  setTimeout(() => document.addEventListener('mousedown', _closeCtx, { once: true }), 0);
}

// ════════════════════════════════════════════════════════════════════
// Clavier (touches non destructives, ignorées pendant la saisie)
// ════════════════════════════════════════════════════════════════════
function _typing(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || (t.closest && t.closest('.monaco-editor')));
}
function _onKeyDown(e) {
  if (e.repeat) return;
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
    e.preventDefault(); copyFrameToClipboard(); return;
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === '0')) {
    // ne pas voler le zoom UI global si la cible est un input
    if (!_typing(e)) { e.preventDefault(); resetZoom(); return; }
  }
  if (_typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'h' || e.key === 'H') { e.preventDefault(); toggleHUD(); }
  else if (e.key === 'g' || e.key === 'G') { e.preventDefault(); toggleGuides(); }
  else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); _setRuler(true); }
  else if (e.key === 'b' || e.key === 'B') { e.preventDefault(); _showCompare(true); }
}
function _onKeyUp(e) {
  if (e.key === 'r' || e.key === 'R') _setRuler(false);
  else if (e.key === 'b' || e.key === 'B') _showCompare(false);
}

// ════════════════════════════════════════════════════════════════════
export function initCanvasTools() {
  _cw = document.getElementById('cwrap');
  _glc = document.getElementById('glc');
  if (!_cw || !_glc) return;

  // HUD : état initial
  if (!_hudOn) _cw.classList.add('hud-off');

  // Pick mode cursor style
  if (!document.getElementById('pickModeStyle')) {
    const s = document.createElement('style');
    s.id = 'pickModeStyle';
    s.textContent = '#cwrap.pick-active { cursor: crosshair !important; }';
    document.head.appendChild(s);
  }

  // Overlay 2D de guides
  _overlay = document.createElement('canvas');
  _overlay.className = 'canvas-guides';
  _overlay.style.display = 'none';
  _cw.appendChild(_overlay);
  _octx = _overlay.getContext('2d');
  _resizeOverlay();
  window.addEventListener('resize', _resizeOverlay);
  // Le splitter / les changements de layout redimensionnent le canvas
  window.addEventListener('zgl:layoutchange', () => setTimeout(_resizeOverlay, 80));

  // Zoom / pan
  _cw.addEventListener('wheel', _onWheel, { passive: false });
  _cw.addEventListener('mousedown', _onPanDown);
  window.addEventListener('mousemove', _onPanMove);
  window.addEventListener('mouseup', _onPanUp);

  // §8.2 — gestes tactiles : pincer pour zoomer, deux doigts pour déplacer
  _cw.addEventListener('touchstart', _onTouchStart, { passive: false });
  _cw.addEventListener('touchmove', _onTouchMove, { passive: false });

  // Menu contextuel
  _cw.addEventListener('contextmenu', (e) => { e.preventDefault(); _openCtx(e.clientX, e.clientY); });

  // Clavier
  document.addEventListener('keydown', _onKeyDown);
  document.addEventListener('keyup', _onKeyUp);
}
