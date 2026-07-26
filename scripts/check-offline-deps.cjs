#!/usr/bin/env node
/**
 * check-offline-deps.cjs — Roadmap §8 "Offline-First / Zero Network Dependency"
 *
 * Walks src/ and fails (exit 1) if any http(s):// reference is found in
 * bundled runtime code, UNLESS it matches an explicit allowlist entry.
 *
 * What's allowed:
 *  - Documentation / "About" links that are only ever opened by the user
 *    via window.open(...) or a plain <a href> (never fetched by the app).
 *  - The intentional, opt-in ShaderToy import feature (io/shadertoy.js and
 *    its UI in ui.html): importing a shader FROM shadertoy.com is a
 *    deliberate online action the user triggers explicitly — it is not a
 *    hidden background dependency, telemetry call, or CDN asset. The app
 *    itself (editor, rendering, fonts, Monaco, GLSL tooling) works fully
 *    offline; only this one opt-in action needs connectivity.
 *
 * Everything else — CDN font loading, CDN script/module imports, telemetry/
 * analytics beacons, remote asset fetches — is disallowed.
 *
 * Run manually: node scripts/check-offline-deps.cjs
 * Wired into `npm run build` via the "prebuild" script.
 */
const fs = require('fs');
const path = require('path');

const SRC_DIR = path.resolve(__dirname, '..', 'src');
const URL_RE = /https?:\/\/[^\s"'`)<>]+/g;

// Substrings that make a matched URL/line acceptable.
const ALLOWED_URL_SUBSTRINGS = [
  'iquilezles.org',                 // code comment: algorithm reference (not fetched)
  'khronos.org',                    // code comment: spec reference (not fetched)
  'w3.org/2000/svg',                // XML namespace URI, not a network fetch
  'shadertoy.com',                  // intentional opt-in ShaderToy import feature + docs
  'editor.p5js.org',                // "open in p5.js editor" — user-navigated export link
  'patrickjaillet.github.io',       // About / project website link — user-navigated
  'github.com/z-gl/z-gl/wiki',      // Documentation menu link — user-navigated
  'your-proxy.example.com',         // placeholder text in an <input placeholder="">, not a real URL
];

// Files that are allowed to reference these hosts (defence in depth: keeps
// the allowlist above from silently covering an unrelated future misuse).
const ALLOWED_FILES = new Set([
  'ui/glsl-language.js',
  'render/texture-compressor.js',
  'ui/hover-inspector.js',
  'ui.html',
  'export/export-phase6.js',
  'ui/menu-manager.js',
  'io/shadertoy.js',
  'vite-env.d.ts',
]);

let violations = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__mocks__' || entry.name.endsWith('.test.js')) continue;
      walk(full);
    } else if (/\.(js|ts|css|html)$/.test(entry.name) && !entry.name.endsWith('.test.js')) {
      scanFile(full);
    }
  }
}

function scanFile(filePath) {
  const rel = path.relative(SRC_DIR, filePath).split(path.sep).join('/');
  const text = fs.readFileSync(filePath, 'utf-8');
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    const matches = line.match(URL_RE);
    if (!matches) return;
    for (const url of matches) {
      const isAllowedUrl = ALLOWED_URL_SUBSTRINGS.some((s) => url.includes(s));
      const isAllowedFile = ALLOWED_FILES.has(rel);
      if (!(isAllowedUrl && isAllowedFile)) {
        violations.push(`${rel}:${i + 1}: ${url}`);
      }
    }
  });
}

walk(SRC_DIR);

if (violations.length) {
  console.error('\x1b[31m[OFFLINE-FAULT]\x1b[0m Disallowed network reference(s) found in src/:');
  for (const v of violations) console.error('  - ' + v);
  console.error(
    '\nIf this is a legitimate local asset, XML namespace, or an intentional,\n' +
      'user-navigated / opt-in feature, add it to ALLOWED_URL_SUBSTRINGS /\n' +
      'ALLOWED_FILES in scripts/check-offline-deps.cjs with a comment explaining why.'
  );
  process.exit(1);
}

console.log('\x1b[32m[OFFLINE-OK]\x1b[0m No disallowed network references found in src/.');
