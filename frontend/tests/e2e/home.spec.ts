import { test, expect } from '@playwright/test';

/**
 * Single-handler API mock to avoid route priority ordering issues.
 * Playwright: last-added route = highest priority.
 * Using one route handler with URL-based dispatch is safest.
 */
async function mockApi(page: import('@playwright/test').Page) {
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
          {
            id: 1,
            period_start: '2026-04-05',
            period_end: '2026-05-04',
            starting_balance_cents: 100000,
            ending_balance_cents: null,
            status: 'active',
            closed_at: null,
          },
        ]),
      });
    }
    if (url.includes('/api/v1/categories')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 1, name: 'Еда', kind: 'expense', is_archived: false, sort_order: 1 },
          { id: 2, name: 'Зарплата', kind: 'income', is_archived: false, sort_order: 2 },
        ]),
      });
    }
    // Default catch-all
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
}

test('loads home screen with tab bar', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');

  // Wait for the app to load (not loading state)
  await expect(page.locator('text=Загрузка…')).not.toBeVisible({ timeout: 5000 });

  // Tab bar should be visible (expense/income tabs)
  const tabBar = page.locator(`.tabBar, [class*="tabBar"]`);
  await expect(tabBar).toBeVisible({ timeout: 5000 });
});

test('home screen shows bottom navigation tabs', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');

  await expect(page.locator('text=Загрузка…')).not.toBeVisible({ timeout: 5000 });

  // Bottom nav tabs should be present (nav v0.3 labels)
  await expect(page.locator('text=Главная')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('text=Транзакции')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('text=Аналитика')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('text=AI')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('text=Управление')).toBeVisible({ timeout: 5000 });
});

test('home screen does not show error state when API responds', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');

  // Should not show error
  await expect(page.locator('text=Не удалось загрузить пользователя')).not.toBeVisible({
    timeout: 5000,
  });
});
