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

import { useCallback, useState } from 'react';
import {
  listCategoriesV10,
  listPlanned,
  patchPlanMonth,
  type CategoryV10,
  type PlannedV11Read,
} from '../../api/v10';
import { ApiError } from '../../api/client';
import { getCurrentPeriod } from '../../api/periods';
import {
  StatePlate,
  usePosterRouter,
  useResource,
  useRefetchToken,
  useSelectedPeriodOptional,
} from '../common';
import { formatMoneyNative } from '../native/money';
import { useAddSheetHost } from '../native/AddSheetHost';
import { plansFromCategories } from './computePlan';
import { PlanCategoryDetailView } from './PlanCategoryDetailView';

/**
 * Bug fix (planning «Без плана»): PATCH /plan-month rejects with 400
 * `plan_overflow` when Σ expense limits exceeds the user's configured income.
 * The limit is then NOT saved, so the category silently reverts to «Без плана».
 * Parse the structured detail so the detail view can SURFACE the reason instead
 * of swallowing it — otherwise the owner sees no plan and no explanation.
 */
function parsePlanOverflow(err: unknown): string | null {
  if (!(err instanceof ApiError) || err.status !== 400) return null;
  try {
    const detail = JSON.parse(err.body)?.detail;
    if (detail?.error !== 'plan_overflow') return null;
    const income = formatMoneyNative(detail.income_cents ?? 0);
    const sum = formatMoneyNative(detail.sum_plan_cents ?? 0);
    return `Сумма лимитов (${sum} ₽) превышает доход (${income} ₽). Уменьшите лимит или увеличьте доход.`;
  } catch {
    return null;
  }
}

// ─────────────────── Props ───────────────────

export interface PlanCategoryDetailMountProps {
  categoryId: number;
}

// ─────────────────── State ───────────────────

interface DataPayload {
  category: CategoryV10;
  /** THIS category's planned rows for the viewed period (manual + subscription). */
  planned: PlannedV11Read[];
  /**
   * All visible (non-savings) categories — needed to build the FULL plan-month
   * batch for the inline limit commit (the server validates Σplan ≤ income over
   * the whole batch, so we resend every category's persisted limit + the edit).
   */
  allCategories: CategoryV10[];
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
  const { openAddSheet, openEditPlanned } = useAddSheetHost();

  // Resolve the period whose plan we're viewing: the shell's selected period
  // when available (newest-first), else the active period (mirrors PlanMount).
  const selectedPeriodId = sel?.selectedPeriodId ?? null;

  const fetchDetail = useCallback(
    async (isCancelled: () => boolean): Promise<DataPayload> => {
      // Resolve the period from the shell selection when present (no fetch);
      // otherwise fall back to getCurrentPeriod(). Kick off the categories fetch
      // CONCURRENTLY with that period resolution, then fetch planned once the
      // period id is known (planned is period-scoped, so it must wait).
      const shellPeriod =
        sel?.periods.find((p) => p.id === selectedPeriodId) ?? sel?.periods[0];
      const catsP = listCategoriesV10();
      const resolvedPeriod = shellPeriod ?? (await getCurrentPeriod());
      const pid = resolvedPeriod?.id ?? null;

      const [cats, planned] = await Promise.all([
        catsP,
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
      const allCategories = cats.filter((c) => c.code !== 'savings');
      if (isCancelled()) return { category: cat, planned: [], allCategories };
      return { category: cat, planned, allCategories };
    },
    [categoryId, sel, selectedPeriodId],
  );

  const { status, data, error, reload } = useResource<DataPayload>(
    fetchDetail,
    [categoryId, selectedPeriodId, refetchToken],
    { keepPreviousData: true },
  );

  // Surfaced when a limit commit is rejected (e.g. 400 plan_overflow) so the
  // owner sees WHY the limit reverted instead of an unexplained «Без плана».
  const [limitError, setLimitError] = useState<string | null>(null);

  const handleAddPlanned = useCallback(
    (catId: number) => {
      openAddSheet('plan', catId);
    },
    [openAddSheet],
  );

  // Edit/delete a manual planned row — opens the shared AddSheet in plan-edit
  // mode (PATCH /planned + «Удалить»). Recurring rows never reach here (the view
  // routes them to a read-only note instead). The view passes the row id; we
  // resolve the raw PlannedV11Read the controller needs to seed the sheet.
  const handleEditPlanned = useCallback(
    (plannedId: number) => {
      const row = (data?.planned ?? []).find((p) => p.id === plannedId);
      if (row) openEditPlanned(row);
    },
    [data, openEditPlanned],
  );

  // Inline EXPENSE limit commit (blur / Enter in the detail summary card). We
  // send the full EXPENSE plan-month batch — every expense category's persisted
  // limit with the edited one overridden — so the server-side Σplan ≤ income
  // check covers all expense categories (mirrors PlanMount's old onLimitCommit).
  // INCOME categories are deliberately EXCLUDED: income has no limit/plan-target,
  // so we never send an income plan_cents. On commit we reload the detail
  // (refetch the persisted limit + ladder). No-op when unchanged.
  const handleLimitCommit = useCallback(
    async (catId: number, cents: number) => {
      const expenseCats = (data?.allCategories ?? []).filter(
        (c) => c.kind !== 'income',
      );
      const persisted = expenseCats.find((c) => c.id === catId);
      if (!persisted) return; // income / unknown — never send a limit
      if ((persisted.plan_cents ?? 0) === cents) return; // no-op — unchanged
      const payload = plansFromCategories(expenseCats).map((p) =>
        p.category_id === catId ? { ...p, plan_cents: cents } : p,
      );
      try {
        await patchPlanMonth(payload);
        setLimitError(null);
      } catch (err) {
        // Surface a structured overflow («Σ лимитов превышает доход») so the
        // owner understands why the limit did not stick. Other errors fall back
        // to a generic message. Either way the reload below reverts the input.
        setLimitError(
          parsePlanOverflow(err) ??
            'Не удалось сохранить лимит. Попробуйте ещё раз.',
        );
      } finally {
        // Reload either way: on success to show the saved value, on failure to
        // revert the input to the persisted limit.
        reload();
      }
    },
    [data, reload],
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
      // EXPENSE only: income has no limit/plan-target, so it never gets the
      // commit handler (the view also guards on kind, belt-and-suspenders).
      onLimitCommit={
        data.category.kind === 'income' ? undefined : handleLimitCommit
      }
      limitError={limitError}
      onEditPlanned={handleEditPlanned}
      onBack={handleBack}
    />
  );
}
