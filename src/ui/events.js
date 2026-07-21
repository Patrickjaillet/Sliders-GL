import { applyAndParse, copyCode, loadExample, resetSliders, resetSliderCustomizations } from '../io/actions.js';
import { toggleInlayUniformValues } from './inlay-uniform-values.js';
import { jumpTo, onSlide, onValChange, togglePin, toggleGroup, randomizeUnpinnedSliders } from './slider.js';
import { applyAndParseActive, mpSetChannel, mpSwitchPass, mpToggleOrSwitch, mpToggleWiring, mpDisablePass, mpToggleSound, mpSwitchToSound, mpToggleFeedbackDelay, mpSetPassResScale, mpCapturePass, mpToggleGBuffer } from '../render/multipass.js';
import { closeConfirmModal, executeConfirm,
  loadPreset, importPresetFile } from '../io/library.js';
import { openExportModal, closeExportModal, switchExportTab,
  exportScreenshot, exportCurrentFrame, exportStandaloneHTML, exportPureGLSL, exportMinifiedGLSL,
  exportThreeSnippet, toggleVideoRecord, exportProjectZip,
  // Phase 6
  exportP5Sketch, exportGLSLSandbox, exportShaderToyFormat,
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
import { setRenderResolution, renderHeadless } from '../render/resolution.js';
import { ctxCmd, openCtxMenu, startRename, openGroupCtxMenu, groupCtxCmd } from './context-menu.js';
import { slDragStart, slDragOver, slDragLeave, slDrop } from './drag-drop.js';
import { toggleFullscreenVP, togglePause, toggleCodeFocus } from './viewport.js';
import { toggleErrPanel } from '../gl/renderer.js';
import { toggleMinimap, openCommandPalette, toggleSnippetLibrary, toggleIncludesPanel } from './editor.js';
import { toggleInspectorPanel } from './inspector-context.js';
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
import { toggleWarpPanel } from './warp-panel.js';
import { toggleBlockPalette } from './block-palette.js';

const ACTIONS = {
  applyAndParse,
  applyAndParseActive,
  copyCode,
  jumpTo,
  openExportModal,
  closeExportModal,
  switchExportTab,
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
  toggleWarpPanel,
  toggleBlockPalette,
  toggleGroup,
  // toggleSnippets, insertSnippet removed (10.1)
  loadPreset,
  importPresetFile,
  loadExample,
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
  toggleFullscreenVP,
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

  toggleChannelPanel,
  exportProjectZip,
  expZipBtn: exportProjectZip,
  // Phase 6 — Export & Sharing
  exportP5Sketch,
  exportGLSLSandbox,
  exportShaderToyFormat,
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

    const name = el.dataset.action;
    const fn = ACTIONS[name];
    if (!fn) return;
    const args = parseArgs(el.dataset.args);
    // Sound feedback — categorise by action type
    if (name === 'applyAndParse' || name === 'applyAndParseActive') {
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
  // §2.3 — Code focus mode (Ctrl+Shift+F)
  document.getElementById('codeFocusBtn')?.addEventListener('click', () => toggleCodeFocus());

  // §3.5 — Inline uniform values toggle
  document.getElementById('inlayValBtn')?.addEventListener('click', () => {
    toggleInlayUniformValues();
  });

  document.getElementById('helpBtn')?.addEventListener('click', () => openHelpCenter());

  // settingsToggleBtn removed from Tools menu (P1.4) — kept here for header button if present
  document.getElementById('settingsToggleBtn')?.addEventListener('click', toggleSettingsPanel);
  document.getElementById('includesMgrBtn')?.addEventListener('click', toggleIncludesPanel);

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

