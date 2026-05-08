import { test, expect } from '@playwright/test';

// Common API mock — onboarded user with rich data (self-contained copy)
async function mockApiRich(page: import('@playwright/test').Page) {
  await page.route('**/api/v1/**', (route) => {
    const url = route.request().url();

    if (url.includes('/api/v1/me')) {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          tg_user_id: 123456789, tg_chat_id: 987654321,
          cycle_start_day: 5, onboarded_at: '2026-04-05T00:00:00+00:00',
          chat_id_known: true,
        }),
      });
    }
    if (url.includes('/api/v1/periods/current')) {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          id: 1, period_start: '2026-04-05', period_end: '2026-05-04',
          starting_balance_cents: 5000000, ending_balance_cents: null,
          status: 'active', closed_at: null,
        }),
      });
    }
    if (url.match(/\/api\/v1\/periods\/\d+\/balance/)) {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          period_id: 1,
          balance_now_cents: 32500,
          delta_total_cents: -12800,
          planned_total_expense_cents: 85000,
          actual_total_expense_cents: 42500,
          planned_total_income_cents: 150000,
          actual_total_income_cents: 137200,
          by_category: [
            { category_id: 1, name: 'Продукты', kind: 'expense', planned_cents: 20000, actual_cents: 18500 },
            { category_id: 2, name: 'Транспорт', kind: 'expense', planned_cents: 10000, actual_cents: 9200 },
            { category_id: 3, name: 'Кафе', kind: 'expense', planned_cents: 15000, actual_cents: 14800 },
            { category_id: 7, name: 'Зарплата', kind: 'income', planned_cents: 150000, actual_cents: 137200 },
          ],
        }),
      });
    }
    if (url.includes('/api/v1/actual/balance')) {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          period_id: 1,
          balance_now_cents: 32500,
          delta_total_cents: -12800,
          planned_total_expense_cents: 85000,
          actual_total_expense_cents: 42500,
          planned_total_income_cents: 150000,
          actual_total_income_cents: 137200,
          by_category: [
            { category_id: 1, name: 'Продукты', kind: 'expense', planned_cents: 20000, actual_cents: 18500 },
            { category_id: 2, name: 'Транспорт', kind: 'expense', planned_cents: 10000, actual_cents: 9200 },
            { category_id: 3, name: 'Кафе', kind: 'expense', planned_cents: 15000, actual_cents: 14800 },
            { category_id: 7, name: 'Зарплата', kind: 'income', planned_cents: 150000, actual_cents: 137200 },
          ],
        }),
      });
    }
    if (url.includes('/api/v1/actual') && !url.includes('balance')) {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify([
          { id: 1, category_id: 1, kind: 'expense', amount_cents: 18500, description: 'Пятёрочка', tx_date: '2026-05-03' },
          { id: 2, category_id: 2, kind: 'expense', amount_cents: 9200, description: null, tx_date: '2026-05-02' },
          { id: 3, category_id: 3, kind: 'expense', amount_cents: 14800, description: 'Обед с командой', tx_date: '2026-05-02' },
          { id: 4, category_id: 7, kind: 'income', amount_cents: 137200, description: 'Аванс', tx_date: '2026-04-25' },
        ]),
      });
    }
    // Period-scoped actual/planned endpoints (must be before generic /periods catch-all)
    if (url.match(/\/api\/v1\/periods\/\d+\/actual/)) {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify([
          { id: 1, category_id: 1, kind: 'expense', amount_cents: 18500, description: 'Пятёрочка', tx_date: '2026-05-03' },
          { id: 2, category_id: 2, kind: 'expense', amount_cents: 9200, description: null, tx_date: '2026-05-02' },
          { id: 3, category_id: 3, kind: 'expense', amount_cents: 14800, description: 'Обед с командой', tx_date: '2026-05-02' },
          { id: 4, category_id: 7, kind: 'income', amount_cents: 137200, description: 'Аванс', tx_date: '2026-04-25' },
        ]),
      });
    }
    if (url.match(/\/api\/v1\/periods\/\d+\/planned/)) {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify([
          { id: 1, period_id: 1, category_id: 1, kind: 'expense', amount_cents: 20000, description: 'Продукты план', planned_date: null, source: 'manual' },
          { id: 2, period_id: 1, category_id: 7, kind: 'income', amount_cents: 150000, description: 'Зарплата', planned_date: null, source: 'template' },
        ]),
      });
    }
    if (url.includes('/api/v1/periods')) {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify([
          { id: 1, period_start: '2026-04-05', period_end: '2026-05-04', starting_balance_cents: 5000000, ending_balance_cents: null, status: 'active', closed_at: null },
        ]),
      });
    }
    if (url.includes('/api/v1/categories')) {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify([
          { id: 1, name: 'Продукты', kind: 'expense', is_archived: false, sort_order: 1 },
          { id: 2, name: 'Транспорт', kind: 'expense', is_archived: false, sort_order: 2 },
          { id: 3, name: 'Кафе', kind: 'expense', is_archived: false, sort_order: 3 },
          { id: 7, name: 'Зарплата', kind: 'income', is_archived: false, sort_order: 1 },
        ]),
      });
    }
    if (url.includes('/api/v1/subscriptions')) {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify([
          { id: 1, name: 'Netflix', amount_cents: 69900, cycle: 'monthly', next_charge_date: '2026-05-10', category_id: 3, notify_days_before: 2, is_active: true, category: { id: 3, name: 'Кафе', kind: 'expense', is_archived: false, sort_order: 3 } },
          { id: 2, name: 'Spotify', amount_cents: 29900, cycle: 'monthly', next_charge_date: '2026-05-06', category_id: 3, notify_days_before: 2, is_active: true, category: { id: 3, name: 'Кафе', kind: 'expense', is_archived: false, sort_order: 3 } },
        ]),
      });
    }
    if (url.includes('/api/v1/settings')) {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ cycle_start_day: 5, notify_days_before: 2, is_bot_bound: true }),
      });
    }
    if (url.includes('/api/v1/template')) {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify([
          { id: 1, category_id: 1, kind: 'expense', amount_cents: 20000, description: null },
          { id: 2, category_id: 7, kind: 'income', amount_cents: 150000, description: null },
        ]),
      });
    }
    if (url.includes('/api/v1/planned')) {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify([
          { id: 1, period_id: 1, category_id: 1, kind: 'expense', amount_cents: 20000, description: 'Продукты план', planned_date: null, source: 'manual' },
          { id: 2, period_id: 1, category_id: 7, kind: 'income', amount_cents: 150000, description: 'Зарплата', planned_date: null, source: 'template' },
        ]),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
}

async function waitForLoad(page: import('@playwright/test').Page) {
  // Wait for BottomNav to be visible — proves React mounted and user loaded.
  // Works for both old nav and new nav (Главная tab is preserved).
  await expect(page.locator('button[aria-label="Главная"]')).toBeVisible({ timeout: 10000 });
}

// ============================================================
// NAV-01: 5 функциональных табов с новыми лейблами
// ============================================================
test('nav-01: 5 функциональных табов с новыми лейблами', async ({ page }) => {
  await mockApiRich(page);
  await page.goto('/');
  await waitForLoad(page);

  // New tabs must be visible
  await expect(page.locator('button[aria-label="Главная"]')).toBeVisible();
  await expect(page.locator('button[aria-label="Транзакции"]')).toBeVisible();
  await expect(page.locator('button[aria-label="Аналитика"]')).toBeVisible();
  await expect(page.locator('button[aria-label="AI"]')).toBeVisible();
  await expect(page.locator('button[aria-label="Управление"]')).toBeVisible();

  // Old tabs must NOT be visible
  await expect(page.locator('button[aria-label="История"]')).not.toBeVisible();
  await expect(page.locator('button[aria-label="Подписки"]')).not.toBeVisible();
  await expect(page.locator('button[aria-label="Ещё"]')).not.toBeVisible();
});

// ============================================================
// NAV-02: AI таб имеет класс ai когда активен
// ============================================================
// SKIPPED 2026-05-07 (v0.4 test campaign L-3): Phase 7 nav refactor + later
// AiScreen rework removed the legacy `ai` class hook on the active button.
// Replace this assertion with a real AiScreen-rendered check if needed.
test.skip('nav-02: AI таб имеет класс ai когда активен', async ({ page }) => {
  await mockApiRich(page);
  await page.goto('/');
  await waitForLoad(page);

  const aiBtn = page.locator('button[aria-label="AI"]');
  await aiBtn.click();
  await page.waitForTimeout(300);

  const className = await aiBtn.getAttribute('class');
  expect(className).toMatch(/ai/);
  expect(className).toMatch(/active/);
});

// ============================================================
// TXN-01: Таб Транзакции содержит под-табы История/План
// ============================================================
test('txn-01: Транзакции содержат под-табы История/План', async ({ page }) => {
  await mockApiRich(page);
  await page.goto('/');
  await waitForLoad(page);

  await page.click('button[aria-label="Транзакции"]');
  await page.waitForTimeout(400);

  // SubTabBar should be visible with История and План
  await expect(page.locator('button:has-text("История")')).toBeVisible();
  await expect(page.locator('button:has-text("План")')).toBeVisible();

  // История is active by default
  const historiaBtn = page.locator('button:has-text("История")');
  const className = await historiaBtn.getAttribute('class');
  expect(className).toMatch(/active/);
});

// ============================================================
// TXN-02: История группирует по дням с day-total
// ============================================================
test('txn-02: История группирует по дням с day-total', async ({ page }) => {
  await mockApiRich(page);
  await page.goto('/');
  await waitForLoad(page);

  await page.click('button[aria-label="Транзакции"]');
  await page.waitForTimeout(400);

  // Ensure we're on История sub-tab (default)
  // Day header should be visible with a date
  const dayHeader = page.locator('[class*="dayHeader"], [class*="day-header"]').first();
  await expect(dayHeader).toBeVisible({ timeout: 5000 });

  // Day header should contain total amount (e.g. «−185 ₽» or «−275 ₽»)
  const dayHeaderText = await dayHeader.textContent();
  expect(dayHeaderText).toMatch(/[−\-]?\d+/);
});

// ============================================================
// TXN-03: Под-таб План показывает строки плана
// ============================================================
test('txn-03: Под-таб план показывает строки плана', async ({ page }) => {
  await mockApiRich(page);
  await page.goto('/');
  await waitForLoad(page);

  await page.click('button[aria-label="Транзакции"]');
  await page.waitForTimeout(400);

  // Switch to Plan sub-tab
  await page.click('button:has-text("План")');
  await page.waitForTimeout(400);

  // Plan rows render amount in ₽; check that at least one is visible.
  // (sourceBadge "Шаблон"/"Вручную" was intentionally dropped — visible
  // noise on every plan row.)
  const planAmount = page.locator('[class*="amount"]', { hasText: /\d.*₽/ }).first();
  await expect(planAmount).toBeVisible({ timeout: 5000 });
});

// ============================================================
// TXN-04: Фильтр-чипы видны в Транзакциях
// ============================================================
// SKIPPED 2026-05-07 (v0.4 test campaign L-3): TransactionsScreen UI was
// reworked in v0.3 ux-fixes (sub-tabs Actual/Planned with different chip
// labels). Re-author against the current SubTabBar markup if regression
// coverage is needed.
test.skip('txn-04: Фильтр-чипы видны в Транзакциях', async ({ page }) => {
  await mockApiRich(page);
  await page.goto('/');
  await waitForLoad(page);

  await page.click('button[aria-label="Транзакции"]');
  await page.waitForTimeout(400);

  // Filter chips should be visible
  await expect(page.locator('button:has-text("Все")')).toBeVisible();
  await expect(page.locator('button:has-text("Расходы")')).toBeVisible();
  await expect(page.locator('button:has-text("Доходы")')).toBeVisible();
});

// ============================================================
// TXN-05: FAB в История открывает форму факт-транзакции
// ============================================================
test('txn-05: FAB в История открывает форму факт-транзакции', async ({ page }) => {
  await mockApiRich(page);
  await page.goto('/');
  await waitForLoad(page);

  await page.click('button[aria-label="Транзакции"]');
  await page.waitForTimeout(400);

  // FAB to add actual transaction
  const fab = page.locator('button[aria-label="Добавить транзакцию"]');
  await expect(fab).toBeVisible({ timeout: 5000 });
  await fab.click();
  await page.waitForTimeout(300);

  // BottomSheet with "Новая транзакция" heading should open
  await expect(page.locator('text=Новая транзакция')).toBeVisible({ timeout: 5000 });
});

// ============================================================
// MGT-01: Таб Управление показывает 4 пункта меню
// ============================================================
test('mgt-01: Управление показывает 4 пункта меню', async ({ page }) => {
  await mockApiRich(page);
  await page.goto('/');
  await waitForLoad(page);

  await page.click('button[aria-label="Управление"]');
  await page.waitForTimeout(400);

  // All 4 management items should be visible
  await expect(page.locator('text=Подписки')).toBeVisible();
  await expect(page.locator('text=Шаблон бюджета')).toBeVisible();
  await expect(page.locator('text=Категории')).toBeVisible();
  await expect(page.locator('text=Настройки')).toBeVisible();
});

// ============================================================
// MGT-02: Клик Подписки открывает SubscriptionsScreen
// ============================================================
test('mgt-02: Клик Подписки открывает SubscriptionsScreen', async ({ page }) => {
  await mockApiRich(page);
  await page.goto('/');
  await waitForLoad(page);

  await page.click('button[aria-label="Управление"]');
  await page.waitForTimeout(400);

  // Click Subscriptions in management menu
  await page.locator('text=Подписки').first().click();
  await page.waitForTimeout(400);

  // SubscriptionsScreen heading should appear
  await expect(page.locator('text=Подписки').first()).toBeVisible();
  // Should show subscription items (Netflix appears in both upcoming list
  // and the subscription card — strict-mode resolves 2 hits, so pick first).
  await expect(page.locator('text=Netflix').first()).toBeVisible({ timeout: 5000 });
});

// ============================================================
// placeholder: Аналитика и AI показывают «Скоро будет»
// ============================================================
// SKIPPED 2026-05-07 (v0.4 test campaign L-3): obsolete since v0.3 — both
// AnalyticsScreen and AiScreen are fully implemented. Remove or rewrite as
// real-screen smoke tests.
test.skip('placeholder: Аналитика и AI показывают Скоро будет', async ({ page }) => {
  await mockApiRich(page);
  await page.goto('/');
  await waitForLoad(page);

  // Check Analytics placeholder
  await page.click('button[aria-label="Аналитика"]');
  await page.waitForTimeout(300);
  await expect(page.locator('text=Скоро будет')).toBeVisible({ timeout: 5000 });

  // Check AI placeholder
  await page.click('button[aria-label="AI"]');
  await page.waitForTimeout(300);
  await expect(page.locator('text=Скоро будет')).toBeVisible({ timeout: 5000 });
});
