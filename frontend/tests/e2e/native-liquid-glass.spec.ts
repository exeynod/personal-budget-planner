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

// A prior closed period so the native period switcher (≥2 periods) renders.
const PERIOD_PREV = {
  id: 4,
  period_start: '2026-04-01',
  period_end: '2026-04-30',
  starting_balance_cents: 0,
  ending_balance_cents: 0,
  status: 'closed',
  closed_at: '2026-05-01T00:00:00Z',
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

// v1.1 planning rework — planned rows for period 5 (PlannedRead-shaped).
// Mix of: manual unposted, manual posted, subscription_auto unposted, income.
// Used by the Home / CategoryDetail «Расписано» ladder level and the План-месяца
// detail disclosure. Several land in «Продукты» (id 1) so its detail shows
// multiple rows + a non-trivial «Расписано».
function planned(
  id: number,
  category_id: number,
  amount_cents: number,
  opts: {
    source?: 'manual' | 'subscription_auto' | 'template';
    posted_txn_id?: number | null;
    subscription_id?: number | null;
    description?: string | null;
    planned_date?: string | null;
    kind?: 'expense' | 'income';
  } = {},
) {
  return {
    id,
    category_id,
    amount_cents,
    description: opts.description ?? null,
    kind: opts.kind ?? ('expense' as const),
    period_id: 5,
    planned_date: opts.planned_date ?? '2026-05-10',
    posted_txn_id: opts.posted_txn_id ?? null,
    source: opts.source ?? ('manual' as const),
    subscription_id: opts.subscription_id ?? null,
  };
}

const PLANNED = [
  // Продукты (id 1): manual unposted, manual posted, subscription unposted.
  planned(201, 1, 3_000_00, {
    description: 'Большая закупка',
    planned_date: '2026-05-12',
  }),
  planned(202, 1, 1_500_00, {
    description: 'Доставка',
    posted_txn_id: 9001,
    planned_date: '2026-05-05',
  }),
  planned(203, 1, 990_00, {
    description: 'Подписка на продукты',
    source: 'subscription_auto',
    subscription_id: 11,
    planned_date: '2026-05-15',
  }),
  // Кафе (id 2): one manual unposted.
  planned(204, 2, 2_000_00, {
    description: 'Бизнес-ланчи',
    planned_date: '2026-05-08',
  }),
  // Транспорт (id 3): subscription unposted.
  planned(205, 3, 1_200_00, {
    description: 'Проездной',
    source: 'subscription_auto',
    subscription_id: 12,
    planned_date: '2026-05-01',
  }),
  // Зарплата (id 10): income planned row.
  planned(206, 10, 150_000_00, {
    description: 'Аванс + ЗП',
    kind: 'income',
    planned_date: '2026-05-10',
  }),
];

// Template items (per-category limits) + recurring lines.
const TEMPLATE_ITEMS = [
  { category_id: 1, limit_cents: 16_000_00 },
  { category_id: 2, limit_cents: 8_000_00 },
  { category_id: 3, limit_cents: 4_800_00 },
];

function tline(
  id: number,
  category_id: number,
  title: string,
  amount_cents: number,
  day_of_period: number | null,
  kind: 'expense' | 'income' = 'expense',
) {
  return { id, category_id, title, amount_cents, day_of_period, kind };
}

const TEMPLATE_LINES = [
  tline(301, 1, 'Еженедельная закупка', 4_000_00, 5),
  tline(302, 1, 'Доставка воды', 600_00, 20),
  tline(303, 2, 'Кофе по утрам', 1_500_00, null),
];

// Per-period plan snapshot (PeriodPlanResponse) — mirrors category plan_cents.
const PERIOD_PLAN = {
  plans: [
    { category_id: 1, limit_cents: 16_000_00 },
    { category_id: 2, limit_cents: 8_000_00 },
    { category_id: 3, limit_cents: 4_800_00 },
  ],
};

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
        handler: (r) => r.fulfill(json([PERIOD, PERIOD_PREV])),
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
      // ── v1.1 planning rework endpoints ──
      // Planned rows (Home/CategoryDetail ladder «Расписано» + План-месяца detail).
      {
        pattern: '**/api/v1/periods/5/planned',
        handler: (r) => {
          if (r.request().method() === 'GET') return r.fulfill(json(PLANNED));
          // POST create → echo a new manual row.
          return r.fulfill(json(planned(299, 1, 1_00, { description: 'new' })));
        },
      },
      {
        pattern: '**/api/v1/periods/5/planned/post-batch',
        handler: (r) => r.fulfill(json({ posted: [201, 204], skipped: [202] })),
      },
      {
        pattern: '**/api/v1/periods/5/planned/*/post',
        handler: (r) => r.fulfill(json({ planned_id: 201, txn_id: 9099 })),
      },
      {
        pattern: '**/api/v1/periods/5/planned/*/unpost',
        handler: (r) => r.fulfill({ status: 204, body: '' }),
      },
      {
        pattern: '**/api/v1/planned/*',
        handler: (r) => {
          if (r.request().method() === 'DELETE')
            return r.fulfill({ status: 204, body: '' });
          return r.fulfill(json(planned(201, 1, 3_000_00)));
        },
      },
      // Per-period plan snapshot.
      {
        pattern: '**/api/v1/periods/5/plan',
        handler: (r) => r.fulfill(json(PERIOD_PLAN)),
      },
      // plan-month batch PATCH → return refreshed categories.
      {
        pattern: '**/api/v1/plan-month',
        handler: (r) => r.fulfill(json({ categories: CATEGORIES })),
      },
      // Budget template — per-category limits + recurring lines.
      {
        pattern: '**/api/v1/template/items**',
        handler: (r) => {
          if (r.request().method() === 'GET')
            return r.fulfill(json(TEMPLATE_ITEMS));
          // PUT upsert → echo one item.
          return r.fulfill(json({ category_id: 1, limit_cents: 16_000_00 }));
        },
      },
      {
        pattern: '**/api/v1/template/lines**',
        handler: (r) => {
          const m = r.request().method();
          if (m === 'GET') return r.fulfill(json(TEMPLATE_LINES));
          if (m === 'DELETE') return r.fulfill({ status: 204, body: '' });
          return r.fulfill(json(tline(399, 1, 'new', 1_00, null)));
        },
      },
      // Balance reconcile («Привести остаток») + computed balance for Settings.
      {
        pattern: '**/api/v1/actual/balance',
        handler: (r) =>
          r.fulfill(
            json({
              actual_total_expense_cents: 1_155_54,
              actual_total_income_cents: 0,
              balance_now_cents: 48_844_46,
              by_category: [],
              delta_total_cents: 0,
              period_end: '2026-05-31',
              period_id: 5,
              period_start: '2026-05-01',
              planned_total_expense_cents: 28_800_00,
              planned_total_income_cents: 150_000_00,
            }),
          ),
      },
      {
        pattern: '**/api/v1/balance/reconcile',
        handler: (r) =>
          r.fulfill(
            json({ adjustment_txn_id: 9500, balance_now_cents: 50_000_00 }),
          ),
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
  // 'Счета' (accounts) and 'Копилка' (savings) rows removed in the v1.1
  // planning rework — their hub rows + screens no longer exist.
  for (const { row, file } of [
    { row: 'Шаблон бюджета', file: 'template' },
    { row: 'Аналитика', file: 'analytics' },
    { row: 'Подписки', file: 'subscriptions' },
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
    // Продукты (id 1) carries planned rows → its 4-level ladder shows a
    // non-zero «Расписано» (Σ unposted planned for this category).
    await page.getByTestId('native-home-category-1').click();
    await expect(page.getByTestId('native-cat-ladder')).toBeVisible({
      timeout: 5000,
    });
    await page.waitForTimeout(400);
    await freezeMotion(page);
    await page.screenshot({ path: `${OUT}/category-detail.png` });
  });

  // v1.1 — План месяца, opened from Home (NOT from Управление). Expands the
  // «Детализация» disclosure for «Продукты» so the screenshot captures the
  // planned rows (manual + subscription), the Лимит/Расписано/Свободно ladder,
  // and the per-row «Провести»/«Отмена» CTAs in one frame.
  test('plan month with expanded detail renders native iOS design', async ({
    page,
  }) => {
    await installNative(page);
    await page.goto('/');
    await expect(page.getByTestId('native-shell')).toBeVisible({
      timeout: 8000,
    });
    // «План месяца» row lives in the Home view (top, below the balance card).
    await page.getByTestId('native-home-plan').click();
    await expect(page.getByTestId('native-plan-surplus')).toBeVisible({
      timeout: 5000,
    });
    // Expand «Детализация» for Продукты (category id 1).
    await page.getByTestId('native-plan-detail-toggle-1').click();
    await expect(page.getByTestId('native-plan-detail-1')).toBeVisible({
      timeout: 5000,
    });
    // P0 design-fixes: bulk «Провести запланированное» button removed; the
    // inline add-form is replaced by a «+» that opens the AddSheet bottom-sheet;
    // the duplicate «Σ план / Доход» InsetGroup is gone.
    await expect(page.getByTestId('native-plan-post-all')).toHaveCount(0);
    await expect(page.getByTestId('native-plan-total')).toHaveCount(0);
    await expect(page.getByTestId('native-plan-add-open-1')).toBeVisible();
    await freezeMotion(page);
    await page.screenshot({ path: `${OUT}/plan.png` });
  });

  // P0 design-fixes — «+» add-flow opens a native AddSheet bottom-sheet (keypad
  // + ActionSheet date), replacing the inline «Название/₽/дата/Добавить» form.
  test('plan «+» opens native add-sheet (keypad + date picker)', async ({
    page,
  }) => {
    await installNative(page);
    await page.goto('/');
    await expect(page.getByTestId('native-shell')).toBeVisible({
      timeout: 8000,
    });
    await page.getByTestId('native-home-plan').click();
    await expect(page.getByTestId('native-plan-surplus')).toBeVisible({
      timeout: 5000,
    });
    await page.getByTestId('native-plan-detail-toggle-1').click();
    await page.getByTestId('native-plan-add-open-1').click();
    await expect(page.getByTestId('native-plan-add-sheet')).toBeVisible({
      timeout: 5000,
    });
    // Native date control (NativeDatePicker) — not a raw <input type=date>.
    await expect(
      page.getByTestId('native-plan-add-date-trigger'),
    ).toBeVisible();
    // Fill name + amount via the native keypad → CTA enables → submit.
    await page.getByTestId('native-plan-add-title').fill('Подарок');
    await page
      .getByTestId('native-plan-add-sheet')
      .getByRole('button', { name: '5', exact: true })
      .click();
    await page
      .getByTestId('native-plan-add-sheet')
      .getByRole('button', { name: '0', exact: true })
      .click();
    await page
      .getByTestId('native-plan-add-sheet')
      .getByRole('button', { name: '0', exact: true })
      .click();
    const submit = page.getByTestId('native-plan-add-submit');
    await expect(submit).toBeEnabled();
    await submit.click();
    // Sheet closes after a successful create (createPlanned → 200 fixture).
    await expect(page.getByTestId('native-plan-add-sheet')).toHaveCount(0, {
      timeout: 5000,
    });
  });

  // v1.1 — Шаблон бюджета with one category's «Строки» disclosure expanded so
  // the recurring template lines + add row are visible alongside the per-
  // category limit fields.
  test('template with expanded lines renders native iOS design', async ({
    page,
  }) => {
    await installNative(page);
    await page.goto('/');
    await expect(page.getByTestId('native-shell')).toBeVisible({
      timeout: 8000,
    });
    await page.getByRole('tab', { name: 'Управление' }).click();
    await expect(page.getByRole('heading', { name: 'Управление' })).toBeVisible(
      { timeout: 5000 },
    );
    await page.getByText('Шаблон бюджета', { exact: false }).first().click();
    await expect(page.getByTestId('native-template-view')).toBeVisible({
      timeout: 5000,
    });
    // Expand «Строки» for Продукты (id 1) → recurring lines + «+» add button.
    await page.getByTestId('native-template-toggle-1').click();
    await expect(page.getByTestId('native-template-lines-1')).toBeVisible({
      timeout: 5000,
    });
    // P0 design-fixes: inline add-form replaced by a «+» bottom-sheet opener.
    await expect(page.getByTestId('native-template-add-open-1')).toBeVisible();
    await page.getByTestId('native-template-add-open-1').click();
    await expect(page.getByTestId('native-plan-add-sheet')).toBeVisible({
      timeout: 5000,
    });
    // Template mode uses a day-of-period stepper (not a date picker).
    await expect(page.getByTestId('native-plan-add-day')).toBeVisible();
    await page.getByTestId('native-plan-add-cancel').click();
    await expect(page.getByTestId('native-plan-add-sheet')).toHaveCount(0);
    await freezeMotion(page);
    await page.screenshot({ path: `${OUT}/template-expanded.png` });
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
