import { useState, type MouseEvent } from 'react';
import type { CategoryRead, PlannedRead, TemplateItemRead } from '../api/types';
import styles from './PlanRow.module.css';

export type PlanRowItem =
  | { kind: 'template'; row: TemplateItemRead }
  | { kind: 'planned'; row: PlannedRead };

export interface PlanRowProps {
  item: PlanRowItem;
  /** Looked-up by parent (may be undefined if archived/missing). */
  category: CategoryRead | undefined;
  onAmountSave: (newAmountCents: number) => Promise<void>;
  onOpenEditor: () => void;
}

function parseRublesToKopecks(input: string): number | null {
  const cleaned = input.replace(/\s/g, '').replace(',', '.');
  if (cleaned === '') return null;
  const f = parseFloat(cleaned);
  if (isNaN(f) || !isFinite(f) || f <= 0) return null;
  return Math.round(f * 100);
}

function formatRubles(cents: number): string {
  return (cents / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
}

/**
 * Single plan-row (sketch 005-B): used by both TemplateScreen and
 * (in Plan 03-05) PlannedScreen.
 *
 * Behaviours:
 *  - Tap on amount → inline-edit input with Enter to save / Esc to cancel /
 *    ✓ × icon buttons (mirrors CategoryRow). Only fires `onAmountSave` if
 *    the value parsed and changed.
 *  - Tap on the rest of the row → `onOpenEditor()` (parent shows BottomSheet).
 *  - For planned rows with `source === 'subscription_auto'` (D-37, PLN-03):
 *    read-only — neither amount tap nor row tap fires; rendered with a
 *    "🔁 Подписка" badge and dimmed opacity.
 *  - For template rows with `day_of_period` set: badge "День N".
 *  - For planned rows with `planned_date` set: badge with localised "DD MMM".
 */
export function PlanRow({ item, category, onAmountSave, onOpenEditor }: PlanRowProps) {
  const isSubAuto = item.kind === 'planned' && item.row.source === 'subscription_auto';
  const readOnly = isSubAuto;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(formatRubles(item.row.amount_cents));
  const [saving, setSaving] = useState(false);

  const handleAmountTap = (e: MouseEvent) => {
    if (readOnly) return;
    e.stopPropagation();
    setDraft(formatRubles(item.row.amount_cents));
    setEditing(true);
  };

  const handleSave = async () => {
    const cents = parseRublesToKopecks(draft);
    if (cents === null) {
      setEditing(false);
      setDraft(formatRubles(item.row.amount_cents));
      return;
    }
    if (cents === item.row.amount_cents) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onAmountSave(cents);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditing(false);
    setDraft(formatRubles(item.row.amount_cents));
  };

  const dayBadge =
    item.kind === 'template' && item.row.day_of_period !== null
      ? `День ${item.row.day_of_period}`
      : item.kind === 'planned' && item.row.planned_date !== null
        ? new Date(item.row.planned_date).toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: 'short',
          })
        : null;

  const cls = [styles.row, readOnly ? styles.readOnly : ''].filter(Boolean).join(' ');

  return (
    <div
      className={cls}
      onClick={readOnly ? undefined : onOpenEditor}
      role="button"
      aria-disabled={readOnly}
    >
      <div className={styles.amountZone} onClick={handleAmountTap}>
        {editing ? (
          <span className={styles.editGroup} onClick={(e) => e.stopPropagation()}>
            <input
              type="text"
              inputMode="decimal"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleSave();
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  handleCancel();
                }
              }}
              autoFocus
              disabled={saving}
              className={styles.amountInput}
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void handleSave();
              }}
              disabled={saving}
              className={styles.iconBtn}
              aria-label="Сохранить"
            >
              {saving ? '…' : '✓'}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleCancel();
              }}
              disabled={saving}
              className={styles.iconBtn}
              aria-label="Отмена"
            >
              ×
            </button>
          </span>
        ) : (
          <span className={styles.amount}>{formatRubles(item.row.amount_cents)} ₽</span>
        )}
      </div>
      <div className={styles.metaZone}>
        <div className={styles.description}>
          {item.row.description || category?.name || 'Без описания'}
        </div>
        <div className={styles.badges}>
          {isSubAuto && <span className={styles.subBadge}>🔁 Подписка</span>}
          {!isSubAuto && item.kind === 'planned' && (
            <span className={styles.sourceBadge}>
              {item.row.source === 'template' ? 'Шаблон' : 'Вручную'}
            </span>
          )}
          {dayBadge && <span className={styles.dayBadge}>{dayBadge}</span>}
        </div>
      </div>
    </div>
  );
}
