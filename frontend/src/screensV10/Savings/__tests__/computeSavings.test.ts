// Phase 27-03 Task 1 (RED → GREEN): pure compute helpers for the Savings
// screen. These are the validation gates the Mount uses to enable/disable
// СОХРАНИТЬ buttons in the New Goal / Deposit sheets, plus the formatters
// the View uses for goal cards.

import { describe, it, expect } from 'vitest';
import {
  computeProgressPct,
  formatDueRu,
  isValidGoalDraft,
  isValidDepositDraft,
} from '../computeSavings';

describe('computeProgressPct', () => {
  it('returns 50 for current=5000_00, target=10000_00', () => {
    expect(computeProgressPct(500_000, 1_000_000)).toBe(50);
  });

  it('clamps at 100 when current > target', () => {
    expect(computeProgressPct(2_000_000, 1_000_000)).toBe(100);
  });

  it('returns 0 when target <= 0', () => {
    expect(computeProgressPct(500_000, 0)).toBe(0);
    expect(computeProgressPct(500_000, -100)).toBe(0);
  });

  it('returns 0 when current is negative', () => {
    expect(computeProgressPct(-100, 1_000_000)).toBe(0);
  });

  it('rounds to nearest integer percent', () => {
    // 333/1000 = 33.3% → 33
    expect(computeProgressPct(333, 1000)).toBe(33);
    // 667/1000 = 66.7% → 67
    expect(computeProgressPct(667, 1000)).toBe(67);
  });
});

describe('formatDueRu', () => {
  it('formats 2026-12-31 → «до 31 декабря 2026»', () => {
    expect(formatDueRu('2026-12-31')).toBe('до 31 декабря 2026');
  });

  it('formats 2026-05-01 → «до 1 мая 2026»', () => {
    expect(formatDueRu('2026-05-01')).toBe('до 1 мая 2026');
  });

  it('returns null for null input', () => {
    expect(formatDueRu(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(formatDueRu(undefined)).toBeNull();
  });

  it('returns null for invalid date string', () => {
    expect(formatDueRu('not-a-date')).toBeNull();
    expect(formatDueRu('2026-13-01')).toBeNull();
  });
});

describe('isValidGoalDraft', () => {
  it('rejects empty name', () => {
    expect(
      isValidGoalDraft({ name: '', target_cents: 100, due: null }),
    ).toBe(false);
  });

  it('rejects whitespace-only name', () => {
    expect(
      isValidGoalDraft({ name: '   ', target_cents: 100, due: null }),
    ).toBe(false);
  });

  it('rejects target_cents <= 0', () => {
    expect(
      isValidGoalDraft({ name: 'iPhone', target_cents: 0, due: null }),
    ).toBe(false);
    expect(
      isValidGoalDraft({ name: 'iPhone', target_cents: -100, due: null }),
    ).toBe(false);
  });

  it('accepts valid draft with name + positive target', () => {
    expect(
      isValidGoalDraft({ name: 'iPhone', target_cents: 100_000, due: null }),
    ).toBe(true);
  });

  it('accepts valid draft with optional due date', () => {
    expect(
      isValidGoalDraft({
        name: 'iPhone',
        target_cents: 100_000,
        due: '2027-01-01',
      }),
    ).toBe(true);
  });
});

describe('isValidDepositDraft', () => {
  it('rejects amount_cents = 0', () => {
    expect(
      isValidDepositDraft({ amount_cents: 0, account_id: 1, goal_id: null }),
    ).toBe(false);
  });

  it('rejects negative amount', () => {
    expect(
      isValidDepositDraft({ amount_cents: -100, account_id: 1, goal_id: null }),
    ).toBe(false);
  });

  it('rejects null account_id', () => {
    expect(
      isValidDepositDraft({
        amount_cents: 1000,
        account_id: null,
        goal_id: null,
      }),
    ).toBe(false);
  });

  it('accepts positive amount + account_id (no goal)', () => {
    expect(
      isValidDepositDraft({
        amount_cents: 1000,
        account_id: 1,
        goal_id: null,
      }),
    ).toBe(true);
  });

  it('accepts positive amount + account_id + goal_id', () => {
    expect(
      isValidDepositDraft({ amount_cents: 1000, account_id: 1, goal_id: 7 }),
    ).toBe(true);
  });
});
