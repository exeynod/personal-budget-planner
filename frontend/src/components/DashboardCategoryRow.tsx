import type { BalanceCategoryRow } from '../api/types';
import { formatKopecks } from '../utils/format';
import styles from './DashboardCategoryRow.module.css';

export interface DashboardCategoryRowProps {
  row: BalanceCategoryRow;
}

/**
 * DashboardCategoryRow (DSH-01 list, DSH-03 warn/overspend):
 * Single row in the dashboard category list.
 *
 * Progress bar fill width = min(actual/planned * 100, 100)%.
 * Style states (D-02 sign-agnostic; based on consumption ratio):
 *   - normal  (<80%):  primary blue progress bar, no row border highlight
 *   - warn    (≥80% and ≤100%): warn yellow progress + 1px warn border
 *   - overspend (>100%): danger red progress + 1px danger border + "123%" badge
 * If planned_cents === 0, no progress bar is rendered at all.
 */
export function DashboardCategoryRow({ row }: DashboardCategoryRowProps) {
  const hasPlanned = row.planned_cents > 0;
  const pct = hasPlanned ? row.actual_cents / row.planned_cents : 0;
  const isWarn = hasPlanned && pct >= 0.8 && pct <= 1.0;
  const isOverspend = hasPlanned && pct > 1.0;

  const rowCls = [
    styles.row,
    isWarn ? styles.warn : '',
    isOverspend ? styles.overspend : '',
  ].filter(Boolean).join(' ');

  const barFillCls = [
    styles.barFill,
    isWarn ? styles.barWarn : '',
    isOverspend ? styles.barOverspend : '',
  ].filter(Boolean).join(' ');

  const fillWidth = hasPlanned
    ? `${Math.min(pct * 100, 100)}%`
    : '0%';

  const overspendPct = isOverspend ? `${Math.round(pct * 100)}%` : null;

  return (
    <div className={rowCls}>
      <div className={styles.topRow}>
        <span className={styles.name}>{row.name}</span>
        <span className={styles.amounts}>
          <span className={styles.actual}>{formatKopecks(row.actual_cents)}</span>
          {hasPlanned && (
            <>
              <span className={styles.slash}> / </span>
              <span className={styles.planned}>{formatKopecks(row.planned_cents)}</span>
            </>
          )}
          <span className={styles.currency}> ₽</span>
          {overspendPct && <span className={styles.badge}>{overspendPct}</span>}
        </span>
      </div>
      {hasPlanned && (
        <div className={styles.bar} aria-hidden>
          <div className={barFillCls} style={{ width: fillWidth }} />
        </div>
      )}
    </div>
  );
}
