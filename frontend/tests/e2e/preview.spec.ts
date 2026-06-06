import { test, expect, type Page } from '@playwright/test';

/**
 * Phase 23 Maximal Poster — DS smoke suite (trimmed).
 *
 * Kept: gallery renders without console errors (DS-06/DS-08) and the
 * cyrillic glyph routing via PosterSerifItalic alias (DS-02 — load-bearing).
 *
 * Runs against the Vite dev server auto-spawned by playwright.config.ts.
 */

function captureErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

test.describe('Phase 23 — Design System Preview', () => {
  test('DS-06/08: preview gallery renders sections without console errors', async ({
    page,
  }) => {
    const errors = captureErrors(page);
    await page.goto('/?preview=1');
    await expect(
      page.getByText('VOL.23 / DESIGN SYSTEM PREVIEW'),
    ).toBeVisible();
    await expect(page.getByText('1. ADR-001 ROUTING')).toBeVisible();
    await expect(page.getByText('7. ANIMATIONS · 11 KEYFRAMES')).toBeVisible();
    await page.waitForLoadState('networkidle');
    // Tolerate font-loading dev warnings (font-display: optional may log misses)
    expect(errors.filter((e) => !/font/i.test(e))).toEqual([]);
  });

  test('DS-02: italic «Май» routes cyrillic glyphs via PosterSerifItalic alias', async ({
    page,
  }) => {
    await page.goto('/?preview=1');
    const mai = page.getByText('Май', { exact: true }).first();
    await expect(mai).toBeVisible();
    const fontFamily = await mai.evaluate(
      (el) => getComputedStyle(el).fontFamily,
    );
    // PosterSerifItalic alias backed by DM Serif / PT Serif unicode-range sources.
    expect(fontFamily).toMatch(/PosterSerifItalic|DM Serif Display|PT Serif/i);
  });
});
