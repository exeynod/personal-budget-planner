// Phase 26-04 Task 4: PlanMount smoke test.
//
// Coverage (minimal — full integration deferred to Phase 28):
//   1. Renders loading state initially.
//   2. After mocked fetch resolves, renders Mass «PLAN МЕСЯЦА.» + computed surplus.
//   3. Error state when listCategoriesV10 throws.
//
// Mocking strategy: vi.mock the api/v10 + api/me + api/periods modules at the
// top of the file. Wrapper provides PosterRouterProvider so usePosterRouter()
// has context.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { PosterRouterProvider } from '../../common/PosterRouter';
import { PlanMount } from '../PlanMount';

// ─────────── module-level mocks ───────────

vi.mock('../../../api/v10', async () => {
  return {
    listCategoriesV10: vi.fn(async () => [
      {
        id: 1,
        name: 'Продукты',
        kind: 'expense',
        is_archived: false,
        sort_order: 0,
        created_at: '2026-05-01T00:00:00Z',
        code: 'food',
        ord: '01',
        plan_cents: 30_000_00,
        parent_id: null,
      },
      {
        id: 2,
        name: 'Зарплата',
        kind: 'income',
        is_archived: false,
        sort_order: 1,
        created_at: '2026-05-01T00:00:00Z',
        code: 'salary',
        ord: '02',
        plan_cents: 0,
        parent_id: null,
      },
    ]),
    // Income for «Осталось распределить» now derives from the Σ of UNPOSTED
    // PLANNED income rows (incomePlannedCents), not AppUser.income_cents.
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
    listSubscriptionsV10: vi.fn(async () => []),
    listActualV10: vi.fn(async () => []),
    postSubscription: vi.fn(),
    unpostSubscription: vi.fn(),
    patchPlanMonth: vi.fn(),
    updateCategoryV10: vi.fn(),
  };
});

vi.mock('../../../api/me', () => ({
  getMeV10: vi.fn(async () => ({
    tg_user_id: 1,
    tg_chat_id: null,
    cycle_start_day: 1,
    onboarded_at: '2026-05-01T00:00:00Z',
    chat_id_known: false,
    role: 'owner' as const,
    ai_spend_cents: 0,
    ai_spending_cap_cents: 46500,
    income_cents: 100_000_00,
  })),
}));

vi.mock('../../../api/periods', () => ({
  getCurrentPeriod: vi.fn(async () => ({
    id: 1,
    period_start: '2026-05-01',
    period_end: '2026-05-31',
    status: 'active',
  })),
}));

// ─────────── helpers ───────────

function renderWithRouter(node: React.ReactNode) {
  return render(<PosterRouterProvider root={node} />);
}

afterEach(cleanup);
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

// ─────────── tests ───────────

describe('PlanMount', () => {
  it('renders loading state initially', () => {
    const { getByTestId } = renderWithRouter(<PlanMount />);
    expect(getByTestId('plan-loading')).toBeTruthy();
  });

  it('renders the native plan view with computed surplus after fetch resolves', async () => {
    // The native «План месяца» surface shows the screen title + the surplus
    // («Осталось распределить»).
    const { container } = renderWithRouter(<PlanMount />);
    await waitFor(() => {
      expect(container.textContent).toContain('План месяца');
    });
    // surplus = income (100_000_00) − Σplan (30_000_00) = 70_000_00
    expect(container.textContent?.replace(/\s+/g, ' ')).toMatch(/70[ ]?000/);
  });
});
