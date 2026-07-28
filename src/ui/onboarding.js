/**
 * onboarding.js — Phase 7.4 / 13.2
 *
 * Phase 13.2 additions:
 *   13.2.1  Full user documentation (Getting Started, UI Reference, GLSL Uniform Reference,
 *            Channel Reference, Timeline Guide, MIDI Guide, Export Guide)
 *   13.2.2  Built-in searchable help system accessible via F1
 *            → Implemented in src/ui/help-center.js; initGLSLReferenceShortcut() now delegates
 *              to initHelpCenter() from that module.
 *
 * Phase 7.4 original features:
 *   7.4.1  Welcome screen on first launch
 *   7.4.2  Interactive tutorial (step-by-step overlay guide)
 *   7.4.3  Built-in GLSL reference panel (searchable, offline)
 *   7.4.4  Tooltip documentation (handled in tooltip.js — already [x])
 *   7.4.5  "What's New" changelog modal (shown once after update)
 */

import { toast } from '../io/actions.js';
import {
  initHelpCenter,
  openHelpCenter,
  closeHelpCenter,
  toggleHelpCenter,
} from './help-center.js';
// ─────────────────────────────────────────────────────────────────────────────
// Storage keys
// ─────────────────────────────────────────────────────────────────────────────

const KEY_FIRST_LAUNCH = 'sl_first_launch_done';

export function updateHelpDot() {
  /* no-op: what's new removed */
}

// ═════════════════════════════════════════════════════════════════════════════
// §7.4.1  WELCOME SCREEN
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Show the welcome screen if this is the first launch.
 * Checks localStorage; skipped on subsequent visits.
 */
export function maybeShowWelcomeScreen() {
  if (localStorage.getItem(KEY_FIRST_LAUNCH)) return;
  showWelcomeScreen();
}

export function showWelcomeScreen() {
  const existing = document.getElementById('welcome-overlay');
  if (existing) {
    existing.classList.add('open');
    return;
  }

  const overlay = document.createElement('div');
  overlay.id = 'welcome-overlay';
  overlay.className = 'modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'welcome-title');
  overlay.innerHTML = `
    <div class="modal" style="width:480px;max-width:95vw">
      <div class="modal-header">
        <h3 id="welcome-title" style="font-size:18px;background:linear-gradient(90deg,var(--spark),var(--spark-hot));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">
          Welcome to Sliders GL ✦
        </h3>
        <button class="modal-close" id="welcome-close" aria-label="Close welcome screen">
          <svg viewBox="0 0 14 14"><line x1="2" y1="2" x2="12" y2="12"/><line x1="12" y1="2" x2="2" y2="12"/></svg>
        </button>
      </div>
      <p style="font-size:13px;color:var(--t2);line-height:1.6">
        The world-class real-time shader editor for Windows. Write GLSL, see it live, export to anything.
      </p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:4px 0">
        <button class="welcome-card" id="wc-example" aria-label="Load example shader">
          <div class="welcome-card-icon">◈</div>
          <div class="welcome-card-title">Load Example</div>
          <div class="welcome-card-desc">Start with a built-in shader</div>
        </button>
        <button class="welcome-card" id="wc-tutorial" aria-label="Start interactive tutorial">
          <div class="welcome-card-icon">▶</div>
          <div class="welcome-card-title">Tutorial</div>
          <div class="welcome-card-desc">5-minute interactive guide</div>
        </button>
        <button class="welcome-card" id="wc-shortcuts" aria-label="View keyboard shortcuts">
          <div class="welcome-card-icon">⌨</div>
          <div class="welcome-card-title">Shortcuts</div>
          <div class="welcome-card-desc">Keyboard cheat sheet</div>
        </button>
      </div>
      <div style="border-top:1px solid var(--b1);padding-top:10px;font-size:10px;color:var(--t3);font-family:var(--font-mono)">
        <strong style="color:var(--t2)">Ctrl+E</strong> — export frame &nbsp;·&nbsp;
        <strong style="color:var(--t2)">Ctrl+Enter</strong> — apply shader &nbsp;·&nbsp;
        <strong style="color:var(--t2)">F</strong> — fullscreen &nbsp;·&nbsp;
        <strong style="color:var(--t2)">Ctrl+Z</strong> — undo slider &nbsp;·&nbsp;
        <strong style="color:var(--t2)">F1</strong> — Help Center
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px">
        <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--t2);cursor:pointer">
          <input type="checkbox" id="welcome-skip" style="accent-color:var(--ac)">
          Don't show again
        </label>
        <button class="modal-btn confirm" id="welcome-start">Get Started →</button>
      </div>
    </div>`;

  // Wire buttons
  overlay.querySelector('#welcome-close').addEventListener('click', _closeWelcome);
  overlay.querySelector('#welcome-start').addEventListener('click', _closeWelcome);

  overlay.querySelector('#wc-example').addEventListener('click', () => {
    _closeWelcome();
    document.querySelector('[data-action="loadExample"]')?.click();
  });

  overlay.querySelector('#wc-tutorial').addEventListener('click', () => {
    _closeWelcome();
    startTutorial();
  });

  overlay.querySelector('#wc-shortcuts').addEventListener('click', () => {
    _closeWelcome();
    showShortcutsPanel();
  });

  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') _closeWelcome();
  });

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));

  // Focus the Get Started button
  requestAnimationFrame(() => overlay.querySelector('#welcome-start')?.focus());
}

function _closeWelcome() {
  const overlay = document.getElementById('welcome-overlay');
  if (!overlay) return;

  const skip = overlay.querySelector('#welcome-skip')?.checked;
  if (skip) localStorage.setItem(KEY_FIRST_LAUNCH, '1');

  overlay.classList.remove('open');
  setTimeout(() => overlay.remove(), 300);
}

// ═════════════════════════════════════════════════════════════════════════════
// §7.4.2  INTERACTIVE TUTORIAL
// ═════════════════════════════════════════════════════════════════════════════

// §5.4 — Parcours guidé « spotlight » en 5 étapes : Canvas → Éditeur →
// Uniforms → Outils → Export. Sélecteurs validés contre le DOM courant.
const TUTORIAL_STEPS = [
  {
    target: '#cwrap',
    title: 'Live Viewport',
    body: 'Your shader renders here in real time. Right-click for screenshot, copy frame, and guides. Press H to toggle the HUD, Ctrl+scroll to zoom.',
    position: 'left',
  },
  {
    target: '#editorZone',
    title: 'The GLSL Editor',
    body: 'Write your shader here (Monaco / VS Code engine) with GLSL highlighting, autocomplete and error markers. Press Ctrl+Enter to compile.',
    position: 'right',
  },
  {
    target: '#sw, .panel',
    title: 'Uniforms & Sliders',
    body: 'Constants written with #define or const float become live sliders here. Drag to tweak; Shift+drag for fine control; double-click to reset.',
    position: 'right',
  },
  {
    target: '#exportBtn',
    title: 'Export & Share',
    body: 'Export as PNG, video (WebM/MP4/GIF) or code (standalone HTML, Three.js, p5.js). Ctrl+Shift+C copies the current frame to the clipboard.',
    position: 'bottom',
  },
];

let _tutorialStep = 0;
let _tutorialOverlay = null;
let _tutorialHighlight = null;

export function startTutorial() {
  _tutorialStep = 0;
  _createTutorialUI();
  _showTutorialStep(_tutorialStep);
  toast('Tutorial started — press Esc to exit', 'info');
}

function _createTutorialUI() {
  // Remove any existing
  _destroyTutorialUI();

  // Dark overlay with a "hole" for the target element
  _tutorialOverlay = document.createElement('div');
  _tutorialOverlay.id = 'tutorial-overlay';
  _tutorialOverlay.setAttribute('role', 'dialog');
  _tutorialOverlay.setAttribute('aria-modal', 'true');
  _tutorialOverlay.setAttribute('aria-label', 'Interactive tutorial');
  _tutorialOverlay.style.cssText = `
    position:fixed;inset:0;z-index:8000;pointer-events:none;
    background:rgba(2,6,12,0);transition:background 300ms ease;`;

  _tutorialHighlight = document.createElement('div');
  _tutorialHighlight.id = 'tutorial-highlight';
  _tutorialHighlight.style.cssText = `
    position:fixed;z-index:8001;border-radius:var(--radius-md);pointer-events:none;
    box-shadow:0 0 0 4000px rgba(2,6,12,0.72),0 0 0 3px var(--spark),0 0 20px rgba(var(--spark-rgb),0.4);
    transition:all 300ms var(--ease-snap);`;

  document.body.appendChild(_tutorialOverlay);
  document.body.appendChild(_tutorialHighlight);

  requestAnimationFrame(() => {
    _tutorialOverlay.style.background = 'transparent';
    _tutorialOverlay.style.pointerEvents = 'auto';
  });

  document.addEventListener('keydown', _tutorialKeyHandler);
}

function _tutorialKeyHandler(e) {
  if (e.key === 'Escape') {
    _destroyTutorialUI();
    return;
  }
  if (e.key === 'ArrowRight' || e.key === ' ') {
    e.preventDefault();
    _tutorialNext();
  }
  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    _tutorialPrev();
  }
}

function _showTutorialStep(idx) {
  const step = TUTORIAL_STEPS[idx];
  if (!step) {
    _destroyTutorialUI();
    return;
  }

  // Find target element
  const target = document.querySelector(step.target);

  // Position highlight
  if (target && _tutorialHighlight) {
    const rect = target.getBoundingClientRect();
    _tutorialHighlight.style.left = rect.left - 6 + 'px';
    _tutorialHighlight.style.top = rect.top - 6 + 'px';
    _tutorialHighlight.style.width = rect.width + 12 + 'px';
    _tutorialHighlight.style.height = rect.height + 12 + 'px';
    _tutorialHighlight.style.opacity = '1';
  } else if (_tutorialHighlight) {
    _tutorialHighlight.style.opacity = '0';
  }

  // Remove old tooltip
  document.getElementById('tutorial-tooltip')?.remove();

  // Create tooltip
  const tooltip = document.createElement('div');
  tooltip.id = 'tutorial-tooltip';
  tooltip.setAttribute('role', 'dialog');
  tooltip.setAttribute('tabindex', '-1');
  tooltip.style.cssText = `
    position:fixed;z-index:8002;width:280px;padding:16px;
    background:var(--bg-panel-alt);border:1px solid rgba(var(--spark-rgb),0.28);
    border-radius:14px;box-shadow:var(--shadow-panel);
    pointer-events:auto;`;

  tooltip.innerHTML = `
    <div style="font-size:10px;color:var(--t3);font-family:var(--font-mono);margin-bottom:4px">
      Step ${idx + 1} of ${TUTORIAL_STEPS.length}
    </div>
    <div style="font-size:14px;font-weight:600;color:var(--t1);margin-bottom:6px">${step.title}</div>
    <div style="font-size:12px;color:var(--t2);line-height:1.6;margin-bottom:12px">${step.body}</div>
    <div style="display:flex;justify-content:space-between;align-items:center">
      <button id="tut-prev" style="font-size:11px;padding:5px 10px;background:var(--bg3);border:1px solid var(--b1);border-radius:6px;color:var(--t2);cursor:pointer"
        ${idx === 0 ? 'disabled style="opacity:0.4"' : ''} aria-label="Previous tutorial step">← Back</button>
      <div style="display:flex;gap:4px" aria-label="Tutorial progress">
        ${TUTORIAL_STEPS.map((_, i) => `<div style="width:6px;height:6px;border-radius:50%;background:${i === idx ? 'var(--spark)' : 'var(--b2)'}" aria-hidden="true"></div>`).join('')}
      </div>
      <button id="tut-next" style="font-size:11px;padding:5px 14px;background:var(--spark);color:var(--text-inverse);border-radius:6px;font-weight:600;cursor:pointer" aria-label="${idx === TUTORIAL_STEPS.length - 1 ? 'Finish tutorial' : 'Next tutorial step'}">
        ${idx === TUTORIAL_STEPS.length - 1 ? 'Done ✓' : 'Next →'}
      </button>
    </div>
    <button id="tut-exit" style="position:absolute;top:10px;right:10px;font-size:10px;color:var(--t3);background:none;border:none;cursor:pointer" aria-label="Exit tutorial">✕</button>`;

  // Position tooltip near target
  if (target) {
    const rect = target.getBoundingClientRect();
    const vw = window.innerWidth,
      vh = window.innerHeight;

    let top, left;
    if (step.position === 'right' || rect.left > vw / 2) {
      left = Math.max(10, rect.left - 296);
      top = Math.min(vh - 200, Math.max(10, rect.top));
    } else if (step.position === 'left' || rect.right < vw / 2) {
      left = Math.min(vw - 296, rect.right + 12);
      top = Math.min(vh - 200, Math.max(10, rect.top));
    } else if (step.position === 'bottom') {
      left = Math.min(vw - 296, Math.max(10, rect.left + rect.width / 2 - 140));
      top = Math.min(vh - 200, rect.bottom + 12);
    } else {
      left = Math.min(vw - 296, Math.max(10, rect.left));
      top = Math.max(10, rect.top - 180);
    }

    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
  } else {
    // Center of screen
    tooltip.style.left = '50%';
    tooltip.style.top = '50%';
    tooltip.style.transform = 'translate(-50%,-50%)';
  }

  document.body.appendChild(tooltip);

  tooltip.querySelector('#tut-next').addEventListener('click', _tutorialNext);
  tooltip.querySelector('#tut-prev').addEventListener('click', _tutorialPrev);
  tooltip.querySelector('#tut-exit').addEventListener('click', _destroyTutorialUI);

  // Focus the tooltip for keyboard nav
  requestAnimationFrame(() => tooltip.querySelector('#tut-next')?.focus());
}

function _tutorialNext() {
  _tutorialStep = Math.min(_tutorialStep + 1, TUTORIAL_STEPS.length);
  if (_tutorialStep >= TUTORIAL_STEPS.length) {
    _destroyTutorialUI();
    toast('Tutorial complete! 🎉', 'ok');
  } else {
    _showTutorialStep(_tutorialStep);
  }
}

function _tutorialPrev() {
  _tutorialStep = Math.max(_tutorialStep - 1, 0);
  _showTutorialStep(_tutorialStep);
}

function _destroyTutorialUI() {
  document.removeEventListener('keydown', _tutorialKeyHandler);
  document.getElementById('tutorial-overlay')?.remove();
  document.getElementById('tutorial-highlight')?.remove();
  document.getElementById('tutorial-tooltip')?.remove();
  _tutorialOverlay = null;
  _tutorialHighlight = null;
}

// ═════════════════════════════════════════════════════════════════════════════
// §7.4.3  BUILT-IN GLSL REFERENCE PANEL
// ═════════════════════════════════════════════════════════════════════════════

const GLSL_REFERENCE = [
  // Math
  { cat: 'Math', name: 'abs(x)', sig: 'genType abs(genType x)', desc: 'Absolute value.' },
  {
    cat: 'Math',
    name: 'ceil(x)',
    sig: 'genType ceil(genType x)',
    desc: 'Ceiling — smallest integer ≥ x.',
  },
  {
    cat: 'Math',
    name: 'clamp(x,mn,mx)',
    sig: 'genType clamp(genType x, genType minVal, genType maxVal)',
    desc: 'Clamp x between minVal and maxVal.',
  },
  {
    cat: 'Math',
    name: 'floor(x)',
    sig: 'genType floor(genType x)',
    desc: 'Floor — largest integer ≤ x.',
  },
  {
    cat: 'Math',
    name: 'fract(x)',
    sig: 'genType fract(genType x)',
    desc: 'Fractional part: x − floor(x).',
  },
  {
    cat: 'Math',
    name: 'max(x,y)',
    sig: 'genType max(genType x, genType y)',
    desc: 'Maximum of x and y.',
  },
  {
    cat: 'Math',
    name: 'min(x,y)',
    sig: 'genType min(genType x, genType y)',
    desc: 'Minimum of x and y.',
  },
  {
    cat: 'Math',
    name: 'mix(x,y,a)',
    sig: 'genType mix(genType x, genType y, genType a)',
    desc: 'Linear interpolation: x*(1-a) + y*a.',
  },
  {
    cat: 'Math',
    name: 'mod(x,y)',
    sig: 'genType mod(genType x, genType y)',
    desc: 'Modulo: x − y*floor(x/y).',
  },
  {
    cat: 'Math',
    name: 'round(x)',
    sig: 'genType round(genType x)',
    desc: 'Round to nearest integer.',
  },
  { cat: 'Math', name: 'sign(x)', sig: 'genType sign(genType x)', desc: 'Sign of x: -1, 0, or 1.' },
  {
    cat: 'Math',
    name: 'smoothstep(e0,e1,x)',
    sig: 'genType smoothstep(genType edge0, genType edge1, genType x)',
    desc: 'Smooth Hermite interpolation between 0 and 1.',
  },
  {
    cat: 'Math',
    name: 'step(edge,x)',
    sig: 'genType step(genType edge, genType x)',
    desc: '0 if x < edge, else 1.',
  },
  // Trig
  { cat: 'Trig', name: 'sin(x)', sig: 'genType sin(genType angle)', desc: 'Sine (radians).' },
  { cat: 'Trig', name: 'cos(x)', sig: 'genType cos(genType angle)', desc: 'Cosine (radians).' },
  { cat: 'Trig', name: 'tan(x)', sig: 'genType tan(genType angle)', desc: 'Tangent (radians).' },
  {
    cat: 'Trig',
    name: 'asin(x)',
    sig: 'genType asin(genType x)',
    desc: 'Arc sine. Result in [-π/2, π/2].',
  },
  {
    cat: 'Trig',
    name: 'acos(x)',
    sig: 'genType acos(genType x)',
    desc: 'Arc cosine. Result in [0, π].',
  },
  {
    cat: 'Trig',
    name: 'atan(y,x)',
    sig: 'genType atan(genType y, genType x)',
    desc: 'Arc tangent of y/x using signs to determine quadrant.',
  },
  {
    cat: 'Trig',
    name: 'radians(x)',
    sig: 'genType radians(genType degrees)',
    desc: 'Convert degrees to radians.',
  },
  {
    cat: 'Trig',
    name: 'degrees(x)',
    sig: 'genType degrees(genType radians)',
    desc: 'Convert radians to degrees.',
  },
  // Exponential
  {
    cat: 'Exponential',
    name: 'exp(x)',
    sig: 'genType exp(genType x)',
    desc: 'Natural exponentiation: e^x.',
  },
  {
    cat: 'Exponential',
    name: 'exp2(x)',
    sig: 'genType exp2(genType x)',
    desc: 'Base-2 exponentiation: 2^x.',
  },
  {
    cat: 'Exponential',
    name: 'log(x)',
    sig: 'genType log(genType x)',
    desc: 'Natural logarithm. x > 0.',
  },
  {
    cat: 'Exponential',
    name: 'log2(x)',
    sig: 'genType log2(genType x)',
    desc: 'Base-2 logarithm. x > 0.',
  },
  {
    cat: 'Exponential',
    name: 'pow(x,y)',
    sig: 'genType pow(genType x, genType y)',
    desc: 'x raised to the power y. x ≥ 0.',
  },
  {
    cat: 'Exponential',
    name: 'sqrt(x)',
    sig: 'genType sqrt(genType x)',
    desc: 'Square root. x ≥ 0.',
  },
  {
    cat: 'Exponential',
    name: 'inversesqrt(x)',
    sig: 'genType inversesqrt(genType x)',
    desc: '1/sqrt(x). x > 0.',
  },
  // Geometry
  {
    cat: 'Geometry',
    name: 'cross(a,b)',
    sig: 'vec3 cross(vec3 x, vec3 y)',
    desc: 'Cross product of two vec3.',
  },
  {
    cat: 'Geometry',
    name: 'distance(p,q)',
    sig: 'float distance(genType p0, genType p1)',
    desc: 'Euclidean distance between two points.',
  },
  {
    cat: 'Geometry',
    name: 'dot(a,b)',
    sig: 'float dot(genType x, genType y)',
    desc: 'Dot (inner) product.',
  },
  {
    cat: 'Geometry',
    name: 'faceforward(n,i,r)',
    sig: 'genType faceforward(genType N, genType I, genType Nref)',
    desc: 'Return N if dot(Nref,I)<0, else -N.',
  },
  {
    cat: 'Geometry',
    name: 'length(x)',
    sig: 'float length(genType x)',
    desc: 'Euclidean length of a vector.',
  },
  {
    cat: 'Geometry',
    name: 'normalize(x)',
    sig: 'genType normalize(genType x)',
    desc: 'Return unit vector in same direction as x.',
  },
  {
    cat: 'Geometry',
    name: 'reflect(i,n)',
    sig: 'genType reflect(genType I, genType N)',
    desc: 'Reflection of I with respect to N.',
  },
  {
    cat: 'Geometry',
    name: 'refract(i,n,eta)',
    sig: 'genType refract(genType I, genType N, float eta)',
    desc: 'Refraction vector.',
  },
  // Texture
  {
    cat: 'Texture',
    name: 'texture(s,uv)',
    sig: 'gvec4 texture(gsampler2D sampler, vec2 P)',
    desc: 'Sample a 2D texture at UV coordinates.',
  },
  {
    cat: 'Texture',
    name: 'textureLod(s,uv,lod)',
    sig: 'gvec4 textureLod(gsampler2D s, vec2 P, float lod)',
    desc: 'Sample texture at explicit mip level.',
  },
  {
    cat: 'Texture',
    name: 'textureSize(s,lod)',
    sig: 'ivec2 textureSize(gsampler2D s, int lod)',
    desc: 'Return texture dimensions at given mip level.',
  },
  // Derivatives
  {
    cat: 'Derivatives',
    name: 'dFdx(p)',
    sig: 'genType dFdx(genType p)',
    desc: 'Partial derivative of p in x (screen space).',
  },
  {
    cat: 'Derivatives',
    name: 'dFdy(p)',
    sig: 'genType dFdy(genType p)',
    desc: 'Partial derivative of p in y (screen space).',
  },
  {
    cat: 'Derivatives',
    name: 'fwidth(p)',
    sig: 'genType fwidth(genType p)',
    desc: 'abs(dFdx(p)) + abs(dFdy(p)).',
  },
  // ShaderToy uniforms
  {
    cat: 'ShaderToy',
    name: 'iTime',
    sig: 'uniform float iTime',
    desc: 'Shader playback time in seconds.',
  },
  {
    cat: 'ShaderToy',
    name: 'iResolution',
    sig: 'uniform vec3 iResolution',
    desc: 'Viewport resolution (width, height, pixel aspect ratio).',
  },
  {
    cat: 'ShaderToy',
    name: 'iMouse',
    sig: 'uniform vec4 iMouse',
    desc: 'Mouse pixel coords. xy: current, zw: click.',
  },
  {
    cat: 'ShaderToy',
    name: 'iFrame',
    sig: 'uniform int iFrame',
    desc: 'Shader playback frame number.',
  },
  {
    cat: 'ShaderToy',
    name: 'iTimeDelta',
    sig: 'uniform float iTimeDelta',
    desc: 'Render time (seconds per frame).',
  },
  {
    cat: 'ShaderToy',
    name: 'iChannel0–3',
    sig: 'uniform sampler2D iChannel0',
    desc: 'Input textures. Audio, video, webcam, noise, or images.',
  },
  {
    cat: 'ShaderToy',
    name: 'iDate',
    sig: 'uniform vec4 iDate',
    desc: 'Year, month, day, time in seconds.',
  },
  {
    cat: 'ShaderToy',
    name: 'iSampleRate',
    sig: 'uniform float iSampleRate',
    desc: 'Sound sample rate (typically 44100).',
  },
  {
    cat: 'ShaderToy',
    name: 'iChannelResolution',
    sig: 'uniform vec3 iChannelResolution[4]',
    desc: 'Resolution of each input channel texture.',
  },
];

const GLSL_CATEGORIES = [...new Set(GLSL_REFERENCE.map((e) => e.cat))];

let _glslRefOpen = false;

export function toggleGLSLReference() {
  if (_glslRefOpen) {
    closeGLSLReference();
  } else {
    openGLSLReference();
  }
}

export function openGLSLReference() {
  const existing = document.getElementById('glsl-ref-panel');
  if (existing) {
    existing.classList.add('open');
    existing.querySelector('#glsl-ref-search')?.focus();
    _glslRefOpen = true;
    return;
  }

  const panel = document.createElement('div');
  panel.id = 'glsl-ref-panel';
  panel.className = 'modal-overlay';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'glsl-ref-title');
  panel.innerHTML = `
    <div class="modal" style="width:560px;max-width:95vw;max-height:80vh;display:flex;flex-direction:column">
      <div class="modal-header">
        <h3 id="glsl-ref-title">GLSL Reference</h3>
        <button class="modal-close" id="glsl-ref-close" aria-label="Close GLSL reference">
          <svg viewBox="0 0 14 14"><line x1="2" y1="2" x2="12" y2="12"/><line x1="12" y1="2" x2="2" y2="12"/></svg>
        </button>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:6px">
        <input id="glsl-ref-search" class="modal-input" placeholder="Search functions, uniforms…"
          style="flex:1" aria-label="Search GLSL reference" autocomplete="off">
        <select id="glsl-ref-cat" class="modal-input" style="width:130px" aria-label="Filter by category">
          <option value="">All categories</option>
          ${GLSL_CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join('')}
        </select>
      </div>
      <div id="glsl-ref-list" style="overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:3px" role="list" aria-label="GLSL function list">
      </div>
      <div style="font-size:9px;color:var(--t3);font-family:var(--font-mono);margin-top:6px;text-align:right">
        ${GLSL_REFERENCE.length} entries · GLSL ES 3.0 + ShaderToy · Works offline
      </div>
    </div>`;

  document.body.appendChild(panel);

  const search = panel.querySelector('#glsl-ref-search');
  const catSel = panel.querySelector('#glsl-ref-cat');
  const list = panel.querySelector('#glsl-ref-list');

  function renderList() {
    const q = search.value.toLowerCase();
    const cat = catSel.value;
    const entries = GLSL_REFERENCE.filter(
      (e) =>
        (!cat || e.cat === cat) &&
        (!q ||
          e.name.toLowerCase().includes(q) ||
          e.desc.toLowerCase().includes(q) ||
          e.sig.toLowerCase().includes(q))
    );

    list.innerHTML = entries.length
      ? entries
          .map(
            (e) => `
          <div style="padding:8px;background:var(--bg2);border-radius:6px;border:1px solid var(--b1)" role="listitem">
            <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:2px">
              <code style="font-size:12px;font-family:var(--font-mono);color:var(--spark);font-weight:600">${e.name}</code>
              <span style="font-size:9px;color:var(--t3);font-family:var(--font-mono)">${e.cat}</span>
            </div>
            <div style="font-size:10px;font-family:var(--font-mono);color:var(--t2);margin-bottom:3px">${e.sig}</div>
            <div style="font-size:11px;color:var(--t2)">${e.desc}</div>
          </div>`
          )
          .join('')
      : `<div style="color:var(--t3);font-size:12px;text-align:center;padding:20px">No matches for "${search.value}"</div>`;
  }

  search.addEventListener('input', renderList);
  catSel.addEventListener('change', renderList);
  renderList();

  panel.querySelector('#glsl-ref-close').addEventListener('click', closeGLSLReference);
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeGLSLReference();
  });

  requestAnimationFrame(() => {
    panel.classList.add('open');
    search.focus();
  });
  _glslRefOpen = true;
}

export function closeGLSLReference() {
  const panel = document.getElementById('glsl-ref-panel');
  if (!panel) return;
  panel.classList.remove('open');
  _glslRefOpen = false;
}

// F1 key — delegates to the full Help Center (Phase 13.2).
// The old GLSL-only panel is superseded; help-center.js exposes backward-compat aliases.
export function initGLSLReferenceShortcut() {
  initHelpCenter();
}

// ═════════════════════════════════════════════════════════════════════════════
// §  KEYBOARD SHORTCUTS PANEL
// ═════════════════════════════════════════════════════════════════════════════

const SHORTCUTS = [
  { key: 'Ctrl+Enter', action: 'Apply shader' },
  { key: 'Ctrl+E', action: 'Export current frame (PNG)' },
  { key: 'Ctrl+Z', action: 'Undo slider change' },
  { key: 'Ctrl+Y', action: 'Redo slider change' },
  { key: 'Ctrl+Shift+P', action: 'Command palette' },
  { key: 'Ctrl+Shift+F', action: 'Format GLSL code' },
  { key: 'Ctrl+= / Ctrl+-', action: 'Zoom UI in / out' },
  { key: 'Ctrl+0', action: 'Reset UI zoom' },
  { key: 'F1', action: 'Open help center' },
  { key: 'F11', action: 'Fullscreen window' },
  { key: 'Escape', action: 'Close modal / exit mode' },
  { key: 'Space (on slider)', action: 'Pause / resume time' },
  { key: 'Shift+drag', action: 'Fine slider adjustment (÷10)' },
  { key: 'Ctrl+drag', action: 'Ultra-fine adjustment (÷100)' },
  { key: 'Double-click', action: 'Reset slider to default' },
];

export function showShortcutsPanel() {
  const existing = document.getElementById('shortcuts-overlay');
  if (existing) {
    existing.classList.add('open');
    return;
  }

  const overlay = document.createElement('div');
  overlay.id = 'shortcuts-overlay';
  overlay.className = 'modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'shortcuts-title');

  overlay.innerHTML = `
    <div class="modal" style="width:440px;max-width:95vw;max-height:80vh;display:flex;flex-direction:column">
      <div class="modal-header">
        <h3 id="shortcuts-title">Keyboard Shortcuts</h3>
        <button class="modal-close" id="shortcuts-close" aria-label="Close keyboard shortcuts">
          <svg viewBox="0 0 14 14"><line x1="2" y1="2" x2="12" y2="12"/><line x1="12" y1="2" x2="2" y2="12"/></svg>
        </button>
      </div>
      <div style="overflow-y:auto;flex:1;display:grid;grid-template-columns:1fr 1fr;gap:4px">
        ${SHORTCUTS.map(
          (s) => `
          <div style="padding:5px 8px;background:var(--bg2);border-radius:5px;border:1px solid var(--b1)">
            <code style="font-size:10px;font-family:var(--font-mono);color:var(--spark);display:block">${s.key}</code>
            <span style="font-size:11px;color:var(--t2)">${s.action}</span>
          </div>`
        ).join('')}
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:8px">
        <button class="modal-btn confirm" id="shortcuts-ok">Close</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const close = () => {
    overlay.classList.remove('open');
    setTimeout(() => overlay.remove(), 300);
  };

  overlay.querySelector('#shortcuts-close').addEventListener('click', close);
  overlay.querySelector('#shortcuts-ok').addEventListener('click', close);
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  requestAnimationFrame(() => {
    overlay.classList.add('open');
    overlay.querySelector('#shortcuts-ok')?.focus();
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// §  MAIN INIT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Initialize all Phase 7.4 onboarding & help features.
 * Call once on DOMContentLoaded.
 */
export function initOnboarding() {
  initGLSLReferenceShortcut();

  setTimeout(() => {
    maybeShowWelcomeScreen();
  }, 800);
}
