// Phase 27-02 Task 1 RED: failing tests for AI compute helpers.
//
// Helpers under test:
//   - todayRu(d: Date): string  → "9 мая" (день + month genitive RU)
//   - DEFAULT_SUGGESTION_CHIPS: readonly [string,string,string,string]
//   - MONTHS_RU_GEN: readonly array of 12 RU genitive month names
//
// Mirrors the rule-priority/format conventions established in Phase 25-02
// (`screensV10/common/format.ts` MONTHS_RU_GENITIVE) but kept local to
// the Ai feature so it stays testable without provider scaffolding.
import { describe, it, expect } from 'vitest';
import {
  todayRu,
  DEFAULT_SUGGESTION_CHIPS,
  MONTHS_RU_GEN,
} from '../computeAi';

describe('todayRu', () => {
  it('renders Jan correctly', () =>
    expect(todayRu(new Date(2026, 0, 1))).toBe('1 января'));
  it('renders May 9', () =>
    expect(todayRu(new Date(2026, 4, 9))).toBe('9 мая'));
  it('renders Dec 31', () =>
    expect(todayRu(new Date(2026, 11, 31))).toBe('31 декабря'));
  it('renders leap Feb 29', () =>
    expect(todayRu(new Date(2024, 1, 29))).toBe('29 февраля'));
});

describe('DEFAULT_SUGGESTION_CHIPS', () => {
  it('has exactly 4 chips', () =>
    expect(DEFAULT_SUGGESTION_CHIPS.length).toBe(4));
  it('all are non-empty strings', () => {
    for (const c of DEFAULT_SUGGESTION_CHIPS) {
      expect(typeof c).toBe('string');
      expect(c.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('MONTHS_RU_GEN', () => {
  it('has 12 entries', () => expect(MONTHS_RU_GEN.length).toBe(12));
  it('all are non-empty', () => {
    for (const m of MONTHS_RU_GEN) {
      expect(typeof m).toBe('string');
      expect(m.length).toBeGreaterThan(0);
    }
  });
});
