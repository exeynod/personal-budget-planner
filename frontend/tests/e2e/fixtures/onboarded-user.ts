// Phase 29-01 — UICONF-01: reusable Playwright fixture for an onboarded
// V10 test user. Extracted from `v10-pixel-snapshots.spec.ts` so the
// upcoming Phase 29-02 audit specs and Phase 31 REG-01 regression suite
// can share a single source of truth for the «happy onboarded» surface.
//
// Closes the prerequisite for DIVERGENCES.md §W-04 (baseline PNGs were
// previously deferred — the fixture lets us actually generate them).
//
// Mock shapes mirror MeV10Response (app/api/schemas/me_v10.py) and the
// /accounts, /categories, /periods/* contracts wired in Phase 22-25.
//
// Phase 31-01 — REG-01: opt-in `mode: 'live'` upgrades the fixture to
// real-backend integration mode (no route mocks). When `live` is set,
// the fixture calls POST `/api/v1/internal/onboarding/seed?tg_user_id=999000`
// on the backend (using INTERNAL_TOKEN from env) to materialise an
// onboarded user, then attaches `X-Test-User: 999000` to every Playwright
// request so the FastAPI `get_current_user` dev-mode bypass routes
// downstream calls to that user. `mode='mock'` remains the default —
// existing pixel specs are untouched.
//
// Usage (mock — default):
//   import { installOnboardedFixture, freezeMotion } from './fixtures/onboarded-user';
//   test.beforeEach(async ({ page }) => {
//     await installOnboardedFixture(page);
//   });
//
// Usage (live — real backend, requires docker stack on :8000):
//   test.beforeEach(async ({ page, context }) => {
//     await installOnboardedFixture(page, { mode: 'live', context });
//   });

import type { BrowserContext, Page, Route } from '@playwright/test';

// ─────────────────── mock data constants ───────────────────

/**
 * Onboarded user (MeV10Response-shaped) with income 150 000 ₽,
 * cycle_start_day=1, owner role. Used by all V10 baseline specs.
 */
export const ME_ONBOARDED_V10 = {
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

/**
 * Single primary Т-Банк card with 50 000 ₽ balance — minimum viable
 * /accounts response for V10 home/transactions screens.
 */
export const ACCOUNTS_V10 = [
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

/**
 * Two-category set (Кафе + savings) sufficient to render Home category
 * row, CategoryDetail, and Plan/Subscriptions empty-state composition.
 */
export const CATEGORIES_V10 = [
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

/**
 * Active May 2026 budget period (id=5) — referenced by `/periods/5/actual`
 * route below. Keep id stable so spec route patterns don't drift.
 */
export const PERIOD_CURRENT_V10 = {
  id: 5,
  period_start: '2026-05-01',
  period_end: '2026-05-31',
  starting_balance_cents: 0,
  ending_balance_cents: null,
  status: 'active',
  closed_at: null,
};

/**
 * Phase 29-04 pre-condition (Savings fixture extension) — default
 * SavingsSnapshot returned by `GET /api/v1/savings`. The catch-all
 * `[]` body collides with `SavingsView` which destructures
 * `snap.config.roundup_enabled` (TypeError on array). A zero-balance
 * empty-goals snapshot lets the screen render its EMPTY state.
 */
export const SAVINGS_SNAPSHOT_V10 = {
  total_cents: 0,
  month_in_cents: 0,
  config: {
    roundup_enabled: false,
    roundup_base: 50,
  },
  goals: [],
};

/**
 * Phase 29-04 pre-condition (AI fixture extension) — deterministic
 * observation payload for `GET /api/v1/ai/observation`. Without this
 * mock, `AiView.observation` is `null` and the 36px DM Serif Italic
 * hero block does not render in the baseline PNG.
 */
export const AI_OBSERVATION_V10 = {
  text: 'Май в плюсе на 21 170 ₽.',
  generated_at: '2026-05-09T08:00:00Z',
};

/**
 * ADR-0007 — `GET /api/v1/subscriptions/recurring/cashflow` projection
 * (CashflowProjectionResponse-shaped). The cashflow screen destructures
 * `.timeline`, `.monthly_burden_cents`, `.starting_balance_cents`,
 * `.horizon_days` — the catch-all `[]` would crash it (`.timeline` undefined),
 * so the dedicated route below returns this valid object. Two timeline events
 * (CashflowEvent-shaped) exercise the day-grouped «Ближайшие списания» list +
 * running-balance projection; `subscription_id` matches a row the screen can
 * resolve from the recurring (subscriptions) list, so the row is tappable.
 */
export const RECURRING_CASHFLOW_V10 = {
  starting_balance_cents: 50_000_00,
  horizon_days: 90,
  monthly_burden_cents: 4_597_00,
  timeline: [
    {
      date: '2026-05-15',
      name: 'Подписки',
      amount_cents: 2_597_00,
      balance_after_cents: 47_403_00,
      category_id: 5,
      kind: 'expense',
      subscription_id: 23,
    },
    {
      date: '2026-06-01',
      name: 'Аренда',
      amount_cents: 45_000_00,
      balance_after_cents: 2_403_00,
      category_id: 4,
      kind: 'expense',
      subscription_id: 21,
    },
  ],
};

/**
 * ADR-0007 — `GET /api/v1/subscriptions/recurring/due` (RecurringDueRow[]).
 * Default is EMPTY so the Home «Регулярные платежи» due card stays hidden in
 * the baseline (the catch-all `[]` would do the same, but an explicit route
 * documents the shape and lets per-test overrides return rows to exercise it).
 */
export const RECURRING_DUE_V10: Array<{
  id: number;
  category_id: number;
  amount_cents: number;
  description?: string | null;
  planned_date?: string | null;
  posted_txn_id?: number | null;
  subscription_id?: number | null;
}> = [];

/**
 * Aggregated `GET /api/v1/home` bootstrap (backend F3). HomeMount now adopts
 * this single call on the in-shell active-period path, so the V10 home
 * baseline renders FROM this payload. It mirrors the granular fixtures
 * field-for-field (same accounts / categories / active period / empty
 * actuals → same Home render) so the pixel snapshot stays byte-identical.
 * `balance: null` because the active period sources aggregates from
 * categories + actuals (not a closed-period balance).
 */
export const HOME_BOOTSTRAP_V10 = {
  user: ME_ONBOARDED_V10,
  accounts: ACCOUNTS_V10,
  categories: CATEGORIES_V10,
  period: PERIOD_CURRENT_V10,
  balance: null,
  actuals: [],
};

// ─────────────────── route installation ───────────────────

/**
 * Optional extra route handler. Registered AFTER the catch-all so it
 * wins per Playwright's last-registered-handler-wins rule for matching
 * routes (see Playwright docs: route precedence is reverse-registration
 * order). Pass an array of `{ pattern, handler }` to override specific
 * endpoints per-test (e.g., a non-empty /actual list).
 */
export interface ExtraRoute {
  pattern: string | RegExp;
  handler: (route: Route) => Promise<void> | void;
}

export interface InstallOptions {
  extraRoutes?: ExtraRoute[];
  /**
   * Phase 31-01 (REG-01): fixture mode.
   *
   * - `'mock'` (default): install per-endpoint `page.route` mocks against
   *   the SPA's `/api/v1/*` calls. The backend is never contacted. Used
   *   by all Phase 29 pixel + acceptance specs.
   *
   * - `'live'`: skip route mocking entirely. Instead, call the backend
   *   seed endpoint to materialise tg_user_id=999000 + 8 categories +
   *   period + 1 account, and attach `X-Test-User: 999000` to every
   *   Playwright request so the dev-mode auth bypass routes downstream
   *   calls to that user. Requires:
   *     - docker stack on `localhost:8000`
   *     - `DEV_MODE=true` on the backend (auth bypass)
   *     - `INTERNAL_TOKEN` env var (or fallback `test_internal_secret_token`)
   *     - `context` option passed in (Playwright BrowserContext) so we
   *       can call `context.setExtraHTTPHeaders`.
   */
  mode?: 'mock' | 'live';
  /**
   * Playwright BrowserContext. **Required when `mode === 'live'`** so the
   * fixture can `context.setExtraHTTPHeaders({ 'X-Test-User': '...' })`.
   * Ignored in `mock` mode.
   */
  context?: BrowserContext;
  /**
   * Override the test user id in live mode. Default `999000`. Useful for
   * future tests that exercise multi-user scenarios. Ignored in mock mode.
   */
  testUserId?: number;
  /**
   * Override the backend base URL for the seed call. Default
   * `http://localhost:8000`. Ignored in mock mode.
   */
  backendBaseUrl?: string;
  /**
   * Override the internal token for the seed call. Default reads
   * `process.env.INTERNAL_TOKEN` or falls back to `test_internal_secret_token`
   * (the value baked into `.env.example`). Ignored in mock mode.
   */
  internalToken?: string;
}

/**
 * Install onboarded-user fixture on a Page.
 *
 * Two modes (see `InstallOptions.mode`):
 *
 * **mock** (default) — Effects:
 *   1. `addInitScript` writes `localStorage['ui.theme'] = 'v10'` BEFORE
 *      the SPA boots so the V10 shell renders on first paint.
 *   2. Per-endpoint `page.route` handlers fulfil /me, /accounts,
 *      /categories, /periods/current, /periods/5/actual.
 *   3. Catch-all `**\/api/v1/**` returns `[]` for GETs and falls through
 *      for non-GET (so onboarding mutations etc. behave normally).
 *   4. Optional `extraRoutes` registered last → win precedence.
 *
 * **live** — Effects:
 *   1. `addInitScript` writes `localStorage['ui.theme'] = 'v10'` (same).
 *   2. Call POST `/api/v1/internal/onboarding/seed?tg_user_id=N` on the
 *      backend so the user is fully onboarded.
 *   3. `context.setExtraHTTPHeaders({ 'X-Test-User': 'N' })` so every
 *      page request lands as that user under the dev-mode bypass.
 *   4. NO route mocks installed — SPA hits the real backend.
 *
 * Idempotent per-page: call once in `test.beforeEach`.
 */
export async function installOnboardedFixture(
  page: Page,
  opts: InstallOptions = {},
): Promise<void> {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('ui.theme', 'v10');
    } catch {
      /* private mode — fall through to default 'v10' */
    }
  });

  // ─── Live mode: seed backend + attach X-Test-User header ───
  if (opts.mode === 'live') {
    const testUserId = opts.testUserId ?? 999_000;
    const baseUrl = opts.backendBaseUrl ?? 'http://localhost:8000';
    const token =
      opts.internalToken ??
      process.env.INTERNAL_TOKEN ??
      'test_internal_secret_token';
    const context = opts.context;
    if (!context) {
      throw new Error(
        "installOnboardedFixture({ mode: 'live' }) requires `context` " +
          'to be passed so X-Test-User can be set as an extra HTTP header. ' +
          'Pass it from the Playwright test fixture: ' +
          'test.beforeEach(async ({ page, context }) => ' +
          "{ await installOnboardedFixture(page, { mode: 'live', context }); })",
      );
    }
    const seedUrl =
      `${baseUrl}/api/v1/internal/onboarding/seed` +
      `?tg_user_id=${testUserId}`;
    const seedResp = await fetch(seedUrl, {
      method: 'POST',
      headers: { 'X-Internal-Token': token },
    });
    if (!seedResp.ok) {
      const body = await seedResp.text();
      throw new Error(
        `Live-mode fixture: seed call failed (${seedResp.status}): ${body}. ` +
          `Verify: docker stack is up on ${baseUrl}, DEV_MODE=true, and ` +
          `INTERNAL_TOKEN matches the backend's .env.`,
      );
    }
    await context.setExtraHTTPHeaders({
      'X-Test-User': String(testUserId),
    });
    // Per-test overrides still honoured (registered now so they win over
    // any future default registrations a caller might add — though in
    // live mode we install no defaults).
    if (opts.extraRoutes) {
      for (const { pattern, handler } of opts.extraRoutes) {
        await page.route(pattern, handler);
      }
    }
    return;
  }

  // ─── Mock mode (default) — existing behaviour preserved verbatim ───
  // Playwright route precedence: handlers registered LATER win for
  // overlapping patterns. We therefore install the broad catch-all FIRST
  // (default `[]` for any GET we haven't enumerated), then layer the
  // specific endpoints on top so they take precedence. Finally, optional
  // `extraRoutes` are registered last so per-test overrides win against
  // both layers.
  await page.route('**/api/v1/**', (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '[]',
      });
    } else {
      route.continue();
    }
  });

  await page.route('**/api/v1/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ME_ONBOARDED_V10),
    }),
  );
  // HomeMount's single-call bootstrap (GET /api/v1/home). Without this the
  // catch-all `[]` would force the granular fallback — harmless, but mocking
  // it exercises the real in-shell fast path the app now uses.
  await page.route('**/api/v1/home', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(HOME_BOOTSTRAP_V10),
    }),
  );
  await page.route('**/api/v1/accounts', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ACCOUNTS_V10),
    }),
  );
  await page.route('**/api/v1/categories**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(CATEGORIES_V10),
    }),
  );
  await page.route('**/api/v1/periods/current', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(PERIOD_CURRENT_V10),
    }),
  );
  await page.route('**/api/v1/periods/5/actual**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    }),
  );

  // Phase 29-04 — Savings + AI fixture extensions. Both screens were
  // unrenderable under the catch-all `[]` default (Savings crashed on
  // `snap.config.roundup_enabled`; AI dropped the 36px DM Serif hero
  // because `observation` resolved to null). Specific routes return
  // shape-correct empty/deterministic payloads so the screens render
  // their canonical empty/loaded state for the visual audit.
  await page.route('**/api/v1/savings', (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(SAVINGS_SNAPSHOT_V10),
      });
    } else {
      route.continue();
    }
  });
  await page.route('**/api/v1/ai/observation', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(AI_OBSERVATION_V10),
    }),
  );

  // ADR-0007 — recurring cashflow projection + due list. The cashflow screen
  // crashes under the catch-all `[]` (it destructures `.timeline`); the due
  // list is read live by Home (the catch-all `[]` would hide the card, but an
  // explicit route documents the contract). The cashflow URL carries a
  // `?horizon_days=90` query string → the pattern needs a trailing `**`.
  await page.route('**/api/v1/subscriptions/recurring/cashflow**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(RECURRING_CASHFLOW_V10),
    }),
  );
  await page.route('**/api/v1/subscriptions/recurring/due', (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(RECURRING_DUE_V10),
      });
    } else {
      route.continue();
    }
  });

  if (opts.extraRoutes) {
    for (const { pattern, handler } of opts.extraRoutes) {
      await page.route(pattern, handler);
    }
  }
}

// ─────────────────── motion-freeze helper ───────────────────

/**
 * Inject a kill-switch stylesheet that zeroes all CSS animation +
 * transition durations/delays on the current document. Then sleeps
 * 150 ms to let any in-flight count-up / FAB pulse settle.
 *
 * Call AFTER each navigation, BEFORE `toHaveScreenshot()`.
 */
export async function freezeMotion(page: Page): Promise<void> {
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
