// Phase 24-01: Default 8 categories for V10 onboarding step 03 (PLAN).
// Shares from DATA-MODEL §1.3; sum of shares = 0.83, the remaining 0.17
// flows to the savings counter shown beneath the slider stack.
//
// Both the web reducer (auto-allocation on SET_INCOME) and the iOS
// OnboardingFlow.setIncome reuse the same share table — keep `share`
// values in lock-step with `ios/.../DefaultCategories.swift`.

export type DefaultCategoryCode =
  | 'food'
  | 'cafe'
  | 'home'
  | 'transit'
  | 'fun'
  | 'gifts'
  | 'health'
  | 'subs';

export interface DefaultCategory {
  code: DefaultCategoryCode;
  /** UPPERCASE Russian name, exact strings shown on Step 03 cards. */
  name: string;
  /** Display ord — 2-digit "01".."08". */
  ord: string;
  /** Initial slider share. floor(income * share / 50_000) * 50_000 cents. */
  share: number;
}

export const DEFAULT_CATEGORIES: ReadonlyArray<DefaultCategory> = [
  { code: 'food',    name: 'ПРОДУКТЫ',  ord: '01', share: 0.20 },
  { code: 'cafe',    name: 'КАФЕ',      ord: '02', share: 0.10 },
  { code: 'home',    name: 'ДОМ',       ord: '03', share: 0.30 },
  { code: 'transit', name: 'ТРАНСПОРТ', ord: '04', share: 0.06 },
  { code: 'fun',     name: 'РАЗВЛЕЧ.',  ord: '05', share: 0.05 },
  { code: 'gifts',   name: 'ПОДАРКИ',   ord: '06', share: 0.04 },
  { code: 'health',  name: 'ЗДОРОВЬЕ',  ord: '07', share: 0.05 },
  { code: 'subs',    name: 'ПОДПИСКИ',  ord: '08', share: 0.03 },
];

/** Slider step in cents = 500₽ = 50_000 cents (DATA-MODEL §1.3). */
export const PLAN_STEP_CENTS = 50_000;

/** O(1) lookup for SET_PLAN code validation. */
export const VALID_CATEGORY_CODES: ReadonlySet<DefaultCategoryCode> = new Set(
  DEFAULT_CATEGORIES.map((c) => c.code),
);

/**
 * Compute initial plan allocation from income. Returns Map[code → cents]
 * with floor-to-step rounding so each slider lands on a 500₽ tick.
 */
export function defaultPlanFromIncome(
  incomeCents: number,
): Record<DefaultCategoryCode, number> {
  const out = {} as Record<DefaultCategoryCode, number>;
  for (const cat of DEFAULT_CATEGORIES) {
    const raw = incomeCents * cat.share;
    out[cat.code] = Math.floor(raw / PLAN_STEP_CENTS) * PLAN_STEP_CENTS;
  }
  return out;
}
