// src/shader/glsl-preprocess.js — §1 ROADMAP-GOLF.md
//
// Expands C-style `#define` macros in GLSL source before compilation, using
// @shaderfrog/glsl-parser's bundled preprocessor. This is what fixes the
// Shadertoy "code-golf" idiom of multi-line macros like
// `#define v normalize(vec3(` (three otherwise-invalid tokens that only
// become valid GLSL once `v` is textually substituted) — confirmed by
// direct testing that neither the GLSL AST parser nor (by the matching
// error message) the app's WebGL driver understand this pattern without
// macro expansion first, and that Shadertoy itself works only because it
// preprocesses before compiling.
//
// The tricky part: macro expansion changes line counts (a `#define` line
// disappears from the output; multi-line macro bodies can add or remove
// lines), which breaks the simple "#line 1" trick the renderer currently
// relies on to map GPU compiler error line numbers back to editor lines.
// `preprocessWithLineMap()` below builds an explicit line correspondence
// table alongside the expansion so error reporting stays accurate.

let _pp = null; // { parse, generate, preprocessAst }

// A plain dynamic import() — unlike parser.js's `new Function('s', 'return
// import(s)')` trick, this works correctly both in the real Vite-served
// app (Vite still code-splits this into its own lazy chunk; see
// optimizeDeps.exclude for '@shaderfrog/glsl-parser' in vite.config.js)
// AND under Vitest's Node-based test runner, where the `new Function`
// version throws "A dynamic import callback was not specified" (confirmed
// by direct testing — vite-node's VM context doesn't wire up a dynamic
// import callback for import() calls constructed via `new Function`,
// though a literal import() expression works fine there).
const _ready = (async () => {
  try {
    const mod = await import('@shaderfrog/glsl-parser/preprocessor/index.js');
    _pp = { parse: mod.parse, generate: mod.generate, preprocessAst: mod.preprocessAst };
  } catch (_) {
    // Package/subpath unavailable — preprocessing is skipped, source passes
    // through unchanged (see preprocessGLSL's fallback below).
  }
})();

/**
 * Resolve once the dynamic import has settled. Exported for tests/callers
 * that need to await readiness before their first call (mirrors the
 * pattern that isn't needed by parser.js's own AST parser only because its
 * callers already tolerate a fallback on the very first call).
 */
export function whenPreprocessorReady() {
  return _ready;
}

const _DIRECTIVE_TYPES = new Set([
  'define',
  'define_arguments',
  'undef',
  'version',
  'ifdef',
  'ifndef',
  'if',
  'elif',
  'else',
  'endif',
  'pragma',
  'extension',
  'error',
]);

/**
 * Build a 0-based output-line → input-line correspondence array by walking
 * the preprocessor's own top-level node list (NOT the expanded text) in
 * source order. Directive nodes (`#define` etc.) consume input lines but
 * produce zero output lines — everything else (`text` nodes, which is
 * where macro invocations get textually substituted inline) preserves a
 * 1:1 line correspondence between its own input and output, since
 * substitution happens *within* a line's text, never by inserting or
 * removing newlines inside a `text` node itself.
 *
 * This only holds because @shaderfrog/glsl-parser's preprocessor never
 * reformats or re-wraps `text` node content — verified by direct testing
 * (round-trip identical for non-directive source). If that ever changes
 * upstream, this mapping would need revisiting.
 *
 * @param {string} src
 * @returns {number[]} map[outputLineIndex] = inputLineIndex
 */
function _buildLineMap(src) {
  const ast = _pp.parse(src, {});
  const map = [];
  let inputLine = 0;
  let outputLine = 0;

  for (const node of ast.program ?? []) {
    if (_DIRECTIVE_TYPES.has(node.type)) {
      const raw = _pp.generate(node);
      // A directive's own rendered text always ends in the newline that
      // terminated it (or EOF) — count only *interior* newlines as
      // "lines consumed", matching how the text-node loop below counts.
      const interiorNewlines = (raw.match(/\n/g) || []).length;
      inputLine += Math.max(1, interiorNewlines || 1);
      continue;
    }
    if (node.type === 'text') {
      const lines = node.text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        map[outputLine] = inputLine;
        outputLine++;
        inputLine++;
      }
      // The split() above counts one "line" per newline plus a trailing
      // fragment; that trailing fragment continues on the same input line
      // as whatever text node (or directive) comes next, so undo the last
      // increment rather than treating it as a full consumed line.
      inputLine--;
      outputLine--;
      continue;
    }
    // Any preprocessor AST node type not explicitly accounted for above:
    // rather than guess how many lines it consumes/produces (a wrong
    // guess here silently corrupts every subsequent line-map entry, as
    // happened during testing with the `define_arguments` node type
    // before it was added to _DIRECTIVE_TYPES), refuse to build a partial
    // map at all. Callers fall back to the untouched source with an
    // identity line map — matching this module's "never guess, degrade
    // to a safe no-op" contract (see ROADMAP-GOLF.md §0's fallback rule).
    throw new Error(`glsl-preprocess: unhandled preprocessor node type "${node.type}"`);
  }
  return map;
}

/**
 * Expand `#define` macros in `src`, returning both the expanded source and
 * a function to translate a 1-based line number in the *expanded* output
 * back to the corresponding 1-based line number in the original `src`.
 *
 * Falls back to returning `src` unchanged (identity line mapping) if the
 * preprocessor hasn't finished loading yet or fails to parse — callers
 * must not assume expansion always happens; this is a best-effort
 * enhancement layered in front of the existing raw-source compile path,
 * never a hard requirement for compilation to proceed.
 *
 * @param {string} src
 * @returns {{ code: string, mapLine: (expandedLine1Based: number) => number }}
 */
export function preprocessWithLineMap(src) {
  if (!_pp) {
    return { code: src, mapLine: (n) => n };
  }
  try {
    const lineMap = _buildLineMap(src);
    const expanded = _pp.generate(_pp.preprocessAst(_pp.parse(src, {}), {}));
    return {
      code: expanded,
      mapLine(expandedLine1Based) {
        const idx = expandedLine1Based - 1;
        if (idx < 0 || idx >= lineMap.length) return expandedLine1Based;
        return (lineMap[idx] ?? idx) + 1;
      },
    };
  } catch (_) {
    // Unparseable by the preprocessor (e.g. genuinely invalid source, or a
    // construct outside what it supports) — pass the original through
    // untouched rather than risk shipping mismatched/incorrect expanded
    // code to the GPU. The existing compile step will surface any real
    // syntax error against the untouched source, at its true line number.
    return { code: src, mapLine: (n) => n };
  }
}

/**
 * Convenience wrapper for call sites that only need the expanded code, not
 * the line map (e.g. a future golfer/dégolfer that re-parses the result
 * into the full GLSL AST rather than reading raw compiler line numbers).
 *
 * @param {string} src
 * @returns {string}
 */
export function preprocessGLSL(src) {
  return preprocessWithLineMap(src).code;
}
