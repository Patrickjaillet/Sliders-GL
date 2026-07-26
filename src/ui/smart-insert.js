/**
 * smart-insert.js — F-2.1 (Axe 2)
 *
 * Insertion intelligente de snippets GLSL dans l'éditeur Monaco :
 *   - Les fonctions utilitaires sont placées avant mainImage
 *   - Les uniforms sont insérés en tête (après les #define existants)
 *   - Les expressions inline sont insérées à la position du curseur
 *   - La détection de doublons évite de réinsérer une fonction déjà présente
 *
 * API publique :
 *   smartInsert(code, type?, opts?) → boolean   (retourne false si doublon ignoré)
 *
 * Types :
 *   'auto'     — détecte automatiquement (par défaut)
 *   'uniform'  — insertion en tête de fichier
 *   'function' — insertion avant mainImage
 *   'inline'   — insertion à la position du curseur
 */

import { state } from '../core/state.js';
import { findFunctionDeclarations, findMainImageLine } from '../shader/parser.js';

// ── API publique ──────────────────────────────────────────────────────────────

/**
 * Insère `code` dans l'éditeur Monaco à l'endroit le plus pertinent.
 *
 * @param {string} code    — Le code GLSL à insérer
 * @param {string} [type]  — 'auto' | 'uniform' | 'function' | 'inline'
 * @param {object} [opts]
 *   @param {boolean} [opts.skipDuplicates=true] — Ignorer si déjà présent
 *   @param {boolean} [opts.ensureNewlines=true] — Ajouter lignes vides autour
 * @returns {boolean} false si ignoré (doublon), true sinon
 */
export function smartInsert(code, type = 'auto', opts = {}) {
  const { skipDuplicates = true, ensureNewlines = true } = opts;
  if (!state.editor) return false;

  const existing = state.editor.getValue();
  const resolved = type === 'auto' ? _detectType(code) : type;

  if (skipDuplicates && resolved === 'function') {
    const dupName = _duplicateFunctionName(code, existing);
    if (dupName) {
      _showDuplicateHint(dupName);
      return false;
    }
  }

  if (resolved === 'uniform') {
    _insertUniform(code, existing, ensureNewlines);
  } else if (resolved === 'function') {
    _insertFunction(code, existing, ensureNewlines);
  } else {
    _insertInline(code, ensureNewlines);
  }

  return true;
}

// ── Détection automatique du type ────────────────────────────────────────────

function _detectType(code) {
  const stripped = code.trim();
  if (/^\s*uniform\s+/m.test(stripped)) return 'uniform';
  if (/^\s*#define\s+/m.test(stripped)) return 'uniform';
  // Code contenant une déclaration de fonction (retour + nom + parenthèses)
  if (/^(void|vec[234]|mat[234]|float|int|bool|sampler\w*)\s+\w+\s*\(/m.test(stripped)) return 'function';
  // Bloc multi-ligne sans déclaration de variable seul → fonction
  if (stripped.includes('\n') && stripped.includes('{')) return 'function';
  return 'inline';
}

// ── Insertion uniform (en tête, après les derniers #define/uniform) ──────────

function _insertUniform(code, existing, ensureNewlines) {
  const lines = existing.split('\n');
  let lastDefine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*#define\s/.test(lines[i]) || /^\s*uniform\s/.test(lines[i])) lastDefine = i;
  }
  const insertAt = lastDefine >= 0 ? lastDefine + 1 : 0;

  const snippet = ensureNewlines ? code.trimEnd() + '\n' : code;
  lines.splice(insertAt, 0, snippet);
  _applyValue(lines.join('\n'), insertAt, snippet.split('\n').length - 1);
}

// ── Insertion fonction (avant mainImage) ─────────────────────────────────────

function _insertFunction(code, existing, ensureNewlines) {
  const mainLine = findMainImageLine(existing);  // 0-based
  const lines = existing.split('\n');

  let insertAt;
  if (mainLine < 0) {
    // Pas de mainImage : insérer à la fin
    insertAt = lines.length;
  } else {
    // Chercher une ligne vide juste avant mainImage
    let blank = mainLine - 1;
    while (blank > 0 && lines[blank - 1].trim() === '') blank--;
    insertAt = blank < mainLine ? blank : mainLine;
  }

  const snippet = ensureNewlines
    ? '\n' + code.trim() + '\n'
    : code;

  lines.splice(insertAt, 0, snippet);
  _applyValue(lines.join('\n'), insertAt, snippet.split('\n').length - 1);
}

// ── Insertion inline (position curseur) ──────────────────────────────────────

function _insertInline(code, ensureNewlines) {
  const editor = state.editor;
  const pos = editor.getPosition();
  const model = editor.getModel();
  if (!model || !pos) return;

  const snippet = ensureNewlines ? '\n' + code.trim() + '\n' : code;
  editor.executeEdits('smart-insert', [{
    range: { startLineNumber: pos.lineNumber, startColumn: pos.column,
              endLineNumber: pos.lineNumber, endColumn: pos.column },
    text: snippet,
  }]);
  editor.focus();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Retourne le nom de la première fonction dans `snippet` qui est déjà déclarée
 * dans `existing`, ou null si pas de doublon.
 */
function _duplicateFunctionName(snippet, existing) {
  const snippetFns = findFunctionDeclarations(snippet).map(f => f.name);
  if (!snippetFns.length) return null;
  const existingFns = new Set(findFunctionDeclarations(existing).map(f => f.name));
  return snippetFns.find(n => existingFns.has(n)) ?? null;
}

function _showDuplicateHint(name) {
  // Toast léger si disponible, sinon console
  try {
    const { toast } = /** @type {any} */ (window);
    if (typeof toast === 'function') { toast(`Function "${name}" already present — skipped`, 'info'); return; }
  } catch (_) { /* ignore */ }
  console.info(`[smart-insert] duplicate skipped: ${name}`);
}

/**
 * Inserts a GLSL function before mainImage, optionally renaming it first.
 * Skips insertion if a function with the target name already exists.
 *
 * @param {string} code   GLSL source containing the function to insert
 * @param {string} [name] Optional new name to give the function
 * @returns {boolean}
 */
export function smartInsertFunction(code, name) {
  let src = code;
  if (name) {
    src = src.replace(
      /^(\s*(?:void|vec[234]|mat[234]|float|int|bool)\s+)(\w+)(\s*\()/m,
      `$1${name}$3`,
    );
  }
  return smartInsert(src, 'function');
}

/**
 * Applique la nouvelle valeur dans l'éditeur et positionne le curseur
 * sur la première ligne insérée.
 */
function _applyValue(newCode, insertedLine, linesCount) {
  const editor = state.editor;
  editor.setValue(newCode);
  // Curseur sur la première ligne insérée (1-based)
  const targetLine = Math.max(1, insertedLine + 1);
  editor.revealLineInCenter(targetLine);
  editor.setPosition({ lineNumber: targetLine, column: 1 });
  editor.focus();
}
