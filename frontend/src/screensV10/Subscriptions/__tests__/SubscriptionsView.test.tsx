// Phase 26-06 Task 2: SubscriptionsView presenter + SubscriptionMenuSheet.
//
// Trimmed to smoke-render + empty state + one interaction + menu sheet
// happy/confirm path. Money + cadence formatting is covered by
// computeSubscriptions.test.ts.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup, screen } from '@testing-library/react';
import { SubscriptionsView } from '../SubscriptionsView';
import { SubscriptionMenuSheet } from '../SubscriptionMenuSheet';
import type { SubscriptionV10Read, AccountResponse } from '../../../api/v10';

function mkAccount(over: Partial<AccountResponse> = {}): AccountResponse {
  return {
    id: 1,
    bank: 'Tinkoff',
    mask: '4242',
    kind: 'card',
    balance_cents: 100000,
    primary: true,
    created_at: '2026-04-01T00:00:00+00:00',
    ...over,
  };
}

function mkSub(over: Partial<SubscriptionV10Read> = {}): SubscriptionV10Read {
  return {
    id: 1,
    name: 'Netflix',
    amount_cents: 79900,
    cycle: 'monthly',
    next_charge_date: '2026-05-15',
    category_id: 1,
    notify_days_before: 1,
    is_active: true,
    category: {
      id: 1,
      name: 'Подписки',
      kind: 'expense',
      is_archived: false,
      sort_order: 10,
      created_at: '2026-04-01T00:00:00+00:00',
      code: 'subs',
      ord: '01',
      plan_cents: 0,
      rollover: 'misc',
      paused: false,
      tag: 'personal',
    },
    day_of_month: 15,
    account_id: 1,
    posted_txn_id: null,
    ...over,
  };
}

afterEach(cleanup);

describe('SubscriptionsView', () => {
  it('smoke: headline + BigFig + row (UPPER name, cadence, menu btn)', () => {
    const { container, getByTestId } = render(
      <SubscriptionsView
        subs={[mkSub({ id: 7, name: 'Netflix', amount_cents: 79900 })]}
        onMenuOpen={vi.fn()}
        onBack={vi.fn()}
        bigFigAnimate={false}
      />,
    );
    expect(container.textContent).toContain('Подписки.');
    expect(container.textContent).toContain('799'); // floor(79900/100)
    expect(container.textContent).toContain('₽/мес');
    expect(container.textContent).toContain('NETFLIX');
    expect(container.textContent).toContain('каждое 15 число');
    expect(getByTestId('sub-menu-btn-7')).toBeTruthy();
  });

  it('empty state «Нет подписок»', () => {
    const { container } = render(
      <SubscriptionsView
        subs={[]}
        onMenuOpen={vi.fn()}
        onBack={vi.fn()}
        bigFigAnimate={false}
      />,
    );
    expect(container.textContent).toContain('Нет подписок');
  });

  it('··· click calls onMenuOpen(sub)', () => {
    const sub = mkSub({ id: 42 });
    const onMenuOpen = vi.fn();
    const { getByTestId } = render(
      <SubscriptionsView
        subs={[sub]}
        onMenuOpen={onMenuOpen}
        onBack={vi.fn()}
        bigFigAnimate={false}
      />,
    );
    fireEvent.click(getByTestId('sub-menu-btn-42'));
    expect(onMenuOpen).toHaveBeenCalledWith(sub);
  });

  it('renders linked account label / omits when null', () => {
    const { rerender } = render(
      <SubscriptionsView
        subs={[mkSub({ id: 7, account_id: 1 })]}
        accounts={[mkAccount({ id: 1, bank: 'Tinkoff', mask: '4242' })]}
        onMenuOpen={vi.fn()}
        onBack={vi.fn()}
        bigFigAnimate={false}
      />,
    );
    expect(screen.getByTestId('sub-account-7').textContent).toBe(
      'TINKOFF · 4242',
    );
    rerender(
      <SubscriptionsView
        subs={[mkSub({ id: 7, account_id: null })]}
        accounts={[mkAccount({ id: 1 })]}
        onMenuOpen={vi.fn()}
        onBack={vi.fn()}
        bigFigAnimate={false}
      />,
    );
    expect(screen.queryByTestId('sub-account-7')).toBeNull();
  });
});

describe('SubscriptionMenuSheet', () => {
  const noop = {
    onClose: vi.fn(),
    accounts: [] as AccountResponse[],
    onChangeAccount: vi.fn(),
    onTogglePause: vi.fn(),
    onChangeDay: vi.fn(),
    onChangePrice: vi.fn(),
    onDelete: vi.fn(),
  };

  it('null sub → renders nothing', () => {
    const { container } = render(
      <SubscriptionMenuSheet sub={null} {...noop} />,
    );
    expect(container.textContent).toBe('');
  });

  it('active: ПАУЗА/ДЕНЬ/ЦЕНА/ОТМЕНИТЬ; inactive shows ВКЛЮЧИТЬ', () => {
    const { rerender } = render(
      <SubscriptionMenuSheet sub={mkSub({ is_active: true })} {...noop} />,
    );
    expect(screen.getByText('ПАУЗА')).toBeTruthy();
    expect(screen.getByText('СМЕНИТЬ ДЕНЬ')).toBeTruthy();
    expect(screen.getByText('ИЗМЕНИТЬ ЦЕНУ')).toBeTruthy();
    expect(screen.getByText('ОТМЕНИТЬ ПОДПИСКУ')).toBeTruthy();
    rerender(
      <SubscriptionMenuSheet sub={mkSub({ is_active: false })} {...noop} />,
    );
    expect(screen.getByText('ВКЛЮЧИТЬ')).toBeTruthy();
    expect(screen.queryByText('ПАУЗА')).toBeNull();
  });

  it('day editor: clamps 1..28, save calls onChangeDay(sub, N)', async () => {
    const sub = mkSub({ day_of_month: 15 });
    const onChangeDay = vi.fn().mockResolvedValue(undefined);
    render(
      <SubscriptionMenuSheet sub={sub} {...noop} onChangeDay={onChangeDay} />,
    );
    fireEvent.click(screen.getByText('СМЕНИТЬ ДЕНЬ'));
    const input = screen.getByTestId('sub-day-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '99' } });
    expect(input.value).toBe('28'); // clamp max
    fireEvent.change(input, { target: { value: '0' } });
    expect(input.value).toBe('1'); // clamp min
    fireEvent.change(input, { target: { value: '7' } });
    fireEvent.click(screen.getByText('СОХРАНИТЬ'));
    await Promise.resolve();
    expect(onChangeDay).toHaveBeenCalledWith(sub, 7);
  });

  it('price editor: digits-only, rubles→cents, aborts on 0', async () => {
    const sub = mkSub({ amount_cents: 79900 });
    const onChangePrice = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <SubscriptionMenuSheet
        sub={sub}
        {...noop}
        onChangePrice={onChangePrice}
      />,
    );
    fireEvent.click(screen.getByText('ИЗМЕНИТЬ ЦЕНУ'));
    const input = screen.getByTestId('sub-price-input') as HTMLInputElement;
    expect(input.value).toBe('799');
    fireEvent.change(input, { target: { value: '12abc3' } });
    expect(input.value).toBe('123'); // digits only
    fireEvent.change(input, { target: { value: '500' } });
    fireEvent.click(screen.getByText('СОХРАНИТЬ'));
    await Promise.resolve();
    expect(onChangePrice).toHaveBeenCalledWith(sub, 50000);
    // zero aborts
    onChangePrice.mockClear();
    rerender(
      <SubscriptionMenuSheet
        sub={sub}
        {...noop}
        onChangePrice={onChangePrice}
      />,
    );
    fireEvent.click(screen.getByText('ИЗМЕНИТЬ ЦЕНУ'));
    fireEvent.change(screen.getByTestId('sub-price-input'), {
      target: { value: '0' },
    });
    fireEvent.click(screen.getByText('СОХРАНИТЬ'));
    await Promise.resolve();
    expect(onChangePrice).not.toHaveBeenCalled();
  });

  it('delete confirm calls onDelete; ОТМЕНА does not', async () => {
    const sub = mkSub({ name: 'Netflix' });
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <SubscriptionMenuSheet sub={sub} {...noop} onDelete={onDelete} />,
    );
    fireEvent.click(screen.getByText('ОТМЕНИТЬ ПОДПИСКУ'));
    fireEvent.click(screen.getByTestId('sub-delete-confirm-btn'));
    await Promise.resolve();
    expect(onDelete).toHaveBeenCalledWith(sub);
    onDelete.mockClear();
    rerender(<SubscriptionMenuSheet sub={sub} {...noop} onDelete={onDelete} />);
    fireEvent.click(screen.getByText('ОТМЕНИТЬ ПОДПИСКУ'));
    fireEvent.click(screen.getByText('ОТМЕНА'));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('«СМЕНИТЬ СЧЁТ» picker → onChangeAccount(sub, id)', async () => {
    const sub = mkSub({ account_id: 1 });
    const onChangeAccount = vi.fn().mockResolvedValue(undefined);
    render(
      <SubscriptionMenuSheet
        sub={sub}
        {...noop}
        accounts={[
          mkAccount({ id: 1 }),
          mkAccount({ id: 2, bank: 'Sber', mask: '1111', primary: false }),
        ]}
        onChangeAccount={onChangeAccount}
      />,
    );
    fireEvent.click(screen.getByText('СМЕНИТЬ СЧЁТ'));
    fireEvent.click(screen.getByTestId('account-picker-row-2'));
    await Promise.resolve();
    expect(onChangeAccount).toHaveBeenCalledWith(sub, 2);
  });
});
