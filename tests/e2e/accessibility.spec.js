/**
 * e2e/accessibility.spec.js
 *
 * Automated accessibility pass (WCAG 2.1 AA) using axe-core, run against the
 * light/medium-gray Blender-style theme (src/style/tokens.css).
 */

// @ts-check
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

test.describe('Sliders GL accessibility (axe-core)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.monaco-editor', { timeout: 20_000 });
  });

  test('main workspace has no WCAG 2.1 AA violations', async ({ page }) => {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    if (results.violations.length > 0) {
      const summary = results.violations
        .map(v => `${v.id} (${v.impact}): ${v.nodes.length} node(s) — ${v.help}`)
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
