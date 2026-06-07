// Phase 24-01: vitest specs for onboardingReducer state machine.
// Covers every action + invariants spelled out in plan 24-01 must_haves.

import { describe, it, expect } from 'vitest';
import {
  INITIAL_STATE,
  onboardingReducer,
  type OnboardingAction,
} from '../onboardingReducer';
import { DEFAULT_CATEGORIES } from '../defaultCategories';

describe('onboardingReducer — INITIAL_STATE', () => {
  it('starts at step=1 with empty collections', () => {
    expect(INITIAL_STATE).toEqual({
      step: 1,
      income_cents: 0,
      accounts: [],
      category_plans: {},
      savings_config: null,
    });
  });
});

describe('onboardingReducer — SET_INCOME', () => {
  it('sets income_cents and auto-allocates plan when plan empty', () => {
    const next = onboardingReducer(INITIAL_STATE, {
      type: 'SET_INCOME',
      payload: { income_cents: 80_000_00 },
    });
    expect(next.income_cents).toBe(80_000_00);
    // food share 0.20 → 80_000_00 * 0.20 = 16_000_00; floor to step 50_000 = 16_000_00.
    expect(next.category_plans.food).toBe(16_000_00);
    // cafe share 0.10 → 80_000_00 * 0.10 = 8_000_00; already on tick.
    expect(next.category_plans.cafe).toBe(8_000_00);
    // All 8 codes populated.
    for (const cat of DEFAULT_CATEGORIES) {
      expect(next.category_plans[cat.code]).toBeGreaterThanOrEqual(0);
    }
  });

  it('clamps negative income to 0', () => {
    const next = onboardingReducer(INITIAL_STATE, {
      type: 'SET_INCOME',
      payload: { income_cents: -500 },
    });
    expect(next.income_cents).toBe(0);
  });

  it('does not overwrite a non-empty plan on subsequent SET_INCOME', () => {
    const seeded = onboardingReducer(INITIAL_STATE, {
      type: 'SET_INCOME',
      payload: { income_cents: 80_000_00 },
    });
    // User then bumps a slider:
    const tweaked = onboardingReducer(seeded, {
      type: 'SET_PLAN',
      payload: { code: 'food', cents: 5_000_00 },
    });
    const reIncome = onboardingReducer(tweaked, {
      type: 'SET_INCOME',
      payload: { income_cents: 100_000_00 },
    });
    expect(reIncome.income_cents).toBe(100_000_00);
    expect(reIncome.category_plans.food).toBe(5_000_00); // preserved
  });

  it('floors to PLAN_STEP_CENTS (50_000) on awkward income', () => {
    // 33_333 cents is not a tick; gifts share=0.04 → 33_333*0.04 = 1333.32 → floor to 0.
    const next = onboardingReducer(INITIAL_STATE, {
      type: 'SET_INCOME',
      payload: { income_cents: 33_333 },
    });
    expect(next.category_plans.gifts).toBe(0);
  });
});

describe('onboardingReducer — SET_STARTING_BALANCE (§G2 single account)', () => {
  it('materialises exactly one primary card account «Счёт»', () => {
    const next = onboardingReducer(INITIAL_STATE, {
      type: 'SET_STARTING_BALANCE',
      payload: { balance_cents: 12_345 },
    });
    expect(next.accounts).toEqual([
      {
        bank: 'Счёт',
        mask: null,
        kind: 'card',
        balance_cents: 12_345,
        primary: true,
      },
    ]);
  });

  it('replaces the account on re-entry (never grows the array)', () => {
    const a = onboardingReducer(INITIAL_STATE, {
      type: 'SET_STARTING_BALANCE',
      payload: { balance_cents: 5_000_00 },
    });
    const b = onboardingReducer(a, {
      type: 'SET_STARTING_BALANCE',
      payload: { balance_cents: -1_200_00 },
    });
    expect(b.accounts).toHaveLength(1);
    expect(b.accounts[0].balance_cents).toBe(-1_200_00); // negative (долг) ok
    expect(b.accounts[0].primary).toBe(true);
  });
});

describe('onboardingReducer — SET_PLAN', () => {
  it('sets known code', () => {
    const next = onboardingReducer(INITIAL_STATE, {
      type: 'SET_PLAN',
      payload: { code: 'food', cents: 1_500_00 },
    });
    expect(next.category_plans.food).toBe(1_500_00);
  });

  it('clamps negative cents to 0', () => {
    const next = onboardingReducer(INITIAL_STATE, {
      type: 'SET_PLAN',
      payload: { code: 'food', cents: -1 },
    });
    expect(next.category_plans.food).toBe(0);
  });

  it('ignores unknown code (returns unchanged state)', () => {
    const next = onboardingReducer(INITIAL_STATE, {
      type: 'SET_PLAN',
      payload: { code: 'gambling', cents: 999 },
    });
    expect(next).toBe(INITIAL_STATE);
  });
});

describe('onboardingReducer — step transitions', () => {
  it('NEXT increments step', () => {
    const a = onboardingReducer(INITIAL_STATE, { type: 'NEXT' });
    expect(a.step).toBe(2);
  });

  it('NEXT caps at 4', () => {
    let s = INITIAL_STATE;
    for (let i = 0; i < 10; i++) {
      s = onboardingReducer(s, { type: 'NEXT' });
    }
    expect(s.step).toBe(4);
  });

  it('BACK decrements step floored at 1', () => {
    let s = INITIAL_STATE;
    for (let i = 0; i < 4; i++) {
      s = onboardingReducer(s, { type: 'NEXT' });
    }
    expect(s.step).toBe(4);
    for (let i = 0; i < 10; i++) {
      s = onboardingReducer(s, { type: 'BACK' });
    }
    expect(s.step).toBe(1);
  });

  it('RESET returns initial state regardless of mutations', () => {
    let s = INITIAL_STATE;
    s = onboardingReducer(s, {
      type: 'SET_INCOME',
      payload: { income_cents: 5_000_00 },
    });
    s = onboardingReducer(s, {
      type: 'SET_STARTING_BALANCE',
      payload: { balance_cents: 1 },
    });
    s = onboardingReducer(s, { type: 'NEXT' });
    s = onboardingReducer(s, { type: 'RESET' });
    expect(s).toEqual(INITIAL_STATE);
  });

  it('RESET is idempotent', () => {
    const a = onboardingReducer(INITIAL_STATE, { type: 'RESET' });
    const b = onboardingReducer(a, { type: 'RESET' });
    expect(a).toEqual(INITIAL_STATE);
    expect(b).toEqual(INITIAL_STATE);
  });
});

describe('onboardingReducer — exhaustiveness', () => {
  it('returns same state on unknown action (defensive)', () => {
    // Cast through unknown to bypass discriminated-union type-check
    const bogus = { type: 'BOGUS_ACTION' } as unknown as OnboardingAction;
    expect(onboardingReducer(INITIAL_STATE, bogus)).toBe(INITIAL_STATE);
  });
});
