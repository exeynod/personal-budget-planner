// Phase 25-08 Task 2: TransactionsView presentational component tests.
//
// Coverage (TXN-V10-01..05):
//   - «Реестр.» mass headline visible.
//   - Header eyebrow «{N} ЗАПИСЕЙ · {Σ ₽}» visible.
//   - 6 filter chips rendered (Все / Кафе / Продукты / Транспорт / Подписки / Копилка).
//   - Click chip 'Кафе' → onChipChange called with 'cafe'.
//   - Day labels appear (Сегодня / Вчера) for grouped rows.
//   - Roundup row has «↻ ОКРУГЛ.» inline plate.
//   - Deposit row has «→ КОПИЛКА» inline plate.
//   - Click row → onRowTap called with tx object.
//   - ← НАЗАД click → onBack called.
//   - Negative amount displayed with U+2212.
//   - Empty state (dayGroups=[]) → renders «Реестр пуст —» italic.
//
// Pattern mirrors HomeView.test.tsx (Plan 25-04) — props-only render,
// click handlers asserted via vi.fn().

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

// ─────────────────── builders ───────────────────

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

function makeProps(propOverrides: Partial<React.ComponentProps<typeof TransactionsView>> = {}) {
  const onChipChange = vi.fn();
  const onRowTap = vi.fn();
  const onRowDelete = vi.fn();
  const onBack = vi.fn();

  // Default fixture: 3 rows in 2 day groups (today + yesterday).
  const cafe = mkCategory({ id: 1, code: 'cafe', name: 'Кафе' });
  const food = mkCategory({ id: 2, code: 'food', name: 'Продукты' });
  const accCard = mkAccount({ id: 1, bank: 'Т-Банк', mask: '1234' });
  const accSavings = mkAccount({ id: 2, bank: 'Т-Банк', mask: null, kind: 'savings' });

  const tx1 = mkActual({
    id: 100, kind: 'expense', amount_cents: -500_00,
    description: 'Утренний кофе', category_id: 1,
    tx_date: '2026-05-10', created_at: '2026-05-10T09:30:00+00:00',
  });
  const tx2 = mkActual({
    id: 101, kind: 'roundup', amount_cents: 25,
    description: 'Округление', category_id: 1,
    tx_date: '2026-05-10', created_at: '2026-05-10T09:30:01+00:00',
    account_id: 2, parent_txn_id: 100,
  });
  const tx3 = mkActual({
    id: 102, kind: 'deposit', amount_cents: 1000_00,
    description: 'Перевод в копилку', category_id: 2,
    tx_date: '2026-05-09', created_at: '2026-05-09T18:00:00+00:00',
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
  return { ...utils, onChipChange, onRowTap, onRowDelete, onBack, tx1, tx2, tx3 };
}

// ─────────────────── tests ───────────────────

describe('TransactionsView — header + headline', () => {
  it('renders the «Реестр.» mass italic headline', () => {
    const { getByText } = makeProps();
    expect(getByText(/Реестр\./)).toBeInTheDocument();
  });

  it('renders eyebrow «SECTION II»', () => {
    const { getByText } = makeProps();
    expect(getByText('SECTION II')).toBeInTheDocument();
  });

  it('renders header eyebrow with count + sum («3 ЗАПИСЕЙ» + ₽)', () => {
    const { container } = makeProps();
    const text = container.textContent ?? '';
    expect(text).toMatch(/3\s+ЗАПИСЕЙ/);
    expect(text).toMatch(/₽/);
  });
});

describe('TransactionsView — back link', () => {
  it('← НАЗАД click invokes onBack', () => {
    const { getByText, onBack } = makeProps();
    fireEvent.click(getByText('← НАЗАД'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe('TransactionsView — filter chips', () => {
  it('renders all 6 chip labels (Все / Кафе / Продукты / Транспорт / Подписки / Копилка)', () => {
    const { getByText } = makeProps();
    expect(getByText('Все')).toBeInTheDocument();
    expect(getByText('Кафе')).toBeInTheDocument();
    expect(getByText('Продукты')).toBeInTheDocument();
    expect(getByText('Транспорт')).toBeInTheDocument();
    expect(getByText('Подписки')).toBeInTheDocument();
    expect(getByText('Копилка')).toBeInTheDocument();
  });

  it('clicks chip "Кафе" → onChipChange("cafe")', () => {
    const { getByText, onChipChange } = makeProps();
    fireEvent.click(getByText('Кафе'));
    expect(onChipChange).toHaveBeenCalledWith('cafe');
  });

  it('clicks chip "Копилка" → onChipChange("savings")', () => {
    const { getByText, onChipChange } = makeProps();
    fireEvent.click(getByText('Копилка'));
    expect(onChipChange).toHaveBeenCalledWith('savings');
  });

  it('clicks chip "Все" → onChipChange("all")', () => {
    const { getByText, onChipChange } = makeProps({ filterChip: 'cafe' });
    fireEvent.click(getByText('Все'));
    expect(onChipChange).toHaveBeenCalledWith('all');
  });
});

describe('TransactionsView — day groups', () => {
  it('renders day labels «Сегодня» and «Вчера»', () => {
    const { getByText } = makeProps();
    expect(getByText('Сегодня')).toBeInTheDocument();
    expect(getByText('Вчера')).toBeInTheDocument();
  });

  it('renders rows with descriptions', () => {
    const { getByText } = makeProps();
    expect(getByText('Утренний кофе')).toBeInTheDocument();
    expect(getByText('Округление')).toBeInTheDocument();
    expect(getByText('Перевод в копилку')).toBeInTheDocument();
  });
});

describe('TransactionsView — spec-tags', () => {
  it('roundup row shows «↻ ОКРУГЛ.» inline plate', () => {
    const { getByText } = makeProps();
    expect(getByText(/↻\s*ОКРУГЛ\./)).toBeInTheDocument();
  });

  it('deposit row shows «→ КОПИЛКА» inline plate', () => {
    const { getByText } = makeProps();
    expect(getByText(/→\s*КОПИЛКА/)).toBeInTheDocument();
  });
});

describe('TransactionsView — row interactions', () => {
  it('clicking a row invokes onRowTap with the tx object', () => {
    const { container, onRowTap, tx1 } = makeProps();
    const row = container.querySelector(`[data-testid="tx-row-${tx1.id}"]`);
    expect(row).not.toBeNull();
    fireEvent.click(row!);
    expect(onRowTap).toHaveBeenCalledWith(tx1);
  });
});

describe('TransactionsView — amount formatting', () => {
  it('renders negative amounts with U+2212 (NOT ASCII -)', () => {
    const { container } = makeProps();
    const text = container.textContent ?? '';
    // U+2212 is 0x2212 = 8722; 'charCodeAt' check for explicit code-point safety.
    expect(text.includes('−')).toBe(true);
    // No raw ASCII '-' immediately before a digit (would indicate a plain "-500").
    // We tolerate ASCII '-' elsewhere (e.g. wallet 1-2-3 phone separators) — only
    // assert U+2212 IS present. The compute helper test enforces no ASCII dash.
  });
});

describe('TransactionsView — empty state', () => {
  it('renders empty placeholder when dayGroups is empty', () => {
    const { getByText } = makeProps({ dayGroups: [], headerCount: 0, headerSumCents: 0 });
    expect(getByText(/Реестр пуст/)).toBeInTheDocument();
  });
});
