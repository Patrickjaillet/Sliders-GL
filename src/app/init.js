// Application bootstrap

import { state } from '../core/state.js';
import { parseShader } from '../shader/parser.js';
import { EXAMPLE } from '../core/constants.js';
import { initGL, applyGLShader } from '../gl/renderer.js';
import { toggleFullscreenVP, initTimeScrubber, initPasteboardObserver } from '../ui/viewport.js';
import { hook6 } from '../ui/undo.js';
import { initEmbedMode, emitReady } from '../io/api.js';
import { mpSyncTabs } from '../render/multipass.js';
import { safeLocalGet, safeLocalRemove } from '../core/utils.js';
import { initTitlebar } from '../native/titlebar.js';
import { initFileDrop } from '../native/file-drop.js';
import { onOpenFile, isTauri, setWindowTitle, listenGlobalKeys, getCliArgs } from '../native/tauri.js';
import { initProject } from '../io/project.js';
import { initProjectShortcuts, setProjectBreadcrumb } from '../io/project-ui.js';
import { chClear } from '../channels/channels-core.js';
import { toast } from '../io/actions.js';
import { setRenderResolution } from '../render/perf.js';
import { initGpuTimestamps } from '../render/gpu-timestamp.js';
import { detectGLCaps, renderGLCapsPanel } from '../render/gl-caps.js';
import { initTooltips } from '../ui/tooltip.js';
import { initDock } from '../ui/dock.js';
import { initKeyboardNav } from '../ui/keyboard-nav.js';
import { initPinnedTools } from '../ui/pinned-tools.js';
import { initPanelDock } from '../ui/panel-dock.js';
import { initSidebarTabs } from '../ui/sidebar-tabs.js';
import { initInspectorContext } from '../ui/inspector-context.js';
import { initSliderGutterDots } from '../ui/slider-gutter.js';
import { initPassNav } from '../ui/pass-nav.js';
import { initCanvasTools } from '../ui/canvas-tools.js';
import { initCanvasGizmos } from '../ui/canvas-gizmos.js';
import { initUniformSparklines } from '../render/uniform-sparklines.js';
import { initExportPresets } from '../export/export-presets.js';
import { initWhichKey } from '../ui/which-key.js';
import { initShaderSummary } from '../ui/shader-summary.js';
import { applyComfort } from '../ui/comfort.js';
import { isSoundEnabled } from '../ui/sound.js';
import { initSettingsPanel } from '../ui/settings-panel.js'; // Fix 2.5
import { loadUserPresets } from '../io/presets.js';
import { showConfirm, processImportedText } from '../io/library.js';
import { runHeadlessCLI } from '../native/headless-cli.js';

let _appInitialized = false;

// Phase 6 — the theming system (Phase 1), UI density presets (Phase 1), and
// the custom theme studio (Phase 1) were all removed; silently drop their
// leftover localStorage keys from older sessions instead of leaving them
// as permanent, unread clutter.
const _OBSOLETE_STORAGE_KEYS = ['sl_theme', 'sl_theme_name', 'sl_themeOverrides', 'sl_uiPreset', 'sl_density'];
function _cleanupObsoleteStorageKeys() {
  _OBSOLETE_STORAGE_KEYS.forEach(safeLocalRemove);
}

window.addEventListener('load', async () => {
  if (_appInitialized) return;
  _appInitialized = true;

  _cleanupObsoleteStorageKeys();

  // Phase 22.4 — Headless CLI mode
  // Tauri passes '--headless render ...' args; if detected we run the render
  // pipeline and exit without mounting any UI.
  if (isTauri()) {
    const argv = await getCliArgs();
    if (argv.includes('--headless') || argv.includes('render')) {
      const cliArgs = argv.filter(a => a !== '--headless');
      await runHeadlessCLI(cliArgs);
      return;
    }
  }

  initTitlebar();
  initFileDrop();
  initTooltips();
  initDock();
  // Phase O — onglets de sidebar (Uniforms/Style/History)
  initSidebarTabs();
  // Phase Q — inspector contextuel (perf/pass/slider/uniform)
  initInspectorContext();
  // Phase R — scrubber temporel + overlays viewport
  initTimeScrubber();
  // Phase 2 — pasteboard ResizeObserver: applies .scale-fit when the column
  // is narrower than 840px so the monitor shrinks visually but stays 800x450 GL.
  initPasteboardObserver();
  // Phase Y — gutter dots Monaco pour les lignes avec slider associé
  initSliderGutterDots();
  initKeyboardNav();
  // §1.2 — Outils épinglés dans le header (clic droit sur une entrée du menu Tools)
  initPinnedTools();
  // §2.2 — Barre de dock des panneaux ouverts (bas de la colonne droite)
  initPanelDock();
  // §3.4 — Barre de navigation des passes multipass (sous l'éditeur)
  initPassNav();
  // Phase 4 — Outils canvas (HUD, guides, zoom/pan, copie, compare, menu)
  initCanvasTools();
  // §A.1 (UI v2) — gizmos de position sur le canvas
  initCanvasGizmos();
  // §7.2 — sparklines d'historique des uniforms
  initUniformSparklines();
  // §10.3 — presets de réglages d'export
  initExportPresets();
  // §D.1 (UI v2) — overlay « which-key » (touche ?)
  initWhichKey();
  // §H.2 (UI v2) — résumé shader pour lecteurs d'écran
  initShaderSummary();
  // §H.4 (UI v2) — préférences de confort/accessibilité persistées
  applyComfort();

  // §8.3 — Conscience du clavier virtuel (iPad/mobile) : quand visualViewport
  // rétrécit (clavier ouvert), on contraint la hauteur de l'app pour que
  // l'éditeur reste visible au-dessus du clavier.
  if (window.visualViewport) {
    const vv = window.visualViewport;
    const syncVV = () => {
      const full = window.innerHeight;
      if (vv.height < full - 80) {
        document.documentElement.style.height = vv.height + 'px';
      } else {
        document.documentElement.style.height = '';
      }
      // Laisse le canvas/éditeur se réajuster à la nouvelle hauteur.
      setTimeout(() => window.dispatchEvent(new Event('resize')), 0);
    };
    vv.addEventListener('resize', syncVV);
  }

  // §PB — Pasteboard scale-to-fit: when the viewport-zone column is narrower
  // than 840px (800px canvas + 2×20px margin), scale the .cw down visually.
  // The canvas attribute stays 800×450 — no GL resize event is fired.
  const cwEl = document.querySelector('.cw');
  const pasteboardEl = document.getElementById('viewport-zone');
  if (cwEl && pasteboardEl && typeof ResizeObserver !== 'undefined') {
    const CANVAS_W = 800;
    const CANVAS_MARGIN = 40; // 2 × 20px
    const pbRO = new ResizeObserver(([entry]) => {
      const available = entry.contentRect.width;
      if (available < CANVAS_W + CANVAS_MARGIN) {
        const scale = Math.max(0.25, (available - CANVAS_MARGIN) / CANVAS_W);
        cwEl.style.setProperty('--cw-scale', scale.toFixed(4));
        cwEl.classList.add('scale-fit');
      } else {
        cwEl.style.removeProperty('--cw-scale');
        cwEl.classList.remove('scale-fit');
      }
    });
    pbRO.observe(pasteboardEl);
  }

  // Sync sound toggle button to saved preference
  const soundBtn = document.getElementById('soundToggleBtn');
  if (soundBtn) {
    const on = isSoundEnabled();
    soundBtn.classList.toggle('active', on);
    soundBtn.title = on ? 'Sound feedback: ON' : 'Sound feedback: OFF';
    soundBtn.innerHTML = `<svg width="12" height="12" style="vertical-align:middle;margin-right:3px"><use href="#icon-sound"/></svg>${on ? 'on' : 'off'}`;
  }

  // Phase 1.2: Project model — wire callbacks once the editor is mounted
  // (editor is set on state.editor by ui/editor.js during initGL → Monaco init)
  initProject({
    getCode:     () => state.editor ? state.editor.getValue() : '',
    setCode:     (code) => {
      if (!state.editor) return;
      state.editor.setValue(code);
    },
    getChannels: () => state.channels || {},
    // Roadmap audit — this previously did `state.channels = ch || {}`, replacing
    // the live 4-element array with whatever shape the caller passed (an empty
    // object from project.js's newProject(), or an index-keyed object loaded
    // from a .zgl project). state.channels must stay the SAME array instance
    // (every other module — raf-loop.js, channels-core.js, etc. — calls
    // .some()/.forEach() on it), so merge in place per-index instead of
    // replacing the reference, and properly tear down live channel resources
    // (audio nodes, mic streams, blob URLs) via chClear() before reassigning.
    setChannels: (ch) => {
      const incoming = ch && typeof ch === 'object' ? ch : {};
      for (let i = 0; i < state.channels.length; i++) {
        chClear(i, false);
        const data = incoming[i] ?? incoming[String(i)];
        if (data && typeof data === 'object') Object.assign(state.channels[i], data);
      }
    },
    getPresets:  async () => {
      try {
            return loadUserPresets();
      } catch { return []; }
    },
    // Fix 2.3 — getTimeline / setTimeline non câblés → timeline absente des .zgl
    getTimeline: () => state.timeline || {},
    setTimeline: (tl) => { state.timeline = tl; },
    applyShader: (code) => applyGLShader(code),
    toast:       (msg, type) => toast(msg, type),
    confirm:     (title, msg, ok) => {
      showConfirm(title, msg, ok);
    },
    setTitle:    (name) => { setWindowTitle(name); setProjectBreadcrumb(name); },
  });

  // Phase 1.2: Global Ctrl+N / Ctrl+O / Ctrl+S / Ctrl+Shift+S shortcuts
  initProjectShortcuts();

  // Phase 1.3a: Custom resolution input event
  window.addEventListener('zgl:setCustomRes', (e) => {
    const parts = String(e.detail).split(',').map(s => parseInt(s.trim(), 10));
    if (parts.length === 2 && parts.every(n => n > 0 && n <= 7680)) {
      setRenderResolution('custom', parts);
    } else {
      toast('Invalid resolution — use W,H e.g. 1280,720', 'warn');
    }
  });

  // Phase 1.3b: GPU timestamp queries — init if WebGPU is available
  // (runs asynchronously; no-ops if adapter doesn't support timestamp-query)
  if (navigator.gpu) {
    navigator.gpu.requestAdapter().then(adapter => {
      if (!adapter) return;
      const requiredFeatures = adapter.features.has('timestamp-query')
        ? ['timestamp-query'] : [];
      adapter.requestDevice({ requiredFeatures }).then(device => {
        initGpuTimestamps(device);
      }).catch(() => {});
    }).catch(() => {});
  }

  // Phase 1.3c: GL caps — detect once the renderer is ready (next microtask)
  queueMicrotask(() => {
    if (state.renderer3) {
      const caps = detectGLCaps(state.renderer3.getContext());
      if (caps) renderGLCapsPanel(caps);
    }
  });

  // Wire the open_shader_file Rust command → processImportedText pipeline.
  if (isTauri()) {
    onOpenFile(({ path, text }) => {
      const fileName = path.split(/[\\/]/).pop() ?? 'shader';
      processImportedText(text, fileName);
    });
    // C6 — Écouter les raccourcis globaux via événement Tauri (plus via win.eval)
    listenGlobalKeys().catch(err =>
      console.warn('[init] listenGlobalKeys failed:', err)
    );
  }
  initGL();
  // Fix 2.5 — initSettingsPanel() doit être appelé une fois au démarrage (après initGL)
  // pour que #language-selector soit peuplé dès la première ouverture du panneau,
  // évitant le retard visible et l'éventuel échec d'injection CSS.
  initSettingsPanel();

  // ── Fix sliders invisibles (Tauri/WebView2) ──────────────────────────────
  // Les workers Monaco peuvent échouer dans WebView2 (warning "Could not create
  // web worker"). Même si l'éditeur fonctionne en fallback thread principal,
  // l'init asynchrone de Monaco (restoreFromHash → setTimeout(applyAndParse))
  // peut ne jamais déclencher buildUI() → panneau de sliders vide.
  //
  // Les sliders n'ont PAS besoin de Monaco : ils sont construits en parsant le
  // texte du shader. On force donc un build direct depuis le code initial,
  // indépendamment de l'état de state.editor / des workers Monaco.
  // buildUI est idempotent : si Monaco déclenche ensuite son propre applyAndParse,
  // le panneau est simplement reconstruit à l'identique.
  let _sliderBuilt = false;
  const _forceSliderBuild = async () => {
    if (_sliderBuilt) return;
    try {
      // Code source : éditeur si dispo, sinon currentCode, sinon l'exemple intégré.
      const fromEditor = state.editor ? state.editor.getValue() : '';
      const code = (fromEditor && fromEditor.trim())
        ? fromEditor
        : (state.currentCode && state.currentCode.trim() ? state.currentCode : EXAMPLE);
      if (!code || !code.trim()) return;

      const { buildUI } = await import('../ui/slider.js');
      const { applyCustomizations } = await import('../ui/slider-customizations.js');
      const entries = applyCustomizations(parseShader(code));
      buildUI(entries);

      // Garde state cohérent pour le reste de l'app.
      state.currentCode = code;
      state.vars = entries;
      state.varMap = {};
      entries.forEach(e => { state.varMap[e.id] = e; });

      if (entries.length > 0) {
        _sliderBuilt = true;
        console.info(`[init] Sliders construits directement (${entries.length} constantes).`);

        // ── Fix sliders invisibles au démarrage (Tauri/WebView2) ─────────────
        // Cause : content-visibility:auto sur .sw (corrigé en CSS → 'visible'),
        // mais on force aussi un reflow ici par sécurité. Sans interaction qui
        // déclenche un reflow (taper dans l'éditeur), WebView2 peut garder le
        // contenu injecté via innerHTML « non rendu ». Lire offsetHeight force
        // un reflow synchrone qui matérialise les sliders immédiatement.
        const sw = document.getElementById('sw');
        if (sw) {
          // Forcer un reflow synchrone.
          // eslint-disable-next-line no-unused-expressions
          void sw.offsetHeight;
          // Double rAF : garantit un repaint sur le frame suivant même si le
          // premier reflow n'a pas suffi dans certaines versions de WebView2.
          requestAnimationFrame(() => {
            sw.style.contentVisibility = 'visible';
            void sw.offsetHeight;
            requestAnimationFrame(() => { void sw.offsetHeight; });
          });
        }
      }
    } catch (err) {
      console.warn('[init] _forceSliderBuild a échoué:', err);
    }
  };
  // Tentatives échelonnées : couvre le cas où l'éditeur n'est pas encore prêt.
  setTimeout(_forceSliderBuild, 200);
  setTimeout(_forceSliderBuild, 600);
  setTimeout(_forceSliderBuild, 1200);

  // Restore fullscreen state
  if (safeLocalGet('sl_vpFull', '0') === '1') toggleFullscreenVP();

  // 6.1: Hook undo/redo onto slider functions
  hook6();
  // 7.3: Embed mode + URL params
  initEmbedMode();
  // 7.3: Emit ready event for parent frames
  emitReady();
  // F-8.2: Check for shared include in URL hash (#include=<base64>)
  import('../ui/includes-panel.js').then(m => m.checkInitHashInclude());
  // 2.4: Sync pass tabs + store initial Image pass code
  state.mp.passes.image.code = state.editor ? state.editor.getValue() : '';
  mpSyncTabs();
});

/**
 * Re-parse `state.currentCode` and refresh the slider panel.
 * @fires document#variables-updated  `{ detail: ParsedEntry[] }`
 */
export function parseAndRebuildUI() {
  const entries = parseShader(state.currentCode);
  state.vars = entries;
  state.varMap = {};
  entries.forEach(e => state.varMap[e.id] = e);
  document.dispatchEvent(new CustomEvent('variables-updated', { detail: entries }));
}

