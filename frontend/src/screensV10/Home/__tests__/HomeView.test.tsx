// Phase 25-04 Task 2: HomeView presentational component tests.
//
// Coverage (HOME-V10-01..06):
//   - Eyebrow with VOL.NN / MONTH YYYY · N ДНЕЙ rendered.
//   - «Дневной темп —» italic + BigFig final value rendered (count-up
//     mocked off via dur=0 for deterministic assertion — we read the
//     formatted final integer).
//   - Wallet substring «в кошельке X ₽ →» tappable → onWalletTap.
//   - Plan plate «PLAN МАЯ» + signed surplus tappable → onPlanTap.
//   - «ВСЕ ОПЕРАЦИИ →» tappable → onAllOperationsTap.
//   - Category rows: each row receives staggered animationDelay
//     `${0.08 + i*0.045}s`; row tap → onCategoryTap(id).
//   - OVER plate visible when row.isOver = true.
//   - Negative surplus rendered with U+2212 minus sign.
//
// Note: BigFig animates with rAF; jsdom supports rAF but we set dur=0
// (animate=false path) to read the final value synchronously. The
// HomeView prop `bigFigAnimate` is a test-only escape hatch (default true).

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

function renderHome(propOverrides: Partial<React.ComponentProps<typeof HomeView>> = {}) {
  const onWalletTap = vi.fn();
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
      onWalletTap={onWalletTap}
      onPlanTap={onPlanTap}
      onCategoryTap={onCategoryTap}
      onAllOperationsTap={onAllOperationsTap}
      bigFigAnimate={false}
      {...propOverrides}
    />,
  );
  return { ...utils, onWalletTap, onPlanTap, onCategoryTap, onAllOperationsTap };
}

describe('HomeView — header / hero', () => {
  it('renders the eyebrow string', () => {
    const { getByText } = renderHome();
    expect(getByText('VOL.17 / MAY 2026 · 22 ДНЯ')).toBeInTheDocument();
  });

  it('renders italic «Дневной темп —» mass headline', () => {
    const { getByText } = renderHome();
    expect(getByText('Дневной темп —')).toBeInTheDocument();
  });

  it('renders BigFig final value (no count-up via bigFigAnimate=false)', () => {
    // 4000_00 cents = 4000 ₽; useCountUp/fmtThousands renders as `4 000` (U+202F).
    const { container } = renderHome({ dailyPaceCents: 4000_00 });
    expect(container.textContent).toContain('4 000');
  });

  it('renders «осталось 22 дней · в кошельке … ₽ →» mono mini-line', () => {
    const { container } = renderHome({ daysLeft: 22, walletCents: 12_345_00 });
    // Russian dative-plural «дней» is correct for 22 — we render literal `дней`
    // per CONTEXT (the eyebrow has its own pluralisation; this line uses a
    // simpler «дней» form — pluralisation refinement deferred).
    expect(container.textContent).toContain('осталось 22 дней');
    expect(container.textContent).toContain('в кошельке');
    // 12_345_00 cents → 12 345 ₽ with U+202F.
    expect(container.textContent).toContain('12 345');
  });

  it('renders the «МЕНЮ ↗» placeholder as static (not interactive yet)', () => {
    const { getByText } = renderHome();
    const menu = getByText(/МЕНЮ/);
    expect(menu).toBeInTheDocument();
    // Placeholder — not a button, not focusable; just a styled span.
    // (No assertion on click behaviour — Phase 27 wiring.)
  });
});

describe('HomeView — wallet link', () => {
  it('calls onWalletTap when the wallet substring is clicked', () => {
    const { container, onWalletTap } = renderHome();
    const walletLink = container.querySelector('[data-testid="home-wallet-link"]');
    expect(walletLink).not.toBeNull();
    fireEvent.click(walletLink!);
    expect(onWalletTap).toHaveBeenCalledTimes(1);
  });
});

describe('HomeView — plan plate', () => {
  it('renders «PLAN МАЯ» eyebrow', () => {
    const { getByText } = renderHome();
    expect(getByText(/PLAN МАЯ/)).toBeInTheDocument();
  });

  it('renders surplus with «+ X ₽» when positive (yellow)', () => {
    const { container } = renderHome({ surplusCents: 20_000_00 });
    // 20_000_00 cents → 20 000 ₽
    expect(container.textContent).toContain('+ 20 000 ₽');
  });

  it('renders surplus with «− X ₽» (U+2212) when negative (red)', () => {
    const { container } = renderHome({ surplusCents: -5_000_00 });
    // U+2212 is the typographic minus; ASCII '-' would be wrong.
    expect(container.textContent).toContain('− 5 000 ₽');
  });

  it('calls onPlanTap when the plate is clicked', () => {
    const { container, onPlanTap } = renderHome();
    const plate = container.querySelector('[data-testid="home-plan-plate"]');
    expect(plate).not.toBeNull();
    fireEvent.click(plate!);
    expect(onPlanTap).toHaveBeenCalledTimes(1);
  });
});

describe('HomeView — category list', () => {
  it('renders «КАТЕГОРИИ» eyebrow + «ВСЕ ОПЕРАЦИИ →» link', () => {
    const { getByText } = renderHome();
    expect(getByText('КАТЕГОРИИ')).toBeInTheDocument();
    expect(getByText(/ВСЕ ОПЕРАЦИИ/)).toBeInTheDocument();
  });

  it('calls onAllOperationsTap when «ВСЕ ОПЕРАЦИИ →» clicked', () => {
    const { container, onAllOperationsTap } = renderHome();
    const link = container.querySelector('[data-testid="home-all-operations"]');
    expect(link).not.toBeNull();
    fireEvent.click(link!);
    expect(onAllOperationsTap).toHaveBeenCalledTimes(1);
  });

  it('renders one row per categoryRow with staggered animationDelay', () => {
    const rows: CategoryAggregateRow[] = [
      row({ id: 10, name: 'Кафе', ord: '01' }),
      row({ id: 20, name: 'Продукты', ord: '02' }),
      row({ id: 30, name: 'Транспорт', ord: '03' }),
    ];
    const { container } = renderHome({ categoryRows: rows });
    const rowEls = container.querySelectorAll('[data-testid^="home-category-row-"]');
    expect(rowEls).toHaveLength(3);
    rowEls.forEach((el, i) => {
      // Inline style.animationDelay should match `${0.08 + i*0.045}s`.
      const delay = (el as HTMLElement).style.animationDelay;
      const expected = `${(0.08 + i * 0.045).toFixed(3)}s`;
      // Allow either no-trailing-zero or full precision (browser may
      // reformat — we accept both `0.080s` and `0.08s`).
      expect([expected, expected.replace(/0+s$/, 's')]).toContain(delay);
    });
  });

  it('calls onCategoryTap with the row id when a row is clicked', () => {
    const { container, onCategoryTap } = renderHome({
      categoryRows: [row({ id: 42 })],
    });
    const rowEl = container.querySelector('[data-testid="home-category-row-42"]');
    expect(rowEl).not.toBeNull();
    fireEvent.click(rowEl!);
    expect(onCategoryTap).toHaveBeenCalledTimes(1);
    expect(onCategoryTap).toHaveBeenCalledWith(42);
  });

  it('renders OVER plate when row.isOver=true', () => {
    const { container, getByText } = renderHome({
      categoryRows: [row({ id: 1, isOver: true, fact_cents: 15_000_00, ratio: 1.5 })],
    });
    expect(getByText('OVER')).toBeInTheDocument();
    // Row exists.
    expect(container.querySelector('[data-testid="home-category-row-1"]')).not.toBeNull();
  });

  it('does NOT render OVER plate when row.isOver=false', () => {
    const { queryByText } = renderHome({
      categoryRows: [row({ id: 1, isOver: false })],
    });
    expect(queryByText('OVER')).toBeNull();
  });

  it('renders fact / plan amounts in mono mini-text below the bar', () => {
    const { container } = renderHome({
      categoryRows: [row({ id: 1, fact_cents: 5_000_00, plan_cents: 10_000_00 })],
    });
    // 5_000_00 cents → '5 000', 10_000_00 → '10 000', both with U+202F.
    expect(container.textContent).toContain('5 000 ₽');
    expect(container.textContent).toContain('из 10 000');
  });

  it('renders bar fill scaleX clamped to 100% when ratio > 1', () => {
    const { container } = renderHome({
      categoryRows: [row({ id: 1, isOver: true, ratio: 2.5, fact_cents: 25_000_00, plan_cents: 10_000_00 })],
    });
    const fill = container.querySelector(
      '[data-testid="home-category-bar-fill-1"]',
    ) as HTMLElement | null;
    expect(fill).not.toBeNull();
    // Inline style.width should be capped at 100%.
    expect(fill!.style.width).toBe('100%');
  });
});
