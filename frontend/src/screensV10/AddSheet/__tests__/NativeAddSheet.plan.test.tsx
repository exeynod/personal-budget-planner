// Plan-mode AddSheet (v1.1 «один глобальный +»): the SAME native add sheet used
// on Home, but `mode="plan"` writes a planned row via createPlanned (NOT
// createActualV10) into the selected period — category picked inside the sheet,
// no account leg. Replaces the old per-category inline planned-add.
//
// We mock the v10 API leaves + listPeriods (SelectedPeriodProvider) and assert:
//   - the chrome switches to plan copy («В план» / «Добавить в план»);
//   - submit calls createPlanned(periodId, {category_id, kind, amount_cents,
//     description, planned_date}) — NOT createActualV10;
//   - onSubmitted fires with the created planned id.

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import {
  render,
  cleanup,
  screen,
  act,
  fireEvent,
} from '@testing-library/react';
import type { PeriodRead } from '../../../api/types';
import type { CategoryV10 } from '../../../api/v10';

const listAccountsMock = vi.fn();
const listCategoriesV10Mock = vi.fn();
const createActualV10Mock = vi.fn();
const createPlannedMock = vi.fn();
const listPeriodsMock = vi.fn();

vi.mock('../../../api/v10', () => ({
  listAccounts: (...a: unknown[]) => listAccountsMock(...a),
  listCategoriesV10: (...a: unknown[]) => listCategoriesV10Mock(...a),
  createActualV10: (...a: unknown[]) => createActualV10Mock(...a),
  createPlanned: (...a: unknown[]) => createPlannedMock(...a),
}));

vi.mock('../../../api/periods', () => ({
  listPeriods: (...a: unknown[]) => listPeriodsMock(...a),
  getCurrentPeriod: vi.fn(),
  getPeriodBalance: vi.fn(),
}));

import { NativeAddSheet } from '../NativeAddSheet';
import { SelectedPeriodProvider } from '../../common';

const ACTIVE_PERIOD: PeriodRead = {
  id: 7,
  period_start: '2026-06-01',
  period_end: '2026-06-30',
  starting_balance_cents: 0,
  ending_balance_cents: null,
  status: 'active',
  closed_at: null,
};

const CATEGORIES: CategoryV10[] = [
  {
    id: 10,
    name: 'Кафе',
    kind: 'expense',
    is_archived: false,
    sort_order: 1,
    created_at: '2026-04-01T00:00:00+00:00',
    code: 'cafe',
    ord: '01',
    paused: false,
  },
];

beforeEach(() => {
  listAccountsMock.mockResolvedValue([]);
  listCategoriesV10Mock.mockResolvedValue(CATEGORIES);
  listPeriodsMock.mockResolvedValue([ACTIVE_PERIOD]);
  createPlannedMock.mockResolvedValue({ id: 999 });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderPlanSheet() {
  const onSubmitted = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <SelectedPeriodProvider>
      <NativeAddSheet mode="plan" onSubmitted={onSubmitted} onClose={onClose} />
    </SelectedPeriodProvider>,
  );
  await flush();
  return { ...utils, onSubmitted, onClose };
}

describe('NativeAddSheet — plan mode', () => {
  it('renders plan-mode chrome («В план»)', async () => {
    await renderPlanSheet();
    expect(screen.getByText('В план')).toBeInTheDocument();
  });

  it('submit creates a planned row (createPlanned, not createActualV10)', async () => {
    const { onSubmitted } = await renderPlanSheet();

    // Pick the category inside the sheet.
    fireEvent.click(screen.getByTestId('native-add-category-row'));
    fireEvent.click(screen.getByTestId('native-add-cat-10'));

    // Type «500» on the native keypad (scoped to the keypad group).
    const keypad = screen.getByTestId('native-add-keypad');
    const digit = (d: string) =>
      fireEvent.click(
        Array.from(keypad.querySelectorAll('button')).find(
          (b) => b.textContent?.trim() === d,
        )!,
      );
    digit('5');
    digit('0');
    digit('0');

    // CTA reads «Добавить в план» and is enabled.
    const cta = screen.getByTestId('native-add-cta');
    expect(cta).toHaveTextContent('Добавить в план');
    expect(cta).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(cta);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(createActualV10Mock).not.toHaveBeenCalled();
    expect(createPlannedMock).toHaveBeenCalledTimes(1);
    const [periodId, payload] = createPlannedMock.mock.calls[0];
    expect(periodId).toBe(7);
    expect(payload).toMatchObject({
      category_id: 10,
      kind: 'expense',
      amount_cents: 500_00,
    });
    expect(payload.planned_date).toBeTruthy();
    expect(onSubmitted).toHaveBeenCalledWith(999);
  });
});
