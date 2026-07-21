// §A.2 (UI v2) — Édition de couleur inline
//
// Détecte les littéraux couleur (vec3/vec4 à composantes 0..1) dans le code,
// affiche une pastille dans la marge, et ouvre au clic un sélecteur de couleur
// (natif) + une pipette (EyeDropper API, sinon échantillon du canvas).
// Le choix réécrit le littéral vec dans l'éditeur, en direct.

import * as monaco from 'monaco-editor';
import { state } from '../core/state.js';
import { applyAndParse, toast } from '../io/actions.js';

// vec3/vec4 avec 1, 3 ou 4 composantes numériques
// Exporté pour réutilisation par hover-inspector.js (Phase X — swatch dans le hover Monaco).
export const VEC_RE = /\bvec([34])\(\s*([0-9.]+)\s*(?:,\s*([0-9.]+)\s*)?(?:,\s*([0-9.]+)\s*)?(?:,\s*([0-9.]+)\s*)?\)/g;

let _decoIds = [];
let _styleEl = null;
const _classCache = new Map(); // hex → className
let _byLine = new Map();       // lineNumber → {startCol,endCol,kind,r,g,b,a}
let _deb = null;

function _injectClass(hex) {
  if (_classCache.has(hex)) return _classCache.get(hex);
  if (!_styleEl) { _styleEl = document.createElement('style'); document.head.appendChild(_styleEl); }
  const cls = 'zgl-swatch-' + hex.slice(1);
  _styleEl.appendChild(document.createTextNode(
    `.${cls}::before{content:'';display:inline-block;width:10px;height:10px;margin:0 2px;border-radius:2px;`
    + `border:1px solid rgba(128,128,128,.5);background:${hex};vertical-align:middle;cursor:pointer}`));
  _classCache.set(hex, cls);
  return cls;
}

export function toHex(r, g, b) {
  const h = v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
  return '#' + h(r) + h(g) + h(b);
}
const _toHex = toHex;

export function isColor(parts) {
  return parts.every(v => v >= 0 && v <= 1);
}
const _isColor = isColor;

function _scan() {
  if (!state.editor) return;
  const model = state.editor.getModel();
  if (!model) return;
  const decos = [];
  _byLine = new Map();
  const lineCount = model.getLineCount();
  for (let ln = 1; ln <= lineCount; ln++) {
    const text = model.getLineContent(ln);
    if (!text.includes('vec')) continue;
    VEC_RE.lastIndex = 0;
    let m;
    while ((m = VEC_RE.exec(text)) !== null) {
      const dim = +m[1];
      const comps = [m[2], m[3], m[4], m[5]].filter(x => x !== undefined).map(parseFloat);
      let r, g, b, a = 1;
      if (comps.length === 1) { r = g = b = comps[0]; if (dim === 4) a = comps[0]; }
      else if (comps.length >= 3) { [r, g, b] = comps; if (dim === 4 && comps.length === 4) a = comps[3]; }
      else continue;
      if (!_isColor([r, g, b])) continue;
      const hex = _toHex(r, g, b);
      const startCol = m.index + 1;
      const endCol = m.index + m[0].length + 1;
      _byLine.set(ln, { startCol, endCol, kind: dim, r, g, b, a });
      decos.push({
        range: new monaco.Range(ln, startCol, ln, startCol),
        options: { glyphMarginClassName: _injectClass(hex), glyphMarginHoverMessage: { value: `Color ${hex} — click to edit` }, stickiness: 1 },
      });
    }
  }
  _decoIds = state.editor.deltaDecorations(_decoIds, decos);
}

function _scanDebounced() { clearTimeout(_deb); _deb = setTimeout(_scan, 250); }

// ── HSL ↔ RGB helpers ────────────────────────────────────────────────────────

function _rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      default: h = ((r - g) / d + 4) / 6;
    }
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function _hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => { const k = (n + h / 30) % 12; const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(v * 255).toString(16).padStart(2, '0'); };
  return '#' + f(0) + f(8) + f(4);
}

// ── Picker popover ───────────────────────────────────────────────────────────
let _pop = null;
function _closePicker() { if (_pop) { _pop.remove(); _pop = null; } }

function _openPicker(ln, info, clientX, clientY) {
  _closePicker();
  const hex = _toHex(info.r, info.g, info.b);
  const [initH, initS, initL] = _rgbToHsl(info.r, info.g, info.b);

  _pop = document.createElement('div');
  _pop.className = 'zgl-color-pop';
  _pop.innerHTML = `
    <div class="zgl-pop-row">
      <input type="color" id="zgl-col-input" value="${hex}" aria-label="Pick color">
      <span id="zgl-col-hex">${hex}</span>
      <button id="zgl-col-eye" title="Eyedropper" aria-label="Eyedropper">⭯</button>
    </div>
    <div class="zgl-hsl-row"><label>H</label><input type="range" id="zgl-h" min="0" max="360" value="${initH}"><span id="zgl-hv">${initH}°</span></div>
    <div class="zgl-hsl-row"><label>S</label><input type="range" id="zgl-s" min="0" max="100" value="${initS}"><span id="zgl-sv">${initS}%</span></div>
    <div class="zgl-hsl-row"><label>L</label><input type="range" id="zgl-l" min="0" max="100" value="${initL}"><span id="zgl-lv">${initL}%</span></div>`;

  if (!document.getElementById('zgl-pop-style')) {
    const st = document.createElement('style');
    st.id = 'zgl-pop-style';
    st.textContent = `
      .zgl-color-pop{position:fixed;z-index:9999;background:var(--bg-surface,#1a1d22);border:1px solid var(--border,#2a2d32);border-radius:6px;padding:8px;display:flex;flex-direction:column;gap:5px;box-shadow:0 4px 20px rgba(0,0,0,.6);min-width:180px;font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--prose,#ccc);}
      .zgl-pop-row{display:flex;align-items:center;gap:6px;}
      #zgl-col-hex{flex:1;font-size:11px;color:var(--t3,#888);}
      #zgl-col-eye{background:none;border:none;color:var(--t3,#888);cursor:pointer;font-size:14px;padding:0 2px;}
      #zgl-col-eye:hover{color:var(--prose,#ccc);}
      .zgl-hsl-row{display:flex;align-items:center;gap:5px;}
      .zgl-hsl-row label{width:12px;font-size:10px;color:var(--accent,#5b8df6);font-weight:700;}
      .zgl-hsl-row input[type=range]{flex:1;accent-color:var(--accent,#5b8df6);}
      .zgl-hsl-row span{width:32px;text-align:right;font-size:10px;color:var(--t3,#888);}
    `;
    document.head.appendChild(st);
  }

  document.body.appendChild(_pop);
  _pop.style.left = Math.min(clientX, window.innerWidth - 200) + 'px';
  _pop.style.top = (clientY + 8) + 'px';

  const apply = (hexStr) => {
    const r = parseInt(hexStr.slice(1, 3), 16) / 255;
    const g = parseInt(hexStr.slice(3, 5), 16) / 255;
    const b = parseInt(hexStr.slice(5, 7), 16) / 255;
    const f = v => v.toFixed(3).replace(/\.?0+$/, '') || '0';
    const cur = _byLine.get(ln);
    if (!cur) return;
    const text = info.kind === 4 ? `vec4(${f(r)}, ${f(g)}, ${f(b)}, ${f(info.a)})` : `vec3(${f(r)}, ${f(g)}, ${f(b)})`;
    state.editor.executeEdits('color', [{
      range: new monaco.Range(ln, cur.startCol, ln, cur.endCol),
      text, forceMoveMarkers: true,
    }]);
    clearTimeout(_deb); _deb = setTimeout(() => { _scan(); try { applyAndParse(); } catch { /* noop */ } }, 60);
  };

  const syncFromHex = (hexStr) => {
    const r = parseInt(hexStr.slice(1, 3), 16) / 255;
    const g = parseInt(hexStr.slice(3, 5), 16) / 255;
    const b = parseInt(hexStr.slice(5, 7), 16) / 255;
    const [h, s, l] = _rgbToHsl(r, g, b);
    _pop.querySelector('#zgl-h').value = String(h);
    _pop.querySelector('#zgl-s').value = String(s);
    _pop.querySelector('#zgl-l').value = String(l);
    _pop.querySelector('#zgl-hv').textContent = h + '°';
    _pop.querySelector('#zgl-sv').textContent = s + '%';
    _pop.querySelector('#zgl-lv').textContent = l + '%';
    _pop.querySelector('#zgl-col-hex').textContent = hexStr;
  };

  const syncFromHSL = () => {
    const h = +_pop.querySelector('#zgl-h').value;
    const s = +_pop.querySelector('#zgl-s').value;
    const l = +_pop.querySelector('#zgl-l').value;
    const hexStr = _hslToHex(h, s, l);
    _pop.querySelector('#zgl-col-input').value = hexStr;
    _pop.querySelector('#zgl-col-hex').textContent = hexStr;
    _pop.querySelector('#zgl-hv').textContent = h + '°';
    _pop.querySelector('#zgl-sv').textContent = s + '%';
    _pop.querySelector('#zgl-lv').textContent = l + '%';
    apply(hexStr);
  };

  const input = /** @type {HTMLInputElement} */ (_pop.querySelector('#zgl-col-input'));
  input.addEventListener('input', () => { apply(input.value); syncFromHex(input.value); });

  for (const id of ['zgl-h', 'zgl-s', 'zgl-l']) {
    _pop.querySelector('#' + id).addEventListener('input', syncFromHSL);
  }

  _pop.querySelector('#zgl-col-eye').addEventListener('click', async () => {
    const ED = /** @type {any} */ (window).EyeDropper;
    if (ED) {
      try { const res = await new ED().open(); input.value = res.sRGBHex; apply(res.sRGBHex); syncFromHex(res.sRGBHex); }
      catch { /* annulé */ }
    } else {
      toast('Eyedropper not supported — pick from the color field', 'warn');
    }
  });
  setTimeout(() => document.addEventListener('mousedown', _onDocDown, { once: true }), 0);
}
function _onDocDown(e) { if (_pop && !_pop.contains(e.target)) _closePicker(); }

function _onEditorMouseDown(e) {
  const t = e.target;
  if (!t || t.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) return;
  const ln = t.position?.lineNumber;
  if (!ln || !_byLine.has(ln)) return;
  const info = _byLine.get(ln);
  const ev = e.event?.browserEvent || e.event;
  _openPicker(ln, info, ev?.clientX ?? 200, ev?.clientY ?? 200);
}

export function initColorInline() {
  if (!state.editor) return;
  // glyphMargin est déjà activé dans les options de l'éditeur
  _scan();
  state.editor.onDidChangeModelContent(() => _scanDebounced());
  state.editor.onMouseDown(_onEditorMouseDown);
}
