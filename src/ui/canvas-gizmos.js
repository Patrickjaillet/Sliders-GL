// §A.1 (UI v2) — Gizmos de position sur le canvas
//
// Affiche des poignées déplaçables sur le rendu pour les littéraux vec2 dont
// les composantes sont dans une plage normalisée (≈ position UV/écran).
// Glisser une poignée réécrit le vec2 dans l'éditeur, en direct.
//
// Opt-in (clic droit canvas → « Toggle position gizmos ») pour éviter
// l'encombrement : tous les vec2 ne sont pas des positions.

import * as monaco from 'monaco-editor';
import { state } from '../core/state.js';
import { applyAndParse } from '../io/actions.js';

const VEC2_RE = /\bvec2\(\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*\)/g;
const MAX_GIZMOS = 10;

let _enabled = false;
let _layer = null;
let _cw = null;
let _deb = null;

function _scan() {
  const out = [];
  const model = state.editor?.getModel();
  if (!model) return out;
  const lineCount = model.getLineCount();
  for (let ln = 1; ln <= lineCount && out.length < MAX_GIZMOS; ln++) {
    const text = model.getLineContent(ln);
    if (!text.includes('vec2')) continue;
    VEC2_RE.lastIndex = 0;
    let m;
    while ((m = VEC2_RE.exec(text)) !== null) {
      const x = parseFloat(m[1]), y = parseFloat(m[2]);
      // heuristique « position » : composantes normalisées
      if (x < -1.5 || x > 1.5 || y < -1.5 || y > 1.5) continue;
      out.push({ line: ln, startCol: m.index + 1, endCol: m.index + m[0].length + 1, x, y, raw: m[0] });
      if (out.length >= MAX_GIZMOS) break;
    }
  }
  return out;
}

// UV GLSL : (0,0) bas-gauche, (1,1) haut-droit.  Hors [0,1] → clampé visuellement.
function _toScreen(x, y, w, h) {
  return { px: Math.max(0, Math.min(1, x)) * w, py: (1 - Math.max(0, Math.min(1, y))) * h };
}

function _render() {
  if (!_layer || !_cw) return;
  _layer.innerHTML = '';
  if (!_enabled) { _layer.style.display = 'none'; return; }
  _layer.style.display = 'block';
  const r = _cw.getBoundingClientRect();
  const gizmos = _scan();
  for (const g of gizmos) {
    const { px, py } = _toScreen(g.x, g.y, r.width, r.height);
    const h = document.createElement('div');
    h.className = 'canvas-gizmo';
    h.style.left = px + 'px';
    h.style.top = py + 'px';
    h.title = `vec2(${g.x}, ${g.y}) — line ${g.line} · drag or arrow keys`;
    h.dataset.line = String(g.line);
    // §H.1 — opérable au clavier
    h.tabIndex = 0;
    h.setAttribute('role', 'slider');
    h.setAttribute('aria-label', `Position gizmo line ${g.line}: x ${g.x}, y ${g.y}`);
    _attachDrag(h, g, r);
    _attachKeys(h, g);
    _layer.appendChild(h);
  }
}

function _liveApply() { clearTimeout(_deb); _deb = setTimeout(() => { try { applyAndParse(); } catch { /* noop */ } }, 90); }

function _attachDrag(handle, g, _rect) {
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    handle.setPointerCapture(e.pointerId);
    handle.classList.add('dragging');
    let curLen = g.raw.length;
    const onMove = (ev) => {
      const r = _cw.getBoundingClientRect();
      const u = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
      const v = Math.max(0, Math.min(1, 1 - (ev.clientY - r.top) / r.height));
      const fx = +u.toFixed(3), fy = +v.toFixed(3);
      const text = `vec2(${fx}, ${fy})`;
      state.editor.executeEdits('gizmo', [{
        range: new monaco.Range(g.line, g.startCol, g.line, g.startCol + curLen),
        text, forceMoveMarkers: true,
      }]);
      curLen = text.length;
      handle.style.left = (u * r.width) + 'px';
      handle.style.top = ((1 - v) * r.height) + 'px';
      _liveApply();
    };
    const onUp = () => {
      handle.releasePointerCapture?.(e.pointerId);
      handle.classList.remove('dragging');
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      _liveApply();
      setTimeout(_render, 120); // re-scan (positions/longueurs ont changé)
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
  });
}

// §H.1 — déplacement de la poignée au clavier (flèches ; Shift = pas fin)
function _attachKeys(handle, g) {
  let curLen = g.raw.length;
  let cx = g.x, cy = g.y;
  handle.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 0.005 : 0.02;
    let dx = 0, dy = 0;
    if (e.key === 'ArrowLeft') dx = -step;
    else if (e.key === 'ArrowRight') dx = step;
    else if (e.key === 'ArrowUp') dy = step;
    else if (e.key === 'ArrowDown') dy = -step;
    else return;
    e.preventDefault();
    cx = Math.max(0, Math.min(1, +(cx + dx).toFixed(3)));
    cy = Math.max(0, Math.min(1, +(cy + dy).toFixed(3)));
    const text = `vec2(${cx}, ${cy})`;
    state.editor.executeEdits('gizmo-kbd', [{
      range: new monaco.Range(g.line, g.startCol, g.line, g.startCol + curLen),
      text, forceMoveMarkers: true,
    }]);
    curLen = text.length;
    const r = _cw.getBoundingClientRect();
    handle.style.left = (cx * r.width) + 'px';
    handle.style.top = ((1 - cy) * r.height) + 'px';
    handle.setAttribute('aria-label', `Position gizmo line ${g.line}: x ${cx}, y ${cy}`);
    _liveApply();
  });
}

export function toggleCanvasGizmos(force) {
  _enabled = force !== undefined ? force : !_enabled;
  _render();
  return _enabled;
}

export function initCanvasGizmos() {
  _cw = document.getElementById('cwrap');
  if (!_cw || document.getElementById('canvasGizmoLayer')) return;
  _layer = document.createElement('div');
  _layer.id = 'canvasGizmoLayer';
  _layer.className = 'canvas-gizmo-layer';
  _layer.style.display = 'none';
  _cw.appendChild(_layer);

  window.addEventListener('resize', () => { if (_enabled) _render(); });
  window.addEventListener('zgl:layoutchange', () => { if (_enabled) setTimeout(_render, 80); });
  if (state.editor) state.editor.onDidChangeModelContent(() => { if (_enabled) { clearTimeout(_deb); _deb = setTimeout(_render, 250); } });
}

// ── XYZ Axis Gizmo ───────────────────────────────────────────────────────────

let _axisCb = null;
let _axisEl = null;

/** Set callback for axis snap clicks: fn('x'|'y'|'z') */
export function setAxisSnapCallback(fn) { _axisCb = fn; }

/**
 * Ajoute un petit indicateur XYZ dans le coin bas-droit du viewport.
 * Chaque axe est cliquable pour snapper la caméra sur cette vue.
 */
export function initAxisGizmo() {
  const cw = _cw || document.getElementById('cwrap');
  if (!cw || document.getElementById('axisGizmo')) return;

  if (!document.getElementById('axisGizmoStyle')) {
    const s = document.createElement('style');
    s.id = 'axisGizmoStyle';
    s.textContent = `
      #axisGizmo {
        position: absolute; bottom: 8px; right: 8px; z-index: 50;
        background: rgba(0,0,0,0.45); border-radius: 6px; padding: 5px;
        display: flex; flex-direction: column; align-items: center; gap: 3px;
        backdrop-filter: blur(4px); pointer-events: auto;
        user-select: none;
      }
      #axisGizmo canvas { display: block; cursor: default; }
      #axisLabels { display: flex; gap: 6px; }
      .axis-lbl {
        font-size: 10px; font-weight: 700; cursor: pointer; padding: 1px 3px;
        font-family: 'JetBrains Mono', monospace; border-radius: 2px;
        transition: background .1s;
      }
      .axis-lbl:hover { background: rgba(255,255,255,0.15); }
    `;
    document.head.appendChild(s);
  }

  _axisEl = document.createElement('div');
  _axisEl.id = 'axisGizmo';
  _axisEl.innerHTML = `
    <canvas id="axisCanvas" width="56" height="56" title="XYZ Axes"></canvas>
    <div id="axisLabels">
      <span class="axis-lbl" id="axisLblX" style="color:#e06c75" title="Snap to X">X</span>
      <span class="axis-lbl" id="axisLblY" style="color:#98c379" title="Snap to Y (top)">Y</span>
      <span class="axis-lbl" id="axisLblZ" style="color:#61afef" title="Snap to Z (front)">Z</span>
    </div>`;
  cw.appendChild(_axisEl);

  _drawAxisCanvas();

  _axisEl.querySelector('#axisLblX').addEventListener('click', () => _axisCb?.('x'));
  _axisEl.querySelector('#axisLblY').addEventListener('click', () => _axisCb?.('y'));
  _axisEl.querySelector('#axisLblZ').addEventListener('click', () => _axisCb?.('z'));
}

function _drawAxisCanvas() {
  const canvas = document.getElementById('axisCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const cx = 28, cy = 28, L = 20;
  ctx.clearRect(0, 0, 56, 56);

  const axes = [
    { dx: L,       dy: 0,       color: '#e06c75' },  // X  right
    { dx: 0,       dy: -L,      color: '#98c379' },  // Y  up
    { dx: -L*0.6,  dy: L*0.6,   color: '#61afef' },  // Z  lower-left
  ];

  for (const { dx, dy, color } of axes) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + dx, cy + dy);
    ctx.stroke();
    // Arrowhead
    const len = Math.hypot(dx, dy);
    const nx = dx / len, ny = dy / len;
    const ax = cx + dx, ay = cy + dy;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax - nx * 5 + ny * 3, ay - ny * 5 - nx * 3);
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax - nx * 5 - ny * 3, ay - ny * 5 + nx * 3);
    ctx.stroke();
  }

  // Center dot
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();
}
