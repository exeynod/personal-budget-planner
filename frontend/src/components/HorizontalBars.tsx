import type { TopCategoryItem } from '../api/types';
import { formatKopecks } from '../utils/format';
import { visualForCategory } from '../utils/categoryVisuals';
import styles from './HorizontalBars.module.css';

interface HorizontalBarsProps {
  items: TopCategoryItem[];
}

/**
 * HorizontalBars — Liquid Glass dark «Топ категорий» с горизонтальными
 * gradient-барами. Source: screens.jsx AnalyticsScreen top-categories block.
 */
export function HorizontalBars({ items }: HorizontalBarsProps) {
  if (items.length === 0) return null;
  const maxCents = Math.max(...items.map((i) => i.actual_cents), 1);

  return (
    <div className={`glass-dark ${styles.card}`}>
      <div className={styles.list}>
        {items.map((item) => {
          const fillPct = (item.actual_cents / maxCents) * 100;
          const cat = visualForCategory(item.name, item.category_id).color;
          return (
            <div key={item.category_id} className={styles.row}>
              <div className={styles.rowTop}>
                <span className={styles.label}>{item.name}</span>
                <span className={styles.amount}>{formatKopecks(item.actual_cents)} ₽</span>
              </div>
              <div className={styles.barTrack}>
                <div
                  className={styles.barFill}
                  style={{
                    width: `${fillPct}%`,
                    background: `linear-gradient(90deg, ${cat}, ${cat}aa)`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
