import type { BalanceResponse, PeriodRead } from '../api/types';
import { formatKopecks, formatKopecksWithSign } from '../utils/format';
import styles from './HeroCard.module.css';

export interface HeroCardProps {
  balance: BalanceResponse;
  period: PeriodRead;
  /** True when viewing a closed/archived period — switches label and amount source. */
  isClosed: boolean;
}

/**
 * HeroCard — premium gradient balance card.
 *
 * Active mode (DSH-01): shows balance.balance_now_cents with label "Баланс".
 * Closed mode (DSH-05): shows period.ending_balance_cents with label "Итог периода".
 * Delta (DSH-02): formatted with sign, coloured by sign (success/danger/muted).
 */
export function HeroCard({ balance, period, isClosed }: HeroCardProps) {
  const amountCents = isClosed
    ? period.ending_balance_cents ?? 0
    : balance.balance_now_cents;
  const amountLabel = isClosed ? 'Итог периода' : 'Баланс';

  const periodRange = formatPeriodRange(period.period_start, period.period_end);

  const delta = balance.delta_total_cents;
  const deltaCls =
    delta > 0
      ? styles.deltaPositive
      : delta < 0
        ? styles.deltaNegative
        : styles.deltaZero;

  const deltaLabel = delta > 0 ? 'экономия' : delta < 0 ? 'перерасход' : 'по плану';

  return (
    <div className={styles.card}>
      <div className={styles.glow} aria-hidden />
      <div className={styles.periodRange}>{periodRange}</div>
      <div className={styles.amountWrap}>
        <span className={styles.amountLabel}>{amountLabel}</span>
        <span className={styles.amount}>{formatKopecks(amountCents)} ₽</span>
      </div>
      <div className={styles.deltaWrap}>
        <span className={`${styles.deltaChip} ${deltaCls}`}>
          {formatKopecksWithSign(delta)} ₽
        </span>
        <span className={styles.deltaLabel}>{deltaLabel}</span>
      </div>
    </div>
  );
}

function formatPeriodRange(startISO: string, endISO: string): string {
  const start = new Date(startISO);
  const end = new Date(endISO);
  const startStr = start.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  const endStr = end.toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
  return `${startStr} – ${endStr}`;
}
