// Liquid Glass v2 — native iOS Transactions view.
//
// Faithful port of the iOS MainShell Transactions screen
// (.planning/ios-native-screens/02-transactions.jpg):
//   - large title «Транзакции» + top-right circular FILTER button
//     (when rendered as the root tab); a back nav-bar when pushed from Home
//     «ВСЕ ОПЕРАЦИИ» (usePosterRouterOptional().canPop decides which)
//   - day-group SectionHeader with the day total on the right
//   - inset-grouped white card of rows: colored CategoryIcon (left) +
//     UPPERCASE category name (title) + sub-line (subtitle) + signed amount
//     «−385,18 ₽» (right)
//
// Pure presentational: consumes the SAME props the poster TransactionsView
// receives (TransactionsMount wires the data + handlers identically). No data
// logic is duplicated — day-grouping / filtering / summaries arrive pre-computed.
//
// Control fidelity (brief §Conventions «NO invented functionality»): the poster
// screen's ONLY filter control is the 6-option single-select chip bar
// (filterChip / onChipChange). The screenshot surfaces that as the circular
// filter button — here it opens a native action-sheet-style picker driving the
// exact same `onChipChange`. We do NOT add the screenshot's «История | План» or
// «Расходы | Доходы» segments, since the poster has no such data path and a
// dead/non-functional control is explicitly forbidden.

import { memo, useState } from 'react';
import { FunnelSimple, Check } from '@phosphor-icons/react';
import {
  NativeLargeTitle,
  NativeNavBar,
  SectionHeader,
  InsetGroup,
  InsetRow,
  CircleButton,
} from '../native/NativePrimitives';
import { CategoryIcon } from '../native/CategoryIcon';
import { formatMoneyNative, formatMoneyRubNative } from '../native/money';
import { NativePeriodSwitcher } from '../native/NativePeriodSwitcher';
import { useNavLevel } from '../native/NavLevel';
import type { PeriodRead } from '../../api/types';
import type {
  ActualV10Read,
  AccountResponse,
  CategoryV10,
} from '../../api/v10';
import {
  tagFor,
  type TxDayGroup,
  type TxFilterChip,
} from './computeTransactions';
import styles from './NativeTransactionsView.module.css';

// ─────────────────── Props (mirror poster TransactionsView) ───────────────────

export interface NativeTransactionsViewProps {
  headerCount: number;
  headerSumCents: number;
  filterChip: TxFilterChip;
  onChipChange: (chip: TxFilterChip) => void;
  dayGroups: TxDayGroup[];
  categories: CategoryV10[];
  accounts: AccountResponse[];
  onRowTap: (tx: ActualV10Read) => void;
  onRowDelete: (tx: ActualV10Read) => void;
  onBack: () => void;
  periods?: PeriodRead[];
  selectedPeriodId?: number | null;
  onSelectPeriod?: (id: number) => void;
}

// ─────────────────── Filter metadata (same 6 poster chips) ───────────────────

const FILTER_LIST: ReadonlyArray<{ id: TxFilterChip; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'cafe', label: 'Кафе' },
  { id: 'food', label: 'Продукты' },
  { id: 'transit', label: 'Транспорт' },
  { id: 'subs', label: 'Подписки' },
  { id: 'savings', label: 'Копилка' },
];

function labelFor(chip: TxFilterChip): string {
  return FILTER_LIST.find((f) => f.id === chip)?.label ?? 'Все';
}

// ─────────────────── Component ───────────────────

function NativeTransactionsViewInner(props: NativeTransactionsViewProps) {
  const {
    headerCount,
    headerSumCents,
    filterChip,
    onChipChange,
    dayGroups,
    categories,
    accounts,
    onRowTap,
    onBack,
    periods,
    selectedPeriodId,
    onSelectPeriod,
  } = props;

  // Tab-root (large title, no back) vs pushed-from-Home «ВСЕ ОПЕРАЦИИ» (back
  // chevron). The shell marks tab destinations via NavLevelProvider isRoot.
  const { isRoot } = useNavLevel();
  const showBack = !isRoot;

  const [filterOpen, setFilterOpen] = useState(false);

  // O(1) lookups for per-row category / account formatting (mirrors poster).
  const catById = new Map<number, CategoryV10>();
  for (const c of categories) catById.set(c.id, c);
  const accById = new Map<number, AccountResponse>();
  for (const a of accounts) accById.set(a.id, a);

  // Phase P2: render the switcher only when there is something to switch to.
  const showSwitcher =
    !!periods &&
    periods.length >= 2 &&
    selectedPeriodId != null &&
    !!onSelectPeriod;

  const hasRows = dayGroups.length > 0;
  const filterActive = filterChip !== 'all';

  const filterButton = (
    <CircleButton
      onClick={() => setFilterOpen(true)}
      ariaLabel="Фильтр транзакций"
      testId="native-tx-filter"
    >
      <FunnelSimple size={18} weight={filterActive ? 'fill' : 'regular'} />
    </CircleButton>
  );

  return (
    <div className={styles.root}>
      {/* Header: pushed → back nav-bar; tab root → large title + filter. */}
      {showBack ? (
        <NativeNavBar
          title="Транзакции"
          onBack={onBack}
          trailing={filterButton}
        />
      ) : (
        <NativeLargeTitle title="Транзакции" trailing={filterButton} />
      )}

      {showSwitcher && (
        <div className={styles.switcherRow}>
          <NativePeriodSwitcher
            periods={periods!}
            selectedId={selectedPeriodId!}
            onSelect={onSelectPeriod!}
          />
        </div>
      )}

      {/* Active-filter summary line — «{N} записей · {Σ ₽}», plus the current
       * filter label when narrowed. Mirrors the poster eyebrow data. */}
      <div className={styles.summaryRow} data-testid="native-tx-summary">
        <span className={styles.summaryFilter}>{labelFor(filterChip)}</span>
        <span className={styles.summaryMeta}>
          {`${headerCount} зап. · ${formatMoneyRubNative(headerSumCents)}`}
        </span>
      </div>

      {!hasRows ? (
        <div className={styles.empty} data-testid="native-tx-empty">
          {filterActive ? 'Нет операций по фильтру' : 'Операций пока нет'}
        </div>
      ) : (
        dayGroups.map((group) => (
          <div key={group.dateKey} className={styles.dayGroup}>
            <div className={styles.dayHeaderRow}>
              <SectionHeader>{group.dateLabel}</SectionHeader>
              <span className={styles.daySum}>
                {formatMoneyRubNative(group.sumCents)}
              </span>
            </div>

            <InsetGroup>
              {group.rows.map((tx) => {
                const cat = catById.get(tx.category_id);
                const acc =
                  tx.account_id != null
                    ? accById.get(tx.account_id)
                    : undefined;
                const catName = cat?.name ?? '—';

                // Sub-line: description, else «BANK MASK», else the spec-tag
                // word («Округление» / «Копилка»), else category name.
                let subtitle: string;
                if (tx.description) {
                  subtitle = tx.description;
                } else if (acc) {
                  const bank = acc.bank ?? '';
                  const mask = acc.mask ? ` ${acc.mask}` : '';
                  subtitle = `${bank}${mask}`.trim() || catName;
                } else {
                  const tag = tagFor(tx);
                  subtitle =
                    tag === 'roundup'
                      ? 'Округление'
                      : tag === 'deposit'
                        ? 'Копилка'
                        : catName;
                }

                // Sign is kind-driven (wire amount_cents is a positive
                // magnitude): income → «+ …» green, money-out (expense /
                // roundup / deposit) → «− …» neutral ink. Mirrors the iOS
                // native Transactions reference.
                const isIncome = tx.kind === 'income';
                const sign = isIncome ? '+' : '−';
                const amountStr = `${sign}${formatMoneyNative(
                  Math.abs(tx.amount_cents),
                )} ₽`;
                const amountClass = isIncome
                  ? styles.amountPositive
                  : styles.amountNegative;

                return (
                  <InsetRow
                    key={tx.id}
                    testId={`native-tx-row-${tx.id}`}
                    leading={<CategoryIcon name={catName} id={cat?.id} />}
                    title={<span className={styles.catName}>{catName}</span>}
                    subtitle={subtitle}
                    trailing={
                      <span className={`${styles.amount} ${amountClass}`}>
                        {amountStr}
                      </span>
                    }
                    onClick={() => onRowTap(tx)}
                  />
                );
              })}
            </InsetGroup>
          </div>
        ))
      )}

      {/* Native filter picker (action-sheet-style). Drives the SAME
       * onChipChange as the poster chip-bar — same control, same data. */}
      {filterOpen && (
        <div
          className={styles.sheetBackdrop}
          data-testid="native-tx-filter-sheet"
          onClick={() => setFilterOpen(false)}
          role="presentation"
        >
          <div
            className={styles.sheet}
            onClick={(e) => e.stopPropagation()}
            role="menu"
            aria-label="Фильтр транзакций"
          >
            <div className={styles.sheetTitle}>Фильтр</div>
            <div className={styles.sheetGroup}>
              {FILTER_LIST.map((f) => {
                const active = f.id === filterChip;
                return (
                  <button
                    key={f.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    className={styles.sheetItem}
                    data-testid={`native-tx-filter-${f.id}`}
                    onClick={() => {
                      onChipChange(f.id);
                      setFilterOpen(false);
                    }}
                  >
                    <span className={styles.sheetItemLabel}>{f.label}</span>
                    {active && (
                      <span className={styles.sheetCheck}>
                        <Check size={18} weight="bold" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className={styles.sheetCancel}
              onClick={() => setFilterOpen(false)}
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export const NativeTransactionsView = memo(NativeTransactionsViewInner);
