// Phase 27-05 Task 2: AnalyticsView (cream) — pure presentational component
// covering ANAL-V10-01..04.
//
// Composition:
//   - cream absolute-fill background, ink text.
//   - Top: ← НАЗАД link (when canPop).
//   - Eyebrow «ANALYTICS / МЕСЯЦ».
//   - Mass italic «Месяц.» size 70.
//   - Segmented period chips (last 3 months) — selected = ink bg + paper text.
//   - 2 KPI plates row:
//       • Left dark: «ПОТРАЧЕНО» / BigFig sumCents/100 ₽ / delta eyebrow.
//       • Right yellow: «СЭКОНОМЛЕНО» / BigFig sumCents/100 ₽ / «от плана».
//   - Segmented group-mode chips: ДЕНЬ / НЕД. / КАТ.
//   - SVG bar-chart with red highlight when shouldHighlightRed (≥75% of plan).
//   - Top-5 categories list rows: «{rank} {name} {sum} ₽ ({pct}%)».
//   - Loading + error subviews.
//
// View is router-agnostic — all interactions are passed as callbacks.
// Mirrors PlanView / SubscriptionsView pattern from Phase 26.

import { Eyebrow, Mass, BigFig } from '../../componentsV10';
import type { TopCategoryItem } from '../../api/v10';
import {
  shouldHighlightRed,
  type GroupMode,
  type MonthOption,
  type KPISpent,
  type KPISaved,
} from './computeAnalytics';
import styles from './AnalyticsView.module.css';

// ─────────── Bar wire shape (mount supplies depending on group mode) ───────────

export interface BarDatum {
  /** X-axis label (e.g. "10", "Н1", "Еда"). */
  label: string;
  /** Bar value in cents (always |abs|, expense-only). */
  sumCents: number;
  /** Optional plan ceiling for red-highlight comparison; omit for ДЕНЬ/НЕД modes. */
  planCents?: number;
}

// ─────────── Props ───────────

export interface AnalyticsViewProps {
  /** Segmented period chips (typically lastNMonths(now, 3)). */
  monthOptions: MonthOption[];
  /** Currently selected month (one of monthOptions). */
  selectedMonth: MonthOption;
  /** Period chip tap. */
  onSelectMonth: (m: MonthOption) => void;

  /** Currently selected group mode (day | week | cat). */
  groupMode: GroupMode;
  /** Group-mode chip tap. */
  onSelectGroup: (m: GroupMode) => void;

  /** «ПОТРАЧЕНО» plate model — sum + delta vs prev period. */
  kpiSpent: KPISpent;
  /** «СЭКОНОМЛЕНО» plate model — sum of positive plan-fact remainders. */
  kpiSaved: KPISaved;

  /** Bar chart data, ordered left-to-right. */
  barData: BarDatum[];
  /** Top-5 categories list. */
  topCategories: TopCategoryItem[];

  /** Loading flag — shows loading subview when true. */
  loading: boolean;
  /** Error string — shows error subview when non-null. */
  error: string | null;

  /** Whether router can pop back (controls ← НАЗАД visibility). */
  canPop: boolean;
  /** ← НАЗАД tap. */
  onBack: () => void;
}

// ─────────── helpers (display) ───────────

function formatRubles(cents: number): string {
  return Math.floor(Math.abs(cents) / 100).toLocaleString('ru-RU');
}

function formatDeltaPct(pct: number): string {
  if (pct === 0) return '· '; // empty / no prev
  const sign = pct > 0 ? '+' : '−';
  return `${sign}${Math.abs(pct)}% К ПРОШЛОМУ`;
}

const GROUP_LABEL: Record<GroupMode, string> = {
  day: 'ДЕНЬ',
  week: 'НЕД.',
  cat: 'КАТ.',
};

// ─────────── Component ───────────

export function AnalyticsView(props: AnalyticsViewProps) {
  if (props.loading) {
    return (
      <div className={styles.root} data-testid="analytics-loading">
        <Eyebrow color="var(--poster-ink)">ЗАГРУЗКА</Eyebrow>
      </div>
    );
  }

  if (props.error) {
    return (
      <div className={styles.root} data-testid="analytics-error">
        <Eyebrow color="var(--poster-ink)">ОШИБКА</Eyebrow>
        <div className={styles.errorMsg}>{props.error}</div>
        <button type="button" className={styles.backLink} onClick={props.onBack}>
          ← НАЗАД
        </button>
      </div>
    );
  }

  const maxSum = Math.max(1, ...props.barData.map((b) => b.sumCents));

  return (
    <div className={styles.root}>
      {/* ─────────── back link ─────────── */}
      {props.canPop && (
        <div className={styles.headerRow}>
          <button
            type="button"
            className={styles.backLink}
            onClick={props.onBack}
          >
            ← НАЗАД
          </button>
        </div>
      )}

      {/* ─────────── eyebrow ─────────── */}
      <div className={styles.eyebrowRow}>
        <Eyebrow color="var(--poster-ink)">ANALYTICS · МЕСЯЦ</Eyebrow>
      </div>

      {/* ─────────── headline ─────────── */}
      <Mass italic size={70} className={styles.headlineMass}>
        Месяц.
      </Mass>

      {/* ─────────── segmented period chips ─────────── */}
      <div className={styles.segmented} role="tablist" aria-label="Период">
        {props.monthOptions.map((m) => {
          const active = m.label === props.selectedMonth.label;
          return (
            <button
              key={m.label}
              type="button"
              role="tab"
              aria-selected={active}
              className={`${styles.segChip} ${active ? styles.segChipActive : ''}`}
              onClick={() => props.onSelectMonth(m)}
              data-testid={`period-chip-${m.label}`}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {/* ─────────── KPI plates row ─────────── */}
      <div className={styles.kpiRow}>
        {/* dark plate — ПОТРАЧЕНО */}
        <div className={styles.kpiDark} data-testid="kpi-spent">
          <Eyebrow color="var(--poster-paper)">ПОТРАЧЕНО</Eyebrow>
          <BigFig
            value={Math.floor(props.kpiSpent.sumCents / 100)}
            sup="₽"
            size={56}
            color="var(--poster-paper)"
            animate={false}
            className={styles.kpiBigFig}
          />
          <Eyebrow color="var(--poster-paper)">
            {formatDeltaPct(props.kpiSpent.deltaPct)}
          </Eyebrow>
        </div>

        {/* yellow plate — СЭКОНОМЛЕНО */}
        <div className={styles.kpiYellow} data-testid="kpi-saved">
          <Eyebrow color="var(--poster-ink)">СЭКОНОМЛЕНО</Eyebrow>
          <BigFig
            value={Math.floor(props.kpiSaved.sumCents / 100)}
            sup="₽"
            size={56}
            color="var(--poster-ink)"
            animate={false}
            className={styles.kpiBigFig}
          />
          <Eyebrow color="var(--poster-ink)">ОТ ПЛАНА</Eyebrow>
        </div>
      </div>

      {/* ─────────── group-mode chips ─────────── */}
      <div className={styles.segmented} role="tablist" aria-label="Группировка">
        {(['day', 'week', 'cat'] as const).map((g) => {
          const active = g === props.groupMode;
          return (
            <button
              key={g}
              type="button"
              role="tab"
              aria-selected={active}
              className={`${styles.segChip} ${active ? styles.segChipActive : ''}`}
              onClick={() => props.onSelectGroup(g)}
              data-testid={`group-chip-${g}`}
            >
              {GROUP_LABEL[g]}
            </button>
          );
        })}
      </div>

      {/* ─────────── bar chart ─────────── */}
      <div className={styles.chartWrap} data-testid="bar-chart">
        {props.barData.length === 0 ? (
          <div className={styles.chartEmpty}>Нет данных</div>
        ) : (
          <svg
            className={styles.svg}
            viewBox={`0 0 ${Math.max(props.barData.length, 1) * 40} 200`}
            preserveAspectRatio="xMidYMid meet"
            aria-label="Бар-чарт"
          >
            {props.barData.map((b, i) => {
              const h = Math.round((b.sumCents / maxSum) * 180);
              const red = shouldHighlightRed(b.sumCents, b.planCents ?? 0);
              return (
                <g key={`${b.label}-${i}`} transform={`translate(${i * 40}, 0)`}>
                  <rect
                    x={6}
                    y={200 - h - 14}
                    width={28}
                    height={h}
                    className={`${styles.bar} ${red ? styles.barRed : ''}`}
                    data-testid={`bar-${i}${red ? '-red' : ''}`}
                  />
                  <text
                    x={20}
                    y={196}
                    textAnchor="middle"
                    className={styles.barLabel}
                  >
                    {b.label}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>

      {/* ─────────── top-5 categories ─────────── */}
      <div className={styles.topSection}>
        <Eyebrow color="var(--poster-ink)">ТОП-5 КАТЕГОРИЙ</Eyebrow>
        {props.topCategories.length === 0 ? (
          <div className={styles.topEmpty}>Нет категорий</div>
        ) : (
          <div className={styles.topList}>
            {props.topCategories.slice(0, 5).map((c, i) => (
              <div
                key={c.category_id}
                className={styles.topRow}
                data-testid={`top-row-${c.category_id}`}
              >
                <div className={styles.topRank}>{String(i + 1).padStart(2, '0')}</div>
                <div className={styles.topName}>{c.category_name.toUpperCase()}</div>
                <div className={styles.topAmount}>
                  {formatRubles(c.sum_cents)} ₽
                  {c.pct_of_plan != null && (
                    <span className={styles.topPct}> · {c.pct_of_plan}%</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
