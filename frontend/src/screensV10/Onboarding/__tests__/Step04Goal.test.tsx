// Phase 24-08: Step04Goal view + isGoalValid helper integration tests.
//
// Covers must_haves:
//   - Renders «Зачем копишь?» Mass italic headline + sub-eyebrow «МОЖНО ПРОПУСТИТЬ И НАСТРОИТЬ ПОЗЖЕ»
//   - Goal name input + amount input + optional due date input
//   - Typing name + amount dispatches SET_GOAL with full goal object
//   - Due date input has min attribute equal to todayPlusOne (YYYY-MM-DD)
//   - isGoalValid: null → false; bad shapes → false; {name:'X', target_cents:1} → true
// Threat coverage:
//   - T-24-08-01: maxLength=80 on name input
//   - T-24-08-02: min attr on due date input
//
// Skip path is wired by OnboardingFlow chrome (`onSkip` prop) — covered in
// the integration assertions on the chrome's ПРОПУСТИТЬ button.

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  render,
  fireEvent,
  screen,
  cleanup,
} from '@testing-library/react';
import { Step04Goal, isGoalValid, todayPlusOneISO } from '../Step04Goal';

afterEach(cleanup);

describe('isGoalValid', () => {
  it('returns false for null', () => {
    expect(isGoalValid(null)).toBe(false);
  });

  it('returns false for empty name', () => {
    expect(isGoalValid({ name: '', target_cents: 100 })).toBe(false);
  });

  it('returns false for whitespace-only name', () => {
    expect(isGoalValid({ name: '   ', target_cents: 100 })).toBe(false);
  });

  it('returns false for zero target', () => {
    expect(isGoalValid({ name: 'X', target_cents: 0 })).toBe(false);
  });

  it('returns false for negative target', () => {
    expect(isGoalValid({ name: 'X', target_cents: -1 })).toBe(false);
  });

  it('returns true for {name:"X", target_cents:1}', () => {
    expect(isGoalValid({ name: 'X', target_cents: 1 })).toBe(true);
  });

  it('returns true for valid goal with due', () => {
    expect(
      isGoalValid({ name: 'Грузия', target_cents: 200_000_00, due: '2030-01-01' }),
    ).toBe(true);
  });
});

describe('todayPlusOneISO', () => {
  it('returns ISO yyyy-MM-dd format', () => {
    expect(todayPlusOneISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns date strictly greater than today', () => {
    const todayISO = new Date().toISOString().slice(0, 10);
    const tomorrow = todayPlusOneISO();
    expect(tomorrow > todayISO).toBe(true);
  });
});

describe('Step04Goal — render', () => {
  it('renders the «Зачем копишь?» headline', () => {
    render(<Step04Goal goal={null} dispatch={vi.fn()} />);
    expect(screen.getByText(/Зачем копишь/)).toBeInTheDocument();
  });

  it('renders the sub-eyebrow «МОЖНО ПРОПУСТИТЬ И НАСТРОИТЬ ПОЗЖЕ»', () => {
    render(<Step04Goal goal={null} dispatch={vi.fn()} />);
    expect(
      screen.getByText('МОЖНО ПРОПУСТИТЬ И НАСТРОИТЬ ПОЗЖЕ'),
    ).toBeInTheDocument();
  });

  it('renders empty name input when goal=null', () => {
    render(<Step04Goal goal={null} dispatch={vi.fn()} />);
    const nameInput = screen.getByLabelText(
      'Название цели',
    ) as HTMLInputElement;
    expect(nameInput.value).toBe('');
    expect(nameInput.maxLength).toBe(80);
  });

  it('renders empty amount input when goal=null', () => {
    render(<Step04Goal goal={null} dispatch={vi.fn()} />);
    const amountInput = screen.getByLabelText(
      'Сумма цели, рубли',
    ) as HTMLInputElement;
    expect(amountInput.value).toBe('');
  });

  it('renders ₽ suffix', () => {
    render(<Step04Goal goal={null} dispatch={vi.fn()} />);
    expect(screen.getByText('₽')).toBeInTheDocument();
  });

  it('renders due date input with min=todayPlusOneISO', () => {
    render(<Step04Goal goal={null} dispatch={vi.fn()} />);
    const dueInput = screen.getByLabelText(
      'До какой даты, опционально',
    ) as HTMLInputElement;
    expect(dueInput.type).toBe('date');
    expect(dueInput.min).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dueInput.min).toBe(todayPlusOneISO());
  });

  it('renders existing goal values', () => {
    render(
      <Step04Goal
        goal={{
          name: 'Грузия',
          target_cents: 200_000_00,
          due: '2030-01-01',
        }}
        dispatch={vi.fn()}
      />,
    );
    const nameInput = screen.getByLabelText(
      'Название цели',
    ) as HTMLInputElement;
    expect(nameInput.value).toBe('Грузия');
    const dueInput = screen.getByLabelText(
      'До какой даты, опционально',
    ) as HTMLInputElement;
    expect(dueInput.value).toBe('2030-01-01');
  });
});

describe('Step04Goal — input change', () => {
  it('typing into name dispatches SET_GOAL with combined object', () => {
    const dispatch = vi.fn();
    render(
      <Step04Goal
        goal={{ name: '', target_cents: 200_000_00 }}
        dispatch={dispatch}
      />,
    );
    const nameInput = screen.getByLabelText('Название цели');
    fireEvent.change(nameInput, { target: { value: 'Грузия' } });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_GOAL',
      payload: { name: 'Грузия', target_cents: 200_000_00 },
    });
  });

  it('typing into amount dispatches SET_GOAL with cents = digits*100', () => {
    const dispatch = vi.fn();
    render(
      <Step04Goal goal={{ name: 'X', target_cents: 0 }} dispatch={dispatch} />,
    );
    const amountInput = screen.getByLabelText('Сумма цели, рубли');
    fireEvent.change(amountInput, { target: { value: '200000' } });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_GOAL',
      payload: { name: 'X', target_cents: 200_000_00 },
    });
  });

  it('amount input strips non-digit chars', () => {
    const dispatch = vi.fn();
    render(
      <Step04Goal goal={{ name: 'X', target_cents: 0 }} dispatch={dispatch} />,
    );
    const amountInput = screen.getByLabelText('Сумма цели, рубли');
    fireEvent.change(amountInput, { target: { value: 'abc1.2,3 50' } });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_GOAL',
      payload: { name: 'X', target_cents: 1_235_000 },
    });
  });

  it('clearing amount dispatches SET_GOAL with target_cents=0', () => {
    const dispatch = vi.fn();
    render(
      <Step04Goal
        goal={{ name: 'X', target_cents: 200_000_00 }}
        dispatch={dispatch}
      />,
    );
    const amountInput = screen.getByLabelText('Сумма цели, рубли');
    fireEvent.change(amountInput, { target: { value: '' } });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_GOAL',
      payload: { name: 'X', target_cents: 0 },
    });
  });

  it('typing due date dispatches SET_GOAL including due', () => {
    const dispatch = vi.fn();
    render(
      <Step04Goal
        goal={{ name: 'X', target_cents: 100 }}
        dispatch={dispatch}
      />,
    );
    const dueInput = screen.getByLabelText('До какой даты, опционально');
    fireEvent.change(dueInput, { target: { value: '2030-12-31' } });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_GOAL',
      payload: { name: 'X', target_cents: 100, due: '2030-12-31' },
    });
  });

  it('clearing due dispatches SET_GOAL without due key', () => {
    const dispatch = vi.fn();
    render(
      <Step04Goal
        goal={{ name: 'X', target_cents: 100, due: '2030-12-31' }}
        dispatch={dispatch}
      />,
    );
    const dueInput = screen.getByLabelText('До какой даты, опционально');
    fireEvent.change(dueInput, { target: { value: '' } });
    const lastCall = dispatch.mock.calls[dispatch.mock.calls.length - 1]?.[0];
    expect(lastCall).toEqual({
      type: 'SET_GOAL',
      payload: { name: 'X', target_cents: 100 },
    });
    // Specifically: key 'due' must be absent (server omits null on Optional).
    expect(Object.prototype.hasOwnProperty.call(lastCall.payload, 'due')).toBe(
      false,
    );
  });
});
