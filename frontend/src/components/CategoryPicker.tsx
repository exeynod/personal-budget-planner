import { useEffect, useRef, useState } from 'react';
import { CaretDown } from '@phosphor-icons/react';
import type { CategoryRead } from '../api/types';
import styles from './CategoryPicker.module.css';

export interface CategoryPickerProps {
  /** Выбранная категория (id) или '' если не выбрано. */
  value: number | '';
  onChange: (id: number | '') => void;
  /** Категории для текущего kind или все (когда нужны optgroups). */
  categories: CategoryRead[];
  /** Если true — рендерим секции «Расходы» / «Доходы». */
  showOptgroups?: boolean;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Inline glass-dropdown — замена нативного <select>. Используется в
 * TransactionEditor вместо браузерного селекта, чтобы убрать арифметический
 * ⊕-arrow Chrome'а и зрительный конфликт с FAB на фоне.
 */
export function CategoryPicker({
  value,
  onChange,
  categories,
  showOptgroups = false,
  placeholder = '— выберите —',
  disabled = false,
}: CategoryPickerProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const selected = value === '' ? null : categories.find((c) => c.id === value) ?? null;

  const handlePick = (id: number) => {
    onChange(id);
    setOpen(false);
  };

  const expense = categories.filter((c) => c.kind === 'expense' && !c.is_archived);
  const income = categories.filter((c) => c.kind === 'income' && !c.is_archived);
  const flat = categories.filter((c) => !c.is_archived);

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`${styles.triggerLabel} ${!selected ? styles.triggerEmpty : ''}`}>
          {selected ? selected.name : placeholder}
        </span>
        <span className={`${styles.chev} ${open ? styles.chevOpen : ''}`}>
          <CaretDown size={14} weight="bold" />
        </span>
      </button>

      {open && (
        <div className={styles.panel} role="listbox">
          {showOptgroups ? (
            <>
              {expense.length > 0 && (
                <>
                  <div className={styles.groupLabel}>Расходы</div>
                  {expense.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      role="option"
                      aria-selected={value === c.id}
                      className={`${styles.option} ${value === c.id ? styles.optionActive : ''}`}
                      onClick={() => handlePick(c.id)}
                    >
                      {c.name}
                    </button>
                  ))}
                </>
              )}
              {income.length > 0 && (
                <>
                  <div className={styles.groupLabel}>Доходы</div>
                  {income.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      role="option"
                      aria-selected={value === c.id}
                      className={`${styles.option} ${value === c.id ? styles.optionActive : ''}`}
                      onClick={() => handlePick(c.id)}
                    >
                      {c.name}
                    </button>
                  ))}
                </>
              )}
              {expense.length === 0 && income.length === 0 && (
                <div className={styles.empty}>Нет доступных категорий</div>
              )}
            </>
          ) : flat.length === 0 ? (
            <div className={styles.empty}>Нет доступных категорий</div>
          ) : (
            flat.map((c) => (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={value === c.id}
                className={`${styles.option} ${value === c.id ? styles.optionActive : ''}`}
                onClick={() => handlePick(c.id)}
              >
                {c.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
