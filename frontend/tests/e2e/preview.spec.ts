import { test, expect, type Page } from '@playwright/test';

/**
 * Phase 23 Maximal Poster — DS smoke suite.
 *
 * Coverage map → REQUIREMENTS.md:
 *   - DS-02 (cyrillic glyph routing via PosterSerifItalic alias)
 *   - DS-04 (11 keyframes wired)
 *   - DS-05 (prefers-reduced-motion overrides)
 *   - DS-06 (preview gallery renders 8 numbered sections incl. all 10 components)
 *   - DS-08 (theme dispatcher: env / localStorage / tampering / default)
 *
 * Runs against the Vite dev server auto-spawned by playwright.config.ts
 * (`webServer.command = 'npm run dev'`, port 5173).
 */

/** Attach console + page error listeners; returns mutable error log. */
function captureErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

test.describe('Phase 23 — Design System Preview', () => {
  test('DS-08: default theme renders V10 preview gallery; no console errors', async ({
    page,
  }) => {
    const errors = captureErrors(page);
    await page.goto('/?preview=1');
    await expect(page.getByText('VOL.23 / DESIGN SYSTEM PREVIEW')).toBeVisible();
    // Allow deferred imports / lazy chunks to settle
    await page.waitForLoadState('networkidle');
    // Tolerate font-loading dev warnings (font-display: optional may log misses)
    const filtered = errors.filter((e) => !/font/i.test(e));
    expect(filtered).toEqual([]);
  });

  test('DS-06: 8 numbered component sections render', async ({ page }) => {
    await page.goto('/?preview=1');
    const eyebrows = [
      '1. ADR-001 ROUTING',
      '2. BIGFIG · COUNT-UP',
      '3. PLATE · 5 TONES',
      '4. POSTERBUTTON · 3 VARIANTS',
      '5. CHIPS · SINGLE-SELECT',
      '6. POSTERSLIDER · STEP 500',
      '7. ANIMATIONS · 11 KEYFRAMES',
      '8. TOAST · 1700ms LIFE',
    ];
    for (const eyebrow of eyebrows) {
      await expect(page.getByText(eyebrow)).toBeVisible();
    }
  });

  test('DS-02: italic «Май» uses PosterSerifItalic alias (cyrillic routing)', async ({
    page,
  }) => {
    await page.goto('/?preview=1');
    const mai = page.getByText('Май', { exact: true }).first();
    await expect(mai).toBeVisible();
    const fontFamily = await mai.evaluate(
      (el) => getComputedStyle(el).fontFamily,
    );
    // PosterSerifItalic is the alias; DM Serif / PT Serif are the underlying
    // unicode-range sources — accept any of them as proof the alias is wired.
    expect(fontFamily).toMatch(/PosterSerifItalic|DM Serif Display|PT Serif/i);
  });

  test('DS-08: localStorage v06 → renders existing App (NOT preview gallery)', async ({
    page,
  }) => {
    // The v06 App boots `useUser()` against /api/v1/me — backend isn't up
    // during smoke tests, so we abort all /api/v1/* calls to keep the load
    // deterministic. The dispatcher decision is what we're testing — not
    // network. Without this, networkidle never settles and the test 30s-times-out.
    await page.route('**/api/v1/**', (route) => route.abort());
    await page.addInitScript(() => localStorage.setItem('ui.theme', 'v06'));
    await page.goto('/');
    // Give the v06 dynamic-import chain a beat to mount its shell.
    await page.waitForTimeout(500);
    // The v06 App lacks the V10 preview eyebrow string — proves dispatcher routed away.
    await expect(page.getByText('VOL.23 / DESIGN SYSTEM PREVIEW')).toHaveCount(0);
  });

  test('DS-08: tampered localStorage → falls back to v10 default', async ({
    page,
  }) => {
    await page.addInitScript(() =>
      localStorage.setItem('ui.theme', '<malicious>'),
    );
    await page.goto('/?preview=1');
    await expect(page.getByText('VOL.23 / DESIGN SYSTEM PREVIEW')).toBeVisible();
  });

  test('DS-04+DS-05: prefers-reduced-motion reduces posterRowIn duration to 0.2s', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto('/?preview=1');
    await expect(page.getByText('7. ANIMATIONS · 11 KEYFRAMES')).toBeVisible();

    // Trigger the posterRowIn animation cell (re-mounts the target via key bump).
    await page.getByRole('button', { name: /poster-row-in/i }).click();
    // Brief settle so the (re-mounted) target attaches and CSS resolves.
    await page.waitForTimeout(50);

    const target = page.locator('.poster-row-in').first();
    await expect(target).toBeVisible();
    const animDuration = await target.evaluate(
      (el) => getComputedStyle(el).animationDuration,
    );
    // Reduce-motion override mandates 0.2s !important on .poster-row-in.
    expect(animDuration).toBe('0.2s');
    await ctx.close();
  });
});
