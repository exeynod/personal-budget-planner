import { useMemo, useRef, useState } from 'react';
import { AuroraBg } from '../components/AuroraBg';
import { SubTabBar } from '../components/SubTabBar';
import { Fab } from '../components/Fab';
import { useCategories } from '../hooks/useCategories';
import { useCurrentPeriod } from '../hooks/useCurrentPeriod';
import type { CategoryKind } from '../api/types';
import { HistoryView, type HistoryViewHandle } from './HistoryView';
import { PlannedView, type PlannedViewHandle } from './PlannedView';
import styles from './TransactionsScreen.module.css';

type SubTab = 'history' | 'plan';

const SUB_TABS = [
  { id: 'history' as SubTab, label: 'История' },
  { id: 'plan' as SubTab, label: 'План' },
];

const KIND_TABS = [
  { id: 'expense' as CategoryKind, label: 'Расходы' },
  { id: 'income' as CategoryKind, label: 'Доходы' },
];

export interface TransactionsScreenProps {
  categoryFilter?: number | null;
  onClearFilter?: () => void;
  /** Bump-counter из App.tsx (рост при создании транзакции через central FAB). */
  txMutationKey?: number;
}

function formatPeriodChip(periodStart: string | undefined): string {
  if (!periodStart) return '';
  const d = new Date(periodStart);
  const m = d.toLocaleDateString('ru-RU', { month: 'long' });
  return m.charAt(0).toLowerCase() + m.slice(1);
}

export function TransactionsScreen({ categoryFilter, onClearFilter, txMutationKey }: TransactionsScreenProps) {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('history');
  const [kindFilter, setKindFilter] = useState<CategoryKind>('expense');
  const [localCategoryFilter, setLocalCategoryFilter] = useState<number | null>(null);
  const { categories } = useCategories(false);
  const { period } = useCurrentPeriod();
  const historyRef = useRef<HistoryViewHandle>(null);
  const plannedRef = useRef<PlannedViewHandle>(null);

  const visibleCategories = useMemo(
    () => categories.filter((c) => c.kind === kindFilter),
    [categories, kindFilter],
  );

  const effectiveCategoryFilter = categoryFilter ?? localCategoryFilter;

  // FAB на этом экране показывается ТОЛЬКО на sub-tab=План — для создания
  // строки плана. На sub-tab=История пользователь использует central FAB
  // в bottom nav (app-level Add-Transaction sheet).
  const handleFab = () => {
    if (activeSubTab === 'plan') {
      plannedRef.current?.openCreateSheet();
    }
  };

  const handleSubTabChange = (tab: SubTab) => {
    setActiveSubTab(tab);
    setLocalCategoryFilter(null);
  };

  const handleKindChange = (kind: CategoryKind) => {
    setKindFilter(kind);
    setLocalCategoryFilter(null);
  };

  const handleChipClick = (catId: number) => {
    setLocalCategoryFilter((prev) => (prev === catId ? null : catId));
    if (categoryFilter != null) onClearFilter?.();
  };

  return (
    <div className={styles.wrap}>
      <AuroraBg />
      <div className={styles.scroll}>
        <div className={styles.titleRow}>
          <div className={styles.title}>Транзакции</div>
          {period && (
            <span className={styles.periodChip}>{formatPeriodChip(period.period_start)}</span>
          )}
        </div>

        <div className={styles.subTabBlock}>
          <SubTabBar
            active={activeSubTab}
            onChange={handleSubTabChange}
            tabs={SUB_TABS}
            variant="plain"
            tint="light"
          />
        </div>
        <div className={styles.subTabBlock}>
          <SubTabBar
            active={kindFilter}
            onChange={handleKindChange}
            tabs={KIND_TABS}
            variant="accent"
            tint="light"
          />
        </div>

        {visibleCategories.length > 0 && (
          <div className={styles.chips}>
            {visibleCategories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={[
                  styles.chip,
                  effectiveCategoryFilter === cat.id ? styles.chipActive : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => handleChipClick(cat.id)}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}

        {activeSubTab === 'history' && (
          <HistoryView
            ref={historyRef}
            inTransactions
            categoryFilter={effectiveCategoryFilter}
            onClearFilter={() => {
              setLocalCategoryFilter(null);
              onClearFilter?.();
            }}
            activeKindFilter={kindFilter}
            txMutationKey={txMutationKey}
          />
        )}
        {activeSubTab === 'plan' && (
          <PlannedView
            ref={plannedRef}
            inTransactions
            activeKind={kindFilter}
            categoryFilter={effectiveCategoryFilter}
          />
        )}
      </div>

      {activeSubTab === 'plan' && (
        <Fab onClick={handleFab} ariaLabel="Добавить строку плана" />
      )}
    </div>
  );
}
