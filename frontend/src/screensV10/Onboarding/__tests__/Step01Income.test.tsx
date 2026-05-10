// Phase 24-02: Step01Income view + format helper integration tests.
//
// Covers must_haves:
//   - Renders eyebrow «ВВЕДИ СУММУ ПОСЛЕ НАЛОГОВ» + headline mass text
//   - Input value reflects incomeCents (formatted with U+202F thin space)
//   - Typing digits dispatches SET_INCOME with correct cents
//   - Preset chips dispatch SET_INCOME with the preset's cents value
//   - Active preset highlights when incomeCents matches
// Threat coverage:
//   - T-24-02-01: non-digit input chars are stripped before dispatch
//   - T-24-02-02: paste >100M ₽ is clamped to the cap

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { Step01Income } from '../Step01Income';
import { formatRubles, THIN_SPACE } from '../format';

describe('formatRubles', () => {
  it('returns "0" for 0 cents', () => {
    expect(formatRubles(0)).toBe('0');
  });

  it('formats 12_000_000 cents as "120{thin}000"', () => {
    expect(formatRubles(12_000_000)).toBe(`120${THIN_SPACE}000`);
  });

  it('formats 1_234_567_89 cents as "1{thin}234{thin}567"', () => {
    // 123_456_789 cents = 1_234_567.89 ₽ → rounded down to 1_234_567 ₽
    expect(formatRubles(1_234_567_89)).toBe(
      `1${THIN_SPACE}234${THIN_SPACE}567`,
    );
  });

  it('uses U+202F (NARROW NO-BREAK SPACE), not ASCII 0x20', () => {
    const formatted = formatRubles(8_000_000);
    expect(formatted).toBe(`80${THIN_SPACE}000`);
    // Spot-check the actual codepoint to guard against silent regressions.
    expect(formatted.charCodeAt(2)).toBe(0x202f);
  });
});

describe('Step01Income — render', () => {
  it('renders the income headline + sub-eyebrow', () => {
    render(<Step01Income incomeCents={0} dispatch={vi.fn()} />);
    expect(screen.getByText(/Какой доход/)).toBeInTheDocument();
    expect(
      screen.getByText('ВВЕДИ СУММУ ПОСЛЕ НАЛОГОВ'),
    ).toBeInTheDocument();
  });

  it('renders empty input when incomeCents=0', () => {
    render(<Step01Income incomeCents={0} dispatch={vi.fn()} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('renders formatted thin-space value when incomeCents>0', () => {
    render(<Step01Income incomeCents={12_000_000} dispatch={vi.fn()} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe(`120${THIN_SPACE}000`);
  });

  it('renders ₽ suffix', () => {
    render(<Step01Income incomeCents={0} dispatch={vi.fn()} />);
    expect(screen.getByText('₽')).toBeInTheDocument();
  });

  it('renders the 4 preset chips (50/80/120/200K)', () => {
    render(<Step01Income incomeCents={0} dispatch={vi.fn()} />);
    expect(screen.getByText(`50${THIN_SPACE}000 ₽`)).toBeInTheDocument();
    expect(screen.getByText(`80${THIN_SPACE}000 ₽`)).toBeInTheDocument();
    expect(screen.getByText(`120${THIN_SPACE}000 ₽`)).toBeInTheDocument();
    expect(screen.getByText(`200${THIN_SPACE}000 ₽`)).toBeInTheDocument();
  });
});

describe('Step01Income — input change', () => {
  it('dispatches SET_INCOME with cents=value*100 when user types digits', () => {
    const dispatch = vi.fn();
    render(<Step01Income incomeCents={0} dispatch={dispatch} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '120000' } });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_INCOME',
      payload: { income_cents: 12_000_000 },
    });
  });

  it('dispatches SET_INCOME with 0 when input is cleared', () => {
    const dispatch = vi.fn();
    render(<Step01Income incomeCents={5_000_000} dispatch={dispatch} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '' } });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_INCOME',
      payload: { income_cents: 0 },
    });
  });

  it('strips non-digit chars (T-24-02-01: tampering)', () => {
    const dispatch = vi.fn();
    render(<Step01Income incomeCents={0} dispatch={dispatch} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'abc1.2,3 50' } });
    // Digits are 1,2,3,5,0 → 12350 ₽ → 1_235_000 cents
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_INCOME',
      payload: { income_cents: 1_235_000 },
    });
  });

  it('caps display at 100M ₽ (T-24-02-02: very large pasted income)', () => {
    const dispatch = vi.fn();
    render(<Step01Income incomeCents={0} dispatch={dispatch} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    // 1e15 rubles → exceeds 100_000_000 ₽ cap.
    fireEvent.change(input, { target: { value: '1000000000000000' } });
    const last = dispatch.mock.calls.at(-1)?.[0];
    expect(last).toEqual({
      type: 'SET_INCOME',
      payload: { income_cents: 100_000_000_00 },
    });
  });
});

describe('Step01Income — preset chips', () => {
  it('clicking 80 000 ₽ dispatches SET_INCOME with 8_000_000 cents', () => {
    const dispatch = vi.fn();
    render(<Step01Income incomeCents={0} dispatch={dispatch} />);
    fireEvent.click(screen.getByText(`80${THIN_SPACE}000 ₽`));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_INCOME',
      payload: { income_cents: 8_000_000 },
    });
  });

  it('clicking 200 000 ₽ dispatches SET_INCOME with 20_000_000 cents', () => {
    const dispatch = vi.fn();
    render(<Step01Income incomeCents={0} dispatch={dispatch} />);
    fireEvent.click(screen.getByText(`200${THIN_SPACE}000 ₽`));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_INCOME',
      payload: { income_cents: 20_000_000 },
    });
  });

  it('marks the matching preset chip as active', () => {
    const { rerender } = render(
      <Step01Income incomeCents={8_000_000} dispatch={vi.fn()} />,
    );
    const chip80 = screen.getByText(`80${THIN_SPACE}000 ₽`);
    expect(chip80.getAttribute('data-active')).toBe('true');
    // Switching to 50K should swap the active chip.
    rerender(<Step01Income incomeCents={5_000_000} dispatch={vi.fn()} />);
    const chip50 = screen.getByText(`50${THIN_SPACE}000 ₽`);
    expect(chip50.getAttribute('data-active')).toBe('true');
    expect(
      screen.getByText(`80${THIN_SPACE}000 ₽`).getAttribute('data-active'),
    ).toBe('false');
  });
});
