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
import { EXTENDED_SNIPPETS, EXTENDED_INDEX, searchExtended, getExtendedCategories } from './snippet-pack-extended.js';

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
    id: 'com:path-tracer',
    name: 'Path Tracer WebGPU (Phase 15.1)',
    tags: ['template', 'webgpu', 'path-tracing', 'wgsl', '15.1'],
    builtin: true,
    code: `// Z-GL Path Tracer — Phase 15.1
// Activez le Path Tracer via Ctrl+Shift+T ou le panneau dédié.
//
// iSamples  : nombre de samples accumulés (uniform exposé automatiquement)
// iTime     : temps en secondes
// iResolution : résolution du viewport
//
// Ce shader WGSL est un template de base pour personnaliser la scène.
// Copiez ce code dans l'éditeur WGSL Compute et ajustez la géométrie.

@group(0) @binding(0) var accumTex  : texture_storage_2d<rgba32float, read_write>;
@group(0) @binding(1) var outputTex : texture_storage_2d<rgba32float, write>;

struct PTUniforms {
  iResolution : vec2<f32>,
  iTime       : f32,
  iTimeDelta  : f32,
  iFrame      : u32,
  iSamples    : u32,   // samples accumulés — exposé au shader final
  numSPP      : u32,
  maxBounces  : u32,
  _pad        : vec2<f32>,
}
@group(0) @binding(2) var<uniform> pt : PTUniforms;

fn pcg(n: u32) -> u32 {
  var v = n * 747796405u + 2891336453u;
  v = ((v >> ((v >> 28u) + 4u)) ^ v) * 277803737u;
  return (v >> 22u) ^ v;
}

fn rand(s: ptr<function,u32>) -> f32 {
  *s = pcg(*s); return f32(*s) * (1.0/4294967296.0);
}

fn cosHemi(N: vec3<f32>, xi: vec2<f32>) -> vec3<f32> {
  let phi = 6.28318 * xi.x;
  let st  = sqrt(xi.y);
  let ct  = sqrt(1.0 - xi.y);
  var up  = vec3<f32>(0.0, 1.0, 0.0);
  if (abs(N.y) > 0.999) { up = vec3<f32>(1.0,0.0,0.0); }
  let t = normalize(cross(up, N));
  let b = cross(N, t);
  return normalize(t*cos(phi)*st + b*sin(phi)*st + N*ct);
}

struct Ray { o: vec3<f32>, d: vec3<f32> }

fn sky(d: vec3<f32>) -> vec3<f32> {
  return mix(vec3<f32>(0.9,0.95,1.0), vec3<f32>(0.2,0.45,0.9), 0.5*(d.y+1.0))
       + vec3<f32>(15.0,13.0,9.0)*pow(max(0.0,dot(d,normalize(vec3<f32>(0.6,0.8,0.3)))),256.0);
}

fn intersectSphere(ray: Ray, c: vec3<f32>, r: f32) -> f32 {
  let oc = ray.o - c; let b = dot(oc,ray.d); let disc = b*b - dot(oc,oc) + r*r;
  if (disc < 0.0) { return 1e30; }
  let sq = sqrt(disc);
  let t0 = -b - sq; if (t0 > 1e-4) { return t0; }
  let t1 = -b + sq; if (t1 > 1e-4) { return t1; }
  return 1e30;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = vec2<u32>(u32(pt.iResolution.x), u32(pt.iResolution.y));
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }

  var rng = pcg(gid.x + gid.y*dims.x + pt.iFrame*dims.x*dims.y ^ (pt.iSamples*2654435761u));

  let aspect = pt.iResolution.x / pt.iResolution.y;
  let camPos = vec3<f32>(0.0, 1.0, 4.0);
  let forward = normalize(vec3<f32>(0.0, -0.2, -1.0));
  let right   = normalize(cross(vec3<f32>(0.0,1.0,0.0), forward));
  let up      = cross(forward, right);

  var color = vec3<f32>(0.0);

  for (var s = 0u; s < pt.numSPP; s++) {
    let jx = rand(&rng) - 0.5; let jy = rand(&rng) - 0.5;
    let px = (f32(gid.x)+jx)/pt.iResolution.x*2.0-1.0;
    let py = (f32(gid.y)+jy)/pt.iResolution.y*2.0-1.0;
    var ray = Ray(camPos, normalize(forward + right*px*aspect*0.6 + up*py*0.6));

    var radiance  = vec3<f32>(0.0);
    var throughput = vec3<f32>(1.0);

    for (var b = 0u; b < pt.maxBounces; b++) {
      var tMin = 1e30; var hitN = vec3<f32>(0.0,1.0,0.0); var hitAlb = vec3<f32>(0.0);
      var hitEmi = vec3<f32>(0.0);

      // Sol
      if (abs(ray.d.y) > 1e-6) {
        let t = -(ray.o.y + 1.0)/ray.d.y;
        if (t > 1e-4 && t < tMin) {
          tMin = t; hitN = vec3<f32>(0.0,1.0,0.0);
          let p = ray.o + t*ray.d;
          let chess = step(0.5, fract(p.x*0.5)) != step(0.5, fract(p.z*0.5));
          hitAlb = select(vec3<f32>(0.8), vec3<f32>(0.2), chess);
        }
      }
      // Sphère
      let ts = intersectSphere(ray, vec3<f32>(0.0,0.0,0.0), 1.0);
      if (ts < tMin) {
        tMin = ts;
        let p = ray.o + ts*ray.d;
        hitN = normalize(p - vec3<f32>(0.0,0.0,0.0));
        hitAlb = vec3<f32>(0.85,0.3,0.2);
      }
      // Lumière
      let tl = intersectSphere(ray, vec3<f32>(2.0,3.0,1.0), 0.8);
      if (tl < tMin) {
        tMin = tl; hitEmi = vec3<f32>(10.0,8.5,6.5); hitAlb = vec3<f32>(0.0); hitN = vec3<f32>(0.0,1.0,0.0);
      }

      if (tMin >= 1e29) { radiance += throughput * sky(ray.d); break; }

      radiance  += throughput * hitEmi;
      throughput *= hitAlb;

      let xi = vec2<f32>(rand(&rng), rand(&rng));
      ray = Ray(ray.o + tMin*ray.d + hitN*1e-4, cosHemi(hitN, xi));
    }
    color += radiance;
  }
  color /= f32(pt.numSPP);

  let prev  = select(vec4<f32>(0.0), textureLoad(accumTex, vec2<i32>(i32(gid.x),i32(gid.y))), pt.iSamples > 0u);
  let total = f32(pt.iSamples) + f32(pt.numSPP);
  let blended = (prev.rgb * f32(pt.iSamples) + color * f32(pt.numSPP)) / total;

  textureStore(accumTex,  vec2<i32>(i32(gid.x),i32(gid.y)), vec4<f32>(blended,1.0));
  textureStore(outputTex, vec2<i32>(i32(gid.x),i32(gid.y)), vec4<f32>(blended,1.0));
}`,
  },
  {
    id: 'com:mainimage',
    name: 'mainImage Template',
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
  {
    id: 'com:volume-renderer',
    name: 'Volume Rendering — Ray Marching (Phase 15.2)',
    tags: ['template', 'volume', 'ray-marching', 'iVolume', '15.2', 'webgl2', 'dicom', 'vdb'],
    builtin: true,
    code: `// Z-GL Volume Rendering — Phase 15.2
// Activez le Volume Renderer via Ctrl+Shift+U ou le bouton volume dans la barre.
// Importez un fichier VDB, DICOM ou RAW depuis le panneau pour alimenter iVolume.
//
// Uniforms injectés automatiquement :
//   iVolume          : sampler3D (WebGL2) ou sampler2D atlas (WebGL1 fallback)
//   iVolumeAtlas     : int — 0=TEXTURE_3D 1=atlas 2D
//   iVolumeSizeW/H/D : dimensions du volume
//   iVolumeAtlasCols : nb de colonnes si atlas
//   iTransferFn      : sampler2D 256x1 RGBA = (couleur, opacite) vs densite

vec4 sampleVol(vec3 p) {
    return texture(iVolume, clamp(p, 0.0, 1.0));
}
vec4 tf(float d) {
    return texture(iTransferFn, vec2(d, 0.5));
}
bool hitBox(vec3 ro, vec3 rd, out float tN, out float tF) {
    vec3 invD = 1.0 / rd;
    vec3 t0 = (-0.5 - ro) * invD, t1 = (0.5 - ro) * invD;
    tN = max(max(min(t0.x,t1.x), min(t0.y,t1.y)), min(t0.z,t1.z));
    tF = min(min(max(t0.x,t1.x), max(t0.y,t1.y)), max(t0.z,t1.z));
    return tN < tF && tF > 0.0;
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    float th = iTime * 0.25;
    vec3 ro = vec3(cos(th)*2.0, 1.0, sin(th)*2.0);
    vec3 ww = normalize(-ro), uu = normalize(cross(ww,vec3(0,1,0))), vv = cross(uu,ww);
    vec3 rd = normalize(uv.x*uu + uv.y*vv + 1.5*ww);
    float tN, tF;
    vec4 acc = vec4(0.0);
    if (hitBox(ro, rd, tN, tF)) {
        float dt = (tF - tN) / 128.0;
        for (int i = 0; i < 128; i++) {
            vec3 pos = ro + (tN + (float(i)+0.5)*dt)*rd + 0.5;
            float d  = sampleVol(pos).r;
            vec4 c   = tf(d); c.a *= dt * 10.0;
            acc.rgb += (1.0 - acc.a) * c.a * c.rgb;
            acc.a   += (1.0 - acc.a) * c.a;
            if (acc.a > 0.99) break;
        }
    }
    vec3 bg = mix(vec3(0.04,0.04,0.08), vec3(0.08,0.08,0.18), uv.y*0.5+0.5);
    fragColor = vec4(mix(bg, acc.rgb, acc.a), 1.0);
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
export function listSnippets(query = '', category = '') {
  const user = _loadUserSnippets();
  const community = COMMUNITY_SNIPPETS;
  const extended  = EXTENDED_SNIPPETS;
  let all = [...community, ...extended, ...user];

  // Category filter
  if (category && category !== 'All') {
    all = all.filter(s => (s.category || (s.builtin ? 'Community' : 'My Snippets')) === category);
  }
  if (!query) return all;

  // Offline full-text search — split query into words, require all match
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return all.filter(s => {
    const text = [s.name, s.category || '', ...(s.tags ?? []), s.desc || '', s.code].join(' ').toLowerCase();
    return words.every(w => text.includes(w));
  });
}

export function listCategories() {
  const cats = new Set(['All', 'Community', 'My Snippets']);
  for (const s of EXTENDED_SNIPPETS) if (s.category) cats.add(s.category);
  return [...cats];
}

export function getSnippet(id) {
  return COMMUNITY_SNIPPETS.find(s => s.id === id)
      ?? _loadUserSnippets().find(s => s.id === id)
      ?? null;
}

/**
 * Create or update a user snippet.
 * @param {{id?:string, name:string, tags?:string[], code:string, category?:string, desc?:string, shortcut?:string}} snippet
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
    category: snippet.category || 'My Snippets',
    desc: snippet.desc ?? '',
    shortcut: snippet.shortcut ?? '',
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

let _panelOpen = false;
let _panelEl   = null;

export function openSnippetLibrary()  { _showPanel(true);  }
export function closeSnippetLibrary() { _showPanel(false); }
export function toggleSnippetLibrary() { _showPanel(!_panelOpen); }

function _showPanel(open) {
  _panelOpen = open;
  if (open) {
    if (!_panelEl) _buildPanel();
    _panelEl.hidden = false;
    (/** @type {any} */ (_renderList))('');
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
      #slibPanel {
        background:var(--bg-surface,#1a1d22);
        border:1px solid var(--border,#2a2d32);
        border-radius:8px;
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
        padding:3px 8px;font-size:11px;width:180px;outline:none;
      }
      #slibSearch:focus { border-color:var(--accent,#5b8df6); }
      #slibAddBtn,#slibImportBtn,#slibExportBtn,#slibClose {
        font-size:11px;padding:3px 9px;border-radius:4px;cursor:pointer;
        border:1px solid var(--border,#2a2d32);
        background:var(--bg-deep,#111316);color:var(--prose-lo,#888);
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
        <span id="slibTitle">⧉ Snippet Library <span id="slibCountBadge" style="font-size:10px;color:#666;font-weight:400;"></span></span>
        <input id="slibSearch" type="search" placeholder="Search 200+ snippets…" aria-label="Search snippets" style="width:220px;">
        <select id="slibCatFilter" style="background:var(--bg-deep,#111316);color:var(--prose,#ccc);border:1px solid var(--border,#2a2d32);border-radius:4px;font-size:11px;padding:3px 6px;max-width:130px;"></select>
        <button id="slibAddBtn" title="Create new snippet">+ new</button>
        <button id="slibImportBtn" title="Import snippets from JSON">import</button>
        <button id="slibExportBtn" title="Export user snippets to JSON">export</button>
        <button id="slibClose" aria-label="Close snippet library">✕</button>
      </div>
      <div id="slibBody">
        <div id="slibList" role="listbox" aria-label="Snippets"></div>
        <div id="slibDetail">
          <div id="slibEmpty" style="display:none">No snippet selected.</div>
          <div id="slibDetailForm" style="display:flex;flex-direction:column;flex:1;gap:6px;">
            <input id="slibDetailName" type="text" placeholder="Snippet name" aria-label="Snippet name">
            <div style="display:flex;gap:6px;">
              <input id="slibDetailTags" type="text" placeholder="Tags: color, noise…" aria-label="Tags" style="flex:1;">
              <input id="slibDetailShortcut" type="text" placeholder="Shortcut (e.g. cs1)" aria-label="Keyboard shortcut" style="width:120px;" title="Custom shortcut — type this in the editor and press Tab to expand">
            </div>
            <input id="slibDetailDesc" type="text" placeholder="Description (optional)" aria-label="Description">
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

  overlay.querySelector('#slibClose').addEventListener('click', closeSnippetLibrary);

  // Escape key
  overlay.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeSnippetLibrary();
  });

  const searchEl    = overlay.querySelector('#slibSearch');
  const catFilter   = overlay.querySelector('#slibCatFilter');
  const nameEl      = overlay.querySelector('#slibDetailName');
  const tagsEl      = overlay.querySelector('#slibDetailTags');
  const descEl      = overlay.querySelector('#slibDetailDesc');
  const shortcutEl  = overlay.querySelector('#slibDetailShortcut');
  const codeEl      = overlay.querySelector('#slibDetailCode');
  const insertBtn   = overlay.querySelector('#slibInsertBtn');
  const saveBtn     = overlay.querySelector('#slibSaveBtn');
  const copyBtn     = overlay.querySelector('#slibCopySnipBtn');
  const deleteBtn   = overlay.querySelector('#slibDeleteBtn');
  const countBadge  = overlay.querySelector('#slibCountBadge');

  // Populate category filter
  for (const cat of listCategories()) {
    const opt = document.createElement('option');
    opt.value = cat; opt.textContent = cat;
    catFilter.appendChild(opt);
  }

  let _selectedId  = null;
  let _activeQuery = '';
  let _activeCat   = 'All';

  searchEl.addEventListener('input', () => { _activeQuery = searchEl.value; _renderList(); });
  catFilter.addEventListener('change', () => { _activeCat = catFilter.value; _renderList(); });

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
      desc: descEl?.value ?? '',
      shortcut: shortcutEl?.value?.trim() ?? '',
      code: codeEl.value,
    });
    // Register Monaco shortcut if provided
    const sc = shortcutEl?.value?.trim();
    if (sc) _registerSnippetShortcut(id, sc, codeEl.value);
    _selectedId = id;
    _renderList();
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
    _renderList();
  });

  // Export
  overlay.querySelector('#slibExportBtn').addEventListener('click', () => {
    const json = exportSnippetsToJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'zgl-snippets.json';
    a.click();
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
      _renderList();
      alert(`Imported ${imported} snippet(s).${skipped ? ` Skipped ${skipped}.` : ''}`);
    };
    input.click();
  });

  // ── List selection ──────────────────────────────────────────────────────────

  function _renderList() {
    const query = _activeQuery;
    const listEl = overlay.querySelector('#slibList');
    listEl.innerHTML = '';
    const items = listSnippets(query, _activeCat);
    const allCount = listSnippets('', 'All').length;
    if (countBadge) countBadge.textContent = `(${allCount} snippets)`;
    if (!items.length) {
      listEl.innerHTML = '<div id="slibEmpty">No snippets found.</div>';
      return;
    }

    const appendGroup = (label, arr) => {
      if (!arr.length) return;
      const sep = document.createElement('div');
      sep.id = 'slibSectionSep';
      sep.textContent = label + ' (' + arr.length + ')';
      listEl.appendChild(sep);

      for (const s of arr) {
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
          if (descEl)     { descEl.value = s.desc ?? ''; descEl.readOnly = s.builtin; }
          if (shortcutEl) { shortcutEl.value = s.shortcut ?? ''; shortcutEl.readOnly = s.builtin; }
          nameEl.readOnly = s.builtin;
          tagsEl.readOnly = s.builtin;
          codeEl.readOnly = s.builtin;
          saveBtn.disabled = s.builtin;
          deleteBtn.style.display = s.builtin ? 'none' : '';
          _highlightList(s.id);
        });
        listEl.appendChild(div);
      }
    };

    // Group extended by category
    const cats = {};
    for (const s of items) {
      const cat = s.builtin && !s.category ? 'Community' : (s.category || (s.builtin ? 'Community' : 'My Snippets'));
      if (!cats[cat]) cats[cat] = [];
      cats[cat].push(s);
    }
    const catOrder = ['Community','My Snippets','Noise & Procedural','SDF','PBR','Physics','Typography','Color','Ray Marching','Utilities','Templates'];
    const usedCats = [...new Set([...catOrder.filter(c=>cats[c]), ...Object.keys(cats).filter(c=>!catOrder.includes(c))])];
    for (const cat of usedCats) {
      if (cats[cat]?.length) appendGroup(cat, cats[cat]);
    }
  }

  function _highlightList(id) {
    overlay.querySelectorAll('.slib-item').forEach(el => {
      el.classList.toggle('active', el.dataset.id === id);
    });
  }

  // Expose so close/reopen works without re-building
  _renderList._call = _renderList;
}

function _registerSnippetShortcut(id, trigger, code) {
  const ed = state.editor;
  if (!ed || typeof monaco === 'undefined') return;
  // Register as Monaco snippet completion item via command
  ed.addAction({
    id: 'snippet:' + id,
    label: 'Insert snippet: ' + trigger,
    keybindings: [],
    run: () => insertSnippetIntoEditor(code),
  });
  // Also register as tab-expandable abbreviation via completion provider (best-effort)
  try {
    monaco.languages.registerCompletionItemProvider('glsl', {
      triggerCharacters: [trigger.slice(-1)],
      provideCompletionItems: (model, pos) => {
        const word = model.getWordAtPosition(pos);
        if (!word || !word.word.endsWith(trigger)) return null;
        const range = { startLineNumber: pos.lineNumber, startColumn: word.startColumn, endLineNumber: pos.lineNumber, endColumn: pos.column };
        return { suggestions: [{ label: trigger, kind: monaco.languages.CompletionItemKind.Snippet, insertText: code, range, documentation: 'Custom snippet: ' + trigger }] };
      }
    });
  } catch {}
}

function _esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
