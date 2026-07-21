/**
 * composer-templates.js — F-1.1 (Axe 1)
 *
 * Catalogue de ~20 blocs GLSL assemblables pour le Shader Composer.
 * Chaque bloc est une unité autonome (fonctions + fragment mainImage optionnel).
 *
 * Structure d'un bloc :
 *   id        — identifiant unique
 *   name      — nom affiché dans le wizard
 *   category  — domaine (Noise, SDF, Color, UV, Lighting, Animation, Template)
 *   domain    — domaine principal du shader ('2d'|'3d'|'post'|'audio'|'fractal')
 *   tags      — mots-clés
 *   desc      — description courte
 *   thumb     — couleur CSS de vignette (utilisée dans le picker live)
 *   uniforms  — uniforms avec annotations @range générées automatiquement
 *   helpers   — fonctions auxiliaires GLSL (insérées avant mainImage)
 *   fragment  — corps de la fonction mainImage (sans prototype)
 *   provides  — noms de fonctions déclarées dans helpers (pour éviter les doublons)
 */

export const COMPOSER_BLOCKS = [

  // ─── UV & Geometry ────────────────────────────────────────────────────────────
  {
    id: 'uv-basic',
    name: 'Basic UV',
    category: 'UV',
    domain: '2d',
    tags: ['uv', 'setup', 'base'],
    desc: 'Centered normalized UVs, aspect ratio preserved.',
    thumb: '#1a2a3a',
    uniforms: [],
    helpers: '',
    provides: [],
    fragment: `
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    float t = iTime;
    vec3 col = vec3(0.0);`,
  },

  {
    id: 'uv-polar',
    name: 'Polar UV',
    category: 'UV',
    domain: '2d',
    tags: ['uv', 'polar', 'radial'],
    desc: 'Polar coordinates (r, angle) from center.',
    thumb: '#1a1a3a',
    uniforms: [],
    helpers: '',
    provides: [],
    fragment: `
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    float t = iTime;
    float r = length(uv);
    float a = atan(uv.y, uv.x);
    vec3 col = vec3(0.0);`,
  },

  // ─── Noise & Procedural ───────────────────────────────────────────────────────
  {
    id: 'noise-fbm',
    name: 'fBm Noise',
    category: 'Noise',
    domain: '2d',
    tags: ['noise', 'fbm', 'procedural', 'terrain'],
    desc: 'Fractal Brownian Motion with 6 octaves.',
    thumb: '#2a1a0a',
    uniforms: [
      { name: 'uNoiseScale', type: 'float', min: 0.5, max: 8.0, default: 3.0, label: 'Noise scale' },
      { name: 'uNoiseSpeed', type: 'float', min: 0.0, max: 2.0, default: 0.1, label: 'Drift speed' },
    ],
    provides: ['hash', 'noise2', 'fbm'],
    helpers: `float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), f.x),
               mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
}
float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 6; i++) { v += a * noise2(p); p *= 2.0; a *= 0.5; }
    return v;
}`,
    fragment: `
    vec2 uv = fragCoord / iResolution.xy;
    uv.x *= iResolution.x / iResolution.y;
    float t = iTime;
    float n = fbm(uv * uNoiseScale + vec2(t * uNoiseSpeed, 0.0));
    vec3 col = mix(vec3(0.1, 0.05, 0.2), vec3(0.9, 0.6, 0.2), n);`,
  },

  {
    id: 'noise-voronoi',
    name: 'Voronoi',
    category: 'Noise',
    domain: '2d',
    tags: ['voronoi', 'cellular', 'noise'],
    desc: 'Animated Voronoi cellular noise.',
    thumb: '#0a2a1a',
    uniforms: [
      { name: 'uVorScale', type: 'float', min: 1.0, max: 10.0, default: 4.0, label: 'Scale' },
      { name: 'uVorSpeed', type: 'float', min: 0.0, max: 3.0, default: 0.6, label: 'Speed' },
    ],
    provides: ['hash2', 'voronoi'],
    helpers: `vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453);
}
float voronoi(vec2 uv, float t) {
    vec2 i = floor(uv), f = fract(uv);
    float minD = 8.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
        vec2 n = vec2(float(x), float(y));
        vec2 p = hash2(i + n);
        p += 0.4 * sin(t + 6.28318 * hash2(i + n + 0.5));
        minD = min(minD, length(n + p - f));
    }
    return minD;
}`,
    fragment: `
    vec2 uv = fragCoord / iResolution.xy;
    uv.x *= iResolution.x / iResolution.y;
    float t = iTime;
    float v = voronoi(uv * uVorScale, t * uVorSpeed);
    vec3 col = vec3(v * 0.8);`,
  },

  // ─── Color ────────────────────────────────────────────────────────────────────
  {
    id: 'color-iq-palette',
    name: 'Palette IQ',
    category: 'Color',
    domain: '2d',
    tags: ['color', 'palette', 'iq', 'cosine'],
    desc: 'Palette cosinus Inigo Quilez — a + b·cos(2π(ct+d)).',
    thumb: '#2a0a2a',
    uniforms: [
      { name: 'uPalShift', type: 'float', min: 0.0, max: 1.0, default: 0.0, label: 'Palette shift' },
      { name: 'uPalSpeed', type: 'float', min: 0.0, max: 2.0, default: 0.3, label: 'Palette speed' },
    ],
    provides: ['palette'],
    helpers: `vec3 palette(float t) {
    return 0.5 + 0.5 * cos(6.28318 * (t * vec3(1.0, 0.8, 0.6) + vec3(uPalShift, uPalShift + 0.33, uPalShift + 0.67)));
}`,
    fragment: `
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    float t = iTime;
    float d = length(uv);
    vec3 col = palette(d * 2.0 + t * uPalSpeed);
    col *= smoothstep(1.2, 0.0, d);`,
  },

  {
    id: 'color-hsv',
    name: 'HSV Conversion',
    category: 'Color',
    domain: '2d',
    tags: ['color', 'hsv', 'hsl'],
    desc: 'HSV→RGB conversion with saturation/brightness control.',
    thumb: '#1a1a2a',
    uniforms: [
      { name: 'uHueShift', type: 'float', min: 0.0, max: 1.0, default: 0.0, label: 'Hue shift' },
      { name: 'uSaturation', type: 'float', min: 0.0, max: 2.0, default: 1.0, label: 'Saturation' },
    ],
    provides: ['hsv2rgb'],
    helpers: `vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}`,
    fragment: `
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    float t = iTime;
    float h = atan(uv.y, uv.x) / 6.28318 + uHueShift + t * 0.1;
    float s = uSaturation * length(uv) * 2.0;
    float v = 1.0 - smoothstep(0.8, 1.0, length(uv));
    vec3 col = hsv2rgb(vec3(h, clamp(s, 0.0, 1.0), v));`,
  },

  // ─── SDF 3D ───────────────────────────────────────────────────────────────────
  {
    id: 'sdf-sphere',
    name: 'SDF Sphere',
    category: 'SDF',
    domain: '3d',
    tags: ['sdf', 'raymarching', '3d', 'sphere'],
    desc: 'Ray marching on an SDF sphere with Lambertian shading.',
    thumb: '#0a0a2a',
    uniforms: [
      { name: 'uRadius', type: 'float', min: 0.2, max: 2.0, default: 1.0, label: 'Radius' },
      { name: 'uRotSpeed', type: 'float', min: 0.0, max: 3.0, default: 0.5, label: 'Rotation' },
    ],
    provides: ['sdSphere', 'rmGetNormal', 'rmMap', 'rayMarch'],
    helpers: `#define RM_STEPS 80
#define RM_MAX   20.0
#define RM_SURF  0.001
float sdSphere(vec3 p, float r) { return length(p) - r; }
float rmMap(vec3 p) { return sdSphere(p, uRadius); }
vec3 rmGetNormal(vec3 p) {
    vec2 e = vec2(0.001, 0.0);
    return normalize(vec3(rmMap(p+e.xyy)-rmMap(p-e.xyy), rmMap(p+e.yxy)-rmMap(p-e.yxy), rmMap(p+e.yyx)-rmMap(p-e.yyx)));
}
float rayMarch(vec3 ro, vec3 rd) {
    float d = 0.0;
    for (int i = 0; i < RM_STEPS; i++) {
        float h = rmMap(ro + rd * d);
        if (h < RM_SURF || d > RM_MAX) break;
        d += h;
    }
    return d;
}`,
    fragment: `
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    float t = iTime;
    vec3 ro = vec3(0.0, 0.0, 3.0);
    vec3 rd = normalize(vec3(uv, -1.5));
    float d = rayMarch(ro, rd);
    vec3 col = vec3(0.02, 0.02, 0.05);
    if (d < RM_MAX) {
        vec3 p = ro + rd * d;
        vec3 n = rmGetNormal(p);
        vec3 light = normalize(vec3(cos(t * uRotSpeed), 1.5, sin(t * uRotSpeed) * 2.0 + 3.0));
        float diff = max(dot(n, light), 0.0);
        float spec = pow(max(dot(reflect(-light, n), -rd), 0.0), 32.0);
        col = vec3(0.2, 0.4, 0.8) * (0.1 + 0.9 * diff) + vec3(1.0) * spec * 0.5;
    }`,
  },

  {
    id: 'sdf-torus',
    name: 'SDF Torus',
    category: 'SDF',
    domain: '3d',
    tags: ['sdf', 'raymarching', '3d', 'torus'],
    desc: 'SDF torus with rotation and colored material.',
    thumb: '#1a0a2a',
    uniforms: [
      { name: 'uTorusR', type: 'float', min: 0.3, max: 1.5, default: 0.8, label: 'Major radius' },
      { name: 'uTorusr', type: 'float', min: 0.05, max: 0.5, default: 0.25, label: 'Minor radius' },
    ],
    provides: ['sdTorus', 'rmMap', 'rmGetNormal', 'rayMarch'],
    helpers: `#define RM_STEPS 80
#define RM_MAX   20.0
#define RM_SURF  0.001
float sdTorus(vec3 p, vec2 t) { vec2 q = vec2(length(p.xz)-t.x, p.y); return length(q)-t.y; }
float rmMap(vec3 p) {
    float c = cos(iTime * 0.5), s = sin(iTime * 0.5);
    p.xz = mat2(c, -s, s, c) * p.xz;
    return sdTorus(p, vec2(uTorusR, uTorusr));
}
vec3 rmGetNormal(vec3 p) {
    vec2 e = vec2(0.001, 0.0);
    return normalize(vec3(rmMap(p+e.xyy)-rmMap(p-e.xyy), rmMap(p+e.yxy)-rmMap(p-e.yxy), rmMap(p+e.yyx)-rmMap(p-e.yyx)));
}
float rayMarch(vec3 ro, vec3 rd) {
    float d = 0.0;
    for (int i = 0; i < RM_STEPS; i++) {
        float h = rmMap(ro + rd * d);
        if (h < RM_SURF || d > RM_MAX) break;
        d += h;
    }
    return d;
}`,
    fragment: `
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    float t = iTime;
    vec3 ro = vec3(0.0, 1.5, 3.0);
    vec3 rd = normalize(vec3(uv, -1.5));
    float d = rayMarch(ro, rd);
    vec3 col = vec3(0.02, 0.02, 0.05);
    if (d < RM_MAX) {
        vec3 p = ro + rd * d;
        vec3 n = rmGetNormal(p);
        vec3 light = normalize(vec3(2.0, 3.0, 4.0));
        float diff = max(dot(n, light), 0.0);
        float spec = pow(max(dot(reflect(-light, n), -rd), 0.0), 48.0);
        col = vec3(0.8, 0.3, 0.5) * (0.15 + 0.85 * diff) + vec3(1.0) * spec * 0.7;
    }`,
  },

  // ─── Lighting ─────────────────────────────────────────────────────────────────
  {
    id: 'lighting-phong',
    name: 'Phong Lighting',
    category: 'Lighting',
    domain: '3d',
    tags: ['lighting', 'phong', 'diffuse', 'specular'],
    desc: 'Phong shading model (ambient + diffuse + specular).',
    thumb: '#2a1a0a',
    uniforms: [
      { name: 'uAmbient', type: 'float', min: 0.0, max: 0.5, default: 0.1, label: 'Ambient' },
      { name: 'uShininess', type: 'float', min: 2.0, max: 128.0, default: 32.0, label: 'Shininess' },
    ],
    provides: ['phongLight'],
    helpers: `vec3 phongLight(vec3 p, vec3 n, vec3 rd, vec3 lightPos, vec3 baseCol) {
    vec3 l = normalize(lightPos - p);
    vec3 r = reflect(-l, n);
    float diff = max(dot(n, l), 0.0);
    float spec = pow(max(dot(-rd, r), 0.0), uShininess);
    float atten = 1.0 / (1.0 + 0.1 * dot(lightPos - p, lightPos - p));
    return baseCol * (uAmbient + diff * atten) + vec3(1.0) * spec * atten * 0.6;
}`,
    fragment: `
    // Utiliser phongLight(p, normal, rd, lightPos, baseColor) dans votre mainImage
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    float t = iTime;
    vec3 col = vec3(uAmbient);`,
  },

  // ─── Post-process ─────────────────────────────────────────────────────────────
  {
    id: 'post-vignette',
    name: 'Vignette',
    category: 'Post-process',
    domain: 'post',
    tags: ['post', 'vignette', 'darkening'],
    desc: 'Vignettage des bords de l\'image.',
    thumb: '#0a0a0a',
    uniforms: [
      { name: 'uVigStr', type: 'float', min: 0.0, max: 5.0, default: 2.0, label: 'Force vignette' },
      { name: 'uVigRad', type: 'float', min: 0.3, max: 1.5, default: 0.8, label: 'Rayon vignette' },
    ],
    provides: ['applyVignette'],
    helpers: `vec3 applyVignette(vec3 col, vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    float v = uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y);
    v = clamp(pow(v * 16.0, uVigStr) * uVigRad, 0.0, 1.0);
    return col * v;
}`,
    fragment: `
    vec2 uv = fragCoord / iResolution.xy;
    float t = iTime;
    vec3 col = vec3(0.5 + 0.5 * sin(uv.x * 6.28318 + t), 0.5, 0.5 + 0.5 * cos(uv.y * 6.28318 + t));
    col = applyVignette(col, fragCoord);`,
  },

  {
    id: 'post-chromatic',
    name: 'Chromatic Aberration',
    category: 'Post-process',
    domain: 'post',
    tags: ['post', 'chromatic', 'aberration', 'rgb'],
    desc: 'RGB shift simulating a low-quality lens.',
    thumb: '#1a0a1a',
    uniforms: [
      { name: 'uCAStr', type: 'float', min: 0.0, max: 0.03, default: 0.008, label: 'CA Intensity' },
    ],
    provides: ['applyChromaticAberration'],
    helpers: `vec3 applyChromaticAberration(vec2 uv, float strength) {
    vec2 dir = (uv - 0.5) * strength;
    float r = texture(iChannel0, uv + dir).r;
    float g = texture(iChannel0, uv).g;
    float b = texture(iChannel0, uv - dir).b;
    return vec3(r, g, b);
}`,
    fragment: `
    // Note: nécessite iChannel0 pour le post-process
    vec2 uv = fragCoord / iResolution.xy;
    float t = iTime;
    vec3 col = applyChromaticAberration(uv, uCAStr);`,
  },

  // ─── Animation ────────────────────────────────────────────────────────────────
  {
    id: 'anim-pingpong',
    name: 'Ping-pong',
    category: 'Animation',
    domain: '2d',
    tags: ['animation', 'pingpong', 'bounce', 'easing'],
    desc: 'Animation functions: ping-pong, easing, bounce.',
    thumb: '#0a1a2a',
    uniforms: [
      { name: 'uAnimSpeed', type: 'float', min: 0.1, max: 5.0, default: 1.0, label: 'Speed' },
    ],
    provides: ['pingpong', 'easeInOut', 'bounce'],
    helpers: `float pingpong(float t, float period) { return abs(fract(t / period) * 2.0 - 1.0); }
float easeInOut(float t) { return t * t * (3.0 - 2.0 * t); }
float bounce(float t) {
    t = fract(t);
    if (t < 0.36364) return 7.5625 * t * t;
    if (t < 0.72727) { t -= 0.54545; return 7.5625 * t * t + 0.75; }
    if (t < 0.90909) { t -= 0.81818; return 7.5625 * t * t + 0.9375; }
    t -= 0.95455; return 7.5625 * t * t + 0.984375;
}`,
    fragment: `
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    float t = iTime * uAnimSpeed;
    float pp = pingpong(t, 2.0);
    float ei = easeInOut(pp);
    vec3 col = vec3(ei, bounce(t * 0.5), pingpong(t * 1.3, 1.5));`,
  },

  // ─── Fractal ──────────────────────────────────────────────────────────────────
  {
    id: 'fractal-mandelbrot',
    name: 'Mandelbrot',
    category: 'Fractal',
    domain: 'fractal',
    tags: ['fractal', 'mandelbrot', 'complex', 'math'],
    desc: 'Mandelbrot set with smooth coloring.',
    thumb: '#0a0a1a',
    uniforms: [
      { name: 'uMBIter', type: 'float', min: 20.0, max: 500.0, default: 150.0, label: 'Iterations', step: 10 },
      { name: 'uMBZoom', type: 'float', min: 0.1, max: 4.0, default: 1.0, label: 'Zoom' },
      { name: 'uMBCX', type: 'float', min: -2.5, max: 0.5, default: -0.7, label: 'Center X' },
      { name: 'uMBCY', type: 'float', min: -1.5, max: 1.5, default: 0.0, label: 'Center Y' },
    ],
    provides: ['mandelbrot'],
    helpers: `float mandelbrot(vec2 c) {
    vec2 z = vec2(0.0);
    for (int i = 0; i < 500; i++) {
        if (float(i) >= uMBIter) return float(i);
        z = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y) + c;
        if (dot(z, z) > 4.0) return float(i) - log2(log2(dot(z, z))) + 4.0;
    }
    return uMBIter;
}`,
    fragment: `
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    float t = iTime;
    vec2 c = uv / uMBZoom + vec2(uMBCX, uMBCY);
    float m = mandelbrot(c);
    vec3 col = (m >= uMBIter)
        ? vec3(0.0)
        : 0.5 + 0.5 * cos(6.28318 * (m / uMBIter * vec3(1.0, 0.8, 0.6) + vec3(0.0, 0.15, 0.3)));`,
  },

  // ─── Audio ────────────────────────────────────────────────────────────────────
  {
    id: 'audio-spectrum',
    name: 'Audio spectrum',
    category: 'Audio',
    domain: 'audio',
    tags: ['audio', 'fft', 'spectrum', 'reactive'],
    desc: 'FFT spectrum visualization via iChannel0 (audio).',
    thumb: '#1a0a0a',
    uniforms: [
      { name: 'uAudioGain', type: 'float', min: 0.5, max: 5.0, default: 1.5, label: 'Audio gain' },
      { name: 'uBarCount', type: 'float', min: 16.0, max: 128.0, default: 64.0, label: 'Bars', step: 8 },
    ],
    provides: [],
    helpers: '',
    fragment: `
    // iChannel0 doit être réglé sur "Audio / Mic" dans le panneau Channels
    vec2 uv = fragCoord / iResolution.xy;
    float t = iTime;
    float barIdx = floor(uv.x * uBarCount) / uBarCount;
    float fft = texture(iChannel0, vec2(barIdx, 0.0)).r * uAudioGain;
    float bar = step(uv.y, fft);
    vec3 col = mix(vec3(0.0, 0.4, 1.0), vec3(1.0, 0.2, 0.0), uv.y / fft);
    col *= bar;
    col += vec3(0.05, 0.05, 0.1) * (1.0 - bar);`,
  },

  // ─── Pattern ──────────────────────────────────────────────────────────────────
  {
    id: 'pattern-plasma',
    name: 'Plasma',
    category: 'Pattern',
    domain: '2d',
    tags: ['plasma', 'sin', 'cos', 'wave'],
    desc: 'Classic plasma with nested sinusoids.',
    thumb: '#1a0a1a',
    uniforms: [
      { name: 'uPlasmaFreq', type: 'float', min: 1.0, max: 10.0, default: 4.0, label: 'Frequency' },
      { name: 'uPlasmaSpeed', type: 'float', min: 0.1, max: 3.0, default: 1.0, label: 'Speed' },
    ],
    provides: [],
    helpers: '',
    fragment: `
    vec2 uv = fragCoord / iResolution.xy;
    float t = iTime * uPlasmaSpeed;
    float v = sin(uv.x * uPlasmaFreq + t)
            + sin(uv.y * uPlasmaFreq + t * 0.7)
            + sin((uv.x + uv.y) * uPlasmaFreq * 0.7 + t * 1.3)
            + sin(length(uv - 0.5) * uPlasmaFreq * 2.0 - t * 1.5);
    vec3 col = 0.5 + 0.5 * cos(6.28318 * (v * 0.25 + vec3(0.0, 0.33, 0.67)));`,
  },

  {
    id: 'pattern-kaleidoscope',
    name: 'Kaleidoscope',
    category: 'Pattern',
    domain: '2d',
    tags: ['kaleidoscope', 'symmetry', 'radial'],
    desc: 'N-fold radial symmetry with polar UVs.',
    thumb: '#2a0a1a',
    uniforms: [
      { name: 'uKalSym', type: 'float', min: 2.0, max: 16.0, default: 6.0, label: 'Symmetries', step: 1 },
      { name: 'uKalZoom', type: 'float', min: 0.5, max: 5.0, default: 2.0, label: 'Zoom' },
      { name: 'uKalSpeed', type: 'float', min: 0.0, max: 2.0, default: 0.4, label: 'Speed' },
    ],
    provides: [],
    helpers: '',
    fragment: `
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    float t = iTime * uKalSpeed;
    float r = length(uv);
    float a = atan(uv.y, uv.x);
    float slice = 6.28318 / uKalSym;
    a = mod(a, slice);
    a = abs(a - slice * 0.5);
    uv = vec2(cos(a), sin(a)) * r * uKalZoom + vec2(t * 0.1);
    float d = length(fract(uv) - 0.5);
    vec3 col = 0.5 + 0.5 * cos(6.28318 * (d * 3.0 + r * 0.5 + t * 0.2));
    col *= smoothstep(0.5, 0.45, d);`,
  },

];

// ── Domaines pour l'étape 1 du wizard ────────────────────────────────────────
export const COMPOSER_DOMAINS = [
  { id: '2d',     label: '2D Geometric',      desc: 'Patterns, UV, plasma, voronoi', icon: '◈' },
  { id: '3d',     label: '3D SDF',            desc: 'Ray marching, SDF, lighting',   icon: '◉' },
  { id: 'post',   label: 'Post-process',       desc: 'Visual effects on render',      icon: '⬡' },
  { id: 'audio',  label: 'Audio-reactive',     desc: 'FFT spectrum, VU meter, Mic',   icon: '♪' },
  { id: 'fractal', label: 'Fractal',            desc: 'Mandelbrot, Julia, IFS',        icon: '❋' },
];
