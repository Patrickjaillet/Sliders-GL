/**
 * style-panel.js — Phase 1 / ui (ROADMAP v2.2→v2.6)
 *
 * Panneau de gestion des calques de style visuels.
 *
 * ✅ [x] 🖼  Bouton "→ Injecter en GLSL" — insère le pipeline dans Monaco via smartInsert
 * ✅ [x] 🔧  Preview live 48×48 WebGL par calque (remplace l'aperçu CSS gradient)
 * ✅ [x] 🖼  Drag & drop pour réordonner les calques (branche sur moveStyleLayer existant)
 * ✅ [x] 🆕  Paramètres animés : bind opacity/param à sin/cos/tri via le panneau style
 *
 * API publique :
 *   openStylePanel()
 *   closeStylePanel()
 *   toggleStylePanel()
 */

import {
  STYLE_DEFINITIONS,
  addStyleLayer, removeStyleLayer, moveStyleLayer,
  setStyleLayerParam, setStyleLayerEnabled, setStyleLayerOpacity,
  setStyleLayerBlendMode, setStyleLayerAnimation,
  getStyleLayers, buildStyleGLSL,
} from '../render/style-layers.js';

import { smartInsert } from './smart-insert.js';

let _panelEl   = null;
let _glPreviews = {};   // id → { gl, canvas, prog, fbo, tex } — pool WebGL 48×48

// ─────────────────────────────────────────────────────────────────────────────
// API publique
// ─────────────────────────────────────────────────────────────────────────────

export function openStylePanel() {
  if (!_panelEl) _build();
  _panelEl.hidden = false;
  _refresh();
}

export function closeStylePanel() {
  if (_panelEl) _panelEl.hidden = true;
}

export function toggleStylePanel() {
  if (!_panelEl || _panelEl.hidden) openStylePanel();
  else closeStylePanel();
}

// ─────────────────────────────────────────────────────────────────────────────
// Construction du panneau
// ─────────────────────────────────────────────────────────────────────────────

function _build() {
  _injectStyles();
  const el = document.createElement('div');
  el.id = 'stylePanel';
  el.hidden = true;

  const typeCards = STYLE_DEFINITIONS.map(d => `
    <div class="sty-def-card" data-type="${_esc(d.id)}" title="${_esc(d.desc)}">
      <span class="sty-def-icon">${_esc(d.icon)}</span>
      <span class="sty-def-name">${_esc(d.name)}</span>
    </div>`).join('');

  el.innerHTML = `
    <div id="styHeader">
      <span id="styTitle">◈ Style Layers</span>
      <button id="styInjectGLSL" type="button" title="Inject style pipeline into the GLSL editor">→ GLSL</button>
      <button id="styClose" type="button">✕</button>
    </div>
    <div id="styDefGrid">${typeCards}</div>
    <div id="styLayerList"></div>
  `;
  document.body.appendChild(el);
  _panelEl = el;

  // Fermer
  el.querySelector('#styClose').addEventListener('click', closeStylePanel);

  // Ajouter un calque au clic sur une card de définition
  el.querySelectorAll('.sty-def-card').forEach(card => {
    card.addEventListener('click', () => {
      addStyleLayer(card.dataset.type);
      _refresh();
    });
  });

  // ── [x] 🖼 Bouton "→ Injecter en GLSL" ───────────────────────────────────
  el.querySelector('#styInjectGLSL').addEventListener('click', () => {
    const glsl = buildStyleGLSL();
    const inserted = smartInsert(glsl, 'function');
    if (inserted) {
      _flashBtn(el.querySelector('#styInjectGLSL'), '✓ Injected');
    } else {
      _flashBtn(el.querySelector('#styInjectGLSL'), '⚠ Duplicate');
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Rendu de la liste des calques
// ─────────────────────────────────────────────────────────────────────────────

function _refresh() {
  if (!_panelEl || _panelEl.hidden) return;
  const list = _panelEl.querySelector('#styLayerList');
  if (!list) return;
  list.innerHTML = '';

  const layers = getStyleLayers();
  if (layers.length === 0) {
    list.innerHTML = '<div class="sty-empty">Click a style to add it.</div>';
    return;
  }

  layers.forEach((layer, idx) => {
    const def = STYLE_DEFINITIONS.find(d => d.id === layer.typeId);
    if (!def) return;

    const item = document.createElement('div');
    item.className = 'sty-layer' + (layer.enabled ? '' : ' sty-layer-off');
    item.dataset.id  = layer.id;
    // ── [x] 🖼 Drag & drop ── attributs nécessaires
    item.draggable = true;
    item.dataset.idx = idx;

    const paramsHTML = Object.entries(def.params).map(([key, pd]) => {
      const val  = layer.params[key] ?? pd.default;
      const isAnimated = layer.animation?.target === key;
      return `
        <label class="sty-param-row">
          <span class="sty-param-label">${_esc(pd.label)}</span>
          <input class="sty-param-sl" type="range"
            min="${pd.min}" max="${pd.max}" step="${pd.step}" value="${val}"
            data-id="${_esc(layer.id)}" data-key="${_esc(key)}">
          <span class="sty-param-val" id="stypv-${_esc(layer.id)}-${_esc(key)}">${Number(val).toFixed(pd.step < 0.1 ? 2 : 0)}</span>
          <button class="sty-anim-btn${isAnimated ? ' sty-anim-active' : ''}" type="button"
            title="Animer ce paramètre avec iTime"
            data-id="${_esc(layer.id)}" data-key="${_esc(key)}">∿</button>
        </label>`;
    }).join('');

    // Animation actuelle (résumé)
    const animInfo = layer.animation
      ? `<div class="sty-anim-badge">∿ ${layer.animation.target} — ${layer.animation.fn} × ${layer.animation.speed} amp ${layer.animation.amp}</div>`
      : '';

    const blendMode = layer.blendMode ?? 'normal';

    item.innerHTML = `
      <div class="sty-layer-head">
        <span class="sty-drag-handle" title="Glisser pour réordonner">⠿</span>
        <span class="sty-layer-icon">${_esc(def.icon)}</span>
        <span class="sty-layer-name">${_esc(def.name)}</span>
        <div class="sty-layer-ctrl">
          ${idx > 0 ? `<button class="sty-up" type="button" data-id="${_esc(layer.id)}">▲</button>` : '<span class="sty-ph"></span>'}
          ${idx < layers.length - 1 ? `<button class="sty-dn" type="button" data-id="${_esc(layer.id)}">▼</button>` : '<span class="sty-ph"></span>'}
          <label class="sty-toggle">
            <input type="checkbox" class="sty-enable" data-id="${_esc(layer.id)}" ${layer.enabled ? 'checked' : ''}>
            <span class="sty-knob"></span>
          </label>
          <button class="sty-rm" type="button" data-id="${_esc(layer.id)}">×</button>
        </div>
      </div>

      <div class="sty-opacity-row">
        <span class="sty-param-label">Opacité</span>
        <input class="sty-opacity-sl" type="range" min="0" max="1" step="0.01"
          value="${layer.opacity.toFixed(2)}" data-id="${_esc(layer.id)}">
        <span class="sty-param-val" id="styop-${_esc(layer.id)}">${layer.opacity.toFixed(2)}</span>
        <button class="sty-anim-btn${layer.animation?.target === 'opacity' ? ' sty-anim-active' : ''}" type="button"
          title="Animer l'opacité avec iTime"
          data-id="${_esc(layer.id)}" data-key="opacity">∿</button>
      </div>

      <div class="sty-blend-row">
        <span class="sty-param-label">Blend</span>
        <select class="sty-blend-sel" data-id="${_esc(layer.id)}">
          ${['normal','add','multiply','screen','overlay'].map(m =>
            `<option value="${m}"${m === blendMode ? ' selected' : ''}>${m}</option>`
          ).join('')}
        </select>
      </div>

      ${animInfo}

      <div class="sty-params${layer.enabled ? '' : ' sty-params-hidden'}">
        ${paramsHTML}
      </div>

      <!-- ── [x] 🔧 Canvas WebGL 48×48 preview ── -->
      <div class="sty-preview-wrap">
        <canvas class="sty-preview-canvas" width="48" height="48"
          data-id="${_esc(layer.id)}" title="Aperçu live WebGL 48×48"></canvas>
        <span class="sty-preview-label">preview</span>
      </div>
    `;
    list.appendChild(item);
  });

  _bindListEvents(list, layers);
  _renderPreviews(list, layers);
}

// ─────────────────────────────────────────────────────────────────────────────
// [x] 🔧 Preview WebGL 48×48 par calque
// ─────────────────────────────────────────────────────────────────────────────

const _PREV_VERT = `
  attribute vec2 aPos;
  varying vec2 uv;
  void main() { uv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }
`;

/** Generates a preview fragment shader for a single layer (gradient test background). */
function _previewFrag(layer, def) {
  const fragCode = def.frag(layer.params);
  return `
  precision mediump float;
  varying vec2 uv;
  uniform sampler2D uSource;
  uniform vec2 iResolution;
  uniform float iTime;
  void main() {
    // Fond de test : damier coloré
    vec2 grid = floor(uv * 8.0);
    float check = mod(grid.x + grid.y, 2.0);
    vec3 col = mix(
      vec3(uv, 0.5 + 0.5 * sin(iTime * 0.7)),
      vec3(1.0 - uv.y, uv.x, 0.8),
      check * 0.4
    );
    ${fragCode.trim()}
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }`;
}

function _compilePreviewProg(gl, frag) {
  const vs = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vs, _PREV_VERT); gl.compileShader(vs);
  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fs, frag); gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    gl.deleteShader(vs); gl.deleteShader(fs); return null;
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs); gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    gl.deleteProgram(prog); return null;
  }
  return prog;
}

/** Démarre la boucle de rendu WebGL pour tous les canvases de preview visibles. */
let _rafId = null;

function _renderPreviews(list, layers) {
  if (_rafId) cancelAnimationFrame(_rafId);

  function frame(t) {
    if (!_panelEl || _panelEl.hidden) return;
    const iTime = t / 1000;

    layers.forEach(layer => {
      const canvas = list.querySelector(`.sty-preview-canvas[data-id="${layer.id}"]`);
      if (!canvas) return;

      // Créer ou récupérer le contexte WebGL
      if (!_glPreviews[layer.id]) {
        const gl = canvas.getContext('webgl', { antialias: false, preserveDrawingBuffer: true });
        if (!gl) return;
        const def = STYLE_DEFINITIONS.find(d => d.id === layer.typeId);
        if (!def) return;
        const prog = _compilePreviewProg(gl, _previewFrag(layer, def));
        if (!prog) return;

        // Quad
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

        // Texture source blanche 1×1 (le fragment se génère lui-même)
        const srcTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, srcTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
          new Uint8Array([200, 200, 200, 255]));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

        _glPreviews[layer.id] = { gl, prog, buf, srcTex };
      }

      const { gl, prog, buf, srcTex } = _glPreviews[layer.id];

      gl.viewport(0, 0, 48, 48);
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);

      const aPosLoc = gl.getAttribLocation(prog, 'aPos');
      gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(aPosLoc);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, srcTex);
      gl.uniform1i(gl.getUniformLocation(prog, 'uSource'), 0);
      gl.uniform2f(gl.getUniformLocation(prog, 'iResolution'), 48, 48);
      gl.uniform1f(gl.getUniformLocation(prog, 'iTime'), iTime);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    });

    _rafId = requestAnimationFrame(frame);
  }

  _rafId = requestAnimationFrame(frame);
}

// ─────────────────────────────────────────────────────────────────────────────
// Events de la liste
// ─────────────────────────────────────────────────────────────────────────────

function _bindListEvents(list, layers) {
  // Boutons ▲ ▼
  list.querySelectorAll('.sty-up').forEach(b =>
    b.addEventListener('click', () => { moveStyleLayer(b.dataset.id, -1); _clearPreviews(); _refresh(); }));
  list.querySelectorAll('.sty-dn').forEach(b =>
    b.addEventListener('click', () => { moveStyleLayer(b.dataset.id, +1); _clearPreviews(); _refresh(); }));

  // Supprimer
  list.querySelectorAll('.sty-rm').forEach(b =>
    b.addEventListener('click', () => {
      _destroyPreview(b.dataset.id);
      removeStyleLayer(b.dataset.id);
      _refresh();
    }));

  // Enable toggle
  list.querySelectorAll('.sty-enable').forEach(cb =>
    cb.addEventListener('change', () => {
      setStyleLayerEnabled(cb.dataset.id, cb.checked);
      const params = list.querySelector(`.sty-layer[data-id="${cb.dataset.id}"] .sty-params`);
      if (params) params.classList.toggle('sty-params-hidden', !cb.checked);
      const item = list.querySelector(`.sty-layer[data-id="${cb.dataset.id}"]`);
      if (item) item.classList.toggle('sty-layer-off', !cb.checked);
    }));

  // Opacité
  list.querySelectorAll('.sty-opacity-sl').forEach(sl =>
    sl.addEventListener('input', () => {
      const val = parseFloat(sl.value);
      setStyleLayerOpacity(sl.dataset.id, val);
      const vEl = list.querySelector(`#styop-${sl.dataset.id}`);
      if (vEl) vEl.textContent = val.toFixed(2);
    }));

  // Paramètres
  list.querySelectorAll('.sty-param-sl').forEach(sl =>
    sl.addEventListener('input', () => {
      const val = parseFloat(sl.value);
      setStyleLayerParam(sl.dataset.id, sl.dataset.key, val);
      const vEl = list.querySelector(`#stypv-${sl.dataset.id}-${sl.dataset.key}`);
      if (vEl) vEl.textContent = val.toFixed(parseFloat(sl.step) < 0.1 ? 2 : 0);
      // Recompiler le preview (les params ont changé → nouveau shader)
      _destroyPreview(sl.dataset.id);
    }));

  // Blend mode
  list.querySelectorAll('.sty-blend-sel').forEach(sel =>
    sel.addEventListener('change', () => setStyleLayerBlendMode(sel.dataset.id, sel.value)));

  // ── [x] 🆕 Paramètres animés — bouton ∿ ───────────────────────────────────
  list.querySelectorAll('.sty-anim-btn').forEach(btn =>
    btn.addEventListener('click', () => _openAnimPopup(btn.dataset.id, btn.dataset.key, btn)));

  // ── [x] 🖼 Drag & drop ─────────────────────────────────────────────────────
  _bindDragDrop(list);
}

// ─────────────────────────────────────────────────────────────────────────────
// [x] 🖼 Drag & drop pour réordonner
// ─────────────────────────────────────────────────────────────────────────────

let _dragSrcId = null;

function _bindDragDrop(list) {
  const items = list.querySelectorAll('.sty-layer');

  items.forEach(item => {
    item.addEventListener('dragstart', e => {
      _dragSrcId = item.dataset.id;
      item.classList.add('sty-drag-active');
      e.dataTransfer.effectAllowed = 'move';
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('sty-drag-active');
      list.querySelectorAll('.sty-layer').forEach(i => i.classList.remove('sty-drag-over'));
      _dragSrcId = null;
    });
    item.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      list.querySelectorAll('.sty-layer').forEach(i => i.classList.remove('sty-drag-over'));
      item.classList.add('sty-drag-over');
    });
    item.addEventListener('drop', e => {
      e.preventDefault();
      if (!_dragSrcId || _dragSrcId === item.dataset.id) return;

      // Calculer le delta entre la position source et cible
      const allLayers = getStyleLayers();
      const srcIdx = allLayers.findIndex(l => l.id === _dragSrcId);
      const dstIdx = allLayers.findIndex(l => l.id === item.dataset.id);
      if (srcIdx < 0 || dstIdx < 0) return;

      const delta = dstIdx - srcIdx;
      const steps = Math.abs(delta);
      const dir   = delta > 0 ? +1 : -1;
      for (let i = 0; i < steps; i++) moveStyleLayer(_dragSrcId, dir);

      _clearPreviews();
      _refresh();
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// [x] 🆕 Popover d'animation de paramètre
// ─────────────────────────────────────────────────────────────────────────────

function _openAnimPopup(layerId, paramKey, anchorBtn) {
  // Fermer un popover existant
  document.getElementById('styAnimPopup')?.remove();

  const layer = getStyleLayers().find(l => l.id === layerId);
  if (!layer) return;

  const current = (layer.animation?.target === paramKey) ? layer.animation : null;

  const popup = document.createElement('div');
  popup.id = 'styAnimPopup';
  popup.innerHTML = `
    <div class="sty-ap-title">∿ Animation — <em>${_esc(paramKey)}</em></div>
    <label class="sty-ap-row">
      <span>Forme</span>
      <select class="sty-ap-fn">
        <option value="sin"${(!current || current.fn === 'sin') ? ' selected' : ''}>sin</option>
        <option value="cos"${current?.fn === 'cos' ? ' selected' : ''}>cos</option>
        <option value="tri"${current?.fn === 'tri' ? ' selected' : ''}>tri (triangle)</option>
      </select>
    </label>
    <label class="sty-ap-row">
      <span>Vitesse</span>
      <input class="sty-ap-speed" type="number" step="0.1" min="0.1" max="20"
        value="${current?.speed ?? 1}">
    </label>
    <label class="sty-ap-row">
      <span>Amplitude</span>
      <input class="sty-ap-amp" type="number" step="0.01" min="0" max="2"
        value="${current?.amp ?? 0.5}">
    </label>
    <label class="sty-ap-row">
      <span>Phase (rad)</span>
      <input class="sty-ap-offset" type="number" step="0.1" min="0" max="6.28"
        value="${current?.offset ?? 0}">
    </label>
    <div class="sty-ap-actions">
      <button class="sty-ap-apply" type="button">✓ Apply</button>
      ${current ? '<button class="sty-ap-clear" type="button">✕ Disable</button>' : ''}
    </div>
  `;

  // Positionner près du bouton
  const rect = anchorBtn.getBoundingClientRect();
  popup.style.cssText = `
    position: fixed;
    left: ${Math.min(rect.left, window.innerWidth - 220)}px;
    top:  ${rect.bottom + 4}px;
    z-index: 900;
  `;
  document.body.appendChild(popup);

  // Appliquer
  popup.querySelector('.sty-ap-apply').addEventListener('click', () => {
    const fn     = popup.querySelector('.sty-ap-fn').value;
    const speed  = parseFloat(popup.querySelector('.sty-ap-speed').value) || 1;
    const amp    = parseFloat(popup.querySelector('.sty-ap-amp').value) || 0.5;
    const offset = parseFloat(popup.querySelector('.sty-ap-offset').value) || 0;
    setStyleLayerAnimation(layerId, { target: paramKey, fn, speed, amp, offset });
    _destroyPreview(layerId);
    popup.remove();
    _refresh();
  });

  // Désactiver
  popup.querySelector('.sty-ap-clear')?.addEventListener('click', () => {
    setStyleLayerAnimation(layerId, null);
    _destroyPreview(layerId);
    popup.remove();
    _refresh();
  });

  // Fermer en cliquant en dehors
  const onOutside = e => {
    if (!popup.contains(e.target) && e.target !== anchorBtn) {
      popup.remove();
      document.removeEventListener('click', onOutside, true);
    }
  };
  // Délai pour ignorer le clic courant
  setTimeout(() => document.addEventListener('click', onOutside, true), 50);
}

// ─────────────────────────────────────────────────────────────────────────────
// Gestion du pool WebGL preview
// ─────────────────────────────────────────────────────────────────────────────

function _destroyPreview(id) {
  const p = _glPreviews[id];
  if (p) {
    const { gl, prog, buf, srcTex } = p;
    gl.deleteProgram(prog);
    gl.deleteBuffer(buf);
    gl.deleteTexture(srcTex);
    delete _glPreviews[id];
  }
}

function _clearPreviews() {
  Object.keys(_glPreviews).forEach(_destroyPreview);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function _esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _flashBtn(btn, label) {
  if (!btn) return;
  const orig = btn.textContent;
  btn.textContent = label;
  btn.style.color = label.startsWith('✓') ? 'var(--accent,#5b8df6)' : '#e06c75';
  setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 1400);
}

// ─────────────────────────────────────────────────────────────────────────────
// CSS
// ─────────────────────────────────────────────────────────────────────────────

function _injectStyles() {
  if (document.getElementById('stylePanelCSS')) return;
  const s = document.createElement('style');
  s.id = 'stylePanelCSS';
  s.textContent = `
    /* ── Panneau principal ── */
    #stylePanel {
      position: fixed; top: 80px; right: 300px; z-index: 800;
      background: var(--bg-surface, #1a1d22);
      border: 1px solid var(--border, #2a2d32);
      border-radius: var(--radius-md); width: 300px;
      font-family: 'JetBrains Mono', monospace; font-size: 11px;
      color: var(--prose, #ccc);
      box-shadow: 0 8px 32px rgba(0,0,0,.5);
      max-height: 82vh; display: flex; flex-direction: column;
    }
    #stylePanel[hidden] { display: none; }

    /* ── Header ── */
    #styHeader {
      display: flex; align-items: center; padding: 8px 10px; gap: 6px;
      border-bottom: 1px solid var(--border, #2a2d32); flex-shrink: 0;
    }
    #styTitle { font-weight: 700; flex: 1; font-size: 12px; }
    #styClose {
      background: none; border: none; color: var(--t3, #666);
      cursor: pointer; font-size: 13px; line-height: 1;
    }

    /* ── [x] Bouton → GLSL ── */
    #styInjectGLSL {
      background: var(--bg-deep, #111);
      border: 1px solid var(--accent, #5b8df6);
      color: var(--accent, #5b8df6);
      border-radius: 4px; padding: 2px 7px; cursor: pointer;
      font-size: 10px; font-family: inherit;
      transition: background .15s;
    }
    #styInjectGLSL:hover { background: var(--accent, #5b8df6); color: #fff; }

    /* ── Grille de définitions ── */
    #styDefGrid {
      display: flex; flex-wrap: wrap; gap: 4px; padding: 8px;
      border-bottom: 1px solid var(--border, #2a2d32); flex-shrink: 0;
    }
    .sty-def-card {
      display: flex; flex-direction: column; align-items: center; gap: 2px;
      background: var(--bg-deep, #111); border: 1px solid var(--border, #2a2d32);
      border-radius: 5px; padding: 5px 6px; cursor: pointer;
      transition: border-color .15s; min-width: 48px;
    }
    .sty-def-card:hover { border-color: var(--accent, #5b8df6); }
    .sty-def-icon { font-size: 14px; color: var(--accent, #5b8df6); }
    .sty-def-name { font-size: 9px; color: var(--t3, #888); text-align: center; }

    /* ── Liste des calques ── */
    #styLayerList { overflow-y: auto; flex: 1; }
    .sty-empty { padding: 12px 10px; color: var(--t3, #666); font-size: 10px; text-align: center; }

    .sty-layer {
      border-bottom: 1px solid rgba(255,255,255,.04);
      transition: opacity .15s, background .1s;
    }
    .sty-layer-off { opacity: 0.4; }

    /* ── [x] Drag & drop ── */
    .sty-drag-handle {
      cursor: grab; color: var(--t3, #555); font-size: 13px;
      padding: 0 3px; user-select: none;
    }
    .sty-drag-handle:active { cursor: grabbing; }
    .sty-layer.sty-drag-active { opacity: 0.35; }
    .sty-layer.sty-drag-over  { background: rgba(91,141,246,.12); border-top: 1px solid var(--accent,#5b8df6); }

    .sty-layer-head { display: flex; align-items: center; gap: 5px; padding: 6px 8px; }
    .sty-layer-icon { font-size: 13px; color: var(--accent, #5b8df6); min-width: 16px; }
    .sty-layer-name { font-size: 11px; font-weight: 600; flex: 1; }
    .sty-layer-ctrl { display: flex; align-items: center; gap: 3px; }

    .sty-up, .sty-dn, .sty-rm {
      background: none; border: none; color: var(--t3, #666);
      cursor: pointer; padding: 1px 3px; font-size: 9px;
    }
    .sty-up:hover, .sty-dn:hover { color: var(--accent, #5b8df6); }
    .sty-rm:hover { color: #e06c75; }
    .sty-ph { display: inline-block; width: 16px; }

    /* Toggle switch */
    .sty-toggle {
      position: relative; width: 28px; height: 15px;
      flex-shrink: 0; cursor: pointer;
    }
    .sty-toggle input { opacity: 0; width: 0; height: 0; position: absolute; }
    .sty-knob {
      position: absolute; inset: 0;
      background: var(--bg-deep, #111);
      border: 1px solid var(--border, #2a2d32);
      border-radius: 15px; transition: background .15s;
    }
    .sty-knob::after {
      content: ''; position: absolute;
      width: 9px; height: 9px; background: var(--t3, #888);
      border-radius: 50%; top: 2px; left: 2px; transition: all .15s;
    }
    .sty-toggle input:checked + .sty-knob {
      background: var(--accent, #5b8df6);
      border-color: var(--accent, #5b8df6);
    }
    .sty-toggle input:checked + .sty-knob::after { background: #fff; left: 15px; }

    /* Opacité / paramètres */
    .sty-opacity-row, .sty-blend-row {
      display: flex; align-items: center; gap: 5px;
      padding: 0 8px 4px 28px;
    }
    .sty-params { padding: 0 8px 7px 28px; display: flex; flex-direction: column; gap: 4px; }
    .sty-params-hidden { display: none; }
    .sty-param-row { display: flex; align-items: center; gap: 5px; }
    .sty-param-label {
      font-size: 10px; color: var(--t3, #888);
      min-width: 74px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .sty-param-sl, .sty-opacity-sl { flex: 1; accent-color: var(--accent, #5b8df6); }
    .sty-param-val {
      font-size: 10px; color: var(--accent, #5b8df6);
      min-width: 28px; text-align: right;
    }

    /* Blend select */
    .sty-blend-sel {
      flex: 1;
      background: var(--bg-deep, #111);
      border: 1px solid var(--border, #2a2d32);
      color: var(--prose, #ccc);
      border-radius: 3px; font-size: 10px;
      padding: 1px 3px; font-family: inherit;
    }

    /* ── [x] 🆕 Bouton animation ∿ ── */
    .sty-anim-btn {
      background: none; border: 1px solid var(--border, #2a2d32);
      color: var(--t3, #555); border-radius: 3px;
      cursor: pointer; padding: 0 4px; font-size: 11px; line-height: 1.4;
      transition: all .15s; flex-shrink: 0;
    }
    .sty-anim-btn:hover { border-color: var(--accent, #5b8df6); color: var(--accent, #5b8df6); }
    .sty-anim-btn.sty-anim-active {
      border-color: var(--accent, #5b8df6);
      background: rgba(91,141,246,.18);
      color: var(--accent, #5b8df6);
    }

    /* Badge animation active */
    .sty-anim-badge {
      font-size: 9px; color: var(--accent, #5b8df6);
      padding: 1px 8px 3px 28px; opacity: 0.8;
    }

    /* ── [x] 🔧 Preview WebGL 48×48 ── */
    .sty-preview-wrap {
      display: flex; align-items: center; gap: 6px;
      padding: 4px 8px 6px 28px;
    }
    .sty-preview-canvas {
      width: 48px; height: 48px;
      border-radius: 4px;
      border: 1px solid var(--border, #2a2d32);
      display: block; image-rendering: pixelated;
    }
    .sty-preview-label {
      font-size: 9px; color: var(--t3, #555);
    }

    /* ── Popover animation ── */
    #styAnimPopup {
      background: var(--bg-surface, #1a1d22);
      border: 1px solid var(--accent, #5b8df6);
      border-radius: 7px; padding: 10px 12px;
      box-shadow: 0 6px 24px rgba(0,0,0,.6);
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px; color: var(--prose, #ccc);
      min-width: 200px;
    }
    .sty-ap-title {
      font-weight: 700; font-size: 11px; color: var(--accent, #5b8df6);
      margin-bottom: 8px;
    }
    .sty-ap-title em { color: var(--prose, #ddd); font-style: normal; }
    .sty-ap-row {
      display: flex; align-items: center; gap: 6px;
      margin-bottom: 5px; font-size: 10px;
    }
    .sty-ap-row span { min-width: 70px; color: var(--t3, #888); }
    .sty-ap-row input, .sty-ap-row select {
      flex: 1; background: var(--bg-deep, #111);
      border: 1px solid var(--border, #2a2d32);
      color: var(--prose, #ccc); border-radius: 3px;
      font-size: 10px; padding: 2px 4px; font-family: inherit;
    }
    .sty-ap-actions { display: flex; gap: 6px; margin-top: 8px; }
    .sty-ap-apply {
      flex: 1; background: var(--accent, #5b8df6); border: none;
      color: #fff; border-radius: 4px; cursor: pointer;
      padding: 4px; font-size: 10px; font-family: inherit;
    }
    .sty-ap-clear {
      background: none; border: 1px solid #e06c75; color: #e06c75;
      border-radius: 4px; cursor: pointer;
      padding: 4px 8px; font-size: 10px; font-family: inherit;
    }
  `;
  document.head.appendChild(s);
}
