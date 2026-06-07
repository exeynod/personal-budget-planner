// v1.1 (AGREED §G2): Step 02 is now a single «Стартовый баланс» field —
// the «счета» multi-account concept is hidden. Lean: 1 happy + 1 invalid.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';
import { Step02Accounts } from '../Step02Accounts';

afterEach(cleanup);

describe('Step02Accounts — single starting balance', () => {
  it('happy: typing rubles dispatches SET_STARTING_BALANCE (rubles→cents)', () => {
    const dispatch = vi.fn();
    render(<Step02Accounts balanceCents={0} hasAccount dispatch={dispatch} />);
    // Headline + eyebrow render; no «счета» chips/list anymore.
    expect(screen.getByText(/Сколько денег/)).toBeInTheDocument();
    expect(screen.getByText('СТАРТОВЫЙ БАЛАНС')).toBeInTheDocument();
    expect(screen.queryByText('Т-Банк')).not.toBeInTheDocument();
    expect(screen.queryByText(/Добавить/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Стартовый баланс, рубли'), {
      target: { value: '50000' },
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_STARTING_BALANCE',
      payload: { balance_cents: 5_000_000 },
    });
  });

  it('invalid/edge: clearing a filled input → balance 0; negative (долг) parses', () => {
    const dispatch = vi.fn();
    // Render with an existing balance so the controlled input is non-empty,
    // then clearing it produces a real change event → balance 0.
    render(
      <Step02Accounts
        balanceCents={1_000_000}
        hasAccount
        dispatch={dispatch}
      />,
    );
    const input = screen.getByLabelText('Стартовый баланс, рубли');
    fireEvent.change(input, { target: { value: '' } });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_STARTING_BALANCE',
      payload: { balance_cents: 0 },
    });
    fireEvent.change(input, { target: { value: '-1200' } });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_STARTING_BALANCE',
      payload: { balance_cents: -120_000 },
    });
  });

  it('seeds a 0-balance account on mount when none present', () => {
    const dispatch = vi.fn();
    render(
      <Step02Accounts
        balanceCents={0}
        hasAccount={false}
        dispatch={dispatch}
      />,
    );
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_STARTING_BALANCE',
      payload: { balance_cents: 0 },
    });
  });
});
