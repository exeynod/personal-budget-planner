import type { ForecastResponse } from '../api/types';
import { formatKopecks } from '../utils/format';
import { Warning } from '@phosphor-icons/react';
import styles from './ForecastCard.module.css';

interface ForecastCardProps {
  forecast: ForecastResponse;
}

function signed(cents: number): string {
  const abs = formatKopecks(Math.abs(cents));
  if (cents > 0) return `+${abs} ₽`;
  if (cents < 0) return `−${abs} ₽`;
  return `${abs} ₽`;
}

export function ForecastCard({ forecast }: ForecastCardProps) {
  if (forecast.mode === 'empty') {
    return (
      <div className={styles.card}>
        <div className={styles.noData}>Пока нет данных для прогноза.</div>
      </div>
    );
  }

  if (forecast.mode === 'forecast') {
    const start = forecast.starting_balance_cents ?? 0;
    const inc = forecast.planned_income_cents ?? 0;
    const exp = forecast.planned_expense_cents ?? 0;
    const projected = forecast.projected_end_balance_cents ?? 0;
    const isOverspend = projected < 0;
    const valueCls = isOverspend ? styles.valueDanger : styles.valueSuccess;

    return (
      <div className={styles.card}>
        <div className={styles.breakdown}>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Накопления (стартовый баланс)</span>
            <span className={styles.rowValue}>{signed(start)}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>План доходов</span>
            <span className={`${styles.rowValue} ${styles.rowValuePos}`}>+{formatKopecks(inc)} ₽</span>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>План расходов</span>
            <span className={`${styles.rowValue} ${styles.rowValueNeg}`}>−{formatKopecks(exp)} ₽</span>
          </div>
        </div>
        <div className={styles.divider} />
        <div className={styles.headlineLabel}>Прогноз на конец периода</div>
        <div className={`${styles.value} ${valueCls}`}>
          {isOverspend && <Warning weight="fill" size={18} />}
          {signed(projected)}
        </div>
      </div>
    );
  }

  // mode === 'cashflow'
  const total = forecast.total_net_cents ?? 0;
  const avg = forecast.monthly_avg_cents ?? 0;
  const count = forecast.periods_count ?? 0;
  const requested = forecast.requested_periods ?? 0;
  const isPositive = total >= 0;
  const valueCls = isPositive ? styles.valueSuccess : styles.valueDanger;

  return (
    <div className={styles.card}>
      <div className={styles.headlineLabel}>
        Накоплено за {count} {count === 1 ? 'период' : count < 5 ? 'периода' : 'периодов'}
        {count < requested && ` (из запрошенных ${requested})`}
      </div>
      <div className={`${styles.value} ${valueCls}`}>{signed(total)}</div>
      <div className={styles.sub}>В среднем в месяц: {signed(avg)}</div>
    </div>
  );
}
