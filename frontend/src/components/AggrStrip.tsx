import type { BalanceResponse, CategoryKind } from '../api/types';
import { formatKopecks, formatKopecksWithSign } from '../utils/format';
import styles from './AggrStrip.module.css';

export interface AggrStripProps {
  balance: BalanceResponse;
  /** Active tab — determines which kind's totals to show. */
  kind: CategoryKind;
}

/**
 * AggrStrip (DSH-01 aggr block, DSH-02 delta sign): 3-column strip below tabs.
 *
 * For active kind:
 *   - План  = planned_total_{kind}_cents
 *   - Факт  = actual_total_{kind}_cents
 *   - Δ     = (D-02 sign rule)
 *             expense: plan - actual  (positive = under-budget = good)
 *             income:  actual - plan  (positive = above-target = good)
 */
export function AggrStrip({ balance, kind }: AggrStripProps) {
  const planned = kind === 'expense'
    ? balance.planned_total_expense_cents
    : balance.planned_total_income_cents;
  const actual = kind === 'expense'
    ? balance.actual_total_expense_cents
    : balance.actual_total_income_cents;
  const delta = kind === 'expense'
    ? planned - actual
    : actual - planned;

  const deltaCls =
    delta > 0
      ? styles.deltaPositive
      : delta < 0
        ? styles.deltaNegative
        : styles.deltaZero;

  return (
    <div className={styles.strip}>
      <div className={styles.col}>
        <div className={styles.label}>План</div>
        <div className={styles.value}>{formatKopecks(planned)} ₽</div>
      </div>
      <div className={styles.col}>
        <div className={styles.label}>Факт</div>
        <div className={styles.value}>{formatKopecks(actual)} ₽</div>
      </div>
      <div className={styles.col}>
        <div className={styles.label}>Δ</div>
        <div className={`${styles.value} ${deltaCls}`}>
          {formatKopecksWithSign(delta)} ₽
        </div>
      </div>
    </div>
  );
}
