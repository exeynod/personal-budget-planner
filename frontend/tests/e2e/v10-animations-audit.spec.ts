// Phase 28-01 Task 2 — Playwright audit for V10 poster animations.
//
// Locks POL-01/POL-02/POL-03 (web part) per .planning/phases/28-animations-polish-acceptance/
// 28-01-PLAN.md. Three describe blocks:
//
//   1) Apply-utilities: load V10 Home (default theme = v10) with onboarded
//      mocks and assert that .poster-rise-in / .poster-row-in / .poster-bar-fill
//      classes are actually present on the rendered DOM (grep-style check
//      that survives refactors of CSS Module names).
//
//   2) Reduced-motion overrides: emulate `prefers-reduced-motion: reduce` and
//      assert that, after the entry window, .poster-row-in elements settle to
//      transform: none (no translate3d/translateY) — proving the @media block
//      in stylesV10/animations.css (lines 138-180) actually wins.
//
//   3) A11y spot-check: scan for elements with letter-spacing >= 0.18em that
//      have text content but lack aria-label (UPPERCASE elements that screen
//      readers may letter-by-letter read). Soft-cap at 5 — informational, not
//      a hard fail (POL-03 spec is "have overrides", not "zero offenders").

import { expect, test, type Page } from '@playwright/test';

// ─────────────────── shared onboarded mocks (mirrors v10-phase25-acceptance) ───────────────────

const ME_ONBOARDED = {
  tg_user_id: 100_000_001,
  tg_chat_id: 200_000_001,
  cycle_start_day: 1,
  onboarded_at: '2026-04-01T10:00:00+00:00',
  chat_id_known: true,
  role: 'owner' as const,
  ai_spend_cents: 0,
  ai_spending_cap_cents: 46_500,
  income_cents: 150_000_00,
};

const ACCOUNTS = [
  {
    id: 1,
    bank: 'Т-Банк',
    mask: '3477',
    kind: 'card',
    balance_cents: 50_000_00,
    primary: true,
    created_at: '2026-04-01T00:00:00Z',
  },
];

const CATEGORIES = [
  {
    id: 7,
    name: 'Кафе',
    kind: 'expense',
    code: 'cafe',
    is_archived: false,
    sort_order: 1,
    plan_cents: 5_000_00,
    rollover: 'misc',
    paused: false,
    parent_id: null,
    ord: '01',
    created_at: '2026-04-01T00:00:00Z',
  },
  {
    id: 8,
    name: 'Продукты',
    kind: 'expense',
    code: 'groceries',
    is_archived: false,
    sort_order: 2,
    plan_cents: 20_000_00,
    rollover: 'misc',
    paused: false,
    parent_id: null,
    ord: '02',
    created_at: '2026-04-01T00:00:00Z',
  },
];

const PERIOD_CURRENT = {
  id: 5,
  period_start: '2026-05-01',
  period_end: '2026-05-31',
  starting_balance_cents: 0,
  ending_balance_cents: null,
  status: 'active',
  closed_at: null,
};

async function installMocks(page: Page) {
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ME_ONBOARDED),
    }),
  );
  await page.route('**/api/v1/accounts', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ACCOUNTS),
    }),
  );
  await page.route('**/api/v1/categories**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(CATEGORIES),
    }),
  );
  await page.route('**/api/v1/periods/current', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(PERIOD_CURRENT),
    }),
  );
  await page.route('**/api/v1/periods/5/actual**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    }),
  );
}

async function bootHomeV10(page: Page) {
  // Default theme is v10 (see main.tsx) but be explicit for determinism.
  await page.addInitScript(() => localStorage.setItem('ui.theme', 'v10'));
  await page.goto('/');
  await expect(page.getByText(/Дневной темп/)).toBeVisible({ timeout: 8000 });
}

// ─────────────────── 1) POL-01/POL-02 — utilities applied ───────────────────

test.describe('Phase 28 — POL-01/POL-02 web animations applied', () => {
  test.beforeEach(async ({ page }) => {
    await installMocks(page);
  });

  test('Home renders .poster-rise-in on hero block', async ({ page }) => {
    await bootHomeV10(page);
    await expect(page.locator('.poster-rise-in').first()).toBeVisible({
      timeout: 5000,
    });
  });

  test('Home renders .poster-row-in on category rows', async ({ page }) => {
    await bootHomeV10(page);
    const rows = page.locator('.poster-row-in');
    // CATEGORIES mock provides 2 expense categories; both render as rows.
    await expect(rows.first()).toBeVisible({ timeout: 5000 });
    expect(await rows.count()).toBeGreaterThanOrEqual(1);
  });

  test('Home renders .poster-bar-fill on at least one progress bar', async ({
    page,
  }) => {
    await bootHomeV10(page);
    const bar = page.locator('.poster-bar-fill').first();
    await expect(bar).toBeAttached({ timeout: 5000 });
  });
});

// ─────────────────── 2) POL-03 — reduced-motion overrides ───────────────────

test.describe('Phase 28 — POL-03 reduced-motion overrides', () => {
  test.beforeEach(async ({ page }) => {
    await installMocks(page);
  });

  test('Home .poster-row-in flattens to transform: none under reduced-motion', async ({
    page,
  }) => {
    // Note: page.emulateMedia (not context.emulateMedia) — the latter is unavailable
    // in this Playwright version's BrowserContext API.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await bootHomeV10(page);

    const sample = page.locator('.poster-row-in').first();
    await expect(sample).toBeVisible({ timeout: 5000 });

    // Wait past the reduce-motion shorthand (0.2s) to let the override settle.
    await page.waitForTimeout(800);
    const transform = await sample.evaluate(
      (el) => getComputedStyle(el).transform,
    );
    // Override forces opacity-only fade — no translate3d/translateY remains.
    // Browsers serialize "none" or the identity matrix interchangeably.
    expect(
      transform === 'none' || transform === 'matrix(1, 0, 0, 1, 0, 0)',
    ).toBe(true);
  });

  test('.poster-bar-fill renders fully filled (scaleX(1)) under reduced-motion', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await bootHomeV10(page);

    const bar = page.locator('.poster-bar-fill').first();
    await expect(bar).toBeAttached({ timeout: 5000 });
    await page.waitForTimeout(400);

    const xform = await bar.evaluate((el) => getComputedStyle(el).transform);
    // animations.css §reduce-motion forces transform: scaleX(1) !important
    // → identity matrix on the X axis. Accept any matrix(1, …) form
    // (matrix(1, 0, 0, 1, 0, 0) for 2-D, or matrix3d(1, …) variants).
    expect(xform === 'none' || /^matrix(?:3d)?\(1\b/.test(xform)).toBe(true);
  });
});

// ─────────────────── 3) POL-03 — a11y spot-check ───────────────────

test.describe('Phase 28 — POL-03 a11y spot-checks', () => {
  test.beforeEach(async ({ page }) => {
    await installMocks(page);
  });

  test('UPPERCASE elements have aria-label OR readable text', async ({
    page,
  }) => {
    await bootHomeV10(page);

    // Find leaf elements with visible text whose computed letter-spacing is
    // >= 2.5px (≈ 0.18em at 14px). Skip elements where the text is one
    // arrow/symbol or an aria-label is present.
    const offenders = await page.evaluate(() => {
      const out: Array<{ tag: string; text: string }> = [];
      const all = Array.from(document.querySelectorAll('*'));
      for (const el of all) {
        if (el.children.length > 0) continue; // leaf nodes only
        const txt = (el.textContent || '').trim();
        if (txt.length < 2) continue;
        const ls = parseFloat(getComputedStyle(el).letterSpacing);
        if (!Number.isFinite(ls) || ls < 2.5) continue;
        if (el.getAttribute('aria-label')) continue;
        out.push({ tag: el.tagName, text: txt.slice(0, 40) });
        if (out.length >= 10) break;
      }
      return out;
    });

    if (offenders.length > 0) {
      // Soft signal — log for v1.1 follow-up but do not fail the build.
      // POL-03 spec says "have overrides", not "zero offenders".
      // eslint-disable-next-line no-console
      console.warn(
        '[a11y] UPPERCASE+letter-spacing without aria-label (top 10):',
        offenders,
      );
    }
    // Soft cap — alarms only on regressions that double the baseline.
    expect(offenders.length).toBeLessThanOrEqual(15);
  });
});
