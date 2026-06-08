// Phase 26-04 Task 4: PlanMount — data fetcher + state management.
//
// Lifecycle:
//   1. On mount, fetch (period resolution runs CONCURRENTLY with the
//      period-independent fetches; planned waits for the resolved period id):
//        - getCurrentPeriod (only when no shell-selected period)
//        - listCategoriesV10 (categories with v1.0 plan_cents)
//        - listSubscriptionsV10 (regulars block)
//        - getMeV10          (User.income_cents — surplus denominator)
//        - listPlanned(pid)  (per-category «Запланировано» summaries + regulars)
//   2. Filter + sort categories (drop savings; sort by ord ASC).
//   3. Read-only `plans` from category.plan_cents (plansFromCategories) — drives
//      the expense surplus/progress only (limits are edited in the detail now).
//   4. Regular post/unpost → POST /subscriptions/:id/post(unpost) → reload.
//
// The overview rows are COMPACT READ-ONLY summaries — the EXPENSE limit edit and
// the per-category plan add both moved into the per-category detail (pushed via
// handleCategoryTap → PlanCategoryDetailMount).
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
import { saveCurrentAsTemplate } from '../../api/template';
import { TemplateMount } from '../Management/TemplateMount';
import type { PlanMonthItem } from '../../api/types';
import { NativePlanView } from './NativePlanView';
import { PlanCategoryDetailMount } from './PlanCategoryDetailMount';
import {
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
  // The shared AddSheet (plan mode) — used inside the per-category detail — bumps
  // this token on a successful create → reload the plan so the new planned row +
  // updated summaries appear immediately on return to the overview.
  const refetchToken = useRefetchToken();

  // income_cents is NULLABLE on app_user — keep null distinct from a real 0 so
  // the «Осталось распределить» card can render a neutral «укажите доход» prompt
  // instead of a scary negative «Превышено» when the owner never set it.
  const [income, setIncome] = useState<number | null>(null);
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
  const [reloadToken, setReloadToken] = useState(0);
  const [toast, setToast] = useState<ToastState>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setLoadError(null);

    async function load() {
      try {
        // Resolve the period whose plan we're editing: the shell's selected
        // period when available (newest-first), else the active period. When no
        // shell period exists we must fetch getCurrentPeriod() — kick off the
        // period-independent fetches (cats/subs/me) CONCURRENTLY with it instead
        // of awaiting the period first.
        const shellPeriod =
          sel?.periods.find((p) => p.id === sel.selectedPeriodId) ??
          sel?.periods[0];
        const catsP = listCategoriesV10();
        const subsP = listSubscriptionsV10();
        const meP = getMeV10();

        const resolvedPeriod = shellPeriod ?? (await getCurrentPeriod());
        const pid = resolvedPeriod?.id ?? null;
        const pStart = resolvedPeriod?.period_start ?? null;

        // planned is period-scoped, so it only starts once pid is known.
        const [cats, subsList, me, plannedList] = await Promise.all([
          catsP,
          subsP,
          meP,
          pid != null ? listPlanned(pid) : Promise.resolve([]),
        ]);
        if (cancelled) return;

        // Sort active non-savings categories by ord ASC for stable list order.
        const visible = cats
          .filter((c) => c.code !== 'savings')
          .sort((a, b) => (a.ord ?? '99').localeCompare(b.ord ?? '99'));

        setCategories(visible);
        setSubs(subsList);
        setIncome(me.income_cents ?? null);
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

  // Tapping a category row drills into its planned-transaction detail (mirrors
  // the fact-side CategoryDetail push). Period scoping happens inside the mount.
  const handleCategoryTap = useCallback(
    (categoryId: number) => {
      router.push(<PlanCategoryDetailMount categoryId={categoryId} />);
    },
    [router],
  );

  // «Сохранить план как шаблон» — snapshot the CURRENT plan into the reusable
  // template (OVERWRITE). The view owns the confirm; this fires after confirm.
  const handleSaveAsTemplate = useCallback(async () => {
    try {
      await saveCurrentAsTemplate();
      setToast({ text: 'Шаблон обновлён', tone: 'success' });
    } catch {
      setToast({ text: 'Не удалось сохранить шаблон', tone: 'error' });
    }
  }, []);

  const handleOpenTemplate = useCallback(() => {
    router.push(<TemplateMount />);
  }, [router]);

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
  // income_cents may be NULL (never set). The surplus/progress math is only
  // meaningful with a real income denominator; when unset we still compute
  // against 0 (so the props are well-typed numbers) but flag `incomeUnset` so
  // the view shows a neutral «укажите доход» prompt instead of «Превышено».
  const incomeUnset = income == null;
  const incomeForCalc = income ?? 0;
  const surplus = useMemo(
    () => computeSurplus(incomeForCalc, expensePlans),
    [incomeForCalc, expensePlans],
  );
  // Never flag overflow when income is unset — it would be a meaningless
  // «−Σплан» negative. The view renders the neutral prompt in that case.
  const isOverflow = useMemo(
    () => !incomeUnset && computeIsOverflow(surplus),
    [incomeUnset, surplus],
  );

  // «Осталось распределить» progress (Σ expense limits из дохода) — drives the
  // bar + «X из Y» caption (refs #21-23). Tracks the live draft `expensePlans`.
  const progress = useMemo(
    () => computeDistributeProgress(incomeForCalc, expensePlans),
    [incomeForCalc, expensePlans],
  );

  // «Регулярные платежи» — ONE list from subscriptions + recurring planned rows.
  const regulars = useMemo(
    () => computeRegularsList(subs, categories, planned),
    [subs, categories, planned],
  );

  // Σ of UNPOSTED planned rows per category id («Запланировано» — what the
  // detail calls «Расписано»). Drives the read-only overview summary line for
  // BOTH expense and income rows (posted rows are already fact, so excluded).
  const scheduledByCat = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of planned) {
      if (p.posted_txn_id != null) continue;
      m.set(
        p.category_id,
        (m.get(p.category_id) ?? 0) + Math.abs(p.amount_cents),
      );
    }
    return m;
  }, [planned]);

  // Income summary (calm — no «осталось распределить»/plan-target semantics).
  // Income has NO plan target, so «Запланировано дохода» is the Σ of UNPOSTED
  // income planned rows (NOT category.plan_cents). This is the PLAN surface, so
  // the fact of RECEIVED income («Получено») is intentionally NOT summarised
  // here — it lives on the fact/home side.
  const incomePlannedCents = useMemo(() => {
    const incomeIds = new Set(incomeCategories.map((c) => c.id));
    let plannedSum = 0;
    for (const p of planned) {
      if (p.kind !== 'income' || !incomeIds.has(p.category_id)) continue;
      if (p.posted_txn_id == null) plannedSum += Math.abs(p.amount_cents);
    }
    return plannedSum;
  }, [incomeCategories, planned]);

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

  // The overview rows are read-only summaries — limit edit + plan add moved into
  // the per-category detail (PlanCategoryDetailView). No save errors here.
  return (
    <>
      <NativePlanView
        incomeCents={income}
        incomeUnset={incomeUnset}
        categories={expenseCategories}
        plans={plans}
        scheduledByCat={scheduledByCat}
        regulars={regulars}
        surplusCents={surplus}
        isOverflow={isOverflow}
        progress={progress}
        periodStart={periodStart}
        saveError={null}
        focusCategoryId={focusCategoryId}
        onPostRegular={handlePostRegular}
        onUnpostRegular={handleUnpostRegular}
        onCategoryTap={handleCategoryTap}
        onBack={() => router.pop()}
        onSaveAsTemplate={handleSaveAsTemplate}
        onOpenTemplate={handleOpenTemplate}
        incomeCategories={incomeCategories}
        incomePlannedCents={incomePlannedCents}
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
