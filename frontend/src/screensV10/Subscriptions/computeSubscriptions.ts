// Phase 26-06 Task 1: pure compute helpers for SubscriptionsView (SUBS-V10-01..04).
//
// Surface (5 helpers, all pure / deterministic / side-effect-free):
//   - computeActiveCount(subs) → number of active subscriptions
//   - computeMonthlyTotal(subs) → Σ amount_cents WHERE is_active=true AND cycle='monthly'
//   - computeYearlyTotalAnnualized(subs) → annualized total in cents
//       = monthlyTotal * 12 + Σ (yearly active amounts)
//   - formatCadenceRu(sub) → human-readable Russian cadence string:
//       monthly + day_of_month → «каждое N число»
//       monthly без day_of_month → «ежемесячно»
//       yearly с valid date → «N {month_genitive}» (e.g. «15 мая»)
//       yearly с invalid date → «ежегодно»
//   - sortForDisplay(subs) → active first, amount DESC, name ASC (locale: 'ru')
//
// Mirrors iOS SubscriptionsData.swift (Plan 26-07) — must produce identical numbers.

import type { SubscriptionV10Read } from '../../api/v10';
import { MONTHS_RU_GENITIVE } from '../common';

/** Number of subscriptions where `is_active === true`. */
export function computeActiveCount(subs: SubscriptionV10Read[]): number {
  return subs.filter((s) => s.is_active).length;
}

/** Σ amount_cents over active monthly subscriptions. */
export function computeMonthlyTotal(subs: SubscriptionV10Read[]): number {
  return subs
    .filter((s) => s.is_active && s.cycle === 'monthly')
    .reduce((sum, s) => sum + s.amount_cents, 0);
}

/**
 * Annualized total cents: monthly * 12 + Σ yearly active amounts.
 * Used for the eyebrow «N АКТИВНЫХ · Y ₽ В ГОД» (SUBS-V10-01).
 */
export function computeYearlyTotalAnnualized(
  subs: SubscriptionV10Read[],
): number {
  const monthlyAnnual = computeMonthlyTotal(subs) * 12;
  const yearlySum = subs
    .filter((s) => s.is_active && s.cycle === 'yearly')
    .reduce((sum, s) => sum + s.amount_cents, 0);
  return monthlyAnnual + yearlySum;
}

/**
 * Human-readable charging cadence in Russian for a row sub-line (SUBS-V10-02).
 *
 * - monthly + day_of_month → «каждое N число»
 * - monthly без day_of_month → «ежемесячно» (защита от schema-gap nullable)
 * - yearly с valid `next_charge_date` → «N {month_genitive}» (e.g. «15 мая»)
 * - yearly с invalid date → «ежегодно» (defensive fallback)
 */
export function formatCadenceRu(sub: SubscriptionV10Read): string {
  if (sub.cycle === 'monthly') {
    const day = sub.day_of_month;
    if (day != null) return `каждое ${day} число`;
    return 'ежемесячно';
  }
  // yearly — parse next_charge_date «YYYY-MM-DD»
  const d = new Date(sub.next_charge_date);
  if (Number.isNaN(d.getTime())) return 'ежегодно';
  return `${d.getDate()} ${MONTHS_RU_GENITIVE[d.getMonth()]}`;
}

/**
 * Stable display ordering: active first, then amount DESC, then name ASC.
 * Returns a new array — does not mutate input.
 */
export function sortForDisplay(
  subs: SubscriptionV10Read[],
): SubscriptionV10Read[] {
  return [...subs].sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
    if (a.amount_cents !== b.amount_cents) return b.amount_cents - a.amount_cents;
    return a.name.localeCompare(b.name, 'ru');
  });
}
