import { describe, it, expect } from 'vitest';
import {
  parseRublesToKopecks,
  parseRublesToKopecksOr0,
  sanitizeMoneyInput,
} from './parseMoney';

describe('parseMoney centralization (P2-10)', () => {
  it('re-exports the canonical validated parser', () => {
    // From the plan: «1 234,56» → 123456, «10» → 1000, «0,1» → 10.
    expect(parseRublesToKopecks('1 234,56')).toBe(123456);
    expect(parseRublesToKopecks('10')).toBe(1000);
    expect(parseRublesToKopecks('0,1')).toBe(10);
    // Strict parser rejects invalid → null.
    expect(parseRublesToKopecks('')).toBeNull();
    expect(parseRublesToKopecks('abc')).toBeNull();
  });

  describe('parseRublesToKopecksOr0 (form-draft wrapper)', () => {
    it.each([
      ['1 234,56', 123456],
      ['10', 1000],
      ['0,1', 10],
      ['500.50', 50050],
      ['', 0],
      ['abc', 0],
      ['0', 0],
    ])('parseRublesToKopecksOr0(%j) === %i', (input, expected) => {
      expect(parseRublesToKopecksOr0(input as string)).toBe(expected);
    });
  });

  describe('sanitizeMoneyInput', () => {
    it.each([
      ['1a2b', '12'],
      ['5.5', '5,5'],
      ['5,567', '5,56'],
      ['1.2.3', '1,23'],
      ['100', '100'],
      ['12,', '12,'],
    ])('sanitizeMoneyInput(%j) === %j', (input, expected) => {
      expect(sanitizeMoneyInput(input as string)).toBe(expected);
    });

    it('output round-trips through the parser without kopeck loss', () => {
      expect(parseRublesToKopecksOr0(sanitizeMoneyInput('1500,50'))).toBe(150050);
      expect(parseRublesToKopecksOr0(sanitizeMoneyInput('0,01'))).toBe(1);
    });
  });
});
