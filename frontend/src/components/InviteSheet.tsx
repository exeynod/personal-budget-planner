import { useState, type FormEvent } from 'react';
import { BottomSheet } from './BottomSheet';
import { ApiError } from '../api/client';
import styles from './InviteSheet.module.css';

export interface InviteSheetProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (tg_user_id: number) => Promise<void>;
}

/**
 * Phase 13 ADM-04 — invite by tg_user_id (numeric only, min 5 digits).
 *
 * 409 (invite_exists) и 422 (validation) выводятся inline в форму без
 * закрытия sheet (CONTEXT decision); при success — sheet закрывается
 * и парент показывает toast «Приглашение создано» + refetch.
 */
export function InviteSheet({ open, onClose, onSubmit }: InviteSheetProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setValue('');
    setError(null);
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const digits = value.trim();
    if (!/^\d+$/.test(digits)) {
      setError('Только цифры — никаких @username');
      return;
    }
    if (digits.length < 5) {
      setError('Минимум 5 цифр');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(Number(digits));
      reset();
      onClose();
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 409) {
        setError('Этот пользователь уже в списке');
      } else if (e instanceof ApiError && e.status === 422) {
        setError('Неверный tg_user_id (нужно ≥ 5 цифр)');
      } else if (e instanceof ApiError && e.status === 403) {
        setError('Только владелец может приглашать');
      } else {
        setError(e instanceof Error ? e.message : 'Ошибка приглашения');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const submitDisabled = submitting || value.trim().length < 5;

  return (
    <BottomSheet open={open} onClose={handleClose} title="Пригласить пользователя">
      <form onSubmit={handleSubmit} className={styles.form}>
        <label className={styles.label}>
          tg_user_id (число)
          <input
            type="text"
            inputMode="numeric"
            pattern="\d*"
            autoFocus
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            className={styles.input}
            placeholder="1234567890"
            disabled={submitting}
            aria-invalid={error ? 'true' : 'false'}
          />
        </label>
        {error && <p className={styles.error}>{error}</p>}
        <button
          type="submit"
          className={styles.submit}
          disabled={submitDisabled}
        >
          {submitting ? 'Отправка…' : 'Пригласить'}
        </button>
        <p className={styles.hint}>
          После приглашения пользователь сможет открыть Mini App и пройти онбординг.
        </p>
      </form>
    </BottomSheet>
  );
}
