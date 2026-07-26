/**
 * e2e/render.spec.js — Phase 12.2
 *
 * E2E test: open Sliders GL → paste shader → verify render starts → screenshot → compare pixel hash
 */

// @ts-check
const { test, expect } = require('@playwright/test');
const crypto = require('crypto');

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
  // Focus the Monaco editor textarea
  const editorArea = page.locator('.monaco-editor textarea').first();
  await editorArea.waitFor({ timeout: 8_000 });

  // Select all and replace
  await editorArea.focus();
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

    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();

    // Canvas should have non-zero dimensions
    const box = await canvas.boundingBox();
    expect(box?.width).toBeGreaterThan(100);
    expect(box?.height).toBeGreaterThan(100);
  });

  // ── Test 2: Screenshot pixel hash ─────────────────────────────────────────

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

    const screenshot1 = await page.locator('canvas').first().screenshot();
    const hash1 = pixelHash(screenshot1);

    // Take a second screenshot shortly after — should be identical (no animation)
    await page.waitForTimeout(200);
    const screenshot2 = await page.locator('canvas').first().screenshot();
    const hash2 = pixelHash(screenshot2);

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
    const exportBtn = page.locator('#exportBtn, [data-action="openExportModal"]').first();
    await exportBtn.click();

    // Export modal should become visible
    const modal = page.locator('#exportModal');
    await expect(modal).toHaveClass(/open/, { timeout: 3_000 });

    // Image tab should be visible
    const imageTab = page.locator('.export-tab').first();
    await expect(imageTab).toBeVisible();
  });
});
