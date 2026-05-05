import { useRef, useState } from 'react';
import { SubTabBar } from '../components/SubTabBar';
import { Fab } from '../components/Fab';
import { useCategories } from '../hooks/useCategories';
import { HistoryView, type HistoryViewHandle } from './HistoryView';
import { PlannedView, type PlannedViewHandle } from './PlannedView';
import styles from './TransactionsScreen.module.css';

type SubTab = 'history' | 'plan';
type KindFilter = 'all' | 'expense' | 'income';

const SUB_TABS = [
  { id: 'history' as SubTab, label: 'История' },
  { id: 'plan' as SubTab, label: 'План' },
];

export interface TransactionsScreenProps {
  categoryFilter?: number | null;
  onClearFilter?: () => void;
}

export function TransactionsScreen({ categoryFilter, onClearFilter }: TransactionsScreenProps) {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('history');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const { categories } = useCategories(false);
  const historyRef = useRef<HistoryViewHandle>(null);
  const plannedRef = useRef<PlannedViewHandle>(null);

  const handleFab = () => {
    if (activeSubTab === 'history') {
      historyRef.current?.openCreateSheet();
    } else {
      plannedRef.current?.openCreateSheet();
    }
  };

  const handleSubTabChange = (tab: SubTab) => {
    setActiveSubTab(tab);
    setKindFilter('all');
  };

  return (
    <div className={styles.root}>
      <SubTabBar active={activeSubTab} onChange={handleSubTabChange} tabs={SUB_TABS} />

      {/* Filter chips */}
      <div className={styles.chips}>
        {(['all', 'expense', 'income'] as KindFilter[]).map((f) => (
          <button
            key={f}
            type="button"
            className={[styles.chip, kindFilter === f ? styles.chipActive : ''].filter(Boolean).join(' ')}
            onClick={() => setKindFilter(f)}
          >
            {f === 'all' ? 'Все' : f === 'expense' ? 'Расходы' : 'Доходы'}
          </button>
        ))}
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            className={styles.chip}
            onClick={() => {/* категориальная фильтрация — Phase 7 discretion */}}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Screens */}
      {activeSubTab === 'history' && (
        <HistoryView
          ref={historyRef}
          inTransactions
          categoryFilter={categoryFilter}
          onClearFilter={onClearFilter}
          activeKindFilter={kindFilter}
        />
      )}
      {activeSubTab === 'plan' && (
        <PlannedView
          ref={plannedRef}
          inTransactions
        />
      )}

      <Fab
        onClick={handleFab}
        ariaLabel={activeSubTab === 'history' ? 'Добавить транзакцию' : 'Добавить строку плана'}
      />
    </div>
  );
}
