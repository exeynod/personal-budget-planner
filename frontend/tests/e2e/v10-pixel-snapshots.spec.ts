// Phase 28-03 — POL-04 (web): pixel-perfect baseline snapshots for the
// 8 key V10 screens. The intent is to lock the visual surface so any
// later styling regression shows up as a Playwright snapshot diff.
//
// Storage layout (Playwright default):
//   tests/e2e/__screenshots__/v10-pixel-snapshots.spec.ts/
//     pixel-home-1-chromium-mobile-{platform}.png
//     pixel-transactions-1-chromium-mobile-{platform}.png
//     ...
// .gitkeep lives in tests/e2e/__screenshots__/v10-pixel/ to commit a
// folder reference; Playwright itself writes baselines into the
// auto-named folder above on the first `--update-snapshots` run.
//
// First run instructions (solo-dev workflow on macOS):
//   cd frontend
//   npx playwright test tests/e2e/v10-pixel-snapshots.spec.ts --update-snapshots
//   git add tests/e2e/__screenshots__/
//
// Re-run (must pass green without `--update-snapshots`):
//   npx playwright test tests/e2e/v10-pixel-snapshots.spec.ts
//
// CI note: baselines are platform-suffixed (`-darwin`, `-linux`). For
// solo-dev on macOS we ship `-darwin` baselines only; CI is expected
// either to regenerate (Linux runner ships its own baseline) or to
// skip this file. See DIVERGENCES.md §W-02.
//
// Determinism: every screen injects an animation/transition kill-switch
// before the snapshot to freeze BigFig count-up, FAB pulse, etc.

import { expect, test, type Page } from '@playwright/test';

// ─────────────────── shared mock fixtures ───────────────────

const ME_ONBOARDED = {
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

const CATEGORIES = [
  {
    id: 7,
    name: 'Кафе',
    kind: 'expense',
    code: 'cafe',
    is_archived: false,
    sort_order: 1,
    plan_cents: 5_000_00,
    rollover: 'misc',
    paused: false,
    parent_id: null,
    ord: '01',
    created_at: '2026-04-01T00:00:00Z',
  },
  {
    id: 99,
    name: 'savings',
    kind: 'expense',
    code: 'savings',
    is_archived: false,
    sort_order: 99,
    plan_cents: 0,
    rollover: 'misc',
    paused: false,
    parent_id: null,
    ord: '99',
    created_at: '2026-04-01T00:00:00Z',
  },
];

const PERIOD_CURRENT = {
  id: 5,
  period_start: '2026-05-01',
  period_end: '2026-05-31',
  starting_balance_cents: 0,
  ending_balance_cents: null,
  status: 'active',
  closed_at: null,
};

async function installMocks(page: Page) {
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ME_ONBOARDED) }),
  );
  await page.route('**/api/v1/accounts', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ACCOUNTS) }),
  );
  await page.route('**/api/v1/categories**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CATEGORIES) }),
  );
  await page.route('**/api/v1/periods/current', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PERIOD_CURRENT) }),
  );
  await page.route('**/api/v1/periods/5/actual**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  );
  // Catch-all for v10 endpoints not yet enumerated above — return [] so
  // screens render their empty/initial state instead of error fallback.
  await page.route('**/api/v1/**', (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    } else {
      route.continue();
    }
  });
}

// Inject after each navigation to neutralise count-up + animations.
async function freezeMotion(page: Page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
      }
    `,
  });
  await page.waitForTimeout(150);
}

// ─────────────────── per-screen setup helpers ───────────────────

async function gotoHome(page: Page) {
  await page.goto('/');
  await expect(page.getByText(/Дневной темп/)).toBeVisible({ timeout: 8000 });
  await freezeMotion(page);
}

async function gotoTransactions(page: Page) {
  await gotoHome(page);
  await page.getByText(/ВСЕ ОПЕРАЦИИ/).click();
  await expect(page.getByText('Реестр.')).toBeVisible({ timeout: 5000 });
  await freezeMotion(page);
}

async function gotoAddSheet(page: Page) {
  await gotoHome(page);
  await page.getByRole('button', { name: /Добавить транзакцию/ }).click();
  await expect(page.getByText(/NEW ENTRY/)).toBeVisible({ timeout: 5000 });
  await freezeMotion(page);
}

async function gotoCategoryDetail(page: Page) {
  await gotoHome(page);
  // Tap first category row (Кафе) — pushes CategoryDetail.
  await page.getByText(/Кафе/).first().click();
  await freezeMotion(page);
}

async function gotoPlanMonth(page: Page) {
  await gotoHome(page);
  // Plan badge / "ПЛАН мая" CTA on Home pushes PlanMonth.
  // Selector intentionally permissive — Home headline includes the month
  // word; if the entry CTA changes Plan 28-03 follow-up will update.
  const planLink = page.getByRole('button', { name: /план/i }).first();
  if (await planLink.isVisible().catch(() => false)) {
    await planLink.click();
  }
  await freezeMotion(page);
}

async function gotoSubscriptions(page: Page) {
  await gotoHome(page);
  // Subscriptions live under УПР. tab → push site.
  await page.getByRole('tab', { name: /УПР/ }).click();
  // Tap "Подписки" entry from mgmt hub if present.
  const subsLink = page.getByText(/Подписки/i).first();
  if (await subsLink.isVisible().catch(() => false)) {
    await subsLink.click();
  }
  await freezeMotion(page);
}

async function gotoSavings(page: Page) {
  await gotoHome(page);
  await page.getByRole('tab', { name: /КОПИЛКА/ }).click();
  await freezeMotion(page);
}

async function gotoAi(page: Page) {
  await gotoHome(page);
  await page.getByRole('tab', { name: /AI/i }).click();
  await freezeMotion(page);
}

interface Screen {
  name: string;
  setup: (page: Page) => Promise<void>;
}

const SCREENS: Screen[] = [
  { name: 'home', setup: gotoHome },
  { name: 'transactions', setup: gotoTransactions },
  { name: 'add-sheet', setup: gotoAddSheet },
  { name: 'category-detail', setup: gotoCategoryDetail },
  { name: 'plan-month', setup: gotoPlanMonth },
  { name: 'subscriptions', setup: gotoSubscriptions },
  { name: 'savings', setup: gotoSavings },
  { name: 'ai-initial', setup: gotoAi },
];

// ─────────────────── tests ───────────────────

test.describe('V10 pixel-perfect baseline (Plan 28-03 / POL-04 web)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('ui.theme', 'v10');
      } catch {
        /* private mode — fall through to default 'v10' */
      }
    });
    await installMocks(page);
  });

  for (const screen of SCREENS) {
    test(`pixel: ${screen.name}`, async ({ page }) => {
      await screen.setup(page);
      // 2% tolerance covers sub-pixel font AA between Chromium versions
      // / hosts; the V10 layout itself is deterministic once motion is
      // frozen and BigFig count-up has settled.
      await expect(page).toHaveScreenshot(`${screen.name}.png`, {
        maxDiffPixelRatio: 0.02,
        fullPage: true,
      });
    });
  }
});
