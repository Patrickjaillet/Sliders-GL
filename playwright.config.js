/**
 * playwright.config.js — Phase 12.2
 *
 * Playwright configuration for E2E tests with Tauri WebDriver integration.
 *
 * Prerequisites:
 *   - npm install --save-dev @playwright/test
 *   - npm install --save-dev playwright-webkit  (or chromium for Tauri WebView2)
 *   - Tauri WebDriver: cargo install tauri-driver
 *
 * Run:
 *   npx playwright test tests/e2e/
 *
 * In CI:
 *   npx playwright test --reporter=github tests/e2e/
 */

// @ts-check

/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  testDir: './tests/e2e',
  timeout: 60_000,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Tauri apps can't run multiple instances

  use: {
    // For Tauri WebView2 (Windows): use chromium channel
    // The Tauri WebDriver exposes a WebDriver endpoint on localhost:4444
    browserName: 'chromium',
    channel: 'chromium',
    headless: process.env.CI === 'true',

    // Base URL for web-only testing (dev server)
    baseURL: process.env.ZGL_BASE_URL || 'http://localhost:5173',

    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
  },

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report' }],
    ...(process.env.CI ? [['github']] : []),
  ],

  // Web-server setup for non-Tauri (browser-based) E2E runs
  webServer: process.env.TAURI_DRIVER
    ? undefined
    : {
        command: 'npm run dev',
        port: 5173,
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
      },

  projects: [
    {
      name: 'web-chrome',
      use: { browserName: 'chromium' },
    },
  ],
};

export default config;
