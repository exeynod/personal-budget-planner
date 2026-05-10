// Phase 30-02 (DEBT-02): TransactionsMount refetch wiring — symmetric to
// HomeMount. Bumping the RefetchTokenProvider value re-runs the registry
// fetch effect and updates the `parent-refetched` sentinel.

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import {
  render,
  cleanup,
  screen,
  act,
} from '@testing-library/react';
import { useState } from 'react';
import { TransactionsMount } from '../TransactionsMount';
import {
  RefetchTokenProvider,
  PosterRouterProvider,
  PosterRouterView,
} from '../../common';

const listAccountsMock = vi.fn();
const listCategoriesV10Mock = vi.fn();
const listActualV10Mock = vi.fn();
const getCurrentPeriodMock = vi.fn();

vi.mock('../../../api/v10', () => ({
  listAccounts: (...args: unknown[]) => listAccountsMock(...args),
  listCategoriesV10: (...args: unknown[]) => listCategoriesV10Mock(...args),
  listActualV10: (...args: unknown[]) => listActualV10Mock(...args),
}));

vi.mock('../../../api/periods', () => ({
  getCurrentPeriod: (...args: unknown[]) => getCurrentPeriodMock(...args),
}));

vi.mock('../../../api/actual', () => ({
  deleteActual: vi.fn(),
}));

beforeEach(() => {
  listAccountsMock.mockResolvedValue([]);
  listCategoriesV10Mock.mockResolvedValue([]);
  listActualV10Mock.mockResolvedValue([]);
  getCurrentPeriodMock.mockResolvedValue(null);
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
  });
}

function Harness() {
  const [token, setToken] = useState(0);
  return (
    <RefetchTokenProvider value={token}>
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
    </RefetchTokenProvider>
  );
}

describe('TransactionsMount — refetch token wiring (DEBT-02)', () => {
  it('renders the parent-refetched sentinel with the current token value', async () => {
    render(<Harness />);
    await flushPromises();
    const sentinel = screen.getByTestId('parent-refetched');
    expect(sentinel.getAttribute('data-refetch-token')).toBe('0');
  });

  it('re-runs the fetch effect when refetchToken bumps', async () => {
    render(<Harness />);
    await flushPromises();
    const initialAccountsCalls = listAccountsMock.mock.calls.length;
    const initialCatsCalls = listCategoriesV10Mock.mock.calls.length;
    const initialPeriodCalls = getCurrentPeriodMock.mock.calls.length;
    expect(initialAccountsCalls).toBeGreaterThan(0);

    await act(async () => {
      screen.getByTestId('bump-token').click();
    });
    await flushPromises();

    expect(listAccountsMock.mock.calls.length).toBeGreaterThan(initialAccountsCalls);
    expect(listCategoriesV10Mock.mock.calls.length).toBeGreaterThan(initialCatsCalls);
    expect(getCurrentPeriodMock.mock.calls.length).toBeGreaterThan(initialPeriodCalls);

    const sentinel = screen.getByTestId('parent-refetched');
    expect(sentinel.getAttribute('data-refetch-token')).toBe('1');
  });
});
