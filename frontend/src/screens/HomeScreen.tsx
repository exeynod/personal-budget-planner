import { useEffect, useMemo, useState } from 'react';
import { createActual } from '../api/actual';
import { applyTemplate } from '../api/planned';
import type { CategoryKind } from '../api/types';
import { ActualEditor } from '../components/ActualEditor';
import { AggrStrip } from '../components/AggrStrip';
import { BottomSheet } from '../components/BottomSheet';
import { DashboardCategoryRow } from '../components/DashboardCategoryRow';
import { Fab } from '../components/Fab';
import { HeroCard } from '../components/HeroCard';
import { MainButton } from '../components/MainButton';
import { PeriodSwitcher } from '../components/PeriodSwitcher';
import { useCategories } from '../hooks/useCategories';
import { useCurrentPeriod } from '../hooks/useCurrentPeriod';
import { useDashboard } from '../hooks/useDashboard';
import { usePeriods } from '../hooks/usePeriods';
import styles from './HomeScreen.module.css';

export interface HomeScreenProps {
  onNavigate: (
    screen: 'categories' | 'template' | 'planned' | 'actual' | 'settings' | 'subscriptions',
  ) => void;
}

/**
 * HomeScreen — Dashboard (Phase 5, DSH-01..06).
 *
 * Layout (top→bottom):
 *   HeroCard → PeriodSwitcher → TabBar (sticky) → AggrStrip
 *   → DashboardCategoryRow list  OR  EmptyState (DSH-04)
 *   → Fab (active current only)  OR  MainButton (closed read-only DSH-05)
 *   → BottomSheet (FAB-triggered ActualEditor)
 *
 * Period selection (DSH-06): selectedPeriodId starts null, syncs with
 * useCurrentPeriod once it loads. PeriodSwitcher mutates selectedPeriodId;
 * useDashboard re-fetches automatically.
 */
export function HomeScreen({ onNavigate }: HomeScreenProps) {
  const { period: currentPeriod, loading: curLoading } = useCurrentPeriod();
  const { periods } = usePeriods();
  const { categories } = useCategories(false);

  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<CategoryKind>('expense');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  // Sync selectedPeriodId to current period once it resolves.
  useEffect(() => {
    if (selectedPeriodId === null && currentPeriod) {
      setSelectedPeriodId(currentPeriod.id);
    }
  }, [currentPeriod, selectedPeriodId]);

  // Resolve selectedPeriod object (prefer periods list; fallback to currentPeriod).
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

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  };

  // Empty state: nothing planned at all (no template applied, no manual rows).
  const isEmpty =
    balance !== null &&
    balance.by_category.filter((r) => r.planned_cents > 0).length === 0;

  // Filtered + sorted rows for active tab.
  const visibleRows = useMemo(() => {
    if (!balance) return [];
    const rowsByCatId = new Map(
      balance.by_category
        .filter((r) => r.kind === activeTab)
        .map((r) => [r.category_id, r]),
    );
    const sorted = categories
      .filter((c) => c.kind === activeTab && rowsByCatId.has(c.id))
      .map((c) => rowsByCatId.get(c.id)!)
      .filter((r) => r !== undefined);
    // Append any orphan rows (category not in useCategories — shouldn't happen).
    const knownIds = new Set(sorted.map((r) => r.category_id));
    const orphans = balance.by_category
      .filter((r) => r.kind === activeTab && !knownIds.has(r.category_id));
    return [...sorted, ...orphans];
  }, [balance, categories, activeTab]);

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

  const handleAddManual = () => onNavigate('planned');

  const maxTxDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  })();

  const handleSaveActual = async (data: {
    kind: CategoryKind;
    category_id: number;
    amount_cents: number;
    description: string | null;
    tx_date: string;
  }) => {
    await createActual(data);
    setSheetOpen(false);
    showToast('Транзакция добавлена');
    await refetchDashboard();
  };

  // Loading / no period guard.
  if (curLoading) {
    return <div className={styles.muted}>Загрузка периода…</div>;
  }
  if (!currentPeriod) {
    return (
      <div className={styles.root}>
        <div className={styles.empty}>Сначала завершите onboarding.</div>
      </div>
    );
  }

  return (
    <div className={`${styles.root} ${isClosed ? styles.rootClosed : ''}`}>
      {selectedPeriod && balance && (
        <div className={styles.heroWrap}>
          <HeroCard balance={balance} period={selectedPeriod} isClosed={isClosed} />
        </div>
      )}

      {/* Quick nav bar — Subscriptions + Settings */}
      <div className={styles.quickNav}>
        <button
          type="button"
          className={styles.quickNavBtn}
          onClick={() => onNavigate('subscriptions')}
        >
          Подписки
        </button>
        <button
          type="button"
          className={styles.quickNavBtn}
          onClick={() => onNavigate('settings')}
        >
          Настройки
        </button>
      </div>

      {periods.length > 0 && selectedPeriodId !== null && (
        <PeriodSwitcher
          periods={periods}
          selectedId={selectedPeriodId}
          onSelect={setSelectedPeriodId}
        />
      )}

      <div className={styles.tabBar}>
        <button
          type="button"
          onClick={() => setActiveTab('expense')}
          className={
            activeTab === 'expense' ? styles.tabActive : styles.tabInactive
          }
        >
          Расходы
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('income')}
          className={
            activeTab === 'income' ? styles.tabActive : styles.tabInactive
          }
        >
          Доходы
        </button>
      </div>

      {balance && <AggrStrip balance={balance} kind={activeTab} />}

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
          {visibleRows.map((row) => (
            <DashboardCategoryRow key={row.category_id} row={row} />
          ))}
          {visibleRows.length === 0 && (
            <div className={styles.muted}>
              В этом периоде нет {activeTab === 'expense' ? 'расходов' : 'доходов'}.
            </div>
          )}
        </div>
      )}

      {toast && <div className={styles.toast}>{toast}</div>}

      {/* Active current period only — quick-add via FAB. */}
      {isActiveCurrent && !isClosed && (
        <Fab
          onClick={() => setSheetOpen(true)}
          ariaLabel="Добавить факт-трату"
        />
      )}

      {/* Closed period — disabled MainButton placeholder. */}
      {isClosed && (
        <MainButton
          text="Период закрыт"
          onClick={() => undefined}
          enabled={false}
        />
      )}

      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Новая транзакция"
      >
        <ActualEditor
          categories={categories}
          onSave={handleSaveActual}
          onCancel={() => setSheetOpen(false)}
          maxTxDate={maxTxDate}
        />
      </BottomSheet>
    </div>
  );
}
