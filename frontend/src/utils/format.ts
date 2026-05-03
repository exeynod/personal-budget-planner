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
 * - "1500" → 150000
 * - "1500,50" → 150050
 * - "1 500" → 150000
 * - "" / "abc" / "0" / "-50" → null (zero/negative not allowed)
 */
export function parseRublesToKopecks(input: string): number | null {
  const cleaned = input.replace(/\s/g, '').replace(',', '.');
  if (cleaned === '') return null;
  const f = parseFloat(cleaned);
  if (isNaN(f) || !isFinite(f) || f <= 0) return null;
  return Math.round(f * 100);
}
