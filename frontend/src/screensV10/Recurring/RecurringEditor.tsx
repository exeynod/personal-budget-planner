// ADR-0007 — inline editor for a «регулярный платёж» (create + edit share it).
//
// Reused by:
//   - the TEMPLATE category-detail fork («Регулярный платёж» branch), where the
//     category is FIXED (inherited, no picker), and
//   - the CASHFLOW screen, where tapping a timeline item edits its recurring
//     (category picker shown so the payment can be re-categorised).
//
// Fields: название, сумma (₽), «повторять каждые N мес» (1..120), «число месяца»
// (1..28, optional), дата следующего платежа, счёт (optional). Creates via
// POST /subscriptions (interval_months = N); edits via PATCH; deletes via DELETE.
//
// Pure presentational over the recurring client — the parent owns reload/toast.

import { useState } from 'react';
import {
  InsetGroup,
  SectionHeader,
  useScrollIntoViewOnFocus,
} from '../native/NativePrimitives';
import { NativeDatePicker } from '../native/NativeDatePicker';
import { parseRublesToKopecks } from '../../utils/format';
import { sanitizeMoneyInput } from '../../utils/parseMoney';
import { centsToRublesInput } from '../native/money';
import { useEnterToDismiss } from '../common/useEnterToDismiss';
import type { CategoryV10, AccountResponse } from '../../api/v10';
import type {
  RecurringCreatePayload,
  RecurringUpdatePayload,
  SubscriptionV10Read,
} from '../../api/v10';
import { todayIsoLocal } from './recurringFormat';
import styles from './RecurringEditor.module.css';

const INTERVAL_MIN = 1;
const INTERVAL_MAX = 120;
const DAY_MIN = 1;
const DAY_MAX = 28;

export interface RecurringEditorProps {
  /**
   * Category for a NEW recurring (template fork). When editing, this is the
   * payment's current category. Always required so we never POST without one.
   */
  category: CategoryV10;
  /** Existing payment when editing; null/undefined → create mode. */
  existing?: SubscriptionV10Read | null;
  /** Optional account picker options (empty → no «Счёт» row). */
  accounts?: AccountResponse[];
  busy: boolean;
  onCreate: (payload: RecurringCreatePayload) => void;
  onUpdate: (id: number, payload: RecurringUpdatePayload) => void;
  onDelete: (id: number) => void;
  onCancel: () => void;
}

function clampInt(raw: string, min: number, max: number): number | null {
  const t = raw.trim();
  if (t === '') return null;
  const n = Math.trunc(Number(t));
  if (!Number.isFinite(n)) return null;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

export function RecurringEditor({
  category,
  existing,
  accounts = [],
  busy,
  onCreate,
  onUpdate,
  onDelete,
  onCancel,
}: RecurringEditorProps) {
  const isEdit = existing != null;

  const [name, setName] = useState(existing?.name ?? '');
  const [amountRaw, setAmountRaw] = useState(
    existing ? centsToRublesInput(existing.amount_cents) : '',
  );
  const [intervalRaw, setIntervalRaw] = useState(
    String(existing?.interval_months ?? 1),
  );
  const [dayRaw, setDayRaw] = useState(
    existing?.day_of_month != null ? String(existing.day_of_month) : '',
  );
  const [nextDate, setNextDate] = useState<string | null>(
    existing?.next_charge_date ?? todayIsoLocal(),
  );
  const [accountId, setAccountId] = useState<number | null>(
    existing?.account_id ?? null,
  );

  const amountCents = parseRublesToKopecks(amountRaw.trim());
  const interval = clampInt(intervalRaw, INTERVAL_MIN, INTERVAL_MAX);
  const dayTrim = dayRaw.trim();
  const day = dayTrim === '' ? null : clampInt(dayRaw, DAY_MIN, DAY_MAX);
  const dayValid = dayTrim === '' || day != null;

  const canSubmit =
    name.trim() !== '' &&
    amountCents != null &&
    amountCents > 0 &&
    interval != null &&
    dayValid &&
    nextDate != null &&
    !busy;

  function submit() {
    if (
      !canSubmit ||
      amountCents == null ||
      interval == null ||
      nextDate == null
    )
      return;
    if (isEdit && existing) {
      const payload: RecurringUpdatePayload = {
        name: name.trim(),
        amount_cents: amountCents,
        interval_months: interval,
        next_charge_date: nextDate,
        category_id: category.id,
        day_of_month: day,
        account_id: accountId,
      };
      onUpdate(existing.id, payload);
    } else {
      const payload: RecurringCreatePayload = {
        name: name.trim(),
        amount_cents: amountCents,
        interval_months: interval,
        next_charge_date: nextDate,
        category_id: category.id,
        is_active: true,
      };
      if (day != null) payload.day_of_month = day;
      if (accountId != null) payload.account_id = accountId;
      onCreate(payload);
    }
  }

  const submitOnEnter = useEnterToDismiss(() => {
    if (canSubmit) submit();
  });
  // Bug fix B: keep each focused free-text field above the iPhone keyboard.
  const nameFocusScroll = useScrollIntoViewOnFocus();
  const amountFocusScroll = useScrollIntoViewOnFocus();
  const intervalFocusScroll = useScrollIntoViewOnFocus();
  const dayFocusScroll = useScrollIntoViewOnFocus();

  return (
    <div className={styles.editor} data-testid="recurring-editor">
      <SectionHeader>
        {isEdit ? 'Регулярный платёж' : 'Новый регулярный платёж'}
      </SectionHeader>
      <InsetGroup>
        <div className={styles.body}>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Название</span>
            <input
              type="text"
              className={styles.fieldInput}
              placeholder="Например, Подписка"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={submitOnEnter}
              {...nameFocusScroll}
              maxLength={200}
              aria-label="Название платежа"
              data-testid="recurring-name"
              autoFocus
            />
          </div>

          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Сумма, ₽</span>
              <input
                type="text"
                inputMode="decimal"
                className={styles.fieldInput}
                placeholder="0"
                value={amountRaw}
                onChange={(e) =>
                  setAmountRaw(sanitizeMoneyInput(e.target.value))
                }
                onKeyDown={submitOnEnter}
                {...amountFocusScroll}
                aria-label="Сумма платежа"
                data-testid="recurring-amount"
              />
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>
                Каждые N мес ({INTERVAL_MIN}–{INTERVAL_MAX})
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={INTERVAL_MIN}
                max={INTERVAL_MAX}
                step={1}
                className={styles.fieldInput}
                placeholder="1"
                value={intervalRaw}
                onChange={(e) =>
                  setIntervalRaw(
                    e.target.value.replace(/[^0-9]/g, '').slice(0, 3),
                  )
                }
                onKeyDown={submitOnEnter}
                {...intervalFocusScroll}
                aria-label="Повторять каждые N месяцев"
                data-testid="recurring-interval"
              />
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>
              Число месяца ({DAY_MIN}–{DAY_MAX}, необязательно)
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={DAY_MIN}
              max={DAY_MAX}
              step={1}
              className={styles.fieldInput}
              placeholder="—"
              value={dayRaw}
              onChange={(e) =>
                setDayRaw(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))
              }
              onKeyDown={submitOnEnter}
              {...dayFocusScroll}
              aria-label="Число месяца"
              data-testid="recurring-day"
            />
          </div>

          <NativeDatePicker
            label="Дата следующего платежа"
            value={nextDate}
            onChange={setNextDate}
            testId="recurring-next-date"
          />

          {accounts.length > 0 && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Счёт (необязательно)</span>
              <select
                className={styles.fieldInput}
                value={accountId ?? ''}
                onChange={(e) =>
                  setAccountId(
                    e.target.value === '' ? null : Number(e.target.value),
                  )
                }
                aria-label="Счёт списания"
                data-testid="recurring-account"
              >
                <option value="">Основной счёт</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.bank}
                    {a.mask ? ` ·· ${a.mask}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className={styles.actions}>
            {isEdit ? (
              <button
                type="button"
                className={styles.dangerBtn}
                disabled={busy}
                onClick={() => existing && onDelete(existing.id)}
                data-testid="recurring-delete"
              >
                Удалить
              </button>
            ) : (
              <span />
            )}
            <span className={styles.actionsRight}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={onCancel}
                data-testid="recurring-cancel"
              >
                Отмена
              </button>
              <button
                type="button"
                className={styles.primaryBtn}
                disabled={!canSubmit}
                onClick={submit}
                data-testid="recurring-submit"
              >
                {busy ? '…' : isEdit ? 'Сохранить' : 'Добавить'}
              </button>
            </span>
          </div>
        </div>
      </InsetGroup>
    </div>
  );
}
