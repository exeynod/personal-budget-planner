import { useState, useEffect, type FormEvent } from 'react';
import { BottomSheet } from './BottomSheet';
import { ApiError } from '../api/client';
import type { AdminUserResponse } from '../api/types';
import styles from './CapEditSheet.module.css';

export interface CapEditSheetProps {
  target: AdminUserResponse | null;
  onClose: () => void;
  /**
   * Called with userId + spending_cap_cents (USD-cents: USD * 100).
   * Caller is responsible for hook update and toast.
   * Throws on backend errors so this component can surface inline message.
   */
  onSubmit: (userId: number, spending_cap_cents: number) => Promise<void>;
}

/**
 * Phase 15 AICAP-04 — bottom-sheet для edit AI spending cap.
 *
 * Mirrors InviteSheet structure. Input — USD dollars (readable $X.XX);
 * converts to cents via Math.round(value * 100) on submit.
 * 0 is valid (AI off). Backend bound: 0 ≤ cap_cents ≤ 10_000_000 ($100k).
 *
 * Prefills from target.spending_cap_cents on open (fallback 46500 = $465.00
 * if field absent — defensive; backend Plan 15-04 always returns it).
 */
export function CapEditSheet({ target, onClose, onSubmit }: CapEditSheetProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Prefill input from current cap when target changes.
  useEffect(() => {
    if (target != null) {
      const dollars = (target.spending_cap_cents ?? 46500) / 100;
      setValue(dollars.toFixed(2));
      setError(null);
    } else {
      setValue('');
      setError(null);
    }
  }, [target]);

  const handleClose = () => {
    if (submitting) return;
    onClose();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (target == null) return;

    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) {
      setError('Введите неотрицательное число');
      return;
    }
    if (numeric > 99_999.99) {
      setError('Максимум $99,999.99');
      return;
    }

    const cents = Math.round(numeric * 100);
    setError(null);
    setSubmitting(true);

    try {
      await onSubmit(target.id, cents);
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 403) {
        setError('Только владелец может редактировать');
      } else if (err instanceof ApiError && err.status === 422) {
        setError('Неверное значение лимита');
      } else if (err instanceof ApiError && err.status === 404) {
        setError('Пользователь не найден');
        onClose();
      } else {
        setError(err instanceof Error ? err.message : 'Ошибка обновления');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const open = target != null;
  const submitDisabled = submitting || value.trim() === '';

  return (
    <BottomSheet open={open} onClose={handleClose} title="Изменить AI-лимит">
      <form onSubmit={handleSubmit} className={styles.form}>
        <label className={styles.label}>
          Лимит, USD (0 = AI отключён)
          <input
            type="number"
            inputMode="decimal"
            min="0"
            max="99999.99"
            step="0.01"
            autoFocus
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            className={styles.input}
            placeholder="5.00"
            disabled={submitting}
            aria-invalid={error != null ? 'true' : 'false'}
          />
        </label>
        {error != null && <p className={styles.error}>{error}</p>}
        <button
          type="submit"
          className={styles.submit}
          disabled={submitDisabled}
        >
          {submitting ? 'Сохранение…' : 'Сохранить'}
        </button>
        <p className={styles.hint}>
          Сбрасывается 1-го числа каждого месяца (МСК).
          {' '}spending_cap_cents хранится в USD-cents (100/USD).
        </p>
      </form>
    </BottomSheet>
  );
}
