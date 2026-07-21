/**
 * external-libs.js — F-2.4 (Axe 2)
 *
 * Catalogue de bibliothèques GLSL embarquées (inline, pas de CDN) :
 *   - hg_sdf subset (primitives SDF)
 *   - lygia/generative  (noise, fbm, voronoi)
 *   - lygia/color       (luma, contrast, vibrance, hue-rotate)
 *   - lygia/math        (PI, remap, saturate, lerp helpers)
 *   - glsl-random       (hash, rand, rand2)
 *   - glsl-patterns     (checkers, stripes, dots, hexGrid)
 *
 * Chaque entrée : { id, name, category, desc, size, provides[], code }
 *
 * API publique :
 *   EXTERNAL_LIBS      — tableau de toutes les bibliothèques
 *   getLib(id)         — retourne la lib par id
 *   libsByCategory()   — retourne [{category, libs}]
 */

// ── hg_sdf subset ─────────────────────────────────────────────────────────────

const _hg_sdf = /* glsl */`
// hg_sdf — subset of mercury's GLSL SDF library
// Credit: hg_sdf by Mercury (http://mercury.sexy/hg_sdf)

#define PI 3.14159265358979

float vmax(vec2 v) { return max(v.x, v.y); }
float vmax(vec3 v) { return max(max(v.x, v.y), v.z); }
float vmax(vec4 v) { return max(max(v.x, v.y), max(v.z, v.w)); }

float fSphere(vec3 p, float r) { return length(p) - r; }
float fBox(vec3 p, vec3 b) { vec3 d = abs(p) - b; return length(max(d,vec3(0))) + vmax(min(d,vec3(0))); }
float fBox2(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d,vec2(0))) + vmax(min(d,vec2(0))); }
float fCylinder(vec3 p, float r, float h) { return max(length(p.xz)-r, abs(p.y)-h); }
float fTorus(vec3 p, float r1, float r2) { return length(vec2(length(p.xz)-r1, p.y))-r2; }
float fCone(vec3 p, float r, float h) {
    float q = length(p.xz);
    return max(dot(normalize(vec2(h,r)), vec2(q,p.y)), -p.y-h);
}
float fCapsule(vec3 p, float r, float c) {
    return mix(length(p.xz) - r, length(vec3(p.x, abs(p.y) - c, p.z)) - r, step(c, abs(p.y)));
}

// Boolean operations
float fOpUnionSoft(float a, float b, float r) {
    float e = max(r-abs(a-b), 0.0);
    return min(a,b) - e*e*0.25/r;
}
float fOpIntersectionSoft(float a, float b, float r) {
    float e = max(r-abs(a-b), 0.0);
    return max(a,b) + e*e*0.25/r;
}
float fOpDifferenceSoft(float a, float b, float r) {
    return fOpIntersectionSoft(a, -b, r);
}

// Domain operations
void pMirror(inout float p, float dist) {
    p = abs(p) - dist;
}
float pMod1(inout float p, float size) {
    float halfsize = size * 0.5;
    float c = floor((p + halfsize) / size);
    p = mod(p + halfsize, size) - halfsize;
    return c;
}
vec2 pModPolar(inout vec2 p, float repetitions) {
    float angle = 2.0*PI/repetitions;
    float a = atan(p.y, p.x) + angle/2.0;
    float r = length(p);
    float c = floor(a/angle);
    a = mod(a, angle) - angle/2.0;
    p = vec2(cos(a), sin(a)) * r;
    return vec2(c, r);
}
`;

// ── lygia/generative ──────────────────────────────────────────────────────────

const _lygia_generative = /* glsl */`
// lygia/generative — hash, noise, fbm, voronoi
// Credit: lygia shader library (https://lygia.xyz) by Patricio Gonzalez Vivo

float hash11(float p) {
    p = fract(p * .1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
}
vec2 hash22(vec2 p) {
    p = vec2(dot(p, vec2(127.1,311.7)), dot(p, vec2(269.5,183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}
float hash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * .1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float noise2(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i+vec2(1,0)), u.x),
               mix(hash21(i+vec2(0,1)), hash21(i+vec2(1,1)), u.x), u.y);
}

float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
    for (int i = 0; i < 6; i++) {
        v += a * noise2(p); p = rot * p * 2.0; a *= 0.5;
    }
    return v;
}

// Voronoi — returns (dist, id)
vec2 voronoi(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    float minDist = 1e9; vec2 minId = vec2(0);
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
        vec2 cell = vec2(float(x), float(y));
        vec2 off = hash22(i + cell) * 0.5 + 0.5;
        vec2 r = cell + off - f;
        float d = dot(r, r);
        if (d < minDist) { minDist = d; minId = i + cell + off; }
    }
    return vec2(sqrt(minDist), hash21(minId));
}
`;

// ── lygia/color ───────────────────────────────────────────────────────────────

const _lygia_color = /* glsl */`
// lygia/color — luma, contrast, vibrance, hue-rotate
// Credit: lygia shader library (https://lygia.xyz)

float luma(vec3 color) { return dot(color, vec3(0.299, 0.587, 0.114)); }
float luma(vec4 color) { return luma(color.rgb); }

vec3 contrast(vec3 c, float v) { return 0.5 + (c - 0.5) * v; }

vec3 vibrance(vec3 c, float v) {
    float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
    return mix(c, mix(vec3(luma(c)), c, v + 1.0), 1.0 - sat);
}

vec3 hueRotate(vec3 rgb, float angle) {
    float cosA = cos(angle), sinA = sin(angle);
    vec3 w = vec3(0.57735); // 1/sqrt(3)
    vec3 c1 = w * (1.0-cosA), c2 = w * sinA;
    mat3 m = mat3(
        cosA + c1.x*w.x, c1.x*w.y - c2.z, c1.x*w.z + c2.y,
        c1.y*w.x + c2.z, cosA + c1.y*w.y, c1.y*w.z - c2.x,
        c1.z*w.x - c2.y, c1.z*w.y + c2.x, cosA + c1.z*w.z
    );
    return clamp(m * rgb, 0.0, 1.0);
}

vec3 adjustHSL(vec3 rgb, float hueShift, float satMul, float lightMul) {
    return hueRotate(rgb, hueShift) * satMul * lightMul;
}
`;

// ── lygia/math ────────────────────────────────────────────────────────────────

const _lygia_math = /* glsl */`
// lygia/math — PI constants, remap, saturate, lerp helpers
// Credit: lygia shader library (https://lygia.xyz)

#define TWO_PI   6.28318530718
#define HALF_PI  1.57079632679

float remap(float v, float a, float b, float c, float d) {
    return c + (v - a) / (b - a) * (d - c);
}
float saturate(float v) { return clamp(v, 0.0, 1.0); }
vec2  saturate(vec2 v)  { return clamp(v, 0.0, 1.0); }
vec3  saturate(vec3 v)  { return clamp(v, 0.0, 1.0); }
vec4  saturate(vec4 v)  { return clamp(v, 0.0, 1.0); }

float smoothstep2(float e0, float e1, float x) {
    float t = clamp((x - e0) / (e1 - e0), 0.0, 1.0);
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

float pingpong(float t, float p) { return abs(mod(t, 2.0*p) - p); }

mat2 rotate2D(float a) { float c=cos(a),s=sin(a); return mat2(c,-s,s,c); }
mat3 rotateX(float a) { float c=cos(a),s=sin(a); return mat3(1,0,0, 0,c,-s, 0,s,c); }
mat3 rotateY(float a) { float c=cos(a),s=sin(a); return mat3(c,0,s, 0,1,0,-s,0,c); }
mat3 rotateZ(float a) { float c=cos(a),s=sin(a); return mat3(c,-s,0, s,c,0, 0,0,1); }
`;

// ── glsl-random ───────────────────────────────────────────────────────────────

const _glsl_random = /* glsl */`
// glsl-random — deterministic hash + pseudo-random
// Credit: Various GLSL authors / public domain

float rand(float n) { return fract(sin(n) * 43758.5453123); }
float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898,78.233))) * 43758.5453); }
vec2  rand2(vec2 co) { return fract(sin(vec2(dot(co,vec2(127.1,311.7)), dot(co,vec2(269.5,183.3)))) * 43758.5453); }
vec3  rand3(vec3 p) {
    p = vec3(dot(p,vec3(127.1,311.7,74.7)), dot(p,vec3(269.5,183.3,246.1)), dot(p,vec3(113.5,271.9,124.6)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float nrand(vec2 n) { return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453); }
`;

// ── glsl-patterns ────────────────────────────────────────────────────────────

const _glsl_patterns = /* glsl */`
// glsl-patterns — checkers, stripes, dots, hex grid
// Credit: Various GLSL authors / public domain

float checkers(vec2 uv, float scale) {
    vec2 c = floor(uv * scale);
    return mod(c.x + c.y, 2.0);
}

float stripes(float v, float freq, float width) {
    return step(width, fract(v * freq));
}

float dots(vec2 uv, float scale, float radius) {
    uv = fract(uv * scale) - 0.5;
    return step(length(uv), radius);
}

// Hexagonal grid — returns (dist to edge, id)
vec2 hexGrid(vec2 p, float scale) {
    p *= scale;
    vec2 q = vec2(p.x * 2.0/3.0, p.x / 3.0 - p.y * sqrt(3.0)/3.0);
    vec2 pi = floor(q), pf = fract(q);
    float s = dot(pf, vec2(1));
    vec2 a = vec2(floor(pf.x+0.5), floor(pf.y+0.5));
    vec2 b = vec2(floor(pf.x+0.5-s), floor(pf.y+0.5-1.0+s));
    vec2 ha = pi + a, hb = pi + b;
    vec2 da = abs(q - ha), db = abs(q - hb);
    float da2 = dot(da, da), db2 = dot(db, db);
    return da2 < db2 ? vec2(da2, dot(ha, vec2(7.0, 31.0)))
                     : vec2(db2, dot(hb, vec2(7.0, 31.0)));
}
`;

// ── Catalogue ─────────────────────────────────────────────────────────────────

export const EXTERNAL_LIBS = [
  {
    id: 'hg_sdf',
    name: 'hg_sdf (subset)',
    category: 'SDF / 3D',
    desc: 'Mercury SDF library — box, sphere, cylinder, torus, cone, capsule, soft CSG, domain ops',
    size: '~1.8 kb',
    provides: ['vmax', 'fSphere', 'fBox', 'fBox2', 'fCylinder', 'fTorus', 'fCone', 'fCapsule',
               'fOpUnionSoft', 'fOpIntersectionSoft', 'fOpDifferenceSoft',
               'pMirror', 'pMod1', 'pModPolar'],
    code: _hg_sdf.trim(),
  },
  {
    id: 'lygia_generative',
    name: 'lygia/generative',
    category: 'Noise / Génératif',
    desc: 'hash, noise2, fBm 6 octaves, voronoi (dist + id)',
    size: '~1.2 kb',
    provides: ['hash11', 'hash22', 'hash21', 'noise2', 'fbm', 'voronoi'],
    code: _lygia_generative.trim(),
  },
  {
    id: 'lygia_color',
    name: 'lygia/color',
    category: 'Couleur',
    desc: 'luma, contrast, vibrance, hueRotate, adjustHSL',
    size: '~0.7 kb',
    provides: ['luma', 'contrast', 'vibrance', 'hueRotate', 'adjustHSL'],
    code: _lygia_color.trim(),
  },
  {
    id: 'lygia_math',
    name: 'lygia/math',
    category: 'Mathématiques',
    desc: 'TWO_PI, HALF_PI, remap, saturate, smoothstep2, pingpong, rotate2D, rotateXYZ',
    size: '~0.6 kb',
    provides: ['remap', 'saturate', 'smoothstep2', 'pingpong', 'rotate2D', 'rotateX', 'rotateY', 'rotateZ'],
    code: _lygia_math.trim(),
  },
  {
    id: 'glsl_random',
    name: 'glsl-random',
    category: 'Bruit / Aléatoire',
    desc: 'rand(float), rand(vec2), rand2, rand3, nrand — hash pseudo-aléatoire déterministe',
    size: '~0.4 kb',
    provides: ['rand', 'rand2', 'rand3', 'nrand'],
    code: _glsl_random.trim(),
  },
  {
    id: 'glsl_patterns',
    name: 'glsl-patterns',
    category: 'Motifs 2D',
    desc: 'checkers, stripes, dots, hexGrid — motifs procéduraux 2D classiques',
    size: '~0.7 kb',
    provides: ['checkers', 'stripes', 'dots', 'hexGrid'],
    code: _glsl_patterns.trim(),
  },
];

// ── API ────────────────────────────────────────────────────────────────────────

export function getLib(id) {
  return EXTERNAL_LIBS.find(l => l.id === id) ?? null;
}

export function libsByCategory() {
  const map = {};
  for (const lib of EXTERNAL_LIBS) {
    if (!map[lib.category]) map[lib.category] = [];
    map[lib.category].push(lib);
  }
  return Object.entries(map).map(([category, libs]) => ({ category, libs }));
}
