import { useEffect, useMemo, useState } from 'react';
import { applyTemplate } from '../api/planned';
import type { CategoryKind } from '../api/types';
import { AuroraBg } from '../components/AuroraBg';
import { DashboardCategoryRow } from '../components/DashboardCategoryRow';
import { HeroCard } from '../components/HeroCard';
import { MainButton } from '../components/MainButton';
import { PeriodSwitcher } from '../components/PeriodSwitcher';
import { SubTabBar } from '../components/SubTabBar';
import { useCategories } from '../hooks/useCategories';
import { useCurrentPeriod } from '../hooks/useCurrentPeriod';
import { useDashboard } from '../hooks/useDashboard';
import { usePeriods } from '../hooks/usePeriods';
import styles from './HomeScreen.module.css';

type SubScreen = 'categories' | 'template' | 'planned' | 'settings';

export interface HomeScreenProps {
  onNavigateToSub: (screen: SubScreen) => void;
  onNavigateToHistory: (categoryId?: number) => void;
  /** Bump-counter из App.tsx — увеличивается при создании транзакции через
   *  central FAB. HomeScreen рефетчит дашборд при изменении. */
  txMutationKey?: number;
}

const KIND_TABS: { id: CategoryKind; label: string }[] = [
  { id: 'expense', label: 'Расходы' },
  { id: 'income', label: 'Доходы' },
];

export function HomeScreen({ onNavigateToSub, onNavigateToHistory, txMutationKey }: HomeScreenProps) {
  const { period: currentPeriod, loading: curLoading } = useCurrentPeriod();
  const { periods } = usePeriods();
  const { categories } = useCategories(false);

  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);
  const [activeKind, setActiveKind] = useState<CategoryKind>('expense');
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedPeriodId === null && currentPeriod) {
      setSelectedPeriodId(currentPeriod.id);
    }
  }, [currentPeriod, selectedPeriodId]);

  const selectedPeriod =
    periods.find((p) => p.id === selectedPeriodId) ?? currentPeriod;

  const isActiveCurrent =
    selectedPeriod !== null &&
    selectedPeriod !== undefined &&
    selectedPeriod.status === 'active' &&
    currentPeriod !== null &&
    selectedPeriod.id === currentPeriod.id;

  const isClosed = selectedPeriod?.status === 'closed';

  const {
    balance,
    loading: balLoading,
    error: balError,
    refetch: refetchDashboard,
  } = useDashboard(selectedPeriodId, isActiveCurrent);

  // Подписка на app-level «транзакция создана» — рефетчим дашборд.
  useEffect(() => {
    if (txMutationKey === undefined || txMutationKey === 0) return;
    void refetchDashboard();
    setToast('Транзакция добавлена');
    const t = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(t);
  }, [txMutationKey, refetchDashboard]);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  };

  const isEmpty =
    balance !== null &&
    balance.by_category.filter((r) => r.planned_cents > 0).length === 0;

  const visibleRows = useMemo(() => {
    if (!balance) return [];
    const rowsByCatId = new Map(
      balance.by_category
        .filter((r) => r.kind === activeKind)
        .map((r) => [r.category_id, r]),
    );
    const sorted = categories
      .filter((c) => c.kind === activeKind && rowsByCatId.has(c.id))
      .map((c) => rowsByCatId.get(c.id)!)
      .filter((r) => r !== undefined);
    const knownIds = new Set(sorted.map((r) => r.category_id));
    const orphans = balance.by_category
      .filter((r) => r.kind === activeKind && !knownIds.has(r.category_id));
    return [...sorted, ...orphans];
  }, [balance, categories, activeKind]);

  const handleApplyTemplate = async () => {
    if (!currentPeriod || busy) return;
    setBusy(true);
    setMutationError(null);
    try {
      const result = await applyTemplate(currentPeriod.id);
      if (result.created === 0 && result.planned.length === 0) {
        showToast('Шаблон пуст — нечего применять');
      } else if (result.created === 0) {
        showToast('Шаблон уже применён');
      } else {
        showToast('Шаблон применён');
      }
      await refetchDashboard();
    } catch (e) {
      setMutationError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleAddManual = () => onNavigateToSub('planned');

  if (curLoading) {
    return (
      <div className={styles.wrap}>
        <AuroraBg />
        <div className={styles.muted}>Загрузка периода…</div>
      </div>
    );
  }
  if (!currentPeriod) {
    return (
      <div className={styles.wrap}>
        <AuroraBg />
        <div className={styles.empty}>Сначала завершите onboarding.</div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <AuroraBg />
      <div className={`${styles.scroll} fade-bottom`}>
        {periods.length > 0 && selectedPeriodId !== null && (
          <PeriodSwitcher
            periods={periods}
            selectedId={selectedPeriodId}
            onSelect={setSelectedPeriodId}
          />
        )}

        {selectedPeriod && balance && (
          <HeroCard
            balance={balance}
            period={selectedPeriod}
            kind={activeKind}
            isClosed={isClosed}
          />
        )}

        <div className={styles.tabsRow}>
          <SubTabBar<CategoryKind>
            active={activeKind}
            onChange={setActiveKind}
            tabs={KIND_TABS}
            variant="accent"
            tint="light"
          />
        </div>

        {balLoading && <div className={styles.muted}>Загрузка дашборда…</div>}
        {balError && (
          <div className={styles.error}>
            Не удалось загрузить данные. Попробуй ещё раз.
          </div>
        )}
        {mutationError && <div className={styles.error}>Ошибка: {mutationError}</div>}

        {!balLoading && balance && isEmpty && (
          <div className={styles.emptyState}>
            <div className={styles.emptyHeading}>Бюджет не запланирован</div>
            <div className={styles.emptyBody}>
              Примени шаблон или добавь строки вручную
            </div>
            <button
              type="button"
              onClick={handleApplyTemplate}
              disabled={busy || !isActiveCurrent}
              className={styles.ctaPrimary}
            >
              {busy ? '…' : 'Применить шаблон'}
            </button>
            <button
              type="button"
              onClick={handleAddManual}
              disabled={busy || !isActiveCurrent}
              className={styles.ctaSecondary}
            >
              Добавить вручную
            </button>
          </div>
        )}

        {!balLoading && balance && !isEmpty && (
          <div className={styles.list}>
            {visibleRows.map((row, idx) => (
              <DashboardCategoryRow
                key={row.category_id}
                row={row}
                isFirst={idx === 0}
                onClick={() => onNavigateToHistory(row.category_id)}
              />
            ))}
            {visibleRows.length === 0 && (
              <div className={styles.muted}>
                В этом периоде нет {activeKind === 'expense' ? 'расходов' : 'доходов'}.
              </div>
            )}
          </div>
        )}

        {isClosed && (
          <MainButton
            text="Период закрыт"
            onClick={() => undefined}
            enabled={false}
          />
        )}
      </div>

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}
