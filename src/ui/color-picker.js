/**
 * color-picker.js — F-3.4 (Axe 3)
 *
 * Sélecteur de couleur HSL :
 *   - Roue de teinte (SVG conic-gradient canvas)
 *   - Triangle S/L interne
 *   - Inputs HEX / RGB / HSL / HSV
 *   - Canal alpha
 *   - EyeDropper (si disponible dans le navigateur)
 *   - Harmonies (complémentaire, triadique, analogue)
 *   - Historique 8 couleurs
 *
 * API publique :
 *   openHSLPicker(swatch, compIds, opts)  — ouvre ancré sur swatch
 *   closeHSLPicker()
 */

import { state } from '../core/state.js';
import { detectColorScale, componentsToHex, hexToComponents } from './slider-color.js';
import { onValChange } from './slider.js';

// ── État module ───────────────────────────────────────────────────────────────

let _picker = null;
let _activeSwatch = null;
let _compIds = [];
let _scale = 1;
let _history = [];  // max 8 hex strings
const MAX_HISTORY = 8;

// ── API publique ──────────────────────────────────────────────────────────────

export function openHSLPicker(swatch, compIds, opts = {}) {
  _compIds = compIds;
  _activeSwatch = swatch;

  const vals = compIds.map(id => state.varMap[id]?.value ?? 0);
  _scale = detectColorScale(vals);

  if (!_picker) _buildPicker();
  _refreshFromState();
  _positionPicker(swatch);
  _picker.hidden = false;
}

export function closeHSLPicker() {
  if (_picker) _picker.hidden = true;
  _activeSwatch = null;
}

// ── Construction ──────────────────────────────────────────────────────────────

function _buildPicker() {
  _injectStyles();

  const el = document.createElement('div');
  el.id = 'hslPicker';
  el.hidden = true;
  el.innerHTML = `
    <div id="hslWheel">
      <canvas id="hslWheelCanvas" width="180" height="180"></canvas>
      <canvas id="hslTriCanvas" width="180" height="180"></canvas>
      <div id="hslWheelThumb"></div>
      <div id="hslTriThumb"></div>
    </div>
    <div id="hslAlphaRow">
      <canvas id="hslAlphaCanvas" width="160" height="14"></canvas>
      <div id="hslAlphaThumb"></div>
      <span id="hslAlphaVal">100%</span>
    </div>
    <div id="hslModeRow">
      <button class="hsl-mode-btn active" data-mode="hex">HEX</button>
      <button class="hsl-mode-btn" data-mode="rgb">RGB</button>
      <button class="hsl-mode-btn" data-mode="hsl">HSL</button>
      <button class="hsl-mode-btn" data-mode="hsv">HSV</button>
      <button id="hslEyedropper" title="Pick color from screen (EyeDropper)" style="${typeof EyeDropper === 'undefined' ? 'display:none' : ''}">&#9698;</button>
    </div>
    <div id="hslInputs">
      <div class="hsl-inp-row" data-mode="hex">
        <input id="hslHexInp" class="hsl-inp hsl-inp-wide" maxlength="8" spellcheck="false" placeholder="RRGGBB">
      </div>
      <div class="hsl-inp-row" data-mode="rgb" hidden>
        <input class="hsl-inp" id="hslR" type="number" min="0" max="255" step="1" placeholder="R">
        <input class="hsl-inp" id="hslG" type="number" min="0" max="255" step="1" placeholder="G">
        <input class="hsl-inp" id="hslB" type="number" min="0" max="255" step="1" placeholder="B">
      </div>
      <div class="hsl-inp-row" data-mode="hsl" hidden>
        <input class="hsl-inp" id="hslH" type="number" min="0" max="360" step="1" placeholder="H">
        <input class="hsl-inp" id="hslS" type="number" min="0" max="100" step="1" placeholder="S">
        <input class="hsl-inp" id="hslL" type="number" min="0" max="100" step="1" placeholder="L">
      </div>
      <div class="hsl-inp-row" data-mode="hsv" hidden>
        <input class="hsl-inp" id="hslHv" type="number" min="0" max="360" step="1" placeholder="H">
        <input class="hsl-inp" id="hslSv" type="number" min="0" max="100" step="1" placeholder="S">
        <input class="hsl-inp" id="hslV" type="number" min="0" max="100" step="1" placeholder="V">
      </div>
    </div>
    <div id="hslHarmonies">
      <div class="hsl-harm-row">
        <div class="hsl-harm-swatch" id="hslHarmComp" title="Complementary"></div>
        <div class="hsl-harm-swatch" id="hslHarmTri0" title="Triadic 1"></div>
        <div class="hsl-harm-swatch" id="hslHarmTri1" title="Triadic 2"></div>
        <div class="hsl-harm-swatch" id="hslHarmAn0" title="Analogous -30°"></div>
        <div class="hsl-harm-swatch" id="hslHarmAn1" title="Analogous +30°"></div>
      </div>
    </div>
    <div id="hslHistory"></div>
  `;
  document.body.appendChild(el);
  _picker = el;

  _drawHueWheel();
  _bindEvents();

  document.addEventListener('click', e => {
    if (_picker.hidden) return;
    if (_picker.contains(e.target)) return;
    if (_activeSwatch && _activeSwatch.contains(e.target)) return;
    closeHSLPicker();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeHSLPicker(); });
}

// ── Roue de teinte ────────────────────────────────────────────────────────────

function _drawHueWheel() {
  const canvas = _picker.querySelector('#hslWheelCanvas');
  const ctx = canvas.getContext('2d');
  const cx = 90, cy = 90, R = 84, r = 56;

  for (let deg = 0; deg < 360; deg++) {
    const a0 = (deg - 0.5) * Math.PI / 180;
    const a1 = (deg + 0.5) * Math.PI / 180;
    const grad = ctx.createLinearGradient(
      cx + R * Math.cos(a0), cy + R * Math.sin(a0),
      cx + R * Math.cos(a1), cy + R * Math.sin(a1)
    );
    grad.addColorStop(0, `hsl(${deg}, 100%, 50%)`);
    grad.addColorStop(1, `hsl(${deg + 1}, 100%, 50%)`);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, a0, a1);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
  }
  // Punch hole
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
}

function _drawTriangle(h) {
  const canvas = _picker.querySelector('#hslTriCanvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 180, 180);

  const cx = 90, cy = 90, R = 52;
  // Equilateral triangle rotated by h (degrees)
  const rad = h * Math.PI / 180;
  const pts = [0, 1, 2].map(i => {
    const a = rad + (i * 2 * Math.PI / 3);
    return [cx + R * Math.cos(a), cy + R * Math.sin(a)];
  });

  // White corner, black corner, hue corner
  const [pHue, pWhite, pBlack] = pts;

  const grad1 = ctx.createLinearGradient(pHue[0], pHue[1], (pWhite[0] + pBlack[0]) / 2, (pWhite[1] + pBlack[1]) / 2);
  grad1.addColorStop(0, `hsl(${h}, 100%, 50%)`);
  grad1.addColorStop(1, 'white');
  ctx.beginPath();
  ctx.moveTo(...pHue); ctx.lineTo(...pWhite); ctx.lineTo(...pBlack); ctx.closePath();
  ctx.fillStyle = grad1; ctx.fill();

  const grad2 = ctx.createLinearGradient(pHue[0], pHue[1], (pWhite[0] + pBlack[0]) / 2, (pWhite[1] + pBlack[1]) / 2);
  grad2.addColorStop(0, 'transparent');
  grad2.addColorStop(1, 'black');
  ctx.beginPath();
  ctx.moveTo(...pHue); ctx.lineTo(...pWhite); ctx.lineTo(...pBlack); ctx.closePath();
  ctx.globalAlpha = 0.9; ctx.fillStyle = grad2; ctx.fill(); ctx.globalAlpha = 1;
}

// ── Conversions couleur ────────────────────────────────────────────────────────

function _rgb01ToHsl(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h * 360, s * 100, l * 100];
}

function _hslToRgb01(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  return [hue2rgb(h + 1/3), hue2rgb(h), hue2rgb(h - 1/3)];
}

function _rgb01ToHsv(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const v = max, d = max - min;
  const s = max === 0 ? 0 : d / max;
  let h = 0;
  if (max !== min) {
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h * 360, s * 100, v * 100];
}

function _hsvToRgb01(h, s, v) {
  h /= 360; s /= 100; v /= 100;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: return [v, t, p];
    case 1: return [q, v, p];
    case 2: return [p, v, t];
    case 3: return [p, q, v];
    case 4: return [t, p, v];
    default: return [v, p, q];
  }
}

function _getRgb01() {
  if (!_compIds.length) return [0, 0, 0];
  const vals = _compIds.map(id => state.varMap[id]?.value ?? 0);
  const to01 = v => _scale === 1 ? v : v / 255;
  return vals.slice(0, 3).map(to01);
}

function _getAlpha01() {
  if (_compIds.length < 4) return 1;
  const v = state.varMap[_compIds[3]]?.value ?? (_scale === 1 ? 1 : 255);
  return _scale === 1 ? v : v / 255;
}

function _applyRgb01(r, g, b) {
  const fromUI = v => _scale === 1 ? v : v * 255;
  onValChange(_compIds[0], fromUI(r));
  onValChange(_compIds[1], fromUI(g));
  onValChange(_compIds[2], fromUI(b));
}

// ── Refresh UI depuis l'état ──────────────────────────────────────────────────

function _refreshFromState() {
  const [r, g, b] = _getRgb01();
  const a = _getAlpha01();
  const [h, s, l] = _rgb01ToHsl(r, g, b);

  _updateWheelThumb(h);
  _updateTriThumb(h, s, l);
  _drawTriangle(h);
  _updateAlphaBar(r, g, b, a);
  _updateInputs(r, g, b, a);
  _updateHarmonies(h, s, l);
}

function _updateWheelThumb(h) {
  const thumb = _picker.querySelector('#hslWheelThumb');
  const cx = 90, cy = 90, rad = 70;
  const a = (h - 90) * Math.PI / 180;
  const x = cx + rad * Math.cos(a);
  const y = cy + rad * Math.sin(a);
  thumb.style.left = x + 'px';
  thumb.style.top = y + 'px';
}

function _updateTriThumb(h, s, l) {
  const thumb = _picker.querySelector('#hslTriThumb');
  const cx = 90, cy = 90, R = 52;
  const rad = (h - 90) * Math.PI / 180;
  const [pHue, pWhite, pBlack] = [0, 1, 2].map(i => {
    const a = rad + (i * 2 * Math.PI / 3) + Math.PI / 2 * 0;
    // Use h angle from _drawTriangle
    const ang = (h * Math.PI / 180) + (i * 2 * Math.PI / 3);
    return [cx + R * Math.cos(ang), cy + R * Math.sin(ang)];
  });
  // Barycentric from HSL: s=saturation, l=lightness
  const sv = s / 100, lv = l / 100;
  // Approximate: hue corner weight, white corner weight, black corner weight
  const wHue = sv * (2 * lv - lv * lv < 1e-9 ? 0 : Math.min(1, (1 - lv) / (lv < 0.5 ? lv : 1 - lv)));
  const wW = (1 - sv);
  const wB = sv * (1 - 2 * lv < 0 ? 0 : (1 - 2 * lv));
  const wSum = wHue + wW + wB || 1;
  const wx = (pHue[0] * wHue + pWhite[0] * wW + pBlack[0] * wB) / wSum;
  const wy = (pHue[1] * wHue + pWhite[1] * wW + pBlack[1] * wB) / wSum;
  thumb.style.left = wx + 'px';
  thumb.style.top = wy + 'px';
  const [r, g, b] = _hslToRgb01(h, s, l);
  thumb.style.background = `rgb(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)})`;
}

function _updateAlphaBar(r, g, b, a) {
  const canvas = _picker.querySelector('#hslAlphaCanvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 160, 14);
  const chk = ctx.createPattern(_checkerboard(4), 'repeat');
  ctx.fillStyle = chk; ctx.fillRect(0, 0, 160, 14);
  const grad = ctx.createLinearGradient(0, 0, 160, 0);
  grad.addColorStop(0, `rgba(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)},0)`);
  grad.addColorStop(1, `rgba(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)},1)`);
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 160, 14);

  const thumb = _picker.querySelector('#hslAlphaThumb');
  thumb.style.left = (a * 160) + 'px';
  const val = _picker.querySelector('#hslAlphaVal');
  if (val) val.textContent = Math.round(a * 100) + '%';
}

function _checkerboard(sz) {
  const c = document.createElement('canvas');
  c.width = c.height = sz * 2;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ccc'; ctx.fillRect(0, 0, sz*2, sz*2);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, sz, sz); ctx.fillRect(sz, sz, sz, sz);
  return c;
}

function _updateInputs(r, g, b, a) {
  const mode = _picker.querySelector('.hsl-mode-btn.active')?.dataset.mode || 'hex';
  const hex = _toHex(r, g, b, a);
  if (mode === 'hex') {
    const inp = _picker.querySelector('#hslHexInp');
    if (inp && document.activeElement !== inp) inp.value = hex.slice(1);
  } else if (mode === 'rgb') {
    _setInp('#hslR', Math.round(r * 255));
    _setInp('#hslG', Math.round(g * 255));
    _setInp('#hslB', Math.round(b * 255));
  } else if (mode === 'hsl') {
    const [h, s, l] = _rgb01ToHsl(r, g, b);
    _setInp('#hslH', Math.round(h));
    _setInp('#hslS', Math.round(s));
    _setInp('#hslL', Math.round(l));
  } else if (mode === 'hsv') {
    const [h, s, v] = _rgb01ToHsv(r, g, b);
    _setInp('#hslHv', Math.round(h));
    _setInp('#hslSv', Math.round(s));
    _setInp('#hslV', Math.round(v));
  }
}

function _setInp(sel, val) {
  const el = _picker.querySelector(sel);
  if (el && document.activeElement !== el) el.value = String(val);
}

function _toHex(r, g, b, a) {
  const h = v => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0');
  const hex = '#' + h(r) + h(g) + h(b);
  return (_compIds.length >= 4 && a < 1 - 1e-4) ? hex + h(a) : hex;
}

function _updateHarmonies(h, s, l) {
  const mk = (hue) => `hsl(${hue % 360}, ${Math.round(s)}%, ${Math.round(l)}%)`;
  _picker.querySelector('#hslHarmComp').style.background = mk(h + 180);
  _picker.querySelector('#hslHarmTri0').style.background = mk(h + 120);
  _picker.querySelector('#hslHarmTri1').style.background = mk(h + 240);
  _picker.querySelector('#hslHarmAn0').style.background = mk(h - 30);
  _picker.querySelector('#hslHarmAn1').style.background = mk(h + 30);
}

// ── Gestion historique ────────────────────────────────────────────────────────

function _pushHistory(hex) {
  if (_history[0] === hex) return;
  _history = [hex, ..._history.filter(h => h !== hex)].slice(0, MAX_HISTORY);
  _renderHistory();
}

function _renderHistory() {
  const el = _picker.querySelector('#hslHistory');
  el.innerHTML = _history.map(hex =>
    `<div class="hsl-hist-swatch" style="background:${hex}" data-hex="${hex}" title="${hex}"></div>`
  ).join('');
  el.querySelectorAll('.hsl-hist-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      const comps = hexToComponents(sw.dataset.hex.slice(1), _scale);
      if (!comps) return;
      _compIds.slice(0, comps.length).forEach((id, i) => onValChange(id, comps[i]));
      setTimeout(_refreshFromState, 16);
    });
  });
}

// ── Binding événements ────────────────────────────────────────────────────────

function _bindEvents() {
  // Mode tabs
  _picker.querySelectorAll('.hsl-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _picker.querySelectorAll('.hsl-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.dataset.mode;
      _picker.querySelectorAll('.hsl-inp-row').forEach(row => {
        row.hidden = row.dataset.mode !== mode;
      });
      _refreshFromState();
    });
  });

  // Wheel drag
  const wheel = _picker.querySelector('#hslWheelCanvas');
  const triCanvas = _picker.querySelector('#hslTriCanvas');
  _bindWheelDrag(wheel);
  _bindTriDrag(triCanvas);

  // Alpha bar drag
  _bindAlphaDrag();

  // Inputs
  _picker.querySelector('#hslHexInp').addEventListener('input', e => {
    const comps = hexToComponents(e.target.value, _scale);
    if (!comps) return;
    _compIds.slice(0, comps.length).forEach((id, i) => onValChange(id, comps[i]));
    setTimeout(_refreshFromState, 16);
  });

  ['hslR', 'hslG', 'hslB'].forEach((id, ch) => {
    _picker.querySelector('#' + id)?.addEventListener('input', e => {
      const v = _scale === 1 ? Number(e.target.value) / 255 : Number(e.target.value);
      onValChange(_compIds[ch], v);
      setTimeout(_refreshFromState, 16);
    });
  });

  ['hslH', 'hslS', 'hslL'].forEach((id) => {
    _picker.querySelector('#' + id)?.addEventListener('input', () => {
      const h = Number(_picker.querySelector('#hslH').value);
      const s = Number(_picker.querySelector('#hslS').value);
      const l = Number(_picker.querySelector('#hslL').value);
      const [r, g, b] = _hslToRgb01(h, s, l);
      _applyRgb01(r, g, b);
      setTimeout(_refreshFromState, 16);
    });
  });

  ['hslHv', 'hslSv', 'hslV'].forEach(() => {
    ['hslHv', 'hslSv', 'hslV'].forEach(id => {
      _picker.querySelector('#' + id)?.addEventListener('input', () => {
        const h = Number(_picker.querySelector('#hslHv').value);
        const s = Number(_picker.querySelector('#hslSv').value);
        const v = Number(_picker.querySelector('#hslV').value);
        const [r, g, b] = _hsvToRgb01(h, s, v);
        _applyRgb01(r, g, b);
        setTimeout(_refreshFromState, 16);
      });
    });
  });

  // Harmonies click
  _picker.querySelectorAll('.hsl-harm-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      const bg = sw.style.background;
      // Extract hsl values and apply
      const m = bg.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
      if (!m) return;
      const [r, g, b] = _hslToRgb01(Number(m[1]), Number(m[2]), Number(m[3]));
      _applyRgb01(r, g, b);
      setTimeout(_refreshFromState, 16);
    });
  });

  // EyeDropper
  const eyedropperBtn = _picker.querySelector('#hslEyedropper');
  eyedropperBtn?.addEventListener('click', async () => {
    try {
      const dropper = new EyeDropper();
      const result = await dropper.open();
      const comps = hexToComponents(result.sRGBHex.slice(1), _scale);
      if (!comps) return;
      _compIds.slice(0, comps.length).forEach((id, i) => onValChange(id, comps[i]));
      _pushHistory(result.sRGBHex);
      setTimeout(_refreshFromState, 16);
    } catch (_) { /* user cancelled */ }
  });
}

function _bindWheelDrag(canvas) {
  let dragging = false;
  const pick = (ev) => {
    const r = canvas.getBoundingClientRect();
    const x = ev.clientX - r.left - 90, y = ev.clientY - r.top - 90;
    const dist = Math.sqrt(x * x + y * y);
    if (dist < 50 || dist > 88) return; // outside ring
    let h = Math.atan2(y, x) * 180 / Math.PI + 90;
    if (h < 0) h += 360;
    const [, s, l] = _rgb01ToHsl(..._getRgb01());
    const [nr, ng, nb] = _hslToRgb01(h, s, l);
    _applyRgb01(nr, ng, nb);
    setTimeout(_refreshFromState, 16);
  };
  canvas.addEventListener('pointerdown', e => { dragging = true; canvas.setPointerCapture(e.pointerId); pick(e); });
  canvas.addEventListener('pointermove', e => { if (dragging) pick(e); });
  canvas.addEventListener('pointerup', () => {
    dragging = false;
    const [r, g, b] = _getRgb01();
    const a = _getAlpha01();
    _pushHistory(_toHex(r, g, b, a));
  });
}

function _bindTriDrag(canvas) {
  let dragging = false;
  const pick = (ev) => {
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
    const [h] = _rgb01ToHsl(..._getRgb01());
    const cx = 90, cy = 90, R = 52;
    const ang = h * Math.PI / 180;
    const pts = [0, 1, 2].map(i => {
      const a = ang + (i * 2 * Math.PI / 3);
      return [cx + R * Math.cos(a), cy + R * Math.sin(a)];
    });
    const [pHue, pWhite, pBlack] = pts;
    // Barycentric coordinates of click
    const denom = (pWhite[1] - pBlack[1]) * (pHue[0] - pBlack[0]) + (pBlack[0] - pWhite[0]) * (pHue[1] - pBlack[1]);
    if (Math.abs(denom) < 1e-6) return;
    let wH = ((pWhite[1] - pBlack[1]) * (x - pBlack[0]) + (pBlack[0] - pWhite[0]) * (y - pBlack[1])) / denom;
    let wW = ((pBlack[1] - pHue[1]) * (x - pBlack[0]) + (pHue[0] - pBlack[0]) * (y - pBlack[1])) / denom;
    let wB = 1 - wH - wW;
    wH = Math.max(0, wH); wW = Math.max(0, wW); wB = Math.max(0, wB);
    const sum = wH + wW + wB || 1;
    wH /= sum; wW /= sum; wB /= sum;
    // White and black corners fix s and l
    const s = wH * 100 / (wH + wW < 1e-9 ? 1e-9 : wH + wW) * (1 - wB);
    const l = (1 - wB) * 50 + wB * 0;
    const [r, g, b] = _hslToRgb01(h, s * (1 - wB / (1 - wH || 1e-9)), Math.max(0, Math.min(100, (wW + wH * 0.5) * 100)));
    _applyRgb01(Math.max(0, Math.min(1, r)), Math.max(0, Math.min(1, g)), Math.max(0, Math.min(1, b)));
    setTimeout(_refreshFromState, 16);
  };
  canvas.addEventListener('pointerdown', e => { dragging = true; canvas.setPointerCapture(e.pointerId); pick(e); });
  canvas.addEventListener('pointermove', e => { if (dragging) pick(e); });
  canvas.addEventListener('pointerup', () => {
    dragging = false;
    const [r, g, b] = _getRgb01();
    const a = _getAlpha01();
    _pushHistory(_toHex(r, g, b, a));
  });
}

function _bindAlphaDrag() {
  if (_compIds.length < 4) return;
  const canvas = _picker.querySelector('#hslAlphaCanvas');
  let dragging = false;
  const pick = (ev) => {
    const r = canvas.getBoundingClientRect();
    const alpha = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
    onValChange(_compIds[3], _scale === 1 ? alpha : alpha * 255);
    setTimeout(_refreshFromState, 16);
  };
  canvas.addEventListener('pointerdown', e => { dragging = true; canvas.setPointerCapture(e.pointerId); pick(e); });
  canvas.addEventListener('pointermove', e => { if (dragging) pick(e); });
  canvas.addEventListener('pointerup', () => { dragging = false; });
}

// ── Positionnement ────────────────────────────────────────────────────────────

function _positionPicker(swatch) {
  const rect = swatch.getBoundingClientRect();
  const pw = _picker.offsetWidth || 210;
  const ph = _picker.offsetHeight || 380;
  let left = Math.min(rect.left, window.innerWidth - pw - 8);
  left = Math.max(8, left);
  let top = rect.bottom + 6;
  if (top + ph > window.innerHeight - 8) top = Math.max(8, rect.top - ph - 6);
  _picker.style.left = left + 'px';
  _picker.style.top = top + 'px';
}

// ── Styles ────────────────────────────────────────────────────────────────────

function _injectStyles() {
  if (document.getElementById('hslPickerStyles')) return;
  const s = document.createElement('style');
  s.id = 'hslPickerStyles';
  s.textContent = `
    #hslPicker {
      position: fixed; z-index: 1700;
      background: var(--bg-surface, #cdcdcd);
      border: 1px solid var(--border, #a8a8a8);
      border-radius: var(--radius-md);
      width: 210px;
      padding: 8px;
      box-shadow: 0 12px 40px rgba(0,0,0,.6);
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: var(--prose, #242424);
      display: flex; flex-direction: column; gap: 8px;
    }
    #hslPicker[hidden] { display: none; }
    #hslWheel { position: relative; width: 180px; height: 180px; margin: 0 auto; }
    #hslWheelCanvas, #hslTriCanvas { position: absolute; top: 0; left: 0; cursor: crosshair; }
    #hslTriCanvas { pointer-events: none; }
    #hslWheelThumb, #hslTriThumb {
      position: absolute; width: 10px; height: 10px;
      border-radius: 50%; border: 2px solid #fff;
      transform: translate(-50%, -50%); pointer-events: none;
      box-shadow: 0 0 3px rgba(0,0,0,.8);
    }
    #hslWheelThumb { background: transparent; }
    #hslAlphaRow { position: relative; height: 14px; margin: 0 8px; }
    #hslAlphaCanvas { border-radius: 7px; width: 160px; }
    #hslAlphaThumb {
      position: absolute; top: -1px; width: 12px; height: 16px;
      border-radius: 3px; border: 2px solid #fff;
      transform: translateX(-50%); pointer-events: none;
      background: transparent; box-shadow: 0 0 2px rgba(0,0,0,.6);
    }
    #hslAlphaVal { position: absolute; right: -20px; top: 0; font-size: 9px; color: var(--t3, #7e7e7e); }
    #hslModeRow { display: flex; gap: 4px; }
    .hsl-mode-btn {
      flex: 1; padding: 3px 4px; font-size: 9px; border-radius: 3px;
      background: var(--bg-deep, #e2e2e2); border: 1px solid var(--border, #a8a8a8);
      color: var(--t3, #7e7e7e); cursor: pointer; font-family: inherit;
    }
    .hsl-mode-btn.active { background: var(--accent, #0b5650); color: var(--text-inverse, #fff); border-color: transparent; }
    #hslEyedropper { padding: 3px 6px; font-size: 11px; border-radius: 3px;
      background: var(--bg-deep, #e2e2e2); border: 1px solid var(--border, #a8a8a8);
      color: var(--t3, #7e7e7e); cursor: pointer; }
    #hslInputs { display: flex; flex-direction: column; gap: 4px; }
    .hsl-inp-row { display: flex; gap: 4px; }
    .hsl-inp {
      flex: 1; background: var(--bg-deep, #e2e2e2);
      border: 1px solid var(--border, #a8a8a8);
      color: var(--prose, #242424); border-radius: 3px; padding: 4px 5px;
      font-family: inherit; font-size: 10px; outline: none;
    }
    .hsl-inp:focus { border-color: var(--accent, #0b5650); }
    .hsl-inp-wide { flex: 1; }
    #hslHarmonies { display: flex; flex-direction: column; gap: 4px; }
    .hsl-harm-row { display: flex; gap: 4px; }
    .hsl-harm-swatch {
      flex: 1; height: 16px; border-radius: 3px; cursor: pointer;
      border: 1px solid rgba(0,0,0,.15);
    }
    .hsl-harm-swatch:hover { transform: scaleY(1.2); transition: transform 0.1s; }
    #hslHistory { display: flex; gap: 4px; flex-wrap: wrap; min-height: 16px; }
    .hsl-hist-swatch {
      width: 16px; height: 16px; border-radius: 3px; cursor: pointer;
      border: 1px solid rgba(0,0,0,.15);
    }
    .hsl-hist-swatch:hover { outline: 2px solid var(--accent, #0b5650); }
  `;
  document.head.appendChild(s);
}
