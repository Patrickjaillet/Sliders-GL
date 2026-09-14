// src/shader/glsl-expand.js — §2 ROADMAP-GOLF.md
//
// Dégolfage: reconstructs a readable GLSL shader from any valid GLSL source
// (golfed/minified or not), using @shaderfrog/glsl-parser's AST (never
// regex-on-text — see ROADMAP-GOLF.md §0 for why a real parse→AST→
// regenerate pipeline is required to hold the pixel-perfect and
// zero-silent-error guarantees).
//
// Three independent, composable passes, each safe to skip on its own if it
// can't confidently handle the input:
//   1. Macro expansion (delegates to glsl-preprocess.js — the exact same
//      module the render pipeline uses, per ROADMAP-GOLF.md §1's closing
//      note: the dégolfeur must never use a second copy of the
//      preprocessor, or a shader could dégolf differently than it renders).
//   2. Chained-declaration splitting (`float a=1.,b=2.;` → two statements),
//      done structurally on the AST's `declarator_list` nodes.
//   3. Scope-aware identifier renaming (single-letter locals → readable
//      names), using the package's generic `visit()` walker so every
//      identifier reference is found structurally — never by guessing
//      which node types can contain one.
// A final pass runs the existing `formatGLSL()` text formatter (already
// used for auto-format-on-compile) to get consistent indentation/spacing,
// since formatting is a solved, well-tested problem here and doesn't need
// re-deriving on the AST.

import { preprocessGLSL } from './glsl-preprocess.js';
import { formatGLSL } from './glsl-formatter.js';

let _ast = null; // { parse, generate, visit }

const _ready = (async () => {
  try {
    const [core, visitMod] = await Promise.all([
      import('@shaderfrog/glsl-parser'),
      import('@shaderfrog/glsl-parser/ast/visit.js'),
    ]);
    _ast = { parse: core.parse, generate: core.generate, visit: visitMod.visit };
  } catch (_) {
    // Package unavailable — dégolfage is skipped, source passes through
    // unchanged (see expandGLSL's fallback below).
  }
})();

export function whenExpandReady() {
  return _ready;
}

// ─────────────────────────────────────────────────────────────────────────
// Pass 2: split chained declarations
// ─────────────────────────────────────────────────────────────────────────
//
// `float a=1.,b=2.,c=3.;` parses as one `declaration_statement` wrapping a
// `declarator_list` with 3 `declaration` entries. Splitting means emitting
// N sibling `declaration_statement` nodes, each with its own single-entry
// `declarator_list` reusing the same `specified_type`. This only touches
// declarator_list nodes with >1 declaration and is purely structural — it
// can never change which identifiers are declared or their initializers,
// so it carries no pixel-perfect risk.
//
// Handled in two places: top-level / block statement lists
// (`compound_statement.statements`, `program`), where a declaration is its
// own statement and can freely become N statements; and `for_statement`
// init position, which is left untouched (a for-loop's init clause is
// syntactically a single declarator_list slot — splitting it would require
// restructuring the loop itself, out of scope for a mechanical transform).

function _splitDeclaratorLists(ast) {
  function splitStatementList(stmts) {
    const out = [];
    for (const stmt of stmts) {
      if (
        stmt.type === 'declaration_statement' &&
        stmt.declaration?.type === 'declarator_list' &&
        stmt.declaration.declarations.length > 1
      ) {
        const { specified_type, declarations } = stmt.declaration;
        declarations.forEach((decl) => {
          out.push({
            type: 'declaration_statement',
            declaration: {
              type: 'declarator_list',
              specified_type,
              declarations: [decl],
              commas: [],
            },
            semi: stmt.semi,
          });
        });
      } else {
        out.push(stmt);
      }
    }
    return out;
  }

  ast.program = splitStatementList(ast.program);
  _ast.visit(ast, {
    compound_statement: {
      enter(path) {
        path.node.statements = splitStatementList(path.node.statements);
      },
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Pass 3: scope-aware identifier renaming
// ─────────────────────────────────────────────────────────────────────────
//
// Only single-letter and other very short (<=2 char) local identifiers are
// considered for renaming — multi-character names were presumably already
// chosen deliberately and are left untouched. Function names, struct type
// names, and swizzle/field-selection components are never renamed (the
// generic AST shape keeps swizzles as `field_selection.selection`, which
// this pass's identifier visitor doesn't touch at all — see
// `_RENAME_SKIP_PARENT_TYPES` below).
//
// Correctness approach: a real single-pass recursive descent over the AST
// with an explicit scope-chain stack, exactly like a compiler's symbol
// resolver — NOT independent per-scope text-matching passes. An earlier
// version of this module tried collecting each scope's bindings and
// "usages" separately (matching plain identifier text against a name set)
// and processing scopes bottom-up; that approach cannot actually tell a
// reference to an outer variable apart from a reference to an inner
// variable that happens to shadow it with the same original short name —
// confirmed by direct testing: it produced `float a=1.; { float a=2.; ... }
// x = a;` (a genuine two-variable shadowing case) where the *inner*
// redeclaration and the *outer* variable's own unrelated reference both
// independently picked the same fallback name (`var1`), silently merging
// two distinct variables into one under GLSL's actual scoping rules — the
// exact class of "looks fine, silently wrong" bug ROADMAP-GOLF.md §4
// warns a golf/dégolf tool must never produce. A real scope stack, where
// each identifier reference resolves to the *nearest enclosing* binding
// exactly as the GLSL compiler itself would, cannot make that mistake.

const _RENAME_SKIP_PARENT_TYPES = new Set([
  'function_header', // function's own name
  'field_selection', // swizzle / struct field access (`.xy`, `.rgb`)
]);

// Context → descriptive name, checked only against a variable's OWN
// declaration initializer (never other statements where it's merely
// referenced — see the historical note in _resolveNewName below on why
// that distinction matters). Conservative on purpose: only fires on
// unambiguous, common Shadertoy idioms; anything else falls back to a
// neutral `var1`, `var2`… (ROADMAP-GOLF.md §2's own fallback rule).
function _contextualName(initText) {
  if (/iresolution/i.test(initText) && /\.xy\b/.test(initText)) return 'uv';
  if (/\bnormalize\s*\(/.test(initText) && /\bcross\s*\(/.test(initText)) return 'dir';
  if (/\bvec[34]\s*\(/.test(initText) && /col|rgb/i.test(initText)) return 'color';
  return null;
}

function _safeGenerate(generate, node) {
  try {
    return generate(node);
  } catch (_) {
    return '';
  }
}

// One `Scope` per lexical block: a function's (params + top-level body
// locals, as one combined scope — a param and a body-local can never
// share a name in GLSL), a nested `{ }` block, or a for-loop's init.
// `names` maps original-or-already-resolved identifier text to its chosen
// final name; `parent` chains up to every enclosing scope so a reference
// resolves via the nearest match, exactly mirroring GLSL's own shadowing
// rules.
function _makeScope(parent) {
  return { parent, names: new Map(), usedNames: new Set(parent ? parent.usedNames : []) };
}

// All names visible from `scope` outward — used as the reserved set when
// picking a new name, so a child scope's renamed variable can never
// collide with anything an ancestor scope (already resolved, since we
// process top-down) could also see from inside this scope.
function _isNameTaken(scope, name) {
  for (let s = scope; s; s = s.parent) {
    if (s.usedNames.has(name)) return true;
  }
  return false;
}

function _resolveNewName(scope, originalName, initText) {
  if (originalName.length > 2) return originalName; // already descriptive enough

  let candidate = _contextualName(initText);
  if (!candidate || _isNameTaken(scope, candidate)) {
    candidate = null;
  }
  if (!candidate) {
    let n = 1;
    do {
      candidate = `var${n++}`;
    } while (_isNameTaken(scope, candidate));
  }
  return candidate;
}

function _declareBinding(scope, identifierNode, initializerNode, generate) {
  const original = identifierNode.identifier;
  const initText = initializerNode ? _safeGenerate(generate, initializerNode) : '';
  const finalName = _resolveNewName(scope, original, initText);
  scope.names.set(original, finalName);
  scope.usedNames.add(finalName);
  if (finalName !== original) identifierNode.identifier = finalName;
}

function _resolveReference(scope, identifierNode) {
  const original = identifierNode.identifier;
  for (let s = scope; s; s = s.parent) {
    if (s.names.has(original)) {
      const resolved = s.names.get(original);
      if (resolved !== identifierNode.identifier) identifierNode.identifier = resolved;
      return;
    }
  }
  // Not a locally-declared name in any enclosing scope (a uniform, a
  // built-in, a global, or a name we chose not to rename because it was
  // already >2 chars) — left untouched.
}

// Declarations directly in a statement list (top level of a function body
// or a nested block) — walked in source order so later declarations in
// the same scope correctly see earlier ones as already-bound names, and
// so any reference to a not-yet-declared same-scope name (illegal in
// GLSL, but harmless to leave unresolved here) never gets misresolved.
function _walkStatementList(stmts, scope, visit, generate) {
  for (const stmt of stmts) {
    _walkStatement(stmt, scope, visit, generate);
  }
}

function _walkStatement(stmt, scope, visit, generate) {
  if (stmt.type === 'declaration_statement' && stmt.declaration?.type === 'declarator_list') {
    for (const decl of stmt.declaration.declarations) {
      // Resolve references INSIDE the initializer using the scope as it
      // stood before this declaration (GLSL doesn't allow self-reference
      // in an initializer, but a later declaration in the same statement
      // list must not see this one early either way — matches source
      // order semantics).
      if (decl.initializer) _walkExpressionForReferences(decl.initializer, scope, visit);
      if (decl.identifier?.type === 'identifier') {
        _declareBinding(scope, decl.identifier, decl.initializer, generate);
      }
    }
    return;
  }
  if (stmt.type === 'compound_statement') {
    const child = _makeScope(scope);
    _walkStatementList(stmt.statements, child, visit, generate);
    return;
  }
  if (stmt.type === 'for_statement') {
    const child = _makeScope(scope);
    if (stmt.init?.type === 'declarator_list') {
      for (const decl of stmt.init.declarations) {
        if (decl.initializer) _walkExpressionForReferences(decl.initializer, child, visit);
        if (decl.identifier?.type === 'identifier') {
          _declareBinding(child, decl.identifier, decl.initializer, generate);
        }
      }
    } else if (stmt.init) {
      _walkExpressionForReferences(stmt.init, child, visit);
    }
    if (stmt.condition) _walkExpressionForReferences(stmt.condition, child, visit);
    if (stmt.operation) _walkExpressionForReferences(stmt.operation, child, visit);
    if (stmt.body?.type === 'compound_statement') {
      _walkStatementList(stmt.body.statements, child, visit, generate);
    } else if (stmt.body) {
      _walkStatement(stmt.body, child, visit, generate);
    }
    return;
  }
  // Any other statement kind (if/while/expression/return/…): no new scope,
  // no new bindings possible at this position — just resolve every
  // identifier reference inside it against the current scope. GLSL ES 1.0
  // requires declarations to be block-scoped to a `{ }` (already handled
  // as `compound_statement` above) or a for-init (handled above), so no
  // other statement type can introduce a binding — resolving references
  // structurally here, via the same generic visitor as everywhere else in
  // this module, is exhaustively safe rather than a per-type guess.
  _walkExpressionForReferences(stmt, scope, visit);
}

function _walkExpressionForReferences(node, scope, visit) {
  visit(node, {
    identifier: {
      enter(path) {
        if (_RENAME_SKIP_PARENT_TYPES.has(path.parent?.type)) return;
        _resolveReference(scope, path.node);
      },
    },
    // Don't descend into nested scope-introducing constructs here — a
    // `compound_statement` or `for_statement` reachable from inside an
    // expression only happens via... it can't, in GLSL grammar (those are
    // statement-level only), so no explicit stop is needed; kept as a
    // documented invariant rather than defensive code that would never
    // run.
  });
}

function _renameIdentifiers(ast, visit, generate) {
  for (const stmt of ast.program) {
    if (stmt.type !== 'function') continue;
    const fnScope = _makeScope(null);
    for (const param of stmt.prototype?.parameters ?? []) {
      if (param.identifier?.type === 'identifier') {
        _declareBinding(fnScope, param.identifier, null, generate);
      }
    }
    _walkStatementList(stmt.body.statements, fnScope, visit, generate);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────

/**
 * Reconstruct a readable version of `src`: expand `#define` macros, split
 * chained declarations, rename single-letter locals to descriptive names
 * where a safe heuristic applies (else a neutral `var1`/`var2`… fallback),
 * then run the existing text formatter for indentation/spacing.
 *
 * Falls back to `formatGLSL(preprocessGLSL(src))` (skipping the AST-based
 * splitting/renaming passes) if the source can't be parsed — never throws,
 * never guesses a possibly-incorrect transform. See ROADMAP-GOLF.md §4:
 * "zero errors" means zero silent regressions, not that every possible
 * GLSL input gets the full treatment.
 *
 * @param {string} src
 * @returns {{ code: string, renamed: boolean, warnings: string[] }}
 */
export function expandGLSL(src) {
  const warnings = [];
  const macroExpanded = preprocessGLSL(src);

  if (!_ast) {
    return {
      code: formatGLSL(macroExpanded),
      renamed: false,
      warnings: ['AST unavailable — formatting only, no renaming.'],
    };
  }

  try {
    const ast = _ast.parse(macroExpanded, {});
    _splitDeclaratorLists(ast);
    _renameIdentifiers(ast, _ast.visit, _ast.generate);
    const regenerated = _ast.generate(ast);
    return { code: formatGLSL(regenerated), renamed: true, warnings };
  } catch (e) {
    const firstLine = (e.message || 'parse error').split('\n')[0].slice(0, 120);
    warnings.push(`Could not fully dégolf (${firstLine}) — formatting only, no renaming.`);
    return { code: formatGLSL(macroExpanded), renamed: false, warnings };
  }
}
