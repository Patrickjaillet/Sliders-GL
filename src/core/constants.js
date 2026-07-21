// Pure GLSL constants
import { state } from './state.js';
import { toast } from '../io/actions.js';


const EXAMPLE = `// ─── Tunnel Vortex — Z-GL Shadertoy ───────────────────────────────────────────
// Toutes les constantes sont exposées comme sliders dans le panneau de contrôle.
// Glissez, modifiez, et annulez avec Ctrl+Z / Ctrl+Y.

// ── Caméra ────────────────────────────────────────────────────────────────────
#define CAM_OSCILLATION  2.5    // @range(0.0, 8.0)   @step(0.1)  @group(Caméra) @label("Amplitude oscillation Z")
#define CAM_SPEED        0.5    // @range(0.0, 3.0)   @step(0.05) @group(Caméra) @label("Vitesse oscillation Z")

// ── Rendu ─────────────────────────────────────────────────────────────────────
#define MAX_STEPS        48.0   // @range(8.0, 128.0) @step(1.0)  @group(Rendu)  @label("Raymarch steps")
#define GLOW_FALLOFF     700.0  // @range(50.0, 2000.0) @step(10.0) @group(Rendu) @label("Glow falloff (exp)")
#define GLOW_STRENGTH    0.09   // @range(0.01, 0.5)  @step(0.005) @group(Rendu) @label("Glow intensity")
#define MIN_STEP         0.003  // @range(0.0001, 0.02) @step(0.0005) @group(Rendu) @label("Minimum SDF step")

// ── Tunnel ────────────────────────────────────────────────────────────────────
#define TUNNEL_RADIUS    0.4    // @range(0.05, 2.0)  @step(0.01) @group(Tunnel) @label("Tunnel radius")
#define TUNNEL_THICKNESS 0.04   // @range(0.005, 0.3) @step(0.005) @group(Tunnel) @label("Wall thickness")
#define TUNNEL_Y_OFFSET  1.2    // @range(0.0, 3.0)   @step(0.05) @group(Tunnel) @label("Y offset (centering)")
#define TUNNEL_SEGMENTS  1.0    // @range(0.5, 8.0)   @step(0.5)  @group(Tunnel) @label("Angular segments")
#define ATAN_SCALE       3.183  // @range(1.0, 8.0)   @step(0.01) @group(Tunnel) @label("Atan scale (2/π ≈ 3.183)")

// ── Rotation ──────────────────────────────────────────────────────────────────
#define ROT_Z_FREQ       0.2    // @range(0.0, 2.0)   @step(0.01) @group(Rotation) @label("Rotation frequency / Z")
#define ROT_SPEED        0.5    // @range(0.0, 3.0)   @step(0.05) @group(Rotation) @label("Temporal rotation speed")

// ── Bruit / Texture ───────────────────────────────────────────────────────────
#define NOISE_FREQ_X     19.5   // @range(1.0, 60.0)  @step(0.5)  @group(Bruit)  @label("Noise frequency X")
#define NOISE_FREQ_Y     19.2   // @range(1.0, 60.0)  @step(0.5)  @group(Bruit)  @label("Noise frequency Y")
#define NOISE_FREQ_Z     18.8   // @range(1.0, 60.0)  @step(0.5)  @group(Bruit)  @label("Noise frequency Z")
#define NOISE_SCALE      343.0  // @range(10.0, 2000.0) @step(5.0) @group(Bruit) @label("Noise divisor (density)")

// ── Couleur ───────────────────────────────────────────────────────────────────
#define COLOR_PHASE_G    1.0    // @range(0.0, 6.28)  @step(0.05) @group(Couleur) @label("Green color phase")
#define COLOR_PHASE_B    1.9    // @range(0.0, 6.28)  @step(0.05) @group(Couleur) @label("Blue color phase")

// ─────────────────────────────────────────────────────────────────────────────

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec3 p, q;
    vec2 r = iResolution.xy;
    float t = iTime;
    vec4 o = vec4(0.0);

    // Mouvement de caméra : oscillation sinusoïdale sur l'axe Z
    float camZ = sin(t * CAM_SPEED) * CAM_OSCILLATION;

    for (float i = 0.0, g = 0.0, e = 0.0; i++ < MAX_STEPS; ) {

        // Reconstruction du rayon dans l'espace vue
        p = vec3((fragCoord - 0.5 * r) / r.y * g, g - 0.5);
        p.z += camZ;

        // Rotation du tunnel autour de Z en fonction de la profondeur et du temps
        float angle = p.z * ROT_Z_FREQ - t * ROT_SPEED;
        float c = cos(angle), s = sin(angle);
        p.xy *= mat2(c, -s, s, c);

        // Passage en coordonnées cylindriques + répétition angulaire
        float m = TUNNEL_SEGMENTS;
        p.xy = vec2(atan(p.x, p.y) * ATAN_SCALE, length(p.xy));
        p.x  = mod(p.x, m) - 0.5 * m;
        p.y -= TUNNEL_Y_OFFSET;

        // Bruit multiplicatif haute fréquence
        float noise = sin(p.x * NOISE_FREQ_X)
                    * cos(p.y * NOISE_FREQ_Y)
                    * sin(p.z * NOISE_FREQ_Z);

        // Distance signée : tore aplati + modulation bruit
        e = max(
            abs(length(p.xy) - TUNNEL_RADIUS) - TUNNEL_THICKNESS,
            noise / NOISE_SCALE
        ) + MIN_STEP;

        g += e;

        // Accumulation de la lueur volumétrique
        o += exp(-e * GLOW_FALLOFF) * GLOW_STRENGTH
           * vec4(abs(sin(p.z + vec3(0.0, COLOR_PHASE_G, COLOR_PHASE_B))), 1.0);
    }

    fragColor = vec4(o.rgb, 1.0);
}`;


const SNIPPETS = {
  mainImage: `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    float t = iTime;
    
    vec3 col = vec3(0.0);
    // --- your code here ---
    
    fragColor = vec4(col, 1.0);
}`,
  sdfSphere: `// Signed distance to a sphere
float sdSphere(vec3 p, float r) {
    return length(p) - r;
}`,
  rotate2D: `mat2 rotate2D(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
}`,
  palette: `// Cosine palette — see iquilezles.org/articles/palettes
vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
    return a + b * cos(6.28318 * (c * t + d));
}
// Example: palette(t, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.33, 0.67))`,
  fbm: `float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), f.x),
               mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
}
float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 6; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
    return v;
}`,
  hsv2rgb: `vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}`,
  rayMarch: `#define MAX_STEPS 100
#define MAX_DIST  100.0
#define SURF_DIST 0.001

float map(vec3 p) {
    return length(p) - 1.0; // replace with your SDF
}

float rayMarch(vec3 ro, vec3 rd) {
    float d = 0.0;
    for (int i = 0; i < MAX_STEPS; i++) {
        vec3 p = ro + rd * d;
        float h = map(p);
        if (h < SURF_DIST || d > MAX_DIST) break;
        d += h;
    }
    return d;
}

vec3 getNormal(vec3 p) {
    vec2 e = vec2(0.001, 0.0);
    return normalize(map(p) - vec3(map(p-e.xyy), map(p-e.yxy), map(p-e.yyx)));
}`,
  raymarchCamera: `// ── Camera (perspective raymarching) ─────────────────────────────
// @group(Caméra) @range(1.0, 5.0)  @label("Distance caméra")
#define CAM_DIST 3.0
// @group(Caméra) @range(5.0, 170.0) @label("FOV degrees")
#define CAM_FOV  60.0

// In mainImage():
//   vec3 ro = vec3(0.0, 0.0, CAM_DIST);
//   vec2 _uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
//   float _fovT = tan(radians(CAM_FOV) * 0.5);
//   vec3 rd = normalize(vec3(_uv * _fovT, -1.0));
//   float d = rayMarch(ro, rd);
`
};

function _hoistSnippetsMenu() {
  const menu = document.getElementById('snippetsMenu');
  if (!menu || menu.parentElement === document.body) return menu;
  document.body.appendChild(menu);
  return menu;
}

function toggleSnippets(e) {
  e?.stopPropagation();

  const menu = _hoistSnippetsMenu();
  if (!menu) return;

  const btn = document.getElementById('snipBtn');
  const isOpen = menu.classList.contains('open');
  if (isOpen) {
    menu.classList.remove('open');
    btn?.setAttribute('aria-expanded', 'false');
    return;
  }

  if (btn) {
    const rect = btn.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = (rect.bottom + 8) + 'px';
    menu.style.right = (window.innerWidth - rect.right) + 'px';
    menu.style.left = 'auto';
    menu.style.zIndex = '99999';
  }
  menu.classList.add('open');
  btn?.setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => {
    menu.querySelector('.snip-item')?.focus();
  });
}
document.addEventListener('click', (evt) => {
  const menu = document.getElementById('snippetsMenu');
  if (!menu) return;
  const target = evt.target instanceof Element ? evt.target : null;
  if (target?.closest('#snipBtn') || target?.closest('#snippetsMenu')) return;
  menu.classList.remove('open');
  document.getElementById('snipBtn')?.setAttribute('aria-expanded', 'false');
});

function insertSnippet(key) {
  if (!state.editor) {
    console.warn('insertSnippet called before editor is ready');
    return;
  }
  document.getElementById('snippetsMenu')?.classList.remove('open');
  const code = SNIPPETS[key];
  const sel = state.editor.getSelection();
  state.editor.executeEdits('snippet', [{
    range: sel,
    text: '\n' + code + '\n',
    forceMoveMarkers: true
  }]);
  state.editor.focus();
  toast('Snippet inserted', 'ok');
}

// ── Caméra helpers ─────────────────────────────────────────────────────────────

/**
 * Retourne tous les #define annotés @group(Caméra) dans le shader courant.
 * @returns {{ key: string, value: number, label?: string, range?: [number,number] }[]}
 */
export function getCameraGroupDefines() {
  if (!state.editor) return [];
  const code = state.editor.getValue();
  const lineRe = /#define\s+(\w+)\s+([-+]?\d*\.?\d+)([^\n]*)/gm;
  const results = [];
  let m;
  while ((m = lineRe.exec(code)) !== null) {
    const comment = m[3] || '';
    if (!/@group\((?:Cam[eé]ra?|Cam)\)/i.test(comment)) continue;
    const rangeM = /@range\(([-\d.]+)\s*,\s*([-\d.]+)\)/.exec(comment);
    const labelM = /@label\("?([^")]+)"?\)/.exec(comment);
    results.push({
      key:   m[1],
      value: parseFloat(m[2]),
      range: rangeM ? [parseFloat(rangeM[1]), parseFloat(rangeM[2])] : null,
      label: labelM ? labelM[1] : m[1],
    });
  }
  return results;
}

export { EXAMPLE, SNIPPETS, toggleSnippets, insertSnippet };
