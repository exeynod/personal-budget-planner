// Phase 26-04 Task 4: PlanMount — data fetcher + state management.
//
// Lifecycle:
//   1. On mount, fetch (period resolution runs CONCURRENTLY with the
//      categories fetch; planned waits for the resolved period id):
//        - getCurrentPeriod (only when no shell-selected period)
//        - listCategoriesV10 (categories with v1.0 plan_cents)
//        - listPlanned(pid)  (per-category «Запланировано» summaries)
//   2. Filter + sort categories (drop savings; sort by ord ASC).
//   3. Read-only `plans` from category.plan_cents (plansFromCategories) — drives
//      the expense surplus/progress only (limits are edited in the detail now).
//      The «Осталось распределить» income denominator is the Σ of the period's
//      PLANNED income (incomePlannedCents), NOT AppUser.income_cents.
//
// The overview rows are COMPACT READ-ONLY summaries — the EXPENSE limit edit and
// the per-category plan add both moved into the per-category detail (pushed via
// handleCategoryTap → PlanCategoryDetailMount).
//
// Toast UX (T-26-04-02 mitigation): template-save shows a confirmation toast.

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
  listPlanned,
  type CategoryV10,
  type PlannedV11Read,
} from '../../api/v10';
import { getCurrentPeriod } from '../../api/periods';
import { saveCurrentAsTemplate } from '../../api/template';
import { TemplateMount } from '../Management/TemplateMount';
import type { PlanMonthItem } from '../../api/types';
import { NativePlanView } from './NativePlanView';
import { PlanCategoryDetailMount } from './PlanCategoryDetailMount';
import {
  computeDistributeProgress,
  computeIsOverflow,
  computeSurplus,
  plansFromCategories,
} from './computePlan';

/** Toast payload: message + tone (drives the NativeToast glyph/color). */
type ToastState = { text: string; tone: 'success' | 'error' } | null;

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

  const [categories, setCategories] = useState<CategoryV10[]>([]);
  const [plans, setPlans] = useState<PlanMonthItem[]>([]);
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
        // categories fetch CONCURRENTLY with it instead of awaiting the period
        // first.
        const shellPeriod =
          sel?.periods.find((p) => p.id === sel.selectedPeriodId) ??
          sel?.periods[0];
        const catsP = listCategoriesV10();

        const resolvedPeriod = shellPeriod ?? (await getCurrentPeriod());
        const pid = resolvedPeriod?.id ?? null;

        // planned is period-scoped, so it only starts once pid is known.
        const [cats, plannedList] = await Promise.all([
          catsP,
          pid != null ? listPlanned(pid) : Promise.resolve([]),
        ]);
        if (cancelled) return;

        // Sort active non-savings categories by ord ASC for stable list order.
        const visible = cats
          .filter((c) => c.code !== 'savings')
          .sort((a, b) => (a.ord ?? '99').localeCompare(b.ord ?? '99'));

        setCategories(visible);
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

  // Memoised so slider drags (which only bump `plans`) don't recompute every
  // render, and a parent re-render with unchanged inputs is a no-op. Each
  // useMemo is keyed on its exact inputs.
  //
  // «Осталось распределить» is an EXPENSE-only concept: surplus = income −
  // Σ EXPENSE plans (income plans must not eat into the distributable surplus).
  const expensePlans = useMemo(() => {
    const expenseIds = new Set(expenseCategories.map((c) => c.id));
    return plans.filter((p) => expenseIds.has(p.category_id));
  }, [plans, expenseCategories]);

  // Income summary (calm — no «осталось распределить»/plan-target semantics).
  // Income has NO plan target, so «Запланировано дохода» is the Σ of UNPOSTED
  // income planned rows (NOT category.plan_cents). This is the PLAN surface, so
  // the fact of RECEIVED income («Получено») is intentionally NOT summarised
  // here — it lives on the fact/home side. It ALSO drives the «Осталось
  // распределить» income denominator (see incomeForCalc below).
  const incomePlannedCents = useMemo(() => {
    const incomeIds = new Set(incomeCategories.map((c) => c.id));
    let plannedSum = 0;
    for (const p of planned) {
      if (p.kind !== 'income' || !incomeIds.has(p.category_id)) continue;
      if (p.posted_txn_id == null) plannedSum += Math.abs(p.amount_cents);
    }
    return plannedSum;
  }, [incomeCategories, planned]);

  // Income for «Осталось распределить» is the Σ of the period's PLANNED income
  // (план зачислений / incomePlannedCents above), NOT AppUser.income_cents — the
  // plan drives the distributable denominator now. When there is no planned
  // income (== 0) the surplus = −Σплан is a meaningless scary negative, so we
  // flag `incomeUnset` and the view shows a neutral «добавьте плановые доходы»
  // prompt instead of «Превышено».
  const incomeForCalc = incomePlannedCents;
  const incomeUnset = incomeForCalc === 0;
  const surplus = useMemo(
    () => computeSurplus(incomeForCalc, expensePlans),
    [incomeForCalc, expensePlans],
  );
  // Never flag overflow when there is no planned income — it would be a
  // meaningless «−Σплан» negative. The view renders the neutral prompt instead.
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
        incomeUnset={incomeUnset}
        categories={expenseCategories}
        plans={plans}
        scheduledByCat={scheduledByCat}
        surplusCents={surplus}
        isOverflow={isOverflow}
        progress={progress}
        saveError={null}
        focusCategoryId={focusCategoryId}
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
