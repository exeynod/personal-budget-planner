import { useState } from 'react';
import { BottomSheet } from './BottomSheet';
import { useCategories } from '../hooks/useCategories';
import type {
  SubscriptionRead,
  SubscriptionCreatePayload,
  SubscriptionUpdatePayload,
  SubCycle,
} from '../api/types';
import styles from './SubscriptionEditor.module.css';

interface Props {
  mode: 'create' | 'edit';
  initial?: SubscriptionRead;
  /** Default notify_days_before from useSettings/SettingsRead. */
  defaultNotifyDays: number;
  onClose: () => void;
  onSubmit: (payload: SubscriptionCreatePayload | SubscriptionUpdatePayload) => Promise<void>;
  onDelete?: () => Promise<void>;
}

/**
 * Bottom-sheet form for creating or editing a subscription.
 *
 * Renders all 7 fields:
 *  1. name — text input
 *  2. amount — decimal input (rub), converts to kopecks on submit
 *  3. cycle — segmented control (monthly | yearly)
 *  4. next_charge_date — date picker
 *  5. category — select from active categories
 *  6. notify_days_before — number input 0..30
 *  7. is_active — checkbox toggle (edit mode only)
 *
 * Threat T-06-10: parseFloat + Math.round double-guards amount input.
 */
export function SubscriptionEditor({
  mode,
  initial,
  defaultNotifyDays,
  onClose,
  onSubmit,
  onDelete,
}: Props) {
  const { categories } = useCategories(false);

  const [name, setName] = useState(initial?.name ?? '');
  const [amountRub, setAmountRub] = useState(
    initial ? (initial.amount_cents / 100).toString() : '',
  );
  const [cycle, setCycle] = useState<SubCycle>(initial?.cycle ?? 'monthly');
  const [chargeDate, setChargeDate] = useState(
    initial?.next_charge_date ?? new Date().toISOString().slice(0, 10),
  );
  const [categoryId, setCategoryId] = useState<number | null>(initial?.category_id ?? null);
  const [notifyDays, setNotifyDays] = useState(
    initial?.notify_days_before ?? defaultNotifyDays,
  );
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name.trim() || !categoryId || !amountRub) {
      setErr('Заполните обязательные поля');
      return;
    }
    const parsedAmount = parseFloat(amountRub.replace(',', '.'));
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setErr('Введите корректную сумму');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const cents = Math.round(parsedAmount * 100);
      const payload: SubscriptionCreatePayload = {
        name: name.trim(),
        amount_cents: cents,
        cycle,
        next_charge_date: chargeDate,
        category_id: categoryId,
        notify_days_before: notifyDays,
        is_active: isActive,
      };
      await onSubmit(payload);
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'ошибка');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Удалить подписку?')) return;
    setBusy(true);
    try {
      await onDelete!();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = !busy && name.trim().length > 0 && categoryId !== null && amountRub !== '';

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={mode === 'create' ? 'Новая подписка' : 'Подписка'}
    >
      <div className={styles.form}>
        {err && <div className={styles.error}>{err}</div>}

        {/* 1. Name */}
        <label className={styles.field}>
          <span className={styles.label}>Название</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например, Netflix"
            maxLength={255}
            className={styles.input}
          />
        </label>

        {/* 2. Amount (rub → cents on submit) */}
        <label className={styles.field}>
          <span className={styles.label}>Сумма, ₽</span>
          <input
            type="text"
            inputMode="decimal"
            value={amountRub}
            onChange={(e) => setAmountRub(e.target.value)}
            placeholder="0,00"
            className={styles.input}
          />
        </label>

        {/* 3. Cycle segmented control (monthly | yearly) */}
        <div className={styles.field}>
          <span className={styles.label}>Цикл</span>
          <div className={styles.segmented}>
            <button
              type="button"
              className={cycle === 'monthly' ? styles.segActive : styles.seg}
              onClick={() => setCycle('monthly')}
              disabled={busy}
            >
              Месяц
            </button>
            <button
              type="button"
              className={cycle === 'yearly' ? styles.segActive : styles.seg}
              onClick={() => setCycle('yearly')}
              disabled={busy}
            >
              Год
            </button>
          </div>
        </div>

        {/* 4. next_charge_date date picker */}
        <label className={styles.field}>
          <span className={styles.label}>Следующее списание</span>
          <input
            type="date"
            value={chargeDate}
            onChange={(e) => setChargeDate(e.target.value)}
            className={styles.input}
          />
        </label>

        {/* 5. Category select */}
        <label className={styles.field}>
          <span className={styles.label}>Категория</span>
          <select
            value={categoryId ?? ''}
            onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
            className={styles.input}
          >
            <option value="">— выбрать —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        {/* 6. notify_days_before number input */}
        <label className={styles.field}>
          <span className={styles.label}>Уведомить за N дней до списания</span>
          <input
            type="number"
            min={0}
            max={30}
            value={notifyDays}
            onChange={(e) =>
              setNotifyDays(Math.max(0, Math.min(30, Number(e.target.value) || 0)))
            }
            className={styles.input}
          />
        </label>

        {/* 7. is_active toggle (edit mode only — create is always true) */}
        {mode === 'edit' && (
          <label className={`${styles.field} ${styles.toggleRow}`}>
            <span className={styles.label}>Активна</span>
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className={styles.toggle}
            />
          </label>
        )}

        {/* Action buttons */}
        <div className={styles.actions}>
          {mode === 'edit' && onDelete && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              className={styles.danger}
            >
              Удалить
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className={styles.cancel}
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={styles.primary}
          >
            {mode === 'create' ? 'Создать' : 'Сохранить'}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
