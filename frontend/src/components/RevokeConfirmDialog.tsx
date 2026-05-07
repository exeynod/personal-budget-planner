import { useState } from 'react';
import { BottomSheet } from './BottomSheet';
import type { AdminUserResponse } from '../api/types';
import styles from './RevokeConfirmDialog.module.css';

export interface RevokeConfirmDialogProps {
  target: AdminUserResponse | null;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

/**
 * Phase 13 ADM-05 — explicit cascade-list confirm перед DELETE.
 *
 * BottomSheet остаётся открытым пока submitting === true (T-13-07-05:
 * исключаем race с backdrop-tap). После confirm парент чистит target
 * (закрывая sheet) и показывает toast.
 */
export function RevokeConfirmDialog({ target, onConfirm, onCancel }: RevokeConfirmDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const open = target !== null;

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (submitting) return;
    onCancel();
  };

  return (
    <BottomSheet
      open={open}
      onClose={handleCancel}
      title="Отозвать доступ"
    >
      <div className={styles.body}>
        <p className={styles.warning}>
          Все данные пользователя <strong>{target?.tg_user_id ?? ''}</strong> будут
          {' '}безвозвратно удалены:
        </p>
        <ul className={styles.list}>
          <li>транзакции (план + факт)</li>
          <li>категории и шаблон бюджета</li>
          <li>подписки</li>
          <li>история AI-чата + AI usage</li>
        </ul>
        <p className={styles.confirmQ}>Продолжить?</p>
        <div className={styles.actions}>
          <button
            type="button"
            onClick={handleCancel}
            disabled={submitting}
            className={styles.cancel}
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className={styles.confirm}
          >
            {submitting ? 'Удаление…' : 'Удалить'}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
