// Phase 27-03: DepositSheet form tests (SAV-V10-04).

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup, screen } from '@testing-library/react';
import { DepositSheet } from '../DepositSheet';
import type { AccountResponse, GoalRead } from '../../../api/v10';

afterEach(cleanup);

function mkAcc(over: Partial<AccountResponse> = {}): AccountResponse {
  return {
    id: 1,
    bank: 'Tinkoff',
    mask: '1234',
    kind: 'card',
    balance_cents: 5_000_000,
    primary: true,
    created_at: '2026-04-01T00:00:00+00:00',
    ...over,
  };
}

function mkGoal(over: Partial<GoalRead> = {}): GoalRead {
  return {
    id: 1,
    name: 'iPhone',
    target_cents: 1_000_000,
    current_cents: 0,
    due: null,
    created_at: '2026-04-01T00:00:00+00:00',
    ...over,
  };
}

describe('DepositSheet', () => {
  it('renders amount input + account chips + goal chips', () => {
    render(
      <DepositSheet
        accounts={[mkAcc(), mkAcc({ id: 2, bank: 'Sber' })]}
        goals={[mkGoal()]}
        onSave={vi.fn()}
        onClose={vi.fn()}
        submitting={false}
      />,
    );
    expect(screen.getByTestId('deposit-amount-input')).toBeTruthy();
    expect(screen.getByText(/TINKOFF/)).toBeTruthy();
    expect(screen.getByText(/SBER/)).toBeTruthy();
    expect(screen.getByText('БЕЗ ЦЕЛИ')).toBeTruthy();
    expect(screen.getByText('IPHONE')).toBeTruthy();
  });

  it('СОХРАНИТЬ disabled until amount > 0 and account picked', () => {
    render(
      <DepositSheet
        accounts={[mkAcc()]}
        goals={[]}
        onSave={vi.fn()}
        onClose={vi.fn()}
        submitting={false}
      />,
    );
    // account auto-picked (first), but amount empty
    const btn = screen.getByText('СОХРАНИТЬ') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('positive amount + auto-picked account → СОХРАНИТЬ enabled; click invokes onSave', () => {
    const onSave = vi.fn();
    render(
      <DepositSheet
        accounts={[mkAcc({ id: 5 })]}
        goals={[]}
        onSave={onSave}
        onClose={vi.fn()}
        submitting={false}
      />,
    );
    fireEvent.change(screen.getByTestId('deposit-amount-input'), {
      target: { value: '1500' },
    });
    fireEvent.click(screen.getByText('СОХРАНИТЬ'));
    expect(onSave).toHaveBeenCalledWith({
      amount_cents: 150_000, // 1500 ₽ → cents
      account_id: 5,
      goal_id: null,
    });
  });

  it('selecting a goal chip passes goal_id', () => {
    const onSave = vi.fn();
    render(
      <DepositSheet
        accounts={[mkAcc({ id: 5 })]}
        goals={[mkGoal({ id: 7, name: 'Vacation' })]}
        onSave={onSave}
        onClose={vi.fn()}
        submitting={false}
      />,
    );
    fireEvent.change(screen.getByTestId('deposit-amount-input'), {
      target: { value: '2000' },
    });
    fireEvent.click(screen.getByText('VACATION'));
    fireEvent.click(screen.getByText('СОХРАНИТЬ'));
    expect(onSave).toHaveBeenCalledWith({
      amount_cents: 200_000,
      account_id: 5,
      goal_id: 7,
    });
  });

  it('strips non-digits from amount input', () => {
    render(
      <DepositSheet
        accounts={[mkAcc()]}
        goals={[]}
        onSave={vi.fn()}
        onClose={vi.fn()}
        submitting={false}
      />,
    );
    const input = screen.getByTestId('deposit-amount-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '12abc34' } });
    expect(input.value).toBe('1234');
  });

  it('shows hint when no accounts available', () => {
    const { container } = render(
      <DepositSheet
        accounts={[]}
        goals={[]}
        onSave={vi.fn()}
        onClose={vi.fn()}
        submitting={false}
      />,
    );
    expect(container.textContent).toContain('Нет доступных счетов');
  });

  it('ОТМЕНА click invokes onClose', () => {
    const onClose = vi.fn();
    render(
      <DepositSheet
        accounts={[mkAcc()]}
        goals={[]}
        onSave={vi.fn()}
        onClose={onClose}
        submitting={false}
      />,
    );
    fireEvent.click(screen.getByText('ОТМЕНА'));
    expect(onClose).toHaveBeenCalled();
  });

  it('respects initialGoalId pre-selection', () => {
    const onSave = vi.fn();
    render(
      <DepositSheet
        accounts={[mkAcc({ id: 5 })]}
        goals={[mkGoal({ id: 7, name: 'Vacation' })]}
        initialGoalId={7}
        onSave={onSave}
        onClose={vi.fn()}
        submitting={false}
      />,
    );
    fireEvent.change(screen.getByTestId('deposit-amount-input'), {
      target: { value: '500' },
    });
    fireEvent.click(screen.getByText('СОХРАНИТЬ'));
    expect(onSave).toHaveBeenCalledWith({
      amount_cents: 50_000,
      account_id: 5,
      goal_id: 7,
    });
  });
});
