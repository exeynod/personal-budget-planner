// Phase P2 (period switching): TransactionsMount re-fetches when the viewed
// period changes via the SelectedPeriodProvider.

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, cleanup, screen, act } from '@testing-library/react';
import { useState } from 'react';
import { TransactionsMount } from '../TransactionsMount';
import {
  SelectedPeriodProvider,
  PosterRouterProvider,
  PosterRouterView,
  RefetchTokenProvider,
  useSelectedPeriod,
} from '../../common';
import type { PeriodRead } from '../../../api/types';

const listAccountsMock = vi.fn();
const listCategoriesV10Mock = vi.fn();
const listActualV10Mock = vi.fn();
const listPeriodsMock = vi.fn();
const getCurrentPeriodMock = vi.fn();

vi.mock('../../../api/v10', () => ({
  listAccounts: (...a: unknown[]) => listAccountsMock(...a),
  listCategoriesV10: (...a: unknown[]) => listCategoriesV10Mock(...a),
  listActualV10: (...a: unknown[]) => listActualV10Mock(...a),
}));

vi.mock('../../../api/periods', () => ({
  listPeriods: (...a: unknown[]) => listPeriodsMock(...a),
  getCurrentPeriod: (...a: unknown[]) => getCurrentPeriodMock(...a),
  getPeriodBalance: vi.fn(),
}));

vi.mock('../../../api/actual', () => ({
  deleteActual: vi.fn(),
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
const PAST_MAY = period({ id: 5, status: 'closed' });

beforeEach(() => {
  listAccountsMock.mockResolvedValue([]);
  listCategoriesV10Mock.mockResolvedValue([]);
  listActualV10Mock.mockResolvedValue([]);
  listPeriodsMock.mockResolvedValue([ACTIVE, PAST_MAY]);
  getCurrentPeriodMock.mockResolvedValue(ACTIVE);
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
      <PosterRouterProvider root={<TransactionsMount />}>
        <PosterRouterView />
        <SwitchButton />
      </PosterRouterProvider>
    </SelectedPeriodProvider>
  );
}

describe('TransactionsMount — period switching re-fetch (Phase P2)', () => {
  it('fetches the active period actuals on mount, then re-fetches for the new id on switch', async () => {
    render(<Harness />);
    await flushPromises();

    expect(listActualV10Mock).toHaveBeenCalledWith(6);

    await act(async () => {
      screen.getByTestId('switch-to-may').click();
    });
    await flushPromises();

    expect(listActualV10Mock).toHaveBeenCalledWith(5);
  });
});

// Merged from former TransactionsMount.refetch.test.tsx (DEBT-02): bumping the
// RefetchTokenProvider value re-runs the registry fetch effect and updates the
// `parent-refetched` sentinel.
function RefetchHarness() {
  const [token, setToken] = useState(0);
  return (
    <RefetchTokenProvider value={token}>
      <SelectedPeriodProvider>
        <PosterRouterProvider root={<TransactionsMount />}>
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

describe('TransactionsMount — refetch token wiring (DEBT-02)', () => {
  it('re-runs the fetch effect + surfaces the new token when refetchToken bumps', async () => {
    render(<RefetchHarness />);
    await flushPromises();
    const initialActualCalls = listActualV10Mock.mock.calls.length;
    expect(
      screen.getByTestId('parent-refetched').getAttribute('data-refetch-token'),
    ).toBe('0');

    await act(async () => {
      screen.getByTestId('bump-token').click();
    });
    await flushPromises();

    expect(listActualV10Mock.mock.calls.length).toBeGreaterThan(
      initialActualCalls,
    );
    expect(
      screen.getByTestId('parent-refetched').getAttribute('data-refetch-token'),
    ).toBe('1');
  });
});
