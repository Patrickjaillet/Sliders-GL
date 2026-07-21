import { defineConfig } from 'vite'
import { resolve }      from 'path'
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve as resolvePath, dirname } from 'path';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

// ── Inline Monaco worker plugin ───────────────────────────────────────────────
//
// Remplace vite-plugin-monaco-editor@1.1.0 qui crashait sur Node 18+.
//
// Ce que fait ce plugin :
//   DEV  — bundle chaque worker Monaco via esbuild à la première requête et les
//          sert depuis un cache disque à /monacoeditorwork/*.bundle.js
//          + header Cross-Origin-Resource-Policy:same-origin sur chaque réponse
//   BUILD— écrit les bundles dans public/monacoeditorwork/ ; Vite les copie
//          automatiquement dans dist/ (plus fiable que d'écrire dans dist/ direct)
//   BOTH — injecte un <script> synchrone dans <head> qui définit
//          self.MonacoEnvironment.getWorkerUrl() via transformIndexHtml()
//          ET monaco-env.js définit la même chose côté import JS (belt+suspenders)
//
// Pourquoi getWorkerUrl() et pas getWorker() ?
//   Monaco 0.55 lit MonacoEnvironment en priorité. Si getWorkerUrl() est défini,
//   il crée new Worker(url) classique (iife) au lieu des module workers type:'module'
//   générés par Vite. Les module workers sont silencieusement rejetés par certaines
//   versions de WebView2 → state.editor null → sliders absents.
//   worker:{format:'iife'} dans vite.config.js assure que les bundles sont iife.

import { createRequire } from 'module';
import { existsSync, mkdirSync, readFileSync as fsReadFile, writeFileSync, rmSync } from 'fs';
import { join, basename, resolve as pathResolve } from 'path';
import { build as esbuildBuild } from 'esbuild';

const _require = createRequire(import.meta.url);

const MONACO_WORKERS = [
  { label: 'editorWorkerService', entry: 'monaco-editor/esm/vs/editor/editor.worker' },
  { label: 'css',        entry: 'monaco-editor/esm/vs/language/css/css.worker' },
  { label: 'html',       entry: 'monaco-editor/esm/vs/language/html/html.worker' },
  { label: 'json',       entry: 'monaco-editor/esm/vs/language/json/json.worker' },
  { label: 'typescript', entry: 'monaco-editor/esm/vs/language/typescript/ts.worker' },
];

// Extra label aliases (same worker file)
const WORKER_ALIASES = {
  javascript: 'typescript',
  less:       'css',
  scss:       'css',
  handlebars: 'html',
  razor:      'html',
};

const PUBLIC_PATH  = 'monacoeditorwork';
const CACHE_DIR    = 'node_modules/.monaco-cache/';

function workerBundleName(entry) {
  // entry: 'monaco-editor/esm/vs/editor/editor.worker'
  // → 'editor.bundle.js' (not 'editor.worker.bundle.js' to avoid double .worker)
  const base = basename(entry);            // 'editor.worker'
  const stem = base.replace(/\.worker$/, ''); // 'editor'
  return stem + '.bundle.js';
}

function resolveWorkerEntry(entry) {
  try { return _require.resolve(join(process.cwd(), 'node_modules', entry)); }
  catch { return _require.resolve(entry); }
}

async function buildWorker(entry) {
  const outfile = join(CACHE_DIR, workerBundleName(entry));
  if (!existsSync(outfile)) {
    mkdirSync(CACHE_DIR, { recursive: true });
    await esbuildBuild({
      entryPoints: [resolveWorkerEntry(entry)],
      bundle:      true,
      outfile,
      format:      'iife',
    });
  }
  return outfile;
}

function buildWorkerPaths(base = '/') {
  const paths = {};
  for (const w of MONACO_WORKERS) {
    paths[w.label] = `${base}${PUBLIC_PATH}/${workerBundleName(w.entry)}`;
  }
  for (const [alias, target] of Object.entries(WORKER_ALIASES)) {
    const src = MONACO_WORKERS.find(w => w.label === target);
    if (src) paths[alias] = `${base}${PUBLIC_PATH}/${workerBundleName(src.entry)}`;
  }
  return paths;
}

function monacoWorkerPlugin() {
  let resolvedConfig;
  return {
    name: 'zgl-monaco-workers',

    configResolved(cfg) { resolvedConfig = cfg; },

    // DEV: serve bundled workers via middleware
    configureServer(server) {
      // Clear stale cache — use rmSync (Node 14.14+) instead of the broken
      // rmdirSync({recursive}) that vite-plugin-monaco-editor@1.1.0 used.
      if (existsSync(CACHE_DIR)) {
        rmSync(CACHE_DIR, { recursive: true, force: true });
      }
      for (const w of MONACO_WORKERS) {
        const urlPath = `/${PUBLIC_PATH}/${workerBundleName(w.entry)}`;
        server.middlewares.use(urlPath, async (_req, res, _next) => {
          const outfile = await buildWorker(w.entry);
          res.setHeader('Content-Type', 'text/javascript');
          // Also add CORP so the worker loads under COEP:require-corp (Tauri prod)
          res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
          res.end(fsReadFile(outfile));
        });
      }
    },

    // Injecte un <script> synchrone dans <head> qui définit MonacoEnvironment.getWorkerUrl()
    // AVANT que tout module (dont monaco-editor) ne s'exécute.
    // C'est une ceinture+bretelles : monaco-env.js fait la même chose côté JS import,
    // mais ce script HTML garantit que getWorkerUrl() est en place même si l'ordre
    // d'évaluation des modules changeait.
    //
    // getWorkerUrl() renvoie de vraies URLs fichier (/monacoeditorwork/*.bundle.js) →
    // Monaco appelle new Worker(url) classique, pas de module worker type:'module' →
    // pas de rejet silencieux par WebView2 → state.editor défini → sliders visibles.
    transformIndexHtml() {
      const base  = resolvedConfig?.base ?? '/';
      const paths = buildWorkerPaths(base);
      // IMPORTANT: utiliser getWorker() et non getWorkerUrl().
      // Monaco 0.55 (webWorkerFactory.js) force type:'module' même quand getWorkerUrl()
      // est utilisé → module workers → rejetés silencieusement par WebView2.
      // getWorker() retourne directement un Worker classique (sans type:'module').
      return [
        {
          tag:      'script',
          injectTo: 'head-prepend',
          attrs:    {},   // pas de type:"module" → script synchrone classique
          children: `self["MonacoEnvironment"]=(function(p){return{getWorker:function(id,label){return new Worker(p[label]||p["editorWorkerService"],{name:label});}}})(${JSON.stringify(paths)});`,
        },
      ];
    },

    // BUILD: écrire les bundles workers dans public/monacoeditorwork/.
    // Vite copie automatiquement public/ dans dist/ → dist/monacoeditorwork/*.bundle.js
    // toujours présent après le build, sans dépendre du timing de writeBundle.
    async writeBundle() {
      const publicDir = pathResolve(process.cwd(), 'public', PUBLIC_PATH);
      mkdirSync(publicDir, { recursive: true });
      for (const w of MONACO_WORKERS) {
        const cacheFile = await buildWorker(w.entry);
        writeFileSync(join(publicDir, workerBundleName(w.entry)), fsReadFile(cacheFile));
      }
    },
  };
}

// Fix 0.1 — Prevent Vite's built-in HTML pipeline from intercepting *.html?raw
// imports (e.g. `import uiHTML from './ui.html?raw'` in setup.js).
//
// Vite 8 (rolldown) PROBLEM: using transform() causes double JSON.stringify.
// When our transform() returned `export default ${JSON.stringify(code)}`,
// rolldown's own ?raw handler then wrapped that again → SVG attributes became
// \"\\\"0\\\"\" instead of \"0\" → broken DOM.
//
// FIX: use resolveId + load instead of transform.
//   resolveId → marks the import as a virtual module (strips ?raw, adds \0 prefix)
//   load      → reads the actual file and emits the correct ES module string
// This intercepts BEFORE rolldown sees the ?raw suffix, so it never applies
// its own raw-string pipeline, and JSON.stringify runs exactly once.

function rawHtmlPlugin() {
  // Virtual module marker — deliberately uses NO ".html" extension so that
  // vite:build-html never intercepts this id in production builds.
  // The \0 prefix is the Rollup/rolldown convention for virtual modules.
  const MARKER = '\0zgl-raw-template:';

  return {
    name: 'raw-html',
    enforce: 'pre',

    resolveId(id, importer) {
      // Only intercept *.html?raw imports
      const qIdx = id.indexOf('?');
      const filePart  = qIdx === -1 ? id : id.slice(0, qIdx);
      const queryPart = qIdx === -1 ? '' : id.slice(qIdx + 1);
      if (!filePart.endsWith('.html')) return null;
      if (!queryPart.split('&').includes('raw')) return null;

      // Resolve to an absolute path
      let absPath;
      if (importer) {
        // Strip query/virtual prefix from importer path
        const importerClean = importer
          .replace(/^\0[^:]+:/, '')   // strip any virtual prefix
          .replace(/\?.*$/, '');      // strip query string
        const importerFile = importerClean.startsWith('file://')
          ? fileURLToPath(importerClean)
          : importerClean;
        absPath = resolvePath(dirname(importerFile), filePart);
      } else {
        absPath = resolvePath(filePart);
      }

      // CRITICAL: encode the path so the virtual id contains NO ".html" —
      // if it did, vite:build-html would grab the module and try to parse it
      // as an HTML entry point, failing on the JSON-stringified content.
      const encoded = Buffer.from(absPath).toString('base64url');
      return MARKER + encoded;
    },

    load(id) {
      if (!id.startsWith(MARKER)) return null;
      const encoded  = id.slice(MARKER.length);
      const filePath = Buffer.from(encoded, 'base64url').toString('utf-8');
      const content  = readFileSync(filePath, 'utf-8');
      // Single JSON.stringify — rolldown never sees ?raw on this virtual id.
      return `export default ${JSON.stringify(content)};`;
    },
  };
}

function tauriStubPlugin() {
  const TAURI_RE = /^@tauri-apps\//;
  return {
    name: 'tauri-stub',
    enforce: 'pre',
    resolveId(id) {
      if (TAURI_RE.test(id)) return '\0tauri-stub:' + id;
      return null;
    },
    load(id) {
      if (!id.startsWith('\0tauri-stub:')) return null;
      return `
const _noop = () => {};
const _noopAsync = async () => {};
export const invoke     = _noopAsync;
export const listen     = async () => _noop;
export const emit       = _noopAsync;
export const appWindow  = { listen: _noopAsync, emit: _noopAsync, setTitle: _noop };
export const open       = _noopAsync;
export const save       = _noopAsync;
export const readTextFile  = _noopAsync;
export const writeTextFile = _noopAsync;
export const exists        = async () => false;
export const createDir     = _noopAsync;
export const removeFile    = _noopAsync;
export const BaseDirectory = {};
export default {};
`;
    },
  };
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    // Fix 5.5 — rawHtmlPlugin MUST remain in this array.
    // src/setup.js imports `./ui.html?raw` which requires this plugin to intercept
    // the ?raw query before rolldown handles it (would cause double JSON.stringify).
    // Removing it will break the build with a malformed DOM (escaped SVG attributes).
    rawHtmlPlugin(),   // Fix 0.1 — must come before tauriStubPlugin
    tauriStubPlugin(),
    // Fix tauri:dev — serve Monaco workers as real bundled files (not blob: URLs).
    // See monacoWorkerPlugin() above for the full explanation.
    monacoWorkerPlugin(),
  ],
  assetsInclude: ['**/*.md'],
  worker: {
    // Fix Vite 8 / WebView2 — 'es' génère des module workers via import() dynamique
    // qui aboutissent à des blob: URLs bloquées par COEP:require-corp dans WebView2.
    // 'iife' produit des scripts classiques new Worker(url) avec une vraie URL fichier,
    // ce qui fonctionne sous COEP. MonacoEnvironment est défini dans monaco-env.js.
    format: 'iife',
  },
  optimizeDeps: {
    exclude: [
      '@shaderfrog/glsl-parser',
      '@tauri-apps/api',
      '@tauri-apps/plugin-dialog',
      '@tauri-apps/plugin-fs',
    ],
  },
  build: {
    target: 'es2020',
    // Raised from 1000 kB: presets.js (113 kB) + snippet-pack (102 kB) + glsl-language (64 kB)
    // all land in the main bundle because they're transitively required at boot.
    // The real fix is the improved manualChunks below; keep the limit honest at 1500 kB
    // so the warning fires only for genuinely oversized chunks.
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: {
        main: './index.html',
      },
      output: {
        manualChunks(id) {
          const norm = String(id || '').replace(/\\/g, '/');

          // ── Third-party vendors ──────────────────────────────────────────
          if (norm.includes('/node_modules/three/'))         return 'vendor-three';
          if (norm.includes('/node_modules/monaco-editor/')) return 'vendor-monaco';
          if (norm.includes('/node_modules/jszip/'))         return 'vendor-jszip';

          // ── Large data / doc chunks (lazy-loaded at runtime) ─────────────
          // These files are only needed after user interaction, so isolating
          // them keeps the initial bundle lean.
          if (norm.includes('/src/io/presets.js'))                   return 'data-presets';
          if (norm.includes('/src/shader/snippet-pack-extended.js')) return 'data-snippets';
          if (norm.includes('/src/ui/glsl-language.js'))            return 'data-glsl-lang';
          if (norm.includes('/src/ui/help-center.js'))              return 'ui-help';
          if (norm.includes('/src/render/lut-library.js'))          return 'data-luts';
          if (norm.includes('/src/shader/glsl-docs-db.js'))         return 'data-glsl-docs';
          if (norm.includes('/src/ui/version-history-panel.js'))    return 'ui-vh';
          if (norm.includes('/src/ui/shader-library-panel.js'))     return 'ui-shader-lib';
          if (norm.includes('/src/render/perf.js'))                 return 'render-perf';

          // ── Core app chunks (grouped by domain) ──────────────────────────
          if (norm.endsWith('/src/shader/parser.js'))  return 'glsl-parser';
          if (norm.endsWith('/src/ui/slider.js'))      return 'ui-slider';
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
    // Fix tauri:dev — Tauri's WebView2 injects COOP:same-origin + COEP:require-corp
    // headers (from tauri.conf.json "headers"). Under COEP:require-corp, every
    // sub-resource (including Monaco workers loaded via dynamic import) MUST respond
    // with Cross-Origin-Resource-Policy:same-origin, or WebView2 blocks it.
    // Vite's dev server doesn't add CORP by default → Monaco workers are blocked
    // → state.editor stays undefined → buildUI() never runs → sliders invisible.
    //
    // Adding these headers to the Vite dev server makes tauri:dev behave identically
    // to the production build (where Tauri applies them to the bundled assets).
    // They are also safe for npm run dev in a browser: COOP/COEP enable
    // SharedArrayBuffer and crossOriginIsolated, which is what we want anyway.
    headers: {
      'Cross-Origin-Opener-Policy':   'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  },
  // Same headers for `npm run preview` (testing production build locally)
  preview: {
    port: 5173,
    headers: {
      'Cross-Origin-Opener-Policy':   'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  },
  test: {
    environment: 'happy-dom', // Fix 3.5 — 'node' ne fournit pas document/window → tests UI échouaient
    include: ['src/**/*.test.js'],
    alias: {
      'monaco-editor': resolve('./src/__mocks__/monaco-editor.js'),
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
})