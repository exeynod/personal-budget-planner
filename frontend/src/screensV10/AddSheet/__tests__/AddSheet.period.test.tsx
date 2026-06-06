// Phase P2 (period switching): AddSheet defaults the entry date INTO the
// viewed period when that period is closed/past.
//
// We render AddSheet inside a SelectedPeriodProvider whose only period is a
// long-past closed period (May 2020). Since "today" is always after that
// period's end, the clamped default date = period_end (2020-05-31). We assert:
//   - the «Своя дата» chip displays the clamped period_end date;
//   - the scope hint surfaces the target period («Май 2020»);
//   - the hidden date input carries the period's [min, max] bounds.

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, cleanup, screen, act } from '@testing-library/react';
import type { PeriodRead } from '../../../api/types';

const listAccountsMock = vi.fn();
const listCategoriesV10Mock = vi.fn();
const createActualV10Mock = vi.fn();
const listPeriodsMock = vi.fn();

vi.mock('../../../api/v10', () => ({
  listAccounts: (...a: unknown[]) => listAccountsMock(...a),
  listCategoriesV10: (...a: unknown[]) => listCategoriesV10Mock(...a),
  createActualV10: (...a: unknown[]) => createActualV10Mock(...a),
}));

vi.mock('../../../api/periods', () => ({
  listPeriods: (...a: unknown[]) => listPeriodsMock(...a),
  getCurrentPeriod: vi.fn(),
  getPeriodBalance: vi.fn(),
}));

import { AddSheet } from '../AddSheet';
import { SelectedPeriodProvider } from '../../common';

const PAST_MAY_2020: PeriodRead = {
  id: 42,
  period_start: '2020-05-01',
  period_end: '2020-05-31',
  starting_balance_cents: 0,
  ending_balance_cents: null,
  status: 'closed',
  closed_at: '2020-06-01T00:00:00+00:00',
};

beforeEach(() => {
  listAccountsMock.mockResolvedValue([]);
  listCategoriesV10Mock.mockResolvedValue([]);
  listPeriodsMock.mockResolvedValue([PAST_MAY_2020]);
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

describe('AddSheet — period-aware date default (Phase P2)', () => {
  it('defaults the date into the viewed past period (clamped to period_end)', async () => {
    render(
      <SelectedPeriodProvider>
        <AddSheet onSubmitted={vi.fn()} onClose={vi.fn()} />
      </SelectedPeriodProvider>,
    );
    await flushPromises();

    // «Своя дата» chip now reflects the clamped default = period_end.
    expect(screen.getByText('2020-05-31')).toBeTruthy();

    // Scope hint names the target period.
    const hint = screen.getByTestId('add-sheet-period-scope');
    expect(hint.textContent).toContain('Май 2020');

    // Date input is bounded to the period.
    const dateInput = document.querySelector(
      'input[type="date"]',
    ) as HTMLInputElement | null;
    expect(dateInput).not.toBeNull();
    expect(dateInput!.min).toBe('2020-05-01');
    expect(dateInput!.max).toBe('2020-05-31');
  });

  it('does NOT scope the date when there is no provider (legacy default)', async () => {
    render(<AddSheet onSubmitted={vi.fn()} onClose={vi.fn()} />);
    await flushPromises();

    // No scope hint; the default «Сегодня» chip is active (legacy behaviour).
    expect(screen.queryByTestId('add-sheet-period-scope')).toBeNull();
    expect(screen.getByText('Своя дата')).toBeTruthy();
  });
});
