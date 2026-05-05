import { useState } from 'react';
import { ChartLine } from '@phosphor-icons/react';
import { PageTitle } from '../components/PageTitle';
import { ForecastCard } from '../components/ForecastCard';
import { TopOverspendList } from '../components/TopOverspendList';
import { LineChart } from '../components/LineChart';
import { HorizontalBars } from '../components/HorizontalBars';
import { useAnalytics } from '../hooks/useAnalytics';
import type { AnalyticsRange } from '../api/analytics';
import styles from './AnalyticsScreen.module.css';

const RANGES: AnalyticsRange[] = ['1M', '3M', '6M', '12M'];

export function AnalyticsScreen() {
  const [range, setRange] = useState<AnalyticsRange>('1M');
  const { trend, topOverspend, topCategories, forecast, loading, error } = useAnalytics(range);

  const hasTrend = (trend?.points.length ?? 0) > 1;
  const hasOverspend = (topOverspend?.items.length ?? 0) > 0;
  const hasTopCat = (topCategories?.items.length ?? 0) > 0;
  const hasForecast = forecast !== null && !forecast.insufficient_data;
  const hasInsufficient = forecast?.insufficient_data === true;
  const allEmpty = !loading && !error && !hasTrend && !hasOverspend && !hasTopCat && !hasForecast && !hasInsufficient;

  return (
    <div className={styles.root}>
      <PageTitle title="Аналитика" />

      {/* Period chips */}
      <div className={styles.chips}>
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            className={range === r ? styles.chipActive : styles.chip}
            onClick={() => setRange(r)}
            aria-pressed={range === r}
          >
            {r}
          </button>
        ))}
      </div>

      {/* Loading skeletons */}
      {loading && (
        <div className={styles.skeletons}>
          <div className={`${styles.skeleton} ${styles.skeletonCard}`} />
          <div className={`${styles.skeleton} ${styles.skeletonList}`} />
          <div className={`${styles.skeleton} ${styles.skeletonChart}`} />
          <div className={`${styles.skeleton} ${styles.skeletonList}`} />
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className={styles.error}>
          Не удалось загрузить данные. Попробуй ещё раз.
        </div>
      )}

      {/* Content blocks */}
      {!loading && !error && (
        <>
          {/* Forecast */}
          {forecast && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Прогноз</div>
              <ForecastCard forecast={forecast} />
            </div>
          )}

          {/* Top overspend */}
          {hasOverspend && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Топ перерасходов</div>
              <TopOverspendList items={topOverspend!.items} />
            </div>
          )}

          {/* Trend line chart */}
          {hasTrend && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Тренд расходов</div>
              <LineChart points={trend!.points} />
            </div>
          )}

          {/* Top categories */}
          {hasTopCat && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Топ категорий</div>
              <HorizontalBars items={topCategories!.items} />
            </div>
          )}

          {/* Global empty state */}
          {allEmpty && (
            <div className={styles.emptyState}>
              <ChartLine size={48} weight="thin" color="var(--color-text-muted)" />
              <div className={styles.emptyHeading}>Нет данных за период</div>
              <div className={styles.emptyBody}>
                Добавь транзакции, чтобы увидеть аналитику
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
