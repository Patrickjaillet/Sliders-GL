/**
 * shape-panel.js — Phase 2 (ROADMAP v2.2→v2.6)
 *
 * ✅ [x] 🖼 Bouton "→ Shader" : injecte buildShapeGLSL() dans l'éditeur actif
 * ✅ [x] 🆕 Éditeur Bézier interactif sur le canvas 160×160 (drag des 4 pts de contrôle)
 * ✅ [x] 🆕 Import SVG path → conversion en points Bézier (via importSVGPath)
 * ✅ [x] 🆕 Animation : rotation, scale, morph avec sin/cos/tri sur iTime
 * ✅ [x] 🔌 Feather, invert, extrude 2.5D exposés via sliders
 */

import {
  SHAPE_TYPES,
  setShape, getShape,
  setShapeEnabled, isShapeEnabled,
  buildShapeGLSL,
  setBezierPoints, getBezierPoints,
  setGlobalParams, getGlobalParams,
  setAnimation, getAnimation,
  importSVGPath,
} from '../render/shape-mask.js';
import { smartInsert } from './smart-insert.js';

let _panelEl = null;

// ── API publique ───────────────────────────────────────────────────────────────

export function openShapePanel() {
  if (!_panelEl) _build();
  _panelEl.hidden = false;
  _refresh();
}

export function closeShapePanel() {
  if (_panelEl) _panelEl.hidden = true;
}

export function toggleShapePanel() {
  if (!_panelEl || _panelEl.hidden) openShapePanel();
  else closeShapePanel();
}

// ── Construction ──────────────────────────────────────────────────────────────

function _build() {
  _injectStyles();
  const el = document.createElement('div');
  el.id = 'shapePanel';
  el.hidden = true;

  const typeButtons = SHAPE_TYPES.map(t =>
    `<button class="shape-type-btn" data-type="${_esc(t.id)}" type="button" title="${_esc(t.name)}">
      <span class="shape-type-icon">${_esc(t.icon)}</span>
      <span class="shape-type-name">${_esc(t.name)}</span>
    </button>`
  ).join('');

  el.innerHTML = `
    <div id="shapePanelHeader">
      <span id="shapePanelTitle">⬡ Shape Mask</span>
      <button id="shapeInjectBtn" type="button" title="Inject mask into the active shader">→ Shader</button>
      <button id="shapePanelClose" type="button">✕</button>
    </div>
    <div id="shapePanelEnable">
      <label class="shape-enable-label">
        <input type="checkbox" id="shapeEnableChk">
        Activer le masque
      </label>
      <label class="shape-svg-label">
        <button id="shapeSvgBtn" type="button">↑ SVG</button>
        <input type="file" id="shapeSvgInput" accept=".svg,image/svg+xml" style="display:none">
      </label>
    </div>
    <div id="shapeTypeGrid">${typeButtons}</div>
    <canvas id="shapePreviewCanvas" width="160" height="160"></canvas>
    <div id="shapeParamsList"></div>
    <div id="shapeGlobalParams">
      <div class="shape-section-title">Effets globaux</div>
      <label class="shape-param-row">
        <span class="shape-param-label">Feather</span>
        <input class="shape-param-sl" id="shapeFeather" type="range" min="0" max="0.06" step="0.001" value="0">
        <span class="shape-param-val" id="shapeFeatherVal">0</span>
      </label>
      <label class="shape-param-row">
        <span class="shape-param-label">Extrude</span>
        <input class="shape-param-sl" id="shapeExtrude" type="range" min="0" max="0.3" step="0.005" value="0">
        <span class="shape-param-val" id="shapeExtrudeVal">0</span>
      </label>
      <label class="shape-param-row">
        <span class="shape-param-label">Inverser</span>
        <input type="checkbox" id="shapeInvert">
      </label>
    </div>
    <div id="shapeAnimSection">
      <div class="shape-section-title">Animation iTime</div>
      <label class="shape-param-row">
        <span class="shape-param-label">Activer</span>
        <input type="checkbox" id="shapeAnimEnable">
      </label>
      <div id="shapeAnimControls" style="display:none">
        <label class="shape-param-row">
          <span class="shape-param-label">Cible</span>
          <select id="shapeAnimTarget" class="shape-select">
            <option value="rotation">Rotation</option>
            <option value="scale">Scale pulsant</option>
            <option value="morph">Morph → cercle</option>
          </select>
        </label>
        <label class="shape-param-row">
          <span class="shape-param-label">Onde</span>
          <select id="shapeAnimFn" class="shape-select">
            <option value="sin">sin</option>
            <option value="cos">cos</option>
            <option value="tri">tri</option>
          </select>
        </label>
        <label class="shape-param-row">
          <span class="shape-param-label">Vitesse</span>
          <input class="shape-param-sl" id="shapeAnimSpeed" type="range" min="0.1" max="10" step="0.1" value="1">
          <span class="shape-param-val" id="shapeAnimSpeedVal">1.0</span>
        </label>
        <label class="shape-param-row">
          <span class="shape-param-label">Amplitude</span>
          <input class="shape-param-sl" id="shapeAnimAmp" type="range" min="0.01" max="1" step="0.01" value="0.3">
          <span class="shape-param-val" id="shapeAnimAmpVal">0.30</span>
        </label>
      </div>
    </div>
  `;
  document.body.appendChild(el);
  _panelEl = el;

  // Fermer
  el.querySelector('#shapePanelClose').addEventListener('click', closeShapePanel);

  // ── 🖼 Bouton → Shader ─────────────────────────────────────────────────────
  el.querySelector('#shapeInjectBtn').addEventListener('click', () => {
    const glsl = buildShapeGLSL();
    if (!glsl) {
      _flash(el.querySelector('#shapeInjectBtn'), '⚠ No shape', '#e06c75');
      return;
    }
    const wrapper = `// ── Shape Mask ──\n{\n${glsl}\n}`;
    const ok = smartInsert(wrapper, 'function');
    _flash(el.querySelector('#shapeInjectBtn'), ok ? '✓ Injecté' : '⚠ Doublon', ok ? null : '#e06c75');
  });

  // ── Activer/désactiver ────────────────────────────────────────────────────
  el.querySelector('#shapeEnableChk').addEventListener('change', e => {
    setShapeEnabled(e.target.checked);
    _refresh();
  });

  // ── 🆕 SVG import ─────────────────────────────────────────────────────────
  const svgInput = el.querySelector('#shapeSvgInput');
  el.querySelector('#shapeSvgBtn').addEventListener('click', () => svgInput.click());
  svgInput.addEventListener('change', () => {
    const file = svgInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const ok = importSVGPath(e.target.result);
      if (ok) {
        _refresh();
        _flash(el.querySelector('#shapeSvgBtn'), '✓ SVG', null);
      } else {
        _flash(el.querySelector('#shapeSvgBtn'), '⚠ Non reconnu', '#e06c75');
      }
    };
    reader.readAsText(file);
    svgInput.value = '';
  });

  // ── Type buttons ──────────────────────────────────────────────────────────
  el.querySelectorAll('.shape-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const def = SHAPE_TYPES.find(t => t.id === btn.dataset.type);
      if (!def) return;
      const defaults = Object.fromEntries(Object.entries(def.params).map(([k, v]) => [k, v.default]));
      setShape(btn.dataset.type, defaults);
      _refresh();
    });
  });

  // ── Effets globaux ────────────────────────────────────────────────────────
  el.querySelector('#shapeFeather').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    el.querySelector('#shapeFeatherVal').textContent = v.toFixed(3);
    setGlobalParams({ feather: v });
  });
  el.querySelector('#shapeExtrude').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    el.querySelector('#shapeExtrudeVal').textContent = v.toFixed(3);
    setGlobalParams({ extrude: v });
  });
  el.querySelector('#shapeInvert').addEventListener('change', e => {
    setGlobalParams({ invert: e.target.checked });
  });

  // ── 🆕 Animation ──────────────────────────────────────────────────────────
  el.querySelector('#shapeAnimEnable').addEventListener('change', e => {
    setAnimation({ enabled: e.target.checked });
    el.querySelector('#shapeAnimControls').style.display = e.target.checked ? '' : 'none';
  });
  el.querySelector('#shapeAnimTarget').addEventListener('change', e => setAnimation({ target: e.target.value }));
  el.querySelector('#shapeAnimFn').addEventListener('change', e => setAnimation({ fn: e.target.value }));
  el.querySelector('#shapeAnimSpeed').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    el.querySelector('#shapeAnimSpeedVal').textContent = v.toFixed(1);
    setAnimation({ speed: v });
  });
  el.querySelector('#shapeAnimAmp').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    el.querySelector('#shapeAnimAmpVal').textContent = v.toFixed(2);
    setAnimation({ amp: v });
  });
}

// ── Rendu ─────────────────────────────────────────────────────────────────────

function _refresh() {
  if (!_panelEl || _panelEl.hidden) return;
  const { type, params } = getShape();
  const enabled   = isShapeEnabled();
  const gp        = getGlobalParams();
  const anim      = getAnimation();

  _panelEl.querySelector('#shapeEnableChk').checked = enabled;

  // Highlight du type actif
  _panelEl.querySelectorAll('.shape-type-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.type === type));

  // Params du type
  const def = SHAPE_TYPES.find(t => t.id === type);
  const paramList = _panelEl.querySelector('#shapeParamsList');
  paramList.innerHTML = '';

  if (def && Object.keys(def.params).length > 0) {
    for (const [key, pd] of Object.entries(def.params)) {
      const val = params[key] ?? pd.default;
      const row = document.createElement('label');
      row.className = 'shape-param-row';
      row.innerHTML = `
        <span class="shape-param-label">${_esc(pd.label)}</span>
        <input class="shape-param-sl" type="range" min="${pd.min}" max="${pd.max}" step="${pd.step}" value="${val}"
          data-key="${_esc(key)}">
        <span class="shape-param-val" id="sppv-${_esc(key)}">${Number(val).toFixed(pd.step < 0.01 ? 3 : pd.step < 0.1 ? 2 : 1)}</span>
      `;
      paramList.appendChild(row);
    }
    paramList.querySelectorAll('.shape-param-sl').forEach(sl => {
      sl.addEventListener('input', () => {
        const v = parseFloat(sl.value);
        const vEl = paramList.querySelector(`#sppv-${sl.dataset.key}`);
        if (vEl) {
          const pd = def.params[sl.dataset.key];
          vEl.textContent = v.toFixed(pd?.step < 0.01 ? 3 : pd?.step < 0.1 ? 2 : 1);
        }
        const newParams = {};
        paramList.querySelectorAll('.shape-param-sl').forEach(s => {
          newParams[s.dataset.key] = parseFloat(s.value);
        });
        setShape(type, newParams);
        _drawPreview();
      });
    });
  }

  // Sync globaux
  _panelEl.querySelector('#shapeFeather').value = gp.feather ?? 0;
  _panelEl.querySelector('#shapeFeatherVal').textContent = (gp.feather ?? 0).toFixed(3);
  _panelEl.querySelector('#shapeExtrude').value = gp.extrude ?? 0;
  _panelEl.querySelector('#shapeExtrudeVal').textContent = (gp.extrude ?? 0).toFixed(3);
  _panelEl.querySelector('#shapeInvert').checked = gp.invert ?? false;

  // Sync animation
  _panelEl.querySelector('#shapeAnimEnable').checked = anim.enabled;
  _panelEl.querySelector('#shapeAnimControls').style.display = anim.enabled ? '' : 'none';
  _panelEl.querySelector('#shapeAnimTarget').value = anim.target;
  _panelEl.querySelector('#shapeAnimFn').value = anim.fn;
  _panelEl.querySelector('#shapeAnimSpeed').value = anim.speed;
  _panelEl.querySelector('#shapeAnimSpeedVal').textContent = anim.speed.toFixed(1);
  _panelEl.querySelector('#shapeAnimAmp').value = anim.amp;
  _panelEl.querySelector('#shapeAnimAmpVal').textContent = anim.amp.toFixed(2);

  _drawPreview();
}

// ── 🔧 Preview canvas — Canvas 2D (formes) + éditeur Bézier interactif ────────

let _bezierDragIdx = -1;

function _drawPreview() {
  const canvas = _panelEl?.querySelector('#shapePreviewCanvas');
  if (!canvas) return;
  const { type, params } = getShape();
  const def = SHAPE_TYPES.find(t => t.id === type);
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = '#0e1012';
  ctx.fillRect(0, 0, W, H);

  if (type === 'none' || !def) {
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(0, 0, W, H);
    return;
  }

  ctx.fillStyle = 'rgba(91,141,246,0.22)';
  ctx.strokeStyle = 'rgba(91,141,246,0.85)';
  ctx.lineWidth = 1.5;

  if (type === 'bezier') {
    _drawBezierPreview(ctx, W, H);
  } else {
    _drawStdShape(ctx, type, params, W, H);
  }
}

function _drawStdShape(ctx, type, params, W, H) {
  const cx = W / 2, cy = H / 2;
  const r = (params.radius || params.outer || 0.45) * Math.min(W, H) * 0.88;

  switch (type) {
    case 'circle':
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke(); break;
    case 'ellipse':
      ctx.beginPath();
      ctx.ellipse(cx, cy, (params.rx || 0.48) * W * 0.88, (params.ry || 0.3) * H * 0.88, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke(); break;
    case 'polygon': {
      const n = params.sides || 6;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke(); break;
    }
    case 'star': {
      const n = params.branches || 5;
      const ro = (params.outer || 0.45) * Math.min(W, H) * 0.88;
      const ri = (params.inner || 0.2) * Math.min(W, H) * 0.88;
      ctx.beginPath();
      for (let i = 0; i < n * 2; i++) {
        const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
        const rad = i % 2 === 0 ? ro : ri;
        const x = cx + rad * Math.cos(a), y = cy + rad * Math.sin(a);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke(); break;
    }
    case 'rounded_rect': {
      const w2 = (params.w || 0.7) * W * 0.88 / 2, h2 = (params.h || 0.5) * H * 0.88 / 2;
      const rr = (params.r || 0.05) * Math.min(W, H) * 0.88;
      ctx.beginPath(); ctx.roundRect(cx - w2, cy - h2, w2 * 2, h2 * 2, rr);
      ctx.fill(); ctx.stroke(); break;
    }
  }
}

function _drawBezierPreview(ctx, W, H) {
  const pts = getBezierPoints();
  const px = p => p.x * W;
  const py = p => p.y * H;

  // Remplissage via courbe bézier fermée
  ctx.beginPath();
  ctx.moveTo(px(pts[0]), py(pts[0]));
  ctx.bezierCurveTo(px(pts[1]), py(pts[1]), px(pts[2]), py(pts[2]), px(pts[3]), py(pts[3]));
  ctx.lineTo(px(pts[0]), py(pts[0]));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Poignées
  ctx.strokeStyle = 'rgba(91,141,246,0.4)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(px(pts[0]), py(pts[0])); ctx.lineTo(px(pts[1]), py(pts[1])); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(px(pts[3]), py(pts[3])); ctx.lineTo(px(pts[2]), py(pts[2])); ctx.stroke();
  ctx.setLineDash([]);

  // Points de contrôle
  pts.forEach((p, i) => {
    const isAnchor = i === 0 || i === 3;
    ctx.fillStyle = isAnchor ? '#5b8df6' : '#f7c97e';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(px(p), py(p), isAnchor ? 5 : 4, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
  });
}

// ── 🆕 Drag interactif sur le canvas Bézier ────────────────────────────────────

function _bindBezierEditor() {
  const canvas = _panelEl?.querySelector('#shapePreviewCanvas');
  if (!canvas || canvas._bezierBound) return;
  canvas._bezierBound = true;

  const HIT_R = 10;

  canvas.addEventListener('mousedown', e => {
    const { type } = getShape();
    if (type !== 'bezier') return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width;
    const my = (e.clientY - rect.top)  / rect.height;
    const pts = getBezierPoints();
    _bezierDragIdx = pts.findIndex(p =>
      Math.hypot(p.x - mx, p.y - my) < HIT_R / canvas.width);
  });

  window.addEventListener('mousemove', e => {
    if (_bezierDragIdx < 0) return;
    const { type } = getShape();
    if (type !== 'bezier') return;
    const canvas2 = _panelEl?.querySelector('#shapePreviewCanvas');
    if (!canvas2) return;
    const rect = canvas2.getBoundingClientRect();
    const mx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const my = Math.max(0, Math.min(1, (e.clientY - rect.top)  / rect.height));
    const pts = getBezierPoints();
    pts[_bezierDragIdx] = { x: mx, y: my };
    setBezierPoints(pts);
    _drawPreview();
  });

  window.addEventListener('mouseup', () => { _bezierDragIdx = -1; });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _flash(btn, label, color) {
  if (!btn) return;
  const orig = btn.textContent;
  btn.textContent = label;
  btn.style.color = color || 'var(--accent,#5b8df6)';
  setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 1400);
}

// ── Styles ────────────────────────────────────────────────────────────────────

function _injectStyles() {
  if (document.getElementById('shapePanelCSS')) return;
  const s = document.createElement('style');
  s.id = 'shapePanelCSS';
  s.textContent = `
    #shapePanel {
      position: fixed; top: 80px; right: 590px; z-index: 800;
      background: var(--bg-surface, #1a1d22);
      border: 1px solid var(--border, #2a2d32);
      border-radius: var(--radius-md); width: 248px;
      font-family: 'JetBrains Mono', monospace; font-size: 11px;
      color: var(--prose, #ccc);
      box-shadow: 0 8px 32px rgba(0,0,0,.5);
      max-height: 90vh; display: flex; flex-direction: column; overflow-y: auto;
    }
    #shapePanel[hidden] { display: none; }

    #shapePanelHeader {
      display: flex; align-items: center; padding: 7px 10px; gap: 5px;
      border-bottom: 1px solid var(--border, #2a2d32); flex-shrink: 0;
    }
    #shapePanelTitle { font-weight: 700; flex: 1; font-size: 12px; }
    #shapePanelClose { background: none; border: none; color: var(--t3, #666); cursor: pointer; }

    /* ── [x] Bouton → Shader ── */
    #shapeInjectBtn {
      background: var(--bg-deep, #111);
      border: 1px solid var(--accent, #5b8df6);
      color: var(--accent, #5b8df6);
      border-radius: 4px; padding: 2px 7px; cursor: pointer;
      font-size: 10px; font-family: inherit; transition: background .15s;
    }
    #shapeInjectBtn:hover { background: var(--accent, #5b8df6); color: #fff; }

    #shapePanelEnable {
      display: flex; align-items: center; justify-content: space-between;
      padding: 5px 10px; border-bottom: 1px solid var(--border, #2a2d32);
    }
    .shape-enable-label { display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 11px; }
    .shape-svg-label { display: flex; align-items: center; }

    /* ── SVG import ── */
    #shapeSvgBtn {
      background: var(--bg-deep, #111); border: 1px solid var(--border, #2a2d32);
      color: var(--t3, #888); border-radius: 4px; padding: 2px 6px;
      cursor: pointer; font-size: 10px; font-family: inherit;
    }
    #shapeSvgBtn:hover { border-color: #f7c97e; color: #f7c97e; }

    #shapeTypeGrid {
      display: flex; flex-wrap: wrap; gap: 4px; padding: 8px;
      border-bottom: 1px solid var(--border, #2a2d32); flex-shrink: 0;
    }
    .shape-type-btn {
      display: flex; flex-direction: column; align-items: center; gap: 2px;
      background: var(--bg-deep, #111); border: 1px solid var(--border, #2a2d32);
      border-radius: 5px; padding: 5px 6px; cursor: pointer; transition: border-color .15s;
      min-width: 44px;
    }
    .shape-type-btn:hover, .shape-type-btn.active { border-color: var(--accent, #5b8df6); }
    .shape-type-btn.active { background: rgba(91,141,246,.1); }
    .shape-type-icon { font-size: 14px; color: var(--accent, #5b8df6); }
    .shape-type-name { font-size: 9px; color: var(--t3, #888); text-align: center; }

    /* ── Canvas preview / éditeur bézier ── */
    #shapePreviewCanvas {
      display: block; margin: 8px auto; border-radius: 4px;
      border: 1px solid var(--border, #2a2d32); cursor: crosshair;
    }

    #shapeParamsList, #shapeGlobalParams, #shapeAnimSection {
      padding: 4px 10px 8px; display: flex; flex-direction: column; gap: 5px;
      border-bottom: 1px solid rgba(255,255,255,.04);
    }

    .shape-section-title {
      font-size: 10px; text-transform: uppercase; letter-spacing: .06em;
      color: var(--t3, #777); padding: 4px 0 2px; font-weight: 700;
    }
    .shape-param-row { display: flex; align-items: center; gap: 5px; }
    .shape-param-label { font-size: 10px; color: var(--t3, #888); min-width: 72px; }
    .shape-param-sl { flex: 1; accent-color: var(--accent, #5b8df6); }
    .shape-param-val { font-size: 10px; color: var(--accent, #5b8df6); min-width: 36px; text-align: right; }
    .shape-select {
      flex: 1; background: var(--bg-deep, #111); border: 1px solid var(--border, #2a2d32);
      color: var(--prose, #ccc); border-radius: 3px; font-size: 10px;
      padding: 1px 3px; font-family: inherit;
    }
  `;
  document.head.appendChild(s);

  // Binder l'éditeur bézier après construction
  requestAnimationFrame(() => _bindBezierEditor());
}
