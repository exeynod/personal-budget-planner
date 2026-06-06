// Phase 26-04 Task 4: PlanMount — data fetcher + state management + PATCH glue.
//
// Lifecycle:
//   1. On mount, parallel fetch:
//        - listCategoriesV10 (categories with v1.0 plan_cents/rollover/paused)
//        - getCurrentPeriod  (for actuals dependency)
//        - listSubscriptionsV10 (regulars block)
//        - getMeV10          (User.income_cents — surplus denominator)
//      Then sequential listActualV10(period.id) when period exists.
//   2. Filter + sort categories (drop savings/paused; sort by ord ASC).
//   3. Initial draft `plans` from category.plan_cents (plansFromCategories).
//   4. Slider drag → applyPlanEdit (immutable local state).
//   5. Chip-pair → optimistic updateCategoryV10 PATCH.
//   6. Regular post/unpost → POST /subscriptions/:id/post(unpost) → reload.
//   7. Submit → patchPlanMonth(plans) → 200 toast + router.pop / 400 inline.
//
// Toast UX (T-26-04-02 mitigation): every post/unpost shows confirm; user can
// undo via inline button without leaving the screen.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Toast } from '../../componentsV10';
import { StatePlate, usePosterRouter } from '../common';
import {
  listCategoriesV10,
  listSubscriptionsV10,
  postSubscription,
  unpostSubscription,
  patchPlanMonth,
  listActualV10,
  updateCategoryV10,
  type ActualV10Read,
  type CategoryV10,
  type SubscriptionV10Read,
} from '../../api/v10';
import { getMeV10 } from '../../api/me';
import { getCurrentPeriod } from '../../api/periods';
import { ApiError } from '../../api/client';
import type { PlanMonthItem } from '../../api/types';
import { PlanView } from './PlanView';
import { NativePlanView } from './NativePlanView';
import { useShellVariant } from '../native/ShellVariant';
import {
  applyPlanEdit,
  computeIsOverflow,
  computeRegularsList,
  computeRolloverAggregates,
  computeSurplus,
  plansFromCategories,
} from './computePlan';

// ─────────── Props ───────────

export interface PlanMountProps {
  /** Optional category to scroll to (CategoryDetail «+ ПОДНЯТЬ ЛИМИТ» deep-link). */
  focusCategoryId?: number | null;
}

// ─────────── Component ───────────

export function PlanMount({ focusCategoryId = null }: PlanMountProps = {}) {
  const router = usePosterRouter();
  const variant = useShellVariant();

  const [income, setIncome] = useState<number>(0);
  const [categories, setCategories] = useState<CategoryV10[]>([]);
  const [actuals, setActuals] = useState<ActualV10Read[]>([]);
  const [subs, setSubs] = useState<SubscriptionV10Read[]>([]);
  const [plans, setPlans] = useState<PlanMonthItem[]>([]);
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
        const [cats, period, subsList, me] = await Promise.all([
          listCategoriesV10(),
          getCurrentPeriod(),
          listSubscriptionsV10(),
          getMeV10(),
        ]);
        if (cancelled) return;

        // Sort active non-savings categories by ord ASC for stable list order.
        const visible = cats
          .filter((c) => c.code !== 'savings' && c.paused !== true)
          .sort((a, b) => (a.ord ?? '99').localeCompare(b.ord ?? '99'));

        setCategories(visible);
        setSubs(subsList);
        setIncome(me.income_cents ?? 0);
        // Initial draft = current persisted plans for visible categories.
        setPlans(plansFromCategories(visible));

        if (period !== null) {
          const acts = await listActualV10(period.id);
          if (cancelled) return;
          setActuals(acts);
        } else {
          setActuals([]);
        }
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
  }, [reloadToken]);

  // ─────────── slider drag handler ───────────
  const handleSliderChange = useCallback((catId: number, cents: number) => {
    setPlans((prev) => applyPlanEdit(prev, catId, cents));
  }, []);

  // ─────────── chip-pair: PATCH /categories/:id ───────────
  const handleRolloverChip = useCallback(
    async (catId: number, next: 'misc' | 'savings') => {
      try {
        const updated = await updateCategoryV10(catId, { rollover: next });
        setCategories((prev) =>
          prev.map((c) => (c.id === catId ? updated : c)),
        );
      } catch {
        setToastMsg('Не удалось обновить «Остаток» — попробуйте снова');
      }
    },
    [],
  );

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

  // ─────────── derived view-model ───────────
  // Memoised so slider drags (which only bump `plans`) don't recompute the
  // regulars list (subs×categories) every render, and a parent re-render with
  // unchanged inputs is a no-op. Each useMemo is keyed on its exact inputs.
  const surplus = useMemo(() => computeSurplus(income, plans), [income, plans]);
  const isOverflow = useMemo(() => computeIsOverflow(surplus), [surplus]);
  const aggregates = useMemo(
    () => computeRolloverAggregates(categories, plans, actuals),
    [categories, plans, actuals],
  );
  const regulars = useMemo(
    () => computeRegularsList(subs, categories),
    [subs, categories],
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
    aggregates,
    surplusCents: surplus,
    isOverflow,
    submitting,
    saveError,
    focusCategoryId,
    onSliderChange: handleSliderChange,
    onRolloverChip: handleRolloverChip,
    onPostRegular: handlePostRegular,
    onUnpostRegular: handleUnpostRegular,
    onSubmit: handleSubmit,
    onBack: () => router.pop(),
  };

  return (
    <>
      {variant === 'native' ? (
        <NativePlanView {...viewProps} />
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
