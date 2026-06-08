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
import { NativeToast } from '../native/NativeToast';
import {
  StatePlate,
  usePosterRouter,
  useRefetchToken,
  useSelectedPeriodOptional,
} from '../common';
import {
  listCategoriesV10,
  listSubscriptionsV10,
  postSubscription,
  unpostSubscription,
  patchPlanMonth,
  listPlanned,
  postPlanned,
  unpostPlanned,
  type CategoryV10,
  type SubscriptionV10Read,
  type PlannedV11Read,
} from '../../api/v10';
import { getCurrentPeriod } from '../../api/periods';
import { getMeV10 } from '../../api/me';
import { ApiError } from '../../api/client';
import type { PlanMonthItem } from '../../api/types';
import { useAddSheetHost } from '../native/AddSheetHost';
import { NativePlanView } from './NativePlanView';
import { PlanCategoryDetailMount } from './PlanCategoryDetailMount';
import {
  applyPlanEdit,
  computeDistributeProgress,
  computeIsOverflow,
  computeRegularsList,
  computeSurplus,
  plansFromCategories,
  type RegularRow,
} from './computePlan';

/** Toast payload: message + tone (drives the NativeToast glyph/color). */
type ToastState = { text: string; tone: 'success' | 'error' } | null;

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
  const sel = useSelectedPeriodOptional();
  // Shared AddSheet (plan mode «+») — per-category plan add pre-selects the row.
  const { openAddSheet } = useAddSheetHost();
  // Shared AddSheet (plan mode «+») bumps this token on a successful create →
  // reload the plan so the new planned row + ladder appear immediately.
  const refetchToken = useRefetchToken();

  const [income, setIncome] = useState<number>(0);
  const [categories, setCategories] = useState<CategoryV10[]>([]);
  const [subs, setSubs] = useState<SubscriptionV10Read[]>([]);
  const [plans, setPlans] = useState<PlanMonthItem[]>([]);
  const [periodId, setPeriodId] = useState<number | null>(null);
  const [periodStart, setPeriodStart] = useState<string | null>(null);
  const [planned, setPlanned] = useState<PlannedV11Read[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [toast, setToast] = useState<ToastState>(null);

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
        const pStart = resolvedPeriod?.period_start ?? null;

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
        setPeriodStart(pStart);
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
  }, [reloadToken, refetchToken, sel?.selectedPeriodId, sel]);

  // ─────────── inline limit edit (live draft) ───────────
  const handleSliderChange = useCallback((catId: number, cents: number) => {
    setPlans((prev) => applyPlanEdit(prev, catId, cents));
  }, []);

  // ─────────── inline limit auto-save (blur / Enter) ───────────
  // §A (design-fix): no «Сохранить» button — each category limit persists on
  // commit. We send the FULL draft batch (the same payload the old «Сохранить»
  // sent) so the server-side Σplan ≤ income validation still covers every
  // category, not just the edited one. No-op when the committed value already
  // matches the persisted limit. On 400 overflow we surface the inline error and
  // reload to revert the rejected limit to its persisted value.
  const handleLimitCommit = useCallback(
    async (catId: number, cents: number) => {
      const persisted = categories.find((c) => c.id === catId);
      if ((persisted?.plan_cents ?? 0) === cents) {
        setSaveError(null);
        return; // no-op — unchanged
      }
      setSaveError(null);
      // Full batch with the committed value applied to the edited category.
      const payload = plans.map((p) =>
        p.category_id === catId ? { ...p, plan_cents: cents } : p,
      );
      try {
        const res = await patchPlanMonth(payload);
        // Sync persisted snapshot so the next no-op check is accurate.
        setCategories(res.categories);
        setToast({ text: 'Лимит сохранён', tone: 'success' });
      } catch (e) {
        if (e instanceof ApiError && e.status === 400) {
          setSaveError('Σplan превышает доход — уменьшите лимиты');
        } else {
          setSaveError(e instanceof Error ? e.message : 'Ошибка сохранения');
        }
        // Revert the rejected draft to the persisted limit.
        setReloadToken((n) => n + 1);
      }
    },
    [categories, plans],
  );

  // ─────────── «Регулярные платежи» mark-paid / undo ───────────
  // A regular obligation is either a subscription (post via /subscriptions/{id})
  // or a recurring planned row (post via /planned/{id}).
  //
  // tx_date clamp (post «as a real fact NOW»): the backend rejects tx_date more
  // than a few days ahead of today (actual.py FutureDateError 400, D-58). A
  // planned row scheduled later this month would fail when posted on its FUTURE
  // planned_date, so we post on TODAY whenever the planned_date is in the future
  // (subscriptions always post on _today_in_app_tz() server-side anyway).
  const handlePostRegular = useCallback(
    async (row: RegularRow) => {
      try {
        if (row.source === 'planned' && row.plannedId != null) {
          if (periodId != null) {
            const today = todayIso();
            const txDate =
              row.plannedDate != null && row.plannedDate <= today
                ? row.plannedDate
                : today;
            await postPlanned(periodId, row.plannedId, txDate);
          }
        } else {
          await postSubscription(row.id);
        }
        setToast({ text: 'Отмечено как оплачено', tone: 'success' });
        setReloadToken((n) => n + 1);
      } catch (e) {
        setToast({
          text:
            e instanceof ApiError && e.status === 409
              ? 'Уже оплачено'
              : 'Не удалось отметить платёж',
          tone: 'error',
        });
      }
    },
    [periodId],
  );

  const handleUnpostRegular = useCallback(
    async (row: RegularRow) => {
      try {
        if (row.source === 'planned' && row.plannedId != null) {
          if (periodId != null) await unpostPlanned(periodId, row.plannedId);
        } else {
          await unpostSubscription(row.id);
        }
        setToast({ text: 'Отметка снята', tone: 'success' });
        setReloadToken((n) => n + 1);
      } catch {
        setToast({ text: 'Не удалось снять отметку', tone: 'error' });
      }
    },
    [periodId],
  );

  // ─────────── per-category plan add + drill-in ───────────
  // «+» on a category row → shared AddSheet (plan mode) with that category
  // pre-selected. A successful create bumps the refetch token → the plan + the
  // pushed PlanCategoryDetailMount both reload.
  const handleAddPlanned = useCallback(
    (categoryId: number) => {
      openAddSheet('plan', categoryId);
    },
    [openAddSheet],
  );

  // Tapping a category row drills into its planned-transaction detail (mirrors
  // the fact-side CategoryDetail push). Period scoping happens inside the mount.
  const handleCategoryTap = useCallback(
    (categoryId: number) => {
      router.push(<PlanCategoryDetailMount categoryId={categoryId} />);
    },
    [router],
  );

  // ─────────── derived view-model ───────────
  // v1.1 design-fix: income and expense are SEPARATE on «План месяца». Income
  // is not capped — it has no «лимит»/«осталось распределить»/«превышено». We
  // split categories by `kind` and feed each segment its own surface.
  const expenseCategories = useMemo(
    () => categories.filter((c) => c.kind === 'expense'),
    [categories],
  );
  const incomeCategories = useMemo(
    () => categories.filter((c) => c.kind === 'income'),
    [categories],
  );

  // Memoised so slider drags (which only bump `plans`) don't recompute the
  // regulars list (subs×categories) every render, and a parent re-render with
  // unchanged inputs is a no-op. Each useMemo is keyed on its exact inputs.
  //
  // «Осталось распределить» is an EXPENSE-only concept: surplus = income −
  // Σ EXPENSE plans (income plans must not eat into the distributable surplus).
  const expensePlans = useMemo(() => {
    const expenseIds = new Set(expenseCategories.map((c) => c.id));
    return plans.filter((p) => expenseIds.has(p.category_id));
  }, [plans, expenseCategories]);
  const surplus = useMemo(
    () => computeSurplus(income, expensePlans),
    [income, expensePlans],
  );
  const isOverflow = useMemo(() => computeIsOverflow(surplus), [surplus]);

  // «Осталось распределить» progress (Σ expense limits из дохода) — drives the
  // bar + «X из Y» caption (refs #21-23). Tracks the live draft `expensePlans`.
  const progress = useMemo(
    () => computeDistributeProgress(income, expensePlans),
    [income, expensePlans],
  );

  // «Регулярные платежи» — ONE list from subscriptions + recurring planned rows.
  const regulars = useMemo(
    () => computeRegularsList(subs, categories, planned),
    [subs, categories, planned],
  );

  // Income summary (calm — no «осталось распределить» semantics):
  //   Запланировано дохода = Σ income category plans.
  //   Получено             = Σ posted income planned rows (факт дохода).
  const incomeSummary = useMemo(() => {
    const planByCat = new Map(plans.map((p) => [p.category_id, p.plan_cents]));
    const incomeIds = new Set(incomeCategories.map((c) => c.id));
    let plannedSum = 0;
    let received = 0;
    for (const c of incomeCategories) {
      plannedSum += planByCat.get(c.id) ?? c.plan_cents ?? 0;
    }
    for (const p of planned) {
      if (
        p.kind === 'income' &&
        incomeIds.has(p.category_id) &&
        p.posted_txn_id != null
      ) {
        received += Math.abs(p.amount_cents);
      }
    }
    return { plannedCents: plannedSum, receivedCents: received };
  }, [incomeCategories, plans, planned]);

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

  // The native view auto-saves each limit on commit (onLimitCommit) and has no
  // save button (§A design-fix).
  return (
    <>
      <NativePlanView
        incomeCents={income}
        categories={expenseCategories}
        plans={plans}
        regulars={regulars}
        surplusCents={surplus}
        isOverflow={isOverflow}
        progress={progress}
        periodStart={periodStart}
        saveError={saveError}
        focusCategoryId={focusCategoryId}
        onSliderChange={handleSliderChange}
        onPostRegular={handlePostRegular}
        onUnpostRegular={handleUnpostRegular}
        onAddPlanned={handleAddPlanned}
        onCategoryTap={handleCategoryTap}
        onBack={() => router.pop()}
        incomeCategories={incomeCategories}
        incomePlannedCents={incomeSummary.plannedCents}
        incomeReceivedCents={incomeSummary.receivedCents}
        onLimitCommit={handleLimitCommit}
      />
      <NativeToast
        message={toast?.text ?? ''}
        tone={toast?.tone ?? 'success'}
        visible={toast !== null}
        onDismiss={() => setToast(null)}
      />
    </>
  );
}
