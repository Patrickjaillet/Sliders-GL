/**
 * e2e/ui-entry-points.spec.js — §13 roadmap
 *
 * Regression coverage for new UI entry points added during the UI/UX
 * overhaul (roadmap sections 6, 9, 10) that had no permanent e2e test:
 * the sound toggle and Help menu additions (§10), and the canvas gizmos /
 * compare-view toggles (§6). Each of these was previously either fully
 * orphaned (no DOM element at all) or reachable only through a hidden path
 * (context menu, hold-key) — these tests exist so a future regression in
 * their wiring is caught automatically instead of requiring a manual pass.
 */

// @ts-check
import { test, expect } from '@playwright/test';

test.describe('New UI entry points (§6/§9/§10 roadmap)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('sl_first_launch_done', '1'));
    await page.goto('/');
    await page.waitForSelector('.monaco-editor', { timeout: 20_000 });
  });

  test('§10: sound toggle button exists in the topbar and toggles state', async ({ page }) => {
    const btn = page.locator('#soundToggleBtn');
    await expect(btn).toBeVisible();
    await expect(btn).toHaveText(/off/i);

    await btn.click();
    await expect(btn).toHaveText(/on/i);
    await expect(btn).toHaveClass(/active/);

    await btn.click();
    await expect(btn).toHaveText(/off/i);
  });

  test('§10: Help menu exposes Replay Tutorial and GLSL Quick Reference', async ({ page }) => {
    const helpMenuBtn = page.locator('#helpMenuWrap .tb-menu-btn');
    await helpMenuBtn.click();

    await expect(page.locator('[data-action="startTutorial"]')).toBeVisible();
    await expect(page.locator('[data-action="openGLSLReference"]')).toBeVisible();
    // Pre-existing entries should still be present alongside the new ones.
    await expect(page.locator('[data-action="openHelpCenter"]')).toBeVisible();
    await expect(page.locator('[data-action="showShortcutsPanel"]')).toBeVisible();
  });

  test('§10: Shader Library topbar button opens the library panel', async ({ page }) => {
    await page.locator('#shaderLibBtn').click();
    await expect(page.locator('#z-gl-lib-panel')).toBeVisible({ timeout: 3_000 });
  });

  test('§10: Includes Manager topbar button opens the includes panel', async ({ page }) => {
    await page.locator('#includesMgrBtn').click();
    await expect(page.locator('#zgl-includes-panel')).toBeVisible({ timeout: 3_000 });
  });

  test('§6: canvas gizmos toggle flips aria-pressed', async ({ page }) => {
    const btn = page.locator('#vpGizmosBtn');
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
  });

  test('§6: compare-view toggle is disabled until a reference frame exists', async ({ page }) => {
    const compareBtn = page.locator('#vpCompareBtn');
    await expect(compareBtn).toBeDisabled();

    await page.locator('[data-action="saveReference"]').click();
    await expect(compareBtn).toBeEnabled({ timeout: 3_000 });

    await compareBtn.click();
    await expect(compareBtn).toHaveAttribute('aria-pressed', 'true');
  });
});
