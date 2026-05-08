import { useState } from 'react';
import { MeshDarkBg } from '../components/MeshDarkBg';
import { ScreenHeader } from '../components/ScreenHeader';
import { SubTabBar } from '../components/SubTabBar';
import { TopOverspendList } from '../components/TopOverspendList';
import { LineChart } from '../components/LineChart';
import { HorizontalBars } from '../components/HorizontalBars';
import { InfoNote } from '../components/InfoNote';
import { useAnalytics } from '../hooks/useAnalytics';
import type { AnalyticsRange } from '../api/analytics';
import { formatKopecks, formatKopecksWithSign } from '../utils/format';
import styles from './AnalyticsScreen.module.css';

const RANGE_TABS: { id: AnalyticsRange; label: string }[] = [
  { id: '1M', label: '1М' },
  { id: '3M', label: '3М' },
  { id: '6M', label: '6М' },
  { id: '12M', label: '12М' },
];

function CardPlaceholder({ children }: { children: React.ReactNode }) {
  return <div className={styles.placeholder}>{children}</div>;
}

/**
 * AnalyticsScreen — Liquid Glass dark layout (Mesh background).
 * Source: screens.jsx AnalyticsScreen (lines 599-756 of prototype).
 *
 * Structure:
 *   MeshDarkBg + .scroll
 *   ├─ Header (title 28 + subtitle)
 *   ├─ Range chips (SubTabBar accent dark)
 *   ├─ Forecast hero card (glass-dark + LineChart)
 *   ├─ Top overspend (kicker + glass-dark list)
 *   └─ Top categories (kicker + glass-dark HorizontalBars)
 */
export interface AnalyticsScreenProps {
  /** Возврат в Management hub. Опционально — если screen рендерится как
   *  отдельный таб (legacy), back-кнопка не показывается. */
  onBack?: () => void;
}

export function AnalyticsScreen({ onBack }: AnalyticsScreenProps = {}) {
  const [range, setRange] = useState<AnalyticsRange>('1M');
  const { trend, topOverspend, topCategories, forecast, loading, error } = useAnalytics(range);

  const hasTrend = (trend?.points.length ?? 0) > 1;
  const hasOverspend = (topOverspend?.items.length ?? 0) > 0;
  const hasTopCat = (topCategories?.items.length ?? 0) > 0;

  // Forecast hero data (independent of range — 1M = period forecast, 3M+ = cashflow).
  const forecastHero = (() => {
    if (!forecast || forecast.mode === 'empty') return null;
    if (forecast.mode === 'forecast') {
      const projected = forecast.projected_end_balance_cents ?? 0;
      const planInc = forecast.planned_income_cents ?? 0;
      const planExp = forecast.planned_expense_cents ?? 0;
      // Прирост к стартовому балансу как процент: (план_доходов − план_расходов) / max(стартовый, 1).
      const start = forecast.starting_balance_cents ?? 0;
      const delta = planInc - planExp;
      const pct = start > 0 ? Math.round((delta / start) * 100) : null;
      return {
        kicker: 'Прогноз на конец периода',
        valueCents: projected,
        deltaPct: pct,
        isNegative: projected < 0,
      };
    }
    // cashflow
    const total = forecast.total_net_cents ?? 0;
    const avg = forecast.monthly_avg_cents ?? 0;
    const pct = total !== 0 && avg !== 0
      ? Math.round((avg / Math.max(Math.abs(total), 1)) * 100)
      : null;
    return {
      kicker: `Cashflow за ${forecast.periods_count ?? 0} периодов`,
      valueCents: total,
      deltaPct: pct,
      isNegative: total < 0,
    };
  })();

  return (
    <div className={styles.wrap}>
      <MeshDarkBg />
      <div className={styles.scroll}>
        {onBack ? (
          <ScreenHeader
            title="Аналитика"
            subtitle="Прогноз и тренды по бюджету"
            onBack={onBack}
            tint="dark"
          />
        ) : (
          <div className={styles.header}>
            <h1 className={styles.title}>Аналитика</h1>
            <p className={styles.subtitle}>Прогноз и тренды по бюджету</p>
          </div>
        )}

        <div className={styles.rangeRow}>
          <SubTabBar<AnalyticsRange>
            active={range}
            onChange={setRange}
            tabs={RANGE_TABS}
            variant="accent"
            tint="dark"
          />
        </div>

        {loading && (
          <div className={styles.skeletons}>
            <div className={`${styles.skeleton} ${styles.skeletonHero}`} />
            <div className={`${styles.skeleton} ${styles.skeletonList}`} />
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
            {/* Forecast hero card — glass-dark + LineChart */}
            <section className={`glass-dark ${styles.heroCard}`}>
              <div className={styles.heroTop}>
                <div className={styles.heroTexts}>
                  <div className={`kicker-d ${styles.heroKicker}`}>
                    {forecastHero?.kicker ??
                      (range === '1M' ? 'Прогноз' : 'Cashflow')}
                  </div>
                  <div className={`tnum ${styles.heroValue}`}>
                    {forecastHero
                      ? (
                        <>
                          <span className={forecastHero.isNegative ? styles.heroValueNeg : ''}>
                            {formatKopecksWithSign(forecastHero.valueCents)}
                          </span>
                          <span className={styles.heroCurrency}> ₽</span>
                        </>
                      )
                      : <span className={styles.heroEmpty}>—</span>
                    }
                  </div>
                </div>
                <div className={styles.heroRight}>
                  {forecastHero?.deltaPct !== null && forecastHero?.deltaPct !== undefined && (
                    <div
                      className={`tnum ${styles.deltaChip} ${
                        forecastHero.deltaPct >= 0 ? styles.deltaChipPos : styles.deltaChipNeg
                      }`}
                    >
                      {forecastHero.deltaPct > 0 ? '+' : ''}
                      {forecastHero.deltaPct}%
                    </div>
                  )}
                  <InfoNote>
                    {range === '1M' ? (
                      <>
                        <p>Прогноз баланса на конец активного периода:</p>
                        <p>
                          <code>накопления + план&nbsp;доходов − план&nbsp;расходов</code>
                        </p>
                        <p>
                          Факт-транзакции в формуле не участвуют — это намеренно:
                          показываем «куда придём, если выполним план».
                        </p>
                      </>
                    ) : (
                      <>
                        <p>Чистый поток (cashflow) по N последним закрытым периодам.</p>
                        <p>
                          <code>net = Σ(доходы&nbsp;факт − расходы&nbsp;факт)</code>
                        </p>
                        <p>Активный период не учитывается, потому что он ещё не закрыт.</p>
                      </>
                    )}
                  </InfoNote>
                </div>
              </div>

              <div className={styles.chartWrap}>
                {hasTrend ? (
                  <LineChart points={trend!.points} />
                ) : (
                  <div className={styles.chartPlaceholder}>
                    {range === '1M'
                      ? 'Тренд появится со второго дня периода.'
                      : 'Тренд по месяцам появится после второго периода.'}
                  </div>
                )}
              </div>

              <div className={styles.legend}>
                <span className={styles.legendItem}>
                  <span className={`${styles.legendDot} ${styles.legendInc}`} />
                  Доходы
                </span>
                <span className={styles.legendItem}>
                  <span className={`${styles.legendDot} ${styles.legendExp}`} />
                  Расходы
                </span>
              </div>
            </section>

            {/* Top overspend */}
            <div className={styles.sectionTitle}>
              <span className="kicker-d">Превышения плана</span>
              <InfoNote>
                <p>
                  Топ-5 категорий по доле перерасхода:{' '}
                  <code>факт ÷ план × 100%</code>.
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
              <div className={`glass-dark ${styles.placeholderCard}`}>
                <CardPlaceholder>Перерасходов нет — план соблюдается.</CardPlaceholder>
              </div>
            )}

            {/* Top categories */}
            <div className={styles.sectionTitle}>
              <span className="kicker-d">Топ категорий</span>
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
              <div className={`glass-dark ${styles.placeholderCard}`}>
                <CardPlaceholder>Нет расходов за выбранный период.</CardPlaceholder>
              </div>
            )}

            {/* Total summary footer (показываем только если был forecast hero,
                для контекста под графиком) */}
            {forecastHero && range === '1M' && (
              <div className={styles.heroFooter}>
                <span>
                  План доходов: <span className="tnum">{formatKopecks(forecast?.planned_income_cents ?? 0)} ₽</span>
                </span>
                <span>
                  План расходов: <span className="tnum">{formatKopecks(forecast?.planned_expense_cents ?? 0)} ₽</span>
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
