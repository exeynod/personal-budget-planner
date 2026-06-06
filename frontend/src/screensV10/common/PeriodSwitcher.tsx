// Phase P2 (period switching): PeriodSwitcher (v10) — prev/next period pill.
//
// Ports the prev/next index logic from the deprecated v06
// components/PeriodSwitcher.tsx, restyled in the v10 poster idiom (sharp
// corners, JetBrains Mono caption, paper-on-translucent, text-glyph nav
// rather than phosphor icons — the v10 shell uses ‹ › / → / › glyphs).
//
// Index logic (periods are newest-first, i.e. sorted period_start DESC):
//   - idx  = index of the selected period
//   - prev = OLDER period = idx + 1 (disabled at the oldest end)
//   - next = NEWER period = idx − 1 (disabled at the newest end)
//
// Label = capitalized «Июнь 2026» from period_start. The sub-caption shows
// «закрыт» for a closed period, else «N дн.» remaining (today inclusive).
//
// This component is router-/provider-agnostic: HomeMount / TransactionsMount
// pass `periods`, `selectedId`, and `onSelect` (wired to the
// SelectedPeriodProvider's setSelectedPeriodId).

import type { PeriodRead } from '../../api/types';
import styles from './PeriodSwitcher.module.css';

export interface PeriodSwitcherProps {
  /** Periods sorted period_start DESC (newest first — backend default). */
  periods: PeriodRead[];
  /** Currently-viewed period id. */
  selectedId: number;
  /** Switch the viewed period. */
  onSelect: (id: number) => void;
}

/** Russian nominative month names for the pill label («Июнь 2026»). */
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

/** «Июнь 2026» from period_start (capitalized nominative month + year). */
function formatPeriodLabel(period: PeriodRead): string {
  const d = parseLocalDate(period.period_start);
  return `${MONTHS_RU_NOMINATIVE[d.getMonth()]} ${d.getFullYear()}`;
}

/** Days remaining in the period (today inclusive); 0 once past period_end. */
function daysLeft(period: PeriodRead): number {
  const end = parseLocalDate(period.period_end);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round(
    (end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  return Math.max(0, diff + 1);
}

export function PeriodSwitcher({
  periods,
  selectedId,
  onSelect,
}: PeriodSwitcherProps) {
  const idx = periods.findIndex((p) => p.id === selectedId);
  const current = idx >= 0 ? periods[idx] : undefined;
  // newest-first: older = idx+1, newer = idx-1.
  const hasPrev = idx >= 0 && idx < periods.length - 1;
  const hasNext = idx > 0;
  const isClosed = current?.status === 'closed';

  const handlePrev = () => {
    if (hasPrev) onSelect(periods[idx + 1].id);
  };
  const handleNext = () => {
    if (hasNext) onSelect(periods[idx - 1].id);
  };

  return (
    <div className={styles.wrap} data-testid="period-switcher">
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
      </span>
      <span className={styles.dot} aria-hidden="true">
        ·
      </span>
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
        ›
      </button>
    </div>
  );
}
