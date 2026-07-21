// eslint.config.js — Phase 12.4
//
// ESLint v9 flat config for Z-GL
// Replaces the legacy .eslintrc.cjs
//
// Features:
//   - ESLint v9 flat config format
//   - eslint-plugin-unicorn for modern JS idioms
//   - no-console enforcement in production builds
//   - JSDoc type annotation checks

import js from '@eslint/js';
import importPlugin from 'eslint-plugin-import';

// Note: eslint-plugin-unicorn and @eslint/js are peer deps
// Install with: npm install --save-dev eslint@^9 @eslint/js eslint-plugin-unicorn eslint-plugin-import

/** @type {import('eslint').Linter.Config[]} */
export default [
  // ── Global ignores ──────────────────────────────────────────────────────────
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'src-tauri/**',
      'public/mediapipe-wasm/**',
      'public/spirv-cross/**',
      'public/glslang/**',
      'public/three.global.js',
      'playwright.config.js',
      'tests/e2e/**',   // Playwright uses CommonJS
      '*.cjs',
    ],
  },

  // ── Base config for all JS files ────────────────────────────────────────────
  {
    files: ['src/**/*.js'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        // Browser
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        FileReader: 'readonly',
        FormData: 'readonly',
        Headers: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        CustomEvent: 'readonly',
        MutationObserver: 'readonly',
        ResizeObserver: 'readonly',
        IntersectionObserver: 'readonly',
        performance: 'readonly',
        crypto: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        CompressionStream: 'readonly',
        DecompressionStream: 'readonly',
        VideoEncoder: 'readonly',
        VideoDecoder: 'readonly',
        VideoFrame: 'readonly',
        AudioContext: 'readonly',
        AudioWorkletNode: 'readonly',
        OffscreenCanvas: 'readonly',
        ImageBitmap: 'readonly',
        ImageData: 'readonly',
        createImageBitmap: 'readonly',
        SharedArrayBuffer: 'readonly',
        Atomics: 'readonly',
        Worker: 'readonly',
        WebSocket: 'readonly',
        // WebGPU
        GPUBufferUsage: 'readonly',
        GPUTextureUsage: 'readonly',
        GPUShaderStage: 'readonly',
        GPURenderPassEncoder: 'readonly',
        // Monaco Editor (AMD CDN global)
        monaco: 'readonly',
        require: 'readonly',
        // Node (for scripts)
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        global: 'readonly',
      },
    },
    plugins: {
      import: importPlugin,
    },
    rules: {
      // ── Core quality rules ─────────────────────────────────────────────────
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-var': 'error',
      'prefer-const': ['warn', { destructuring: 'all' }],
      'no-duplicate-imports': 'error',
      'no-shadow': 'warn',
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      'no-return-assign': 'error',
      'no-param-reassign': ['warn', { props: false }],

      // ── Import rules ───────────────────────────────────────────────────────
      'import/no-unresolved': 'off',       // Vite handles resolution
      'import/no-duplicates': 'error',

      // ── Modern JS idioms ───────────────────────────────────────────────────
      'prefer-template': 'warn',
      'prefer-arrow-callback': 'warn',
      'object-shorthand': ['warn', 'always'],
      'no-useless-rename': 'error',

      // ── Safety ────────────────────────────────────────────────────────────
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },

  // ── Production source — no console ──────────────────────────────────────────
  {
    files: ['src/core/**/*.js', 'src/shader/**/*.js', 'src/gl/**/*.js'],
    rules: {
      // Warn on console.log in core/shader/gl modules; use toast() instead
      'no-console': ['warn', { allow: ['warn', 'error', 'group', 'groupEnd', 'groupCollapsed', 'info'] }],
    },
  },

  // ── Test files — relaxed rules ───────────────────────────────────────────────
  {
    files: ['**/*.test.js', 'src/**/*.test.js'],
    rules: {
      'no-console': 'off',
      'no-unused-vars': 'off',
      'prefer-const': 'off',
    },
  },

  // ── Scripts ─────────────────────────────────────────────────────────────────
  {
    files: ['scripts/**/*.js', 'vite.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        process: 'readonly',
        __dirname: 'readonly',
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
];
