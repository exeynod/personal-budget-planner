// ADR-0007 — Home «Регулярные платежи» prompt: due-today + overdue occurrences.
//
// Rendered on Home above the «На сегодня» list. Groups items into «Сегодня» vs
// «Просрочено» (by planned_date vs MSK today). Each item offers:
//   - Оплачено  → confirm / adjust amount, then pay
//   - Пропустить → skip
//   - Перенести  → in-period date picker, then postpone
// Hidden entirely (returns null) when the due list is empty — the parent already
// guards on length, but we double-guard so a stale render never shows an empty card.

import { useState } from 'react';
import { ArrowsClockwise } from '@phosphor-icons/react';
import {
  SectionHeader,
  InsetGroup,
  useScrollIntoViewOnFocus,
} from '../native/NativePrimitives';
import { PosterSheet } from '../common';
import { NativeDatePicker } from '../native/NativeDatePicker';
import { CategoryIcon } from '../native/CategoryIcon';
import { formatMoneyNative } from '../native/money';
import { parseRublesToKopecks } from '../../utils/format';
import { sanitizeMoneyInput } from '../../utils/parseMoney';
import type { CategoryV10, RecurringDueRow } from '../../api/v10';
import { todayIsoLocal } from './recurringFormat';
import styles from './RecurringDuePrompt.module.css';

export interface RecurringDuePromptProps {
  due: RecurringDueRow[];
  /** Categories for icon/name resolution. */
  categories: CategoryV10[];
  /** Active period bounds (ISO) constraining the «Перенести» date picker. */
  periodStart?: string | null;
  periodEnd?: string | null;
  /** Pay an occurrence (planned-row id) with an optional amount override. */
  onPay: (plannedId: number, amountCents?: number) => void;
  /** Skip an occurrence. */
  onSkip: (plannedId: number) => void;
  /** Postpone an occurrence to `newDate` (within the current period). */
  onPostpone: (plannedId: number, newDate: string) => void;
}

function centsToRublesInput(cents: number): string {
  const abs = Math.max(0, Math.trunc(cents));
  if (abs === 0) return '';
  const rub = Math.floor(abs / 100);
  const kop = abs % 100;
  return kop === 0 ? `${rub}` : `${rub},${kop.toString().padStart(2, '0')}`;
}

export function RecurringDuePrompt({
  due,
  categories,
  periodStart,
  periodEnd,
  onPay,
  onSkip,
  onPostpone,
}: RecurringDuePromptProps) {
  // Which occurrence has its «Оплачено» confirm / «Перенести» picker open.
  const [payRow, setPayRow] = useState<RecurringDueRow | null>(null);
  const [payAmountRaw, setPayAmountRaw] = useState('');
  const [postponeRow, setPostponeRow] = useState<RecurringDueRow | null>(null);
  const [postponeDate, setPostponeDate] = useState<string | null>(null);
  // Bug fix B: keep the pay-amount field above the iPhone keyboard.
  const payAmountFocusScroll = useScrollIntoViewOnFocus();

  if (due.length === 0) return null;

  const today = todayIsoLocal();
  const catById = new Map(categories.map((c) => [c.id, c]));

  // «Сегодня» = planned_date === today; «Просрочено» = planned_date < today.
  // Rows without a date fall into «Сегодня» (defensive — backend filters to
  // due-today-or-overdue, so a null date is treated as actionable now).
  const overdue = due.filter((r) => r.planned_date != null && r.planned_date < today);
  const todayRows = due.filter(
    (r) => r.planned_date == null || r.planned_date >= today,
  );

  function openPay(row: RecurringDueRow) {
    setPayRow(row);
    setPayAmountRaw(centsToRublesInput(row.amount_cents));
  }
  function confirmPay() {
    if (!payRow) return;
    const cents = parseRublesToKopecks(payAmountRaw.trim());
    // Pay with the override only when it differs from the planned amount and is
    // a valid positive value; otherwise pay at the planned amount.
    const override =
      cents != null && cents > 0 && cents !== payRow.amount_cents
        ? cents
        : undefined;
    onPay(payRow.id, override);
    setPayRow(null);
  }
  function openPostpone(row: RecurringDueRow) {
    setPostponeRow(row);
    // Default the picker to today (a sensible in-period start).
    setPostponeDate(row.planned_date ?? today);
  }
  function confirmPostpone() {
    if (!postponeRow || !postponeDate) return;
    onPostpone(postponeRow.id, postponeDate);
    setPostponeRow(null);
  }

  function renderRow(row: RecurringDueRow) {
    const cat = catById.get(row.category_id);
    const name = row.description?.trim() || cat?.name || 'Платёж';
    return (
      <div
        key={row.id}
        className={styles.row}
        data-testid={`recurring-due-${row.id}`}
      >
        {/* Top line: icon + name (full, wraps — no ellipsis clipping) + amount.
            Actions move to their OWN row below so the iPhone-width 3-column flex
            can no longer crush the name/amount (bug fix A). */}
        <div className={styles.rowTop}>
          <CategoryIcon name={cat?.name ?? name} id={row.category_id} icon={cat?.icon} />
          <span className={styles.main}>
            <span className={styles.title}>{name}</span>
            <span className={styles.amount}>
              {formatMoneyNative(row.amount_cents)} ₽
            </span>
          </span>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.payBtn}`}
            data-testid={`recurring-due-pay-${row.id}`}
            onClick={() => openPay(row)}
          >
            Оплачено
          </button>
          <button
            type="button"
            className={styles.actionBtn}
            data-testid={`recurring-due-postpone-${row.id}`}
            onClick={() => openPostpone(row)}
          >
            Перенести
          </button>
          <button
            type="button"
            className={styles.actionBtn}
            data-testid={`recurring-due-skip-${row.id}`}
            onClick={() => onSkip(row.id)}
          >
            Пропустить
          </button>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="recurring-due-card">
      <SectionHeader>
        <span className={styles.headerLabel}>
          <ArrowsClockwise size={14} weight="bold" />
          Регулярные платежи
        </span>
      </SectionHeader>

      {overdue.length > 0 && (
        <>
          <div className={styles.groupLabel} data-testid="recurring-due-overdue">
            Просрочено
          </div>
          <InsetGroup>{overdue.map(renderRow)}</InsetGroup>
        </>
      )}

      {todayRows.length > 0 && (
        <>
          <div className={styles.groupLabel} data-testid="recurring-due-today">
            Сегодня
          </div>
          <InsetGroup>{todayRows.map(renderRow)}</InsetGroup>
        </>
      )}

      {/* «Оплачено» — confirm / adjust amount before posting. */}
      <PosterSheet
        isOpen={payRow != null}
        onClose={() => setPayRow(null)}
        testId="recurring-pay-sheet"
      >
        <div className={styles.sheet}>
          <div className={styles.sheetTitle}>Оплатить платёж</div>
          <div className={styles.sheetSub}>
            {payRow?.description?.trim() ||
              catById.get(payRow?.category_id ?? -1)?.name ||
              'Платёж'}
          </div>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Сумма, ₽</span>
            <input
              type="text"
              inputMode="decimal"
              className={styles.fieldInput}
              value={payAmountRaw}
              onChange={(e) => setPayAmountRaw(sanitizeMoneyInput(e.target.value))}
              {...payAmountFocusScroll}
              aria-label="Сумма платежа"
              data-testid="recurring-pay-amount"
              autoFocus
            />
          </div>
          <button
            type="button"
            className={styles.primaryBtn}
            data-testid="recurring-pay-confirm"
            onClick={confirmPay}
          >
            Оплачено
          </button>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={() => setPayRow(null)}
          >
            Отмена
          </button>
        </div>
      </PosterSheet>

      {/* «Перенести» — in-period date picker. */}
      <PosterSheet
        isOpen={postponeRow != null}
        onClose={() => setPostponeRow(null)}
        testId="recurring-postpone-sheet"
      >
        <div className={styles.sheet}>
          <div className={styles.sheetTitle}>Перенести платёж</div>
          <div className={styles.sheetSub}>В пределах текущего месяца</div>
          <NativeDatePicker
            label="Новая дата"
            value={postponeDate}
            onChange={setPostponeDate}
            min={periodStart ?? undefined}
            max={periodEnd ?? undefined}
            testId="recurring-postpone-date"
          />
          <button
            type="button"
            className={styles.primaryBtn}
            data-testid="recurring-postpone-confirm"
            onClick={confirmPostpone}
          >
            Перенести
          </button>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={() => setPostponeRow(null)}
          >
            Отмена
          </button>
        </div>
      </PosterSheet>
    </div>
  );
}
