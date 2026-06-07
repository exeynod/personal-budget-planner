// Liquid Glass v2 — native iOS date picker (ActionSheet + in-app calendar).
//
// Design-review §B (owner's 2nd complaint): «Своя дата» must NOT open the OS
// `<input type="date">` popup (foreign chrome, un-rounded, off-design). This
// control opens an ActionSheet (Сегодня / Вчера / Своя дата [/ Без даты]); the
// «Своя дата» row reveals an in-app NativeCalendar month-grid styled with
// `--lgn-*` tokens. No `<input type="date">`, no OS popup anywhere.
//
// Controlled value is an ISO `YYYY-MM-DD` string (or '' / null for «без даты»).
// The component owns only the ActionSheet open-state + which inline panel is
// expanded; the date value is owned by the parent.

import { useState } from 'react';
import { CalendarBlank, Check } from '@phosphor-icons/react';
import { MONTHS_RU_GENITIVE } from '../common';
import { NativeCalendar } from './NativeCalendar';
import styles from './NativeDatePicker.module.css';

export interface NativeDatePickerProps {
  /** Current ISO date `YYYY-MM-DD`, or null/'' for «без даты». */
  value: string | null;
  /** Emits the chosen ISO date, or null when «Без даты» is picked. */
  onChange: (iso: string | null) => void;
  /** Row label (default «Дата»). */
  label?: string;
  /** Show a «Без даты» option (planned rows may have no scheduled day). */
  allowEmpty?: boolean;
  min?: string;
  max?: string;
  testId?: string;
}

function todayIsoLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function yesterdayIsoLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** «9 мая» short date. */
function formatShortDate(iso: string): string {
  const parts = iso.split('-').map(Number);
  return `${parts[2]} ${MONTHS_RU_GENITIVE[parts[1] - 1]}`;
}

export function NativeDatePicker({
  value,
  onChange,
  label = 'Дата',
  allowEmpty = false,
  min,
  max,
  testId = 'native-date-picker',
}: NativeDatePickerProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  // Whether the inline month-grid calendar («Своя дата») is expanded.
  const [calendarOpen, setCalendarOpen] = useState(false);

  const today = todayIsoLocal();
  const yesterday = yesterdayIsoLocal();

  let displayValue: string;
  if (!value) displayValue = allowEmpty ? 'Без даты' : 'Своя дата';
  else if (value === today) displayValue = 'Сегодня';
  else if (value === yesterday) displayValue = 'Вчера';
  else displayValue = formatShortDate(value);

  const isMuted = !value;

  function closeSheet() {
    setSheetOpen(false);
    setCalendarOpen(false);
  }

  const hasCustomDate = !!value && value !== today && value !== yesterday;

  return (
    <>
      <button
        type="button"
        className={styles.triggerRow}
        onClick={() => {
          setCalendarOpen(hasCustomDate);
          setSheetOpen(true);
        }}
        data-testid={`${testId}-trigger`}
      >
        <span className={styles.tile} aria-hidden="true">
          <CalendarBlank size={17} weight="fill" color="#fff" />
        </span>
        <span className={styles.triggerLabel}>{label}</span>
        <span
          className={`${styles.triggerValue} ${isMuted ? styles.muted : ''}`}
        >
          {displayValue}
        </span>
        <span className={styles.chevron} aria-hidden="true">
          ›
        </span>
      </button>

      {sheetOpen && (
        <div
          className={styles.actionBackdrop}
          role="presentation"
          onClick={closeSheet}
          data-testid={`${testId}-sheet`}
        >
          <div
            className={styles.actionSheet}
            role="menu"
            aria-label={label}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.actionTitle}>{label}</div>
            <div className={styles.actionGroup}>
              <ActionItem
                label="Сегодня"
                sub={formatShortDate(today)}
                active={value === today}
                onClick={() => {
                  onChange(today);
                  closeSheet();
                }}
              />
              <ActionItem
                label="Вчера"
                sub={formatShortDate(yesterday)}
                active={value === yesterday}
                onClick={() => {
                  onChange(yesterday);
                  closeSheet();
                }}
              />
              <ActionItem
                label="Своя дата"
                sub={hasCustomDate ? formatShortDate(value!) : undefined}
                active={hasCustomDate || calendarOpen}
                onClick={() => setCalendarOpen((o) => !o)}
              />
              {/* In-app month-grid calendar — replaces the OS date popup. */}
              {calendarOpen && (
                <div className={styles.calendarPanel}>
                  <NativeCalendar
                    value={value}
                    min={min}
                    max={max}
                    onSelect={(iso) => {
                      onChange(iso);
                      closeSheet();
                    }}
                    testId={`${testId}-calendar`}
                  />
                </div>
              )}
              {allowEmpty && (
                <ActionItem
                  label="Без даты"
                  active={!value}
                  onClick={() => {
                    onChange(null);
                    closeSheet();
                  }}
                />
              )}
            </div>
            <button
              type="button"
              className={styles.actionCancel}
              onClick={closeSheet}
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function ActionItem({
  label,
  sub,
  active,
  onClick,
}: {
  label: string;
  sub?: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={active}
      className={styles.actionItem}
      onClick={onClick}
    >
      <span className={styles.actionItemMain}>
        <span className={styles.actionItemLabel}>{label}</span>
        {sub && <span className={styles.actionItemSub}>{sub}</span>}
      </span>
      {active && (
        <span className={styles.actionCheck}>
          <Check size={18} weight="bold" />
        </span>
      )}
    </button>
  );
}
