import type { ForecastResponse } from '../api/types';
import { formatKopecks } from '../utils/format';
import { Warning } from '@phosphor-icons/react';
import styles from './ForecastCard.module.css';

interface ForecastCardProps {
  forecast: ForecastResponse;
}

export function ForecastCard({ forecast }: ForecastCardProps) {
  const projected = forecast.projected_end_balance_cents;
  const isNegative = projected !== null && projected < 0;
  const valueCls = isNegative ? styles.valueDanger : styles.valueSuccess;

  return (
    <div className={styles.card}>
      <div className={styles.label}>Прогноз на конец периода</div>
      {forecast.insufficient_data ? (
        <div className={styles.noData}>Недостаточно данных</div>
      ) : (
        <>
          <div className={`${styles.value} ${valueCls}`}>
            {isNegative && <Warning weight="fill" size={18} />}
            {projected !== null ? `${formatKopecks(projected)} ₽` : '—'}
          </div>
          {forecast.will_burn_cents !== null && (
            <div className={styles.sub}>
              Сгорит {formatKopecks(forecast.will_burn_cents)} ₽
            </div>
          )}
        </>
      )}
    </div>
  );
}
