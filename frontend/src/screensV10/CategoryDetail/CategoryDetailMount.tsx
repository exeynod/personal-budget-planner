// Phase 26-02 Task 3: CategoryDetailMount — data fetcher + view glue.
//
// Lifecycle:
//   1. On mount, fetch categories + current period in parallel; resolve the
//      target category locally (cats.find(id)). Then fetch period actuals
//      sequentially once period.id is known.
//   2. Render <CategoryDetailView> wired to the shared Add-sheet host for
//      «Добавить транзакцию» (opens the sheet pre-selected to this category).
//   3. On any fetch error, render an error sub-view with a retry button.
//
// Mount layer is intentionally thin — all sort/filter/aggregate logic lives
// in pure functions in computeCategoryDetail.ts (unit-tested separately).
//
// Item 7: the detail CTA now opens the Add sheet (fact/expense for this
// category) instead of deep-linking into the Plan editor.

import { useCallback, useState } from 'react';
import {
  listCategoriesV10,
  listActualV10,
  listPlanned,
  type ActualV10Read,
  type CategoryV10,
} from '../../api/v10';
import { unpostedByCategory } from '../Home/computeHomeData';
import { getCurrentPeriod } from '../../api/periods';
import { NativeToast } from '../native/NativeToast';
import { StatePlate, usePosterRouter, useResource } from '../common';
import { useAddSheetHost } from '../native/AddSheetHost';
import { NativeCategoryDetailView } from './NativeCategoryDetailView';

// TODO P2 (period switching): this drill-down still pins to getCurrentPeriod().
// Scoping it to the viewed period is deferred (out of P2 scope).

// ─────────────────── Props ───────────────────

export interface CategoryDetailMountProps {
  categoryId: number;
}

// ─────────────────── State ───────────────────

interface DataPayload {
  category: CategoryV10;
  actuals: ActualV10Read[];
  /**
   * v1.1 plan↔fact ladder — Σ of UNPOSTED planned amount for THIS category
   * (manual + template, excludes posted + subscription_auto; anti-double-count).
   * Drives the «Расписано» ladder level on the native detail.
   */
  plannedUnpostedCents: number;
}

/**
 * Sentinel error message for the «category not found» branch (cross-tenant /
 * non-existent id, T-26-02-03). Thrown from the fetcher so useResource surfaces
 * it as a normal error plate — identical copy to the previous hand-rolled path.
 */
const NOT_FOUND_MESSAGE = 'Категория не найдена';

// ─────────────────── Component ───────────────────

export function CategoryDetailMount({ categoryId }: CategoryDetailMountProps) {
  const router = usePosterRouter();
  const { openAddSheet } = useAddSheetHost();
  // P2-11: mutation error surface (single toast slot, last error wins).
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const fetchCategory = useCallback(
    async (isCancelled: () => boolean): Promise<DataPayload> => {
      const [cats, period] = await Promise.all([
        listCategoriesV10(),
        getCurrentPeriod(),
      ]);
      const cat = cats.find((c) => c.id === categoryId);
      if (!cat) {
        // T-26-02-03 mitigation: cross-tenant / non-existent id stays
        // server-side (RLS); to client it just looks like «не найдена».
        throw new Error(NOT_FOUND_MESSAGE);
      }
      if (isCancelled())
        return { category: cat, actuals: [], plannedUnpostedCents: 0 };
      const acts: ActualV10Read[] = period
        ? await listActualV10(period.id)
        : [];
      // v1.1 ladder: this category's UNPOSTED planned amount. listPlanned is
      // cached per period (filtered client-side), so this adds no extra
      // round-trip once Home has loaded the same period's list.
      const planned = period ? await listPlanned(period.id, categoryId) : [];
      const plannedUnpostedCents =
        unpostedByCategory(planned).get(categoryId) ?? 0;
      return { category: cat, actuals: acts, plannedUnpostedCents };
    },
    [categoryId],
  );

  // keepPreviousData: a category switch (or post-mutation reload) keeps the
  // current detail on screen during the (usually cached, sub-second) refetch
  // instead of flashing the full-screen loading plate. Initial mount still
  // shows 'loading'.
  const { status, data, error, reload } = useResource<DataPayload>(
    fetchCategory,
    [categoryId],
    { keepPreviousData: true },
  );

  const handleAddTransaction = useCallback(
    (catId: number) => {
      // Item 7: open the shared Add sheet as a fact/expense add pre-selected to
      // this category (replaces the prior «Поднять лимит» Plan deep-link).
      openAddSheet('fact', catId);
    },
    [openAddSheet],
  );

  const handleBack = useCallback(() => {
    router.pop();
  }, [router]);

  // ─────────── render ───────────
  if (status === 'loading') {
    return <StatePlate variant="loading" testId="cat-detail-loading" />;
  }
  if (status === 'error' || data === null) {
    return (
      <StatePlate
        variant="error"
        testId="cat-detail-error"
        message={error ?? 'Не удалось загрузить категорию'}
        onRetry={reload}
        onBack={handleBack}
      />
    );
  }
  return (
    <>
      <NativeCategoryDetailView
        category={data.category}
        actuals={data.actuals}
        plannedUnpostedCents={data.plannedUnpostedCents}
        onAddTransaction={handleAddTransaction}
        onBack={handleBack}
      />
      <NativeToast
        message={toastMsg ?? ''}
        visible={toastMsg !== null}
        onDismiss={() => setToastMsg(null)}
        duration={4000}
      />
    </>
  );
}
