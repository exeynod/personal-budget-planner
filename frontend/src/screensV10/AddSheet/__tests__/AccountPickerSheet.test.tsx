// Phase 30-02 (DEBT-03): AccountPickerSheet — bottom-sheet account picker
// rendering, selection, badge, empty state.

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

afterEach(() => {
  cleanup();
});

describe('AccountPickerSheet — rendering', () => {
  it('renders nothing when closed', () => {
    render(
      <AccountPickerSheet
        isOpen={false}
        accounts={ACCOUNTS}
        selectedAccountId={1}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByTestId('account-picker-body')).toBeNull();
  });

  it('renders a row per account when open', () => {
    render(
      <AccountPickerSheet
        isOpen={true}
        accounts={ACCOUNTS}
        selectedAccountId={1}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('account-picker-row-1')).toBeInTheDocument();
    expect(screen.getByTestId('account-picker-row-2')).toBeInTheDocument();
  });

  it('renders ОСНОВНОЙ badge only on the primary account', () => {
    render(
      <AccountPickerSheet
        isOpen={true}
        accounts={ACCOUNTS}
        selectedAccountId={1}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('account-picker-badge-1')).toBeInTheDocument();
    expect(screen.queryByTestId('account-picker-badge-2')).toBeNull();
  });

  it('renders balance for each row (formatted in rubles)', () => {
    render(
      <AccountPickerSheet
        isOpen={true}
        accounts={ACCOUNTS}
        selectedAccountId={1}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    );
    const row1 = screen.getByTestId('account-picker-row-1');
    // 100_00 cents → 100 rubles. We render «100 ₽» (formatRubles strips
    // trailing «,00» when the cents portion is zero — exact format may
    // include a thin space or comma, so match digit + ₽).
    expect(row1.textContent).toMatch(/100/);
    expect(row1.textContent).toMatch(/₽/);
  });

  it('selected row has aria-pressed=true and renders ✓', () => {
    render(
      <AccountPickerSheet
        isOpen={true}
        accounts={ACCOUNTS}
        selectedAccountId={2}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    );
    const row2 = screen.getByTestId('account-picker-row-2');
    expect(row2.getAttribute('aria-pressed')).toBe('true');
    expect(row2.textContent).toMatch(/✓/);
    const row1 = screen.getByTestId('account-picker-row-1');
    expect(row1.getAttribute('aria-pressed')).toBe('false');
    expect(row1.textContent).not.toMatch(/✓/);
  });

  it('empty-state caption when accounts list is empty', () => {
    render(
      <AccountPickerSheet
        isOpen={true}
        accounts={[]}
        selectedAccountId={null}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('account-picker-empty')).toBeInTheDocument();
  });
});

describe('AccountPickerSheet — interactions', () => {
  it('tapping a row calls onSelect with that account id', () => {
    const onSelect = vi.fn();
    render(
      <AccountPickerSheet
        isOpen={true}
        accounts={ACCOUNTS}
        selectedAccountId={1}
        onSelect={onSelect}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('account-picker-row-2'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('clicking backdrop calls onClose', () => {
    const onClose = vi.fn();
    render(
      <AccountPickerSheet
        isOpen={true}
        accounts={ACCOUNTS}
        selectedAccountId={1}
        onSelect={() => {}}
        onClose={onClose}
      />,
    );
    // PosterSheet exposes the backdrop with testId === testId prop value.
    fireEvent.click(screen.getByTestId('account-picker-sheet'));
    expect(onClose).toHaveBeenCalled();
  });
});
