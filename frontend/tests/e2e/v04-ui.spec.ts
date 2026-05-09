import { test, expect, type Page } from '@playwright/test';

/**
 * v0.4 UI smoke (Layer 7 extension from v0.4-TEST-REPORT.md).
 *
 * Covers the 4 UAT items that don't require a live Telegram bot:
 *   - U-1 (partial): owner sees admin tab «Доступ» in ManagementScreen
 *   - U-2 (partial): InviteSheet renders with tg_user_id input + invite CTA
 *   - U-4 (partial): OnboardingScreen branches hero copy by role
 *   - U-5/U-6 (partial): SettingsScreen «AI расход» block + CapEditSheet
 *
 * All tests use the route-mock pattern from home.spec.ts — single handler,
 * URL-based dispatch, last-added route wins.
 */

const OWNER_ME = {
  tg_user_id: 123456789,
  tg_chat_id: 1001,
  cycle_start_day: 5,
  onboarded_at: '2026-04-05T00:00:00+00:00',
  chat_id_known: true,
  role: 'owner',
  ai_spend_cents: 230,
  ai_spending_cap_cents: 100,
};

const MEMBER_ME = {
  tg_user_id: 9_777_000_001,
  tg_chat_id: null,
  cycle_start_day: 5,
  onboarded_at: '2026-04-10T00:00:00+00:00',
  chat_id_known: false,
  role: 'member',
  ai_spend_cents: 50,
  ai_spending_cap_cents: 100,
};

const MEMBER_NOT_ONBOARDED_ME = {
  ...MEMBER_ME,
  onboarded_at: null,
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

async function mockApi(page: Page, options: { me: typeof OWNER_ME | typeof MEMBER_ME | typeof MEMBER_NOT_ONBOARDED_ME }) {
  await page.route('**/api/v1/**', (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('/api/v1/me')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(options.me),
      });
    }
    if (url.includes('/api/v1/periods/current')) {
      if (options.me.onboarded_at == null) {
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ detail: { error: 'onboarding_required' } }),
        });
      }
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
          period_start: '2026-04-05',
          period_end: '2026-05-04',
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
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    }
    if (url.includes('/api/v1/subscriptions')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    }
    if (url.includes('/api/v1/template/items')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    }
    if (url.match(/\/api\/v1\/periods\/\d+\/(planned|actual)/)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    }
    if (url.includes('/api/v1/periods')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([PERIOD_RESPONSE]) });
    }
    if (url.includes('/api/v1/settings')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          cycle_start_day: options.me.cycle_start_day,
          notify_days_before: 2,
          is_bot_bound: options.me.chat_id_known,
          enable_ai_categorization: true,
        }),
      });
    }
    if (url.includes('/api/v1/admin/users')) {
      if (method === 'POST') {
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 99,
            tg_user_id: 9_777_000_002,
            tg_chat_id: null,
            role: 'member',
            spending_cap_cents: 100,
            last_seen_at: null,
            created_at: '2026-05-07T15:00:00+00:00',
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 1,
            tg_user_id: OWNER_ME.tg_user_id,
            tg_chat_id: OWNER_ME.tg_chat_id,
            role: 'owner',
            spending_cap_cents: 100,
            last_seen_at: '2026-05-07T14:00:00+00:00',
            created_at: '2026-04-01T00:00:00+00:00',
          },
        ]),
      });
    }
    if (url.includes('/api/v1/admin/ai-usage')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ users: [] }),
      });
    }
    if (url.includes('/api/v1/analytics/')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ points: [] }) });
    }

    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
}

async function gotoApp(page: Page) {
  await page.goto('/');
  await page.waitForTimeout(500);
}

// ============================================================
// V04-UI-1: owner sees «Доступ» tab; member doesn't (U-1)
// ============================================================

test('v04-ui-1: ManagementScreen shows «Доступ» for owner, hides for member', async ({ page }) => {
  // Owner case
  await mockApi(page, { me: OWNER_ME });
  await gotoApp(page);

  await page.click('button[aria-label="Управление"]');
  await page.waitForTimeout(300);

  // ManagementScreen subtitle ("Подписки, категории, доступ") тоже содержит
  // "доступ" — целимся в кнопку-ряд с aria-label = label + description.
  await expect(
    page.getByRole('button', { name: /^Доступ\s/ })
  ).toBeVisible({ timeout: 5000 });

  // Member case (re-route)
  await page.unroute('**/api/v1/**');
  await mockApi(page, { me: MEMBER_ME });
  await page.reload();
  await page.waitForTimeout(500);

  await page.click('button[aria-label="Управление"]');
  await page.waitForTimeout(300);

  // Member should NOT see "Доступ" item — но subtitle всё равно остаётся.
  // Проверяем именно отсутствие row-кнопки.
  await expect(
    page.getByRole('button', { name: /^Доступ\s/ })
  ).toHaveCount(0);
});

// ============================================================
// V04-UI-2: AccessScreen InviteSheet opens + accepts tg_user_id (U-2)
// ============================================================

test('v04-ui-2: owner opens AccessScreen → InviteSheet renders tg_user_id input', async ({ page }) => {
  await mockApi(page, { me: OWNER_ME });
  await gotoApp(page);

  await page.click('button[aria-label="Управление"]');
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /^Доступ\s/ }).click();
  await page.waitForTimeout(500);

  // FAB has aria-label="Пригласить пользователя"
  const inviteCta = page.locator('button[aria-label="Пригласить пользователя"]').first();
  await expect(inviteCta).toBeVisible({ timeout: 5000 });
  // Wait for hook loading to settle so button is enabled
  await expect(inviteCta).toBeEnabled({ timeout: 5000 });
  await inviteCta.click();
  await page.waitForTimeout(400);

  // InviteSheet should expose a numeric input for tg_user_id
  const tgInput = page.locator('input[type="number"]').first();
  await expect(tgInput).toBeVisible({ timeout: 3000 });
});

// ============================================================
// V04-UI-3: SettingsScreen renders «AI расход» block + values (U-5)
// ============================================================

test('v04-ui-3: SettingsScreen shows AI spend block with $X.XX / $Y.YY format', async ({ page }) => {
  await mockApi(page, { me: OWNER_ME });
  await gotoApp(page);

  await page.click('button[aria-label="Управление"]');
  await page.waitForTimeout(300);
  await page.click('text=Настройки');
  await page.waitForTimeout(500);

  // AI расход block should exist
  const aiBlock = page.locator('text=/AI[\\s-]?расход|AI[\\s-]?spend/i').first();
  await expect(aiBlock).toBeVisible({ timeout: 5000 });

  // Spend format $X.XX / $Y.YY (cap >0 path with cents=230, cap=100 → "$2.30 / $1.00")
  // Match the slash-separated dollar formatting flexibly.
  const dollarPattern = page.locator('text=/\\$\\d+\\.\\d{2}\\s*\\/\\s*\\$\\d+\\.\\d{2}/').first();
  await expect(dollarPattern).toBeVisible({ timeout: 3000 });
});

// ============================================================
// V04-UI-4: SettingsScreen «AI отключён» when cap=0
// ============================================================

test('v04-ui-4: SettingsScreen shows «AI отключён» when spending_cap_cents=0', async ({ page }) => {
  await mockApi(page, { me: { ...OWNER_ME, ai_spending_cap_cents: 0 } });
  await gotoApp(page);

  await page.click('button[aria-label="Управление"]');
  await page.waitForTimeout(300);
  await page.click('text=Настройки');
  await page.waitForTimeout(500);

  await expect(
    page.locator('text=/AI отключ[её]н|AI off|disabled/i').first(),
  ).toBeVisible({ timeout: 5000 });
});

// ============================================================
// V04-UI-5: OnboardingScreen renders for not-onboarded member
// ============================================================

test('v04-ui-5: OnboardingScreen renders when onboarded_at is null', async ({ page }) => {
  await mockApi(page, { me: MEMBER_NOT_ONBOARDED_ME });
  await gotoApp(page);

  // The app should route to OnboardingScreen given onboarded_at == null.
  // Look for onboarding-specific copy: balance input, cycle picker, or hero text.
  const onboardingMarker = page
    .locator('text=/добро пожаловать|настройк|cycle_start|стартов|balance/i')
    .first();
  await expect(onboardingMarker).toBeVisible({ timeout: 5000 });
});

// ============================================================
// V04-UI-6: AccessScreen «Лимит» button on user row opens CapEditSheet
// ============================================================

test('v04-ui-6: AccessScreen UsersList row exposes «Лимит» action', async ({ page }) => {
  await mockApi(page, { me: OWNER_ME });
  await gotoApp(page);

  await page.click('button[aria-label="Управление"]');
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /^Доступ\s/ }).click();
  await page.waitForTimeout(500);

  // The owner-row should expose a «Лимит» (cap edit) button. UsersList renders
  // an action chip per row.
  const capBtn = page.locator('button:has-text("Лимит")').first();
  await expect(capBtn).toBeVisible({ timeout: 5000 });
  await capBtn.click();
  await page.waitForTimeout(400);

  // CapEditSheet should mount with USD-format input.
  const capInput = page.locator('input[type="number"]').first();
  await expect(capInput).toBeVisible({ timeout: 3000 });
});
