// Liquid Glass v2 — native iOS shell (web port) screenshots + smoke.
//
// Renders the app under `ui.theme = 'liquid_glass'` (the native shell) with a
// rich onboarded fixture mirroring the iOS reference
// (.planning/ios-native-screens). Doubles as:
//   - a visual proof set (page.screenshot → .planning/liquid-glass-v2-proof/web)
//   - a functional smoke (native shell testid + key content assertions)
//
// Maximal Poster pixel baselines are unaffected (separate spec, separate theme).

import { test, expect, type Page } from '@playwright/test';
import {
  installOnboardedFixture,
  freezeMotion,
} from './fixtures/onboarded-user';

const OUT = '../.planning/liquid-glass-v2-proof/web';

const ME = {
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

function cat(
  id: number,
  name: string,
  code: string,
  kind: 'expense' | 'income',
  plan_cents: number,
  ord: string,
) {
  return {
    id,
    name,
    kind,
    code,
    is_archived: false,
    sort_order: id,
    plan_cents,
    rollover: 'misc',
    paused: false,
    parent_id: null,
    ord,
    created_at: '2026-04-01T00:00:00Z',
  };
}

const CATEGORIES = [
  cat(1, 'Продукты', 'food', 'expense', 16_000_00, '01'),
  cat(2, 'Кафе', 'cafe', 'expense', 8_000_00, '02'),
  cat(3, 'Транспорт', 'transit', 'expense', 4_800_00, '03'),
  cat(4, 'Дом', 'home', 'expense', 0, '04'),
  cat(5, 'Сервисы', 'subs', 'expense', 0, '05'),
  cat(6, 'Развлечения', 'fun', 'expense', 0, '06'),
  cat(10, 'Зарплата', 'salary', 'income', 150_000_00, '01'),
  cat(99, 'savings', 'savings', 'expense', 0, '99'),
];

const PERIOD = {
  id: 5,
  period_start: '2026-05-01',
  period_end: '2026-05-31',
  starting_balance_cents: 0,
  ending_balance_cents: null,
  status: 'active',
  closed_at: null,
};

function act(id: number, category_id: number, amount_cents: number) {
  return {
    id,
    account_id: 1,
    amount_cents,
    category_id,
    created_at: '2026-05-09T08:00:00Z',
    description: null,
    kind: 'expense' as const,
    period_id: 5,
    source: 'mini_app' as const,
    tx_date: '2026-05-09',
  };
}

const ACTUALS = [act(101, 1, 385_18), act(102, 2, 385_18), act(103, 3, 385_18)];

const HOME_BOOTSTRAP = {
  user: ME,
  accounts: ACCOUNTS,
  categories: CATEGORIES,
  period: PERIOD,
  balance: null,
  actuals: ACTUALS,
};

function json(body: unknown) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  };
}

async function installNative(page: Page) {
  await installOnboardedFixture(page, {
    extraRoutes: [
      { pattern: '**/api/v1/me', handler: (r) => r.fulfill(json(ME)) },
      {
        pattern: '**/api/v1/home',
        handler: (r) => r.fulfill(json(HOME_BOOTSTRAP)),
      },
      {
        pattern: '**/api/v1/accounts',
        handler: (r) => r.fulfill(json(ACCOUNTS)),
      },
      {
        pattern: '**/api/v1/categories**',
        handler: (r) => r.fulfill(json(CATEGORIES)),
      },
      {
        pattern: '**/api/v1/periods',
        handler: (r) => r.fulfill(json([PERIOD])),
      },
      {
        pattern: '**/api/v1/periods/current',
        handler: (r) => r.fulfill(json(PERIOD)),
      },
      {
        pattern: '**/api/v1/periods/5/actual**',
        handler: (r) => r.fulfill(json(ACTUALS)),
      },
      {
        pattern: '**/api/v1/periods/5/balance**',
        handler: (r) =>
          r.fulfill(json({ by_category: [], starting_balance_cents: 0 })),
      },
      {
        pattern: '**/api/v1/admin/users',
        handler: (r) =>
          r.fulfill(
            json([
              { id: 1, tg_user_id: 100_000_001, role: 'owner' },
              { id: 2, tg_user_id: 100_000_002, role: 'member' },
            ]),
          ),
      },
      {
        pattern: '**/api/v1/admin/ai-usage',
        handler: (r) =>
          r.fulfill(
            json({
              users: [
                {
                  user_id: 100_000_001,
                  name: 'Владелец',
                  current_month: { total_tokens: 1240 },
                  est_cost_cents_current_month: 312,
                },
              ],
            }),
          ),
      },
    ],
  });
  // Override the fixture's `ui.theme='v10'` with the native theme. Runs after
  // the fixture init-script (later registration wins at runtime).
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('ui.theme', 'liquid_glass');
    } catch {
      /* ignore */
    }
  });
}

test.describe('Liquid Glass native shell (web)', () => {
  test('home renders native iOS design', async ({ page }) => {
    await installNative(page);
    await page.goto('/');
    await expect(page.getByTestId('native-shell')).toBeVisible({
      timeout: 8000,
    });
    await expect(page.getByRole('heading', { name: 'Главная' })).toBeVisible();
    await expect(page.getByText('Остаток на счёте')).toBeVisible();
    await expect(page.getByText('Продукты')).toBeVisible();
    await freezeMotion(page);
    await page.screenshot({ path: `${OUT}/home.png` });
  });

  test('add-sheet renders native iOS design', async ({ page }) => {
    await installNative(page);
    await page.goto('/');
    await expect(page.getByTestId('native-shell')).toBeVisible({
      timeout: 8000,
    });
    // «+» lives in the Home header (top-right circle) → opens the native sheet.
    await page.getByTestId('native-home-add').click();
    await expect(page.getByTestId('native-add-sheet')).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByText('Новая транзакция')).toBeVisible();
    await freezeMotion(page);
    await page.screenshot({ path: `${OUT}/add-sheet.png` });
  });

  test('transactions renders native iOS design', async ({ page }) => {
    await installNative(page);
    await page.goto('/');
    await expect(page.getByTestId('native-shell')).toBeVisible({
      timeout: 8000,
    });
    await page.getByRole('tab', { name: 'Транзакции' }).click();
    await expect(page.getByRole('heading', { name: 'Транзакции' })).toBeVisible(
      { timeout: 5000 },
    );
    await freezeMotion(page);
    await page.screenshot({ path: `${OUT}/transactions.png` });
  });

  test('management hub renders native iOS design', async ({ page }) => {
    await installNative(page);
    await page.goto('/');
    await expect(page.getByTestId('native-shell')).toBeVisible({
      timeout: 8000,
    });
    await page.getByRole('tab', { name: 'Управление' }).click();
    await expect(page.getByRole('heading', { name: 'Управление' })).toBeVisible(
      { timeout: 5000 },
    );
    await freezeMotion(page);
    await page.screenshot({ path: `${OUT}/management.png` });
  });

  test('ai tab renders native iOS design', async ({ page }) => {
    await installNative(page);
    await page.goto('/');
    await expect(page.getByTestId('native-shell')).toBeVisible({
      timeout: 8000,
    });
    await page.getByRole('tab', { name: 'AI' }).click();
    await expect(page.getByRole('heading', { name: 'AI' })).toBeVisible({
      timeout: 5000,
    });
    await freezeMotion(page);
    await page.screenshot({ path: `${OUT}/ai.png` });
  });

  // Management-hub detail screens: tab → row → screenshot.
  for (const { row, file } of [
    { row: 'План месяца', file: 'plan' },
    { row: 'Счета', file: 'accounts' },
    { row: 'Аналитика', file: 'analytics' },
    { row: 'Подписки', file: 'subscriptions' },
    { row: 'Копилка', file: 'savings' },
    { row: 'Настройки', file: 'settings' },
    { row: 'Доступ', file: 'access' },
  ]) {
    test(`management → ${file} renders native iOS design`, async ({ page }) => {
      await installNative(page);
      await page.goto('/');
      await expect(page.getByTestId('native-shell')).toBeVisible({
        timeout: 8000,
      });
      await page.getByRole('tab', { name: 'Управление' }).click();
      await expect(
        page.getByRole('heading', { name: 'Управление' }),
      ).toBeVisible({ timeout: 5000 });
      await page.getByText(row, { exact: false }).first().click();
      await page.waitForTimeout(400);
      await freezeMotion(page);
      await page.screenshot({ path: `${OUT}/${file}.png` });
    });
  }

  test('category detail renders native iOS design', async ({ page }) => {
    await installNative(page);
    await page.goto('/');
    await expect(page.getByTestId('native-shell')).toBeVisible({
      timeout: 8000,
    });
    await page.getByTestId('native-home-category-2').click(); // Кафе
    await page.waitForTimeout(400);
    await freezeMotion(page);
    await page.screenshot({ path: `${OUT}/category-detail.png` });
  });

  test('onboarding renders native iOS design', async ({ page }) => {
    // Not-onboarded user under the native theme → native onboarding flow.
    await installOnboardedFixture(page, {
      extraRoutes: [
        {
          pattern: '**/api/v1/me',
          handler: (r) => r.fulfill(json({ ...ME, onboarded_at: null })),
        },
      ],
    });
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('ui.theme', 'liquid_glass');
      } catch {
        /* ignore */
      }
    });
    await page.goto('/');
    await expect(page.getByText('Бюджет в одном касании')).toBeVisible({
      timeout: 8000,
    });
    await freezeMotion(page);
    await page.screenshot({ path: `${OUT}/onboarding.png` });
  });
});
