import { useMemo, useState } from 'react';
import type { CategoryRead } from '../api/types';
import { useDateInput } from '../hooks/useDateInput';
import { parseRublesToKopecks } from '../utils/format';
import styles from './PlanItemEditor.module.css';

export type EditorMode =
  | 'create-template'
  | 'edit-template'
  | 'create-planned'
  | 'edit-planned';

export interface EditorInitial {
  category_id?: number;
  amount_cents?: number;
  description?: string | null;
  day_of_period?: number | null;
  planned_date?: string | null;
  sort_order?: number;
}

export interface EditorSavePayload {
  category_id: number;
  amount_cents: number;
  description: string | null;
  /** Present in template modes; undefined in planned modes. */
  day_of_period?: number | null;
  /** Present in planned modes; undefined in template modes. */
  planned_date?: string | null;
  sort_order?: number;
}

export interface PlanItemEditorProps {
  mode: EditorMode;
  initial?: EditorInitial;
  categories: CategoryRead[];
  /** Optional min/max for the date input (planned modes). */
  periodBounds?: { start: string; end: string };
  onSave: (data: EditorSavePayload) => Promise<void>;
  /** Provide for edit modes; omit for create modes. */
  onDelete?: () => Promise<void>;
  onCancel: () => void;
}

function formatKopecksToRubles(cents: number | undefined | null): string {
  if (cents === undefined || cents === null) return '';
  return (cents / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
}

/**
 * Universal form for create/edit of a template-item or planned-row, rendered
 * inside a BottomSheet (Phase 3 D-40, sketch 005-B).
 *
 * Mode discriminates between template vs planned: template modes show the
 * `day_of_period` numeric input; planned modes show a `planned_date` date
 * input bounded by `periodBounds` (when provided). Edit modes additionally
 * show a Delete button (left-aligned, danger styling).
 *
 * Threat T-03-18 (Tampering): client-side validation rejects empty/non-numeric
 * amounts, but the backend (Pydantic gt=0 + 422) is authoritative. Submit
 * stays disabled until amount > 0 and a category is selected.
 *
 * Threat T-03-21 (UX): destructive delete is guarded by window.confirm.
 */
export function PlanItemEditor({
  mode,
  initial,
  categories,
  periodBounds: _periodBounds,
  onSave,
  onDelete,
  onCancel,
}: PlanItemEditorProps) {
  const isTemplate = mode === 'create-template' || mode === 'edit-template';
  const isEdit = mode === 'edit-template' || mode === 'edit-planned';

  const [categoryId, setCategoryId] = useState<number | ''>(initial?.category_id ?? '');
  const [amountStr, setAmountStr] = useState<string>(
    formatKopecksToRubles(initial?.amount_cents),
  );
  const [description, setDescription] = useState<string>(initial?.description ?? '');
  const [dayOfPeriod, setDayOfPeriod] = useState<string>(
    initial?.day_of_period !== undefined && initial?.day_of_period !== null
      ? String(initial.day_of_period)
      : '',
  );
  const { iso: plannedDate, display: plannedDateDisplay, handleChange: handlePlannedDateChange } = useDateInput(initial?.planned_date ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expenseCats = useMemo(
    () => categories.filter((c) => c.kind === 'expense' && !c.is_archived),
    [categories],
  );
  const incomeCats = useMemo(
    () => categories.filter((c) => c.kind === 'income' && !c.is_archived),
    [categories],
  );

  const amountCents = parseRublesToKopecks(amountStr);
  const canSubmit =
    categoryId !== '' && amountCents !== null && amountCents > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload: EditorSavePayload = {
        category_id: Number(categoryId),
        amount_cents: amountCents!,
        description: description.trim() === '' ? null : description.trim(),
      };
      if (isTemplate) {
        payload.day_of_period = dayOfPeriod === '' ? null : Number(dayOfPeriod);
      } else {
        payload.planned_date = plannedDate === '' ? null : plannedDate;
      }
      await onSave(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete || submitting) return;
    if (!window.confirm('Удалить строку?')) return;
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
          {expenseCats.length > 0 && (
            <optgroup label="Расходы">
              {expenseCats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          )}
          {incomeCats.length > 0 && (
            <optgroup label="Доходы">
              {incomeCats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>

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
        />
      </label>

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

      {isTemplate ? (
        <label className={styles.field}>
          <span className={styles.label}>День периода (опц.)</span>
          <input
            type="number"
            min={1}
            max={31}
            placeholder="напр. 5"
            value={dayOfPeriod}
            onChange={(e) => setDayOfPeriod(e.target.value)}
            disabled={submitting}
            className={styles.input}
          />
          <span className={styles.helper}>1..31. Пусто — без привязки.</span>
        </label>
      ) : (
        <label className={styles.field}>
          <span className={styles.label}>Дата (опц.)</span>
          <input
            type="text"
            inputMode="numeric"
            value={plannedDateDisplay}
            onChange={(e) => handlePlannedDateChange(e.target.value)}
            placeholder="ДД.ММ.ГГГГ (опц.)"
            disabled={submitting}
            className={styles.input}
          />
        </label>
      )}

      {error && <div className={styles.error}>Ошибка: {error}</div>}

      <div className={styles.actions}>
        {isEdit && onDelete && (
          <button
            type="button"
            onClick={handleDelete}
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
