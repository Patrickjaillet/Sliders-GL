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
    // The first-launch welcome modal fades/scales in over --dur (120ms); give it
    // time to settle so axe doesn't sample a still-transitioning, translucent state.
    const welcome = page.locator('#welcome-overlay.open .modal');
    if ((await welcome.count()) > 0) {
      await expect(welcome).toHaveCSS('opacity', '1');
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
