// v1.1 planning rework — pure helpers for the month-plan DETAIL surface.
//
// The «Детализация лимита» disclosure per category needs three numbers
// (ladder) and a flat list of planned rows (manual + subscription-derived,
// ONE surface). All math is deterministic + side-effect-free so it unit-tests
// cleanly and stays in sync with the iOS port.

import type { PlannedV11Read } from '../../api/v10';

/** A planned row enriched for the detail list (manual or subscription). */
export interface PlanDetailRow {
  /** planned_transaction id (React key + post/unpost arg). */
  id: number;
  /** Display title (description, fallback «План»). */
  title: string;
  amountCents: number;
  /** ISO date `YYYY-MM-DD` or null (no scheduled day). */
  plannedDate: string | null;
  kind: 'expense' | 'income';
  /** True once posted to a real actual (toggle source for «Провести»/«Отмена»). */
  posted: boolean;
  /** Non-null for subscription-derived rows → post via /subscriptions/{id}. */
  subscriptionId: number | null;
}

/** Per-category ladder: Лимит / Расписано (Σ unposted) / Свободно. */
export interface PlanLadder {
  limitCents: number;
  /** Σ of UNPOSTED planned rows for the category (manual + subscription). */
  scheduledCents: number;
  /** limit − scheduled (may be negative → soft overflow warning). */
  freeCents: number;
  /** True when scheduled > limit (soft warning, not a block). */
  overflow: boolean;
}

/** Group planned rows by category_id for O(1) disclosure lookup. */
export function groupPlannedByCategory(
  planned: ReadonlyArray<PlannedV11Read>,
): Map<number, PlanDetailRow[]> {
  const out = new Map<number, PlanDetailRow[]>();
  for (const p of planned) {
    const row: PlanDetailRow = {
      id: p.id,
      title: p.description?.trim() || 'План',
      amountCents: Math.abs(p.amount_cents),
      plannedDate: p.planned_date,
      kind: p.kind,
      posted: p.posted_txn_id != null,
      subscriptionId: p.subscription_id ?? null,
    };
    const list = out.get(p.category_id);
    if (list) list.push(row);
    else out.set(p.category_id, [row]);
  }
  return out;
}

/** A day-bucket of planned rows for the per-category detail list. */
export interface PlanDayGroup {
  /** ISO `YYYY-MM-DD` key (or `''` for the «без даты» bucket — sorts last). */
  dateKey: string;
  /** Human label («Сегодня» / «7 мая» / «Без даты»). */
  dateLabel: string;
  rows: PlanDetailRow[];
  /** Σ amountCents in the bucket (display magnitude). */
  sumCents: number;
}

/**
 * Group planned rows by their `plannedDate` for the detail list. Rows without a
 * scheduled day fall into a single «Без даты» bucket sorted last. Dated buckets
 * sort DESC by date (newest first), mirroring the fact-side day grouping.
 *
 * `labelFor` maps an ISO date → label (the view passes `formatDay`-bound fn).
 */
export function groupPlannedRowsByDay(
  rows: ReadonlyArray<PlanDetailRow>,
  labelFor: (iso: string) => string,
): PlanDayGroup[] {
  const buckets = new Map<string, PlanDetailRow[]>();
  for (const r of rows) {
    const key = r.plannedDate ?? '';
    const list = buckets.get(key);
    if (list) list.push(r);
    else buckets.set(key, [r]);
  }
  const groups: PlanDayGroup[] = [];
  for (const [dateKey, bucketRows] of buckets.entries()) {
    const sumCents = bucketRows.reduce((s, r) => s + r.amountCents, 0);
    const dateLabel = dateKey === '' ? 'Без даты' : labelFor(dateKey);
    groups.push({ dateKey, dateLabel, rows: bucketRows, sumCents });
  }
  // Dated buckets DESC (newest first); the «без даты» bucket («') sorts last.
  groups.sort((a, b) => {
    if (a.dateKey === '') return 1;
    if (b.dateKey === '') return -1;
    if (a.dateKey > b.dateKey) return -1;
    if (a.dateKey < b.dateKey) return 1;
    return 0;
  });
  return groups;
}

/**
 * Ladder for one category. `scheduled` sums only UNPOSTED rows (posted rows are
 * already fact, so they don't count toward «расписано»).
 */
export function computeLadder(
  limitCents: number,
  rows: ReadonlyArray<PlanDetailRow>,
): PlanLadder {
  const scheduled = rows
    .filter((r) => !r.posted)
    .reduce((s, r) => s + r.amountCents, 0);
  const free = limitCents - scheduled;
  return {
    limitCents,
    scheduledCents: scheduled,
    freeCents: free,
    overflow: scheduled > limitCents,
  };
}

/**
 * Per-category INCOME ladder. Income is planned (not capped): «План» is the
 * expected amount, never a limit. There is NO «free»/«overflow» — the income
 * sign convention is «больше = хорошо» (delta = Факт − План).
 *
 *   planCents      — expected income for the category (category.plan_cents).
 *   scheduledCents — Σ of UNPOSTED income planned rows («Запланировано»).
 *   receivedCents  — Σ of POSTED income planned rows («Получено» / факт дохода).
 *   remainingCents — План − Получено: «Осталось получить» when ≥ 0; when
 *                    negative we surface «Сверх плана» (received exceeds plan).
 *   overReceived   — true when Получено > План (good — beats the plan).
 */
export interface IncomeLadder {
  planCents: number;
  scheduledCents: number;
  receivedCents: number;
  remainingCents: number;
  overReceived: boolean;
}

export function computeIncomeLadder(
  planCents: number,
  rows: ReadonlyArray<PlanDetailRow>,
): IncomeLadder {
  const scheduled = rows
    .filter((r) => !r.posted)
    .reduce((s, r) => s + r.amountCents, 0);
  const received = rows
    .filter((r) => r.posted)
    .reduce((s, r) => s + r.amountCents, 0);
  const remaining = planCents - received;
  return {
    planCents,
    scheduledCents: scheduled,
    receivedCents: received,
    remainingCents: remaining,
    overReceived: received > planCents,
  };
}

/**
 * Collect the planned-row ids that are due for bulk-posting: every UNPOSTED,
 * NON-subscription (manual) row across all categories. Subscription rows post
 * via their own endpoint and are returned separately by `subscriptionPostIds`.
 */
export function bulkPostManualIds(
  planned: ReadonlyArray<PlannedV11Read>,
): number[] {
  return planned
    .filter((p) => p.posted_txn_id == null && p.source !== 'subscription_auto')
    .map((p) => p.id);
}

/**
 * Subscription ids of UNPOSTED subscription-derived planned rows — posted one
 * by one via /subscriptions/{id}/post during the bulk action.
 */
export function bulkPostSubscriptionIds(
  planned: ReadonlyArray<PlannedV11Read>,
): number[] {
  const ids: number[] = [];
  for (const p of planned) {
    if (
      p.posted_txn_id == null &&
      p.source === 'subscription_auto' &&
      p.subscription_id != null
    ) {
      ids.push(p.subscription_id);
    }
  }
  return ids;
}
