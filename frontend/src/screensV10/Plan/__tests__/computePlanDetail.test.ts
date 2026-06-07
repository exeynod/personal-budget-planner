// v1.1 design-fix — income/expense split on «План месяца».
//
// The income ladder is intentionally DIFFERENT from the expense ladder: income
// is planned (expected), never capped. There is NO «лимит»/«свободно»/«over».
// We assert the income ladder exposes План / Запланировано / Получено and the
// delta «Осталось получить» (План − Получено), with «больше = хорошо».

import { describe, it, expect } from 'vitest';
import {
  computeIncomeLadder,
  computeLadder,
  type PlanDetailRow,
} from '../computePlanDetail';

function row(over: Partial<PlanDetailRow> = {}): PlanDetailRow {
  return {
    id: 1,
    title: 'Зарплата',
    amountCents: 0,
    plannedDate: '2026-05-10',
    kind: 'income',
    posted: false,
    subscriptionId: null,
    ...over,
  };
}

describe('computeIncomeLadder', () => {
  it('splits scheduled (unposted) and received (posted) with no overflow concept', () => {
    const rows = [
      row({ id: 1, amountCents: 50_000_00, posted: false }),
      row({ id: 2, amountCents: 100_000_00, posted: true }),
    ];
    const ladder = computeIncomeLadder(150_000_00, rows);

    expect(ladder.planCents).toBe(150_000_00);
    expect(ladder.scheduledCents).toBe(50_000_00); // unposted only
    expect(ladder.receivedCents).toBe(100_000_00); // posted only
    // «Осталось получить» = План − Получено (positive → still to come).
    expect(ladder.remainingCents).toBe(50_000_00);
    expect(ladder.overReceived).toBe(false);

    // No expense-style fields leak in — income has no «лимит»/«свободно».
    expect(ladder).not.toHaveProperty('limitCents');
    expect(ladder).not.toHaveProperty('freeCents');
    expect(ladder).not.toHaveProperty('overflow');
  });

  it('flags «Сверх плана» (overReceived) when received beats the plan — больше = хорошо', () => {
    const rows = [row({ id: 1, amountCents: 180_000_00, posted: true })];
    const ladder = computeIncomeLadder(150_000_00, rows);

    expect(ladder.receivedCents).toBe(180_000_00);
    // Negative «остаток» means we overshot the plan (a good outcome for income).
    expect(ladder.remainingCents).toBe(-30_000_00);
    expect(ladder.overReceived).toBe(true);
  });

  it('returns the full plan as «осталось получить» when nothing is received yet', () => {
    const ladder = computeIncomeLadder(150_000_00, [
      row({ id: 1, amountCents: 150_000_00, posted: false }),
    ]);
    expect(ladder.receivedCents).toBe(0);
    expect(ladder.remainingCents).toBe(150_000_00);
    expect(ladder.overReceived).toBe(false);
  });
});

describe('computeLadder (expense, unchanged)', () => {
  it('keeps the expense «лимит/свободно/overflow» semantics', () => {
    const rows = [
      row({ id: 1, amountCents: 30_000_00, posted: false, kind: 'expense' }),
    ];
    const ladder = computeLadder(16_000_00, rows);
    expect(ladder.limitCents).toBe(16_000_00);
    expect(ladder.scheduledCents).toBe(30_000_00);
    expect(ladder.freeCents).toBe(-14_000_00);
    expect(ladder.overflow).toBe(true);
  });
});
