import { applyAndParse, copyCode, loadExample, resetSliders, resetSliderCustomizations } from '../io/actions.js';
import { toggleInlayUniformValues } from './inlay-uniform-values.js';
import { jumpTo, onSlide, onValChange, togglePin, toggleGroup, randomizeUnpinnedSliders } from './slider.js';
import { applyAndParseActive, mpSetChannel, mpSwitchPass, mpToggleOrSwitch, mpToggleWiring, mpDisablePass, mpToggleSound, mpSwitchToSound, mpToggleFeedbackDelay, mpSetPassResScale, mpSetTAAVelocity, mpPopulateTAAVelSel, mpCapturePass, mpToggleGBuffer } from '../render/multipass.js';
import { closeConfirmModal, openSaveModal, closeSaveModal, confirmSavePreset,
  openWizardModal, closeWizardModal, confirmWizard, executeConfirm,
  loadPreset, deletePreset, exportPreset, importPreset, importPresetFile,
  previewPreset, openLibrary, closeLibrary, onLibOverlayClick, renderLibrary,
  toggleLibTag, loadHistoryEntry, libImportST } from '../io/library.js';
import { openExportModal, closeExportModal, switchExportTab,
  exportScreenshot, exportCurrentFrame, exportStandaloneHTML, exportPureGLSL, exportMinifiedGLSL,
  exportThreeSnippet, toggleVideoRecord, shareLink, exportProjectZip,
  // Phase 6
  exportP5Sketch, exportGLSLSandbox, exportShaderToyFormat,
  shareLinkV2,
  // Phase 6 — missing items
  renderExportPreview,
} from '../export/export.js';
import {
  openSTModal,
  closeSTModal,
  doSTImport,
  stStoreApiKey,
  stOpenInST,
  stStoreProxyUrlInput,
  stSetUseProxyInput,
} from '../io/shadertoy.js';
// toggleSnippets, insertSnippet imports removed (10.1)
import { chChangeType, chClear, chLoadAudioFile, chLoadImageFile, chLoadCubeFiles, chLoadURL,
  chLoadKTX2CubeFile, chLoadVideoFile, chVideoSetPlayback, chSetBand, chSetFlipY, chSetGain, chSetSmoothing,
  chSetWrap, chStartMic, chStartWebcam, chEnablePrevFrame, chEnableKeyboard,
  chSetFftSize, chSetWindowFn, chSetAudioMode,
  toggleChannelPanel } from '../channels/channels.js';
import { setBloom, setBloomStrength, setBloomThreshold, setBloomRadius, setFpsCap,
  setGpuTimeVisible, setPerfAlertEnabled, setPostEnabled, setSRGB,
  setToneMapping, setVignette, setCRT, setCRTBarrel, setCRTScanlines, setCRTAberration, setFXAA,
  setTAA, setTAABlend, setTAAThreshold,
  setTAAVelocityScale, setTAAVelocityTex, setTAAVelocityEnabled,
  setLutEnabled, setLutStrength, loadLutFile, clearLut,
  togglePerfPanel, setRenderResolution } from '../render/perf.js';
import { renderHeadless } from '../render/resolution.js';
import { applyLayoutPreset, detachPanel, applyCustomLayout } from './dock.js';
import { ctxCmd, openCtxMenu, startRename, openGroupCtxMenu, groupCtxCmd } from './context-menu.js';
import { slDragStart, slDragOver, slDragLeave, slDrop } from './drag-drop.js';
import { toggleFullscreenVP, togglePause, togglePresentation, toggleCodeFocus } from './viewport.js';
import { toggleViewportPopout } from './viewport-popout.js';
import { toggleErrPanel } from '../gl/renderer.js';
import { toggleMinimap, openCommandPalette, toggleSnippetLibrary, toggleRaymarchAssistant, toggleSdfVisualizer, toggleSdfComposer, toggleLUTLibPanel, toggleLUT1DEditor, openShaderDocs, toggleShaderDocs, toggleWorkspacePanel, toggleColorBlindnessPanel, toggleIncludesPanel } from './editor.js';
import { toggleSettingsPanel } from './settings-panel.js';
import { playSound, toggleSound, isSoundEnabled } from './sound.js';
import {
  toggleFileMenu,
  handleNewProject,
  handleOpenProject,
  handleSaveProject,
  handleSaveProjectAs,
  handleOpenMruEntry,
  handleToggleWatchFile,
} from '../io/project-ui.js';
import { showWelcomeScreen, startTutorial, openGLSLReference, showShortcutsPanel } from './onboarding.js';
import { openHelpCenter } from './help-center.js';
import { openAddUniformDialog } from './add-uniform-dialog.js';
import { openPartialPresetDialog } from './partial-preset-dialog.js';
import { togglePalettePanel } from './palette-panel.js';
import { toggleFXPanel } from './fx-stack-panel.js';
import { toggleWarpPanel } from './warp-panel.js';
import { toggleStylePanel } from './style-panel.js';
import { toggleShapePanel } from './shape-panel.js';
import { toggleBlockPalette } from './block-palette.js';

const ACTIONS = {
  applyAndParse,
  applyAndParseActive,
  copyCode,
  jumpTo,
  openExportModal,
  closeExportModal,
  switchExportTab,
  openSaveModal,
  closeSaveModal,
  confirmSavePreset,
  openWizardModal,
  closeWizardModal,
  confirmWizard,
  executeConfirm,
  closeConfirmModal,
  openSTModal,
  closeSTModal,
  onSlide,
  onValChange,
  togglePin,
  resetSliders,
  resetSliderCustomizations,
  randomizeUnpinnedSliders,
  openAddUniformDialog,
  openPartialPresetDialog,
  togglePalettePanel,
  toggleFXPanel,
  toggleWarpPanel,
  toggleStylePanel,
  toggleShapePanel,
  toggleBlockPalette,
  toggleGroup,
  // toggleSnippets, insertSnippet removed (10.1)
  loadPreset,
  deletePreset,
  exportPreset,
  importPreset,
  importPresetFile,
  previewPreset,
  openLibrary,
  closeLibrary,
  onLibOverlayClick,
  renderLibrary,
  toggleLibTag,
  loadExample,
  loadHistoryEntry,
  chChangeType,
  chClear,
  chLoadAudioFile,
  chLoadImageFile,
  chLoadCubeFiles,
  chLoadKTX2CubeFile,
  chLoadURL,
  chLoadVideoFile,
  chVideoSetPlayback,
  chSetBand,
  chSetFlipY,
  chSetGain,
  chSetSmoothing,
  chSetWrap,
  chSetFftSize,
  chSetWindowFn,
  chSetAudioMode,
  chStartMic,
  chStartWebcam,
  chEnablePrevFrame,
  chEnableKeyboard,
  exportScreenshot,
  exportCurrentFrame,
  exportStandaloneHTML,
  exportPureGLSL,
  exportMinifiedGLSL,
  exportThreeSnippet,
  toggleVideoRecord,
  shareLink,
  setBloom,
  setBloomStrength,
  setBloomThreshold,
  setBloomRadius,
  setCRT,
  setCRTBarrel,
  setCRTScanlines,
  setCRTAberration,
  setFXAA,
  setTAA,
  setTAABlend,
  setTAAThreshold,
  setTAAVelocityScale,
  setTAAVelocityTex,
  setTAAVelocityEnabled,
  setLutEnabled,
  setLutStrength,
  loadLutFile,
  clearLut,
  setFpsCap,
  setGpuTimeVisible,
  setPerfAlertEnabled,
  setPostEnabled,
  setSRGB,
  setToneMapping,
  setVignette,
  togglePerfPanel,
  applyLayoutPreset,
  applyCustomLayout,
  toggleDetachPanel: () => detachPanel(),
  toggleLayoutMenu: () => {
    const popup = document.getElementById('layoutPresetPopup');
    const btn   = document.getElementById('layoutPresetBtn');
    if (!popup || !btn) return;
    const open = popup.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
    if (open) {
      requestAnimationFrame(() => {
        popup.querySelector('[role="menuitem"]:not(.disabled)')?.focus();
      });
      const close = (e) => {
        const wrap = document.getElementById('layoutPresetWrap');
        if (wrap && wrap.contains(e.target)) return;
        popup.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
        document.removeEventListener('pointerdown', close, { capture: true });
      };
      setTimeout(() => document.addEventListener('pointerdown', close, { capture: true }), 0);
    }
  },
  ctxCmd,
  slDragStart,
  slDragOver,
  slDragLeave,
  slDrop,
  openCtxMenu,
  startRename,
  openGroupCtxMenu,
  groupCtxCmd,
  mpSetChannel,
  mpSwitchPass,
  mpToggleOrSwitch,
  mpToggleWiring,
  mpDisablePass,
  mpToggleSound,
  mpSwitchToSound,
  mpToggleFeedbackDelay,
  mpCapturePass,
  mpToggleGBuffer,
  mpSetPassResScale,
  mpSetTAAVelocity,
  toggleFullscreenVP,
  togglePresentation,
  toggleErrPanel,
  togglePause,
  toggleMinimap,
  openCommandPalette,
  toggleSnippetLibrary,
  doSTImport,
  stStoreApiKey,
  stStoreProxyUrlInput,
  stSetUseProxyInput,
  stOpenInST,
  libImportST,

  toggleChannelPanel,
  exportProjectZip,
  expZipBtn: exportProjectZip,
  // Phase 6 — Export & Sharing
  exportP5Sketch,
  exportGLSLSandbox,
  exportShaderToyFormat,
  shareLinkV2,
  renderExportPreview,
  toggleSound: () => {
    const on = toggleSound();
    playSound('click');
    const btn = document.getElementById('soundToggleBtn');
    if (btn) {
      btn.classList.toggle('active', on);
      btn.title = on ? 'Sound feedback: ON' : 'Sound feedback: OFF';
      btn.innerHTML = `<svg width="12" height="12" style="vertical-align:middle;margin-right:3px"><use href="#icon-sound"/></svg>${on ? 'on' : 'off'}`;
    }
  },

  onTAAVelChange: (val) => {
    // val: 'auto' | 'none' | '<passId>'
    const st = document.getElementById('taaVelStatus');
    if (val === 'auto') {
      setTAAVelocityEnabled(true);
      setTAAVelocityTex(null);
      if (st) { st.textContent = 'Auto (generated)'; st.title = 'TAA velocity source: Auto (generated)'; }
      const summaryBtn = document.getElementById('taaVelSummary');
      const summaryText = document.getElementById('taaVelSummaryText');
      if (summaryText) summaryText.textContent = 'TAA: Auto (generated)';
      if (summaryBtn) summaryBtn.title = 'TAA velocity source: Auto (generated)';
      return;
    }
    if (val === 'none') {
      setTAAVelocityEnabled(false);
      setTAAVelocityTex(null);
      if (st) { st.textContent = 'None (jitter only)'; st.title = 'TAA velocity source: None (jitter only)'; }
      const summaryBtn2 = document.getElementById('taaVelSummary');
      const summaryText2 = document.getElementById('taaVelSummaryText');
      if (summaryText2) summaryText2.textContent = 'TAA: None (jitter only)';
      if (summaryBtn2) summaryBtn2.title = 'TAA velocity source: None (jitter only)';
      return;
    }
    // passId — wire the multipass RT as override
    setTAAVelocityEnabled(true);
    mpSetTAAVelocity(val);
  },

  // Header quick-access button — cycles through the same non-disabled options
  // as the `#taaVelSelect` dropdown in the perf panel (Auto, None, then any
  // enabled buffer/cube/image pass), reusing onTAAVelChange to apply each step.
  toggleTAAVelSource: () => {
    const sel = document.getElementById('taaVelSelect');
    if (!sel || !sel.options.length) return;
    const opts = Array.from(sel.options).filter(o => !o.disabled);
    if (!opts.length) return;
    const cur = sel.value;
    const idx = opts.findIndex(o => o.value === cur);
    const next = opts[(idx + 1) % opts.length];
    sel.value = next.value;
    ACTIONS.onTAAVelChange(next.value);
  },

  toggleFileMenu,
  newProject:      handleNewProject,
  openProject:     handleOpenProject,
  saveProject:     handleSaveProject,
  saveProjectAs:   handleSaveProjectAs,
  openMruEntry:    handleOpenMruEntry,
  toggleWatchFile: handleToggleWatchFile,
  // Phase 7.4 — Onboarding & Help
  showWelcomeScreen,
  startTutorial,
  openGLSLReference,
  showShortcutsPanel,

  setRenderResolution,
  renderHeadless: async (args) => {
    const [w, h] = (args || '1920,1080').split(',').map(Number);
    const blob = await renderHeadless({ width: w || 1920, height: h || 1080 });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `zgl-frame-${Date.now()}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  },
};

function parseArgs(raw) {
  if (!raw) return [];
  return raw.split(',').map(a => {
    const s = a.trim();
    if (s === 'true') return true;
    if (s === 'false') return false;
    const n = Number(s);
    if (!isNaN(n) && s !== '') return n;
    return s;
  });
}

export function exposeGlobals() {

  const inlineHandlers = [

    'jumpTo',
    'togglePin',
    'toggleGroup',
    'openCtxMenu',
    'openGroupCtxMenu',
    'startRename',
    'slDragStart',
    'slDragOver',
    'slDragLeave',
    'slDrop',

    'chChangeType',
    'chClear',
    'chLoadImageFile',
    'chLoadCubeFiles',
    'chLoadKTX2CubeFile',
    'chLoadAudioFile',
    'chLoadVideoFile',
    'chVideoSetPlayback',
    'chLoadURL',
    'chSetWrap',
    'chSetFlipY',
    'chSetSmoothing',
    'chSetGain',
    'chSetBand',
    'chStartMic',
    'chStartWebcam',
    'chEnablePrevFrame',
    'chEnableKeyboard',
    'chSetFftSize',
    'chSetWindowFn',
    'chSetAudioMode',
  ];
  for (const name of inlineHandlers) {
    window[name] = (...args) => ACTIONS[name]?.(...args);
  }
}

export function initEvents() {

  document.addEventListener('click', (e) => {
    if (e.target.matches('select, input[type="checkbox"], input[type="radio"], textarea')) {
      e.stopPropagation();
    }
  }, true);

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;

    if (
      el.classList?.contains('modal-overlay') &&
      e.target !== el &&
      e.target.closest('.modal')
    ) {
      return;
    }
    if (
      el.id === 'libOverlay' &&
      e.target !== el &&
      e.target.closest('#libDrawer')
    ) {
      return;
    }

    const name = el.dataset.action;
    const fn = ACTIONS[name];
    if (!fn) return;
    const args = parseArgs(el.dataset.args);
    // Sound feedback — categorise by action type
    if (name === 'applyAndParse' || name === 'applyAndParseActive' || name === 'confirmSavePreset' || name === 'confirmWizard') {
      playSound('confirm');
    } else if (name === 'resetSliders') {
      playSound('error');
    } else if (name !== 'onSlide' && name !== 'onValChange' && name !== 'jumpTo') {
      playSound('click');
    }
    fn(...args, e);
  });

  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-change]');
    if (!el) return;
    const name = el.dataset.change;
    const fn = ACTIONS[name];
    if (!fn) return;
    const args = parseArgs(el.dataset.args);
    const value = el.type === 'checkbox'
      ? el.checked
      : el.type === 'file'
        ? el
        : el.value;
    fn(...args, value, e);
  });

  document.addEventListener('input', (e) => {
    const el = e.target.closest('[data-input]');
    if (!el) return;
    const name = el.dataset.input;
    const fn = ACTIONS[name];
    if (!fn) return;
    const args = parseArgs(el.dataset.args);
    fn(...args, el.value, e);
  });

  document.addEventListener('keydown', (e) => {
    const el = e.target.closest('[data-keydown]');
    if (!el) return;
    const raw = el.dataset.keydown;
    if (!raw) return;
    const [key, action, ...argParts] = raw.split(':');
    if (e.key !== key) return;
    const fn = ACTIONS[action];
    if (!fn) return;
    fn(...parseArgs(argParts.join(':')), e);
  });
  // Populate TAA velocity selector now that DOM is ready
  try { mpPopulateTAAVelSel(); } catch (e) { /* ignore */ }

  // §2.3 — Code focus mode (Ctrl+Shift+F)
  document.getElementById('codeFocusBtn')?.addEventListener('click', () => toggleCodeFocus());

  // §2.4 — Pop-out viewport (second window / dual monitor)
  document.getElementById('popoutViewportBtn')?.addEventListener('click', toggleViewportPopout);

  // §3.5 — Inline uniform values toggle
  document.getElementById('inlayValBtn')?.addEventListener('click', () => {
    toggleInlayUniformValues();
  });

  document.getElementById('helpBtn')?.addEventListener('click', () => openHelpCenter());

  document.getElementById('colorblindnessToggleBtn')?.addEventListener('click', toggleColorBlindnessPanel);
  // §6.5 — l'indicateur de la barre de statut ouvre aussi le panneau
  document.getElementById('cbIndicator')?.addEventListener('click', toggleColorBlindnessPanel);
  // settingsToggleBtn removed from Tools menu (P1.4) — kept here for header button if present
  document.getElementById('settingsToggleBtn')?.addEventListener('click', toggleSettingsPanel);
  document.getElementById('rmAssistantToggleBtn')?.addEventListener('click', toggleRaymarchAssistant);
  document.getElementById('includesMgrBtn')?.addEventListener('click', toggleIncludesPanel);
  document.getElementById('sdfVizToggleBtn')?.addEventListener('click', toggleSdfVisualizer);
  document.getElementById('sdfComposerToggleBtn')?.addEventListener('click', toggleSdfComposer);
  document.getElementById('lutLibToggleBtn')?.addEventListener('click', toggleLUTLibPanel);
  document.getElementById('shaderDocsBtn')?.addEventListener('click', () => toggleShaderDocs());
  document.getElementById('workspaceToggleBtn')?.addEventListener('click', toggleWorkspacePanel);

  // P2.8 — ⌕ slider filter toggle button
  document.getElementById('slFilterToggleBtn')?.addEventListener('click', () => {
    const f = document.getElementById('slFilter');
    if (!f) return;
    const visible = f.style.display !== 'none';
    f.style.display = visible ? 'none' : 'flex';
    if (!visible) document.getElementById('slFilterInput')?.focus();
    document.getElementById('slFilterToggleBtn')?.classList.toggle('active', !visible);
  });

  // P1.1 — ⊕ panels dropdown
  document.getElementById('pbPanelsToggle')?.addEventListener('click', e => {
    e.stopPropagation();
    const menu = document.getElementById('pbPanelsMenu');
    const btn  = document.getElementById('pbPanelsToggle');
    if (!menu || !btn) return;
    const open = menu.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
    // Bug fix: .pb-panels-menu uses position:fixed (escapes .ph's
    // overflow:hidden clipping) — compute its coordinates from the trigger
    // button each time it opens, since fixed positioning isn't relative to
    // the nearest positioned ancestor like absolute would be.
    if (open) {
      const rect = btn.getBoundingClientRect();
      menu.style.left = Math.round(rect.left) + 'px';
      menu.style.top  = Math.round(rect.bottom + 4) + 'px';
    }
  });
  document.addEventListener('click', e => {
    const wrap = document.getElementById('pbPanelsToggle')?.closest('.pb-panels-wrap');
    if (wrap && wrap.contains(/** @type {Node} */ (e.target))) return;
    const menu = document.getElementById('pbPanelsMenu');
    if (menu?.classList.contains('open')) {
      menu.classList.remove('open');
      document.getElementById('pbPanelsToggle')?.setAttribute('aria-expanded', 'false');
    }
  });

  // P1.2 — ⋯ more editor options dropdown
  document.getElementById('ebMoreBtn')?.addEventListener('click', e => {
    e.stopPropagation();
    const menu = document.getElementById('ebMoreMenu');
    const btn  = document.getElementById('ebMoreBtn');
    if (!menu) return;
    const open = menu.classList.toggle('open');
    btn?.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', e => {
    const wrap = document.getElementById('ebMoreBtn')?.closest('.eb-more-wrap');
    if (wrap && wrap.contains(/** @type {Node} */ (e.target))) return;
    const menu = document.getElementById('ebMoreMenu');
    if (menu?.classList.contains('open')) {
      menu.classList.remove('open');
      document.getElementById('ebMoreBtn')?.setAttribute('aria-expanded', 'false');
    }
  });

  // P1.6 — pass-tabs scroll arrows
  const passTabsEl = document.getElementById('passTabs');
  const leftBtn    = document.getElementById('passTabsLeft');
  const rightBtn   = document.getElementById('passTabsRight');

  function _syncTabScrollBtns() {
    if (!passTabsEl || !leftBtn || !rightBtn) return;
    const overflow = passTabsEl.scrollWidth > passTabsEl.clientWidth + 2;
    leftBtn.hidden  = !overflow || passTabsEl.scrollLeft <= 0;
    rightBtn.hidden = !overflow || passTabsEl.scrollLeft >= passTabsEl.scrollWidth - passTabsEl.clientWidth - 2;
  }

  if (passTabsEl) {
    passTabsEl.addEventListener('scroll', _syncTabScrollBtns, { passive: true });
    new ResizeObserver(_syncTabScrollBtns).observe(passTabsEl);
    leftBtn?.addEventListener('click', () => { passTabsEl.scrollBy({ left: -100, behavior: 'smooth' }); });
    rightBtn?.addEventListener('click', () => { passTabsEl.scrollBy({ left: 100, behavior: 'smooth' }); });
    document.getElementById('passTabsWrap')?.addEventListener('wheel', e => {
      e.preventDefault();
      passTabsEl.scrollBy({ left: e.deltaY * 2, behavior: 'smooth' });
      setTimeout(_syncTabScrollBtns, 150);
    }, { passive: false });
    _syncTabScrollBtns();
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Tools overflow menu
// ═════════════════════════════════════════════════════════════════════════════
/**
 * Initialise le menu overflow "tools" de la toolbar.
 *
 * Comportement :
 *  - Clic sur #toolsMoreBtn  → toggle du popup (hidden/visible)
 *  - Clic en dehors          → fermeture
 *  - Touche Escape           → fermeture + retour focus sur le bouton
 *  - Navigation clavier      → Arrow Up/Down dans les items du popup
 *
 * Synchronisation de l'état actif (.active) :
 *  Les features dans le popup peuvent être togglées par raccourci clavier
 *  ou depuis d'autres chemins (ex: Ctrl+Shift+D pour le debugger). Un
 *  MutationObserver surveille les classes des items et met à jour
 *  .tools-more-btn.active si au moins un item est actif.
 */
export function initToolsMoreMenu() {
  const btn   = document.getElementById('toolsMoreBtn');
  const popup = document.getElementById('toolsMorePopup');
  if (!btn || !popup) return;

  // ── Toggle ouverture ──────────────────────────────────────────────
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!popup.hidden) {
      _closeToolsMenu();
    } else {
      _openToolsMenu();
    }
  });

  // ── Fermeture au clic extérieur ───────────────────────────────────
  document.addEventListener('click', (e) => {
    if (!popup.hidden && !btn.contains(/** @type {Node} */ (e.target)) && !popup.contains(/** @type {Node} */ (e.target))) {
      _closeToolsMenu();
    }
  });

  // ── Navigation clavier dans le popup ─────────────────────────────
  popup.addEventListener('keydown', (e) => {
    const items = [...popup.querySelectorAll('.tmenu-item:not(:disabled)')];
    const idx = items.indexOf(document.activeElement);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(idx + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(idx - 1 + items.length) % items.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      items[items.length - 1]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      _closeToolsMenu();
      btn.focus();
    } else if (e.key === 'Tab') {
      _closeToolsMenu();
    }
  });

  // ── Mise à jour de l'état actif du bouton "tools" ────────────────
  // Si un item du popup est .active (panneau ouvert), le bouton trigger
  // prend aussi .active pour signaler visuellement qu'un outil est actif.
  const items = popup.querySelectorAll('.tmenu-item');
  const syncTriggerState = () => {
    const anyActive = [...items].some(item => item.classList.contains('active'));
    btn.classList.toggle('active', anyActive);
  };
  const observer = new MutationObserver(syncTriggerState);
  items.forEach(item => observer.observe(item, { attributes: true, attributeFilter: ['class'] }));

  // ── Helpers ───────────────────────────────────────────────────────
  function _openToolsMenu() {
    popup.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    popup.querySelector('.tmenu-item')?.focus();
  }

  function _closeToolsMenu() {
    popup.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  }
}
