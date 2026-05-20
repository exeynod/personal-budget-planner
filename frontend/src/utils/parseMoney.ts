/**
 * parseMoney — the single home for rubles→kopecks input parsing (P2-10 / FE-F7).
 *
 * The strict, validated parser already lives in `format.ts`
 * (`parseRublesToKopecks → number | null`, rejecting bad input) and is the
 * canonical money parser — this module re-exports it so callers have ONE
 * import site, and adds the two sheet-facing helpers that previously existed as
 * divergent ad-hoc `parseInt(x, 10) * 100` snippets (which silently dropped
 * kopecks):
 *
 *   - `parseRublesToKopecks` — re-export of the canonical validated parser.
 *   - `parseRublesToKopecksOr0` — same parser, but maps invalid/empty → 0 for
 *     form drafts that gate save validity separately.
 *   - `sanitizeMoneyInput` — onChange filter so the field only holds something
 *     the parser can read back losslessly (digits + one comma + ≤2 decimals).
 *
 * BIGINT-cents discipline (CLAUDE.md: «Никаких float» for storage) — rounding
 * to integer kopecks happens here, once.
 */
export { parseRublesToKopecks } from './format';
import { parseRublesToKopecks as parseStrict } from './format';

/**
 * Sanitize a free-text money input to digits + at most one decimal separator
 * (normalized to a comma) and at most two fractional digits. Use in `onChange`
 * so the field only ever holds something the parser can read back losslessly.
 *
 * Examples:
 *   sanitizeMoneyInput('1a2b')   → '12'
 *   sanitizeMoneyInput('5.5')    → '5,5'
 *   sanitizeMoneyInput('5,567')  → '5,56'
 *   sanitizeMoneyInput('1.2.3')  → '1,23'
 */
export function sanitizeMoneyInput(raw: string): string {
  // Keep digits and separators only; normalize comma → dot for processing.
  const kept = raw.replace(/[^0-9.,]/g, '').replace(/,/g, '.');
  const firstDot = kept.indexOf('.');
  if (firstDot === -1) return kept;
  const intPart = kept.slice(0, firstDot);
  // Drop any further separators in the fractional part; cap to 2 digits.
  const fracPart = kept.slice(firstDot + 1).replace(/\./g, '').slice(0, 2);
  return `${intPart},${fracPart}`;
}

/**
 * Convenience wrapper for form drafts: parse rubles → integer kopecks, mapping
 * empty/invalid/zero to `0` (the canonical parser returns `null` there). Save
 * buttons gate on a separate `isValid*Draft` check, so `0` is a safe sentinel.
 */
export function parseRublesToKopecksOr0(raw: string): number {
  return parseStrict(raw) ?? 0;
}
