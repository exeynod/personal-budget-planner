// Phase 27-04 Task 3: AccountsListMount smoke tests.
//
// Coverage:
//   - Renders loading then resolved list
//   - Calls listAccounts on mount
//   - createAccount called when sheet form is submitted
//
// Mocks the api/v10 module so the test runs without network or
// PosterRouter provider scaffolding.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, fireEvent, cleanup, screen, waitFor } from '@testing-library/react';
import { PosterRouterProvider } from '../../common';
import { AccountsListMount } from '../AccountsListMount';

const mockListAccounts = vi.fn();
const mockCreateAccount = vi.fn();
const mockListCategoriesV10 = vi.fn();
const mockListActualV10 = vi.fn();

vi.mock('../../../api/v10', () => ({
  listAccounts: (...args: unknown[]) => mockListAccounts(...args),
  createAccount: (...args: unknown[]) => mockCreateAccount(...args),
  listCategoriesV10: (...args: unknown[]) => mockListCategoriesV10(...args),
  listActualV10: (...args: unknown[]) => mockListActualV10(...args),
}));

vi.mock('../../../api/periods', () => ({
  getCurrentPeriod: vi.fn().mockResolvedValue(null),
}));

afterEach(cleanup);
beforeEach(() => {
  mockListAccounts.mockReset();
  mockCreateAccount.mockReset();
  mockListCategoriesV10.mockReset();
  mockListActualV10.mockReset();
});

describe('AccountsListMount', () => {
  it('fetches accounts on mount and renders rows', async () => {
    mockListAccounts.mockResolvedValueOnce([
      {
        id: 1,
        bank: 'Тинькофф',
        kind: 'card',
        mask: '4408',
        balance_cents: 100000_00,
        primary: true,
        created_at: '2026-04-01T00:00:00+00:00',
      },
    ]);

    render(
      <PosterRouterProvider root={<AccountsListMount />} />,
    );

    // Loading state visible immediately
    expect(screen.queryByTestId('accounts-loading')).toBeTruthy();

    await waitFor(() => {
      expect(mockListAccounts).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId('account-row-1')).toBeTruthy();
    });
  });

  it('opens NewAccountSheet on +ДОБАВИТЬ СЧЁТ; createAccount called on save', async () => {
    mockListAccounts.mockResolvedValue([]);
    mockCreateAccount.mockResolvedValueOnce({
      id: 99,
      bank: 'Сбер',
      kind: 'cash',
      mask: null,
      balance_cents: 0,
      primary: false,
      created_at: '2026-05-10T00:00:00+00:00',
    });

    render(
      <PosterRouterProvider root={<AccountsListMount />} />,
    );

    await waitFor(() => {
      expect(mockListAccounts).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByText('+ ДОБАВИТЬ СЧЁТ'));

    // Sheet now in DOM (portal)
    await waitFor(() => {
      expect(screen.queryByTestId('new-account-sheet')).toBeTruthy();
    });

    fireEvent.change(screen.getByTestId('new-account-bank-input'), {
      target: { value: 'Сбер' },
    });
    fireEvent.click(screen.getByText('наличные'));
    fireEvent.click(screen.getByText('СОХРАНИТЬ'));

    await waitFor(() => {
      expect(mockCreateAccount).toHaveBeenCalledTimes(1);
    });
    expect(mockCreateAccount).toHaveBeenCalledWith({
      bank: 'Сбер',
      kind: 'cash',
      mask: null,
      balance_cents: 0,
      primary: false,
    });
  });

  it('shows error when fetch fails', async () => {
    mockListAccounts.mockRejectedValueOnce(new Error('network down'));

    render(
      <PosterRouterProvider root={<AccountsListMount />} />,
    );

    await waitFor(() => {
      const errEl = screen.queryByTestId('accounts-error');
      expect(errEl).toBeTruthy();
      expect(errEl!.textContent).toContain('network down');
    });
  });
});
