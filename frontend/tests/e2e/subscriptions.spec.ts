import { test, expect } from '@playwright/test';

/**
 * Single-handler API mock: routes all /api/v1/* calls.
 * Playwright last-added = highest priority, so use ONE route handler to avoid ordering issues.
 */
async function mockApi(page: import('@playwright/test').Page, subscriptions: unknown[] = []) {
  await page.route('**/api/v1/**', (route) => {
    const url = route.request().url();

    if (url.includes('/api/v1/me')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tg_user_id: 123456789,
          tg_chat_id: null,
          cycle_start_day: 5,
          onboarded_at: '2026-04-05T00:00:00+00:00',
          chat_id_known: false,
        }),
      });
    }
    if (url.includes('/api/v1/periods/current')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 1,
          period_start: '2026-04-05',
          period_end: '2026-05-04',
          starting_balance_cents: 100000,
          ending_balance_cents: null,
          status: 'active',
          closed_at: null,
        }),
      });
    }
    if (url.match(/\/api\/v1\/periods\/\d+\/balance/)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ period_id: 1, balance_now_cents: 0, by_category: [] }),
      });
    }
    if (url.includes('/api/v1/actual/balance')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ period_id: 1, balance_now_cents: 0, by_category: [] }),
      });
    }
    if (url.includes('/api/v1/periods')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 1, period_start: '2026-04-05', period_end: '2026-05-04', starting_balance_cents: 100000, ending_balance_cents: null, status: 'active', closed_at: null },
        ]),
      });
    }
    if (url.includes('/api/v1/categories')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 1, name: 'Подписки-кат', kind: 'expense', is_archived: false, sort_order: 1 },
        ]),
      });
    }
    if (url.includes('/api/v1/subscriptions')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(subscriptions),
      });
    }
    if (url.includes('/api/v1/settings')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ cycle_start_day: 5, notify_days_before: 2, is_bot_bound: false }),
      });
    }
    // Default catch-all
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
}

async function clickBottomNavTab(page: import('@playwright/test').Page, ariaLabel: string) {
  await expect(page.locator(`button[aria-label="${ariaLabel}"]`)).toBeVisible({ timeout: 10000 });
  await page.click(`button[aria-label="${ariaLabel}"]`);
}

test('shows subscriptions screen when navigating', async ({ page }) => {
  await mockApi(page, []);
  await page.goto('/');

  await clickBottomNavTab(page, 'Управление');
  await page.locator('button').filter({ hasText: /Подписки/ }).first().click();

  await expect(page.locator('text=Подписок пока нет')).toBeVisible({ timeout: 10000 });
});

test('shows subscriptions with data', async ({ page }) => {
  const today = new Date();
  const nextMonth = new Date(today);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const nextMonthStr = nextMonth.toISOString().split('T')[0];

  await mockApi(page, [
    {
      id: 1,
      name: 'Netflix',
      amount_cents: 69900,
      cycle: 'monthly',
      next_charge_date: nextMonthStr,
      category_id: 1,
      notify_days_before: 2,
      is_active: true,
      category: { id: 1, name: 'Подписки-кат', kind: 'expense', is_archived: false, sort_order: 1 },
    },
  ]);

  await page.goto('/');
  await clickBottomNavTab(page, 'Управление');
  await page.locator('button').filter({ hasText: /Подписки/ }).first().click();
  await expect(page.locator('text=Netflix').first()).toBeVisible({ timeout: 10000 });
});
