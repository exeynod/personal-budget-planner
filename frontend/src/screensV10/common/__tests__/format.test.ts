// Phase 25-02: vitest specs for screensV10/common/format.ts
// Covers each behaviour bullet from PLAN must_haves §"truths" and Task 1.

import { describe, it, expect } from 'vitest';
import {
  MONTHS_EN,
  MONTHS_RU_GENITIVE,
  formatDay,
  formatTimeHM,
  pluralDays,
  formatPeriodEyebrow,
  formatPeriodEyebrowFromPeriod,
} from '../format';
import type { PeriodRead } from '../../../api/types';

function makePeriod(over: Partial<PeriodRead> = {}): PeriodRead {
  return {
    id: 1,
    period_start: '2026-05-01',
    period_end: '2026-05-31',
    starting_balance_cents: 0,
    ending_balance_cents: null,
    status: 'closed',
    closed_at: null,
    ...over,
  };
}

describe('format — constants', () => {
  it('MONTHS_EN has 12 uppercase 3-letter abbreviations starting JAN', () => {
    expect(MONTHS_EN).toHaveLength(12);
    expect(MONTHS_EN[0]).toBe('JAN');
    expect(MONTHS_EN[4]).toBe('MAY');
    expect(MONTHS_EN[11]).toBe('DEC');
    for (const m of MONTHS_EN) {
      expect(m).toMatch(/^[A-Z]{3}$/);
    }
  });

  it('MONTHS_RU_GENITIVE has 12 lowercase Russian genitive month names', () => {
    expect(MONTHS_RU_GENITIVE).toHaveLength(12);
    expect(MONTHS_RU_GENITIVE[0]).toBe('января');
    expect(MONTHS_RU_GENITIVE[4]).toBe('мая');
    expect(MONTHS_RU_GENITIVE[11]).toBe('декабря');
  });
});

describe('format — formatDay', () => {
  it('returns "Сегодня" when same Y/M/D as today', () => {
    const today = new Date(2026, 4, 9); // May 9 2026
    const d = new Date(2026, 4, 9, 12, 30); // same date, different time
    expect(formatDay(d, today)).toBe('Сегодня');
  });

  it('returns "Вчера" for one day before today', () => {
    const today = new Date(2026, 4, 9);
    const d = new Date(2026, 4, 8);
    expect(formatDay(d, today)).toBe('Вчера');
  });

  it('returns "{day} {month_genitive}" for older dates within month', () => {
    const today = new Date(2026, 4, 9);
    const d = new Date(2026, 4, 7);
    expect(formatDay(d, today)).toBe('7 мая');
  });

  it('returns "{day} {month_genitive}" across year boundary', () => {
    const today = new Date(2026, 4, 9);
    const d = new Date(2025, 11, 31); // 31 Dec 2025
    expect(formatDay(d, today)).toBe('31 декабря');
  });

  it('returns "{day} {month_genitive}" for future dates', () => {
    const today = new Date(2026, 4, 9);
    const d = new Date(2026, 5, 1); // 1 June 2026
    expect(formatDay(d, today)).toBe('1 июня');
  });

  it('handles "Вчера" across month boundary', () => {
    const today = new Date(2026, 5, 1); // 1 June 2026
    const d = new Date(2026, 4, 31); // 31 May 2026
    expect(formatDay(d, today)).toBe('Вчера');
  });
});

describe('format — formatTimeHM', () => {
  it('returns zero-padded HH:MM', () => {
    const d = new Date(2026, 4, 9, 14, 32);
    expect(formatTimeHM(d)).toBe('14:32');
  });

  it('zero-pads single-digit hours', () => {
    const d = new Date(2026, 4, 9, 9, 5);
    expect(formatTimeHM(d)).toBe('09:05');
  });

  it('handles 00:00', () => {
    const d = new Date(2026, 4, 9, 0, 0);
    expect(formatTimeHM(d)).toBe('00:00');
  });

  it('handles 23:59', () => {
    const d = new Date(2026, 4, 9, 23, 59);
    expect(formatTimeHM(d)).toBe('23:59');
  });
});

describe('format — pluralDays', () => {
  it('returns "ДЕНЬ" for n%10===1 && n%100!==11', () => {
    expect(pluralDays(1)).toBe('ДЕНЬ');
    expect(pluralDays(21)).toBe('ДЕНЬ');
    expect(pluralDays(101)).toBe('ДЕНЬ');
  });

  it('returns "ДНЯ" for n%10 ∈ 2..4 && n%100 ∉ 12..14', () => {
    expect(pluralDays(2)).toBe('ДНЯ');
    expect(pluralDays(3)).toBe('ДНЯ');
    expect(pluralDays(4)).toBe('ДНЯ');
    expect(pluralDays(22)).toBe('ДНЯ');
    expect(pluralDays(23)).toBe('ДНЯ');
  });

  it('returns "ДНЕЙ" for everything else (incl. 11..14, 5+, 0)', () => {
    expect(pluralDays(0)).toBe('ДНЕЙ');
    expect(pluralDays(5)).toBe('ДНЕЙ');
    expect(pluralDays(11)).toBe('ДНЕЙ');
    expect(pluralDays(12)).toBe('ДНЕЙ');
    expect(pluralDays(13)).toBe('ДНЕЙ');
    expect(pluralDays(14)).toBe('ДНЕЙ');
    expect(pluralDays(25)).toBe('ДНЕЙ');
  });
});

describe('format — formatPeriodEyebrow', () => {
  it('formats May 9 2026 with VOL.17, 23 days remaining (31-9+1=23)', () => {
    const d = new Date(2026, 4, 9); // May 9 2026
    // vol = (2026-2025)*12 + 5 = 17
    // lastDay May 2026 = 31; daysLeft = 31 - 9 + 1 = 23 → "ДНЯ"
    expect(formatPeriodEyebrow(d)).toBe('VOL.17 / MAY 2026 · 23 ДНЯ');
  });

  it('formats Jan 1 2025 with VOL.01, 31 days', () => {
    const d = new Date(2025, 0, 1); // Jan 1 2025
    // vol = (2025-2025)*12 + 1 = 1 → 01
    // lastDay Jan 2025 = 31; daysLeft = 31 - 1 + 1 = 31 → "ДЕНЬ"
    expect(formatPeriodEyebrow(d)).toBe('VOL.01 / JAN 2025 · 31 ДЕНЬ');
  });

  it('formats Dec 31 2026 (last day, daysLeft=1)', () => {
    const d = new Date(2026, 11, 31);
    // vol = (2026-2025)*12 + 12 = 24
    // lastDay Dec 2026 = 31; daysLeft = 31 - 31 + 1 = 1 → "ДЕНЬ"
    expect(formatPeriodEyebrow(d)).toBe('VOL.24 / DEC 2026 · 1 ДЕНЬ');
  });

  it('zero-pads vol to 2 digits when single', () => {
    const d = new Date(2025, 4, 1); // May 2025 → vol=5
    expect(formatPeriodEyebrow(d).startsWith('VOL.05 /')).toBe(true);
  });

  it('does NOT zero-pad vol beyond 2 digits when ≥10', () => {
    const d = new Date(2026, 4, 1); // May 2026 → vol=17
    expect(formatPeriodEyebrow(d).startsWith('VOL.17 /')).toBe(true);
  });

  it('handles February with leap-year-aware lastDay', () => {
    const d = new Date(2028, 1, 1); // Feb 1 2028 (leap)
    // vol = (2028-2025)*12 + 2 = 38
    // lastDay Feb 2028 = 29; daysLeft = 29 - 1 + 1 = 29 → "ДНЕЙ"
    expect(formatPeriodEyebrow(d)).toBe('VOL.38 / FEB 2028 · 29 ДНЕЙ');
  });

  it('uses ДНЯ for daysLeft=2, ДНЕЙ for 5', () => {
    const d2 = new Date(2026, 4, 30); // 31 - 30 + 1 = 2
    expect(formatPeriodEyebrow(d2)).toBe('VOL.17 / MAY 2026 · 2 ДНЯ');
    const d5 = new Date(2026, 4, 27); // 31 - 27 + 1 = 5
    expect(formatPeriodEyebrow(d5)).toBe('VOL.17 / MAY 2026 · 5 ДНЕЙ');
  });
});

describe('format — formatPeriodEyebrowFromPeriod (Phase P2)', () => {
  it('shows MAY (from period_start) when the clock reads June — past period', () => {
    // The viewed period is May 2026 but "today" is in June → eyebrow must
    // reflect the PERIOD's month (MAY), not today's, and daysLeft = 0.
    const may = makePeriod({
      period_start: '2026-05-01',
      period_end: '2026-05-31',
      status: 'closed',
    });
    const todayJune = new Date(2026, 5, 6); // 6 June 2026
    expect(formatPeriodEyebrowFromPeriod(may, todayJune)).toBe(
      'VOL.17 / MAY 2026 · 0 ДНЕЙ',
    );
  });

  it('active period: today inside range → daysLeft = end − today + 1', () => {
    const may = makePeriod({
      period_start: '2026-05-01',
      period_end: '2026-05-31',
      status: 'active',
    });
    const todayMay9 = new Date(2026, 4, 9); // 9 May → 31 - 9 + 1 = 23
    expect(formatPeriodEyebrowFromPeriod(may, todayMay9)).toBe(
      'VOL.17 / MAY 2026 · 23 ДНЯ',
    );
  });

  it('future period: today before start → full span (inclusive)', () => {
    const july = makePeriod({
      period_start: '2026-07-01',
      period_end: '2026-07-31',
      status: 'active',
    });
    const todayJune = new Date(2026, 5, 6); // before July → 31 days
    expect(formatPeriodEyebrowFromPeriod(july, todayJune)).toBe(
      'VOL.19 / JUL 2026 · 31 ДЕНЬ',
    );
  });
});
