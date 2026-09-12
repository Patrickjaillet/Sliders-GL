/**
 * e2e/accessibility.spec.js
 *
 * Automated accessibility pass (WCAG 2.1 AA) using axe-core, run against the
 * light/medium-gray Blender-style theme (src/style/tokens.css).
 */

// @ts-check
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Sliders GL accessibility (axe-core)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.monaco-editor', { timeout: 20_000 });
    // The first-launch welcome overlay (`.modal-overlay`, its own opacity/
    // visibility fade over the dark rgba(0,0,0,0.7) backdrop) AND its
    // `.modal` child (a separate opacity/transform fade) both animate in
    // over --dur (120ms), independently. This was an intermittent flake
    // (§12 roadmap audit, confirmed via repeated stress runs, worse under
    // parallel workers / CPU contention): every fix attempt that only
    // awaited `.modal`'s own settle (a fixed buffer, then
    // `Element.getAnimations()`) still occasionally caught axe mid-fade,
    // because the *overlay's* backdrop opacity — which blends with and
    // changes the effective contrast of everything drawn over it — was the
    // one still in flight. Wait for both elements' animations to finish.
    const overlay = page.locator('#welcome-overlay.open');
    const modal = overlay.locator('.modal');
    if ((await overlay.count()) > 0) {
      await expect(modal).toHaveCSS('opacity', '1');
      await page.evaluate(() =>
        Promise.all(
          [
            document.querySelector('#welcome-overlay.open'),
            document.querySelector('#welcome-overlay.open .modal'),
          ]
            .filter(Boolean)
            .map(
              (el) =>
                new Promise((resolve) => {
                  const done = () =>
                    el
                      .getAnimations()
                      .every((a) => a.playState !== 'running' && a.playState !== 'pending');
                  const check = () => {
                    if (done()) resolve(undefined);
                    else requestAnimationFrame(check);
                  };
                  check();
                })
            )
        )
      );
      // Residual mitigation, not a full fix: even after both elements report
      // no running/pending animations, a stress run (20 repeats × 4 parallel
      // workers, i.e. under real CPU contention) still showed an occasional
      // (~5%) color-contrast false positive on the welcome cards, with
      // nonsensical low-ratio color pairs matching neither element's actual
      // resting tokens — consistent with axe-core sampling one compositor
      // frame behind what getAnimations() reports as "finished" specifically
      // through this modal's backdrop-filter:blur() overlay (axe-core has
      // known issues sampling through backdrop-filter). This buffer reduces
      // but does not provably eliminate that residual race; see ROADMAP §13.
      await page.waitForTimeout(200);
    }
  });

  test('main workspace has no WCAG 2.1 AA violations', async ({ page }) => {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    if (results.violations.length > 0) {
      const summary = results.violations
        .map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s) — ${v.help}`)
        .join('\n');
      console.log('Accessibility violations:\n' + summary);
    }

    expect(results.violations).toEqual([]);
  });

  test('color-contrast check on the gray theme', async ({ page }) => {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2aa'])
      .include('body')
      .options({ runOnly: { type: 'rule', values: ['color-contrast'] } })
      .analyze();

    expect(results.violations).toEqual([]);
  });
});
