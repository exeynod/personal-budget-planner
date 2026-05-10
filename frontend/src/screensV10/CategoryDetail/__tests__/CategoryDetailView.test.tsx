// Phase 26-02 Task 2: CategoryDetailView presentational component tests.
//
// Coverage (CAT-V10-01..06):
//  - Mass UPPERCASE name (e.g. «ПРОДУКТЫ»).
//  - Italic subtitle: «— на N% плана» when fact ≤ plan; «— превышено на N%» when fact > plan.
//  - Background tone: cobalt when !isOver, red when isOver.
//  - BigFig shows fact / 100 (with suffix ₽); bigFigAnimate=false for synchronous read.
//  - Progress bar element exists; tick visible when over-budget.
//  - Rollover plate label flips by rollover value; click → onToggleRollover.
//  - «+ ПОДНЯТЬ ЛИМИТ» click → onPushPlan(categoryId).
//  - «ПАУЗА» / «ВКЛЮЧИТЬ» button label flips by paused; click → onTogglePause.
//  - Day-grouped operations list renders rows; empty state when no operations.
//  - ← НАЗАД → onBack.
//
// Pattern mirrors HomeView/TransactionsView tests — props-only render, vi.fn() handlers.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { CategoryDetailView } from '../CategoryDetailView';
import type { ActualV10Read, CategoryV10 } from '../../../api/v10';

afterEach(cleanup);

// ─────────────────── builders ───────────────────

function mkCategory(over: Partial<CategoryV10> = {}): CategoryV10 {
  return {
    id: 5,
    name: 'Продукты',
    kind: 'expense',
    is_archived: false,
    sort_order: 10,
    created_at: '2026-04-01T00:00:00+00:00',
    code: 'food',
    ord: '02',
    plan_cents: 10_000_00,
    rollover: 'misc',
    paused: false,
    parent_id: null,
    ...over,
  };
}

function mkActual(over: Partial<ActualV10Read> = {}): ActualV10Read {
  return {
    id: 1,
    period_id: 1,
    kind: 'expense',
    amount_cents: 0,
    description: null,
    category_id: 5,
    tx_date: '2026-05-10',
    source: 'mini_app',
    created_at: '2026-05-10T12:00:00+00:00',
    account_id: 1,
    parent_txn_id: null,
    ...over,
  };
}

function makeProps(
  propOverrides: Partial<React.ComponentProps<typeof CategoryDetailView>> = {},
) {
  const onPushPlan = vi.fn();
  const onTogglePause = vi.fn();
  const onToggleRollover = vi.fn();
  const onBack = vi.fn();

  const today = new Date(2026, 4, 10); // 10 May 2026

  const category = mkCategory();
  const actuals: ActualV10Read[] = [
    mkActual({
      id: 100,
      category_id: 5,
      kind: 'expense',
      amount_cents: -500_00,
      description: 'Утренние булочки',
      tx_date: '2026-05-10',
      created_at: '2026-05-10T09:30:00+00:00',
    }),
    mkActual({
      id: 101,
      category_id: 5,
      kind: 'expense',
      amount_cents: -2000_00,
      description: 'Вечерний шоппинг',
      tx_date: '2026-05-09',
      created_at: '2026-05-09T18:00:00+00:00',
    }),
    // Different category — filtered out.
    mkActual({
      id: 200,
      category_id: 7,
      kind: 'expense',
      amount_cents: -100_00,
      description: 'Кафе',
      tx_date: '2026-05-10',
      created_at: '2026-05-10T13:00:00+00:00',
    }),
  ];

  const utils = render(
    <CategoryDetailView
      category={category}
      actuals={actuals}
      today={today}
      bigFigAnimate={false}
      onPushPlan={onPushPlan}
      onTogglePause={onTogglePause}
      onToggleRollover={onToggleRollover}
      onBack={onBack}
      {...propOverrides}
    />,
  );
  return {
    ...utils,
    onPushPlan,
    onTogglePause,
    onToggleRollover,
    onBack,
    category,
    actuals,
  };
}

// ─────────────────── tests ───────────────────

describe('CategoryDetailView — header / name / subtitle', () => {
  it('renders the category name in UPPERCASE («ПРОДУКТЫ»)', () => {
    const { getByText } = makeProps();
    expect(getByText('ПРОДУКТЫ')).toBeInTheDocument();
  });

  it('renders italic «— на N% плана» when fact ≤ plan', () => {
    // fact = 500_00 + 2000_00 = 2500_00; plan = 10000_00 → 25% used.
    const { container } = makeProps();
    const text = container.textContent ?? '';
    expect(text).toMatch(/—\s*на\s+25%\s+плана/);
  });

  it('renders italic «— превышено на N%» when fact > plan', () => {
    const category = mkCategory({ plan_cents: 1_000_00 }); // plan = 1000₽ < fact 2500₽
    const { container } = makeProps({ category });
    const text = container.textContent ?? '';
    expect(text).toMatch(/—\s*превышено\s+на\s+150%/);
  });
});

describe('CategoryDetailView — background tone', () => {
  it('uses cobalt background when fact ≤ plan (!isOver)', () => {
    const { container } = makeProps();
    const root = container.firstChild as HTMLElement;
    // The CSS-module class names get suffixed in tests, but the root carries one
    // of {bgCobalt, bgRed}. We assert one of them is present.
    expect(root.className).toMatch(/bgCobalt/);
    expect(root.className).not.toMatch(/bgRed/);
  });

  it('uses red background when fact > plan (isOver)', () => {
    const category = mkCategory({ plan_cents: 1_000_00 });
    const { container } = makeProps({ category });
    const root = container.firstChild as HTMLElement;
    expect(root.className).toMatch(/bgRed/);
  });
});

describe('CategoryDetailView — BigFig fact', () => {
  it('renders BigFig with fact value (rubles) and ₽ suffix', () => {
    const { container } = makeProps();
    // fact = 2500_00 cents → 2500 rubles. BigFig (via fmtThousands) emits
    // digits with ASCII space grouping.
    const text = container.textContent ?? '';
    // 2500 → '2 500' (ASCII space). Match flexibly: '2' then any space then '500'.
    expect(text).toMatch(/2\s*500/);
    expect(text).toContain('₽');
  });
});

describe('CategoryDetailView — progress bar', () => {
  it('renders bar fill width based on fact/plan when under-budget', () => {
    const { container } = makeProps();
    const fill = container.querySelector('[data-testid="cat-bar-fill"]') as HTMLElement;
    expect(fill).not.toBeNull();
    // fillRatio = 2500/10000 = 0.25 → width 25%.
    expect(fill.style.width).toBe('25%');
  });

  it('renders bar fill width 100% with a tick child when over-budget', () => {
    const category = mkCategory({ plan_cents: 1_000_00 });
    const { container } = makeProps({ category });
    const fill = container.querySelector('[data-testid="cat-bar-fill"]') as HTMLElement;
    const tick = container.querySelector('[data-testid="cat-bar-tick"]') as HTMLElement;
    expect(fill).not.toBeNull();
    expect(fill.style.width).toBe('100%');
    expect(tick).not.toBeNull();
  });
});

describe('CategoryDetailView — rollover plate', () => {
  it('renders «ОСТАТОК ПО КАТЕГОРИИ → ПРОЧЕЕ» eyebrow when rollover=misc', () => {
    // Phase 29-04 §4 BLOCKER #4 — plate now carries the full prototype
    // eyebrow text «ОСТАТОК ПО КАТЕГОРИИ → {dest}» followed by a mono
    // money line beneath. Regex tolerates intervening text between
    // «ОСТАТОК» and «→» so both the old and new shapes pass.
    const { getByTestId } = makeProps();
    const plate = getByTestId('rollover-plate');
    expect(plate.textContent).toMatch(/ОСТАТОК[\s\S]*→\s*ПРОЧЕЕ/);
  });

  it('renders «ОСТАТОК ПО КАТЕГОРИИ → НАКОПЛЕНИЯ» eyebrow when rollover=savings', () => {
    const category = mkCategory({ rollover: 'savings' });
    const { getByTestId } = makeProps({ category });
    const plate = getByTestId('rollover-plate');
    expect(plate.textContent).toMatch(/ОСТАТОК[\s\S]*→\s*НАКОПЛЕНИЯ/);
  });

  it('clicking the rollover plate invokes onToggleRollover', () => {
    const { getByTestId, onToggleRollover } = makeProps();
    fireEvent.click(getByTestId('rollover-plate'));
    expect(onToggleRollover).toHaveBeenCalledTimes(1);
  });
});

describe('CategoryDetailView — CTA row', () => {
  it('«+ ПОДНЯТЬ ЛИМИТ» click → onPushPlan(category.id)', () => {
    const { getByText, onPushPlan, category } = makeProps();
    fireEvent.click(getByText(/ПОДНЯТЬ\s+ЛИМИТ/));
    expect(onPushPlan).toHaveBeenCalledWith(category.id);
  });

  it('«ПАУЗА» click → onTogglePause when paused=false', () => {
    const { getByText, onTogglePause } = makeProps();
    fireEvent.click(getByText('ПАУЗА'));
    expect(onTogglePause).toHaveBeenCalledTimes(1);
  });

  it('shows «ВКЛЮЧИТЬ» when paused=true (instead of «ПАУЗА»)', () => {
    const category = mkCategory({ paused: true });
    const { getByText, onTogglePause } = makeProps({ category });
    fireEvent.click(getByText('ВКЛЮЧИТЬ'));
    expect(onTogglePause).toHaveBeenCalledTimes(1);
  });
});

describe('CategoryDetailView — operations list', () => {
  it('renders rows only for the current category', () => {
    const { getByText, queryByText } = makeProps();
    expect(getByText('Утренние булочки')).toBeInTheDocument();
    expect(getByText('Вечерний шоппинг')).toBeInTheDocument();
    // From different category — must be filtered out.
    expect(queryByText('Кафе')).toBeNull();
  });

  it('renders empty state when no operations for this category', () => {
    const category = mkCategory({ id: 999 });
    const { getByText } = makeProps({ category });
    expect(getByText(/Операций пока нет/)).toBeInTheDocument();
  });
});

describe('CategoryDetailView — back', () => {
  it('← НАЗАД click invokes onBack', () => {
    const { getByText, onBack } = makeProps();
    fireEvent.click(getByText('← НАЗАД'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
