// Public JS API (window['Sliders GL']) + embed/iframe mode

import { state } from '../core/state.js';
import { applyAndParse } from './actions.js';
import { onValChange } from '../ui/slider.js';
import { clearSliderCustomizations } from '../ui/slider-customizations.js';
import { findPreset, BUILTIN_PRESETS, loadUserPresets } from './presets.js';
import { loadPreset } from './library.js';
import { togglePause } from '../ui/viewport.js';

// ── Constantes de sécurité ────────────────────────────────────────────────────

/** Taille maximale d'un payload base64 dans ?code= (≈ 200 Ko de GLSL). */
const CODE_PARAM_MAX_BASE64_LEN = 270_000;

/** Taille maximale du code GLSL décodé (150 Ko). */
const CODE_PARAM_MAX_GLSL_LEN  = 150_000;

/**
 * Valide et charge un shader GLSL depuis le paramètre URL `?code=<base64>`.
 *
 * Sécurité (C8) :
 *  - Limite la taille du payload base64 avant décodage (DoS).
 *  - Limite la taille du code décodé.
 *  - En mode embed, demande une confirmation explicite à l'utilisateur
 *    avant d'injecter du code provenant d'un paramètre externe.
 *  - Logue les erreurs au lieu de les avaler silencieusement.
 *
 * @param {string} b64      Valeur brute du paramètre ?code=
 * @param {boolean} isEmbed L'app tourne-t-elle en mode iframe/embed ?
 */
function _loadCodeParam(b64, isEmbed) {
  // 1. Vérification de la taille du payload base64
  if (b64.length > CODE_PARAM_MAX_BASE64_LEN) {
    console.error(
      `[api] ?code= payload too large (${b64.length} chars, max ${CODE_PARAM_MAX_BASE64_LEN}). Ignored.`
    );
    return;
  }

  // 2. Décodage base64 (peut lever si la chaîne est invalide)
  let code;
  try {
    code = atob(b64);
  } catch (e) {
    console.error('[api] ?code= base64 decode failed:', e.message);
    return;
  }

  // 3. Vérification de la taille du code GLSL décodé
  if (code.length > CODE_PARAM_MAX_GLSL_LEN) {
    console.error(
      `[api] ?code= decoded GLSL too large (${code.length} chars, max ${CODE_PARAM_MAX_GLSL_LEN}). Ignored.`
    );
    return;
  }

  // 4. En mode embed, demander une confirmation à l'utilisateur.
  //    Cela empêche une page parente malveillante d'injecter du code
  //    sans consentement dans l'application embarquée.
  if (isEmbed) {
    const confirmed = window.confirm(
      'This page wants to load a shader via URL parameter.\n\n' +
      'Do you want to load this shader?\n' +
      '(Decline if you do not trust the host page.)'
    );
    if (!confirmed) {
      console.info('[api] ?code= load cancelled by user.');
      return;
    }
  }

  // 5. Charger dans l'éditeur
  const _apply = () => {
    state.editor.setValue(code);
    applyAndParse();
  };

  if (state.editor) {
    setTimeout(_apply, 80);
  } else {
    document.addEventListener('sl:ready', _apply, { once: true });
  }
}

function initEmbedMode() {
  const params = new URLSearchParams(location.search);
  const isEmbed = params.has('embed');
  if (isEmbed) {
    document.body.classList.add('embed-mode');
  }
  // Load preset from URL param
  const presetParam = params.get('preset');
  if (presetParam) {
    // Wait for library to be ready, then load
    setTimeout(() => {
      const p = findPreset(presetParam);
      if (p) loadPreset(presetParam);
    }, 200);
  }
  // Load raw code from param (base64) — C8 : validation + confirmation
  const codeParam = params.get('code');
  if (codeParam) {
    _loadCodeParam(codeParam, isEmbed);
  }
}

// Public JS API exposed on window['Sliders GL']
window['Sliders GL'] = {
  /**
   * Set a uniform / slider value by name or id
   * @param {string} nameOrId  - slider label or id
   * @param {number} value
   */
  setUniform(nameOrId, value) {
    // Try direct id first, then by label
    let e = state.varMap[nameOrId];
    if (!e) e = state.vars.find(v => v.label === nameOrId);
    if (!e) { console.warn(`Sliders GL.setUniform: unknown "${nameOrId}"`); return; }
    onValChange(e.id, value);
  },

  /** Get current value of a uniform */
  getUniform(nameOrId) {
    let e = state.varMap[nameOrId];
    if (!e) e = state.vars.find(v => v.label === nameOrId);
    return e ? e.value : undefined;
  },

  /** Load a preset by id or name */
  loadPreset(idOrName) {
    let p = findPreset(idOrName);
    if (!p) {
      const all = [...BUILTIN_PRESETS, ...loadUserPresets()];
      p = all.find(x => x.name === idOrName);
    }
    if (p) loadPreset(p.id);
    else console.warn(`Sliders GL.loadPreset: unknown "${idOrName}"`);
  },

  /** Load raw GLSL code into the editor */
  setShader(glsl) {
    if (!state.editor) {
      console.warn('Sliders GL.setShader called before editor is ready');
      return;
    }
    clearSliderCustomizations();
    state.editor.setValue(glsl);
    setTimeout(applyAndParse, 80);
  },

  /** Get current shader code */
  getShader() {
    return state.editor ? state.editor.getValue() : '';
  },

  /** Pause / resume the render loop */
  setPaused(v) {
    if (v !== state.paused) togglePause();
  },

  /** Get the canvas element */
  get canvas() { return document.getElementById('glc'); },

  /** Listen for events */
  on(event, cb) {
    document.addEventListener('sl:' + event, e => cb(e.detail));
  },
};

// Emit a ready event after init
function emitReady() {
  document.dispatchEvent(new CustomEvent('sl:ready', { detail: { api: window['Sliders GL'] } }));
}

export { initEmbedMode, emitReady };
