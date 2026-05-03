import type { PeriodRead } from '../api/types';
import styles from './PeriodSwitcher.module.css';

export interface PeriodSwitcherProps {
  /** Periods sorted period_start DESC (newest first). */
  periods: PeriodRead[];
  selectedId: number;
  onSelect: (id: number) => void;
}

/**
 * PeriodSwitcher (DSH-06): horizontal navigation across budget periods.
 *
 * periods are sorted DESC by period_start, so:
 *   - hasPrev = idx < periods.length - 1  (older period exists)
 *   - hasNext = idx > 0                    (newer period exists)
 *
 * Renders "Закрыт" pill badge when current period is closed.
 */
export function PeriodSwitcher({ periods, selectedId, onSelect }: PeriodSwitcherProps) {
  const idx = periods.findIndex((p) => p.id === selectedId);
  const current = idx >= 0 ? periods[idx] : undefined;
  const hasPrev = idx >= 0 && idx < periods.length - 1;
  const hasNext = idx > 0;

  const handlePrev = () => {
    if (hasPrev) onSelect(periods[idx + 1].id);
  };
  const handleNext = () => {
    if (hasNext) onSelect(periods[idx - 1].id);
  };

  return (
    <div className={styles.row}>
      <button
        type="button"
        onClick={handlePrev}
        disabled={!hasPrev}
        className={styles.navBtn}
        aria-label="Предыдущий период"
      >
        ‹
      </button>
      <span className={styles.label}>
        {current ? formatPeriodLabel(current) : '—'}
        {current?.status === 'closed' && (
          <span className={styles.badge}>Закрыт</span>
        )}
      </span>
      <button
        type="button"
        onClick={handleNext}
        disabled={!hasNext}
        className={styles.navBtn}
        aria-label="Следующий период"
      >
        ›
      </button>
    </div>
  );
}

function formatPeriodLabel(period: PeriodRead): string {
  const d = new Date(period.period_start);
  const raw = d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  // Capitalise first letter: "май 2026" -> "Май 2026".
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}
