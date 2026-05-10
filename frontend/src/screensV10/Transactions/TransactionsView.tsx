// Phase 25-08: TransactionsView (cobalt) — pure presentational component covering
// TXN-V10-01..05.
//
// Renders mirror of prototype/poster-screens.jsx PosterTransactions (lines ~500-800):
//   - Cobalt absolute-fill background; ← НАЗАД top-left link (mono).
//   - Eyebrow row: «SECTION II» (left) + «{N} ЗАПИСЕЙ · {Σ ₽}» (right).
//   - Mass italic «Реестр.» size 88, paper colour.
//   - Filter chip-bar: 6 single-select chips with active highlight.
//   - Day-grouped list (props pre-grouped by HomeMount→groupByDay):
//       - Header: DM Serif italic dateLabel + mono day-sum on right.
//       - Row: time mono · description (+ optional spec-tag) · «cat · BANK MASK»
//              sub-line · amount (mono, U+2212 for negatives).
//       - Stagger via `.poster-row-in` + inline animationDelay.
//   - Spec-tags: kind=roundup → yellow «↻ ОКРУГЛ.»; kind=deposit → paper «→ КОПИЛКА».
//   - Row tap → onRowTap(tx); swipe-left → reveals red «УДАЛИТЬ» action (touch);
//     desktop right-click → custom context-menu overlay with «Удалить» / «Отмена».
//   - Empty state when dayGroups.length === 0.
//
// Phase 30-05 (DEBT-05): each row is now wrapped in a `.swipeContainer` —
// a horizontally-scrollable flex container with CSS scroll-snap, exposing
// a fixed 80px red action plate to the right of the row. Touch swipe-left
// snaps the action into view; tapping the action calls onRowDelete (no
// confirm — swipe is the intent gate, mirroring iOS swipeActions). Desktop
// users with no touch get the right-click context menu fallback.
//
// All click handlers are passed in as props — TransactionsView is router-agnostic.

import { useState, type CSSProperties } from 'react';
import { Chip, Eyebrow, Mass } from '../../componentsV10';
import { formatRubles } from '../Onboarding/format';
import { formatTimeHM } from '../common/format';
import {
  formatTxAmount,
  tagFor,
  type TxDayGroup,
  type TxFilterChip,
} from './computeTransactions';
import type {
  ActualV10Read,
  AccountResponse,
  CategoryV10,
} from '../../api/v10';
import styles from './TransactionsView.module.css';

// ─────────────────── Props ───────────────────

export interface TransactionsViewProps {
  /** Header eyebrow «{N} ЗАПИСЕЙ» (post-filter). */
  headerCount: number;
  /** Header eyebrow Σ |amount| in cents (post-filter). */
  headerSumCents: number;
  /** Currently-selected chip (single-select). */
  filterChip: TxFilterChip;
  /** Chip click handler (parent owns state). */
  onChipChange: (chip: TxFilterChip) => void;
  /** Pre-grouped day buckets (HomeMount calls applyFilterChip + groupByDay). */
  dayGroups: TxDayGroup[];
  /** All categories (used to resolve `cat.name` per row sub-line). */
  categories: CategoryV10[];
  /** All accounts (used to resolve account display text per row sub-line). */
  accounts: AccountResponse[];
  /** Row tap → opens edit sheet. */
  onRowTap: (tx: ActualV10Read) => void;
  /**
   * Row delete handler. Triggered by:
   *   - Touch: swipe-left → tap revealed «УДАЛИТЬ» action (no extra confirm —
   *     the swipe gesture is the intent gate, parity with iOS swipeActions).
   *   - Desktop: right-click → context-menu «Удалить».
   * Caller (Mount) is responsible for the actual DELETE API call + error toast.
   */
  onRowDelete: (tx: ActualV10Read) => void;
  /** Top-left ← НАЗАД button. */
  onBack: () => void;
}

// ─────────────────── Chip metadata ───────────────────

const CHIP_LIST: ReadonlyArray<{ id: TxFilterChip; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'cafe', label: 'Кафе' },
  { id: 'food', label: 'Продукты' },
  { id: 'transit', label: 'Транспорт' },
  { id: 'subs', label: 'Подписки' },
  { id: 'savings', label: 'Копилка' },
];

// ─────────────────── Component ───────────────────

export function TransactionsView(props: TransactionsViewProps) {
  const {
    headerCount,
    headerSumCents,
    filterChip,
    onChipChange,
    dayGroups,
    categories,
    accounts,
    onRowTap,
    onRowDelete,
    onBack,
  } = props;

  // Build O(1) lookups for per-row name / account formatting.
  const catById = new Map<number, CategoryV10>();
  for (const c of categories) catById.set(c.id, c);
  const accById = new Map<number, AccountResponse>();
  for (const a of accounts) accById.set(a.id, a);

  const hasRows = dayGroups.length > 0;

  return (
    <div className={styles.root}>
      {/* ─────────── back link ─────────── */}
      <div className={styles.headerRow}>
        <button
          type="button"
          className={styles.backLink}
          onClick={onBack}
        >
          ← НАЗАД
        </button>
      </div>

      {/* ─────────── eyebrow (top, standalone) ─────────── */}
      {/* Per prototype/poster-screens.jsx:331 — «SECTION II» sits ABOVE
       * the Mass headline on its own line; the count eyebrow lives BELOW
       * the headline (rendered after Mass). */}
      <div className={styles.eyebrowRow}>
        <Eyebrow color="var(--poster-paper)">SECTION II</Eyebrow>
      </div>

      {/* ─────────── headline ─────────── */}
      <Mass italic size={70} className={styles.headlineMass}>
        Реестр.
      </Mass>

      {/* ─────────── eyebrow count (below mass, dimmed) ─────────── */}
      <div className={styles.eyebrowCountRow}>
        <Eyebrow color="var(--poster-paper)" opacity={0.6}>
          {`${headerCount} ЗАПИСЕЙ · ${formatRubles(headerSumCents)} ₽`}
        </Eyebrow>
      </div>

      {/* ─────────── chip-bar ─────────── */}
      <div className={styles.chipBar} role="tablist" aria-label="Фильтр транзакций">
        {CHIP_LIST.map((chip) => (
          <Chip
            key={chip.id}
            active={filterChip === chip.id}
            onClick={() => onChipChange(chip.id)}
          >
            {chip.label}
          </Chip>
        ))}
      </div>

      {/* ─────────── empty state ─────────── */}
      {!hasRows && (
        <div className={styles.emptyWrap} data-testid="tx-empty-state">
          <div className={styles.emptyHeadline}>Реестр пуст —</div>
          <div className={styles.emptyHint}>добавьте первую трату через FAB</div>
        </div>
      )}

      {/* ─────────── day groups ─────────── */}
      {hasRows && dayGroups.map((group, dayGroupIdx) => (
        <div key={group.dateKey} className={styles.dayGroup}>
          <div className={styles.dayGroupHeader}>
            <div className={styles.dayLabel}>{group.dateLabel}</div>
            <div className={styles.daySum}>
              {`${formatRubles(group.sumCents)} ₽`}
            </div>
          </div>

          {group.rows.map((tx, rowIdx) => {
            const cat = catById.get(tx.category_id);
            const acc = tx.account_id != null ? accById.get(tx.account_id) : undefined;
            // Stagger animation delay; mirrors HomeView pattern.
            const rowDelay = `${(0.07 + dayGroupIdx * 0.07 + rowIdx * 0.045).toFixed(3)}s`;
            return (
              <TxRow
                key={tx.id}
                tx={tx}
                cat={cat}
                acc={acc}
                animationDelay={rowDelay}
                onRowTap={onRowTap}
                onRowDelete={onRowDelete}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─────────────────── TxRow (swipe-able row sub-component) ───────────────────
//
// Phase 30-05: each row owns a small piece of UI state (context-menu open
// position for desktop right-click). Touch swipe-left is handled purely by
// CSS scroll-snap on `.swipeContainer` — no JS required for the gesture.
// Tapping the revealed «УДАЛИТЬ» action fires `onRowDelete` immediately
// (swipe is the intent gate, parity with iOS swipeActions where users do
// NOT see an additional confirm dialog after a destructive swipe).

interface TxRowProps {
  tx: ActualV10Read;
  cat: CategoryV10 | undefined;
  acc: AccountResponse | undefined;
  animationDelay: string;
  onRowTap: (tx: ActualV10Read) => void;
  onRowDelete: (tx: ActualV10Read) => void;
}

function TxRow({ tx, cat, acc, animationDelay, onRowTap, onRowDelete }: TxRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const tag = tagFor(tx);
  const rowStyle: CSSProperties = { animationDelay };

  // Sub-line text: «{cat.name} · {BANK} {MASK}» — uppercase BANK + MASK
  // per CONTEXT 25-08 §truth (TXN-V10-04).
  const catName = cat?.name ?? '—';
  let accountTxt = '';
  if (acc) {
    const bank = (acc.bank ?? '').toUpperCase();
    const mask = acc.mask ? ` ${acc.mask}` : '';
    accountTxt = ` · ${bank}${mask}`;
  }
  const subLine = `${catName}${accountTxt}`;

  // Time mono: from created_at (parsed local).
  const time = formatTimeHM(new Date(tx.created_at));

  // Amount sign drives colour (positive = yellow per CONTEXT — earned, kept, or deposited).
  const amountStr = formatTxAmount(tx.amount_cents);
  const amountClass =
    tx.amount_cents > 0 ? styles.amountPositive : styles.amountNegative;

  // Desktop fallback: right-click anywhere on the row opens a small
  // overlay menu with «Удалить» / «Отмена». Touch users get the swipe
  // gesture instead. We close on backdrop click or after either choice.
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenuOpen(true);
  };

  const handleDeleteAction = (e: React.MouseEvent | React.KeyboardEvent) => {
    // Prevent the wrapping row's click handler from firing onRowTap.
    e.stopPropagation();
    setMenuOpen(false);
    onRowDelete(tx);
  };

  const handleMenuCancel = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
  };

  return (
    <div
      className={`${styles.swipeContainer} poster-row-in`}
      style={rowStyle}
      data-testid={`tx-swipe-${tx.id}`}
    >
      <div
        data-testid={`tx-row-${tx.id}`}
        className={styles.row}
        onClick={() => onRowTap(tx)}
        onContextMenu={handleContextMenu}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onRowTap(tx);
        }}
      >
        <div className={styles.rowTime}>{time}</div>
        <div className={styles.rowMid}>
          <div className={styles.rowDescriptionLine}>
            <span className={styles.rowDescription}>
              {tx.description ?? catName}
            </span>
            {tag === 'roundup' && (
              <span
                className={`${styles.tag} ${styles.tagRoundup}`}
                data-testid={`tx-tag-roundup-${tx.id}`}
              >
                ↻ ОКРУГЛ.
              </span>
            )}
            {tag === 'deposit' && (
              <span
                className={`${styles.tag} ${styles.tagDeposit}`}
                data-testid={`tx-tag-deposit-${tx.id}`}
              >
                → КОПИЛКА
              </span>
            )}
          </div>
          <div className={styles.rowSubLine}>{subLine}</div>
        </div>
        <div className={`${styles.rowAmount} ${amountClass}`}>{amountStr}</div>
      </div>

      {/* Swipe-revealed delete action — parity with iOS swipeActions trailing edge.
       *  Scroll-snap exposes this 80px plate when the user swipes left. */}
      <button
        type="button"
        className={styles.swipeAction}
        data-testid={`tx-swipe-action-${tx.id}`}
        onClick={handleDeleteAction}
      >
        УДАЛИТЬ
      </button>

      {/* Desktop right-click context-menu fallback. */}
      {menuOpen && (
        <div
          className={styles.contextMenuOverlay}
          data-testid={`tx-context-menu-${tx.id}`}
          onClick={handleMenuCancel}
          role="presentation"
        >
          <div
            className={styles.contextMenu}
            onClick={(e) => e.stopPropagation()}
            role="menu"
          >
            <button
              type="button"
              className={`${styles.contextMenuItem} ${styles.contextMenuItemDanger}`}
              onClick={handleDeleteAction}
              data-testid={`tx-context-menu-delete-${tx.id}`}
              role="menuitem"
            >
              Удалить
            </button>
            <button
              type="button"
              className={styles.contextMenuItem}
              onClick={handleMenuCancel}
              data-testid={`tx-context-menu-cancel-${tx.id}`}
              role="menuitem"
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
