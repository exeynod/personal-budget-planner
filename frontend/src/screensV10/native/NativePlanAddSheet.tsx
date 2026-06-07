// Liquid Glass v2 — native iOS «+» add-sheet for Plan + Template.
//
// Design-review §P0-5 / §2.2 / §2.3: the inline add-form (Название / ₽ / дата /
// Добавить) in Plan and Template read as a «непонятный дроп-даун». This replaces
// it with a bottom-sheet built from the SAME ingredients as NativeAddSheet — the
// large amount display + native keypad (reusing computeAddSheet reducers), a
// description field, and a native date control:
//   - Plan      → NativeDatePicker (planned_date, ISO, «без даты» allowed)
//   - Template  → day-of-period stepper (1..31, optional)
//
// Owned state lives here; the parent passes a fixed category (id + name + kind)
// and a single onSubmit callback. The created row POSTs through the existing
// Mount handlers (createPlanned / createTemplateLine) — no new data path.

import { useState } from 'react';
import { Backspace, Minus, Plus, Tag } from '@phosphor-icons/react';
import {
  appendDigit,
  appendDot,
  backspace,
  parseAmountToCents,
} from '../AddSheet/computeAddSheet';
import { CategoryIcon } from './CategoryIcon';
import { NativeDatePicker } from './NativeDatePicker';
import { formatMoneyNative } from './money';
import styles from './NativePlanAddSheet.module.css';

export interface PlanAddResult {
  title: string;
  amountCents: number;
  /** Plan mode: ISO `YYYY-MM-DD` or null. */
  plannedDate?: string | null;
  /** Template mode: 1..31 or null. */
  dayOfPeriod?: number | null;
}

export interface NativePlanAddSheetProps {
  /** «date» → planned_date picker (Plan); «day» → day-of-period stepper (Template). */
  dateMode: 'date' | 'day';
  /** Fixed target category (the «+» lives inside its disclosure). */
  categoryId: number;
  categoryName: string;
  /** Sheet title (e.g. «Запланировать трату» / «Новая строка»). */
  title: string;
  onSubmit: (result: PlanAddResult) => void;
  onClose: () => void;
}

const KEYS: ReadonlyArray<string> = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '.',
  '0',
  'back',
];

/** Render the in-progress amount string as «1 234,5» (mirror NativeAddSheet). */
function renderAmount(amountString: string): { main: string; muted: boolean } {
  if (amountString === '') return { main: '0', muted: true };
  const dotIdx = amountString.indexOf('.');
  if (dotIdx === -1) {
    const intVal = parseInt(amountString, 10);
    return { main: formatMoneyNative(intVal * 100), muted: false };
  }
  const intPart = amountString.slice(0, dotIdx) || '0';
  const decPart = amountString.slice(dotIdx + 1);
  const grouped = formatMoneyNative(parseInt(intPart, 10) * 100);
  return { main: `${grouped},${decPart}`, muted: false };
}

export function NativePlanAddSheet({
  dateMode,
  categoryId,
  categoryName,
  title,
  onSubmit,
  onClose,
}: NativePlanAddSheetProps) {
  const [amountString, setAmountString] = useState('');
  const [description, setDescription] = useState('');
  // Plan: ISO date (null = без даты). Template: day-of-period 1..31 (0 = none).
  const [plannedDate, setPlannedDate] = useState<string | null>(null);
  const [day, setDay] = useState<number>(0);

  let amountCents = 0;
  try {
    amountCents = parseAmountToCents(amountString);
  } catch {
    amountCents = 0;
  }

  const amount = renderAmount(amountString);
  const ready = description.trim() !== '' && amountCents > 0;

  const onAppendDigit = (d: string) =>
    setAmountString((cur) => appendDigit(cur, d));
  const onAppendDot = () => setAmountString((cur) => appendDot(cur));
  const onBackspace = () => setAmountString((cur) => backspace(cur));

  const handleSubmit = () => {
    if (!ready) return;
    onSubmit({
      title: description.trim(),
      amountCents,
      plannedDate: dateMode === 'date' ? plannedDate : undefined,
      dayOfPeriod: dateMode === 'day' ? (day > 0 ? day : null) : undefined,
    });
  };

  return (
    <div className={styles.sheet} data-testid="native-plan-add-sheet">
      {/* ── Header ── */}
      <div className={styles.header}>
        <button
          type="button"
          className={styles.cancelBtn}
          onClick={onClose}
          data-testid="native-plan-add-cancel"
        >
          Отмена
        </button>
        <span className={styles.headerTitle}>{title}</span>
        <span className={styles.headerSpacer} aria-hidden="true" />
      </div>

      {/* ── Amount ── */}
      <div
        className={styles.amountBlock}
        data-testid="native-plan-add-amount-display"
      >
        <span
          className={`${styles.amountValue} ${
            amount.muted ? styles.amountMuted : ''
          }`}
        >
          {amount.main}
        </span>
        <span className={styles.amountCurrency}>₽</span>
      </div>

      {/* ── Description ── */}
      <div className={styles.fieldGroup}>
        <input
          type="text"
          className={styles.descInput}
          placeholder="Название"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          aria-label="Название"
          data-testid="native-plan-add-title"
        />
      </div>

      {/* ── Category (fixed) ── */}
      <div className={styles.fieldGroup}>
        <div className={styles.catRow} data-testid="native-plan-add-category">
          <CategoryIcon name={categoryName} id={categoryId} />
          <span className={styles.catName}>{categoryName}</span>
          <span className={styles.catTag} aria-hidden="true">
            <Tag size={15} weight="fill" />
          </span>
        </div>
      </div>

      {/* ── Date (Plan) / day-of-period (Template) ── */}
      <div className={styles.fieldGroup}>
        {dateMode === 'date' ? (
          <NativeDatePicker
            value={plannedDate}
            onChange={setPlannedDate}
            label="Дата"
            allowEmpty
            testId="native-plan-add-date"
          />
        ) : (
          <div className={styles.stepperRow} data-testid="native-plan-add-day">
            <span className={styles.stepperLabel}>День периода</span>
            <div className={styles.stepper}>
              <button
                type="button"
                className={styles.stepBtn}
                onClick={() => setDay((d) => Math.max(0, d - 1))}
                aria-label="Уменьшить день"
              >
                <Minus size={16} weight="bold" />
              </button>
              <span className={styles.stepValue}>{day === 0 ? '—' : day}</span>
              <button
                type="button"
                className={styles.stepBtn}
                onClick={() => setDay((d) => Math.min(31, d + 1))}
                aria-label="Увеличить день"
              >
                <Plus size={16} weight="bold" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Keypad ── */}
      <div
        className={styles.keypad}
        role="group"
        aria-label="Цифровая клавиатура"
      >
        {KEYS.map((k) => {
          if (k === 'back') {
            return (
              <button
                key="back"
                type="button"
                className={styles.key}
                onClick={onBackspace}
                aria-label="Удалить последнюю цифру"
              >
                <Backspace size={24} weight="regular" />
              </button>
            );
          }
          if (k === '.') {
            return (
              <button
                key="dot"
                type="button"
                className={styles.key}
                onClick={onAppendDot}
                aria-label="."
              >
                ,
              </button>
            );
          }
          return (
            <button
              key={k}
              type="button"
              className={styles.key}
              onClick={() => onAppendDigit(k)}
            >
              {k}
            </button>
          );
        })}
      </div>

      {/* ── CTA ── */}
      <button
        type="button"
        className={`${styles.cta} ${ready ? '' : styles.ctaDisabled}`}
        onClick={handleSubmit}
        disabled={!ready}
        data-testid="native-plan-add-submit"
      >
        {amountCents <= 0
          ? 'Введите сумму'
          : description.trim() === ''
            ? 'Введите название'
            : 'Добавить'}
      </button>
    </div>
  );
}
