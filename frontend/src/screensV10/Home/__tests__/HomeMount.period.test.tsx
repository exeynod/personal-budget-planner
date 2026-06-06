// Phase P2 (period switching): HomeMount re-fetches when the viewed period
// changes via the SelectedPeriodProvider.
//
// We mock the v10 API, periods list + balance modules and assert:
//   - initial mount fetches actuals for the default (active) period;
//   - switching to a PAST period re-fetches actuals for the NEW id AND pulls
//     that period's balance (past-period category aggregates come from balance).

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, cleanup, screen, act } from '@testing-library/react';
import { HomeMount } from '../HomeMount';
import {
  SelectedPeriodProvider,
  PosterRouterProvider,
  PosterRouterView,
  useSelectedPeriod,
} from '../../common';
import type { PeriodRead, BalanceResponse } from '../../../api/types';

const listAccountsMock = vi.fn();
const listCategoriesV10Mock = vi.fn();
const listActualV10Mock = vi.fn();
const listPeriodsMock = vi.fn();
const getCurrentPeriodMock = vi.fn();
const getPeriodBalanceMock = vi.fn();

vi.mock('../../../api/v10', () => ({
  listAccounts: (...a: unknown[]) => listAccountsMock(...a),
  listCategoriesV10: (...a: unknown[]) => listCategoriesV10Mock(...a),
  listActualV10: (...a: unknown[]) => listActualV10Mock(...a),
}));

vi.mock('../../../api/periods', () => ({
  listPeriods: (...a: unknown[]) => listPeriodsMock(...a),
  getCurrentPeriod: (...a: unknown[]) => getCurrentPeriodMock(...a),
  getPeriodBalance: (...a: unknown[]) => getPeriodBalanceMock(...a),
}));

function period(over: Partial<PeriodRead> = {}): PeriodRead {
  return {
    id: 1,
    period_start: '2026-05-01',
    period_end: '2026-05-31',
    starting_balance_cents: 0,
    ending_balance_cents: null,
    status: 'closed',
    closed_at: null,
    ...over,
  };
}

const ACTIVE = period({
  id: 6,
  period_start: '2026-06-01',
  period_end: '2026-06-30',
  status: 'active',
});
const PAST_MAY = period({
  id: 5,
  period_start: '2026-05-01',
  period_end: '2026-05-31',
  status: 'closed',
});

const MAY_BALANCE: BalanceResponse = {
  period_id: 5,
  period_start: '2026-05-01',
  period_end: '2026-05-31',
  starting_balance_cents: 0,
  planned_total_expense_cents: 10_000_00,
  actual_total_expense_cents: 8_000_00,
  planned_total_income_cents: 0,
  actual_total_income_cents: 0,
  balance_now_cents: 0,
  delta_total_cents: 0,
  by_category: [
    {
      category_id: 1,
      name: 'Кафе',
      kind: 'expense',
      planned_cents: 10_000_00,
      actual_cents: 8_000_00,
      delta_cents: 2_000_00,
    },
  ],
};

beforeEach(() => {
  listAccountsMock.mockResolvedValue([]);
  listCategoriesV10Mock.mockResolvedValue([
    { id: 1, name: 'Кафе', code: 'cafe', ord: '01' },
  ]);
  listActualV10Mock.mockResolvedValue([]);
  listPeriodsMock.mockResolvedValue([ACTIVE, PAST_MAY]); // newest-first
  getCurrentPeriodMock.mockResolvedValue(ACTIVE);
  getPeriodBalanceMock.mockResolvedValue(MAY_BALANCE);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** Test-only control to switch periods from inside the provider. */
function SwitchButton() {
  const { setSelectedPeriodId } = useSelectedPeriod();
  return (
    <button
      type="button"
      data-testid="switch-to-may"
      onClick={() => setSelectedPeriodId(5)}
    >
      may
    </button>
  );
}

function Harness() {
  return (
    <SelectedPeriodProvider>
      <PosterRouterProvider root={<HomeMount />}>
        <PosterRouterView />
        <SwitchButton />
      </PosterRouterProvider>
    </SelectedPeriodProvider>
  );
}

describe('HomeMount — period switching re-fetch (Phase P2)', () => {
  it('fetches the active period actuals on mount, then re-fetches for the new id on switch', async () => {
    render(<Harness />);
    await flushPromises();

    // Initial: active period id=6.
    expect(listActualV10Mock).toHaveBeenCalledWith(6);
    // Active period does NOT pull the balance (categories+actuals path).
    expect(getPeriodBalanceMock).not.toHaveBeenCalled();

    // Switch to the closed May period (id=5).
    await act(async () => {
      screen.getByTestId('switch-to-may').click();
    });
    await flushPromises();

    // Re-fetched actuals for the NEW id, and pulled May's balance for the
    // past-period category aggregates.
    expect(listActualV10Mock).toHaveBeenCalledWith(5);
    expect(getPeriodBalanceMock).toHaveBeenCalledWith(5);

    // Eyebrow reflects the VIEWED (May) period, not today's month.
    expect(screen.getByText(/MAY 2026/)).toBeTruthy();
  });
});
