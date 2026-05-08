import type { CategoryRead, PlannedRead, TemplateItemRead } from '../api/types';
import styles from './PlanRow.module.css';

export type PlanRowItem =
  | { kind: 'template'; row: TemplateItemRead }
  | { kind: 'planned'; row: PlannedRead };

export interface PlanRowProps {
  item: PlanRowItem;
  /** Looked-up by parent (may be undefined if archived/missing). */
  category: CategoryRead | undefined;
  /** Kept for backward compatibility — no longer used (inline-edit removed). */
  onAmountSave?: (newAmountCents: number) => Promise<void>;
  onOpenEditor: () => void;
}

function formatRubles(cents: number): string {
  return (cents / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
}

/**
 * Single plan-row (sketch 005-B): used by both TemplateScreen and PlannedView.
 *
 * Behaviours:
 *  - Tap anywhere on the row → `onOpenEditor()` (parent shows BottomSheet).
 *    Inline amount-edit was removed in favour of a single, predictable click
 *    target — every interaction goes through the full editor sheet.
 *  - For planned rows with `source === 'subscription_auto'` (D-37, PLN-03):
 *    read-only — row tap does not fire; rendered with "🔁 Подписка" badge
 *    and dimmed opacity.
 *  - For template rows with `day_of_period` set: badge "День N".
 *  - For planned rows with `planned_date` set: badge with localised "DD MMM".
 */
export function PlanRow({ item, category, onOpenEditor }: PlanRowProps) {
  const isSubAuto = item.kind === 'planned' && item.row.source === 'subscription_auto';
  const readOnly = isSubAuto;

  // category is still accepted for archive-detection (callers pre-resolve),
  // but never displayed inside the row — the parent group already shows it
  // as the section title, so duplicating it here is noise.
  void category;

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

  const description = item.row.description?.trim() ?? '';

  return (
    <div
      className={cls}
      onClick={readOnly ? undefined : onOpenEditor}
      role="button"
      aria-disabled={readOnly}
    >
      <div className={styles.amountZone}>
        <span className={styles.amount}>{formatRubles(item.row.amount_cents)} ₽</span>
      </div>
      <div className={styles.metaZone}>
        {/* Show description only when present and non-empty — never fall back
            to the category name (parent group title already shows it; the
            duplicate produced rows like "Кредиты / Кредиты"). */}
        {description !== '' && (
          <div className={styles.description}>{description}</div>
        )}
        <div className={styles.badges}>
          {/* Source badge dropped: "Вручную" / "Шаблон" was visible noise
              on every plan row and didn't differentiate enough from the
              actual-tx card. Subscription auto-rows still get a marker
              because they're read-only and the user needs to know why
              they can't edit the amount. */}
          {isSubAuto && <span className={styles.subBadge}>🔁 Подписка</span>}
          {dayBadge && <span className={styles.dayBadge}>{dayBadge}</span>}
        </div>
      </div>
    </div>
  );
}
