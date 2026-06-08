// ADR-0008 — PlanningGate unit tests.
//
// Coverage:
//   1. Renders the gate header + «План месяца» summary (income / limits /
//      «осталось распределить») after the mocked fetches resolve.
//   2. «Готово» calls confirmPlan(periodId) then onDone (gate lifts).
//   3. manual mode shows a close affordance; gate mode does not.
//
// Mocking: vi.mock the v10 + periods api so no network is hit. The gate hosts
// its OWN PosterRouterProvider, so no wrapper is needed.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  render,
  cleanup,
  waitFor,
  fireEvent,
  screen,
} from '@testing-library/react';
import { PlanningGate } from '../PlanningGate';

const PERIOD = {
  id: 7,
  period_start: '2026-06-01',
  period_end: '2026-06-30',
  starting_balance_cents: 0,
  ending_balance_cents: null,
  status: 'active' as const,
  closed_at: null,
  planned_at: null,
};

const confirmPlanMock = vi.fn(async (_periodId: number) => ({
  ...PERIOD,
  planned_at: 'x',
}));

vi.mock('../../../api/v10', () => ({
  listCategoriesV10: vi.fn(async () => [
    {
      id: 1,
      name: 'Продукты',
      kind: 'expense',
      code: 'food',
      ord: '01',
      is_archived: false,
      sort_order: 0,
      plan_cents: 30_000_00,
      parent_id: null,
      created_at: '2026-06-01T00:00:00Z',
    },
    {
      id: 2,
      name: 'Зарплата',
      kind: 'income',
      code: 'salary',
      ord: '01',
      is_archived: false,
      sort_order: 1,
      plan_cents: 0,
      parent_id: null,
      created_at: '2026-06-01T00:00:00Z',
    },
  ]),
  listPlanned: vi.fn(async () => [
    {
      id: 10,
      category_id: 2,
      kind: 'income',
      amount_cents: 100_000_00,
      posted_txn_id: null,
      planned_date: null,
      source: 'manual',
    },
  ]),
  listRecurringDue: vi.fn(async () => []),
  payRecurring: vi.fn(),
  skipRecurring: vi.fn(),
  postponeRecurring: vi.fn(),
}));

vi.mock('../../../api/periods', () => ({
  getCurrentPeriod: vi.fn(async () => PERIOD),
  confirmPlan: (periodId: number) => confirmPlanMock(periodId),
}));

describe('PlanningGate', () => {
  beforeEach(() => {
    confirmPlanMock.mockClear();
  });
  afterEach(() => cleanup());

  it('renders the month header + plan summary', async () => {
    render(<PlanningGate mode="gate" period={PERIOD} onDone={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByText('План на Июнь 2026')).toBeInTheDocument(),
    );
    // Income 100 000, limits 30 000 → remaining 70 000.
    expect(screen.getByTestId('planning-gate-remaining')).toHaveTextContent(
      /70\s?000/,
    );
  });

  it('«Готово» confirms the plan then calls onDone', async () => {
    const onDone = vi.fn();
    render(<PlanningGate mode="gate" period={PERIOD} onDone={onDone} />);
    const done = await screen.findByTestId('planning-gate-done');
    fireEvent.click(done);
    await waitFor(() => expect(confirmPlanMock).toHaveBeenCalledWith(7));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it('gate mode has no close button', async () => {
    render(<PlanningGate mode="gate" period={PERIOD} onDone={vi.fn()} />);
    await screen.findByTestId('planning-gate-done');
    expect(screen.queryByTestId('planning-gate-close')).toBeNull();
  });

  it('manual mode shows a close button that calls onClose', async () => {
    const onClose = vi.fn();
    render(
      <PlanningGate
        mode="manual"
        period={PERIOD}
        onDone={vi.fn()}
        onClose={onClose}
      />,
    );
    const close = await screen.findByTestId('planning-gate-close');
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalled();
  });
});
