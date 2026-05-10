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
//   - Row tap → onRowTap(tx); browser context-menu (right-click) → onRowDelete after confirm.
//   - Empty state when dayGroups.length === 0.
//
// All click handlers are passed in as props — TransactionsView is router-agnostic.

import type { CSSProperties } from 'react';
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
   * Row context-menu (right-click) → confirms then deletes.
   * View invokes `window.confirm(...)` then calls `onRowDelete(tx)` only on confirm.
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

      {/* ─────────── eyebrow row ─────────── */}
      <div className={styles.eyebrowRow}>
        <Eyebrow color="var(--poster-paper)">SECTION II</Eyebrow>
        <Eyebrow color="var(--poster-paper)">
          {`${headerCount} ЗАПИСЕЙ · ${formatRubles(headerSumCents)} ₽`}
        </Eyebrow>
      </div>

      {/* ─────────── headline ─────────── */}
      <Mass italic size={88} className={styles.headlineMass}>
        Реестр.
      </Mass>

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
            const tag = tagFor(tx);
            // Stagger animation delay; mirrors HomeView pattern.
            const rowDelay = `${(0.07 + dayGroupIdx * 0.07 + rowIdx * 0.045).toFixed(3)}s`;
            const rowStyle: CSSProperties = { animationDelay: rowDelay };

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

            return (
              <div
                key={tx.id}
                data-testid={`tx-row-${tx.id}`}
                className={`${styles.row} poster-row-in`}
                style={rowStyle}
                onClick={() => onRowTap(tx)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  // T-25-08-02 mitigation — confirm gate before delete fires.
                  if (typeof window !== 'undefined' && window.confirm('Удалить операцию?')) {
                    onRowDelete(tx);
                  }
                }}
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
                <div className={`${styles.rowAmount} ${amountClass}`}>
                  {amountStr}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
