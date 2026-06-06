// Phase 24-02: Step01Income view + format helper.
// Trimmed to 1 happy + 1 invalid path; money (THIN_SPACE / cap / strip) protected.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';
import { Step01Income } from '../Step01Income';
import { formatRubles, THIN_SPACE } from '../format';

afterEach(cleanup);

describe('formatRubles', () => {
  it('groups by U+202F thin space; 0 → "0"', () => {
    expect(formatRubles(0)).toBe('0');
    expect(formatRubles(12_000_000)).toBe(`120${THIN_SPACE}000`);
    const f = formatRubles(8_000_000);
    expect(f).toBe(`80${THIN_SPACE}000`);
    expect(f.charCodeAt(2)).toBe(0x202f); // guard against ASCII-space regression
  });
});

describe('Step01Income — render', () => {
  it('smoke: headline, eyebrow, formatted value, ₽, 4 preset chips', () => {
    render(<Step01Income incomeCents={12_000_000} dispatch={vi.fn()} />);
    expect(screen.getByText(/Какой доход/)).toBeInTheDocument();
    expect(screen.getByText('ВВЕДИ СУММУ ПОСЛЕ НАЛОГОВ')).toBeInTheDocument();
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe(
      `120${THIN_SPACE}000`,
    );
    expect(screen.getByText('₽')).toBeInTheDocument();
    const labels = screen
      .getAllByRole('button', { name: /\d.*₽/ })
      .map((b) => b.textContent ?? '');
    expect(labels).toEqual([
      `50${THIN_SPACE}000 ₽`,
      `80${THIN_SPACE}000 ₽`,
      `120${THIN_SPACE}000 ₽`,
      `200${THIN_SPACE}000 ₽`,
    ]);
  });
});

describe('Step01Income — input', () => {
  it('happy: typing digits dispatches SET_INCOME (value*100)', () => {
    const dispatch = vi.fn();
    render(<Step01Income incomeCents={0} dispatch={dispatch} />);
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '120000' },
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_INCOME',
      payload: { income_cents: 12_000_000 },
    });
  });

  it('invalid: strips non-digits (T-24-02-01) and caps at 100M ₽ (T-24-02-02)', () => {
    const dispatch = vi.fn();
    render(<Step01Income incomeCents={0} dispatch={dispatch} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'abc1.2,3 50' } }); // → 12350 ₽
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_INCOME',
      payload: { income_cents: 1_235_000 },
    });
    fireEvent.change(input, { target: { value: '1000000000000000' } }); // → capped
    const last = dispatch.mock.calls.at(-1)?.[0];
    expect(last).toEqual({
      type: 'SET_INCOME',
      payload: { income_cents: 100_000_000_00 },
    });
  });
});

describe('Step01Income — preset chips', () => {
  function findChip(text: string): HTMLElement {
    const found = screen
      .getAllByRole('button', { name: /\d.*₽/ })
      .find((c) => (c.textContent ?? '') === text);
    if (!found) throw new Error(`chip "${text}" not found`);
    return found;
  }

  it('click dispatches preset cents + marks matching chip active', () => {
    const dispatch = vi.fn();
    const { rerender } = render(
      <Step01Income incomeCents={0} dispatch={dispatch} />,
    );
    fireEvent.click(findChip(`80${THIN_SPACE}000 ₽`));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_INCOME',
      payload: { income_cents: 8_000_000 },
    });
    rerender(<Step01Income incomeCents={8_000_000} dispatch={vi.fn()} />);
    expect(findChip(`80${THIN_SPACE}000 ₽`).getAttribute('data-active')).toBe(
      'true',
    );
    expect(findChip(`50${THIN_SPACE}000 ₽`).getAttribute('data-active')).toBe(
      'false',
    );
  });
});
