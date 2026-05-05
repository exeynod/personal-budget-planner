import type { TopCategoryItem } from '../api/types';
import { formatKopecks } from '../utils/format';
import styles from './HorizontalBars.module.css';

const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
] as const;

interface HorizontalBarsProps {
  items: TopCategoryItem[];
}

export function HorizontalBars({ items }: HorizontalBarsProps) {
  const maxCents = Math.max(...items.map((i) => i.actual_cents), 1);
  return (
    <div className={styles.list}>
      {items.map((item, idx) => {
        const fillPct = (item.actual_cents / maxCents) * 100;
        const color = CHART_COLORS[idx % CHART_COLORS.length];
        return (
          <div key={item.category_id} className={styles.row}>
            <div className={styles.rowTop}>
              <span className={styles.label}>{item.name}</span>
              <span className={styles.amount}>{formatKopecks(item.actual_cents)} ₽</span>
            </div>
            <div className={styles.barTrack}>
              <div
                className={styles.barFill}
                style={{ width: `${fillPct}%`, background: color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
