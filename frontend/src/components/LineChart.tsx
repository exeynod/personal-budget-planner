import type { TrendPoint } from '../api/types';
import styles from './LineChart.module.css';

/**
 * LineChart — двухлинейный mini-график для AnalyticsScreen forecast hero.
 * Source: screens.jsx AnalyticsScreen() inline SVG (lines 660-700 of prototype).
 *
 * - Income: зелёная (#7CC68F) кривая + area-gradient заливка снизу.
 * - Expense: accent (var(--accent)) кривая + большой dot на последней точке
 *            с белой обводкой 2px.
 * - 3 horizontal gridlines (rgba(255,255,255,0.08)).
 * - Месяц-лейблы на X-оси: 10px 600 var(--ink-d-2).
 *
 * Размер фиксирован 320×140 как в прототипе. preserveAspectRatio="none" чтобы
 * растягиваться на 100% ширины контейнера.
 */
interface LineChartProps {
  points: TrendPoint[];
}

const W = 320;
const H = 140;
const PAD_X = 20;
const TOP_PAD = 5;
const BOTTOM_LABEL = 5; // место под x-лейблы под линиями
const CHART_TOP = TOP_PAD;
const CHART_BOTTOM = H - BOTTOM_LABEL; // 135 (gridlines рисуются до этого Y)
const CHART_H = CHART_BOTTOM - CHART_TOP; // 130

export function LineChart({ points }: LineChartProps) {
  if (points.length < 2) return null;

  const expenses = points.map((p) => p.expense_cents);
  const incomes = points.map((p) => p.income_cents);
  // Единый масштаб для обеих линий (по максимуму из доходов и расходов).
  const maxV = Math.max(...expenses, ...incomes, 1);

  const stepX = points.length > 1 ? (W - PAD_X * 2) / (points.length - 1) : 0;
  const xPos = (i: number) => PAD_X + i * stepX;
  const yPos = (v: number) => CHART_BOTTOM - (v / maxV) * CHART_H;

  const expCoords = points.map((p, i) => [xPos(i), yPos(p.expense_cents)] as const);
  const incCoords = points.map((p, i) => [xPos(i), yPos(p.income_cents)] as const);

  const linePath = (coords: ReadonlyArray<readonly [number, number]>) =>
    coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');

  const incLine = linePath(incCoords);
  const expLine = linePath(expCoords);

  const lastX = xPos(points.length - 1);
  const incArea = `${incLine} L ${lastX} ${CHART_BOTTOM} L ${PAD_X} ${CHART_BOTTOM} Z`;

  // Dot on the last expense point — текущий период.
  const [dotX, dotY] = expCoords[expCoords.length - 1];

  // gridlines: 3 линии на 0%, 50%, 100% высоты графика.
  const gridYs = [0, 0.5, 1].map((t) => CHART_BOTTOM - t * CHART_H);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height="100%"
      preserveAspectRatio="none"
      className={styles.chart}
      aria-hidden
    >
      <defs>
        <linearGradient id="lineChartIncFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#7CC68F" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#7CC68F" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* gridlines */}
      {gridYs.map((y, i) => (
        <line
          key={i}
          x1="0"
          x2={W}
          y1={y}
          y2={y}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="1"
        />
      ))}

      {/* income area + line */}
      <path d={incArea} fill="url(#lineChartIncFill)" />
      <path
        d={incLine}
        fill="none"
        stroke="#7CC68F"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* expense line */}
      <path
        d={expLine}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* current-period dot on expense line */}
      <circle
        cx={dotX}
        cy={dotY}
        r="5"
        fill="var(--accent)"
        stroke="#fff"
        strokeWidth="2"
      />

      {/* x-axis month labels */}
      {points.map((p, i) => (
        <text
          key={i}
          x={xPos(i)}
          y={H - 1}
          textAnchor="middle"
          className={styles.xLabel}
        >
          {p.period_label}
        </text>
      ))}
    </svg>
  );
}
