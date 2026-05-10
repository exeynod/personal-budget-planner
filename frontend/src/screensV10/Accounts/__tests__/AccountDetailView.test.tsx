// Phase 27-04 Task 2: AccountDetailView presenter tests.
//
// Coverage (ACCT-V10-04):
//   - Mass italic bank name visible
//   - subtitle from formatBankSubtitle
//   - 2 KPI plates: «БАЛАНС» + balance value, «В МАЕ · N ОПЕРАЦИЙ» + sum
//   - operations list rows + sub-line «cat · {day month}»
//   - empty state copy «Нет операций по этому счёту»
//   - ← НАЗАД click → onBack
//   - tx row click → onTxRowTap(id)
//   - loading / error sub-views
//   - period=null hides month KPI title gracefully

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { AccountDetailView } from '../AccountDetailView';
import type {
  AccountResponse,
  ActualV10Read,
  CategoryV10,
} from '../../../api/v10';

afterEach(cleanup);

function mkAccount(over: Partial<AccountResponse> = {}): AccountResponse {
  return {
    id: 1,
    bank: 'Т-Банк',
    kind: 'card',
    mask: '4408',
    balance_cents: 100000_00,
    primary: true,
    created_at: '2026-04-01T00:00:00+00:00',
    ...over,
  };
}

function mkActual(over: Partial<ActualV10Read> = {}): ActualV10Read {
  return {
    id: 1,
    period_id: 1,
    kind: 'expense',
    amount_cents: 1000_00,
    description: 'кофе',
    category_id: 1,
    tx_date: '2026-05-10',
    source: 'mini_app',
    created_at: '2026-05-10T10:00:00+00:00',
    account_id: 1,
    parent_txn_id: null,
    ...over,
  };
}

const cat: CategoryV10 = {
  id: 1,
  name: 'Кафе',
  kind: 'expense',
  is_archived: false,
  sort_order: 1,
  created_at: '2026-04-01T00:00:00+00:00',
};

const baseProps = {
  loading: false,
  error: null,
  canPop: true,
  onBack: vi.fn(),
  onTxRowTap: vi.fn(),
  bigFigAnimate: false as const,
  categories: [cat],
};

describe('AccountDetailView', () => {
  it('renders Mass italic bank name', () => {
    const acc = mkAccount({ bank: 'Тинькофф' });
    const { container } = render(
      <AccountDetailView
        {...baseProps}
        account={acc}
        actuals={[]}
        period={null}
      />,
    );
    expect(container.textContent).toContain('Тинькофф');
  });

  it('renders subtitle from formatBankSubtitle', () => {
    const acc = mkAccount({ kind: 'card', mask: '1234' });
    const { container } = render(
      <AccountDetailView
        {...baseProps}
        account={acc}
        actuals={[]}
        period={null}
      />,
    );
    expect(container.textContent).toContain('карта ·· 1234');
  });

  it('renders subtitle for cash account', () => {
    const acc = mkAccount({ kind: 'cash', mask: null });
    const { container } = render(
      <AccountDetailView
        {...baseProps}
        account={acc}
        actuals={[]}
        period={null}
      />,
    );
    expect(container.textContent).toContain('наличные');
  });

  it('renders БАЛАНС plate with balance/100', () => {
    const acc = mkAccount({ balance_cents: 12500_00 });
    const { getByTestId } = render(
      <AccountDetailView
        {...baseProps}
        account={acc}
        actuals={[]}
        period={null}
      />,
    );
    const plate = getByTestId('account-detail-balance-plate');
    expect(plate.textContent).toContain('БАЛАНС');
    expect(plate.textContent).toContain('12'); // 12500_00 / 100 = 12500 → contains '12' and '500'
    expect(plate.textContent).toContain('500');
  });

  it('renders «В МАЕ · N ОПЕРАЦИЙ» plate with sum', () => {
    const acc = mkAccount({ id: 1 });
    const actuals = [
      mkActual({ id: 1, account_id: 1, tx_date: '2026-05-10', amount_cents: 200_00 }),
      mkActual({ id: 2, account_id: 1, tx_date: '2026-05-15', amount_cents: -300_00 }),
    ];
    const { getByTestId } = render(
      <AccountDetailView
        {...baseProps}
        account={acc}
        actuals={actuals}
        period={{ period_start: '2026-05-01', period_end: '2026-05-31' }}
      />,
    );
    const plate = getByTestId('account-detail-ops-plate');
    expect(plate.textContent).toContain('В МАЕ');
    expect(plate.textContent).toContain('2 ОПЕРАЦИЙ');
    expect(plate.textContent).toContain('500');
  });

  it('renders operations list rows', () => {
    const acc = mkAccount({ id: 1 });
    const actuals = [
      mkActual({ id: 7, account_id: 1, description: 'кофе утром' }),
    ];
    const { getByTestId } = render(
      <AccountDetailView
        {...baseProps}
        account={acc}
        actuals={actuals}
        period={null}
      />,
    );
    const row = getByTestId('account-detail-tx-row-7');
    expect(row.textContent).toContain('кофе утром');
    expect(row.textContent).toContain('Кафе');
  });

  it('renders empty state when no operations', () => {
    const acc = mkAccount({ id: 1 });
    const { container } = render(
      <AccountDetailView
        {...baseProps}
        account={acc}
        actuals={[]}
        period={null}
      />,
    );
    expect(container.textContent).toContain('Нет операций по этому счёту');
  });

  it('← НАЗАД click → onBack', () => {
    const onBack = vi.fn();
    const acc = mkAccount({ id: 1 });
    const { getByText } = render(
      <AccountDetailView
        {...baseProps}
        onBack={onBack}
        account={acc}
        actuals={[]}
        period={null}
      />,
    );
    fireEvent.click(getByText(/НАЗАД/));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('tx row click → onTxRowTap(id)', () => {
    const onTxRowTap = vi.fn();
    const acc = mkAccount({ id: 1 });
    const actuals = [mkActual({ id: 99, account_id: 1 })];
    const { getByTestId } = render(
      <AccountDetailView
        {...baseProps}
        onTxRowTap={onTxRowTap}
        account={acc}
        actuals={actuals}
        period={null}
      />,
    );
    fireEvent.click(getByTestId('account-detail-tx-row-99'));
    expect(onTxRowTap).toHaveBeenCalledWith(99);
  });

  it('shows loading line', () => {
    const { getByTestId } = render(
      <AccountDetailView
        {...baseProps}
        loading
        account={null}
        actuals={[]}
        period={null}
      />,
    );
    expect(getByTestId('account-detail-loading').textContent).toContain('Загрузка');
  });

  it('shows error line', () => {
    const { getByTestId } = render(
      <AccountDetailView
        {...baseProps}
        error="boom"
        account={null}
        actuals={[]}
        period={null}
      />,
    );
    expect(getByTestId('account-detail-error').textContent).toContain('boom');
  });
});
