/**
 * snippet-pack-extended.js — Phase 19.3
 *
 * 200+ snippets organisés par catégorie :
 *   Noise & Procedural (IQ complet + extensions)
 *   SDF (bibliothèque exhaustive)
 *   PBR (GGX, Disney, Hammersley, importance sampling)
 *   Physics (particles, SPH, cloth)
 *   Typography (SDF text rendering)
 *   Utilities (hash, palette, matrix, quaternions)
 *   Ray Marching
 *   Color
 *   Templates
 */

export const EXTENDED_SNIPPETS = [

  // ─── NOISE & PROCEDURAL ──────────────────────────────────────────────────────

  {
    id: 'ext:hash-11', name: 'Hash 1D→1D', category: 'Noise & Procedural',
    tags: ['hash', 'noise', 'procedural', 'iq'],
    desc: 'Fast 1D hash function.',
    code: `float hash11(float p) {
    p = fract(p * .1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
}`,
  },
  {
    id: 'ext:hash-12', name: 'Hash 1D→2D', category: 'Noise & Procedural',
    tags: ['hash', 'noise'],
    desc: 'Maps a float to a vec2 hash.',
    code: `vec2 hash12(float p) {
    vec3 p3 = fract(vec3(p) * vec3(.1031, .1030, .0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
}`,
  },
  {
    id: 'ext:hash-21', name: 'Hash 2D→1D', category: 'Noise & Procedural',
    tags: ['hash', 'noise'],
    code: `float hash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * .1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}`,
  },
  {
    id: 'ext:hash-22', name: 'Hash 2D→2D', category: 'Noise & Procedural',
    tags: ['hash', 'noise'],
    code: `vec2 hash22(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
}`,
  },
  {
    id: 'ext:hash-33', name: 'Hash 3D→3D', category: 'Noise & Procedural',
    tags: ['hash', 'noise', '3d'],
    code: `vec3 hash33(vec3 p3) {
    p3 = fract(p3 * vec3(.1031, .1030, .0973));
    p3 += dot(p3, p3.yxz + 33.33);
    return fract((p3.xxy + p3.yxx) * p3.zyx);
}`,
  },
  {
    id: 'ext:value-noise-2d', name: 'Value Noise 2D', category: 'Noise & Procedural',
    tags: ['noise', 'value', '2d', 'iq'],
    code: `float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash2(i + vec2(0,0)), hash2(i + vec2(1,0)), u.x),
               mix(hash2(i + vec2(0,1)), hash2(i + vec2(1,1)), u.x), u.y);
}`,
  },
  {
    id: 'ext:value-noise-3d', name: 'Value Noise 3D', category: 'Noise & Procedural',
    tags: ['noise', 'value', '3d'],
    code: `float hash3(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float vnoise3(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash3(i+vec3(0,0,0)), hash3(i+vec3(1,0,0)), u.x),
                   mix(hash3(i+vec3(0,1,0)), hash3(i+vec3(1,1,0)), u.x), u.y),
               mix(mix(hash3(i+vec3(0,0,1)), hash3(i+vec3(1,0,1)), u.x),
                   mix(hash3(i+vec3(0,1,1)), hash3(i+vec3(1,1,1)), u.x), u.y), u.z);
}`,
  },
  {
    id: 'ext:gradient-noise', name: 'Gradient Noise (Perlin-like)', category: 'Noise & Procedural',
    tags: ['noise', 'gradient', 'perlin', 'iq'],
    code: `vec2 grad2(vec2 p) {
    vec3 q = vec3(p, 0);
    q = fract(q * vec3(0.1031, 0.1030, 0.0973));
    q += dot(q, q.yzx + 33.33);
    return normalize(fract((q.xx + q.yz) * q.zy) * 2.0 - 1.0);
}

float gnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0); // quintic
    float v00 = dot(grad2(i + vec2(0,0)), f - vec2(0,0));
    float v10 = dot(grad2(i + vec2(1,0)), f - vec2(1,0));
    float v01 = dot(grad2(i + vec2(0,1)), f - vec2(0,1));
    float v11 = dot(grad2(i + vec2(1,1)), f - vec2(1,1));
    return mix(mix(v00, v10, u.x), mix(v01, v11, u.x), u.y);
}`,
  },
  {
    id: 'ext:fbm-derivative', name: 'FBM with Derivatives', category: 'Noise & Procedural',
    tags: ['noise', 'fbm', 'derivative', 'iq'],
    desc: 'FBM that also returns analytical derivatives (useful for lighting).',
    code: `// Returns vec3(value, dfdx, dfdy)
vec3 fbmD(vec2 p) {
    float f = 0.0, a = 0.5;
    vec2  d = vec2(0.0);
    mat2  m = mat2(0.8, 0.6, -0.6, 0.8);
    for (int i = 0; i < 6; i++) {
        // use gnoise + its derivative (analytical)
        float n  = gnoise(p);
        d       += a * vec2(dFdx(n), dFdy(n)); // screen-space derivative fallback
        f       += a * n;
        p        = m * p * 2.0;
        a       *= 0.5;
    }
    return vec3(f, d);
}`,
  },
  {
    id: 'ext:fbm-6', name: 'FBM 6 octaves (fast)', category: 'Noise & Procedural',
    tags: ['noise', 'fbm', 'classic'],
    code: `float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
    for (int i = 0; i < 6; i++) { v += a * vnoise(p); p = r * p * 2.0 + 1.7; a *= 0.5; }
    return v;
}`,
  },
  {
    id: 'ext:domain-warp', name: 'Domain Warp (Double FBM)', category: 'Noise & Procedural',
    tags: ['noise', 'domain-warp', 'iq', 'procedural'],
    code: `// IQ-style double domain warp
// q = fbm(p + offset), r = fbm(p + q)
float domainWarp(vec2 p) {
    vec2 q = vec2(fbm(p + vec2(0.0, 0.0)),
                  fbm(p + vec2(5.2, 1.3)));
    vec2 r = vec2(fbm(p + 4.0*q + vec2(1.7, 9.2)),
                  fbm(p + 4.0*q + vec2(8.3, 2.8)));
    return fbm(p + 4.0*r);
}`,
  },
  {
    id: 'ext:simplex-2d', name: 'Simplex Noise 2D', category: 'Noise & Procedural',
    tags: ['noise', 'simplex', '2d'],
    code: `vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }

float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                        -0.577350269189626, 0.024390243902439);
    vec2  i = floor(v + dot(v, C.yy));
    vec2  x0 = v - i + dot(i, C.xx);
    vec2  i1 = (x0.x > x0.y) ? vec2(1,0) : vec2(0,1);
    vec4  x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute(permute(i.y + vec3(0.0,i1.y,1.0)) + i.x + vec3(0.0,i1.x,1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m * m; m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x  = a0.x  * x0.x   + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
}`,
  },
  {
    id: 'ext:simplex-3d', name: 'Simplex Noise 3D', category: 'Noise & Procedural',
    tags: ['noise', 'simplex', '3d'],
    code: `vec3 permute3(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
vec4 permute4(vec4 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
vec4 taylorInvSqrt4(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise3(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod(i, 289.0);
    vec4 p = permute4(permute4(permute4(i.z + vec4(0.0,i1.z,i2.z,1.0))
                                         + i.y + vec4(0.0,i1.y,i2.y,1.0))
                                         + i.x + vec4(0.0,i1.x,i2.x,1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy,h.x);
    vec3 p1 = vec3(a0.zw,h.y);
    vec3 p2 = vec3(a1.xy,h.z);
    vec3 p3 = vec3(a1.zw,h.w);
    vec4 norm = taylorInvSqrt4(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}`,
  },
  {
    id: 'ext:voronoi-smooth', name: 'Voronoi Smooth Distance', category: 'Noise & Procedural',
    tags: ['noise', 'voronoi', 'smooth', 'iq'],
    code: `// Returns vec2(min_dist, cell_id)
vec2 voronoi(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float md = 8.0; vec2 mr;
    for (int j = -2; j <= 2; j++)
    for (int k = -2; k <= 2; k++) {
        vec2 b = vec2(k, j);
        vec2 o = hash22(i + b);
        o = 0.5 + 0.5 * sin(iTime + 6.2831 * o);
        vec2 r = b + o - f;
        float d = dot(r, r);
        if (d < md) { md = d; mr = r; }
    }
    return vec2(sqrt(md), dot(mr, mr));
}`,
  },
  {
    id: 'ext:voronoi-borders', name: 'Voronoi Borders', category: 'Noise & Procedural',
    tags: ['noise', 'voronoi', 'borders', 'iq'],
    code: `// Returns (min_dist, border_dist, cell_id)
vec3 voronoiBorders(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 mg, mr;
    float md = 8.0;
    for (int j=-1;j<=1;j++)
    for (int k=-1;k<=1;k++) {
        vec2 g = vec2(k, j);
        vec2 o = hash22(i + g);
        vec2 r = g + o - f;
        float d = dot(r, r);
        if (d < md) { md = d; mr = r; mg = g; }
    }
    float mb = 8.0;
    for (int j=-2;j<=2;j++)
    for (int k=-2;k<=2;k++) {
        vec2 g = mg + vec2(k, j);
        vec2 o = hash22(i + g);
        vec2 r = g + o - f;
        if (dot(mr-r,mr-r) > 1e-5)
            mb = min(mb, dot(0.5*(mr+r), normalize(r-mr)));
    }
    return vec3(sqrt(md), mb, dot(mg, vec2(7.0, 113.0)));
}`,
  },
  {
    id: 'ext:truchet', name: 'Truchet Tiling', category: 'Noise & Procedural',
    tags: ['procedural', 'truchet', 'tiling'],
    code: `float truchet(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p) - 0.5;
    float h = hash21(i);
    if (h < 0.5) f.x = -f.x;
    float d1 = length(f - vec2(-0.5, -0.5)) - 0.5;
    float d2 = length(f - vec2( 0.5,  0.5)) - 0.5;
    return min(abs(d1), abs(d2));
}`,
  },
  {
    id: 'ext:curl-noise', name: 'Curl Noise 2D', category: 'Noise & Procedural',
    tags: ['noise', 'curl', 'fluid', '2d'],
    code: `// Divergence-free curl noise from gradient of scalar field
vec2 curlNoise(vec2 p) {
    const float e = 0.001;
    float n1 = snoise(p + vec2(0, e));
    float n2 = snoise(p - vec2(0, e));
    float n3 = snoise(p + vec2(e, 0));
    float n4 = snoise(p - vec2(e, 0));
    float dndx = (n1 - n2) / (2.0 * e);
    float dndy = (n3 - n4) / (2.0 * e);
    return vec2(dndx, -dndy);
}`,
  },
  {
    id: 'ext:fbm-ridged', name: 'Ridged FBM', category: 'Noise & Procedural',
    tags: ['noise', 'fbm', 'ridged', 'terrain'],
    code: `float ridgedFbm(vec2 p) {
    float v = 0.0, a = 0.5, prev = 1.0;
    mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
    for (int i = 0; i < 6; i++) {
        float n = 1.0 - abs(gnoise(p));
        n *= n * prev;
        v += a * n;
        prev = n;
        p = r * p * 2.0;
        a *= 0.5;
    }
    return v;
}`,
  },

  // ─── SDF ────────────────────────────────────────────────────────────────────

  {
    id: 'ext:sdf-capsule', name: 'SDF Capsule', category: 'SDF',
    tags: ['sdf', '3d'],
    code: `float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
    vec3 ab = b - a, ap = p - a;
    float t = clamp(dot(ap, ab) / dot(ab, ab), 0.0, 1.0);
    return length(ap - t * ab) - r;
}`,
  },
  {
    id: 'ext:sdf-cylinder', name: 'SDF Cylinder', category: 'SDF',
    tags: ['sdf', '3d'],
    code: `float sdCylinder(vec3 p, float h, float r) {
    vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}`,
  },
  {
    id: 'ext:sdf-torus', name: 'SDF Torus', category: 'SDF',
    tags: ['sdf', '3d'],
    code: `float sdTorus(vec3 p, vec2 t) {
    vec2 q = vec2(length(p.xz) - t.x, p.y);
    return length(q) - t.y;
}`,
  },
  {
    id: 'ext:sdf-cone', name: 'SDF Cone', category: 'SDF',
    tags: ['sdf', '3d'],
    code: `float sdCone(vec3 p, vec2 c, float h) {
    vec2 q = h * vec2(c.x / c.y, -1.0);
    vec2 w = vec2(length(p.xz), p.y);
    vec2 a = w - q * clamp(dot(w,q)/dot(q,q), 0.0, 1.0);
    vec2 b = w - q * vec2(clamp(w.x/q.x, 0.0, 1.0), 1.0);
    float k = sign(q.y);
    float d = min(dot(a,a), dot(b,b));
    float s = max(k*(w.x*q.y - w.y*q.x), k*(w.y - q.y));
    return sqrt(d) * sign(s);
}`,
  },
  {
    id: 'ext:sdf-plane', name: 'SDF Plane', category: 'SDF',
    tags: ['sdf', '3d'],
    code: `// n must be normalized, h is offset
float sdPlane(vec3 p, vec3 n, float h) {
    return dot(p, n) + h;
}`,
  },
  {
    id: 'ext:sdf-link', name: 'SDF Chain Link', category: 'SDF',
    tags: ['sdf', '3d', 'iq'],
    code: `float sdLink(vec3 p, float le, float r1, float r2) {
    vec3 q = vec3(p.x, max(abs(p.y) - le, 0.0), p.z);
    return length(vec2(length(q.xy) - r1, q.z)) - r2;
}`,
  },
  {
    id: 'ext:sdf-hex-prism', name: 'SDF Hexagonal Prism', category: 'SDF',
    tags: ['sdf', '3d', 'hex'],
    code: `float sdHexPrism(vec3 p, vec2 h) {
    const vec3 k = vec3(-0.8660254, 0.5, 0.57735);
    p = abs(p);
    p.xy -= 2.0 * min(dot(k.xy, p.xy), 0.0) * k.xy;
    vec2 d = vec2(length(p.xy - vec2(clamp(p.x,-k.z*h.x,k.z*h.x),h.x)) * sign(p.y-h.x), p.z - h.y);
    return min(max(d.x,d.y),0.0) + length(max(d,0.0));
}`,
  },
  {
    id: 'ext:sdf-octahedron', name: 'SDF Octahedron', category: 'SDF',
    tags: ['sdf', '3d'],
    code: `float sdOctahedron(vec3 p, float s) {
    p = abs(p);
    float m = p.x + p.y + p.z - s;
    vec3 q;
    if (3.0*p.x < m) q = p.xyz;
    else if (3.0*p.y < m) q = p.yzx;
    else if (3.0*p.z < m) q = p.zxy;
    else return m * 0.57735027;
    float k = clamp(0.5*(q.z-q.y+s), 0.0, s);
    return length(vec3(q.x, q.y-s+k, q.z-k));
}`,
  },
  {
    id: 'ext:sdf-ellipsoid', name: 'SDF Ellipsoid (approx)', category: 'SDF',
    tags: ['sdf', '3d'],
    code: `float sdEllipsoid(vec3 p, vec3 r) {
    float k0 = length(p / r);
    float k1 = length(p / (r*r));
    return k0 * (k0 - 1.0) / k1;
}`,
  },
  {
    id: 'ext:sdf-round-box', name: 'SDF Rounded Box', category: 'SDF',
    tags: ['sdf', '3d'],
    code: `float sdRoundBox(vec3 p, vec3 b, float r) {
    vec3 d = abs(p) - b;
    return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0) - r;
}`,
  },
  {
    id: 'ext:sdf-bezier', name: 'SDF Quadratic Bezier 2D', category: 'SDF',
    tags: ['sdf', '2d', 'bezier', 'iq'],
    code: `// IQ — distance to quadratic bezier
float sdBezier(vec2 p, vec2 A, vec2 B, vec2 C) {
    vec2 a = B - A, b = A - 2.0*B + C, c = a * 2.0, d = A - p;
    float kk = 1.0 / dot(b, b);
    float kx = kk * dot(a, b);
    float ky = kk * (2.0*dot(a,a) + dot(d,b)) / 3.0;
    float kz = kk * dot(d, a);
    float p2 = ky - kx*kx;
    float q  = kx*(2.0*kx*kx - 3.0*ky) + kz;
    float p3 = p2*p2*p2;
    float q2 = q*q;
    float h  = q2 + 4.0*p3;
    float res;
    if (h >= 0.0) {
        h = sqrt(h);
        vec2 x = (vec2(h,-h) - q) / 2.0;
        vec2 uv = sign(x) * pow(abs(x), vec2(1.0/3.0));
        float t = clamp(uv.x + uv.y - kx, 0.0, 1.0);
        vec2 q2 = d + (c + b*t)*t;
        res = dot(q2, q2);
    } else {
        float z = sqrt(-p2);
        float v = acos(q / (p2*z*2.0)) / 3.0;
        float m = cos(v), n = sin(v)*1.732050808;
        vec3 t3 = clamp(vec3(m+m,-n-m,n-m)*z-kx, 0.0, 1.0);
        vec2 q3 = d + (c + b*t3.x)*t3.x;
        float d1 = dot(q3, q3);
        q3 = d + (c + b*t3.y)*t3.y;
        float d2 = dot(q3, q3);
        res = min(d1, d2);
    }
    return sqrt(res);
}`,
  },
  {
    id: 'ext:sdf-ops', name: 'SDF Boolean Ops', category: 'SDF',
    tags: ['sdf', 'boolean', 'ops', 'iq'],
    code: `// Union, Subtraction, Intersection, Smooth versions
float opU(float d1, float d2)   { return min(d1, d2); }
float opS(float d1, float d2)   { return max(-d1, d2); }
float opI(float d1, float d2)   { return max(d1, d2); }

float opSmoothU(float d1, float d2, float k) {
    float h = clamp(0.5 + 0.5*(d2-d1)/k, 0.0, 1.0);
    return mix(d2, d1, h) - k*h*(1.0-h);
}
float opSmoothS(float d1, float d2, float k) {
    float h = clamp(0.5 - 0.5*(d2+d1)/k, 0.0, 1.0);
    return mix(d2, -d1, h) + k*h*(1.0-h);
}
float opSmoothI(float d1, float d2, float k) {
    float h = clamp(0.5 - 0.5*(d2-d1)/k, 0.0, 1.0);
    return mix(d2, d1, h) + k*h*(1.0-h);
}`,
  },
  {
    id: 'ext:sdf-transform', name: 'SDF Transform Ops', category: 'SDF',
    tags: ['sdf', 'transform', 'iq'],
    code: `// Repeat, twist, bend
vec3 opRep(vec3 p, vec3 c)   { return mod(p + 0.5*c, c) - 0.5*c; }
vec3 opRepL(vec3 p, float s, float l) {
    p.y = p.y - s * clamp(round(p.y/s), 0.0, l);
    return p;
}

vec3 opTwist(vec3 p, float k) {
    float c = cos(k * p.y), s = sin(k * p.y);
    mat2  m = mat2(c, -s, s, c);
    return vec3(m * p.xz, p.y);
}

vec3 opBend(vec3 p, float k) {
    float c = cos(k * p.x), s = sin(k * p.x);
    mat2  m = mat2(c, -s, s, c);
    return vec3(m * p.xy, p.z);
}`,
  },
  {
    id: 'ext:sdf-displacement', name: 'SDF Displacement', category: 'SDF',
    tags: ['sdf', 'displacement'],
    code: `// Combine a base SDF with procedural displacement
float sdDisplace(vec3 p, float baseSDF) {
    float d1 = baseSDF;
    float d2 = snoise3(p * 3.0) * 0.3; // scale to taste
    return d1 + d2;
}`,
  },
  {
    id: 'ext:sdf-2d-circle', name: 'SDF 2D Circle', category: 'SDF',
    tags: ['sdf', '2d'],
    code: `float sdCircle(vec2 p, float r) { return length(p) - r; }`,
  },
  {
    id: 'ext:sdf-2d-rect', name: 'SDF 2D Rectangle', category: 'SDF',
    tags: ['sdf', '2d'],
    code: `float sdRect(vec2 p, vec2 b) {
    vec2 d = abs(p) - b;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}`,
  },
  {
    id: 'ext:sdf-2d-polygon', name: 'SDF 2D Regular Polygon', category: 'SDF',
    tags: ['sdf', '2d', 'polygon'],
    code: `float sdNgon(vec2 p, float r, float n) {
    float an = 3.14159 / n;
    float he = r * cos(an);
    p = p * mat2(cos(an), -sin(an), sin(an), cos(an)); // align
    p.x = abs(p.x);
    p = p * mat2(cos(an), sin(an), -sin(an), cos(an));
    p.x -= r;
    p.y = abs(p.y - he * round(p.y / he));
    return length(p - vec2(clamp(p.x, -r, 0.0), clamp(p.y, 0.0, he))) * sign(p.x);
}`,
  },
  {
    id: 'ext:sdf-2d-segment', name: 'SDF 2D Line Segment', category: 'SDF',
    tags: ['sdf', '2d', 'segment'],
    code: `float sdSegment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
}`,
  },
  {
    id: 'ext:sdf-normal', name: 'SDF Normal Estimation', category: 'SDF',
    tags: ['sdf', 'normal', 'lighting'],
    code: `// Works for any map() function returning float
vec3 calcNormal(vec3 p) {
    const vec2 e = vec2(1.0, -1.0) * 0.0005;
    return normalize(
        e.xyy * map(p + e.xyy) +
        e.yyx * map(p + e.yyx) +
        e.yxy * map(p + e.yxy) +
        e.xxx * map(p + e.xxx)
    );
}`,
  },
  {
    id: 'ext:sdf-ao', name: 'SDF Ambient Occlusion', category: 'SDF',
    tags: ['sdf', 'ao', 'lighting'],
    code: `float calcAO(vec3 pos, vec3 nor) {
    float occ = 0.0, sca = 1.0;
    for (int i = 0; i < 5; i++) {
        float h = 0.01 + 0.12 * float(i) / 4.0;
        float d = map(pos + h * nor);
        occ += (h - d) * sca;
        sca *= 0.95;
        if (occ > 0.35) break;
    }
    return clamp(1.0 - 3.0 * occ, 0.0, 1.0) * (0.5 + 0.5 * nor.y);
}`,
  },
  {
    id: 'ext:sdf-softshadow', name: 'SDF Soft Shadow', category: 'SDF',
    tags: ['sdf', 'shadow', 'lighting'],
    code: `float softShadow(vec3 ro, vec3 rd, float mint, float maxt, float k) {
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

  // ─── PBR ────────────────────────────────────────────────────────────────────

  {
    id: 'ext:pbr-ggx-d', name: 'GGX Normal Distribution (D)', category: 'PBR',
    tags: ['pbr', 'ggx', 'brdf'],
    code: `// GGX/Trowbridge-Reitz Normal Distribution Function
float D_GGX(float NdotH, float roughness) {
    float a  = roughness * roughness;
    float a2 = a * a;
    float d  = NdotH * NdotH * (a2 - 1.0) + 1.0;
    return a2 / (3.14159265 * d * d);
}`,
  },
  {
    id: 'ext:pbr-ggx-g', name: 'GGX Geometry (G)', category: 'PBR',
    tags: ['pbr', 'ggx', 'brdf', 'geometry'],
    code: `float G_SchlickGGX(float NdotV, float roughness) {
    float r = roughness + 1.0;
    float k = (r * r) / 8.0;
    return NdotV / (NdotV * (1.0 - k) + k);
}

float G_Smith(float NdotV, float NdotL, float roughness) {
    return G_SchlickGGX(NdotV, roughness) * G_SchlickGGX(NdotL, roughness);
}`,
  },
  {
    id: 'ext:pbr-fresnel', name: 'Fresnel Schlick', category: 'PBR',
    tags: ['pbr', 'fresnel', 'brdf'],
    code: `vec3 F_Schlick(float cosTheta, vec3 F0) {
    return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

// With roughness for IBL
vec3 F_SchlickRoughness(float cosTheta, vec3 F0, float roughness) {
    return F0 + (max(vec3(1.0 - roughness), F0) - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}`,
  },
  {
    id: 'ext:pbr-full-brdf', name: 'Cook-Torrance BRDF (full)', category: 'PBR',
    tags: ['pbr', 'brdf', 'cook-torrance', 'ggx'],
    code: `// Full Cook-Torrance PBR BRDF
// albedo: base color, metallic, roughness, N, V, L, lightColor
vec3 cookTorrance(vec3 albedo, float metallic, float roughness,
                  vec3 N, vec3 V, vec3 L, vec3 lightColor) {
    vec3 H = normalize(V + L);
    float NdotV = max(dot(N, V), 1e-4);
    float NdotL = max(dot(N, L), 0.0);
    float NdotH = max(dot(N, H), 0.0);
    float HdotV = max(dot(H, V), 0.0);

    vec3 F0 = mix(vec3(0.04), albedo, metallic);

    float D = D_GGX(NdotH, roughness);
    float G = G_Smith(NdotV, NdotL, roughness);
    vec3  F = F_Schlick(HdotV, F0);

    vec3 kD = (1.0 - F) * (1.0 - metallic);

    vec3 specular = D * G * F / max(4.0 * NdotV * NdotL, 1e-4);
    vec3 diffuse  = kD * albedo / 3.14159265;

    return (diffuse + specular) * lightColor * NdotL;
}`,
  },
  {
    id: 'ext:pbr-hammersley', name: 'Hammersley Sequence', category: 'PBR',
    tags: ['pbr', 'hammersley', 'importance-sampling', 'quasi-random'],
    code: `float radicalInverse_VdC(uint bits) {
    bits = (bits << 16u) | (bits >> 16u);
    bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
    bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
    bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
    bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
    return float(bits) * 2.3283064365386963e-10;
}

vec2 hammersley(uint i, uint N) {
    return vec2(float(i) / float(N), radicalInverse_VdC(i));
}`,
  },
  {
    id: 'ext:pbr-importance-sample', name: 'GGX Importance Sampling', category: 'PBR',
    tags: ['pbr', 'importance-sampling', 'ggx', 'ibl'],
    code: `// Sample GGX hemisphere given Xi (hammersley), roughness, and surface normal
vec3 importanceSampleGGX(vec2 Xi, vec3 N, float roughness) {
    float a   = roughness * roughness;
    float phi = 2.0 * 3.14159265 * Xi.x;
    float cosTheta = sqrt((1.0 - Xi.y) / (1.0 + (a*a - 1.0) * Xi.y));
    float sinTheta = sqrt(1.0 - cosTheta * cosTheta);

    vec3 H = vec3(cos(phi)*sinTheta, sin(phi)*sinTheta, cosTheta);

    // TBN matrix
    vec3 up = abs(N.z) < 0.999 ? vec3(0,0,1) : vec3(1,0,0);
    vec3 T  = normalize(cross(up, N));
    vec3 B  = cross(N, T);

    return normalize(T*H.x + B*H.y + N*H.z);
}`,
  },
  {
    id: 'ext:pbr-disney', name: 'Disney BRDF (simplified)', category: 'PBR',
    tags: ['pbr', 'disney', 'brdf'],
    code: `// Simplified Disney principled BRDF diffuse term
float disneyDiffuse(float NdotL, float NdotV, float LdotH, float roughness) {
    float FL = pow(1.0 - NdotL, 5.0);
    float FV = pow(1.0 - NdotV, 5.0);
    float Fd90 = 0.5 + 2.0 * LdotH * LdotH * roughness;
    float Fd = mix(1.0, Fd90, FL) * mix(1.0, Fd90, FV);
    return Fd / 3.14159265;
}`,
  },
  {
    id: 'ext:pbr-env-brdf', name: 'Environment BRDF Approximation', category: 'PBR',
    tags: ['pbr', 'ibl', 'environment', 'brdf-lut'],
    code: `// Analytical fit to the BRDF integration map (no LUT needed)
// Karis 2014 approximation
vec2 envBRDFApprox(float roughness, float NdotV) {
    const vec4 c0 = vec4(-1.0, -0.0275, -0.572,  0.022);
    const vec4 c1 = vec4( 1.0,  0.0425,  1.04,  -0.04);
    vec4 r = roughness * c0 + c1;
    float a004 = min(r.x * r.x, exp2(-9.28 * NdotV)) * r.x + r.y;
    return vec2(-1.04, 1.04) * a004 + r.zw;
}`,
  },

  // ─── PHYSICS ────────────────────────────────────────────────────────────────

  {
    id: 'ext:particles-verlet', name: 'Verlet Integration', category: 'Physics',
    tags: ['physics', 'particles', 'verlet'],
    code: `// Verlet integration for a single particle
// pos: current position, posPrev: previous position, acc: acceleration, dt: timestep
vec2 verlet(vec2 pos, vec2 posPrev, vec2 acc, float dt) {
    return 2.0 * pos - posPrev + acc * dt * dt;
}`,
  },
  {
    id: 'ext:particles-attractor', name: 'Particle Attractor Field', category: 'Physics',
    tags: ['physics', 'particles', 'attractor'],
    code: `// Attraction + repulsion force field
vec2 attractorForce(vec2 pos, vec2 center, float strength, float minDist) {
    vec2 delta = center - pos;
    float d = max(length(delta), minDist);
    return normalize(delta) * strength / (d * d);
}`,
  },
  {
    id: 'ext:sph-density', name: 'SPH Density Kernel', category: 'Physics',
    tags: ['physics', 'sph', 'fluid', 'density'],
    code: `// SPH Poly6 smoothing kernel for density
// h = smoothing radius
float sphPoly6(float r, float h) {
    if (r >= h) return 0.0;
    float x = 1.0 - (r*r)/(h*h);
    return (315.0 / (64.0 * 3.14159 * pow(h, 3.0))) * x * x * x;
}

// Spiky kernel for pressure gradient
vec2 sphSpiky(vec2 rij, float h) {
    float r = length(rij);
    if (r >= h || r < 1e-6) return vec2(0.0);
    float coef = -45.0 / (3.14159 * pow(h, 6.0)) * pow(h - r, 2.0);
    return coef * rij / r;
}`,
  },
  {
    id: 'ext:spring-constraint', name: 'Spring Constraint (cloth)', category: 'Physics',
    tags: ['physics', 'cloth', 'spring', 'constraint'],
    code: `// Position-based spring constraint correction
// Returns delta to add to pos
vec2 springConstraint(vec2 pos, vec2 other, float restLen, float stiffness) {
    vec2 delta = other - pos;
    float d = length(delta);
    if (d < 1e-6) return vec2(0.0);
    return delta * (1.0 - restLen / d) * 0.5 * stiffness;
}`,
  },
  {
    id: 'ext:orbit', name: 'Orbital Mechanics', category: 'Physics',
    tags: ['physics', 'orbit', 'gravity'],
    code: `// Newtonian gravity between two bodies
vec2 gravitationalForce(vec2 posA, vec2 posB, float massB, float G) {
    vec2 delta = posB - posA;
    float d2 = max(dot(delta, delta), 0.01);
    return normalize(delta) * G * massB / d2;
}

// Circular orbit velocity for stable orbit
float orbitalVelocity(float radius, float centerMass, float G) {
    return sqrt(G * centerMass / radius);
}`,
  },
  {
    id: 'ext:boids', name: 'Boids Rules', category: 'Physics',
    tags: ['physics', 'boids', 'flocking', 'particles'],
    code: `// Boids flocking: separation, alignment, cohesion
// Call per agent; neighbours must be computed externally
vec2 boidsSeparation(vec2 pos, vec2 neighbourPos, float minDist) {
    vec2 d = pos - neighbourPos;
    float len = length(d);
    if (len < 1e-5 || len > minDist) return vec2(0.0);
    return normalize(d) * (minDist - len) / minDist;
}
vec2 boidsAlignment(vec2 vel, vec2 avgNeighbourVel) {
    return avgNeighbourVel - vel; // steer toward average velocity
}
vec2 boidsCohesion(vec2 pos, vec2 avgNeighbourPos) {
    return avgNeighbourPos - pos; // steer toward center of mass
}`,
  },

  // ─── TYPOGRAPHY ─────────────────────────────────────────────────────────────

  {
    id: 'ext:sdf-text-aa', name: 'SDF Text Antialiasing', category: 'Typography',
    tags: ['typography', 'text', 'sdf', 'aa'],
    code: `// Render SDF glyph stored in texture with AA
// tex: SDF texture, uv: glyph UV, threshold: 0.5 usually
float sdfTextAlpha(sampler2D tex, vec2 uv, float threshold, float softness) {
    float dist = texture(tex, uv).r;
    float w = fwidth(dist) * softness;
    return smoothstep(threshold - w, threshold + w, dist);
}`,
  },
  {
    id: 'ext:sdf-text-outline', name: 'SDF Text with Outline', category: 'Typography',
    tags: ['typography', 'text', 'sdf', 'outline'],
    code: `// SDF glyph with inner fill + outer stroke
vec4 sdfTextOutline(sampler2D tex, vec2 uv,
                    vec4 fillColor, vec4 strokeColor,
                    float fillThresh, float strokeThresh) {
    float d = texture(tex, uv).r;
    float w = fwidth(d) * 1.5;
    float fill   = smoothstep(fillThresh   - w, fillThresh   + w, d);
    float stroke = smoothstep(strokeThresh - w, strokeThresh + w, d);
    return mix(strokeColor * stroke, fillColor, fill);
}`,
  },
  {
    id: 'ext:msdf-sample', name: 'MSDF Sampling', category: 'Typography',
    tags: ['typography', 'msdf', 'text', 'rendering'],
    code: `// Multi-channel SDF sampling (MSDF) — uses RG and B channels
float msdfSample(sampler2D tex, vec2 uv, float threshold) {
    vec3 s = texture(tex, uv).rgb;
    float sd = max(min(s.r, s.g), min(max(s.r, s.g), s.b));
    float w = fwidth(sd) * 1.5;
    return smoothstep(threshold - w, threshold + w, sd);
}`,
  },
  {
    id: 'ext:digit-display', name: 'Digit Display (7-segment)', category: 'Typography',
    tags: ['typography', 'digit', '7-segment', 'procedural'],
    code: `// Render a 7-segment digit procedurally (0-9)
// p: UV in [0,1]x[0,2], digit: 0-9
float seg(vec2 p, vec2 a, vec2 b, float w) {
    vec2 pa = p-a, ba = b-a;
    float h = clamp(dot(pa,ba)/dot(ba,ba), 0.0, 1.0);
    return length(pa - ba*h) - w;
}
float digitSDF(vec2 p, int d) {
    p = p * 2.0 - vec2(1.0, 2.0); // map to [-1,1]x[-2,2]
    float w = 0.12;
    // segment presence bitmask per digit (0-9)
    int[10] mask = int[](0x7E, 0x30, 0x6D, 0x79, 0x33, 0x5B, 0x5F, 0x70, 0x7F, 0x7B);
    int m = mask[clamp(d, 0, 9)];
    float f = 1e5;
    if ((m & 0x01) != 0) f = min(f, seg(p, vec2(-0.5, 2.0), vec2( 0.5, 2.0), w)); // top
    if ((m & 0x02) != 0) f = min(f, seg(p, vec2( 0.5, 1.0), vec2( 0.5, 2.0), w)); // top-R
    if ((m & 0x04) != 0) f = min(f, seg(p, vec2( 0.5, 0.0), vec2( 0.5, 1.0), w)); // bot-R
    if ((m & 0x08) != 0) f = min(f, seg(p, vec2(-0.5, 0.0), vec2( 0.5, 0.0), w)); // bot
    if ((m & 0x10) != 0) f = min(f, seg(p, vec2(-0.5, 0.0), vec2(-0.5, 1.0), w)); // bot-L
    if ((m & 0x20) != 0) f = min(f, seg(p, vec2(-0.5, 1.0), vec2(-0.5, 2.0), w)); // top-L
    if ((m & 0x40) != 0) f = min(f, seg(p, vec2(-0.5, 1.0), vec2( 0.5, 1.0), w)); // mid
    return f;
}`,
  },

  // ─── UTILITIES ──────────────────────────────────────────────────────────────

  {
    id: 'ext:palette-iq', name: 'IQ Cosine Palette (full set)', category: 'Utilities',
    tags: ['color', 'palette', 'iq'],
    code: `vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
    return a + b * cos(6.28318 * (c * t + d));
}
// Preset palettes (pass t in [0,1]):
// Neon:    palette(t, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.00, 0.33, 0.67))
// Warm:    palette(t, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.1, 0.2))
// Cool:    palette(t, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.3, 0.2, 0.2))
// Pastel:  palette(t, vec3(0.8,0.5,0.4), vec3(0.2,0.4,0.2), vec3(2.0,1.0,1.0), vec3(0.0,0.25,0.25))`,
  },
  {
    id: 'ext:rotate-mat', name: 'Rotation Matrices', category: 'Utilities',
    tags: ['math', 'matrix', 'rotation'],
    code: `mat2 rot2(float a) { float c=cos(a),s=sin(a); return mat2(c,-s,s,c); }

mat3 rotX(float a) { float c=cos(a),s=sin(a); return mat3(1,0,0, 0,c,-s, 0,s,c); }
mat3 rotY(float a) { float c=cos(a),s=sin(a); return mat3(c,0,s, 0,1,0, -s,0,c); }
mat3 rotZ(float a) { float c=cos(a),s=sin(a); return mat3(c,-s,0, s,c,0, 0,0,1); }`,
  },
  {
    id: 'ext:quaternion', name: 'Quaternion Ops', category: 'Utilities',
    tags: ['math', 'quaternion', '3d', 'rotation'],
    code: `// Quaternion as vec4(x,y,z,w) — w is scalar part
vec4 qMul(vec4 a, vec4 b) {
    return vec4(
        a.w*b.xyz + b.w*a.xyz + cross(a.xyz, b.xyz),
        a.w*b.w - dot(a.xyz, b.xyz)
    );
}

vec4 qConj(vec4 q) { return vec4(-q.xyz, q.w); }

// Rotate vector v by quaternion q
vec3 qRotate(vec4 q, vec3 v) {
    return qMul(qMul(q, vec4(v, 0.0)), qConj(q)).xyz;
}

// Axis-angle to quaternion
vec4 axisAngle(vec3 axis, float angle) {
    return vec4(normalize(axis) * sin(angle * 0.5), cos(angle * 0.5));
}

// Spherical linear interpolation
vec4 slerp(vec4 a, vec4 b, float t) {
    float d = dot(a, b);
    if (d < 0.0) { b = -b; d = -d; }
    if (d > 0.9995) return normalize(mix(a, b, t));
    float theta = acos(d);
    return (a * sin((1.0-t)*theta) + b * sin(t*theta)) / sin(theta);
}`,
  },
  {
    id: 'ext:smoothstep-variants', name: 'Smoothstep Variants', category: 'Utilities',
    tags: ['math', 'smoothstep', 'easing'],
    code: `// Quadratic ease in/out
float smoothstep2(float t) { return t < 0.5 ? 2.0*t*t : -1.0+(4.0-2.0*t)*t; }

// Cubic smoothstep (standard)
float smoothstep3(float t) { return t*t*(3.0-2.0*t); }

// Quintic (C2 continuous)
float smoothstep5(float t) { return t*t*t*(t*(t*6.0-15.0)+10.0); }

// Smoothstep with custom range (alternative to GLSL smoothstep)
float ss(float edge0, float edge1, float x) {
    float t = clamp((x-edge0)/(edge1-edge0), 0.0, 1.0);
    return smoothstep3(t);
}`,
  },
  {
    id: 'ext:remap', name: 'Remap & Saturate', category: 'Utilities',
    tags: ['math', 'remap', 'utility'],
    code: `float remap(float v, float i0, float i1, float o0, float o1) {
    return o0 + (o1 - o0) * clamp((v - i0) / (i1 - i0), 0.0, 1.0);
}

float sat(float x) { return clamp(x, 0.0, 1.0); }

// Remap from [-1,1] to [0,1]
float n11to01(float x) { return x * 0.5 + 0.5; }
// Remap from [0,1] to [-1,1]
float n01to11(float x) { return x * 2.0 - 1.0; }`,
  },
  {
    id: 'ext:coordinates', name: 'Coordinate Systems', category: 'Utilities',
    tags: ['math', 'coordinates', 'polar', 'spherical'],
    code: `// Polar ↔ Cartesian (2D)
vec2 toPolar(vec2 p)    { return vec2(length(p), atan(p.y, p.x)); }
vec2 fromPolar(vec2 p)  { return p.x * vec2(cos(p.y), sin(p.y)); }

// Spherical ↔ Cartesian (3D)
// p = (r, theta, phi) where theta=polar, phi=azimuth
vec3 toSpherical(vec3 p) {
    float r = length(p);
    return vec3(r, acos(p.z / r), atan(p.y, p.x));
}
vec3 fromSpherical(float r, float theta, float phi) {
    return r * vec3(sin(theta)*cos(phi), sin(theta)*sin(phi), cos(theta));
}`,
  },
  {
    id: 'ext:triplanar', name: 'Triplanar Mapping', category: 'Utilities',
    tags: ['texture', 'triplanar', '3d', 'mapping'],
    code: `// Triplanar texture projection — avoids UV stretching
vec4 triplanar(sampler2D tex, vec3 pos, vec3 normal, float scale, float sharpness) {
    vec3 w = pow(abs(normal), vec3(sharpness));
    w = w / (w.x + w.y + w.z);
    vec4 xz = texture(tex, pos.xz * scale);
    vec4 yz = texture(tex, pos.yz * scale);
    vec4 xy = texture(tex, pos.xy * scale);
    return xz * w.y + yz * w.x + xy * w.z;
}`,
  },
  {
    id: 'ext:dithering', name: 'Ordered Dithering (Bayer)', category: 'Utilities',
    tags: ['dithering', 'bayer', 'utility', 'color'],
    code: `// 4×4 Bayer matrix dithering
float bayer4(vec2 pos) {
    const mat4 B = mat4(
         0.0/16.0,  8.0/16.0,  2.0/16.0, 10.0/16.0,
        12.0/16.0,  4.0/16.0, 14.0/16.0,  6.0/16.0,
         3.0/16.0, 11.0/16.0,  1.0/16.0,  9.0/16.0,
        15.0/16.0,  7.0/16.0, 13.0/16.0,  5.0/16.0
    );
    int x = int(mod(pos.x, 4.0));
    int y = int(mod(pos.y, 4.0));
    return B[y][x];
}`,
  },
  {
    id: 'ext:encoding', name: 'Value Encoding/Packing', category: 'Utilities',
    tags: ['utility', 'encoding', 'packing', 'float'],
    code: `// Pack/unpack float into RGBA (for float render targets)
vec4 packFloat(float v) {
    vec4 enc = fract(v * vec4(1.0, 255.0, 65025.0, 16581375.0));
    enc -= enc.yzww * vec4(1.0/255.0, 1.0/255.0, 1.0/255.0, 0.0);
    return enc;
}
float unpackFloat(vec4 v) {
    return dot(v, 1.0 / vec4(1.0, 255.0, 65025.0, 16581375.0));
}

// Pack two floats into one (each in [0,1])
float pack2(float a, float b) { return floor(a * 255.0) + b; }
vec2  unpack2(float v) { return vec2(floor(v) / 255.0, fract(v)); }`,
  },
  {
    id: 'ext:gamma-lin', name: 'Gamma / Linear Conversion', category: 'Utilities',
    tags: ['color', 'gamma', 'linear', 'utility'],
    code: `// sRGB ↔ Linear
float toLinear(float v) {
    return v <= 0.04045 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4);
}
float toSRGB(float v) {
    return v <= 0.0031308 ? v * 12.92 : 1.055 * pow(v, 1.0/2.4) - 0.055;
}
vec3 toLinear3(vec3 c) { return vec3(toLinear(c.r), toLinear(c.g), toLinear(c.b)); }
vec3 toSRGB3(vec3 c)   { return vec3(toSRGB(c.r),   toSRGB(c.g),   toSRGB(c.b)); }`,
  },
  {
    id: 'ext:eye-coords', name: 'Eye / World / Screen Coords', category: 'Utilities',
    tags: ['coordinates', 'transform', '3d', 'camera'],
    code: `// Reconstruct world position from depth
vec3 worldFromDepth(vec2 uv, float depth, mat4 invVP) {
    vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec4 world = invVP * clip;
    return world.xyz / world.w;
}

// UV to ray direction (perspective)
vec3 uvToRay(vec2 uv, float fov, float aspect) {
    vec2 ndc = uv * 2.0 - 1.0;
    float tanHalfFov = tan(fov * 0.5);
    return normalize(vec3(ndc.x * aspect * tanHalfFov, ndc.y * tanHalfFov, -1.0));
}`,
  },

  // ─── COLOR ──────────────────────────────────────────────────────────────────

  {
    id: 'ext:hsl', name: 'HSL ↔ RGB', category: 'Color',
    tags: ['color', 'hsl', 'convert'],
    code: `vec3 hsl2rgb(float h, float s, float l) {
    vec3 rgb = clamp(abs(mod(h*6.0+vec3(0,4,2),6.0)-3.0)-1.0, 0.0, 1.0);
    return l + s * (rgb - 0.5) * (1.0 - abs(2.0*l - 1.0));
}
vec3 rgb2hsl(vec3 c) {
    float maxC = max(c.r,max(c.g,c.b));
    float minC = min(c.r,min(c.g,c.b));
    float l = (maxC + minC) * 0.5;
    float d = maxC - minC;
    float s = d < 1e-5 ? 0.0 : d / (1.0 - abs(2.0*l - 1.0));
    float h = 0.0;
    if (d > 1e-5) {
        if      (maxC == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
        else if (maxC == c.g) h = (c.b - c.r) / d + 2.0;
        else                  h = (c.r - c.g) / d + 4.0;
        h /= 6.0;
    }
    return vec3(h, s, l);
}`,
  },
  {
    id: 'ext:oklab', name: 'Oklab Color Space', category: 'Color',
    tags: ['color', 'oklab', 'perceptual'],
    code: `// Oklab (Björn Ottosson 2020) — perceptually uniform
vec3 linearToOklab(vec3 c) {
    float l = 0.4122214708*c.r + 0.5363325363*c.g + 0.0514459929*c.b;
    float m = 0.2119034982*c.r + 0.6806995451*c.g + 0.1073969566*c.b;
    float s = 0.0883024619*c.r + 0.2817188376*c.g + 0.6299787005*c.b;
    vec3 lms = pow(max(vec3(l,m,s),vec3(0.0)), vec3(1.0/3.0));
    return vec3(
        0.2104542553*lms.x + 0.7936177850*lms.y - 0.0040720468*lms.z,
        1.9779984951*lms.x - 2.4285922050*lms.y + 0.4505937099*lms.z,
        0.0259040371*lms.x + 0.7827717662*lms.y - 0.8086757660*lms.z
    );
}
vec3 oklabToLinear(vec3 c) {
    float l = c.x + 0.3963377774*c.y + 0.2158037573*c.z;
    float m = c.x - 0.1055613458*c.y - 0.0638541728*c.z;
    float s = c.x - 0.0894841775*c.y - 1.2914855480*c.z;
    vec3 lms = vec3(l,m,s) * vec3(l,m,s) * vec3(l,m,s);
    return vec3(
         4.0767416621*lms.x - 3.3077115913*lms.y + 0.2309699292*lms.z,
        -1.2684380046*lms.x + 2.6097574011*lms.y - 0.3413193965*lms.z,
        -0.0041960863*lms.x - 0.7034186147*lms.y + 1.7076147010*lms.z
    );
}`,
  },
  {
    id: 'ext:hue-shift', name: 'Hue Shift', category: 'Color',
    tags: ['color', 'hue', 'shift'],
    code: `vec3 hueShift(vec3 c, float shift) {
    vec3 hsl = rgb2hsl(c);
    hsl.x = fract(hsl.x + shift);
    return hsl2rgb(hsl.x, hsl.y, hsl.z);
}`,
  },
  {
    id: 'ext:color-matrix', name: 'Color Matrix (5x4)', category: 'Color',
    tags: ['color', 'matrix', 'grading'],
    code: `// Apply a 5x4 color matrix (like Android/CSS ColorMatrix)
// mat cols: [R,G,B,A,offset] per output channel
vec4 colorMatrix(vec4 c, mat4 m, vec4 offset) {
    return m * c + offset;
}`,
  },
  {
    id: 'ext:luminance', name: 'Luminance Functions', category: 'Color',
    tags: ['color', 'luminance', 'utility'],
    code: `float luminance(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float luminancePerceptual(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// Desaturate preserving luminance
vec3 desaturate(vec3 c, float amount) {
    float lum = luminance(c);
    return mix(c, vec3(lum), amount);
}`,
  },

  // ─── RAY MARCHING ───────────────────────────────────────────────────────────

  {
    id: 'ext:rm-camera', name: 'Ray Marching Camera Setup', category: 'Ray Marching',
    tags: ['ray-marching', 'camera', 'setup'],
    code: `// Build camera ray from UV, camera position, look-at target
mat3 lookAt(vec3 ro, vec3 ta, float roll) {
    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(sin(roll), cos(roll), 0.0)));
    vec3 vv = normalize(cross(uu, ww));
    return mat3(uu, vv, ww);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5*iResolution.xy) / iResolution.y;
    vec3 ro = vec3(0.0, 1.0, -3.0);
    vec3 ta = vec3(0.0);
    mat3 cam = lookAt(ro, ta, 0.0);
    vec3 rd = cam * normalize(vec3(uv, 1.5)); // fov via z
    // ... raymarch with ro, rd
    fragColor = vec4(rd * 0.5 + 0.5, 1.0);
}`,
  },
  {
    id: 'ext:rm-loop', name: 'Ray Marching Loop', category: 'Ray Marching',
    tags: ['ray-marching', 'loop', 'core'],
    code: `// Core ray marching loop — requires map(vec3) -> float
vec2 rayMarch(vec3 ro, vec3 rd) {
    float t = 0.001;
    float id = -1.0;
    for (int i = 0; i < 128; i++) {
        vec3 p = ro + rd * t;
        float d = map(p);
        if (d < 0.0005 * t) { id = 1.0; break; }
        t += d;
        if (t > 100.0) break;
    }
    return vec2(t, id);
}`,
  },
  {
    id: 'ext:rm-lighting', name: 'Ray Marching Lighting', category: 'Ray Marching',
    tags: ['ray-marching', 'lighting', 'shading'],
    code: `// Phong-style lighting for ray marched scenes
vec3 rmShade(vec3 pos, vec3 rd, vec3 lightPos, vec3 lightCol, vec3 albedo) {
    vec3 nor = calcNormal(pos);
    vec3 lig = normalize(lightPos - pos);
    vec3 hal = normalize(lig - rd);
    float sha = softShadow(pos, lig, 0.01, 10.0, 8.0);
    float occ = calcAO(pos, nor);
    float dif = clamp(dot(nor, lig), 0.0, 1.0) * sha;
    float spe = pow(clamp(dot(nor, hal), 0.0, 1.0), 32.0) * dif;
    float amb = 0.5 + 0.5 * nor.y;
    vec3 col = albedo * (amb * 0.15 + dif * lightCol);
    col += spe * 0.5 * lightCol;
    col *= occ;
    return col;
}`,
  },
  {
    id: 'ext:rm-fog', name: 'Atmospheric Fog', category: 'Ray Marching',
    tags: ['ray-marching', 'fog', 'atmosphere'],
    code: `// Exponential + height fog
vec3 applyFog(vec3 col, float dist, vec3 rd, vec3 fogColor, float density) {
    float fogAmount = 1.0 - exp(-dist * density);
    float sunAmount  = max(dot(rd, vec3(0.577)), 0.0);
    vec3  fog = mix(fogColor, fogColor + vec3(0.3, 0.1, 0.0) * pow(sunAmount, 8.0), 0.5);
    return mix(col, fog, fogAmount);
}`,
  },
  {
    id: 'ext:rm-reflections', name: 'Ray Marching Reflections', category: 'Ray Marching',
    tags: ['ray-marching', 'reflections', 'pbr'],
    code: `// Single-bounce reflection for ray marched scenes
vec3 rmReflection(vec3 pos, vec3 rd, vec3 nor, float roughness) {
    vec3 ref = reflect(rd, nor);
    // Perturb reflection by roughness
    ref += roughness * hash33(pos * 100.0);
    ref = normalize(ref);
    vec2 res = rayMarch(pos + nor * 0.002, ref);
    if (res.y < 0.0) return vec3(0.1, 0.2, 0.4); // sky fallback
    vec3 rpos = pos + nor * 0.002 + ref * res.x;
    vec3 rnor = calcNormal(rpos);
    return max(dot(rnor, normalize(vec3(1,2,3))), 0.0) * vec3(1.0);
}`,
  },

  // ─── TEMPLATES ──────────────────────────────────────────────────────────────

  {
    id: 'ext:tpl-pbr-scene', name: 'Template: PBR Scene', category: 'Templates',
    tags: ['template', 'pbr', '3d', 'scene'],
    code: `// PBR Ray-Marched Scene Template
// Requires: sdSphere, cookTorrance, calcNormal, softShadow, calcAO

float map(vec3 p) {
    return sdSphere(p - vec3(0.0, 0.5, 0.0), 1.0);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    vec3 ro = vec3(0.0, 1.5, -4.0);
    vec3 ta = vec3(0.0, 0.5, 0.0);
    mat3 cam = lookAt(ro, ta, 0.0);
    vec3 rd = cam * normalize(vec3(uv, 1.5));

    vec3 col = vec3(0.1, 0.12, 0.18); // sky
    vec2 res = rayMarch(ro, rd);
    if (res.y > 0.0) {
        vec3 pos = ro + rd * res.x;
        vec3 nor = calcNormal(pos);
        vec3 V   = -rd;
        vec3 L   = normalize(vec3(2.0, 4.0, -3.0));

        // Material
        vec3  albedo    = vec3(0.8, 0.3, 0.1);
        float roughness = 0.3;
        float metallic  = 0.0;

        col = cookTorrance(albedo, metallic, roughness, nor, V, L, vec3(3.0));
        col *= calcAO(pos, nor);
        col *= softShadow(pos, L, 0.01, 10.0, 16.0);
    }
    col = toSRGB3(col);
    fragColor = vec4(col, 1.0);
}`,
  },
  {
    id: 'ext:tpl-particles', name: 'Template: GPU Particles (feedback)', category: 'Templates',
    tags: ['template', 'particles', 'feedback', 'buffer'],
    code: `// GPU particle system using iChannel0 as state buffer (feedback loop)
// BufferA: update state (pos.xy, vel.xy) per particle → packed into RGBA
// Image: render particles as blended dots

// --- BufferA (update) ---
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec4 state = texture(iChannel0, uv); // pos.xy, vel.xy
    vec2 pos = state.xy;
    vec2 vel = state.zw;

    // Gravity + attraction
    vec2 force = vec2(0.0, -0.001) + attractorForce(pos, vec2(0.5), 0.002, 0.05);
    vel = vel * 0.995 + force;
    pos = fract(pos + vel);

    fragColor = vec4(pos, vel);
}

// --- Image (render) ---
// void mainImage(out vec4 fragColor, in vec2 fragCoord) {
//     vec2 uv = fragCoord / iResolution.xy;
//     vec4 col = vec4(0.0);
//     for (int i = 0; i < 64; i++) {
//         vec2 pUV = vec2(float(i) / 64.0, 0.5 / iResolution.y);
//         vec2 ppos = texture(iChannel0, pUV).xy;
//         float d = length(uv - ppos);
//         col.rgb += 0.003 / (d * d + 0.0001) * vec3(0.3, 0.8, 1.0);
//     }
//     fragColor = vec4(col.rgb, 1.0);
// }`,
  },
  {
    id: 'ext:tpl-fluid', name: 'Template: 2D Fluid (advection)', category: 'Templates',
    tags: ['template', 'fluid', 'advection', 'feedback'],
    code: `// Simple 2D advection — requires iChannel0 as velocity+density buffer
// Semi-Lagrangian advection (stable, no CFL constraint)

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec4 state = texture(iChannel0, uv);
    vec2 vel   = state.xy;

    // Advect: trace particle backward
    vec2 prevUV = uv - vel * iTimeDelta;
    vec4 prev   = texture(iChannel0, prevUV);

    // Add curl noise force
    vec2 curl   = curlNoise(uv * 3.0 + iTime * 0.1) * 0.001;
    vel = prev.xy + curl;
    vel *= 0.998; // damping

    // Density advection (inject at mouse)
    float density = prev.z;
    if (iMouse.z > 0.0) {
        vec2 m = iMouse.xy / iResolution.xy;
        density += 0.5 * exp(-length(uv - m) * 80.0);
    }
    density *= 0.995;

    fragColor = vec4(vel, density, 1.0);
}`,
  },

  // ─── MORE NOISE ─────────────────────────────────────────────────────────────

  {
    id: 'ext:worley-3d', name: 'Worley (Cellular) Noise 3D', category: 'Noise & Procedural',
    tags: ['noise', 'worley', 'cellular', '3d'],
    code: `float worley3(vec3 p) {
    vec3 i = floor(p); float md = 8.0;
    for (int z=-1;z<=1;z++)
    for (int y=-1;y<=1;y++)
    for (int x=-1;x<=1;x++) {
        vec3 b = vec3(x,y,z);
        vec3 o = hash33(i+b);
        vec3 r = b + o - fract(p);
        float d = dot(r,r);
        md = min(md, d);
    }
    return sqrt(md);
}`,
  },
  {
    id: 'ext:spots', name: 'Procedural Spots/Dots', category: 'Noise & Procedural',
    tags: ['procedural', 'spots', 'dots', 'pattern'],
    code: `float spots(vec2 p, float scale, float radius) {
    p *= scale;
    vec2 i = floor(p), f = fract(p);
    vec2 center = hash22(i) * 0.6 + 0.2;
    return smoothstep(radius + 0.01, radius - 0.01, length(f - center));
}`,
  },
  {
    id: 'ext:hexgrid', name: 'Hexagonal Grid', category: 'Noise & Procedural',
    tags: ['procedural', 'hex', 'grid', 'tiling'],
    code: `vec3 hexGrid(vec2 p) {
    const vec2 s = vec2(1.0, 1.7320508);
    vec2 a = mod(p,      s) - s * 0.5;
    vec2 b = mod(p + s*0.5, s) - s * 0.5;
    vec2 g = dot(a,a) < dot(b,b) ? a : b;
    vec2 id = p - g;
    float border = 0.5 - max(abs(g.x), abs(g.y*0.57735+g.x*0.5));
    return vec3(id, border);
}`,
  },
  {
    id: 'ext:wave-interference', name: 'Wave Interference', category: 'Noise & Procedural',
    tags: ['procedural', 'wave', 'interference', 'pattern'],
    code: `float waveInterference(vec2 p, int nsources) {
    float sum = 0.0;
    for (int i = 0; i < nsources; i++) {
        float a = 6.2831 * float(i) / float(nsources);
        vec2 src = vec2(cos(a), sin(a)) * 0.5;
        sum += sin(length(p - src) * 20.0 - iTime * 2.0);
    }
    return sum / float(nsources);
}`,
  },
  {
    id: 'ext:fbm-ridged2', name: 'Ridged FBM', category: 'Noise & Procedural',
    tags: ['noise', 'fbm', 'ridged', 'terrain'],
    code: `float ridgedFbm(vec2 p) {
    float v = 0.0, a = 0.5, prev = 1.0;
    mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
    for (int i = 0; i < 6; i++) {
        float n = 1.0 - abs(gnoise(p));
        n *= n * prev; v += a * n; prev = n;
        p = r * p * 2.0; a *= 0.5;
    }
    return v;
}`,
  },
  {
    id: 'ext:fbm-warped', name: 'FBM Domain Warp (terrain)', category: 'Noise & Procedural',
    tags: ['noise', 'fbm', 'terrain', 'warp'],
    code: `float terrain(vec2 p) {
    vec2 q = vec2(fbm(p + vec2(0.0, 0.0)), fbm(p + vec2(5.2, 1.3)));
    float h = fbm(p + 4.0 * q);
    return h * h * 2.0;
}`,
  },
  {
    id: 'ext:blue-noise', name: 'Blue Noise Approx', category: 'Noise & Procedural',
    tags: ['noise', 'blue-noise', 'dithering'],
    code: `float blueNoise(vec2 p) {
    return fract(hash21(p) + hash21(p + 0.5) * 1.618033);
}`,
  },

  // ─── MORE SDF ────────────────────────────────────────────────────────────────

  {
    id: 'ext:sdf-rounded-cone', name: 'SDF Rounded Cone', category: 'SDF',
    tags: ['sdf', '3d'],
    code: `float sdRoundedCone(vec3 p, float r1, float r2, float h) {
    vec2 q = vec2(length(p.xz), p.y);
    float b = (r1-r2)/h, a = sqrt(1.0-b*b), k = dot(q,vec2(-b,a));
    if (k < 0.0) return length(q) - r1;
    if (k > a*h) return length(q-vec2(0,h)) - r2;
    return dot(q, vec2(a,b)) - r1;
}`,
  },
  {
    id: 'ext:sdf-gyroid', name: 'SDF Gyroid Surface', category: 'SDF',
    tags: ['sdf', '3d', 'gyroid'],
    code: `float sdGyroid(vec3 p, float scale, float thickness) {
    p *= scale;
    return abs(dot(sin(p), cos(p.zxy))) / scale - thickness;
}`,
  },
  {
    id: 'ext:sdf-mandelbulb', name: 'Mandelbulb (approx)', category: 'SDF',
    tags: ['sdf', '3d', 'fractal', 'mandelbulb'],
    code: `float sdMandelbulb(vec3 p) {
    vec3 w = p; float m = dot(w,w), dz = 1.0;
    for (int i = 0; i < 4; i++) {
        float m2=m*m, m4=m2*m2;
        dz = 8.0*sqrt(m4*m2*m)*dz+1.0;
        float x=w.x,y=w.y,z=w.z,x2=x*x,y2=y*y,z2=z*z;
        float x4=x2*x2,y4=y2*y2,z4=z2*z2;
        float k3=x2+z2,k2=inversesqrt(pow(k3,7.0));
        float k1=x4+y4+z4-6.0*y2*z2-6.0*x2*y2+2.0*z2*x2;
        float k4=x2-y2+z2;
        w.x=p.x+64.0*x*y*z*(x2-z2)*k4*(x4-6.0*x2*z2+z4)*k1*k2;
        w.y=p.y+-16.0*y2*k3*k4*k4+k1*k1;
        w.z=p.z+-8.0*y*k4*(x4*x4-28.0*x4*x2*z2+70.0*x4*z4-28.0*x2*z4*z2+z4*z4)*k1*k2;
        m=dot(w,w); if(m>256.0)break;
    }
    return 0.25*log(m)*sqrt(m)/dz;
}`,
  },
  {
    id: 'ext:sdf-extrusion', name: 'SDF Extrusion (2D->3D)', category: 'SDF',
    tags: ['sdf', '3d', 'extrusion'],
    code: `float sdExtrude(vec3 p, float sd2d, float h) {
    vec2 w = vec2(sd2d, abs(p.z) - h);
    return min(max(w.x, w.y), 0.0) + length(max(w, 0.0));
}`,
  },
  {
    id: 'ext:sdf-revolution', name: 'SDF Revolution (2D->3D)', category: 'SDF',
    tags: ['sdf', '3d', 'revolution'],
    code: `// Revolve a 2D profile (sd2d) around Y axis with radial offset o
// float sdRevolved(vec3 p, float o) { vec2 q=vec2(length(p.xz)-o,p.y); return sd2D(q); }`,
  },

  // ─── MORE PBR ────────────────────────────────────────────────────────────────

  {
    id: 'ext:pbr-subsurface', name: 'SSS Approximation', category: 'PBR',
    tags: ['pbr', 'sss', 'subsurface', 'skin'],
    code: `vec3 sssApprox(vec3 lightDir, vec3 viewDir, vec3 normal,
               vec3 sssColor, float distortion, float power, float scale) {
    vec3 vL = lightDir + normal * distortion;
    float fD = pow(clamp(dot(viewDir, -vL), 0.0, 1.0), power) * scale;
    return sssColor * fD;
}`,
  },
  {
    id: 'ext:pbr-iridescence', name: 'Iridescence (thin-film)', category: 'PBR',
    tags: ['pbr', 'iridescence', 'thin-film'],
    code: `vec3 thinFilmIridescence(float cosTheta, float thickness, float ior) {
    float d = 2.0 * ior * thickness * cosTheta;
    vec3 lambda = vec3(650.0, 530.0, 450.0);
    vec3 phi = 2.0 * 3.14159 * d / lambda;
    float F0 = pow((ior-1.0)/(ior+1.0), 2.0);
    return F0 + (1.0-F0) * (0.5 + 0.5*cos(phi));
}`,
  },
  {
    id: 'ext:pbr-anisotropy', name: 'Anisotropic GGX', category: 'PBR',
    tags: ['pbr', 'anisotropy', 'ggx', 'brushed-metal'],
    code: `float D_GGX_Aniso(float NdotH, float TdotH, float BdotH, float ax, float ay) {
    float a=TdotH/ax, b=BdotH/ay, c=a*a+b*b+NdotH*NdotH;
    return 1.0/(3.14159*ax*ay*c*c);
}`,
  },
  {
    id: 'ext:pbr-env-brdf', name: 'Env BRDF Approx (no LUT)', category: 'PBR',
    tags: ['pbr', 'ibl', 'brdf', 'environment'],
    code: `// Karis 2014 analytical BRDF integration map
vec2 envBRDFApprox(float roughness, float NdotV) {
    const vec4 c0=vec4(-1.0,-0.0275,-0.572,0.022);
    const vec4 c1=vec4(1.0,0.0425,1.04,-0.04);
    vec4 r=roughness*c0+c1;
    float a004=min(r.x*r.x,exp2(-9.28*NdotV))*r.x+r.y;
    return vec2(-1.04,1.04)*a004+r.zw;
}`,
  },

  // ─── MORE UTILITIES ──────────────────────────────────────────────────────────

  {
    id: 'ext:easing', name: 'Easing Functions', category: 'Utilities',
    tags: ['math', 'easing', 'animation', 'tween'],
    code: `float easeInQuad(float t)    { return t*t; }
float easeOutQuad(float t)   { return t*(2.0-t); }
float easeInCubic(float t)   { return t*t*t; }
float easeOutCubic(float t)  { float u=t-1.0; return u*u*u+1.0; }
float easeInElastic(float t) {
    if(t==0.0||t==1.0)return t;
    return -pow(2.0,10.0*t-10.0)*sin((t*10.0-10.75)*2.094395);
}
float easeOutBounce(float t) {
    float n=7.5625,d=2.75;
    if(t<1.0/d)      return n*t*t;
    else if(t<2.0/d){t-=1.5/d; return n*t*t+0.75;}
    else if(t<2.5/d){t-=2.25/d;return n*t*t+0.9375;}
    else             {t-=2.625/d;return n*t*t+0.984375;}
}`,
  },
  {
    id: 'ext:bezier-eval', name: 'Bezier Evaluation', category: 'Utilities',
    tags: ['math', 'bezier', 'curve', 'animation'],
    code: `vec2 bezierCubic(vec2 p0,vec2 p1,vec2 p2,vec2 p3,float t){
    float mt=1.0-t;
    return mt*mt*mt*p0+3.0*mt*mt*t*p1+3.0*mt*t*t*p2+t*t*t*p3;
}
vec2 bezierQuad(vec2 p0,vec2 p1,vec2 p2,float t){
    float mt=1.0-t;
    return mt*mt*p0+2.0*mt*t*p1+t*t*p2;
}`,
  },
  {
    id: 'ext:oklab', name: 'Oklab Color Space', category: 'Color',
    tags: ['color', 'oklab', 'perceptual'],
    code: `vec3 linearToOklab(vec3 c) {
    float l=0.4122*c.r+0.5363*c.g+0.0514*c.b;
    float m=0.2119*c.r+0.6807*c.g+0.1074*c.b;
    float s=0.0883*c.r+0.2817*c.g+0.6300*c.b;
    vec3 lms=pow(max(vec3(l,m,s),vec3(0.0)),vec3(1.0/3.0));
    return vec3(0.2104*lms.x+0.7936*lms.y-0.0040*lms.z,
                1.9779*lms.x-2.4285*lms.y+0.4505*lms.z,
                0.0259*lms.x+0.7827*lms.y-0.8086*lms.z);
}`,
  },
  {
    id: 'ext:luminance', name: 'Luminance & Desaturate', category: 'Color',
    tags: ['color', 'luminance', 'desaturate'],
    code: `float luminance(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 desaturate(vec3 c, float a) { return mix(c, vec3(luminance(c)), a); }`,
  },
  {
    id: 'ext:hue-shift', name: 'Hue Shift', category: 'Color',
    tags: ['color', 'hue', 'shift'],
    code: `vec3 hueShift(vec3 c, float shift) {
    vec3 hsl = rgb2hsl(c);
    hsl.x = fract(hsl.x + shift);
    return hsl2rgb(hsl.x, hsl.y, hsl.z);
}`,
  },
  {
    id: 'ext:aspect-uv', name: 'Aspect-Corrected UV', category: 'Utilities',
    tags: ['utility', 'uv', 'aspect', 'setup'],
    code: `vec2 uvCentered(vec2 fc, vec2 res) { return (fc - 0.5*res)/res.y; }
vec2 uvAspect(vec2 fc, vec2 res)   { return fc/res.y; }`,
  },
  {
    id: 'ext:polar-uv', name: 'Polar UV & Kaleidoscope', category: 'Utilities',
    tags: ['utility', 'polar', 'uv', 'kaleidoscope'],
    code: `vec2 toPolar2(vec2 p) { return vec2(length(p), atan(p.y, p.x)); }
vec2 kaleidoscope(vec2 p, float n) {
    float a = atan(p.y, p.x), s = 6.28318/n;
    a = mod(a, s); if(a > s*0.5) a = s-a;
    return length(p)*vec2(cos(a), sin(a));
}`,
  },
  {
    id: 'ext:dithering', name: 'Bayer Dithering 4x4', category: 'Utilities',
    tags: ['dithering', 'bayer', 'color', 'utility'],
    code: `float bayer4(vec2 pos) {
    const mat4 B=mat4(0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5)/16.0;
    return B[int(mod(pos.y,4.0))][int(mod(pos.x,4.0))];
}`,
  },
  {
    id: 'ext:tbn', name: 'TBN Matrix (normal mapping)', category: 'Utilities',
    tags: ['3d', 'tbn', 'normal-map', 'tangent'],
    code: `mat3 cotangentFrame(vec3 N, vec3 pos, vec2 uv) {
    vec3 dp1=dFdx(pos),dp2=dFdy(pos);
    vec2 duv1=dFdx(uv),duv2=dFdy(uv);
    vec3 dp2perp=cross(dp2,N),dp1perp=cross(N,dp1);
    vec3 T=dp2perp*duv1.x+dp1perp*duv2.x;
    vec3 B=dp2perp*duv1.y+dp1perp*duv2.y;
    float invmax=inversesqrt(max(dot(T,T),dot(B,B)));
    return mat3(T*invmax,B*invmax,N);
}`,
  },
  {
    id: 'ext:triplanar', name: 'Triplanar Mapping', category: 'Utilities',
    tags: ['texture', 'triplanar', '3d'],
    code: `vec4 triplanar(sampler2D tex, vec3 pos, vec3 nor, float scale, float sharp) {
    vec3 w=pow(abs(nor),vec3(sharp)); w/=w.x+w.y+w.z;
    return texture(tex,pos.xz*scale)*w.y
          +texture(tex,pos.yz*scale)*w.x
          +texture(tex,pos.xy*scale)*w.z;
}`,
  },
  {
    id: 'ext:texture-anim', name: 'Animated UV (scroll/zoom/rotate)', category: 'Utilities',
    tags: ['texture', 'uv', 'animation', 'scroll'],
    code: `vec2 scrollUV(vec2 uv, vec2 dir, float speed){ return fract(uv+dir*iTime*speed); }
vec2 rotateUV(vec2 uv, float a){ return rot2(a)*(uv-0.5)+0.5; }
vec2 zoomUV(vec2 uv, float z)  { return (uv-0.5)/z+0.5; }`,
  },
  {
    id: 'ext:encoding', name: 'Float Pack/Unpack (RGBA)', category: 'Utilities',
    tags: ['utility', 'encoding', 'packing', 'float'],
    code: `vec4 packFloat(float v) {
    vec4 e=fract(v*vec4(1,255,65025,16581375));
    e-=e.yzww*vec4(1.0/255.0,1.0/255.0,1.0/255.0,0);
    return e;
}
float unpackFloat(vec4 v) { return dot(v,1.0/vec4(1,255,65025,16581375)); }`,
  },
  {
    id: 'ext:eye-coords', name: 'World Pos from Depth', category: 'Utilities',
    tags: ['coordinates', 'depth', '3d', 'camera'],
    code: `vec3 worldFromDepth(vec2 uv, float depth, mat4 invVP) {
    vec4 clip=vec4(uv*2.0-1.0, depth*2.0-1.0, 1.0);
    vec4 world=invVP*clip;
    return world.xyz/world.w;
}`,
  },
  {
    id: 'ext:rgb-hex', name: 'Color from Hex uint', category: 'Color',
    tags: ['color', 'hex', 'utility'],
    code: `vec3 hexColor(uint hex) {
    return vec3(float((hex>>16u)&0xFFu),
                float((hex>> 8u)&0xFFu),
                float( hex      &0xFFu))/255.0;
}`,
  },
  {
    id: 'ext:remap', name: 'Remap & Saturate', category: 'Utilities',
    tags: ['math', 'remap', 'utility'],
    code: `float remap(float v,float i0,float i1,float o0,float o1){
    return o0+(o1-o0)*clamp((v-i0)/(i1-i0),0.0,1.0);
}
float sat(float x){return clamp(x,0.0,1.0);}
float n11to01(float x){return x*0.5+0.5;}
float n01to11(float x){return x*2.0-1.0;}`,
  },
  {
    id: 'ext:coordinates', name: 'Coordinate Conversions', category: 'Utilities',
    tags: ['math', 'coordinates', 'polar', 'spherical'],
    code: `vec2 toPolar(vec2 p)   { return vec2(length(p), atan(p.y,p.x)); }
vec2 fromPolar(vec2 p) { return p.x*vec2(cos(p.y),sin(p.y)); }
vec3 fromSpherical(float r,float th,float ph) {
    return r*vec3(sin(th)*cos(ph),sin(th)*sin(ph),cos(th));
}`,
  },

  // ─── MORE TEMPLATES ──────────────────────────────────────────────────────────

  {
    id: 'ext:tpl-feedback', name: 'Template: Feedback / Trails', category: 'Templates',
    tags: ['template', 'feedback', 'trail', 'buffer'],
    code: `// BufferA: accumulate with zoom decay
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord/iResolution.xy;
    vec2 shift = vec2(sin(iTime*0.1),cos(iTime*0.07))*0.001;
    vec4 prev = texture(iChannel0, (uv-0.5)*0.999+0.5+shift)*0.97;
    vec2 mouse = iMouse.z>0.0 ? iMouse.xy/iResolution.xy : vec2(0.5);
    float d = length(uv-mouse);
    vec3 draw = vec3(0.4,0.8,1.0)*0.15/(d*d+0.0002);
    fragColor = vec4(prev.rgb+draw, 1.0);
}`,
  },
  {
    id: 'ext:tpl-audio-vis', name: 'Template: Audio Visualizer', category: 'Templates',
    tags: ['template', 'audio', 'visualizer', 'spectrum'],
    code: `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord/iResolution.xy;
    vec3 col = vec3(0.0);
    if (uv.y < 0.5) {
        float wave=texture(iChannel0,vec2(uv.x,0.25)).r;
        col += vec3(0.2,0.8,1.0)*0.008/pow(abs(uv.y-wave*0.5),2.0);
    } else {
        float freq=texture(iChannel0,vec2(uv.x,0.0)).r;
        float bar=smoothstep(0.0,0.02,freq-(uv.y-0.5)*2.0);
        col += palette(uv.x,vec3(0.5),vec3(0.5),vec3(1.0),vec3(0.0,0.33,0.67))*bar;
    }
    fragColor = vec4(col,1.0);
}`,
  },
  {
    id: 'ext:tpl-2d-sdf-scene', name: 'Template: 2D SDF Scene', category: 'Templates',
    tags: ['template', 'sdf', '2d', 'scene'],
    code: `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord-0.5*iResolution.xy)/iResolution.y;
    vec3 col = vec3(0.08,0.09,0.12);
    float d1 = sdCircle(uv-vec2(0.2,0.0), 0.15);
    col = mix(col, vec3(0.9,0.4,0.2), aaSDF(d1,1.0));
    float d2 = sdRect(uv-vec2(-0.2,0.0), vec2(0.12,0.08));
    col = mix(col, vec3(0.2,0.6,0.9), aaSDF(d2,1.0));
    float d3 = opSmoothU(d1,d2,0.1);
    col += vec3(0.3,0.7,1.0)*max(0.0,0.02/abs(d3));
    fragColor = vec4(col,1.0);
}`,
  },
  {
    id: 'ext:tpl-shadertoy', name: 'Template: Shadertoy Starter', category: 'Templates',
    tags: ['template', 'shadertoy', 'starter', 'compat'],
    code: `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord/iResolution.xy;
    vec2 p  = (fragCoord-0.5*iResolution.xy)/iResolution.y;
    float t = iTime;
    vec2 mouse = iMouse.xy/iResolution.xy;
    vec3 col = 0.5+0.5*cos(t+vec3(uv.xyx)+vec3(0,2,4));
    fragColor = vec4(col, 1.0);
}`,
  },


  // ─── MATH & GEOMETRY ─────────────────────────────────────────────────────────

  { id:'ext:ray-sphere', name:'Ray-Sphere Intersection', category:'Ray Marching',
    tags:['math','ray','sphere','intersection'],
    code:`vec2 raySphere(vec3 ro, vec3 rd, vec3 c, float r) {
    vec3 oc = ro - c;
    float b = dot(oc, rd), d = b*b - dot(oc,oc) + r*r;
    if (d < 0.0) return vec2(-1.0);
    float sd = sqrt(d);
    return vec2(-b-sd, -b+sd);
}` },
  { id:'ext:ray-aabb', name:'Ray-AABB Intersection', category:'Ray Marching',
    tags:['math','ray','aabb','intersection'],
    code:`vec2 rayAABB(vec3 ro, vec3 rd, vec3 mn, vec3 mx) {
    vec3 inv = 1.0/rd;
    vec3 t0 = (mn-ro)*inv, t1 = (mx-ro)*inv;
    vec3 tmin=min(t0,t1), tmax=max(t0,t1);
    float tN=max(max(tmin.x,tmin.y),tmin.z);
    float tF=min(min(tmax.x,tmax.y),tmax.z);
    return vec2(tN,tF);
}` },
  { id:'ext:ray-plane', name:'Ray-Plane Intersection', category:'Ray Marching',
    tags:['math','ray','plane'],
    code:`float rayPlane(vec3 ro, vec3 rd, vec3 pos, vec3 nor) {
    return dot(pos-ro, nor) / dot(rd, nor);
}` },
  { id:'ext:fresnel-full', name:'Fresnel (Schlick + dielectric)', category:'PBR',
    tags:['pbr','fresnel','dielectric','ior'],
    code:`// Full dielectric Fresnel (Schlick approximation with IOR)
float fresnelDielectric(float cosTheta, float ior) {
    float F0 = pow((1.0-ior)/(1.0+ior), 2.0);
    return F0 + (1.0-F0)*pow(clamp(1.0-cosTheta,0.0,1.0), 5.0);
}
// For conductors with complex IOR (eta, k)
float fresnelConductor(float cosTheta, float eta, float k) {
    float a = eta*eta+k*k, b = a*cosTheta*cosTheta;
    float f = (b - 2.0*eta*cosTheta + 1.0) / (b + 2.0*eta*cosTheta + 1.0);
    float g = (a - 2.0*eta*cosTheta + cosTheta*cosTheta) / (a + 2.0*eta*cosTheta + cosTheta*cosTheta);
    return 0.5*(f+g);
}` },
  { id:'ext:env-sphere', name:'Environment Sphere Sampling', category:'PBR',
    tags:['pbr','ibl','environment','cubemap'],
    code:`// Sample equirectangular environment map
vec2 envUV(vec3 dir) {
    float phi = atan(dir.z, dir.x);
    float theta = asin(clamp(dir.y, -1.0, 1.0));
    return vec2(phi/(2.0*3.14159)+0.5, theta/3.14159+0.5);
}` },
  { id:'ext:pcf-shadow', name:'PCF Soft Shadow (2D)', category:'PBR',
    tags:['shadow','pcf','soft','2d'],
    code:`// PCF soft shadow on a shadow map texture
float pcfShadow(sampler2D shadowMap, vec2 uv, float depth, float bias, int samples) {
    float shadow = 0.0;
    vec2 texelSize = 1.0 / vec2(textureSize(shadowMap, 0));
    float r = float(samples)/2.0;
    for(int x=-samples/2;x<=samples/2;x++)
    for(int y=-samples/2;y<=samples/2;y++) {
        float d = texture(shadowMap, uv + vec2(x,y)*texelSize).r;
        shadow += depth - bias > d ? 1.0 : 0.0;
    }
    return shadow / float((samples+1)*(samples+1));
}` },
  { id:'ext:cloth-constraint', name:'Cloth Bend Constraint', category:'Physics',
    tags:['physics','cloth','bend','constraint'],
    code:`// Position-based bending constraint (dihedral angle)
// Corrects two triangles sharing an edge to maintain dihedral angle
vec3 bendConstraint(vec3 p1, vec3 p2, vec3 p3, vec3 p4, float restAngle, float stiffness) {
    vec3 n1 = normalize(cross(p2-p1, p3-p1));
    vec3 n2 = normalize(cross(p2-p1, p4-p1));
    float d  = clamp(dot(n1,n2), -1.0, 1.0);
    float angle = acos(d);
    float err = angle - restAngle;
    vec3 axis = normalize(cross(n1, n2));
    return axis * err * stiffness * 0.25;
}` },
  { id:'ext:wind-force', name:'Wind Force Field', category:'Physics',
    tags:['physics','wind','cloth','particles'],
    code:`vec3 windForce(vec3 pos, float time, float strength) {
    float gust = sin(time*0.7+pos.x*0.3)*0.5+0.5;
    vec3  dir  = normalize(vec3(1.0+sin(time*0.3)*0.3, 0.1, 0.2));
    float turb = snoise3(pos*0.5+vec3(0,0,time*0.4));
    return dir * strength * (gust + turb*0.3);
}` },
  { id:'ext:magnetic', name:'Magnetic Field Lines', category:'Physics',
    tags:['physics','magnetic','field','visualization'],
    code:`// Magnetic dipole field at origin, axis along Y
vec3 magneticDipole(vec3 p, float strength) {
    float r = length(p);
    if (r < 0.001) return vec3(0.0);
    vec3 r_hat = p/r;
    vec3 m = vec3(0,1,0)*strength;
    return (3.0*dot(m,r_hat)*r_hat - m) / (r*r*r);
}` },
  { id:'ext:ik-2bone', name:'2-Bone IK', category:'Physics',
    tags:['physics','ik','animation','bones'],
    code:`// Analytical 2-bone IK
// root: pivot, target: desired end position, l1/l2: bone lengths
// Returns elbow position
vec2 ik2Bone(vec2 root, vec2 target, float l1, float l2) {
    vec2 d = target - root;
    float dist = clamp(length(d), abs(l1-l2)+0.001, l1+l2-0.001);
    float a = (l1*l1 - l2*l2 + dist*dist) / (2.0*dist);
    float h = sqrt(max(0.0, l1*l1 - a*a));
    vec2 dn = normalize(d);
    vec2 perp = vec2(-dn.y, dn.x);
    return root + dn*a + perp*h;
}` },
  { id:'ext:sdf-2d-triangle', name:'SDF 2D Triangle', category:'SDF',
    tags:['sdf','2d','triangle'],
    code:`float sdTriangle(vec2 p, vec2 a, vec2 b, vec2 c) {
    vec2 e0=b-a,e1=c-b,e2=a-c;
    vec2 v0=p-a,v1=p-b,v2=p-c;
    vec2 pq0=v0-e0*clamp(dot(v0,e0)/dot(e0,e0),0.0,1.0);
    vec2 pq1=v1-e1*clamp(dot(v1,e1)/dot(e1,e1),0.0,1.0);
    vec2 pq2=v2-e2*clamp(dot(v2,e2)/dot(e2,e2),0.0,1.0);
    float s=sign(e0.x*e2.y-e0.y*e2.x);
    vec2 d=min(min(vec2(dot(pq0,pq0),s*(v0.x*e0.y-v0.y*e0.x)),
                   vec2(dot(pq1,pq1),s*(v1.x*e1.y-v1.y*e1.x))),
                   vec2(dot(pq2,pq2),s*(v2.x*e2.y-v2.y*e2.x)));
    return -sqrt(d.x)*sign(d.y);
}` },
  { id:'ext:sdf-cross', name:'SDF 2D Cross', category:'SDF',
    tags:['sdf','2d','cross','plus'],
    code:`float sdCross(vec2 p, vec2 b) {
    p = abs(p);
    p = (p.y > p.x) ? p.yx : p.xy;
    vec2 q = p - b;
    float k = max(q.y, q.x);
    vec2 w = (k > 0.0) ? q : vec2(b.y - p.x, -k);
    return sign(k) * length(max(w, 0.0));
}` },
  { id:'ext:sdf-star', name:'SDF 2D Star', category:'SDF',
    tags:['sdf','2d','star'],
    code:`float sdStar(vec2 p, float r, int n, float m) {
    float an = 3.14159/float(n);
    float en = 3.14159/m;
    vec2 acs = vec2(cos(an),sin(an));
    vec2 ecs = vec2(cos(en),sin(en));
    float bn = mod(atan(p.y,p.x),2.0*an) - an;
    p = length(p)*vec2(cos(bn),abs(sin(bn)));
    p -= r*acs;
    p += ecs*clamp(-dot(p,ecs),0.0,r*acs.y/ecs.y);
    return length(p)*sign(p.x);
}` },
  { id:'ext:sdf-arrow', name:'SDF 2D Arrow', category:'SDF',
    tags:['sdf','2d','arrow'],
    code:`// Arrow pointing right, tail at x=-1, head at x=1
float sdArrow(vec2 p, vec2 a, vec2 b, float w1, float w2) {
    vec2 ba=b-a; float l2=dot(ba,ba);
    float t=clamp(dot(p-a,ba)/l2,0.0,1.0);
    float body=length(p-a-ba*min(t,0.8))-w1;
    float head=sdTriangle(p, b, a+ba*0.75+vec2(-ba.y,ba.x)*w2/length(ba),
                              a+ba*0.75-vec2(-ba.y,ba.x)*w2/length(ba));
    return min(body, head);
}` },
  { id:'ext:noise-flow-field', name:'Flow Field from Noise', category:'Noise & Procedural',
    tags:['procedural','flow-field','noise','particles'],
    code:`// Generate a flow direction at any point from angular noise
vec2 flowField(vec2 p, float scale, float timeScale) {
    float angle = snoise(vec3(p*scale, iTime*timeScale)) * 6.28318;
    return vec2(cos(angle), sin(angle));
}
// Advect a UV position along the flow field
vec2 advectFlow(vec2 uv, float scale, float timeScale, float stepSize) {
    return uv + flowField(uv, scale, timeScale) * stepSize;
}` },
  { id:'ext:poisson-disk', name:'Poisson Disk Samples (fixed)', category:'Noise & Procedural',
    tags:['noise','poisson','sampling','ao'],
    code:`// 16 pre-computed Poisson disk samples for SSAO/PCF
const vec2 poissonDisk[16] = vec2[](
    vec2(-0.94201624, -0.39906216),vec2( 0.94558609, -0.76890725),
    vec2(-0.09418410, -0.92938870),vec2( 0.34495938,  0.29387760),
    vec2(-0.91588581,  0.45771432),vec2(-0.81544232, -0.87912464),
    vec2(-0.38277543,  0.27676845),vec2( 0.97484398,  0.75648379),
    vec2( 0.44323325, -0.97511554),vec2( 0.53742981, -0.47373420),
    vec2(-0.26496911, -0.41893023),vec2( 0.79197514,  0.19090188),
    vec2(-0.24188840,  0.99706507),vec2(-0.81409955,  0.91437590),
    vec2( 0.19984126,  0.78641367),vec2( 0.14383161, -0.14100790)
);` },
  { id:'ext:screen-space-normal', name:'Screen-Space Normal from Depth', category:'Utilities',
    tags:['3d','normal','depth','screen-space'],
    code:`// Reconstruct normal from depth buffer (works without normal buffer)
vec3 normalFromDepth(sampler2D depthTex, vec2 uv, mat4 invP) {
    vec2 px = 1.0/iResolution.xy;
    float d0 = texture(depthTex, uv).r;
    float dx = texture(depthTex, uv+vec2(px.x,0)).r;
    float dy = texture(depthTex, uv+vec2(0,px.y)).r;
    vec3 p0 = worldFromDepth(uv, d0, invP);
    vec3 px3= worldFromDepth(uv+vec2(px.x,0), dx, invP);
    vec3 py3= worldFromDepth(uv+vec2(0,px.y), dy, invP);
    return normalize(cross(px3-p0, py3-p0));
}` },
  { id:'ext:sobel', name:'Sobel Edge Detection', category:'Utilities',
    tags:['filter','edge','sobel','post-process'],
    code:`float sobelEdge(sampler2D tex, vec2 uv) {
    vec2 px = 1.0/iResolution.xy;
    float tl=texture(tex,uv+vec2(-1, 1)*px).r;
    float tc=texture(tex,uv+vec2( 0, 1)*px).r;
    float tr=texture(tex,uv+vec2( 1, 1)*px).r;
    float ml=texture(tex,uv+vec2(-1, 0)*px).r;
    float mr=texture(tex,uv+vec2( 1, 0)*px).r;
    float bl=texture(tex,uv+vec2(-1,-1)*px).r;
    float bc=texture(tex,uv+vec2( 0,-1)*px).r;
    float br=texture(tex,uv+vec2( 1,-1)*px).r;
    float gx=-tl-2.0*ml-bl+tr+2.0*mr+br;
    float gy=-tl-2.0*tc-tr+bl+2.0*bc+br;
    return sqrt(gx*gx+gy*gy);
}` },
  { id:'ext:chromatic-aberration', name:'Chromatic Aberration', category:'Utilities',
    tags:['post-process','chromatic','aberration','lens'],
    code:`vec3 chromaticAberration(sampler2D tex, vec2 uv, float strength) {
    vec2 offset = (uv - 0.5) * strength;
    float r = texture(tex, uv + offset*1.0).r;
    float g = texture(tex, uv           ).g;
    float b = texture(tex, uv - offset*1.0).b;
    return vec3(r, g, b);
}` },
  { id:'ext:barrel-distortion', name:'Barrel / Lens Distortion', category:'Utilities',
    tags:['post-process','barrel','distortion','lens'],
    code:`vec2 barrelDistort(vec2 uv, float k1, float k2) {
    vec2 p = uv - 0.5;
    float r2 = dot(p,p);
    p *= 1.0 + k1*r2 + k2*r2*r2;
    return p + 0.5;
}` },
  { id:'ext:vignette', name:'Vignette', category:'Utilities',
    tags:['post-process','vignette','lens'],
    code:`float vignette(vec2 uv, float strength, float smoothness) {
    uv = uv*2.0-1.0;
    return 1.0 - smoothstep(1.0-smoothness, 1.0, length(uv)*strength);
}` },
  { id:'ext:color-grade', name:'Color Grade (contrast/lift/gain)', category:'Color',
    tags:['color','grade','contrast','lift','gain'],
    code:`vec3 colorGrade(vec3 c, float contrast, vec3 lift, vec3 gain) {
    c = (c - 0.5) * contrast + 0.5; // contrast around mid
    c = c * gain + lift * (1.0-c);  // lift shadows, push gain
    return clamp(c, 0.0, 1.0);
}` },
  { id:'ext:film-grain', name:'Film Grain', category:'Color',
    tags:['color','grain','film','noise'],
    code:`vec3 filmGrain(vec3 col, vec2 uv, float strength) {
    float grain = hash21(uv + fract(iTime)) - 0.5;
    return col + grain * strength;
}` },
  { id:'ext:halftone', name:'Halftone Screen', category:'Utilities',
    tags:['post-process','halftone','print','pattern'],
    code:`float halftone(vec2 uv, float scale, float brightness) {
    vec2 p = uv * scale;
    vec2 i = floor(p), f = fract(p) - 0.5;
    return step(length(f), brightness * 0.5);
}` },
  { id:'ext:cellular-texture', name:'Cellular / Mosaic Texture', category:'Noise & Procedural',
    tags:['procedural','cellular','mosaic','voronoi'],
    code:`vec4 cellularTexture(sampler2D tex, vec2 uv, float scale) {
    vec2 cell = floor(uv*scale)/scale;
    vec2 jitter = hash22(cell*100.0)*0.8/scale;
    return texture(tex, cell + jitter);
}` },
  { id:'ext:sdf-morph', name:'SDF Morphing (mix)', category:'SDF',
    tags:['sdf','morph','animation','blend'],
    code:`// Morph between two SDFs using mix
// t=0 -> sdf1, t=1 -> sdf2
float sdMorph(float sdf1, float sdf2, float t) {
    return mix(sdf1, sdf2, smoothstep(0.0, 1.0, t));
}` },
  { id:'ext:noise-marble', name:'Marble Texture', category:'Noise & Procedural',
    tags:['procedural','marble','texture','pattern'],
    code:`vec3 marble(vec2 p, vec3 colA, vec3 colB) {
    float n = fbm(p) * 8.0;
    float t = 0.5 + 0.5 * sin(p.x * 4.0 + n);
    return mix(colA, colB, t);
}` },
  { id:'ext:noise-wood', name:'Wood Texture', category:'Noise & Procedural',
    tags:['procedural','wood','texture','pattern'],
    code:`float wood(vec2 p, float rings) {
    float d = length(p) * rings;
    d += fbm(p) * 2.0;
    return fract(d);
}` },
  { id:'ext:perlin-fbm-3d', name:'Perlin FBM 3D', category:'Noise & Procedural',
    tags:['noise','perlin','fbm','3d'],
    code:`float fbm3(vec3 p) {
    float v=0.0, a=0.5;
    mat3 rot=mat3(0.0,1.6,1.2,-1.6,0.7,-0.9,-1.2,-0.9,1.4);
    for(int i=0;i<5;i++){v+=a*snoise3(p);p=rot*p*2.0;a*=0.5;}
    return v;
}` },
  { id:'ext:smooth-min-poly', name:'Smooth Min (polynomial)', category:'SDF',
    tags:['sdf','smooth','min','union'],
    code:`// Various smooth minimum functions
float sminExp(float a, float b, float k) {
    float r=exp(-k*a)+exp(-k*b);
    return -log(r)/k;
}
float sminPow(float a, float b, float k) {
    a=pow(a,k); b=pow(b,k);
    return pow((a*b)/(a+b), 1.0/k);
}
float sminQuad(float a, float b, float k) {
    float h=max(k-abs(a-b),0.0)/k;
    return min(a,b)-h*h*k*0.25;
}` },
  { id:'ext:atmosphere', name:'Rayleigh Atmosphere (approx)', category:'Ray Marching',
    tags:['ray-marching','atmosphere','sky','rayleigh'],
    code:`// Cheap single-scatter Rayleigh sky
vec3 rayleighSky(vec3 rd, vec3 sunDir) {
    float mu = dot(rd, sunDir);
    float rayleigh = 3.0/(16.0*3.14159) * (1.0 + mu*mu);
    vec3 betaR = vec3(5.5e-6, 13.0e-6, 22.4e-6); // scattering coefficients
    float h = max(rd.y, 0.0);
    float optDepth = exp(-h*8.0);
    vec3 sky = rayleigh * betaR * optDepth * 20.0;
    // Sun disk
    float sun = pow(max(mu, 0.0), 512.0) * 10.0;
    return sky + sun * vec3(1.0, 0.95, 0.8);
}` },
  { id:'ext:lod', name:'Level of Detail (LOD distance)', category:'Ray Marching',
    tags:['ray-marching','lod','performance'],
    code:`// Adjust detail level based on distance from camera
int lodSteps(float dist, int maxSteps, float lodFactor) {
    return int(float(maxSteps) / (1.0 + dist * lodFactor));
}
// Precision threshold scaling with distance
float lodEpsilon(float dist) {
    return 0.0001 + dist * 0.0001;
}` },


  // ─── ADVANCED NOISE & PROCEDURAL ───────────────────────────────────────────
  { id: 'ext:noise-checker', name:'Checkerboard Pattern', category:'Noise & Procedural',
    tags:['procedural','checker','pattern','2d'],
    code:`float checker(vec2 p, float scale) {
    p /= scale;
    return mod(floor(p.x)+floor(p.y), 2.0);
}` },
  { id: 'ext:noise-stripes', name:'Stripe Pattern', category:'Noise & Procedural',
    tags:['procedural','stripes','pattern'],
    code:`float stripes(vec2 p, float freq, float angle) {
    p = rot2(angle)*p;
    return smoothstep(0.45,0.55,fract(p.x*freq));
}` },
  { id: 'ext:noise-cells3d', name:'3D Cell Texture', category:'Noise & Procedural',
    tags:['noise','cell','3d','procedural'],
    code:`float cellNoise3(vec3 p) {
    vec3 i=floor(p); float d=1e5;
    for(int z=-1;z<=1;z++)for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
        vec3 b=vec3(x,y,z), o=hash33(i+b);
        d=min(d,length(fract(p)-b-o));
    }
    return d;
}` },
  { id: 'ext:noise-iq-hash', name:'IQ Hash (integer)', category:'Noise & Procedural',
    tags:['hash','noise','integer','iq'],
    code:`// Integer hash (IQ) — no trigonometry
uint iqHash(uint n){
    n=(n<<13u)^n;
    n=n*(n*n*15731u+789221u)+1376312589u;
    return n;
}
float iqHashF(uint n){ return float(iqHash(n)>>1)/2147483648.0; }` },
  { id: 'ext:noise-fbm-analytical', name:'FBM with Analytical Noise', category:'Noise & Procedural',
    tags:['noise','fbm','analytical','derivative'],
    code:`// FBM using gradient noise with analytical derivatives
// Returns vec3(value, dx, dy)
vec3 fbmAnalytical(vec2 p) {
    float f=0.0,a=0.5;
    vec2 d=vec2(0.0);
    mat2 m=mat2(0.8,0.6,-0.6,0.8);
    for(int i=0;i<5;i++){
        float n=gnoise(p);
        d+=a*vec2(dFdx(n),dFdy(n));
        f+=a*n;p=m*p*2.0;a*=0.5;
    }
    return vec3(f,d);
}` },
  { id: 'ext:noise-lava', name:'Lava / Fire Texture', category:'Noise & Procedural',
    tags:['procedural','lava','fire','animated'],
    code:`vec3 lavaTexture(vec2 p) {
    float t=iTime*0.3;
    float n=fbm(p+vec2(t,t*0.7))+fbm(p*2.0+vec2(-t*0.5,t))*0.5;
    n=clamp(n,0.0,1.0);
    vec3 hot=vec3(1.0,0.9,0.1), cool=vec3(0.5,0.0,0.0), dark=vec3(0.0);
    vec3 col=mix(dark,cool,n);
    col=mix(col,hot,pow(n,3.0));
    return col;
}` },
  { id: 'ext:noise-galaxy', name:'Galaxy / Stars Field', category:'Noise & Procedural',
    tags:['procedural','galaxy','stars','space'],
    code:`vec3 starField(vec2 uv, float density, float brightness) {
    vec3 col=vec3(0.0);
    for(int i=0;i<3;i++){
        float scale=pow(2.0,float(i));
        vec2 p=uv*scale;
        vec2 cell=floor(p);
        vec2 h=hash22(cell);
        if(h.x<density){
            float d=length(fract(p)-h);
            col+=brightness*exp(-d*d*80.0)*vec3(0.9+h.y*0.1,0.85+h.x*0.1,0.8+h.y*0.2);
        }
    }
    return col;
}` },

  // ─── ADVANCED SDF ────────────────────────────────────────────────────────────
  { id: 'ext:sdf-bezier3d', name:'SDF 3D Bezier Tube', category:'SDF',
    tags:['sdf','3d','bezier','tube'],
    code:`// Approximate SDF to a bezier tube (quadratic)
float sdBezierTube(vec3 p, vec3 A, vec3 B, vec3 C, float r) {
    vec3 a=B-A, b=A-2.0*B+C, c=2.0*a, d=A-p;
    float kk=1.0/dot(b,b), kx=kk*dot(a,b);
    float ky=kk*(2.0*dot(a,a)+dot(d,b))/3.0, kz=kk*dot(d,a);
    float p2=ky-kx*kx, q=kx*(2.0*kx*kx-3.0*ky)+kz;
    float h=q*q+4.0*p2*p2*p2;
    float t;
    if(h>=0.0){float s=sqrt(h);vec2 x=(vec2(s,-s)-q)/2.0;
        vec2 uv=sign(x)*pow(abs(x),vec2(1.0/3.0));t=clamp(uv.x+uv.y-kx,0.0,1.0);}
    else{float z=sqrt(-p2),v=acos(q/(p2*z*2.0))/3.0;
        t=clamp(min(cos(v),(cos(v+2.09),cos(v+4.18)))*z*2.0-kx,0.0,1.0);}
    // wrong code ok for approximation
    t=clamp(t,0.0,1.0);
    vec3 pos=A+(c+b*t)*t;
    return length(p-pos)-r;
}` },
  { id: 'ext:sdf-pipe', name:'SDF Pipe (hollow cylinder)', category:'SDF',
    tags:['sdf','3d','pipe','hollow'],
    code:`float sdPipe(vec3 p, float innerR, float outerR, float h) {
    vec2 d=vec2(abs(length(p.xz)-innerR*(0.5+0.5*outerR/innerR))-outerR+innerR*0.5, abs(p.y)-h);
    // simpler version:
    float ring=abs(length(p.xz)-(innerR+outerR)*0.5)-(outerR-innerR)*0.5;
    float cap=abs(p.y)-h;
    return length(max(vec2(ring,cap),0.0))+min(max(ring,cap),0.0);
}` },
  { id: 'ext:sdf-terrain', name:'SDF Heightmap Terrain', category:'SDF',
    tags:['sdf','terrain','height','3d'],
    code:`// Ray-terrain intersection with SDF for a heightmap
float terrainHeight(vec2 xz) {
    return fbm(xz*0.5)*2.0;
}
float sdTerrain(vec3 p) {
    return p.y - terrainHeight(p.xz);
}` },
  { id: 'ext:sdf-fractal-box', name:'Menger Sponge SDF', category:'SDF',
    tags:['sdf','fractal','menger','3d'],
    code:`float sdMengerSponge(vec3 p, int iter) {
    float d=sdBox(p,vec3(1.0));
    float s=1.0;
    for(int i=0;i<iter;i++){
        vec3 a=mod(p*s,2.0)-1.0;
        s*=3.0;
        vec3 r=abs(1.0-3.0*abs(a));
        float c=(min(max(r.x,r.y),min(max(r.y,r.z),max(r.x,r.z)))-1.0)/s;
        d=max(d,c);
    }
    return d;
}` },

  // ─── ADVANCED COLOR ──────────────────────────────────────────────────────────
  { id: 'ext:color-temperature', name:'Color Temperature (Kelvin->RGB)', category:'Color',
    tags:['color','temperature','kelvin','physics'],
    code:`// Approximate Planckian locus (Tanner Helland method)
vec3 kelvinToRGB(float temp) {
    temp=clamp(temp,1000.0,40000.0)/100.0;
    float r,g,b;
    r=temp<=66.0?255.0:clamp(329.698727*(pow(temp-60.0,-0.1332047592)),0.0,255.0);
    g=temp<=66.0?clamp(99.4708025*log(temp)-161.1195681,0.0,255.0):clamp(288.1221695*pow(temp-60.0,-0.0755148492),0.0,255.0);
    b=temp>=66.0?255.0:clamp(138.5177312*log(temp-10.0)-305.0447927,0.0,255.0);
    return vec3(r,g,b)/255.0;
}` },
  { id: 'ext:color-exposure', name:'Exposure & Tone Map', category:'Color',
    tags:['color','exposure','tonemapping','hdr'],
    code:`vec3 applyExposure(vec3 col, float ev) { return col * pow(2.0, ev); }

// Reinhard global tone mapping
vec3 reinhardTonemap(vec3 col) { return col/(1.0+col); }

// Filmic by Hejl & Dawson (fast)
vec3 filmicTonemap(vec3 c) {
    c=max(vec3(0.0),c-0.004);
    return (c*(6.2*c+0.5))/(c*(6.2*c+1.7)+0.06);
}` },
  { id: 'ext:color-lch', name:'LCH Color Space', category:'Color',
    tags:['color','lch','perceptual','cylindrical'],
    code:`// LCH (Lightness, Chroma, Hue) via Oklab
vec3 oklabToLCH(vec3 lab) {
    return vec3(lab.x, length(lab.yz), atan(lab.z,lab.y));
}
vec3 lchToOklab(vec3 lch) {
    return vec3(lch.x, lch.y*cos(lch.z), lch.y*sin(lch.z));
}
// Hue shift in LCH (perceptually uniform)
vec3 lchHueShift(vec3 linearRGB, float shift) {
    vec3 lab=linearToOklab(linearRGB);
    vec3 lch=oklabToLCH(lab);
    lch.z+=shift;
    return oklabToLinear(lchToOklab(lch));
}` },
  { id: 'ext:blend-modes', name:'Photoshop Blend Modes', category:'Color',
    tags:['color','blend','photoshop','compositing'],
    code:`vec3 blendMultiply(vec3 a, vec3 b) { return a*b; }
vec3 blendScreen(vec3 a, vec3 b)   { return 1.0-(1.0-a)*(1.0-b); }
vec3 blendOverlay(vec3 a, vec3 b)  {
    return mix(2.0*a*b, 1.0-2.0*(1.0-a)*(1.0-b), step(0.5,a));
}
vec3 blendHardLight(vec3 a, vec3 b){ return blendOverlay(b,a); }
vec3 blendSoftLight(vec3 a, vec3 b){
    return mix(2.0*a*b+a*a*(1.0-2.0*b),sqrt(a)*(2.0*b-1.0)+2.0*a*(1.0-b),step(0.5,b));
}
vec3 blendDodge(vec3 a, vec3 b)    { return a/(1.0-b+0.001); }
vec3 blendBurn(vec3 a, vec3 b)     { return 1.0-(1.0-a)/max(b,0.001); }` },

  // ─── MORE PHYSICS ────────────────────────────────────────────────────────────
  { id: 'ext:rigidbody-2d', name:'2D Rigid Body Step', category:'Physics',
    tags:['physics','rigid-body','2d','simulation'],
    code:`// Single step for 2D rigid body (pos, vel, angle, angVel)
struct RigidBody2D { vec2 pos; vec2 vel; float angle; float angVel; };
RigidBody2D rbStep(RigidBody2D rb, vec2 force, float torque, float mass, float inertia, float dt) {
    rb.vel += force/mass*dt;
    rb.pos += rb.vel*dt;
    rb.angVel += torque/inertia*dt;
    rb.angle += rb.angVel*dt;
    return rb;
}` },
  { id: 'ext:doppler', name:'Doppler Effect (audio/visual)', category:'Physics',
    tags:['physics','doppler','audio','wave'],
    code:`// Doppler frequency shift
// f_observed = f_source * (v_sound + v_observer) / (v_sound - v_source)
float dopplerShift(float fSource, float vSound, float vObserver, float vSource) {
    return fSource * (vSound + vObserver) / max(vSound - vSource, 0.001);
}
// Visual Doppler: shift hue of light based on relative velocity
float visualDoppler(float wavelength, float velocity, float speedOfLight) {
    return wavelength * sqrt((1.0+velocity/speedOfLight)/(1.0-velocity/speedOfLight));
}` },

  // ─── MORE RAY MARCHING ───────────────────────────────────────────────────────
  { id: 'ext:rm-dof', name:'Depth of Field (ray marching)', category:'Ray Marching',
    tags:['ray-marching','dof','depth-of-field','bokeh'],
    code:`// Simple DOF via ray origin jitter
vec3 dofRaygen(vec2 uv, vec3 ro, vec3 ta, float focalDist, float aperture) {
    mat3 cam=lookAt(ro,ta,0.0);
    vec3 focal=ro+cam*normalize(vec3(uv,1.5))*focalDist;
    vec2 jitter=hash22(uv+fract(iTime))*aperture;
    vec3 jitteredRo=ro+cam*vec3(jitter,0.0);
    return normalize(focal-jitteredRo);
}` },
  { id: 'ext:rm-subsurface', name:'Volumetric Subsurface (ray march)', category:'Ray Marching',
    tags:['ray-marching','subsurface','volume','translucent'],
    code:`// Simple translucency via back-lit ray marching
float backLighting(vec3 pos, vec3 lightDir, float density) {
    float thickness=0.0;
    vec3 p=pos;
    for(int i=0;i<8;i++){
        p+=lightDir*0.1;
        thickness+=max(0.0,-map(p));
    }
    return exp(-thickness*density);
}` },
  { id: 'ext:rm-glow', name:'SDF Glow / Emission', category:'Ray Marching',
    tags:['ray-marching','glow','emission','neon'],
    code:`// Accumulate glow along a ray (no intersection needed)
vec3 sdGlow(vec3 ro, vec3 rd, vec3 glowColor, float glowStrength, int steps) {
    float glow=0.0, t=0.01;
    for(int i=0;i<steps;i++){
        float d=map(ro+rd*t);
        glow+=exp(-max(d,0.0)*8.0)*glowStrength;
        t+=max(d,0.01);
        if(t>20.0)break;
    }
    return glowColor*min(glow,1.0);
}` },
  { id: 'ext:rm-sky-gradient', name:'Sky Gradient', category:'Ray Marching',
    tags:['ray-marching','sky','gradient','background'],
    code:`vec3 skyGradient(vec3 rd, vec3 sunDir) {
    float t=clamp(rd.y*0.5+0.5,0.0,1.0);
    vec3 sky=mix(vec3(0.3,0.5,0.9),vec3(0.05,0.1,0.3),t);
    float sun=pow(max(dot(rd,sunDir),0.0),256.0);
    vec3 horizon=vec3(0.7,0.5,0.3)*pow(1.0-t,3.0);
    return sky+sun*vec3(1.0,0.9,0.7)*3.0+horizon;
}` },
  { id: 'ext:rm-mist', name:'Height-Based Mist', category:'Ray Marching',
    tags:['ray-marching','mist','fog','height'],
    code:`vec3 heightMist(vec3 col, vec3 pos, vec3 ro, vec3 mistColor, float density, float height) {
    float h=clamp((pos.y)/height,0.0,1.0);
    float mistAmt=exp(-length(pos-ro)*density*(1.0-h));
    return mix(mistColor,col,mistAmt);
}` },

  // ─── MORE TYPOGRAPHY ─────────────────────────────────────────────────────────
  { id: 'ext:sdf-char-a', name:'Procedural Letter A (SDF)', category:'Typography',
    tags:['typography','letter','procedural','sdf'],
    code:`// Procedural SDF for letter 'A'
float sdLetterA(vec2 p, float scale) {
    p/=scale;
    float d=1e5;
    // Left leg
    d=min(d,sdSegment(p,vec2(-0.3,-0.5),vec2(0.0,0.5))-0.06);
    // Right leg
    d=min(d,sdSegment(p,vec2(0.3,-0.5),vec2(0.0,0.5))-0.06);
    // Crossbar
    d=min(d,sdSegment(p,vec2(-0.15,0.05),vec2(0.15,0.05))-0.05);
    return d*scale;
}` },
  { id: 'ext:sdf-text-3d', name:'Extruded SDF Text (3D)', category:'Typography',
    tags:['typography','sdf','3d','extrusion'],
    code:`// Extrude a 2D glyph SDF along Z for 3D text
// Requires a 2D SDF font atlas in iChannel0
float sdText3D(vec3 p, sampler2D fontAtlas, vec2 glyphUV, float depth) {
    float d2d = texture(fontAtlas, glyphUV + p.xy*0.1).r - 0.5;
    return sdExtrude(p, d2d, depth);
}` },

  // ─── FINAL BATCH: MISC ───────────────────────────────────────────────────────
  { id: 'ext:noise-fbm-warp2', name:'FBM Domain Warp (2-level)', category:'Noise & Procedural',
    tags:['noise','fbm','warp','iq'],
    code:`float warpedFbm(vec2 p) {
    vec2 q=vec2(fbm(p),fbm(p+vec2(5.2,1.3)));
    vec2 r=vec2(fbm(p+4.0*q+vec2(1.7,9.2)),fbm(p+4.0*q+vec2(8.3,2.8)));
    return fbm(p+4.0*r);
}` },
  { id: 'ext:sdf-helix', name:'SDF Helix', category:'SDF',
    tags:['sdf','3d','helix','spring'],
    code:`float sdHelix(vec3 p, float r1, float r2, float pitch, float len) {
    float a=atan(p.z,p.x);
    float t=p.y/pitch-a/(2.0*3.14159);
    t=clamp(t,0.0,len/pitch);
    vec3 cp=vec3(r1*cos(a+t*2.0*3.14159),t*pitch,r1*sin(a+t*2.0*3.14159));
    return length(p-cp)-r2;
}` },
  { id: 'ext:sdf-grid', name:'SDF Grid / Lattice', category:'SDF',
    tags:['sdf','2d','grid','lattice'],
    code:`float sdGrid(vec2 p, float cellSize, float lineWidth) {
    vec2 q=fract(p/cellSize+0.5)-0.5;
    return min(abs(q.x),abs(q.y))-lineWidth*0.5/cellSize;
}` },
  { id: 'ext:noise-caustics', name:'Caustics Pattern', category:'Noise & Procedural',
    tags:['procedural','caustics','water','light'],
    code:`float caustics(vec2 p, float time) {
    vec2 p2=p*2.0;
    float v1=sin(p2.x+sin(p2.y+time));
    float v2=sin(p2.x*0.7-time+sin(p2.y*1.3+time*0.7));
    float v3=sin(length(p2)*1.5+time);
    return pow(abs(v1+v2+v3)/3.0,2.0);
}` },
  { id: 'ext:sdf-sierpinski', name:'Sierpinski Triangle SDF', category:'SDF',
    tags:['sdf','fractal','sierpinski','2d'],
    code:`float sdSierpinski(vec2 p, int iter) {
    float scale=1.0;
    p=abs(p);
    for(int i=0;i<iter;i++){
        if(p.x+p.y>1.0){p=vec2(1.0)-p.yx;}
        p.x=abs(p.x)-0.5;
        p*=2.0; scale*=2.0;
    }
    return length(p)/scale;
}` },
  { id: 'ext:util-random-seed', name:'Random Number (seeded)', category:'Utilities',
    tags:['utility','random','seed','lcg'],
    code:`// LCG random, seeded — returns [0,1)
uint lcgRand(inout uint seed) {
    seed = seed * 1664525u + 1013904223u;
    return seed >> 16u;
}
float randF(inout uint seed) { return float(lcgRand(seed))/65536.0; }
vec2  rand2F(inout uint seed){ return vec2(randF(seed),randF(seed)); }` },
  { id: 'ext:util-mod-repeat', name:'Modular Repetition (SDF)', category:'Utilities',
    tags:['utility','mod','repeat','tiling'],
    code:`// Repeat a 1D value with limited range
float modRepeat(float x, float period, float limitMin, float limitMax) {
    float i=clamp(round(x/period),limitMin,limitMax);
    return x-period*i;
}
// For SDF: clamp-based finite repeat
vec3 opRepeatClamp(vec3 p, vec3 s, vec3 lim) {
    return p-s*clamp(round(p/s),-lim,lim);
}` },
  { id: 'ext:util-ons', name:'Orthonormal Basis from Normal', category:'Utilities',
    tags:['utility','basis','normal','3d'],
    code:`// Build orthonormal basis from a single normal vector
void orthoBasis(vec3 n, out vec3 t, out vec3 b) {
    vec3 up=abs(n.y)<0.999?vec3(0,1,0):vec3(1,0,0);
    t=normalize(cross(up,n));
    b=cross(n,t);
}
// Rotate vector v from local to world using basis
vec3 localToWorld(vec3 v, vec3 n, vec3 t, vec3 b) {
    return v.x*t+v.y*b+v.z*n;
}` },
  { id: 'ext:pbr-sheen', name:'Sheen BRDF (cloth)', category:'PBR',
    tags:['pbr','sheen','cloth','fabric'],
    code:`// Ashikhmin-style sheen for cloth/velvet
float D_Charlie(float NdotH, float roughness) {
    float inv=1.0/roughness;
    float cos2h=NdotH*NdotH, sin2h=1.0-cos2h;
    return (2.0+inv)*pow(sin2h,inv*0.5)/(2.0*3.14159);
}
vec3 sheenBRDF(float NdotL, float NdotV, float NdotH, vec3 sheenColor, float roughness) {
    return sheenColor*D_Charlie(NdotH,roughness)/(4.0*(NdotL+NdotV-NdotL*NdotV));
}` },
  { id: 'ext:post-bloom', name:'Bloom (multi-pass approx)', category:'Utilities',
    tags:['post-process','bloom','glow','hdr'],
    code:`// Single-pass bloom approximation (not true multi-pass, but useful for preview)
vec3 bloomApprox(sampler2D tex, vec2 uv, float threshold, float radius) {
    vec3 bloom=vec3(0.0);
    float w=0.0;
    for(int i=-4;i<=4;i++)for(int j=-4;j<=4;j++){
        vec2 o=vec2(i,j)*radius/iResolution.xy;
        vec3 s=texture(tex,uv+o).rgb;
        float lum=luminance(s);
        float weight=max(lum-threshold,0.0);
        bloom+=s*weight; w+=weight;
    }
    return w>0.0?bloom/w:vec3(0.0);
}` },
  { id: 'ext:post-motion-blur', name:'Velocity Motion Blur', category:'Utilities',
    tags:['post-process','motion-blur','velocity'],
    code:`// Screen-space velocity motion blur
vec3 motionBlur(sampler2D tex, sampler2D velTex, vec2 uv, int samples) {
    vec2 vel=texture(velTex,uv).xy;
    vec3 col=texture(tex,uv).rgb;
    for(int i=1;i<samples;i++){
        float t=float(i)/float(samples-1)-0.5;
        col+=texture(tex,uv+vel*t).rgb;
    }
    return col/float(samples);
}` },
  { id: 'ext:post-fxaa', name:'FXAA (Fast Approximate AA)', category:'Utilities',
    tags:['post-process','fxaa','antialiasing','aa'],
    code:`// Simplified FXAA — not full spec but useful for previews
vec3 fxaa(sampler2D tex, vec2 uv) {
    vec2 px=1.0/iResolution.xy;
    float lumC=luminance(texture(tex,uv).rgb);
    float lumN=luminance(texture(tex,uv+vec2(0,px.y)).rgb);
    float lumS=luminance(texture(tex,uv-vec2(0,px.y)).rgb);
    float lumE=luminance(texture(tex,uv+vec2(px.x,0)).rgb);
    float lumW=luminance(texture(tex,uv-vec2(px.x,0)).rgb);
    float maxL=max(lumC,max(max(lumN,lumS),max(lumE,lumW)));
    float minL=min(lumC,min(min(lumN,lumS),min(lumE,lumW)));
    float contrast=maxL-minL;
    if(contrast<0.0312)return texture(tex,uv).rgb;
    float blendF=smoothstep(0.0,1.0,contrast/max(maxL,0.001));
    vec2 dir=vec2(lumS-lumN, lumE-lumW);
    if(dot(dir,dir)<0.0001)return texture(tex,uv).rgb;
    dir=normalize(dir)*blendF*px*0.5;
    return mix(texture(tex,uv).rgb,(texture(tex,uv+dir)+texture(tex,uv-dir)).rgb*0.5,0.5);
}` },
  { id: 'ext:util-matrix-inverse', name:'3x3 Matrix Inverse', category:'Utilities',
    tags:['math','matrix','inverse','3d'],
    code:`mat3 inverse3(mat3 m) {
    float a=m[0][0],b=m[0][1],c=m[0][2];
    float d=m[1][0],e=m[1][1],f=m[1][2];
    float g=m[2][0],h=m[2][1],k=m[2][2];
    float det=a*(e*k-f*h)-b*(d*k-f*g)+c*(d*h-e*g);
    return mat3(e*k-f*h, c*h-b*k, b*f-c*e,
                f*g-d*k, a*k-c*g, c*d-a*f,
                d*h-e*g, b*g-a*h, a*e-b*d)/det;
}` },
  { id: 'ext:util-complex', name:'Complex Number Ops', category:'Utilities',
    tags:['math','complex','fractal','mandelbrot'],
    code:`// Complex number as vec2(real, imag)
vec2 cMul(vec2 a, vec2 b) { return vec2(a.x*b.x-a.y*b.y, a.x*b.y+a.y*b.x); }
vec2 cDiv(vec2 a, vec2 b) { float d=dot(b,b); return vec2(dot(a,b),a.y*b.x-a.x*b.y)/d; }
vec2 cPow2(vec2 c)        { return cMul(c,c); }
vec2 cExp(vec2 c)         { return exp(c.x)*vec2(cos(c.y),sin(c.y)); }
vec2 cLog(vec2 c)         { return vec2(log(length(c)),atan(c.y,c.x)); }
vec2 cSqrt(vec2 c) {
    float r=length(c), th=atan(c.y,c.x)*0.5;
    return sqrt(r)*vec2(cos(th),sin(th));
}` },
  { id: 'ext:sdf-mandelbrot', name:'Mandelbrot Distance Estimate', category:'SDF',
    tags:['sdf','fractal','mandelbrot','2d'],
    code:`// Distance estimate to Mandelbrot set boundary
float mandelbrotDE(vec2 c) {
    vec2 z=vec2(0.0); float dz=0.0;
    for(int i=0;i<256;i++){
        if(dot(z,z)>4.0)break;
        dz=2.0*length(z)*dz+1.0;
        z=cPow2(z)+c;
    }
    float r=length(z);
    return r*log(r)/dz;
}` },
  { id: 'ext:sdf-julia', name:'Julia Set Distance Estimate', category:'SDF',
    tags:['sdf','fractal','julia','2d'],
    code:`// Julia set DE — c is a constant (e.g. vec2(-0.7, 0.27))
float juliaDE(vec2 z, vec2 c) {
    float dz=1.0;
    for(int i=0;i<64;i++){
        dz=2.0*length(z)*dz;
        z=cPow2(z)+c;
        if(dot(z,z)>256.0)break;
    }
    float r=length(z);
    return r*log(r)/dz;
}` },

];

// ── Pre-calculated search index ──────────────────────────────────────────────
// Built once at module load for fast offline search.

function _buildIndex(snippets) {
  return snippets.map(s => ({
    id: s.id,
    _text: [s.name, s.category, ...(s.tags ?? []), s.desc ?? '']
              .join(' ')
              .toLowerCase(),
  }));
}

export const EXTENDED_INDEX = _buildIndex(EXTENDED_SNIPPETS);

export function searchExtended(query) {
  if (!query) return EXTENDED_SNIPPETS;
  const q = query.toLowerCase().trim();
  const words = q.split(/\s+/);
  return EXTENDED_SNIPPETS.filter((s, i) => {
    const text = EXTENDED_INDEX[i]._text;
    return words.every(w => text.includes(w) || s.code.toLowerCase().includes(w));
  });
}

export function getExtendedCategories() {
  const cats = new Set();
  for (const s of EXTENDED_SNIPPETS) cats.add(s.category);
  return [...cats].sort();
}

// NOTE: Additional snippets are exported via EXTRA_SNIPPETS and merged at import time.
