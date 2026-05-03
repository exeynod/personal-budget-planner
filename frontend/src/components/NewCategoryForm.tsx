import { useState } from 'react';
import type { CategoryKind } from '../api/types';
import styles from './NewCategoryForm.module.css';

export interface NewCategoryFormProps {
  onCreate: (name: string, kind: CategoryKind) => Promise<void>;
  onCancel: () => void;
}

/**
 * Inline form rendered on top of CategoriesScreen list when "+ Новая" is clicked.
 *
 * - name input: trimmed; empty disables submit (T-fe-empty-name mitigation).
 * - kind: radio group (expense / income); defaults to expense (most common).
 * - Enter submits; Esc cancels.
 */
export function NewCategoryForm({ onCreate, onCancel }: NewCategoryFormProps) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<CategoryKind>('expense');
  const [submitting, setSubmitting] = useState(false);

  const trimmed = name.trim();
  const canSubmit = trimmed !== '' && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onCreate(trimmed, kind);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.form}>
      <input
        type="text"
        placeholder="Название категории"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void handleSubmit();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
        autoFocus
        disabled={submitting}
        className={styles.nameInput}
      />
      <div className={styles.kindRow}>
        <label>
          <input
            type="radio"
            name="kind"
            value="expense"
            checked={kind === 'expense'}
            onChange={() => setKind('expense')}
            disabled={submitting}
          />
          <span>Расход</span>
        </label>
        <label>
          <input
            type="radio"
            name="kind"
            value="income"
            checked={kind === 'income'}
            onChange={() => setKind('income')}
            disabled={submitting}
          />
          <span>Доход</span>
        </label>
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={!canSubmit}
          className={styles.submitBtn}
        >
          {submitting ? 'Создание…' : 'Создать'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className={styles.cancelBtn}
          aria-label="Отмена"
        >
          ×
        </button>
      </div>
    </div>
  );
}
