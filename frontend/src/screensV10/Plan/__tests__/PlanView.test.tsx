// Phase 26-04 Task 3: PlanView presentational component tests.
//
// Coverage (PLAN-V10-01..06):
//   1. Header renders Mass «PLAN МЕСЯЦА.» + Eyebrow «MGMT / LIMITS».
//   2. OK plate renders «+ X ₽» tone yellow when surplus ≥ 0; CTA enabled.
//   3. OVER plate renders «− X ₽» tone red when surplus < 0; CTA disabled +
//      inline error visible.
//   4. Rollover plates show «→ ПРОЧЕЕ» / «→ НАКОПЛЕНИЯ» with formatted values.
//   5. Regulars block renders 1 row per regular; «ПРОВЕСТИ →» when not posted.
//   6. Click «ПРОВЕСТИ →» calls onPostRegular(subId).
//   7. Click «ОТМЕНА» calls onUnpostRegular(subId).
//   8. N PosterSliders rendered for N categories; slider input change calls
//      onSliderChange(catId, newCents).
//   9. Chip-pair clicks call onRolloverChip(catId, next).
//  10. focusCategoryId — corresponding row receives `.focused` class.
//  11. ← НАЗАД calls onBack.

import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, fireEvent, cleanup, within } from '@testing-library/react';
import { PlanView } from '../PlanView';
import type { CategoryV10 } from '../../../api/v10';
import type { PlanMonthItem } from '../../../api/types';
import type { RegularRow, RolloverAggregates } from '../computePlan';

afterEach(cleanup);

// scrollIntoView is not in jsdom — stub it.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

function mkCat(over: Partial<CategoryV10> = {}): CategoryV10 {
  return {
    id: 1,
    name: 'Продукты',
    kind: 'expense',
    is_archived: false,
    sort_order: 0,
    created_at: '2026-05-01T00:00:00Z',
    code: 'food',
    ord: '01',
    plan_cents: 30_000_00,
    rollover: 'misc',
    paused: false,
    parent_id: null,
    ...over,
  };
}

function makeProps(
  propOverrides: Partial<React.ComponentProps<typeof PlanView>> = {},
) {
  const onSliderChange = vi.fn();
  const onSliderCommit = vi.fn();
  const onRolloverChip = vi.fn();
  const onPostRegular = vi.fn();
  const onUnpostRegular = vi.fn();
  const onSubmit = vi.fn();
  const onBack = vi.fn();

  const incomeCents = 100_000_00;
  const categories: CategoryV10[] = [
    mkCat({ id: 1, name: 'Продукты', plan_cents: 30_000_00, rollover: 'misc' }),
    mkCat({ id: 2, name: 'Кафе', plan_cents: 20_000_00, rollover: 'savings' }),
  ];
  const plans: PlanMonthItem[] = [
    { category_id: 1, plan_cents: 30_000_00 },
    { category_id: 2, plan_cents: 20_000_00 },
  ];
  const regulars: RegularRow[] = [];
  const aggregates: RolloverAggregates = { miscCents: 0, savingsCents: 0 };
  const surplusCents = 50_000_00;
  const isOverflow = false;

  return {
    spies: {
      onSliderChange,
      onSliderCommit,
      onRolloverChip,
      onPostRegular,
      onUnpostRegular,
      onSubmit,
      onBack,
    },
    props: {
      incomeCents,
      categories,
      plans,
      regulars,
      aggregates,
      surplusCents,
      isOverflow,
      submitting: false,
      saveError: null,
      focusCategoryId: null,
      onSliderChange,
      onSliderCommit,
      onRolloverChip,
      onPostRegular,
      onUnpostRegular,
      onSubmit,
      onBack,
      ...propOverrides,
    } satisfies React.ComponentProps<typeof PlanView>,
  };
}

// ─────────── Tests ───────────

describe('PlanView', () => {
  it('renders Mass «PLAN / {month-genitive}.» + Eyebrow «MGMT / LIMITS»', () => {
    // Phase 29-04 §5 PlanMonth BLOCKER #2: headline changed from
    // hardcoded «PLAN МЕСЯЦА.» (single-line, 70px) to dynamic
    // «PLAN<br/>{MONTH_GENITIVE}.» (two-line, 56px) per prototype line 738.
    // textContent drops the <br/> so we only check that both PLAN and the
    // current month's genitive form are present.
    const MONTHS_RU_GENITIVE_UPPER = [
      'ЯНВАРЯ', 'ФЕВРАЛЯ', 'МАРТА', 'АПРЕЛЯ', 'МАЯ', 'ИЮНЯ',
      'ИЮЛЯ', 'АВГУСТА', 'СЕНТЯБРЯ', 'ОКТЯБРЯ', 'НОЯБРЯ', 'ДЕКАБРЯ',
    ];
    const month = MONTHS_RU_GENITIVE_UPPER[new Date().getMonth()];
    const { props } = makeProps();
    const { container } = render(<PlanView {...props} />);
    expect(container.textContent).toContain('PLAN');
    expect(container.textContent).toContain(month);
    expect(container.textContent).toContain('MGMT / LIMITS');
  });

  it('renders + surplus + enabled CTA when surplus ≥ 0 (OK)', () => {
    const { props } = makeProps({ surplusCents: 50_000_00, isOverflow: false });
    const { getByTestId, getByText } = render(<PlanView {...props} />);
    const plate = getByTestId('plan-surplus-plate');
    expect(plate.textContent).toContain('+');
    // Whitespace inside ru-RU thousand separator may be NBSP / NNBSP — match
    // digits with arbitrary whitespace between thousands.
    expect(plate.textContent?.replace(/\s+/g, ' ')).toMatch(/50[ ]?000/);
    const cta = getByText('СОХРАНИТЬ ↵').closest('button');
    expect(cta).not.toBeNull();
    expect(cta?.disabled).toBe(false);
  });

  it('renders − surplus + disabled CTA + inline error when isOverflow', () => {
    const { props } = makeProps({
      surplusCents: -20_000_00,
      isOverflow: true,
      saveError: 'Σplan превышает доход — уменьшите лимиты',
    });
    const { getByTestId, getByText } = render(<PlanView {...props} />);
    const plate = getByTestId('plan-surplus-plate');
    expect(plate.textContent).toContain('−');
    expect(plate.textContent?.replace(/\s+/g, ' ')).toMatch(/20[ ]?000/);
    expect(getByTestId('plan-save-error').textContent).toContain('превышает');
    const cta = getByText('СОХРАНИТЬ ↵').closest('button');
    expect(cta?.disabled).toBe(true);
  });

  it('renders 2 rollover aggregate plates with formatted values', () => {
    const { props } = makeProps({
      aggregates: { miscCents: 12_500_00, savingsCents: 7_000_00 },
    });
    const { getByTestId } = render(<PlanView {...props} />);
    expect(getByTestId('agg-misc').textContent).toContain('ПРОЧЕЕ');
    expect(getByTestId('agg-misc').textContent?.replace(/\s+/g, ' ')).toMatch(
      /12[ ]?500/,
    );
    expect(getByTestId('agg-savings').textContent).toContain('НАКОПЛЕНИЯ');
    expect(getByTestId('agg-savings').textContent?.replace(/\s+/g, ' ')).toMatch(
      /7[ ]?000/,
    );
  });

  it('renders empty hint when no regulars; renders rows otherwise', () => {
    const { props: emptyProps } = makeProps();
    const { container: emptyEl } = render(<PlanView {...emptyProps} />);
    expect(emptyEl.textContent).toContain('Нет регулярных платежей');
    cleanup();

    const { props } = makeProps({
      regulars: [
        {
          id: 11,
          name: 'Netflix',
          dayOfMonth: 15,
          categoryName: 'Развлечения',
          amountCents: 49900,
          postedTxnId: null,
        },
        {
          id: 22,
          name: 'Spotify',
          dayOfMonth: 5,
          categoryName: 'Развлечения',
          amountCents: 19900,
          postedTxnId: 555,
        },
      ],
    });
    const { getByTestId } = render(<PlanView {...props} />);
    expect(getByTestId('regular-row-11')).toBeTruthy();
    expect(getByTestId('regular-row-22')).toBeTruthy();
  });

  it('renders «ПРОВЕСТИ →» when posted_txn_id null and calls onPostRegular', () => {
    const { props, spies } = makeProps({
      regulars: [
        {
          id: 11,
          name: 'Netflix',
          dayOfMonth: 15,
          categoryName: 'Развлечения',
          amountCents: 49900,
          postedTxnId: null,
        },
      ],
    });
    const { getByTestId } = render(<PlanView {...props} />);
    const row = getByTestId('regular-row-11');
    const btn = within(row).getByText(/ПРОВЕСТИ/);
    fireEvent.click(btn);
    expect(spies.onPostRegular).toHaveBeenCalledWith(11);
  });

  it('renders «ОТМЕНА» when posted_txn_id set and calls onUnpostRegular', () => {
    const { props, spies } = makeProps({
      regulars: [
        {
          id: 22,
          name: 'Spotify',
          dayOfMonth: 5,
          categoryName: 'Развлечения',
          amountCents: 19900,
          postedTxnId: 555,
        },
      ],
    });
    const { getByTestId } = render(<PlanView {...props} />);
    const row = getByTestId('regular-row-22');
    const btn = within(row).getByText('ОТМЕНА');
    fireEvent.click(btn);
    expect(spies.onUnpostRegular).toHaveBeenCalledWith(22);
  });

  it('renders one slider per category and forwards onSliderChange(catId, cents)', () => {
    const { props, spies } = makeProps();
    const { container } = render(<PlanView {...props} />);
    const sliders = container.querySelectorAll('input[type="range"]');
    expect(sliders.length).toBe(2);
    // Drag the first slider — vitest-dom + RTL change event should propagate to PosterSlider's handler.
    fireEvent.change(sliders[0], { target: { value: '5000000' } });
    expect(spies.onSliderChange).toHaveBeenCalledWith(1, 5_000_000);
  });

  it('renders chip-pair per category; clicking «НАКОПЛЕНИЯ» calls onRolloverChip(catId, savings)', () => {
    const { props, spies } = makeProps();
    const { getByTestId } = render(<PlanView {...props} />);
    const row = getByTestId('cat-row-1');
    const savingsChip = within(row).getByText('НАКОПЛЕНИЯ');
    fireEvent.click(savingsChip);
    expect(spies.onRolloverChip).toHaveBeenCalledWith(1, 'savings');

    const row2 = getByTestId('cat-row-2');
    const miscChip = within(row2).getByText('ПРОЧЕЕ');
    fireEvent.click(miscChip);
    expect(spies.onRolloverChip).toHaveBeenCalledWith(2, 'misc');
  });

  it('focusCategoryId — applies .focused class to that category row', () => {
    const { props } = makeProps({ focusCategoryId: 2 });
    const { getByTestId } = render(<PlanView {...props} />);
    const row1 = getByTestId('cat-row-1');
    const row2 = getByTestId('cat-row-2');
    expect(row1.className).not.toMatch(/focused/);
    expect(row2.className).toMatch(/focused/);
  });

  it('← НАЗАД click calls onBack', () => {
    const { props, spies } = makeProps();
    const { getByText } = render(<PlanView {...props} />);
    fireEvent.click(getByText('← НАЗАД'));
    expect(spies.onBack).toHaveBeenCalledTimes(1);
  });

  it('CTA shows СОХРАНЯЕМ… when submitting and stays disabled', () => {
    const { props } = makeProps({ submitting: true });
    const { getByText } = render(<PlanView {...props} />);
    const cta = getByText('СОХРАНЯЕМ…').closest('button');
    expect(cta?.disabled).toBe(true);
  });

  it('CTA click invokes onSubmit when not disabled', () => {
    const { props, spies } = makeProps();
    const { getByText } = render(<PlanView {...props} />);
    fireEvent.click(getByText('СОХРАНИТЬ ↵'));
    expect(spies.onSubmit).toHaveBeenCalledTimes(1);
  });
});
