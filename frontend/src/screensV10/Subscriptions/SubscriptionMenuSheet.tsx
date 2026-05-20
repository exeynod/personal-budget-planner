// Phase 26-06 Task 2: SubscriptionMenuSheet — bottom-sheet menu with secondary
// editor sheets stacked above (SUBS-V10-03..04).
//
// Behaviour:
//   - sub === null → returns null (no portal, no DOM nodes).
//   - Primary menu: 3 ghost buttons («ПАУЗА» when active / «ВКЛЮЧИТЬ» when
//     inactive, «СМЕНИТЬ ДЕНЬ», «ИЗМЕНИТЬ ЦЕНУ») + destructive «ОТМЕНИТЬ
//     ПОДПИСКУ» (red bg, paper text).
//   - Secondary editors stack via PosterSheet portal (primary closed when
//     editor open — single-sheet visible at a time keeps DOM simple).
//   - Day editor: <input type="number" min=1 max=28>, value clamped on input.
//   - Price editor: text input with digit-strip regex, rubles → cents on save;
//     aborts when computed cents <= 0 (T-26-06-03 mitigation).
//   - Confirm-delete editor: shows «Отменить подписку «{name}»?» + destructive
//     «УДАЛИТЬ» button + ghost «ОТМЕНА» (T-26-06-01 two-step gate).
//
// All async callbacks await before close; closeAll resets internal editor mode
// + invokes onClose so parent can clear menuSub state.

import { useState } from 'react';
import { PosterSheet } from '../common';
import { PosterButton } from '../../componentsV10';
import type { SubscriptionV10Read } from '../../api/v10';
import { parseRublesToKopecksOr0, sanitizeMoneyInput } from '../../utils/parseMoney';
import styles from './SubscriptionMenuSheet.module.css';

export interface SubscriptionMenuSheetProps {
  /** Subscription whose menu to show; null = closed. */
  sub: SubscriptionV10Read | null;
  /** Called when user dismisses the menu (backdrop tap / Escape / drag-down). */
  onClose: () => void;
  /** Toggle is_active (callback is async; sheet awaits before closing). */
  onTogglePause: (sub: SubscriptionV10Read) => Promise<void>;
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

  const handlePauseClick = async () => {
    await props.onTogglePause(sub);
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

  return (
    <>
      {/* ─────────── primary menu ─────────── */}
      <PosterSheet
        isOpen={editor === 'none'}
        onClose={closeAll}
        backgroundColor="var(--poster-paper)"
        testId="sub-menu-sheet"
      >
        <div className={styles.menuRoot}>
          <div className={styles.subTitle}>{sub.name.toUpperCase()}</div>
          <div className={styles.menuActions}>
            <PosterButton variant="ghost" onClick={handlePauseClick}>
              {sub.is_active ? 'ПАУЗА' : 'ВКЛЮЧИТЬ'}
            </PosterButton>
            <PosterButton variant="ghost" onClick={openDay}>
              СМЕНИТЬ ДЕНЬ
            </PosterButton>
            <PosterButton variant="ghost" onClick={openPrice}>
              ИЗМЕНИТЬ ЦЕНУ
            </PosterButton>
            <button
              type="button"
              className={styles.destructive}
              onClick={() => setEditor('confirmDelete')}
              data-testid="sub-delete-trigger"
            >
              ОТМЕНИТЬ ПОДПИСКУ
            </button>
          </div>
        </div>
      </PosterSheet>

      {/* ─────────── day editor ─────────── */}
      <PosterSheet
        isOpen={editor === 'day'}
        onClose={() => setEditor('none')}
        backgroundColor="var(--poster-paper)"
        testId="sub-day-editor"
      >
        <div className={styles.editorRoot}>
          <div className={styles.editorTitle}>СМЕНИТЬ ДЕНЬ</div>
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
            <PosterButton variant="ghost" onClick={() => setEditor('none')}>
              ОТМЕНА
            </PosterButton>
            <PosterButton variant="primary" onClick={handleSaveDay}>
              СОХРАНИТЬ
            </PosterButton>
          </div>
        </div>
      </PosterSheet>

      {/* ─────────── price editor ─────────── */}
      <PosterSheet
        isOpen={editor === 'price'}
        onClose={() => setEditor('none')}
        backgroundColor="var(--poster-paper)"
        testId="sub-price-editor"
      >
        <div className={styles.editorRoot}>
          <div className={styles.editorTitle}>ИЗМЕНИТЬ ЦЕНУ</div>
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
            <PosterButton variant="ghost" onClick={() => setEditor('none')}>
              ОТМЕНА
            </PosterButton>
            <PosterButton variant="primary" onClick={handleSavePrice}>
              СОХРАНИТЬ
            </PosterButton>
          </div>
        </div>
      </PosterSheet>

      {/* ─────────── confirm delete ─────────── */}
      <PosterSheet
        isOpen={editor === 'confirmDelete'}
        onClose={() => setEditor('none')}
        backgroundColor="var(--poster-paper)"
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
            <PosterButton variant="ghost" onClick={() => setEditor('none')}>
              ОТМЕНА
            </PosterButton>
            <button
              type="button"
              className={styles.destructive}
              onClick={handleConfirmDelete}
              data-testid="sub-delete-confirm-btn"
            >
              УДАЛИТЬ
            </button>
          </div>
        </div>
      </PosterSheet>
    </>
  );
}
