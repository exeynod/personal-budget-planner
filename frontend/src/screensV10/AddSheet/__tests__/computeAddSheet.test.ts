// Phase 25-10 Task 1: pure compute helpers for the AddSheet keypad +
// CTA state machine + date-chip resolver.
//
// Boundary-focused suite: one assertion per behaviour (empty / zero /
// max / sign), money correctness protected.

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
  it('appends, replaces leading zero, caps at 2 decimals', () => {
    expect(appendDigit('', '5')).toBe('5');
    expect(appendDigit('0', '5')).toBe('5'); // no leading zeros
    expect(appendDigit('5', '0')).toBe('50');
    expect(appendDigit('5.', '5')).toBe('5.5');
    expect(appendDigit('5.50', '1')).toBe('5.50'); // 2-decimal cap
  });
});

describe('appendDot', () => {
  it('inserts a dot once; empty → "0."', () => {
    expect(appendDot('')).toBe('0.');
    expect(appendDot('5')).toBe('5.');
    expect(appendDot('5.5')).toBe('5.5'); // idempotent
  });
});

describe('backspace', () => {
  it('trims tail incl. dot; empty stays empty', () => {
    expect(backspace('5.50')).toBe('5.5');
    expect(backspace('5.')).toBe('5');
    expect(backspace('5')).toBe('');
    expect(backspace('')).toBe('');
  });
});

describe('parseAmountToCents', () => {
  it('converts to kopeks across the decimal/zero/empty range', () => {
    expect(parseAmountToCents('5')).toBe(500);
    expect(parseAmountToCents('5.5')).toBe(550);
    expect(parseAmountToCents('0.05')).toBe(5);
    expect(parseAmountToCents('5.')).toBe(500);
    expect(parseAmountToCents('')).toBe(0);
  });

  it('rejects non-numeric / negative input', () => {
    expect(() => parseAmountToCents('5x')).toThrow();
    expect(() => parseAmountToCents('-5')).toThrow();
    expect(() => parseAmountToCents('5.5.5')).toThrow();
  });
});

describe('ctaState', () => {
  it('walks empty → no-cat → no-account → ready (gates ordered)', () => {
    expect(ctaState(0, 12)).toBe('empty');
    expect(ctaState(500, null)).toBe('no-cat');
    expect(ctaState(500, 12, null)).toBe('no-account');
    expect(ctaState(500, 12, 7)).toBe('ready');
    expect(ctaState(500, 12)).toBe('ready'); // legacy 2-arg
    expect(ctaState(500, null, null)).toBe('no-cat'); // cat gate first
  });
});

describe('defaultDateForChip', () => {
  it('resolves today / yesterday (with rollover) / custom', () => {
    const d = new Date(2026, 4, 9, 14, 30); // 2026-05-09
    expect(defaultDateForChip('today', d)).toBe('2026-05-09');
    expect(defaultDateForChip('yesterday', d)).toBe('2026-05-08');
    expect(defaultDateForChip('yesterday', new Date(2026, 0, 1))).toBe(
      '2025-12-31',
    );
    expect(defaultDateForChip('custom', d)).toBeNull();
  });
});
