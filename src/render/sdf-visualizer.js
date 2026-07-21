
// ── Phase 15.3 — SDF Visualizer (iso-distance mode) ──────────────────────────

import { state } from '../core/state.js';

// ─── CSS ──────────────────────────────────────────────────────────────────────

const CSS = `
#zgl-sdfviz-panel {
  position: fixed; top: 60px; left: 16px; width: 380px; z-index: 9300;
  background: var(--bg1,#1a1a1e); border: 1px solid var(--bdr,#333);
  border-radius: 8px; font-family: var(--font-mono,monospace); font-size: 12px;
  color: var(--fg,#e0e0e0); box-shadow: 0 8px 32px rgba(0,0,0,.65);
  user-select: none; display: none;
}
#zgl-sdfviz-panel.open { display: block; }
#zgl-sdfviz-panel header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px; border-bottom: 1px solid var(--bdr,#333); cursor: move;
}
#zgl-sdfviz-panel header h3 { margin:0; font-size:13px; color:var(--ac2,#f7c97e); }
#zgl-sdfviz-panel .sv-body { padding:10px 12px; display:flex; flex-direction:column; gap:10px; }
#zgl-sdfviz-panel .sv-canvas-wrap {
  position:relative; border:1px solid var(--bdr,#333); border-radius:6px; overflow:hidden;
  background:#111;
}
#zgl-sdfviz-canvas { display:block; width:100%; image-rendering:pixelated; }
#zgl-sdfviz-panel .sv-crosshair {
  position:absolute; pointer-events:none; display:none;
  border:1px dashed rgba(255,255,255,.4); border-radius:50%;
  width:14px; height:14px; transform:translate(-50%,-50%);
}
#zgl-sdfviz-panel .sv-info {
  position:absolute; bottom:6px; left:8px; font-size:10px;
  color:rgba(255,255,255,.7); pointer-events:none;
  text-shadow:0 1px 3px #000;
}
#zgl-sdfviz-panel .sv-row { display:flex; align-items:center; gap:8px; }
#zgl-sdfviz-panel .sv-row label { flex:0 0 80px; font-size:11px; color:var(--fg2,#aaa); }
#zgl-sdfviz-panel .sv-row input[type=range] { flex:1; accent-color:var(--ac2,#f7c97e); }
#zgl-sdfviz-panel .sv-val { flex:0 0 44px; text-align:right; color:var(--ac3,#7ef7b8); font-size:11px; }
#zgl-sdfviz-panel .sv-mode-btns { display:flex; gap:4px; flex-wrap:wrap; }
#zgl-sdfviz-panel .sv-mode-btn {
  flex:1; min-width:70px; padding:4px 0; border:1px solid var(--bdr,#333);
  border-radius:4px; background:var(--bg2,#252529); color:var(--fg,#e0e0e0);
  cursor:pointer; font-size:10px; transition:background .15s; font-family:inherit;
}
#zgl-sdfviz-panel .sv-mode-btn:hover { background:var(--bg3,#333); }
#zgl-sdfviz-panel .sv-mode-btn.active { background:#2a1f0a; border-color:var(--ac2,#f7c97e); color:var(--ac2,#f7c97e); }
#zgl-sdfviz-panel .sv-legend {
  display:flex; align-items:center; gap:4px; font-size:10px; color:var(--fg2,#888);
}
#zgl-sdfviz-panel .sv-legend canvas { width:100%; height:12px; border-radius:2px; border:1px solid var(--bdr,#333); }
#zgl-sdfviz-panel .sv-legend-labels { display:flex; justify-content:space-between; font-size:10px; color:var(--fg2,#888); }
#zgl-sdfviz-panel .sv-btns { display:flex; gap:6px; }
#zgl-sdfviz-panel .sv-btn {
  flex:1; padding:5px 0; border:1px solid var(--bdr,#333); border-radius:4px;
  background:var(--bg2,#252529); color:var(--fg,#e0e0e0); cursor:pointer;
  font-size:11px; transition:background .15s; font-family:inherit;
}
#zgl-sdfviz-panel .sv-btn:hover { background:var(--bg3,#333); }
#zgl-sdfviz-panel .sv-close {
  background:none; border:none; color:var(--fg2,#aaa); cursor:pointer;
  font-size:16px; line-height:1; padding:0 2px;
}
#zgl-sdfviz-panel .sv-close:hover { color:var(--fg,#e0e0e0); }
#zgl-sdfviz-panel .sv-section-title { font-size:10px; text-transform:uppercase; letter-spacing:.08em; color:var(--fg2,#888); }
`;

// ─── Visualization modes ──────────────────────────────────────────────────────

const MODES = {
  iso:    { label: 'Iso-distance', title: 'Rings at equal SDF distance intervals' },
  field:  { label: 'Field',        title: 'Continuous heatmap: inside=blue, outside=orange' },
  normal: { label: 'Normals',      title: 'Estimated surface normals as RGB' },
  steps:  { label: 'Step count',   title: 'Ray march iteration count (cost heatmap)' },
};

// ─── CPU SDF evaluator (parses simple expressions from shader) ────────────────

function evalSimpleSdf(src, px, py) {
  try {
    const p = `vec3(${px},${py},0.0)`;
    if (/sdSphere|length\(p\)/.test(src)) return Math.sqrt(px*px + py*py) - 0.5;
    if (/sdBox/.test(src)) {
      const dx = Math.abs(px) - 0.5, dy = Math.abs(py) - 0.5;
      return Math.min(Math.max(dx, dy), 0) + Math.sqrt(Math.max(dx,0)**2 + Math.max(dy,0)**2);
    }
    return Math.sqrt(px*px + py*py) - 0.5;
  } catch { return Math.sqrt(px*px + py*py) - 0.5; }
}

// ─── Palette functions ────────────────────────────────────────────────────────

function isoColor(d, scale, isoLines) {
  const inside = d < 0;
  const t = (Math.sin(d * isoLines * Math.PI * 2) * 0.5 + 0.5);
  if (inside) {
    return [30  + t * 50,  80 + t * 100, 200 + t * 55];
  } else {
    return [200 + t * 55,  90 + t * 60,  20  + t * 20];
  }
}

function fieldColor(d, scale) {
  const n = Math.tanh(d * scale);
  if (n < 0) {
    const t = -n;
    return [Math.round(20 + t*40), Math.round(60 + t*120), Math.round(180 + t*75)];
  } else {
    const t = n;
    return [Math.round(200 + t*55), Math.round(80 + t*40), Math.round(10 + t*20)];
  }
}

function normalColor(src, px, py, eps) {
  const d  = evalSimpleSdf(src, px, py);
  const dx = evalSimpleSdf(src, px + eps, py) - evalSimpleSdf(src, px - eps, py);
  const dy = evalSimpleSdf(src, px, py + eps) - evalSimpleSdf(src, px, py - eps);
  const len = Math.sqrt(dx*dx + dy*dy) || 1;
  return [
    Math.round((dx/len * 0.5 + 0.5) * 255),
    Math.round((dy/len * 0.5 + 0.5) * 255),
    200,
  ];
}

function stepColor(steps, maxSteps) {
  const t = steps / maxSteps;
  return [
    Math.round(t < 0.5 ? t*2*50 : 50 + (t-0.5)*2*205),
    Math.round(t < 0.5 ? 50 + t*2*150 : 200 - (t-0.5)*2*150),
    Math.round(t < 0.5 ? 200 - t*2*150 : 50),
  ];
}

function marchSteps(src, px, py, maxSteps, surfDist) {
  let t = 0;
  for (let i = 0; i < maxSteps; i++) {
    const d = evalSimpleSdf(src, px + Math.cos(0)*t, py + Math.sin(0)*t);
    if (Math.abs(d) < surfDist) return i;
    t += Math.max(Math.abs(d), 0.001);
    if (t > 4) return i;
  }
  return maxSteps;
}

// ─── Panel ─────────────────────────────────────────────────────────────────────

let _open    = false;
let _panel   = null;
let _canvas  = null;
let _ctx     = null;
let _mode    = 'iso';
let _scale   = 3.0;
let _isoLines = 8;
let _currentSrc = '';
let _raf     = null;

function _injectCSS() {
  if (document.getElementById('zgl-sdfviz-css')) return;
  const s = document.createElement('style');
  s.id = 'zgl-sdfviz-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

function _render() {
  if (!_canvas || !_ctx || !_open) return;
  const W = _canvas.width, H = _canvas.height;
  const img = _ctx.createImageData(W, H);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = ((x / W) * 2 - 1) * (2 / _scale);
      const py = ((y / H) * 2 - 1) * -(2 / _scale);
      const d  = evalSimpleSdf(_currentSrc, px, py);
      let r, g, b;

      if (_mode === 'iso') {
        [r, g, b] = isoColor(d, _scale, _isoLines);
      } else if (_mode === 'field') {
        [r, g, b] = fieldColor(d, _scale);
      } else if (_mode === 'normal') {
        [r, g, b] = normalColor(_currentSrc, px, py, 0.01 / _scale);
      } else {
        const steps = marchSteps(_currentSrc, px, py, 32, 0.01);
        [r, g, b] = stepColor(steps, 32);
      }

      const i = (y * W + x) * 4;
      img.data[i]   = Math.max(0, Math.min(255, Math.round(r)));
      img.data[i+1] = Math.max(0, Math.min(255, Math.round(g)));
      img.data[i+2] = Math.max(0, Math.min(255, Math.round(b)));
      img.data[i+3] = 255;
    }
  }
  _ctx.putImageData(img, 0, 0);

  // 🆕 Mode normals : afficher des flèches de direction sur le canvas
  if (_mode === 'normal') {
    _drawNormalArrows(W, H);
  }
}

/**
 * 🆕 Superpose un réseau de flèches montrant les normales SDF estimées.
 * Les flèches sont dessinées sur le canvas 2D après le putImageData.
 */
function _drawNormalArrows(W, H) {
  const GRID   = 20;   // espacement en pixels entre les flèches
  const LEN    = 7;    // longueur des flèches
  const EPS    = 0.02 / _scale;

  _ctx.save();
  _ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  _ctx.lineWidth   = 1;

  for (let sy = GRID / 2; sy < H; sy += GRID) {
    for (let sx = GRID / 2; sx < W; sx += GRID) {
      const px = ((sx / W) * 2 - 1) * (2 / _scale);
      const py = ((sy / H) * 2 - 1) * -(2 / _scale);

      // Gradient numérique de la SDF ≈ normale 2D
      const dxp = evalSimpleSdf(_currentSrc, px + EPS, py);
      const dxm = evalSimpleSdf(_currentSrc, px - EPS, py);
      const dyp = evalSimpleSdf(_currentSrc, px, py + EPS);
      const dym = evalSimpleSdf(_currentSrc, px, py - EPS);
      let nx = dxp - dxm, ny = -(dyp - dym); // flip y pour repère canvas
      const len = Math.sqrt(nx*nx + ny*ny) || 1;
      nx /= len; ny /= len;

      // Dessiner la flèche
      const ex = sx + nx * LEN, ey = sy + ny * LEN;
      _ctx.beginPath();
      _ctx.moveTo(sx, sy);
      _ctx.lineTo(ex, ey);
      _ctx.stroke();

      // Tête de flèche
      const headLen = 3, headAngle = 0.5;
      const ang = Math.atan2(ey - sy, ex - sx);
      _ctx.beginPath();
      _ctx.moveTo(ex, ey);
      _ctx.lineTo(ex - headLen * Math.cos(ang - headAngle), ey - headLen * Math.sin(ang - headAngle));
      _ctx.moveTo(ex, ey);
      _ctx.lineTo(ex - headLen * Math.cos(ang + headAngle), ey - headLen * Math.sin(ang + headAngle));
      _ctx.stroke();
    }
  }
  _ctx.restore();
}

function _buildLegend(legendCanvas) {
  const ctx = legendCanvas.getContext('2d');
  const W = legendCanvas.width;
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0,   '#1e5ab4');
  grad.addColorStop(0.5, '#111');
  grad.addColorStop(1,   '#c85a14');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, legendCanvas.height);
}

export function initSdfVisualizer() {
  _injectCSS();

  const panel = document.createElement('div');
  panel.id = 'zgl-sdfviz-panel';
  _panel = panel;

  panel.innerHTML = `
    <header>
      <h3>🔭 SDF Visualizer</h3>
      <button class="sv-close" id="zgl-sdfviz-close">✕</button>
    </header>
    <div class="sv-body">
      <div>
        <div class="sv-section-title">Visualization mode</div>
        <div class="sv-mode-btns" id="zgl-sdfviz-modes">
          ${Object.entries(MODES).map(([k, v]) =>
            `<button class="sv-mode-btn${k === _mode ? ' active' : ''}" data-mode="${k}" title="${v.title}">${v.label}</button>`
          ).join('')}
        </div>
      </div>

      <div class="sv-canvas-wrap">
        <canvas id="zgl-sdfviz-canvas" width="356" height="200"></canvas>
        <div class="sv-crosshair" id="zgl-sdfviz-cross"></div>
        <div class="sv-info" id="zgl-sdfviz-info"></div>
      </div>

      <div>
        <div class="sv-legend">
          <canvas id="zgl-sdfviz-legend" width="356" height="12"></canvas>
        </div>
        <div class="sv-legend-labels"><span>inside (d&lt;0)</span><span>surface</span><span>outside (d&gt;0)</span></div>
      </div>

      <div>
        <div class="sv-section-title">Settings</div>
        <div class="sv-row">
          <label>Zoom</label>
          <input type="range" id="zgl-sdfviz-scale" min="0.5" max="10" step="0.1" value="${_scale}">
          <span class="sv-val" id="zgl-sdfviz-scale-val">${_scale.toFixed(1)}</span>
        </div>
        <div class="sv-row" id="zgl-sdfviz-isolines-row">
          <label>Iso lines</label>
          <input type="range" id="zgl-sdfviz-iso" min="1" max="30" step="1" value="${_isoLines}">
          <span class="sv-val" id="zgl-sdfviz-iso-val">${_isoLines}</span>
        </div>
      </div>

      <div class="sv-btns">
        <button class="sv-btn" id="zgl-sdfviz-export">Export PNG</button>
        <button class="sv-btn" id="zgl-sdfviz-overlay">Overlay on VP</button>
      </div>
    </div>
  `;

  document.body.appendChild(panel);

  _canvas = panel.querySelector('#zgl-sdfviz-canvas');
  _ctx    = _canvas.getContext('2d');

  _buildLegend(panel.querySelector('#zgl-sdfviz-legend'));

  panel.querySelector('#zgl-sdfviz-close').addEventListener('click', () => close());

  panel.querySelectorAll('.sv-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      panel.querySelectorAll('.sv-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _mode = btn.dataset.mode;
      const isoRow = panel.querySelector('#zgl-sdfviz-isolines-row');
      isoRow.style.display = _mode === 'iso' ? '' : 'none';
      scheduleRender();
    });
  });

  panel.querySelector('#zgl-sdfviz-scale').addEventListener('input', e => {
    _scale = parseFloat(e.target.value);
    panel.querySelector('#zgl-sdfviz-scale-val').textContent = _scale.toFixed(1);
    scheduleRender();
  });

  panel.querySelector('#zgl-sdfviz-iso').addEventListener('input', e => {
    _isoLines = parseInt(e.target.value);
    panel.querySelector('#zgl-sdfviz-iso-val').textContent = String(_isoLines);
    scheduleRender();
  });

  panel.querySelector('#zgl-sdfviz-export').addEventListener('click', () => {
    _render();
    const a = document.createElement('a');
    a.href = _canvas.toDataURL('image/png');
    a.download = 'sdf-viz.png';
    a.click();
  });

  panel.querySelector('#zgl-sdfviz-overlay').addEventListener('click', () => {
    _toggleOverlay();
  });

  _canvas.addEventListener('mousemove', e => {
    const rect = _canvas.getBoundingClientRect();
    const xr   = (e.clientX - rect.left) / rect.width;
    const yr   = (e.clientY - rect.top)  / rect.height;
    const px   = (xr * 2 - 1) * (2 / _scale);
    const py   = (yr * 2 - 1) * -(2 / _scale);
    const d    = evalSimpleSdf(_currentSrc, px, py);
    panel.querySelector('#zgl-sdfviz-info').textContent =
      `p=(${px.toFixed(3)}, ${py.toFixed(3)})  d=${d.toFixed(4)}`;
  });

  _makeDraggable(panel, panel.querySelector('header'));

  return { open, close, toggle, updateSrc, isOpen: () => _open };
}

export function updateSrc(src) {
  _currentSrc = src;
  if (_open) scheduleRender();
}

function scheduleRender() {
  if (_raf) cancelAnimationFrame(_raf);
  _raf = requestAnimationFrame(() => { _render(); _raf = null; });
}

let _overlay = null;
function _toggleOverlay() {
  const vp = document.querySelector('#glCanvas') || document.querySelector('canvas#main') || document.querySelector('canvas');
  if (!_canvas || !vp) return;
  if (_overlay) {
    _overlay.remove();
    _overlay = null;
    return;
  }
  _render();
  const rect = vp.getBoundingClientRect();
  _overlay = document.createElement('canvas');
  _overlay.width  = _canvas.width;
  _overlay.height = _canvas.height;
  _overlay.style.cssText = `position:fixed;top:${rect.top}px;left:${rect.left}px;width:${rect.width}px;height:${rect.height}px;pointer-events:none;z-index:8000;opacity:0.7;mix-blend-mode:screen;`;
  const ctx = _overlay.getContext('2d');
  ctx.drawImage(_canvas, 0, 0);
  document.body.appendChild(_overlay);
}

function open() {
  if (!_panel) return;
  _panel.classList.add('open');
  _open = true;
  scheduleRender();
}

function close() {
  if (!_panel) return;
  _panel.classList.remove('open');
  _open = false;
  if (_overlay) { _overlay.remove(); _overlay = null; }
}

function toggle() { _open ? close() : open(); }

function _makeDraggable(el, handle) {
  let ox=0, oy=0, sx=0, sy=0;
  handle.addEventListener('mousedown', e => {
    e.preventDefault();
    sx = e.clientX; sy = e.clientY;
    const r = el.getBoundingClientRect();
    ox = r.left; oy = r.top;
    const move = e => { el.style.left=`${ox+e.clientX-sx}px`; el.style.top=`${oy+e.clientY-sy}px`; el.style.right='auto'; };
    const up = () => { removeEventListener('mousemove', move); removeEventListener('mouseup', up); };
    addEventListener('mousemove', move); addEventListener('mouseup', up);
  });
}
