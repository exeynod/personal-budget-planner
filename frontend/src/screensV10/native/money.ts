// Liquid Glass v2 (native shell) money formatter.
//
// The native iOS design shows kopecks when present (e.g. «1 155,54», «385,18»)
// and whole rubles otherwise (e.g. «50 000»). This differs from the Maximal
// Poster `formatRubles` (Onboarding/format.ts), which floors to whole rubles.
//
// Mirrors the iOS `Money` display: integer part grouped with U+202F (narrow
// no-break space), comma decimal, kopecks only when the remainder is non-zero.

/** Narrow no-break space — U+202F (matches Onboarding THIN_SPACE). */
const THIN_SPACE = ' ';
/** Typographic minus — U+2212. */
const MINUS = '−';

function groupThousands(intStr: string): string {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, THIN_SPACE);
}

/**
 * Format integer cents into a rubles string.
 *
 *  - 50_000_00  → "50 000"
 *  - 1_155_54   → "1 155,54"
 *  - 385_18     → "385,18"
 *  - -1_200_00  → "−1 200"   (typographic minus)
 *  - 0          → "0"
 */
export function formatMoneyNative(cents: number): string {
  if (!Number.isFinite(cents)) return '0';
  const neg = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const rub = Math.floor(abs / 100);
  const kop = abs % 100;
  const rubStr = groupThousands(rub.toString());
  const body =
    kop === 0 ? rubStr : `${rubStr},${kop.toString().padStart(2, '0')}`;
  return neg ? `${MINUS}${body}` : body;
}

/** Signed variant: explicit «+»/«−» prefix (used for delta amounts). */
export function formatSignedMoneyNative(cents: number): string {
  if (cents === 0) return '0';
  const sign = cents > 0 ? '+' : MINUS;
  return `${sign}${formatMoneyNative(Math.abs(cents))}`;
}

/** Convenience: amount + « ₽» suffix. */
export function formatMoneyRubNative(cents: number): string {
  return `${formatMoneyNative(cents)} ₽`;
}
