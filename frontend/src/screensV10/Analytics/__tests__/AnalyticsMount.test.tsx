// Phase 27-05 Task 3: AnalyticsMount smoke tests (data-glue layer).
//
// Coverage:
//   - Initial loading state renders, then resolves to view.
//   - Network error surfaces in error subview.
//   - Period chip change triggers a second fetch (mock counter).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';

// ─────────── mocks ───────────

vi.mock('../../../api/v10', async () => {
  const actual: Record<string, unknown> = await vi.importActual('../../../api/v10');
  return {
    ...actual,
    listCategoriesV10: vi.fn(),
    listActualV10: vi.fn(),
    fetchTopCategories: vi.fn(),
  };
});

vi.mock('../../../api/periods', async () => {
  const actual: Record<string, unknown> = await vi.importActual('../../../api/periods');
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
const ft = v10.fetchTopCategories as unknown as ReturnType<typeof vi.fn>;
const lp = periodsApi.listPeriods as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  lc.mockResolvedValue([]);
  la.mockResolvedValue([]);
  ft.mockResolvedValue([]);
  lp.mockResolvedValue([]);
});

afterEach(cleanup);

// ─────────── tests ───────────

describe('AnalyticsMount', () => {
  it('renders loading subview before fetch resolves', () => {
    render(<AnalyticsMount />);
    expect(screen.getByTestId('analytics-loading')).toBeTruthy();
  });

  it('transitions to view after parallel fetch resolves', async () => {
    render(<AnalyticsMount />);
    await waitFor(() => {
      // After load() finishes, headline becomes visible
      expect(document.body.textContent).toContain('Месяц.');
    });
    expect(lc).toHaveBeenCalled();
    expect(lp).toHaveBeenCalled();
    expect(ft).toHaveBeenCalled();
  });

  it('surfaces error subview when listCategoriesV10 throws', async () => {
    lc.mockRejectedValueOnce(new Error('Сеть недоступна'));
    render(<AnalyticsMount />);
    await waitFor(() => {
      expect(screen.getByTestId('analytics-error')).toBeTruthy();
    });
    expect(screen.getByTestId('analytics-error').textContent).toContain('Сеть недоступна');
  });

  it('triggers a second fetch when a different period chip is selected', async () => {
    render(<AnalyticsMount />);
    await waitFor(() => {
      expect(document.body.textContent).toContain('Месяц.');
    });
    const callsAfterFirstLoad = lc.mock.calls.length;

    // Click a non-selected chip — pick the first chip (oldest month) which is
    // not the default-selected current month.
    const buttons = Array.from(document.querySelectorAll('[data-testid^="period-chip-"]'));
    const inactive = buttons.find((b) => b.getAttribute('aria-selected') !== 'true');
    expect(inactive).toBeTruthy();
    fireEvent.click(inactive as HTMLElement);

    await waitFor(() => {
      expect(lc.mock.calls.length).toBeGreaterThan(callsAfterFirstLoad);
    });
  });
});
