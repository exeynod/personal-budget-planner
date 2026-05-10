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
// Usage:
//   import { installOnboardedFixture, freezeMotion } from './fixtures/onboarded-user';
//   test.beforeEach(async ({ page }) => {
//     await installOnboardedFixture(page);
//   });
//   test('something', async ({ page }) => {
//     await page.goto('/');
//     await freezeMotion(page);
//     // …assertions / screenshots…
//   });

import type { Page, Route } from '@playwright/test';

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
}

/**
 * Install onboarded-user mocks + V10 theme bootstrap on a Page.
 *
 * Effects:
 *   1. `addInitScript` writes `localStorage['ui.theme'] = 'v10'` BEFORE
 *      the SPA boots so the V10 shell renders on first paint.
 *   2. Per-endpoint `page.route` handlers fulfil /me, /accounts,
 *      /categories, /periods/current, /periods/5/actual.
 *   3. Catch-all `**\/api/v1/**` returns `[]` for GETs and falls through
 *      for non-GET (so onboarding mutations etc. behave normally).
 *   4. Optional `extraRoutes` registered last → win precedence.
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
