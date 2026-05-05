import { test, expect } from '@playwright/test';
import path from 'path';

const SCREENSHOTS_DIR = path.join(process.cwd(), 'tests/ui-audit-screenshots');

// Common API mock — onboarded user with rich data
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
            { category_id: 4, name: 'Одежда', kind: 'expense', planned_cents: 20000, actual_cents: 0 },
            { category_id: 5, name: 'Здоровье', kind: 'expense', planned_cents: 10000, actual_cents: 0 },
            { category_id: 6, name: 'Развлечения', kind: 'expense', planned_cents: 10000, actual_cents: 0 },
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
            { category_id: 4, name: 'Одежда', kind: 'expense', planned_cents: 20000, actual_cents: 0 },
            { category_id: 5, name: 'Здоровье', kind: 'expense', planned_cents: 10000, actual_cents: 0 },
            { category_id: 6, name: 'Развлечения', kind: 'expense', planned_cents: 10000, actual_cents: 0 },
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
    if (url.includes('/api/v1/periods')) {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify([
          { id: 1, period_start: '2026-04-05', period_end: '2026-05-04', starting_balance_cents: 5000000, ending_balance_cents: null, status: 'active', closed_at: null },
          { id: 2, period_start: '2026-03-05', period_end: '2026-04-04', starting_balance_cents: 4800000, ending_balance_cents: 5000000, status: 'closed', closed_at: '2026-04-05T00:00:00+00:00' },
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
          { id: 4, name: 'Одежда', kind: 'expense', is_archived: false, sort_order: 4 },
          { id: 5, name: 'Здоровье', kind: 'expense', is_archived: false, sort_order: 5 },
          { id: 6, name: 'Развлечения', kind: 'expense', is_archived: false, sort_order: 6 },
          { id: 7, name: 'Зарплата', kind: 'income', is_archived: false, sort_order: 1 },
        ]),
      });
    }
    if (url.includes('/api/v1/subscriptions')) {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify([
          { id: 1, name: 'Netflix', amount_cents: 69900, cycle: 'monthly', next_charge_date: '2026-05-10', category_id: 6, notify_days_before: 2, is_active: true, category: { id: 6, name: 'Развлечения', kind: 'expense', is_archived: false, sort_order: 6 } },
          { id: 2, name: 'Spotify', amount_cents: 29900, cycle: 'monthly', next_charge_date: '2026-05-06', category_id: 6, notify_days_before: 2, is_active: true, category: { id: 6, name: 'Развлечения', kind: 'expense', is_archived: false, sort_order: 6 } },
          { id: 3, name: 'iCloud', amount_cents: 9900, cycle: 'monthly', next_charge_date: '2026-05-15', category_id: 6, notify_days_before: 1, is_active: true, category: { id: 6, name: 'Развлечения', kind: 'expense', is_archived: false, sort_order: 6 } },
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
          { id: 1, period_id: 1, category_id: 1, kind: 'expense', amount_cents: 20000, description: null, planned_date: null, source: 'manual' },
          { id: 2, period_id: 1, category_id: 7, kind: 'income', amount_cents: 150000, description: null, planned_date: null, source: 'template' },
        ]),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
}

async function waitForLoad(page: import('@playwright/test').Page) {
  // Wait for BottomNav to be visible — proves React mounted and user loaded.
  await expect(page.locator('button[aria-label="Главная"]')).toBeVisible({ timeout: 10000 });
}

test('audit-01: Home screen - expenses tab', async ({ page }) => {
  await mockApiRich(page);
  await page.goto('/');
  await waitForLoad(page);
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/01-home-expenses.png`, fullPage: true });
});

test('audit-02: Home screen - income tab', async ({ page }) => {
  await mockApiRich(page);
  await page.goto('/');
  await waitForLoad(page);
  await page.click('button:has-text("Доходы")');
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/02-home-income.png`, fullPage: true });
});

test('audit-03: Transactions screen', async ({ page }) => {
  await mockApiRich(page);
  await page.goto('/');
  await waitForLoad(page);
  await page.click('button[aria-label="Транзакции"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/03-transactions.png`, fullPage: true });
});

test('audit-04: Management screen', async ({ page }) => {
  await mockApiRich(page);
  await page.goto('/');
  await waitForLoad(page);
  await page.click('button[aria-label="Управление"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/04-management.png`, fullPage: true });
});

test('audit-05: Management subscriptions screen', async ({ page }) => {
  await mockApiRich(page);
  await page.goto('/');
  await waitForLoad(page);
  await page.click('button[aria-label="Управление"]');
  await page.waitForTimeout(200);
  await page.locator('text=Подписки').first().click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/05-management-subscriptions.png`, fullPage: true });
});

test('audit-06: Settings screen', async ({ page }) => {
  await mockApiRich(page);
  await page.goto('/');
  await waitForLoad(page);
  await page.click('button[aria-label="Управление"]');
  await page.waitForTimeout(200);
  await page.locator('button').filter({ hasText: /Настройки/ }).first().click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/06-settings.png`, fullPage: true });
});

test('audit-07: Add transaction bottom sheet', async ({ page }) => {
  await mockApiRich(page);
  await page.goto('/');
  await waitForLoad(page);
  await page.click('button[aria-label="Добавить транзакцию"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/07-add-transaction.png`, fullPage: true });
});

test('audit-08: Home empty state', async ({ page }) => {
  await page.route('**/api/v1/**', (route) => {
    const url = route.request().url();
    if (url.includes('/api/v1/me')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tg_user_id: 1, tg_chat_id: null, cycle_start_day: 5, onboarded_at: '2026-04-05T00:00:00Z', chat_id_known: false }) });
    if (url.includes('/api/v1/periods/current')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 1, period_start: '2026-04-05', period_end: '2026-05-04', starting_balance_cents: 0, ending_balance_cents: null, status: 'active', closed_at: null }) });
    if (url.match(/\/api\/v1\/periods\/\d+\/balance/)) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ period_id: 1, balance_now_cents: 0, delta_total_cents: 0, planned_total_expense_cents: 0, actual_total_expense_cents: 0, planned_total_income_cents: 0, actual_total_income_cents: 0, by_category: [] }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.goto('/');
  await waitForLoad(page);
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/08-home-empty.png`, fullPage: true });
});

test('audit-09: Onboarding screen', async ({ page }) => {
  await page.route('**/api/v1/**', (route) => {
    const url = route.request().url();
    if (url.includes('/api/v1/me')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tg_user_id: 1, tg_chat_id: null, cycle_start_day: 5, onboarded_at: null, chat_id_known: false }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.goto('/');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/09-onboarding.png`, fullPage: true });
});

test('audit-10: History with category filter', async ({ page }) => {
  await mockApiRich(page);
  await page.goto('/');
  await waitForLoad(page);
  // Click on first category row to filter
  const catRow = page.locator('button[class*="rowButton"]').first();
  const hasCatRow = await catRow.count() > 0;
  if (hasCatRow) {
    await catRow.click();
    await page.waitForTimeout(400);
  } else {
    await page.click('button[aria-label="Транзакции"]');
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/10-history-filtered.png`, fullPage: true });
});
