// Phase 24-10: Playwright route mocks for the V10 onboarding e2e suite.
//
// Helpers install per-test page.route handlers for /me and
// /onboarding/complete. Each returns the Playwright Route object pattern
// — single registration per test, no global router. Tests own the order:
// install /me first, then /onboarding/complete (last-installed wins for
// /onboarding/complete pattern; /me handler keeps catching its URL).
//
// All shapes mirror MeV10Response (app/api/schemas/me_v10.py) and
// OnboardingV10Response (app/api/schemas/onboarding_v10.py).

import type { Page } from '@playwright/test';

export const ME_NOT_ONBOARDED = {
  tg_user_id: 100_000_001,
  tg_chat_id: 200_000_001,
  cycle_start_day: 5,
  onboarded_at: null as string | null,
  chat_id_known: true,
  role: 'owner' as const,
  ai_spend_cents: 0,
  ai_spending_cap_cents: 46_500,
  income_cents: null as number | null,
};

export const ME_ONBOARDED = {
  ...ME_NOT_ONBOARDED,
  onboarded_at: '2026-05-10T12:00:00+00:00',
  income_cents: 12_000_000, // 120 000 ₽ in cents
};

export const ONBOARDING_COMPLETE_RESPONSE = {
  user_id: 1,
  income_cents: 12_000_000,
  account_ids: [1],
  category_ids_by_code: {
    food: 10,
    cafe: 11,
    home: 12,
    transit: 13,
    fun: 14,
    gifts: 15,
    health: 16,
    subs: 17,
  },
  savings_category_id: 18,
  goal_id: null as number | null,
  savings_config: {
    roundup_enabled: false,
    roundup_base: 50,
  },
  onboarded_at: '2026-05-10T12:00:00+00:00',
};

/**
 * Install a /me mock. Pass `flipAfter` to swap response after a number of
 * calls — used by the «full flow → submit → home placeholder» test where
 * the first /me must return null onboarded_at and the post-submit refetch
 * must return the onboarded shape.
 */
export async function mockMe(
  page: Page,
  options: {
    initial: typeof ME_NOT_ONBOARDED | typeof ME_ONBOARDED;
    flipAfterCall?: number; // 1 = flip on the SECOND call
    flipTo?: typeof ME_ONBOARDED;
  },
) {
  let callCount = 0;
  await page.route('**/api/v1/me', async (route) => {
    callCount += 1;
    const body =
      options.flipAfterCall !== undefined &&
      callCount > options.flipAfterCall &&
      options.flipTo
        ? options.flipTo
        : options.initial;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

export async function mockMeNotOnboarded(page: Page) {
  await mockMe(page, { initial: ME_NOT_ONBOARDED });
}

/** Mock /onboarding/complete returning 200 OK + canned response. */
export async function mockOnboardingComplete200(page: Page) {
  await page.route('**/api/v1/onboarding/complete', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ONBOARDING_COMPLETE_RESPONSE),
    });
  });
}

/** Mock /onboarding/complete returning 409 (already onboarded). */
export async function mockOnboardingComplete409(page: Page) {
  await page.route('**/api/v1/onboarding/complete', async (route) => {
    await route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'AlreadyOnboardedError' }),
    });
  });
}

/** Mock /onboarding/complete returning 422 (validation error). */
export async function mockOnboardingComplete422(page: Page) {
  await page.route('**/api/v1/onboarding/complete', async (route) => {
    await route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({
        detail: [
          {
            loc: ['body', 'category_plans'],
            msg: 'sum exceeds income',
            type: 'value_error',
          },
        ],
      }),
    });
  });
}

/** A pre-filled draft useful for tests that pre-populate localStorage. */
export const STEP05_DRAFT = {
  step: 5,
  income_cents: 8_000_000, // 80_000 ₽
  accounts: [
    {
      bank: 'Т-БАНК',
      mask: null,
      kind: 'card' as const,
      balance_cents: 5_000_000,
      primary: true,
    },
  ],
  category_plans: {
    food: 1_600_000,
    cafe: 800_000,
    home: 2_400_000,
    transit: 480_000,
    fun: 400_000,
    gifts: 320_000,
    health: 400_000,
    subs: 240_000,
  },
  goal: null,
  savings_config: null,
};

export const STORAGE_KEY = 'onboarding.v10.draft';
