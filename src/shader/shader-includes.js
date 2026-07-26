/**
 * shader-includes.js  — Phase 9.4
 *
 * Virtual `#include` preprocessor for GLSL shaders.
 *
 * Resolves `#include "name"` or `#include <name>` directives against:
 *   1. The user's persistent include library (localStorage sl_includes_v1)
 *   2. The built-in standard library (BUILTIN_INCLUDES)
 *
 * ── Public API ────────────────────────────────────────────────────────────────
 *
 *   resolveIncludes(glsl): { code, resolvedNames, errors }
 *     Synchronously expand all #include directives.
 *
 *   listIncludes(): Array<{name, code, builtin}>
 *     Return all known includes (builtins + user).
 *
 *   getInclude(name): string|null
 *     Return source for a single include by name.
 *
 *   setInclude(name, code): void
 *     Save or update a user include.
 *
 *   deleteInclude(name): void
 *     Remove a user include.
 *
 *   importIncludesFromJSON(json): {imported, skipped}
 *     Bulk-import includes from a JSON object { name: code }.
 *
 *   exportIncludesToJSON(): string
 *     Serialise user includes to JSON string for backup/sharing.
 */

// ── Built-in standard library ─────────────────────────────────────────────────

const BUILTIN_INCLUDES = {

  'math.glsl': `// Sliders GL standard math utilities
#ifndef ZGL_MATH
#define ZGL_MATH

const float PI    = 3.14159265358979323846;
const float TAU   = 6.28318530717958647692;
const float PHI   = 1.61803398874989484820;
const float SQRT2 = 1.41421356237309504880;
const float E     = 2.71828182845904523536;

float saturate(float x) { return clamp(x, 0.0, 1.0); }
vec2  saturate(vec2  x) { return clamp(x, 0.0, 1.0); }
vec3  saturate(vec3  x) { return clamp(x, 0.0, 1.0); }
vec4  saturate(vec4  x) { return clamp(x, 0.0, 1.0); }

float remap(float v, float a, float b, float c, float d) {
  return c + (d - c) * ((v - a) / (b - a));
}

float remapSat(float v, float a, float b, float c, float d) {
  return c + (d - c) * saturate((v - a) / (b - a));
}

float smootherstep(float edge0, float edge1, float x) {
  x = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
  return x * x * x * (x * (x * 6.0 - 15.0) + 10.0);
}

float linearstep(float a, float b, float t) {
  return saturate((t - a) / (b - a));
}

mat2 rotate2D(float a) {
  float s = sin(a), c = cos(a);
  return mat2(c, -s, s, c);
}

vec2 rotate2D(vec2 v, float a) { return rotate2D(a) * v; }

vec3 spherical(float theta, float phi) {
  return vec3(sin(phi)*cos(theta), sin(phi)*sin(theta), cos(phi));
}

#endif // ZGL_MATH`,

  'color.glsl': `// Sliders GL color utilities
#ifndef ZGL_COLOR
#define ZGL_COLOR

// Inigo Quilez palette function
vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(6.28318 * (c * t + d));
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

// Perceptual luminance
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// Linear ↔ sRGB
vec3 linearToSRGB(vec3 c) {
  return mix(c * 12.92,
             1.055 * pow(max(c, vec3(0.0)), vec3(1.0/2.4)) - 0.055,
             step(vec3(0.0031308), c));
}
vec3 sRGBToLinear(vec3 c) {
  return mix(c / 12.92,
             pow((c + 0.055) / 1.055, vec3(2.4)),
             step(vec3(0.04045), c));
}

// ACES filmic tone-mapping (Krzysztof Narkowicz approximation)
vec3 acesFilmic(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x*(a*x+b)) / (x*(c*x+d)+e), 0.0, 1.0);
}

#endif // ZGL_COLOR`,

  'noise.glsl': `// Sliders GL noise utilities
#ifndef ZGL_NOISE
#define ZGL_NOISE

// Hash functions
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

// Value noise 2D
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i + vec2(0,0)), hash12(i + vec2(1,0)), u.x),
             mix(hash12(i + vec2(0,1)), hash12(i + vec2(1,1)), u.x), u.y);
}

// Gradient noise (Inigo Quilez)
float gnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = hash12(i + vec2(0,0));
  float b = hash12(i + vec2(1,0));
  float c = hash12(i + vec2(0,1));
  float d = hash12(i + vec2(1,1));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Fractal Brownian Motion — 5 octaves
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += a * gnoise(p);
    p  = rot * p * 2.0 + 1.7;
    a *= 0.5;
  }
  return v;
}

#endif // ZGL_NOISE`,

  // F-8.1 — Parameterized include: #include "fbm.glsl" with { OCTAVES=6, PERSISTENCE=0.45, LACUNARITY=2.1 }
  'fbm.glsl': `// Sliders GL Fractal Brownian Motion — parameterized via #include with {}
// \${OCTAVES} @default(5)
// \${PERSISTENCE} @default(0.5)
// \${LACUNARITY} @default(2.0)
// \${SEED} @default(1.7)
#ifndef ZGL_FBM
#define ZGL_FBM

// Compact hash
float _fbmHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Value noise used internally by fbm()
float _fbmVnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(_fbmHash(i), _fbmHash(i + vec2(1,0)), u.x),
    mix(_fbmHash(i + vec2(0,1)), _fbmHash(i + vec2(1,1)), u.x), u.y);
}

// fbm() — sum of \${OCTAVES} octaves with persistence=\${PERSISTENCE}, lacunarity=\${LACUNARITY}
float fbm(vec2 p) {
  float v = 0.0, a = 1.0, s = 0.0;
  mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < \${OCTAVES}; i++) {
    v += a * _fbmVnoise(p);
    s += a;
    p  = rot * p * \${LACUNARITY} + \${SEED};
    a *= \${PERSISTENCE};
  }
  return v / s; // normalised to [0,1]
}

#endif // ZGL_FBM`,

  'sdf.glsl': `// Sliders GL SDF primitives (Inigo Quilez)
#ifndef ZGL_SDF
#define ZGL_SDF

// 2D
float sdCircle(vec2 p, float r) { return length(p) - r; }
float sdBox2D(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}
float sdSegment2D(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

// 3D
float sdSphere(vec3 p, float r) { return length(p) - r; }
float sdBox(vec3 p, vec3 b) {
  vec3 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0);
}
float sdTorus(vec3 p, vec2 t) {
  return length(vec2(length(p.xz) - t.x, p.y)) - t.y;
}
float sdCylinder(vec3 p, float r, float h) {
  vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}
float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}
float sdPlane(vec3 p, vec3 n, float h) { return dot(p, n) + h; }

// Boolean ops
float opUnion(float a, float b)        { return min(a, b); }
float opSubtract(float a, float b)     { return max(a, -b); }
float opIntersect(float a, float b)    { return max(a, b); }
float opSmoothUnion(float a, float b, float k) {
  float h = clamp(0.5 + 0.5*(b-a)/k, 0.0, 1.0);
  return mix(b, a, h) - k*h*(1.0-h);
}
float opSmoothSub(float a, float b, float k) {
  float h = clamp(0.5 - 0.5*(a+b)/k, 0.0, 1.0);
  return mix(a, -b, h) + k*h*(1.0-h);
}

// Normal estimation
vec3 calcNormal(vec3 p, float d) {
  // Replace 'map' with your scene SDF
  // vec2 e = vec2(1.0, -1.0) * 0.5773 * 0.0005;
  // return normalize(e.xyy*map(p+e.xyy) + e.yyx*map(p+e.yyx) + e.yxy*map(p+e.yxy) + e.xxx*map(p+e.xxx));
  return vec3(0); // placeholder: override in shader
}

#endif // ZGL_SDF`,

  'raymarching.glsl': `// Sliders GL ray marching template
#ifndef ZGL_RAYMARCHING
#define ZGL_RAYMARCHING

// Minimal ray march — call map() must be defined in your shader
// Returns hit distance or -1.0 if miss.
float march(vec3 ro, vec3 rd, int maxSteps, float maxDist, float eps) {
  float t = 0.0;
  for (int i = 0; i < maxSteps; i++) {
    float d = map(ro + rd * t).x;  // map() must return vec2(dist, id)
    if (d < eps) return t;
    t += d;
    if (t > maxDist) break;
  }
  return -1.0;
}

// Camera: return ray direction for UV in [-0.5, 0.5]
vec3 getRayDir(vec2 uv, vec3 ro, vec3 target, float fov) {
  vec3 f = normalize(target - ro);
  vec3 r = normalize(cross(vec3(0,1,0), f));
  vec3 u = cross(f, r);
  float z = 1.0 / tan(radians(fov * 0.5));
  return normalize(uv.x * r + uv.y * u + z * f);
}

#endif // ZGL_RAYMARCHING`,
};

// ── Storage ───────────────────────────────────────────────────────────────────

const _STORE_KEY = 'sl_includes_v1';

/** @returns {Object.<string,string>} */
function _loadUserIncludes() {
  try {
    const raw = localStorage.getItem(_STORE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** @param {Object.<string,string>} includes */
function _saveUserIncludes(includes) {
  try {
    localStorage.setItem(_STORE_KEY, JSON.stringify(includes));
  } catch { /* noop */ }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Return source for a named include (user first, then built-in).
 * @param {string} name
 * @returns {string|null}
 */
export function getInclude(name) {
  const user = _loadUserIncludes();
  if (name in user) return user[name];
  if (name in BUILTIN_INCLUDES) return BUILTIN_INCLUDES[name];
  return null;
}

/**
 * Return all known includes sorted: builtins first, then user.
 * @returns {Array<{name:string, code:string, builtin:boolean}>}
 */
export function listIncludes() {
  const user = _loadUserIncludes();
  const builtins = Object.entries(BUILTIN_INCLUDES).map(([name, code]) => ({
    name, code, builtin: true,
  }));
  const userList = Object.entries(user).map(([name, code]) => ({
    name, code, builtin: false,
  }));
  return [...builtins, ...userList];
}

/**
 * Save or update a user include.
 * @param {string} name
 * @param {string} code
 */
export function setInclude(name, code) {
  if (!name || typeof code !== 'string') return;
  const user = _loadUserIncludes();
  user[_normName(name)] = code;
  _saveUserIncludes(user);
}

/**
 * Delete a user include (built-ins cannot be deleted).
 * @param {string} name
 */
export function deleteInclude(name) {
  const user = _loadUserIncludes();
  delete user[_normName(name)];
  _saveUserIncludes(user);
}

/**
 * Bulk-import includes from a plain object.
 * @param {Object.<string,string>} obj
 * @returns {{imported:number, skipped:number}}
 */
export function importIncludesFromJSON(obj) {
  if (!obj || typeof obj !== 'object') return { imported: 0, skipped: 0 };
  const user = _loadUserIncludes();
  let imported = 0, skipped = 0;
  for (const [name, code] of Object.entries(obj)) {
    if (typeof name !== 'string' || typeof code !== 'string') { skipped++; continue; }
    user[_normName(name)] = code;
    imported++;
  }
  _saveUserIncludes(user);
  return { imported, skipped };
}

/**
 * Export user includes as a pretty-printed JSON string.
 * @returns {string}
 */
export function exportIncludesToJSON() {
  return JSON.stringify(_loadUserIncludes(), null, 2);
}

// ── Include resolution ────────────────────────────────────────────────────────

// F-8.1 — Extended regex handles both plain and `with { KEY=VALUE }` forms
const _INCLUDE_RE     = /^[ \t]*#include\s+["<]([^">]+)[">][ \t]*/gm;
const _INCLUDE_WITH_RE = /^[ \t]*#include\s+["<]([^">]+)[">]\s+with\s*\{([^}]*)\}[ \t]*/gm;

/**
 * Parse `KEY=VALUE, KEY2=VALUE2` pairs from a `with {}` block.
 * @param {string} block
 * @returns {Object.<string,string>}
 */
function _parseWithBlock(block) {
  const out = {};
  for (const pair of block.split(',')) {
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    const key = pair.slice(0, eq).trim();
    const val = pair.slice(eq + 1).trim();
    if (key) out[key] = val;
  }
  return out;
}

/**
 * Extract @default values declared in include source.
 * Syntax: `// ${KEY} @default(value)` on any line.
 */
function _parseDefaults(src) {
  const defaults = {};
  const re = /\/\/\s*\$\{([A-Z_][A-Z0-9_]*)\}\s+@default\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(src)) !== null) defaults[m[1]] = m[2].trim();
  return defaults;
}

/**
 * Substitute `${KEY}` placeholders in `src` with values from `subs`.
 * Falls back to `@default(value)` annotations declared in the include source itself.
 */
function _substituteParams(src, subs) {
  const defaults = _parseDefaults(src);
  return src.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (whole, key) => subs[key] ?? defaults[key] ?? whole);
}

/**
 * Expand all `#include` directives in a GLSL source string.
 * Supports:
 *   #include "name.glsl"
 *   #include "name.glsl" with { OCTAVES=6, PERSISTENCE=0.5 }
 *
 * @param {string} glsl
 * @param {Object.<string,string>} [extraLib]  additional includes for this call
 * @returns {{ code: string, resolvedNames: string[], errors: string[] }}
 */
export function resolveIncludes(glsl, extraLib = {}) {
  const resolvedNames = [];
  const errors        = [];
  const _visited      = new Set();

  function _expand(src, depth = 0) {
    if (depth > 16) return src;  // cycle / depth guard

    // F-8.1 — first pass: replace `with {}` includes (more specific pattern)
    src = src.replace(_INCLUDE_WITH_RE, (_match, rawName, withBlock) => {
      const name = _normName(rawName);
      const subs = _parseWithBlock(withBlock);
      const visitKey = name + JSON.stringify(subs);

      if (_visited.has(visitKey)) {
        return `// #include "${name}" with {...} — already included\n`;
      }
      _visited.add(visitKey);

      let code = extraLib[name] ?? getInclude(name);
      if (code == null) {
        errors.push(`Include not found: "${name}"`);
        return `// #include "${name}" — NOT FOUND\n`;
      }

      code = _substituteParams(code, subs);
      resolvedNames.push(name);
      return `// ── begin ${name} (with params) ──────\n`
           + _expand(code, depth + 1)
           + `\n// ── end ${name} ─────────────────────\n`;
    });

    // Second pass: plain includes
    return src.replace(_INCLUDE_RE, (_match, rawName) => {
      const name = _normName(rawName);

      // Already expanded (prevent duplicate expansion)
      if (_visited.has(name)) {
        return `// #include "${name}" — already included\n`;
      }
      _visited.add(name);

      const code = extraLib[name] ?? getInclude(name);
      if (code == null) {
        const msg = `// #include "${name}" — NOT FOUND`;
        errors.push(`Include not found: "${name}"`);
        return msg + '\n';
      }

      resolvedNames.push(name);
      // Recursively expand nested includes
      return `// ── begin ${name} ─────────────────────\n`
           + _expand(code, depth + 1)
           + `\n// ── end ${name} ─────────────────────\n`;
    });
  }

  const code = _expand(glsl);
  return { code, resolvedNames, errors };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _normName(name) {
  // Strip leading ./ or ../ — we use flat name lookup
  return name.replace(/^\.+\//g, '').trim();
}
