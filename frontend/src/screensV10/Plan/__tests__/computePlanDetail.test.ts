// v1.1 design-fix — income/expense split on «План месяца».
//
// The income ladder is intentionally DIFFERENT from the expense ladder: income
// has NO «limit»/«plan target» entity — only plan detailing. There is NO
// «лимит»/«свободно»/«over»/«План»/«остаток». This is the PLAN surface, so the
// ladder exposes ONLY Запланировано (Σ unposted) — «Получено» (the fact of
// received income) was dropped; it lives on the fact/home side now.

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
  it('sums only UNPOSTED rows into scheduled — no received/limit/target/overflow concept', () => {
    const rows = [
      row({ id: 1, amountCents: 50_000_00, posted: false }),
      row({ id: 2, amountCents: 100_000_00, posted: true }),
    ];
    const ladder = computeIncomeLadder(rows);

    expect(ladder.scheduledCents).toBe(50_000_00); // unposted only

    // «Получено» (the fact of received income) is NOT surfaced on the plan.
    expect(ladder).not.toHaveProperty('receivedCents');
    // No plan-target/limit/overflow fields exist — income has only detailing.
    expect(ladder).not.toHaveProperty('planCents');
    expect(ladder).not.toHaveProperty('remainingCents');
    expect(ladder).not.toHaveProperty('overReceived');
    expect(ladder).not.toHaveProperty('limitCents');
    expect(ladder).not.toHaveProperty('freeCents');
    expect(ladder).not.toHaveProperty('overflow');
  });

  it('excludes posted (received) rows from scheduled', () => {
    const rows = [row({ id: 1, amountCents: 180_000_00, posted: true })];
    const ladder = computeIncomeLadder(rows);

    expect(ladder.scheduledCents).toBe(0);
  });

  it('counts unposted rows as scheduled when nothing is received yet', () => {
    const ladder = computeIncomeLadder([
      row({ id: 1, amountCents: 150_000_00, posted: false }),
    ]);
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
