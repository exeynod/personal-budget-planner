// Liquid Glass v2 — native iOS date picker (ActionSheet + hidden input).
//
// Design-review §P0-4 / §3.7: the AddSheet already has the right pattern — a
// «Дата» inset row that opens an ActionSheet (Сегодня / Вчера / Своя дата),
// with the system calendar driven by a HIDDEN <input type="date"> opened
// programmatically (never the bare OS control). This extracts that pattern into
// a standalone, reusable control so Plan / Template add-flows stop rendering a
// raw `<input type="date">`.
//
// Controlled value is an ISO `YYYY-MM-DD` string (or '' / null for «без даты»).
// The component owns only the ActionSheet open-state; the date value is owned by
// the parent.

import { useRef, useState } from 'react';
import { CalendarBlank, Check } from '@phosphor-icons/react';
import { MONTHS_RU_GENITIVE } from '../common';
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
  const inputRef = useRef<HTMLInputElement | null>(null);

  const today = todayIsoLocal();
  const yesterday = yesterdayIsoLocal();

  let displayValue: string;
  if (!value) displayValue = allowEmpty ? 'Без даты' : 'Своя дата';
  else if (value === today) displayValue = 'Сегодня';
  else if (value === yesterday) displayValue = 'Вчера';
  else displayValue = formatShortDate(value);

  const isMuted = !value;

  function openSystemPicker() {
    const el = inputRef.current;
    if (!el) return;
    const anyEl = el as HTMLInputElement & { showPicker?: () => void };
    if (typeof anyEl.showPicker === 'function') {
      try {
        anyEl.showPicker();
      } catch {
        anyEl.click();
      }
    } else {
      anyEl.click();
    }
  }

  return (
    <>
      <button
        type="button"
        className={styles.triggerRow}
        onClick={() => setSheetOpen(true)}
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

      {/* Hidden native date input driven by «Своя дата». */}
      <input
        ref={inputRef}
        type="date"
        className={styles.hiddenInput}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        min={min}
        max={max}
        aria-hidden="true"
        tabIndex={-1}
        data-testid={`${testId}-input`}
      />

      {sheetOpen && (
        <div
          className={styles.actionBackdrop}
          role="presentation"
          onClick={() => setSheetOpen(false)}
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
                  setSheetOpen(false);
                }}
              />
              <ActionItem
                label="Вчера"
                sub={formatShortDate(yesterday)}
                active={value === yesterday}
                onClick={() => {
                  onChange(yesterday);
                  setSheetOpen(false);
                }}
              />
              <ActionItem
                label="Своя дата"
                sub={
                  value && value !== today && value !== yesterday
                    ? formatShortDate(value)
                    : undefined
                }
                active={!!value && value !== today && value !== yesterday}
                onClick={() => {
                  setSheetOpen(false);
                  openSystemPicker();
                }}
              />
              {allowEmpty && (
                <ActionItem
                  label="Без даты"
                  active={!value}
                  onClick={() => {
                    onChange(null);
                    setSheetOpen(false);
                  }}
                />
              )}
            </div>
            <button
              type="button"
              className={styles.actionCancel}
              onClick={() => setSheetOpen(false)}
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
