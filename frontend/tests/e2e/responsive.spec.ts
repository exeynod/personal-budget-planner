// Phase 3 (web UX): responsiveness assertions for the v10 web shell.
//
// Bug being guarded: «the web is NOT adaptive — on desktop it stretches
// full-screen». After Phase 3, on viewports wider than a phone the app must
// render as a centered var(--col-width) (≈420px) column over a neutral
// letterbox, with no horizontal scrollbar, and the fixed TabBar must stay
// within that column. On a phone viewport everything stays full-width.
//
// Mock surface: reuses the shared onboarded-user fixture. We pre-acknowledge
// cookie consent so the shell renders deterministically.

import { expect, test, type Page } from '@playwright/test';
import {
  freezeMotion,
  installOnboardedFixture,
} from './fixtures/onboarded-user';

const COL_MAX = 430; // var(--col-width)=420 + small slack for sub-pixel rounding

async function pinShell(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('cookie_consent_v1', 'acknowledged');
    } catch {
      /* private mode — defaults still resolve to the native shell */
    }
  });
}

async function gotoHome(page: Page) {
  await page.goto('/');
  // Wait for the native Home (Liquid Glass) balance card to render.
  await expect(page.getByTestId('native-home-balance')).toBeVisible({
    timeout: 8000,
  });
  await freezeMotion(page);
}

test.describe('Phase 3 responsiveness (native web shell)', () => {
  test.beforeEach(async ({ page }) => {
    await installOnboardedFixture(page);
    await pinShell(page);
  });

  test('desktop 1280×800: shell renders as a centered ≤430px column, no h-scroll', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoHome(page);

    const shell = page.getByTestId('v10-shell');
    await expect(shell).toBeVisible();

    const box = await shell.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    // 1) Column is clamped to phone width, not stretched full-screen.
    expect(box.width).toBeLessThanOrEqual(COL_MAX);

    // 2) Column is horizontally centered within the 1280px viewport.
    const center = box.x + box.width / 2;
    expect(Math.abs(center - 1280 / 2)).toBeLessThanOrEqual(2);

    // 3) No horizontal scrollbar (letterbox is painted, not overflowing).
    const noHScroll = await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    );
    expect(noHScroll).toBe(true);

    // 4) Floating nav (pill + AI bubble) re-anchors inside the column (within
    //    ±2px of column edges, accounting for the side gutters).
    const tabBar = page.locator('[class*="navRow"]').first();
    await expect(tabBar).toBeVisible();
    const tabBox = await tabBar.boundingBox();
    expect(tabBox).not.toBeNull();
    if (!tabBox) return;
    expect(tabBox.x).toBeGreaterThanOrEqual(box.x - 2);
    expect(tabBox.x + tabBox.width).toBeLessThanOrEqual(box.x + box.width + 2);
  });

  test('mobile 390×844: shell fills the full viewport width', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoHome(page);

    const shell = page.getByTestId('v10-shell');
    const box = await shell.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    // Full-width on a phone: the shell is left-anchored and spans the full
    // viewport width (compare against the live clientWidth rather than a
    // hardcoded number, so the assertion is robust to device emulation).
    const clientWidth = await page.evaluate(
      () => document.documentElement.clientWidth,
    );
    expect(box.x).toBeLessThanOrEqual(1);
    expect(box.width).toBeGreaterThanOrEqual(clientWidth - 1);

    const noHScroll = await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    );
    expect(noHScroll).toBe(true);
  });
});
