import type { OverspendItem } from '../api/types';
import { formatKopecks } from '../utils/format';
import styles from './TopOverspendList.module.css';

interface TopOverspendListProps {
  items: OverspendItem[];
}

export function TopOverspendList({ items }: TopOverspendListProps) {
  return (
    <div className={styles.list}>
      {items.map((item) => {
        const borderCls =
          item.overspend_pct > 100
            ? styles.borderDanger
            : item.overspend_pct >= 80
              ? styles.borderWarn
              : styles.borderNeutral;
        return (
          <div key={item.category_id} className={`${styles.row} ${borderCls}`}>
            <div className={styles.rowTop}>
              <span className={styles.name}>{item.name}</span>
              <span className={styles.pct}>{Math.round(item.overspend_pct)}%</span>
            </div>
            <div className={styles.rowSub}>
              <span className={styles.planned}>план {formatKopecks(item.planned_cents)} ₽</span>
              <span className={styles.actual}>факт {formatKopecks(item.actual_cents)} ₽</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
