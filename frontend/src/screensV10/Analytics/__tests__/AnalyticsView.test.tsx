// Phase 27-05 Task 2: AnalyticsView presenter tests.
//
// Coverage (ANAL-V10-01..04):
//   - Mass italic «Месяц.» visible.
//   - Period segmented chips render labels + selection state + onSelectMonth.
//   - Group-mode segmented chips render ДЕНЬ/НЕД./КАТ. + selection + onSelectGroup.
//   - 2 KPI plates: ПОТРАЧЕНО (dark) with delta, СЭКОНОМЛЕНО (yellow) with «от плана».
//   - Bar chart renders rect per datum, applies barRed when sum/plan ≥ 0.75.
//   - Top-5 list renders rows; empty state renders «Нет категорий».
//   - Loading + error subviews.
//   - Back button.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup, screen } from '@testing-library/react';
import { AnalyticsView, type BarDatum } from '../AnalyticsView';
import type { MonthOption, GroupMode, KPISpent, KPISaved } from '../computeAnalytics';
import type { TopCategoryItem } from '../../../api/v10';

afterEach(cleanup);

// ─────────────────── builders ───────────────────

function mkMonth(over: Partial<MonthOption> = {}): MonthOption {
  return {
    label: 'МАЙ 26',
    year: 2026,
    month: 5,
    period_start: '2026-05-01',
    period_end: '2026-05-31',
    ...over,
  };
}

const monthOptions: MonthOption[] = [
  mkMonth({ label: 'МАР 26', month: 3, period_start: '2026-03-01', period_end: '2026-03-31' }),
  mkMonth({ label: 'АПР 26', month: 4, period_start: '2026-04-01', period_end: '2026-04-30' }),
  mkMonth({ label: 'МАЙ 26' }),
];

const baseKpiSpent: KPISpent = { sumCents: 250000, deltaCents: 50000, deltaPct: 25 };
const baseKpiSaved: KPISaved = { sumCents: 100000 };

function renderView(
  over: Partial<React.ComponentProps<typeof AnalyticsView>> = {},
) {
  const props = {
    monthOptions,
    selectedMonth: monthOptions[2],
    onSelectMonth: vi.fn(),
    groupMode: 'day' as GroupMode,
    onSelectGroup: vi.fn(),
    kpiSpent: baseKpiSpent,
    kpiSaved: baseKpiSaved,
    barData: [] as BarDatum[],
    topCategories: [] as TopCategoryItem[],
    loading: false,
    error: null as string | null,
    canPop: true,
    onBack: vi.fn(),
    ...over,
  };
  return { props, ...render(<AnalyticsView {...props} />) };
}

// ─────────────────── headline + period ───────────────────

describe('AnalyticsView headline + period', () => {
  it('renders Mass italic «Месяц.» headline', () => {
    const { container } = renderView();
    expect(container.textContent).toContain('Месяц.');
  });

  it('renders 3 period chips with labels', () => {
    renderView();
    expect(screen.getByTestId('period-chip-МАР 26')).toBeTruthy();
    expect(screen.getByTestId('period-chip-АПР 26')).toBeTruthy();
    expect(screen.getByTestId('period-chip-МАЙ 26')).toBeTruthy();
  });

  it('marks selectedMonth chip as selected (aria-selected=true)', () => {
    renderView();
    const may = screen.getByTestId('period-chip-МАЙ 26');
    expect(may.getAttribute('aria-selected')).toBe('true');
    const apr = screen.getByTestId('period-chip-АПР 26');
    expect(apr.getAttribute('aria-selected')).toBe('false');
  });

  it('calls onSelectMonth(month) when chip clicked', () => {
    const { props } = renderView();
    fireEvent.click(screen.getByTestId('period-chip-АПР 26'));
    expect(props.onSelectMonth).toHaveBeenCalledTimes(1);
    expect(props.onSelectMonth).toHaveBeenCalledWith(monthOptions[1]);
  });
});

// ─────────────────── KPI plates ───────────────────

describe('AnalyticsView KPI plates', () => {
  it('renders ПОТРАЧЕНО plate with sum/100 ₽ + delta eyebrow', () => {
    renderView();
    const plate = screen.getByTestId('kpi-spent');
    expect(plate.textContent).toContain('ПОТРАЧЕНО');
    expect(plate.textContent).toContain('2'); // 250000/100 = 2500
    expect(plate.textContent?.replace(/ /g, '')).toMatch(/2.?500/);
    expect(plate.textContent).toContain('25%');
  });

  it('renders СЭКОНОМЛЕНО plate with sum/100 ₽ + «ОТ ПЛАНА»', () => {
    renderView();
    const plate = screen.getByTestId('kpi-saved');
    expect(plate.textContent).toContain('СЭКОНОМЛЕНО');
    expect(plate.textContent?.replace(/ /g, '')).toMatch(/1.?000/); // 100000/100 = 1000
    expect(plate.textContent).toContain('ОТ ПЛАНА');
  });

  it('renders «-» / «+» sign in delta when prev period had data', () => {
    const { container } = renderView({
      kpiSpent: { sumCents: 100000, deltaCents: -20000, deltaPct: -20 },
    });
    expect(container.textContent).toMatch(/[−-]20%/);
  });
});

// ─────────────────── group-mode chips ───────────────────

describe('AnalyticsView group-mode chips', () => {
  it('renders ДЕНЬ / НЕД. / КАТ. chips', () => {
    renderView();
    expect(screen.getByTestId('group-chip-day').textContent).toContain('ДЕНЬ');
    expect(screen.getByTestId('group-chip-week').textContent).toContain('НЕД.');
    expect(screen.getByTestId('group-chip-cat').textContent).toContain('КАТ.');
  });

  it('marks current groupMode chip as selected', () => {
    renderView({ groupMode: 'cat' });
    expect(screen.getByTestId('group-chip-cat').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('group-chip-day').getAttribute('aria-selected')).toBe('false');
  });

  it('calls onSelectGroup(mode) when chip clicked', () => {
    const { props } = renderView();
    fireEvent.click(screen.getByTestId('group-chip-week'));
    expect(props.onSelectGroup).toHaveBeenCalledWith('week');
  });
});

// ─────────────────── bar chart ───────────────────

describe('AnalyticsView bar chart', () => {
  it('renders «Нет данных» when barData empty', () => {
    const { container } = renderView({ barData: [] });
    expect(container.textContent).toContain('Нет данных');
  });

  it('renders one rect per datum', () => {
    renderView({
      barData: [
        { label: '01', sumCents: 1000 },
        { label: '02', sumCents: 2000 },
        { label: '03', sumCents: 3000 },
      ],
    });
    expect(screen.getByTestId('bar-0')).toBeTruthy();
    expect(screen.getByTestId('bar-1')).toBeTruthy();
    expect(screen.getByTestId('bar-2')).toBeTruthy();
  });

  it('applies barRed class when sum/plan ≥ 0.75 (T-27-05-03)', () => {
    renderView({
      barData: [
        { label: 'A', sumCents: 80, planCents: 100 }, // 0.8 → red
        { label: 'B', sumCents: 50, planCents: 100 }, // 0.5 → not red
      ],
    });
    expect(screen.getByTestId('bar-0-red')).toBeTruthy();
    // ensure non-red bar exists at index 1 without -red suffix
    expect(screen.queryByTestId('bar-1-red')).toBeNull();
    expect(screen.getByTestId('bar-1')).toBeTruthy();
  });
});

// ─────────────────── top-5 ───────────────────

describe('AnalyticsView top-5 categories', () => {
  function mkTop(over: Partial<TopCategoryItem> = {}): TopCategoryItem {
    return {
      category_id: 1,
      category_name: 'Еда',
      sum_cents: 50000,
      plan_cents: 70000,
      pct_of_plan: 71,
      ...over,
    };
  }

  it('renders «Нет категорий» when topCategories empty', () => {
    const { container } = renderView({ topCategories: [] });
    expect(container.textContent).toContain('Нет категорий');
  });

  it('renders rows with rank + UPPER name + sum + pct', () => {
    const { container } = renderView({
      topCategories: [
        mkTop({ category_id: 1, category_name: 'Еда', sum_cents: 50000, pct_of_plan: 71 }),
        mkTop({ category_id: 2, category_name: 'Такси', sum_cents: 30000, pct_of_plan: 50 }),
      ],
    });
    const row1 = screen.getByTestId('top-row-1');
    expect(row1.textContent).toContain('01');
    expect(row1.textContent).toContain('ЕДА');
    expect(row1.textContent).toContain('500'); // 50000/100=500
    expect(row1.textContent).toContain('71%');
    expect(container.textContent).toContain('ТАКСИ');
  });

  it('caps to 5 rows even when more provided', () => {
    const items: TopCategoryItem[] = Array.from({ length: 7 }, (_, i) =>
      mkTop({ category_id: i + 1, category_name: `C${i + 1}` }),
    );
    renderView({ topCategories: items });
    expect(screen.getByTestId('top-row-1')).toBeTruthy();
    expect(screen.getByTestId('top-row-5')).toBeTruthy();
    expect(screen.queryByTestId('top-row-6')).toBeNull();
  });
});

// ─────────────────── loading / error / back ───────────────────

describe('AnalyticsView lifecycle subviews', () => {
  it('renders loading subview when loading=true', () => {
    renderView({ loading: true });
    expect(screen.getByTestId('analytics-loading')).toBeTruthy();
  });

  it('renders error subview with message when error is non-null', () => {
    renderView({ error: 'Сеть недоступна' });
    const node = screen.getByTestId('analytics-error');
    expect(node.textContent).toContain('Сеть недоступна');
  });

  it('hides ← НАЗАД when canPop=false', () => {
    const { container } = renderView({ canPop: false });
    expect(container.querySelector('button')?.textContent).not.toContain('НАЗАД');
  });

  it('calls onBack when ← НАЗАД clicked', () => {
    const { props } = renderView({ canPop: true });
    const buttons = Array.from(document.querySelectorAll('button'));
    const back = buttons.find((b) => b.textContent?.includes('НАЗАД'));
    expect(back).toBeTruthy();
    fireEvent.click(back as HTMLButtonElement);
    expect(props.onBack).toHaveBeenCalledTimes(1);
  });
});
