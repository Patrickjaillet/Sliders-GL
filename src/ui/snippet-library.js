/**
 * snippet-library.js  — Phase 9.4
 *
 * User-defined and community-shared shader snippet / macro library.
 *
 * Snippets are small reusable GLSL code blocks (functions, macros, one-liners).
 * They can be inserted into the editor, tagged, searched, and shared via JSON.
 *
 * This module owns:
 *   • CRUD for user snippets (localStorage sl_snippets_v1)
 *   • Community snippet pack (bundled, read-only)
 *   • The snippet library UI panel (modal overlay)
 *   • Monaco editor integration (insert-at-cursor action)
 *
 * ── Public API ────────────────────────────────────────────────────────────────
 *
 *   openSnippetLibrary()          — open the modal panel
 *   closeSnippetLibrary()         — close it
 *   toggleSnippetLibrary()        — toggle
 *
 *   listSnippets(query?)          — return filtered snippet list
 *   getSnippet(id)                — get a single snippet by ID
 *   saveSnippet(snippet)          — create or update a user snippet
 *   deleteSnippet(id)             — remove a user snippet
 *
 *   insertSnippetIntoEditor(code) — insert code at current Monaco cursor
 *
 *   exportSnippetsToJSON()        — serialise user snippets
 *   importSnippetsFromJSON(json)  — bulk-import
 */

import { state } from '../core/state.js';
import { detectShaderPatterns } from '../shader/parser.js';

// ── Community snippet pack ────────────────────────────────────────────────────

const COMMUNITY_SNIPPETS = [
  {
    id: 'com:palette',
    name: 'IQ Palette',
    tags: ['color', 'classic'],
    builtin: true,
    code: `// Inigo Quilez cosine palette
// Usage: vec3 col = palette(t, a, b, c, d);
vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
    return a + b * cos(TAU * (c * t + d));
}`,
  },
  {
    id: 'com:fbm',
    name: 'Fractal Brownian Motion',
    tags: ['noise', 'classic'],
    builtin: true,
    code: `float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }

float vnoise(vec2 p) {
    vec2 i=floor(p), f=fract(p), u=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),
               mix(hash(i+vec2(0,1)),hash(i+vec2(1)),u.x),u.y);
}

float fbm(vec2 p) {
    float v=0., a=.5;
    mat2 r=mat2(.8,-.6,.6,.8);
    for(int i=0;i<6;i++){ v+=a*vnoise(p); p=r*p*2.+1.7; a*=.5; }
    return v;
}`,
  },
  {
    id: 'com:sdf-sphere',
    name: 'SDF Sphere',
    tags: ['sdf', '3D'],
    builtin: true,
    code: `float sdSphere(vec3 p, float r) { return length(p) - r; }`,
  },
  {
    id: 'com:sdf-box',
    name: 'SDF Box',
    tags: ['sdf', '3D'],
    builtin: true,
    code: `float sdBox(vec3 p, vec3 b) {
    vec3 d = abs(p) - b;
    return length(max(d,0.)) + min(max(d.x,max(d.y,d.z)),0.);
}`,
  },
  {
    id: 'com:smooth-union',
    name: 'SDF Smooth Union',
    tags: ['sdf', '3D'],
    builtin: true,
    code: `float opSmoothUnion(float a, float b, float k) {
    float h = clamp(.5+.5*(b-a)/k,0.,1.);
    return mix(b,a,h) - k*h*(1.-h);
}`,
  },
  {
    id: 'com:raymarch',
    name: 'Ray March Loop',
    tags: ['3D', 'template'],
    builtin: true,
    code: `// Ray march — requires map(vec3 p) to be defined
// Returns hit distance or -1.
float march(vec3 ro, vec3 rd) {
    float t = 0.;
    for (int i = 0; i < 128; i++) {
        float d = map(ro + rd * t);
        if (d < 1e-4) return t;
        t += d;
        if (t > 100.) break;
    }
    return -1.;
}`,
  },
  {
    id: 'com:normal-est',
    name: 'Normal Estimation',
    tags: ['3D', 'lighting'],
    builtin: true,
    code: `// Estimate surface normal via finite differences
// Requires map(vec3 p) float SDF
vec3 calcNormal(vec3 p) {
    vec2 e = vec2(1.,-1.) * .5773 * .0005;
    return normalize(e.xyy*map(p+e.xyy)+e.yyx*map(p+e.yyx)+
                     e.yxy*map(p+e.yxy)+e.xxx*map(p+e.xxx));
}`,
  },
  {
    id: 'com:hsv2rgb',
    name: 'HSV → RGB',
    tags: ['color'],
    builtin: true,
    code: `vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.,2./3.,1./3.,3.);
    vec3 p = abs(fract(c.xxx+K.xyz)*6.-K.www);
    return c.z * mix(K.xxx, clamp(p-K.xxx,0.,1.), c.y);
}`,
  },
  {
    id: 'com:rotate2d',
    name: 'Rotate 2D',
    tags: ['math', 'transform'],
    builtin: true,
    code: `mat2 rot2(float a) { float c=cos(a),s=sin(a); return mat2(c,-s,s,c); }
// Usage: uv = rot2(iTime) * uv;`,
  },
  {
    id: 'com:hash',
    name: 'Hash Functions',
    tags: ['noise', 'utility'],
    builtin: true,
    code: `// Fast hash functions
float hash11(float p) { p=fract(p*.1031); p*=p+33.33; p*=p+p; return fract(p); }
float hash12(vec2 p)  { vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
vec2  hash22(vec2 p)  { vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3+=dot(p3,p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
vec3  hash33(vec3 p)  { p=fract(p*vec3(.1031,.1030,.0973)); p+=dot(p,p.yxz+33.33); return fract((p.xxy+p.yxx)*p.zyx); }`,
  },
  {
    id: 'com:aces',
    name: 'ACES Tone Mapping',
    tags: ['color', 'post-process'],
    builtin: true,
    code: `// ACES filmic tone mapping (Narkowicz approximation)
vec3 aces(vec3 x) {
    const float a=2.51,b=.03,c=2.43,d=.59,e=.14;
    return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.,1.);
}`,
  },
  {
    id: 'com:voronoi',
    name: 'Voronoi / Worley Noise',
    tags: ['noise'],
    builtin: true,
    code: `// Voronoi noise — returns vec2(minDist, cellId)
vec2 voronoi(vec2 p) {
    vec2 n=floor(p), f=fract(p);
    float md=8.; vec2 mr=vec2(0);
    for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){
        vec2 g=vec2(i,j), o=hash22(n+g), r=g+o-f;
        float d=dot(r,r);
        if(d<md){ md=d; mr=r; }
    }
    return vec2(sqrt(md), hash12(n+floor(f+mr+.5)));
}`,
  },
  {
    id: 'com:glow',
    name: 'Glow / Bloom (2D)',
    tags: ['fx', 'color'],
    builtin: true,
    code: `// Simple 2D radial glow around a signed distance
float glow(float d, float str, float rad) {
    return str * exp(-max(d,0.) / rad);
}
// Usage: col += glow(sdCircle(uv, 0.2), 1.5, 0.1) * vec3(0.3,0.6,1.0);`,
  },
  {
    id: 'com:soft-shadow',
    name: 'Soft Shadow',
    category: 'lighting',
    tags: ['3D', 'lighting', 'shadow'],
    builtin: true,
    code: `// Soft shadow — requires map(vec3 p) SDF
// Returns 0 (fully shadowed) to 1 (fully lit).
float softShadow(vec3 ro, vec3 rd, float mint, float maxt, float k) {
    float res = 1.0;
    float t = mint;
    for (int i = 0; i < 64; i++) {
        float h = map(ro + rd * t);
        if (h < 0.001) return 0.0;
        res = min(res, k * h / t);
        t += h;
        if (t > maxt) break;
    }
    return clamp(res, 0.0, 1.0);
}`,
  },
  {
    id: 'com:ao',
    name: 'Ambient Occlusion',
    category: 'lighting',
    tags: ['3D', 'lighting', 'ao'],
    builtin: true,
    code: `// Ambient occlusion — requires map(vec3 p) SDF and calcNormal(vec3 p)
float calcAO(vec3 pos, vec3 nor) {
    float occ = 0.0, sca = 1.0;
    for (int i = 0; i < 5; i++) {
        float h = 0.01 + 0.12 * float(i) / 4.0;
        float d = map(pos + h * nor);
        occ += (h - d) * sca;
        sca *= 0.95;
    }
    return clamp(1.0 - 3.0 * occ, 0.0, 1.0);
}`,
  },
  {
    id: 'com:phong',
    name: 'Blinn-Phong Lighting',
    category: 'lighting',
    tags: ['3D', 'lighting'],
    builtin: true,
    code: `// Blinn-Phong diffuse + specular
vec3 blinnPhong(vec3 n, vec3 l, vec3 v, vec3 lightCol, vec3 albedo, float shininess) {
    float diff = max(dot(n, l), 0.0);
    vec3 h = normalize(l + v);
    float spec = pow(max(dot(n, h), 0.0), shininess);
    return albedo * lightCol * diff + lightCol * spec;
}`,
  },
  {
    id: 'com:simplex2d',
    name: 'Simplex Noise 2D',
    category: 'noise',
    tags: ['noise', 'math'],
    builtin: true,
    code: `// Simplex noise 2D — range approximately [-1, 1]
vec3 _snPerm(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
float snoise2(vec2 v) {
    const vec4 C = vec4(0.211324865,0.366025404,-0.577350269,0.024390244);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = x0.x > x0.y ? vec2(1,0) : vec2(0,1);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = _snPerm(_snPerm(i.y+vec3(0,i1.y,1))+i.x+vec3(0,i1.x,1));
    vec3 m = max(0.5 - vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0);
    m = m*m; m = m*m;
    vec3 x = 2.0*fract(p*C.www)-1.0;
    vec3 h = abs(x)-0.5;
    vec3 ox = floor(x+0.5);
    vec3 a0 = x-ox;
    m *= 1.79284291+(-0.85373473)*(a0*a0+h*h);
    vec3 g;
    g.x = a0.x*x0.x+h.x*x0.y;
    g.yz = a0.yz*x12.xz+h.yz*x12.yw;
    return 130.0*dot(m,g);
}`,
  },
  {
    id: 'com:triplanar',
    name: 'Triplanar UV Mapping',
    category: 'texture',
    tags: ['3D', 'texture', 'uv'],
    builtin: true,
    code: `// Triplanar UV mapping — blends XY/XZ/YZ planes by surface normal
// tex: sampler2D, p: world pos, n: surface normal, k: blending sharpness
vec4 triplanar(sampler2D tex, vec3 p, vec3 n, float k) {
    vec3 blending = pow(abs(n), vec3(k));
    blending /= blending.x + blending.y + blending.z + 1e-5;
    vec4 xaxis = texture2D(tex, p.yz);
    vec4 yaxis = texture2D(tex, p.xz);
    vec4 zaxis = texture2D(tex, p.xy);
    return xaxis * blending.x + yaxis * blending.y + zaxis * blending.z;
}`,
  },
  {
    id: 'com:reinhard',
    name: 'Reinhard Tone Mapping',
    category: 'color',
    tags: ['color', 'post-process'],
    builtin: true,
    code: `// Reinhard tone mapping — maps HDR [0,∞) to LDR [0,1)
vec3 reinhard(vec3 x) { return x / (1.0 + x); }
// Extended Reinhard (preserves white point W):
vec3 reinhardW(vec3 x, float W) { return x * (1.0 + x/(W*W)) / (1.0 + x); }`,
  },
  {
    id: 'com:srgb',
    name: 'sRGB ↔ Linear',
    category: 'color',
    tags: ['color', 'utility'],
    builtin: true,
    code: `vec3 linearToSRGB(vec3 c) {
    return mix(12.92*c, 1.055*pow(c,vec3(1./2.4))-0.055, step(0.0031308,c));
}
vec3 sRGBToLinear(vec3 c) {
    return mix(c/12.92, pow((c+0.055)/1.055,vec3(2.4)), step(0.04045,c));
}`,
  },
  {
    id: 'com:cellular',
    name: 'Cellular / Worley 3D',
    category: 'noise',
    tags: ['noise', '3D'],
    builtin: true,
    code: `// Cellular noise 3D — returns distance to nearest cell center
float cellular3D(vec3 p) {
    vec3 pi = floor(p);
    vec3 pf = fract(p);
    float md = 8.0;
    for (int z=-1;z<=1;z++) for (int y=-1;y<=1;y++) for (int x=-1;x<=1;x++) {
        vec3 o = vec3(float(x),float(y),float(z));
        vec3 r = hash33(pi+o);
        float d = length(pf - (o + r));
        md = min(md, d);
    }
    return md;
}`,
  },
  {
    id: 'com:mainimage',
    name: 'mainImage Template',
    category: 'template',
    tags: ['template'],
    builtin: true,
    code: `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv  = (fragCoord - 0.5*iResolution.xy) / iResolution.y;
    float t  = iTime;

    vec3 col = vec3(0);

    // ── your code here ─────────────────────────────────────────
    col = 0.5 + 0.5*cos(t + uv.xyx + vec3(0,2,4));
    // ───────────────────────────────────────────────────────────

    fragColor = vec4(col, 1.0);
}`,
  },
];

// ── User snippet storage ──────────────────────────────────────────────────────

const _STORE_KEY = 'sl_snippets_v1';

function _loadUserSnippets() {
  try {
    const raw = localStorage.getItem(_STORE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function _saveUserSnippets(list) {
  try { localStorage.setItem(_STORE_KEY, JSON.stringify(list)); } catch { /* noop */ }
}

function _genId() {
  return 'usr:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ── Public CRUD ───────────────────────────────────────────────────────────────

/**
 * @param {string} [query]  filter by name / tag / code substring (case-insensitive)
 * @returns {Array}
 */
export function listSnippets(query = '') {
  const all = [...COMMUNITY_SNIPPETS, ..._loadUserSnippets()];
  if (!query) return all;
  const q = query.toLowerCase();
  return all.filter(s =>
    s.name.toLowerCase().includes(q) ||
    (s.tags ?? []).some(t => t.toLowerCase().includes(q)) ||
    s.code.toLowerCase().includes(q)
  );
}

export function getSnippet(id) {
  return COMMUNITY_SNIPPETS.find(s => s.id === id)
      ?? _loadUserSnippets().find(s => s.id === id)
      ?? null;
}

/**
 * Create or update a user snippet.
 * @param {{id?:string, name:string, tags?:string[], code:string}} snippet
 * @returns {string} id
 */
export function saveSnippet(snippet) {
  const list = _loadUserSnippets();
  const id   = snippet.id ?? _genId();
  const idx  = list.findIndex(s => s.id === id);
  const entry = {
    id,
    name: snippet.name || 'Untitled',
    tags: snippet.tags ?? [],
    builtin: false,
    code: snippet.code ?? '',
    updatedAt: Date.now(),
  };
  if (idx >= 0) list[idx] = entry;
  else list.push(entry);
  _saveUserSnippets(list);
  return id;
}

export function deleteSnippet(id) {
  const list = _loadUserSnippets().filter(s => s.id !== id);
  _saveUserSnippets(list);
}

export function exportSnippetsToJSON() {
  return JSON.stringify(_loadUserSnippets(), null, 2);
}

/**
 * @param {string|object[]} jsonOrArray
 * @returns {{imported:number, skipped:number}}
 */
export function importSnippetsFromJSON(jsonOrArray) {
  let arr;
  try {
    arr = typeof jsonOrArray === 'string' ? JSON.parse(jsonOrArray) : jsonOrArray;
  } catch { return { imported: 0, skipped: 0 }; }
  if (!Array.isArray(arr)) return { imported: 0, skipped: 0 };

  const list = _loadUserSnippets();
  let imported = 0, skipped = 0;
  for (const s of arr) {
    if (!s?.name || !s?.code) { skipped++; continue; }
    const id  = s.id && !s.id.startsWith('com:') ? s.id : _genId();
    const idx = list.findIndex(x => x.id === id);
    const entry = { id, name: s.name, tags: s.tags ?? [], builtin: false, code: s.code, updatedAt: Date.now() };
    if (idx >= 0) list[idx] = entry;
    else list.push(entry);
    imported++;
  }
  _saveUserSnippets(list);
  return { imported, skipped };
}

// ── Monaco integration ────────────────────────────────────────────────────────

/**
 * Save the current Monaco selection as a new user snippet.
 * If nothing is selected, saves the entire editor content.
 *
 * @param {string} name  Snippet name
 * @param {string[]} [tags]
 * @returns {string|null}  New snippet id, or null if editor unavailable
 */
export function saveCurrentSelectionAsSnippet(name, tags = []) {
  const ed = state.editor;
  if (!ed) return null;
  const sel = ed.getSelection();
  let code;
  if (sel && !sel.isEmpty()) {
    code = ed.getModel()?.getValueInRange(sel) ?? '';
  } else {
    code = ed.getValue();
  }
  if (!code.trim()) return null;
  return saveSnippet({ name: name || 'Untitled', tags, code });
}

export function insertSnippetIntoEditor(code) {
  const ed = state.editor;
  if (!ed) return;
  const selection = ed.getSelection();
  const range = selection && !selection.isEmpty()
    ? selection
    : { startLineNumber: selection.positionLineNumber, startColumn: selection.positionColumn,
        endLineNumber:   selection.positionLineNumber, endColumn:   selection.positionColumn };
  ed.executeEdits('snippet-library', [{
    range,
    text: code,
    forceMoveMarkers: true,
  }]);
  ed.focus();
}

// ── UI Panel ──────────────────────────────────────────────────────────────────

let _panelOpen   = false;
let _panelEl     = null;
let _renderList  = null; // assigned by _buildPanel once the overlay exists

export function openSnippetLibrary()  { _showPanel(true);  }
export function closeSnippetLibrary() { _showPanel(false); }
export function toggleSnippetLibrary() { _showPanel(!_panelOpen); }

function _showPanel(open) {
  _panelOpen = open;
  if (open) {
    if (!_panelEl) _buildPanel();
    _panelEl.hidden = false;
    _renderList('');
    const search = _panelEl.querySelector('#slibSearch');
    if (search) setTimeout(() => search.focus(), 60);
  } else {
    if (_panelEl) _panelEl.hidden = true;
  }
  const btn = document.getElementById('snippetLibBtn');
  btn?.classList.toggle('active', open);
  btn?.setAttribute('aria-pressed', String(open));
}

function _buildPanel() {
  // Inject CSS once
  if (!document.getElementById('slibStyle')) {
    const style = document.createElement('style');
    style.id = 'slibStyle';
    style.textContent = `
      #slibOverlay {
        position:fixed;inset:0;z-index:1400;
        display:flex;align-items:center;justify-content:center;
        background:rgba(0,0,0,.55);backdrop-filter:blur(3px);
      }
      #slibOverlay[hidden] {
        display:none;
      }
      #slibPanel {
        background:var(--bg-surface,#1a1d22);
        border:1px solid var(--border,#2a2d32);
        border-radius:var(--radius-md);
        width:min(820px,94vw);height:min(580px,88vh);
        display:flex;flex-direction:column;
        box-shadow:0 16px 48px rgba(0,0,0,.5);
        overflow:hidden;
        color:var(--prose,#ccc);
        font-family:'JetBrains Mono',monospace;
        font-size:12px;
      }
      #slibHeader {
        display:flex;align-items:center;gap:8px;
        padding:10px 14px;
        border-bottom:1px solid var(--border,#2a2d32);
        flex-shrink:0;
      }
      #slibTitle { font-size:13px;font-weight:600;flex:1; }
      #slibSearch {
        background:var(--bg-deep,#111316);
        border:1px solid var(--border,#2a2d32);
        border-radius:4px;color:var(--prose,#ccc);
        padding:3px 8px;font-size:11px;width:180px;min-width:60px;flex-shrink:1;outline:none;
      }
      #slibSearch:focus { border-color:var(--accent,#5b8df6); }
      #slibAddBtn,#slibImportBtn,#slibExportBtn,#slibClose {
        font-size:11px;padding:3px 9px;border-radius:4px;cursor:pointer;
        border:1px solid var(--border,#2a2d32);
        background:var(--bg-deep,#111316);color:var(--prose-lo,#888);
        flex-shrink:0;white-space:nowrap;
      }
      #slibAddBtn:hover,#slibImportBtn:hover,#slibExportBtn:hover { color:var(--prose,#ccc); }
      #slibClose { font-size:13px;padding:2px 7px; }
      #slibBody {
        display:flex;flex:1;min-height:0;
      }
      #slibList {
        width:260px;min-width:200px;flex-shrink:0;
        overflow-y:auto;border-right:1px solid var(--border,#2a2d32);
        padding:6px 0;
      }
      .slib-item {
        padding:6px 12px;cursor:pointer;border-left:3px solid transparent;
        transition:background .1s;
      }
      .slib-item:hover    { background:rgba(255,255,255,.04); }
      .slib-item.active   { background:rgba(91,141,246,.12);border-left-color:var(--accent,#5b8df6); }
      .slib-item-name     { font-size:11px;font-weight:600;color:var(--prose,#ccc); }
      .slib-item-tags     { font-size:10px;color:var(--prose-lo,#666);margin-top:2px; }
      .slib-item-builtin  { font-size:9px;color:var(--spark-go,#7ef);margin-left:4px; }
      #slibDetail {
        flex:1;display:flex;flex-direction:column;min-width:0;
        padding:12px 14px;gap:8px;
      }
      #slibDetailName {
        font-size:13px;font-weight:600;
        background:transparent;border:none;border-bottom:1px solid var(--border,#333);
        color:var(--prose,#ccc);width:100%;padding:2px 0;outline:none;
        font-family:inherit;
      }
      #slibDetailTags {
        background:transparent;border:1px solid var(--border,#2a2d32);border-radius:4px;
        color:var(--prose-lo,#888);font-size:10px;padding:2px 6px;
        font-family:inherit;outline:none;
      }
      #slibDetailCode {
        flex:1;min-height:0;resize:none;
        background:var(--bg-deep,#111316);border:1px solid var(--border,#2a2d32);
        border-radius:4px;color:#e2c77a;font-family:'JetBrains Mono',monospace;
        font-size:11px;line-height:1.6;padding:8px;outline:none;
        tab-size:4;
      }
      #slibDetailCode:focus { border-color:var(--accent,#5b8df6); }
      #slibActions {
        display:flex;gap:6px;flex-shrink:0;
      }
      .slib-btn {
        font-size:11px;padding:4px 12px;border-radius:4px;cursor:pointer;
        border:1px solid var(--border,#2a2d32);
        background:var(--bg-deep,#111316);color:var(--prose,#ccc);
      }
      .slib-btn-primary {
        background:var(--accent,#5b8df6);border-color:var(--accent,#5b8df6);
        color:#fff;font-weight:600;
      }
      .slib-btn-danger  { color:#f76;border-color:#633; }
      .slib-btn:hover   { opacity:.85; }
      #slibEmpty {
        padding:20px;color:var(--prose-lo,#666);text-align:center;font-style:italic;
      }
      #slibSectionSep {
        font-size:10px;color:var(--prose-lo,#555);padding:8px 12px 2px;letter-spacing:.05em;
        text-transform:uppercase;
      }
    `;
    document.head.appendChild(style);
  }

  const overlay = document.createElement('div');
  overlay.id = 'slibOverlay';
  overlay.hidden = true;

  overlay.innerHTML = `
    <div id="slibPanel" role="dialog" aria-modal="true" aria-label="Snippet Library">
      <div id="slibHeader">
        <span id="slibTitle">⧉ Snippet Library</span>
        <input id="slibSearch" type="search" placeholder="Search snippets…" aria-label="Search snippets">
        <button type="button" id="slibAddBtn" title="Create new snippet">+ new</button>
        <button type="button" id="slibImportBtn" title="Import snippets from JSON">import</button>
        <button type="button" id="slibExportBtn" title="Export user snippets to JSON">export</button>
        <button type="button" id="slibClose" aria-label="Close snippet library">✕</button>
      </div>
      <div id="slibBody">
        <div id="slibList" role="listbox" aria-label="Snippets"></div>
        <div id="slibDetail">
          <div id="slibEmpty" style="display:none">No snippet selected.</div>
          <div id="slibDetailForm" style="display:flex;flex-direction:column;flex:1;gap:6px;">
            <input id="slibDetailName" type="text" placeholder="Snippet name" aria-label="Snippet name">
            <input id="slibDetailTags" type="text" placeholder="Tags: color, noise, math…" aria-label="Tags">
            <textarea id="slibDetailCode" spellcheck="false" aria-label="Snippet code"></textarea>
            <div id="slibActions">
              <button class="slib-btn slib-btn-primary" id="slibInsertBtn">Insert into editor</button>
              <button class="slib-btn" id="slibSaveBtn">Save</button>
              <button class="slib-btn" id="slibCopySnipBtn">Copy</button>
              <span style="flex:1"></span>
              <button class="slib-btn slib-btn-danger" id="slibDeleteBtn" style="display:none">Delete</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  _panelEl = overlay;

  // ── Wire up events ──────────────────────────────────────────────────────────

  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeSnippetLibrary();
  });

  overlay.querySelector('#slibClose').addEventListener('click', (e) => {
    e.stopPropagation();
    closeSnippetLibrary();
  });

  // Escape key
  overlay.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeSnippetLibrary();
  });

  const searchEl   = overlay.querySelector('#slibSearch');
  const nameEl     = overlay.querySelector('#slibDetailName');
  const tagsEl     = overlay.querySelector('#slibDetailTags');
  const codeEl     = overlay.querySelector('#slibDetailCode');
  const insertBtn  = overlay.querySelector('#slibInsertBtn');
  const saveBtn    = overlay.querySelector('#slibSaveBtn');
  const copyBtn    = overlay.querySelector('#slibCopySnipBtn');
  const deleteBtn  = overlay.querySelector('#slibDeleteBtn');

  let _selectedId = null;

  searchEl.addEventListener('input', () => _renderList(searchEl.value));

  // New snippet
  overlay.querySelector('#slibAddBtn').addEventListener('click', () => {
    _selectedId = null;
    nameEl.value  = '';
    tagsEl.value  = '';
    codeEl.value  = '';
    deleteBtn.style.display = 'none';
    nameEl.focus();
    _highlightList(null);
  });

  // Insert
  insertBtn.addEventListener('click', () => {
    if (codeEl.value.trim()) {
      insertSnippetIntoEditor(codeEl.value);
      closeSnippetLibrary();
    }
  });

  // Save
  saveBtn.addEventListener('click', () => {
    const s = getSnippet(_selectedId);
    if (s?.builtin) return;  // can't overwrite community snippets
    const id = saveSnippet({
      id: _selectedId,
      name: nameEl.value || 'Untitled',
      tags: tagsEl.value.split(',').map(t => t.trim()).filter(Boolean),
      code: codeEl.value,
    });
    _selectedId = id;
    _renderList(searchEl.value);
    _highlightList(id);
    deleteBtn.style.display = '';
  });

  // Copy
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(codeEl.value).then(() => {
      const prev = copyBtn.textContent;
      copyBtn.textContent = '✓ copied';
      setTimeout(() => { copyBtn.textContent = prev; }, 1400);
    }).catch(() => {});
  });

  // Delete
  deleteBtn.addEventListener('click', () => {
    if (!_selectedId || _selectedId.startsWith('com:')) return;
    if (!confirm('Delete this snippet?')) return;
    deleteSnippet(_selectedId);
    _selectedId = null;
    nameEl.value = '';
    tagsEl.value = '';
    codeEl.value = '';
    deleteBtn.style.display = 'none';
    _renderList(searchEl.value);
  });

  // Export
  overlay.querySelector('#slibExportBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    const json = exportSnippetsToJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'zgl-snippets.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // Import
  overlay.querySelector('#slibImportBtn').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type  = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      const { imported, skipped } = importSnippetsFromJSON(text);
      _renderList(searchEl.value);
      alert(`Imported ${imported} snippet(s).${skipped ? ` Skipped ${skipped}.` : ''}`);
    };
    input.click();
  });

  // ── List selection ──────────────────────────────────────────────────────────

  // F-8.5 — pattern → snippet tag mapping
  const PATTERN_TAG_MAP = {
    raymarch:       ['sdf', '3D', 'lighting'],
    fbm:            ['noise'],
    texture:        ['fx', 'post-process'],
    pbr:            ['lighting', '3D'],
    particles:      ['math', 'noise'],
    uv_warp:        ['noise', 'transform'],
    no_annotations: ['math'],
  };

  _renderList = function _renderList(query) {
    const listEl = overlay.querySelector('#slibList');
    listEl.innerHTML = '';
    const items = listSnippets(query);
    if (!items.length) {
      listEl.innerHTML = '<div id="slibEmpty">No snippets found.</div>';
      return;
    }

    // F-8.5 — compute suggested snippets from current shader patterns
    let suggested = [];
    if (!query && state.editor) {
      const code = state.editor.getValue?.() ?? '';
      const patterns = detectShaderPatterns(code);
      const suggestTags = new Set();
      for (const [pat, tags] of Object.entries(PATTERN_TAG_MAP)) {
        if (patterns.has(pat)) tags.forEach(t => suggestTags.add(t));
      }
      if (suggestTags.size) {
        const seen = new Set();
        suggested = items.filter(s => {
          if (seen.has(s.id)) return false;
          const match = (s.tags ?? []).some(t => suggestTags.has(t));
          if (match) seen.add(s.id);
          return match;
        }).slice(0, 6);
      }
    }

    // Group: community by category, then user
    const community = items.filter(s => s.builtin);
    const user      = items.filter(s => !s.builtin);

    const CATEGORY_LABELS = {
      template: 'Templates', noise: 'Noise', sdf: 'SDF', lighting: 'Lighting',
      color: 'Color', math: 'Math', texture: 'Texture', fx: 'FX',
    };

    const appendItem = (listEl, s) => {
      const div = document.createElement('div');
      div.className = 'slib-item' + (_selectedId === s.id ? ' active' : '');
      div.dataset.id = s.id;
      div.setAttribute('role', 'option');
      div.innerHTML = `<div class="slib-item-name">${_esc(s.name)}${s.builtin ? '<span class="slib-item-builtin">built-in</span>' : ''}</div>`
                    + (s.tags?.length ? `<div class="slib-item-tags">${s.tags.map(_esc).join(' · ')}</div>` : '');
      div.addEventListener('click', () => {
        _selectedId = s.id;
        nameEl.value = s.name;
        tagsEl.value = (s.tags ?? []).join(', ');
        codeEl.value = s.code;
        nameEl.readOnly = s.builtin;
        tagsEl.readOnly = s.builtin;
        codeEl.readOnly = s.builtin;
        saveBtn.disabled = s.builtin;
        deleteBtn.style.display = s.builtin ? 'none' : '';
        _highlightList(s.id);
      });
      listEl.appendChild(div);
    };

    const appendGroup = (label, arr) => {
      if (!arr.length) return;
      const sep = document.createElement('div');
      sep.id = 'slibSectionSep';
      sep.textContent = label;
      listEl.appendChild(sep);
      arr.forEach(s => appendItem(listEl, s));
    };

    appendGroup('Suggested for this shader', suggested);

    if (!query) {
      // Group community snippets by category
      const byCategory = {};
      for (const s of community) {
        const cat = s.category || (s.tags?.[0] ?? 'other');
        (byCategory[cat] = byCategory[cat] || []).push(s);
      }
      const catOrder = ['template', 'noise', 'sdf', 'lighting', 'color', 'texture', 'math', 'fx'];
      const allCats = [...catOrder.filter(c => byCategory[c]), ...Object.keys(byCategory).filter(c => !catOrder.includes(c))];
      for (const cat of allCats) {
        if (byCategory[cat]) appendGroup(CATEGORY_LABELS[cat] || cat, byCategory[cat]);
      }
    } else {
      appendGroup('Community', community);
    }

    appendGroup('My Snippets', user);
  }

  function _highlightList(id) {
    overlay.querySelectorAll('.slib-item').forEach(el => {
      el.classList.toggle('active', el.dataset.id === id);
    });
  }

  // _renderList is now assigned to module scope above — no extra exposure needed.
}

function _esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
