import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * UI rework handoff snapshot — mobile viewport (iPhone 14, 390×844, DPR=3, hasTouch).
 *
 * Output: ../.planning/ui-rework/screenshots/NN-screen-state.png
 * Purpose: handoff package for Anthropic Claude Design (UI redesign).
 *
 * НЕ модифицирует frontend/tests/e2e/ui-audit.spec.ts (легаси, desktop viewport).
 * Helpers (mockApiRich, waitForLoad) намеренно скопированы из ui-audit.spec.ts —
 * spec автономный, легаси может быть удалён в будущем.
 */

/**
 * Mobile viewport — iPhone 14 (390×844). Запускаемся на chromium-проекте
 * (см. playwright.config.ts), поэтому НЕ используем `devices['iPhone 14']`
 * (там defaultBrowserType='webkit', а webkit не установлен в этом окружении).
 * Применяем mobile-параметры вручную — даёт идентичный layout-эффект.
 */
test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  hasTouch: true,
  isMobile: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ' +
    'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});

const SCREENSHOTS_DIR = path.resolve(__dirname, '../../../.planning/ui-rework/screenshots');

test.beforeAll(() => {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
});

// -------- Mock helpers (cloned from ui-audit.spec.ts + extended for v0.5 endpoints) --------

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
          role: 'owner',
          ai_spend_cents: 320,
          ai_spending_cap_cents: 46500,
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

    // ---- Phase 16 v0.5 extensions ----

    if (url.includes('/api/v1/analytics/trend')) {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          points: [
            { period_label: 'Дек', expense_cents: 78000, income_cents: 150000 },
            { period_label: 'Янв', expense_cents: 82000, income_cents: 150000 },
            { period_label: 'Фев', expense_cents: 91000, income_cents: 152000 },
            { period_label: 'Мар', expense_cents: 76000, income_cents: 150000 },
            { period_label: 'Апр', expense_cents: 84500, income_cents: 137200 },
          ],
        }),
      });
    }
    if (url.includes('/api/v1/analytics/top-overspend')) {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          items: [
            { category_id: 3, name: 'Кафе', planned_cents: 15000, actual_cents: 18200, overspend_pct: 21.3 },
            { category_id: 2, name: 'Транспорт', planned_cents: 10000, actual_cents: 11500, overspend_pct: 15.0 },
            { category_id: 6, name: 'Развлечения', planned_cents: 10000, actual_cents: 10800, overspend_pct: 8.0 },
          ],
        }),
      });
    }
    if (url.includes('/api/v1/analytics/top-categories')) {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          items: [
            { category_id: 1, name: 'Продукты', actual_cents: 18500, planned_cents: 20000 },
            { category_id: 3, name: 'Кафе', actual_cents: 14800, planned_cents: 15000 },
            { category_id: 2, name: 'Транспорт', actual_cents: 9200, planned_cents: 10000 },
          ],
        }),
      });
    }
    if (url.includes('/api/v1/analytics/forecast')) {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          mode: 'forecast',
          starting_balance_cents: 5000000,
          planned_income_cents: 150000,
          planned_expense_cents: 85000,
          projected_end_balance_cents: 5065000,
          period_end: '2026-05-04',
        }),
      });
    }

    if (url.includes('/api/v1/admin/users')) {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify([
          { id: 1, tg_user_id: 123456789, tg_chat_id: 987654321, role: 'owner',
            last_seen_at: '2026-05-08T10:00:00+00:00', onboarded_at: '2026-04-05T00:00:00+00:00',
            created_at: '2026-04-01T00:00:00+00:00', spending_cap_cents: 46500 },
          { id: 2, tg_user_id: 234567890, tg_chat_id: null, role: 'member',
            last_seen_at: '2026-05-07T15:30:00+00:00', onboarded_at: '2026-04-10T00:00:00+00:00',
            created_at: '2026-04-09T00:00:00+00:00', spending_cap_cents: 10000 },
          { id: 3, tg_user_id: 345678901, tg_chat_id: null, role: 'revoked',
            last_seen_at: '2026-04-20T08:00:00+00:00', onboarded_at: null,
            created_at: '2026-04-15T00:00:00+00:00', spending_cap_cents: 0 },
        ]),
      });
    }
    if (url.includes('/api/v1/admin/ai-usage')) {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          users: [
            { user_id: 1, tg_user_id: 123456789, name: 'Owner', role: 'owner',
              spending_cap_cents: 46500,
              current_month: { requests: 142, prompt_tokens: 28500, completion_tokens: 9100, cached_tokens: 1200, total_tokens: 38800, est_cost_usd: 3.20 },
              last_30d:      { requests: 178, prompt_tokens: 35100, completion_tokens: 11200, cached_tokens: 1500, total_tokens: 47800, est_cost_usd: 4.05 },
              est_cost_cents_current_month: 320,
              pct_of_cap: 0.0069 },
            { user_id: 2, tg_user_id: 234567890, name: null, role: 'member',
              spending_cap_cents: 10000,
              current_month: { requests: 12, prompt_tokens: 1800, completion_tokens: 720, cached_tokens: 0, total_tokens: 2520, est_cost_usd: 0.18 },
              last_30d:      { requests: 14, prompt_tokens: 2100, completion_tokens: 880, cached_tokens: 0, total_tokens: 2980, est_cost_usd: 0.22 },
              est_cost_cents_current_month: 18,
              pct_of_cap: 0.0018 },
          ],
          generated_at: '2026-05-08T12:00:00+00:00',
        }),
      });
    }
    if (url.includes('/api/v1/ai/conversations')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    }

    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
}

async function waitForLoad(page: import('@playwright/test').Page) {
  // Wait for BottomNav to be visible — proves React mounted and user loaded.
  await expect(page.locator('button[aria-label="Главная"]')).toBeVisible({ timeout: 10000 });
}

// ---------- Tab-level scenarios ----------

test('rework-01: Home — expenses tab', async ({ page }) => {
  await mockApiRich(page);
  await page.goto('/');
  await waitForLoad(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/01-home-expenses.png`, fullPage: true });
});

test('rework-02: Home — income tab', async ({ page }) => {
  await mockApiRich(page);
  await page.goto('/');
  await waitForLoad(page);
  await page.click('button:has-text("Доходы")');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/02-home-income.png`, fullPage: true });
});

test('rework-03: Home — empty state', async ({ page }) => {
  await page.route('**/api/v1/**', (route) => {
    const url = route.request().url();
    if (url.includes('/api/v1/me')) return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        tg_user_id: 1, tg_chat_id: null, cycle_start_day: 5,
        onboarded_at: '2026-04-05T00:00:00Z', chat_id_known: false,
        role: 'owner', ai_spend_cents: 0, ai_spending_cap_cents: 46500,
      }),
    });
    if (url.includes('/api/v1/periods/current')) return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        id: 1, period_start: '2026-04-05', period_end: '2026-05-04',
        starting_balance_cents: 0, ending_balance_cents: null,
        status: 'active', closed_at: null,
      }),
    });
    if (url.match(/\/api\/v1\/periods\/\d+\/balance/)) return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        period_id: 1, balance_now_cents: 0, delta_total_cents: 0,
        planned_total_expense_cents: 0, actual_total_expense_cents: 0,
        planned_total_income_cents: 0, actual_total_income_cents: 0,
        by_category: [],
      }),
    });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.goto('/');
  await waitForLoad(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/03-home-empty.png`, fullPage: true });
});

test('rework-04: Transactions — history (FAB visible)', async ({ page }) => {
  await mockApiRich(page);
  await page.goto('/');
  await waitForLoad(page);
  await page.click('button[aria-label="Транзакции"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/04-transactions-history.png`, fullPage: true });
});

test('rework-05: Transactions — Plan sub-tab', async ({ page }) => {
  await mockApiRich(page);
  await page.goto('/');
  await waitForLoad(page);
  await page.click('button[aria-label="Транзакции"]');
  await page.waitForTimeout(300);
  await page.click('button:has-text("План")');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/05-transactions-plan.png`, fullPage: true });
});

test('rework-06: Transactions — history filtered by category', async ({ page }) => {
  await mockApiRich(page);
  await page.goto('/');
  await waitForLoad(page);
  // Click first category row on Home to navigate to filtered Transactions.
  const catRow = page.locator('button[class*="rowButton"]').first();
  const hasCatRow = await catRow.count() > 0;
  if (hasCatRow) {
    await catRow.click();
    await page.waitForTimeout(400);
  } else {
    // Fallback: just go to Transactions tab.
    await page.click('button[aria-label="Транзакции"]');
    await page.waitForTimeout(400);
  }
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/06-transactions-history-filtered.png`, fullPage: true });
});

test('rework-07: Analytics', async ({ page }) => {
  await mockApiRich(page);
  await page.goto('/');
  await waitForLoad(page);
  await page.click('button[aria-label="Аналитика"]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/07-analytics.png`, fullPage: true });
});

test('rework-08: AI — empty', async ({ page }) => {
  await mockApiRich(page);
  await page.goto('/');
  await waitForLoad(page);
  await page.click('button[aria-label="AI"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/08-ai-empty.png`, fullPage: true });
});

test('rework-09: Management — hub', async ({ page }) => {
  await mockApiRich(page);
  await page.goto('/');
  await waitForLoad(page);
  await page.click('button[aria-label="Управление"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/09-management-hub.png`, fullPage: true });
});

test('rework-10: Onboarding', async ({ page }) => {
  await page.route('**/api/v1/**', (route) => {
    const url = route.request().url();
    if (url.includes('/api/v1/me')) return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        tg_user_id: 1, tg_chat_id: null, cycle_start_day: 5,
        onboarded_at: null, chat_id_known: false,
        role: 'owner', ai_spend_cents: 0, ai_spending_cap_cents: 46500,
      }),
    });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.goto('/');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/10-onboarding.png`, fullPage: true });
});

// ---------- Management sub-screens ----------

test('rework-11: Management — Subscriptions list', async ({ page }) => {
  await mockApiRich(page);
  await page.goto('/');
  await waitForLoad(page);
  await page.click('button[aria-label="Управление"]');
  await page.waitForTimeout(300);
  await page.locator('text=Подписки').first().click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/11-management-subscriptions.png`, fullPage: true });
});

test('rework-12: Management — Template list', async ({ page }) => {
  await mockApiRich(page);
  await page.goto('/');
  await waitForLoad(page);
  await page.click('button[aria-label="Управление"]');
  await page.waitForTimeout(300);
  await page.locator('text=Шаблон').first().click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/12-management-template.png`, fullPage: true });
});

test('rework-13: Management — Categories list', async ({ page }) => {
  await mockApiRich(page);
  await page.goto('/');
  await waitForLoad(page);
  await page.click('button[aria-label="Управление"]');
  await page.waitForTimeout(300);
  await page.locator('text=Категории').first().click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/13-management-categories.png`, fullPage: true });
});

test('rework-14: Management — Settings', async ({ page }) => {
  await mockApiRich(page);
  await page.goto('/');
  await waitForLoad(page);
  await page.click('button[aria-label="Управление"]');
  await page.waitForTimeout(300);
  await page.locator('button').filter({ hasText: /Настройки/ }).first().click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/14-management-settings.png`, fullPage: true });
});

test('rework-15: Management — Access (owner-only)', async ({ page }) => {
  await mockApiRich(page);
  await page.goto('/');
  await waitForLoad(page);
  await page.click('button[aria-label="Управление"]');
  await page.waitForTimeout(300);
  await page.locator('text=Доступ').first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/15-management-access.png`, fullPage: true });
});

// ---------- Modal/sheet states ----------

test('rework-16: Add transaction bottom-sheet (FAB on Transactions)', async ({ page }) => {
  await mockApiRich(page);
  await page.goto('/');
  await waitForLoad(page);
  await page.click('button[aria-label="Транзакции"]');
  await page.waitForTimeout(400);
  await page.click('button[aria-label="Добавить транзакцию"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/16-add-transaction-sheet.png`, fullPage: true });
});

// ---------- Optional/extended scenarios (non-blocking) ----------

test('rework-17: Edit subscription sheet', async ({ page }) => {
  await mockApiRich(page);
  await page.goto('/');
  await waitForLoad(page);
  await page.click('button[aria-label="Управление"]');
  await page.waitForTimeout(300);
  await page.locator('text=Подписки').first().click();
  await page.waitForTimeout(400);
  // Click on first subscription row to open edit sheet (best-effort, non-blocking).
  const firstRow = page.locator('text=Netflix').first();
  if (await firstRow.count() > 0) {
    await firstRow.click();
    await page.waitForTimeout(400);
  }
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/17-subscription-edit.png`, fullPage: true });
});

test('rework-18: Plan create sheet (FAB on Plan sub-tab)', async ({ page }) => {
  await mockApiRich(page);
  await page.goto('/');
  await waitForLoad(page);
  await page.click('button[aria-label="Транзакции"]');
  await page.waitForTimeout(300);
  await page.click('button:has-text("План")');
  await page.waitForTimeout(400);
  // FAB ariaLabel switches to "Добавить строку плана" on Plan sub-tab.
  const fab = page.locator('button[aria-label="Добавить строку плана"]');
  if (await fab.count() > 0) {
    await fab.click();
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/18-plan-create-sheet.png`, fullPage: true });
});
