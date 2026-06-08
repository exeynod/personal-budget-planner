// ADR-0007 — pure helpers for the cashflow projection screen.

import type { CashflowEvent } from '../../api/v10';

export interface CashflowDayGroup {
  /** ISO `YYYY-MM-DD` date key. */
  dateKey: string;
  events: CashflowEvent[];
  /** Running balance after the LAST event of the day (cents). */
  balanceAfterCents: number;
  /** True when the balance goes (or stays) negative at any point in the day. */
  goesNegative: boolean;
}

/**
 * Group cashflow events by date (timeline is chronological from the backend, so
 * we preserve order). The per-day `balanceAfterCents` is the balance after the
 * last event of that day; `goesNegative` flags any negative balance within it.
 */
export function groupCashflowByDay(
  timeline: ReadonlyArray<CashflowEvent>,
): CashflowDayGroup[] {
  const out: CashflowDayGroup[] = [];
  const indexByKey = new Map<string, number>();
  for (const ev of timeline) {
    const key = ev.date;
    let idx = indexByKey.get(key);
    if (idx == null) {
      idx = out.length;
      indexByKey.set(key, idx);
      out.push({
        dateKey: key,
        events: [],
        balanceAfterCents: ev.balance_after_cents,
        goesNegative: false,
      });
    }
    const group = out[idx];
    group.events.push(ev);
    group.balanceAfterCents = ev.balance_after_cents;
    if (ev.balance_after_cents < 0) group.goesNegative = true;
  }
  return out;
}
