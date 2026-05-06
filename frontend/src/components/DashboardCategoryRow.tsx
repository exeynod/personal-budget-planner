import type { BalanceCategoryRow } from '../api/types';
import { formatKopecks } from '../utils/format';
import styles from './DashboardCategoryRow.module.css';

export interface DashboardCategoryRowProps {
  row: BalanceCategoryRow;
  onClick?: () => void;
}

export function DashboardCategoryRow({ row, onClick }: DashboardCategoryRowProps) {
  const hasPlanned = row.planned_cents > 0;
  const hasActual = row.actual_cents > 0;
  // Unplanned: факт есть, плана нет → 100% перерасход (категория не была в плане).
  const isUnplanned = !hasPlanned && hasActual;
  const pct = hasPlanned ? row.actual_cents / row.planned_cents : 0;
  const isWarn = hasPlanned && pct >= 0.8 && pct <= 1.0;
  const isOverspend = (hasPlanned && pct > 1.0) || isUnplanned;

  const rowCls = [
    styles.row,
    onClick ? styles.rowButton : '',
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
    : isUnplanned ? '100%' : '0%';

  const overspendBadge = isUnplanned
    ? 'Без плана'
    : (hasPlanned && pct > 1.0) ? `${Math.round(pct * 100)}%` : null;

  const content = (
    <>
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
          {overspendBadge && <span className={styles.badge}>{overspendBadge}</span>}
        </span>
      </div>
      {(hasPlanned || isUnplanned) && (
        <div className={styles.bar} aria-hidden>
          <div className={barFillCls} style={{ width: fillWidth }} />
        </div>
      )}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={rowCls} onClick={onClick}>
        {content}
      </button>
    );
  }

  return <div className={rowCls}>{content}</div>;
}
