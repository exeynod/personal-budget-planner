// Phase 27-05 Task 2: AnalyticsView presenter.
//
// Trimmed to smoke-render + loading/error/empty states + key interactions.
// KPI/bar/top math is covered by computeAnalytics.test.ts.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup, screen } from '@testing-library/react';
import { AnalyticsView, type BarDatum } from '../AnalyticsView';
import type {
  MonthOption,
  GroupMode,
  KPISpent,
  KPISaved,
} from '../computeAnalytics';
import type { TopCategoryItem } from '../../../api/v10';

afterEach(cleanup);

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
  mkMonth({
    label: 'МАР 26',
    month: 3,
    period_start: '2026-03-01',
    period_end: '2026-03-31',
  }),
  mkMonth({
    label: 'АПР 26',
    month: 4,
    period_start: '2026-04-01',
    period_end: '2026-04-30',
  }),
  mkMonth({ label: 'МАЙ 26' }),
];

const baseKpiSpent: KPISpent = {
  sumCents: 250000,
  deltaCents: 50000,
  deltaPct: 25,
};
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

describe('AnalyticsView — render', () => {
  it('smoke: headline, period chips (selection), KPI plates, group chips', () => {
    renderView();
    expect(screen.getByTestId('period-chip-МАР 26')).toBeTruthy();
    expect(
      screen.getByTestId('period-chip-МАЙ 26').getAttribute('aria-selected'),
    ).toBe('true');
    expect(
      screen.getByTestId('period-chip-АПР 26').getAttribute('aria-selected'),
    ).toBe('false');
    const spent = screen.getByTestId('kpi-spent');
    expect(spent.textContent).toContain('ПОТРАЧЕНО');
    expect(spent.textContent?.replace(/\s/g, '')).toMatch(/2.?500/); // 250000/100
    expect(spent.textContent).toContain('25%');
    const saved = screen.getByTestId('kpi-saved');
    expect(saved.textContent).toContain('СЭКОНОМЛЕНО');
    expect(saved.textContent).toContain('ОТ ПЛАНА');
    expect(screen.getByTestId('group-chip-day').textContent).toContain('ДЕНЬ');
    expect(screen.getByTestId('group-chip-week').textContent).toContain('НЕД.');
    expect(screen.getByTestId('group-chip-cat').textContent).toContain('КАТ.');
  });

  it('bar chart: rect per datum + barRed when sum/plan ≥ 0.75', () => {
    renderView({
      barData: [
        { label: 'A', sumCents: 80, planCents: 100 }, // 0.8 → red
        { label: 'B', sumCents: 50, planCents: 100 }, // 0.5 → not red
      ],
    });
    expect(screen.getByTestId('bar-0-red')).toBeTruthy();
    expect(screen.queryByTestId('bar-1-red')).toBeNull();
    expect(screen.getByTestId('bar-1')).toBeTruthy();
  });

  it('top categories: rank/UPPER/sum/pct rows, capped to 5', () => {
    const items: TopCategoryItem[] = Array.from({ length: 7 }, (_, i) =>
      mkTop({
        category_id: i + 1,
        category_name: i === 0 ? 'Еда' : `C${i + 1}`,
        sum_cents: 50000,
        pct_of_plan: 71,
      }),
    );
    renderView({ topCategories: items });
    const row1 = screen.getByTestId('top-row-1');
    expect(row1.textContent).toContain('01');
    expect(row1.textContent).toContain('ЕДА');
    expect(row1.textContent).toContain('500'); // 50000/100
    expect(row1.textContent).toContain('71%');
    expect(screen.getByTestId('top-row-5')).toBeTruthy();
    expect(screen.queryByTestId('top-row-6')).toBeNull();
  });

  it('empty states: «Нет данных» (bars) + «Нет категорий» (top)', () => {
    const { container } = renderView({ barData: [], topCategories: [] });
    expect(container.textContent).toContain('Нет данных');
    expect(container.textContent).toContain('Нет категорий');
  });

  it('loading + error subviews', () => {
    renderView({ loading: true });
    expect(screen.getByTestId('analytics-loading')).toBeTruthy();
    cleanup();
    renderView({ error: 'Сеть недоступна' });
    expect(screen.getByTestId('analytics-error').textContent).toContain(
      'Сеть недоступна',
    );
  });
});

describe('AnalyticsView — interactions', () => {
  it('chip clicks call onSelectMonth / onSelectGroup', () => {
    const { props } = renderView();
    fireEvent.click(screen.getByTestId('period-chip-АПР 26'));
    expect(props.onSelectMonth).toHaveBeenCalledWith(monthOptions[1]);
    fireEvent.click(screen.getByTestId('group-chip-week'));
    expect(props.onSelectGroup).toHaveBeenCalledWith('week');
  });

  it('← НАЗАД shown when canPop, hidden otherwise; click → onBack', () => {
    const noPop = renderView({ canPop: false });
    expect(
      Array.from(noPop.container.querySelectorAll('button')).some((b) =>
        b.textContent?.includes('НАЗАД'),
      ),
    ).toBe(false);
    cleanup();
    const { props } = renderView({ canPop: true });
    const back = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('НАЗАД'),
    );
    fireEvent.click(back as HTMLButtonElement);
    expect(props.onBack).toHaveBeenCalledTimes(1);
  });
});
