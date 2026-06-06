// Phase 25-08 Task 2: TransactionsView presentational component.
//
// Trimmed to smoke-render + empty state + key interactions (chip change,
// row tap, swipe/context-menu delete). Amount/sign formatting is covered by
// computeTransactions.test.ts.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { TransactionsView } from '../TransactionsView';
import type { TxDayGroup } from '../computeTransactions';
import type {
  ActualV10Read,
  AccountResponse,
  CategoryV10,
} from '../../../api/v10';

afterEach(cleanup);

function mkCategory(over: Partial<CategoryV10> = {}): CategoryV10 {
  return {
    id: 1,
    name: 'Кафе',
    kind: 'expense',
    is_archived: false,
    sort_order: 10,
    created_at: '2026-04-01T00:00:00+00:00',
    code: 'cafe',
    ord: '01',
    plan_cents: 0,
    rollover: 'misc',
    paused: false,
    parent_id: null,
    ...over,
  };
}

function mkAccount(over: Partial<AccountResponse> = {}): AccountResponse {
  return {
    id: 1,
    bank: 'Т-Банк',
    mask: '1234',
    kind: 'card',
    balance_cents: 0,
    primary: true,
    created_at: '2026-04-15T08:30:00+00:00',
    ...over,
  };
}

function mkActual(over: Partial<ActualV10Read> = {}): ActualV10Read {
  return {
    id: 100,
    period_id: 1,
    kind: 'expense',
    amount_cents: -500_00,
    description: 'Утренний кофе',
    category_id: 1,
    tx_date: '2026-05-10',
    source: 'mini_app',
    created_at: '2026-05-10T09:30:00+00:00',
    account_id: 1,
    parent_txn_id: null,
    ...over,
  };
}

function makeProps(
  propOverrides: Partial<React.ComponentProps<typeof TransactionsView>> = {},
) {
  const onChipChange = vi.fn();
  const onRowTap = vi.fn();
  const onRowDelete = vi.fn();
  const onBack = vi.fn();

  const cafe = mkCategory({ id: 1, code: 'cafe', name: 'Кафе' });
  const food = mkCategory({ id: 2, code: 'food', name: 'Продукты' });
  const accCard = mkAccount({ id: 1, bank: 'Т-Банк', mask: '1234' });
  const accSavings = mkAccount({
    id: 2,
    bank: 'Т-Банк',
    mask: null,
    kind: 'savings',
  });

  const tx1 = mkActual({
    id: 100,
    kind: 'expense',
    amount_cents: -500_00,
    description: 'Утренний кофе',
    category_id: 1,
    tx_date: '2026-05-10',
    created_at: '2026-05-10T09:30:00+00:00',
  });
  const tx2 = mkActual({
    id: 101,
    kind: 'roundup',
    amount_cents: 25,
    description: 'Округление',
    category_id: 1,
    tx_date: '2026-05-10',
    created_at: '2026-05-10T09:30:01+00:00',
    account_id: 2,
    parent_txn_id: 100,
  });
  const tx3 = mkActual({
    id: 102,
    kind: 'deposit',
    amount_cents: 1000_00,
    description: 'Перевод в копилку',
    category_id: 2,
    tx_date: '2026-05-09',
    created_at: '2026-05-09T18:00:00+00:00',
    account_id: 2,
  });

  const dayGroups: TxDayGroup[] = [
    {
      dateLabel: 'Сегодня',
      dateKey: '2026-05-10',
      rows: [tx2, tx1],
      sumCents: 500_00 + 25,
    },
    {
      dateLabel: 'Вчера',
      dateKey: '2026-05-09',
      rows: [tx3],
      sumCents: 1000_00,
    },
  ];

  const utils = render(
    <TransactionsView
      headerCount={3}
      headerSumCents={500_00 + 25 + 1000_00}
      filterChip="all"
      onChipChange={onChipChange}
      dayGroups={dayGroups}
      categories={[cafe, food]}
      accounts={[accCard, accSavings]}
      onRowTap={onRowTap}
      onRowDelete={onRowDelete}
      onBack={onBack}
      {...propOverrides}
    />,
  );
  return {
    ...utils,
    onChipChange,
    onRowTap,
    onRowDelete,
    onBack,
    tx1,
    tx2,
    tx3,
  };
}

describe('TransactionsView — render', () => {
  it('smoke: headline, header summary, 6 chips, day labels, rows + tags', () => {
    const { getByText, container } = makeProps();
    expect(getByText(/Реестр\./)).toBeInTheDocument();
    expect(container.textContent ?? '').toMatch(/3\s+ЗАПИСЕЙ/);
    for (const chip of [
      'Все',
      'Кафе',
      'Продукты',
      'Транспорт',
      'Подписки',
      'Копилка',
    ]) {
      expect(getByText(chip)).toBeInTheDocument();
    }
    expect(getByText('Сегодня')).toBeInTheDocument();
    expect(getByText('Вчера')).toBeInTheDocument();
    expect(getByText('Утренний кофе')).toBeInTheDocument();
    expect(getByText(/↻\s*ОКРУГЛ\./)).toBeInTheDocument(); // roundup tag
    expect(getByText(/→\s*КОПИЛКА/)).toBeInTheDocument(); // deposit tag
    expect((container.textContent ?? '').includes('−')).toBe(true); // U+2212
  });

  it('empty state «Реестр пуст»', () => {
    const { getByText } = makeProps({
      dayGroups: [],
      headerCount: 0,
      headerSumCents: 0,
    });
    expect(getByText(/Реестр пуст/)).toBeInTheDocument();
  });
});

describe('TransactionsView — interactions', () => {
  it('chip click → onChipChange(code); ← НАЗАД → onBack', () => {
    const { getByText, onChipChange, onBack } = makeProps();
    fireEvent.click(getByText('Кафе'));
    expect(onChipChange).toHaveBeenCalledWith('cafe');
    fireEvent.click(getByText('Копилка'));
    expect(onChipChange).toHaveBeenCalledWith('savings');
    fireEvent.click(getByText('← НАЗАД'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('row tap → onRowTap(tx)', () => {
    const { container, onRowTap, tx1 } = makeProps();
    fireEvent.click(
      container.querySelector(`[data-testid="tx-row-${tx1.id}"]`)!,
    );
    expect(onRowTap).toHaveBeenCalledWith(tx1);
  });

  it('swipe «УДАЛИТЬ» action → onRowDelete(tx), not onRowTap', () => {
    const { container, onRowDelete, onRowTap, tx1 } = makeProps();
    const action = container.querySelector(
      `[data-testid="tx-swipe-action-${tx1.id}"]`,
    );
    expect(action?.textContent).toMatch(/УДАЛИТЬ/);
    fireEvent.click(action!);
    expect(onRowDelete).toHaveBeenCalledWith(tx1);
    expect(onRowTap).not.toHaveBeenCalled();
  });

  it('right-click context-menu: delete calls onRowDelete; cancel/backdrop close without deleting', () => {
    const { container, onRowDelete, onRowTap, tx1 } = makeProps();
    const sel = `[data-testid="tx-context-menu-${tx1.id}"]`;
    const row = () =>
      container.querySelector(`[data-testid="tx-row-${tx1.id}"]`)!;
    // open + delete
    fireEvent.contextMenu(row());
    expect(container.querySelector(sel)).not.toBeNull();
    fireEvent.click(
      container.querySelector(
        `[data-testid="tx-context-menu-delete-${tx1.id}"]`,
      )!,
    );
    expect(onRowDelete).toHaveBeenCalledWith(tx1);
    expect(onRowTap).not.toHaveBeenCalled();
    expect(container.querySelector(sel)).toBeNull();
    // open + cancel
    onRowDelete.mockClear();
    fireEvent.contextMenu(row());
    fireEvent.click(
      container.querySelector(
        `[data-testid="tx-context-menu-cancel-${tx1.id}"]`,
      )!,
    );
    expect(onRowDelete).not.toHaveBeenCalled();
    expect(container.querySelector(sel)).toBeNull();
  });
});
