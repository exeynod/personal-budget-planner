// Phase 24-02: Onboarding-local money formatter using U+202F (NARROW
// NO-BREAK SPACE) per DATA-MODEL §5.1.
//
// Distinct from `frontend/src/hooks/useCountUp.ts:fmtThousands`, which
// uses an ASCII 0x20 separator — onboarding screens require the
// typographic thin space so digit groups never wrap mid-number.

/** Narrow no-break space — U+202F. Exported for tests + downstream UI. */
export const THIN_SPACE = ' ';

/** Display cap on income input (Step 01) — 100M ₽ = 100_000_000_00 cents. */
export const INCOME_DISPLAY_CAP_CENTS = 100_000_000_00;

/**
 * Format integer cents into rubles with U+202F thousand-grouping.
 * Floors any sub-ruble remainder (rubles only — no decimal output).
 *
 * Examples:
 *  - 0 → "0"
 *  - 12_000_00 → "12 000"   (with U+202F)
 *  - 12_000_000 → "120 000" (with U+202F)
 */
export function formatRubles(cents: number): string {
  if (!Number.isFinite(cents) || cents <= 0) return '0';
  const rubles = Math.floor(cents / 100);
  return rubles.toString().replace(/\B(?=(\d{3})+(?!\d))/g, THIN_SPACE);
}

/**
 * Parse user-typed string (digits only after stripping) into integer cents.
 * Caps at `INCOME_DISPLAY_CAP_CENTS` (T-24-02-02).
 *
 * Returns 0 for empty / no-digit input — caller dispatches SET_INCOME
 * with that value, which the reducer clamps to ≥0 anyway.
 */
export function parseIncomeInputToCents(raw: string): number {
  const digits = raw.replace(/\D/g, '');
  if (digits === '') return 0;
  // Use BigInt to safely multiply — `1e15 * 100` overflows MAX_SAFE_INTEGER.
  let cents: number;
  try {
    const big = BigInt(digits) * 100n;
    cents = big > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(big);
  } catch {
    cents = 0;
  }
  if (cents > INCOME_DISPLAY_CAP_CENTS) return INCOME_DISPLAY_CAP_CENTS;
  return cents;
}
