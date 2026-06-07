// SubscriptionMenuSheet — bottom-sheet menu with secondary editor sheets
// stacked above (SUBS-V10-03..04).
//
// Native (Liquid Glass v2) rebuild — P0-3 of DESIGN-REVIEW-2026-06-07 §2.9:
// the former Maximal Poster styling (cream --poster-paper background, Archivo
// Black uppercase title, EMPTY body, coral «ОТМЕНИТЬ ПОДПИСКУ» button) is
// replaced with a light native sheet:
//   - header = subscription name in sentence case (no uppercase / Archivo Black);
//   - a grouped-inset BODY showing the subscription's info (price, cadence,
//     charge day) — previously empty;
//   - actions as native list rows (Сменить день, Изменить цену);
//   - destructive «Отменить подписку» = red-tinted native button (not coral
//     PosterButton).
//
// Behaviour (unchanged):
//   - sub === null → returns null (no portal, no DOM nodes).
//   - Secondary editors stack via PosterSheet portal (primary closed when
//     editor open — single-sheet visible at a time keeps DOM simple).
//   - Day editor: <input type="number" min=1 max=28>, value clamped on input.
//   - Price editor: text input with digit-strip regex, rubles → cents on save;
//     aborts when computed cents <= 0 (T-26-06-03 mitigation).
//   - Confirm-delete editor: shows «Отменить подписку «{name}»?» + destructive
//     «Удалить» button + ghost «Отмена» (T-26-06-01 two-step gate).
//
// All async callbacks await before close; closeAll resets internal editor mode
// + invokes onClose so parent can clear menuSub state.

import { useState } from 'react';
import { PosterSheet } from '../common';
import type { SubscriptionV10Read } from '../../api/v10';
import {
  parseRublesToKopecksOr0,
  sanitizeMoneyInput,
} from '../../utils/parseMoney';
import { formatMoneyRubNative } from '../native/money';
import { formatCadenceRu } from './computeSubscriptions';
import styles from './SubscriptionMenuSheet.module.css';

// Light native sheet background — close to iOS systemGroupedBackground, so the
// grouped-inset cards read as white tiles on a soft grey field.
const SHEET_BG = 'var(--lgn-bg, #eef1f6)';

export interface SubscriptionMenuSheetProps {
  /** Subscription whose menu to show; null = closed. */
  sub: SubscriptionV10Read | null;
  /** Called when user dismisses the menu (backdrop tap / Escape / drag-down). */
  onClose: () => void;
  /** Update day_of_month (1..28). */
  onChangeDay: (sub: SubscriptionV10Read, newDay: number) => Promise<void>;
  /** Update amount_cents (positive cents). */
  onChangePrice: (
    sub: SubscriptionV10Read,
    newAmountCents: number,
  ) => Promise<void>;
  /** Hard-delete subscription. */
  onDelete: (sub: SubscriptionV10Read) => Promise<void>;
}

type EditorMode = 'none' | 'day' | 'price' | 'confirmDelete';

/** Clamp helper for the day input (1..28; mirrors backend Field(ge=1, le=28)). */
function clampDay(raw: number): number {
  if (Number.isNaN(raw)) return 1;
  return Math.max(1, Math.min(28, Math.floor(raw)));
}

export function SubscriptionMenuSheet(props: SubscriptionMenuSheetProps) {
  const [editor, setEditor] = useState<EditorMode>('none');
  const [dayValue, setDayValue] = useState<number>(1);
  const [priceRubles, setPriceRubles] = useState<string>('');

  const sub = props.sub;
  if (sub === null) return null;

  const closeAll = () => {
    setEditor('none');
    props.onClose();
  };

  const openDay = () => {
    setDayValue(sub.day_of_month ?? 1);
    setEditor('day');
  };
  const openPrice = () => {
    setPriceRubles(String(Math.floor(sub.amount_cents / 100)));
    setEditor('price');
  };

  const handleSaveDay = async () => {
    await props.onChangeDay(sub, clampDay(dayValue));
    closeAll();
  };

  const handleSavePrice = async () => {
    // P2-10: single money parser — keeps kopecks.
    const cents = parseRublesToKopecksOr0(priceRubles);
    if (cents <= 0) {
      // Defensive — input field strips non-digits but extra guard against
      // empty / zero submit (T-26-06-03 mitigation).
      return;
    }
    await props.onChangePrice(sub, cents);
    closeAll();
  };

  const handleConfirmDelete = async () => {
    await props.onDelete(sub);
    closeAll();
  };

  // ───── body info: only show fields we actually have ─────
  const dayLabel =
    sub.day_of_month != null ? `${sub.day_of_month} число` : null;

  return (
    <>
      {/* ─────────── primary menu ─────────── */}
      <PosterSheet
        isOpen={editor === 'none'}
        onClose={closeAll}
        backgroundColor={SHEET_BG}
        testId="sub-menu-sheet"
      >
        <div className={styles.menuRoot}>
          {/* Name — sentence case (no uppercase / Archivo Black). */}
          <div className={styles.subTitle}>{sub.name}</div>

          {/* BODY — subscription info (was empty in the poster version). */}
          <div className={styles.group} data-testid="sub-menu-info">
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Цена</span>
              <span className={styles.infoValue} data-testid="sub-info-price">
                {formatMoneyRubNative(sub.amount_cents)}
                {sub.cycle === 'monthly' ? ' / мес' : ' / год'}
              </span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Периодичность</span>
              <span className={styles.infoValue} data-testid="sub-info-cadence">
                {formatCadenceRu(sub)}
              </span>
            </div>
            {dayLabel != null && (
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>День списания</span>
                <span className={styles.infoValue} data-testid="sub-info-day">
                  {dayLabel}
                </span>
              </div>
            )}
            {!sub.is_active && (
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Статус</span>
                <span className={styles.infoValue}>на паузе</span>
              </div>
            )}
          </div>

          {/* ACTIONS — native list rows. */}
          <div className={styles.group}>
            <button
              type="button"
              className={styles.actionRow}
              onClick={openDay}
            >
              Сменить день
            </button>
            <button
              type="button"
              className={styles.actionRow}
              onClick={openPrice}
            >
              Изменить цену
            </button>
          </div>

          {/* DESTRUCTIVE — red-tinted native button (not coral poster). */}
          <button
            type="button"
            className={styles.destructive}
            onClick={() => setEditor('confirmDelete')}
            data-testid="sub-delete-trigger"
          >
            Отменить подписку
          </button>
        </div>
      </PosterSheet>

      {/* ─────────── day editor ─────────── */}
      <PosterSheet
        isOpen={editor === 'day'}
        onClose={() => setEditor('none')}
        backgroundColor={SHEET_BG}
        testId="sub-day-editor"
      >
        <div className={styles.editorRoot}>
          <div className={styles.editorTitle}>Сменить день</div>
          <input
            type="number"
            min={1}
            max={28}
            value={dayValue}
            onChange={(e) => {
              const raw = parseInt(e.target.value, 10);
              setDayValue(clampDay(raw));
            }}
            className={styles.numInput}
            data-testid="sub-day-input"
          />
          <div className={styles.editorHint}>число месяца (1..28)</div>
          <div className={styles.editorActions}>
            <button
              type="button"
              className={styles.btnGhost}
              onClick={() => setEditor('none')}
            >
              Отмена
            </button>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={handleSaveDay}
            >
              Сохранить
            </button>
          </div>
        </div>
      </PosterSheet>

      {/* ─────────── price editor ─────────── */}
      <PosterSheet
        isOpen={editor === 'price'}
        onClose={() => setEditor('none')}
        backgroundColor={SHEET_BG}
        testId="sub-price-editor"
      >
        <div className={styles.editorRoot}>
          <div className={styles.editorTitle}>Изменить цену</div>
          <input
            type="text"
            inputMode="decimal"
            value={priceRubles}
            onChange={(e) => setPriceRubles(sanitizeMoneyInput(e.target.value))}
            className={styles.numInput}
            data-testid="sub-price-input"
          />
          <div className={styles.editorHint}>в рублях</div>
          <div className={styles.editorActions}>
            <button
              type="button"
              className={styles.btnGhost}
              onClick={() => setEditor('none')}
            >
              Отмена
            </button>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={handleSavePrice}
            >
              Сохранить
            </button>
          </div>
        </div>
      </PosterSheet>

      {/* ─────────── confirm delete ─────────── */}
      <PosterSheet
        isOpen={editor === 'confirmDelete'}
        onClose={() => setEditor('none')}
        backgroundColor={SHEET_BG}
        testId="sub-delete-confirm"
      >
        <div className={styles.editorRoot}>
          <div className={styles.editorTitle}>
            {`Отменить подписку «${sub.name}»?`}
          </div>
          <div className={styles.editorHint}>
            Это действие удалит подписку безвозвратно.
          </div>
          <div className={styles.editorActions}>
            <button
              type="button"
              className={styles.btnGhost}
              onClick={() => setEditor('none')}
            >
              Отмена
            </button>
            <button
              type="button"
              className={styles.btnDestructive}
              onClick={handleConfirmDelete}
              data-testid="sub-delete-confirm-btn"
            >
              Удалить
            </button>
          </div>
        </div>
      </PosterSheet>
    </>
  );
}
