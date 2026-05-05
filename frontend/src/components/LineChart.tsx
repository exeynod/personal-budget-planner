import type { TrendPoint } from '../api/types';
import { formatKopecks } from '../utils/format';
import styles from './LineChart.module.css';

interface LineChartProps {
  points: TrendPoint[];
}

const PAD_LEFT = 48;
const PAD_RIGHT = 12;
const PAD_TOP = 12;
const PAD_BOTTOM = 28;
const W = 320;
const H = 160;
const CHART_W = W - PAD_LEFT - PAD_RIGHT;
const CHART_H = H - PAD_TOP - PAD_BOTTOM;

function cubicBezierPath(pts: Array<[number, number]>): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const cpx = (prev[0] + curr[0]) / 2;
    d += ` C ${cpx} ${prev[1]}, ${cpx} ${curr[1]}, ${curr[0]} ${curr[1]}`;
  }
  return d;
}

export function LineChart({ points }: LineChartProps) {
  if (points.length < 2) return null;

  const expenses = points.map((p) => p.expense_cents);
  const maxVal = Math.max(...expenses, 1);
  const TICK_STEP = 500_000;
  const maxTick = Math.ceil(maxVal / TICK_STEP) * TICK_STEP;
  const tickCount = Math.min(Math.ceil(maxTick / TICK_STEP), 5);

  const xPos = (i: number) => PAD_LEFT + (i / (points.length - 1)) * CHART_W;
  const yPos = (v: number) => PAD_TOP + CHART_H - (v / maxTick) * CHART_H;

  const coords: Array<[number, number]> = points.map((p, i) => [xPos(i), yPos(p.expense_cents)]);
  const linePath = cubicBezierPath(coords);

  const lastX = coords[coords.length - 1][0];
  const baseY = PAD_TOP + CHART_H;
  const areaPath = `${linePath} L ${lastX} ${baseY} L ${PAD_LEFT} ${baseY} Z`;

  const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => i * TICK_STEP);

  return (
    <div className={styles.wrapper}>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.chart} aria-hidden>
        <defs>
          <linearGradient id="lineChartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.15" />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {yTicks.map((tick) => {
          const y = yPos(tick);
          return (
            <g key={tick}>
              <line x1={PAD_LEFT} y1={y} x2={W - PAD_RIGHT} y2={y}
                stroke="var(--color-border)" strokeWidth="0.5" />
              <text x={PAD_LEFT - 4} y={y + 3} className={styles.yLabel}>
                {tick > 0 ? `${formatKopecks(tick)}` : '0'}
              </text>
            </g>
          );
        })}
        <path d={areaPath} fill="url(#lineChartFill)" />
        <path d={linePath} fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {coords.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="3" fill="var(--color-primary)" />
        ))}
        {points.map((p, i) => (
          <text key={i} x={xPos(i)} y={H - 6} className={styles.xLabel}>
            {p.period_label}
          </text>
        ))}
      </svg>
    </div>
  );
}
