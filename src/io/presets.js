import { EXAMPLE } from '../core/constants.js';
import { safeLocalGet, safeLocalSet } from '../core/utils.js';

const PRESETS_KEY = 'sl_presets_v2';

// ── Helpers ──────────────────────────────────────────────────────────────────

function glsl(code) { return code.trim(); }

// ── BUILTIN PRESETS (50+) — organisés par catégorie ──────────────────────────

// ── Catégorie : Fractal ──────────────────────────────────────────────────────
const PRESETS_FRACTAL = [
  {
    id: 'builtin-example',
    name: 'Disco Fractal',
    category: 'Fractal',
    tags: ['fractal', 'color', '3d', 'raymarching'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2025-01-01',
    code: EXAMPLE
  },
  {
    id: 'builtin-mandelbrot',
    name: 'Mandelbrot Set',
    category: 'Fractal',
    tags: ['fractal', '2d', 'classic'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2025-01-01',
    uniforms: [
      { name: 'uZoom', type: 'float', default: 1.0, min: 0.001, max: 100.0, doc: 'Zoom level' },
      { name: 'uCenter', type: 'vec2', default: [-0.5, 0.0], doc: 'Center of the view' },
      { name: 'uMaxIter', type: 'int', default: 128, min: 16, max: 512, doc: 'Max iterations' }
    ],
    code: glsl(`
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    vec2 c = uv * 3.5 / iResolution.y * iResolution.y + vec2(-0.5, 0.0);
    c = uv * 3.0 + vec2(-0.5, 0.0);
    vec2 z = vec2(0.0);
    int iter = 0;
    for (int i = 0; i < 256; i++) {
        if (dot(z, z) > 4.0) break;
        z = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y) + c;
        iter++;
    }
    float t = float(iter) / 256.0;
    vec3 col = 0.5 + 0.5 * cos(6.28318 * (t * 3.0 + vec3(0.0, 0.33, 0.67)));
    col *= (iter < 256) ? 1.0 : 0.0;
    fragColor = vec4(col, 1.0);
}`)
  },
  {
    id: 'builtin-julia',
    name: 'Julia Set (animated)',
    category: 'Fractal',
    tags: ['fractal', '2d', 'classic', 'animated'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2025-01-01',
    code: glsl(`
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y * 3.0;
    vec2 c = vec2(0.355 + 0.05 * sin(iTime * 0.3), 0.355 * cos(iTime * 0.2));
    vec2 z = uv;
    int iter = 0;
    for (int i = 0; i < 200; i++) {
        if (dot(z, z) > 4.0) break;
        z = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y) + c;
        iter++;
    }
    float t = float(iter) / 200.0;
    vec3 col = iter < 200 ? (0.5 + 0.5 * cos(t * 6.28318 * 2.0 + vec3(0.0, 1.05, 2.1))) : vec3(0.0);
    fragColor = vec4(col, 1.0);
}`)
  },
  {
    id: 'builtin-menger',
    name: 'Menger Sponge',
    category: 'Fractal',
    tags: ['fractal', '3d', 'raymarching', 'sdf'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2025-01-01',
    code: glsl(`
float sdBox(vec3 p, vec3 b) { vec3 d = abs(p) - b; return length(max(d,0.0)) + min(max(d.x,max(d.y,d.z)),0.0); }

float mengerSDF(vec3 p) {
    float d = sdBox(p, vec3(1.0));
    float s = 1.0;
    for (int i = 0; i < 4; i++) {
        vec3 a = mod(p * s, 2.0) - 1.0;
        s *= 3.0;
        vec3 r = abs(1.0 - 3.0 * abs(a));
        float da = max(r.x, r.y), db = max(r.y, r.z), dc = max(r.z, r.x);
        float c = (min(da, min(db, dc)) - 1.0) / s;
        d = max(d, c);
    }
    return d;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    float t = iTime * 0.2;
    vec3 ro = vec3(3.0 * cos(t), 1.5, 3.0 * sin(t));
    vec3 rd = normalize(vec3(uv, -1.5));
    mat3 m; vec3 f = normalize(-ro);
    vec3 r2 = normalize(cross(vec3(0,1,0), f));
    vec3 u2 = cross(f, r2);
    m = mat3(r2, u2, f);
    rd = m * rd;
    float d = 0.0; vec3 col = vec3(0.0);
    for (int i = 0; i < 80; i++) {
        float h = mengerSDF(ro + rd * d);
        if (h < 0.001 || d > 20.0) break;
        d += h;
    }
    if (d < 20.0) {
        vec3 p = ro + rd * d;
        vec2 e = vec2(0.001, 0.0);
        vec3 n = normalize(vec3(mengerSDF(p+e.xyy)-mengerSDF(p-e.xyy), mengerSDF(p+e.yxy)-mengerSDF(p-e.yxy), mengerSDF(p+e.yyx)-mengerSDF(p-e.yyx)));
        float diff = clamp(dot(n, normalize(vec3(1,2,3))), 0.0, 1.0);
        col = mix(vec3(0.1,0.2,0.4), vec3(1.0,0.9,0.7), diff);
    }
    fragColor = vec4(col, 1.0);
}`)
  },
  {
    id: 'builtin-ifs',
    name: 'IFS Sierpinski',
    category: 'Fractal',
    tags: ['fractal', '3d', 'ifs'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2025-01-01',
    code: glsl(`
float sdTet(vec3 p) {
    float md = max(max(-p.x-p.y-p.z, p.x+p.y-p.z), max(-p.x+p.y+p.z, p.x-p.y+p.z));
    return (md - 1.0) / sqrt(3.0);
}
float ifsMap(vec3 p) {
    for (int i = 0; i < 8; i++) {
        p = abs(p);
        if (p.x < p.y) p.xy = p.yx;
        if (p.x < p.z) p.xz = p.zx;
        if (p.y < p.z) p.yz = p.zy;
        p = p * 2.0 - 1.0;
    }
    return sdTet(p) * pow(0.5, 8.0);
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    float t = iTime * 0.15;
    vec3 ro = vec3(2.5 * cos(t), 1.2, 2.5 * sin(t));
    vec3 ta = vec3(0.0);
    vec3 f = normalize(ta - ro), r2 = normalize(cross(vec3(0,1,0),f)), u2 = cross(f,r2);
    vec3 rd = normalize(uv.x*r2 + uv.y*u2 + 1.5*f);
    float d = 0.0; vec3 col = vec3(0.02,0.02,0.06);
    for (int i = 0; i < 100; i++) {
        float h = ifsMap(ro + rd * d);
        if (h < 0.0005 || d > 10.0) break;
        d += h;
    }
    if (d < 10.0) {
        vec3 p = ro + rd * d; vec2 e = vec2(0.001,0.0);
        vec3 n = normalize(vec3(ifsMap(p+e.xyy)-ifsMap(p-e.xyy),ifsMap(p+e.yxy)-ifsMap(p-e.yxy),ifsMap(p+e.yyx)-ifsMap(p-e.yyx)));
        col = vec3(0.4,0.7,1.0) * max(dot(n, normalize(vec3(1,2,1))), 0.0);
        col += vec3(0.1,0.05,0.2) * max(-dot(n, normalize(vec3(1,2,1))), 0.0);
    }
    fragColor = vec4(col, 1.0);
}`)
  }
];

// ── Catégorie : Procedural ───────────────────────────────────────────────────
const PRESETS_PROCEDURAL = [
  {
    id: 'builtin-plasma',
    name: 'Plasma Wave',
    category: 'Procedural',
    tags: ['procedural', 'color', '2d'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2025-01-01',
    code: glsl(`
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    float t = iTime * 0.5;
    float v1 = sin(uv.x * 10.0 + t);
    float v2 = sin(uv.y * 10.0 + t * 1.3);
    float v3 = sin((uv.x + uv.y) * 8.0 + t * 0.7);
    float v4 = sin(length(uv - 0.5) * 15.0 - t * 2.0);
    float v = (v1 + v2 + v3 + v4) * 0.25;
    vec3 col = 0.5 + 0.5 * cos(v * 6.28318 + vec3(0.0, 2.094, 4.189));
    fragColor = vec4(col, 1.0);
}`)
  },
  {
    id: 'builtin-voronoi',
    name: 'Voronoi Cells',
    category: 'Procedural',
    tags: ['procedural', '2d', 'geometry'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2025-01-01',
    code: glsl(`
vec2 hash2(vec2 p) {
    p = vec2(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3)));
    return fract(sin(p) * 43758.5453);
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    uv.x *= iResolution.x / iResolution.y;
    uv *= 5.0;
    float t = iTime * 0.3;
    vec2 i = floor(uv), f = fract(uv);
    float minDist = 8.0, minDist2 = 8.0;
    vec2 minCell = vec2(0.0);
    for (int x = -2; x <= 2; x++) {
        for (int y = -2; y <= 2; y++) {
            vec2 neighbor = vec2(float(x), float(y));
            vec2 point = hash2(i + neighbor);
            point = 0.5 + 0.5 * sin(t + 6.2831 * point);
            vec2 diff = neighbor + point - f;
            float d = length(diff);
            if (d < minDist) { minDist2 = minDist; minDist = d; minCell = i + neighbor + point; }
            else if (d < minDist2) { minDist2 = d; }
        }
    }
    float edge = 1.0 - smoothstep(0.0, 0.05, minDist2 - minDist);
    vec3 col = 0.5 + 0.5 * cos(hash2(floor(minCell)).x * 6.28 + vec3(0.0, 2.1, 4.2));
    col = mix(col, vec3(0.0), edge * 0.8);
    fragColor = vec4(col, 1.0);
}`)
  },
  {
    id: 'builtin-fbm-landscape',
    name: 'FBM Landscape',
    category: 'Procedural',
    tags: ['procedural', 'noise', 'landscape', '3d'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2025-01-01',
    code: glsl(`
float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p) {
    vec2 i=floor(p), f=fract(p);
    f = f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
float fbm(vec2 p) {
    float v=0.0, a=0.5;
    for (int i=0;i<8;i++){v+=a*noise(p);p*=2.01;a*=0.5;}
    return v;
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5*iResolution.xy)/iResolution.y;
    vec3 ro = vec3(0.0, 2.0, iTime*0.5), rd = normalize(vec3(uv.x, uv.y-0.2, -1.0));
    vec3 col = vec3(0.4,0.6,0.9) - rd.y*0.4;
    float t = 0.0;
    for (int i=0;i<80;i++) {
        vec3 p = ro + rd*t;
        float h = fbm(p.xz*0.4) * 2.5 - 0.5;
        if (p.y < h || t > 20.0) break;
        t += 0.15;
    }
    if (t < 20.0) {
        vec3 p = ro + rd*t;
        float h = fbm(p.xz*0.4)*2.5-0.5;
        float hx = fbm((p.xz+vec2(0.01,0))*0.4)*2.5-0.5;
        float hz = fbm((p.xz+vec2(0,0.01))*0.4)*2.5-0.5;
        vec3 n = normalize(vec3(h-hx, 0.01, h-hz));
        float diff = clamp(dot(n,normalize(vec3(1,2,1))),0.0,1.0);
        vec3 grass = mix(vec3(0.1,0.3,0.05), vec3(0.3,0.5,0.1), fbm(p.xz));
        vec3 rock = vec3(0.4,0.35,0.3);
        vec3 snow = vec3(0.9,0.95,1.0);
        col = mix(grass, rock, smoothstep(0.5, 1.5, h));
        col = mix(col, snow, smoothstep(1.5, 2.2, h));
        col *= 0.4 + 0.6*diff;
        col = mix(col, vec3(0.4,0.6,0.9), clamp(t/20.0,0.0,1.0)*0.7);
    }
    fragColor = vec4(col, 1.0);
}`)
  },
  {
    id: 'builtin-truchet',
    name: 'Truchet Tiles',
    category: 'Procedural',
    tags: ['procedural', '2d', 'tiling', 'geometry'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2025-01-01',
    code: glsl(`
float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    uv.x *= iResolution.x / iResolution.y;
    uv *= 8.0;
    vec2 i = floor(uv), f = fract(uv);
    float h = hash(i + floor(iTime*0.5));
    float d;
    if (h < 0.5) {
        d = min(length(f), length(f - 1.0));
    } else {
        d = min(length(f - vec2(1,0)), length(f - vec2(0,1)));
    }
    float w = 0.07;
    float line = smoothstep(w+0.01, w-0.01, abs(d - 0.5));
    vec3 bg = 0.5 + 0.5*cos(hash(i)*6.28 + vec3(0,2,4));
    vec3 fg = vec3(1.0) - bg;
    vec3 col = mix(bg, fg, line);
    fragColor = vec4(col, 1.0);
}`)
  },
  {
    id: 'builtin-reaction-diffusion',
    name: 'Reaction-Diffusion (fake)',
    category: 'Procedural',
    tags: ['procedural', '2d', 'simulation', 'organic'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2025-01-01',
    code: glsl(`
float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p) {
    vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    float t = iTime * 0.08;
    float n = noise(uv*4.0 + t);
    float n2 = noise(uv*8.0 - t*1.3 + n);
    float n3 = noise(uv*16.0 + t*0.7 + n2*0.5);
    float pattern = sin((n + n2*0.5 + n3*0.25)*10.0 - t*2.0);
    float spots = smoothstep(0.1, 0.5, pattern);
    vec3 col = mix(vec3(0.05,0.05,0.15), vec3(0.9,0.7,0.3), spots);
    col = mix(col, vec3(0.0,0.4,0.8), smoothstep(0.8, 1.0, spots));
    fragColor = vec4(col, 1.0);
}`)
  },
  {
    id: 'builtin-hexgrid',
    name: 'Hex Grid',
    category: 'Procedural',
    tags: ['procedural', '2d', 'geometry', 'tiling'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2025-01-01',
    code: glsl(`
vec2 hexCoord(vec2 uv) {
    const vec2 s = vec2(1.0, 1.732);
    vec4 hC = floor(vec4(uv, uv - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
    vec4 h = vec4(uv - hC.xy*s, uv - (hC.zw+0.5)*s);
    return dot(h.xy,h.xy) < dot(h.zw,h.zw) ? hC.xy : hC.zw+0.5;
}
float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    uv.x *= iResolution.x / iResolution.y;
    uv *= 6.0;
    vec2 hid = hexCoord(uv);
    float h = hash(hid);
    float pulse = 0.5 + 0.5*sin(iTime*1.5 + h*20.0);
    vec3 col = mix(vec3(0.05,0.1,0.2), 0.5+0.5*cos(h*6.28+vec3(0,2,4)), pulse);
    vec2 center = hid * vec2(1.0,1.732);
    float d = length(uv - center);
    float edge = smoothstep(0.5, 0.42, d);
    col = mix(vec3(0.0), col, edge);
    fragColor = vec4(col, 1.0);
}`)
  },
  {
    id: 'builtin-dithering',
    name: 'Ordered Dithering',
    category: 'Procedural',
    tags: ['procedural', '2d', 'stylized', 'retro'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2025-01-01',
    code: glsl(`
float bayer4(vec2 p) {
    ivec2 i = ivec2(mod(p, 4.0));
    int idx = i.x + i.y*4;
    int[16] m = int[16](0,8,2,10, 12,4,14,6, 3,11,1,9, 15,7,13,5);
    return float(m[idx]) / 16.0;
}
float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p) {
    vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    float t = iTime * 0.2;
    float luma = noise(uv*3.0 + t) * 0.5 + noise(uv*6.0 - t) * 0.3 + noise(uv*12.0+t*1.4)*0.2;
    float threshold = bayer4(fragCoord.xy);
    float dithered = step(threshold, luma);
    vec3 dark = vec3(0.05,0.02,0.15);
    vec3 bright = vec3(0.9,0.8,1.0);
    vec3 col = mix(dark, bright, dithered);
    fragColor = vec4(col, 1.0);
}`)
  }
];

// ── Catégorie : Raymarching / 3D ─────────────────────────────────────────────
const PRESETS_RAYMARCHING = [
  {
    id: 'builtin-sdf-sphere',
    name: 'SDF Sphere (Lambert)',
    category: 'Raymarching',
    tags: ['3d', 'raymarching', 'sdf', 'lighting'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2025-01-01',
    code: glsl(`
#define MAX_STEPS 100
#define MAX_DIST  100.0
#define SURF_DIST 0.001

float map(vec3 p) { return length(p) - 1.0; }

vec3 getNormal(vec3 p) {
    vec2 e = vec2(0.001, 0.0);
    return normalize(vec3(map(p+e.xyy)-map(p-e.xyy), map(p+e.yxy)-map(p-e.yxy), map(p+e.yyx)-map(p-e.yyx)));
}

float rayMarch(vec3 ro, vec3 rd) {
    float d = 0.0;
    for (int i = 0; i < MAX_STEPS; i++) {
        float h = map(ro + rd * d);
        if (h < SURF_DIST || d > MAX_DIST) break;
        d += h;
    }
    return d;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    vec3 ro = vec3(0.0, 0.0, 3.0);
    vec3 rd = normalize(vec3(uv, -1.5));
    float d = rayMarch(ro, rd);
    vec3 col = vec3(0.0);
    if (d < MAX_DIST) {
        vec3 p = ro + rd * d;
        vec3 n = getNormal(p);
        float diff = max(dot(n, normalize(vec3(1.0, 2.0, 3.0))), 0.0);
        col = vec3(0.2 + 0.8 * diff);
    }
    fragColor = vec4(col, 1.0);
}`)
  },
  {
    id: 'builtin-torus-knot',
    name: 'Torus Knot',
    category: 'Raymarching',
    tags: ['3d', 'raymarching', 'sdf', 'knot'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2025-01-01',
    code: glsl(`
vec2 sdTorusKnot(vec3 p, float p_=2.0, float q_=3.0) {
    float phi = atan(p.y, p.x);
    float theta = phi * q_ / p_;
    vec2 r = vec2(cos(theta), sin(theta)) * 0.5;
    vec3 closest = vec3(cos(phi), sin(phi), 0.0) * (1.0 + r.x) + vec3(0,0,r.y);
    return vec2(length(p - closest) - 0.15, phi / 6.28318);
}
float map(vec3 p) { return sdTorusKnot(p).x; }
vec3 normal(vec3 p) {
    vec2 e=vec2(0.001,0.0);
    return normalize(vec3(map(p+e.xyy)-map(p-e.xyy),map(p+e.yxy)-map(p-e.yxy),map(p+e.yyx)-map(p-e.yyx)));
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5*iResolution.xy)/iResolution.y;
    float t = iTime*0.3;
    vec3 ro = vec3(2.5*cos(t),1.5*sin(t*0.7),2.5*sin(t));
    vec3 ta = vec3(0.0);
    vec3 f=normalize(ta-ro), r=normalize(cross(vec3(0,1,0),f)), u=cross(f,r);
    vec3 rd = normalize(uv.x*r + uv.y*u + 1.5*f);
    float d=0.0;
    for (int i=0;i<100;i++){float h=map(ro+rd*d);if(h<0.001||d>15.0)break;d+=h;}
    vec3 col = vec3(0.02,0.02,0.05);
    if (d<15.0) {
        vec3 p=ro+rd*d; vec3 n=normal(p);
        float coord = sdTorusKnot(p).y;
        vec3 base = 0.5+0.5*cos(coord*6.28+vec3(0,2,4));
        float diff=clamp(dot(n,normalize(vec3(1,2,1))),0.0,1.0);
        float spec=pow(clamp(dot(reflect(-normalize(vec3(1,2,1)),n),normalize(-rd)),0.0,1.0),32.0);
        col = base*(0.2+0.7*diff) + vec3(0.5)*spec;
    }
    fragColor = vec4(col, 1.0);
}`)
  },
  {
    id: 'builtin-infinite-tunnel',
    name: 'Infinite Tunnel',
    category: 'Raymarching',
    tags: ['3d', 'raymarching', 'tunnel', 'vj'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2025-01-01',
    code: glsl(`
float hash(float n) { return fract(sin(n)*43758.5453); }
float tunnel(vec3 p) {
    float r = 0.8 + 0.3*sin(p.z*1.5)*cos(p.z*0.7);
    float ring = length(p.xy) - r;
    return ring;
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5*iResolution.xy)/iResolution.y;
    vec3 ro = vec3(0.0, 0.0, iTime*2.0);
    vec3 rd = normalize(vec3(uv, 1.0));
    float d=0.0; vec3 col=vec3(0.0);
    for (int i=0;i<80;i++){
        vec3 p=ro+rd*d;
        float h=tunnel(p);
        if(abs(h)<0.002||d>20.0)break;
        d+=h*0.5;
    }
    if(d<20.0){
        vec3 p=ro+rd*d;
        float ang=atan(p.y,p.x)/3.14159;
        float ring=floor(p.z*2.0);
        vec3 base=0.5+0.5*cos(ring*0.5+iTime+vec3(0,2,4));
        float stripe=smoothstep(0.05,0.15,abs(fract(ang*8.0)-0.5));
        col=mix(base*0.3,base,stripe);
        col*=1.0-clamp(d/20.0,0.0,1.0);
    }
    fragColor=vec4(col,1.0);
}`)
  },
  {
    id: 'builtin-clouds-3d',
    name: 'Volumetric Clouds',
    category: 'Raymarching',
    tags: ['3d', 'raymarching', 'volume', 'clouds', 'atmospheric'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2025-01-01',
    code: glsl(`
float hash(vec3 p) { return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
float noise(vec3 p) {
    vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
    return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float fbm(vec3 p){float v=0.0,a=0.5;for(int i=0;i<5;i++){v+=a*noise(p);p*=2.02;a*=0.5;}return v;}
float cloudDensity(vec3 p){return max(0.0,fbm(p*0.4+vec3(0,0,iTime*0.05))-0.4);}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv=(fragCoord-0.5*iResolution.xy)/iResolution.y;
    vec3 ro=vec3(0,1,iTime*0.3), rd=normalize(vec3(uv.x,uv.y*0.5+0.1,-1.0));
    vec3 sunDir=normalize(vec3(1,0.5,-0.2));
    vec3 skyCol=mix(vec3(0.4,0.6,1.0),vec3(0.7,0.85,1.0),uv.y+0.5);
    float transmit=1.0; vec3 scatter=vec3(0.0);
    float t=0.5;
    for(int i=0;i<40;i++){
        vec3 p=ro+rd*t;
        if(p.y<0.0||p.y>3.0||t>20.0)break;
        float d=cloudDensity(p);
        if(d>0.001){
            float shadow=cloudDensity(p+sunDir*0.5);
            vec3 sunLight=vec3(1.0,0.9,0.7)*exp(-shadow*3.0);
            scatter+=d*0.3*transmit*sunLight;
            transmit*=exp(-d*0.5);
        }
        t+=0.3;
    }
    vec3 col=mix(skyCol,vec3(1.0),scatter);
    col*=transmit;
    fragColor=vec4(col,1.0);
}`)
  },
  {
    id: 'builtin-metaballs',
    name: 'Metaballs',
    category: 'Raymarching',
    tags: ['3d', 'raymarching', 'sdf', 'organic', 'metaballs'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2025-01-01',
    code: glsl(`
float metaball(vec3 p, vec3 c) { float d=length(p-c); return 1.0/max(d*d, 0.001); }
float map(vec3 p) {
    float t=iTime*0.5;
    vec3 a=vec3(sin(t)*0.8, cos(t*1.3)*0.5, sin(t*0.7)*0.4);
    vec3 b=vec3(cos(t*0.9)*0.7, sin(t)*0.6, cos(t*1.1)*0.5);
    vec3 c=vec3(sin(t*1.2)*0.5, cos(t*0.8)*0.8, sin(t*1.4)*0.3);
    float v=metaball(p,a)+metaball(p,b)+metaball(p,c);
    return 1.0/sqrt(v) - 0.5;
}
vec3 normal(vec3 p){vec2 e=vec2(0.002,0.0);return normalize(vec3(map(p+e.xyy)-map(p-e.xyy),map(p+e.yxy)-map(p-e.yxy),map(p+e.yyx)-map(p-e.yyx)));}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv=(fragCoord-0.5*iResolution.xy)/iResolution.y;
    vec3 ro=vec3(0,0,3), rd=normalize(vec3(uv,-1.5));
    float d=0.0;
    for(int i=0;i<80;i++){float h=map(ro+rd*d);if(h<0.002||d>8.0)break;d+=h;}
    vec3 col=vec3(0.05,0.02,0.1);
    if(d<8.0){
        vec3 p=ro+rd*d; vec3 n=normal(p);
        vec3 l=normalize(vec3(1,2,1));
        float diff=clamp(dot(n,l),0.0,1.0);
        float spec=pow(clamp(dot(reflect(-l,n),-rd),0.0,1.0),64.0);
        float fres=pow(1.0-clamp(dot(n,-rd),0.0,1.0),3.0);
        col=vec3(0.4,0.2,0.8)*diff+vec3(0.8,0.9,1.0)*spec+vec3(0.3,0.5,1.0)*fres*0.5;
    }
    fragColor=vec4(col,1.0);
}`)
  }
];

// ── Catégorie : Audio-Reactive (stubs iChannel) ──────────────────────────────
const PRESETS_AUDIO = [
  {
    id: 'builtin-audio-bars',
    name: 'Audio Spectrum Bars',
    category: 'Audio',
    tags: ['audio', '2d', 'spectrum', 'vj'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2025-01-01',
    uniforms: [
      { name: 'uBarCount', type: 'int', default: 64, min: 8, max: 256, doc: 'Number of frequency bars' },
      { name: 'uGlow', type: 'float', default: 1.5, min: 0.0, max: 5.0, doc: 'Glow intensity' }
    ],
    code: glsl(`
// iChannel0 = audio texture (FFT in .r, waveform in .g)
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    float t = iTime;
    int bars = 64;
    float barWidth = 1.0 / float(bars);
    int barIdx = int(uv.x / barWidth);
    float freq = float(barIdx) / float(bars);
    // Sample audio texture (iChannel0) or fallback to animated sine
    float amp = texture(iChannel0, vec2(freq*0.5, 0.25)).r;
    // Fallback animation if no audio
    amp = mix(amp, 0.5+0.4*sin(freq*12.0+t*3.0)*sin(freq*7.0-t*2.0), step(amp,0.01));
    float bar = step(1.0-amp*0.9, uv.y);
    float localX = mod(uv.x, barWidth) / barWidth;
    float gap = smoothstep(0.0,0.1,localX)*smoothstep(1.0,0.9,localX);
    vec3 col1 = vec3(0.0,0.8,1.0);
    vec3 col2 = vec3(1.0,0.2,0.5);
    vec3 barCol = mix(col1, col2, uv.y);
    vec3 bg = vec3(0.02,0.02,0.05);
    vec3 col = mix(bg, barCol*gap, bar);
    // Glow
    col += barCol * exp(-abs(uv.y-(1.0-amp*0.9))*20.0)*0.5*gap;
    fragColor = vec4(col, 1.0);
}`)
  },
  {
    id: 'builtin-audio-waveform',
    name: 'Waveform Scope',
    category: 'Audio',
    tags: ['audio', '2d', 'waveform', 'scope'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2025-01-01',
    code: glsl(`
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec3 col = vec3(0.02,0.02,0.04);
    // Audio waveform from iChannel0 or animated fallback
    float wave = texture(iChannel0, vec2(uv.x, 0.75)).r - 0.5;
    wave = mix(wave, 0.3*sin(uv.x*8.0+iTime*4.0)*cos(uv.x*3.14), step(abs(wave),0.01));
    float d = abs(uv.y - 0.5 - wave);
    float line = exp(-d*iResolution.y*0.08);
    vec3 waveCol = mix(vec3(0.0,1.0,0.5), vec3(1.0,0.3,0.0), abs(wave)*3.0);
    col += waveCol * line;
    // Grid
    float grid = max(step(0.99,fract(uv.x*8.0)), step(0.99,fract(uv.y*4.0)));
    col += vec3(0.05)*grid;
    fragColor = vec4(col, 1.0);
}`)
  },
  {
    id: 'builtin-audio-radial',
    name: 'Radial Audio Pulse',
    category: 'Audio',
    tags: ['audio', '2d', 'vj', 'radial'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2025-01-01',
    code: glsl(`
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5*iResolution.xy)/iResolution.y;
    float r = length(uv);
    float a = atan(uv.y,uv.x);
    float freq = (a / 6.28318 + 0.5);
    float amp = texture(iChannel0, vec2(freq*0.5, 0.25)).r;
    amp = mix(amp, 0.4+0.3*sin(freq*20.0+iTime*2.0), step(amp,0.01));
    float ring = abs(r - (0.2 + amp*0.5));
    float glow = exp(-ring*iResolution.y*0.06);
    vec3 col = mix(vec3(0.5,0.0,1.0), vec3(0.0,1.0,0.8), freq);
    col *= glow;
    col += vec3(0.3,0.1,0.5)*exp(-r*3.0);
    fragColor = vec4(col, 1.0);
}`)
  }
];

// ── Catégorie : Color / Palette ──────────────────────────────────────────────
const PRESETS_COLOR = [
  {
    id: 'builtin-palette-iq',
    name: 'IQ Cosine Palette',
    category: 'Color',
    tags: ['color', 'palette', '2d', 'procedural'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2025-01-01',
    code: glsl(`
vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
    return a + b * cos(6.28318 * (c * t + d));
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    float d = length(uv);
    float angle = atan(uv.y, uv.x);
    float v = d * 2.0 - angle / 6.28318 + iTime * 0.3;
    vec3 col = palette(v, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.33, 0.67));
    col *= smoothstep(1.2, 0.1, d);
    fragColor = vec4(col, 1.0);
}`)
  },
  {
    id: 'builtin-gradient-flow',
    name: 'Gradient Flow Field',
    category: 'Color',
    tags: ['color', 'flow', '2d', 'smooth'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2025-01-01',
    code: glsl(`
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
vec2 flowDir(vec2 p){
    float a=hash(floor(p))*6.28318;
    return vec2(cos(a),sin(a));
}
float noise(vec2 p){
    vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
    float a=hash(i),b=hash(i+vec2(1,0)),c=hash(i+vec2(0,1)),d=hash(i+vec2(1,1));
    return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv=fragCoord/iResolution.xy;
    uv.x*=iResolution.x/iResolution.y;
    float t=iTime*0.1;
    vec2 p=uv*4.0;
    float flow=noise(p+flowDir(p*2.0)*t);
    flow+=0.5*noise(p*2.0+flowDir(p*4.0)*t*1.3);
    flow+=0.25*noise(p*4.0+flowDir(p*8.0)*t*0.7);
    vec3 a=vec3(0.1,0.2,0.5),b=vec3(0.9,0.4,0.1),c=vec3(0.2,0.8,0.5);
    vec3 col=mix(mix(a,b,flow),c,sin(flow*6.28+t)*0.5+0.5);
    fragColor=vec4(col,1.0);
}`)
  },
  {
    id: 'builtin-lava-lamp',
    name: 'Lava Lamp',
    category: 'Color',
    tags: ['color', 'organic', '2d', 'blob'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2025-01-01',
    code: glsl(`
float blob(vec2 p, vec2 c, float r){return r/dot(p-c,p-c);}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv=(fragCoord-0.5*iResolution.xy)/iResolution.y;
    float t=iTime*0.4;
    float v=0.0;
    v+=blob(uv,vec2(sin(t)*0.4,cos(t*0.7)*0.3),0.04);
    v+=blob(uv,vec2(cos(t*1.2)*0.3,sin(t*0.9)*0.4),0.035);
    v+=blob(uv,vec2(sin(t*0.8+1.0)*0.35,cos(t*1.3)*0.25),0.03);
    v+=blob(uv,vec2(cos(t*0.6)*0.2,sin(t*1.1+2.0)*0.35),0.025);
    v+=blob(uv,vec2(0.0,sin(t*0.5)*0.4),0.05);
    float f=smoothstep(0.9,1.1,v);
    vec3 col1=vec3(1.0,0.3,0.05);
    vec3 col2=vec3(1.0,0.8,0.0);
    vec3 col3=vec3(0.05,0.01,0.1);
    vec3 col=mix(col3,mix(col1,col2,clamp(v-0.8,0.0,1.0)*2.0),f);
    col+=vec3(0.2,0.05,0.0)*max(0.0,v-0.5)*0.3;
    fragColor=vec4(col,1.0);
}`)
  }
];

// ── Catégorie : Math / Physics ───────────────────────────────────────────────
const PRESETS_MATH = [
  {
    id: 'builtin-lorenz',
    name: 'Lorenz Attractor',
    category: 'Math',
    tags: ['math', 'chaos', 'attractor', '3d'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2025-01-01',
    uniforms: [
      { name: 'uSigma', type: 'float', default: 10.0, min: 1.0, max: 28.0, doc: 'Lorenz sigma parameter' },
      { name: 'uRho', type: 'float', default: 28.0, min: 1.0, max: 50.0, doc: 'Lorenz rho parameter' },
      { name: 'uBeta', type: 'float', default: 2.667, min: 0.1, max: 8.0, doc: 'Lorenz beta parameter' }
    ],
    code: glsl(`
// Lorenz attractor rendered as accumulated points
float hash(float n){return fract(sin(n)*43758.5453);}
mat3 rotY(float a){float c=cos(a),s=sin(a);return mat3(c,0,s,0,1,0,-s,0,c);}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv=(fragCoord-0.5*iResolution.xy)/iResolution.y;
    float sigma=10.0,rho=28.0,beta=8.0/3.0;
    vec3 p=vec3(1.0,1.0,1.0+hash(floor(iTime))*10.0);
    float dt=0.003; vec3 col=vec3(0.0);
    float rot=iTime*0.1;
    for(int i=0;i<300;i++){
        vec3 dp=vec3(sigma*(p.y-p.x),p.x*(rho-p.z)-p.y,p.x*p.y-beta*p.z);
        p+=dp*dt;
        vec3 q=rotY(rot)*p;
        vec2 proj=q.xy/(q.z*0.1+5.0);
        float d=length(uv-proj*0.025);
        float a=float(i)/300.0;
        col+=exp(-d*iResolution.y*0.3)*mix(vec3(0.0,0.5,1.0),vec3(1.0,0.2,0.5),a)*0.03;
    }
    col=1.0-exp(-col*2.0);
    fragColor=vec4(col,1.0);
}`)
  },
  {
    id: 'builtin-wave-equation',
    name: 'Wave Equation (2D)',
    category: 'Math',
    tags: ['math', 'physics', 'wave', '2d'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2025-01-01',
    code: glsl(`
// Simulated wave interference pattern
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv=fragCoord/iResolution.xy;
    uv.x*=iResolution.x/iResolution.y;
    float t=iTime;
    vec2 s1=vec2(0.3,0.5+sin(t*0.5)*0.2);
    vec2 s2=vec2(0.7+cos(t*0.3)*0.1,0.5);
    vec2 s3=vec2(0.5,0.2+sin(t*0.7)*0.15);
    float k=20.0,omega=3.0;
    float w=sin(k*length(uv-s1)-omega*t)/length(uv-s1+0.01);
    w+=sin(k*length(uv-s2)-omega*t*1.1)/length(uv-s2+0.01);
    w+=sin(k*length(uv-s3)-omega*t*0.9)/length(uv-s3+0.01);
    w*=0.3;
    float amp=clamp(w*0.5+0.5,0.0,1.0);
    vec3 col=mix(vec3(0.0,0.1,0.3),vec3(0.8,0.95,1.0),amp);
    col=mix(col,vec3(1.0,0.3,0.0),max(0.0,w)*0.5);
    fragColor=vec4(col,1.0);
}`)
  },
  {
    id: 'builtin-fourier-circle',
    name: 'Fourier Epicycles',
    category: 'Math',
    tags: ['math', 'fourier', '2d', 'animation'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2025-01-01',
    code: glsl(`
float sdCircle(vec2 p,vec2 c,float r,float w){return abs(length(p-c)-r)-w;}
float sdLine(vec2 p,vec2 a,vec2 b,float w){
    vec2 pa=p-a,ba=b-a;float h=clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0);
    return length(pa-ba*h)-w;
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv=(fragCoord-0.5*iResolution.xy)/iResolution.y;
    float t=iTime;
    vec3 col=vec3(0.04,0.04,0.08);
    vec2 pos=vec2(0.0);
    float r=0.25;
    for(int i=1;i<=7;i++){
        float fi=float(i);
        float n=fi*2.0-1.0;
        float ri=r/n;
        vec2 newPos=pos+ri*vec2(cos(n*t),sin(n*t));
        col+=vec3(0.1,0.3,0.5)*max(0.0,0.01-sdCircle(uv,pos,ri,0.003));
        col+=vec3(0.8,0.8,0.3)*max(0.0,0.01-sdLine(uv,pos,newPos,0.002));
        pos=newPos;
    }
    col+=vec3(1.0,0.3,0.1)*exp(-length(uv-pos)*iResolution.y*0.3)*0.3;
    fragColor=vec4(col,1.0);
}`)
  }
];

// ── Catégorie : Stylized / Artistic ─────────────────────────────────────────
const PRESETS_STYLIZED = [
  {
    id: 'builtin-watercolor',
    name: 'Watercolor Blobs',
    category: 'Stylized',
    tags: ['stylized', '2d', 'artistic', 'organic'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2025-01-01',
    code: glsl(`
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){
    vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
float fbm(vec2 p){float v=0.0,a=0.5;for(int i=0;i<6;i++){v+=a*noise(p);p*=2.0;a*=0.5;}return v;}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv=fragCoord/iResolution.xy;
    uv.x*=iResolution.x/iResolution.y;
    float t=iTime*0.05;
    vec2 warped=uv+0.3*vec2(fbm(uv*2.0+t),fbm(uv*2.0+t+3.7));
    float shape=fbm(warped*1.5);
    float edge=fbm(warped*4.0+vec2(t,-t))*0.15;
    vec3 c1=vec3(0.7,0.2,0.3),c2=vec3(0.2,0.4,0.8),c3=vec3(0.9,0.8,0.5);
    vec3 col=mix(c1,c2,smoothstep(0.3,0.7,shape));
    col=mix(col,c3,edge);
    col=mix(col,vec3(1.0),smoothstep(0.7,0.9,shape+edge)*0.4);
    col*=0.8+0.2*fbm(uv*20.0);
    fragColor=vec4(col,1.0);
}`)
  },
  {
    id: 'builtin-hatching',
    name: 'Cross-Hatching',
    category: 'Stylized',
    tags: ['stylized', '2d', 'sketch', 'line'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2025-01-01',
    code: glsl(`
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){
    vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
float hatch(vec2 uv, float angle, float density, float thresh, float luma){
    vec2 r=vec2(cos(angle),sin(angle));
    float line=mod(dot(uv*density,r),1.0);
    return step(line, thresh*(1.0-luma));
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv=fragCoord/iResolution.xy;
    uv.x*=iResolution.x/iResolution.y;
    float t=iTime*0.1;
    float n=noise(uv*2.0+t)*0.5+noise(uv*4.0-t)*0.25+noise(uv*8.0+t*1.3)*0.25;
    float luma=n;
    float h1=hatch(uv*iResolution.y/800.0,0.785,20.0,0.5,luma);
    float h2=luma<0.4?hatch(uv*iResolution.y/800.0,-0.785,20.0,0.5,luma*0.5):0.0;
    float h3=luma<0.2?hatch(uv*iResolution.y/800.0,0.0,20.0,0.5,luma):0.0;
    float ink=max(max(h1,h2),h3);
    vec3 paper=vec3(0.97,0.94,0.88);
    vec3 col=mix(paper,vec3(0.1,0.08,0.05),ink);
    fragColor=vec4(col,1.0);
}`)
  },
  {
    id: 'builtin-ascii-art',
    name: 'ASCII Art Shader',
    category: 'Stylized',
    tags: ['stylized', '2d', 'ascii', 'retro'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2025-01-01',
    code: glsl(`
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){
    vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
// Fake character brightness levels using SDF-like shapes
float charBright(vec2 uv, int level) {
    vec2 p=uv*2.0-1.0;
    if(level==0) return 0.0;
    if(level==1) return step(0.7,abs(p.x)*abs(p.y));
    if(level==2) return max(step(0.6,abs(p.x)),step(0.6,abs(p.y)));
    if(level==3) return max(step(0.4,abs(p.x)),step(0.4,abs(p.y)));
    if(level==4) return step(0.3,length(p)-0.3);
    return 1.0;
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    float charW=12.0, charH=18.0;
    vec2 cell=floor(fragCoord/vec2(charW,charH));
    vec2 local=fract(fragCoord/vec2(charW,charH));
    float n=noise(cell*0.1+iTime*0.05)*0.5+noise(cell*0.2-iTime*0.03)*0.3+noise(cell*0.4+iTime*0.07)*0.2;
    int level=int(n*5.0);
    float c=charBright(local,level);
    vec3 green=vec3(0.1,0.9,0.3)*n;
    vec3 bg=vec3(0.0,0.04,0.0);
    fragColor=vec4(mix(bg,green,c),1.0);
}`)
  },
  {
    id: 'builtin-neon-glow',
    name: 'Neon Glow Lines',
    category: 'Stylized',
    tags: ['stylized', '2d', 'neon', 'glow', 'vj'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2025-01-01',
    code: glsl(`
float line(vec2 p, vec2 a, vec2 b){
    vec2 pa=p-a,ba=b-a;float h=clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0);
    return length(pa-ba*h);
}
float hash(float n){return fract(sin(n)*43758.5453);}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv=(fragCoord-0.5*iResolution.xy)/iResolution.y;
    float t=iTime*0.4;
    vec3 col=vec3(0.0);
    for(int i=0;i<12;i++){
        float fi=float(i)/12.0;
        float ph=hash(fi)*6.28+t*(0.5+fi*0.8);
        float r1=0.2+fi*0.05;
        float r2=r1+0.15+0.1*sin(t+fi*3.14);
        vec2 a=vec2(cos(ph)*r1,sin(ph)*r1);
        vec2 b=vec2(cos(ph+1.57)*r2,sin(ph+1.57)*r2);
        float d=line(uv,a,b);
        vec3 hue=0.5+0.5*cos(fi*6.28+vec3(0,2,4));
        col+=hue*exp(-d*iResolution.y*0.3)*0.15;
        col+=hue*exp(-d*iResolution.y*2.0)*0.5;
    }
    col=1.0-exp(-col);
    fragColor=vec4(col,1.0);
}`)
  },
  {
    id: 'builtin-oil-painting',
    name: 'Oil Painting',
    category: 'Stylized',
    tags: ['stylized', '2d', 'artistic', 'painterly'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2025-01-01',
    code: glsl(`
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){
    vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv=fragCoord/iResolution.xy;
    uv.x*=iResolution.x/iResolution.y;
    float t=iTime*0.03;
    // Anisotropic blur simulation via oriented strokes
    float ang=noise(uv*3.0)*6.28;
    vec2 dir=vec2(cos(ang),sin(ang));
    vec3 col=vec3(0.0);
    float wt=0.0;
    for(int i=-4;i<=4;i++){
        vec2 off=dir*float(i)*0.003;
        vec2 p=uv+off;
        float n=noise(p*2.0+t)*0.6+noise(p*4.0-t*1.3)*0.25+noise(p*8.0+t)*0.15;
        float n2=noise(p*1.5-t)*0.5+noise(p*3.0+t*0.8)*0.3+noise(p*6.0)*0.2;
        vec3 c=mix(vec3(0.7,0.3,0.1),vec3(0.1,0.4,0.7),n);
        c=mix(c,vec3(0.9,0.8,0.3),n2*0.4);
        float w=1.0-abs(float(i))/5.0;
        col+=c*w; wt+=w;
    }
    col/=wt;
    col*=0.9+0.1*noise(uv*30.0);
    fragColor=vec4(col,1.0);
}`)
  }
];

// ── Catégorie : Post-Processing (pour multipass) ─────────────────────────────
const PRESETS_POSTPROCESS = [
  {
    id: 'builtin-chromatic-aberration',
    name: 'Chromatic Aberration',
    category: 'Post-Processing',
    tags: ['post-fx', 'lens', 'chromatic', 'multipass'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2025-01-01',
    code: glsl(`
// Pass: sample iChannel0 (previous render) with chromatic aberration
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv=fragCoord/iResolution.xy;
    vec2 center=uv-0.5;
    float strength=0.015*(1.0+sin(iTime*0.5)*0.3);
    vec2 offR=center*strength;
    vec2 offB=center*(-strength);
    float r=texture(iChannel0,uv+offR).r;
    float g=texture(iChannel0,uv).g;
    float b=texture(iChannel0,uv+offB).b;
    fragColor=vec4(r,g,b,1.0);
}`)
  },
  {
    id: 'builtin-bloom',
    name: 'Bloom (simple)',
    category: 'Post-Processing',
    tags: ['post-fx', 'bloom', 'glow', 'multipass'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2025-01-01',
    code: glsl(`
// Bloom: threshold + blur on iChannel0
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv=fragCoord/iResolution.xy;
    vec3 base=texture(iChannel0,uv).rgb;
    vec3 bloom=vec3(0.0);
    vec2 px=1.0/iResolution.xy;
    float total=0.0;
    for(int x=-5;x<=5;x++){
        for(int y=-5;y<=5;y++){
            vec2 off=vec2(float(x),float(y))*px*3.0;
            vec3 s=texture(iChannel0,uv+off).rgb;
            float bright=dot(s,vec3(0.2126,0.7152,0.0722));
            float w=exp(-float(x*x+y*y)*0.1)*max(0.0,bright-0.6);
            bloom+=s*w;
            total+=w+0.0001;
        }
    }
    bloom/=total;
    fragColor=vec4(base+bloom*1.5,1.0);
}`)
  },
  {
    id: 'builtin-crt',
    name: 'CRT Monitor',
    category: 'Post-Processing',
    tags: ['post-fx', 'crt', 'retro', 'scanlines'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2025-01-01',
    code: glsl(`
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv=fragCoord/iResolution.xy;
    vec2 curved=uv*2.0-1.0;
    vec2 offset=curved.yx/5.0;
    curved+=curved*offset*offset;
    vec2 s=(curved+1.0)*0.5;
    if(s.x<0.0||s.x>1.0||s.y<0.0||s.y>1.0){fragColor=vec4(0,0,0,1);return;}
    vec3 col=texture(iChannel0,s).rgb;
    // Scanlines
    float scan=sin(s.y*iResolution.y*3.14159)*0.5+0.5;
    col*=0.8+0.2*scan;
    // RGB mask
    float px=mod(fragCoord.x,3.0);
    col*=vec3(step(px,1.0)*0.8+0.2, step(1.0,px)*step(px,2.0)*0.8+0.2, step(2.0,px)*0.8+0.2);
    // Vignette
    float vig=1.0-dot(curved*0.5,curved*0.5);
    col*=vig*vig;
    // Flicker
    col*=0.97+0.03*sin(iTime*60.0);
    fragColor=vec4(col,1.0);
}`)
  },
  {
    id: 'builtin-motionblur',
    name: 'Motion Blur (accumulation)',
    category: 'Post-Processing',
    tags: ['post-fx', 'motion-blur', 'multipass', 'temporal'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2025-01-01',
    code: glsl(`
// Temporal accumulation blur: mix current frame (iChannel1) with history (iChannel0)
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv=fragCoord/iResolution.xy;
    vec4 current=texture(iChannel1,uv);
    vec4 history=texture(iChannel0,uv);
    // Simple exponential moving average
    float alpha=0.15;
    fragColor=mix(history,current,alpha);
}`)
  }
];

// ── Catégorie : Générative ───────────────────────────────────────────────────
const PRESETS_GENERATIVE = [
  {
    id: 'builtin-lsystem',
    name: 'L-System Tree (SDF)',
    category: 'Generative',
    tags: ['generative', '2d', 'l-system', 'tree'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2025-01-01',
    code: glsl(`
float sdSegment(vec2 p,vec2 a,vec2 b,float r){
    vec2 pa=p-a,ba=b-a;float h=clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0);
    return length(pa-ba*h)-r;
}
float branch(vec2 p,vec2 pos,float ang,float len,float width,int depth){
    if(depth<=0||len<0.005) return 1e9;
    vec2 end=pos+vec2(sin(ang),cos(ang))*len;
    float d=sdSegment(p,pos,end,width);
    float t=iTime*0.5;
    float spread=0.5+0.3*sin(t+float(depth));
    float la=ang-spread, ra=ang+spread;
    float dl=branch(p,end,la,len*0.65,width*0.65,depth-1);
    float dr=branch(p,end,ra,len*0.65,width*0.65,depth-1);
    return min(d,min(dl,dr));
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv=(fragCoord-0.5*iResolution.xy)/iResolution.y;
    uv.y*=-1.0; uv.y-=0.4;
    float d=branch(uv,vec2(0,-0.4),0.0,0.3,0.008,8);
    float tree=smoothstep(0.003,-0.003,d);
    vec3 bark=vec3(0.25,0.15,0.05);
    vec3 sky=vec3(0.05,0.08,0.15);
    vec3 col=mix(sky,bark,tree);
    fragColor=vec4(col,1.0);
}`)
  },
  {
    id: 'builtin-cellular-automata',
    name: 'Game of Life (fake animated)',
    category: 'Generative',
    tags: ['generative', '2d', 'cellular-automata', 'life'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2025-01-01',
    code: glsl(`
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float cell(vec2 p,float t){
    return step(0.55+0.1*sin(t),hash(floor(p)+vec2(floor(t))));
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    float scale=128.0;
    vec2 grid=fragCoord/iResolution.xy*scale;
    float t=floor(iTime*4.0);
    // Count neighbors
    float alive=cell(grid,t);
    float n=0.0;
    for(int x=-1;x<=1;x++) for(int y=-1;y<=1;y++){
        if(x==0&&y==0)continue;
        n+=cell(grid+vec2(float(x),float(y)),t);
    }
    float next;
    if(alive>0.5) next=(n>=2.0&&n<=3.0)?1.0:0.0;
    else next=(n==3.0)?1.0:0.0;
    float prev=cell(grid,t-1.0);
    vec3 col=mix(vec3(0.04,0.06,0.12),vec3(0.3,0.9,0.5),alive);
    col=mix(col,vec3(0.1,0.3,0.2),prev*(1.0-alive));
    fragColor=vec4(col,1.0);
}`)
  },
  {
    id: 'builtin-lindenmayer',
    name: 'Dragon Curve',
    category: 'Generative',
    tags: ['generative', '2d', 'fractal', 'curve'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2025-01-01',
    code: glsl(`
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float dragonTurn(int n){
    // Bit manipulation for dragon curve turn sequence
    int bit=(n&(-n))<<1;
    return ((n&bit)!=0)?-1.0:1.0;
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv=(fragCoord-0.5*iResolution.xy)/iResolution.y;
    uv*=3.0;
    float t=iTime;
    vec2 pos=vec2(0.0); float ang=0.0;
    float step_=0.05;
    vec3 col=vec3(0.03,0.02,0.06);
    int steps=int(min(1024.0,pow(2.0,floor(t)+5.0)));
    for(int i=0;i<1024;i++){
        if(i>=steps)break;
        float turn=dragonTurn(i+1);
        ang+=turn*1.5708;
        vec2 npos=pos+vec2(cos(ang),sin(ang))*step_;
        vec2 pa=uv-pos,ba=npos-pos;
        float h=clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0);
        float d=length(pa-ba*h);
        float hue=float(i)/float(steps);
        col+=exp(-d*iResolution.y*0.4)*(0.5+0.5*cos(hue*6.28+vec3(0,2,4)))*0.04;
        pos=npos;
    }
    col=1.0-exp(-col*1.5);
    fragColor=vec4(col,1.0);
}`)
  }
];

// ── Catégorie : Particle ─────────────────────────────────────────────────────
const PRESETS_PARTICLE = [
  {
    id: 'builtin-starfield',
    name: 'Starfield 3D',
    category: 'Particle',
    tags: ['particle', '3d', 'space', 'animated'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2026-01-01',
    uniforms: [
      { name: 'uSpeed', type: 'float', default: 1.0, min: 0.0, max: 5.0, doc: 'Movement speed' },
      { name: 'uDensity', type: 'float', default: 200.0, min: 50.0, max: 800.0, doc: 'Number of stars' }
    ],
    code: glsl(`
float hash(float n){return fract(sin(n)*43758.5453);}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv=(fragCoord-0.5*iResolution.xy)/iResolution.y;
    vec3 col=vec3(0.0);
    float t=iTime*uSpeed;
    for(float i=0.0;i<uDensity;i++){
        float h1=hash(i),h2=hash(i+0.1),h3=hash(i+0.2);
        float z=mod(h3+t*0.1,1.0);
        float scale=1.0/(z+0.01);
        vec2 pos=(vec2(h1,h2)-0.5)*scale;
        float dist=length(uv-pos);
        float r=0.0015*scale;
        float star=smoothstep(r,r*0.3,dist);
        float bright=z*z;
        col+=vec3(bright,bright*0.95,bright*0.85)*star*(1.0-z);
    }
    fragColor=vec4(col,1.0);
}`)
  },
  {
    id: 'builtin-fireworks',
    name: 'Fireworks',
    category: 'Particle',
    tags: ['particle', '2d', 'fireworks', 'animated'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2026-01-01',
    code: glsl(`
float hash(float n){return fract(sin(n)*43758.5453);}
vec3 hsv(float h,float s,float v){vec3 c=vec3(h,s,v);vec3 rgb=clamp(abs(mod(c.x*6.0+vec3(0,4,2),6.0)-3.0)-1.0,0.0,1.0);return c.z*mix(vec3(1),rgb,c.y);}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv=fragCoord/iResolution.xy;
    vec3 col=vec3(0.0);
    for(float k=0.0;k<8.0;k++){
        float seed=floor(iTime*0.5+k*1.3);
        float cx=hash(seed*7.1+k);
        float cy=0.4+hash(seed*3.7+k)*0.5;
        float hue=hash(seed*5.3+k);
        float lt=fract(iTime*0.5+k*1.3/8.0);
        for(float i=0.0;i<60.0;i++){
            float ang=i/60.0*6.28318+hash(seed*2.1+i)*0.5;
            float spd=0.1+hash(seed*4.9+i)*0.2;
            float px=cx+cos(ang)*spd*lt;
            float py=cy+sin(ang)*spd*lt-lt*lt*0.3;
            float d=length(uv-vec2(px,py));
            float fade=1.0-lt;
            col+=hsv(hue,0.8,1.0)*exp(-d*iResolution.y*0.4)*fade*0.15;
        }
    }
    col=1.0-exp(-col);
    fragColor=vec4(col,1.0);
}`)
  },
  {
    id: 'builtin-smoke',
    name: 'Smoke Simulation',
    category: 'Particle',
    tags: ['particle', '2d', 'smoke', 'fluid'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2026-01-01',
    uniforms: [
      { name: 'uRiseSpeed', type: 'float', default: 0.4, min: 0.0, max: 2.0, doc: 'Smoke rise speed' },
      { name: 'uDensity', type: 'float', default: 1.0, min: 0.1, max: 3.0, doc: 'Smoke density' }
    ],
    code: glsl(`
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.0,a=0.5;for(int i=0;i<6;i++){v+=a*noise(p);p*=2.1;a*=0.5;}return v;}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv=fragCoord/iResolution.xy;
    uv.x=(uv.x-0.5)*(iResolution.x/iResolution.y)+0.5;
    float t=iTime*uRiseSpeed;
    // Source au bas centre
    float dx=uv.x-0.5;
    float srcMask=exp(-dx*dx*40.0)*smoothstep(0.0,0.05,uv.y);
    // Warp upward
    vec2 wuv=vec2(uv.x+fbm(uv*3.0+vec2(0,t))*0.15,uv.y-t*0.3);
    float smoke=fbm(wuv*2.5)*fbm(wuv*1.2+vec2(5.3,1.7));
    smoke*=srcMask;
    smoke*=smoothstep(0.9,0.3,uv.y);
    smoke=clamp(smoke*uDensity,0.0,1.0);
    vec3 col=mix(vec3(0.05,0.05,0.07),vec3(0.85,0.82,0.78),smoke);
    fragColor=vec4(col,1.0);
}`)
  },
  {
    id: 'builtin-galaxy',
    name: 'Galaxy Spiral',
    category: 'Particle',
    tags: ['particle', '2d', 'galaxy', 'space', 'procedural'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2026-01-01',
    uniforms: [
      { name: 'uArms', type: 'float', default: 3.0, min: 1.0, max: 8.0, doc: 'Nombre de bras spiraux' },
      { name: 'uTwist', type: 'float', default: 3.0, min: 0.5, max: 8.0, doc: 'Torsion de la spirale' }
    ],
    code: glsl(`
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv=(fragCoord-0.5*iResolution.xy)/iResolution.y*2.5;
    float t=iTime*0.1;
    vec3 col=vec3(0.0);
    float r=length(uv),a=atan(uv.y,uv.x);
    // Core glow
    col+=vec3(0.9,0.8,0.6)*exp(-r*r*8.0)*2.0;
    // Spiral arms
    float arms=uArms;
    for(float i=0.0;i<arms;i++){
        float armAng=a+iTime*0.05-uTwist*r+6.28318*i/arms;
        float armMask=exp(-pow(fract(armAng/6.28318+0.5)-0.5,2.0)*30.0);
        float radFade=exp(-r*r*0.3)*smoothstep(0.05,0.3,r);
        // Stars along arm
        float sn=fract(sin(floor(r*40.0+i*10.0)+floor(armAng*3.0))*43758.5);
        col+=vec3(0.7,0.8,1.0)*armMask*radFade*0.5;
        col+=vec3(1.0,0.9,0.7)*sn*armMask*radFade*smoothstep(0.1,0.0,fract(r*40.0)-0.5+sn*0.5)*0.8;
    }
    // Halo
    col+=vec3(0.1,0.08,0.15)*exp(-r*r*0.4);
    col=1.0-exp(-col);
    fragColor=vec4(col,1.0);
}`)
  },
  {
    id: 'builtin-rain',
    name: 'Rain Drops',
    category: 'Particle',
    tags: ['particle', '2d', 'rain', 'weather'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2026-01-01',
    uniforms: [
      { name: 'uRainSpeed', type: 'float', default: 1.5, min: 0.1, max: 5.0, doc: 'Fall speed' },
      { name: 'uRainDensity', type: 'float', default: 0.5, min: 0.1, max: 2.0, doc: 'Density (higher = more rain)' }
    ],
    code: glsl(`
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float rain(vec2 uv, float layer){
    float cols=mix(30.0,80.0,layer);
    float speed=mix(1.0,3.0,layer)*uRainSpeed;
    uv.x*=cols; uv.y*=cols*0.3;
    vec2 id=floor(uv);
    float ox=hash(id+layer*7.3)-0.5;
    float phase=hash(id*3.7+layer);
    uv.x+=ox;
    uv.y+=iTime*speed+phase*100.0;
    uv=fract(uv);
    float drop=smoothstep(0.0,0.04,uv.x)*smoothstep(0.08,0.04,uv.x)
              *smoothstep(0.0,0.08,uv.y)*smoothstep(0.8,0.0,uv.y);
    float trail=smoothstep(0.02,0.0,uv.x-0.04)*smoothstep(0.0,0.8,uv.y)*smoothstep(0.9,0.7,uv.y);
    return (drop+trail*0.4)*mix(0.1,1.0,layer);
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv=fragCoord/iResolution.xy;
    uv.x*=iResolution.x/iResolution.y;
    vec3 col=mix(vec3(0.05,0.07,0.1),vec3(0.15,0.2,0.3),uv.y);
    for(float l=0.0;l<4.0;l++){
        float r=rain(uv*uRainDensity,l/4.0);
        col+=vec3(0.5,0.6,0.8)*r*0.5;
    }
    fragColor=vec4(col,1.0);
}`)
  }
];

// ── Catégorie : Pattern ──────────────────────────────────────────────────────
const PRESETS_PATTERN = [
  {
    id: 'builtin-islamic-geometry',
    name: 'Islamic Geometry',
    category: 'Pattern',
    tags: ['pattern', '2d', 'geometry', 'islamic', 'tiling'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2026-01-01',
    code: glsl(`
float sdPoly6(vec2 p,float r){float a=atan(p.y,p.x),s=6.28318/6.0;return length(p)-r*cos(floor(0.5+a/s)*s-a);}
float sdLine2(vec2 p,vec2 a,vec2 b,float t){vec2 pa=p-a,ba=b-a;float h=clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0);return length(pa-ba*h)-t;}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv=fragCoord/iResolution.xy;
    uv.x*=iResolution.x/iResolution.y;
    float scale=4.0;
    uv*=scale; uv+=iTime*0.05;
    float hx=sqrt(3.0); float hy=1.5;
    vec2 grid=floor(vec2(uv.x/hx,uv.y/hy));
    vec3 col=vec3(0.03,0.02,0.08);
    for(int dx=-1;dx<=1;dx++) for(int dy=-1;dy<=1;dy++){
        vec2 g=grid+vec2(float(dx),float(dy));
        float offset=mod(g.y,2.0)*hx*0.5;
        vec2 center=vec2(g.x*hx+offset,g.y*hy);
        vec2 p=uv-center;
        float r=0.9;
        float hex=sdPoly6(p,r);
        float stroke=smoothstep(0.04,0.0,abs(hex+0.05));
        float inner=sdPoly6(p,r*0.5);
        float innerS=smoothstep(0.03,0.0,abs(inner+0.02));
        float hue=fract(dot(g,vec2(0.13,0.27)));
        vec3 c=0.5+0.5*cos(6.28*(hue+vec3(0,0.33,0.67)));
        col+=c*stroke*0.6+vec3(1.0,0.9,0.6)*innerS*0.4;
    }
    col=clamp(col,0.0,1.0);
    fragColor=vec4(col,1.0);
}`)
  },
  {
    id: 'builtin-penrose',
    name: 'Penrose-like Tiling',
    category: 'Pattern',
    tags: ['pattern', '2d', 'penrose', 'quasicrystal', 'tiling'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2026-01-01',
    code: glsl(`
float sdRhombus(vec2 p,vec2 b){p=abs(p);float h=clamp((dot(p,b)+dot(p,b.yx))/(dot(b,b)*2.0),-1.0,1.0);return length(p-b*h)-0.0;}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv=(fragCoord-0.5*iResolution.xy)/iResolution.y*4.0;
    float phi=1.6180339887;
    float t=iTime*0.1;
    // Quasiperiodic interference pattern (5-fold)
    float f=0.0;
    for(int k=0;k<5;k++){
        float ang=float(k)*6.28318/5.0;
        vec2 dir=vec2(cos(ang),sin(ang));
        f+=cos(dot(uv,dir)*6.28318*phi+t);
    }
    f/=5.0;
    float bands=cos(f*3.14159*4.0);
    float sharp=smoothstep(-0.05,0.05,bands);
    // Color based on 5-fold symmetry angle
    float a=atan(uv.y,uv.x)+t*0.1;
    float hue=fract(a/(6.28318/5.0)/5.0);
    vec3 c1=0.5+0.5*cos(6.28318*(hue+vec3(0.0,0.33,0.67)));
    vec3 c2=0.5+0.5*cos(6.28318*(hue+0.5+vec3(0.0,0.33,0.67)));
    vec3 col=mix(c2*0.2,c1,sharp);
    fragColor=vec4(col,1.0);
}`)
  },
  {
    id: 'builtin-weave',
    name: 'Woven Fabric',
    category: 'Pattern',
    tags: ['pattern', '2d', 'fabric', 'weave', 'texture'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2026-01-01',
    uniforms: [
      { name: 'uThreads', type: 'float', default: 20.0, min: 4.0, max: 80.0, doc: 'Number of threads' },
      { name: 'uColorA', type: 'vec3', default: [0.8, 0.3, 0.1], doc: 'Warp color' },
      { name: 'uColorB', type: 'vec3', default: [0.1, 0.3, 0.7], doc: 'Weft color' }
    ],
    code: glsl(`
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv=fragCoord/iResolution.xy;
    uv.x*=iResolution.x/iResolution.y;
    vec2 g=uv*uThreads;
    vec2 id=floor(g);
    vec2 f=fract(g);
    // Weave pattern: over/under based on cell parity
    float parity=mod(id.x+id.y,2.0);
    // Thread cross-section (ellipse SDF)
    float wx=smoothstep(0.05,0.2,f.x)*smoothstep(0.95,0.8,f.x);
    float wy=smoothstep(0.05,0.2,f.y)*smoothstep(0.95,0.8,f.y);
    // Cylindrical shading
    float cx=0.5+0.4*cos((f.x-0.5)*3.14159);
    float cy=0.5+0.4*cos((f.y-0.5)*3.14159);
    vec3 colH=uColorA*(0.5+0.5*cx);
    vec3 colV=uColorB*(0.5+0.5*cy);
    // Depth (which thread is on top)
    float front=parity;
    vec3 top=mix(colH,colV,front);
    vec3 bot=mix(colV,colH,front);
    // Anti-aliased crossing mask
    float thr=0.5+sin(iTime*0.2)*0.0; // static
    float mask=smoothstep(thr-0.05,thr+0.05,front>0.5?wy:wx);
    vec3 col=mix(top,bot,mask);
    // Shadow at crossing
    float shadow=min(wx,wy)*0.3;
    col*=1.0-shadow*(1.0-mask);
    fragColor=vec4(col,1.0);
}`)
  },
  {
    id: 'builtin-maze',
    name: 'Maze Generator',
    category: 'Pattern',
    tags: ['pattern', '2d', 'maze', 'generative', 'procedural'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2026-01-01',
    uniforms: [
      { name: 'uCells', type: 'float', default: 16.0, min: 4.0, max: 64.0, doc: 'Taille de la grille' }
    ],
    code: glsl(`
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
// Maze via random spanning tree appearance (pseudo, not real BFS)
float wall(vec2 cell,int dir){
    // dir: 0=right, 1=up
    float h=hash(cell*3.7+float(dir)*5.1+floor(iTime*0.2)*100.0);
    return step(0.5,h);
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv=fragCoord/iResolution.xy;
    uv.x*=iResolution.x/iResolution.y;
    float n=uCells;
    float ar=iResolution.x/iResolution.y;
    vec2 grid=uv*vec2(n,n);
    vec2 cell=floor(grid);
    vec2 local=fract(grid);
    float thick=0.08;
    // Draw walls
    float wallR=wall(cell,0); // right wall of cell
    float wallU=wall(cell,1); // top wall of cell
    float wallL=wall(cell-vec2(1,0),0); // left wall = right wall of left neighbor
    float wallD=wall(cell-vec2(0,1),1); // bottom wall = top wall of bottom neighbor
    float d=1.0; // 1=floor, 0=wall
    // Vertical walls
    float right=smoothstep(1.0-thick,1.0-thick*0.5,local.x)*wallR;
    float left_=smoothstep(thick,thick*0.5,local.x)*wallL;
    // Horizontal walls
    float top_=smoothstep(1.0-thick,1.0-thick*0.5,local.y)*wallU;
    float bot_=smoothstep(thick,thick*0.5,local.y)*wallD;
    float isWall=max(max(right,left_),max(top_,bot_));
    vec3 floorCol=vec3(0.08,0.1,0.15);
    vec3 wallCol=vec3(0.7,0.75,0.85);
    // Animate a "path" traced in blue
    float cellHash=hash(cell+floor(iTime*0.3)*33.7);
    float pathHue=fract(iTime*0.05);
    vec3 pathCol=0.5+0.5*cos(6.28318*(pathHue+vec3(0,0.33,0.67)));
    float path=step(0.85,cellHash)*(1.0-isWall);
    vec3 col=mix(mix(floorCol,pathCol,path),wallCol,isWall);
    fragColor=vec4(col,1.0);
}`)
  },
  {
    id: 'builtin-truchet-animated',
    name: 'Truchet Animated',
    category: 'Pattern',
    tags: ['pattern', '2d', 'truchet', 'tiling', 'animated'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2026-01-01',
    uniforms: [
      { name: 'uScale', type: 'float', default: 8.0, min: 2.0, max: 30.0, doc: 'Échelle de la grille' }
    ],
    code: glsl(`
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv=fragCoord/iResolution.xy;
    uv.x*=iResolution.x/iResolution.y;
    vec2 g=uv*uScale;
    // Animate: cells change every 1s
    float cellTime=floor(iTime*0.5);
    vec2 id=floor(g);
    float f=hash(id+cellTime);
    vec2 local=fract(g);
    // Two types of arc
    float d1=abs(length(local)-0.5);
    float d2=abs(length(local-vec2(1))-0.5);
    float d=f>0.5?d1:d2;
    // Transition blend
    float blend=smoothstep(0.45,0.55,fract(iTime*0.5));
    float df1=f>0.5?d1:d2;
    float df2=f>0.5?d2:d1; // next state
    float dt=mix(df1,df2,blend);
    float line=smoothstep(0.06,0.03,dt);
    float hue=hash(id*3.1+cellTime*0.1);
    vec3 c=0.5+0.5*cos(6.28318*(hue+vec3(0,0.33,0.67)));
    vec3 bg=vec3(0.04,0.04,0.06);
    vec3 col=mix(bg,c,line);
    fragColor=vec4(col,1.0);
}`)
  },
  {
    id: 'builtin-flow-field',
    name: 'Flow Field',
    category: 'Pattern',
    tags: ['pattern', '2d', 'flow', 'noise', 'particles'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2026-01-01',
    uniforms: [
      { name: 'uFlowSpeed', type: 'float', default: 0.5, min: 0.0, max: 3.0, doc: 'Vitesse du champ de flux' },
      { name: 'uLines', type: 'float', default: 60.0, min: 10.0, max: 200.0, doc: 'Nombre de lignes de flux' }
    ],
    code: glsl(`
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.0,a=0.5;for(int i=0;i<4;i++){v+=a*noise(p);p*=2.0;a*=0.5;}return v;}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv=fragCoord/iResolution.xy;
    uv.x*=iResolution.x/iResolution.y;
    vec3 col=vec3(0.03,0.02,0.06);
    float t=iTime*uFlowSpeed;
    // Trace flow lines
    for(float i=0.0;i<uLines;i++){
        float seed=i/uLines;
        vec2 p=vec2(hash(vec2(seed,0.1)),hash(vec2(seed,0.9)));
        float hue=seed;
        for(int s=0;s<40;s++){
            float angle=fbm(p*3.0+t)*6.28318*2.0;
            vec2 vel=vec2(cos(angle),sin(angle))*0.012;
            vec2 np=p+vel;
            // Draw segment
            vec2 pa=uv-p,ba=np-p;
            float h=clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0);
            float d=length(pa-ba*h);
            vec3 c=0.5+0.5*cos(6.28318*(hue+float(s)*0.01+vec3(0,0.33,0.67)));
            float age=1.0-float(s)/40.0;
            col+=c*exp(-d*iResolution.y*0.3)*0.04*age;
            p=np;
            if(p.x<0.0||p.x>iResolution.x/iResolution.y||p.y<0.0||p.y>1.0) break;
        }
    }
    col=1.0-exp(-col*1.5);
    fragColor=vec4(col,1.0);
}`)
  },
  {
    id: 'builtin-sand-dunes',
    name: 'Sand Dunes',
    category: 'Pattern',
    tags: ['pattern', '2d', 'sand', 'noise', 'texture', 'organic'],
    author: 'built-in',
    readonly: true,
    version: '1.0.0',
    created: '2026-01-01',
    code: glsl(`
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.0,a=0.5;for(int i=0;i<7;i++){v+=a*noise(p);p*=2.01;a*=0.5;}return v;}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv=fragCoord/iResolution.xy;
    uv.x*=iResolution.x/iResolution.y;
    float t=iTime*0.03;
    // Anisotropic noise (elongated in X for dune ridges)
    vec2 suv=vec2(uv.x*0.5,uv.y*2.0);
    float h=fbm(suv*2.0+vec2(t,0));
    // Sharpen into ridges
    float ridge=1.0-abs(h*2.0-1.0);
    ridge=pow(ridge,3.0)*2.0;
    // Wind ripples
    float ripple=noise(vec2(uv.x*30.0+t*5.0,uv.y*5.0))*0.15;
    float surface=h+ripple*0.1;
    // Color gradient: sand tones
    vec3 dark=vec3(0.55,0.38,0.18);
    vec3 light=vec3(0.95,0.82,0.55);
    vec3 shadow=vec3(0.35,0.22,0.08);
    vec3 col=mix(dark,light,surface);
    // Add ridge highlights and shadow
    col=mix(col,light*1.2,ridge*0.4);
    float shadowAmt=clamp((dFdx(surface)*5.0),0.0,1.0);
    col=mix(col,shadow,shadowAmt*0.6);
    fragColor=vec4(clamp(col,0.0,1.0),1.0);
}`)
  }
];

// ── Assemblage final des 52 presets ─────────────────────────────────────────
export const BUILTIN_PRESETS = [
  ...PRESETS_FRACTAL,
  ...PRESETS_PROCEDURAL,
  ...PRESETS_RAYMARCHING,
  ...PRESETS_AUDIO,
  ...PRESETS_COLOR,
  ...PRESETS_MATH,
  ...PRESETS_STYLIZED,
  ...PRESETS_POSTPROCESS,
  ...PRESETS_GENERATIVE,
  ...PRESETS_PARTICLE,
  ...PRESETS_PATTERN
];

// ── CATEGORIES (pour UI) ─────────────────────────────────────────────────────
export const PRESET_CATEGORIES = [
  'All',
  'Fractal',
  'Procedural',
  'Raymarching',
  'Audio',
  'Color',
  'Math',
  'Stylized',
  'Post-Processing',
  'Generative',
  'Particle',
  'Pattern'
];

// ── WIZARD TEMPLATES (courts, toujours disponibles) ──────────────────────────
export const WIZARD_TEMPLATES = {
  blank: glsl(`
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    float t = iTime;
    vec3 col = vec3(0.0);
    fragColor = vec4(col, 1.0);
}`),
  sdf: glsl(`
#define MAX_STEPS 100
#define MAX_DIST  100.0
#define SURF_DIST 0.001

float map(vec3 p) { return length(p) - 1.0; }

vec3 getNormal(vec3 p) {
    vec2 e = vec2(0.001, 0.0);
    return normalize(vec3(map(p+e.xyy)-map(p-e.xyy), map(p+e.yxy)-map(p-e.yxy), map(p+e.yyx)-map(p-e.yyx)));
}

float rayMarch(vec3 ro, vec3 rd) {
    float d = 0.0;
    for (int i = 0; i < MAX_STEPS; i++) {
        float h = map(ro + rd * d);
        if (h < SURF_DIST || d > MAX_DIST) break;
        d += h;
    }
    return d;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    vec3 ro = vec3(0.0, 0.0, 3.0);
    vec3 rd = normalize(vec3(uv, -1.5));
    float d = rayMarch(ro, rd);
    vec3 col = vec3(0.0);
    if (d < MAX_DIST) {
        vec3 p = ro + rd * d;
        vec3 n = getNormal(p);
        float diff = max(dot(n, normalize(vec3(1.0, 2.0, 3.0))), 0.0);
        col = vec3(0.2 + 0.8 * diff);
    }
    fragColor = vec4(col, 1.0);
}`),
  noise: glsl(`
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
}
float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 6; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
    return v;
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    uv.x *= iResolution.x / iResolution.y;
    float n = fbm(uv * 3.0 + vec2(iTime * 0.1, iTime * 0.07));
    vec3 col = mix(vec3(0.1, 0.05, 0.2), vec3(0.9, 0.6, 0.2), n);
    fragColor = vec4(col, 1.0);
}`),
  color: glsl(`
vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
    return a + b * cos(6.28318 * (c * t + d));
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    float d = length(uv);
    float angle = atan(uv.y, uv.x);
    float v = d * 2.0 - angle / 6.28318 + iTime * 0.3;
    vec3 col = palette(v, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.33, 0.67));
    col *= smoothstep(1.2, 0.1, d);
    fragColor = vec4(col, 1.0);
}`),

  // ── 20 nouveaux templates ─────────────────────────────────────────────────

  tunnel: glsl(`
// @range(0.5, 5.0) @label("Speed")
#define uSpeed 1.5
// @range(-3.0, 3.0) @label("Twist")
#define uTwist 0.5
vec3 pal(float t) { return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67))); }
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    float r = length(uv);
    float a = atan(uv.y, uv.x);
    float z = 1.0 / (r + 0.001);
    float t = iTime * uSpeed;
    vec3 col = pal(fract(z * 0.3 - t * 0.2) + a / 6.28318 + uTwist * 0.1 * log(r + 0.01));
    col *= 1.0 - exp(-4.0 * r);
    fragColor = vec4(col, 1.0);
}`),

  mandelbrot: glsl(`
// @range(50, 500) @label("Iterations") @step(10)
#define MAX_ITER 150
// @range(0.5, 4.0) @label("Zoom")
#define uZoom 1.0
vec3 pal(float t) { return 0.5 + 0.5 * cos(6.28318 * (t * vec3(1.0, 0.8, 0.6) + vec3(0.0, 0.15, 0.3))); }
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y / uZoom;
    vec2 c = uv + vec2(-0.7, 0.0);
    vec2 z = vec2(0.0);
    int i = 0;
    for (int n = 0; n < MAX_ITER; n++) {
        z = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y) + c;
        if (dot(z, z) > 4.0) { i = n; break; }
        i = n;
    }
    float smooth_i = float(i) - log2(log2(dot(z, z))) + 4.0;
    vec3 col = (i == MAX_ITER - 1) ? vec3(0.0) : pal(smooth_i / float(MAX_ITER));
    fragColor = vec4(col, 1.0);
}`),

  plasma: glsl(`
// @range(0.5, 5.0) @label("Speed")
#define uSpeed 1.0
// @range(1.0, 8.0) @label("Frequency")
#define uFreq 3.0
vec3 pal(float t) { return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67))); }
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    float t = iTime * uSpeed;
    float v = sin(uv.x * uFreq + t)
            + sin(uv.y * uFreq + t * 0.7)
            + sin((uv.x + uv.y) * uFreq * 0.7 + t * 1.3)
            + sin(length(uv - 0.5) * uFreq * 2.0 - t * 1.5);
    vec3 col = pal(v * 0.25 + 0.5);
    fragColor = vec4(col, 1.0);
}`),

  voronoi: glsl(`
// @range(0.5, 5.0) @label("Speed")
#define uSpeed 0.6
// @range(1.0, 8.0) @label("Echelle")
#define uScale 4.0
vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453);
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    uv.x *= iResolution.x / iResolution.y;
    uv *= uScale;
    vec2 i = floor(uv), f = fract(uv);
    float minDist1 = 8.0, minDist2 = 8.0;
    vec2 minP = vec2(0.0);
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
        vec2 n = vec2(float(x), float(y));
        vec2 p = hash2(i + n) * 0.5 + 0.5;
        p += 0.4 * sin(iTime * uSpeed + 6.28318 * hash2(i + n + 0.5));
        float d = length(n + p - f);
        if (d < minDist1) { minDist2 = minDist1; minDist1 = d; minP = p; }
        else if (d < minDist2) minDist2 = d;
    }
    float edge = smoothstep(0.0, 0.05, minDist2 - minDist1);
    vec3 col = vec3(0.8, 0.6, 1.0) * minDist1;
    col = mix(vec3(1.0, 0.9, 0.5), col, edge);
    fragColor = vec4(col, 1.0);
}`),

  truchet: glsl(`
// @range(2.0, 16.0) @label("Grille") @step(1)
#define uGrid 8.0
// @range(0.0, 1.0) @label("Speed")
#define uSpeed 0.3
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5); }
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    uv.x *= iResolution.x / iResolution.y;
    vec2 grid = floor(uv * uGrid);
    vec2 f = fract(uv * uGrid) - 0.5;
    float h = hash(grid + floor(iTime * uSpeed));
    if (h > 0.5) f.x = -f.x;
    float r = length(f) - 0.5;
    float arc = abs(r);
    float line = smoothstep(0.04, 0.0, arc - 0.02);
    vec3 col = mix(vec3(0.08, 0.1, 0.15), vec3(0.4, 0.8, 1.0), line);
    col = mix(col, vec3(0.0), smoothstep(0.48, 0.5, length(f)));
    fragColor = vec4(col, 1.0);
}`),

  galaxy: glsl(`
// @range(0.1, 3.0) @label("Speed")
#define uSpeed 0.5
// @range(0.5, 5.0) @label("Density")
#define uDensity 2.0
float hash(float n) { return fract(sin(n) * 43758.5453); }
float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(hash(dot(i, vec2(1.0,157.0))), hash(dot(i+vec2(1,0), vec2(1.0,157.0))), f.x),
               mix(hash(dot(i+vec2(0,1), vec2(1.0,157.0))), hash(dot(i+vec2(1,1), vec2(1.0,157.0))), f.x), f.y);
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    float t = iTime * uSpeed;
    float r = length(uv);
    float a = atan(uv.y, uv.x) + t * 0.3 + r * 2.0;
    vec2 sp = vec2(a / 6.28318, r) * uDensity * 3.0;
    float stars = pow(noise(sp * 5.0), 12.0) * 2.0;
    float arm = exp(-r * 4.0) * (0.5 + 0.5 * sin(a * 2.0 - t));
    vec3 col = vec3(0.6, 0.7, 1.0) * stars + vec3(0.3, 0.4, 0.9) * arm * 0.5;
    col += vec3(0.01, 0.02, 0.06) * (1.0 / (r * r + 0.1));
    fragColor = vec4(col, 1.0);
}`),

  fluid: glsl(`
// @range(0.5, 5.0) @label("Speed")
#define uSpeed 0.3
// @range(1.0, 6.0) @label("Echelle")
#define uScale 2.5
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
}
float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 6; i++) { v += a * noise(p); p = p * 2.0 + vec2(1.7, 9.2); a *= 0.5; }
    return v;
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    uv.x *= iResolution.x / iResolution.y;
    uv *= uScale;
    float t = iTime * uSpeed;
    vec2 q = vec2(fbm(uv + t * 0.1), fbm(uv + vec2(5.2, 1.3) + t * 0.13));
    vec2 r = vec2(fbm(uv + 4.0 * q + vec2(1.7, 9.2) + t * 0.08), fbm(uv + 4.0 * q + vec2(8.3, 2.8)));
    float f = fbm(uv + 4.0 * r);
    vec3 col = mix(vec3(0.1, 0.05, 0.15), vec3(0.6, 0.4, 0.2), clamp(f * f * 4.0, 0.0, 1.0));
    col = mix(col, vec3(0.8, 0.7, 0.4), clamp(length(q), 0.0, 1.0));
    col = mix(col, vec3(0.4, 0.7, 0.9), clamp(r.x, 0.0, 1.0));
    fragColor = vec4(col, 1.0);
}`),

  aurora: glsl(`
// @range(0.1, 2.0) @label("Speed")
#define uSpeed 0.4
// @range(0.0, 1.0) @label("Intensity")
#define uIntensity 0.8
float hash(float n) { return fract(sin(n) * 43758.5453); }
float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(hash(dot(i, vec2(1.0,57.0))), hash(dot(i+vec2(1,0), vec2(1.0,57.0))), f.x),
               mix(hash(dot(i+vec2(0,1), vec2(1.0,57.0))), hash(dot(i+vec2(1,1), vec2(1.0,57.0))), f.x), f.y);
}
vec3 hsv(float h, float s, float v) {
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    vec3 p = abs(fract(vec3(h) + K.xyz) * 6.0 - K.www);
    return v * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), s);
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    float t = iTime * uSpeed;
    vec3 col = vec3(0.0, 0.0, 0.05);
    for (int i = 0; i < 5; i++) {
        float fi = float(i);
        float wave = noise(vec2(uv.x * 2.0 + fi * 0.5, t + fi * 0.37));
        float band = smoothstep(0.3, 0.8, uv.y) * smoothstep(1.0, 0.5, uv.y);
        float shape = exp(-abs(uv.y - 0.5 - wave * 0.3 + fi * 0.05) * 15.0);
        vec3 hue = hsv(wave * 0.5 + fi * 0.15, 0.8, uIntensity);
        col += hue * shape * band * 0.4;
    }
    col += vec3(0.6, 0.8, 1.0) * pow(noise(uv * 80.0), 3.0) * 0.15;
    fragColor = vec4(col, 1.0);
}`),

  pixelart: glsl(`
// @range(4.0, 64.0) @label("Resolution") @step(4)
#define uPixels 32.0
// @range(2.0, 16.0) @label("Colors") @step(1)
#define uColors 8.0
vec3 pal(float t) { return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67))); }
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 res = iResolution.xy;
    float px = res.x / uPixels;
    vec2 uv = floor(fragCoord / px) * px / res;
    float t = iTime * 0.3;
    float d = length(uv - 0.5);
    float a = atan(uv.y - 0.5, uv.x - 0.5);
    float v = fract(d * 3.0 - a / 6.28318 + t);
    v = floor(v * uColors) / uColors;
    vec3 col = pal(v + t * 0.1);
    col = floor(col * 8.0) / 8.0;
    fragColor = vec4(col, 1.0);
}`),

  metaballs: glsl(`
// @range(0.5, 5.0) @label("Speed")
#define uSpeed 1.0
// @range(0.1, 1.5) @label("Rayon")
#define uRadius 0.6
float metaball(vec2 p, vec2 c) { float d = length(p - c); return uRadius / (d * d + 0.001); }
vec3 pal(float t) { return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67))); }
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    float t = iTime * uSpeed;
    vec2 centers[5];
    centers[0] = vec2(cos(t * 1.1) * 0.5, sin(t * 0.7) * 0.4);
    centers[1] = vec2(cos(t * 0.8 + 1.0) * 0.45, sin(t * 1.3 + 0.5) * 0.35);
    centers[2] = vec2(cos(t * 1.5 + 2.0) * 0.4, sin(t * 0.9 + 1.0) * 0.45);
    centers[3] = vec2(cos(t * 0.6 + 3.0) * 0.5, sin(t * 1.1 + 2.0) * 0.3);
    centers[4] = vec2(cos(t * 1.2 + 4.0) * 0.35, sin(t * 0.8 + 3.5) * 0.5);
    float s = 0.0;
    for (int i = 0; i < 5; i++) s += metaball(uv, centers[i]);
    float edge = smoothstep(3.8, 4.2, s);
    vec3 col = pal(s * 0.08 + t * 0.1) * edge;
    col += vec3(1.0) * smoothstep(5.0, 5.5, s) * 0.4;
    fragColor = vec4(col, 1.0);
}`),

  dna: glsl(`
#define MAX_STEPS 80
#define MAX_DIST  20.0
#define SURF_DIST 0.002
// @range(0.5, 4.0) @label("Speed")
#define uSpeed 1.0
float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
    vec3 ab = b - a, ap = p - a;
    float t = clamp(dot(ap, ab) / dot(ab, ab), 0.0, 1.0);
    return length(ap - t * ab) - r;
}
float map(vec3 p) {
    float t = iTime * uSpeed;
    float d = MAX_DIST;
    for (int i = 0; i < 8; i++) {
        float fi = float(i);
        float y = fi * 0.8 - 3.0;
        float a1 = fi * 0.8 + t;
        float a2 = a1 + 3.14159;
        vec3 p1 = vec3(cos(a1) * 0.5, y, sin(a1) * 0.5);
        vec3 p2 = vec3(cos(a2) * 0.5, y, sin(a2) * 0.5);
        d = min(d, length(p - p1) - 0.12);
        d = min(d, length(p - p2) - 0.12);
        d = min(d, sdCapsule(p, p1, p2, 0.04));
    }
    return d;
}
vec3 getNormal(vec3 p) {
    vec2 e = vec2(0.002, 0.0);
    return normalize(vec3(map(p+e.xyy)-map(p-e.xyy), map(p+e.yxy)-map(p-e.yxy), map(p+e.yyx)-map(p-e.yyx)));
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    vec3 ro = vec3(0.0, 0.0, 3.5);
    vec3 rd = normalize(vec3(uv, -1.5));
    float d = 0.0;
    for (int i = 0; i < MAX_STEPS; i++) {
        float h = map(ro + rd * d);
        if (h < SURF_DIST || d > MAX_DIST) break;
        d += h;
    }
    vec3 col = vec3(0.02, 0.04, 0.1);
    if (d < MAX_DIST) {
        vec3 p = ro + rd * d;
        vec3 n = getNormal(p);
        vec3 light = normalize(vec3(2.0, 3.0, 4.0));
        float diff = max(dot(n, light), 0.0);
        float spec = pow(max(dot(reflect(-light, n), -rd), 0.0), 32.0);
        vec3 baseCol = mix(vec3(0.2, 0.6, 1.0), vec3(1.0, 0.3, 0.5), p.y * 0.2 + 0.5);
        col = baseCol * (0.1 + 0.9 * diff) + vec3(1.0) * spec * 0.6;
    }
    fragColor = vec4(col, 1.0);
}`),

  crystal: glsl(`
#define MAX_STEPS 100
#define MAX_DIST  20.0
#define SURF_DIST 0.001
// @range(0.5, 3.0) @label("Rotation speed")
#define uSpeed 0.3
float sdOctahedron(vec3 p, float s) { p = abs(p); return (p.x+p.y+p.z-s) * 0.57735; }
float opUnion(float a, float b) { return min(a, b); }
float map(vec3 p) {
    float t = iTime * uSpeed;
    float c = cos(t), s = sin(t);
    mat2 rot = mat2(c, -s, s, c);
    p.xz = rot * p.xz;
    p.yz = rot * 0.7 * p.yz;
    float d = sdOctahedron(p, 0.8);
    d = opUnion(d, sdOctahedron(p * 1.6 + vec3(0.1, 0.3, 0.1), 0.5));
    d = opUnion(d, sdOctahedron(p * 2.5 + vec3(-0.2, -0.2, 0.3), 0.3));
    return d;
}
vec3 getNormal(vec3 p) {
    vec2 e = vec2(0.001, 0.0);
    return normalize(vec3(map(p+e.xyy)-map(p-e.xyy), map(p+e.yxy)-map(p-e.yxy), map(p+e.yyx)-map(p-e.yyx)));
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    vec3 ro = vec3(0.0, 0.0, 3.0);
    vec3 rd = normalize(vec3(uv, -1.5));
    float d = 0.0;
    for (int i = 0; i < MAX_STEPS; i++) {
        float h = map(ro + rd * d);
        if (h < SURF_DIST || d > MAX_DIST) break;
        d += h * 0.8;
    }
    vec3 col = vec3(0.02, 0.02, 0.05);
    if (d < MAX_DIST) {
        vec3 p = ro + rd * d;
        vec3 n = getNormal(p);
        vec3 r = reflect(rd, n);
        float fresnel = pow(1.0 - max(dot(-rd, n), 0.0), 3.0);
        vec3 light = normalize(vec3(1.0, 2.0, 3.0));
        float diff = max(dot(n, light), 0.0);
        float spec = pow(max(dot(r, light), 0.0), 64.0);
        vec3 baseCol = mix(vec3(0.4, 0.7, 1.0), vec3(0.8, 0.4, 1.0), fresnel);
        col = baseCol * (0.1 + 0.6 * diff) + vec3(1.0, 0.9, 0.8) * spec * 0.8 + vec3(0.3, 0.5, 1.0) * fresnel * 0.5;
    }
    fragColor = vec4(col, 1.0);
}`),

  ocean: glsl(`
// @range(0.5, 3.0) @label("Speed")
#define uSpeed 0.8
// @range(0.1, 2.0) @label("Wave height")
#define uWaveHeight 0.6
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
}
float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.1; a *= 0.5; }
    return v;
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    float t = iTime * uSpeed;
    float wave = fbm(uv * 2.0 + vec2(t * 0.3, 0.0)) * uWaveHeight;
    wave += fbm(uv * 4.0 + vec2(0.0, t * 0.2)) * uWaveHeight * 0.5;
    float horizon = uv.y + 0.1 + wave * 0.15;
    vec3 sky = mix(vec3(0.4, 0.6, 0.9), vec3(0.8, 0.85, 1.0), uv.y + 0.5);
    float fresnel = pow(clamp(1.0 - abs(horizon) * 4.0, 0.0, 1.0), 2.0);
    vec3 water = mix(vec3(0.0, 0.1, 0.25), vec3(0.0, 0.4, 0.7), fresnel);
    water += vec3(0.8, 0.9, 1.0) * pow(max(dot(normalize(vec3(uv, 1.0)), normalize(vec3(0.5, 1.0, 0.5))), 0.0), 64.0) * 0.5;
    vec3 col = mix(water, sky, smoothstep(-0.01, 0.01, horizon));
    fragColor = vec4(col, 1.0);
}`),

  fire: glsl(`
// @range(0.5, 3.0) @label("Speed")
#define uSpeed 1.2
// @range(0.5, 3.0) @label("Intensity")
#define uIntensity 1.5
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
}
float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.0 + vec2(0.1, 0.3) * float(i); a *= 0.5; }
    return v;
}
vec3 fireColor(float t) {
    t = clamp(t, 0.0, 1.0);
    return vec3(t * 1.8, t * t * 0.8, t * t * t * 0.2);
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    uv.x = uv.x * 2.0 - 1.0;
    float t = iTime * uSpeed;
    float f = fbm(vec2(uv.x * 1.5, uv.y * 2.0 - t) + vec2(0.0, 1.0)) * uIntensity;
    f -= uv.y * 1.5;
    f = clamp(f, 0.0, 1.0);
    float edge = 1.0 - abs(uv.x);
    f *= edge * edge;
    vec3 col = fireColor(f);
    col += vec3(0.1, 0.05, 0.0) * smoothstep(0.3, 0.0, abs(uv.x));
    fragColor = vec4(col, 1.0);
}`),

  matrix: glsl(`
// @range(0.5, 4.0) @label("Speed")
#define uSpeed 1.5
// @range(20.0, 80.0) @label("Columns") @step(4)
#define uCols 40.0
float hash(float n) { return fract(sin(n) * 43758.5453); }
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 res = iResolution.xy;
    float aspect = res.x / res.y;
    vec2 uv = fragCoord / res;
    float cols = uCols;
    float rows = cols / aspect;
    vec2 cell = floor(uv * vec2(cols, rows));
    float speed = hash(cell.x) * 0.5 + 0.5;
    float offset = hash(cell.x + 13.7) * 20.0;
    float t = iTime * uSpeed * speed + offset;
    float glyph = floor(hash(cell + floor(t) * 17.3) * 94.0);
    float alpha = fract(t) > 0.5 ? 1.0 : 0.0;
    float trail = clamp(1.0 - fract(t) * 2.0, 0.0, 1.0);
    float prevGlyph = floor(hash(cell + floor(t - 1.0) * 17.3) * 94.0);
    float head = step(0.9, fract(t)) * alpha;
    vec3 col = mix(vec3(0.0, 0.3, 0.05), vec3(0.6, 1.0, 0.7), head) * trail * alpha;
    col += vec3(0.0, 0.05, 0.01) * (1.0 - head);
    fragColor = vec4(col, 1.0);
}`),

  kaleidoscope: glsl(`
// @range(2.0, 16.0) @label("Symmetries") @step(1)
#define uSym 6.0
// @range(0.5, 3.0) @label("Speed")
#define uSpeed 0.5
// @range(0.5, 5.0) @label("Zoom")
#define uZoom 2.0
vec3 pal(float t) { return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67))); }
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    float t = iTime * uSpeed;
    float r = length(uv);
    float a = atan(uv.y, uv.x);
    float slice = 6.28318 / uSym;
    a = mod(a, slice);
    a = abs(a - slice * 0.5);
    uv = vec2(cos(a), sin(a)) * r * uZoom;
    uv += t * 0.1;
    float d = length(fract(uv) - 0.5);
    vec3 col = pal(d * 3.0 + r * 0.5 + t * 0.2);
    col *= smoothstep(0.5, 0.45, d);
    fragColor = vec4(col, 1.0);
}`),

  glitch: glsl(`
// @range(0.5, 5.0) @label("Intensity")
#define uIntensity 1.5
// @range(0.5, 5.0) @label("Speed")
#define uSpeed 1.0
float hash(float n) { return fract(sin(n) * 43758.5453); }
float hash2(vec2 n) { return fract(sin(dot(n, vec2(127.1, 311.7))) * 43758.5453); }
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    float t = floor(iTime * uSpeed * 4.0) / 4.0;
    float scanline = floor(uv.y * 60.0) / 60.0;
    float glitchAmt = hash(scanline + t) * uIntensity;
    float trigger = step(0.92, hash(scanline * 7.3 + t));
    float shift = (hash(t + scanline) - 0.5) * 0.08 * uIntensity * trigger;
    vec2 uvR = vec2(uv.x + shift, uv.y);
    vec2 uvG = uv;
    vec2 uvB = vec2(uv.x - shift * 0.7, uv.y);
    vec3 pal1 = 0.5 + 0.5 * cos(6.28318 * (uvR.x * 3.0 + vec3(0.0, 0.33, 0.67) + t * 0.1));
    vec3 pal2 = 0.5 + 0.5 * cos(6.28318 * (uvG.x * 3.0 + vec3(0.0, 0.33, 0.67) + t * 0.1));
    vec3 pal3 = 0.5 + 0.5 * cos(6.28318 * (uvB.x * 3.0 + vec3(0.0, 0.33, 0.67) + t * 0.1));
    vec3 col = vec3(pal1.r, pal2.g, pal3.b);
    col += (hash2(uv * 300.0 + t) - 0.5) * 0.04 * uIntensity;
    float band = step(0.97, hash(floor(uv.y * 12.0) + t * 3.0)) * step(0.0, sin(uv.x * 40.0 + t * 30.0));
    col = mix(col, 1.0 - col, band * 0.4);
    fragColor = vec4(col, 1.0);
}`),

  hypnotic: glsl(`
// @range(0.5, 5.0) @label("Speed")
#define uSpeed 1.0
// @range(2.0, 12.0) @label("Anneaux") @step(1)
#define uRings 6.0
// @range(0.5, 5.0) @label("Frequency")
#define uFreq 3.0
vec3 pal(float t) { return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67))); }
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    float t = iTime * uSpeed;
    float r = length(uv);
    float a = atan(uv.y, uv.x);
    float rings = sin(r * uRings * 3.14159 - t * 2.0);
    float spiral = sin(a * uFreq + r * uRings - t * 3.0);
    float pulse = sin(r * uRings * 0.5 + t);
    float v = rings * spiral * pulse;
    v = v * 0.5 + 0.5;
    vec3 col = pal(v + r * 0.3 + t * 0.1);
    col *= 1.0 - smoothstep(0.8, 1.0, r);
    fragColor = vec4(col, 1.0);
}`),

  terrain: glsl(`
#define MAX_STEPS 100
#define MAX_DIST  30.0
#define SURF_DIST 0.01
// @range(0.1, 1.0) @label("Speed")
#define uSpeed 0.2
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
}
float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 6; i++) { v += a * noise(p); p *= 2.1; a *= 0.5; }
    return v;
}
float map(vec3 p) {
    float h = fbm(p.xz * 0.5) * 2.5;
    return p.y - h;
}
vec3 getNormal(vec3 p) {
    vec2 e = vec2(0.05, 0.0);
    return normalize(vec3(map(p+e.xyy)-map(p-e.xyy), map(p+e.yxy)-map(p-e.yxy), map(p+e.yyx)-map(p-e.yyx)));
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    float t = iTime * uSpeed;
    vec3 ro = vec3(t * 4.0, 3.0, t * 2.0);
    vec3 rd = normalize(vec3(uv.x, uv.y - 0.3, -1.0));
    float d = 0.0;
    int steps = 0;
    for (int i = 0; i < MAX_STEPS; i++) {
        float h = map(ro + rd * d);
        if (abs(h) < SURF_DIST || d > MAX_DIST) { steps = i; break; }
        d += h * 0.5;
        steps = i;
    }
    vec3 col = mix(vec3(0.4, 0.6, 0.9), vec3(0.7, 0.8, 1.0), -uv.y);
    if (d < MAX_DIST) {
        vec3 p = ro + rd * d;
        vec3 n = getNormal(p);
        vec3 light = normalize(vec3(1.0, 2.0, 1.0));
        float diff = max(dot(n, light), 0.0);
        float h = fbm(p.xz * 0.5);
        vec3 grass = mix(vec3(0.2, 0.5, 0.1), vec3(0.4, 0.7, 0.2), diff);
        vec3 rock  = mix(vec3(0.3, 0.25, 0.2), vec3(0.5, 0.4, 0.35), diff);
        vec3 snow  = vec3(0.9, 0.95, 1.0);
        col = mix(grass, rock, smoothstep(0.5, 0.8, n.y < 0.6 ? 1.0 : 0.0));
        col = mix(col, rock, smoothstep(0.7, 0.5, n.y));
        col = mix(col, snow, smoothstep(1.8, 2.2, h * 2.5));
        col *= (0.3 + 0.7 * diff);
        col = mix(col, vec3(0.6, 0.7, 0.8), 1.0 - exp(-0.008 * d * d));
    }
    fragColor = vec4(col, 1.0);
}`),

  pbr_sphere: glsl(`
#define MAX_STEPS 100
#define MAX_DIST  20.0
#define SURF_DIST 0.001
#define PI 3.14159265
// @range(0.0, 1.0) @label("Roughness")
#define uRoughness 0.3
// @range(0.0, 1.0) @label("Metallic")
#define uMetallic 0.9
float map(vec3 p) { return length(p) - 1.0; }
vec3 getNormal(vec3 p) {
    vec2 e = vec2(0.001, 0.0);
    return normalize(vec3(map(p+e.xyy)-map(p-e.xyy), map(p+e.yxy)-map(p-e.yxy), map(p+e.yyx)-map(p-e.yyx)));
}
float D_GGX(float NdotH, float roughness) {
    float a = roughness * roughness;
    float a2 = a * a;
    float d = NdotH * NdotH * (a2 - 1.0) + 1.0;
    return a2 / (PI * d * d);
}
float G_SchlickGGX(float NdotV, float roughness) {
    float r = roughness + 1.0;
    float k = r * r / 8.0;
    return NdotV / (NdotV * (1.0 - k) + k);
}
vec3 F_Schlick(float cosTheta, vec3 F0) { return F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0); }
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    vec3 ro = vec3(0.0, 0.0, 3.0);
    vec3 rd = normalize(vec3(uv, -1.5));
    float d = 0.0;
    for (int i = 0; i < MAX_STEPS; i++) {
        float h = map(ro + rd * d);
        if (h < SURF_DIST || d > MAX_DIST) break;
        d += h;
    }
    vec3 col = vec3(0.02);
    if (d < MAX_DIST) {
        vec3 p = ro + rd * d;
        vec3 n = getNormal(p);
        vec3 v = -rd;
        float t = iTime * 0.3;
        vec3 lightPos = vec3(cos(t) * 3.0, 2.0, sin(t) * 3.0);
        vec3 l = normalize(lightPos - p);
        vec3 h2 = normalize(v + l);
        float NdotL = max(dot(n, l), 0.0);
        float NdotV = max(dot(n, v), 0.001);
        float NdotH = max(dot(n, h2), 0.0);
        float HdotV = max(dot(h2, v), 0.0);
        vec3 baseColor = vec3(0.8, 0.6, 0.2);
        vec3 F0 = mix(vec3(0.04), baseColor, uMetallic);
        float roughness = max(uRoughness, 0.04);
        vec3 F = F_Schlick(HdotV, F0);
        float D = D_GGX(NdotH, roughness);
        float G = G_SchlickGGX(NdotV, roughness) * G_SchlickGGX(NdotL, roughness);
        vec3 specular = D * G * F / (4.0 * NdotV * NdotL + 0.001);
        vec3 kD = (1.0 - F) * (1.0 - uMetallic);
        vec3 diffuse = kD * baseColor / PI;
        vec3 lightColor = vec3(3.0, 2.5, 2.0);
        col = (diffuse + specular) * lightColor * NdotL;
        col += baseColor * 0.03;
        col = pow(col / (col + 1.0), vec3(1.0 / 2.2));
    }
    fragColor = vec4(col, 1.0);
}`)
};

// ── TEMPLATES DE PROJET COMPLETS ─────────────────────────────────────────────
//
// Chaque template est un objet "projet" prêt à l'emploi :
//   .id, .name, .description — identité
//   .mainShader — code GLSL du shader principal
//   .passes — tableau de passes (multipass)
//   .uniforms — uniforms documentés avec valeurs par défaut
//   .snippets — morceaux GLSL utiles inclus dans le projet
//   .tags, .format, .thumbnail — métadonnées
//

export const PROJECT_TEMPLATES = {

  // ── 1. Live VJ ─────────────────────────────────────────────────────────────
  'live-vj': {
    id: 'tpl-live-vj',
    name: 'Live VJ',
    description: 'Template optimized for live VJ: audio-reactive tunnel, bloom, chromatic aberration. Controllable via MIDI/OSC.',
    tags: ['vj', 'audio', 'live', 'tunnel', 'post-fx'],
    format: 'glsl',
    thumbnail: 'tunnel',
    uniforms: [
      { name: 'uSpeed', type: 'float', default: 1.0, min: 0.0, max: 5.0, doc: 'Tunnel scroll speed' },
      { name: 'uColorShift', type: 'float', default: 0.0, min: 0.0, max: 1.0, doc: 'Hue rotation (0-1 = 0-360°)' },
      { name: 'uAudioGain', type: 'float', default: 1.0, min: 0.0, max: 4.0, doc: 'Audio signal amplification' },
      { name: 'uBloomThreshold', type: 'float', default: 0.6, min: 0.0, max: 1.0, doc: 'Bloom threshold' },
      { name: 'uChromaticStrength', type: 'float', default: 0.012, min: 0.0, max: 0.05, doc: 'Chromatic aberration strength' }
    ],
    snippets: [
      {
        name: 'palette',
        doc: 'IQ cosine palette — call with t in [0,1]',
        code: 'vec3 palette(float t,vec3 a,vec3 b,vec3 c,vec3 d){return a+b*cos(6.28318*(c*t+d));}'
      },
      {
        name: 'audioSample',
        doc: 'Samples FFT of iChannel0 at a normalized frequency',
        code: 'float audioFFT(float freq){return texture(iChannel0,vec2(freq*0.5,0.25)).r*uAudioGain;}'
      }
    ],
    passes: [
      {
        name: 'BufferA — Main render',
        description: 'Rendu principal du tunnel audio-réactif',
        inputs: { iChannel0: 'audio' },
        code: glsl(`
// BufferA — Tunnel audio-réactif
// iChannel0 = audio | uniforms : uSpeed, uColorShift, uAudioGain
vec3 palette(float t,vec3 a,vec3 b,vec3 c,vec3 d){return a+b*cos(6.28318*(c*t+d));}
float audioFFT(float freq){return texture(iChannel0,vec2(freq*0.5,0.25)).r;}

float tunnel(vec3 p) {
    float audio = audioFFT(0.15) * uAudioGain;
    float r = 0.7 + 0.25*sin(p.z*2.0)*cos(p.z*0.8) + audio*0.2;
    return length(p.xy) - r;
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv=(fragCoord-0.5*iResolution.xy)/iResolution.y;
    float bass = audioFFT(0.05)*uAudioGain;
    vec3 ro=vec3(sin(iTime*0.1)*0.2,cos(iTime*0.07)*0.2,iTime*uSpeed*2.0);
    vec3 rd=normalize(vec3(uv,1.0));
    float d=0.0;
    for(int i=0;i<80;i++){float h=tunnel(ro+rd*d);if(abs(h)<0.002||d>20.0)break;d+=h*0.5;}
    vec3 col=vec3(0.0);
    if(d<20.0){
        vec3 p=ro+rd*d;
        float ang=atan(p.y,p.x)/3.14159;
        float freq=audioFFT(abs(ang*0.4+0.5));
        vec3 hue=palette(ang+uColorShift+iTime*0.05,vec3(0.5),vec3(0.5),vec3(1),vec3(0,0.33,0.67));
        col=hue*(0.5+freq*1.5);
        col*=1.0-d/20.0;
        // Rings pulsants
        float ring=sin(p.z*6.0-iTime*uSpeed*6.0)*0.5+0.5;
        col+=hue*ring*bass*0.5;
    }
    fragColor=vec4(col,1.0);
}`)
      },
      {
        name: 'BufferB — Bloom',
        description: 'Passe bloom sur le rendu du BufferA',
        inputs: { iChannel0: 'BufferA' },
        code: glsl(`
// BufferB — Bloom pass | iChannel0 = BufferA | uniform: uBloomThreshold
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv=fragCoord/iResolution.xy;
    vec3 base=texture(iChannel0,uv).rgb;
    vec3 bloom=vec3(0.0); float wTotal=0.0;
    vec2 px=1.0/iResolution.xy;
    for(int x=-6;x<=6;x++) for(int y=-6;y<=6;y++){
        vec2 off=vec2(float(x),float(y))*px*2.5;
        vec3 s=texture(iChannel0,uv+off).rgb;
        float bright=dot(s,vec3(0.2126,0.7152,0.0722));
        float w=exp(-float(x*x+y*y)*0.08)*max(0.0,bright-uBloomThreshold);
        bloom+=s*w; wTotal+=w+0.0001;
    }
    fragColor=vec4(base+bloom/wTotal*2.0,1.0);
}`)
      },
      {
        name: 'Image — Chromatic Aberration',
        description: 'Passe finale : aberration chromatique + vignette',
        inputs: { iChannel0: 'BufferB' },
        code: glsl(`
// Image — Chromatic aberration + vignette | iChannel0 = BufferB
// uniform: uChromaticStrength
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv=fragCoord/iResolution.xy;
    vec2 center=uv-0.5;
    float s=uChromaticStrength;
    float r=texture(iChannel0,uv+center*s).r;
    float g=texture(iChannel0,uv).g;
    float b=texture(iChannel0,uv-center*s).b;
    vec3 col=vec3(r,g,b);
    float vig=1.0-dot(center*1.2,center*1.2);
    col*=vig*vig;
    fragColor=vec4(col,1.0);
}`)
      }
    ],
    mainShader: glsl(`
// SHADER PRINCIPAL — Live VJ
// Ce fichier est la passe Image finale (voir passes ci-dessus pour le pipeline complet).
// En mode simple (sans multipass), ce shader tourne seul de façon autonome.

vec3 palette(float t,vec3 a,vec3 b,vec3 c,vec3 d){return a+b*cos(6.28318*(c*t+d));}

float tunnel(vec3 p) {
    float r=0.8+0.3*sin(p.z*1.5)*cos(p.z*0.7);
    return length(p.xy)-r;
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv=(fragCoord-0.5*iResolution.xy)/iResolution.y;
    vec3 ro=vec3(0,0,iTime*2.0), rd=normalize(vec3(uv,1.0));
    float d=0.0;
    for(int i=0;i<80;i++){float h=tunnel(ro+rd*d);if(abs(h)<0.002||d>20.0)break;d+=h*0.5;}
    vec3 col=vec3(0.0);
    if(d<20.0){
        vec3 p=ro+rd*d;
        float ang=atan(p.y,p.x)/3.14159;
        vec3 hue=palette(ang+iTime*0.08,vec3(0.5),vec3(0.5),vec3(1),vec3(0,0.33,0.67));
        col=hue*(1.0-d/20.0);
        col+=hue*sin(p.z*6.0-iTime*12.0)*0.5+0.5;
    }
    // Vignette
    vec2 vig=uv*1.5; col*=1.0-dot(vig,vig)*0.3;
    fragColor=vec4(col,1.0);
}`)
  },

  // ── 2. Installation Art ────────────────────────────────────────────────────
  'installation-art': {
    id: 'tpl-installation-art',
    name: 'Installation Art',
    description: 'Paysage abstrait lent, hypnotique, conçu pour une projection en boucle longue. Minimaliste, sans beat.',
    tags: ['installation', 'ambient', 'slow', 'projection', 'loop'],
    format: 'glsl',
    thumbnail: 'landscape',
    uniforms: [
      { name: 'uEvolutionSpeed', type: 'float', default: 0.02, min: 0.0, max: 0.2, doc: 'Vitesse d\'évolution globale' },
      { name: 'uScale', type: 'float', default: 1.0, min: 0.1, max: 5.0, doc: 'Échelle spatiale du pattern' },
      { name: 'uPalette', type: 'float', default: 0.0, min: 0.0, max: 1.0, doc: 'Sélection de palette (0=sombre, 1=chaud)' },
      { name: 'uDepth', type: 'float', default: 6.0, min: 1.0, max: 12.0, doc: 'Octaves FBM' }
    ],
    snippets: [
      {
        name: 'fbm',
        doc: 'Fractional Brownian Motion — base du générateur',
        code: glsl(`
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p,int oct){float v=0.0,a=0.5;for(int i=0;i<12;i++){if(i>=oct)break;v+=a*noise(p);p*=2.01;a*=0.5;}return v;}`)
      }
    ],
    passes: [],
    mainShader: glsl(`
// Installation Art — paysage abstrait évolutif lent
// uniforms : uEvolutionSpeed, uScale, uPalette, uDepth

float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.0,a=0.5;for(int i=0;i<8;i++){v+=a*noise(p);p*=2.01;a*=0.5;}return v;}

vec3 coolPalette(float t){return mix(vec3(0.05,0.08,0.2),vec3(0.5,0.7,0.9),t);}
vec3 warmPalette(float t){return mix(vec3(0.1,0.04,0.02),vec3(1.0,0.7,0.2),t);}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv=fragCoord/iResolution.xy;
    uv.x*=iResolution.x/iResolution.y;
    float t=iTime*uEvolutionSpeed;
    uv*=uScale;
    // Domain warping en couches
    vec2 q=vec2(fbm(uv+t),fbm(uv+vec2(5.2,1.3)+t));
    vec2 r=vec2(fbm(uv+3.0*q+vec2(1.7,9.2)+t*0.7),fbm(uv+3.0*q+vec2(8.3,2.8)+t*0.5));
    float f=fbm(uv+3.5*r+t*0.3);
    float luma=f*f*f*0.5 + f*f*1.5 + f*0.3;
    vec3 cool=coolPalette(luma);
    vec3 warm=warmPalette(luma);
    vec3 col=mix(cool,warm,uPalette);
    // Vignette douce
    vec2 v=(uv/uScale-0.5)*2.0;
    col*=1.0-0.4*dot(v,v);
    fragColor=vec4(col,1.0);
}`)
  },

  // ── 3. Démo Compo ──────────────────────────────────────────────────────────
  'demo-compo': {
    id: 'tpl-demo-compo',
    name: 'Démo Compo',
    description: 'Template 4K/1080p pour compétition demoparty. Scène SDF raymarché avec éclairage PBR simplifié, bloom, motion blur.',
    tags: ['demo', 'compo', '3d', 'raymarching', 'pbr', 'multipass'],
    format: 'glsl',
    thumbnail: 'sdf',
    uniforms: [
      { name: 'uLightPos', type: 'vec3', default: [2.0, 4.0, 3.0], doc: 'Position de la lumière principale' },
      { name: 'uLightColor', type: 'vec3', default: [1.0, 0.9, 0.7], doc: 'Couleur de la lumière' },
      { name: 'uRoughness', type: 'float', default: 0.4, min: 0.0, max: 1.0, doc: 'Roughness PBR global' },
      { name: 'uMetallic', type: 'float', default: 0.0, min: 0.0, max: 1.0, doc: 'Metallic PBR global' },
      { name: 'uAO', type: 'float', default: 0.8, min: 0.0, max: 1.0, doc: 'Intensité de l\'occlusion ambiante' },
      { name: 'uFogDensity', type: 'float', default: 0.03, min: 0.0, max: 0.2, doc: 'Densité du brouillard' }
    ],
    snippets: [
      {
        name: 'sdf-primitives',
        doc: 'Primitives SDF de base (sphère, boîte, tore, capsule)',
        code: glsl(`
float sdSphere(vec3 p,float r){return length(p)-r;}
float sdBox(vec3 p,vec3 b){vec3 d=abs(p)-b;return length(max(d,0.0))+min(max(d.x,max(d.y,d.z)),0.0);}
float sdTorus(vec3 p,vec2 t){return length(vec2(length(p.xz)-t.x,p.y))-t.y;}
float sdCapsule(vec3 p,vec3 a,vec3 b,float r){vec3 ab=b-a,ap=p-a;float h=clamp(dot(ap,ab)/dot(ab,ab),0.0,1.0);return length(ap-ab*h)-r;}
float opSmoothUnion(float d1,float d2,float k){float h=clamp(0.5+0.5*(d2-d1)/k,0.0,1.0);return mix(d2,d1,h)-k*h*(1.0-h);}`)
      },
      {
        name: 'pbr-brdf',
        doc: 'BRDF GGX simplifié pour éclairage PBR temps réel',
        code: glsl(`
float D_GGX(float NdotH,float rough){float a=rough*rough;float a2=a*a;float d=NdotH*NdotH*(a2-1.0)+1.0;return a2/(3.14159*d*d);}
float G_Schlick(float NdotV,float rough){float r=rough+1.0;float k=r*r/8.0;return NdotV/(NdotV*(1.0-k)+k);}
vec3 F_Schlick(float VdotH,vec3 F0){return F0+(1.0-F0)*pow(1.0-VdotH,5.0);}
vec3 pbrBRDF(vec3 N,vec3 V,vec3 L,vec3 albedo,float rough,float metal){
    vec3 H=normalize(V+L);
    float NdotL=max(dot(N,L),0.0),NdotV=max(dot(N,V),0.0),NdotH=max(dot(N,H),0.0),VdotH=max(dot(V,H),0.0);
    vec3 F0=mix(vec3(0.04),albedo,metal);
    vec3 F=F_Schlick(VdotH,F0);
    float D=D_GGX(NdotH,rough),G=G_Schlick(NdotL,rough)*G_Schlick(NdotV,rough);
    vec3 spec=D*G*F/(4.0*NdotL*NdotV+0.001);
    vec3 diff=(1.0-F)*(1.0-metal)*albedo/3.14159;
    return (diff+spec)*NdotL;
}`)
      }
    ],
    passes: [
      {
        name: 'BufferA — Raymarched scene',
        description: 'Scène SDF principale avec PBR simplifié',
        inputs: {},
        code: glsl(`
// BufferA — Scène raymarché | uniforms : uLightPos, uLightColor, uRoughness, uMetallic, uAO, uFogDensity
float sdSphere(vec3 p,float r){return length(p)-r;}
float sdBox(vec3 p,vec3 b){vec3 d=abs(p)-b;return length(max(d,0.0))+min(max(d.x,max(d.y,d.z)),0.0);}
float sdTorus(vec3 p,vec2 t){return length(vec2(length(p.xz)-t.x,p.y))-t.y;}
float opSU(float d1,float d2,float k){float h=clamp(0.5+0.5*(d2-d1)/k,0.0,1.0);return mix(d2,d1,h)-k*h*(1.0-h);}

float map(vec3 p){
    float t=iTime*0.3;
    float a=sdSphere(p-vec3(sin(t)*0.8,0.5,cos(t)*0.8),0.4);
    float b=sdTorus(p-vec3(0,-0.3,0),vec2(1.0,0.12));
    float c=sdBox(p-vec3(cos(t*0.7)*0.6,sin(t*1.1)*0.3,sin(t*0.9)*0.6),vec3(0.2));
    return opSU(opSU(a,b,0.3),c,0.2);
}
vec3 normal(vec3 p){vec2 e=vec2(0.001,0.0);return normalize(vec3(map(p+e.xyy)-map(p-e.xyy),map(p+e.yxy)-map(p-e.yxy),map(p+e.yyx)-map(p-e.yyx)));}
float ao(vec3 p,vec3 n){float occ=0.0,s=1.0;for(int i=1;i<=5;i++){float h=0.01+0.1*float(i);occ+=(h-map(p+n*h))/s;s*=2.0;}return clamp(1.0-3.0*occ,0.0,1.0);}

vec3 pbrSimple(vec3 N,vec3 V,vec3 L,vec3 lCol,vec3 alb,float r,float m){
    vec3 H=normalize(V+L);float ndl=max(dot(N,L),0.0),ndh=max(dot(N,H),0.0),vdh=max(dot(V,H),0.0);
    float a=r*r,a2=a*a,d=ndh*ndh*(a2-1.0)+1.0;
    float D=a2/(3.14159*d*d);
    float G=ndl/(ndl*(1.0-r/2.0)+r/2.0);
    vec3 F0=mix(vec3(0.04),alb,m);
    vec3 F=F0+(1.0-F0)*pow(1.0-vdh,5.0);
    vec3 spec=D*G*F/(4.0*max(dot(N,V),0.0)+0.001);
    vec3 diff=(1.0-F)*(1.0-m)*alb/3.14159;
    return (diff+spec)*ndl*lCol;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv=(fragCoord-0.5*iResolution.xy)/iResolution.y;
    float t=iTime*0.25;
    vec3 ro=vec3(2.5*cos(t),1.5,2.5*sin(t));
    vec3 ta=vec3(0,0,0);
    vec3 f=normalize(ta-ro),r=normalize(cross(vec3(0,1,0),f)),u=cross(f,r);
    vec3 rd=normalize(uv.x*r+uv.y*u+1.5*f);
    float d=0.0; bool hit=false;
    for(int i=0;i<100;i++){float h=map(ro+rd*d);if(h<0.001){hit=true;break;}if(d>15.0)break;d+=h;}
    vec3 col=mix(vec3(0.05,0.07,0.15),vec3(0.02,0.03,0.08),uv.y+0.5);
    if(hit){
        vec3 p=ro+rd*d,N=normal(p),V=-rd;
        vec3 L=normalize(uLightPos-p);
        float occl=mix(1.0,ao(p,N),uAO);
        vec3 alb=mix(vec3(0.6,0.4,0.8),vec3(0.9,0.6,0.2),fract(length(p)*2.0+t));
        col=pbrSimple(N,V,L,uLightColor,alb,uRoughness,uMetallic);
        col+=alb*0.05*occl;
        col*=occl;
        // Fog
        col=mix(col,vec3(0.05,0.07,0.15),1.0-exp(-d*uFogDensity));
    }
    fragColor=vec4(col,1.0);
}`)
      },
      {
        name: 'Image — Bloom + Tonemap',
        description: 'Bloom + tonemapping ACES + FXAA',
        inputs: { iChannel0: 'BufferA' },
        code: glsl(`
// Image finale — bloom + ACES tonemapping
vec3 aces(vec3 x){return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0);}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv=fragCoord/iResolution.xy;
    vec3 base=texture(iChannel0,uv).rgb;
    vec3 bloom=vec3(0.0); float wt=0.0;
    vec2 px=1.0/iResolution.xy;
    for(int x=-5;x<=5;x++) for(int y=-5;y<=5;y++){
        vec2 off=vec2(float(x),float(y))*px*2.0;
        vec3 s=texture(iChannel0,uv+off).rgb;
        float b=max(dot(s,vec3(0.2126,0.7152,0.0722))-0.65,0.0);
        float w=exp(-float(x*x+y*y)*0.1)*b;
        bloom+=s*w; wt+=w+0.00001;
    }
    vec3 col=base+bloom/wt*1.5;
    col=aces(col*1.2);
    col=pow(col,vec3(1.0/2.2)); // gamma
    fragColor=vec4(col,1.0);
}`)
      }
    ],
    mainShader: glsl(`
// Démo Compo — shader autonome (sans multipass)
// Pour le pipeline complet voir les passes ci-dessus
float sdSphere(vec3 p,float r){return length(p)-r;}
float sdTorus(vec3 p,vec2 t){return length(vec2(length(p.xz)-t.x,p.y))-t.y;}
float opSU(float d1,float d2,float k){float h=clamp(0.5+0.5*(d2-d1)/k,0.0,1.0);return mix(d2,d1,h)-k*h*(1.0-h);}
float map(vec3 p){
    float t=iTime*0.4;
    return opSU(sdSphere(p-vec3(sin(t)*0.8,0.5,cos(t)*0.8),0.4),sdTorus(p-vec3(0,-0.3,0),vec2(1.0,0.12)),0.3);
}
vec3 normal(vec3 p){vec2 e=vec2(0.001,0.0);return normalize(vec3(map(p+e.xyy)-map(p-e.xyy),map(p+e.yxy)-map(p-e.yxy),map(p+e.yyx)-map(p-e.yyx)));}
vec3 aces(vec3 x){return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0);}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv=(fragCoord-0.5*iResolution.xy)/iResolution.y;
    float t=iTime*0.25;
    vec3 ro=vec3(2.5*cos(t),1.5,2.5*sin(t)),ta=vec3(0);
    vec3 f=normalize(ta-ro),r=normalize(cross(vec3(0,1,0),f)),u=cross(f,r);
    vec3 rd=normalize(uv.x*r+uv.y*u+1.5*f);
    float d=0.0; bool hit=false;
    for(int i=0;i<100;i++){float h=map(ro+rd*d);if(h<0.001){hit=true;break;}if(d>12.0)break;d+=h;}
    vec3 col=vec3(0.04,0.06,0.12);
    if(hit){
        vec3 p=ro+rd*d,N=normal(p);
        float diff=clamp(dot(N,normalize(vec3(1,2,3))),0.0,1.0);
        vec3 alb=mix(vec3(0.5,0.3,0.8),vec3(0.9,0.5,0.1),fract(length(p)+t));
        col=alb*(0.1+0.9*diff);
        col=mix(col,vec3(0.04,0.06,0.12),clamp(d/12.0,0.0,1.0)*0.5);
    }
    col=aces(col);
    fragColor=vec4(pow(col,vec3(1.0/2.2)),1.0);
}`)
  },

  // ── 4. Simulation Physique ─────────────────────────────────────────────────
  'physical-simulation': {
    id: 'tpl-physical-simulation',
    name: 'Simulation Physique',
    description: 'Pipeline multipass pour simuler la physique GPU : fluide incompressible (Navier-Stokes simplifié) ou particules.',
    tags: ['physics', 'simulation', 'fluid', 'multipass', 'gpu'],
    format: 'glsl',
    thumbnail: 'fluid',
    uniforms: [
      { name: 'uViscosity', type: 'float', default: 0.98, min: 0.8, max: 1.0, doc: 'Viscosité du fluide (1=non-visqueux)' },
      { name: 'uForceRadius', type: 'float', default: 0.05, min: 0.01, max: 0.3, doc: 'Rayon de la force externe' },
      { name: 'uDiffusion', type: 'float', default: 0.99, min: 0.9, max: 1.0, doc: 'Coefficient de diffusion de la densité' },
      { name: 'uColorA', type: 'vec3', default: [0.1, 0.4, 0.9], doc: 'Couleur fluide A' },
      { name: 'uColorB', type: 'vec3', default: [0.9, 0.3, 0.1], doc: 'Couleur fluide B' }
    ],
    snippets: [
      {
        name: 'advect',
        doc: 'Advection semi-Lagrangienne — base de la simulation fluide',
        code: 'vec4 advect(sampler2D field,vec2 uv,vec2 vel,vec2 px){return texture(field,uv-vel*px*iTimeDelta);}'
      },
      {
        name: 'jacobi',
        doc: 'Itération Jacobi pour la diffusion/pression',
        code: glsl(`
vec4 jacobiStep(sampler2D x,sampler2D b,vec2 uv,vec2 px,float alpha,float rBeta){
    vec4 xL=texture(x,uv-vec2(px.x,0)),xR=texture(x,uv+vec2(px.x,0));
    vec4 xB=texture(x,uv-vec2(0,px.y)),xT=texture(x,uv+vec2(0,px.y));
    vec4 bC=texture(b,uv);
    return (xL+xR+xB+xT+alpha*bC)*rBeta;
}`)
      }
    ],
    passes: [
      {
        name: 'BufferA — Velocity advection',
        description: 'Advection du champ de vitesse + injection de force',
        inputs: { iChannel0: 'BufferA (previous velocity)', iChannel1: 'BufferB (pressure)' },
        code: glsl(`
// BufferA — Velocity field | uniforms: uViscosity, uForceRadius
// iChannel0 = velocity (previous), iChannel1 = pressure (previous)
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv=fragCoord/iResolution.xy;
    vec2 px=1.0/iResolution.xy;
    vec4 vel=texture(iChannel0,uv);
    // Semi-Lagrangian advection
    vec2 prev=uv-vel.xy*px*2.0;
    vec4 newVel=texture(iChannel0,prev)*uViscosity;
    // Pressure gradient subtraction
    float pR=texture(iChannel1,uv+vec2(px.x,0)).r;
    float pL=texture(iChannel1,uv-vec2(px.x,0)).r;
    float pT=texture(iChannel1,uv+vec2(0,px.y)).r;
    float pB=texture(iChannel1,uv-vec2(0,px.y)).r;
    newVel.xy-=vec2(pR-pL,pT-pB)*0.5;
    // Mouse force injection
    vec2 mouse=iMouse.xy/iResolution.xy;
    float mDist=length(uv-mouse);
    if(iMouse.z>0.0&&mDist<uForceRadius){
        vec2 mForce=(uv-mouse)/mDist;
        vec2 mVel=(iMouse.xy-iMouse.zw)/iResolution.xy;
        newVel.xy+=mVel*exp(-mDist/uForceRadius*3.0)*8.0;
    }
    // Boundary
    if(uv.x<px.x||uv.x>1.0-px.x||uv.y<px.y||uv.y>1.0-px.y) newVel=vec4(0);
    fragColor=newVel;
}`)
      },
      {
        name: 'BufferB — Pressure solve (Jacobi)',
        description: 'Résolution de la pression par itérations Jacobi',
        inputs: { iChannel0: 'BufferA (velocity)', iChannel1: 'BufferB (pressure)' },
        code: glsl(`
// BufferB — Pressure | iChannel0=velocity, iChannel1=pressure (prev)
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv=fragCoord/iResolution.xy, px=1.0/iResolution.xy;
    // Divergence of velocity field
    float uR=texture(iChannel0,uv+vec2(px.x,0)).x;
    float uL=texture(iChannel0,uv-vec2(px.x,0)).x;
    float vT=texture(iChannel0,uv+vec2(0,px.y)).y;
    float vB=texture(iChannel0,uv-vec2(0,px.y)).y;
    float div=(uR-uL+vT-vB)*0.5;
    // Jacobi step
    float pR=texture(iChannel1,uv+vec2(px.x,0)).r;
    float pL=texture(iChannel1,uv-vec2(px.x,0)).r;
    float pT=texture(iChannel1,uv+vec2(0,px.y)).r;
    float pB=texture(iChannel1,uv-vec2(0,px.y)).r;
    float newP=(pL+pR+pB+pT-div)*0.25;
    fragColor=vec4(newP,0,0,1);
}`)
      },
      {
        name: 'BufferC — Dye advection',
        description: 'Advection du colorant passif',
        inputs: { iChannel0: 'BufferA (velocity)', iChannel1: 'BufferC (dye)' },
        code: glsl(`
// BufferC — Dye advection | uniforms: uDiffusion, uColorA, uColorB, uForceRadius
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv=fragCoord/iResolution.xy, px=1.0/iResolution.xy;
    vec2 vel=texture(iChannel0,uv).xy;
    vec2 prev=uv-vel*px*2.0;
    vec4 dye=texture(iChannel1,prev)*uDiffusion;
    // Inject dye at mouse
    vec2 mouse=iMouse.xy/iResolution.xy;
    float mDist=length(uv-mouse);
    if(iMouse.z>0.0&&mDist<uForceRadius){
        float amt=exp(-mDist/uForceRadius*4.0);
        float hue=mod(iTime*0.1,1.0);
        vec3 injCol=mix(uColorA,uColorB,hue);
        dye+=vec4(injCol*amt,amt)*0.2;
    }
    dye=clamp(dye,0.0,1.0);
    fragColor=dye;
}`)
      },
      {
        name: 'Image — Display',
        description: 'Affichage du colorant avec vorticity overlay',
        inputs: { iChannel0: 'BufferA (velocity)', iChannel1: 'BufferC (dye)' },
        code: glsl(`
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv=fragCoord/iResolution.xy, px=1.0/iResolution.xy;
    vec4 dye=texture(iChannel1,uv);
    // Vorticity visualization overlay
    vec2 velR=texture(iChannel0,uv+vec2(px.x,0)).xy;
    vec2 velL=texture(iChannel0,uv-vec2(px.x,0)).xy;
    vec2 velT=texture(iChannel0,uv+vec2(0,px.y)).xy;
    vec2 velB=texture(iChannel0,uv-vec2(0,px.y)).xy;
    float curl=(velR.y-velL.y-velT.x+velB.x)*0.5;
    vec3 vortCol=curl>0.0?vec3(0.5,0.8,1.0)*curl:vec3(1.0,0.5,0.2)*(-curl);
    vec3 col=dye.rgb+vortCol*0.3;
    fragColor=vec4(col,1.0);
}`)
      }
    ],
    mainShader: glsl(`
// Simulation Physique — version standalone (pseudo-fluide procédural)
// Pour la vraie simulation GPU voir les passes multipass ci-dessus.
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv=fragCoord/iResolution.xy;
    uv.x*=iResolution.x/iResolution.y;
    float t=iTime*0.08;
    vec2 flow=vec2(noise(uv*2.0+t),noise(uv*2.0+t+vec2(5.2,1.3)))-0.5;
    vec2 warped=uv+flow*0.3;
    float n=noise(warped*3.0+t*0.5)*0.6+noise(warped*6.0-t)*0.3+noise(warped*12.0+t*1.4)*0.1;
    float curl=noise(uv*4.0+t+vec2(2.1,3.7))-noise(uv*4.0+t-vec2(2.1,3.7));
    vec3 col=mix(uColorA,uColorB,n);
    col+=vec3(0.3,0.6,1.0)*max(curl,0.0)*0.5;
    col+=vec3(1.0,0.4,0.1)*max(-curl,0.0)*0.5;
    fragColor=vec4(col,1.0);
}`)
  },

  // ── 5. Generative Design ───────────────────────────────────────────────────
  'generative-design': {
    id: 'tpl-generative-design',
    name: 'Generative Design',
    description: 'Système génératif inspiré du design : grilles, typographie SDF, formes géométriques modulaires. Seed aléatoire.',
    tags: ['design', 'generative', '2d', 'geometry', 'grid'],
    format: 'glsl',
    thumbnail: 'grid',
    uniforms: [
      { name: 'uSeed', type: 'float', default: 42.0, min: 0.0, max: 1000.0, doc: 'Graine du générateur aléatoire' },
      { name: 'uGridSize', type: 'float', default: 8.0, min: 2.0, max: 32.0, doc: 'Nombre de cellules par côté' },
      { name: 'uAnimSpeed', type: 'float', default: 0.5, min: 0.0, max: 3.0, doc: 'Vitesse d\'animation des formes' },
      { name: 'uPaletteIdx', type: 'float', default: 0.0, min: 0.0, max: 4.0, doc: 'Index de palette (0-4)' },
      { name: 'uStroke', type: 'float', default: 0.04, min: 0.0, max: 0.2, doc: 'Épaisseur du contour' }
    ],
    snippets: [
      {
        name: 'sdRoundRect',
        doc: 'Rectangle arrondi SDF — de base pour le design génératif',
        code: 'float sdRoundRect(vec2 p,vec2 b,float r){vec2 d=abs(p)-b+r;return length(max(d,0.0))+min(max(d.x,d.y),0.0)-r;}'
      },
      {
        name: 'sdRegPoly',
        doc: 'Polygone régulier SDF (n côtés)',
        code: 'float sdPoly(vec2 p,float n,float r){float a=atan(p.y,p.x),s=6.28318/n;float c=r*cos(floor(0.5+a/s)*s-a);return length(p)-c;}'
      },
      {
        name: 'designPalette',
        doc: '5 palettes design au choix (uPaletteIdx 0-4)',
        code: glsl(`
vec3 designPalette(float t,float idx){
    if(idx<1.0) return mix(vec3(0.05,0.05,0.08),vec3(0.9,0.85,1.0),t);
    if(idx<2.0) return mix(vec3(0.98,0.96,0.92),vec3(0.15,0.1,0.05),t);
    if(idx<3.0) return mix(vec3(0.0,0.5,0.8),vec3(1.0,0.3,0.0),t);
    if(idx<4.0) return mix(vec3(0.02,0.15,0.05),vec3(0.6,1.0,0.3),t);
    return 0.5+0.5*cos(t*6.28+vec3(0,2,4));
}`)
      }
    ],
    passes: [],
    mainShader: glsl(`
// Generative Design — grille de formes modulaires
// uniforms : uSeed, uGridSize, uAnimSpeed, uPaletteIdx, uStroke

float hash(vec2 p){return fract(sin(dot(p+uSeed,vec2(127.1,311.7)))*43758.5453);}
float sdCircle(vec2 p,float r){return length(p)-r;}
float sdRect(vec2 p,vec2 b){vec2 d=abs(p)-b;return length(max(d,0.0))+min(max(d.x,d.y),0.0);}
float sdPoly(vec2 p,float n,float r){float a=atan(p.y,p.x),s=6.28318/n;return length(p)-r*cos(floor(0.5+a/s)*s-a);}
float sdLine(vec2 p,vec2 a,vec2 b){vec2 pa=p-a,ba=b-a;return length(pa-ba*clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0));}

vec3 designPalette(float t,float idx){
    if(idx<1.0)return mix(vec3(0.05,0.05,0.08),vec3(0.9,0.85,1.0),t);
    if(idx<2.0)return mix(vec3(0.98,0.96,0.92),vec3(0.15,0.1,0.05),t);
    if(idx<3.0)return mix(vec3(0.0,0.5,0.8),vec3(1.0,0.3,0.0),t);
    if(idx<4.0)return mix(vec3(0.02,0.15,0.05),vec3(0.6,1.0,0.3),t);
    return 0.5+0.5*cos(t*6.28+vec3(0,2,4));
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv=fragCoord/iResolution.xy;
    uv.x*=iResolution.x/iResolution.y;
    float n=uGridSize;
    float cellSz=(iResolution.x/iResolution.y)/n;
    vec2 cell=floor(uv*n/iResolution.x*iResolution.y);
    cell=floor(vec2(uv.x,uv.y)*n);
    // correct for aspect
    vec2 uvN=vec2(uv.x*iResolution.x/iResolution.y,uv.y);
    cell=floor(uvN*n);
    vec2 local=fract(uvN*n)*2.0-1.0;
    float h1=hash(cell);
    float h2=hash(cell+vec2(7.3,4.1));
    float h3=hash(cell+vec2(2.1,8.9));
    float t=iTime*uAnimSpeed;
    float phase=h3*6.28+t*(h2*0.5+0.5);
    // Choisir une forme selon h1
    float d;
    int shapeType=int(h1*6.0);
    float rot=phase;
    vec2 p=vec2(local.x*cos(rot)-local.y*sin(rot),local.x*sin(rot)+local.y*cos(rot));
    float size=0.3+h2*0.3;
    if(shapeType==0) d=sdCircle(p,size);
    else if(shapeType==1) d=sdRect(p,vec2(size,size*(0.5+h3*0.5)));
    else if(shapeType==2) d=sdPoly(p,3.0,size);
    else if(shapeType==3) d=sdPoly(p,6.0,size);
    else if(shapeType==4) d=sdLine(p,vec2(-size,0),vec2(size,0));
    else d=sdPoly(p,4.0,size);
    // Fill + stroke
    float fill=smoothstep(0.01,-0.01,d);
    float stroke=smoothstep(uStroke+0.01,uStroke-0.01,abs(d));
    float luma=h1;
    vec3 bg=designPalette(0.0,uPaletteIdx);
    vec3 fillCol=designPalette(luma,uPaletteIdx);
    vec3 strokeCol=designPalette(1.0,uPaletteIdx);
    vec3 col=mix(bg,fillCol,fill);
    col=mix(col,strokeCol,stroke*(1.0-fill*0.5));
    // Grid subtle separator
    float sep=max(step(0.97,fract(uvN.x*n)),step(0.97,fract(uvN.y*n)));
    col=mix(col,mix(bg,fillCol,0.3),sep*0.4);
    fragColor=vec4(col,1.0);
}`)
  },

  // ── 6. PBR Study ───────────────────────────────────────────────────────────
  'pbr-study': {
    id: 'tpl-pbr-study',
    name: 'PBR Study',
    description: 'Scène de test PBR complète : grille de sphères (roughness × metallic), IBL approximé, BRDF GGX, shadow contact.',
    tags: ['pbr', '3d', 'raymarching', 'lighting', 'study', 'material'],
    format: 'glsl',
    thumbnail: 'pbr-spheres',
    uniforms: [
      { name: 'uExposure', type: 'float', default: 1.0, min: 0.1, max: 5.0, doc: 'Exposition du tonemapping' },
      { name: 'uEnvStrength', type: 'float', default: 0.3, min: 0.0, max: 2.0, doc: 'Intensité de l\'éclairage environnemental' },
      { name: 'uAlbedo', type: 'vec3', default: [0.9, 0.7, 0.3], doc: 'Albedo de base des sphères' },
      { name: 'uLightIntensity', type: 'float', default: 3.0, min: 0.0, max: 10.0, doc: 'Intensité de la lumière principale' },
      { name: 'uAnimate', type: 'float', default: 1.0, min: 0.0, max: 1.0, doc: 'Activer / désactiver l\'animation (0/1)' }
    ],
    snippets: [
      {
        name: 'pbr-full-brdf',
        doc: 'BRDF GGX complète (D+G+F) pour PBR physiquement correct',
        code: glsl(`
// Distribution normale GGX (Trowbridge-Reitz)
float D_GGX(float NdotH,float alpha){
    float a2=alpha*alpha;float d=NdotH*NdotH*(a2-1.0)+1.0;return a2/(3.14159265*d*d);
}
// Géométrie Smith-Schlick-GGX
float G_SmithGGX(float NdotV,float NdotL,float rough){
    float r=rough+1.0;float k=r*r/8.0;
    float gv=NdotV/(NdotV*(1.0-k)+k);float gl=NdotL/(NdotL*(1.0-k)+k);return gv*gl;
}
// Fresnel Schlick
vec3 F_Schlick(float cosTheta,vec3 F0){return F0+(1.0-F0)*pow(max(1.0-cosTheta,0.0),5.0);}
// Terme environnemental IBL simplifié (sphère harmonique degré 1)
vec3 IBL_approx(vec3 N,vec3 V,vec3 albedo,float rough,float metal){
    vec3 R=reflect(-V,N);
    float ndv=max(dot(N,V),0.0);
    vec3 F0=mix(vec3(0.04),albedo,metal);
    vec3 kS=F_Schlick(ndv,F0);
    vec3 kD=(1.0-kS)*(1.0-metal);
    vec3 irradiance=vec3(0.3,0.35,0.4); // ciel simplifié
    vec3 envSpec=mix(vec3(0.2,0.3,0.5),vec3(0.8,0.85,1.0),clamp(R.y*0.5+0.5,0.0,1.0));
    envSpec*=(1.0-rough*rough); // approx PMREM
    return kD*albedo*irradiance + kS*envSpec;
}
// BRDF complète — retourne la radiance sortante pour une paire N/V/L
vec3 PBR(vec3 N,vec3 V,vec3 L,vec3 lightCol,vec3 albedo,float rough,float metal){
    vec3 H=normalize(V+L);
    float NdotL=max(dot(N,L),0.0),NdotV=max(dot(N,V),0.0001),NdotH=max(dot(N,H),0.0);
    float a=rough*rough;
    vec3 F0=mix(vec3(0.04),albedo,metal);
    vec3 F=F_Schlick(max(dot(H,V),0.0),F0);
    float D=D_GGX(NdotH,a),G=G_SmithGGX(NdotV,NdotL,rough);
    vec3 spec=D*G*F/(4.0*NdotV+0.001);
    vec3 diff=(1.0-F)*(1.0-metal)*albedo/3.14159265;
    return (diff+spec)*NdotL*lightCol;
}`)
      },
      {
        name: 'aces-tonemapping',
        doc: 'Tonemapping ACES (approximation Hill) + correction gamma',
        code: glsl(`
vec3 aces(vec3 x){
    const float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14;
    return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.0,1.0);
}
vec3 tonemapGamma(vec3 col,float exposure){
    return pow(aces(col*exposure),vec3(1.0/2.2));
}`)
      }
    ],
    passes: [],
    mainShader: glsl(`
// PBR Study — grille de sphères roughness × metallic
// uniforms : uExposure, uEnvStrength, uAlbedo, uLightIntensity, uAnimate

// ── BRDF GGX ──────────────────────────────────────────────
float D_GGX(float h,float a){float a2=a*a;float d=h*h*(a2-1.0)+1.0;return a2/(3.14159*d*d);}
float G_Smith(float nv,float nl,float r){float k=(r+1.0)*(r+1.0)/8.0;float gv=nv/(nv*(1.0-k)+k);float gl=nl/(nl*(1.0-k)+k);return gv*gl;}
vec3 F_Sch(float c,vec3 F0){return F0+(1.0-F0)*pow(1.0-c,5.0);}
vec3 IBL(vec3 N,vec3 V,vec3 alb,float r,float m){
    float ndv=max(dot(N,V),0.0);
    vec3 F0=mix(vec3(0.04),alb,m),kS=F_Sch(ndv,F0),kD=(1.0-kS)*(1.0-m);
    vec3 R=reflect(-V,N);
    vec3 env=mix(vec3(0.2,0.3,0.5),vec3(0.9,0.95,1.0),clamp(R.y*0.5+0.5,0.0,1.0))*(1.0-r*r);
    return (kD*alb*vec3(0.3,0.35,0.4)+kS*env)*uEnvStrength;
}
vec3 PBR(vec3 N,vec3 V,vec3 L,vec3 lc,vec3 alb,float r,float m){
    vec3 H=normalize(V+L);float ndl=max(dot(N,L),0.0),ndv=max(dot(N,V),0.0001),ndh=max(dot(N,H),0.0);
    vec3 F0=mix(vec3(0.04),alb,m);vec3 F=F_Sch(max(dot(H,V),0.0),F0);
    vec3 spec=D_GGX(ndh,r*r)*G_Smith(ndv,ndl,r)*F/(4.0*ndv+0.001);
    vec3 diff=(1.0-F)*(1.0-m)*alb/3.14159;
    return (diff+spec)*ndl*lc;
}
vec3 aces(vec3 x){return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0);}

// ── SDF ────────────────────────────────────────────────────
float map(vec3 p){
    // Grille 5×5 de sphères (roughness 0→1 en X, metallic 0→1 en Y)
    vec3 rp=p-vec3(-2.0,0.0,0.0);
    vec3 idx=floor(rp/1.0);
    vec3 lp=fract(rp/1.0)*1.0-0.5;
    float d=1e9;
    for(int ix=0;ix<5;ix++) for(int iy=0;iy<5;iy++){
        vec3 off=vec3(float(ix),float(iy),0.0);
        d=min(d,length(p-vec3(float(ix)*1.0-2.0,float(iy)*1.0-2.0,0.0))-0.38);
    }
    // Ground plane
    d=min(d,p.y+2.5);
    return d;
}
vec3 normal(vec3 p){vec2 e=vec2(0.001,0.0);return normalize(vec3(map(p+e.xyy)-map(p-e.xyy),map(p+e.yxy)-map(p-e.yxy),map(p+e.yyx)-map(p-e.yyx)));}
// Contact shadow AO
float ao5(vec3 p,vec3 n){float occ=0.0,s=1.0;for(int i=1;i<=5;i++){float h=0.01+0.12*float(i);occ+=(h-map(p+n*h))/s;s*=2.0;}return clamp(1.0-2.0*occ,0.0,1.0);}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv=(fragCoord-0.5*iResolution.xy)/iResolution.y;
    float t=iTime*uAnimate;
    vec3 ro=vec3(5.0*cos(t*0.3+1.0),3.0+sin(t*0.2),5.0*sin(t*0.3+1.0));
    vec3 ta=vec3(0,0,0);
    vec3 f=normalize(ta-ro),r=normalize(cross(vec3(0,1,0),f)),u=cross(f,r);
    vec3 rd=normalize(uv.x*r+uv.y*u+1.5*f);
    float d=0.01; bool hit=false;
    for(int i=0;i<120;i++){float h=map(ro+rd*d);if(h<0.0005){hit=true;break;}if(d>20.0)break;d+=h;}
    // Sky
    vec3 col=mix(vec3(0.3,0.4,0.6),vec3(0.7,0.8,1.0),clamp(rd.y*0.5+0.5,0.0,1.0));
    if(hit){
        vec3 p=ro+rd*d,N=normal(p),V=-rd;
        // Identify which sphere
        vec3 idx=round(p.xy/1.0);
        float iy=clamp((idx.y+2.0)/4.0,0.0,1.0);
        float ix=clamp((idx.x+2.0)/4.0,0.0,1.0);
        float rough=ix,metal=iy;
        bool isGround=N.y>0.7;
        if(isGround){rough=0.9;metal=0.0;}
        vec3 alb=isGround?vec3(0.3):uAlbedo;
        vec3 L=normalize(vec3(2,4,3));
        vec3 lc=vec3(1.0,0.9,0.7)*uLightIntensity;
        // Simple shadow
        float sh=1.0;
        vec3 sp=p+N*0.01;
        for(int i=0;i<30;i++){float h=map(sp+L*float(i)*0.1);if(h<0.001){sh=0.1;break;}}
        float occ=ao5(p,N);
        col=PBR(N,V,L,lc*sh,alb,rough,metal)+IBL(N,V,alb,rough,metal);
        col*=occ;
        col=mix(col,vec3(0.3,0.4,0.6),clamp(d/20.0,0.0,1.0)*0.2);
    }
    col=pow(aces(col*uExposure),vec3(1.0/2.2));
    fragColor=vec4(col,1.0);
}`)
  }
};

export const PROJECT_TEMPLATE_IDS = Object.keys(PROJECT_TEMPLATES);
export const PROJECT_TEMPLATE_LIST = Object.values(PROJECT_TEMPLATES);

// ── Persistance presets utilisateur ─────────────────────────────────────────

export function loadUserPresets() {
  try {
    const raw = safeLocalGet(PRESETS_KEY, '[]');
    return JSON.parse(raw);
  } catch (_) { return []; }
}

export function saveUserPresets(presets) {
  safeLocalSet(PRESETS_KEY, JSON.stringify(presets));
}

export function findPreset(id) {
  return BUILTIN_PRESETS.find(p => p.id === id) ||
         loadUserPresets().find(p => p.id === id) || null;
}

export function findTemplate(id) {
  return PROJECT_TEMPLATES[id] || PROJECT_TEMPLATE_LIST.find(t => t.id === id) || null;
}

// ── Filtrage par catégorie ───────────────────────────────────────────────────

export function getPresetsByCategory(category) {
  if (!category || category === 'All') return BUILTIN_PRESETS;
  return BUILTIN_PRESETS.filter(p => p.category === category);
}

// ── MIDI mapping persistence ─────────────────────────────────────────────────

export function saveMidiMappingsToPreset(presetId, mappings) {
  if (!presetId || presetId.startsWith('builtin-')) return false;
  const presets = loadUserPresets();
  const p = presets.find(x => x.id === presetId);
  if (!p) return false;
  p.midiMappings = mappings ? { ...mappings } : {};
  saveUserPresets(presets);
  return true;
}

export function loadMidiMappingsFromPreset(presetId) {
  if (!presetId) return null;
  const p = findPreset(presetId);
  return (p && p.midiMappings) ? { ...p.midiMappings } : null;
}

// ── CRUD presets ─────────────────────────────────────────────────────────────

export function deletePreset(id, { showConfirm, toast, renderLibrary }) {
  showConfirm('Delete preset?', 'This cannot be undone.', () => {
    const presets = loadUserPresets().filter(p => p.id !== id);
    saveUserPresets(presets);
    toast('Preset deleted', 'warn');
    renderLibrary();
  });
}

// ── Import / Export .z-gl-preset ────────────────────────────────────────────
//
// Format : fichier JSON (compressé optionnellement via CompressionStream)
// Extension : .z-gl-preset
// Contenu racine :
//   { version: '2.0', type: 'preset'|'template', payload: <objet preset ou template> }

const Z_GL_PRESET_VERSION = '2.0';
const Z_GL_PRESET_EXT = '.z-gl-preset';
const Z_GL_TEMPLATE_EXT = '.z-gl-template';

/** Compresse un objet JS en Uint8Array via CompressionStream (gzip), si disponible */
async function compressJSON(obj) {
  const json = JSON.stringify(obj);
  if (typeof CompressionStream === 'undefined') {
    // Fallback : pas de compression, juste UTF-8
    return new TextEncoder().encode(json);
  }
  const stream = new CompressionStream('gzip');
  const writer = stream.writable.getWriter();
  writer.write(new TextEncoder().encode(json));
  writer.close();
  const chunks = [];
  const reader = stream.readable.getReader();
  let done = false;
  while (!done) {
    const { value, done: d } = await reader.read();
    if (value) chunks.push(value);
    done = d;
  }
  const totalLen = chunks.reduce((a, c) => a + c.byteLength, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

/** Décompresse un ArrayBuffer en objet JS */
async function decompressJSON(buffer) {
  // Détection gzip magic bytes (1f 8b)
  const bytes = new Uint8Array(buffer);
  const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (!isGzip || typeof DecompressionStream === 'undefined') {
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  const stream = new DecompressionStream('gzip');
  const writer = stream.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const chunks = [];
  const reader = stream.readable.getReader();
  let done = false;
  while (!done) {
    const { value, done: d } = await reader.read();
    if (value) chunks.push(value);
    done = d;
  }
  const totalLen = chunks.reduce((a, c) => a + c.byteLength, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(result));
}

/**
 * Exporte un preset en fichier .z-gl-preset (JSON compressé gzip)
 * @param {string} id - ID du preset (builtin ou user)
 * @param {{ toast: function }} ctx
 */
export async function exportPreset(id, { toast }) {
  const p = findPreset(id);
  if (!p) { toast('Preset not found', 'err'); return; }
  const envelope = { version: Z_GL_PRESET_VERSION, type: 'preset', payload: p };
  const data = await compressJSON(envelope);
  const blob = new Blob([data], { type: 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (p.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'preset') + Z_GL_PRESET_EXT;
  a.click();
  URL.revokeObjectURL(a.href);
  toast(`Exported: ${p.name}`, 'ok');
}

/**
 * F-3.9 — Sauvegarde un preset partiel depuis une sélection d'IDs de sliders.
 *
 * @param {string} name          — Nom du preset
 * @param {string[]} selectedIds — IDs des entrées à inclure (subset de state.vars)
 * @param {{ state: any, serializeCustomizations: function, loadUserPresets: function, saveUserPresets: function, renderLibrary: function, toast: function }} ctx
 */
export function savePartialPreset(name, selectedIds, ctx) {
  const { state, serializeCustomizations, loadUserPresets: _loadUserPresets,
          saveUserPresets: _saveUserPresets, renderLibrary, toast } = ctx;

  if (!name || !name.trim()) { toast('Please enter a name', 'warn'); return; }
  if (!selectedIds || selectedIds.length === 0) { toast('No slider selected', 'warn'); return; }

  const idSet = new Set(selectedIds);
  const code = state.editor ? state.editor.getValue() : '';

  // Filtrer les métadonnées de personnalisation aux seuls sliders sélectionnés
  const allMeta = serializeCustomizations();
  const filteredMeta = {};
  for (const key of Object.keys(allMeta)) {
    if (idSet.has(key)) filteredMeta[key] = allMeta[key];
  }

  // Capturer seulement les valeurs des sliders sélectionnés
  const partialValues = {};
  for (const id of selectedIds) {
    const entry = state.varMap?.[id];
    if (entry) partialValues[id] = entry.value;
  }

  const id = 'user-partial-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  const preset = {
    id,
    name: name.trim(),
    tags: ['partial'],
    author: 'local',
    code,
    version: '1.0.0',
    created: new Date().toISOString().slice(0, 10),
    partial: true,
    partialIds: selectedIds,
    partialValues,
    pinnedIds: [...(state.pinnedIds || [])].filter(k => idSet.has(k)),
  };
  if (Object.keys(filteredMeta).length > 0) preset.sliderMeta = filteredMeta;

  const presets = _loadUserPresets();
  presets.push(preset);
  _saveUserPresets(presets);
  renderLibrary();
  toast(`Partial preset "${name.trim()}" saved (${selectedIds.length} sliders)`, 'ok');
}

/**
 * Exporte un template de projet en fichier .z-gl-template
 * @param {string} templateId - clé du PROJECT_TEMPLATES
 * @param {{ toast: function }} ctx
 */
export async function exportTemplate(templateId, { toast }) {
  const tpl = findTemplate(templateId);
  if (!tpl) { toast('Template not found', 'err'); return; }
  const envelope = { version: Z_GL_PRESET_VERSION, type: 'template', payload: tpl };
  const data = await compressJSON(envelope);
  const blob = new Blob([data], { type: 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (tpl.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'template') + Z_GL_TEMPLATE_EXT;
  a.click();
  URL.revokeObjectURL(a.href);
  toast(`Exported template: ${tpl.name}`, 'ok');
}

/**
 * Importe un fichier .z-gl-preset ou .z-gl-template
 * @param {File} file
 * @param {{ toast, renderLibrary, onTemplateImport }} ctx
 */
export async function importPresetFile(file, { toast, renderLibrary, onTemplateImport }) {
  try {
    const buffer = await file.arrayBuffer();
    let envelope;
    try {
      envelope = await decompressJSON(buffer);
    } catch (e) {
      // Fallback : tenter JSON brut (anciens presets .json)
      envelope = JSON.parse(new TextDecoder().decode(buffer));
    }

    // Compatibilité anciens presets (format plat sans envelope)
    if (!envelope.type && envelope.code) {
      envelope = { version: '1.0', type: 'preset', payload: envelope };
    }

    if (envelope.type === 'preset') {
      const p = envelope.payload;
      if (!p || !p.code) { toast('Invalid preset format', 'err'); return; }
      if (!p.id) p.id = 'user-' + Date.now();
      if (!p.name) p.name = 'Imported';
      p.readonly = false;
      p.author = p.author || 'imported';
      const presets = loadUserPresets();
      const idx = presets.findIndex(x => x.id === p.id);
      if (idx >= 0) presets[idx] = p; else presets.push(p);
      saveUserPresets(presets);
      toast(`Imported preset: ${p.name}`, 'ok');
      renderLibrary?.();
    } else if (envelope.type === 'template') {
      const tpl = envelope.payload;
      if (!tpl || !tpl.mainShader) { toast('Invalid template format', 'err'); return; }
      onTemplateImport?.(tpl);
      toast(`Imported template: ${tpl.name}`, 'ok');
    } else {
      toast('Unknown file format', 'err');
    }
  } catch (e) {
    toast(`Import error: ${e.message}`, 'err');
  }
}

/**
 * Crée un nouveau projet à partir d'un template
 * @param {string} templateId
 * @returns {{ name, code, multipass, uniforms, tags, description } | null}
 */
export function instantiateTemplate(templateId) {
  const tpl = findTemplate(templateId);
  if (!tpl) return null;
  return /** @type {any} */ ({
    name: tpl.name + ' (from template)',
    description: tpl.description,
    code: tpl.mainShader,
    multipass: tpl.passes?.length > 0 ? tpl.passes : [],
    uniforms: tpl.uniforms || [],
    snippets: tpl.snippets || [],
    tags: [...(tpl.tags || []), 'from-template'],
    format: tpl.format || 'glsl',
    templateId: tpl.id,
    created: new Date().toISOString()
  });
}

// Legacy : compatibilité avec l'ancienne API exportPreset(json)
export function applyImportedPreset(p, { toast, renderLibrary }) {
  if (!p || !p.code) { toast('Invalid preset format', 'err'); return; }
  if (!p.id) p.id = 'user-' + Date.now();
  if (!p.name) p.name = 'Imported';
  p.readonly = false;
  p.author = p.author || 'imported';
  const presets = loadUserPresets();
  const idx = presets.findIndex(x => x.id === p.id);
  if (idx >= 0) presets[idx] = p; else presets.push(p);
  saveUserPresets(presets);
  toast(`Imported: ${p.name}`, 'ok');
  renderLibrary?.();
}
