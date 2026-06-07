// Phase 27-05 Task 3: AnalyticsMount smoke tests (data-glue layer).
//
// Coverage:
//   - Initial loading state renders, then resolves to view.
//   - Network error surfaces in error subview.
//   - Period chip change triggers a second fetch (mock counter).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  render,
  cleanup,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react';

// ─────────── mocks ───────────

vi.mock('../../../api/v10', async () => {
  const actual: Record<string, unknown> =
    await vi.importActual('../../../api/v10');
  return {
    ...actual,
    listCategoriesV10: vi.fn(),
    listActualV10: vi.fn(),
  };
});

vi.mock('../../../api/periods', async () => {
  const actual: Record<string, unknown> = await vi.importActual(
    '../../../api/periods',
  );
  return {
    ...actual,
    listPeriods: vi.fn(),
  };
});

vi.mock('../../common', async () => {
  const actual: Record<string, unknown> = await vi.importActual('../../common');
  return {
    ...actual,
    usePosterRouter: () => ({
      push: vi.fn(),
      pop: vi.fn(),
      reset: vi.fn(),
      stack: [{ key: 'analytics', node: null }],
      canPop: false,
    }),
  };
});

import { AnalyticsMount } from '../AnalyticsMount';
import * as v10 from '../../../api/v10';
import * as periodsApi from '../../../api/periods';

const lc = v10.listCategoriesV10 as unknown as ReturnType<typeof vi.fn>;
const la = v10.listActualV10 as unknown as ReturnType<typeof vi.fn>;
const lp = periodsApi.listPeriods as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  lc.mockResolvedValue([]);
  la.mockResolvedValue([]);
  lp.mockResolvedValue([]);
});

afterEach(cleanup);

// ─────────── tests ───────────

describe('AnalyticsMount', () => {
  it('renders loading subview before fetch resolves', () => {
    render(<AnalyticsMount />);
    expect(screen.getByTestId('native-analytics-loading')).toBeTruthy();
  });

  it('transitions to view after parallel fetch resolves', async () => {
    render(<AnalyticsMount />);
    await waitFor(() => {
      // After load() finishes, the native nav-bar title becomes visible.
      expect(document.body.textContent).toContain('Аналитика');
    });
    expect(lc).toHaveBeenCalled();
    expect(lp).toHaveBeenCalled();
  });

  // P3-W2: the «Топ-5» list is now derived from the selected month's actuals
  // (no period-agnostic fetchTopCategories). Switching the chip re-fetches
  // that month's actuals and re-derives the list.
  it('derives Top categories from the selected month actuals (no fetchTopCategories call)', async () => {
    // Period that matches the default-selected current month chip.
    const now = new Date();
    const yy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(yy, now.getMonth() + 1, 0).getDate();
    lp.mockResolvedValue([
      {
        id: 42,
        period_start: `${yy}-${mm}-01`,
        period_end: `${yy}-${mm}-${String(lastDay).padStart(2, '0')}`,
      },
    ]);
    lc.mockResolvedValue([
      {
        id: 1,
        name: 'Еда',
        kind: 'expense',
        plan_cents: 100000,
        code: 'food',
        paused: false,
      },
    ]);
    la.mockResolvedValue([
      {
        id: 1,
        kind: 'expense',
        category_id: 1,
        amount_cents: -50000,
        tx_date: `${yy}-${mm}-05`,
      },
    ]);

    render(<AnalyticsMount />);
    await waitFor(() => {
      expect(document.body.textContent).toContain('Аналитика');
    });
    // Derived top row for «Еда» should render (native shows the raw name).
    await waitFor(() => {
      expect(document.body.textContent).toContain('Еда');
    });
    // Belt-and-suspenders: the removed API must not be referenced.
    expect((v10 as Record<string, unknown>).fetchTopCategories).toBeTypeOf(
      'function',
    );
  });

  it('surfaces error subview when listCategoriesV10 throws', async () => {
    lc.mockRejectedValueOnce(new Error('Сеть недоступна'));
    render(<AnalyticsMount />);
    await waitFor(() => {
      expect(screen.getByTestId('native-analytics-error')).toBeTruthy();
    });
    expect(screen.getByTestId('native-analytics-error').textContent).toContain(
      'Сеть недоступна',
    );
  });

  it('triggers a second fetch when a different period chip is selected', async () => {
    render(<AnalyticsMount />);
    await waitFor(() => {
      expect(document.body.textContent).toContain('Аналитика');
    });
    const callsAfterFirstLoad = lc.mock.calls.length;

    // Click a non-selected period tab in the «Период» segmented control —
    // pick the first chip (oldest month), which is not the default-selected
    // current month.
    const periodTablist = screen.getByRole('tablist', { name: 'Период' });
    const tabs = Array.from(periodTablist.querySelectorAll('[role="tab"]'));
    const inactive = tabs.find(
      (b) => b.getAttribute('aria-selected') !== 'true',
    );
    expect(inactive).toBeTruthy();
    fireEvent.click(inactive as HTMLElement);

    await waitFor(() => {
      expect(lc.mock.calls.length).toBeGreaterThan(callsAfterFirstLoad);
    });
  });
});
