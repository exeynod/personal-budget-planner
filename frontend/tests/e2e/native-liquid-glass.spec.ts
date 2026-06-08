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

// Monthly subscriptions → «Регулярные платежи» rows (subscription source).
// Two posted («✓ Оплачено») + one unposted («Отметить»), matching refs #21-23.
function sub(
  id: number,
  name: string,
  category_id: number,
  amount_cents: number,
  day_of_month: number,
  posted_txn_id: number | null = null,
) {
  return {
    id,
    name,
    amount_cents,
    cycle: 'monthly' as const,
    next_charge_date: '2026-06-15',
    category_id,
    notify_days_before: 3,
    is_active: true,
    day_of_month,
    account_id: null,
    posted_txn_id,
  };
}

const SUBSCRIPTIONS = [
  sub(21, 'Аренда', 4, 45_000_00, 1, 9100), // posted → «✓ Оплачено»
  sub(22, 'Кредит', 4, 18_000_00, 5, 9101), // posted → «✓ Оплачено»
  sub(23, 'Подписки', 5, 2_597_00, 15, null), // unposted → «Отметить»
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
  periods: [PERIOD, PERIOD_PREV],
  // The /home bootstrap carries the active period's planned rows; HomeMount +
  // AuthGate seed CACHE_KEYS.planned(5) from it, and PlanMount/CategoryDetail
  // reuse that cache. Carrying PLANNED here means the Home ladder «План» level
  // and the «План месяца» income-planned (row 206 → progress bar) both render.
  planned: PLANNED,
};

function json(body: unknown) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  };
}

/** Today as an MSK `YYYY-MM-DD` — matches HomeMount.todayMskIso (the «На
 *  сегодня» filter compares planned_date against this). */
function todayMskIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
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
      // Subscriptions → «Регулярные платежи» rows + post/unpost («Отметить»).
      {
        pattern: '**/api/v1/subscriptions',
        handler: (r) => r.fulfill(json(SUBSCRIPTIONS)),
      },
      {
        pattern: '**/api/v1/subscriptions/*/post',
        handler: (r) => r.fulfill(json({ txn_id: 9200, posted_at: null })),
      },
      {
        pattern: '**/api/v1/subscriptions/*/unpost',
        handler: (r) => r.fulfill({ status: 204, body: '' }),
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

  test('home «На сегодня» section lists today-due planned + posts on «Отметить»', async ({
    page,
  }) => {
    await installNative(page);
    // Home reads the active period's planned rows from the aggregated
    // `GET /api/v1/home` bootstrap (HomeMount.loadFromBootstrap →
    // `home.planned`), NOT the granular `/periods/5/planned` GET — so the
    // today-due row must be injected into the bootstrap payload. We override
    // `/home` with one EXPENSE row due TODAY (MSK), source=manual (NOT
    // subscription_auto — recurring rows are filtered OUT of «На сегодня» and
    // surfaced by the dedicated «Регулярные платежи» card instead). After the
    // row is posted, the next bootstrap omits it → the section disappears.
    const today = todayMskIso();
    let posted = false;
    await page.route('**/api/v1/home', (route) => {
      const planned = posted
        ? PLANNED
        : [
            ...PLANNED,
            // manual (subscription_id null) → survives the «На сегодня» filter.
            {
              id: 701,
              category_id: 2,
              amount_cents: 1_750_00,
              description: 'Обед сегодня',
              kind: 'expense' as const,
              period_id: 5,
              planned_date: today,
              posted_txn_id: null,
              source: 'manual' as const,
              subscription_id: null,
            },
          ];
      return route.fulfill(json({ ...HOME_BOOTSTRAP, planned }));
    });
    await page.route('**/api/v1/periods/5/planned/*/post', (route) => {
      posted = true; // next /home bootstrap omits the row → section disappears
      return route.fulfill(json({ planned_id: 701, txn_id: 9100 }));
    });

    await page.goto('/');
    await expect(page.getByTestId('native-shell')).toBeVisible({
      timeout: 8000,
    });
    // Section header + the today-row + its «Отметить» pill are present.
    await expect(page.getByText('На сегодня')).toBeVisible();
    await expect(page.getByTestId('native-home-today-701')).toBeVisible();
    await freezeMotion(page);
    await page.screenshot({ path: `${OUT}/home-today.png` });

    // «Отметить» posts the row → it drops out of the next planned fetch.
    await page.getByTestId('native-home-today-mark-701').click();
    await expect(page.getByTestId('native-home-today-701')).toHaveCount(0, {
      timeout: 5000,
    });
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
  // ADR-0007: the «Подписки» hub row was replaced by «Регулярные платежи»
  // (navigates to the cashflow-projection screen). Keep Аналитика/Настройки/
  // Доступ. The «Регулярные платежи» row title is a substring of nothing else,
  // so `exact: false` resolves it unambiguously.
  for (const { row, file } of [
    { row: 'Аналитика', file: 'analytics' },
    { row: 'Регулярные платежи', file: 'recurring' },
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

  // ADR-0007 «План месяца» — opened from Home (NOT from Управление). The screen
  // is now a READ-ONLY overview: «Осталось распределить» card + progress bar +
  // «Категории» rows (icon · name · «Лимит X · Запланировано Y»); the whole row
  // taps into the per-category planned detail where the limit is edited and
  // planned rows are added. The inline «Регулярные платежи» section + the
  // global «+ Добавить в план» moved OFF this screen (recurring → the dedicated
  // cashflow screen; plan-add → the per-category detail). The «Сохранить план
  // как шаблон» menu item was removed — the «…» overflow now only links to the
  // template via «Открыть шаблон».
  test('plan month renders native iOS design (refs #21-23)', async ({
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

    // «Осталось распределить» card: progress bar + «X из Y» caption.
    await expect(page.getByTestId('native-plan-progress')).toBeVisible();

    // Read-only category rows (whole-row tap → per-category detail). No inline
    // limit input / «+ Добавить» / «Регулярные платежи» section on this screen.
    await expect(page.getByTestId('native-plan-cat-1')).toBeVisible(); // Продукты
    await expect(page.getByTestId('native-plan-cat-summary-1')).toContainText(
      'Лимит',
    );
    await expect(page.getByTestId('native-plan-add-open')).toHaveCount(0);
    await expect(page.getByTestId('native-plan-cat-add')).toHaveCount(0);
    // The per-category «Детализация» disclosure is gone (owner disliked the
    // dropdowns); §A: no «Сохранить» CTA and no OS date input on the overview.
    await expect(page.getByTestId('native-plan-detail-toggle-1')).toHaveCount(
      0,
    );
    await expect(page.getByTestId('native-plan-save')).toHaveCount(0);
    await expect(page.locator('input[type="date"]')).toHaveCount(0);

    // «…» overflow → «Открыть шаблон» (the save-as-template item is gone).
    await page.getByTestId('native-plan-menu-btn').click();
    await expect(page.getByTestId('native-plan-open-template')).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByText('Сохранить план как шаблон')).toHaveCount(0);
    await page.keyboard.press('Escape');

    await freezeMotion(page);
    await page.screenshot({ path: `${OUT}/plan.png` });

    // ── income / expense split via the segmented control ──
    // Default segment is «Расходы» (income «Зарплата» hidden here).
    await expect(page.getByTestId('native-plan-cat-1')).toBeVisible(); // Продукты (expense)
    await expect(page.getByTestId('native-plan-cat-10')).toHaveCount(0); // Зарплата (income) hidden

    // Switch to «Доходы».
    await page.getByRole('tab', { name: 'Доходы' }).click();

    // Income summary replaces the expense «Осталось распределить» card:
    // NO «осталось распределить» / «превышено» chrome in the income segment.
    await expect(page.getByTestId('native-plan-income-summary')).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByTestId('native-plan-surplus')).toHaveCount(0);
    await expect(page.getByText('Превышено')).toHaveCount(0);
    await expect(
      page.getByText('Осталось распределить', { exact: false }),
    ).toHaveCount(0);

    // Income category «Зарплата» (id 10) is now visible; expense «Продукты» hidden.
    await expect(page.getByTestId('native-plan-cat-10')).toBeVisible();
    await expect(page.getByTestId('native-plan-cat-1')).toHaveCount(0);

    await freezeMotion(page);
    await page.screenshot({ path: `${OUT}/plan-income.png` });
  });

  // ADR-0007 — the plan-add flow moved OFF the «План месяца» overview into the
  // per-category planned detail. Tapping a category row drills into its detail
  // (PlanCategoryDetailView); its «Добавить в план» CTA opens the SAME AddSheet
  // as Home, in PLAN mode, with this category pre-selected. Submit creates a
  // planned row (createPlanned → 200 fixture).
  test('plan category detail «Добавить в план» opens the shared AddSheet in plan mode', async ({
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
    // Drill into Продукты (id 1) — the whole row taps into its planned detail.
    await page.getByTestId('native-plan-cat-1').click();
    await expect(page.getByTestId('native-plan-cat-ladder')).toBeVisible({
      timeout: 5000,
    });
    // The detail's «Добавить в план» CTA opens the shared sheet (plan mode).
    await page.getByTestId('native-plan-cat-add').click();
    await expect(page.getByTestId('native-add-sheet')).toBeVisible({
      timeout: 5000,
    });
    // Plan-mode chrome (sheet title «В план»).
    await expect(
      page.getByTestId('native-add-sheet').getByText('В план'),
    ).toBeVisible();
    await freezeMotion(page);
    await page.screenshot({ path: `${OUT}/plan-add-sheet.png` });

    // §B design-fix: «Дата → Своя дата» opens an in-app month-grid calendar,
    // NOT the OS `<input type="date">` popup. Assert no OS date input exists,
    // open the date sheet, reveal the in-app calendar grid, and capture it.
    await expect(page.locator('input[type="date"]')).toHaveCount(0);
    await page.getByTestId('native-add-date-row').click();
    await expect(page.getByTestId('native-add-date-sheet')).toBeVisible({
      timeout: 5000,
    });
    await page.getByText('Своя дата', { exact: true }).click();
    await expect(page.getByTestId('native-add-date-calendar')).toBeVisible({
      timeout: 5000,
    });
    await freezeMotion(page);
    await page.screenshot({ path: `${OUT}/plan-add-calendar.png` });
    // Close the date sheet (the calendar's exact selectable days depend on the
    // active period bounds vs the current month, so we don't pin a day here).
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('native-add-date-sheet')).toHaveCount(0, {
      timeout: 5000,
    });

    // Amount «500» via the native keypad (category is pre-selected = Продукты).
    const keypad = page.getByTestId('native-add-keypad');
    await keypad.getByRole('button', { name: '5', exact: true }).click();
    await keypad.getByRole('button', { name: '0', exact: true }).click();
    await keypad.getByRole('button', { name: '0', exact: true }).click();

    const cta = page.getByTestId('native-add-cta');
    await expect(cta).toHaveText('Добавить в план');
    await expect(cta).toBeEnabled();
    await cta.click();

    // Sheet closes after a successful create.
    await expect(page.getByTestId('native-add-sheet')).toHaveCount(0, {
      timeout: 5000,
    });
  });

  // «Шаблон бюджета» was removed in the v1.1 planning rework — limits moved
  // inline into «Категории» on «План месяца», recurring obligations into
  // «Регулярные платежи». No template screen / route / hub row remains.
  test('management hub no longer lists Шаблон бюджета', async ({ page }) => {
    await installNative(page);
    await page.goto('/');
    await expect(page.getByTestId('native-shell')).toBeVisible({
      timeout: 8000,
    });
    await page.getByRole('tab', { name: 'Управление' }).click();
    await expect(page.getByRole('heading', { name: 'Управление' })).toBeVisible(
      { timeout: 5000 },
    );
    await expect(page.getByText('Шаблон бюджета')).toHaveCount(0);
  });

  test('onboarding renders native iOS design', async ({ page }) => {
    // Not-onboarded user under the native theme → native onboarding flow.
    // AuthGate prewarms BOTH /me and the /home bootstrap, then unconditionally
    // re-seeds the `me` cache from `home.user` (AuthGate.tsx). The default
    // fixture's /home mock carries an ONBOARDED user, which would clobber the
    // not-onboarded /me and route to Home — so we override /home with a
    // not-onboarded user too (keep them consistent).
    await installOnboardedFixture(page, {
      extraRoutes: [
        {
          pattern: '**/api/v1/me',
          handler: (r) => r.fulfill(json({ ...ME, onboarded_at: null })),
        },
        {
          pattern: '**/api/v1/home',
          handler: (r) =>
            r.fulfill(
              json({ ...HOME_BOOTSTRAP, user: { ...ME, onboarded_at: null } }),
            ),
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
