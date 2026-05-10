// Phase 25-08 Task 1: pure compute helpers for TransactionsView (TXN-V10-01..05).
//
// Surface:
//   - applyFilterChip(actuals, categories, chip) → ActualV10Read[]
//   - groupByDay(actuals, today) → TxDayGroup[]      (DESC by tx_date; within-group DESC by created_at)
//   - computeHeaderSummary(actuals) → { count, sumCents }   (sumCents = Σ |amount|)
//   - formatTxAmount(cents) → string                  (U+2212 for negatives, U+202F grouping)
//   - tagFor(tx) → 'roundup' | 'deposit' | null      (drives inline plate)
//
// All functions are deterministic, side-effect-free, side-input-free, and
// accept plain JS values so they can be unit-tested without React/jsdom.
//
// Filter-chip mapping (CONTEXT 25-CONTEXT.md §specifics):
//   Все       → no filter (identity)
//   Кафе      → category.code === 'cafe'
//   Продукты  → category.code === 'food'
//   Транспорт → category.code === 'transit'
//   Подписки  → category.code === 'subs'
//   Копилка   → kind in {roundup, deposit}     (CONTEXT D-Defer: subscription-link join skipped for MVP)

import type {
  ActualV10Read,
  CategoryV10,
} from '../../api/v10';
import { formatDay } from '../common/format';
import { formatRubles } from '../Onboarding/format';

// ─────────────────── Types ───────────────────

export type TxFilterChip =
  | 'all'
  | 'cafe'
  | 'food'
  | 'transit'
  | 'subs'
  | 'savings';

export interface TxDayGroup {
  /** Display label produced by formatDay (e.g. 'Сегодня', 'Вчера', '7 мая'). */
  dateLabel: string;
  /** ISO date string (YYYY-MM-DD) for stable React keys + sort ordering. */
  dateKey: string;
  /** Rows in this day group, sorted by created_at DESC. */
  rows: ActualV10Read[];
  /** Σ |amount_cents| across all rows in the group (display-side magnitude). */
  sumCents: number;
}

// ─────────────────── applyFilterChip ───────────────────

/**
 * Filter actuals by chip selection.
 *
 * - `'all'`  → returns the input array unchanged (reference-equal — caller may
 *              compare with `===` to skip useMemo recompute).
 * - `'cafe' | 'food' | 'transit' | 'subs'` → returns rows whose category has
 *              the matching `code`. Rows referencing categories absent from the
 *              `categories` array (orphan / racy fetch) are dropped.
 * - `'savings'` → returns rows where `kind` is `'roundup'` or `'deposit'`.
 *
 * No-op edge: returns a NEW filtered array (never mutates input). The single
 * exception is `'all'` which returns the original reference.
 */
export function applyFilterChip(
  actuals: ReadonlyArray<ActualV10Read>,
  categories: ReadonlyArray<CategoryV10>,
  chip: TxFilterChip,
): ActualV10Read[] {
  if (chip === 'all') {
    // Identity: return the input as a plain array (callers expect ActualV10Read[]).
    return actuals as ActualV10Read[];
  }
  if (chip === 'savings') {
    return actuals.filter((tx) => tx.kind === 'roundup' || tx.kind === 'deposit');
  }
  // chip ∈ { 'cafe' | 'food' | 'transit' | 'subs' } → match by category.code.
  const codeIndex = new Map<number, string | null | undefined>();
  for (const cat of categories) codeIndex.set(cat.id, cat.code);
  return actuals.filter((tx) => codeIndex.get(tx.category_id) === chip);
}

// ─────────────────── groupByDay ───────────────────

/**
 * Group actuals by their `tx_date` (ISO YYYY-MM-DD).
 *
 * Output:
 *  - Groups sorted DESC by dateKey (most recent day first).
 *  - Each group's `rows` sorted DESC by `created_at` (most recent tx first).
 *  - `dateLabel` produced by `formatDay(new Date(tx_date), today)`.
 *  - `sumCents = Σ |amount_cents|` (display-magnitude, ignores sign).
 *
 * Returns a fresh array — never mutates input.
 */
export function groupByDay(
  actuals: ReadonlyArray<ActualV10Read>,
  today: Date,
): TxDayGroup[] {
  if (actuals.length === 0) return [];

  // Bucket by tx_date.
  const buckets = new Map<string, ActualV10Read[]>();
  for (const tx of actuals) {
    const list = buckets.get(tx.tx_date);
    if (list) {
      list.push(tx);
    } else {
      buckets.set(tx.tx_date, [tx]);
    }
  }

  const groups: TxDayGroup[] = [];
  for (const [dateKey, rows] of buckets.entries()) {
    // Sort within-group by created_at DESC (most recent first).
    const sorted = [...rows].sort((a, b) => {
      // Lexicographic comparison of ISO datetime strings is correct for
      // wire-format timestamps (always padded, always UTC offset suffix).
      if (a.created_at > b.created_at) return -1;
      if (a.created_at < b.created_at) return 1;
      return 0;
    });
    let sumCents = 0;
    for (const tx of sorted) sumCents += Math.abs(tx.amount_cents);
    // Build dateLabel via formatDay; tx_date is a date-only ISO string,
    // so construct a Date in local time at midnight (matches `today`'s
    // local calendar comparisons in formatDay's isSameYMD).
    const [y, m, d] = dateKey.split('-').map(Number);
    const localDate = new Date(y, m - 1, d);
    const dateLabel = formatDay(localDate, today);
    groups.push({ dateLabel, dateKey, rows: sorted, sumCents });
  }

  // Sort groups DESC by dateKey (lexicographic on ISO date strings).
  groups.sort((a, b) => {
    if (a.dateKey > b.dateKey) return -1;
    if (a.dateKey < b.dateKey) return 1;
    return 0;
  });

  return groups;
}

// ─────────────────── computeHeaderSummary ───────────────────

/**
 * Header summary for the registry eyebrow «{N} ЗАПИСЕЙ · {Σ ₽}».
 *
 * - `count` = actuals.length (post-filter — caller passes filtered list).
 * - `sumCents` = Σ |amount_cents| (display magnitude, ignores sign so that
 *   roundup deposits and expenses both contribute positively to the total).
 */
export function computeHeaderSummary(
  actuals: ReadonlyArray<ActualV10Read>,
): { count: number; sumCents: number } {
  let sum = 0;
  for (const tx of actuals) sum += Math.abs(tx.amount_cents);
  return { count: actuals.length, sumCents: sum };
}

// ─────────────────── formatTxAmount ───────────────────

/** U+2212 (MINUS SIGN). NOT ASCII '-'. Per DATA-MODEL §5.1. */
const MINUS_SIGN = '−';

/**
 * Format a signed cents amount for transaction-row display.
 *
 *   - 0          → '0 ₽'
 *   - positive   → '+{rubles_with_U+202F} ₽'
 *   - negative   → '{U+2212}{rubles_with_U+202F} ₽'   (NOT ASCII '-')
 *
 * Number grouping is U+202F (NARROW NO-BREAK SPACE) per DATA-MODEL §5.1 —
 * the same separator used by `formatRubles` (Onboarding/format.ts). We
 * delegate to `formatRubles(abs)` for the digit grouping then prepend the
 * sign + append ' ₽'.
 *
 * Examples:
 *   formatTxAmount(0)         → '0 ₽'
 *   formatTxAmount(1000_00)   → '+1{U+202F}000 ₽'
 *   formatTxAmount(-12500_00) → '{U+2212}12{U+202F}500 ₽'
 */
export function formatTxAmount(amount_cents: number): string {
  if (!Number.isFinite(amount_cents) || amount_cents === 0) return '0 ₽';
  const abs = Math.abs(amount_cents);
  const formattedRubles = formatRubles(abs);
  if (amount_cents < 0) {
    return `${MINUS_SIGN}${formattedRubles} ₽`;
  }
  return `+${formattedRubles} ₽`;
}

// ─────────────────── tagFor ───────────────────

/**
 * Inline spec-tag for a transaction row:
 *
 *   - kind 'roundup' → 'roundup'   (yellow plate «↻ ОКРУГЛ.»)
 *   - kind 'deposit' → 'deposit'   (cobalt-on-paper plate «→ КОПИЛКА»)
 *   - else           → null         (no tag)
 *
 * Drives the inline plate inside the row description block (TXN-V10-04).
 */
export function tagFor(tx: ActualV10Read): 'roundup' | 'deposit' | null {
  if (tx.kind === 'roundup') return 'roundup';
  if (tx.kind === 'deposit') return 'deposit';
  return null;
}
