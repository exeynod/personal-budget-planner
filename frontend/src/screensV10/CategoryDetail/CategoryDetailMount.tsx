// Phase 26-02 Task 3: CategoryDetailMount — data fetcher + view glue.
//
// Lifecycle:
//   1. On mount, fetch categories + current period in parallel; resolve the
//      target category locally (cats.find(id)). Then fetch period actuals
//      sequentially once period.id is known.
//   2. Render <CategoryDetailView> wired to PATCH-backed toggle handlers
//      (rollover, paused) and a router-push handler for «+ ПОДНЯТЬ ЛИМИТ».
//   3. On any fetch error, render an error sub-view with a retry button.
//
// Mount layer is intentionally thin — all sort/filter/aggregate logic lives
// in pure functions in computeCategoryDetail.ts (unit-tested separately).
//
// Phase 26-04: «+ ПОДНЯТЬ ЛИМИТ» now pushes the real <PlanMount focusCategoryId>
// deep-link (Plan 26-04 retrofit; PLAN_FOCUS_TODO marker resolved).

import { useCallback, useState } from 'react';
import {
  listCategoriesV10,
  listActualV10,
  updateCategoryV10,
  type ActualV10Read,
  type CategoryV10,
} from '../../api/v10';
import { getCurrentPeriod } from '../../api/periods';
import { Toast } from '../../componentsV10';
import { StatePlate, usePosterRouter, useResource } from '../common';
// Phase 26-04: real Plan editor with focusCategoryId deep-link replaces the
// prior WIP PlanViewPlaceholder push.
import { PlanMount } from '../Plan';
import { CategoryDetailView } from './CategoryDetailView';
import { useShellVariant } from '../native/ShellVariant';
import { NativeCategoryDetailView } from './NativeCategoryDetailView';

// TODO P2 (period switching): this drill-down still pins to getCurrentPeriod().
// Scoping it to the viewed period is deferred — the view also exposes
// rollover/paused PATCH toggles against the LIVE category plan, which must not
// be applied while «viewing» a closed past period. Wiring useSelectedPeriod
// here needs a read-only mode for past periods first (out of P2 scope).

// ─────────────────── Props ───────────────────

export interface CategoryDetailMountProps {
  categoryId: number;
}

// ─────────────────── State ───────────────────

interface DataPayload {
  category: CategoryV10;
  actuals: ActualV10Read[];
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
  const variant = useShellVariant();
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
      if (isCancelled()) return { category: cat, actuals: [] };
      const acts: ActualV10Read[] = period
        ? await listActualV10(period.id)
        : [];
      return { category: cat, actuals: acts };
    },
    [categoryId],
  );

  const { status, data, error, reload, setData } = useResource<DataPayload>(
    fetchCategory,
    [categoryId],
  );

  // ─────────── PATCH-backed toggle handlers ───────────
  const handleToggleRollover = useCallback(async () => {
    if (data === null) return;
    const current = data.category;
    const next = (current.rollover ?? 'misc') === 'misc' ? 'savings' : 'misc';
    try {
      const updated = await updateCategoryV10(current.id, { rollover: next });
      setData((d) => (d ? { ...d, category: updated } : d));
    } catch {
      // T-26-02-04 mitigation (P2-11): surface via Toast instead of alert.
      setToastMsg('Не удалось обновить «Остаток» — попробуйте снова');
    }
  }, [data, setData]);

  const handleTogglePause = useCallback(async () => {
    if (data === null) return;
    const current = data.category;
    try {
      const updated = await updateCategoryV10(current.id, {
        paused: !(current.paused ?? false),
      });
      setData((d) => (d ? { ...d, category: updated } : d));
    } catch {
      setToastMsg('Не удалось переключить «Паузу» — попробуйте снова');
    }
  }, [data, setData]);

  const handlePushPlan = useCallback(
    (catId: number) => {
      // Phase 26-04: PLAN_FOCUS_TODO resolved — real PlanMount with deep-link
      // scroll to this category.
      router.push(<PlanMount focusCategoryId={catId} />);
    },
    [router],
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
  if (variant === 'native') {
    return (
      <>
        <NativeCategoryDetailView
          category={data.category}
          actuals={data.actuals}
          onPushPlan={handlePushPlan}
          onTogglePause={handleTogglePause}
          onToggleRollover={handleToggleRollover}
          onBack={handleBack}
        />
        <Toast
          message={toastMsg ?? ''}
          visible={toastMsg !== null}
          onDismiss={() => setToastMsg(null)}
          duration={4000}
        />
      </>
    );
  }

  return (
    <>
      <CategoryDetailView
        category={data.category}
        actuals={data.actuals}
        onPushPlan={handlePushPlan}
        onTogglePause={handleTogglePause}
        onToggleRollover={handleToggleRollover}
        onBack={handleBack}
      />
      <Toast
        message={toastMsg ?? ''}
        visible={toastMsg !== null}
        onDismiss={() => setToastMsg(null)}
        duration={4000}
      />
    </>
  );
}
