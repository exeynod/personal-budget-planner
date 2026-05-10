// Phase 26-06 Task 2: SubscriptionsView presenter + SubscriptionMenuSheet tests.
//
// Coverage (SUBS-V10-01..04):
//   - View: «Подписки.» Mass italic visible, BigFig monthly_total/100 ₽/мес, eyebrow
//     «N АКТИВНЫХ · Y ₽ В ГОД», list rows with name UPPER + cadence + price + ··· btn,
//     ··· click → onMenuOpen(sub) called, empty state.
//   - Menu: 3 ghost buttons («ПАУЗА» when active / «ВКЛЮЧИТЬ» when inactive,
//     «СМЕНИТЬ ДЕНЬ», «ИЗМЕНИТЬ ЦЕНУ») + destructive «ОТМЕНИТЬ ПОДПИСКУ».
//   - Day editor: number input min=1 max=28; save calls onChangeDay(N).
//   - Price editor: digits-only sanitization; rubles → cents conversion.
//   - Delete: confirm dialog → onDelete called.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup, screen } from '@testing-library/react';
import { SubscriptionsView } from '../SubscriptionsView';
import { SubscriptionMenuSheet } from '../SubscriptionMenuSheet';
import type { SubscriptionV10Read } from '../../../api/v10';

afterEach(cleanup);

// ─────────────────── builders ───────────────────

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
    },
    day_of_month: 15,
    account_id: 1,
    posted_txn_id: null,
    ...over,
  };
}

// ─────────────────── SubscriptionsView ───────────────────

describe('SubscriptionsView', () => {
  it('renders Mass italic «Подписки.» headline', () => {
    const { container } = render(
      <SubscriptionsView
        subs={[]}
        onMenuOpen={vi.fn()}
        onBack={vi.fn()}
        bigFigAnimate={false}
      />,
    );
    expect(container.textContent).toContain('Подписки.');
  });

  it('renders BigFig monthly_total/100 with «₽/мес» suffix', () => {
    const subs = [mkSub({ amount_cents: 79900 })];
    const { container } = render(
      <SubscriptionsView
        subs={subs}
        onMenuOpen={vi.fn()}
        onBack={vi.fn()}
        bigFigAnimate={false}
      />,
    );
    // Math.floor(79900/100) = 799
    expect(container.textContent).toContain('799');
    expect(container.textContent).toContain('₽/мес');
  });

  it('renders eyebrow «N АКТИВНЫХ · Y ₽ В ГОД»', () => {
    const subs = [
      mkSub({ id: 1, amount_cents: 10000, is_active: true, cycle: 'monthly' }),
      mkSub({ id: 2, amount_cents: 50000, is_active: true, cycle: 'yearly' }),
    ];
    const { container } = render(
      <SubscriptionsView
        subs={subs}
        onMenuOpen={vi.fn()}
        onBack={vi.fn()}
        bigFigAnimate={false}
      />,
    );
    // 2 АКТИВНЫХ; yearly = 10000*12 + 50000 = 170000 cents = 1700 руб
    expect(container.textContent).toContain('2 АКТИВНЫХ');
    expect(container.textContent).toContain('В ГОД');
  });

  it('renders subscription rows with UPPER name + cadence + price + ··· btn', () => {
    const subs = [mkSub({ id: 7, name: 'Netflix', amount_cents: 79900 })];
    const { container, getByTestId } = render(
      <SubscriptionsView
        subs={subs}
        onMenuOpen={vi.fn()}
        onBack={vi.fn()}
        bigFigAnimate={false}
      />,
    );
    expect(container.textContent).toContain('NETFLIX');
    expect(container.textContent).toContain('каждое 15 число');
    expect(container.textContent).toContain('799');
    expect(getByTestId('sub-menu-btn-7')).toBeTruthy();
  });

  it('··· click calls onMenuOpen with the sub', () => {
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
    expect(onMenuOpen).toHaveBeenCalledTimes(1);
    expect(onMenuOpen).toHaveBeenCalledWith(sub);
  });

  it('renders empty state «Нет подписок» when list is empty', () => {
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

  it('← НАЗАД click calls onBack', () => {
    const onBack = vi.fn();
    const { getByText } = render(
      <SubscriptionsView
        subs={[]}
        onMenuOpen={vi.fn()}
        onBack={onBack}
        bigFigAnimate={false}
      />,
    );
    fireEvent.click(getByText(/НАЗАД/));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────── SubscriptionMenuSheet ───────────────────

describe('SubscriptionMenuSheet', () => {
  it('returns null when sub is null', () => {
    const { container } = render(
      <SubscriptionMenuSheet
        sub={null}
        onClose={vi.fn()}
        onTogglePause={vi.fn()}
        onChangeDay={vi.fn()}
        onChangePrice={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(container.textContent).toBe('');
  });

  it('renders 3 ghost buttons + destructive when active sub passed', () => {
    const sub = mkSub({ is_active: true });
    render(
      <SubscriptionMenuSheet
        sub={sub}
        onClose={vi.fn()}
        onTogglePause={vi.fn()}
        onChangeDay={vi.fn()}
        onChangePrice={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText('ПАУЗА')).toBeTruthy();
    expect(screen.getByText('СМЕНИТЬ ДЕНЬ')).toBeTruthy();
    expect(screen.getByText('ИЗМЕНИТЬ ЦЕНУ')).toBeTruthy();
    expect(screen.getByText('ОТМЕНИТЬ ПОДПИСКУ')).toBeTruthy();
  });

  it('renders «ВКЛЮЧИТЬ» (instead of ПАУЗА) for inactive sub', () => {
    const sub = mkSub({ is_active: false });
    render(
      <SubscriptionMenuSheet
        sub={sub}
        onClose={vi.fn()}
        onTogglePause={vi.fn()}
        onChangeDay={vi.fn()}
        onChangePrice={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText('ВКЛЮЧИТЬ')).toBeTruthy();
    expect(screen.queryByText('ПАУЗА')).toBeNull();
  });

  it('«ПАУЗА» click calls onTogglePause(sub)', () => {
    const sub = mkSub({ is_active: true });
    const onTogglePause = vi.fn().mockResolvedValue(undefined);
    render(
      <SubscriptionMenuSheet
        sub={sub}
        onClose={vi.fn()}
        onTogglePause={onTogglePause}
        onChangeDay={vi.fn()}
        onChangePrice={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('ПАУЗА'));
    expect(onTogglePause).toHaveBeenCalledWith(sub);
  });

  it('«СМЕНИТЬ ДЕНЬ» opens day editor; save calls onChangeDay with new value', async () => {
    const sub = mkSub({ day_of_month: 15 });
    const onChangeDay = vi.fn().mockResolvedValue(undefined);
    render(
      <SubscriptionMenuSheet
        sub={sub}
        onClose={vi.fn()}
        onTogglePause={vi.fn()}
        onChangeDay={onChangeDay}
        onChangePrice={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('СМЕНИТЬ ДЕНЬ'));
    const input = screen.getByTestId('sub-day-input') as HTMLInputElement;
    expect(input.value).toBe('15');
    fireEvent.change(input, { target: { value: '7' } });
    expect(input.value).toBe('7');
    fireEvent.click(screen.getByText('СОХРАНИТЬ'));
    // wait microtask
    await Promise.resolve();
    expect(onChangeDay).toHaveBeenCalledWith(sub, 7);
  });

  it('day editor clamps input to max=28', () => {
    const sub = mkSub({ day_of_month: 1 });
    render(
      <SubscriptionMenuSheet
        sub={sub}
        onClose={vi.fn()}
        onTogglePause={vi.fn()}
        onChangeDay={vi.fn()}
        onChangePrice={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('СМЕНИТЬ ДЕНЬ'));
    const input = screen.getByTestId('sub-day-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '99' } });
    expect(input.value).toBe('28');
  });

  it('day editor clamps input to min=1', () => {
    const sub = mkSub({ day_of_month: 1 });
    render(
      <SubscriptionMenuSheet
        sub={sub}
        onClose={vi.fn()}
        onTogglePause={vi.fn()}
        onChangeDay={vi.fn()}
        onChangePrice={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('СМЕНИТЬ ДЕНЬ'));
    const input = screen.getByTestId('sub-day-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '0' } });
    expect(input.value).toBe('1');
  });

  it('«ИЗМЕНИТЬ ЦЕНУ» opens price editor; save converts rubles → cents', async () => {
    const sub = mkSub({ amount_cents: 79900 });
    const onChangePrice = vi.fn().mockResolvedValue(undefined);
    render(
      <SubscriptionMenuSheet
        sub={sub}
        onClose={vi.fn()}
        onTogglePause={vi.fn()}
        onChangeDay={vi.fn()}
        onChangePrice={onChangePrice}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('ИЗМЕНИТЬ ЦЕНУ'));
    const input = screen.getByTestId('sub-price-input') as HTMLInputElement;
    expect(input.value).toBe('799'); // initial = sub.amount_cents/100
    fireEvent.change(input, { target: { value: '500' } });
    expect(input.value).toBe('500');
    fireEvent.click(screen.getByText('СОХРАНИТЬ'));
    await Promise.resolve();
    expect(onChangePrice).toHaveBeenCalledWith(sub, 50000);
  });

  it('price editor strips non-digits from input', () => {
    const sub = mkSub({ amount_cents: 79900 });
    render(
      <SubscriptionMenuSheet
        sub={sub}
        onClose={vi.fn()}
        onTogglePause={vi.fn()}
        onChangeDay={vi.fn()}
        onChangePrice={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('ИЗМЕНИТЬ ЦЕНУ'));
    const input = screen.getByTestId('sub-price-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '12abc34xyz5' } });
    expect(input.value).toBe('123450');
  });

  it('price editor save aborts when value parses to 0', async () => {
    const sub = mkSub({ amount_cents: 79900 });
    const onChangePrice = vi.fn().mockResolvedValue(undefined);
    render(
      <SubscriptionMenuSheet
        sub={sub}
        onClose={vi.fn()}
        onTogglePause={vi.fn()}
        onChangeDay={vi.fn()}
        onChangePrice={onChangePrice}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('ИЗМЕНИТЬ ЦЕНУ'));
    const input = screen.getByTestId('sub-price-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.click(screen.getByText('СОХРАНИТЬ'));
    await Promise.resolve();
    expect(onChangePrice).not.toHaveBeenCalled();
  });

  it('«ОТМЕНИТЬ ПОДПИСКУ» opens confirm dialog; УДАЛИТЬ click calls onDelete', async () => {
    const sub = mkSub({ name: 'Netflix' });
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <SubscriptionMenuSheet
        sub={sub}
        onClose={vi.fn()}
        onTogglePause={vi.fn()}
        onChangeDay={vi.fn()}
        onChangePrice={vi.fn()}
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getByText('ОТМЕНИТЬ ПОДПИСКУ'));
    // Confirm dialog visible
    const confirmText = screen.getAllByText(/Netflix/)[0]; // confirm sheet contains «Netflix»
    expect(confirmText).toBeTruthy();
    fireEvent.click(screen.getByTestId('sub-delete-confirm-btn'));
    await Promise.resolve();
    expect(onDelete).toHaveBeenCalledWith(sub);
  });

  it('confirm dialog ОТМЕНА closes dialog without calling onDelete', () => {
    const sub = mkSub({ name: 'Netflix' });
    const onDelete = vi.fn();
    render(
      <SubscriptionMenuSheet
        sub={sub}
        onClose={vi.fn()}
        onTogglePause={vi.fn()}
        onChangeDay={vi.fn()}
        onChangePrice={vi.fn()}
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getByText('ОТМЕНИТЬ ПОДПИСКУ'));
    fireEvent.click(screen.getByText('ОТМЕНА'));
    expect(onDelete).not.toHaveBeenCalled();
  });
});
