import { describe, it, expect } from 'vitest';
import { centsToRublesInput } from './money';

// Etap 4 — the four screen-local copies of `centsToRublesInput` were merged into
// this one helper. Two zero-modes are preserved via the `emptyOnZero` option:
//   - default (true)  → Template / Recurring editors (empty field on zero)
//   - false           → Plan limit input (literal "0" on zero)
describe('centsToRublesInput', () => {
  describe('non-zero amounts (mode-independent)', () => {
    it.each([
      [50_000_00, '50000'],
      [1_155_54, '1155,54'],
      [385_18, '385,18'],
      [1, '0,01'],
      [10, '0,10'], // kopecks are always zero-padded to two digits
      [50, '0,50'],
      // Negatives clamp to 0 → rendered as the zero-mode value (here default → '').
    ])('centsToRublesInput(%i) === %j', (cents, expected) => {
      expect(centsToRublesInput(cents)).toBe(expected);
    });
  });

  describe('zero — emptyOnZero default (true): empty field', () => {
    it('renders 0 as ""', () => {
      expect(centsToRublesInput(0)).toBe('');
      expect(centsToRublesInput(0, {})).toBe('');
      expect(centsToRublesInput(0, { emptyOnZero: true })).toBe('');
    });
    it('clamps negatives to the empty zero-value', () => {
      expect(centsToRublesInput(-1_200_00)).toBe('');
    });
  });

  describe('zero — emptyOnZero: false: literal "0" (Plan limit)', () => {
    it('renders 0 as "0"', () => {
      expect(centsToRublesInput(0, { emptyOnZero: false })).toBe('0');
    });
    it('clamps negatives to "0"', () => {
      expect(centsToRublesInput(-500, { emptyOnZero: false })).toBe('0');
    });
    it('non-zero amounts are unaffected by the mode', () => {
      expect(centsToRublesInput(385_18, { emptyOnZero: false })).toBe('385,18');
    });
  });
});
