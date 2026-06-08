// v1.1 design-fix — income/expense split on «План месяца».
//
// The income ladder is intentionally DIFFERENT from the expense ladder: income
// has NO «limit»/«plan target» entity — only plan detailing. There is NO
// «лимит»/«свободно»/«over»/«План»/«остаток». We assert the income ladder
// exposes ONLY Запланировано (unposted) / Получено (posted).

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
  it('splits scheduled (unposted) and received (posted) — no limit/target/overflow concept', () => {
    const rows = [
      row({ id: 1, amountCents: 50_000_00, posted: false }),
      row({ id: 2, amountCents: 100_000_00, posted: true }),
    ];
    const ladder = computeIncomeLadder(rows);

    expect(ladder.scheduledCents).toBe(50_000_00); // unposted only
    expect(ladder.receivedCents).toBe(100_000_00); // posted only

    // No plan-target/limit/overflow fields exist — income has only detailing.
    expect(ladder).not.toHaveProperty('planCents');
    expect(ladder).not.toHaveProperty('remainingCents');
    expect(ladder).not.toHaveProperty('overReceived');
    expect(ladder).not.toHaveProperty('limitCents');
    expect(ladder).not.toHaveProperty('freeCents');
    expect(ladder).not.toHaveProperty('overflow');
  });

  it('sums only posted rows into received (больше = хорошо, no cap)', () => {
    const rows = [row({ id: 1, amountCents: 180_000_00, posted: true })];
    const ladder = computeIncomeLadder(rows);

    expect(ladder.receivedCents).toBe(180_000_00);
    expect(ladder.scheduledCents).toBe(0);
  });

  it('counts unposted rows as scheduled when nothing is received yet', () => {
    const ladder = computeIncomeLadder([
      row({ id: 1, amountCents: 150_000_00, posted: false }),
    ]);
    expect(ladder.receivedCents).toBe(0);
    expect(ladder.scheduledCents).toBe(150_000_00);
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
