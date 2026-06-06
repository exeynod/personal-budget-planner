// Phase 25-04 Task 2: HomeView presentational component.
//
// Trimmed to smoke-render + key interactions + surplus sign (U+2212 minus).
// Aggregate/ratio math is covered by computeHomeData.test.ts.
//
// Note: `bigFigAnimate={false}` reads the BigFig final value synchronously.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { HomeView } from '../HomeView';
import type { CategoryAggregateRow } from '../computeHomeData';

afterEach(cleanup);

function row(over: Partial<CategoryAggregateRow> = {}): CategoryAggregateRow {
  return {
    id: 1,
    name: 'Кафе',
    code: 'cafe',
    ord: '01',
    plan_cents: 10_000_00,
    fact_cents: 5_000_00,
    ratio: 0.5,
    isOver: false,
    ...over,
  };
}

function renderHome(
  propOverrides: Partial<React.ComponentProps<typeof HomeView>> = {},
) {
  const onPlanTap = vi.fn();
  const onCategoryTap = vi.fn();
  const onAllOperationsTap = vi.fn();
  const utils = render(
    <HomeView
      eyebrow="VOL.17 / MAY 2026 · 22 ДНЯ"
      dailyPaceCents={4000_00}
      daysLeft={22}
      walletCents={123_456_00}
      surplusCents={20_000_00}
      categoryRows={[]}
      onPlanTap={onPlanTap}
      onCategoryTap={onCategoryTap}
      onAllOperationsTap={onAllOperationsTap}
      bigFigAnimate={false}
      {...propOverrides}
    />,
  );
  return { ...utils, onPlanTap, onCategoryTap, onAllOperationsTap };
}

describe('HomeView — hero', () => {
  it('smoke: eyebrow, «Дневной темп —», BigFig value, wallet/days mini-line', () => {
    const { getByText, container } = renderHome({
      daysLeft: 22,
      walletCents: 12_345_00,
    });
    expect(getByText('VOL.17 / MAY 2026 · 22 ДНЯ')).toBeInTheDocument();
    expect(getByText('Дневной темп —')).toBeInTheDocument();
    expect(container.textContent).toMatch(/4\s000/); // 4000_00 cents
    expect(container.textContent).toContain('осталось 22 дней');
    expect(container.textContent).toContain('в кошельке');
    // wallet display-only (no nav link in v1.1)
    expect(
      container.querySelector('[data-testid="home-wallet-value"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="home-wallet-link"]'),
    ).toBeNull();
  });
});

describe('HomeView — plan plate', () => {
  it('positive surplus «+ X ₽»; negative uses U+2212; tap → onPlanTap', () => {
    const pos = renderHome({ surplusCents: 20_000_00 });
    expect(pos.container.textContent).toMatch(/\+ 20\s000 ₽/);
    cleanup();
    const { container, onPlanTap } = renderHome({ surplusCents: -5_000_00 });
    expect(container.textContent).toMatch(/− 5\s000 ₽/); expect(container.textContent).not.toMatch(/- 5\s000 ₽/);
    fireEvent.click(
      container.querySelector('[data-testid="home-plan-plate"]')!,
    );
    expect(onPlanTap).toHaveBeenCalledTimes(1);
  });
});

describe('HomeView — category list', () => {
  it('«ВСЕ ОПЕРАЦИИ →» tap → onAllOperationsTap', () => {
    const { container, onAllOperationsTap } = renderHome();
    fireEvent.click(
      container.querySelector('[data-testid="home-all-operations"]')!,
    );
    expect(onAllOperationsTap).toHaveBeenCalledTimes(1);
  });

  it('renders one row per categoryRow; row tap → onCategoryTap(id); fact/plan mini-text', () => {
    const { container, onCategoryTap } = renderHome({
      categoryRows: [
        row({ id: 10, ord: '01', fact_cents: 5_000_00, plan_cents: 10_000_00 }),
        row({ id: 20, ord: '02' }),
        row({ id: 30, ord: '03' }),
      ],
    });
    expect(
      container.querySelectorAll('[data-testid^="home-category-row-"]'),
    ).toHaveLength(3);
    expect(container.textContent).toMatch(/5\s000 ₽/);
    expect(container.textContent).toMatch(/из 10\s000/);
    fireEvent.click(
      container.querySelector('[data-testid="home-category-row-10"]')!,
    );
    expect(onCategoryTap).toHaveBeenCalledWith(10);
  });

  it('OVER plate + bar fill clamped to 100% when over budget; hidden otherwise', () => {
    const over = renderHome({
      categoryRows: [
        row({
          id: 1,
          isOver: true,
          ratio: 2.5,
          fact_cents: 25_000_00,
          plan_cents: 10_000_00,
        }),
      ],
    });
    expect(over.getByText('OVER')).toBeInTheDocument();
    const fill = over.container.querySelector(
      '[data-testid="home-category-bar-fill-1"]',
    ) as HTMLElement;
    expect(fill.style.width).toBe('100%');
    cleanup();
    const under = renderHome({ categoryRows: [row({ id: 1, isOver: false })] });
    expect(under.queryByText('OVER')).toBeNull();
  });
});
