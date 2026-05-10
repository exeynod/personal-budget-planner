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
  fullyParallel: false, // shared dev server — keep deterministic
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
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
