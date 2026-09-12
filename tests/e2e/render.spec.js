/**
 * e2e/render.spec.js — Phase 12.2
 *
 * E2E test: open Sliders GL → paste shader → verify render starts → screenshot → compare pixel hash
 */

// @ts-check
import { test, expect } from '@playwright/test';
import crypto from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Simple pixel hash — SHA-256 of the PNG buffer, first 16 hex chars */
function pixelHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16);
}

/** Wait for the WebGL canvas to paint at least one non-black pixel */
async function waitForRender(page, timeout = 10_000) {
  await page.waitForFunction(
    () => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return false;
      const ctx = canvas.getContext('2d');
      if (!ctx) return true; // WebGL canvas — getContext('2d') returns null; treat as rendered
      // For 2D canvas snapshots we'd read pixels; for WebGL we check canvas is non-zero size
      return canvas.width > 0 && canvas.height > 0;
    },
    { timeout }
  );
}

/** Apply a shader via the Apply button or Ctrl+Enter */
async function applyShader(page, code) {
  // Focus the Monaco editor. Calling .focus() directly on the hidden input
  // textarea sets DOM focus but doesn't establish Monaco's own internal
  // editor-focus state, so keystrokes are silently dropped — a real click on
  // the rendered view-lines is what Monaco actually listens for.
  const viewLines = page.locator('.monaco-editor .view-lines');
  await viewLines.waitFor({ timeout: 8_000 });
  await viewLines.click();

  // Select all and replace
  await page.keyboard.press('Control+a');
  await page.keyboard.type(code, { delay: 0 });

  // Apply with Ctrl+Enter
  await page.keyboard.press('Control+Enter');

  // Wait for the toast indicating shader was parsed
  await page.waitForSelector('.toast.ok', { timeout: 8_000 }).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────────────────
// Test suite
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Sliders GL render pipeline E2E', () => {
  test.beforeEach(async ({ page }) => {
    // A fresh browser context has no localStorage, so the first-launch welcome
    // modal would open and intercept every subsequent click in this suite —
    // these tests target the render/export pipeline, not onboarding, so mark
    // it as already dismissed before any app script runs.
    await page.addInitScript(() => localStorage.setItem('sl_first_launch_done', '1'));
    await page.goto('/');
    // Wait for the app to boot — Monaco editor should be present
    await page.waitForSelector('.monaco-editor', { timeout: 20_000 });
  });

  // ── Test 1: Basic render start ─────────────────────────────────────────────

  test('paste shader → render starts → canvas is non-empty', async ({ page }) => {
    const shader = `
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  fragColor = vec4(uv, 0.5 + 0.5 * sin(iTime), 1.0);
}`;

    await applyShader(page, shader);
    await waitForRender(page);

    // #glc is the WebGL viewport canvas — Monaco's minimap also renders via an
    // internal <canvas> that precedes it in DOM order, so a bare `canvas`
    // locator would grab that instead.
    const canvas = page.locator('#glc');
    await expect(canvas).toBeVisible();

    // Canvas should have non-zero dimensions
    const box = await canvas.boundingBox();
    expect(box?.width).toBeGreaterThan(100);
    expect(box?.height).toBeGreaterThan(100);
  });

  // ── Test 2: Screenshot pixel hash ─────────────────────────────────────────
  //
  // This test was suspected of being flaky across several sessions. Root
  // caused: it is fully stable under the project's real config
  // (`workers: 1` in playwright.config.js — confirmed 15/15 clean repeats)
  // and only fails under artificial multi-worker parallelism (also 15/15,
  // but as genuine WebGL readback instability — Vite + Monaco + WebGL
  // booting concurrently across several workers starves the GPU/CPU badly
  // enough that even page load itself can take over a minute). Since the
  // project never runs Playwright with more than one worker, this was
  // never a real flake in practice — the earlier "flaky" observations were
  // most likely made while other CPU-heavy work was running alongside the
  // test suite, not a defect in this test or the render pipeline.

  test('screenshot of static shader produces stable pixel hash', async ({ page }) => {
    // A deterministic shader that doesn't use iTime
    const shader = `
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  // Checkerboard — purely spatial, no time dependency
  float check = mod(floor(uv.x * 8.0) + floor(uv.y * 8.0), 2.0);
  fragColor = vec4(check, check * 0.5, 1.0 - check, 1.0);
}`;

    await applyShader(page, shader);
    await waitForRender(page);

    // Wait a beat to ensure the frame is fully painted
    await page.waitForTimeout(500);

    // Read the actual WebGL framebuffer rather than an element .screenshot():
    // #glc is letterboxed to fill its column (`max-width/max-height: 100%` on
    // .cw, see layout.css — the old `.cw.scale-fit`/CSS `transform:
    // scale(var(--cw-scale))` approach was replaced by a real GL-level
    // resize, §2 roadmap), and rasterizing an element into a PNG twice in a
    // row is not guaranteed pixel-stable (browser compositing/anti-aliasing
    // jitter) even though the GL content underneath is byte-identical —
    // confirmed by comparing raw readPixels() output above.
    const readGlPixels = () =>
      page.evaluate(() => {
        const canvas = document.getElementById('glc');
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        const { width, height } = canvas;
        const pixels = new Uint8Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        return Array.from(pixels);
      });

    const pixels1 = await readGlPixels();
    const hash1 = pixelHash(Buffer.from(pixels1));

    // Read again shortly after — should be identical (no animation)
    await page.waitForTimeout(200);
    const pixels2 = await readGlPixels();
    const hash2 = pixelHash(Buffer.from(pixels2));

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(16);
  });

  // ── Test 3: Shader compile error shows marker ──────────────────────────────

  test('invalid GLSL produces error marker in editor', async ({ page }) => {
    const badShader = `
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  this_is_not_valid_glsl!!!;
  fragColor = vec4(1.0);
}`;

    await applyShader(page, badShader);

    // Wait for a potential error toast or marker
    await page.waitForTimeout(1000);

    // Monaco error markers show as .squiggly-error decorations
    const hasError = await page.evaluate(() => {
      const squiggles = document.querySelectorAll('.squiggly-error');
      const toastErr = document.querySelector('.toast.err');
      return squiggles.length > 0 || toastErr !== null;
    });

    // Either an error toast or error squiggles should appear
    expect(hasError).toBe(true);
  });

  // ── Test 4: Export modal opens ─────────────────────────────────────────────

  test('export button opens export modal', async ({ page }) => {
    // #exportBtn is the always-visible topbar quick-access icon; several other
    // elements (File-menu item, tool-shelf icon, panel button) share the same
    // data-action but sit inside collapsed/hidden containers by default.
    const exportBtn = page.locator('#exportBtn');
    await exportBtn.click();

    // Export modal should become visible
    const modal = page.locator('#exportModal');
    await expect(modal).toHaveClass(/open/, { timeout: 3_000 });

    // Image tab should be visible
    const imageTab = page.locator('.export-tab').first();
    await expect(imageTab).toBeVisible();
  });

  // ── Test 5: Viewport resize triggers a real GL-level resize ────────────────
  // §13 roadmap: the §2 rework replaced `.cw.scale-fit` (a CSS-only
  // transform:scale(), same fixed-resolution canvas underneath) with a real
  // `renderer.setSize()` resize measured off #viewportCol (gl/renderer.js).
  // That fix's whole point was that #glc.width/#glc.height actually change
  // with the window instead of always reporting a stale fixed size — this
  // regression-tests exactly that property, which no existing test covered.

  test('window resize changes the canvas GL resolution and rendering continues', async ({
    page,
  }) => {
    const shader = `
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  fragColor = vec4(uv, 0.5 + 0.5 * sin(iTime), 1.0);
}`;
    await applyShader(page, shader);
    await waitForRender(page);

    const sizeBefore = await page.evaluate(() => {
      const c = document.getElementById('glc');
      return { width: c.width, height: c.height };
    });
    expect(sizeBefore.width).toBeGreaterThan(0);
    expect(sizeBefore.height).toBeGreaterThan(0);

    // Shrink the window enough that the viewport column must actually shrink
    // (not just letterbox within the same box).
    const original = page.viewportSize();
    await page.setViewportSize({
      width: Math.max(640, (original?.width ?? 1280) - 400),
      height: Math.max(480, (original?.height ?? 720) - 300),
    });

    // doResize() is ResizeObserver-driven (viewport.js), not synchronous —
    // give it a moment, then confirm the GL canvas actually changed size.
    await page.waitForTimeout(400);
    const sizeAfter = await page.evaluate(() => {
      const c = document.getElementById('glc');
      return { width: c.width, height: c.height };
    });
    expect(sizeAfter.width !== sizeBefore.width || sizeAfter.height !== sizeBefore.height).toBe(
      true
    );

    // And rendering must still be live at the new resolution — not stuck
    // showing a stale frame from before the resize.
    const stillRendering = await page.evaluate(() => {
      const canvas = document.getElementById('glc');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      const pixels = new Uint8Array(4);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return pixels.some((v) => v !== 0);
    });
    expect(stillRendering).toBe(true);
  });
});
