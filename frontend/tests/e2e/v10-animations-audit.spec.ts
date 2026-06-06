// Phase 28-01 Task 2 — Playwright smoke for V10 poster animations.
//
// Trimmed to 2 smoke tests: (1) animation utility classes applied on Home;
// (2) reduced-motion override flattens transforms. Locks POL-01/02/03 (web).

import { expect, test, type Page } from '@playwright/test';

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
  await page.addInitScript(() => localStorage.setItem('ui.theme', 'v10'));
  await page.goto('/');
  await expect(page.getByText(/Дневной темп/)).toBeVisible({ timeout: 8000 });
}

test.describe('Phase 28 — V10 animations (web)', () => {
  test.beforeEach(async ({ page }) => {
    await installMocks(page);
  });

  test('POL-01/02: Home applies poster animation utility classes', async ({
    page,
  }) => {
    await bootHomeV10(page);
    await expect(page.locator('.poster-rise-in').first()).toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator('.poster-row-in').first()).toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator('.poster-bar-fill').first()).toBeAttached({
      timeout: 5000,
    });
  });

  test('POL-03: reduced-motion flattens row transform + fills bar', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await bootHomeV10(page);

    const row = page.locator('.poster-row-in').first();
    await expect(row).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(800);
    const rowTransform = await row.evaluate(
      (el) => getComputedStyle(el).transform,
    );
    expect(
      rowTransform === 'none' || rowTransform === 'matrix(1, 0, 0, 1, 0, 0)',
    ).toBe(true);

    const bar = page.locator('.poster-bar-fill').first();
    await expect(bar).toBeAttached({ timeout: 5000 });
    const barTransform = await bar.evaluate(
      (el) => getComputedStyle(el).transform,
    );
    expect(
      barTransform === 'none' || /^matrix(?:3d)?\(1\b/.test(barTransform),
    ).toBe(true);
  });
});
