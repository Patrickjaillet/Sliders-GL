/**
 * composer-ui.js — F-1.1 (Axe 1)
 *
 * Interface wizard multi-étapes pour le Shader Composer.
 * Remplace le modal #wizardModal quand on clique "Create" depuis la library.
 *
 * Étapes :
 *   1 — Domaine    : 2D · 3D · Post-process · Audio · Fractal
 *   2 — Effets     : grille de vignettes (blocs GLSL sélectionnables)
 *   3 — Perso      : couleurs, vitesse globale, intensité
 *   4 — Aperçu     : canvas live 160×160 + code GLSL généré
 *
 * API publique :
 *   openShaderComposer()  — ouvre le wizard (remplace openWizardModal)
 *   closeShaderComposer() — ferme
 */

import { state, notify } from '../../core/state.js';
import { applyAndParse } from '../../io/actions.js';
import { pushHistory } from '../../io/history.js';
import { COMPOSER_DOMAINS, COMPOSER_BLOCKS } from './composer-templates.js';
import { generateShader, blocksForDomain } from './composer-codegen.js';

// ── État du wizard ────────────────────────────────────────────────────────────

const _wiz = {
  step: 1,
  domain: '2d',
  selectedBlocks: [],
  name: 'My Shader',
  colors: { primary: '#5b8df6', secondary: '#f65b8d' },
  speed: 1.0,
  intensity: 1.0,
  previewCanvas: null,
  previewGl: null,
  previewProgram: null,
  previewRaf: null,
};

let _overlayEl = null;

// ── API publique ──────────────────────────────────────────────────────────────

export function openShaderComposer() {
  if (!_overlayEl) _buildOverlay();
  _wiz.step = 1;
  _wiz.selectedBlocks = [];
  _wiz.name = 'My Shader';
  _wiz.speed = 1.0;
  _wiz.intensity = 1.0;
  _overlayEl.hidden = false;
  _renderStep();
}

export function closeShaderComposer() {
  if (_overlayEl) _overlayEl.hidden = true;
  _stopPreview();
}

// ── Construction de l'overlay ─────────────────────────────────────────────────

function _buildOverlay() {
  _injectStyles();

  const el = document.createElement('div');
  el.id = 'scOverlay';
  el.hidden = true;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Shader Composer');
  el.innerHTML = `
    <div id="scModal">
      <div id="scHeader">
        <div id="scTitle">Shader Composer</div>
        <div id="scSteps"></div>
        <button id="scClose" aria-label="Fermer">✕</button>
      </div>
      <div id="scBody"></div>
      <div id="scFooter">
        <button id="scBack" class="sc-btn">← Back</button>
        <button id="scNext" class="sc-btn sc-btn-primary">Next →</button>
        <button id="scCreate" class="sc-btn sc-btn-confirm" style="display:none">✓ Create shader</button>
      </div>
    </div>
  `;

  document.body.appendChild(el);
  _overlayEl = el;

  el.querySelector('#scClose').addEventListener('click', closeShaderComposer);
  el.querySelector('#scBack').addEventListener('click', _prevStep);
  el.querySelector('#scNext').addEventListener('click', _nextStep);
  el.querySelector('#scCreate').addEventListener('click', _createShader);

  // Close on backdrop click
  el.addEventListener('click', e => { if (e.target === el) closeShaderComposer(); });
}

// ── Navigation ────────────────────────────────────────────────────────────────

function _nextStep() {
  if (_wiz.step < 4) { _wiz.step++; _renderStep(); }
}

function _prevStep() {
  if (_wiz.step > 1) { _wiz.step--; _renderStep(); }
}

function _renderStep() {
  const body = _overlayEl.querySelector('#scBody');
  const stepsEl = _overlayEl.querySelector('#scSteps');
  const backBtn = _overlayEl.querySelector('#scBack');
  const nextBtn = _overlayEl.querySelector('#scNext');
  const createBtn = _overlayEl.querySelector('#scCreate');

  // Mise à jour des indicateurs de step
  const STEP_LABELS = ['Domaine', 'Effets', 'Style', 'Aperçu'];
  stepsEl.innerHTML = STEP_LABELS.map((l, i) =>
    `<div class="sc-step-dot ${i + 1 === _wiz.step ? 'active' : i + 1 < _wiz.step ? 'done' : ''}"
          title="Étape ${i+1}: ${l}">${i + 1 < _wiz.step ? '✓' : i + 1}</div>`
  ).join('');

  backBtn.style.display = _wiz.step === 1 ? 'none' : '';
  nextBtn.style.display = _wiz.step < 4 ? '' : 'none';
  createBtn.style.display = _wiz.step === 4 ? '' : 'none';

  _stopPreview();

  switch (_wiz.step) {
    case 1: _renderStep1(body); break;
    case 2: _renderStep2(body); break;
    case 3: _renderStep3(body); break;
    case 4: _renderStep4(body); break;
  }
}

// ── Étape 1 — Domaine ─────────────────────────────────────────────────────────

function _renderStep1(body) {
  body.innerHTML = `
    <div class="sc-step-title">Choisir le domaine principal</div>
    <div class="sc-step-hint">Détermine les blocs disponibles à l'étape suivante.</div>
    <div id="scDomainGrid"></div>
    <div class="sc-field" style="margin-top:16px">
      <label class="sc-label">Nom du shader</label>
      <input id="scName" class="sc-input" value="${_esc(_wiz.name)}" placeholder="Mon Shader" maxlength="60">
    </div>
  `;

  const grid = body.querySelector('#scDomainGrid');
  for (const d of COMPOSER_DOMAINS) {
    const btn = document.createElement('button');
    btn.className = 'sc-domain-btn' + (d.id === _wiz.domain ? ' active' : '');
    btn.innerHTML = `
      <div class="sc-domain-icon">${d.icon}</div>
      <div class="sc-domain-label">${_esc(d.label)}</div>
      <div class="sc-domain-desc">${_esc(d.desc)}</div>
    `;
    btn.addEventListener('click', () => {
      _wiz.domain = d.id;
      grid.querySelectorAll('.sc-domain-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
    grid.appendChild(btn);
  }

  body.querySelector('#scName').addEventListener('input', e => { _wiz.name = e.target.value.trim() || 'My Shader'; });
}

// ── Étape 2 — Effets ──────────────────────────────────────────────────────────

function _renderStep2(body) {
  const available = blocksForDomain(_wiz.domain);

  body.innerHTML = `
    <div class="sc-step-title">Sélectionner les blocs d'effets</div>
    <div class="sc-step-hint">Cliquer pour sélectionner (multi-sélection possible). Double-clic = aperçu immédiat.</div>
    <div id="scBlockGrid"></div>
  `;

  const grid = body.querySelector('#scBlockGrid');

  // Grouper par catégorie
  const cats = {};
  for (const b of available) {
    if (!cats[b.category]) cats[b.category] = [];
    cats[b.category].push(b);
  }

  for (const [cat, blocks] of Object.entries(cats)) {
    const section = document.createElement('div');
    section.innerHTML = `<div class="sc-cat-header">${_esc(cat)}</div>`;
    const row = document.createElement('div');
    row.className = 'sc-block-row';
    for (const block of blocks) {
      const card = _makeBlockCard(block);
      row.appendChild(card);
    }
    section.appendChild(row);
    grid.appendChild(section);
  }
}

function _makeBlockCard(block) {
  const card = document.createElement('div');
  const isSelected = _wiz.selectedBlocks.includes(block.id);
  card.className = 'sc-block-card' + (isSelected ? ' active' : '');
  card.dataset.id = block.id;
  card.title = block.desc || block.name;

  card.innerHTML = `
    <div class="sc-card-thumb" style="background:${block.thumb || '#1a2030'}"></div>
    <div class="sc-card-name">${_esc(block.name)}</div>
  `;

  card.addEventListener('click', () => {
    const idx = _wiz.selectedBlocks.indexOf(block.id);
    if (idx >= 0) {
      _wiz.selectedBlocks.splice(idx, 1);
      card.classList.remove('active');
    } else {
      _wiz.selectedBlocks.push(block.id);
      card.classList.add('active');
    }
  });

  return card;
}

// ── Étape 3 — Personnalisation ────────────────────────────────────────────────

function _renderStep3(body) {
  body.innerHTML = `
    <div class="sc-step-title">Personnalisation initiale</div>
    <div class="sc-step-hint">Ces valeurs s'appliquent comme modificateurs globaux.</div>
    <div class="sc-fields">
      <div class="sc-field">
        <label class="sc-label">Couleur primaire</label>
        <input type="color" id="scColor1" class="sc-color" value="${_wiz.colors.primary}">
      </div>
      <div class="sc-field">
        <label class="sc-label">Couleur secondaire</label>
        <input type="color" id="scColor2" class="sc-color" value="${_wiz.colors.secondary}">
      </div>
      <div class="sc-field">
        <label class="sc-label">Vitesse globale — <span id="scSpeedVal">${_wiz.speed.toFixed(2)}</span></label>
        <input type="range" id="scSpeed" class="sc-range" min="0.1" max="5" step="0.1" value="${_wiz.speed}">
      </div>
      <div class="sc-field">
        <label class="sc-label">Intensité — <span id="scIntVal">${_wiz.intensity.toFixed(2)}</span></label>
        <input type="range" id="scIntensity" class="sc-range" min="0.1" max="3" step="0.1" value="${_wiz.intensity}">
      </div>
    </div>
  `;

  body.querySelector('#scColor1').addEventListener('input', e => { _wiz.colors.primary = e.target.value; });
  body.querySelector('#scColor2').addEventListener('input', e => { _wiz.colors.secondary = e.target.value; });

  const speedEl = body.querySelector('#scSpeed');
  const speedVal = body.querySelector('#scSpeedVal');
  speedEl.addEventListener('input', () => { _wiz.speed = parseFloat(speedEl.value); speedVal.textContent = _wiz.speed.toFixed(2); });

  const intEl = body.querySelector('#scIntensity');
  const intVal = body.querySelector('#scIntVal');
  intEl.addEventListener('input', () => { _wiz.intensity = parseFloat(intEl.value); intVal.textContent = _wiz.intensity.toFixed(2); });
}

// ── Étape 4 — Aperçu ──────────────────────────────────────────────────────────

function _renderStep4(body) {
  const code = generateShader(_wiz.selectedBlocks, {
    name: _wiz.name,
    colors: _wiz.colors,
    speed: _wiz.speed,
    intensity: _wiz.intensity,
  });

  body.innerHTML = `
    <div class="sc-step-title">Aperçu du shader généré</div>
    <div id="scPreviewWrap">
      <canvas id="scPreviewCanvas" width="160" height="160"></canvas>
      <div id="scPreviewCode"><pre id="scPreviewPre"></pre></div>
    </div>
  `;

  body.querySelector('#scPreviewPre').textContent = code;

  // Lance le WebGL preview
  const canvas = body.querySelector('#scPreviewCanvas');
  _startPreview(canvas, code);
}

// ── WebGL mini-preview ────────────────────────────────────────────────────────

function _startPreview(canvas, glslCode) {
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  if (!gl) return;
  _wiz.previewGl = gl;

  const vert = `
    attribute vec2 aPos;
    void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
  `;

  const frag = `
    precision mediump float;
    uniform float iTime;
    uniform vec3 iResolution;
    #define iChannel0 sampler2D
    void mainImage(out vec4 fragColor, in vec2 fragCoord);
    void main() { vec4 col; mainImage(col, gl_FragCoord.xy); gl_FragColor = col; }
    ${glslCode}
  `;

  const prog = _compileProgram(gl, vert, frag);
  if (!prog) {
    canvas.parentElement.querySelector('#scPreviewPre').textContent =
      '⚠ Erreur de compilation — voir le code ci-dessous\n\n' +
      canvas.parentElement.querySelector('#scPreviewPre').textContent;
    return;
  }
  _wiz.previewProgram = prog;
  _wiz.previewCanvas = canvas;

  // Quad
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');

  const uTime = gl.getUniformLocation(prog, 'iTime');
  const uRes  = gl.getUniformLocation(prog, 'iResolution');

  const start = performance.now();
  function frame() {
    _wiz.previewRaf = requestAnimationFrame(frame);
    gl.viewport(0, 0, 160, 160);
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1f(uTime, (performance.now() - start) / 1000);
    gl.uniform3f(uRes, 160, 160, 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  frame();
}

function _stopPreview() {
  if (_wiz.previewRaf) {
    cancelAnimationFrame(_wiz.previewRaf);
    _wiz.previewRaf = null;
  }
}

function _compileProgram(gl, vertSrc, fragSrc) {
  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) return null;
    return s;
  }
  const vs = compile(gl.VERTEX_SHADER, vertSrc);
  const fs = compile(gl.FRAGMENT_SHADER, fragSrc);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  return gl.getProgramParameter(prog, gl.LINK_STATUS) ? prog : null;
}

// ── Création du shader ────────────────────────────────────────────────────────

function _createShader() {
  const code = generateShader(_wiz.selectedBlocks, {
    name: _wiz.name,
    colors: _wiz.colors,
    speed: _wiz.speed,
    intensity: _wiz.intensity,
  });

  if (state.editor) {
    pushHistory('Avant Shader Composer', state.editor.getValue());
    state.editor.setValue(code);
    state.pinnedIds?.clear();
    notify('pinnedIds', state.pinnedIds);
    setTimeout(() => applyAndParse(), 80);
  }

  closeShaderComposer();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Styles ────────────────────────────────────────────────────────────────────

function _injectStyles() {
  if (document.getElementById('scStyles')) return;
  const style = document.createElement('style');
  style.id = 'scStyles';
  style.textContent = `
    #scOverlay {
      position: fixed; inset: 0; z-index: 1500;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,.6); backdrop-filter: blur(4px);
    }
    #scOverlay[hidden] { display: none; }
    #scModal {
      background: var(--bg-surface, #1a1d22);
      border: 1px solid var(--border, #2a2d32);
      border-radius: 10px;
      width: min(760px, 95vw);
      max-height: 88vh;
      display: flex; flex-direction: column;
      box-shadow: 0 20px 60px rgba(0,0,0,.6);
      overflow: hidden;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: var(--prose, #ccc);
    }
    #scHeader {
      display: flex; align-items: center; gap: 10px;
      padding: 14px 16px;
      border-bottom: 1px solid var(--border, #2a2d32);
      flex-shrink: 0;
    }
    #scTitle { font-size: 14px; font-weight: 700; flex: 1; }
    #scSteps { display: flex; gap: 6px; }
    .sc-step-dot {
      width: 24px; height: 24px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 10px; font-weight: 700;
      background: var(--bg-deep, #111); color: var(--t3, #666);
      border: 1px solid var(--border, #2a2d32);
    }
    .sc-step-dot.active { background: var(--accent, #5b8df6); color: #fff; border-color: var(--accent, #5b8df6); }
    .sc-step-dot.done { background: #2a4a2a; color: #6f6; border-color: #3a6a3a; }
    #scClose { background: none; border: none; color: var(--t3, #666); cursor: pointer; font-size: 14px; padding: 4px 6px; }
    #scClose:hover { color: var(--prose, #ccc); }
    #scBody { flex: 1; overflow-y: auto; padding: 20px; }
    #scFooter {
      display: flex; gap: 8px; justify-content: flex-end;
      padding: 12px 16px;
      border-top: 1px solid var(--border, #2a2d32);
      flex-shrink: 0;
    }
    .sc-btn {
      padding: 7px 16px; border-radius: 5px; border: 1px solid var(--border, #2a2d32);
      background: var(--bg-deep, #111); color: var(--prose, #ccc);
      cursor: pointer; font-family: inherit; font-size: 12px;
    }
    .sc-btn:hover { background: var(--hover, rgba(255,255,255,.07)); }
    .sc-btn-primary { background: var(--accent, #5b8df6); color: #fff; border-color: transparent; }
    .sc-btn-primary:hover { opacity: 0.9; }
    .sc-btn-confirm { background: #2a4a2a; color: #6f6; border-color: #3a6a3a; }
    .sc-btn-confirm:hover { background: #2f5a2f; }
    .sc-step-title { font-size: 14px; font-weight: 600; margin-bottom: 6px; }
    .sc-step-hint { font-size: 11px; color: var(--t3, #666); margin-bottom: 16px; }
    #scDomainGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; }
    .sc-domain-btn {
      border: 2px solid var(--border, #2a2d32);
      border-radius: 8px; background: var(--bg-deep, #111);
      color: var(--prose, #ccc); cursor: pointer; padding: 12px 8px;
      text-align: center; font-family: inherit;
      transition: border-color 0.15s, background 0.15s;
    }
    .sc-domain-btn:hover { border-color: var(--accent, #5b8df6); }
    .sc-domain-btn.active { border-color: var(--accent, #5b8df6); background: rgba(91,141,246,.12); }
    .sc-domain-icon { font-size: 24px; margin-bottom: 6px; }
    .sc-domain-label { font-size: 11px; font-weight: 700; margin-bottom: 3px; }
    .sc-domain-desc { font-size: 9px; color: var(--t3, #666); line-height: 1.3; }
    .sc-cat-header { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--t3, #666); margin: 16px 0 8px; }
    .sc-block-row { display: flex; flex-wrap: wrap; gap: 8px; }
    .sc-block-card {
      border: 2px solid var(--border, #2a2d32);
      border-radius: 6px; overflow: hidden;
      cursor: pointer; width: 90px;
      transition: border-color 0.15s;
    }
    .sc-block-card:hover { border-color: var(--accent, #5b8df6); }
    .sc-block-card.active { border-color: var(--accent, #5b8df6); outline: 1px solid var(--accent, #5b8df6); }
    .sc-card-thumb { height: 60px; }
    .sc-card-name { padding: 4px 6px; font-size: 10px; text-align: center; line-height: 1.3; }
    .sc-fields { display: flex; flex-direction: column; gap: 14px; max-width: 400px; }
    .sc-field { display: flex; flex-direction: column; gap: 4px; }
    .sc-label { font-size: 11px; color: var(--t3, #666); }
    .sc-input {
      background: var(--bg-deep, #111); border: 1px solid var(--border, #2a2d32);
      color: var(--prose, #ccc); border-radius: 4px; padding: 6px 8px;
      font-family: inherit; font-size: 12px; outline: none;
    }
    .sc-input:focus { border-color: var(--accent, #5b8df6); }
    .sc-color { height: 32px; border-radius: 4px; border: 1px solid var(--border, #2a2d32); cursor: pointer; }
    .sc-range { width: 100%; accent-color: var(--accent, #5b8df6); }
    #scPreviewWrap { display: flex; gap: 16px; }
    #scPreviewCanvas { border-radius: 6px; border: 1px solid var(--border, #2a2d32); flex-shrink: 0; image-rendering: pixelated; }
    #scPreviewCode {
      flex: 1; overflow: auto;
      background: var(--bg-deep, #111);
      border: 1px solid var(--border, #2a2d32);
      border-radius: 6px; padding: 10px;
      max-height: 300px;
    }
    #scPreviewPre { margin: 0; font-size: 10px; line-height: 1.5; white-space: pre; color: var(--prose, #ccc); }
  `;
  document.head.appendChild(style);
}
