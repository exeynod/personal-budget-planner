/**
 * Money formatting helpers — central utility used by Phase 5 dashboard
 * components (HeroCard, AggrStrip, DashboardCategoryRow). New components
 * import from here; existing PlanRow/PlanItemEditor/ActualEditor inline
 * formatters are NOT refactored in this plan (deferred).
 *
 * All amounts are kopecks (BIGINT in DB, number in JS — within
 * Number.MAX_SAFE_INTEGER for amounts up to ~90 trillion rubles).
 * Formatting uses ru-RU locale: nbsp thousands separator, comma decimal.
 */

/**
 * Format kopecks as a Russian-localised number string (no currency, no sign).
 * Examples: 0 → "0", 420000 → "4 200", -150050 → "-1 500,5", 1234567 → "12 345,67".
 */
export function formatKopecks(cents: number): string {
  const rubles = cents / 100;
  return rubles.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
}

/**
 * Format kopecks with leading sign (+ or −). Zero rendered as "0" without sign.
 * Examples: 0 → "0", 420000 → "+4 200", -150000 → "-1 500".
 * Used for delta values where sign carries semantic meaning (D-02 sign rule).
 */
export function formatKopecksWithSign(cents: number): string {
  if (cents === 0) return '0';
  const sign = cents > 0 ? '+' : '';
  // toLocaleString already prefixes minus for negatives.
  return sign + formatKopecks(cents);
}

/**
 * Format kopecks with currency symbol. Examples: 420000 → "4 200 ₽".
 * Used in hero card and aggr strip totals where ₽ is part of the visual.
 */
export function formatKopecksWithCurrency(cents: number): string {
  return formatKopecks(cents) + ' ₽';
}

/**
 * Parse user-typed rubles string into kopecks integer. Returns null on invalid.
 *
 * Decimal-grade digit-walk parser (NO parseFloat — IEEE 754 loses precision
 * on round kopeck amounts). Money invariant per CLAUDE.md: «no float, BIGINT
 * копейки».
 *
 * Accepts:
 *  - `"1500"` → 150000
 *  - `"1500,50"` → 150050  (comma decimal — ru-RU)
 *  - `"1500.50"` → 150050  (dot decimal)
 *  - `"1 500"` → 150000    (nbsp/space thousand-sep, ignored)
 *  - `"0.01"` → 1          (smallest positive kopek)
 *
 * Rejects (returns null):
 *  - `""` (empty)
 *  - `"abc"` / mixed letters
 *  - `"-50"` (negative — money invariant)
 *  - `"0"` / `"0.00"` (must be > 0)
 *  - `"0.001"` (3+ fractional digits — refuse, not round)
 *  - `"1.2.3"` (multiple separators)
 */
export function parseRublesToKopecks(input: string): number | null {
  // Strip whitespace (incl. nbsp  ); normalise comma → dot.
  const cleaned = input.replace(/[\s ]/g, '').replace(',', '.');
  if (cleaned === '') return null;
  // Reject negative / non-digit prefix.
  if (!/^[0-9.]+$/.test(cleaned)) return null;

  const parts = cleaned.split('.');
  if (parts.length > 2) return null; // multiple dots
  const [intPart, fracPart = ''] = parts;
  if (intPart === '' && fracPart === '') return null;
  if (intPart !== '' && !/^[0-9]+$/.test(intPart)) return null;
  // Fractional part: 0..2 digits (3+ → reject per money invariant).
  if (!/^[0-9]{0,2}$/.test(fracPart)) return null;

  const intVal = intPart === '' ? 0 : parseInt(intPart, 10);
  const fracVal = parseInt((fracPart || '0').padEnd(2, '0'), 10);
  const kopecks = intVal * 100 + fracVal;
  return kopecks > 0 ? kopecks : null;
}
