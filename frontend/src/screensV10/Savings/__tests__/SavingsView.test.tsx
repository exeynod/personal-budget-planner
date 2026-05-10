// Phase 27-03: SavingsView presenter tests (SAV-V10-01..04).
//
// Covers: header, total plate, month-in eyebrow, roundup toggle, base chips,
// goals list, empty state, CTAs.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { SavingsView } from '../SavingsView';
import type { SavingsSnapshot, GoalRead } from '../../../api/v10';

afterEach(cleanup);

function mkGoal(over: Partial<GoalRead> = {}): GoalRead {
  return {
    id: 1,
    name: 'iPhone',
    target_cents: 1_000_000,
    current_cents: 250_000,
    due: '2027-01-31',
    created_at: '2026-04-01T00:00:00+00:00',
    ...over,
  };
}

function mkSnapshot(over: Partial<SavingsSnapshot> = {}): SavingsSnapshot {
  return {
    total_cents: 1_234_500,
    month_in_cents: 50_000,
    config: { roundup_enabled: true, roundup_base: 10 },
    goals: [],
    ...over,
  };
}

const baseProps = {
  loading: false,
  error: null,
  onToggleRoundup: vi.fn(),
  onSelectBase: vi.fn(),
  onAddGoal: vi.fn(),
  onDeposit: vi.fn(),
  onContributeToGoal: vi.fn(),
  canPop: false,
  onBack: vi.fn(),
  bigFigAnimate: false,
};

describe('SavingsView', () => {
  it('renders Mass italic «Копилка.» headline', () => {
    const { container } = render(
      <SavingsView {...baseProps} snapshot={mkSnapshot()} />,
    );
    expect(container.textContent).toContain('Копилка.');
  });

  it('renders total plate with «НАКОПЛЕНО ВСЕГО» + value (12345 from 1234500)', () => {
    const { container } = render(
      <SavingsView
        {...baseProps}
        snapshot={mkSnapshot({ total_cents: 1_234_500 })}
      />,
    );
    expect(container.textContent).toContain('НАКОПЛЕНО ВСЕГО');
    // Math.floor(1_234_500/100) = 12345
    expect(container.textContent).toContain('12');
    expect(container.textContent).toContain('345');
    // ₽ suffix from BigFig
    expect(container.textContent).toContain('₽');
  });

  it('renders month-in eyebrow «В <MONTH> + Y ₽»', () => {
    const { container } = render(
      <SavingsView
        {...baseProps}
        snapshot={mkSnapshot({ month_in_cents: 50_000 })}
      />,
    );
    // Y = floor(50000/100) = 500
    const text = container.textContent ?? '';
    expect(text).toContain('В ');
    // value present (NBSP-tolerant)
    expect(text.replace(/\s+/g, ' ')).toMatch(/\+\s?500/);
  });

  it('renders roundup toggle showing ВКЛ when enabled', () => {
    const { getByTestId } = render(
      <SavingsView
        {...baseProps}
        snapshot={mkSnapshot({
          config: { roundup_enabled: true, roundup_base: 10 },
        })}
      />,
    );
    const toggle = getByTestId('roundup-toggle');
    expect(toggle.textContent).toBe('ВКЛ');
  });

  it('renders roundup toggle showing ВЫКЛ when disabled', () => {
    const { getByTestId } = render(
      <SavingsView
        {...baseProps}
        snapshot={mkSnapshot({
          config: { roundup_enabled: false, roundup_base: 50 },
        })}
      />,
    );
    expect(getByTestId('roundup-toggle').textContent).toBe('ВЫКЛ');
  });

  it('toggle click invokes onToggleRoundup with negated value', () => {
    const onToggleRoundup = vi.fn();
    const { getByTestId } = render(
      <SavingsView
        {...baseProps}
        onToggleRoundup={onToggleRoundup}
        snapshot={mkSnapshot({
          config: { roundup_enabled: true, roundup_base: 10 },
        })}
      />,
    );
    fireEvent.click(getByTestId('roundup-toggle'));
    expect(onToggleRoundup).toHaveBeenCalledWith(false);
  });

  it('renders 3 base chips (10/50/100 ₽)', () => {
    const { container } = render(
      <SavingsView {...baseProps} snapshot={mkSnapshot()} />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('10 ₽');
    expect(text).toContain('50 ₽');
    expect(text).toContain('100 ₽');
  });

  it('chip click invokes onSelectBase with the value', () => {
    const onSelectBase = vi.fn();
    const { getByText } = render(
      <SavingsView
        {...baseProps}
        onSelectBase={onSelectBase}
        snapshot={mkSnapshot({
          config: { roundup_enabled: true, roundup_base: 10 },
        })}
      />,
    );
    fireEvent.click(getByText('50 ₽'));
    expect(onSelectBase).toHaveBeenCalledWith(50);
  });

  it('renders goal cards with name + progress + dueRu', () => {
    const goals = [
      mkGoal({
        id: 1,
        name: 'iPhone',
        target_cents: 1_000_000,
        current_cents: 250_000,
        due: '2027-01-31',
      }),
      mkGoal({
        id: 2,
        name: 'Vacation',
        target_cents: 500_000,
        current_cents: 100_000,
        due: null,
      }),
    ];
    const { container, getByTestId } = render(
      <SavingsView {...baseProps} snapshot={mkSnapshot({ goals })} />,
    );
    expect(getByTestId('goal-card-1')).toBeTruthy();
    expect(getByTestId('goal-card-2')).toBeTruthy();
    expect(container.textContent).toContain('IPHONE');
    expect(container.textContent).toContain('VACATION');
    expect(container.textContent).toContain('25%'); // 250k / 1M
    expect(container.textContent).toContain('20%'); // 100k / 500k
    expect(container.textContent).toContain('до 31 января 2027');
  });

  it('renders empty state «Нет целей — добавьте первую» when goals=[]', () => {
    const { container } = render(
      <SavingsView {...baseProps} snapshot={mkSnapshot({ goals: [] })} />,
    );
    expect(container.textContent).toContain('Нет целей — добавьте первую');
  });

  it('goal card click invokes onContributeToGoal(goalId)', () => {
    const onContributeToGoal = vi.fn();
    const { getByTestId } = render(
      <SavingsView
        {...baseProps}
        onContributeToGoal={onContributeToGoal}
        snapshot={mkSnapshot({ goals: [mkGoal({ id: 7 })] })}
      />,
    );
    fireEvent.click(getByTestId('goal-card-7'));
    expect(onContributeToGoal).toHaveBeenCalledWith(7);
  });

  it('«+ НОВАЯ ЦЕЛЬ» click invokes onAddGoal', () => {
    const onAddGoal = vi.fn();
    const { getByText } = render(
      <SavingsView
        {...baseProps}
        onAddGoal={onAddGoal}
        snapshot={mkSnapshot()}
      />,
    );
    fireEvent.click(getByText('+ НОВАЯ ЦЕЛЬ'));
    expect(onAddGoal).toHaveBeenCalled();
  });

  it('«ПОПОЛНИТЬ» click invokes onDeposit', () => {
    const onDeposit = vi.fn();
    const { getByText } = render(
      <SavingsView
        {...baseProps}
        onDeposit={onDeposit}
        snapshot={mkSnapshot()}
      />,
    );
    fireEvent.click(getByText('ПОПОЛНИТЬ'));
    expect(onDeposit).toHaveBeenCalled();
  });

  it('renders ← НАЗАД when canPop=true; click invokes onBack', () => {
    const onBack = vi.fn();
    const { getByText } = render(
      <SavingsView
        {...baseProps}
        canPop={true}
        onBack={onBack}
        snapshot={mkSnapshot()}
      />,
    );
    fireEvent.click(getByText(/НАЗАД/));
    expect(onBack).toHaveBeenCalled();
  });

  it('does NOT render ← НАЗАД when canPop=false', () => {
    const { container } = render(
      <SavingsView {...baseProps} canPop={false} snapshot={mkSnapshot()} />,
    );
    expect(container.textContent).not.toContain('НАЗАД');
  });

  it('renders loading sub-view when loading=true and snapshot=null', () => {
    const { getByTestId } = render(
      <SavingsView {...baseProps} loading={true} snapshot={null} />,
    );
    expect(getByTestId('savings-loading')).toBeTruthy();
  });

  it('renders error sub-view when error set and snapshot=null', () => {
    const { container, getByTestId } = render(
      <SavingsView
        {...baseProps}
        error="Не удалось загрузить копилку"
        snapshot={null}
      />,
    );
    expect(getByTestId('savings-error')).toBeTruthy();
    expect(container.textContent).toContain('Не удалось загрузить копилку');
  });
});
