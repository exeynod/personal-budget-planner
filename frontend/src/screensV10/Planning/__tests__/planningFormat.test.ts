// ADR-0008 — periodMonthLabel formatter tests.

import { describe, it, expect } from 'vitest';
import { periodMonthLabel } from '../planningFormat';

describe('periodMonthLabel', () => {
  it('formats a period start as «Месяц YYYY» (nominative)', () => {
    expect(periodMonthLabel('2026-06-01')).toBe('Июнь 2026');
    expect(periodMonthLabel('2026-01-15')).toBe('Январь 2026');
    expect(periodMonthLabel('2025-12-01')).toBe('Декабрь 2025');
  });

  it('falls back to «месяц» for null / malformed input', () => {
    expect(periodMonthLabel(null)).toBe('месяц');
    expect(periodMonthLabel(undefined)).toBe('месяц');
    expect(periodMonthLabel('garbage')).toBe('месяц');
  });
});
