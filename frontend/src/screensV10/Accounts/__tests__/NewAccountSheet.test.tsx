// Phase 27-04 Task 2: NewAccountSheet form tests.
//
// Coverage:
//   - kind chips switch state; mask input only visible when kind='card'
//   - mask input strips non-digits + maxLength=4 (T-27-04-02)
//   - balance input strips non-digits; rubles → cents on save
//   - СОХРАНИТЬ disabled when bank empty
//   - СОХРАНИТЬ enabled when bank set + valid → onSave with payload
//   - cancel calls onClose

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup, screen } from '@testing-library/react';
import { NewAccountSheet } from '../NewAccountSheet';

afterEach(cleanup);

describe('NewAccountSheet', () => {
  it('renders form fields', () => {
    render(
      <NewAccountSheet
        onSave={vi.fn()}
        onClose={vi.fn()}
        submitting={false}
      />,
    );
    expect(screen.getByTestId('new-account-bank-input')).toBeTruthy();
    expect(screen.getByTestId('new-account-balance-input')).toBeTruthy();
    expect(screen.getByTestId('new-account-primary-checkbox')).toBeTruthy();
    // Default kind=card → mask input visible
    expect(screen.getByTestId('new-account-mask-input')).toBeTruthy();
  });

  it('hides mask input when kind=cash', () => {
    render(
      <NewAccountSheet
        onSave={vi.fn()}
        onClose={vi.fn()}
        submitting={false}
      />,
    );
    fireEvent.click(screen.getByText('наличные'));
    expect(screen.queryByTestId('new-account-mask-input')).toBeNull();
  });

  it('mask input strips non-digits and clamps to 4 chars', () => {
    render(
      <NewAccountSheet
        onSave={vi.fn()}
        onClose={vi.fn()}
        submitting={false}
      />,
    );
    const mask = screen.getByTestId('new-account-mask-input') as HTMLInputElement;
    fireEvent.change(mask, { target: { value: '12abc34xyz567' } });
    expect(mask.value).toBe('1234');
  });

  it('balance input strips non-digits', () => {
    render(
      <NewAccountSheet
        onSave={vi.fn()}
        onClose={vi.fn()}
        submitting={false}
      />,
    );
    const bal = screen.getByTestId('new-account-balance-input') as HTMLInputElement;
    fireEvent.change(bal, { target: { value: '12 345 abc' } });
    expect(bal.value).toBe('12345');
  });

  it('СОХРАНИТЬ disabled when bank empty', () => {
    render(
      <NewAccountSheet
        onSave={vi.fn()}
        onClose={vi.fn()}
        submitting={false}
      />,
    );
    const save = screen.getByText('СОХРАНИТЬ') as HTMLButtonElement;
    expect(save.disabled).toBe(true);
  });

  it('СОХРАНИТЬ enabled and calls onSave with payload (rubles → cents)', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <NewAccountSheet onSave={onSave} onClose={vi.fn()} submitting={false} />,
    );
    fireEvent.change(screen.getByTestId('new-account-bank-input'), {
      target: { value: 'Тинькофф' },
    });
    fireEvent.change(screen.getByTestId('new-account-mask-input'), {
      target: { value: '1234' },
    });
    fireEvent.change(screen.getByTestId('new-account-balance-input'), {
      target: { value: '500' },
    });
    fireEvent.click(screen.getByTestId('new-account-primary-checkbox'));
    const save = screen.getByText('СОХРАНИТЬ') as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await Promise.resolve();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({
      bank: 'Тинькофф',
      kind: 'card',
      mask: '1234',
      balance_cents: 50000, // 500 rubles → 50000 cents
      primary: true,
    });
  });

  it('saves cash account with mask=null', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <NewAccountSheet onSave={onSave} onClose={vi.fn()} submitting={false} />,
    );
    fireEvent.change(screen.getByTestId('new-account-bank-input'), {
      target: { value: 'Кошелёк' },
    });
    fireEvent.click(screen.getByText('наличные'));
    fireEvent.click(screen.getByText('СОХРАНИТЬ'));
    await Promise.resolve();
    expect(onSave).toHaveBeenCalledWith({
      bank: 'Кошелёк',
      kind: 'cash',
      mask: null,
      balance_cents: 0,
      primary: false,
    });
  });

  it('cancel calls onClose', () => {
    const onClose = vi.fn();
    render(
      <NewAccountSheet
        onSave={vi.fn()}
        onClose={onClose}
        submitting={false}
      />,
    );
    fireEvent.click(screen.getByText('ОТМЕНА'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('save button shows СОХРАНЯЕМ… and is disabled while submitting', () => {
    render(
      <NewAccountSheet
        onSave={vi.fn()}
        onClose={vi.fn()}
        submitting
      />,
    );
    fireEvent.change(screen.getByTestId('new-account-bank-input'), {
      target: { value: 'Сбер' },
    });
    const save = screen.getByText('СОХРАНЯЕМ…') as HTMLButtonElement;
    expect(save.disabled).toBe(true);
  });
});
