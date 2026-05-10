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

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from 'react';
import {
  listAccounts,
  listCategoriesV10,
  listActualV10,
  type AccountResponse,
  type CategoryV10,
  type ActualV10Read,
} from '../../api/v10';
import { getCurrentPeriod } from '../../api/periods';
import type { PeriodRead } from '../../api/types';
import { Eyebrow, PosterButton } from '../../componentsV10';
import { formatPeriodEyebrow, usePosterRouter } from '../common';
import { AccountsListPlaceholder } from '../_placeholders';
// Phase 25-08: real Transactions registry replaces the prior WIP placeholder.
import { TransactionsMount } from '../Transactions';
// Phase 26-02: real CategoryDetail replaces the prior WIP placeholder.
import { CategoryDetailMount } from '../CategoryDetail';
// Phase 26-04: real Plan editor replaces the prior WIP PlanViewPlaceholder.
import { PlanMount } from '../Plan';
import { HomeView } from './HomeView';
import {
  computeCategoryAggregates,
  computeDailyPace,
  computePlanTotalCents,
  computeSurplus,
  computeWalletTotal,
  sortCategoriesForHome,
} from './computeHomeData';

// ─────────────────── State ───────────────────

interface DataPayload {
  accounts: AccountResponse[];
  categories: CategoryV10[];
  period: PeriodRead | null;
  actuals: ActualV10Read[];
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

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    async function load() {
      try {
        const [accounts, categories, period] = await Promise.all([
          listAccounts(),
          listCategoriesV10(),
          // getCurrentPeriod returns null on 404 (no active period yet) —
          // we propagate other errors.
          getCurrentPeriod(),
        ]);
        // Sequential — needs period.id once it's known.
        const actuals: ActualV10Read[] = period
          ? await listActualV10(period.id)
          : [];
        if (cancelled) return;
        setState({
          status: 'ready',
          data: { accounts, categories, period, actuals },
        });
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : 'Не удалось загрузить данные';
        setState({ status: 'error', message });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  // ─────────── push handlers (router-bound) ───────────
  const onWalletTap = useCallback(() => {
    router.push(<AccountsListPlaceholder />);
  }, [router]);
  const onPlanTap = useCallback(() => {
    router.push(<PlanMount />);
  }, [router]);
  const onCategoryTap = useCallback(
    (id: number) => {
      router.push(<CategoryDetailMount categoryId={id} />);
    },
    [router],
  );
  const onAllOperationsTap = useCallback(() => {
    // Phase 25-08: real TransactionsMount replaces the placeholder.
    router.push(<TransactionsMount />);
  }, [router]);

  // ─────────── computed view-model (memoised on state.data) ───────────
  const vm = useMemo(() => {
    if (state.status !== 'ready') return null;
    const { accounts, categories, period, actuals } = state.data;

    const today = new Date();
    const eyebrow = formatPeriodEyebrow(today);

    // daysLeft = lastDayOfMonth - today + 1 (today inclusive). Mirrors
    // formatPeriodEyebrow's denominator so dailyPace and the eyebrow
    // counter stay in sync.
    const lastDayOfMonth = new Date(
      today.getFullYear(),
      today.getMonth() + 1,
      0,
    ).getDate();
    const daysLeft = Math.max(1, lastDayOfMonth - today.getDate() + 1);

    const planTotalCents = computePlanTotalCents(categories);
    const factTotalExpenseCents = actuals
      .filter((a) => a.kind === 'expense')
      .reduce((s, a) => s + a.amount_cents, 0);

    const dailyPaceCents = computeDailyPace({
      planTotalCents,
      factTotalExpenseCents,
      daysLeft,
    });
    const surplusCents = computeSurplus({
      planTotalCents,
      factTotalExpenseCents,
    });
    const walletCents = computeWalletTotal(accounts);
    const categoryRows = sortCategoriesForHome(
      computeCategoryAggregates({ categories, actuals }),
    );

    return {
      eyebrow,
      daysLeft,
      dailyPaceCents,
      walletCents,
      surplusCents,
      categoryRows,
      period,
    };
  }, [state]);

  // ─────────── render ───────────
  if (state.status === 'loading') return <LoadingPlate />;
  if (state.status === 'error') {
    return (
      <ErrorPlate
        message={state.message}
        onRetry={() => setReloadToken((t) => t + 1)}
      />
    );
  }
  // status === 'ready' → vm is non-null.
  if (!vm) return null;

  return (
    <HomeView
      eyebrow={vm.eyebrow}
      dailyPaceCents={vm.dailyPaceCents}
      daysLeft={vm.daysLeft}
      walletCents={vm.walletCents}
      surplusCents={vm.surplusCents}
      categoryRows={vm.categoryRows}
      onWalletTap={onWalletTap}
      onPlanTap={onPlanTap}
      onCategoryTap={onCategoryTap}
      onAllOperationsTap={onAllOperationsTap}
    />
  );
}

// ─────────────────── Loading / Error sub-views ───────────────────

const fillStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'var(--poster-coral)',
  color: 'var(--poster-paper)',
  padding: '56px 22px 90px',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  fontFamily: 'var(--poster-font-manrope), system-ui, sans-serif',
};

function LoadingPlate() {
  return (
    <div style={fillStyle}>
      <Eyebrow color="var(--poster-paper)">ЗАГРУЗКА</Eyebrow>
      <div
        style={{
          fontFamily: 'var(--poster-font-jet-brains-mono), ui-monospace, monospace',
          fontSize: 13,
          opacity: 0.7,
          marginTop: 18,
        }}
      >
        ···
      </div>
    </div>
  );
}

interface ErrorPlateProps {
  message: string;
  onRetry: () => void;
}

function ErrorPlate({ message, onRetry }: ErrorPlateProps) {
  return (
    <div style={fillStyle}>
      <Eyebrow color="var(--poster-paper)">ОШИБКА</Eyebrow>
      <div
        style={{
          fontFamily: 'var(--poster-font-jet-brains-mono), ui-monospace, monospace',
          fontSize: 13,
          opacity: 0.85,
          marginTop: 18,
          wordBreak: 'break-word',
        }}
      >
        {message}
      </div>
      <div style={{ marginTop: 20 }}>
        <PosterButton onClick={onRetry} variant="primary">
          ПОВТОРИТЬ
        </PosterButton>
      </div>
    </div>
  );
}
