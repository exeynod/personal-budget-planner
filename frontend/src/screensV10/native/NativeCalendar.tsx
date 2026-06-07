// Liquid Glass v2 — custom in-app month-grid calendar.
//
// Replaces the OS `<input type="date">` popup (design-review §B, owner's 2nd
// complaint). A compact Пн–Вс month grid styled entirely with `--lgn-*` tokens:
// rounded, native-shell look, no browser chrome. Month paging via ◀▶; today is
// outlined, the selected day is accent-filled. Renders inside the date-picker
// ActionSheet (see NativeDatePicker «Своя дата»).
//
// Controlled value is an ISO `YYYY-MM-DD` string (or null). onSelect emits the
// chosen ISO day. min/max (ISO) clamp selectable days (disabled, non-tappable).

import { useState } from 'react';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import styles from './NativeCalendar.module.css';

/** RU nominative month names for the calendar header («Июнь 2026»). */
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

/** Пн-first weekday headers. */
const WEEKDAYS_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const;

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Build ISO `YYYY-MM-DD` from y/m(0-based)/d local parts (no TZ shift). */
function isoFrom(year: number, month0: number, day: number): string {
  return `${year}-${pad2(month0 + 1)}-${pad2(day)}`;
}

function todayIso(): string {
  const d = new Date();
  return isoFrom(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Parse ISO → {year, month0} or null. */
function parseIso(iso: string | null): { year: number; month0: number } | null {
  if (!iso) return null;
  const [y, m] = iso.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return null;
  return { year: y, month0: m - 1 };
}

/** Mon-first weekday index (0=Mon … 6=Sun) of the 1st of the month. */
function firstWeekdayMonFirst(year: number, month0: number): number {
  // JS getDay(): 0=Sun … 6=Sat. Shift so Monday = 0.
  return (new Date(year, month0, 1).getDay() + 6) % 7;
}

export interface NativeCalendarProps {
  /** Currently selected ISO day, or null. */
  value: string | null;
  /** Emit the chosen ISO day. */
  onSelect: (iso: string) => void;
  /** Inclusive ISO lower bound (days before are disabled). */
  min?: string;
  /** Inclusive ISO upper bound (days after are disabled). */
  max?: string;
  testId?: string;
}

export function NativeCalendar({
  value,
  onSelect,
  min,
  max,
  testId = 'native-calendar',
}: NativeCalendarProps) {
  const today = todayIso();
  // View month defaults to the selected value's month, else today's month.
  const initial = parseIso(value) ?? parseIso(today)!;
  const [view, setView] = useState<{ year: number; month0: number }>(initial);

  const daysInMonth = new Date(view.year, view.month0 + 1, 0).getDate();
  const lead = firstWeekdayMonFirst(view.year, view.month0);

  // Grid cells: leading blanks + day numbers. Trailing blanks are implicit
  // (CSS grid simply ends the last row).
  const cells: (number | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  function shiftMonth(delta: number) {
    setView((v) => {
      const m = v.month0 + delta;
      const year = v.year + Math.floor(m / 12);
      const month0 = ((m % 12) + 12) % 12;
      return { year, month0 };
    });
  }

  return (
    <div className={styles.calendar} data-testid={testId}>
      {/* Header: «Июнь 2026» + ◀▶ */}
      <div className={styles.header}>
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => shiftMonth(-1)}
          aria-label="Предыдущий месяц"
          data-testid={`${testId}-prev`}
        >
          <CaretLeft size={18} weight="bold" />
        </button>
        <span className={styles.title}>
          {MONTHS_RU_NOMINATIVE[view.month0]} {view.year}
        </span>
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => shiftMonth(1)}
          aria-label="Следующий месяц"
          data-testid={`${testId}-next`}
        >
          <CaretRight size={18} weight="bold" />
        </button>
      </div>

      {/* Weekday header row */}
      <div className={styles.weekRow}>
        {WEEKDAYS_RU.map((w) => (
          <span key={w} className={styles.weekday}>
            {w}
          </span>
        ))}
      </div>

      {/* Day grid */}
      <div className={styles.grid}>
        {cells.map((day, i) => {
          if (day == null) {
            return <span key={`b${i}`} className={styles.blank} aria-hidden />;
          }
          const iso = isoFrom(view.year, view.month0, day);
          const isToday = iso === today;
          const isSelected = iso === value;
          const disabled =
            (min != null && iso < min) || (max != null && iso > max);
          return (
            <button
              key={iso}
              type="button"
              disabled={disabled}
              className={`${styles.day} ${isToday ? styles.today : ''} ${
                isSelected ? styles.selected : ''
              }`}
              onClick={() => onSelect(iso)}
              aria-pressed={isSelected}
              data-testid={`${testId}-day-${day}`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
