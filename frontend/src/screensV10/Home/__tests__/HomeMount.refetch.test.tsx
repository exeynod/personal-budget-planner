// Phase 30-02 (DEBT-02): HomeMount refetch wiring — when V10MainShell bumps
// the RefetchTokenProvider value (e.g. after AddSheet submit), HomeMount
// re-runs its fetch effect AND surfaces the new token via the
// `parent-refetched` sentinel.
//
// We mock the v10 API + periods modules so the test focuses on the
// re-fetch behaviour, not network plumbing.

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, cleanup, screen, act } from '@testing-library/react';
import { useState } from 'react';
import { HomeMount } from '../HomeMount';
import {
  RefetchTokenProvider,
  PosterRouterProvider,
  PosterRouterView,
} from '../../common';

const listAccountsMock = vi.fn();
const listCategoriesV10Mock = vi.fn();
const listActualV10Mock = vi.fn();
const listPlannedMock = vi.fn();
const getCurrentPeriodMock = vi.fn();

vi.mock('../../../api/v10', () => ({
  listAccounts: (...args: unknown[]) => listAccountsMock(...args),
  listCategoriesV10: (...args: unknown[]) => listCategoriesV10Mock(...args),
  listActualV10: (...args: unknown[]) => listActualV10Mock(...args),
  listPlanned: (...args: unknown[]) => listPlannedMock(...args),
}));

vi.mock('../../../api/periods', () => ({
  getCurrentPeriod: (...args: unknown[]) => getCurrentPeriodMock(...args),
}));

beforeEach(() => {
  listAccountsMock.mockResolvedValue([]);
  listCategoriesV10Mock.mockResolvedValue([]);
  listActualV10Mock.mockResolvedValue([]);
  listPlannedMock.mockResolvedValue([]);
  // null → no active period → actuals fetch is skipped, which is fine for
  // this test (we only care that the fetch effect re-runs).
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

/**
 * Test harness that mirrors V10MainShell's RefetchTokenProvider wiring:
 * a button bumps the token, simulating what AddSheet.onSubmitted does.
 */
function Harness() {
  const [token, setToken] = useState(0);
  return (
    <RefetchTokenProvider value={token}>
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
    </RefetchTokenProvider>
  );
}

describe('HomeMount — refetch token wiring (DEBT-02)', () => {
  it('renders the parent-refetched sentinel with the current token value', async () => {
    render(<Harness />);
    await flushPromises();
    const sentinel = screen.getByTestId('parent-refetched');
    expect(sentinel.getAttribute('data-refetch-token')).toBe('0');
  });

  it('re-runs the fetch effect when refetchToken bumps', async () => {
    render(<Harness />);
    await flushPromises();
    // Initial mount → one call each of listAccounts / listCategoriesV10 /
    // getCurrentPeriod (listActualV10 is gated on period non-null).
    const initialAccountsCalls = listAccountsMock.mock.calls.length;
    const initialCatsCalls = listCategoriesV10Mock.mock.calls.length;
    const initialPeriodCalls = getCurrentPeriodMock.mock.calls.length;
    expect(initialAccountsCalls).toBeGreaterThan(0);

    // Bump the token (simulates AddSheet onSubmitted in V10MainShell).
    await act(async () => {
      screen.getByTestId('bump-token').click();
    });
    await flushPromises();

    // Each fetch leaf should have been called again.
    expect(listAccountsMock.mock.calls.length).toBeGreaterThan(
      initialAccountsCalls,
    );
    expect(listCategoriesV10Mock.mock.calls.length).toBeGreaterThan(
      initialCatsCalls,
    );
    expect(getCurrentPeriodMock.mock.calls.length).toBeGreaterThan(
      initialPeriodCalls,
    );

    // Sentinel surfaces the new token value.
    const sentinel = screen.getByTestId('parent-refetched');
    expect(sentinel.getAttribute('data-refetch-token')).toBe('1');
  });
});
