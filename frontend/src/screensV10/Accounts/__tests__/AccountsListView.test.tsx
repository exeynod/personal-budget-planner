// Phase 27-04 Task 2: AccountsListView presenter tests.
//
// Coverage (ACCT-V10-01..03):
//   - Mass italic «Счета.» visible
//   - eyebrow «ACCOUNTS / СЧЕТА»
//   - dark plate «СУММАРНО» + sumBalances + «{N} счетов»
//   - rows: bank UPPER + subtitle (formatBankSubtitle) + balance + ОСНОВНОЙ badge for primary
//   - row tap → onAccountTap(id)
//   - CTA «+ ДОБАВИТЬ СЧЁТ» click → onAddAccount
//   - CTA «ПЕРЕВОД SOON» disabled (no onTransfer call)
//   - canPop=false hides ← НАЗАД; canPop=true shows + onBack click works
//   - empty state copy
//   - loading / error sub-views

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { AccountsListView } from '../AccountsListView';
import type { AccountResponse } from '../../../api/v10';

afterEach(cleanup);

function mkAccount(over: Partial<AccountResponse> = {}): AccountResponse {
  return {
    id: 1,
    bank: 'Т-Банк',
    kind: 'card',
    mask: '4408',
    balance_cents: 50000_00,
    primary: false,
    created_at: '2026-04-01T00:00:00+00:00',
    ...over,
  };
}

const noopProps = {
  loading: false,
  error: null,
  onAccountTap: vi.fn(),
  onAddAccount: vi.fn(),
  onTransfer: vi.fn(),
  canPop: false,
  onBack: vi.fn(),
  bigFigAnimate: false as const,
};

describe('AccountsListView', () => {
  it('renders Mass italic «Счета.» headline', () => {
    const { container } = render(
      <AccountsListView {...noopProps} accounts={[]} />,
    );
    expect(container.textContent).toContain('Счета.');
  });

  it('renders eyebrow «ACCOUNTS / СЧЕТА»', () => {
    const { container } = render(
      <AccountsListView {...noopProps} accounts={[]} />,
    );
    expect(container.textContent).toContain('ACCOUNTS');
    expect(container.textContent).toContain('СЧЕТА');
  });

  it('dark plate shows СУММАРНО + sum + «N счетов»', () => {
    const accounts = [
      mkAccount({ id: 1, balance_cents: 10000_00 }),
      mkAccount({ id: 2, balance_cents: 25000_00 }),
    ];
    const { container, getByTestId } = render(
      <AccountsListView {...noopProps} accounts={accounts} />,
    );
    const plate = getByTestId('accounts-summary-plate');
    expect(plate.textContent).toContain('СУММАРНО');
    // BigFig formats with U+202F thousand separator → '35 000'
    expect(plate.textContent).toContain('35');
    expect(plate.textContent).toContain('000');
    expect(container.textContent).toContain('2 счетов');
  });

  it('renders rows with bank UPPER + subtitle + balance', () => {
    const accounts = [
      mkAccount({ id: 7, bank: 'Сбер', kind: 'card', mask: '1234', balance_cents: 12500_00 }),
    ];
    const { container, getByTestId } = render(
      <AccountsListView {...noopProps} accounts={accounts} />,
    );
    expect(container.textContent).toContain('СБЕР');
    expect(container.textContent).toContain('карта ·· 1234');
    expect(container.textContent).toContain('12');
    expect(container.textContent).toContain('500');
    expect(getByTestId('account-row-7')).toBeTruthy();
  });

  it('renders ОСНОВНОЙ badge only for primary accounts', () => {
    const accounts = [
      mkAccount({ id: 1, primary: true }),
      mkAccount({ id: 2, primary: false }),
    ];
    const { container } = render(
      <AccountsListView {...noopProps} accounts={accounts} />,
    );
    const matches = container.textContent?.match(/ОСНОВНОЙ/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it('row tap → onAccountTap(id)', () => {
    const onAccountTap = vi.fn();
    const accounts = [mkAccount({ id: 42 })];
    const { getByTestId } = render(
      <AccountsListView
        {...noopProps}
        onAccountTap={onAccountTap}
        accounts={accounts}
      />,
    );
    fireEvent.click(getByTestId('account-row-42'));
    expect(onAccountTap).toHaveBeenCalledTimes(1);
    expect(onAccountTap).toHaveBeenCalledWith(42);
  });

  it('+ ДОБАВИТЬ СЧЁТ click → onAddAccount', () => {
    const onAddAccount = vi.fn();
    const { getByText } = render(
      <AccountsListView
        {...noopProps}
        onAddAccount={onAddAccount}
        accounts={[]}
      />,
    );
    fireEvent.click(getByText('+ ДОБАВИТЬ СЧЁТ'));
    expect(onAddAccount).toHaveBeenCalledTimes(1);
  });

  it('ПЕРЕВОД is disabled (does not call onTransfer)', () => {
    const onTransfer = vi.fn();
    const { container } = render(
      <AccountsListView
        {...noopProps}
        onTransfer={onTransfer}
        accounts={[]}
      />,
    );
    // Find the disabled button
    const buttons = Array.from(container.querySelectorAll('button'));
    const transferBtn = buttons.find((b) => b.textContent?.includes('ПЕРЕВОД'));
    expect(transferBtn).toBeTruthy();
    expect((transferBtn as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(transferBtn!);
    expect(onTransfer).not.toHaveBeenCalled();
    // SOON badge present
    expect(container.textContent).toContain('SOON');
  });

  it('canPop=false hides ← НАЗАД', () => {
    const { container } = render(
      <AccountsListView {...noopProps} canPop={false} accounts={[]} />,
    );
    expect(container.textContent).not.toContain('НАЗАД');
  });

  it('canPop=true shows ← НАЗАД and click → onBack', () => {
    const onBack = vi.fn();
    const { getByText } = render(
      <AccountsListView
        {...noopProps}
        canPop
        onBack={onBack}
        accounts={[]}
      />,
    );
    fireEvent.click(getByText(/НАЗАД/));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('renders empty-state copy when no accounts', () => {
    const { container } = render(
      <AccountsListView {...noopProps} accounts={[]} />,
    );
    expect(container.textContent).toContain('Нет счетов');
  });

  it('shows loading line', () => {
    const { getByTestId } = render(
      <AccountsListView {...noopProps} loading accounts={[]} />,
    );
    expect(getByTestId('accounts-loading').textContent).toContain('Загрузка');
  });

  it('shows error line', () => {
    const { getByTestId } = render(
      <AccountsListView
        {...noopProps}
        error="Не удалось загрузить"
        accounts={[]}
      />,
    );
    expect(getByTestId('accounts-error').textContent).toContain('Не удалось');
  });
});
