import { state } from '../core/state.js';
import { toast } from '../io/actions.js';
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
    if (confirm('Exit Sliders GL?')) {
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

  togglePrevFrame: () => {
    state.usePrevFrame = !state.usePrevFrame;
    toast(state.usePrevFrame ? 'Prev frame enabled' : 'Prev frame disabled', 'info');
  },

  // ─── TOOLS ───
  watchFile: () => {
    toast('Watch file: drag & drop a .glsl file or use File menu', 'info');
  },

  about: () => {
    alert(`Sliders GL v${__APP_VERSION__}\nReal-time GPU Shader Editor\n\n© 2026 Patrick JAILLET\n100% offline · No account · No limits`);
  },

  documentation: () => {
    toast('Opening documentation...', 'info');
    window.open('https://github.com/z-gl/z-gl/wiki', '_blank');
  },
};

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
