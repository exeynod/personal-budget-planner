import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for Phase 23 Maximal Poster e2e suite.
 *
 * webServer: auto-spawns `npm run dev` (Vite on :5173) before tests, reuses
 * an already-running server in local dev (no `CI` env var). Mobile-first
 * viewport (Pixel 5 / 393×851) reflects the TG WebApp surface — desktop
 * Chrome is irrelevant for the v10 poster shell.
 */
export default defineConfig({
  testDir: './tests/e2e',
  // Parallel across workers: each gets its own browser context but they share
  // the one Vite dev server (which just serves modules — safe to hit
  // concurrently). Tests are independent (installNative per test) and write
  // distinct screenshot files, so parallelism is deterministic here. This is
  // the main lever cutting the suite from ~10min serial to a few minutes.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // One local retry absorbs the occasional headless-chromium crash under
  // memory pressure; CI keeps two.
  retries: process.env.CI ? 2 : 1,
  workers: 2,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    viewport: { width: 390, height: 844 }, // iPhone 13 Pro mobile-first
  },
  projects: [
    { name: 'chromium-mobile', use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
