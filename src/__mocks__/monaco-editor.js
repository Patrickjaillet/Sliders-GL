// Minimal Monaco stub for unit tests — updated for monaco-editor 0.55.1 (Fix 5.6)
// Mirrors the public surface used by glsl-language.js, editor.js,
// inlay-uniform-values.js, color-inline.js, slider-logic.js, value-scrub.js.

export const editor = {
  createModel:      () => ({}),
  setModelMarkers:  () => {},
  getModel:         () => null,
  create:           () => ({ dispose: () => {}, getValue: () => '', setValue: () => {},
                              getModel: () => null, updateOptions: () => {},
                              addCommand: () => {}, addAction: () => {},
                              getOption: () => undefined, onDidChangeModelContent: () => ({ dispose: () => {} }),
                              onMouseDown: () => ({ dispose: () => {} }),
                              onKeyDown:   () => ({ dispose: () => {} }),
                            }),
  defineTheme:      () => {},
  setTheme:         () => {},
  EditorOption:     { columnSelection: 28, fontInfo: 59 },
  MouseTargetType:  { GUTTER_GLYPH_MARGIN: 2 },
};

// InlayHintKind — added in 0.36, stable in 0.55
export const InlayHintKind = { Type: 1, Parameter: 2 };

export const languages = {
  register:                               () => {},
  setMonarchTokensProvider:               () => ({ dispose: () => {} }),
  setLanguageConfiguration:               () => {},
  registerCompletionItemProvider:         () => ({ dispose: () => {} }),
  registerHoverProvider:                  () => ({ dispose: () => {} }),
  registerDefinitionProvider:             () => ({ dispose: () => {} }),
  registerInlayHintsProvider:             () => ({ dispose: () => {} }),
  registerDocumentSemanticTokensProvider: () => ({ dispose: () => {} }),
  registerFoldingRangeProvider:           () => ({ dispose: () => {} }),
  registerDocumentFormattingEditProvider: () => ({ dispose: () => {} }),
  CompletionItemKind:       { Function: 1, Variable: 4, Keyword: 13, Snippet: 14, Color: 15, File: 16 },
  CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
  FoldingRangeKind:         { Region: { value: 'region' } },
  InlayHintKind,
};

// Emitter — used by inlay-uniform-values.js
export class Emitter {
  constructor() { this._listeners = []; }
  get event() { return (cb) => { this._listeners.push(cb); return { dispose: () => {} }; }; }
  fire(e)     { this._listeners.forEach(cb => cb(e)); }
  dispose()   { this._listeners = []; }
}

export const Uri            = { parse: (s) => s };
export const MarkerSeverity = { Error: 8, Warning: 4, Info: 2, Hint: 1 };
export const MarkerTag      = { Unnecessary: 1, Deprecated: 2 };
export const Range          = class {
  constructor(sl, sc, el, ec) {
    this.startLineNumber = sl; this.startColumn = sc;
    this.endLineNumber   = el; this.endColumn   = ec;
  }
};
export const Position = class { constructor(l, c) { this.lineNumber = l; this.column = c; } };
export const KeyMod   = { CtrlCmd: 2048, Shift: 1024, Alt: 512, WinCtrl: 256 };
export const KeyCode  = { KeyS: 49, KeyD: 34, KeyR: 45, KeyL: 36, KeyF: 33, KeyG: 35, KeyH: 36,
                          KeyP: 43, Enter: 3, F12: 83, Insert: 19,
                          Equal: 86, Minus: 88, Digit0: 21, Numpad0: 96,
                          NumpadAdd: 109, NumpadSubtract: 111, UpArrow: 16, DownArrow: 18 };

export default { editor, languages, Emitter, Uri, MarkerSeverity, MarkerTag, Range, Position, KeyMod, KeyCode };
