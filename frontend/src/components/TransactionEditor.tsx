import { useEffect, useMemo, useState } from 'react';
import type { CategoryKind, CategoryRead } from '../api/types';
import { useDateInput } from '../hooks/useDateInput';
import { useAiCategorize } from '../hooks/useAiCategorize';
import { parseRublesToKopecks } from '../utils/format';
import styles from './TransactionEditor.module.css';

export type TransactionEntity = 'actual' | 'template' | 'planned';

export interface TransactionEditorInitial {
  kind?: CategoryKind;
  category_id?: number;
  amount_cents?: number;
  description?: string | null;
  /** entity=actual */
  tx_date?: string;
  /** entity=template */
  day_of_period?: number | null;
  /** entity=planned */
  planned_date?: string | null;
  /** entity=template */
  sort_order?: number;
}

export interface TransactionEditorSavePayload {
  /** entity=actual: kind from toggle. entity=template/planned: undefined — parent resolves from selected category. */
  kind?: CategoryKind;
  category_id: number;
  amount_cents: number;
  description: string | null;
  tx_date?: string;
  day_of_period?: number | null;
  planned_date?: string | null;
  sort_order?: number;
}

export interface TransactionEditorProps {
  entity: TransactionEntity;
  /** Provide for edit mode — adds Delete button. */
  isEdit?: boolean;
  initial?: TransactionEditorInitial;
  categories: CategoryRead[];
  /**
   * When set, the category select is filtered to this kind and (for entity=actual)
   * the kind toggle is hidden. When undefined for template/planned, the select
   * shows optgroups for Расходы and Доходы.
   */
  kind?: CategoryKind;
  /** entity=actual: optional max date. */
  maxTxDate?: string;
  /** entity=planned: period bounds. */
  periodBounds?: { start: string; end: string };
  aiEnabled?: boolean;
  onSave: (data: TransactionEditorSavePayload) => Promise<void>;
  onDelete?: () => Promise<void>;
  onCancel: () => void;
}

function todayInMoscow(): string {
  return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function formatKopecksToRubles(cents: number | undefined | null): string {
  if (cents === undefined || cents === null) return '';
  return (cents / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
}

/**
 * Universal bottom-sheet editor for actual transactions, template items and
 * planned rows. Replaces the old ActualEditor + PlanItemEditor — fixing one
 * fixes both.
 */
export function TransactionEditor({
  entity,
  isEdit: isEditProp,
  initial,
  categories,
  kind: lockedKind,
  maxTxDate: _maxTxDate,
  periodBounds: _periodBounds,
  aiEnabled = false,
  onSave,
  onDelete,
  onCancel,
}: TransactionEditorProps) {
  const isEdit = isEditProp ?? onDelete !== undefined;
  const isActual = entity === 'actual';
  const isTemplate = entity === 'template';
  const isPlanned = entity === 'planned';

  // For actual: kind is internal state (toggle). For template/planned: kind
  // is either locked from prop or derived from the selected category at save
  // time — we still keep an internal state to filter the select before a
  // category is chosen.
  const [internalKind, setInternalKind] = useState<CategoryKind>(
    initial?.kind ?? lockedKind ?? 'expense',
  );
  const activeKind = lockedKind ?? internalKind;

  const [categoryId, setCategoryId] = useState<number | ''>(initial?.category_id ?? '');
  const [amountStr, setAmountStr] = useState<string>(formatKopecksToRubles(initial?.amount_cents));
  const [description, setDescription] = useState<string>(initial?.description ?? '');

  const { iso: txDate, display: txDateDisplay, handleChange: handleTxDateChange } = useDateInput(
    isActual ? (initial?.tx_date ?? todayInMoscow()) : '',
  );
  const [dayOfPeriod, setDayOfPeriod] = useState<string>(
    initial?.day_of_period !== undefined && initial?.day_of_period !== null
      ? String(initial.day_of_period)
      : '',
  );
  const { iso: plannedDate, display: plannedDateDisplay, handleChange: handlePlannedDateChange } =
    useDateInput(initial?.planned_date ?? '');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showAiSuggestion, setShowAiSuggestion] = useState(true);

  const { suggestion } = useAiCategorize(description, aiEnabled);

  // For actual: when toggling kind, drop a category from the wrong kind.
  // For template/planned with locked kind: same — if initial category is
  // archived/wrong-kind it gets cleared.
  useEffect(() => {
    if (categoryId === '') return;
    const cat = categories.find((c) => c.id === categoryId);
    if (cat && lockedKind && cat.kind !== lockedKind) {
      setCategoryId('');
    }
    if (cat && isActual && cat.kind !== internalKind) {
      setCategoryId('');
    }
  }, [internalKind, lockedKind, categoryId, categories, isActual]);

  useEffect(() => {
    setShowAiSuggestion(true);
  }, [description]);

  useEffect(() => {
    if (
      aiEnabled &&
      suggestion &&
      suggestion.category_id !== null &&
      showAiSuggestion &&
      categoryId === ''
    ) {
      const cat = categories.find((c) => c.id === suggestion.category_id);
      if (!cat) return;
      // Respect kind constraint: actual uses internalKind, others use lockedKind if any.
      if (isActual && cat.kind !== internalKind) return;
      if (lockedKind && cat.kind !== lockedKind) return;
      setCategoryId(suggestion.category_id);
    }
  }, [
    suggestion,
    aiEnabled,
    showAiSuggestion,
    isActual,
    internalKind,
    lockedKind,
    categories,
    categoryId,
  ]);

  // Category select source.
  // - actual: filter by internalKind, no optgroups.
  // - template/planned with lockedKind: filter by lockedKind, no optgroups.
  // - template/planned without lockedKind: show optgroups for both kinds.
  const showOptgroups = !isActual && !lockedKind;
  const filteredCats = useMemo(
    () => categories.filter((c) => c.kind === activeKind && !c.is_archived),
    [categories, activeKind],
  );
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
    categoryId !== '' &&
    amountCents !== null &&
    amountCents > 0 &&
    (!isActual || txDate !== '') &&
    !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload: TransactionEditorSavePayload = {
        category_id: Number(categoryId),
        amount_cents: amountCents!,
        description: description.trim() === '' ? null : description.trim(),
      };
      if (isActual) {
        payload.kind = activeKind;
        payload.tx_date = txDate;
      } else if (isTemplate) {
        payload.day_of_period = dayOfPeriod === '' ? null : Number(dayOfPeriod);
        if (initial?.sort_order !== undefined) payload.sort_order = initial.sort_order;
      } else if (isPlanned) {
        payload.planned_date = plannedDate === '' ? null : plannedDate;
      }
      await onSave(payload);
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
      {isActual && !lockedKind && (
        <div className={styles.kindToggle}>
          <button
            type="button"
            className={`${styles.kindBtn} ${activeKind === 'expense' ? styles.kindBtnActive : ''}`}
            onClick={() => setInternalKind('expense')}
            disabled={submitting}
          >
            Расход
          </button>
          <button
            type="button"
            className={`${styles.kindBtn} ${activeKind === 'income' ? styles.kindBtnActive : ''}`}
            onClick={() => setInternalKind('income')}
            disabled={submitting}
          >
            Доход
          </button>
        </div>
      )}

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
            {showOptgroups ? (
              <>
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
              </>
            ) : (
              filteredCats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))
            )}
          </select>
        </label>
      )}

      {isActual && (
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
      )}

      {isTemplate && (
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
      )}

      {isPlanned && (
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

      {confirmDelete && (
        <div className={styles.confirmRow}>
          <span>Удалить?</span>
          <button type="button" onClick={handleDeleteConfirm} className={styles.deleteBtn}>Да</button>
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            className={styles.cancelBtn}
          >
            Нет
          </button>
        </div>
      )}

      <div className={styles.actions}>
        {isEdit && onDelete && !confirmDelete && (
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
