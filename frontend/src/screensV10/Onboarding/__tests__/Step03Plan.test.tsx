// Phase 24-06: Step03Plan integration tests + counter-logic helper.
//
// Covers must_haves:
//   - 8 PosterSlider components (one per default category)
//   - Initial slider value = floor(income_cents * share / 50_000) * 50_000
//   - Slider drag dispatches SET_PLAN with the snapped cents value
//   - Counter computeHint logic: equal / left / overflow
//   - nextDisabled === true when overflow
// Threat coverage:
//   - T-24-06-01: NEXT-disabled gating exposed via computePlanFooter
//   - T-24-06-02: rendering iterates DEFAULT_CATEGORIES (whitelist) — implicit

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  render,
  fireEvent,
  screen,
  cleanup,
} from '@testing-library/react';
import { Step03Plan } from '../Step03Plan';
import { computePlanFooter } from '../Step03Plan';
import { DEFAULT_CATEGORIES } from '../defaultCategories';

afterEach(cleanup);

describe('computePlanFooter', () => {
  it('returns "всё распределено" + nextDisabled=false when sum equals income', () => {
    const r = computePlanFooter(10_000_000, { food: 10_000_000 });
    expect(r.hint).toBe('всё распределено');
    expect(r.tone).toBe('normal');
    expect(r.nextDisabled).toBe(false);
  });

  it('returns "остаётся X ₽ → накопления" + nextDisabled=false when sum < income', () => {
    // income = 10_000_000 cents (100k₽), sum = 8_000_000 (80k₽), left = 2_000_000 (20k₽)
    const r = computePlanFooter(10_000_000, { food: 8_000_000 });
    expect(r.hint).toMatch(/^остаётся 20.000 ₽ → накопления$/);
    expect(r.tone).toBe('normal');
    expect(r.nextDisabled).toBe(false);
  });

  it('returns "превышение X ₽" + nextDisabled=true when sum > income', () => {
    // income = 10_000_000, sum = 11_000_000, overflow = 1_000_000 (10k₽)
    const r = computePlanFooter(10_000_000, {
      food: 6_000_000,
      home: 5_000_000,
    });
    expect(r.hint).toMatch(/^превышение 10.000 ₽$/);
    expect(r.tone).toBe('overflow');
    expect(r.nextDisabled).toBe(true);
  });

  it('treats empty plan map as zero sum (left = income)', () => {
    const r = computePlanFooter(5_000_000, {});
    // left = 5_000_000 (50k₽)
    expect(r.hint).toMatch(/^остаётся 50.000 ₽ → накопления$/);
    expect(r.tone).toBe('normal');
    expect(r.nextDisabled).toBe(false);
  });
});

describe('Step03Plan — rendering', () => {
  it('renders the headline with formatted income', () => {
    render(
      <Step03Plan
        incomeCents={8_000_000}
        categoryPlans={{}}
        dispatch={vi.fn()}
      />,
    );
    // Mass headline contains «Распредели» + formatted ₽ amount
    expect(screen.getByText(/Распредели/)).toBeInTheDocument();
    // 8_000_000 cents = 80_000 ₽ → "80{thin}000"
    expect(screen.getByText(/80.000 ₽/)).toBeInTheDocument();
  });

  it('renders the eyebrow «СДВИГАЙ ПОЛЗУНКИ ПО КАТЕГОРИЯМ»', () => {
    render(
      <Step03Plan
        incomeCents={8_000_000}
        categoryPlans={{}}
        dispatch={vi.fn()}
      />,
    );
    expect(
      screen.getByText('СДВИГАЙ ПОЛЗУНКИ ПО КАТЕГОРИЯМ'),
    ).toBeInTheDocument();
  });

  it('renders 8 sliders, one per default category', () => {
    render(
      <Step03Plan
        incomeCents={8_000_000}
        categoryPlans={{}}
        dispatch={vi.fn()}
      />,
    );
    const sliders = screen.getAllByRole('slider');
    expect(sliders.length).toBe(DEFAULT_CATEGORIES.length);
    expect(sliders.length).toBe(8);
  });

  it('renders each category name + ord', () => {
    render(
      <Step03Plan
        incomeCents={8_000_000}
        categoryPlans={{}}
        dispatch={vi.fn()}
      />,
    );
    for (const cat of DEFAULT_CATEGORIES) {
      expect(screen.getByText(cat.name)).toBeInTheDocument();
      expect(screen.getByText(cat.ord)).toBeInTheDocument();
    }
  });

  it('uses floor formula for initial values when categoryPlans is empty', () => {
    // For income=8_000_000 (80_000₽), share=0.20 (food):
    //   raw = 8_000_000 * 0.20 = 1_600_000
    //   floor(1_600_000 / 50_000) * 50_000 = 1_600_000
    // food row should show 16 000 ₽
    render(
      <Step03Plan
        incomeCents={8_000_000}
        categoryPlans={{}}
        dispatch={vi.fn()}
      />,
    );
    // food initial = 16_000₽ → display "16{thin}000 ₽"
    expect(screen.getByText(/^16.000 ₽$/)).toBeInTheDocument();
    // home initial = 80_000 * 0.30 = 24_000₽ → "24{thin}000 ₽"
    expect(screen.getByText(/^24.000 ₽$/)).toBeInTheDocument();
  });

  it('uses categoryPlans value when provided (overrides default)', () => {
    render(
      <Step03Plan
        incomeCents={8_000_000}
        categoryPlans={{ food: 2_500_000 }}
        dispatch={vi.fn()}
      />,
    );
    // food override = 25_000₽
    expect(screen.getByText(/^25.000 ₽$/)).toBeInTheDocument();
  });
});

describe('Step03Plan — slider interaction', () => {
  it('moving the food slider dispatches SET_PLAN with snapped cents', () => {
    const dispatch = vi.fn();
    render(
      <Step03Plan
        incomeCents={8_000_000}
        categoryPlans={{}}
        dispatch={dispatch}
      />,
    );
    const sliders = screen.getAllByRole('slider');
    // Categories render in DEFAULT_CATEGORIES order; food is index 0.
    fireEvent.change(sliders[0], { target: { value: '2000000' } });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_PLAN',
      payload: { code: 'food', cents: 2_000_000 },
    });
  });

  it('dispatches SET_PLAN with code=subs for the 8th slider', () => {
    const dispatch = vi.fn();
    render(
      <Step03Plan
        incomeCents={8_000_000}
        categoryPlans={{}}
        dispatch={dispatch}
      />,
    );
    const sliders = screen.getAllByRole('slider');
    fireEvent.change(sliders[7], { target: { value: '300000' } });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_PLAN',
      payload: { code: 'subs', cents: 300_000 },
    });
  });
});
