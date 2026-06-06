// Phase P2 (period switching): SelectedPeriodProvider unit tests.
//
// Covers:
//   - default selection = the active period (status === 'active'), even when
//     it is not the newest in the list;
//   - fallback to the newest period when there is no active one;
//   - setSelectedPeriodId switches the selection;
//   - the soft-fallback hook returns null outside the provider.

import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, cleanup, screen, act } from '@testing-library/react';
import {
  SelectedPeriodProvider,
  useSelectedPeriod,
  useSelectedPeriodOptional,
} from '../SelectedPeriodProvider';
import type { PeriodRead } from '../../../api/types';

const listPeriodsMock = vi.fn();

vi.mock('../../../api/periods', () => ({
  listPeriods: (...args: unknown[]) => listPeriodsMock(...args),
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

/** Probe component that surfaces the provider API via data attributes. */
function Probe() {
  const { selectedPeriodId, periods, setSelectedPeriodId, loading } =
    useSelectedPeriod();
  return (
    <div>
      <span data-testid="selected">{String(selectedPeriodId)}</span>
      <span data-testid="count">{periods.length}</span>
      <span data-testid="loading">{String(loading)}</span>
      <button
        type="button"
        data-testid="pick-2"
        onClick={() => setSelectedPeriodId(2)}
      >
        pick
      </button>
    </div>
  );
}

describe('SelectedPeriodProvider (Phase P2)', () => {
  it('defaults the selection to the ACTIVE period (not the newest)', async () => {
    // Newest-first: id=3 (June, closed) is newest, id=2 (May, ACTIVE) is the
    // one we should default to even though it is not first.
    listPeriodsMock.mockResolvedValue([
      period({
        id: 3,
        period_start: '2026-06-01',
        period_end: '2026-06-30',
        status: 'closed',
      }),
      period({
        id: 2,
        period_start: '2026-05-01',
        period_end: '2026-05-31',
        status: 'active',
      }),
      period({
        id: 1,
        period_start: '2026-04-01',
        period_end: '2026-04-30',
        status: 'closed',
      }),
    ]);

    render(
      <SelectedPeriodProvider>
        <Probe />
      </SelectedPeriodProvider>,
    );
    await flushPromises();

    expect(screen.getByTestId('count').textContent).toBe('3');
    expect(screen.getByTestId('selected').textContent).toBe('2');
    expect(screen.getByTestId('loading').textContent).toBe('false');
  });

  it('falls back to the newest period when there is no active one', async () => {
    listPeriodsMock.mockResolvedValue([
      period({
        id: 9,
        period_start: '2026-06-01',
        period_end: '2026-06-30',
        status: 'closed',
      }),
      period({
        id: 8,
        period_start: '2026-05-01',
        period_end: '2026-05-31',
        status: 'closed',
      }),
    ]);

    render(
      <SelectedPeriodProvider>
        <Probe />
      </SelectedPeriodProvider>,
    );
    await flushPromises();

    expect(screen.getByTestId('selected').textContent).toBe('9');
  });

  it('setSelectedPeriodId switches the viewed period', async () => {
    listPeriodsMock.mockResolvedValue([
      period({
        id: 3,
        status: 'active',
        period_start: '2026-06-01',
        period_end: '2026-06-30',
      }),
      period({ id: 2, status: 'closed' }),
    ]);

    render(
      <SelectedPeriodProvider>
        <Probe />
      </SelectedPeriodProvider>,
    );
    await flushPromises();
    expect(screen.getByTestId('selected').textContent).toBe('3');

    await act(async () => {
      screen.getByTestId('pick-2').click();
    });
    expect(screen.getByTestId('selected').textContent).toBe('2');
  });
});

describe('useSelectedPeriodOptional — soft fallback', () => {
  function OptionalProbe() {
    const ctx = useSelectedPeriodOptional();
    return <span data-testid="ctx">{ctx === null ? 'null' : 'present'}</span>;
  }

  it('returns null when rendered outside the provider', () => {
    render(<OptionalProbe />);
    expect(screen.getByTestId('ctx').textContent).toBe('null');
  });
});
