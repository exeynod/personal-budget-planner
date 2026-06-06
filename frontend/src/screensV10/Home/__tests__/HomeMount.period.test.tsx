// Phase P2 (period switching): HomeMount re-fetches when the viewed period
// changes via the SelectedPeriodProvider.
//
// We mock the v10 API, periods list + balance modules and assert:
//   - initial mount fetches actuals for the default (active) period;
//   - switching to a PAST period re-fetches actuals for the NEW id AND pulls
//     that period's balance (past-period category aggregates come from balance).

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, cleanup, screen, act } from '@testing-library/react';
import { useState } from 'react';
import { HomeMount } from '../HomeMount';
import {
  SelectedPeriodProvider,
  PosterRouterProvider,
  PosterRouterView,
  RefetchTokenProvider,
  useSelectedPeriod,
} from '../../common';
import type { PeriodRead, BalanceResponse } from '../../../api/types';
import { clearCache } from '../../../api/cache';

const listAccountsMock = vi.fn();
const listCategoriesV10Mock = vi.fn();
const listActualV10Mock = vi.fn();
const listPlannedMock = vi.fn();
const listPeriodsMock = vi.fn();
const getCurrentPeriodMock = vi.fn();
const getPeriodBalanceMock = vi.fn();
const getHomeMock = vi.fn();

vi.mock('../../../api/v10', () => ({
  listAccounts: (...a: unknown[]) => listAccountsMock(...a),
  listCategoriesV10: (...a: unknown[]) => listCategoriesV10Mock(...a),
  listActualV10: (...a: unknown[]) => listActualV10Mock(...a),
  listPlanned: (...a: unknown[]) => listPlannedMock(...a),
}));

vi.mock('../../../api/periods', () => ({
  listPeriods: (...a: unknown[]) => listPeriodsMock(...a),
  getCurrentPeriod: (...a: unknown[]) => getCurrentPeriodMock(...a),
  getPeriodBalance: (...a: unknown[]) => getPeriodBalanceMock(...a),
}));

// HomeMount adopts GET /api/v1/home on the in-shell ACTIVE-period path (the
// perceived-speed bootstrap). The PAST/closed period still uses the granular
// listActualV10 + getPeriodBalance path (the bootstrap only carries the
// current period), which is exactly what this test asserts after the switch.
vi.mock('../../../api/home', async () => {
  const actual =
    await vi.importActual<typeof import('../../../api/home')>(
      '../../../api/home',
    );
  return {
    ...actual,
    getHome: (...a: unknown[]) => getHomeMock(...a),
  };
});

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
  clearCache();
  listAccountsMock.mockResolvedValue([]);
  listCategoriesV10Mock.mockResolvedValue([
    { id: 1, name: 'Кафе', code: 'cafe', ord: '01' },
  ]);
  listActualV10Mock.mockResolvedValue([]);
  listPlannedMock.mockResolvedValue([]);
  listPeriodsMock.mockResolvedValue([ACTIVE, PAST_MAY]); // newest-first
  getCurrentPeriodMock.mockResolvedValue(ACTIVE);
  getPeriodBalanceMock.mockResolvedValue(MAY_BALANCE);
  // Active-period bootstrap (mirrors the granular active-period fixtures).
  getHomeMock.mockResolvedValue({
    user: { tg_user_id: 1, role: 'owner' },
    accounts: [],
    categories: [{ id: 1, name: 'Кафе', code: 'cafe', ord: '01' }],
    period: ACTIVE,
    balance: null,
    actuals: [],
  });
});

afterEach(() => {
  cleanup();
  clearCache();
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

    // Initial active-period load goes through the /home bootstrap (single
    // round-trip) — not the granular listActualV10 path.
    expect(getHomeMock).toHaveBeenCalled();
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

// Merged from former HomeMount.refetch.test.tsx (DEBT-02): when V10MainShell
// bumps the RefetchTokenProvider value (e.g. after AddSheet submit), HomeMount
// re-runs its fetch effect and surfaces the new token via the sentinel.
function RefetchHarness() {
  const [token, setToken] = useState(0);
  return (
    <RefetchTokenProvider value={token}>
      <SelectedPeriodProvider>
        <PosterRouterProvider root={<HomeMount />}>
          <PosterRouterView />
          <button
            type="button"
            data-testid="bump-token"
            onClick={() => setToken((t) => t + 1)}
          >
            bump
          </button>
        </PosterRouterProvider>
      </SelectedPeriodProvider>
    </RefetchTokenProvider>
  );
}

describe('HomeMount — refetch token wiring (DEBT-02)', () => {
  it('re-runs the fetch effect + surfaces the new token when refetchToken bumps', async () => {
    render(<RefetchHarness />);
    await flushPromises();
    const initialHomeCalls = getHomeMock.mock.calls.length;
    expect(initialHomeCalls).toBeGreaterThan(0);
    expect(
      screen.getByTestId('parent-refetched').getAttribute('data-refetch-token'),
    ).toBe('0');

    await act(async () => {
      screen.getByTestId('bump-token').click();
    });
    await flushPromises();

    expect(getHomeMock.mock.calls.length).toBeGreaterThan(initialHomeCalls);
    expect(
      screen.getByTestId('parent-refetched').getAttribute('data-refetch-token'),
    ).toBe('1');
  });
});
