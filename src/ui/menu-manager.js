import { state } from '../core/state.js';
import { toast } from '../io/actions.js';
import * as THREE from 'three'; // Fix 1.2 — THREE.CanvasTexture used in loadChannel()
import { openProject } from '../io/project.js'; // Fix — was ineffective dynamic import (project.js already statically imported by init.js)

const MENU_ACTIONS = {
  // ─── FILE ───
  newProject: () => {
    if (confirm('Create new project? Unsaved changes will be lost.')) {
      // Fix 1.1 — state.code n'existe pas ; la source de vérité est state.editor
      const DEFAULT_SHADER = 'void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n  fragColor = vec4(fragCoord, 0.0, 1.0);\n}\n';
      if (state.editor) state.editor.setValue(DEFAULT_SHADER);
      state.fidx = 0;
      state.simTime = 0;
      toast('New project created', 'ok');
    }
  },

  openProject: async () => {
    // Fix 3.3 — Déléguer à openProject() de io/project.js (import statique).
    // Le dynamic import était inefficace : project.js est déjà importé statiquement
    // par init.js et project-ui.js → rolldown ne peut pas le mettre dans un chunk séparé.
    try {
      await openProject();
    } catch (e) {
      toast('Failed to open project: ' + e.message, 'err');
    }
  },

  saveProject: () => {
    const projectData = {
      name: 'shader-project',
      timestamp: new Date().toISOString(),
      code: state.editor?.getValue() || '', // Fix 1.1 — state.code supprimé
      uniforms: state.mat3?.uniforms || {},
      channels: state.channels?.map(ch => ({ type: ch.type })) || [],
    };
    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `project-${Date.now()}.zgl-project`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Project saved', 'ok');
  },

  saveAsProject: () => {
    const name = prompt('Project name:', 'my-shader');
    if (!name) return;
    MENU_ACTIONS.saveProject();
  },

  exportVideo: () => {
    toast('Video export panel opening...', 'info');
    window.dispatchEvent(new CustomEvent('open-export', { detail: { mode: 'video' } }));
  },

  exportImage: () => {
    toast('Image export panel opening...', 'info');
    window.dispatchEvent(new CustomEvent('open-export', { detail: { mode: 'image' } }));
  },

  exportSequence: () => {
    toast('Sequence export panel opening...', 'info');
    window.dispatchEvent(new CustomEvent('open-export', { detail: { mode: 'sequence' } }));
  },

  exportHighRes: () => {
    toast('High-res export (32K tiled) panel opening...', 'info');
    window.dispatchEvent(new CustomEvent('open-export', { detail: { mode: 'hires' } }));
  },

  exit: async () => {
    if (confirm('Exit Z-GL?')) {
      if (typeof window.__TAURI__ !== 'undefined') {
        // Fix 1.3 — Tauri v2 : window.__TAURI__.app n'existe plus.
        // Utiliser @tauri-apps/plugin-process ou invoke si le plugin est enregistré.
        try {
          const { exit } = await import('@tauri-apps/plugin-process');
          exit(0);
        } catch {
          // Fallback : invoke si le plugin n'est pas bundlé séparément
          try { await window.__TAURI__.core.invoke('exit_app'); } catch { /* ignore */ }
        }
      } else {
        window.close();
      }
    }
  },

  // ─── SHADER ───
  loadShader: async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.glsl,.frag,.vert';
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      if (state.editor) state.editor.setValue(text);
      toast('Shader loaded: ' + file.name, 'ok');
    };
    input.click();
  },

  saveShader: () => {
    const code = state.editor?.getValue() || ''; // Fix 1.1 — state.code supprimé
    const blob = new Blob([code], { type: 'text/glsl' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shader-${Date.now()}.glsl`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Shader saved', 'ok');
  },

  importShadertoy: async () => {
    const shadertoySID = prompt('Enter Shadertoy Shader ID (e.g., 4t2yW3):');
    if (!shadertoySID) return;
    toast('Loading from Shadertoy (requires internet)...', 'info');
    // Would need Shadertoy API implementation
  },

  snippetSDF: () => {
    const sdfSnippet = `// SDF Primitives
float sdSphere(vec3 p, float r) {
  return length(p) - r;
}

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0);
}

float sdTorus(vec3 p, vec2 t) {
  vec2 q = vec2(length(p.xz)-t.x,p.y);
  return length(q)-t.y;
}`;
    insertSnippet(sdfSnippet);
  },

  snippetNoise: () => {
    const noiseSnippet = `// Perlin Noise
float hash(float n) { return fract(sin(n) * 43758.5453); }

float noise(float p) {
  float i = floor(p);
  float f = fract(p);
  f = f*f*(3.0-2.0*f);
  return mix(hash(i), hash(i+1.0), f);
}`;
    insertSnippet(noiseSnippet);
  },

  snippetPostProcess: () => {
    const ppSnippet = `// Post-processing
vec3 bloom(vec3 color, float strength) {
  return color + color * strength;
}

vec3 chromaticAberration(sampler2D tex, vec2 uv, float amount) {
  vec3 col = vec3(0.0);
  col.r = texture(tex, uv + vec2(amount, 0.0)).r;
  col.g = texture(tex, uv).g;
  col.b = texture(tex, uv - vec2(amount, 0.0)).b;
  return col;
}`;
    insertSnippet(ppSnippet);
  },

  // ─── RENDER ───
  res720p: () => {
    updateResolution(1280, 720);
  },

  res1080p: () => {
    updateResolution(1920, 1080);
  },

  res4k: () => {
    updateResolution(3840, 2160);
  },

  resCustom: () => {
    const w = prompt('Width:', '1920');
    const h = prompt('Height:', '1080');
    if (w && h) updateResolution(parseInt(w), parseInt(h));
  },

  // ─── CHANNELS ───
  channelLoad0: () => loadChannel(0),
  channelLoad1: () => loadChannel(1),
  channelLoad2: () => loadChannel(2),
  channelLoad3: () => loadChannel(3),

  togglePrevFrame: () => {
    state.usePrevFrame = !state.usePrevFrame;
    toast(state.usePrevFrame ? 'Prev frame enabled' : 'Prev frame disabled', 'info');
  },

  // ─── TOOLS ───
  watchFile: () => {
    toast('Watch file: drag & drop a .glsl file or use File menu', 'info');
  },

  about: () => {
    alert('Z-GL v2.12.0\nReal-time GPU Shader Editor\n\n© 2026 Patrick JAILLET\n100% offline · No account · No limits');
  },

  documentation: () => {
    toast('Opening documentation...', 'info');
    window.open('https://github.com/z-gl/z-gl/wiki', '_blank');
  },
};

function insertSnippet(code) {
  if (!state.editor) {
    toast('Editor not ready', 'err');
    return;
  }
  const selection = state.editor.getSelection();
  state.editor.executeEdits('insert-snippet', [{
    range: selection,
    text: '\n' + code + '\n',
  }]);
  toast('Snippet inserted', 'ok');
}

function updateResolution(w, h) {
  // Fix 3.1 — changer glc.width/height seul ne relance pas le pipeline de rendu.
  // Déléguer à setRenderResolution() de render/resolution.js.
  import('../render/resolution.js').then(({ setRenderResolution }) => {
    setRenderResolution('custom', [w, h]);
  }).catch(() => {
    // Fallback minimal si resolution.js non chargé
    const glc = document.getElementById('glc');
    if (glc) { glc.width = w; glc.height = h; }
  });
  toast(`Resolution: ${w}×${h}`, 'ok');
}

function loadChannel(index) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*,video/*';
  input.onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      if (file.type.startsWith('image/')) {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.onload = () => {
          state.channels[index].texture = new THREE.CanvasTexture(img);
          toast(`Channel ${index} loaded: ${file.name}`, 'ok');
        };
      } else if (file.type.startsWith('video/')) {
        const video = document.createElement('video');
        video.src = URL.createObjectURL(file);
        video.loop = true;
        video.play();
        state.channels[index].videoEl = video;
        toast(`Channel ${index} loaded: ${file.name}`, 'ok');
      }
    } catch (err) {
      toast(`Failed to load channel: ${err.message}`, 'err');
    }
  };
  input.click();
}

export function initMenuManager() {
  // Receives 'menu-action' CustomEvents dispatched by lib.rs on_menu_event()
  // when the user clicks a native Tauri menu item.
  window.addEventListener('menu-action', (e) => {
    const action = MENU_ACTIONS[e.detail.action];
    if (action) {
      action();
    } else {
      console.warn('Unknown menu action:', e.detail.action);
    }
  });

}

export { MENU_ACTIONS };
