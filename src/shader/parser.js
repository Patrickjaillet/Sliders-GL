// GLSL shader constant parser

import { state } from '../core/state.js';

// Each entry: { id, value, defaultValue, min, max, step, decimals,
//               line (0-based), col (0-based), matchLen, label, hint, category,
//               pinned, isDefine, isConst, defineName }

// Lines we never touch
const SKIP_LINE = [/^\s*\/\//, /^\s*\*/, /precision\s/, /^\s*$/, /^\s*\/\*/, /^\s*#(?:extension|pragma|version)\s/];
// Identifiers before number that signal "skip this"
const SKIP_CTX_BEFORE = /[.\w]$/;
const HAS_DIGIT_RE = /\d/;
const DEFINE_NUMERIC_RE = /^\s*#define\s+([A-Z_][A-Z0-9_]*)\s+(-?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?)\s*(?:\/\/.*)?$/i;
const DEFINE_ANY_RE = /^\s*#define\s+([A-Z_][A-Z0-9_]*)\s+(.+?)\s*(?:\/\/.*)?$/i;
const CONST_GLOBAL_RE = /^\s*const\s+(float|int)\s+([a-zA-Z_]\w*)\s*=\s*(-?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?)\s*;/;
const FUNCTION_DECL_RE = /^\s*(void|vec[234]|mat[234]|float|int|bool)\s+\w+\s*\([^)]*\)\s*\{?\s*$/;
const NUM_RE = /(?<![.\w])((?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?)(?![.\w])/g;
const FOR_LOOP_INIT_RE = /for\s*\(\s*(?:float|int)\s+([a-zA-Z_])\s*=/;

let _lastParseWarnings = [];

// 1.3: single-char loop variable names to skip as faux positifs
const LOOP_VAR_NAMES = new Set(['i','j','k','n','m','l','x','y','z']);

// ─────────────────────────────────────────────────────────────────────────────
// Roadmap Phase A — opt-in GLSL annotations
//
// A trailing `//` comment on a #define / const / literal line may carry one
// or more `@tag(args)` hints that override the heuristic inference below.
// Annotations are pure comments — completely invisible to shadertoy.com and
// to any other GLSL compiler — so a shader stays 100% paste-compatible:
//
//   #define SPEED 1.5   // @range(0, 5) @step(0.05) @group(Motion) @label("Vitesse")
//   const float GLOW = 0.3; // @range(0,1)
//   vec3 col = vec3(1.0, 0.5, 0.2); // @color
//
// Malformed/partial annotations (bad numbers, missing parens, unknown tags)
// are silently ignored field-by-field — the heuristic fallback always covers
// whatever an annotation didn't specify.
// ─────────────────────────────────────────────────────────────────────────────
const ANNOTATION_TAG_RE = /@(range|step|group|label|color|xy|enum|bool|angle|log|int|hidden)\s*(?:\(([^)]*)\))?/gi;

function _trailingComment(line) {
  const idx = line.indexOf('//');
  return idx >= 0 ? line.slice(idx + 2) : '';
}

// ── Colour heuristic (roadmap Phase B) ───────────────────────────────────────
// Auto-detect normalised colour literals so they render as a swatch+picker
// instead of 3/4 flat sliders — without requiring the `@color` annotation.
// Deliberately conservative: the whole RHS must be a single vecN constructor
// assigned to a colour-named variable, with every component a literal in [0,1].
const COLOR_ASSIGN_RE = /^\s*(?:const\s+)?vec([34])\s+[A-Za-z_]\w*\s*=\s*vec\1\s*\(([^()]*)\)\s*;?\s*(?:\/\/.*)?$/;
const COLOR_NAME_RE = /col|colou?r|rgb|tint|albedo|diffuse|emiss|ambient|specular|sky|fog|bg/i;

function _isColorAssignLine(line) {
  const m = COLOR_ASSIGN_RE.exec(line);
  if (!m) return false;
  const nameMatch = /vec[34]\s+([A-Za-z_]\w*)\s*=/.exec(line);
  if (!nameMatch || !COLOR_NAME_RE.test(nameMatch[1])) return false;
  const nums = m[2].split(',').map(s => parseFloat(s.trim()));
  const expected = m[1] === '4' ? 4 : 3;
  if (nums.length !== expected) return false;
  if (nums.some(n => !Number.isFinite(n) || n < 0 || n > 1)) return false;
  return true;
}

// ── XY-pad heuristic (roadmap Phase B) ───────────────────────────────────────
// `vec2 NAME = vec2(a, b)` with a position/direction-ish name → render a 2D pad
// instead of two flat sliders. Conservative: whole RHS must be the constructor.
const XY_ASSIGN_RE = /^\s*(?:const\s+)?vec2\s+[A-Za-z_]\w*\s*=\s*vec2\s*\(([^()]*)\)\s*;?\s*(?:\/\/.*)?$/;
const XY_NAME_RE = /offset|center|centre|position|\bpos\b|coord|origin|target|direction|\bdir\b|\buv\b|point|anchor|mouse/i;

function _isXYAssignLine(line) {
  const m = XY_ASSIGN_RE.exec(line);
  if (!m) return false;
  const nameMatch = /vec2\s+([A-Za-z_]\w*)\s*=/.exec(line);
  if (!nameMatch || !XY_NAME_RE.test(nameMatch[1])) return false;
  const nums = m[1].split(',').map(s => parseFloat(s.trim()));
  if (nums.length !== 2 || nums.some(n => !Number.isFinite(n))) return false;
  return true;
}

/**
 * Parse `@range/@step/@group/@label/@color` hints out of a trailing comment.
 * @param {string} commentText  Text after `//` on the source line (may be '').
 * @returns {{min?:number, max?:number, step?:number, group?:string, label?:string, color?:boolean, xy?:boolean}|null}
 */
function parseAnnotations(commentText) {
  if (!commentText || commentText.indexOf('@') === -1) return null;
  const out = {};
  ANNOTATION_TAG_RE.lastIndex = 0;
  let m;
  while ((m = ANNOTATION_TAG_RE.exec(commentText)) !== null) {
    const tag = m[1].toLowerCase();
    const argsRaw = (m[2] || '').trim();
    if (tag === 'range') {
      const parts = argsRaw.split(',').map(s => parseFloat(s.trim()));
      if (parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1]) && parts[0] !== parts[1]) {
        out.min = Math.min(parts[0], parts[1]);
        out.max = Math.max(parts[0], parts[1]);
      }
    } else if (tag === 'step') {
      const v = parseFloat(argsRaw);
      if (Number.isFinite(v) && v > 0) out.step = v;
    } else if (tag === 'group') {
      const g = argsRaw.replace(/^["']|["']$/g, '').trim();
      if (g) out.group = g;
    } else if (tag === 'label') {
      const l = argsRaw.replace(/^["']|["']$/g, '').trim();
      if (l) out.label = l;
    } else if (tag === 'color') {
      out.color = true;
    } else if (tag === 'xy') {
      out.xy = true;
    } else if (tag === 'enum') {
      // @enum("Off", "Wave", "Pulse") → enumOptions: ['Off', 'Wave', 'Pulse']
      const opts = argsRaw.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      if (opts.length > 0) out.enumOptions = opts;
    } else if (tag === 'bool') {
      out.bool = true;
    } else if (tag === 'angle') {
      // @angle, @angle(deg), @angle(rad)
      const unit = argsRaw.toLowerCase().trim();
      out.angle = (unit === 'deg' || unit === 'rad') ? unit : 'rad';
    } else if (tag === 'log') {
      // @log — render as logarithmic slider
      out.log = true;
    } else if (tag === 'int') {
      // @int — render as integer stepper (step=1, no decimals)
      out.int = true;
    } else if (tag === 'hidden') {
      // @hidden — exclude this uniform from the UI entirely
      out.hidden = true;
    }
  }
  return Object.keys(out).length ? out : null;
}

function _getNumericMeta(raw) {
  const clean = String(raw).replace(/^[+-]/, '');
  const [mantissa] = clean.split(/[eE]/);
  const trimmedDecimals = mantissa.includes('.')
    ? (mantissa.split('.')[1] || '').replace(/0+$/, '')
    : '';
  return {
    isScientific: /[eE]/.test(raw),
    decimals: mantissa.includes('.') ? Math.max(1, trimmedDecimals.length) : 0,
    scientificDecimals: mantissa.includes('.') ? trimmedDecimals.length : 0,
  };
}

function _isUnaryMinusAt(line, minusIdx) {
  if (minusIdx < 0 || line[minusIdx] !== '-') return false;
  // Avoid treating decrement operator as a sign.
  if (minusIdx > 0 && line[minusIdx - 1] === '-') return false;
  if (minusIdx + 1 < line.length && line[minusIdx + 1] === '-') return false;

  // Find previous non-whitespace char before '-'.
  let i = minusIdx - 1;
  while (i >= 0 && /\s/.test(line[i])) i--;
  if (i < 0) return true; // line starts with -num

  // Unary minus is valid after separators/operators, not after identifiers/literals.
  return /[\(\[\{,:=+\-*/%!&|^<>?]/.test(line[i]);
}

function _localExprContext(before) {
  const pivot = Math.max(
    before.lastIndexOf(','),
    before.lastIndexOf(';'),
    before.lastIndexOf('='),
    before.lastIndexOf('{')
  );
  return before.slice(Math.max(0, pivot + 1)).toLowerCase();
}

export function getParseWarnings() {
  return _lastParseWarnings;
}

/**
 * Parse a GLSL shader source and extract all tweakable numeric constants.
 *
 * Extracts:
 *  - `#define NAME value`   (identifier pattern `[A-Z_][A-Z0-9_]*`)
 *  - `const float/int NAME = value;`  (global scope only)
 *
 * Any of the above (plus inline literals) may carry an opt-in trailing-comment
 * annotation that overrides the heuristic min/max/step/group/label — see
 * `parseAnnotations()`. Annotations are pure `//` comments, so the shader
 * stays 100% paste-compatible with shadertoy.com.
 *
 * Skips:
 *  - Comment-only lines, preprocessor directives (`#version`, `#extension`…)
 *  - Numbers that follow an identifier or `.` (struct fields, swizzles, etc.)
 *  - Single-character loop variable names (`i`, `j`, `k`, `n`, `m`, `l`, `x`, `y`, `z`)
 *
 * @param {string} code  Raw GLSL source.
 * @returns {ParsedEntry[]}  Array of mutable variable descriptors, in source order.
 *
 * @typedef {Object} ParsedEntry
 * @property {string}  id            Unique slider id (e.state. `"v0"`).
 * @property {number}  value         Current value (mutable at runtime).
 * @property {number}  defaultValue  Original parsed value (used by reset).
 * @property {number}  min           Inferred range minimum.
 * @property {number}  max           Inferred range maximum.
 * @property {number}  step          Slider step (based on decimal precision).
 * @property {number}  decimals      Decimal places to display.
 * @property {number}  line          0-based source line of the numeric token.
 * @property {number}  col           0-based column of the numeric token.
 * @property {number}  matchLen      Byte length of the token in the source.
 * @property {string}  label         Display name (define / const identifier).
 * @property {string}  hint          Tooltip hint (original source fragment).
 * @property {string}  category      Group for the slider panel (`'globals'`, `'misc'`, …).
 * @property {boolean} [isDefine]    True for `#define` entries.
 * @property {boolean} [isConst]     True for `const` entries.
 * @property {string}  [defineName]  Original `#define` macro name.
 * @property {boolean} [pinned]      Whether the slider is pinned to the top.
 * @property {string}  [tokenRaw]    Raw text of the numeric token in source.
 * @property {boolean} [isScientific] True when the token uses scientific notation.
 * @property {number}  [scientificDecimals] Decimal places in the scientific mantissa.
 * @property {boolean} [isColor]     True when a colour annotation/heuristic marked this literal.
 * @property {boolean} [isXY]        True when a vec2 XY annotation/heuristic marked this literal.
 * @property {string}  [stableKey]   Deterministic key surviving reparse — used to
 *                                    re-apply persisted customizations (label, group,
 *                                    range, order). `def:NAME` / `const:NAME` for named
 *                                    entries (rock-solid), `lit:N` (source-order index)
 *                                    for inline literals (best-effort).
 */
function parseShader(code) {
  const lines = code.split('\n');
  const entries = [];
  const warnings = [];
  let uid = 0;
  _lastParseWarnings = warnings;

  // ── 1.3: Parse #define MY_VAL 3.14 ──
  const defineMap = {}; // name → { value, line, col, raw }
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const dm = line.match(DEFINE_NUMERIC_RE);
    if (dm) {
      const name = dm[1];
      const raw = dm[2];
      const num = parseFloat(raw);
      if (!isNaN(num)) {
        const col = line.indexOf(raw, line.indexOf(name) + name.length);
        const annotations = parseAnnotations(_trailingComment(line));
        defineMap[name] = { value: num, line: li, col, raw, name, annotations };
      }
      continue;
    }

    const anyDefine = line.match(DEFINE_ANY_RE);
    if (anyDefine) {
      warnings.push({
        line: li + 1,
        name: anyDefine[1],
        raw: anyDefine[2],
        reason: 'non-literal define value',
      });
    }
  }

  state.parseWarnings = warnings;

  // ── 1.3: Parse const float/int globals ──
  const constGlobals = [];
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const cm = line.match(CONST_GLOBAL_RE);
    if (!cm) continue;
    const name = cm[2];
    const raw = cm[3];
    const num = parseFloat(raw);
    if (!isNaN(num)) {
      const col = line.indexOf(raw, line.indexOf('=') + 1);
      const annotations = parseAnnotations(_trailingComment(line));
      constGlobals.push({ name, value: num, line: li, col, raw, annotations });
    }
  }

  // Build #define entries (Globals group)
  Object.values(defineMap).forEach(d => {
    const id = 'v' + (uid++);
    const range = inferRange(d.value, d.raw, '', '');
    const meta = _getNumericMeta(d.raw);
    const ann = d.annotations;
    const stableKey = 'def:' + d.name;
    entries.push({
      id, value: d.value, defaultValue: d.value,
      min: ann?.min ?? range.min, max: ann?.max ?? range.max,
      step: ann?.int ? 1 : (ann?.step ?? range.step),
      decimals: ann?.int ? 0 : meta.decimals,
      line: d.line, col: d.col, matchLen: d.raw.length,
      tokenRaw: d.raw,
      label: ann?.label ?? d.name, hint: '#define ' + d.name + ' ' + d.raw,
      category: ann?.group ?? 'globals', isDefine: true, defineName: d.name,
      isScientific: meta.isScientific, scientificDecimals: meta.scientificDecimals,
      // Pinned state must key on the stable identity (survives reparse), not
      // the volatile `id` (reassigned 'v0','v1'… on every parse) — see roadmap audit.
      pinned: state.pinnedIds.has(stableKey),
      isColor: !!ann?.color,
      enumOptions: ann?.enumOptions ?? null,
      isBool: !!ann?.bool,
      angleUnit: ann?.angle ?? null,
      isLog: !!ann?.log,
      isInt: !!ann?.int,
      hidden: !!ann?.hidden,
      stableKey,
    });
  });

  // Build const globals entries
  constGlobals.forEach(c => {
    const id = 'v' + (uid++);
    const range = inferRange(c.value, c.raw, '', '');
    const meta = _getNumericMeta(c.raw);
    const ann = c.annotations;
    const stableKey = 'const:' + c.name;
    entries.push({
      id, value: c.value, defaultValue: c.value,
      min: ann?.min ?? range.min, max: ann?.max ?? range.max,
      step: ann?.int ? 1 : (ann?.step ?? range.step),
      decimals: ann?.int ? 0 : meta.decimals,
      line: c.line, col: c.col, matchLen: c.raw.length,
      tokenRaw: c.raw,
      label: ann?.label ?? c.name, hint: 'const ' + c.name + ' = ' + c.raw,
      category: ann?.group ?? 'globals', isConst: true,
      isScientific: meta.isScientific, scientificDecimals: meta.scientificDecimals,
      pinned: state.pinnedIds.has(stableKey),
      isColor: !!ann?.color,
      enumOptions: ann?.enumOptions ?? null,
      isBool: !!ann?.bool,
      angleUnit: ann?.angle ?? null,
      isLog: !!ann?.log,
      isInt: !!ann?.int,
      hidden: !!ann?.hidden,
      stableKey,
    });
  });

  // ── Main numeric parse ──
  let inlineIndex = 0;
  lines.forEach((line, li) => {
    if (!HAS_DIGIT_RE.test(line)) return;
    // Skip comment/directive/empty lines
    if (SKIP_LINE.some(r => r.test(line))) return;
    // Skip #define lines (already handled)
    if (/^\s*#define\s/.test(line)) return;
    // Skip const global lines (already handled)
    if (CONST_GLOBAL_RE.test(line)) return;
    // Skip pure function declaration lines
    if (FUNCTION_DECL_RE.test(line)) return;

    const forLoopVarMatch = line.match(FOR_LOOP_INIT_RE);
    const loopVar = forLoopVarMatch?.[1] || null;
    const lineAnnotations = parseAnnotations(_trailingComment(line));
    const lineIsColor = !!lineAnnotations?.color || _isColorAssignLine(line);
    const lineIsXY = !lineIsColor && (!!lineAnnotations?.xy || _isXYAssignLine(line));

    NUM_RE.lastIndex = 0;
    let m;
    while ((m = NUM_RE.exec(line)) !== null) {
      let raw = m[0];
      let col = m.index;

      // Capture unary minus as part of the token so patching preserves valid GLSL.
      const signIdx = col - 1;
      if (_isUnaryMinusAt(line, signIdx)) {
        col = signIdx;
        raw = '-' + raw;
      }

      const num = parseFloat(raw);
      if (isNaN(num)) continue;

      // Skip context: char before match must not be dot or word char
      if (col > 0 && SKIP_CTX_BEFORE.test(line[col - 1])) continue;

      const before = line.slice(0, col);
      // Skip uniforms references
      if (/iResolution|iTime|iFrame|iMouse|iDate|gl_Frag/.test(before.split('//')[0] || '')) continue;

      // ── 1.3: Skip single-char loop variables used as literals ──
      // e.state. "for(float i = 0.0;" → skip literals that are the loop initialiser value
      // when the entire numeric token equals the raw form of the loop variable default.
      // For-loop *bounds* (e.state. "i < 99.0") are intentionally kept.
      if (loopVar) {
        // Skip the initialiser literal when the token immediately follows "loopVar ="
        // e.state. "for(int i = 0" → skip the "0" bound to "i"
        if (LOOP_VAR_NAMES.has(loopVar) && before.match(new RegExp('\\b' + loopVar + '\\s*=\\s*$'))) {
          continue;
        }
      }
      // Skip numeric literals assigned directly to a single-char loop-var name
      const assignTarget = before.match(/\b([a-zA-Z_]\w*)\s*[+\-*/]?=\s*$/);
      if (assignTarget && LOOP_VAR_NAMES.has(assignTarget[1]) && raw === '0') continue;

      const id = 'v' + (uid++);
      const range = inferRange(num, raw, line, before);
      const meta = _getNumericMeta(raw);
      const label = lineAnnotations?.label ?? buildLabel(raw, line, col, before);
      const cat = lineAnnotations?.group ?? categorize(line);
      const hint = line.trim().slice(0, 55);
      const stableKey = 'lit:' + (inlineIndex++);

      entries.push({
        id, value: num, defaultValue: num,
        min: lineAnnotations?.min ?? range.min,
        max: lineAnnotations?.max ?? range.max,
        step: lineAnnotations?.int ? 1 : (lineAnnotations?.step ?? range.step),
        decimals: lineAnnotations?.int ? 0 : meta.decimals,
        line: li, col, matchLen: raw.length, tokenRaw: raw, label, hint, category: cat,
        isScientific: meta.isScientific, scientificDecimals: meta.scientificDecimals,
        pinned: state.pinnedIds.has(stableKey),
        isColor: lineIsColor,
        isXY: lineIsXY,
        isLog: !!lineAnnotations?.log,
        isInt: !!lineAnnotations?.int,
        hidden: !!lineAnnotations?.hidden,
        stableKey,
      });
    }
  });

  return entries.filter(e => !e.hidden);
}

function inferRange(num, raw, line, before) {
  const ctx = (line + ' ' + before).toLowerCase();
  const localCtx = _localExprContext(before);
  const isFloat = raw.includes('.');
  const isNeg = num < 0;
  const abs = Math.abs(num);

  if (/for\s*\([^)]*</.test(line) && num > 1) {
    return { min: 1, max: Math.max(300, num * 4), step: 1 };
  }
  if (/(?:^|\W)(?:sin|cos)\s*\($/.test(localCtx) || /angle|rotate/.test(localCtx || ctx)) {
    return { min: -Math.PI * 2, max: Math.PI * 2, step: 0.01 };
  }
  if (!isNeg && abs <= 1.0 && isFloat) {
    return { min: 0, max: 1, step: 0.005 };
  }
  if (/vec\d/.test(before) && !isNeg && abs < 20) {
    return { min: -abs * 3 - 2, max: abs * 3 + 2, step: abs > 2 ? 0.05 : 0.01 };
  }
  if (isNeg) {
    return { min: -(abs * 4 + 4), max: abs * 4 + 4, step: abs > 5 ? 0.5 : 0.05 };
  }
  if (!isFloat && abs > 10) {
    return { min: 1, max: Math.max(500, abs * 3), step: 1 };
  }
  const span = Math.max(abs * 4, 4);
  return { min: 0, max: span, step: isFloat ? (span > 10 ? 0.05 : 0.01) : 1 };
}

function buildLabel(raw, line, col, before) {
  if (/for\s*\([^)]*</.test(line)) return 'loop limit';
  const vecM = before.match(/(\w+)\s*\(\s*$/);
  if (vecM || /vec\d\s*\(/.test(before)) {
    const sub = before.slice(before.lastIndexOf('(') + 1);
    const commas = (sub.match(/,/g) || []).length;
    const fn = before.match(/(\w+)\s*\(\s*$/)?.[1] || 'vec';
    return fn + '.' + ['x','y','z','w'][commas];
  }
  const asgn = before.match(/\b([a-zA-Z_]\w*)\s*[+\-*/]?=\s*[^=]?/);
  if (asgn && !['for','if','while','return'].includes(asgn[1])) return asgn[1];
  const fnArg = before.match(/(\w+)\s*\(\s*[^)]*$/);
  if (fnArg) return fnArg[1] + '()';
  return (before.trim().slice(-16) + raw).trim().slice(0, 22);
}

function categorize(line) {
  const l = line.toLowerCase();
  if (/rotate|angle|sin|cos/.test(l)) return 'rotation';
  if (/hsv|hue|sat|rgb|color/.test(l)) return 'color';
  if (/for\s*\(/.test(l)) return 'iterations';
  if (/fold|abs|clamp|dot/.test(l)) return 'fractal';
  if (/exp|log|glow|intensity|decay/.test(l)) return 'glow';
  if (/vec3.*p\s*=|vec3.*r\s*=/.test(l)) return 'camera';
  if (/vec\d/.test(l)) return 'vectors';
  return 'misc';
}

// ─────────────────────────────────────────────────────────────────────────────
// AST-level symbol extraction  —  powered by @shaderfrog/glsl-parser
// ─────────────────────────────────────────────────────────────────────────────
//
// @shaderfrog/glsl-parser is imported dynamically so:
//   • The module resolves lazily (no top-level await needed).
//   • If the package is absent (e.g. pre-install), we fall back silently to
//     the regex stubs so all existing unit tests remain green.
//
// Once resolved, `_glslParse` holds the parse function for the lifetime of
// the module.

let _glslParse = null;

// We load @shaderfrog/glsl-parser via a runtime-constructed import() so that
// Vite's static import-analysis pass never sees the bare specifier string.
// This means:
//   • No build-time error when the package is not yet installed.
//   • The try/catch gracefully activates the regex fallback.
//   • Once `npm install` is run the real AST parser takes over automatically.
//
// Using `new Function('s', 'return import(s)')` defeats every static analyser
// (Vite, Rollup, esbuild) because the string is never a literal in source.
// eslint-disable-next-line no-new-func
const _dynamicImport = new Function('s', 'return import(s)');

(async () => {
  try {
    const mod = await _dynamicImport('@shaderfrog/glsl-parser');
    _glslParse = mod.parse ?? mod.default;
  } catch (_) {
    // Package not installed — regex fallback active.
  }
})();

// ── AST helper: extract a type token string from a specifier node ─────────────

function _astTypeStr(specifierNode) {
  if (!specifierNode) return '';
  const ts = specifierNode.specifier ?? specifierNode;
  const inner = ts.specifier ?? ts;
  if (inner?.type === 'keyword')   return inner.token   ?? '';
  if (inner?.type === 'type_name') return inner.identifier ?? '';
  if (inner?.type === 'struct')    return '[struct]';
  return '';
}

// ── AST helper: flatten qualifiers array to a string ─────────────────────────

function _astQualStr(qualifiers) {
  if (!Array.isArray(qualifiers) || !qualifiers.length) return '';
  return qualifiers
    .map(q => q.token ?? '')
    .filter(Boolean)
    .join(' ');
}

// ── AST helper: declarator_list → variable entries ───────────────────────────

function _extractVarsFromDecl(stmt, seenVar, variables) {
  const decl = stmt.declaration;
  if (!decl || decl.type !== 'declarator_list') return;
  const specType  = _astTypeStr(decl.specified_type?.specifier);
  if (!specType || specType === '[struct]') return;
  const qualifier = _astQualStr(decl.specified_type?.qualifiers);
  const line      = decl.specified_type?.specifier?.specifier?.location?.start?.line ?? 0;
  for (const d of (decl.declarations ?? [])) {
    const name = d?.identifier?.identifier ?? d?.declaration?.identifier?.identifier;
    if (!name || seenVar.has(name)) continue;
    seenVar.add(name);
    variables.push({ name, type: specType, qualifier, line });
  }
}

// ── AST helper: prototype parameters → typed param descriptors ───────────────

function _extractParams(parameters) {
  if (!Array.isArray(parameters)) return [];
  return parameters.map(p => ({
    qualifier: _astQualStr(p.qualifier),
    type:      _astTypeStr(p.specifier),
    name:      p.identifier?.identifier ?? '',
  }));
}

// ── AST helper: walk a struct node to find its type-name ─────────────────────

function _findStructTypeName(structNode) {
  if (!structNode) return null;
  if (structNode.typeName?.identifier) return structNode.typeName.identifier;
  if (typeof structNode.typeName === 'string') return structNode.typeName;
  return null;
}

// ── Regex fallback ────────────────────────────────────────────────────────────
// Used when @shaderfrog/glsl-parser hasn't loaded yet or failed to install.

const _FB_FN_RE = /^\s*(void|bool|int|uint|float|vec[234]|ivec[234]|uvec[234]|bvec[234]|mat[234](?:x[234])?)\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*\{?\s*$/;
const _FB_VAR_RE = /^\s*(?:(?:uniform|in|out|inout|const|flat|smooth|centroid)\s+)*(void|bool|int|uint|float|vec[234]|ivec[234]|uvec[234]|bvec[234]|mat[234](?:x[234])?|sampler\w*)\s+([A-Za-z_]\w*)\s*(?:\[[^\]]*\])?\s*(?:=|;)/;
const _FB_STRUCT_RE = /^\s*struct\s+([A-Za-z_]\w*)\s*\{/;

function _parseSymbolsFallback(code) {
  const lines = code.split('\n');
  const functions = [], variables = [], structs = [];
  const seenFn = new Set(), seenVar = new Set();
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    if (!line.trim() || /^\s*\/\//.test(line)) continue;
    const sm = line.match(_FB_STRUCT_RE);
    if (sm) { structs.push({ name: sm[1], line: li + 1 }); continue; }
    const fm = line.match(_FB_FN_RE);
    if (fm && !seenFn.has(fm[2])) {
      seenFn.add(fm[2]);
      const params = (fm[3] || '').split(',').filter(Boolean).map(tok => {
        const p = tok.trim().split(/\s+/);
        return p.length >= 3
          ? { qualifier: p[0], type: p[1], name: p[2].replace(/\[.*\]$/, '') }
          : p.length === 2
            ? { qualifier: '', type: p[0], name: p[1].replace(/\[.*\]$/, '') }
            : { qualifier: '', type: p[0] || '', name: '' };
      });
      functions.push({ name: fm[2], returnType: fm[1], params, line: li + 1 });
      continue;
    }
    const vm = line.match(_FB_VAR_RE);
    if (vm && !seenVar.has(vm[2])) {
      seenVar.add(vm[2]);
      const prefix = line.slice(0, line.indexOf(vm[1])).trim();
      variables.push({ name: vm[2], type: vm[1], qualifier: prefix || '', line: li + 1 });
    }
  }
  return { functions, variables, structs };
}

// ── Public: parseSymbols ──────────────────────────────────────────────────────

/**
 * Parse a GLSL source string and return a structured symbol table.
 *
 * Uses @shaderfrog/glsl-parser for AST-accurate results when available,
 * with a silent regex fallback for incomplete/pre-install environments.
 *
 * @param {string} code  Raw GLSL source.
 * @returns {{
 *   functions: Array<{name:string, returnType:string, params:Array<{type:string, name:string, qualifier:string}>, line:number}>,
 *   variables: Array<{name:string, type:string, qualifier:string, line:number}>,
 *   structs:   Array<{name:string, line:number}>,
 * }}
 */
export function parseSymbols(code) {
  if (_glslParse) {
    try {
      const ast = _glslParse(code, { quiet: true });
      const functions = [], variables = [], structs = [];
      const seenFn = new Set(), seenVar = new Set();

      for (const stmt of (ast.program ?? [])) {
        if (stmt.type === 'function') {
          const proto  = stmt.prototype;
          const header = proto?.header;
          const name   = header?.name?.identifier;
          if (name && !seenFn.has(name)) {
            seenFn.add(name);
            functions.push({
              name,
              returnType: _astTypeStr(header.returnType),
              params:     _extractParams(proto?.parameters),
              line:       header?.name?.location?.start?.line ?? 0,
            });
          }
          continue;
        }

        if (stmt.type === 'declaration_statement') {
          // Struct embedded in the specifier
          const specInner = stmt.declaration?.specified_type?.specifier?.specifier;
          if (specInner?.type === 'struct') {
            const typeName = _findStructTypeName(specInner);
            if (typeName && !structs.some(s => s.name === typeName)) {
              structs.push({ name: typeName, line: specInner.location?.start?.line ?? 0 });
            }
          }
          _extractVarsFromDecl(stmt, seenVar, variables);
        }
      }
      return { functions, variables, structs };
    } catch (_) {
      // Incomplete source while typing — fall through to regex fallback.
    }
  }
  return _parseSymbolsFallback(code);
}

// ─────────────────────────────────────────────────────────────────────────────
// Type-check  — AST syntax errors + heuristic arity/int→float checks
// ─────────────────────────────────────────────────────────────────────────────
//
// Two-tier approach:
//   1. Real syntax errors from @shaderfrog/glsl-parser (e.location gives
//      exact line/column). When a hard syntax error is found we stop here
//      because the heuristic pass over broken source would be very noisy.
//   2. Heuristic call-site scan: arity mismatches against known GLSL built-ins,
//      undeclared user function calls, and integer literals passed to float fns.
//
// Returns Monaco-compatible IMarkerData[]. No Monaco import needed.

const BUILTIN_ARITIES = {
  radians:1, degrees:1, sin:1, cos:1, tan:1, asin:1, acos:1, sinh:1, cosh:1,
  tanh:1, asinh:1, acosh:1, atanh:1, exp:1, log:1, exp2:1, log2:1, sqrt:1,
  inversesqrt:1, abs:1, sign:1, floor:1, trunc:1, round:1, roundEven:1, ceil:1,
  fract:1, isnan:1, isinf:1, length:1, normalize:1, transpose:1, determinant:1,
  inverse:1, any:1, all:1, not:1, dFdx:1, dFdy:1, fwidth:1,
  pow:2, atan:[1,2], mod:2, min:2, max:2, step:2, dot:2, cross:2, distance:2,
  reflect:2, outerProduct:2, matrixCompMult:2, lessThan:2, lessThanEqual:2,
  greaterThan:2, greaterThanEqual:2, equal:2, notEqual:2,
  modf:[2,2], clamp:[3,3], mix:[3,3], smoothstep:[3,3], faceforward:[3,3],
  refract:[3,3], texture:[2,3], texture2D:[2,3],
};

const _KNOWN_BUILTINS = new Set([
  'radians','degrees','sin','cos','tan','asin','acos','atan','sinh','cosh','tanh',
  'asinh','acosh','atanh','pow','exp','log','exp2','log2','sqrt','inversesqrt',
  'abs','sign','floor','trunc','round','roundEven','ceil','fract','mod','modf',
  'min','max','clamp','mix','step','smoothstep','isnan','isinf',
  'floatBitsToInt','floatBitsToUint','intBitsToFloat','uintBitsToFloat',
  'packSnorm2x16','unpackSnorm2x16','packUnorm2x16','unpackUnorm2x16',
  'packHalf2x16','unpackHalf2x16',
  'length','distance','dot','cross','normalize','faceforward','reflect','refract',
  'matrixCompMult','outerProduct','transpose','determinant','inverse',
  'lessThan','lessThanEqual','greaterThan','greaterThanEqual','equal','notEqual',
  'any','all','not',
  'texture','texture2D','texture2DLod','textureLod','textureCube','textureProj',
  'textureSize','texelFetch','texelFetchOffset','textureGrad','textureGradOffset',
  'textureLodOffset','textureProjLod','textureProjGrad',
  'dFdx','dFdy','fwidth', 'emit','barrier',
  'mainImage','mainCubemap','mainSound',
]);
function _isKnownBuiltin(name) { return _KNOWN_BUILTINS.has(name); }

const _GLSL_CTOR_TYPES = new Set([
  'void','bool','int','uint','float',
  'vec2','vec3','vec4','ivec2','ivec3','ivec4','uvec2','uvec3','uvec4',
  'bvec2','bvec3','bvec4','mat2','mat3','mat4',
  'mat2x2','mat2x3','mat2x4','mat3x2','mat3x3','mat3x4','mat4x2','mat4x3','mat4x4',
  'sampler2D','sampler3D','samplerCube',
  'sampler2DShadow','samplerCubeShadow','sampler2DArray','sampler2DArrayShadow',
]);

const _FLOAT_FNS = new Set([
  'sin','cos','tan','sqrt','exp','log','fract','floor','ceil','abs','sign',
  'normalize','length','exp2','log2','inversesqrt','radians','degrees',
]);

function _heuristicMarkers(code, symbols) {
  const markers = [];
  const lines = code.split('\n');
  const userFnNames = new Set((symbols.functions || []).map(f => f.name));
  const userFnMap   = Object.fromEntries((symbols.functions || []).map(f => [f.name, f]));
  // Matches only the function name + opening paren; args counted below with
  // a paren-depth tracker so nested calls don't confuse the count.
  const CALL_RE = /\b([A-Za-z_]\w*)\s*\(/g;

  function _countArgs(src, start) {
    let depth = 1, i = start, argCount = 1, empty = true;
    while (i < src.length && depth > 0) {
      const ch = src[i++];
      if (ch === '(' || ch === '[') { depth++; empty = false; }
      else if (ch === ')' || ch === ']') { depth--; if (depth === 0) break; empty = false; }
      else if (ch === ',' && depth === 1) { argCount++; empty = false; }
      else if (ch > ' ') { empty = false; }
    }
    if (depth !== 0) return null;
    return { argCount: empty ? 0 : argCount, endIndex: i };
  }

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    if (!line.trim() || /^\s*\/\//.test(line) || /^\s*#/.test(line)) continue;
    const codePart = line.split('//')[0];
    CALL_RE.lastIndex = 0;
    let m;
    while ((m = CALL_RE.exec(codePart)) !== null) {
      const fnName  = m[1];
      if (_GLSL_CTOR_TYPES.has(fnName)) continue;
      if (/^(if|for|while|switch|return|discard)$/.test(fnName)) continue;
      const openParen = m.index + m[0].length;
      const parsed    = _countArgs(codePart, openParen);
      if (!parsed) continue;
      const { argCount, endIndex } = parsed;
      const argsRaw = codePart.slice(openParen, endIndex - 1).trim();
      const col    = m.index + 1;
      const endCol = col + (endIndex - m.index);
      // advance CALL_RE past this call so it doesn't re-scan args
      CALL_RE.lastIndex = endIndex;

      if (Object.prototype.hasOwnProperty.call(BUILTIN_ARITIES, fnName)) {
        const expected = BUILTIN_ARITIES[fnName];
        const [minA, maxA] = Array.isArray(expected) ? expected : [expected, expected];
        if (argCount < minA || argCount > maxA) {
          markers.push({
            startLineNumber: li + 1, endLineNumber: li + 1,
            startColumn: col, endColumn: endCol,
            message: `'${fnName}' expects ${minA === maxA ? minA : `${minA}–${maxA}`} argument${minA === 1 ? '' : 's'}, got ${argCount}.`,
            severity: 8, owner: 'glsl-typecheck',
          });
        }
      } else if (!userFnNames.has(fnName)) {
        if (/^[a-z_][a-z0-9_]*$/i.test(fnName) && !_isKnownBuiltin(fnName)) {
          markers.push({
            startLineNumber: li + 1, endLineNumber: li + 1,
            startColumn: col, endColumn: col + fnName.length,
            message: `'${fnName}' is not declared in this shader.`,
            severity: 4, owner: 'glsl-typecheck',
          });
        }
      } else {
        const uf = userFnMap[fnName];
        if (uf && uf.params.length > 0 && argCount !== uf.params.length) {
          markers.push({
            startLineNumber: li + 1, endLineNumber: li + 1,
            startColumn: col, endColumn: endCol,
            message: `'${fnName}' expects ${uf.params.length} argument${uf.params.length === 1 ? '' : 's'}, got ${argCount}.`,
            severity: 8, owner: 'glsl-typecheck',
          });
        }
      }

      if (_FLOAT_FNS.has(fnName) && argCount === 1 && /^-?\d+$/.test(argsRaw)) {
        markers.push({
          startLineNumber: li + 1, endLineNumber: li + 1,
          startColumn: col, endColumn: endCol,
          message: `'${fnName}' expects a float argument; '${argsRaw}' is an integer literal. Use '${argsRaw}.0'.`,
          severity: 4, owner: 'glsl-typecheck',
        });
      }
    }
  }
  return markers;
}

/**
 * Type-check a GLSL source string and return Monaco-compatible marker objects.
 *
 * When @shaderfrog/glsl-parser is available, real syntax errors are emitted
 * first (severity 8 = Error).  A hard syntax error short-circuits the
 * heuristic pass to avoid noisy false positives on broken source.
 *
 * @param {string} code
 * @param {{ functions: Array, variables: Array, structs: Array }} symbols
 * @returns {Array<{startLineNumber:number, startColumn:number,
 *                  endLineNumber:number, endColumn:number,
 *                  message:string, severity:number, owner:string}>}
 */
export function typeCheck(code, symbols) {
  // ── 1. AST syntax-error pass ───────────────────────────────────────────────
  if (_glslParse) {
    try {
      _glslParse(code, { quiet: true });
    } catch (e) {
      const loc = e.location;
      if (loc?.start) {
        return [{
          startLineNumber: loc.start.line   ?? 1,
          endLineNumber:   loc.start.line   ?? 1,
          startColumn:     loc.start.column ?? 1,
          endColumn:       (loc.start.column ?? 1) + 1,
          message: e.message?.replace(/\n[\s\S]*/, '').trim() || 'Syntax error',
          severity: 8,
          owner: 'glsl-typecheck',
        }];
      }
      // No location info — still stop to avoid heuristic noise.
      return [];
    }
  }

  // ── 2. Heuristic pass (arity + int→float) ─────────────────────────────────
  return _heuristicMarkers(code, symbols);
}

/**
 * Scan GLSL source for all function declarations and return their names + line positions.
 * Used by smart-insert.js (F-2.1) and code-actions.js (F-2.5).
 *
 * @param {string} code  Raw GLSL source.
 * @returns {Array<{name:string, line:number, col:number, signature:string}>}
 */
export function findFunctionDeclarations(code) {
  const FN_RE = /^\s*(void|vec[234]|mat[234]|float|int|bool|sampler\w*)\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*\{?\s*$/gm;
  const results = [];
  const lines = code.split('\n');
  lines.forEach((line, li) => {
    FN_RE.lastIndex = 0;
    const m = FN_RE.exec(line);
    if (!m) return;
    const name = m[2];
    if (name === 'main' || name === 'mainImage') return; // skip entry points
    results.push({
      name,
      line: li,
      col: line.indexOf(m[2]),
      signature: line.trim(),
    });
  });
  return results;
}

/**
 * Find the line index of `void mainImage(` in a GLSL source.
 * Returns -1 if not found.
 * @param {string} code
 * @returns {number}
 */
export function findMainImageLine(code) {
  const lines = code.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (/void\s+mainImage\s*\(/.test(lines[i])) return i;
  }
  return -1;
}

/**
 * F-8.5 — Detect high-level shader patterns to drive contextual snippet suggestions.
 *
 * Returns a Set of tag strings identifying what the shader contains:
 *   'raymarch'  — uses a ray marching / SDF loop
 *   'fbm'       — uses fractional Brownian motion / noise octaves
 *   'texture'   — samples iChannelN textures
 *   'iTime'     — animated (uses iTime)
 *   'audio'     — reads audio FFT via iChannel
 *   'no_annotations' — has tweakable literals but no @range/@label/@group
 *   'pbr'       — physically-based rendering patterns
 *   'particles' — particle / point simulation
 *   'uv_warp'   — UV distortion / domain warp
 *
 * @param {string} code  Raw GLSL source
 * @returns {Set<string>}
 */
export function detectShaderPatterns(code) {
  const tags = new Set();
  if (/rayMarch|march\s*\(|sdf|sdBox|sdSphere|map\s*\(\s*vec3/i.test(code)) tags.add('raymarch');
  if (/fbm|fBm|fBM|noise\s*\(.*octave|for.*octave|for.*oct/i.test(code)) tags.add('fbm');
  if (/texture\s*\(\s*iChannel|texelFetch\s*\(\s*iChannel/i.test(code)) tags.add('texture');
  if (/iTime|u_time|uTime/.test(code)) tags.add('iTime');
  if (/iChannel[0-3].*fft|fft.*iChannel[0-3]|audio|texelFetch.*0,\s*0\)/i.test(code)) tags.add('audio');
  if (/metallic|roughness|albedo|pbr|brdf|fresnel|schlick/i.test(code)) tags.add('pbr');
  if (/particle|emit|velocity|mass|force/i.test(code)) tags.add('particles');
  if (/warp|domain\s*warp|distort.*uv|uv.*distort/i.test(code)) tags.add('uv_warp');

  // Detect tweakable literals but no annotations
  const hasLiterals = /const\s+float|#define\s+[A-Z_]/.test(code);
  const hasAnnotations = /@range|@label|@group/.test(code);
  if (hasLiterals && !hasAnnotations) tags.add('no_annotations');

  return tags;
}

export { SKIP_LINE, SKIP_CTX_BEFORE, LOOP_VAR_NAMES, parseShader, inferRange, buildLabel, categorize, parseAnnotations };
