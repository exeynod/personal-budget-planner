// Liquid Glass v2 — native iOS period switcher.
//
// Replaces the poster <PeriodSwitcher> on the native Home / Transactions
// screens: the poster pill paints faint paper-on-coral ink that becomes
// effectively invisible on the light Liquid Glass surface. This native
// variant uses dark, readable iOS ink (var(--lgn-ink)) on a subtle glass
// pill with phosphor CaretLeft/CaretRight chevrons.
//
// Same prop interface as the poster PeriodSwitcher (periods / selectedId /
// onSelect) and the SAME prev/next index logic — periods are newest-first
// (period_start DESC):
//   - idx  = index of the selected period
//   - prev (OLDER period) = idx + 1, disabled at the oldest end
//   - next (NEWER period) = idx − 1, disabled at the newest end
//
// Label «Месяц ГГГГ» is the capitalized Russian nominative month + year of
// the selected period's period_start.

import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import type { PeriodRead } from '../../api/types';
import styles from './NativePeriodSwitcher.module.css';

export interface PeriodSwitcherProps {
  /** Periods sorted period_start DESC (newest first — backend default). */
  periods: PeriodRead[];
  /** Currently-viewed period id. */
  selectedId: number;
  /** Switch the viewed period. */
  onSelect: (id: number) => void;
}

/** Russian nominative month names for the label («Май 2026»). */
const MONTHS_RU_NOMINATIVE = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
] as const;

function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** «Май 2026» from period_start (capitalized nominative month + year). */
function formatPeriodLabel(period: PeriodRead): string {
  const d = parseLocalDate(period.period_start);
  return `${MONTHS_RU_NOMINATIVE[d.getMonth()]} ${d.getFullYear()}`;
}

export function NativePeriodSwitcher({
  periods,
  selectedId,
  onSelect,
}: PeriodSwitcherProps) {
  const idx = periods.findIndex((p) => p.id === selectedId);
  const current = idx >= 0 ? periods[idx] : undefined;

  // newest-first: older = idx+1, newer = idx-1 (mirrors poster PeriodSwitcher).
  const hasPrev = idx >= 0 && idx < periods.length - 1;
  const hasNext = idx > 0;

  const handlePrev = () => {
    if (hasPrev) onSelect(periods[idx + 1].id);
  };
  const handleNext = () => {
    if (hasNext) onSelect(periods[idx - 1].id);
  };

  return (
    <div className={styles.wrap} data-testid="native-period-switcher">
      <button
        type="button"
        onClick={handlePrev}
        disabled={!hasPrev}
        className={styles.navBtn}
        aria-label="Предыдущий период"
      >
        <CaretLeft size={16} weight="bold" />
      </button>
      <span className={styles.label}>
        {current ? formatPeriodLabel(current) : '—'}
      </span>
      <button
        type="button"
        onClick={handleNext}
        disabled={!hasNext}
        className={styles.navBtn}
        aria-label="Следующий период"
      >
        <CaretRight size={16} weight="bold" />
      </button>
    </div>
  );
}
