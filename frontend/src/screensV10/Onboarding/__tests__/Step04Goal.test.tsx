// Phase 24-08: Step04Goal view + isGoalValid helper.
// Trimmed; goal validity, money strip, maxLength (T-24-08-01) and due-min
// (T-24-08-02) threats protected. NOTE: Step04Goal is still LIVE web code.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';
import { Step04Goal, isGoalValid, todayPlusOneISO } from '../Step04Goal';

afterEach(cleanup);

describe('isGoalValid / todayPlusOneISO', () => {
  it('requires non-blank name + positive target', () => {
    expect(isGoalValid(null)).toBe(false);
    expect(isGoalValid({ name: '   ', target_cents: 100 })).toBe(false);
    expect(isGoalValid({ name: 'X', target_cents: 0 })).toBe(false);
    expect(isGoalValid({ name: 'X', target_cents: -1 })).toBe(false);
    expect(isGoalValid({ name: 'X', target_cents: 1 })).toBe(true);
    expect(
      isGoalValid({
        name: 'Грузия',
        target_cents: 200_000_00,
        due: '2030-01-01',
      }),
    ).toBe(true);
  });

  it('todayPlusOneISO is ISO yyyy-MM-dd strictly after today', () => {
    expect(todayPlusOneISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(todayPlusOneISO() > new Date().toISOString().slice(0, 10)).toBe(
      true,
    );
  });
});

describe('Step04Goal — render', () => {
  it('smoke: headline, eyebrow, inputs (maxLength 80, date min, ₽, existing values)', () => {
    const { rerender } = render(<Step04Goal goal={null} dispatch={vi.fn()} />);
    expect(screen.getByText('Зачем', { exact: false })).toBeInTheDocument();
    expect(
      screen.getByText('МОЖНО ПРОПУСТИТЬ И НАСТРОИТЬ ПОЗЖЕ'),
    ).toBeInTheDocument();
    const name = screen.getByLabelText('Название цели') as HTMLInputElement;
    expect(name.value).toBe('');
    expect(name.maxLength).toBe(80); // T-24-08-01
    expect(
      (screen.getByLabelText('Сумма цели, рубли') as HTMLInputElement).value,
    ).toBe('');
    expect(screen.getByText('₽')).toBeInTheDocument();
    const due = screen.getByLabelText(
      'До какой даты, опционально',
    ) as HTMLInputElement;
    expect(due.type).toBe('date');
    expect(due.min).toBe(todayPlusOneISO()); // T-24-08-02
    // existing goal hydrates inputs
    rerender(
      <Step04Goal
        goal={{ name: 'Грузия', target_cents: 200_000_00, due: '2030-01-01' }}
        dispatch={vi.fn()}
      />,
    );
    expect(
      (screen.getByLabelText('Название цели') as HTMLInputElement).value,
    ).toBe('Грузия');
    expect(
      (screen.getByLabelText('До какой даты, опционально') as HTMLInputElement)
        .value,
    ).toBe('2030-01-01');
  });
});

describe('Step04Goal — input change', () => {
  it('happy: name/amount/due dispatch SET_GOAL with merged object', () => {
    const dispatch = vi.fn();
    const { rerender } = render(
      <Step04Goal
        goal={{ name: '', target_cents: 200_000_00 }}
        dispatch={dispatch}
      />,
    );
    fireEvent.change(screen.getByLabelText('Название цели'), {
      target: { value: 'Грузия' },
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_GOAL',
      payload: { name: 'Грузия', target_cents: 200_000_00 },
    });
    rerender(
      <Step04Goal
        goal={{ name: 'X', target_cents: 100 }}
        dispatch={dispatch}
      />,
    );
    fireEvent.change(screen.getByLabelText('До какой даты, опционально'), {
      target: { value: '2030-12-31' },
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_GOAL',
      payload: { name: 'X', target_cents: 100, due: '2030-12-31' },
    });
  });

  it('invalid: amount strips non-digits; clearing due omits the key', () => {
    const dispatch = vi.fn();
    const { rerender } = render(
      <Step04Goal goal={{ name: 'X', target_cents: 0 }} dispatch={dispatch} />,
    );
    fireEvent.change(screen.getByLabelText('Сумма цели, рубли'), {
      target: { value: 'abc1.2,3 50' },
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_GOAL',
      payload: { name: 'X', target_cents: 1_235_000 },
    });
    rerender(
      <Step04Goal
        goal={{ name: 'X', target_cents: 100, due: '2030-12-31' }}
        dispatch={dispatch}
      />,
    );
    fireEvent.change(screen.getByLabelText('До какой даты, опционально'), {
      target: { value: '' },
    });
    const last = dispatch.mock.calls.at(-1)?.[0];
    expect(last).toEqual({
      type: 'SET_GOAL',
      payload: { name: 'X', target_cents: 100 },
    });
    expect(Object.prototype.hasOwnProperty.call(last.payload, 'due')).toBe(
      false,
    ); // due key absent
  });
});
