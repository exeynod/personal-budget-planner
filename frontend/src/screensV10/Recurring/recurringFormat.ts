// ADR-0007 — pure formatting helpers for the «регулярные платежи» surfaces.
//
// Deterministic + side-effect-free so they unit-test cleanly and stay in sync
// across the template detail, the home prompt and the cashflow screen.

import type { SubscriptionV10Read } from '../../api/v10';
import { formatMoneyNative } from '../native/money';
import { MONTHS_RU_GENITIVE } from '../common';

/** Russian «раз в N мес» cadence label. */
export function intervalLabel(intervalMonths: number): string {
  if (intervalMonths <= 0) return 'раз в месяц';
  if (intervalMonths === 1) return 'раз в месяц';
  if (intervalMonths === 12) return 'раз в год';
  return `раз в ${intervalMonths} мес`;
}

/** «D числа» day-of-month label, or '' when unset. */
export function dayOfMonthLabel(day: number | null | undefined): string {
  return day == null ? '' : `${day} числа`;
}

/**
 * Compact schedule line for a recurring payment, e.g.
 * «раз в 2 мес, 5 числа · 1 200 ₽». Falls back gracefully when day_of_month is
 * absent.
 */
export function scheduleLabel(sub: SubscriptionV10Read): string {
  const cadence = intervalLabel(sub.interval_months);
  const day = dayOfMonthLabel(sub.day_of_month);
  const head = day ? `${cadence}, ${day}` : cadence;
  return `${head} · ${formatMoneyNative(sub.amount_cents)} ₽`;
}

/** «9 мая» short date from an ISO `YYYY-MM-DD`. */
export function formatShortDate(iso: string): string {
  const parts = iso.split('-').map(Number);
  return `${parts[2]} ${MONTHS_RU_GENITIVE[parts[1] - 1]}`;
}

/** Today as a LOCAL `YYYY-MM-DD` (mirrors NativeDatePicker.todayIsoLocal). */
export function todayIsoLocal(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}
