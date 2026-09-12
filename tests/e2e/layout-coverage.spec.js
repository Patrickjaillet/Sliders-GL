/**
 * e2e/layout-coverage.spec.js — §13 roadmap ("zero dead space")
 *
 * The §2 rework replaced a fixed-resolution, CSS-scaled canvas with a real
 * adaptive grid, specifically to eliminate large blank `--bg-void` margins
 * around the app at common desktop resolutions. This verifies that
 * property directly via DOM geometry (bounding boxes of the real content
 * panels vs. the layout's total area) rather than pixel/screenshot
 * analysis: `--bg-void` is also the intentional 1px grid-gap/gutter color
 * between panels (see `.layout { gap: 1px }` in layout.css), so what
 * actually matters is that the content panels cover the vast majority of
 * the layout, not that the color never appears on screen at all.
 */

// @ts-check
import { test, expect } from '@playwright/test';

const RESOLUTIONS = [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
];

// Below this fraction of the #layout area being covered by real content
// panels, something is off (a stale grid-template-columns value, a panel
// collapsed to 0 width unintentionally, etc.) — see §11 roadmap for two
// real bugs of exactly this shape found via the same kind of direct
// geometry check. 0.75 was picked empirically: measured coverage across
// the four target resolutions ranges ~0.79-0.90 on a healthy layout (the
// ratio rises with resolution since the tool-shelf's fixed 40px width
// becomes a smaller fraction of the total at higher resolutions) — this
// catches a real regression (a collapsed/hidden panel drops the ratio well
// below this range) without false-failing on the small, expected gap left
// by in-panel headers, status bars, and the 1px grid gutter.
const MIN_COVERAGE_RATIO = 0.75;

test.describe('Layout coverage at key resolutions (§13 roadmap)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('sl_first_launch_done', '1'));
  });

  for (const res of RESOLUTIONS) {
    test(`${res.width}x${res.height}: content panels cover the layout area`, async ({ page }) => {
      await page.setViewportSize(res);
      await page.goto('/');
      await page.waitForSelector('.monaco-editor', { timeout: 20_000 });
      await page.waitForTimeout(300);

      const coverage = await page.evaluate(() => {
        const layout = document.getElementById('layout');
        const layoutBox = layout.getBoundingClientRect();
        const layoutArea = layoutBox.width * layoutBox.height;

        // The real, always-present content columns of the 4-column grid
        // (tool-shelf, sidebar, viewport, editor) — inspector is excluded
        // since it's closed (0-width) by default, which is expected, not
        // dead space.
        const selectors = ['#toolShelf', '#sidebar', '#viewport-zone'];
        let coveredArea = 0;
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (!el) continue;
          const r = el.getBoundingClientRect();
          coveredArea += Math.max(0, r.width) * Math.max(0, r.height);
        }

        return { layoutArea, coveredArea, ratio: coveredArea / layoutArea };
      });

      expect(coverage.ratio).toBeGreaterThan(MIN_COVERAGE_RATIO);
    });
  }
});
