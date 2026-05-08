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
 * Layout mirrors HistoryView row to keep history/plan visually unified —
 * amount on the left (fixed min-width, mono), description on the right
 * (muted, ellipsis), badges (День N / planned date / 🔁 Подписка) trailing.
 * Category name is intentionally absent: the parent group title already
 * shows it, so duplicating it inside the row was visual noise.
 *
 * Behaviours:
 *  - Tap anywhere on the row → `onOpenEditor()` (parent shows BottomSheet).
 *    Inline amount-edit was removed in favour of a single, predictable click
 *    target — every interaction goes through the full editor sheet.
 *  - For planned rows with `source === 'subscription_auto'` (D-37, PLN-03):
 *    read-only — row tap does not fire; rendered with "🔁 Подписка" badge
 *    and dimmed opacity.
 */
export function PlanRow({ item, category, onOpenEditor }: PlanRowProps) {
  const isSubAuto = item.kind === 'planned' && item.row.source === 'subscription_auto';
  const readOnly = isSubAuto;

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
    <button
      type="button"
      className={cls}
      onClick={readOnly ? undefined : onOpenEditor}
      aria-disabled={readOnly}
    >
      <span className={styles.amount}>{formatRubles(item.row.amount_cents)} ₽</span>
      {description !== '' && <span className={styles.description}>{description}</span>}
      {(isSubAuto || dayBadge) && (
        <span className={styles.badges}>
          {isSubAuto && <span className={styles.subBadge}>🔁 Подписка</span>}
          {dayBadge && <span className={styles.dayBadge}>{dayBadge}</span>}
        </span>
      )}
    </button>
  );
}
