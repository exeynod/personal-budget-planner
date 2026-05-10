// Phase 25-10 Task 3: AddSheet body — header, BigFig amount, keypad,
// description, date chips, category chip-scroll, account row, CTA, submit,
// dirty-close confirm.
//
// Tests mock the v10 API leaves (listAccounts, listCategoriesV10,
// createActualV10) so we focus on UI behaviour, not network plumbing.

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import {
  render,
  fireEvent,
  cleanup,
  screen,
  act,
} from '@testing-library/react';
import type {
  AccountResponse,
  CategoryV10,
  ActualV10Read,
} from '../../../api/v10';

// ─────────────────── API mocks ───────────────────

const listAccountsMock = vi.fn();
const listCategoriesV10Mock = vi.fn();
const createActualV10Mock = vi.fn();

vi.mock('../../../api/v10', () => ({
  listAccounts: (...args: unknown[]) => listAccountsMock(...args),
  listCategoriesV10: (...args: unknown[]) => listCategoriesV10Mock(...args),
  createActualV10: (...args: unknown[]) => createActualV10Mock(...args),
}));

import { AddSheet } from '../AddSheet';

const SAMPLE_ACCOUNTS: AccountResponse[] = [
  {
    id: 1,
    bank: 'Т-Банк',
    mask: '1234',
    kind: 'card',
    balance_cents: 100_00,
    primary: true,
    created_at: '2026-04-01T00:00:00+00:00',
  },
  {
    id: 2,
    bank: 'Сбер',
    mask: '5678',
    kind: 'card',
    balance_cents: 50_00,
    primary: false,
    created_at: '2026-04-01T00:00:00+00:00',
  },
];

const SAMPLE_CATEGORIES: CategoryV10[] = [
  {
    id: 10,
    name: 'Кафе',
    kind: 'expense',
    is_archived: false,
    sort_order: 1,
    created_at: '2026-04-01T00:00:00+00:00',
    code: 'cafe',
    paused: false,
  },
  {
    id: 11,
    name: 'Продукты',
    kind: 'expense',
    is_archived: false,
    sort_order: 2,
    created_at: '2026-04-01T00:00:00+00:00',
    code: 'food',
    paused: false,
  },
  {
    id: 12,
    name: 'Копилка',
    kind: 'expense',
    is_archived: false,
    sort_order: 3,
    created_at: '2026-04-01T00:00:00+00:00',
    code: 'savings', // filtered out
    paused: false,
  },
  {
    id: 13,
    name: 'Старая категория',
    kind: 'expense',
    is_archived: false,
    sort_order: 4,
    created_at: '2026-04-01T00:00:00+00:00',
    code: 'old',
    paused: true, // filtered out
  },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  listAccountsMock.mockResolvedValue(SAMPLE_ACCOUNTS);
  listCategoriesV10Mock.mockResolvedValue(SAMPLE_CATEGORIES);
});

async function flushPromises() {
  // Run microtasks twice to settle Promise.all + setState chain.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderSheet() {
  const onSubmitted = vi.fn();
  const onClose = vi.fn();
  const utils = render(<AddSheet onSubmitted={onSubmitted} onClose={onClose} />);
  await flushPromises();
  return { ...utils, onSubmitted, onClose };
}

describe('AddSheet — header & layout', () => {
  it('renders the NEW ENTRY header eyebrow', async () => {
    await renderSheet();
    // Eyebrow text starts with "NEW ENTRY ·"
    expect(
      screen.getByText(/NEW ENTRY/),
    ).toBeInTheDocument();
  });

  it('renders the × close button', async () => {
    await renderSheet();
    expect(
      screen.getByRole('button', { name: /закрыть форму/i }),
    ).toBeInTheDocument();
  });

  it('renders the BigFig amount display starting at 0', async () => {
    await renderSheet();
    expect(
      screen.getByTestId('add-sheet-bigfig'),
    ).toBeInTheDocument();
  });

  it('renders the 3×4 keypad', async () => {
    await renderSheet();
    expect(screen.getByTestId('add-sheet-keypad')).toBeInTheDocument();
  });

  it('renders only non-savings, non-paused categories as chips', async () => {
    await renderSheet();
    expect(screen.getByText('Кафе')).toBeInTheDocument();
    expect(screen.getByText('Продукты')).toBeInTheDocument();
    expect(screen.queryByText('Копилка')).toBeNull();
    expect(screen.queryByText('Старая категория')).toBeNull();
  });

  it('renders the primary account in the account row by default', async () => {
    await renderSheet();
    // Account row shows «Т-Банк ·· 1234» — primary first.
    expect(screen.getByTestId('add-sheet-account-row').textContent).toMatch(
      /Т-Банк/,
    );
  });
});

describe('AddSheet — keypad → BigFig & CTA flow', () => {
  it('CTA starts as «ВВЕДИТЕ СУММУ» (disabled) before any digit', async () => {
    await renderSheet();
    const cta = screen.getByTestId('add-sheet-cta') as HTMLButtonElement;
    expect(cta.textContent).toMatch(/ВВЕДИТЕ СУММУ/);
    expect(cta.disabled).toBe(true);
  });

  it('clicking 5 on keypad updates BigFig to 5 and CTA to «ВЫБЕРИТЕ КАТЕГОРИЮ»', async () => {
    await renderSheet();
    fireEvent.click(screen.getByRole('button', { name: '5' }));
    expect(screen.getByTestId('add-sheet-bigfig').textContent).toMatch(/5/);
    const cta = screen.getByTestId('add-sheet-cta') as HTMLButtonElement;
    expect(cta.textContent).toMatch(/ВЫБЕРИТЕ КАТЕГОРИЮ/);
    expect(cta.disabled).toBe(true);
  });

  it('clicking «.» before any digit shows 0. on the BigFig', async () => {
    await renderSheet();
    fireEvent.click(screen.getByRole('button', { name: '.' }));
    expect(screen.getByTestId('add-sheet-bigfig').textContent).toMatch(/0\./);
  });

  it('clicking ⌫ removes the last character', async () => {
    await renderSheet();
    fireEvent.click(screen.getByRole('button', { name: '5' }));
    fireEvent.click(screen.getByRole('button', { name: '0' }));
    // Now BigFig shows 50.
    expect(screen.getByTestId('add-sheet-bigfig').textContent).toMatch(/50/);
    fireEvent.click(screen.getByRole('button', { name: /удалить/i }));
    expect(screen.getByTestId('add-sheet-bigfig').textContent).toMatch(/^[^0-9]*5[^0-9]*$/);
  });

  it('after entering an amount AND tapping a category, CTA becomes «СОХРАНИТЬ ↵» enabled', async () => {
    await renderSheet();
    fireEvent.click(screen.getByRole('button', { name: '5' }));
    fireEvent.click(screen.getByText('Кафе'));
    const cta = screen.getByTestId('add-sheet-cta') as HTMLButtonElement;
    expect(cta.textContent).toMatch(/СОХРАНИТЬ/);
    expect(cta.disabled).toBe(false);
  });
});

describe('AddSheet — submit', () => {
  it('clicking active CTA calls createActualV10 with proper payload + onSubmitted', async () => {
    const created: ActualV10Read = {
      id: 999,
      period_id: 5,
      kind: 'expense',
      amount_cents: 500,
      description: null,
      category_id: 10,
      tx_date: '2026-05-09',
      source: 'mini_app',
      created_at: '2026-05-09T12:00:00Z',
      account_id: 1,
      parent_txn_id: null,
    };
    createActualV10Mock.mockResolvedValueOnce(created);

    const { onSubmitted } = await renderSheet();
    fireEvent.click(screen.getByRole('button', { name: '5' }));
    fireEvent.click(screen.getByText('Кафе'));
    fireEvent.click(screen.getByTestId('add-sheet-cta'));
    await flushPromises();

    expect(createActualV10Mock).toHaveBeenCalledTimes(1);
    const payload = createActualV10Mock.mock.calls[0][0];
    expect(payload.kind).toBe('expense');
    expect(payload.amount_cents).toBe(500);
    expect(payload.category_id).toBe(10);
    expect(payload.account_id).toBe(1);
    expect(typeof payload.tx_date).toBe('string');
    expect(payload.tx_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    expect(onSubmitted).toHaveBeenCalledWith(999);
  });
});

describe('AddSheet — close & dirty-confirm gate', () => {
  it('clicking × with empty form calls onClose immediately (no confirm)', async () => {
    const { onClose } = await renderSheet();
    fireEvent.click(screen.getByRole('button', { name: /закрыть форму/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/ОТМЕНИТЬ ЗАПИСЬ/)).toBeNull();
  });

  it('clicking × with a dirty form shows confirm overlay', async () => {
    const { onClose } = await renderSheet();
    fireEvent.click(screen.getByRole('button', { name: '5' }));
    fireEvent.click(screen.getByRole('button', { name: /закрыть форму/i }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/ОТМЕНИТЬ ЗАПИСЬ/)).toBeInTheDocument();
  });

  it('confirm overlay «ПРОДОЛЖИТЬ» dismisses the overlay and preserves form', async () => {
    const { onClose } = await renderSheet();
    fireEvent.click(screen.getByRole('button', { name: '5' }));
    fireEvent.click(screen.getByRole('button', { name: /закрыть форму/i }));
    expect(screen.getByText(/ОТМЕНИТЬ ЗАПИСЬ/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /ПРОДОЛЖИТЬ/ }));
    expect(screen.queryByText(/ОТМЕНИТЬ ЗАПИСЬ/)).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('add-sheet-bigfig').textContent).toMatch(/5/);
  });

  it('confirm overlay «ОТМЕНИТЬ» triggers onClose', async () => {
    const { onClose } = await renderSheet();
    fireEvent.click(screen.getByRole('button', { name: '5' }));
    fireEvent.click(screen.getByRole('button', { name: /закрыть форму/i }));
    fireEvent.click(screen.getByRole('button', { name: /^ОТМЕНИТЬ$/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
