import { test, expect } from '@playwright/test';

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
        body: JSON.stringify([]),
      });
    }
    if (url.includes('/api/v1/categories')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    if (url.includes('/api/v1/settings')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ cycle_start_day: 5, notify_days_before: 2, is_bot_bound: false }),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
}

async function navigateToSettings(page: import('@playwright/test').Page) {
  // Click "Ещё" bottom nav tab
  await expect(page.locator('button[aria-label="Ещё"]')).toBeVisible({ timeout: 10000 });
  await page.click('button[aria-label="Ещё"]');
  // Click "Настройки" row in MoreScreen
  await expect(page.locator('text=Настройки').first()).toBeVisible({ timeout: 10000 });
  await page.locator('button').filter({ hasText: /Настройки/ }).first().click();
}

test('settings screen shows notify_days_before field', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');

  await navigateToSettings(page);

  await expect(
    page.locator('text=Уведомления о подписках').first()
  ).toBeVisible({ timeout: 10000 });
});

test('settings screen shows cycle_start_day field', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');

  await navigateToSettings(page);

  await expect(
    page.locator('text=День начала периода')
  ).toBeVisible({ timeout: 10000 });
});
