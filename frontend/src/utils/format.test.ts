import { describe, it, expect } from 'vitest';
import { parseRublesToKopecks, formatKopecks, formatKopecksWithCurrency } from './format';

describe('parseRublesToKopecks (CODE-01)', () => {
  describe('valid inputs', () => {
    it.each([
      ['1500', 150000],
      ['1500,50', 150050],
      ['1500.50', 150050],
      ['1 500', 150000],
      ['1 000.5', 100050],
      ['1 000,5', 100050],
      ['100,50', 10050],
      ['0.01', 1],
      ['0,01', 1],
      ['0.1', 10],
      ['1', 100],
      ['9999999.99', 999999999],
    ])('parses %j → %i kopecks', (input, expected) => {
      expect(parseRublesToKopecks(input)).toBe(expected);
    });
  });

  describe('invalid inputs return null', () => {
    it.each([
      ['', 'empty'],
      ['abc', 'letters'],
      ['1.2.3', 'multi-dot'],
      ['-50', 'negative'],
      ['0', 'zero'],
      ['0.00', 'zero with decimals'],
      ['0,00', 'zero with comma decimals'],
      ['0.001', '3+ fractional digits per money invariant'],
      ['100.123', '3+ fractional'],
      ['1,234,567', 'comma as thousand-sep (NOT supported, ru-RU uses space)'],
      ['+100', 'leading plus sign'],
      ['1e5', 'scientific notation'],
      ['Infinity', 'infinity literal'],
      ['NaN', 'NaN literal'],
      ['  ', 'only whitespace'],
    ])('rejects %j (%s) → null', (input) => {
      expect(parseRublesToKopecks(input)).toBeNull();
    });
  });
});

describe('formatKopecks (smoke — no regress)', () => {
  it('formats simple int', () => {
    expect(formatKopecks(420000)).toMatch(/4\s200/);
  });
  it('appends currency', () => {
    expect(formatKopecksWithCurrency(420000)).toMatch(/4\s200\s₽/);
  });
});
