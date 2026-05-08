import { test, expect, type Page } from '@playwright/test';

/**
 * CODE-01 e2e parity:
 *  - Open TransactionEditor (actual) (Транзакции → История → Fab "Добавить транзакцию"),
 *    type "100,50", submit, intercept POST /api/v1/actual,
 *    capture amount_cents.
 *  - Open TransactionEditor (planned) (Транзакции → План → Fab "Добавить строку плана"),
 *    type "100,50", submit, intercept POST /api/v1/periods/{id}/planned,
 *    capture amount_cents.
 *  - Assert both amounts equal (and equal to 10050).
 *
 * Single canonical parseRublesToKopecks (frontend/src/utils/format.ts) is
 * imported by both editors after Plan 16-09 dedup; identical input strings
 * MUST yield identical amount_cents. Before the fix the two editors used
 * different impls (digit-walk vs parseFloat) — the parity test would fail
 * for edge inputs like "0.001".
 */

const ME_RESPONSE = {
  tg_user_id: 123456789,
  tg_chat_id: 1001,
  cycle_start_day: 5,
  onboarded_at: '2026-04-05T00:00:00+00:00',
  chat_id_known: true,
  role: 'owner',
  ai_spend_cents: 0,
  ai_spending_cap_cents: 100,
};

const PERIOD_RESPONSE = {
  id: 1,
  period_start: '2026-04-05',
  period_end: '2026-05-04',
  starting_balance_cents: 100000,
  ending_balance_cents: null,
  status: 'active',
  closed_at: null,
};

const CATEGORIES = [
  { id: 1, name: 'Еда', kind: 'expense', is_archived: false, sort_order: 1 },
  { id: 2, name: 'Зарплата', kind: 'income', is_archived: false, sort_order: 2 },
];

interface CapturedAmounts {
  actual: number | null;
  planned: number | null;
}

async function mockApi(page: Page, captured: CapturedAmounts) {
  await page.route('**/api/v1/**', (route) => {
    const url = route.request().url();
    const method = route.request().method();

    // Capture POST /actual
    if (url.match(/\/api\/v1\/actual$/) && method === 'POST') {
      const body = route.request().postDataJSON();
      captured.actual = body.amount_cents;
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 1,
          period_id: 1,
          ...body,
          created_at: '2026-05-07T20:00:00+00:00',
        }),
      });
    }

    // Capture POST /periods/{id}/planned
    if (url.match(/\/api\/v1\/periods\/\d+\/planned$/) && method === 'POST') {
      const body = route.request().postDataJSON();
      captured.planned = body.amount_cents;
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 1,
          period_id: 1,
          source: 'manual',
          ...body,
          created_at: '2026-05-07T20:00:00+00:00',
        }),
      });
    }

    if (url.includes('/api/v1/me')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ME_RESPONSE),
      });
    }
    if (url.includes('/api/v1/periods/current')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(PERIOD_RESPONSE),
      });
    }
    if (url.match(/\/api\/v1\/periods\/\d+\/balance/) || url.includes('/api/v1/actual/balance')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          period_id: 1,
          period_start: PERIOD_RESPONSE.period_start,
          period_end: PERIOD_RESPONSE.period_end,
          starting_balance_cents: 100000,
          planned_total_expense_cents: 0,
          actual_total_expense_cents: 0,
          planned_total_income_cents: 0,
          actual_total_income_cents: 0,
          balance_now_cents: 100000,
          delta_total_cents: 0,
          by_category: [],
        }),
      });
    }
    if (url.includes('/api/v1/categories')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(CATEGORIES),
      });
    }
    if (url.match(/\/api\/v1\/periods\/\d+\/(planned|actual)/)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    }
    if (url.includes('/api/v1/periods')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([PERIOD_RESPONSE]),
      });
    }
    if (url.includes('/api/v1/settings')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          cycle_start_day: 5,
          notify_days_before: 2,
          is_bot_bound: true,
          enable_ai_categorization: false,
        }),
      });
    }
    if (url.includes('/api/v1/template/items')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    }

    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
}

test('CODE-01: parseRublesToKopecks parity across TransactionEditor (actual) and TransactionEditor (planned)', async ({ page }) => {
  const captured: CapturedAmounts = { actual: null, planned: null };
  await mockApi(page, captured);

  await page.goto('/');
  await expect(page.locator('text=Загрузка…')).not.toBeVisible({ timeout: 5000 });

  // Navigate to Транзакции tab
  await page.click('button[aria-label="Транзакции"]');
  await page.waitForTimeout(300);

  // ---- TransactionEditor (actual) flow (sub-tab «История» is default) ----
  // Tap Fab to open BottomSheet with TransactionEditor (actual)
  const addActualFab = page.locator('button[aria-label="Добавить транзакцию"]');
  await expect(addActualFab).toBeVisible({ timeout: 5000 });
  await addActualFab.click();
  await page.waitForTimeout(300);

  // Type "100,50" into amount input (inputMode="decimal")
  const actualAmountInput = page.locator('input[inputMode="decimal"]').first();
  await expect(actualAmountInput).toBeVisible({ timeout: 3000 });
  await actualAmountInput.fill('100,50');

  // Select category — only category select is visible in TransactionEditor (actual)
  await page.locator('select').first().selectOption({ value: '1' });

  // Submit
  await page.click('button:has-text("Сохранить")');
  await expect.poll(() => captured.actual, { timeout: 5000 }).not.toBeNull();

  // Wait for sheet to close
  await page.waitForTimeout(400);

  // ---- TransactionEditor (planned) flow (sub-tab «План») ----
  await page.click('button:has-text("План")');
  await page.waitForTimeout(300);

  const addPlanFab = page.locator('button[aria-label="Добавить строку плана"]');
  await expect(addPlanFab).toBeVisible({ timeout: 5000 });
  await addPlanFab.click();
  await page.waitForTimeout(300);

  // TransactionEditor (planned): select first, then amount
  await page.locator('select').first().selectOption({ value: '1' });

  const planAmountInput = page.locator('input[inputMode="decimal"]').first();
  await expect(planAmountInput).toBeVisible({ timeout: 3000 });
  await planAmountInput.fill('100,50');

  await page.click('button:has-text("Сохранить")');
  await expect.poll(() => captured.planned, { timeout: 5000 }).not.toBeNull();

  // ---- Parity assertion ----
  expect(captured.actual).toBe(10050);
  expect(captured.planned).toBe(10050);
  expect(captured.actual).toBe(captured.planned);
});
