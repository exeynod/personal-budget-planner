// Phase 24-06: Step03Plan + counter-logic helper.
// Trimmed; footer money/overflow cases and NEXT-gating (T-24-06-01) protected.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';
import { Step03Plan, computePlanFooter } from '../Step03Plan';
import { DEFAULT_CATEGORIES } from '../defaultCategories';

afterEach(cleanup);

describe('computePlanFooter', () => {
  it('equal / left / overflow with money + NEXT-gating (T-24-06-01)', () => {
    const equal = computePlanFooter(10_000_000, { food: 10_000_000 });
    expect(equal).toMatchObject({
      hint: 'всё распределено',
      tone: 'normal',
      nextDisabled: false,
    });
    const left = computePlanFooter(10_000_000, { food: 8_000_000 }); // 20k left
    expect(left.hint).toMatch(/^остаётся 20.000 ₽ → накопления$/);
    expect(left.nextDisabled).toBe(false);
    const over = computePlanFooter(10_000_000, {
      food: 6_000_000,
      home: 5_000_000,
    }); // 10k over
    expect(over.hint).toMatch(/^превышение 10.000 ₽$/);
    expect(over).toMatchObject({ tone: 'overflow', nextDisabled: true });
    // empty map → full income left
    expect(computePlanFooter(5_000_000, {}).hint).toMatch(
      /^остаётся 50.000 ₽ → накопления$/,
    );
  });
});

describe('Step03Plan — render', () => {
  it('smoke: headline+income, eyebrow, 8 sliders, floor-formula + override values', () => {
    const { rerender } = render(
      <Step03Plan
        incomeCents={8_000_000}
        categoryPlans={{}}
        dispatch={vi.fn()}
      />,
    );
    expect(screen.getByText(/Распредели/)).toBeInTheDocument();
    expect(screen.getByText(/80.000 ₽/)).toBeInTheDocument(); // 80k income
    expect(
      screen.getByText('СДВИГАЙ ПОЛЗУНКИ ПО КАТЕГОРИЯМ'),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('slider')).toHaveLength(
      DEFAULT_CATEGORIES.length,
    );
    expect(DEFAULT_CATEGORIES.length).toBe(8);
    // floor formula: food 20% of 80k → 16k; home 30% → 24k
    expect(screen.getByText(/^16.000 ₽$/)).toBeInTheDocument();
    expect(screen.getByText(/^24.000 ₽$/)).toBeInTheDocument();
    // categoryPlans overrides default
    rerender(
      <Step03Plan
        incomeCents={8_000_000}
        categoryPlans={{ food: 2_500_000 }}
        dispatch={vi.fn()}
      />,
    );
    expect(screen.getByText(/^25.000 ₽$/)).toBeInTheDocument();
  });
});

describe('Step03Plan — slider interaction', () => {
  it('moving a slider dispatches SET_PLAN with the snapped code+cents', () => {
    const dispatch = vi.fn();
    render(
      <Step03Plan
        incomeCents={8_000_000}
        categoryPlans={{}}
        dispatch={dispatch}
      />,
    );
    const sliders = screen.getAllByRole('slider'); // DEFAULT_CATEGORIES order
    fireEvent.change(sliders[0], { target: { value: '2000000' } });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_PLAN',
      payload: { code: 'food', cents: 2_000_000 },
    });
    fireEvent.change(sliders[7], { target: { value: '300000' } });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_PLAN',
      payload: { code: 'subs', cents: 300_000 },
    });
  });
});
