// Phase 25-04 Task 3: HomeMount — data fetcher + view glue.
//
// Lifecycle:
//   1. On mount, fetch accounts / categories / current period in parallel
//      (Promise.all). Period 404 (no active period yet) is treated as
//      «period = null» — renders an empty actuals list rather than erroring.
//   2. If period is non-null, fetch its actuals (sequential — depends on
//      period.id).
//   3. Compute daily pace, surplus, wallet total, sorted category aggregates.
//   4. Render <HomeView> wired to PosterRouter.push placeholders.
//   5. On any fetch error, render an error plate with «Повторить» button.
//
// The mount layer is intentionally thin — all sort/filter/aggregate logic
// lives in pure functions in computeHomeData.ts (unit-tested separately).

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listAccounts,
  listCategoriesV10,
  listActualV10,
  listPlanned,
  postPlanned,
  postSubscription,
  type AccountResponse,
  type CategoryV10,
  type ActualV10Read,
  type PlannedV11Read,
} from '../../api/v10';
import { getCurrentPeriod, getPeriodBalance } from '../../api/periods';
import { getHome, isHomeBootstrap } from '../../api/home';
import { seedCache, CACHE_KEYS } from '../../api/cache';
import type { BalanceResponse, PeriodRead } from '../../api/types';
import {
  formatPeriodEyebrow,
  formatPeriodEyebrowFromPeriod,
  useRefetchToken,
  usePosterRouter,
  useSelectedPeriodOptional,
  StatePlate,
} from '../common';
// Phase 26-02: real CategoryDetail replaces the prior WIP placeholder.
import { CategoryDetailMount } from '../CategoryDetail';
// Phase 26-04: real Plan editor replaces the prior WIP PlanViewPlaceholder.
import { PlanMount } from '../Plan';
import { NativeHomeView } from './NativeHomeView';
import {
  computeCategoryAggregates,
  computeCategoryAggregatesFromBalance,
  computeIncomeAggregates,
  computeIncomeAggregatesFromBalance,
  computeDailyPace,
  computePlanTotalCents,
  computeSurplus,
  computeWalletTotal,
  plannedUnpostedTotal,
  plannedTodayRows,
  sortCategoriesForHome,
} from './computeHomeData';

// ─────────────────── Helpers ───────────────────

/**
 * Parse a wire DATE (`YYYY-MM-DD`) into a LOCAL-midnight Date so daysLeft
 * diffs honour the user's wall clock (mirrors format.ts parseLocalDate).
 */
function parseLocalDateLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Today as an MSK (`Europe/Moscow`) `YYYY-MM-DD` DATE. Period/business dates are
 * MSK in this app (CLAUDE.md: «расчёты периодов … Europe/Moscow»), so the
 * «Запланировано на сегодня» filter must compare against the MSK calendar day
 * regardless of the device timezone. `en-CA` yields the ISO `YYYY-MM-DD` shape.
 */
function todayMskIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

// ─────────────────── State ───────────────────

interface DataPayload {
  accounts: AccountResponse[];
  categories: CategoryV10[];
  period: PeriodRead | null;
  actuals: ActualV10Read[];
  /**
   * Phase P2 (period switching): present only when viewing a PAST / closed
   * period — its category aggregates come from the period balance, not the
   * live category plan. Null for the active period (existing path).
   */
  balance: BalanceResponse | null;
  /**
   * v1.1 plan↔fact ladder: this period's planned rows (manual + subscription).
   * Drives the «Запланировано (unposted)» ladder level on the native Home /
   * CategoryDetail views. Empty when there is no period.
   */
  planned: PlannedV11Read[];
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: DataPayload };

// ─────────────────── Component ───────────────────

export function HomeMount() {
  const router = usePosterRouter();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);
  // Phase 30-02 (DEBT-02): AddSheet submit bumps this token via V10MainShell
  // → RefetchTokenProvider → useRefetchToken. We include it in the fetch
  // effect deps so Home actuals refresh immediately after a successful POST.
  // Falls back to `0` outside the provider (unit tests rendering Mount alone).
  const refetchToken = useRefetchToken();

  // Phase P2 (period switching): the period the user is VIEWING. Outside the
  // SelectedPeriodProvider (standalone Mount unit tests) `sel` is null and we
  // fall back to the legacy getCurrentPeriod() path — current-period output is
  // identical to pre-P2 behaviour. When the provider IS present we scope every
  // fetch to `selectedPeriodId`, and a PAST/closed period sources its category
  // aggregates from getPeriodBalance(...) rather than the live category plan.
  const sel = useSelectedPeriodOptional();
  const selectedPeriodId = sel?.selectedPeriodId ?? null;
  // Resolve the selected period object so the effect can branch active vs past
  // without an extra fetch. `periods` is newest-first from the provider.
  const selectedPeriod = useMemo(
    () => sel?.periods.find((p) => p.id === selectedPeriodId) ?? null,
    [sel, selectedPeriodId],
  );

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    // Fast path (perceived-speed): when we're in the shell (provider present)
    // and viewing the ACTIVE period, a single GET /api/v1/home returns
    // everything Home needs in one round-trip — AND lets us seed the granular
    // client caches so the next navigation reuses accounts / categories /
    // period / actuals with zero refetch. We restrict this to the active
    // period because a PAST/closed view sources its category aggregates from
    // getPeriodBalance(...) (the bootstrap carries only the current period).
    const canUseBootstrap =
      sel != null &&
      selectedPeriod != null &&
      selectedPeriod.status === 'active';

    async function loadFromBootstrap(): Promise<boolean> {
      try {
        const home = await getHome();
        if (!isHomeBootstrap(home)) return false; // malformed → fall back
        if (cancelled) return true;

        // Seed the granular caches so Transactions / Accounts / CategoryDetail
        // reuse what Home already loaded (no cold refetch on first navigation).
        seedCache(CACHE_KEYS.accounts, home.accounts);
        seedCache(CACHE_KEYS.categories(false), home.categories);
        seedCache(CACHE_KEYS.me, home.user);
        if (home.period) {
          seedCache(CACHE_KEYS.actuals(home.period.id), home.actuals);
          if (home.balance) {
            seedCache(CACHE_KEYS.balance(home.period.id), home.balance);
          }
        }

        // The /home bootstrap doesn't carry planned rows; fetch them so the
        // native plan↔fact ladder has its «Запланировано (unposted)» level.
        // (Cached via getCached → no extra round-trip on later navigation.)
        const planned: PlannedV11Read[] = home.period
          ? await listPlanned(home.period.id)
          : [];
        if (cancelled) return true;

        setState({
          status: 'ready',
          data: {
            accounts: home.accounts,
            categories: home.categories,
            // Prefer the provider's selected period object (identical to the
            // server's active period) so the rest of the VM is unchanged.
            period: selectedPeriod ?? home.period,
            actuals: home.actuals,
            // Active period → no balance aggregates (categories+actuals path),
            // byte-identical to the granular active-period render.
            balance: null,
            planned,
          },
        });
        return true;
      } catch {
        // /home unavailable (older backend, 5xx, network) → granular fallback.
        return false;
      }
    }

    async function loadGranular() {
      try {
        const [accounts, categories] = await Promise.all([
          listAccounts(),
          listCategoriesV10(),
        ]);

        // ── Period resolution ──────────────────────────────────────────
        // With the provider: use the viewed period. Without it (standalone
        // unit tests): legacy getCurrentPeriod() (returns null on 404).
        let period: PeriodRead | null;
        if (sel) {
          period = selectedPeriod;
        } else {
          // getCurrentPeriod returns null on 404 (no active period yet) —
          // we propagate other errors.
          period = await getCurrentPeriod();
        }

        // The PAST/closed branch sources category aggregates from the period
        // balance (the live plan no longer reflects what was planned then).
        // The active period keeps the categories+actuals path (no regression).
        const isPastView = period != null && period.status !== 'active';

        const actuals: ActualV10Read[] = period
          ? await listActualV10(period.id)
          : [];
        const balance: BalanceResponse | null =
          isPastView && period ? await getPeriodBalance(period.id) : null;
        const planned: PlannedV11Read[] = period
          ? await listPlanned(period.id)
          : [];

        if (cancelled) return;
        setState({
          status: 'ready',
          data: { accounts, categories, period, actuals, balance, planned },
        });
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : 'Не удалось загрузить данные';
        setState({ status: 'error', message });
      }
    }

    async function load() {
      if (canUseBootstrap) {
        const ok = await loadFromBootstrap();
        if (ok || cancelled) return;
      }
      await loadGranular();
    }

    load();
    return () => {
      cancelled = true;
    };
    // selectedPeriodId in deps: switching the viewed period re-fetches.
    // refetchToken in deps: external bump (AddSheet submit) re-runs the fetch.
  }, [reloadToken, refetchToken, selectedPeriodId, selectedPeriod, sel]);

  // ─────────── push handlers (router-bound) ───────────
  const onPlanTap = useCallback(() => {
    router.push(<PlanMount />);
  }, [router]);
  const onCategoryTap = useCallback(
    (id: number) => {
      router.push(<CategoryDetailMount categoryId={id} />);
    },
    [router],
  );

  // «Запланировано на сегодня» → «Отметить»: record the planned row as a real
  // fact NOW. Manual / template rows post via /planned/{id}/post; subscription-
  // derived rows must go through /subscriptions/{id}/post (the planned post-route
  // 400s on them). Both insert an actual_transaction; postPlanned/postSubscription
  // already invalidate the tx-affected caches, so a reloadToken bump re-fetches
  // planned/balance/accounts and the ladder/«В запасе» update. We always post on
  // TODAY — the row is by definition scheduled for today here.
  const periodIdForPost =
    state.status === 'ready' ? (state.data.period?.id ?? null) : null;
  const onMarkPlannedToday = useCallback(
    async (row: { id: number; subscriptionId: number | null }) => {
      try {
        if (row.subscriptionId != null) {
          await postSubscription(row.subscriptionId);
        } else if (periodIdForPost != null) {
          await postPlanned(periodIdForPost, row.id, todayMskIso());
        } else {
          return;
        }
        setReloadToken((t) => t + 1);
      } catch {
        // A 409 (already posted) or transient failure: a reload re-syncs the
        // list (the row drops out once posted_txn_id is set server-side).
        setReloadToken((t) => t + 1);
      }
    },
    [periodIdForPost],
  );

  // ─────────── computed view-model (memoised on state.data) ───────────
  const vm = useMemo(() => {
    if (state.status !== 'ready') return null;
    const { accounts, categories, period, actuals, balance, planned } =
      state.data;

    const today = new Date();

    // Phase P2: eyebrow + daysLeft come from the VIEWED period when known so
    // a closed past period shows its own month. With no period (standalone
    // test / no active period) we keep the legacy today-derived eyebrow —
    // current-period rendering is byte-identical to pre-P2.
    let eyebrow: string;
    let daysLeft: number;
    if (period) {
      eyebrow = formatPeriodEyebrowFromPeriod(period, today);
      // daysLeft mirrors the eyebrow denominator: active → today inclusive,
      // past/closed → 0, future → full span. Clamp ≥1 only for the active
      // dailyPace divisor (a closed period's pace is moot — fact is final).
      const start = parseLocalDateLocal(period.period_start);
      const end = parseLocalDateLocal(period.period_end);
      const todayMid = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
      );
      const MS = 24 * 60 * 60 * 1000;
      if (todayMid.getTime() > end.getTime()) {
        daysLeft = 0;
      } else if (todayMid.getTime() < start.getTime()) {
        daysLeft = Math.round((end.getTime() - start.getTime()) / MS) + 1;
      } else {
        daysLeft = Math.round((end.getTime() - todayMid.getTime()) / MS) + 1;
      }
    } else {
      eyebrow = formatPeriodEyebrow(today);
      const lastDayOfMonth = new Date(
        today.getFullYear(),
        today.getMonth() + 1,
        0,
      ).getDate();
      daysLeft = Math.max(1, lastDayOfMonth - today.getDate() + 1);
    }

    // ── Category aggregates + plan/fact totals ─────────────────────────
    // PAST/closed period → balance.by_category (authoritative for that period).
    // Active / no-provider period → live categories + actuals (no regression).
    let categoryRows;
    let planTotalCents: number;
    let factTotalExpenseCents: number;
    if (balance) {
      categoryRows = sortCategoriesForHome(
        computeCategoryAggregatesFromBalance({
          byCategory: balance.by_category,
          categories,
        }),
      );
      planTotalCents = categoryRows.reduce((s, r) => s + r.plan_cents, 0);
      factTotalExpenseCents = categoryRows.reduce(
        (s, r) => s + r.fact_cents,
        0,
      );
    } else {
      planTotalCents = computePlanTotalCents(categories);
      factTotalExpenseCents = actuals
        .filter((a) => a.kind === 'expense')
        .reduce((s, a) => s + a.amount_cents, 0);
      categoryRows = sortCategoriesForHome(
        computeCategoryAggregates({ categories, actuals }),
      );
    }

    // Liquid Glass native «Доходы» tab — income category rows. Computed here
    // (cheap) but consumed only by NativeHomeView; the poster HomeView ignores
    // it (Maximal Poster unaffected).
    const incomeRows = sortCategoriesForHome(
      balance
        ? computeIncomeAggregatesFromBalance({
            byCategory: balance.by_category,
            categories,
          })
        : computeIncomeAggregates({ categories, actuals }),
    );

    const dailyPaceCents = computeDailyPace({
      planTotalCents,
      factTotalExpenseCents,
      // For a closed period daysLeft is 0; computeDailyPace clamps the divisor
      // to ≥1 internally so this stays a finite (often 0 once over) value.
      daysLeft,
    });
    const surplusCents = computeSurplus({
      planTotalCents,
      factTotalExpenseCents,
    });
    const walletCents = computeWalletTotal(accounts);

    // v1.1 plan↔fact ladder — Σ of UNPOSTED planned amounts (excludes posted
    // rows and subscription_auto rows; anti-double-count). The native Home
    // shows this as the «Запланировано» level between Лимит and Факт.
    const plannedUnpostedCents = plannedUnpostedTotal(planned, 'expense');

    // «Запланировано на сегодня» — unposted EXPENSE planned rows scheduled for
    // the MSK today. Expense-scoped to match the Home ladder framing («что мне
    // надо потратить сегодня»); income planned rows are not actionable here.
    const plannedToday = plannedTodayRows(
      planned,
      categories,
      todayMskIso(today),
      'expense',
    );

    return {
      eyebrow,
      daysLeft,
      dailyPaceCents,
      walletCents,
      surplusCents,
      planTotalCents,
      factTotalExpenseCents,
      plannedUnpostedCents,
      plannedToday,
      categoryRows,
      incomeRows,
      period,
    };
  }, [state]);

  // Phase 30-02 (DEBT-02): hidden sentinel that surfaces the current
  // refetchToken value so Playwright / vitest can assert «parent re-fetched
  // after AddSheet submit» without inspecting fetch mocks. Hidden via
  // `display: none` so it has zero visual impact.
  const refetchSentinel = (
    <span
      data-testid="parent-refetched"
      data-refetch-token={refetchToken}
      style={{ display: 'none' }}
      aria-hidden="true"
    />
  );

  // ─────────── render ───────────
  if (state.status === 'loading') {
    return (
      <>
        {refetchSentinel}
        <StatePlate variant="loading" testId="home-loading" />
      </>
    );
  }
  if (state.status === 'error') {
    return (
      <>
        {refetchSentinel}
        <StatePlate
          variant="error"
          testId="home-error"
          message={state.message}
          onRetry={() => setReloadToken((t) => t + 1)}
        />
      </>
    );
  }
  // status === 'ready' → vm is non-null.
  if (!vm) return refetchSentinel;

  // Liquid Glass native shell → native iOS Home view. Reuses the same vm.
  return (
    <>
      {refetchSentinel}
      <NativeHomeView
        walletCents={vm.walletCents}
        plannedUnpostedCents={vm.plannedUnpostedCents}
        plannedToday={vm.plannedToday}
        onMarkPlannedToday={onMarkPlannedToday}
        expenseRows={vm.categoryRows}
        incomeRows={vm.incomeRows}
        onPlanTap={onPlanTap}
        onCategoryTap={onCategoryTap}
        periods={sel?.periods}
        selectedPeriodId={selectedPeriodId}
        onSelectPeriod={sel?.setSelectedPeriodId}
      />
    </>
  );
}
