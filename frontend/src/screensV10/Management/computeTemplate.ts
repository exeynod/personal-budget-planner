// Pure helpers for the TEMPLATE management surface (overview + per-category
// detail). The template mirrors the PLAN, but its recurring «lines» schedule by
// a DAY-OF-MONTH (1..27) instead of a calendar date — so this is the template
// analogue of Plan/computePlan*.ts, kept self-contained under Management/.
//
// All math is deterministic + side-effect-free (sums of line amounts per
// category) so it reads identically to the plan-side helpers and stays easy to
// reason about.

import type { TemplateItemRead, TemplateLineRead } from '../../api/template';

/** Valid day-of-month range for a template line (server constraint). */
export const TEMPLATE_DAY_MIN = 1;
export const TEMPLATE_DAY_MAX = 27;

/** Map category_id → template limit (cents). Missing categories default to 0. */
export function limitByCategory(
  items: ReadonlyArray<TemplateItemRead>,
): Map<number, number> {
  return new Map(items.map((it) => [it.category_id, it.limit_cents]));
}

/**
 * Σ of template line amounts per category id («Запланировано» summary). Used by
 * the overview rows (expense → «Лимит X · Запланировано Y», income → «Y») and
 * the per-category detail hero number.
 */
export function scheduledByCategory(
  lines: ReadonlyArray<TemplateLineRead>,
): Map<number, number> {
  const out = new Map<number, number>();
  for (const l of lines) {
    out.set(l.category_id, (out.get(l.category_id) ?? 0) + l.amount_cents);
  }
  return out;
}

/** This category's lines, sorted by day-of-month (nulls last, then by id). */
export function linesForCategory(
  lines: ReadonlyArray<TemplateLineRead>,
  categoryId: number,
): TemplateLineRead[] {
  return lines
    .filter((l) => l.category_id === categoryId)
    .sort((a, b) => {
      const da = a.day_of_period;
      const db = b.day_of_period;
      if (da == null && db == null) return a.id - b.id;
      if (da == null) return 1; // nulls last
      if (db == null) return -1;
      if (da !== db) return da - db;
      return a.id - b.id;
    });
}

/** Σ amount of a set of template lines (cents). */
export function sumLines(lines: ReadonlyArray<TemplateLineRead>): number {
  return lines.reduce((s, l) => s + l.amount_cents, 0);
}

/**
 * «N-е число» day-of-month label, or «без дня» when the line has no scheduled
 * day. (Template lines schedule by day-of-month, not a calendar date.)
 */
export function dayOfMonthLabel(day: number | null): string {
  return day == null ? 'без дня' : `${day}-е число`;
}

/**
 * Clamp a parsed day-of-month to the valid template range [1..27], or `null`
 * when unset/invalid. Used to normalise the day input on commit.
 */
export function clampTemplateDay(day: number | null): number | null {
  if (day == null || !Number.isFinite(day)) return null;
  const n = Math.trunc(day);
  if (n < TEMPLATE_DAY_MIN) return TEMPLATE_DAY_MIN;
  if (n > TEMPLATE_DAY_MAX) return TEMPLATE_DAY_MAX;
  return n;
}
