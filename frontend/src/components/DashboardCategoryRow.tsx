import type { BalanceCategoryRow } from '../api/types';
import { formatKopecks } from '../utils/format';
import { visualForCategory } from '../utils/categoryVisuals';
import styles from './DashboardCategoryRow.module.css';

export interface DashboardCategoryRowProps {
  row: BalanceCategoryRow;
  onClick?: () => void;
  /** Скрыть верхний 0.5px разделитель (для первой строки в group-glass-list). */
  isFirst?: boolean;
}

export function DashboardCategoryRow({ row, onClick, isFirst }: DashboardCategoryRowProps) {
  const hasPlanned = row.planned_cents > 0;
  const hasActual = row.actual_cents > 0;
  // Unplanned: факт есть, плана нет → 100% перерасход (категория не была в плане).
  const isUnplanned = !hasPlanned && hasActual;
  const pct = hasPlanned ? row.actual_cents / row.planned_cents : 0;
  const isOver = (hasPlanned && pct > 1.0) || isUnplanned;

  const visual = visualForCategory(row.name, row.category_id);
  const Icon = visual.Icon;
  const cat = visual.color;

  // ширина основной заливки прогресс-бара (clamp 0..100%)
  const fillW = hasPlanned
    ? `${Math.min(pct, 1) * 100}%`
    : isUnplanned ? '100%' : '0%';

  // ширина «hatched-overlay» для перерасхода справа (max 40% шкалы)
  const overW = (hasPlanned && pct > 1)
    ? `${Math.min((pct - 1) * 100, 40)}%`
    : '0%';

  const overspendBadge = isUnplanned
    ? 'Без плана'
    : (hasPlanned && pct > 1.0) ? `${Math.round(pct * 100)}%` : null;

  const rowCls = [
    styles.row,
    onClick ? styles.rowButton : '',
    isFirst ? styles.first : '',
  ].filter(Boolean).join(' ');

  const inner = (
    <>
      <div
        className={styles.iconTile}
        style={{
          background: `linear-gradient(140deg, ${cat}30, ${cat}15)`,
          boxShadow: `inset 0 0 0 0.5px ${cat}30`,
          color: cat,
        }}
      >
        <Icon size={20} weight="regular" />
      </div>
      <div className={styles.body}>
        <div className={styles.topRow}>
          <span className={styles.name}>{row.name}</span>
          <span className={styles.amounts}>
            <span className={isOver ? styles.actualOver : styles.actual}>
              {formatKopecks(row.actual_cents)}
            </span>
            {hasPlanned && (
              <span className={styles.planned}>{` / ${formatKopecks(row.planned_cents)}`}</span>
            )}
            {overspendBadge && <span className={styles.badge}>{overspendBadge}</span>}
          </span>
        </div>
        {(hasPlanned || isUnplanned) && (
          <div className={styles.bar} aria-hidden>
            <div
              className={styles.fill}
              style={{
                width: fillW,
                background: isOver
                  ? 'linear-gradient(90deg, #D8404B, #FF7A4C)'
                  : `linear-gradient(90deg, ${cat}, ${cat}cc)`,
              }}
            />
            {hasPlanned && pct > 1 && (
              <div className={styles.overlay} style={{ width: overW }} />
            )}
          </div>
        )}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={rowCls} onClick={onClick}>
        {inner}
      </button>
    );
  }

  return <div className={rowCls}>{inner}</div>;
}
