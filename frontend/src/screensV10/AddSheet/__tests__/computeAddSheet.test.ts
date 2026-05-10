// Phase 25-10 Task 1: pure compute helpers for the AddSheet keypad +
// CTA state machine + date-chip resolver.
//
// All helpers are deterministic and dependency-free so they can be
// unit-tested without React / jsdom / network.
//
// Coverage:
//   - appendDigit: state-machine for the integer + decimal parts of the
//     amount-string, with leading-zero guard and 2-decimal cap.
//   - appendDot: idempotent dot insertion, '' → '0.', '5' → '5.'.
//   - backspace: tail-trim, including dot.
//   - parseAmountToCents: '5.50' → 550, '5' → 500, '5.' → 500, '0.05' → 5,
//     '' → 0; rejects non-digit characters with a thrown Error.
//   - ctaState: empty / no-cat / ready transitions.
//   - defaultDateForChip: today / yesterday / custom (null) ISO strings.

import { describe, it, expect } from 'vitest';
import {
  appendDigit,
  appendDot,
  backspace,
  parseAmountToCents,
  ctaState,
  defaultDateForChip,
} from '../computeAddSheet';

describe('appendDigit', () => {
  it('appends to an empty string', () => {
    expect(appendDigit('', '5')).toBe('5');
  });

  it('replaces the leading 0 (no leading zeros allowed)', () => {
    expect(appendDigit('0', '5')).toBe('5');
  });

  it('keeps the leading 0 when input starts decimal mode (0 + .)', () => {
    // '0' + '.' is handled by appendDot, not appendDigit; here we just
    // assert appendDigit does not transform '0' when followed by another 0.
    expect(appendDigit('0', '0')).toBe('0');
  });

  it('appends additional integer digits', () => {
    expect(appendDigit('5', '0')).toBe('50');
    expect(appendDigit('50', '0')).toBe('500');
  });

  it('appends a single decimal digit after the dot', () => {
    expect(appendDigit('5.', '5')).toBe('5.5');
  });

  it('appends two decimal digits', () => {
    expect(appendDigit('5.5', '0')).toBe('5.50');
  });

  it('refuses a third decimal digit (cap at 2)', () => {
    expect(appendDigit('5.50', '1')).toBe('5.50');
    expect(appendDigit('0.99', '9')).toBe('0.99');
  });
});

describe('appendDot', () => {
  it('on empty input → "0."', () => {
    expect(appendDot('')).toBe('0.');
  });

  it('on integer input → "{int}."', () => {
    expect(appendDot('5')).toBe('5.');
    expect(appendDot('123')).toBe('123.');
  });

  it('idempotent: dot already present → unchanged', () => {
    expect(appendDot('5.')).toBe('5.');
    expect(appendDot('5.5')).toBe('5.5');
    expect(appendDot('5.50')).toBe('5.50');
  });
});

describe('backspace', () => {
  it('removes the last character', () => {
    expect(backspace('123')).toBe('12');
    expect(backspace('5.50')).toBe('5.5');
  });

  it('removes the dot when it is the trailing character', () => {
    expect(backspace('5.')).toBe('5');
  });

  it('on single-char input → empty', () => {
    expect(backspace('5')).toBe('');
  });

  it('on empty input → empty (no throw)', () => {
    expect(backspace('')).toBe('');
  });
});

describe('parseAmountToCents', () => {
  it('integer-only inputs → cents (× 100)', () => {
    expect(parseAmountToCents('5')).toBe(500);
    expect(parseAmountToCents('100')).toBe(10_000);
  });

  it('with one decimal digit → tens of kopeks', () => {
    expect(parseAmountToCents('5.5')).toBe(550);
  });

  it('with two decimal digits → exact kopeks', () => {
    expect(parseAmountToCents('5.50')).toBe(550);
    expect(parseAmountToCents('0.05')).toBe(5);
  });

  it('trailing dot → integer cents only', () => {
    expect(parseAmountToCents('5.')).toBe(500);
  });

  it('zero / empty → 0 cents', () => {
    expect(parseAmountToCents('0')).toBe(0);
    expect(parseAmountToCents('')).toBe(0);
  });

  it('rejects non-numeric characters with a thrown Error', () => {
    expect(() => parseAmountToCents('5x')).toThrow();
    expect(() => parseAmountToCents('-5')).toThrow();
    expect(() => parseAmountToCents('5.5.5')).toThrow();
  });
});

describe('ctaState', () => {
  it('amount===0 → "empty" regardless of category', () => {
    expect(ctaState(0, null)).toBe('empty');
    expect(ctaState(0, 12)).toBe('empty');
  });

  it('amount>0 + no category → "no-cat"', () => {
    expect(ctaState(500, null)).toBe('no-cat');
  });

  it('amount>0 + category set (legacy 2-arg) → "ready"', () => {
    // Legacy 2-arg call: omits the WR-25-01 account gate. Should still
    // work for non-v1.0 callers.
    expect(ctaState(500, 12)).toBe('ready');
  });

  it('amount>0 + category=0 falls through to "ready" (0 is a valid id)', () => {
    // Category id 0 is technically permitted by the type signature; the
    // helper does NOT special-case it. Ids in real responses start at 1
    // (Postgres SERIAL), so this is theoretical defensive behaviour.
    expect(ctaState(500, 0)).toBe('ready');
  });

  // WR-25-01 (review fix): account-gating overload.
  it('amount>0 + category set + accountId=null → "no-account"', () => {
    expect(ctaState(500, 12, null)).toBe('no-account');
  });

  it('amount>0 + category set + accountId set → "ready"', () => {
    expect(ctaState(500, 12, 7)).toBe('ready');
  });

  it('account gate applies AFTER the cat gate', () => {
    // No category trumps no account in the state machine.
    expect(ctaState(500, null, null)).toBe('no-cat');
  });
});

describe('defaultDateForChip', () => {
  it('"today" → ISO YYYY-MM-DD of today', () => {
    const today = new Date(2026, 4, 9, 14, 30); // 2026-05-09 14:30 local
    expect(defaultDateForChip('today', today)).toBe('2026-05-09');
  });

  it('"yesterday" → today − 1d', () => {
    const today = new Date(2026, 4, 9, 14, 30); // 2026-05-09 → 2026-05-08
    expect(defaultDateForChip('yesterday', today)).toBe('2026-05-08');
  });

  it('"yesterday" handles month rollover', () => {
    const today = new Date(2026, 4, 1, 14, 30); // 2026-05-01 → 2026-04-30
    expect(defaultDateForChip('yesterday', today)).toBe('2026-04-30');
  });

  it('"yesterday" handles year rollover', () => {
    const today = new Date(2026, 0, 1, 14, 30); // 2026-01-01 → 2025-12-31
    expect(defaultDateForChip('yesterday', today)).toBe('2025-12-31');
  });

  it('"custom" → null (caller supplies its own date)', () => {
    const today = new Date(2026, 4, 9);
    expect(defaultDateForChip('custom', today)).toBeNull();
  });
});
