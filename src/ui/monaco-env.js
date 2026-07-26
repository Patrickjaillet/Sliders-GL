/**
 * monaco-env.js — DOIT être importé AVANT 'monaco-editor' (voir editor.js).
 *
 * Fix WebView2 / Monaco 0.55 — module workers bloqués → sliders invisibles.
 *
 * Monaco 0.55 (webWorkerFactory.js) force type:'module' même avec getWorkerUrl().
 * Les module workers échouent silencieusement dans certaines versions de WebView2
 * (Tauri) → Monaco tombe en fallback thread principal → state.editor null ou
 * fonctionnel mais applyAndParse() ne redémarre pas → sliders invisibles.
 *
 * Solution : utiliser getWorker() (pas getWorkerUrl()) qui retourne directement
 * un Worker classique (sans type:'module'). Les bundles iife servis par
 * monacoWorkerPlugin() depuis /monacoeditorwork/*.bundle.js sont des scripts
 * classiques compatibles new Worker(url) sans type:'module'.
 */

function _makeWorker(url, label) {
  // Crée un worker classique (iife) depuis une vraie URL fichier.
  // Pas de type:'module' → fonctionne dans toutes les versions de WebView2.
  return new Worker(url, { name: label });
}

self['MonacoEnvironment'] = {
  getWorker(_moduleId, label) {
    if (label === 'typescript' || label === 'javascript')
      return _makeWorker('/monacoeditorwork/ts.bundle.js', label);
    if (label === 'css' || label === 'less' || label === 'scss')
      return _makeWorker('/monacoeditorwork/css.bundle.js', label);
    if (label === 'html' || label === 'handlebars' || label === 'razor')
      return _makeWorker('/monacoeditorwork/html.bundle.js', label);
    if (label === 'json')
      return _makeWorker('/monacoeditorwork/json.bundle.js', label);
    return _makeWorker('/monacoeditorwork/editor.bundle.js', label);
  },
};
