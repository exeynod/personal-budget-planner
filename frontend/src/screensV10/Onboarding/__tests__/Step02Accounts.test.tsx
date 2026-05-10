// Phase 24-04: Step02Accounts integration tests + pluraliseHint helper.
//
// Covers must_haves:
//   - Renders 4 chips (Т-Банк / Сбер / Наличные / + Добавить)
//   - Tap predefined chip → form opens with read-only bank header
//   - Tap «+ Добавить» → form opens with editable bank input
//   - Save flow → ADD_ACCOUNT dispatched with normalised payload, form closes
//   - Star click → SET_PRIMARY {index}; × click → REMOVE_ACCOUNT {index}
//   - pluraliseHint Russian rules: 0/1/2/3/4/5/11/21/22/25
// Threat coverage:
//   - T-24-04-01: bank trim+slice — exercised via AccountBalanceForm save path
//   - T-24-04-04: first added account auto-marked primary — reducer-level

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  render,
  fireEvent,
  screen,
  cleanup,
  within,
} from '@testing-library/react';
import { Step02Accounts } from '../Step02Accounts';
import { pluraliseHint, pluralAccounts } from '../format';
import type { OnboardingAccount } from '../types';

afterEach(cleanup);

describe('pluralAccounts', () => {
  it('returns "счёт" for 1 / 21 / 31 / 101', () => {
    expect(pluralAccounts(1)).toBe('счёт');
    expect(pluralAccounts(21)).toBe('счёт');
    expect(pluralAccounts(31)).toBe('счёт');
    expect(pluralAccounts(101)).toBe('счёт');
  });

  it('returns "счёта" for 2 / 3 / 4 / 22 / 23 / 24', () => {
    expect(pluralAccounts(2)).toBe('счёта');
    expect(pluralAccounts(3)).toBe('счёта');
    expect(pluralAccounts(4)).toBe('счёта');
    expect(pluralAccounts(22)).toBe('счёта');
    expect(pluralAccounts(23)).toBe('счёта');
    expect(pluralAccounts(24)).toBe('счёта');
  });

  it('returns "счётов" for 5 / 6 / 11 / 12 / 13 / 14 / 25 / 100', () => {
    expect(pluralAccounts(5)).toBe('счётов');
    expect(pluralAccounts(6)).toBe('счётов');
    expect(pluralAccounts(11)).toBe('счётов');
    expect(pluralAccounts(12)).toBe('счётов');
    expect(pluralAccounts(13)).toBe('счётов');
    expect(pluralAccounts(14)).toBe('счётов');
    expect(pluralAccounts(25)).toBe('счётов');
    expect(pluralAccounts(100)).toBe('счётов');
  });
});

describe('pluraliseHint', () => {
  it('returns onboarding prompt when accounts list is empty', () => {
    expect(pluraliseHint([])).toBe('нужен минимум один счёт');
  });

  it('formats 1 account as «1 счёт · sum ₽»', () => {
    const accounts: OnboardingAccount[] = [
      {
        bank: 'Т-БАНК',
        kind: 'card',
        balance_cents: 5_000_000,
        primary: true,
        mask: null,
      },
    ];
    const hint = pluraliseHint(accounts);
    // 5_000_000 cents = 50_000 ₽ → "50{thin}000"
    expect(hint).toMatch(/^1 счёт · 50.000 ₽$/);
  });

  it('formats 2 accounts as «2 счёта · total ₽»', () => {
    const accounts: OnboardingAccount[] = [
      { bank: 'Т-БАНК', kind: 'card', balance_cents: 5_000_000, primary: true, mask: null },
      { bank: 'НАЛИЧНЫЕ', kind: 'cash', balance_cents: 1_000_000, primary: false, mask: null },
    ];
    const hint = pluraliseHint(accounts);
    // total = 6_000_000 cents = 60_000 ₽
    expect(hint).toMatch(/^2 счёта · 60.000 ₽$/);
  });

  it('formats 5 accounts as «5 счётов · total ₽»', () => {
    const accounts: OnboardingAccount[] = Array.from({ length: 5 }, () => ({
      bank: 'X',
      kind: 'card' as const,
      balance_cents: 1_000_000,
      primary: false,
      mask: null,
    }));
    const hint = pluraliseHint(accounts);
    // total = 5_000_000 cents = 50_000 ₽
    expect(hint).toMatch(/^5 счётов · 50.000 ₽$/);
  });
});

describe('Step02Accounts — chip-list', () => {
  it('renders 4 chips by default (Т-Банк / Сбер / Наличные / + Добавить)', () => {
    render(<Step02Accounts accounts={[]} dispatch={vi.fn()} />);
    expect(screen.getByText('Т-Банк')).toBeInTheDocument();
    expect(screen.getByText('Сбер')).toBeInTheDocument();
    expect(screen.getByText('Наличные')).toBeInTheDocument();
    expect(screen.getByText(/Добавить/)).toBeInTheDocument();
  });

  it('renders the headline + sub-eyebrow', () => {
    render(<Step02Accounts accounts={[]} dispatch={vi.fn()} />);
    expect(screen.getByText(/Где лежат/)).toBeInTheDocument();
    expect(screen.getByText('ВСЕ КАРТЫ И НАЛИЧНЫЕ')).toBeInTheDocument();
  });

  it('does not render the form initially', () => {
    render(<Step02Accounts accounts={[]} dispatch={vi.fn()} />);
    // НОВЫЙ СЧЁТ eyebrow appears only when form is open.
    expect(screen.queryByText('НОВЫЙ СЧЁТ')).not.toBeInTheDocument();
  });
});

describe('Step02Accounts — open form via predefined chip', () => {
  it('clicking «Т-Банк» opens form with read-only bank header', () => {
    render(<Step02Accounts accounts={[]} dispatch={vi.fn()} />);
    fireEvent.click(screen.getByText('Т-Банк'));
    expect(screen.getByText('НОВЫЙ СЧЁТ')).toBeInTheDocument();
    // The read-only bank display has aria-label "Название счёта (предустановлено)"
    const readonly = screen.getByLabelText('Название счёта (предустановлено)');
    expect(readonly.textContent).toBe('Т-Банк');
    // No editable bank input (only the balance text input).
    expect(screen.queryByLabelText('Название счёта')).not.toBeInTheDocument();
  });

  it('clicking «+ Добавить» opens form with editable bank input', () => {
    render(<Step02Accounts accounts={[]} dispatch={vi.fn()} />);
    fireEvent.click(screen.getByText(/Добавить/));
    expect(screen.getByText('НОВЫЙ СЧЁТ')).toBeInTheDocument();
    expect(screen.getByLabelText('Название счёта')).toBeInTheDocument();
  });
});

describe('Step02Accounts — save flow', () => {
  it('Т-Банк → balance 50000 → ДОБАВИТЬ dispatches ADD_ACCOUNT and closes form', () => {
    const dispatch = vi.fn();
    render(<Step02Accounts accounts={[]} dispatch={dispatch} />);
    fireEvent.click(screen.getByText('Т-Банк'));
    const balanceInput = screen.getByLabelText(
      'Баланс счёта, рубли',
    ) as HTMLInputElement;
    fireEvent.change(balanceInput, { target: { value: '50000' } });
    // Find the ДОБАВИТЬ button inside the form (case-sensitive exact match).
    const saveBtn = screen.getByRole('button', { name: 'ДОБАВИТЬ' });
    fireEvent.click(saveBtn);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'ADD_ACCOUNT',
      payload: {
        bank: 'Т-БАНК',
        kind: 'card',
        balance_cents: 5_000_000,
      },
    });
    // Form closes after save.
    expect(screen.queryByText('НОВЫЙ СЧЁТ')).not.toBeInTheDocument();
  });

  it('+ Добавить → free-text "Альфа" → balance 0 → ДОБАВИТЬ dispatches ADD_ACCOUNT', () => {
    const dispatch = vi.fn();
    render(<Step02Accounts accounts={[]} dispatch={dispatch} />);
    fireEvent.click(screen.getByText(/Добавить/));
    const bankInput = screen.getByLabelText('Название счёта') as HTMLInputElement;
    fireEvent.change(bankInput, { target: { value: 'Альфа' } });
    const saveBtn = screen.getByRole('button', { name: 'ДОБАВИТЬ' });
    fireEvent.click(saveBtn);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'ADD_ACCOUNT',
      payload: {
        bank: 'АЛЬФА',
        kind: 'card',
        balance_cents: 0,
      },
    });
  });

  it('ОТМЕНА closes the form without dispatching', () => {
    const dispatch = vi.fn();
    render(<Step02Accounts accounts={[]} dispatch={dispatch} />);
    fireEvent.click(screen.getByText('Сбер'));
    fireEvent.click(screen.getByRole('button', { name: 'ОТМЕНА' }));
    expect(dispatch).not.toHaveBeenCalled();
    expect(screen.queryByText('НОВЫЙ СЧЁТ')).not.toBeInTheDocument();
  });
});

describe('Step02Accounts — existing account rows', () => {
  const accounts: OnboardingAccount[] = [
    {
      bank: 'Т-БАНК',
      kind: 'card',
      balance_cents: 5_000_000,
      primary: true,
      mask: null,
    },
    {
      bank: 'НАЛИЧНЫЕ',
      kind: 'cash',
      balance_cents: 1_000_000,
      primary: false,
      mask: null,
    },
  ];

  it('renders one row per account with bank name', () => {
    render(<Step02Accounts accounts={accounts} dispatch={vi.fn()} />);
    expect(screen.getByText('Т-БАНК')).toBeInTheDocument();
    expect(screen.getByText('НАЛИЧНЫЕ')).toBeInTheDocument();
  });

  it('star on idx 1 dispatches SET_PRIMARY {index:1}', () => {
    const dispatch = vi.fn();
    render(<Step02Accounts accounts={accounts} dispatch={dispatch} />);
    // Star buttons are aria-labelled "Сделать основным" (idx) — find by index.
    const stars = screen.getAllByRole('button', { name: /Сделать основным/ });
    expect(stars.length).toBe(2);
    fireEvent.click(stars[1]);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_PRIMARY',
      payload: { index: 1 },
    });
  });

  it('× on idx 0 dispatches REMOVE_ACCOUNT {index:0}', () => {
    const dispatch = vi.fn();
    render(<Step02Accounts accounts={accounts} dispatch={dispatch} />);
    const removeBtns = screen.getAllByRole('button', { name: /Удалить счёт/ });
    expect(removeBtns.length).toBe(2);
    fireEvent.click(removeBtns[0]);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'REMOVE_ACCOUNT',
      payload: { index: 0 },
    });
  });

  it('marks the primary account row with «· основной»', () => {
    render(<Step02Accounts accounts={accounts} dispatch={vi.fn()} />);
    const primaryRow = screen.getByText('Т-БАНК').closest('div')?.parentElement;
    expect(primaryRow).not.toBeNull();
    if (primaryRow) {
      expect(within(primaryRow).getByText(/основной/)).toBeInTheDocument();
    }
  });
});
