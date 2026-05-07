import { useEffect, useMemo, useState } from 'react';
import type { CategoryKind, CategoryRead } from '../api/types';
import { useDateInput } from '../hooks/useDateInput';
import { useAiCategorize } from '../hooks/useAiCategorize';
import { parseRublesToKopecks } from '../utils/format';
import styles from './ActualEditor.module.css';

export interface ActualEditorInitial {
  kind?: CategoryKind;
  amount_cents?: number;
  description?: string | null;
  category_id?: number;
  tx_date?: string;
}

export interface ActualEditorSavePayload {
  kind: CategoryKind;
  category_id: number;
  amount_cents: number;
  description: string | null;
  tx_date: string;
}

export interface ActualEditorProps {
  initial?: ActualEditorInitial;
  categories: CategoryRead[];
  /** Save handler. Throw to surface error inline. */
  onSave: (data: ActualEditorSavePayload) => Promise<void>;
  /** Provide for edit mode; omit for create. */
  onDelete?: () => Promise<void>;
  onCancel: () => void;
  /** Optional max date (default = today + 7d in local TZ). */
  maxTxDate?: string;
  /** Enable AI category suggestion. Default false (safe fallback). */
  aiEnabled?: boolean;
}

/** Returns today's date in Europe/Moscow (UTC+3) as ISO string (YYYY-MM-DD). */
function todayInMoscow(): string {
  return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function todayISO(): string {
  return todayInMoscow();
}


function formatKopecksToRubles(cents: number | undefined | null): string {
  if (cents === undefined || cents === null) return '';
  return (cents / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
}

/**
 * Form component for creating or editing an actual transaction.
 *
 * Shows a kind toggle (Расход/Доход), amount, category (filtered by kind),
 * description, and date fields. Edit mode adds a Delete button.
 */
export function ActualEditor({
  initial,
  categories,
  onSave,
  onDelete,
  onCancel,
  maxTxDate: _maxTxDate,
  aiEnabled = false,
}: ActualEditorProps) {
  const isEdit = onDelete !== undefined;

  const [kind, setKind] = useState<CategoryKind>(initial?.kind ?? 'expense');
  const [categoryId, setCategoryId] = useState<number | ''>(initial?.category_id ?? '');
  const [amountStr, setAmountStr] = useState<string>(
    formatKopecksToRubles(initial?.amount_cents),
  );
  const [description, setDescription] = useState<string>(initial?.description ?? '');
  const { iso: txDate, display: txDateDisplay, handleChange: handleTxDateChange } = useDateInput(initial?.tx_date ?? todayISO());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showAiSuggestion, setShowAiSuggestion] = useState(true);

  const { suggestion } = useAiCategorize(description, aiEnabled);

  // If kind changes and current category belongs to the other kind, reset selection.
  useEffect(() => {
    if (categoryId === '') return;
    const cat = categories.find((c) => c.id === categoryId);
    if (cat && cat.kind !== kind) {
      setCategoryId('');
    }
  }, [kind, categoryId, categories]);

  // Reset AI suggestion panel when description changes (new suggestion incoming).
  useEffect(() => {
    setShowAiSuggestion(true);
  }, [description]);

  // Auto-set category when AI suggestion arrives (only if no category selected yet).
  useEffect(() => {
    if (
      aiEnabled &&
      suggestion &&
      suggestion.category_id !== null &&
      showAiSuggestion &&
      categoryId === ''
    ) {
      const cat = categories.find((c) => c.id === suggestion.category_id && c.kind === kind);
      if (cat) {
        setCategoryId(suggestion.category_id);
      }
    }
  }, [suggestion, aiEnabled, showAiSuggestion, kind, categories, categoryId]);

  const filteredCats = useMemo(
    () => categories.filter((c) => c.kind === kind && !c.is_archived),
    [categories, kind],
  );

  const amountCents = parseRublesToKopecks(amountStr);
  const canSubmit =
    categoryId !== '' &&
    amountCents !== null &&
    amountCents > 0 &&
    txDate !== '' &&
    !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSave({
        kind,
        category_id: Number(categoryId),
        amount_cents: amountCents!,
        description: description.trim() === '' ? null : description.trim(),
        tx_date: txDate,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRequest = () => {
    if (!onDelete || submitting) return;
    setConfirmDelete(true);
  };

  const handleDeleteConfirm = async () => {
    if (!onDelete) return;
    setConfirmDelete(false);
    setSubmitting(true);
    setError(null);
    try {
      await onDelete();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.form}>
      <div className={styles.kindToggle}>
        <button
          type="button"
          className={`${styles.kindBtn} ${kind === 'expense' ? styles.kindBtnActive : ''}`}
          onClick={() => setKind('expense')}
          disabled={submitting}
        >
          Расход
        </button>
        <button
          type="button"
          className={`${styles.kindBtn} ${kind === 'income' ? styles.kindBtnActive : ''}`}
          onClick={() => setKind('income')}
          disabled={submitting}
        >
          Доход
        </button>
      </div>

      <label className={styles.field}>
        <span className={styles.label}>Сумма (₽)</span>
        <input
          type="text"
          inputMode="decimal"
          placeholder="1500"
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
          disabled={submitting}
          className={styles.input}
          autoFocus={!isEdit}
        />
      </label>

      {aiEnabled && suggestion && suggestion.category_id !== null && showAiSuggestion ? (
        <div className={styles.field}>
          <span className={styles.label}>Категория</span>
          <div className={styles.aiSuggestion}>
            <span className={styles.aiSuggestionLabel}>AI: {suggestion.name}</span>
            <button
              type="button"
              onClick={() => setShowAiSuggestion(false)}
              className={styles.aiSwitchBtn}
            >
              Сменить
            </button>
          </div>
        </div>
      ) : (
        <label className={styles.field}>
          <span className={styles.label}>Категория</span>
          <select
            value={categoryId}
            onChange={(e) =>
              setCategoryId(e.target.value === '' ? '' : Number(e.target.value))
            }
            className={styles.select}
            disabled={submitting}
          >
            <option value="">— выберите —</option>
            {filteredCats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className={styles.field}>
        <span className={styles.label}>Описание</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
          rows={2}
          disabled={submitting}
          className={styles.textarea}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Дата</span>
        <input
          type="text"
          inputMode="numeric"
          value={txDateDisplay}
          onChange={(e) => handleTxDateChange(e.target.value)}
          placeholder="ДД.ММ.ГГГГ"
          disabled={submitting}
          className={styles.input}
        />
      </label>

      {error && <div className={styles.error}>Ошибка: {error}</div>}

      {confirmDelete && (
        <div className={styles.confirmRow}>
          <span>Удалить транзакцию?</span>
          <button type="button" onClick={handleDeleteConfirm} className={styles.deleteBtn}>Да</button>
          <button type="button" onClick={() => setConfirmDelete(false)} className={styles.cancelBtn}>Нет</button>
        </div>
      )}

      <div className={styles.actions}>
        {isEdit && !confirmDelete && (
          <button
            type="button"
            onClick={handleDeleteRequest}
            disabled={submitting}
            className={styles.deleteBtn}
          >
            Удалить
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className={styles.cancelBtn}
        >
          Отмена
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={styles.saveBtn}
        >
          {submitting ? 'Сохранение…' : 'Сохранить'}
        </button>
      </div>
    </div>
  );
}
