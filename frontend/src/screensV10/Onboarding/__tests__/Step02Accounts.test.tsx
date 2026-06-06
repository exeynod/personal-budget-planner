// Phase 24-04: Step02Accounts + pluralisation helpers.
// Trimmed to 1 happy + 1 invalid per behaviour; RU plural forms protected.

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

describe('pluralAccounts / pluraliseHint', () => {
  it('RU plural forms: счёт / счёта / счётов incl. 11..14 exception', () => {
    expect(pluralAccounts(1)).toBe('счёт');
    expect(pluralAccounts(21)).toBe('счёт');
    expect(pluralAccounts(2)).toBe('счёта');
    expect(pluralAccounts(24)).toBe('счёта');
    expect(pluralAccounts(5)).toBe('счётов');
    expect(pluralAccounts(11)).toBe('счётов'); // exception
  });

  it('hint: empty prompt, then «N счёт{form} · total ₽»', () => {
    expect(pluraliseHint([])).toBe('нужен минимум один счёт');
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
    expect(pluraliseHint([accounts[0]])).toMatch(/^1 счёт · 50.000 ₽$/);
    expect(pluraliseHint(accounts)).toMatch(/^2 счёта · 60.000 ₽$/); // total 60k
  });
});

describe('Step02Accounts — render', () => {
  it('smoke: headline, eyebrow, 4 chips, no form initially', () => {
    render(<Step02Accounts accounts={[]} dispatch={vi.fn()} />);
    expect(screen.getByText(/Где лежат/)).toBeInTheDocument();
    expect(screen.getByText('ВСЕ КАРТЫ И НАЛИЧНЫЕ')).toBeInTheDocument();
    for (const chip of ['Т-Банк', 'Сбер', 'Наличные']) {
      expect(screen.getByText(chip)).toBeInTheDocument();
    }
    expect(screen.getByText(/Добавить/)).toBeInTheDocument();
    expect(screen.queryByText('НОВЫЙ СЧЁТ')).not.toBeInTheDocument();
  });
});

describe('Step02Accounts — form', () => {
  it('predefined chip → read-only header; «+ Добавить» → editable input', () => {
    const { rerender } = render(
      <Step02Accounts accounts={[]} dispatch={vi.fn()} />,
    );
    fireEvent.click(screen.getByText('Т-Банк'));
    expect(
      screen.getByLabelText('Название счёта (предустановлено)').textContent,
    ).toBe('Т-Банк');
    expect(screen.queryByLabelText('Название счёта')).not.toBeInTheDocument();
    rerender(<Step02Accounts accounts={[]} dispatch={vi.fn()} />);
    cleanup();
    render(<Step02Accounts accounts={[]} dispatch={vi.fn()} />);
    fireEvent.click(screen.getByText(/Добавить/));
    expect(screen.getByLabelText('Название счёта')).toBeInTheDocument();
  });

  it('happy: save dispatches ADD_ACCOUNT (bank uppercased, rubles→cents) + closes', () => {
    const dispatch = vi.fn();
    render(<Step02Accounts accounts={[]} dispatch={dispatch} />);
    fireEvent.click(screen.getByText('Т-Банк'));
    fireEvent.change(screen.getByLabelText('Баланс счёта, рубли'), {
      target: { value: '50000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ДОБАВИТЬ' }));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'ADD_ACCOUNT',
      payload: { bank: 'Т-БАНК', kind: 'card', balance_cents: 5_000_000 },
    });
    expect(screen.queryByText('НОВЫЙ СЧЁТ')).not.toBeInTheDocument();
  });

  it('invalid path: ОТМЕНА closes form without dispatching', () => {
    const dispatch = vi.fn();
    render(<Step02Accounts accounts={[]} dispatch={dispatch} />);
    fireEvent.click(screen.getByText('Сбер'));
    fireEvent.click(screen.getByRole('button', { name: 'ОТМЕНА' }));
    expect(dispatch).not.toHaveBeenCalled();
    expect(screen.queryByText('НОВЫЙ СЧЁТ')).not.toBeInTheDocument();
  });
});

describe('Step02Accounts — existing rows', () => {
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

  it('rows render; star → SET_PRIMARY, × → REMOVE_ACCOUNT, primary marked', () => {
    const dispatch = vi.fn();
    render(<Step02Accounts accounts={accounts} dispatch={dispatch} />);
    expect(screen.getByText('НАЛИЧНЫЕ')).toBeInTheDocument();
    fireEvent.click(
      screen.getAllByRole('button', { name: /Сделать основным/ })[1],
    );
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_PRIMARY',
      payload: { index: 1 },
    });
    fireEvent.click(screen.getAllByRole('button', { name: /Удалить счёт/ })[0]);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'REMOVE_ACCOUNT',
      payload: { index: 0 },
    });
    const primaryRow = screen.getByText('Т-БАНК').closest('div')?.parentElement;
    expect(primaryRow && within(primaryRow).getByText(/основной/)).toBeTruthy();
  });
});
