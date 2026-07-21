/**
 * palette-panel.js — F-4.3 (Axe 4)
 *
 * Panneau flottant de sélection de palette IQ pour le color-remap.
 * Permet de choisir une palette prédéfinie ou d'éditer les 4 vecteurs (a, b, c, d)
 * et de les appliquer en live sur le rendu.
 *
 * API publique :
 *   openPalettePanel()  — ouvre/ferme le panneau
 *   closePalettePanel()
 *   togglePalettePanel()
 */

import { IQ_PALETTES, getRemapParams, setRemapParams, drawPalettePreview, accentFromShader } from '../render/color-remap.js';
import { state } from '../core/state.js';
import { smartInsert } from './smart-insert.js';

let _panelEl = null;

// ── API publique ──────────────────────────────────────────────────────────────

export function openPalettePanel() {
  if (!_panelEl) _build();
  _panelEl.hidden = false;
  _refresh();
}

export function closePalettePanel() {
  if (_panelEl) _panelEl.hidden = true;
}

export function togglePalettePanel() {
  if (!_panelEl || _panelEl.hidden) openPalettePanel();
  else closePalettePanel();
}

// ── Construction ──────────────────────────────────────────────────────────────

function _build() {
  _injectStyles();

  const el = document.createElement('div');
  el.id = 'palPanel';
  el.hidden = true;
  el.innerHTML = `
    <div id="palHeader">
      <span id="palTitle">◈ IQ Palette</span>
      <label class="pal-toggle">
        <input type="checkbox" id="palEnabled">
        <span>Active</span>
      </label>
      <button id="palClose">✕</button>
    </div>
    <div id="palStrengthRow">
      <label class="pal-label">Intensity</label>
      <input type="range" id="palStrength" min="0" max="1" step="0.01" value="1">
      <span id="palStrengthVal">100%</span>
    </div>
    <div id="palPresets"></div>
    <div id="palEditor">
      <div class="pal-param-row">
        <span class="pal-param-label">a</span>
        <div class="pal-vec" id="palA"></div>
      </div>
      <div class="pal-param-row">
        <span class="pal-param-label">b</span>
        <div class="pal-vec" id="palB"></div>
      </div>
      <div class="pal-param-row">
        <span class="pal-param-label">c</span>
        <div class="pal-vec" id="palC"></div>
      </div>
      <div class="pal-param-row">
        <span class="pal-param-label">d</span>
        <div class="pal-vec" id="palD"></div>
      </div>
    </div>
    <canvas id="palPreview" width="220" height="20"></canvas>
    <div id="palFooter">
      <button id="palAccentBtn" title="Extract dominant color from render">⬡ Accent auto</button>
      <button id="palInjectBtn" title="Inject IQ palette as GLSL snippet">→ Inject IQ</button>
    </div>
  `;
  document.body.appendChild(el);
  _panelEl = el;

  el.querySelector('#palClose').addEventListener('click', closePalettePanel);

  // Enabled toggle
  el.querySelector('#palEnabled').addEventListener('change', e => {
    setRemapParams({ enabled: e.target.checked });
    _notifyRenderer();
  });

  // Strength slider
  const strengthSlider = el.querySelector('#palStrength');
  const strengthVal = el.querySelector('#palStrengthVal');
  strengthSlider.addEventListener('input', () => {
    const v = parseFloat(strengthSlider.value);
    strengthVal.textContent = Math.round(v * 100) + '%';
    setRemapParams({ strength: v });
    _notifyRenderer();
    _redrawPreview();
  });

  // Preset buttons
  const presetsEl = el.querySelector('#palPresets');
  for (const pal of IQ_PALETTES) {
    const btn = document.createElement('button');
    btn.className = 'pal-preset-btn';
    btn.title = pal.name;
    // Mini gradient preview
    const cvs = document.createElement('canvas');
    cvs.width = 40; cvs.height = 10;
    drawPalettePreview(cvs, pal);
    btn.appendChild(cvs);
    const lbl = document.createElement('span');
    lbl.textContent = pal.name;
    btn.appendChild(lbl);
    btn.addEventListener('click', () => _applyPreset(pal));
    presetsEl.appendChild(btn);
  }

  // Vec editors
  _buildVecEditor('palA', 0);
  _buildVecEditor('palB', 1);
  _buildVecEditor('palC', 2);
  _buildVecEditor('palD', 3);

  // Footer actions
  el.querySelector('#palAccentBtn').addEventListener('click', () => {
    const result = accentFromShader();
    if (!result) {
      // Fallback: show brief feedback
      const btn = el.querySelector('#palAccentBtn');
      const orig = btn.textContent;
      btn.textContent = '✗ Canvas vide';
      setTimeout(() => { btn.textContent = orig; }, 1500);
    } else {
      const btn = el.querySelector('#palAccentBtn');
      btn.style.background = result.hex;
      setTimeout(() => { btn.style.background = ''; }, 1500);
    }
  });

  el.querySelector('#palInjectBtn').addEventListener('click', _injectIQSnippet);
}

const _IQ_PALETTE_GLSL = `// IQ Cosine Palette — col = a + b*cos(2π*(c*t+d))
vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
    return a + b * cos(6.28318 * (c * t + d));
}`;

function _injectIQSnippet() {
  const p = getRemapParams();
  const fmt = v => v.map(x => x.toFixed(3)).join(', ');
  const usage = `// palette(t,
//   vec3(${fmt(p.a)}),
//   vec3(${fmt(p.b)}),
//   vec3(${fmt(p.c)}),
//   vec3(${fmt(p.d)}));`;
  smartInsert(_IQ_PALETTE_GLSL + '\n' + usage, 'function');
}

function _buildVecEditor(containerId, paramIdx) {
  const keys = ['a', 'b', 'c', 'd'];
  const key = keys[paramIdx];
  const container = _panelEl.querySelector('#' + containerId);
  const channels = ['r', 'g', 'b'];
  container.innerHTML = channels.map((ch, i) =>
    `<input class="pal-num" type="number" step="0.05" min="-1" max="2"
      data-key="${key}" data-ch="${i}" value="0" title="${ch.toUpperCase()}">`
  ).join('');
  container.querySelectorAll('.pal-num').forEach(inp => {
    inp.addEventListener('input', () => {
      const k = inp.dataset.key;
      const ch = parseInt(inp.dataset.ch);
      const p = getRemapParams();
      const v = [...p[k]];
      v[ch] = parseFloat(inp.value) || 0;
      setRemapParams({ [k]: v });
      _notifyRenderer();
      _redrawPreview();
    });
  });
}

function _refresh() {
  const p = getRemapParams();
  const el = _panelEl;
  el.querySelector('#palEnabled').checked = !!p.enabled;
  el.querySelector('#palStrength').value = String(p.strength ?? 1);
  el.querySelector('#palStrengthVal').textContent = Math.round((p.strength ?? 1) * 100) + '%';
  _refreshVecEditor('palA', p.a);
  _refreshVecEditor('palB', p.b);
  _refreshVecEditor('palC', p.c);
  _refreshVecEditor('palD', p.d);
  _redrawPreview();
}

function _refreshVecEditor(containerId, vals) {
  const container = _panelEl.querySelector('#' + containerId);
  container.querySelectorAll('.pal-num').forEach(inp => {
    const ch = parseInt(inp.dataset.ch);
    if (document.activeElement !== inp) inp.value = String((vals[ch] ?? 0).toFixed(3));
  });
}

function _applyPreset(pal) {
  setRemapParams({ a: [...pal.a], b: [...pal.b], c: [...pal.c], d: [...pal.d] });
  _refresh();
  _notifyRenderer();
}

function _redrawPreview() {
  const canvas = _panelEl.querySelector('#palPreview');
  if (!canvas) return;
  const p = getRemapParams();
  drawPalettePreview(canvas, p);
}

function _notifyRenderer() {
  // Signal au renderer que le color-remap a changé
  if (state.callbacks?.onRemapChange) {
    state.callbacks.onRemapChange(getRemapParams());
  }
}

// ── Styles ────────────────────────────────────────────────────────────────────

function _injectStyles() {
  if (document.getElementById('palStyles')) return;
  const s = document.createElement('style');
  s.id = 'palStyles';
  s.textContent = `
    #palPanel {
      position: fixed; bottom: 60px; right: 16px; z-index: 800;
      background: var(--bg-surface, #1a1d22);
      border: 1px solid var(--border, #2a2d32);
      border-radius: var(--radius-md); width: 240px;
      font-family: 'JetBrains Mono', monospace; font-size: 11px;
      color: var(--prose, #ccc);
      box-shadow: 0 8px 32px rgba(0,0,0,.5);
      display: flex; flex-direction: column; gap: 0;
    }
    #palPanel[hidden] { display: none; }
    #palHeader {
      display: flex; align-items: center; gap: 6px; padding: 8px 10px;
      border-bottom: 1px solid var(--border, #2a2d32);
    }
    #palTitle { font-weight: 700; flex: 1; font-size: 12px; }
    #palClose { background: none; border: none; color: var(--t3, #666); cursor: pointer; font-size: 12px; }
    .pal-toggle { display: flex; align-items: center; gap: 4px; font-size: 10px; cursor: pointer; }
    #palStrengthRow {
      display: flex; align-items: center; gap: 6px; padding: 6px 10px;
      border-bottom: 1px solid var(--border, #2a2d32);
    }
    .pal-label { font-size: 10px; color: var(--t3, #666); min-width: 50px; }
    #palStrength { flex: 1; accent-color: var(--accent, #5b8df6); }
    #palStrengthVal { font-size: 10px; color: var(--accent, #5b8df6); min-width: 32px; text-align: right; }
    #palPresets {
      display: flex; flex-wrap: wrap; gap: 4px; padding: 8px 10px;
      border-bottom: 1px solid var(--border, #2a2d32); max-height: 120px; overflow-y: auto;
    }
    .pal-preset-btn {
      display: flex; flex-direction: column; align-items: center; gap: 2px;
      border: 1px solid var(--border, #2a2d32); border-radius: 4px;
      background: var(--bg-deep, #111); cursor: pointer; padding: 4px;
      font-family: inherit; font-size: 9px; color: var(--t3, #888);
    }
    .pal-preset-btn:hover { border-color: var(--accent, #5b8df6); color: var(--prose, #ccc); }
    .pal-preset-btn canvas { border-radius: 2px; display: block; }
    #palEditor { padding: 8px 10px; display: flex; flex-direction: column; gap: 5px; }
    .pal-param-row { display: flex; align-items: center; gap: 6px; }
    .pal-param-label { font-size: 11px; font-weight: 700; color: var(--accent, #5b8df6); width: 12px; }
    .pal-vec { display: flex; gap: 4px; flex: 1; }
    .pal-num {
      flex: 1; background: var(--bg-deep, #111); border: 1px solid var(--border, #2a2d32);
      color: var(--prose, #ccc); border-radius: 3px; padding: 3px 4px;
      font-family: inherit; font-size: 10px; outline: none; min-width: 0;
    }
    .pal-num:focus { border-color: var(--accent, #5b8df6); }
    #palPreview { display: block; margin: 4px 10px 4px; border-radius: 4px; width: calc(100% - 20px); height: 16px; }
    #palFooter {
      display: flex; gap: 4px; padding: 6px 10px 8px;
      border-top: 1px solid var(--border, #2a2d32);
    }
    #palFooter button {
      flex: 1; background: var(--bg-deep, #111);
      border: 1px solid var(--border, #2a2d32); border-radius: 4px;
      color: var(--prose, #ccc); cursor: pointer; font-family: inherit;
      font-size: 10px; padding: 4px 6px; transition: border-color .15s, background .3s;
    }
    #palFooter button:hover { border-color: var(--accent, #5b8df6); color: #fff; }
    #palInjectBtn { color: var(--accent, #5b8df6); font-weight: 600; }
  `;
  document.head.appendChild(s);
}
