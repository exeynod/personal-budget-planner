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
  // Unplanned: факт есть, плана нет → для расходов 100% перерасход
  // (категория не была в плане), для доходов — нейтрально (доп. доход).
  const isUnplanned = !hasPlanned && hasActual;
  const pct = hasPlanned ? row.actual_cents / row.planned_cents : 0;
  const isOverPlan = hasPlanned && pct > 1.0;

  // Семантика «положительная дельта = хорошо» (CLAUDE.md):
  //   expense: над планом → плохо (red);
  //   income:  над планом → хорошо (accent), под планом не подсвечиваем
  //            (период ещё идёт, рано судить).
  const isExpense = row.kind === 'expense';
  const isBad = isExpense && (isOverPlan || isUnplanned);
  const isGood = !isExpense && (isOverPlan || isUnplanned);

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
    : isOverPlan ? `${Math.round(pct * 100)}%` : null;

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
            <span
              className={
                isBad ? styles.actualOver
                : isGood ? styles.actualGood
                : styles.actual
              }
            >
              {formatKopecks(row.actual_cents)}
            </span>
            {hasPlanned && (
              <span className={styles.planned}>{` / ${formatKopecks(row.planned_cents)}`}</span>
            )}
            {overspendBadge && (
              <span className={isGood ? styles.badgeGood : styles.badge}>
                {overspendBadge}
              </span>
            )}
          </span>
        </div>
        {(hasPlanned || isUnplanned) && (
          <div className={styles.bar} aria-hidden>
            <div
              className={styles.fill}
              style={{
                width: fillW,
                background: isBad
                  ? 'linear-gradient(90deg, #D8404B, #FF7A4C)'
                  : isGood
                    ? 'linear-gradient(90deg, #5CB880, #7CC68F)'
                    : `linear-gradient(90deg, ${cat}, ${cat}cc)`,
              }}
            />
            {isBad && hasPlanned && pct > 1 && (
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
