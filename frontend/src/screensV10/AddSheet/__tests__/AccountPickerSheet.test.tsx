// Phase 30-02 (DEBT-03): AccountPickerSheet bottom-sheet picker.
// Trimmed: closed/open render + selection/badge/empty states + interactions.
// NOTE: AccountPickerSheet is still LIVE web code (savings removed backend-side).

import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, fireEvent, cleanup, screen } from '@testing-library/react';
import type { AccountResponse } from '../../../api/v10';
import { AccountPickerSheet } from '../AccountPickerSheet';

const ACCOUNTS: AccountResponse[] = [
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

afterEach(cleanup);

function renderSheet(
  over: Partial<React.ComponentProps<typeof AccountPickerSheet>> = {},
) {
  return render(
    <AccountPickerSheet
      isOpen
      accounts={ACCOUNTS}
      selectedAccountId={1}
      onSelect={() => {}}
      onClose={() => {}}
      {...over}
    />,
  );
}

describe('AccountPickerSheet — render', () => {
  it('closed → renders nothing', () => {
    renderSheet({ isOpen: false });
    expect(screen.queryByTestId('account-picker-body')).toBeNull();
  });

  it('open: row per account, ОСНОВНОЙ badge on primary only, balance, selection ✓', () => {
    renderSheet({ selectedAccountId: 2 });
    expect(screen.getByTestId('account-picker-row-1')).toBeInTheDocument();
    expect(screen.getByTestId('account-picker-row-2')).toBeInTheDocument();
    expect(screen.getByTestId('account-picker-badge-1')).toBeInTheDocument();
    expect(screen.queryByTestId('account-picker-badge-2')).toBeNull();
    const row1 = screen.getByTestId('account-picker-row-1');
    expect(row1.textContent).toMatch(/100/);
    expect(row1.textContent).toMatch(/₽/);
    const row2 = screen.getByTestId('account-picker-row-2');
    expect(row2.getAttribute('aria-pressed')).toBe('true');
    expect(row2.textContent).toMatch(/✓/);
    expect(row1.getAttribute('aria-pressed')).toBe('false');
  });

  it('empty accounts → empty-state caption', () => {
    renderSheet({ accounts: [], selectedAccountId: null });
    expect(screen.getByTestId('account-picker-empty')).toBeInTheDocument();
  });
});

describe('AccountPickerSheet — interactions', () => {
  it('row tap → onSelect(id); backdrop → onClose', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    renderSheet({ onSelect, onClose });
    fireEvent.click(screen.getByTestId('account-picker-row-2'));
    expect(onSelect).toHaveBeenCalledWith(2);
    fireEvent.click(screen.getByTestId('account-picker-sheet')); // backdrop
    expect(onClose).toHaveBeenCalled();
  });
});
