// ADR-0007 — «Регулярные платежи» (прогноз кэшфлоу) view.
//
// Surfaces the cashflow projection (what the per-category template can't show —
// «когда и хватит ли денег»):
//   - месячная нагрузка card (monthly_burden_cents),
//   - таймлайн ближайших списаний grouped by date, with the running balance
//     projection (red when it goes negative),
//   - tap a timeline item → edit that recurring payment (RecurringEditor).
//
// Pure presentational: RecurringCashflowMount wires the data + mutations.

import { memo, useState } from 'react';
import {
  ArrowsClockwise,
  WarningCircle,
  TrendDown,
} from '@phosphor-icons/react';
import {
  NativeNavBar,
  SectionHeader,
  InsetGroup,
  InsetRow,
} from '../native/NativePrimitives';
import { CategoryIcon } from '../native/CategoryIcon';
import { formatMoneyNative } from '../native/money';
import { RecurringEditor } from './RecurringEditor';
import { formatShortDate } from './recurringFormat';
import { groupCashflowByDay } from './computeCashflow';
import type {
  CashflowProjectionResponse,
  SubscriptionV10Read,
  CategoryV10,
  AccountResponse,
  RecurringCreatePayload,
  RecurringUpdatePayload,
} from '../../api/v10';
import styles from './NativeRecurringCashflowView.module.css';

export interface NativeRecurringCashflowViewProps {
  cashflow: CashflowProjectionResponse;
  recurring: SubscriptionV10Read[];
  categories: CategoryV10[];
  accounts: AccountResponse[];
  busy: boolean;
  onCreate: (payload: RecurringCreatePayload) => void;
  onUpdate: (id: number, payload: RecurringUpdatePayload) => void;
  onDelete: (id: number) => void;
  onBack: () => void;
}

function NativeRecurringCashflowViewInner(
  props: NativeRecurringCashflowViewProps,
) {
  const {
    cashflow,
    recurring,
    categories,
    accounts,
    busy,
    onCreate,
    onUpdate,
    onDelete,
    onBack,
  } = props;

  // Which payment is being edited (resolved from `recurring` by subscription_id).
  const [editingId, setEditingId] = useState<number | null>(null);

  const subById = new Map(recurring.map((s) => [s.id, s]));
  const catById = new Map(categories.map((c) => [c.id, c]));
  const dayGroups = groupCashflowByDay(cashflow.timeline);

  const editingSub = editingId == null ? null : (subById.get(editingId) ?? null);
  const editingCat =
    editingSub == null ? null : (catById.get(editingSub.category_id) ?? null);

  function openEdit(subscriptionId: number) {
    if (subById.has(subscriptionId)) setEditingId(subscriptionId);
  }

  return (
    <div className={styles.root} data-testid="recurring-cashflow-view">
      <NativeNavBar title="Регулярные платежи" onBack={onBack} />

      {/* ─────────── Месячная нагрузка card ─────────── */}
      <div className={styles.burdenCard} data-testid="cashflow-burden">
        <div className={styles.burdenHead}>
          <span className={styles.burdenIcon} aria-hidden="true">
            <TrendDown size={18} weight="bold" />
          </span>
          <span className={styles.burdenLabel}>Нагрузка в месяц</span>
        </div>
        <div className={styles.burdenValue}>
          {formatMoneyNative(cashflow.monthly_burden_cents)}
          <span className={styles.burdenCur}>₽</span>
        </div>
        <div className={styles.burdenSub}>
          Начальный остаток {formatMoneyNative(cashflow.starting_balance_cents)} ₽
          · прогноз на {cashflow.horizon_days} дней
        </div>
      </div>

      {/* ─────────── Inline editor (tap-to-edit) ─────────── */}
      {editingSub && editingCat && (
        <RecurringEditor
          category={editingCat}
          existing={editingSub}
          accounts={accounts}
          busy={busy}
          onCreate={onCreate}
          onUpdate={(id, payload) => {
            onUpdate(id, payload);
            setEditingId(null);
          }}
          onDelete={(id) => {
            onDelete(id);
            setEditingId(null);
          }}
          onCancel={() => setEditingId(null)}
        />
      )}

      {/* ─────────── Timeline + balance projection ─────────── */}
      <SectionHeader>Ближайшие списания</SectionHeader>

      {dayGroups.length === 0 ? (
        <div className={styles.empty} data-testid="cashflow-empty">
          Нет запланированных списаний в ближайшие {cashflow.horizon_days} дней
        </div>
      ) : (
        dayGroups.map((group) => (
          <div key={group.dateKey} className={styles.dayGroup}>
            <div className={styles.dayHeaderRow}>
              <SectionHeader>{formatShortDate(group.dateKey)}</SectionHeader>
              <span
                className={`${styles.dayBalance} ${
                  group.goesNegative ? styles.dayBalanceNeg : ''
                }`}
                data-testid={`cashflow-balance-${group.dateKey}`}
              >
                {group.goesNegative && (
                  <WarningCircle size={13} weight="fill" />
                )}
                Остаток {formatMoneyNative(group.balanceAfterCents)} ₽
              </span>
            </div>
            <InsetGroup>
              {group.events.map((ev, i) => {
                const cat = catById.get(ev.category_id);
                const editable = subById.has(ev.subscription_id);
                return (
                  <InsetRow
                    key={`${group.dateKey}-${ev.subscription_id}-${i}`}
                    testId={`cashflow-event-${ev.subscription_id}-${i}`}
                    leading={
                      <CategoryIcon
                        name={cat?.name ?? ev.name}
                        id={ev.category_id}
                        icon={cat?.icon}
                      />
                    }
                    title={
                      <span className={styles.eventName}>
                        <ArrowsClockwise
                          size={13}
                          weight="bold"
                          className={styles.recurringBadge}
                        />
                        {ev.name}
                      </span>
                    }
                    trailing={
                      <span className={styles.eventAmount}>
                        −{formatMoneyNative(ev.amount_cents)} ₽
                      </span>
                    }
                    chevron={editable}
                    onClick={
                      editable ? () => openEdit(ev.subscription_id) : undefined
                    }
                  />
                );
              })}
            </InsetGroup>
          </div>
        ))
      )}

      <div className={styles.footnote}>
        Прогноз строится по активным регулярным платежам. Откройте платёж, чтобы
        изменить сумму, интервал или дату.
      </div>
    </div>
  );
}

export const NativeRecurringCashflowView = memo(
  NativeRecurringCashflowViewInner,
);
