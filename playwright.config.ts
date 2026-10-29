import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
/** Specs that cover animated output; these also run in Firefox and WebKit. */
const CROSS_BROWSER = /(animation|templates|frames)\.spec\.ts$/;

export default defineConfig({
  testDir: 'tests/e2e',
  // Firefox and WebKit run alongside Chromium locally; under that load a few
  // animation tests can approach 45 s.
  timeout: 60_000,
  fullyParallel: true,
  // One retry on CI absorbs runner timing hiccups; flaky tests still show up as "flaky" in the report.
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  // With Chromium, Firefox and WebKit running in parallel, Firefox can take
  // longer than the default 5 s to load the app or refresh a preview.
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile/, grepInvert: /@perf/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile/ },
    // Animated SVG output in the other engines (#13). Chromium runs the full suite above.
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } }, testMatch: CROSS_BROWSER, grepInvert: /@perf/ },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } }, testMatch: CROSS_BROWSER, grepInvert: /@perf/ },
    // Timing-sensitive stress tests run alone, after everything else, so they
    // neither starve other tests nor measure CPU contention instead of the app.
    {
      name: 'perf',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      grep: /@perf/,
      dependencies: ['desktop', 'mobile'],
      fullyParallel: false,
    },
  ],
  webServer: {
    command: `node scripts/serve.mjs out ${PORT}`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
  },
});
