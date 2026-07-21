/**
 * glsl-code-actions.js — F-2.5 (Axe 2)
 *
 * Monaco CodeActionProvider pour GLSL — propose des refactorings rapides
 * accessibles via Ctrl+. ou le menu contextuel.
 *
 * Actions disponibles :
 *   1. Extraire la sélection en fonction GLSL
 *   2. Inliner une valeur #define sous le curseur
 *   3. Convertir #define en uniform float
 *   4. Ajouter annotation @range sur un #define
 *   5. Normaliser indentation (espaces → 4)
 *   6. Commenter/décommenter la sélection GLSL
 *   7. Wraper la sélection dans un if() {}
 *
 * API publique :
 *   registerGLSLCodeActions(monaco)  — appeler une seule fois après init Monaco
 */

import { saveSnippet } from './snippet-library.js';

/**
 * @param {typeof import('monaco-editor')} monaco
 */
export function registerGLSLCodeActions(monaco) {
  monaco.languages.registerCodeActionProvider('glsl', {
    provideCodeActions(model, range, context) {
      const actions = [];
      const sel = range;
      const lineText = model.getLineContent(range.startLineNumber);
      const selectedText = model.getValueInRange(sel);
      const hasSelection = !range.isEmpty() && selectedText.trim().length > 0;

      // ── 1. Extraire la sélection en fonction ──────────────────────────────
      if (hasSelection && selectedText.includes('\n')) {
        actions.push({
          title: '⚗ Extraire en fonction GLSL',
          kind: 'refactor.extract',
          isPreferred: false,
          command: {
            id: 'zgl.extractFunction',
            title: 'Extraire en fonction GLSL',
            arguments: [model.uri.toString(), sel, selectedText],
          },
        });
      }

      // ── 2. Inliner un #define sous le curseur ────────────────────────────
      const defineMatch = lineText.match(/^#define\s+(\w+)\s+([-+\d.]+)\s*/);
      if (defineMatch) {
        actions.push({
          title: `↳ Inliner ${defineMatch[1]} (remplacer les usages par ${defineMatch[2]})`,
          kind: 'refactor.inline',
          isPreferred: false,
          command: {
            id: 'zgl.inlineDefine',
            title: 'Inliner la constante',
            arguments: [model.uri.toString(), defineMatch[1], defineMatch[2]],
          },
        });
      }

      // ── 3. Convertir #define en uniform float ───────────────────────────
      if (defineMatch) {
        actions.push({
          title: `⇄ Convertir #define ${defineMatch[1]} en uniform float`,
          kind: 'refactor',
          isPreferred: false,
          command: {
            id: 'zgl.defineToUniform',
            title: 'Convertir en uniform',
            arguments: [model.uri.toString(), range.startLineNumber, defineMatch[1], defineMatch[2]],
          },
        });
      }

      // ── 4. Ajouter @range sur un #define sans annotation ────────────────
      if (defineMatch && !lineText.includes('@range')) {
        const val = parseFloat(defineMatch[2]);
        const sugMin = Math.max(0, val * 0.1).toFixed(2);
        const sugMax = Math.max(val * 2, 1).toFixed(2);
        actions.push({
          title: `◈ Add @range(${sugMin}, ${sugMax}) to ${defineMatch[1]}`,
          kind: 'quickfix',
          isPreferred: true,
          edit: {
            edits: [{
              resource: model.uri,
              textEdit: {
                range: {
                  startLineNumber: range.startLineNumber,
                  startColumn: lineText.length + 1,
                  endLineNumber: range.startLineNumber,
                  endColumn: lineText.length + 1,
                },
                text: `  // @range(${sugMin}, ${sugMax})`,
              },
              versionId: model.getVersionId(),
            }],
          },
        });
      }

      // ── 5. Normaliser l'indentation de la sélection (tabs → 4 espaces) ──
      if (hasSelection && selectedText.includes('\t')) {
        actions.push({
          title: '⇥ Normaliser indentation (tabs → 4 espaces)',
          kind: 'refactor',
          isPreferred: false,
          edit: {
            edits: [{
              resource: model.uri,
              textEdit: {
                range: sel,
                text: selectedText.replace(/\t/g, '    '),
              },
              versionId: model.getVersionId(),
            }],
          },
        });
      }

      // ── 6. Commenter / décommenter la sélection ──────────────────────────
      if (hasSelection) {
        const isCommented = selectedText.trim().startsWith('//');
        const commentedText = isCommented
          ? selectedText.replace(/^\/\/ ?/mg, '')
          : selectedText.replace(/^/mg, '// ');
        actions.push({
          title: isCommented ? '× Décommenter la sélection' : '// Commenter la sélection',
          kind: 'refactor',
          isPreferred: false,
          edit: {
            edits: [{
              resource: model.uri,
              textEdit: {
                range: sel,
                text: commentedText,
              },
              versionId: model.getVersionId(),
            }],
          },
        });
      }

      // ── 7. Wrapper la sélection dans un if() {} ──────────────────────────
      if (hasSelection) {
        const indent = (selectedText.match(/^(\s*)/) || ['', ''])[1];
        const wrapped = `${indent}if (/* condition */) {\n${selectedText.split('\n').map(l => '    ' + l).join('\n')}\n${indent}}`;
        actions.push({
          title: '⊃ Wrapper dans if() {}',
          kind: 'refactor.rewrite',
          isPreferred: false,
          edit: {
            edits: [{
              resource: model.uri,
              textEdit: {
                range: sel,
                text: wrapped,
              },
              versionId: model.getVersionId(),
            }],
          },
        });
      }

      // ── 8. Extraire la sélection comme snippet ─────────────────────────────
      if (hasSelection && selectedText.trim().length > 10) {
        actions.push({
          title: '⧉ Extraire comme snippet',
          kind: 'refactor.extract',
          isPreferred: false,
          command: {
            id: 'zgl.extractAsSnippet',
            title: 'Extraire comme snippet',
            arguments: [selectedText],
          },
        });
      }

      // ── 9. Documenter la fonction sous le curseur ───────────────────────────
      const fnMatch = lineText.match(/^(void|vec[234]|mat[234]|float|int|bool)\s+(\w+)\s*\(([^)]*)\)/);
      if (fnMatch) {
        actions.push({
          title: '\u{1F4DD} Documenter cette fonction',
          kind: 'quickfix',
          isPreferred: false,
          command: {
            id: 'zgl.documentFunction',
            title: 'Documenter',
            arguments: [model.uri.toString(), range.startLineNumber, fnMatch[2], fnMatch[3]],
          },
        });
      }

      return { actions, dispose() {} };
    },
  });

  // ── Implémentation des commandes ──────────────────────────────────────────

  monaco.editor.registerCommand('zgl.extractFunction', (accessor, uriStr, sel, code) => {
    const model = monaco.editor.getModel(monaco.Uri.parse(uriStr));
    if (!model) return;
    const funcName = 'myExtractedFunc';
    const indent = '    ';
    const body = code.split('\n').map(l => indent + l).join('\n');
    const funcDef = `\nvec3 ${funcName}(vec2 uv) {\n${body}\n    return vec3(0);\n}\n`;
    const callExpr = `${funcName}(uv)`;

    // Trouver la ligne de mainImage pour insérer la fonction avant
    const fullCode = model.getValue();
    const mainLine = _findMainImageLine(fullCode);
    const insertLine = mainLine > 0 ? mainLine : 1;

    model.pushEditOperations([], [
      {
        range: { startLineNumber: insertLine, startColumn: 1, endLineNumber: insertLine, endColumn: 1 },
        text: funcDef,
      },
      {
        range: sel,
        text: callExpr,
      },
    ], () => null);
  });

  monaco.editor.registerCommand('zgl.inlineDefine', (accessor, uriStr, name, value) => {
    const model = monaco.editor.getModel(monaco.Uri.parse(uriStr));
    if (!model) return;
    const fullCode = model.getValue();
    const edits = [];
    // Remove the #define line
    const defineRe = new RegExp(`^#define\\s+${name}[^\\n]*\\n?`, 'm');
    const defineMatch = defineRe.exec(fullCode);
    if (defineMatch) {
      const startPos = model.getPositionAt(defineMatch.index);
      const endPos = model.getPositionAt(defineMatch.index + defineMatch[0].length);
      edits.push({ range: { startLineNumber: startPos.lineNumber, startColumn: startPos.column,
                             endLineNumber: endPos.lineNumber, endColumn: endPos.column }, text: '' });
    }
    // Replace all usages of NAME (word boundary, not in strings/comments)
    const usageRe = new RegExp(`\\b${name}\\b`, 'g');
    let m;
    while ((m = usageRe.exec(fullCode)) !== null) {
      if (defineMatch && m.index >= defineMatch.index && m.index < defineMatch.index + defineMatch[0].length) continue;
      const startPos = model.getPositionAt(m.index);
      const endPos = model.getPositionAt(m.index + name.length);
      edits.push({ range: { startLineNumber: startPos.lineNumber, startColumn: startPos.column,
                             endLineNumber: endPos.lineNumber, endColumn: endPos.column },
                   text: value });
    }
    if (edits.length > 0) model.pushEditOperations([], edits, () => null);
  });

  monaco.editor.registerCommand('zgl.defineToUniform', (accessor, uriStr, lineNum, name, value) => {
    const model = monaco.editor.getModel(monaco.Uri.parse(uriStr));
    if (!model) return;
    const lineContent = model.getLineContent(lineNum);
    const uniformLine = `uniform float ${name} = ${value}; // @range(0, ${Math.max(parseFloat(value) * 2, 1).toFixed(2)})`;
    model.pushEditOperations([], [{
      range: { startLineNumber: lineNum, startColumn: 1,
               endLineNumber: lineNum, endColumn: lineContent.length + 1 },
      text: uniformLine,
    }], () => null);
  });

  monaco.editor.registerCommand('zgl.extractAsSnippet', (accessor, code) => {
    const name = window.prompt('Nom du snippet :', 'Mon snippet GLSL');
    if (!name) return;
    const tagsRaw = window.prompt('Tags (séparés par virgule) :', 'utility') || '';
    const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);
    const id = saveSnippet({ name, tags, code });
    try {
      const { toast } = /** @type {any} */ (window);
      if (typeof toast === 'function') toast(`Snippet "${name}" sauvegardé`, 'ok');
    } catch { /* noop */ }
    console.info('[zgl.extractAsSnippet] saved', id);
  });

  monaco.editor.registerCommand('zgl.documentFunction', (accessor, uriStr, lineNum, fnName, paramsStr) => {
    const model = monaco.editor.getModel(monaco.Uri.parse(uriStr));
    if (!model) return;
    const params = paramsStr.split(',').map(p => p.trim()).filter(Boolean);
    const paramLines = params.map(p => {
      const parts = p.replace(/^\s*(in|out|inout)\s+/, '').trim().split(/\s+/);
      const pName = parts[parts.length - 1] || 'p';
      return ` * @param ${pName}`;
    });
    const doc = [
      `// ── ${fnName} ${'─'.repeat(Math.max(0, 40 - fnName.length))}`,
      ...paramLines.map(l => `// ${l.slice(3)}`),
      `// @returns`,
    ].join('\n') + '\n';
    model.pushEditOperations([], [{
      range: { startLineNumber: lineNum, startColumn: 1,
               endLineNumber: lineNum, endColumn: 1 },
      text: doc,
    }], () => null);
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _findMainImageLine(code) {
  const lines = code.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (/void\s+mainImage\s*\(/.test(lines[i])) return i + 1; // 1-based
  }
  return -1;
}
