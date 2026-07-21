// Monaco editor — setup, GLSL completions, auto-parse on change

// ⚠️  monaco-env DOIT être importé avant 'monaco-editor' pour que
// self.MonacoEnvironment soit en place quand Monaco s'auto-initialise.
import './monaco-env.js';

import * as monaco from 'monaco-editor';
import { state } from '../core/state.js';
import { parseShader, parseSymbols, typeCheck } from '../shader/parser.js';
import { buildUI, syncSlidersFromCode, isFromSlider } from './slider.js';
import { applyGLShader, checkFragCompile, wrapFrag, showErr, hideErr } from '../gl/renderer.js';
import { EXAMPLE, SNIPPETS } from '../core/constants.js';
import { initInlayUniformValues } from './inlay-uniform-values.js';
import { openLocalFileDialog, openZipFileDialog, initBrowserFileDrop } from '../import/local-file-import.js';
import { openShaderDocPanel, closeShaderDocPanel, toggleShaderDocPanel } from './shader-doc-panel.js';
import { initComplexityBadge } from './complexity-badge.js';
import { initValueScrub } from './value-scrub.js';
import { initColorInline } from './color-inline.js';
import { initHoverInspector, findSliderEntry } from './hover-inspector.js';
import { initShaderAnatomy, toggleShaderAnatomy } from './shader-anatomy.js';
import { applyAndParseActive } from '../render/multipass.js';
import { applyAndParse } from '../io/actions.js';
import { restoreFromHash } from '../export/export.js';
import { togglePalettePanel } from './palette-panel.js';
import { toggleFXPanel } from './fx-stack-panel.js';
import { initVersionHistoryPanel, openPanel as _vhOpenPanel, closePanel as _vhClosePanel, togglePanel as _vhTogglePanel } from './version-history-panel.js';
import { commit } from './version-history.js';
import { toast } from '../io/actions.js';

import { registerGLSLLanguage, BUILTIN_FUNCTIONS, BUILTIN_VARIABLES, SEMANTIC_LEGEND } from './glsl-language.js';
import { registerGLSLCodeActions } from './glsl-code-actions.js';
import { formatGLSL, flashFormattedStatus } from '../shader/glsl-formatter.js';
import { loadExample, copyCode } from '../io/actions.js';
import { openLibrary, openShaderComposer, closeShaderComposer, loadPreset, loadUserPresets } from '../io/library.js';

export { openShaderComposer, closeShaderComposer };
import { togglePerfPanel } from '../render/perf.js';
import { exportScreenshot, openExportModal, shareLink } from '../export/export.js';
import { toggleFullscreenVP, togglePause } from './viewport.js';
import { adaptiveDebounce, cancelAdaptiveDebounce } from '../render/adaptive-debounce.js';
import { toggleColorBlindnessPanel } from '../render/colorblindness-ui.js';
import { toggleSettingsPanel } from './settings-panel.js';

export { toggleColorBlindnessPanel, toggleSettingsPanel };
// 1.4: GLSL completions — token lists come from glsl-language.js
const GLSL_BUILTINS = [
  ...BUILTIN_FUNCTIONS.map(label => ({ label, kind: 1, insertText: label, detail: 'GLSL built-in function' })),
  ...BUILTIN_VARIABLES.map(label => ({ label, kind: 5, insertText: label, detail: 'GLSL built-in variable' })),
];

// ShaderToy uniforms
const SHADERTOY_UNIFORMS = [
  { label: 'iResolution', insertText: 'iResolution', detail: 'vec3 — viewport size (xy) + pixel ratio (z)' },
  { label: 'iTime', insertText: 'iTime', detail: 'float — elapsed time' },
  { label: 'iTimeDelta', insertText: 'iTimeDelta', detail: 'float — frame delta' },
  { label: 'iFrame', insertText: 'iFrame', detail: 'int — frame index' },
  { label: 'iMouse', insertText: 'iMouse', detail: 'vec4 — mouse xy + buttons' },
  { label: 'iChannel0', insertText: 'iChannel0', detail: 'sampler2D' },
  { label: 'iChannel1', insertText: 'iChannel1', detail: 'sampler2D' },
  { label: 'iChannel2', insertText: 'iChannel2', detail: 'sampler2D' },
  { label: 'iChannel3', insertText: 'iChannel3', detail: 'sampler2D' },
].map(item => ({ ...item, kind: 3 }));

const SNIPPET_COMPLETIONS = Object.entries(SNIPPETS).map(([key, body]) => ({
  label: key,
  kind: 27,
  insertText: body,
  insertTextRules: 4,
  detail: 'Z-GL snippet',
}));

function getWordRange(position, word) {
  return {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: word.startColumn,
    endColumn: word.endColumn,
  };
}

function collectUniformSuggestions(code, range) {
  const seen = new Set();
  const out = [];
  const re = /\buniform\s+(float|int|bool|vec[234]|mat[234]|sampler2D|samplerCube)\s+([A-Za-z_]\w*)/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    const type = m[1];
    const name = m[2];
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ label: name, kind: 5, insertText: name, detail: `uniform ${type}`, range });
  }
  return out;
}

function collectSliderSuggestions(range) {
  const seen = new Set();
  const out = [];
  for (const e of state.vars || []) {
    const label = String(e.label || '').trim();
    if (!label || !/^[A-Za-z_]\w*$/.test(label)) continue;
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({ label, kind: 6, insertText: label, detail: 'slider variable', range });
  }
  return out;
}

/**
 * Re-run a compile check on the current editor content and delegate to the
 * canonical showErr / hideErr in gl/renderer.js so that gutter markers,
 * Monaco model markers, the error panel, and the status badge are all updated
 * through a single code path.
 *
 * Previously editor.js had its own parseCompileMarkers / applyCompileMarkers
 * that used the owner key 'shader-compile', causing duplicate / conflicting
 * markers alongside the 'glsl-renderer' markers set by renderer.js.
 * This function removes that duplication.
 */
function applyCompileMarkers(editor) {
  const code = editor.getModel()?.getValue();
  if (code == null) return;
  const log = checkFragCompile(wrapFrag(code));
  if (log) showErr(log);
  else hideErr();
}

// ─────────────────────────────────────────────────────────────────────────────
// glsl-parser integration — AST-level completions & type checking
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run parseSymbols() on the current editor content and return rich completion
 * items for all user-defined functions and variables, with full type
 * annotations in the detail field.
 *
 * @param {string} code   Current GLSL source.
 * @param {object} range  Monaco range for the current word.
 * @returns {Array}  Monaco completion item objects.
 */
function collectASTSymbolCompletions(code, range) {
  const { functions, variables, structs } = parseSymbols(code);
  const items = [];

  for (const fn of functions) {
    const paramStr = fn.params.map(p => (p.qualifier ? p.qualifier + ' ' : '') + p.type + (p.name ? ' ' + p.name : '')).join(', ');
    items.push({
      label: fn.name,
      kind: 1, // Function
      insertText: fn.name,
      detail: `${fn.returnType} ${fn.name}(${paramStr})`,
      documentation: `User-defined function — line ${fn.line}`,
      range,
    });
  }

  for (const v of variables) {
    const qualLabel = v.qualifier ? `[${v.qualifier}] ` : '';
    items.push({
      label: v.name,
      kind: v.qualifier.includes('uniform') ? 3 : 5, // Constant vs Variable
      insertText: v.name,
      detail: `${v.type} ${v.name}`,
      documentation: `${qualLabel}variable — line ${v.line}`,
      range,
    });
  }

  for (const s of structs) {
    items.push({
      label: s.name,
      kind: 6, // Class/Struct
      insertText: s.name,
      detail: `struct ${s.name}`,
      documentation: `User-defined struct — line ${s.line}`,
      range,
    });
  }

  return items;
}

/**
 * Run typeCheck() on the current editor content and push Error/Warning
 * markers under the owner key 'glsl-typecheck'.
 * Clears all previous markers under that owner first.
 */
function applyTypeCheckMarkers(editor) {
  
  const model = editor.getModel();
  if (!model) return;
  const code = model.getValue();
  if (!code.trim()) {
    monaco.editor.setModelMarkers(model, 'glsl-typecheck', []);
    return;
  }
  const symbols = parseSymbols(code);
  const diags = typeCheck(code, symbols);
  monaco.editor.setModelMarkers(model, 'glsl-typecheck', diags);
}

function renameWordAtCursor(editor) {
  const model = editor.getModel();
  if (!model) return;
  const pos = editor.getPosition();
  if (!pos) return;
  const wordInfo = model.getWordAtPosition(pos);
  if (!wordInfo || !wordInfo.word) return;
  const oldName = wordInfo.word;
  const newName = window.prompt(`Rename "${oldName}" to:`, oldName);
  if (!newName || newName === oldName) return;
  if (!/^[A-Za-z_]\w*$/.test(newName)) return;
  const matches = model.findMatches(`\\b${oldName}\\b`, false, true, true, null, true);
  if (!matches.length) return;
  const edits = matches.map(m => ({ range: m.range, text: newName }));
  model.pushEditOperations([], edits, () => null);
  setTimeout(() => applyAndParseActive(), 60);
}

// ---------------------------------------------------------------------------
// 2.1: Command Palette — Ctrl+Shift+P
// A Z-GL-scoped quick-open overlay listing every meaningful editor/app action.
// Keyboard-driven: arrows to move, Enter to run, Escape to close.
// ---------------------------------------------------------------------------

/** @returns {Array<{label:string, detail?:string, keys?:string, run:()=>void}>} */
function buildPaletteCommands() {
  // Lazy-import the actions we need so there's no circular-import risk at
  // module parse time.  All these are already in scope via the existing imports
  // at the top of this file.
  return [
    // ── Shader ──────────────────────────────────────────────────────────────
    { label: 'Apply & Parse Shader',          keys: 'Ctrl+S / Ctrl+Enter', run: () => applyAndParseActive() },
    // ── Editor ──────────────────────────────────────────────────────────────
    { label: 'Find / Replace with Regex',     keys: 'Ctrl+Alt+H',          run: () => state.editor?.trigger('palette', 'editor.action.startFindReplaceAction', null) },
    { label: 'Format Document (GLSL)',        keys: 'Ctrl+Shift+F',        run: () => state.editor?.trigger('palette', 'editor.action.formatDocument', null) },
    { label: 'Rename Symbol',                 keys: 'Ctrl+Shift+R',        run: () => renameWordAtCursor(state.editor) },
    { label: 'Find Usages',                   keys: 'Shift+F12',           run: () => state.editor?.trigger('palette', 'editor.action.referenceSearch.trigger', null) },
    { label: 'Select All Occurrences',        keys: 'Ctrl+Shift+L',        run: () => state.editor?.trigger('palette', 'editor.action.selectHighlights', null) },
    { label: 'Add Cursor at Next Occurrence', keys: 'Ctrl+D',              run: () => state.editor?.trigger('palette', 'editor.action.addSelectionToNextFindMatch', null) },
    { label: 'Add Cursor Above',              keys: 'Ctrl+Alt+↑',          run: () => state.editor?.trigger('palette', 'editor.action.insertCursorAbove', null) },
    { label: 'Add Cursor Below',              keys: 'Ctrl+Alt+↓',          run: () => state.editor?.trigger('palette', 'editor.action.insertCursorBelow', null) },
    { label: 'Toggle Column Selection Mode',  keys: 'Shift+Alt+Ins',       run: () => { const c = state.editor?.getOption(monaco.editor.EditorOption.columnSelection); state.editor?.updateOptions({ columnSelection: !c }); } },
    { label: 'Toggle Minimap',                keys: '',                     run: () => toggleMinimap() },
    { label: 'Go to Line…',                   keys: 'Ctrl+G',              run: () => state.editor?.trigger('palette', 'editor.action.gotoLine', null) },
    { label: 'Go to Symbol…',                 keys: 'Ctrl+Shift+O',        run: () => state.editor?.trigger('palette', 'editor.action.gotoSymbol', null) },
    { label: 'Fold All',                      keys: '',                     run: () => state.editor?.trigger('palette', 'editor.foldAll', null) },
    { label: 'Unfold All',                    keys: '',                     run: () => state.editor?.trigger('palette', 'editor.unfoldAll', null) },
    { label: 'Load Example Shader',           keys: '',                     run: () => loadExample() },
    { label: 'Copy Shader Code',              keys: '',                     run: () => copyCode() },
    // ── Library ─────────────────────────────────────────────────────────────
    { label: 'Open Shader Library',           keys: '',                     run: () => openLibrary() },
    // ── Performance ─────────────────────────────────────────────────────────
    { label: 'Toggle Ray Marching Assistant (Phase 15.3)', keys: 'Ctrl+Shift+M', run: () => toggleRaymarchAssistant() },
    { label: 'Toggle SDF Visualizer (Phase 15.3)',   keys: '',              run: () => toggleSdfVisualizer() },
    { label: 'Toggle SDF Composer (Phase 15.3)',     keys: '',              run: () => toggleSdfComposer() },
    { label: 'Toggle Color Blindness Mode (Phase 21.2)', keys: 'Ctrl+Shift+B', run: () => toggleColorBlindnessPanel() },
    { label: 'Toggle Settings (Phase 21.1)', keys: 'Ctrl+,', run: () => toggleSettingsPanel() },
    { label: 'Toggle Performance Panel',      keys: 'Ctrl+Shift+G',         run: () => togglePerfPanel() },
    { label: 'Toggle GPU Per-Pass Profiler (Phase 7.1)', keys: '',          run: () => import('../render/pass-profiler.js').then(m => m.togglePassProfiler()) },
    { label: 'Toggle Includes Manager (F-8.2)',          keys: '',          run: () => toggleIncludesPanel() },
    { label: 'Toggle Block Palette (F-1.2)',            keys: 'Ctrl+Shift+K', run: () => toggleBlockPalette() },
    { label: 'Toggle Color Palette Panel (F-4.3)',      keys: '',          run: () => togglePalettePanel() },
    { label: 'Toggle FX Stack Panel (F-2.2)',           keys: '',          run: () => toggleFXPanel() },
    // ── Focus modes (UI v2 §J.2) ────────────────────────────────────────────
    { label: 'Focus: Zen mode (editor)',      keys: '',                     run: () => import('./focus-modes.js').then(m => m.focusZen()) },
    { label: 'Focus: Performance mode (canvas)', keys: '',                  run: () => import('./focus-modes.js').then(m => m.focusPerformance()) },
    { label: 'Focus: Teaching mode',          keys: '',                     run: () => import('./focus-modes.js').then(m => m.focusTeaching()) },
    { label: 'Focus: Normal (reset)',         keys: '',                     run: () => import('./focus-modes.js').then(m => m.focusNormal()) },
    { label: 'Toggle Shader Anatomy overlay',  keys: '',                    run: () => toggleShaderAnatomy() },
    // ── Import fichiers locaux (Phase 18.2) ─────────────────────────────────
    { label: 'Open local shader file (.glsl/.wgsl/…)',    keys: '',    run: () => openLocalShaderFile() },
    { label: 'Import Shadertoy ZIP archive',             keys: '',    run: () => openLocalZipFile() },
    // ── Project management ───────────────────────────────────────────────────
    { label: 'Toggle Multi-project Workspace (Phase 20.1)', keys: 'Ctrl+Shift+W', run: () => toggleWorkspacePanel() },
    { label: 'Toggle Version History (Phase 20.2)',  keys: 'Ctrl+Shift+Z', run: () => toggleVersionHistory() },
    { label: 'Toggle Shader Library (Phase 20.3)',  keys: 'Ctrl+Shift+F', run: () => toggleShaderLibrary() },
    { label: 'Toggle LUT Library 50+ (Phase 19.2)',      keys: 'Ctrl+Shift+L',   run: () => toggleLUTLibPanel() },
    { label: 'Toggle LUT 1D Editor (Phase 19.2)',        keys: '',               run: () => toggleLUT1DEditor() },
    // ── Export ──────────────────────────────────────────────────────────────
    { label: 'Export → Screenshot',           keys: '',                     run: () => exportScreenshot() },
    { label: 'Export → Standalone HTML',      keys: '',                     run: () => openExportModal() },
    { label: 'Share Link (URL)',              keys: '',                     run: () => shareLink() },
    // ── Viewport ────────────────────────────────────────────────────────────
    { label: 'Toggle Fullscreen Viewport',    keys: '',                     run: () => toggleFullscreenVP() },
    { label: 'Toggle Pause Rendering',        keys: '',                     run: () => togglePause() },
    // ── Theme ───────────────────────────────────────────────────────────────
    // ── Presets (Phase T) — user's own saved presets only; the full builtin
    // catalog (dozens of entries) already has a dedicated browsing UI
    // ("Open Shader Library" above) and would drown out everything else here.
    ...loadUserPresets().map(p => ({
      label: `Load: ${p.name}`,
      detail: 'from Library',
      run: () => loadPreset(p.id),
    })),
  ];
}

let _paletteEl = null;

// §5.1 — Frecency (fréquence × récence) + recherche floue pour la palette.
const _CMD_FRECENCY_KEY = 'sl_cmdFrecency';
function _loadFrecency() {
  try { return JSON.parse(localStorage.getItem(_CMD_FRECENCY_KEY) || '{}') || {}; }
  catch { return {}; }
}
function _recordCmd(label) {
  const f = _loadFrecency();
  const e = f[label] || { count: 0, last: 0 };
  e.count += 1; e.last = Date.now();
  f[label] = e;
  try { localStorage.setItem(_CMD_FRECENCY_KEY, JSON.stringify(f)); } catch { /* noop */ }
}
function _frecencyScore(label, f) {
  const e = f[label];
  if (!e) return 0;
  const ageDays = (Date.now() - e.last) / 86_400_000;
  return e.count * (0.5 + 1 / (1 + ageDays)); // récence pondère la fréquence
}
// Score de correspondance floue (sous-séquence) ; -1 si aucune correspondance.
function _fuzzyScore(query, text) {
  const q = query.toLowerCase(), t = text.toLowerCase();
  let qi = 0, score = 0, prev = -2;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      score += 1;
      if (prev === i - 1) score += 2;                                  // consécutif
      if (i === 0 || t[i - 1] === ' ' || t[i - 1] === '-') score += 3; // début de mot
      prev = i; qi += 1;
    }
  }
  return qi === q.length ? score : -1;
}

function openCommandPalette() {
  if (_paletteEl) { closePalette(); return; }

  const commands = buildPaletteCommands();
  // Tri initial par frecency (commandes récentes / fréquentes en tête).
  const _frec = _loadFrecency();
  commands.sort((a, b) => _frecencyScore(b.label, _frec) - _frecencyScore(a.label, _frec));
  let recentCount = Math.min(5, commands.filter(c => _frec[c.label]).length);
  let filtered = commands.slice();
  let activeIdx = 0;
  let showRecent = true; // §5.1 — affiche le bloc "récents" quand la requête est vide

  // ── Build DOM ──────────────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.className = 'zcp-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Command Palette');

  const box = document.createElement('div');
  box.className = 'zcp-box';

  const input = document.createElement('input');
  input.className = 'zcp-input';
  input.type = 'text';
  input.placeholder = '⌨  Z-GL commands…';
  input.setAttribute('aria-label', 'Filter commands');
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('spellcheck', 'false');

  const list = document.createElement('div');
  list.className = 'zcp-list';
  list.setAttribute('role', 'listbox');

  box.appendChild(input);
  box.appendChild(list);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  _paletteEl = overlay;

  // ── Rendering ──────────────────────────────────────────────────────────
  function renderList() {
    list.innerHTML = '';
    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'zcp-empty';
      empty.textContent = 'No matching commands';
      list.appendChild(empty);
      return;
    }
    filtered.forEach((cmd, i) => {
      // §5.1 — séparateur "Recent" sous le bloc des commandes récentes
      // (uniquement quand aucune requête n'est saisie).
      if (showRecent && i === recentCount && recentCount > 0) {
        const sep = document.createElement('div');
        sep.className = 'zcp-sep';
        list.appendChild(sep);
      }
      const row = document.createElement('div');
      row.className = 'zcp-item' + (i === activeIdx ? ' zcp-active' : '');
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(i === activeIdx));
      row.dataset.idx = String(i);

      const lbl = document.createElement('span');
      lbl.className = 'zcp-lbl';
      lbl.textContent = cmd.label;
      if (showRecent && i < recentCount) row.classList.add('zcp-recent');

      row.appendChild(lbl);
      if (cmd.detail) {
        const det = document.createElement('span');
        det.className = 'zcp-detail';
        det.textContent = cmd.detail;
        row.appendChild(det);
      }
      if (cmd.keys) {
        const kbd = document.createElement('span');
        kbd.className = 'zcp-kbd';
        kbd.textContent = cmd.keys;
        row.appendChild(kbd);
      }
      row.addEventListener('mouseenter', () => { activeIdx = i; renderList(); });
      row.addEventListener('click', () => runActive());
      list.appendChild(row);
    });
    // Scroll active item into view
    const activeEl = list.querySelector('.zcp-active');
    if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
  }

  function filterCommands(query) {
    const q = query.trim();
    showRecent = !q;
    if (!q) {
      filtered = commands.slice(); // déjà trié par frecency
    } else {
      // §5.1 — recherche floue + tri par score décroissant
      // Phase T — recherche aussi sur le raccourci (keys) et le détail
      // (catégorie/source), pas seulement le label, pour retrouver une
      // commande en tapant par ex. "ctrl+s" ou "library".
      filtered = commands
        .map(c => ({
          c,
          s: Math.max(
            _fuzzyScore(q, c.label),
            c.keys ? _fuzzyScore(q, c.keys) : -1,
            c.detail ? _fuzzyScore(q, c.detail) : -1,
          ),
        }))
        .filter(x => x.s >= 0)
        .sort((a, b) => b.s - a.s)
        .map(x => x.c);
    }
    activeIdx = 0;
    renderList();
  }

  function runActive() {
    const cmd = filtered[activeIdx];
    closePalette();
    if (cmd) { _recordCmd(cmd.label); cmd.run(); }
  }

  function closePalette() {
    if (_paletteEl) { _paletteEl.remove(); _paletteEl = null; }
    document.removeEventListener('keydown', onKey, true);
  }

  function onKey(e) {
    if (e.code === 'Escape') { e.preventDefault(); closePalette(); return; }
    if (e.code === 'ArrowDown') {
      e.preventDefault();
      activeIdx = Math.min(activeIdx + 1, filtered.length - 1);
      renderList();
    } else if (e.code === 'ArrowUp') {
      e.preventDefault();
      activeIdx = Math.max(activeIdx - 1, 0);
      renderList();
    } else if (e.code === 'Enter') {
      e.preventDefault();
      runActive();
    }
  }

  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) closePalette(); });
  input.addEventListener('input', () => filterCommands(input.value));
  document.addEventListener('keydown', onKey, true);

  renderList();
  requestAnimationFrame(() => input.focus());
}




(function initMonaco() {
  registerGLSLLanguage(monaco);
  registerGLSLCodeActions(monaco);

  // Semantic token type index 0 = "shadertoyUniform" (matches SEMANTIC_LEGEND)
  // Monaco resolves semantic rules by "tokenType.tokenModifier" or just "tokenType".
  // The selector used in theme rules for semantic tokens is the token-type name.
  const SHADERTOY_TOKEN_TYPE = SEMANTIC_LEGEND.tokenTypes[0]; // "shadertoyUniform"


  monaco.editor.defineTheme('z-gl-dark', {
    base:'vs-dark',
    inherit:false,
    rules:[
      { token:'', foreground:'E8EAF0' },
      { token:'keyword', foreground:'4FA3FF', fontStyle:'bold' },
      { token:'type', foreground:'39FF6A' },
      { token:'number', foreground:'FF9A3C' },
      { token:'comment', foreground:'99A6C0', fontStyle:'italic' },
      { token:'string', foreground:'C084FC' },
      { token:'operator', foreground:'B8C0CC' },
      { token:'identifier', foreground:'E8EAF0' },
      // ShaderToy uniforms — phosphor accent, italic
      { token: SHADERTOY_TOKEN_TYPE, foreground: '39FF6A', fontStyle: 'italic' },
    ],
    colors:{
      'editor.background':'#13161D',
      'editor.foreground':'#E8EAF0',
      'editorLineNumber.foreground':'#99A6C0',
      'editorLineNumber.activeForeground':'#B8C0CC',
      'editor.selectionBackground':'#39FF6A22',
      'editor.lineHighlightBackground':'#1A1E2780',
      'editorCursor.foreground':'#39FF6A',
      'scrollbarSlider.background':'#FFFFFF1E',
      'scrollbarSlider.hoverBackground':'#FFFFFF38',
      'editor.errorBackground':'rgba(239,68,68,0.10)',
      'editorInlayHint.background':'#1A1E2700',
      'editorInlayHint.foreground':'#8B9AB8',
      // Bracket-pair colorization — buf-a/b/c/d palette
      'editorBracketHighlight.foreground1': '#4FA3FF',
      'editorBracketHighlight.foreground2': '#39FF6A',
      'editorBracketHighlight.foreground3': '#FF9A3C',
      'editorBracketHighlight.foreground4': '#C084FC',
      'editorBracketHighlight.unexpectedBracket.foreground': '#EF4444',
    }
  });

  // 1.1: Add CSS for error line decoration
  const style = document.createElement('style');
  style.textContent = `
    .errorLineHighlight { background: rgba(255, 60, 60, 0.1) !important; border-left: 2px solid #ff5050 !important; }
    .errorGlyph::before { content: '\\26D4'; color: #ff5050; font-size: 11px; font-style: normal; }
    .errorInlineMsg {
      color: #ff6b6b !important;
      font-style: italic;
      opacity: 0.78;
      font-size: 0.88em;
      letter-spacing: 0.01em;
      pointer-events: none;
    }
    /* WGSL-compat warning decorations */
    .wgslWarnGlyph::before {
      content: '\\26A0';
      color: #f0c040;
      font-size: 11px;
      font-style: normal;
    }
    .wgslWarnInlineMsg {
      color: #c8a800 !important;
      font-style: italic;
      opacity: 0.72;
      font-size: 0.85em;
      pointer-events: none;
    }
  `;
  document.head.appendChild(style);

  state.editor = monaco.editor.create(document.getElementById('mc'), {
    value: EXAMPLE,
    language: 'glsl',
    theme: 'z-gl-dark',
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    lineNumbers: 'on',
    // Minimap — GLSL-aware: block rendering (no tiny chars), hover-reveal slider.
    // Width capped at 80px so it never crowds a narrow editor pane.
    minimap: {
      enabled: true,
      renderCharacters: false,
      showSlider: 'mouseover',
      maxColumn: 80,
      scale: 1,
    },
    scrollBeyondLastLine: false,
    renderLineHighlight: 'gutter',
    padding: { top:6, bottom:6 },
    tabSize: 4,
    automaticLayout: true,
    scrollbar: { verticalScrollbarSize:3, horizontalScrollbarSize:3 },
    folding: true,
    glyphMargin: true,
    suggestOnTriggerCharacters: true,
    quickSuggestions: true,
    'semanticHighlighting.enabled': true,
    // Bracket-pair colorization — cycles through editorBracketHighlight.foreground1-4
    bracketPairColorization: {
      enabled: true,
      independentColorPoolPerBracketType: true,
    },
    // 2.1: Multi-cursor — Alt+Click adds cursors; Ctrl+Alt+Up/Down adds cursor above/below.
    // Column (box) selection via Shift+Alt+drag or Shift+Alt+Arrow.
    multiCursorModifier: 'alt',
    columnSelection: false,           // false = Shift+Alt+drag activates box-select
    multiCursorPaste: 'spread',       // paste N lines → spread across N cursors
    // Find widget — expose full regex replace UI
    find: {
      addExtraSpaceOnTop: false,
      autoFindInSelection: 'multiline',
      seedSearchStringFromSelection: 'selection',
    },
  });

  // P1.3 — dirty state indicator
  state.editor.onDidChangeModelContent(() => {
    const tab = document.querySelector('.pass-tab.active');
    if (tab && !tab.classList.contains('dirty')) tab.classList.add('dirty');
  });

  // 1.4: Register GLSL autocomplete
  monaco.languages.registerCompletionItemProvider('glsl', {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = getWordRange(position, word);
      // Also add user-defined symbols from the current shader
      const code = model.getValue();
      // AST-level symbol completions from glsl-parser (typed functions, variables, structs)
      const astSymbols = collectASTSymbolCompletions(code, range);
      // Fallback regex-based completions (kept for inline/anonymous patterns not caught by AST)
      const userSymbols = [];
      const fnRe = /\b(?:float|vec[234]|mat[234]|int|bool|void)\s+([a-zA-Z_]\w*)\s*\(/g;
      let m;
      while ((m = fnRe.exec(code)) !== null) {
        if (!astSymbols.some(s => s.label === m[1])) {
          userSymbols.push({ label: m[1], kind: 1, insertText: m[1], detail: 'user function', range });
        }
      }
      const varRe = /\b(?:float|vec[234]|mat[234]|int|bool)\s+([a-zA-Z_]\w*)\s*[=;,)]/g;
      while ((m = varRe.exec(code)) !== null) {
        if (!astSymbols.some(s => s.label === m[1])) {
          userSymbols.push({ label: m[1], kind: 4, insertText: m[1], detail: 'variable', range });
        }
      }
      const uniformSymbols = collectUniformSuggestions(code, range);
      const sliderSymbols = collectSliderSuggestions(range);
      return {
        suggestions: [
          ...GLSL_BUILTINS.map(s => ({...s, range})),
          ...SHADERTOY_UNIFORMS.map(s => ({...s, range})),
          ...SNIPPET_COMPLETIONS.map(s => ({ ...s, range })),
          ...collectUniformSuggestions(code, range),
          ...collectSliderSuggestions(range),
          ...astSymbols,
          ...userSymbols,
        ]
      };
    }
  });

  // §3.1 — sticky scroll : garde la signature de fonction visible en haut
  // pendant qu'on défile dans son corps.
  // Fix 5.6 — upgraded to monaco-editor 0.55.1 (from 0.34.1). stickyScroll and
  // inlayHints are now officially typed in IEditorOptions; the @type cast is no longer
  // needed but kept as a no-op for forward compat with any future strict type checks.
  state.editor.updateOptions(/** @type {any} */ ({
    stickyScroll: { enabled: true, maxLineCount: 3 },
    inlayHints: { enabled: 'on' }, // §3.5 — valeurs d'uniforms inline
  }));

  // §3.2 — Insertion de snippets par déclencheur "//".
  // Taper "//" (puis un préfixe) ouvre une liste combinant les snippets
  // intégrés (constants.js) ET les snippets utilisateur/communauté
  // (snippet-library.js). Accepter remplace le "//préfixe" saisi.
  monaco.languages.registerCompletionItemProvider('glsl', {
    triggerCharacters: ['/'],
    provideCompletionItems(model, position) {
      const lineText = model.getValueInRange({
        startLineNumber: position.lineNumber, startColumn: 1,
        endLineNumber: position.lineNumber, endColumn: position.column,
      });
      const m = /\/\/(\w*)$/.exec(lineText);
      if (!m) return { suggestions: [] };
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: position.column - m[0].length, // inclut les "//"
        endColumn: position.column,
      };

      const suggestions = [];
      // Snippets intégrés (clé → corps)
      for (const [key, body] of Object.entries(SNIPPETS)) {
        suggestions.push({
          label: '//' + key,
          kind: 27, // Snippet
          insertText: body,
          insertTextRules: 4, // InsertAsSnippet
          detail: 'Z-GL snippet',
          filterText: '//' + key,
          sortText: '0' + key,
          range,
        });
      }
      // Snippets utilisateur + communauté
      let userList = [];
      try { userList = listSnippets(); } catch { userList = []; }
      for (const s of userList) {
        const name = s.name || 'snippet';
        suggestions.push({
          label: '//' + name,
          kind: 27,
          insertText: s.code || '',
          insertTextRules: 4,
          detail: s.builtin ? 'Community snippet' : 'My snippet',
          documentation: (s.tags || []).join(', '),
          filterText: '//' + name,
          sortText: (s.builtin ? '1' : '2') + name,
          range,
        });
      }
      return { suggestions };
    },
  });

  // Phase 5 — Completion provider for categorized snippet library functions
  monaco.languages.registerCompletionItemProvider('glsl', {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = getWordRange(position, word);
      let snippets = [];
      try { snippets = listSnippets(); } catch { snippets = []; }
      return {
        suggestions: snippets
          .filter(s => s.code && !s.code.startsWith('void mainImage'))
          .map(s => ({
            label: s.name,
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: s.code,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.KeepWhitespace,
            detail: (s.category ? `[${s.category}] ` : '') + (s.tags || []).join(', '),
            documentation: { value: '```glsl\n' + s.code.slice(0, 300) + '\n```' },
            sortText: (s.builtin ? 'b' : 'a') + s.name,
            range,
          })),
      };
    },
  });

  // §3.1 — Contrôle de la taille de police (Ctrl+= / Ctrl+- / Ctrl+0),
  // comme un navigateur. Persisté dans localStorage (sl_editorFont).
  const _FONT_MIN = 8, _FONT_MAX = 32, _FONT_DEFAULT = 12;
  function _adjustFontSize(delta) {
    if (!state.editor) return;
    const cur = state.editor.getOption(monaco.editor.EditorOption.fontInfo).fontSize;
    const next = delta === 0 ? _FONT_DEFAULT : Math.max(_FONT_MIN, Math.min(_FONT_MAX, Math.round(cur + delta)));
    state.editor.updateOptions({ fontSize: next });
    try { localStorage.setItem('sl_editorFont', String(next)); } catch { /* noop */ }
  }
  // Restaure la taille mémorisée
  try {
    const savedFont = parseInt(localStorage.getItem('sl_editorFont') || '', 10);
    if (savedFont >= _FONT_MIN && savedFont <= _FONT_MAX) state.editor.updateOptions({ fontSize: savedFont });
  } catch { /* noop */ }
  state.editor.addAction({
    id: 'z-gl.font-zoom-in',
    label: 'Editor: Increase Font Size',
    keybindings: [
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Equal,
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.NumpadAdd,
    ],
    run: () => _adjustFontSize(+1),
  });
  state.editor.addAction({
    id: 'z-gl.font-zoom-out',
    label: 'Editor: Decrease Font Size',
    keybindings: [
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Minus,
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.NumpadSubtract,
    ],
    run: () => _adjustFontSize(-1),
  });
  state.editor.addAction({
    id: 'z-gl.font-zoom-reset',
    label: 'Editor: Reset Font Size',
    keybindings: [
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Digit0,
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Numpad0,
    ],
    run: () => _adjustFontSize(0),
  });

  // 1.4: Ctrl+S → apply+parse
  state.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, applyAndParseActive);
  // Ctrl+Enter also
  state.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, applyAndParseActive);
  state.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyR, () => renameWordAtCursor(state.editor));

  state.editor.addAction({
    id: 'z-gl.rename-symbol',
    label: 'Rename Symbol',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyR],
    run: () => renameWordAtCursor(state.editor),
  });

  // 2.1: Multi-cursor — add cursor above / below via Ctrl+Alt+Up / Ctrl+Alt+Down.
  // Monaco ships these as built-in commands; we surface them as named actions so
  // they appear in the Z-GL command palette and the keybinding is discoverable.
  state.editor.addAction({
    id: 'z-gl.cursor-add-above',
    label: 'Add Cursor Above',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.UpArrow],
    run: (ed) => ed.trigger('keyboard', 'editor.action.insertCursorAbove', null),
  });
  state.editor.addAction({
    id: 'z-gl.cursor-add-below',
    label: 'Add Cursor Below',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.DownArrow],
    run: (ed) => ed.trigger('keyboard', 'editor.action.insertCursorBelow', null),
  });
  state.editor.addAction({
    id: 'z-gl.cursor-select-all-occurrences',
    label: 'Select All Occurrences of Current Word',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyL],
    run: (ed) => ed.trigger('keyboard', 'editor.action.selectHighlights', null),
  });
  state.editor.addAction({
    id: 'z-gl.cursor-add-next-occurrence',
    label: 'Add Cursor at Next Occurrence',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyD],
    run: (ed) => ed.trigger('keyboard', 'editor.action.addSelectionToNextFindMatch', null),
  });
  // Column (box) selection toggle — Shift+Alt+drag works natively with columnSelection:false;
  // this action provides a keyboard shortcut to toggle the mode explicitly.
  state.editor.addAction({
    id: 'z-gl.toggle-column-selection',
    label: 'Toggle Column Selection Mode',
    keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.Insert],
    run: (ed) => {
      const current = ed.getOption(monaco.editor.EditorOption.columnSelection);
      ed.updateOptions({ columnSelection: !current });
    },
  });
  // Open the built-in Monaco find-replace widget with regex pre-enabled.
  state.editor.addAction({
    id: 'z-gl.find-replace-regex',
    label: 'Find / Replace with Regex',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyH],
    run: (ed) => {
      ed.trigger('keyboard', 'editor.action.startFindReplaceAction', null);
    },
  });

  // 2.1: Command Palette — Ctrl+Shift+P opens Z-GL-scoped palette.
  // We register it both as an editor action (so it works when the editor has
  // focus) and as a document keydown listener (so it works anywhere in the UI).
  state.editor.addAction({
    id: 'z-gl.command-palette',
    label: 'Open Command Palette',
    // Phase T — Ctrl+K added alongside Ctrl+Shift+P (more ergonomic, matches
    // the VSCode/macOS convention users already expect for a command palette).
    keybindings: [
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyP,
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK,
    ],
    run: () => openCommandPalette(),
  });

  monaco.languages.registerDocumentFormattingEditProvider('glsl', {
    provideDocumentFormattingEdits(model) {
      const formatted = formatGLSL(model.getValue());
      return [{
        range: model.getFullModelRange(),
        text: formatted,
      }];
    },
  });

  state.editor.addAction({
    id: 'z-gl.format-document',
    label: 'Format Document (GLSL)',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF],
    run: (ed) => ed.trigger('keyboard', 'editor.action.formatDocument', null),
  });

  // F-8.4 — Alt+Shift+F: format via our own formatter + flash status
  state.editor.addAction({
    id: 'z-gl.format-glsl',
    label: 'Format GLSL (z-gl)',
    keybindings: [monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.KeyF],
    run: (ed) => {
      const model = ed.getModel();
      if (!model) return;
      const raw = model.getValue();
      const fmt = formatGLSL(raw);
      if (fmt !== raw) {
        const pos = ed.getPosition();
        model.setValue(fmt);
        if (pos) ed.setPosition(pos);
      }
      flashFormattedStatus();
    },
  });

  monaco.languages.registerDocumentHighlightProvider('glsl', {
    provideDocumentHighlights(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return [];
      const name = word.word;
      if (!/^[A-Za-z_]\w*$/.test(name)) return [];

      const src = model.getValue();
      const lines = src.split('\n');
      const highlights = [];

      const WRITE_RE = new RegExp(
        '(?:^|[^.\\w])' + name + '\\s*(?:[+\\-*\\/&|^%]?=(?!=)|\\+\\+|--)',
      );

      for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        const tokenRe = new RegExp('(?<![.\\w])' + name + '(?![\\w])', 'g');
        let m;
        while ((m = tokenRe.exec(line)) !== null) {
          const col = m.index + 1;
          const isWrite = WRITE_RE.test(line.slice(0, m.index + name.length + 10));
          highlights.push({
            range: new monaco.Range(li + 1, col, li + 1, col + name.length),
            kind: isWrite
              ? monaco.languages.DocumentHighlightKind.Write
              : monaco.languages.DocumentHighlightKind.Read,
          });
        }
      }
      return highlights;
    },
  });

  state.editor.addAction({
    id: 'z-gl.find-usages',
    label: 'Find Usages',
    keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.F12],
    run: (ed) => ed.trigger('keyboard', 'editor.action.referenceSearch.trigger', null),
  });

  // P2.14 — Toggle Performance Panel shortcut
  state.editor.addAction({
    id: 'z-gl.toggle-perf-panel',
    label: 'Toggle Performance Panel',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyG],
    run: () => togglePerfPanel(),
  });

  monaco.languages.registerReferenceProvider('glsl', {
    provideReferences(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return [];
      const name = word.word;
      if (!/^[A-Za-z_]\w*$/.test(name)) return [];
      const lines = model.getValue().split('\n');
      const refs = [];
      for (let li = 0; li < lines.length; li++) {
        const tokenRe = new RegExp('(?<![.\\w])' + name + '(?![\\w])', 'g');
        let m;
        while ((m = tokenRe.exec(lines[li])) !== null) {
          refs.push({
            uri: model.uri,
            range: new monaco.Range(li + 1, m.index + 1, li + 1, m.index + 1 + name.length),
          });
        }
      }
      return refs;
    },
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyP') {
      e.preventDefault();
      openCommandPalette();
    } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.code === 'KeyK') {
      e.preventDefault();
      openCommandPalette();
    }
  });

  // 1.4: Cursor position in header
  state.editor.onDidChangeCursorPosition(e => {
    document.getElementById('curpos').textContent =
      `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
  });

  document.getElementById('curpos')?.addEventListener('click', () => {
    const pos = state.editor?.getPosition();
    if (pos) { state.editor.revealLineInCenter(pos.lineNumber); state.editor.focus(); }
  });

  document.getElementById('sbPassBadge')?.addEventListener('click', () => {
    const id = state.mp?.active;
    if (!id) return;
    document.getElementById('ptab-' + id)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  });

  // Phase Y — drag a slider row from the sidebar (via its ⠿ handle, see
  // slDragStart in drag-drop.js) and drop it onto the editor → insert the
  // variable name at the drop position.
  const mcEl = document.getElementById('mc');
  mcEl?.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  mcEl?.addEventListener('drop', e => {
    const name = e.dataTransfer.getData('text/plain');
    if (!name) return;
    const target = state.editor.getTargetAtClientPoint(e.clientX, e.clientY);
    const pos = target?.position;
    if (!pos) return;
    e.preventDefault();
    state.editor.executeEdits('slider-drag-insert', [{
      range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
      text: name,
    }]);
    state.editor.focus();
  });

  // Phase Y — Ctrl+click on a #define / slider name in the editor → jump to
  // its row in the sidebar (scroll + temporary highlight).
  state.editor.onMouseDown(e => {
    if (!e.event.ctrlKey) return;
    const pos = e.target?.position;
    const model = pos && state.editor.getModel();
    const word = model?.getWordAtPosition(pos);
    const entry = word && findSliderEntry(word.word);
    if (!entry) return;
    e.event.preventDefault();
    const row = document.getElementById('sr-' + entry.id);
    if (!row) return;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.remove('sl-flash');
    void row.offsetWidth;
    row.classList.add('sl-flash');
    setTimeout(() => row.classList.remove('sl-flash'), 400);
  });

  // Phase 22.1 — On change → sync sliders + type-check (debounce adaptatif)
  // Le délai varie selon la complexité du shader (Simple: 150 ms … Complex: 900 ms)
  // afin de ne jamais saturer le thread principal sur des shaders lourds.
  state.editor.onDidChangeModelContent(() => {
    if (isFromSlider()) return;
    const src = state.editor.getValue();
    adaptiveDebounce('editor-main', src, () => {
      syncSlidersFromCode(src);
      applyCompileMarkers(state.editor);
      applyTypeCheckMarkers(state.editor);
    });
  });

  // Restore shared shader after Monaco is ready.
  // If no hash payload is present, keep default example behavior.
  (async () => {
    const restored = await restoreFromHash();
    if (!restored) setTimeout(applyAndParse, 150);
    setTimeout(() => applyCompileMarkers(state.editor), 180);
    setTimeout(() => applyTypeCheckMarkers(state.editor), 220);
    // Minimap starts enabled — reflect that in the button state
    const minimapBtn = document.getElementById('minimapBtn');
    if (minimapBtn) minimapBtn.classList.add('active');
    // §3.5 — valeurs live des uniforms en inlay hints
    initInlayUniformValues();
    // §7.3 — badge de complexité du shader
    initComplexityBadge();
    // UI v2 — manipulation directe & inspecteur
    initValueScrub();     // §A.3 scrub de nombres
    initColorInline();    // §A.2 couleurs inline
    initHoverInspector(); // §E.1 inspecteur au survol
    initShaderAnatomy();  // §G.3 overlay anatomie
  })();
})()

// Toggle the minimap on/off and keep the toolbar button in sync.
export function toggleMinimap() {
  if (!state.editor) return;
  const current = state.editor.getOption(monaco.editor.EditorOption.minimap).enabled;
  state.editor.updateOptions({ minimap: { enabled: !current } });
  const btn = document.getElementById('minimapBtn');
  if (btn) btn.classList.toggle('active', !current);
}

export { openCommandPalette };

export { GLSL_BUILTINS, SHADERTOY_UNIFORMS, SNIPPET_COMPLETIONS };

// 9.4-B: Shader includes — wire resolveIncludes into the apply pipeline
import { resolveIncludes } from '../shader/shader-includes.js';
export { resolveIncludes };

// 9.4-D: Snippet / macro library
import {
  openSnippetLibrary,
  closeSnippetLibrary,
  toggleSnippetLibrary,
  listSnippets,
  getSnippet,
  saveSnippet,
  deleteSnippet,
  insertSnippetIntoEditor,
  exportSnippetsToJSON,
  importSnippetsFromJSON,
  saveCurrentSelectionAsSnippet,
} from './snippet-library.js';

export {
  openSnippetLibrary,
  closeSnippetLibrary,
  toggleSnippetLibrary,
  listSnippets,
  getSnippet,
  saveSnippet,
  deleteSnippet,
  insertSnippetIntoEditor,
  exportSnippetsToJSON,
  importSnippetsFromJSON,
  saveCurrentSelectionAsSnippet,
};

// ── F-1.2 : Block Palette ────────────────────────────────────────────────────
import {
  openBlockPalette,
  closeBlockPalette,
  toggleBlockPalette,
  insertGLSLBlock,
} from './block-palette.js';

export { openBlockPalette, closeBlockPalette, toggleBlockPalette, insertGLSLBlock };

if (typeof monaco !== 'undefined' && state.editor) {
  state.editor.addAction({
    id:    'z-gl.toggle-block-palette',
    label: 'Toggle Block Palette (F-1.2)',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyK],
    run:   () => toggleBlockPalette(),
  });
}

_ensureBrowserFileDrop();

if (typeof state.editor !== 'undefined' && state.editor) {
  state.editor.addAction({
    id:    'z-gl.toggle-colorblindness-panel',
    label: 'Toggle Color Blindness Mode (Phase 21.2)',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyB],
    run:   () => toggleColorBlindnessPanel(),
  });

  state.editor.addAction({
    id:    'z-gl.toggle-settings-panel',
    label: 'Toggle Settings (Phase 21.1)',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Comma],
    run:   () => toggleSettingsPanel(),
  });
}
// ── Phase 18.2 — Import fichiers locaux ──────────────────────────────────────

export function openLocalShaderFile() {
  openLocalFileDialog();
}

export function openLocalZipFile() {
  openZipFileDialog();
}

export function _ensureBrowserFileDrop() {
  initBrowserFileDrop(document.body);
}

// ── Phase 15.3 — Ray Marching Assistant ──────────────────────────────────────

let _rmAssistant = null;
let _sdfViz      = null;
let _sdfComposer = null;

async function _getRaymarchAssistant() {
  if (_rmAssistant) return _rmAssistant;
  const { initRaymarchAssistant } = await import('../render/raymarch-assistant.js');
  const { initSdfVisualizer, updateSrc: sdfVizUpdateSrc } = await import('../render/sdf-visualizer.js');
  _sdfViz = initSdfVisualizer();
  _rmAssistant = initRaymarchAssistant({
    onApply: (params) => {
      const src = state.editor?.getValue();
      if (!src) return;
      const { getInjectedSrc } = _rmAssistantModule;
      const patched = getInjectedSrc(src);
      if (patched !== src) state.editor?.setValue(patched);
    },
    onOpenSdfViz: () => _sdfViz?.toggle(),
  });
  return _rmAssistant;
}

let _rmAssistantModule = null;

async function _ensureRaymarchModule() {
  if (_rmAssistantModule) return _rmAssistantModule;
  _rmAssistantModule = await import('../render/raymarch-assistant.js');
  return _rmAssistantModule;
}

export async function toggleRaymarchAssistant() {
  const mod = await _ensureRaymarchModule();
  const ui  = await _getRaymarchAssistant();
  const src = state.editor?.getValue() ?? '';
  mod.refresh(src);
  ui.toggle();
}

export async function openRaymarchAssistant() {
  const ui  = await _getRaymarchAssistant();
  const mod = await _ensureRaymarchModule();
  const src = state.editor?.getValue() ?? '';
  mod.refresh(src);
  ui.open();
}

export async function toggleSdfVisualizer() {
  await _getRaymarchAssistant();
  const src = state.editor?.getValue() ?? '';
  if (_sdfViz) { _sdfViz.updateSrc ? _sdfViz.updateSrc(src) : null; _sdfViz.toggle(); }
}

export async function toggleSdfComposer() {
  if (!_sdfComposer) {
    const { initSdfComposer } = await import('../render/sdf-composer.js');
    _sdfComposer = initSdfComposer({
      onInsert: (code) => {
        const editor = state.editor;
        if (!editor) return;
        const selection = editor.getSelection();
        editor.executeEdits('sdf-composer', [{ range: selection, text: '\n' + code + '\n' }]);
      },
    });
  }
  _sdfComposer.toggle();
}

// Auto-detect raymarch on editor change
export function _setupRaymarchAutoDetect() {
  if (!state.editor) return;
  state.editor.onDidChangeModelContent(() => {
    if (!_rmAssistant) return;
    const src = state.editor.getValue();
    import('../render/raymarch-assistant.js').then(mod => mod.autoDetectAndShow(src));
  });
}

if (typeof monaco !== 'undefined' && state.editor) {
  state.editor.addAction({
    id:    'z-gl.toggle-raymarch-assistant',
    label: 'Toggle Ray Marching Assistant (Phase 15.3)',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyM],
    run:   () => toggleRaymarchAssistant(),
  });
}


// ── Phase 19.2 — Bibliothèque de LUTs ─────────────────────────────────────────

let _lutLibPanel = null;

async function _ensureLUTLibPanel() {
  if (!_lutLibPanel) {
    const { initLUTLibPanel, openPanel, closePanel, togglePanel } = await import('../render/lut-library-panel.js');
    await initLUTLibPanel();
    _lutLibPanel = { open: openPanel, close: closePanel, toggle: togglePanel };
  }
  return _lutLibPanel;
}

export async function openLUTLibPanel() {
  const p = await _ensureLUTLibPanel();
  p.open();
}

export async function closeLUTLibPanel() {
  if (_lutLibPanel) _lutLibPanel.close();
}

export async function toggleLUTLibPanel() {
  const p = await _ensureLUTLibPanel();
  p.toggle();
}

if (typeof monaco !== 'undefined' && state.editor) {
  state.editor.addAction({
    id:    'z-gl.toggle-lut-library',
    label: 'Toggle LUT Library (Phase 19.2)',
    // Ctrl+Shift+L was already bound to Monaco's "Select All Occurrences"
    // (z-gl.cursor-select-all-occurrences) — real, live keybinding collision
    // where the LUT toggle silently never fired. Moved to a free slot.
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyU],
    run:   () => toggleLUTLibPanel(),
  });
}

let _lut1dEditor = null;

async function _ensureLUT1DEditor() {
  if (!_lut1dEditor) {
    const { openLUT1DEditor, closeLUT1DEditor, toggleLUT1DEditor } = await import('../render/lut-1d-editor.js');
    _lut1dEditor = { open: openLUT1DEditor, close: closeLUT1DEditor, toggle: toggleLUT1DEditor };
  }
  return _lut1dEditor;
}

export async function toggleLUT1DEditor() {
  const p = await _ensureLUT1DEditor();
  p.toggle();
}

// ── F-8.2 — Includes Manager Panel ───────────────────────────────────────────

export function toggleIncludesPanel() {
  import('./includes-panel.js').then(m => m.toggle());
}

// ── Phase 19.4 — Documentation GLSL embarquée ────────────────────────────────

export function openShaderDocs(word) {
  openShaderDocPanel(word || '');
}

export function closeShaderDocs() {
  closeShaderDocPanel();
}

export function toggleShaderDocs(word) {
  toggleShaderDocPanel(word || '');
}

// ── Phase 20.1 — Workspace multi-projets ──────────────────────────────────────

let _workspacePanel = null;

async function _ensureWorkspacePanel() {
  if (!_workspacePanel) {
    const { initWorkspacePanel, openPanel, closePanel, togglePanel } = await import('./workspace-panel.js');
    await initWorkspacePanel();
    _workspacePanel = { open: openPanel, close: closePanel, toggle: togglePanel };
  }
  return _workspacePanel;
}

export async function openWorkspacePanel() {
  const p = await _ensureWorkspacePanel();
  p.open();
}

export async function closeWorkspacePanel() {
  if (_workspacePanel) _workspacePanel.close();
}

export async function toggleWorkspacePanel() {
  const p = await _ensureWorkspacePanel();
  p.toggle();
}

// ── Phase 20.2 — Versioning local intégré ────────────────────────────────────

// Monaco action — Ctrl+Shift+Z (registered eagerly; panel is lazy-loaded on first use)
if (typeof monaco !== 'undefined' && state.editor) {
  state.editor.addAction({
    id:    'z-gl.toggle-version-history',
    label: 'Toggle Historique de versions (Phase 20.2)',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyZ],
    run:   () => toggleVersionHistory(),
  });
}

let _vhPanel = null;

async function _ensureVHPanel() {
  if (!_vhPanel) {
    await initVersionHistoryPanel();
    _vhPanel = { open: _vhOpenPanel, close: _vhClosePanel, toggle: _vhTogglePanel };
  }
  return _vhPanel;
}

export async function openVersionHistory(projectId) {
  const p = await _ensureVHPanel();
  p.open(projectId || state.activeProjectId || null);
}

export async function closeVersionHistory() {
  if (_vhPanel) _vhPanel.close();
}

export async function toggleVersionHistory(projectId) {
  const p = await _ensureVHPanel();
  p.toggle(projectId || state.activeProjectId || null);
}

// ── Phase 20.3 — Bibliothèque de shaders ─────────────────────────────────────

// Monaco action — Ctrl+Shift+F
if (typeof monaco !== 'undefined' && state.editor) {
  state.editor.addAction({
    id:    'z-gl.toggle-shader-library',
    label: 'Toggle Shader Library (Phase 20.3)',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF],
    run:   () => toggleShaderLibrary(),
  });
}

let _libPanel = null;

async function _ensureLibPanel() {
  if (!_libPanel) {
    const { initShaderLibraryPanel, openPanel, closePanel, togglePanel } =
      await import('./shader-library-panel.js');
    await initShaderLibraryPanel();
    _libPanel = { open: openPanel, close: closePanel, toggle: togglePanel };
  }
  return _libPanel;
}

export async function openShaderLibrary() {
  const p = await _ensureLibPanel();
  p.open();
}

export async function closeShaderLibrary() {
  if (_libPanel) _libPanel.close();
}

export async function toggleShaderLibrary() {
  const p = await _ensureLibPanel();
  p.toggle();
}

// Auto-commit silencieux déclenché après chaque Ctrl+S / Ctrl+Enter (applyAndParseActive)
// Seulement si un projet est actif — message automatique, sans prompt, force=false (skip si rien n'a changé)
(function _wireAutoCommitOnSave() {
  const _origAddCommand = state.editor?.addCommand?.bind(state.editor);
  // On écoute l'événement custom que multipass.js peut émettre, mais le moyen le plus
  // fiable ici est de wrapper les touches via un listener global sur keydown:
  document.addEventListener('keydown', async (e) => {
    const isSave  = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.code === 'KeyS';
    const isEnter = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.code === 'Enter';
    if (!isSave && !isEnter) return;
    const pid = state.activeProjectId;
    if (!pid) return;
    // Décaler après que applyAndParseActive ait fini (prochain microtask)
    await Promise.resolve();
    try {
      const autoCommit = commit;
      await autoCommit(pid, '', { force: false }); // force=false → skip si code identique
    } catch { /* version-history non disponible, pas bloquant */ }
  }, { capture: false });
})();
document.addEventListener('keydown', async (e) => {
  if ((e.ctrlKey || e.metaKey) && e.altKey && e.key === 'c') {
    e.preventDefault();
    const pid = state.activeProjectId;
    if (!pid) return;
    const msg = prompt('Message du commit :', '') ?? null;
    if (msg === null) return;
    const c = await commit(pid, msg, { force: true });
    if (!c) {
      toast('No changes', 'info');
      return;
    }
    toast('✔ Commit saved', 'ok');
  }
});

// Global F1 keyboard shortcut (when editor is not focused)
document.addEventListener('keydown', async (e) => {
  if (e.key === 'F1' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const activeEl = document.activeElement;
    const inEditor = activeEl?.closest?.('.monaco-editor');
    if (!inEditor) {
      e.preventDefault();
      openShaderDocPanel('');
    }
  }
});
