import type { BalanceResponse, CategoryKind, PeriodRead } from '../api/types';
import { formatKopecks, formatKopecksWithSign } from '../utils/format';
import styles from './HeroCard.module.css';

export interface HeroCardProps {
  balance: BalanceResponse;
  period: PeriodRead;
  /** Активный kind таб — определяет, какие план/факт показываем в трёх pill'ах. */
  kind: CategoryKind;
  /** True для закрытого периода — показываем итог, не текущий баланс. */
  isClosed: boolean;
}

/**
 * HeroCard — Liquid Glass premium balance card. Source: screens.jsx HomeA hero block.
 *
 * Большая цифра баланса (46px tnum) + 3 nested pill'а (план / факт / в-запасе) под
 * активный kind. В закрытом периоде показывает period.ending_balance_cents с лейблом
 * «Итог периода» вместо «Остаток на счёте».
 */
export function HeroCard({ balance, period, kind, isClosed }: HeroCardProps) {
  const amountCents = isClosed
    ? period.ending_balance_cents ?? 0
    : balance.balance_now_cents;
  const amountLabel = isClosed ? 'Итог периода' : 'Остаток на счёте';

  const planned = kind === 'expense'
    ? balance.planned_total_expense_cents
    : balance.planned_total_income_cents;
  const actual = kind === 'expense'
    ? balance.actual_total_expense_cents
    : balance.actual_total_income_cents;
  // delta семантика: положительная = хорошо
  // expense: план − факт (под бюджетом),
  // income:  факт − план (выше цели).
  const delta = kind === 'expense' ? planned - actual : actual - planned;

  const deltaLabel = kind === 'expense' ? 'В запасе' : 'Сверх';
  const deltaCls =
    delta > 0 ? styles.deltaPositive : delta < 0 ? styles.deltaNegative : styles.deltaZero;

  return (
    <div className={styles.card}>
      <div className={styles.kicker}>{amountLabel}</div>
      <div className={styles.amountRow}>
        <span className={styles.amount}>{formatKopecks(amountCents)}</span>
        <span className={styles.currency}>₽</span>
      </div>
      <div className={styles.pills}>
        <div className={styles.pill}>
          <div className={styles.pillKicker}>план</div>
          <div className={styles.pillValue}>{formatKopecks(planned)}</div>
        </div>
        <div className={styles.pill}>
          <div className={styles.pillKicker}>факт</div>
          <div className={styles.pillValue}>{formatKopecks(actual)}</div>
        </div>
        <div className={`${styles.pill} ${styles.pillAccent} ${deltaCls}`}>
          <div className={styles.pillKicker}>{deltaLabel}</div>
          <div className={styles.pillValue}>{formatKopecksWithSign(delta)}</div>
        </div>
      </div>
    </div>
  );
}
