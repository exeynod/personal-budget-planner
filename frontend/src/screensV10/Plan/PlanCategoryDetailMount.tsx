// PlanCategoryDetailMount — data fetcher + view glue for the plan-side
// per-category planned-transaction drill-down (pushed from NativePlanView).
//
// Lifecycle (mirrors CategoryDetailMount, plan side):
//   1. Resolve the viewed period (shell selection → first period → active),
//      then fetch categories + that period's planned rows in parallel; resolve
//      the target category locally (cats.find(id)).
//   2. Filter planned rows to this category (listPlanned's client-side filter).
//   3. Render <PlanCategoryDetailView> wired to the shared AddSheet (plan mode,
//      pre-selected category) and router.pop() back.
//   4. A successful AddSheet create bumps the refetch token → reload so the new
//      planned row + ladder appear immediately.

import { useCallback } from 'react';
import {
  listCategoriesV10,
  listPlanned,
  type CategoryV10,
  type PlannedV11Read,
} from '../../api/v10';
import { getCurrentPeriod } from '../../api/periods';
import {
  StatePlate,
  usePosterRouter,
  useResource,
  useRefetchToken,
  useSelectedPeriodOptional,
} from '../common';
import { useAddSheetHost } from '../native/AddSheetHost';
import { PlanCategoryDetailView } from './PlanCategoryDetailView';

// ─────────────────── Props ───────────────────

export interface PlanCategoryDetailMountProps {
  categoryId: number;
}

// ─────────────────── State ───────────────────

interface DataPayload {
  category: CategoryV10;
  /** THIS category's planned rows for the viewed period (manual + subscription). */
  planned: PlannedV11Read[];
}

/** Sentinel «category not found» message (cross-tenant / non-existent id). */
const NOT_FOUND_MESSAGE = 'Категория не найдена';

// ─────────────────── Component ───────────────────

export function PlanCategoryDetailMount({
  categoryId,
}: PlanCategoryDetailMountProps) {
  const router = usePosterRouter();
  const sel = useSelectedPeriodOptional();
  // A successful AddSheet (plan mode) create bumps this → reload the detail.
  const refetchToken = useRefetchToken();
  const { openAddSheet } = useAddSheetHost();

  // Resolve the period whose plan we're viewing: the shell's selected period
  // when available (newest-first), else the active period (mirrors PlanMount).
  const selectedPeriodId = sel?.selectedPeriodId ?? null;

  const fetchDetail = useCallback(
    async (isCancelled: () => boolean): Promise<DataPayload> => {
      const resolvedPeriod =
        (sel?.periods.find((p) => p.id === selectedPeriodId) ??
          sel?.periods[0]) ||
        (await getCurrentPeriod());
      const pid = resolvedPeriod?.id ?? null;

      const [cats, planned] = await Promise.all([
        listCategoriesV10(),
        pid != null
          ? listPlanned(pid, categoryId)
          : Promise.resolve<PlannedV11Read[]>([]),
      ]);
      const cat = cats.find((c) => c.id === categoryId);
      if (!cat) {
        // Cross-tenant / non-existent id stays server-side (RLS); to the client
        // it just looks like «не найдена».
        throw new Error(NOT_FOUND_MESSAGE);
      }
      if (isCancelled()) return { category: cat, planned: [] };
      return { category: cat, planned };
    },
    [categoryId, sel, selectedPeriodId],
  );

  const { status, data, error, reload } = useResource<DataPayload>(fetchDetail, [
    categoryId,
    selectedPeriodId,
    refetchToken,
  ]);

  const handleAddPlanned = useCallback(
    (catId: number) => {
      openAddSheet('plan', catId);
    },
    [openAddSheet],
  );

  const handleBack = useCallback(() => {
    router.pop();
  }, [router]);

  // ─────────── render ───────────
  if (status === 'loading') {
    return <StatePlate variant="loading" testId="plan-cat-detail-loading" />;
  }
  if (status === 'error' || data === null) {
    return (
      <StatePlate
        variant="error"
        testId="plan-cat-detail-error"
        message={error ?? 'Не удалось загрузить категорию'}
        onRetry={reload}
        onBack={handleBack}
      />
    );
  }
  return (
    <PlanCategoryDetailView
      category={data.category}
      planned={data.planned}
      onAddPlanned={handleAddPlanned}
      onBack={handleBack}
    />
  );
}
