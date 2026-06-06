// Phase 25-02: vitest specs for screensV10/common/format.ts (dates/period).
// One behaviour test per helper; RU plural forms (1/2/5/11) protected.

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

describe('format — month constants', () => {
  it('MONTHS_EN/RU have 12 entries with expected anchors', () => {
    expect(MONTHS_EN).toHaveLength(12);
    expect([MONTHS_EN[0], MONTHS_EN[4], MONTHS_EN[11]]).toEqual([
      'JAN',
      'MAY',
      'DEC',
    ]);
    expect(MONTHS_RU_GENITIVE).toHaveLength(12);
    expect([
      MONTHS_RU_GENITIVE[0],
      MONTHS_RU_GENITIVE[4],
      MONTHS_RU_GENITIVE[11],
    ]).toEqual(['января', 'мая', 'декабря']);
  });
});

describe('format — formatDay', () => {
  it('Сегодня / Вчера (with rollover) / "{day} {month}" for other dates', () => {
    const today = new Date(2026, 4, 9); // May 9 2026
    expect(formatDay(new Date(2026, 4, 9, 12, 30), today)).toBe('Сегодня');
    expect(formatDay(new Date(2026, 4, 8), today)).toBe('Вчера');
    expect(formatDay(new Date(2026, 4, 7), today)).toBe('7 мая');
    expect(formatDay(new Date(2025, 11, 31), today)).toBe('31 декабря'); // year boundary
    // Вчера across month boundary
    expect(formatDay(new Date(2026, 4, 31), new Date(2026, 5, 1))).toBe(
      'Вчера',
    );
  });
});

describe('format — formatTimeHM', () => {
  it('zero-padded HH:MM across the clock', () => {
    expect(formatTimeHM(new Date(2026, 4, 9, 14, 32))).toBe('14:32');
    expect(formatTimeHM(new Date(2026, 4, 9, 9, 5))).toBe('09:05');
    expect(formatTimeHM(new Date(2026, 4, 9, 0, 0))).toBe('00:00');
  });
});

describe('format — pluralDays', () => {
  it('RU plural: ДЕНЬ / ДНЯ / ДНЕЙ incl. the 11..14 exception', () => {
    expect(pluralDays(1)).toBe('ДЕНЬ');
    expect(pluralDays(21)).toBe('ДЕНЬ');
    expect(pluralDays(2)).toBe('ДНЯ');
    expect(pluralDays(22)).toBe('ДНЯ');
    expect(pluralDays(5)).toBe('ДНЕЙ');
    expect(pluralDays(0)).toBe('ДНЕЙ');
    expect(pluralDays(11)).toBe('ДНЕЙ'); // exception
    expect(pluralDays(12)).toBe('ДНЕЙ');
  });
});

describe('format — formatPeriodEyebrow', () => {
  it('VOL (zero-padded <10) / EN month / daysLeft with plural + leap Feb', () => {
    expect(formatPeriodEyebrow(new Date(2026, 4, 9))).toBe(
      'VOL.17 / MAY 2026 · 23 ДНЯ',
    );
    expect(formatPeriodEyebrow(new Date(2025, 0, 1))).toBe(
      'VOL.01 / JAN 2025 · 31 ДЕНЬ',
    );
    expect(formatPeriodEyebrow(new Date(2026, 11, 31))).toBe(
      'VOL.24 / DEC 2026 · 1 ДЕНЬ',
    );
    // leap-year-aware lastDay
    expect(formatPeriodEyebrow(new Date(2028, 1, 1))).toBe(
      'VOL.38 / FEB 2028 · 29 ДНЕЙ',
    );
  });
});

describe('format — formatPeriodEyebrowFromPeriod (Phase P2)', () => {
  it("reflects PERIOD's month not today's; daysLeft per past/active/future", () => {
    const may = makePeriod({
      period_start: '2026-05-01',
      period_end: '2026-05-31',
    });
    // past period (today in June) → daysLeft 0
    expect(formatPeriodEyebrowFromPeriod(may, new Date(2026, 5, 6))).toBe(
      'VOL.17 / MAY 2026 · 0 ДНЕЙ',
    );
    // active: today inside range
    expect(
      formatPeriodEyebrowFromPeriod(
        { ...may, status: 'active' },
        new Date(2026, 4, 9),
      ),
    ).toBe('VOL.17 / MAY 2026 · 23 ДНЯ');
    // future: today before start → full span
    const july = makePeriod({
      period_start: '2026-07-01',
      period_end: '2026-07-31',
      status: 'active',
    });
    expect(formatPeriodEyebrowFromPeriod(july, new Date(2026, 5, 6))).toBe(
      'VOL.19 / JUL 2026 · 31 ДЕНЬ',
    );
  });
});
