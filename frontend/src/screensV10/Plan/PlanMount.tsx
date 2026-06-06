// Phase 26-04 Task 4: PlanMount — data fetcher + state management + PATCH glue.
//
// Lifecycle:
//   1. On mount, parallel fetch:
//        - listCategoriesV10 (categories with v1.0 plan_cents)
//        - listSubscriptionsV10 (regulars block)
//        - getMeV10          (User.income_cents — surplus denominator)
//   2. Filter + sort categories (drop savings; sort by ord ASC).
//   3. Initial draft `plans` from category.plan_cents (plansFromCategories).
//   4. Slider drag → applyPlanEdit (immutable local state).
//   5. Regular post/unpost → POST /subscriptions/:id/post(unpost) → reload.
//   6. Submit → patchPlanMonth(plans) → 200 toast + router.pop / 400 inline.
//
// Toast UX (T-26-04-02 mitigation): every post/unpost shows confirm; user can
// undo via inline button without leaving the screen.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Toast } from '../../componentsV10';
import {
  StatePlate,
  usePosterRouter,
  useSelectedPeriodOptional,
} from '../common';
import {
  listCategoriesV10,
  listSubscriptionsV10,
  postSubscription,
  unpostSubscription,
  patchPlanMonth,
  listPlanned,
  createPlanned,
  postPlanned,
  unpostPlanned,
  postPlannedBatch,
  type CategoryV10,
  type SubscriptionV10Read,
  type PlannedV11Read,
} from '../../api/v10';
import { getCurrentPeriod } from '../../api/periods';
import { getMeV10 } from '../../api/me';
import { ApiError } from '../../api/client';
import type { PlanMonthItem } from '../../api/types';
import { PlanView } from './PlanView';
import { NativePlanView, type AddPlannedDraft } from './NativePlanView';
import { useShellVariant } from '../native/ShellVariant';
import {
  applyPlanEdit,
  computeIsOverflow,
  computeRegularsList,
  computeSurplus,
  plansFromCategories,
} from './computePlan';
import {
  groupPlannedByCategory,
  computeLadder,
  bulkPostManualIds,
  bulkPostSubscriptionIds,
  type PlanDetailRow,
} from './computePlanDetail';

/** Today as ISO `YYYY-MM-DD` in local wall-clock (post fallback date). */
function todayIso(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// ─────────── Props ───────────

export interface PlanMountProps {
  /** Optional category to scroll to (CategoryDetail «+ ПОДНЯТЬ ЛИМИТ» deep-link). */
  focusCategoryId?: number | null;
}

// ─────────── Component ───────────

export function PlanMount({ focusCategoryId = null }: PlanMountProps = {}) {
  const router = usePosterRouter();
  const variant = useShellVariant();
  const sel = useSelectedPeriodOptional();

  const [income, setIncome] = useState<number>(0);
  const [categories, setCategories] = useState<CategoryV10[]>([]);
  const [subs, setSubs] = useState<SubscriptionV10Read[]>([]);
  const [plans, setPlans] = useState<PlanMonthItem[]>([]);
  const [periodId, setPeriodId] = useState<number | null>(null);
  const [planned, setPlanned] = useState<PlannedV11Read[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setLoadError(null);

    async function load() {
      try {
        // Resolve the period whose plan we're editing: the shell's selected
        // period when available (newest-first), else the active period.
        const resolvedPeriod =
          (sel?.periods.find((p) => p.id === sel.selectedPeriodId) ??
            sel?.periods[0]) ||
          (await getCurrentPeriod());
        const pid = resolvedPeriod?.id ?? null;

        const [cats, subsList, me, plannedList] = await Promise.all([
          listCategoriesV10(),
          listSubscriptionsV10(),
          getMeV10(),
          pid != null ? listPlanned(pid) : Promise.resolve([]),
        ]);
        if (cancelled) return;

        // Sort active non-savings categories by ord ASC for stable list order.
        const visible = cats
          .filter((c) => c.code !== 'savings')
          .sort((a, b) => (a.ord ?? '99').localeCompare(b.ord ?? '99'));

        setCategories(visible);
        setSubs(subsList);
        setIncome(me.income_cents ?? 0);
        setPeriodId(pid);
        setPlanned(plannedList);
        // Initial draft = current persisted plans for visible categories.
        setPlans(plansFromCategories(visible));
        setStatus('ready');
      } catch (e) {
        if (cancelled) return;
        setLoadError(
          e instanceof Error ? e.message : 'Не удалось загрузить план',
        );
        setStatus('error');
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [reloadToken, sel?.selectedPeriodId, sel]);

  // ─────────── slider drag handler ───────────
  const handleSliderChange = useCallback((catId: number, cents: number) => {
    setPlans((prev) => applyPlanEdit(prev, catId, cents));
  }, []);

  // ─────────── regulars post / unpost ───────────
  const handlePostRegular = useCallback(async (subId: number) => {
    try {
      await postSubscription(subId);
      setToastMsg('✓ ПРОВЕДЕНО · → реестр');
      // Reload to refresh subscription posted_txn_id state.
      setReloadToken((n) => n + 1);
    } catch {
      setToastMsg('Не удалось провести регулярный платёж');
    }
  }, []);

  const handleUnpostRegular = useCallback(async (subId: number) => {
    try {
      await unpostSubscription(subId);
      setToastMsg('Отменено');
      setReloadToken((n) => n + 1);
    } catch {
      setToastMsg('Не удалось отменить проводку');
    }
  }, []);

  // ─────────── submit: patchPlanMonth(plans) ───────────
  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setSaveError(null);
    try {
      await patchPlanMonth(plans);
      setToastMsg('✓ ПЛАН СОХРАНЁН');
      // Brief delay so toast is visible before pop.
      window.setTimeout(() => router.pop(), 600);
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) {
        setSaveError('Σplan превышает доход — уменьшите лимиты');
      } else {
        setSaveError(e instanceof Error ? e.message : 'Ошибка сохранения');
      }
    } finally {
      setSubmitting(false);
    }
  }, [plans, router]);

  // ─────────── detail surface handlers (v1.1) ───────────
  // Post a single detail row: subscription-derived rows post via their own
  // /subscriptions/{id}/post endpoint (planned post-route 400s on them); manual
  // rows post via /planned/{id}/post on their planned_date (fallback today).
  const handlePostDetail = useCallback(
    async (row: PlanDetailRow) => {
      try {
        if (row.subscriptionId != null) {
          await postSubscription(row.subscriptionId);
        } else if (periodId != null) {
          await postPlanned(periodId, row.id, row.plannedDate ?? todayIso());
        }
        setToastMsg('✓ ПРОВЕДЕНО · → реестр');
        setReloadToken((n) => n + 1);
      } catch {
        setToastMsg('Не удалось провести');
      }
    },
    [periodId],
  );

  const handleUnpostDetail = useCallback(
    async (row: PlanDetailRow) => {
      try {
        if (row.subscriptionId != null) {
          await unpostSubscription(row.subscriptionId);
        } else if (periodId != null) {
          await unpostPlanned(periodId, row.id);
        }
        setToastMsg('Отменено');
        setReloadToken((n) => n + 1);
      } catch {
        setToastMsg('Не удалось отменить проводку');
      }
    },
    [periodId],
  );

  const handleAddPlanned = useCallback(
    async (draft: AddPlannedDraft) => {
      if (periodId == null) return;
      try {
        await createPlanned(periodId, {
          category_id: draft.categoryId,
          kind: draft.kind,
          amount_cents: draft.amountCents,
          description: draft.title,
          planned_date: draft.plannedDate,
        });
        setToastMsg('✓ Запланировано');
        setReloadToken((n) => n + 1);
      } catch {
        setToastMsg('Не удалось добавить трату');
      }
    },
    [periodId],
  );

  // Bulk-post: manual rows via post-batch (each on its planned_date), then any
  // unposted subscription rows one-by-one via /subscriptions/{id}/post.
  const handlePostAllPlanned = useCallback(async () => {
    if (periodId == null) return;
    const manualIds = bulkPostManualIds(planned);
    const subIds = bulkPostSubscriptionIds(planned);
    if (manualIds.length === 0 && subIds.length === 0) return;
    try {
      if (manualIds.length > 0) {
        await postPlannedBatch(periodId, manualIds);
      }
      for (const sid of subIds) {
        await postSubscription(sid);
      }
      setToastMsg(`✓ Проведено ${manualIds.length + subIds.length} · → реестр`);
      setReloadToken((n) => n + 1);
    } catch {
      setToastMsg('Не удалось провести все');
    }
  }, [periodId, planned]);

  // ─────────── derived view-model ───────────
  // Memoised so slider drags (which only bump `plans`) don't recompute the
  // regulars list (subs×categories) every render, and a parent re-render with
  // unchanged inputs is a no-op. Each useMemo is keyed on its exact inputs.
  const surplus = useMemo(() => computeSurplus(income, plans), [income, plans]);
  const isOverflow = useMemo(() => computeIsOverflow(surplus), [surplus]);
  const regulars = useMemo(
    () => computeRegularsList(subs, categories),
    [subs, categories],
  );

  // Detail surface: group planned rows + per-category ladder using the live
  // draft limit (plans) so the «Свободно» figure tracks the edited limit.
  const detailByCat = useMemo(() => groupPlannedByCategory(planned), [planned]);
  const ladderByCat = useMemo(() => {
    const limitByCat = new Map(plans.map((p) => [p.category_id, p.plan_cents]));
    const out = new Map<number, ReturnType<typeof computeLadder>>();
    for (const c of categories) {
      const limit = limitByCat.get(c.id) ?? c.plan_cents ?? 0;
      out.set(c.id, computeLadder(limit, detailByCat.get(c.id) ?? []));
    }
    return out;
  }, [categories, plans, detailByCat]);
  const bulkDueCount = useMemo(
    () =>
      bulkPostManualIds(planned).length +
      bulkPostSubscriptionIds(planned).length,
    [planned],
  );

  if (status === 'loading') {
    return <StatePlate variant="loading" testId="plan-loading" />;
  }
  if (status === 'error') {
    return (
      <StatePlate
        variant="error"
        testId="plan-error"
        message={loadError ?? 'Ошибка'}
        onRetry={() => setReloadToken((n) => n + 1)}
        onBack={() => router.pop()}
      />
    );
  }

  const viewProps = {
    incomeCents: income,
    categories,
    plans,
    regulars,
    surplusCents: surplus,
    isOverflow,
    submitting,
    saveError,
    focusCategoryId,
    onSliderChange: handleSliderChange,
    onPostRegular: handlePostRegular,
    onUnpostRegular: handleUnpostRegular,
    onSubmit: handleSubmit,
    onBack: () => router.pop(),
  };

  return (
    <>
      {variant === 'native' ? (
        <NativePlanView
          {...viewProps}
          detailByCat={detailByCat}
          ladderByCat={ladderByCat}
          bulkDueCount={bulkDueCount}
          onPostDetail={handlePostDetail}
          onUnpostDetail={handleUnpostDetail}
          onAddPlanned={handleAddPlanned}
          onPostAllPlanned={handlePostAllPlanned}
        />
      ) : (
        <PlanView {...viewProps} />
      )}
      <Toast
        message={toastMsg ?? ''}
        visible={toastMsg !== null}
        onDismiss={() => setToastMsg(null)}
      />
    </>
  );
}
