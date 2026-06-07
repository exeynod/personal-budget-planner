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
import { NativePlanView } from './NativePlanView';
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
  computeIncomeLadder,
  type PlanDetailRow,
} from './computePlanDetail';

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
  // Shared AddSheet (plan mode «+») bumps this token on a successful create →
  // reload the plan so the new planned row + ladder appear immediately.
  const refetchToken = useRefetchToken();

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

  // ─────────── regulars post / unpost ───────────
  const handlePostRegular = useCallback(async (subId: number) => {
    try {
      await postSubscription(subId);
      setToast({ text: 'Проведено в реестр', tone: 'success' });
      // Reload to refresh subscription posted_txn_id state.
      setReloadToken((n) => n + 1);
    } catch {
      setToast({
        text: 'Не удалось провести регулярный платёж',
        tone: 'error',
      });
    }
  }, []);

  const handleUnpostRegular = useCallback(async (subId: number) => {
    try {
      await unpostSubscription(subId);
      setToast({ text: 'Проводка отменена', tone: 'success' });
      setReloadToken((n) => n + 1);
    } catch {
      setToast({ text: 'Не удалось отменить проводку', tone: 'error' });
    }
  }, []);

  // ─────────── detail surface handlers (v1.1) ───────────
  // Post a single detail row: subscription-derived rows post via their own
  // /subscriptions/{id}/post endpoint (planned post-route 400s on them); manual
  // rows post via /planned/{id}/post.
  //
  // tx_date fix (DESIGN-REVIEW §2.2 «починить ошибку проведения»): «Провести»
  // means «record this as a real fact NOW». The backend rejects tx_date more
  // than 7 days ahead of today (actual.py _check_future_date → FutureDateError
  // 400, D-58). A planned row scheduled later in the month therefore failed when
  // we posted on its FUTURE planned_date. Post on TODAY whenever the planned_date
  // is in the future (clamp) — exactly what post_subscription does (it always
  // posts on _today_in_app_tz()). Past/near planned_date is preserved.
  const handlePostDetail = useCallback(
    async (row: PlanDetailRow) => {
      try {
        if (row.subscriptionId != null) {
          await postSubscription(row.subscriptionId);
        } else if (periodId != null) {
          const today = todayIso();
          const txDate =
            row.plannedDate != null && row.plannedDate <= today
              ? row.plannedDate
              : today;
          await postPlanned(periodId, row.id, txDate);
        }
        setToast({ text: 'Проведено в реестр', tone: 'success' });
        setReloadToken((n) => n + 1);
      } catch (e) {
        setToast({
          text:
            e instanceof ApiError && e.status === 409
              ? 'Уже проведено'
              : 'Не удалось провести трату',
          tone: 'error',
        });
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
        setToast({ text: 'Проводка отменена', tone: 'success' });
        setReloadToken((n) => n + 1);
      } catch {
        setToast({ text: 'Не удалось отменить проводку', tone: 'error' });
      }
    },
    [periodId],
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
    for (const c of expenseCategories) {
      const limit = limitByCat.get(c.id) ?? c.plan_cents ?? 0;
      out.set(c.id, computeLadder(limit, detailByCat.get(c.id) ?? []));
    }
    return out;
  }, [expenseCategories, plans, detailByCat]);

  // Income ladder per category (План / Запланировано / Получено). No overflow.
  const incomeLadderByCat = useMemo(() => {
    const planByCat = new Map(plans.map((p) => [p.category_id, p.plan_cents]));
    const out = new Map<number, ReturnType<typeof computeIncomeLadder>>();
    for (const c of incomeCategories) {
      const plan = planByCat.get(c.id) ?? c.plan_cents ?? 0;
      out.set(c.id, computeIncomeLadder(plan, detailByCat.get(c.id) ?? []));
    }
    return out;
  }, [incomeCategories, plans, detailByCat]);

  // Income summary (calm — no «осталось распределить» semantics):
  //   Запланировано дохода = Σ income category plans.
  //   Получено             = Σ posted income planned rows (факт дохода).
  const incomeSummary = useMemo(() => {
    const planByCat = new Map(plans.map((p) => [p.category_id, p.plan_cents]));
    let planned = 0;
    let received = 0;
    for (const c of incomeCategories) {
      planned += planByCat.get(c.id) ?? c.plan_cents ?? 0;
      received += incomeLadderByCat.get(c.id)?.receivedCents ?? 0;
    }
    return { plannedCents: planned, receivedCents: received };
  }, [incomeCategories, plans, incomeLadderByCat]);

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
        saveError={saveError}
        focusCategoryId={focusCategoryId}
        onSliderChange={handleSliderChange}
        onPostRegular={handlePostRegular}
        onUnpostRegular={handleUnpostRegular}
        onBack={() => router.pop()}
        incomeCategories={incomeCategories}
        incomePlannedCents={incomeSummary.plannedCents}
        incomeReceivedCents={incomeSummary.receivedCents}
        onLimitCommit={handleLimitCommit}
        detailByCat={detailByCat}
        ladderByCat={ladderByCat}
        incomeLadderByCat={incomeLadderByCat}
        onPostDetail={handlePostDetail}
        onUnpostDetail={handleUnpostDetail}
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
