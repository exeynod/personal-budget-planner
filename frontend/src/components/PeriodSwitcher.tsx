import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import type { PeriodRead } from '../api/types';
import styles from './PeriodSwitcher.module.css';

export interface PeriodSwitcherProps {
  /** Periods sorted period_start DESC (newest first). */
  periods: PeriodRead[];
  selectedId: number;
  onSelect: (id: number) => void;
}

/**
 * PeriodSwitcher (DSH-06): Liquid Glass period pill.
 * Source: screens.jsx HomeA period switcher.
 */
export function PeriodSwitcher({ periods, selectedId, onSelect }: PeriodSwitcherProps) {
  const idx = periods.findIndex((p) => p.id === selectedId);
  const current = idx >= 0 ? periods[idx] : undefined;
  const hasPrev = idx >= 0 && idx < periods.length - 1;
  const hasNext = idx > 0;
  const isClosed = current?.status === 'closed';

  const handlePrev = () => { if (hasPrev) onSelect(periods[idx + 1].id); };
  const handleNext = () => { if (hasNext) onSelect(periods[idx - 1].id); };

  return (
    <div className={styles.wrap}>
      <div className={styles.pill}>
        <button
          type="button"
          onClick={handlePrev}
          disabled={!hasPrev}
          className={styles.navBtn}
          aria-label="Предыдущий период"
        >
          <CaretLeft size={12} weight="bold" />
        </button>
        <span className={styles.label}>
          {current ? formatPeriodLabel(current) : '—'}
        </span>
        <span className={styles.dot} />
        <span className={styles.sub}>
          {isClosed ? 'закрыт' : current ? `${daysLeft(current)} дн.` : '—'}
        </span>
        <button
          type="button"
          onClick={handleNext}
          disabled={!hasNext}
          className={styles.navBtn}
          aria-label="Следующий период"
        >
          <CaretRight size={12} weight="bold" />
        </button>
      </div>
    </div>
  );
}

function formatPeriodLabel(period: PeriodRead): string {
  const d = new Date(period.period_start);
  const raw = d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function daysLeft(period: PeriodRead): number {
  const end = new Date(period.period_end);
  const now = new Date();
  const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}
