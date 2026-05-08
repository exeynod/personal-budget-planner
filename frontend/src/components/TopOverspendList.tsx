import type { OverspendItem } from '../api/types';
import { formatKopecks } from '../utils/format';
import { visualForCategory } from '../utils/categoryVisuals';
import styles from './TopOverspendList.module.css';

interface TopOverspendListProps {
  items: OverspendItem[];
}

/**
 * TopOverspendList — Liquid Glass dark список «Превышения плана».
 * Source: screens.jsx AnalyticsScreen «Превышения плана» block.
 */
export function TopOverspendList({ items }: TopOverspendListProps) {
  if (items.length === 0) return null;
  return (
    <div className={`glass-dark ${styles.list}`}>
      {items.map((item, idx) => {
        const visual = visualForCategory(item.name, item.category_id);
        const Icon = visual.Icon;
        const cat = visual.color;

        const isUnplanned = item.overspend_pct === null;
        const pct = item.overspend_pct ?? 0;
        const isOver = isUnplanned || pct > 100;
        const isWarn = !isOver && pct >= 80;

        const fillPct = isUnplanned ? 100 : Math.min(pct, 150) / 150 * 100;
        const dt = isUnplanned
          ? 'Без плана'
          : pct > 100
            ? `+${formatKopecks(item.actual_cents - item.planned_cents)} ₽`
            : `${formatKopecks(item.actual_cents)} / ${formatKopecks(item.planned_cents)} ₽`;

        return (
          <div
            key={item.category_id}
            className={`${styles.row} ${idx === 0 ? styles.first : ''}`}
          >
            <div
              className={styles.iconTile}
              style={{
                background: `linear-gradient(140deg, ${cat}55, ${cat}22)`,
                boxShadow: `inset 0 0 0 0.5px ${cat}80`,
              }}
            >
              <Icon size={18} weight="regular" color="#fff" />
            </div>
            <div className={styles.body}>
              <div className={styles.name}>{item.name}</div>
              <div className={styles.barTrack}>
                <div
                  className={styles.barFill}
                  style={{
                    width: `${fillPct}%`,
                    background: isOver ? '#FF7A4C' : isWarn ? 'var(--warn)' : '#7CC68F',
                  }}
                />
              </div>
            </div>
            <div className={styles.right}>
              <div
                className={styles.pct}
                style={{ color: isOver ? '#FF9F8A' : '#7CC68F' }}
              >
                {isUnplanned ? 'Без плана' : `${Math.round(pct)}%`}
              </div>
              <div className={styles.delta}>{dt}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
