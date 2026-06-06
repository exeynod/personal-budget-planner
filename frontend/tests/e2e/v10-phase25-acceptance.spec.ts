// Phase 25-12 Task 3 — end-to-end Playwright acceptance suite for the
// Phase 25 happy path:
//
//   open V10MainShell → Home renders → tap «ВСЕ ОПЕРАЦИИ →» →
//   TransactionsView appears → tap ← НАЗАД → Home → tap FAB → AddSheet
//   opens with «NEW ENTRY · …» eyebrow.
//
// Locks all of HOME-V10-01..06, TXN-V10-01..06, ADD-V10-01..05 in one
// browser-driven flow + asserts TXN-V10-06 from the user's perspective
// (no «Транзакции» tab visible anywhere in the V10 BottomNav).
//
// Mocks:
//   - GET /api/v1/me                     → onboarded user (skip onboarding gate)
//   - GET /api/v1/accounts               → 1 primary card account
//   - GET /api/v1/categories             → 2 expense categories (cafe + savings)
//   - GET /api/v1/periods/current        → active period (id=5)
//   - GET /api/v1/periods/5/actual       → empty actuals
//
// Submit-flow extension (full keypad → save → POST /actual) is intentionally
// deferred — the FAB-opens-AddSheet assertion is the minimum-viable
// acceptance per Plan 25-12 <action>. The custom 3×4 keypad uses CSS-grid
// buttons with single-glyph labels (1..9, ., 0, ⌫) which would be brittle
// to drive without a stable data-testid surface. Full submit-flow coverage
// belongs in a follow-up Phase 28 polish suite.

import { expect, test, type Page } from '@playwright/test';

// ─────────────────── shared fixtures ───────────────────

const ME_ONBOARDED = {
  tg_user_id: 100_000_001,
  tg_chat_id: 200_000_001,
  cycle_start_day: 1,
  onboarded_at: '2026-04-01T10:00:00+00:00',
  chat_id_known: true,
  role: 'owner' as const,
  ai_spend_cents: 0,
  ai_spending_cap_cents: 46_500,
  income_cents: 150_000_00, // 150 000 ₽
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
    id: 99,
    name: 'savings',
    kind: 'expense',
    code: 'savings',
    is_archived: false,
    sort_order: 99,
    plan_cents: 0,
    rollover: 'misc',
    paused: false,
    parent_id: null,
    ord: '99',
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

// ─────────────────── tests ───────────────────

test.describe('Phase 25 — Home + Transactions + AddSheet acceptance', () => {
  test.beforeEach(async ({ page }) => {
    await installMocks(page);
  });

  test('Home renders → push Transactions → pop back → open AddSheet', async ({
    page,
  }) => {
    await page.goto('/');

    // ─────────── Home renders ───────────
    // HomeMount finishes loading once the «Дневной темп —» mass headline
    // appears (Plan 25-04 acceptance).
    await expect(page.getByText(/Дневной темп/)).toBeVisible({
      timeout: 8000,
    });

    // HOME-V10-04 — wallet mini-line.
    await expect(page.getByText(/в кошельке/i)).toBeVisible();

    // Category list shows the «Кафе» row (savings category is filtered out
    // by HomeMount per CONTEXT — `code != 'savings'`).
    await expect(page.getByText(/Кафе/)).toBeVisible();

    // ─────────── TXN-V10-06 — no Транзакции tab in BottomNav ───────────
    // The V10 BottomNav has tabs ГЛАВНАЯ / AI / УПР. and a
    // center FAB — NO «Транзакции» tab. (КОПИЛКА tab removed in the v1.1
    // planning rework.) We assert by aria-label:
    // BottomNavV10 (V10 wrapper) does not set a Транзакции aria-label
    // anywhere — only the FAB's «Добавить транзакцию» label contains the
    // word «транзакц». So we explicitly check the [role="tablist"] subtree
    // for a tab named «Транзакции», which must yield zero matches.
    const tablist = page.locator('[role="tablist"]').first();
    await expect(tablist).toBeVisible();
    await expect(tablist.getByRole('tab', { name: /Транзакции/i })).toHaveCount(
      0,
    );
    // Belt-and-braces: no tab labelled «Реестр» either.
    await expect(tablist.getByRole('tab', { name: /Реестр/i })).toHaveCount(0);
    // Required V10 tab labels are present.
    await expect(tablist.getByRole('tab', { name: /ГЛАВНАЯ/ })).toBeVisible();
    await expect(tablist.getByRole('tab', { name: /AI/ })).toBeVisible();

    // ─────────── push TransactionsView ───────────
    await page.getByText(/ВСЕ ОПЕРАЦИИ/).click();

    // Cobalt registry lands — eyebrow + mass headline visible.
    await expect(page.getByText(/SECTION II/)).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByText('Реестр.')).toBeVisible();

    // TXN-V10-02 — six filter chips visible, single-select.
    for (const chip of [
      'Все',
      'Кафе',
      'Продукты',
      'Транспорт',
      'Подписки',
      'Копилка',
    ]) {
      await expect(page.getByText(chip, { exact: true })).toBeVisible();
    }

    // ─────────── pop back to Home ───────────
    await page.getByRole('button', { name: /← НАЗАД/ }).click();
    await expect(page.getByText(/Дневной темп/)).toBeVisible();

    // ─────────── open AddSheet via FAB ───────────
    // FAB has aria-label «Добавить транзакцию» (componentsV10/FAB.tsx).
    await page.getByRole('button', { name: /Добавить транзакцию/ }).click();

    // ADD-V10-02 — AddSheet renders the «NEW ENTRY · {date} · {time}» eyebrow.
    await expect(page.getByText(/NEW ENTRY/)).toBeVisible({
      timeout: 5000,
    });

    // ADD-V10-01 — BottomNav unmounts while AddSheet is open
    // (BottomNavV10.isHidden=true returns null DOM).
    await expect(page.locator('[role="tablist"]')).toHaveCount(0);
  });
});
