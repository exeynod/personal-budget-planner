import { useState } from 'react';
import { PageTitle } from '../components/PageTitle';
import { ForecastCard } from '../components/ForecastCard';
import { TopOverspendList } from '../components/TopOverspendList';
import { LineChart } from '../components/LineChart';
import { HorizontalBars } from '../components/HorizontalBars';
import { InfoNote } from '../components/InfoNote';
import { useAnalytics } from '../hooks/useAnalytics';
import type { AnalyticsRange } from '../api/analytics';
import styles from './AnalyticsScreen.module.css';

const RANGES: AnalyticsRange[] = ['1M', '3M', '6M', '12M'];

function CardPlaceholder({ children }: { children: React.ReactNode }) {
  return <div className={styles.placeholder}>{children}</div>;
}

export function AnalyticsScreen() {
  const [range, setRange] = useState<AnalyticsRange>('1M');
  const { trend, topOverspend, topCategories, forecast, loading, error } = useAnalytics(range);

  const hasTrend = (trend?.points.length ?? 0) > 1;
  const hasOverspend = (topOverspend?.items.length ?? 0) > 0;
  const hasTopCat = (topCategories?.items.length ?? 0) > 0;

  return (
    <div className={styles.root}>
      <PageTitle title="Аналитика" />

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

      {loading && (
        <div className={styles.skeletons}>
          <div className={`${styles.skeleton} ${styles.skeletonCard}`} />
          <div className={`${styles.skeleton} ${styles.skeletonList}`} />
          <div className={`${styles.skeleton} ${styles.skeletonChart}`} />
          <div className={`${styles.skeleton} ${styles.skeletonList}`} />
        </div>
      )}

      {error && !loading && (
        <div className={styles.error}>
          Не удалось загрузить данные. Попробуй ещё раз.
        </div>
      )}

      {!loading && !error && (
        <>
          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              <span>{range === '1M' ? 'Прогноз' : 'Cashflow'}</span>
              <InfoNote>
                {range === '1M' ? (
                  <>
                    <p>
                      Прогноз баланса на конец активного периода по плану:
                    </p>
                    <p>
                      <code>
                        накопления + план&nbsp;доходов − план&nbsp;расходов
                      </code>
                    </p>
                    <p>
                      Накопления — стартовый баланс периода (переносится с предыдущего
                      при закрытии). Факт-транзакции в формуле не участвуют —
                      это намеренно: показываем «куда придём, если выполним план».
                    </p>
                  </>
                ) : (
                  <>
                    <p>
                      Чистый поток (cashflow) по N последним закрытым периодам.
                      Активный период не учитывается, потому что он ещё не закрыт.
                    </p>
                    <p>
                      <code>
                        net = Σ(доходы&nbsp;факт − расходы&nbsp;факт) по N&nbsp;периодам
                      </code>
                    </p>
                    <p>
                      Среднее = <code>net / N</code>. Если закрытых периодов меньше N —
                      считаем по тем, что есть.
                    </p>
                  </>
                )}
              </InfoNote>
            </div>
            {forecast && forecast.mode !== 'empty' ? (
              <ForecastCard forecast={forecast} />
            ) : (
              <CardPlaceholder>
                {range === '1M'
                  ? 'Прогноз появится после старта периода и заполнения плана.'
                  : `Нет закрытых периодов за выбранный диапазон.`}
              </CardPlaceholder>
            )}
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              <span>Топ перерасходов</span>
              <InfoNote>
                <p>
                  Топ-5 категорий по доле перерасхода:
                  {' '}<code>факт ÷ план × 100%</code>.
                </p>
                <p>
                  Учитываются только категории, где есть и план, и факт за выбранный
                  диапазон, и план&nbsp;&gt;&nbsp;0.
                </p>
              </InfoNote>
            </div>
            {hasOverspend ? (
              <TopOverspendList items={topOverspend!.items} />
            ) : (
              <CardPlaceholder>Перерасходов нет — план соблюдается.</CardPlaceholder>
            )}
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              <span>Тренд расходов</span>
              <InfoNote>
                {range === '1M' ? (
                  <p>
                    Сумма расходов и доходов по дням активного периода. Дни без
                    транзакций заполняются нулями — кривая всегда непрерывна.
                  </p>
                ) : (
                  <p>
                    Сумма расходов и доходов за каждый из последних N периодов
                    (включая активный, если он есть).
                  </p>
                )}
              </InfoNote>
            </div>
            {hasTrend ? (
              <LineChart points={trend!.points} />
            ) : (
              <CardPlaceholder>
                {range === '1M'
                  ? 'Тренд появится со второго дня периода.'
                  : 'Тренд по месяцам появится после второго периода.'}
              </CardPlaceholder>
            )}
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              <span>Топ категорий</span>
              <InfoNote>
                <p>
                  Топ-5 категорий по сумме расходов факт за выбранный диапазон.
                  Сортировка по&nbsp;убыванию.
                </p>
              </InfoNote>
            </div>
            {hasTopCat ? (
              <HorizontalBars items={topCategories!.items} />
            ) : (
              <CardPlaceholder>Нет расходов за выбранный период.</CardPlaceholder>
            )}
          </div>
        </>
      )}
    </div>
  );
}
