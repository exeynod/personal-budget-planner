import { useMemo, useRef, useState } from 'react';
import { SubTabBar } from '../components/SubTabBar';
import { Fab } from '../components/Fab';
import { useCategories } from '../hooks/useCategories';
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
}

export function TransactionsScreen({ categoryFilter, onClearFilter }: TransactionsScreenProps) {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('history');
  const [kindFilter, setKindFilter] = useState<CategoryKind>('expense');
  const [localCategoryFilter, setLocalCategoryFilter] = useState<number | null>(null);
  const { categories } = useCategories(false);
  const historyRef = useRef<HistoryViewHandle>(null);
  const plannedRef = useRef<PlannedViewHandle>(null);

  const visibleCategories = useMemo(
    () => categories.filter((c) => c.kind === kindFilter),
    [categories, kindFilter],
  );

  const effectiveCategoryFilter = categoryFilter ?? localCategoryFilter;

  const handleFab = () => {
    if (activeSubTab === 'history') {
      historyRef.current?.openCreateSheet();
    } else {
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
    <div className={styles.root}>
      <SubTabBar active={activeSubTab} onChange={handleSubTabChange} tabs={SUB_TABS} />
      <SubTabBar active={kindFilter} onChange={handleKindChange} tabs={KIND_TABS} />

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

      <Fab
        onClick={handleFab}
        ariaLabel={activeSubTab === 'history' ? 'Добавить транзакцию' : 'Добавить строку плана'}
      />
    </div>
  );
}
