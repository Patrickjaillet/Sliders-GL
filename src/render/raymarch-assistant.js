
// ── Phase 15.3 / Phase 5 — Ray Marching Assistant ────────────────────────────

import { state } from '../core/state.js';
import { makeDraggablePersistent } from '../ui/panel-manager.js';
import { smartInsert } from '../ui/smart-insert.js';

// ─── Static pattern detection ─────────────────────────────────────────────────

const RAYMARCH_PATTERNS = [
  /\brayMarch\b/i, /\bray_march\b/i, /\brmarch\b/i,
  /\bMAX_STEPS\b/, /\bMAX_DIST\b/, /\bSURF_DIST\b/,
  /\bfloat\s+dO\s*=\s*0\./, /\bfor\s*\(.*?steps.*?\)/i,
  /\bro\s*\+\s*rd\s*\*/, /\brad\s*\*\s*t\b/,
];

const SDF_PATTERNS = [
  /\bsdf\b/i, /\bsdSphere\b/, /\bsdBox\b/, /\bsdTorus\b/,
  /\bgetDist\b/, /\bscene\s*\(/, /\bmap\s*\(/,
  /\bopSmoothUnion\b/, /\blength\s*\(\s*p\s*\)\s*-/,
];

export function detectRaymarch(src) {
  const hasMarch = RAYMARCH_PATTERNS.some(r => r.test(src));
  const hasSdf   = SDF_PATTERNS.some(r => r.test(src));
  return { hasMarch, hasSdf, isRaymarchShader: hasMarch || hasSdf };
}

function extractConstValue(src, name) {
  const m = src.match(new RegExp(`(?:#define|const\\s+(?:int|float)?)\\s+${name}\\s+([\\d.]+)`));
  return m ? parseFloat(m[1]) : null;
}

export function extractRaymarchParams(src) {
  return {
    MAX_STEPS: extractConstValue(src, 'MAX_STEPS') ?? 100,
    MAX_DIST:  extractConstValue(src, 'MAX_DIST')  ?? 100.0,
    SURF_DIST: extractConstValue(src, 'SURF_DIST') ?? 0.001,
    EPSILON:   extractConstValue(src, 'EPSILON')   ?? 0.001,
  };
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

const CSS = `
#zgl-rm-panel {
  position: fixed; bottom: 48px; right: 16px; width: 300px; z-index: 9200;
  background: var(--bg1,#1a1a1e); border: 1px solid var(--bdr,#333);
  border-radius: 8px; font-family: var(--font-mono,monospace); font-size: 12px;
  color: var(--fg,#e0e0e0); box-shadow: 0 8px 32px rgba(0,0,0,.65);
  user-select: none; display: none;
}
#zgl-rm-panel.open { display: block; }
#zgl-rm-panel header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px; border-bottom: 1px solid var(--bdr,#333); cursor: move;
}
#zgl-rm-panel header h3 { margin:0; font-size:13px; color:var(--ac1,#7eb8f7); }
#zgl-rm-panel .rm-body { padding:10px 12px; display:flex; flex-direction:column; gap:10px; }
#zgl-rm-panel .rm-detect {
  padding:6px 8px; border-radius:4px; font-size:11px; display:flex; align-items:center; gap:6px;
  background:var(--bg2,#252529); border:1px solid var(--bdr,#333);
}
#zgl-rm-panel .rm-detect.active { background:#1a2a1a; border-color:#4caf50; color:#81c784; }
#zgl-rm-panel .rm-detect.inactive { background:#2a2a1a; border-color:#888; color:var(--fg2,#aaa); }
#zgl-rm-panel .rm-dot { width:7px;height:7px;border-radius:50%; flex-shrink:0; }
#zgl-rm-panel .rm-detect.active .rm-dot { background:#4caf50; }
#zgl-rm-panel .rm-detect.inactive .rm-dot { background:#666; }
#zgl-rm-panel .rm-section-title { font-size:10px; text-transform:uppercase; letter-spacing:.08em; color:var(--fg2,#888); padding-bottom:2px; }
#zgl-rm-panel .rm-row { display:flex; align-items:center; gap:8px; }
#zgl-rm-panel .rm-row label { flex:0 0 90px; font-size:11px; color:var(--fg2,#aaa); }
#zgl-rm-panel .rm-row input[type=range] { flex:1; accent-color:var(--ac1,#7eb8f7); }
#zgl-rm-panel .rm-val { flex:0 0 44px; text-align:right; color:var(--ac3,#7ef7b8); font-size:11px; }
#zgl-rm-panel .rm-btns { display:flex; gap:6px; }
#zgl-rm-panel .rm-btn {
  flex:1; padding:5px 0; border:1px solid var(--bdr,#333); border-radius:4px;
  background:var(--bg2,#252529); color:var(--fg,#e0e0e0); cursor:pointer;
  font-size:11px; transition:background .15s; font-family:inherit;
}
#zgl-rm-panel .rm-btn:hover { background:var(--bg3,#333); }
#zgl-rm-panel .rm-btn.active { background:#1a2e3a; border-color:var(--ac1,#7eb8f7); color:var(--ac1,#7eb8f7); }
#zgl-rm-panel .rm-close {
  background:none; border:none; color:var(--fg2,#aaa); cursor:pointer;
  font-size:16px; line-height:1; padding:0 2px;
}
#zgl-rm-panel .rm-close:hover { color:var(--fg,#e0e0e0); }
#zgl-rm-panel .rm-sdf-viz {
  display:flex; align-items:center; gap:8px;
}
#zgl-rm-panel .rm-sdf-viz canvas {
  width:60px; height:60px; border-radius:4px; border:1px solid var(--bdr,#333);
  image-rendering:pixelated;
}
#zgl-rm-panel .rm-sdf-viz-info { flex:1; font-size:10px; color:var(--fg2,#888); line-height:1.5; }
`;

// ─── Param → code injection ───────────────────────────────────────────────────

function injectParams(src, params) {
  let out = src;
  for (const [name, val] of Object.entries(params)) {
    const defineRx = new RegExp(`(#define\\s+${name}\\s+)[\\d.]+`);
    const constRx  = new RegExp(`(const\\s+(?:int|float)?\\s*${name}\\s*=\\s*)[\\d.]+`);
    if (defineRx.test(out)) out = out.replace(defineRx, `$1${val}`);
    else if (constRx.test(out)) out = out.replace(constRx, `$1${val}`);
  }
  return out;
}

// ─── Panel ─────────────────────────────────────────────────────────────────────

let _open    = false;
let _panel   = null;
let _params  = {};
let _onApply = null;
let _sdfViz  = null;

function _injectCSS() {
  if (document.getElementById('zgl-rm-css')) return;
  const s = document.createElement('style');
  s.id = 'zgl-rm-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

function _makeSlider(name, min, max, step, value, isLog = false) {
  const row   = document.createElement('div');
  row.className = 'rm-row';
  const label = document.createElement('label');
  label.textContent = name;
  const slider = document.createElement('input');
  slider.type = 'range'; slider.min = min; slider.max = max; slider.step = step;
  slider.value = value;
  const disp = document.createElement('span');
  disp.className = 'rm-val';
  disp.textContent = parseFloat(value).toFixed(step < 0.01 ? 4 : step < 1 ? 2 : 0);
  slider.addEventListener('input', () => {
    _params[name] = parseFloat(slider.value);
    disp.textContent = parseFloat(slider.value).toFixed(step < 0.01 ? 4 : step < 1 ? 2 : 0);
    _notifyChange();
  });
  row.append(label, slider, disp);
  return row;
}

function _notifyChange() {
  if (typeof _onApply === 'function') _onApply(_params);
}

function _makeSdfMiniViz() {
  const wrap   = document.createElement('div');
  wrap.className = 'rm-sdf-viz';
  const canvas = document.createElement('canvas');
  canvas.width = 60; canvas.height = 60;
  const info   = document.createElement('div');
  info.className = 'rm-sdf-viz-info';
  info.innerHTML = 'Iso-distance preview<br><span style="color:var(--ac1,#7eb8f7)">→ Full viz: SDF Viz button</span>';
  wrap.append(canvas, info);
  _renderMiniSdfViz(canvas);
  return wrap;
}

function _renderMiniSdfViz(canvas) {
  const ctx  = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const img  = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = (x / W) * 2 - 1;
      const py = (y / H) * 2 - 1;
      const d  = Math.sqrt(px * px + py * py) - 0.5;
      const t  = (Math.sin(d * 20) * 0.5 + 0.5);
      const i  = (y * W + x) * 4;
      if (d < 0) {
        img.data[i]   = 30 + t * 40;
        img.data[i+1] = 100 + t * 50;
        img.data[i+2] = 200 + t * 50;
      } else {
        img.data[i]   = 200 + t * 30;
        img.data[i+1] = 120 + t * 30;
        img.data[i+2] = 30  + t * 20;
      }
      img.data[i+3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// ── Wizard full template ──────────────────────────────────────────────────────

const WIZARD_TEMPLATE = `#define MAX_STEPS 100
#define MAX_DIST  100.0
#define SURF_DIST 0.001

// ── Scene SDF ────────────────────────────────────────────────────────────────
float map(vec3 p) {
    float sphere = length(p) - 1.0;
    float plane  = p.y + 1.0;
    return min(sphere, plane);
}

// ── Normal estimation ─────────────────────────────────────────────────────────
vec3 calcNormal(vec3 p) {
    vec2 e = vec2(1.,-1.) * 0.5773 * 0.001;
    return normalize(e.xyy*map(p+e.xyy)+e.yyx*map(p+e.yyx)+
                     e.yxy*map(p+e.yxy)+e.xxx*map(p+e.xxx));
}

// ── Soft shadow ───────────────────────────────────────────────────────────────
float softShadow(vec3 ro, vec3 rd, float mint, float maxt, float k) {
    float res = 1.0, t = mint;
    for (int i = 0; i < 32; i++) {
        float h = map(ro + rd * t);
        if (h < 0.001) return 0.0;
        res = min(res, k * h / t);
        t += h;
        if (t > maxt) break;
    }
    return clamp(res, 0.0, 1.0);
}

// ── Ray march ─────────────────────────────────────────────────────────────────
float rayMarch(vec3 ro, vec3 rd) {
    float d = 0.0;
    for (int i = 0; i < MAX_STEPS; i++) {
        float h = map(ro + rd * d);
        if (h < SURF_DIST || d > MAX_DIST) break;
        d += h;
    }
    return d;
}

// ── Main ──────────────────────────────────────────────────────────────────────
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5*iResolution.xy) / iResolution.y;

    // Camera
    vec3 ro = vec3(0.0, 0.5, 3.0);
    vec3 rd = normalize(vec3(uv, -1.5));

    vec3 col = vec3(0.12, 0.12, 0.18); // sky

    float d = rayMarch(ro, rd);
    if (d < MAX_DIST) {
        vec3 p  = ro + rd * d;
        vec3 n  = calcNormal(p);
        vec3 ld = normalize(vec3(1.0, 2.0, 1.5)); // light dir

        float diff = max(dot(n, ld), 0.0);
        float sh   = softShadow(p + n*0.002, ld, 0.01, 10.0, 8.0);
        float ao   = clamp(1.0 - 3.0*map(p + 0.05*n)/0.05, 0.0, 1.0);

        col = vec3(0.8) * diff * sh * ao + vec3(0.04) * ao; // albedo + AO fill
    }

    fragColor = vec4(col, 1.0);
}`;

// ── PBR injectable snippets ───────────────────────────────────────────────────

const PBR_SNIPPETS = {
  metallic: `// PBR — Metallic / Roughness (Cook-Torrance GGX)
// n: normal, v: view dir (toward camera), l: light dir, albedo, metallic, roughness
vec3 pbrLight(vec3 n, vec3 v, vec3 l, vec3 albedo, float metallic, float roughness) {
    vec3 F0 = mix(vec3(0.04), albedo, metallic);
    vec3 h  = normalize(v + l);
    float a = roughness * roughness;
    float a2 = a * a;
    float NdH = max(dot(n, h), 0.0);
    float NdV = max(dot(n, v), 0.0);
    float NdL = max(dot(n, l), 0.0);
    float denom = NdH*NdH*(a2-1.0)+1.0;
    float D = a2 / (3.14159*denom*denom);
    float k = (roughness+1.0)*(roughness+1.0)/8.0;
    float G = (NdV/(NdV*(1.0-k)+k)) * (NdL/(NdL*(1.0-k)+k));
    vec3 F = F0 + (1.0-F0)*pow(1.0-max(dot(h,v),0.0), 5.0);
    vec3 spec = D*G*F / max(4.0*NdV*NdL, 0.001);
    vec3 kD = (1.0-F)*(1.0-metallic);
    return (kD*albedo/3.14159 + spec) * NdL;
}`,
  sss: `// Subsurface Scattering (fast translucency approximation)
// col: base color, ld: light dir, nd: surface normal, vd: view dir
// thick: thickness (0=thin, 1=thick), sssColor: SSS tint
vec3 applySSS(vec3 col, vec3 ld, vec3 nd, vec3 vd, float thick, vec3 sssColor) {
    float sss = pow(clamp(dot(vd, -ld) * 0.5 + 0.5, 0.0, 1.0), 3.0) * (1.0 - thick);
    return col + sssColor * sss;
}`,
  iridescence: `// Iridescence (thin-film interference)
// n: normal, v: view dir, ior: index of refraction (~1.4), scale: effect strength
vec3 iridescence(vec3 n, vec3 v, float ior, float scale) {
    float nDotV = clamp(dot(n, v), 0.0, 1.0);
    float phase = acos(nDotV) * ior * 2.0;
    return scale * (0.5 + 0.5*cos(phase + vec3(0.0, 2.094, 4.189)));
}`,
};

function _injectPBR(key) {
  const code = PBR_SNIPPETS[key];
  if (!code) return;
  smartInsert(code, 'function');
}

// ── Extend existing raymarcher ────────────────────────────────────────────────

function _extendRaymarcher(src) {
  const { hasMarch, hasSdf } = detectRaymarch(src);
  if (!hasMarch && !hasSdf) {
    alert('No raymarcher detected in the current shader.');
    return;
  }
  const hasAO     = /calcAO|ambientOcclusion/i.test(src);
  const hasShadow = /softShadow|hardShadow/i.test(src);
  const hasNormal = /calcNormal|getNormal/i.test(src);
  const opts = [];
  if (!hasNormal) opts.push('Normal estimation (calcNormal)');
  if (!hasShadow) opts.push('Soft shadow');
  if (!hasAO)     opts.push('Ambient occlusion');
  if (!opts.length) {
    alert('Raymarcher already has normals, shadows and AO.');
    return;
  }
  const choice = window.prompt(
    'Extensions disponibles :\n' + opts.map((o, i) => `${i + 1}. ${o}`).join('\n') +
    '\nEntrez les numéros séparés par virgule (ex: 1,3) ou "all" :', 'all',
  );
  if (!choice) return;
  const indices = choice === 'all'
    ? opts.map((_, i) => i)
    : choice.split(',').map(s => parseInt(s.trim(), 10) - 1).filter(i => i >= 0 && i < opts.length);

  const INJECTIONS = {
    'Normal estimation (calcNormal)': `// Normal estimation via finite differences
vec3 calcNormal(vec3 p) {
    vec2 e = vec2(1.,-1.) * 0.5773 * 0.001;
    return normalize(e.xyy*map(p+e.xyy)+e.yyx*map(p+e.yyx)+
                     e.yxy*map(p+e.yxy)+e.xxx*map(p+e.xxx));
}`,
    'Soft shadow': `// Soft shadow — requires map(vec3 p)
float softShadow(vec3 ro, vec3 rd, float mint, float maxt, float k) {
    float res = 1.0, t = mint;
    for (int i = 0; i < 32; i++) {
        float h = map(ro + rd * t);
        if (h < 0.001) return 0.0;
        res = min(res, k * h / t);
        t += h;
        if (t > maxt) break;
    }
    return clamp(res, 0.0, 1.0);
}`,
    'Ambient occlusion': `// Ambient occlusion — requires map(vec3 p) and calcNormal(vec3 p)
float calcAO(vec3 pos, vec3 nor) {
    float occ = 0.0, sca = 1.0;
    for (int i = 0; i < 5; i++) {
        float h = 0.01 + 0.12*float(i)/4.0;
        float d = map(pos + h*nor);
        occ += (h - d)*sca;
        sca *= 0.95;
    }
    return clamp(1.0 - 3.0*occ, 0.0, 1.0);
}`,
  };

  for (const i of indices) {
    smartInsert(INJECTIONS[opts[i]], 'function');
  }
}

export function initRaymarchAssistant(/** @type {{onApply?: Function, onOpenSdfViz?: Function}} */ { onApply, onOpenSdfViz } = {}) {
  _injectCSS();
  _onApply = onApply;

  const panel = document.createElement('div');
  panel.id = 'zgl-rm-panel';
  _panel = panel;

  panel.innerHTML = `
    <header>
      <h3>⚡ Ray Marching</h3>
      <button class="rm-close" title="Close" id="zgl-rm-close">✕</button>
    </header>
    <div class="rm-body">
      <div id="zgl-rm-detect" class="rm-detect inactive">
        <span class="rm-dot"></span>
        <span id="zgl-rm-detect-label">No raymarch/SDF pattern detected</span>
      </div>
      <div>
        <div class="rm-section-title">March parameters</div>
        <div id="zgl-rm-sliders"></div>
      </div>
      <div id="zgl-rm-viz-wrap"></div>
      <div class="rm-btns">
        <button class="rm-btn" id="zgl-rm-apply-btn">Apply to shader</button>
        <button class="rm-btn" id="zgl-rm-sdfviz-btn">SDF Visualizer</button>
      </div>
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--fg2,#888);padding-top:2px">Wizard</div>
      <div class="rm-btns">
        <button class="rm-btn" id="zgl-rm-wizard-btn" title="Générer un template raymarch complet">⚡ Full Template</button>
        <button class="rm-btn" id="zgl-rm-extend-btn" title="Étendre le raymarcher existant (AO, ombres, normales)">+ Extend</button>
      </div>
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--fg2,#888);padding-top:2px">PBR Materials</div>
      <div class="rm-btns">
        <button class="rm-btn" id="zgl-rm-pbr-metal-btn" title="Injecter Metallic/Roughness Cook-Torrance GGX">Metal/Rough</button>
        <button class="rm-btn" id="zgl-rm-pbr-sss-btn" title="Injecter Subsurface Scattering">SSS</button>
        <button class="rm-btn" id="zgl-rm-pbr-irid-btn" title="Injecter Iridescence">Iridescence</button>
      </div>
    </div>
  `;

  document.body.appendChild(panel);

  panel.querySelector('#zgl-rm-close').addEventListener('click', () => close());

  panel.querySelector('#zgl-rm-apply-btn').addEventListener('click', () => {
    _notifyChange();
  });

  panel.querySelector('#zgl-rm-sdfviz-btn').addEventListener('click', () => {
    if (typeof onOpenSdfViz === 'function') onOpenSdfViz();
  });

  panel.querySelector('#zgl-rm-wizard-btn').addEventListener('click', () => {
    if (state.editor) {
      if (!confirm('Remplacer tout le contenu de l\'éditeur par le template raymarching complet ?')) return;
      state.editor.setValue(WIZARD_TEMPLATE);
      state.editor.focus();
    }
  });

  panel.querySelector('#zgl-rm-extend-btn').addEventListener('click', () => {
    const src = state.editor?.getValue() ?? '';
    _extendRaymarcher(src);
  });

  panel.querySelector('#zgl-rm-pbr-metal-btn').addEventListener('click', () => _injectPBR('metallic'));
  panel.querySelector('#zgl-rm-pbr-sss-btn').addEventListener('click',   () => _injectPBR('sss'));
  panel.querySelector('#zgl-rm-pbr-irid-btn').addEventListener('click',  () => _injectPBR('iridescence'));

  makeDraggablePersistent(panel, 'raymarch-assistant', panel.querySelector('header'));
  return { open, close, toggle, refresh, isOpen: () => _open };
}

export function refresh(src) {
  if (!_panel) return;
  const { isRaymarchShader, hasMarch, hasSdf } = detectRaymarch(src);
  const detect = _panel.querySelector('#zgl-rm-detect');
  const label  = _panel.querySelector('#zgl-rm-detect-label');

  if (isRaymarchShader) {
    detect.className = 'rm-detect active';
    const tags = [];
    if (hasMarch) tags.push('raymarch loop');
    if (hasSdf)   tags.push('SDF primitives');
    label.textContent = `Detected: ${tags.join(', ')}`;
  } else {
    detect.className = 'rm-detect inactive';
    label.textContent = 'No raymarch/SDF pattern detected';
  }

  const extracted = extractRaymarchParams(src);
  Object.assign(_params, extracted);

  const slidersDiv = _panel.querySelector('#zgl-rm-sliders');
  slidersDiv.innerHTML = '';

  slidersDiv.appendChild(_makeSlider('MAX_STEPS', 10,  500, 1,      _params.MAX_STEPS));
  slidersDiv.appendChild(_makeSlider('MAX_DIST',  1,   500, 1,      _params.MAX_DIST));
  slidersDiv.appendChild(_makeSlider('SURF_DIST', 0.0001, 0.1, 0.0001, _params.SURF_DIST));
  slidersDiv.appendChild(_makeSlider('EPSILON',   0.0001, 0.1, 0.0001, _params.EPSILON));

  const vizWrap = _panel.querySelector('#zgl-rm-viz-wrap');
  vizWrap.innerHTML = '';
  if (hasSdf) vizWrap.appendChild(_makeSdfMiniViz());
}

export function getInjectedSrc(src) {
  return injectParams(src, _params);
}

function open() {
  if (!_panel) return;
  _panel.classList.add('open');
  _open = true;
}

function close() {
  if (!_panel) return;
  _panel.classList.remove('open');
  _open = false;
}

function toggle() {
  _open ? close() : open();
}


export function autoDetectAndShow(src) {
  if (!_panel) return;
  const { isRaymarchShader } = detectRaymarch(src);
  if (isRaymarchShader && !_open) {
    refresh(src);
    open();
  } else if (_open) {
    refresh(src);
  }
}
