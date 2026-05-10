// Phase 25-10 Task 2: Keypad component — 3×4 numeric keypad with
// callbacks for digit / dot / backspace events.
//
// Test surface:
//   - 12 buttons rendered (1..9 + '.' + '0' + '⌫').
//   - digit click → onAppendDigit('<digit>').
//   - '.' click → onAppendDot().
//   - '⌫' click → onBackspace().
//   - backspace button has accessible aria-label for screen readers.
//
// Note: vitest setup does NOT auto-cleanup — explicit afterEach(cleanup)
// per Plan 25-02 SUMMARY pattern.

import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, fireEvent, cleanup, screen } from '@testing-library/react';
import { Keypad } from '../Keypad';

afterEach(cleanup);

function renderKeypad() {
  const onAppendDigit = vi.fn();
  const onAppendDot = vi.fn();
  const onBackspace = vi.fn();
  const utils = render(
    <Keypad
      onAppendDigit={onAppendDigit}
      onAppendDot={onAppendDot}
      onBackspace={onBackspace}
    />,
  );
  return { ...utils, onAppendDigit, onAppendDot, onBackspace };
}

describe('Keypad', () => {
  it('renders 12 buttons covering 1..9, ., 0, ⌫', () => {
    const { container } = renderKeypad();
    const buttons = container.querySelectorAll('button');
    expect(buttons).toHaveLength(12);
    for (const d of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']) {
      expect(screen.getByRole('button', { name: d })).toBeInTheDocument();
    }
    // Dot and backspace are matched via accessible name (aria-label or text).
    expect(screen.getByRole('button', { name: '.' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /удалить/i }),
    ).toBeInTheDocument();
  });

  it('clicking a digit fires onAppendDigit with that digit', () => {
    const { onAppendDigit, onAppendDot, onBackspace } = renderKeypad();
    fireEvent.click(screen.getByRole('button', { name: '5' }));
    expect(onAppendDigit).toHaveBeenCalledTimes(1);
    expect(onAppendDigit).toHaveBeenCalledWith('5');
    expect(onAppendDot).not.toHaveBeenCalled();
    expect(onBackspace).not.toHaveBeenCalled();
  });

  it('clicking 0 fires onAppendDigit("0")', () => {
    const { onAppendDigit } = renderKeypad();
    fireEvent.click(screen.getByRole('button', { name: '0' }));
    expect(onAppendDigit).toHaveBeenCalledWith('0');
  });

  it('clicking the dot button fires onAppendDot (not digit)', () => {
    const { onAppendDigit, onAppendDot } = renderKeypad();
    fireEvent.click(screen.getByRole('button', { name: '.' }));
    expect(onAppendDot).toHaveBeenCalledTimes(1);
    expect(onAppendDigit).not.toHaveBeenCalled();
  });

  it('clicking the backspace button fires onBackspace', () => {
    const { onBackspace } = renderKeypad();
    fireEvent.click(screen.getByRole('button', { name: /удалить/i }));
    expect(onBackspace).toHaveBeenCalledTimes(1);
  });

  it('exposes role="group" with an aria-label for the keypad', () => {
    renderKeypad();
    expect(
      screen.getByRole('group', { name: /цифровая клавиатура/i }),
    ).toBeInTheDocument();
  });
});
