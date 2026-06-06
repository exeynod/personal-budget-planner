// Phase 25-02: Day / time / period eyebrow formatters used by HomeView,
// TransactionsView, AddSheet (T-H-02, T-T-04, T-A-02 from must-haves).
//
// Conventions (per CONTEXT 25-CONTEXT.md §decisions, prototype/poster-screens.jsx):
//  - eyebrow uses ENGLISH 3-letter MONTH (matches prototype line 215 «MAY 2026»)
//  - day grouping uses RUSSIAN GENITIVE month names («7 мая», «31 декабря»)
//  - period_number = (year - 2025) * 12 + month, zero-padded to 2 digits → VOL.NN
//  - daysLeft = lastDayOfMonth - currentDayOfMonth + 1 (today counts as remaining)
//  - pluralDays follows Slavic one/few/many rules (mirror of pluralAccounts in
//    screensV10/Onboarding/format.ts)

import type { PeriodRead } from '../../api/types';

/** ENGLISH 3-letter month abbreviations for eyebrow («MAY 2026»). */
export const MONTHS_EN = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
] as const;

/** Russian genitive month names for day-grouping headers («7 мая»). */
export const MONTHS_RU_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
] as const;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function isSameYMD(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Format a date for day-grouping headers (TransactionsView, HomeView highlights).
 *
 *  - Same calendar day as `today` → 'Сегодня'
 *  - One calendar day before `today` → 'Вчера'
 *  - Otherwise → '{day} {month_genitive}' (e.g. '7 мая', '31 декабря')
 *
 * Year is omitted by design — registry rarely shows cross-year ranges in MVP;
 * year-aware rendering is deferred to a future polish pass.
 */
export function formatDay(d: Date, today: Date): string {
  if (isSameYMD(d, today)) return 'Сегодня';
  const yesterday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - 1,
  );
  if (isSameYMD(d, yesterday)) return 'Вчера';
  return `${d.getDate()} ${MONTHS_RU_GENITIVE[d.getMonth()]}`;
}

/**
 * Format the time component of a Date as zero-padded `HH:MM` (24h).
 * Used for transaction-row mono-timestamps and AddSheet header.
 */
export function formatTimeHM(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * Russian plural form for "день" (day) given an integer count, UPPERCASE
 * for use inside the eyebrow ribbon.
 *
 * Rules (Slavic one / few / many):
 *   - one  (n%10===1 && n%100!==11)             → 'ДЕНЬ'
 *   - few  (n%10 ∈ 2..4 && n%100 ∉ 12..14)      → 'ДНЯ'
 *   - many (everything else, incl. 0/5+/11..14) → 'ДНЕЙ'
 *
 * Mirrors `pluralAccounts` in screensV10/Onboarding/format.ts.
 */
export function pluralDays(n: number): 'ДЕНЬ' | 'ДНЯ' | 'ДНЕЙ' {
  const abs = Math.abs(Math.trunc(n));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return 'ДЕНЬ';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'ДНЯ';
  return 'ДНЕЙ';
}

/**
 * Build the Home / Transactions period eyebrow string:
 *
 *   `VOL.{NN} / {MONTH} {YYYY} · {N} {ДЕНЬ|ДНЯ|ДНЕЙ}`
 *
 *  - vol = (year - 2025) * 12 + (month_1_based) zero-padded to ≥2 digits
 *  - month = MONTHS_EN[d.getMonth()]
 *  - daysLeft = lastDayOfMonth(d) - d.getDate() + 1 (today counts)
 *
 * Example: `formatPeriodEyebrow(2026-05-09)` → `'VOL.17 / MAY 2026 · 23 ДНЯ'`.
 */
export function formatPeriodEyebrow(d: Date): string {
  const vol = (d.getFullYear() - 2025) * 12 + (d.getMonth() + 1);
  const volStr = pad2(vol);
  const month = MONTHS_EN[d.getMonth()];
  const year = d.getFullYear();
  // new Date(y, m+1, 0) → day-0 of next month = last day of current month.
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  // WR-25-04 (review fix): clamp to 1 so eyebrow can never display a
  // non-positive day count (clock skew, future-dated input, off-by-one).
  // Mirrors HomeMount's `Math.max(1, ...)` and the iOS HomeViewModel
  // counterpart so dailyPace + eyebrow stay perfectly in sync across
  // platforms.
  const daysLeft = Math.max(1, lastDay - d.getDate() + 1);
  return `VOL.${volStr} / ${month} ${year} · ${daysLeft} ${pluralDays(daysLeft)}`;
}

/**
 * Parse a wire DATE (`YYYY-MM-DD`) into a LOCAL-midnight Date.
 *
 * `new Date('2026-05-01')` parses as UTC-midnight, which can roll back to
 * the previous local day east of UTC. We split + construct locally so the
 * eyebrow month/year/day always match the period's wall-clock date.
 */
function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Phase P2 (period switching): build the Home / Transactions period eyebrow
 * from a PeriodRead instead of `new Date()` — so a CLOSED past period shows
 * its OWN month («MAY 2026» while the clock reads June) rather than today's.
 *
 *   `VOL.{NN} / {MONTH} {YYYY} · {N} {ДЕНЬ|ДНЯ|ДНЕЙ}`
 *
 *  - VOL / MONTH / YEAR derive from `period.period_start` (same VOL formula
 *    as formatPeriodEyebrow: (year-2025)*12 + month, pad2).
 *  - daysLeft is computed against `today` (defaults to `new Date()`):
 *      - today inside [start, end]  → end − today + 1 (today counts)
 *      - today  >  end (past/closed) → 0   (no days remain)
 *      - today  <  start (future)    → full period length (start..end inclusive)
 *
 * For the CURRENT active period, `period_start` is the 1st of the active
 * month and `today` lies within the range, so the daysLeft denominator
 * matches formatPeriodEyebrow(today) — current-period output is unchanged.
 */
export function formatPeriodEyebrowFromPeriod(
  period: PeriodRead,
  today: Date = new Date(),
): string {
  const start = parseLocalDate(period.period_start);
  const end = parseLocalDate(period.period_end);
  // Normalize `today` to local midnight so the diff is whole-day clean.
  const todayMid = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );

  const vol = (start.getFullYear() - 2025) * 12 + (start.getMonth() + 1);
  const volStr = pad2(vol);
  const month = MONTHS_EN[start.getMonth()];
  const year = start.getFullYear();

  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  let daysLeft: number;
  if (todayMid.getTime() > end.getTime()) {
    // Past / closed period — nothing remains.
    daysLeft = 0;
  } else if (todayMid.getTime() < start.getTime()) {
    // Future period — the full span (inclusive of both ends).
    daysLeft = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
  } else {
    // Active range — today inclusive.
    daysLeft =
      Math.round((end.getTime() - todayMid.getTime()) / MS_PER_DAY) + 1;
  }

  return `VOL.${volStr} / ${month} ${year} · ${daysLeft} ${pluralDays(daysLeft)}`;
}
