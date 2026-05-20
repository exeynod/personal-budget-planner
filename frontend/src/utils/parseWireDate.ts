/**
 * parseWireDate — local-time parser for wire DATE strings (P2-9 / FE-F6).
 *
 * Problem: `new Date("YYYY-MM-DD")` is spec'd to parse as UTC midnight. In a
 * positive-offset timezone (e.g. Europe/Moscow, UTC+3) the resulting `Date`,
 * when read via local accessors (`getDate()`, `getMonth()`), can land on the
 * PREVIOUS day — an off-by-one on business dates.
 *
 * Fix: detect a bare `YYYY-MM-DD` and build the Date from local components
 * (`new Date(y, m - 1, d)`), which is midnight in the LOCAL zone. Full ISO
 * timestamps (with `T`/time/zone) are left to the native `new Date(s)` since
 * those already carry explicit zone semantics.
 *
 * BIGINT-cents discipline does not apply here — this is date-only.
 */

const WIRE_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parse a wire DATE string into a local-time `Date`.
 *
 * - `"YYYY-MM-DD"` → local midnight of that calendar day (no UTC shift).
 * - anything else (full ISO, etc.) → native `new Date(s)`.
 * - empty / nullish → an Invalid Date (callers already guard via `isNaN`).
 */
export function parseWireDate(s: string | null | undefined): Date {
  if (s == null || s === '') return new Date(NaN);
  const m = WIRE_DATE_RE.exec(s);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    return new Date(year, month - 1, day);
  }
  return new Date(s);
}
