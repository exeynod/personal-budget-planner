// Phase 25-08 Task 3: TransactionsMount — data fetcher + view glue.
//
// Lifecycle:
//   1. On mount, fetch accounts / categories / current period in parallel.
//   2. If period non-null → sequential fetch period actuals (needs period.id).
//   3. Compute filtered+grouped view-model via computeTransactions helpers.
//   4. Render <TransactionsView> wired to:
//      - onChipChange: local React state setChip
//      - onRowTap: open edit PosterSheet (stub — Phase 26 retrofit per CONTEXT D-Defer)
//      - onRowDelete: View-gated delete — swipe-left (touch) or right-click
//                     context-menu (desktop) is the intent gate (T-25-08-02
//                     mitigation, Phase 30-05 DEBT-05). Mount just fires
//                     deleteActual(tx.id) → reload; errors → alert toast.
//      - onBack: router.pop()
//   5. Loading / error / empty are sub-views (cobalt-tinted to match the screen).
//
// The mount layer is intentionally thin — all filter/group/format logic lives
// in pure functions in computeTransactions.ts (unit-tested separately).

import { useCallback, useMemo, useState } from 'react';
import {
  listAccounts,
  listActualV10,
  listCategoriesV10,
  type AccountResponse,
  type ActualV10Read,
  type CategoryV10,
} from '../../api/v10';
import { getCurrentPeriod } from '../../api/periods';
import type { PeriodRead } from '../../api/types';
import { deleteActual } from '../../api/actual';
import {
  PosterSheet,
  StatePlate,
  useRefetchToken,
  usePosterRouter,
  useResource,
  useSelectedPeriodOptional,
} from '../common';
import { NativeToast } from '../native/NativeToast';
import { NativeButton } from '../native/NativeButton';
import { NativeTransactionsView } from './NativeTransactionsView';
import {
  applyFilterChip,
  computeHeaderSummary,
  groupByDay,
  type TxFilterChip,
} from './computeTransactions';

// ─────────────────── Helpers ───────────────────

/** Parse a wire DATE (`YYYY-MM-DD`) into a LOCAL-midnight Date. */
function parseLocalDateTx(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// ─────────────────── State ───────────────────

interface DataPayload {
  accounts: AccountResponse[];
  categories: CategoryV10[];
  actuals: ActualV10Read[];
  /** Phase P2 (period switching): the viewed period (null = legacy fallback). */
  period: PeriodRead | null;
}

// ─────────────────── Component ───────────────────

export function TransactionsMount() {
  const router = usePosterRouter();
  const [chip, setChip] = useState<TxFilterChip>('all');
  const [editingTx, setEditingTx] = useState<ActualV10Read | null>(null);
  // P2-11: delete error surface (single toast slot, last error wins).
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  // Phase 30-02 (DEBT-02): AddSheet submit bumps this token via V10MainShell
  // → RefetchTokenProvider → useRefetchToken. Including it in the fetch-effect
  // deps array refreshes the registry immediately after a new tx is created.
  // Falls back to `0` outside the provider (unit tests rendering Mount alone).
  const refetchToken = useRefetchToken();

  // Phase P2 (period switching): viewed period from the provider (null when
  // rendered standalone — unit tests — so we fall back to getCurrentPeriod).
  const sel = useSelectedPeriodOptional();
  const selectedPeriodId = sel?.selectedPeriodId ?? null;
  const selectedPeriod = useMemo(
    () => sel?.periods.find((p) => p.id === selectedPeriodId) ?? null,
    [sel, selectedPeriodId],
  );

  // ─────────── fetch (useResource) ───────────
  // keepPreviousData: a period switch / refetch-token bump keeps the previous
  // registry on screen (status stays 'ready', `refreshing` flips true) instead
  // of flashing the full-screen loading plate. The initial mount still loads.
  const fetchTransactions = useCallback(
    async (isCancelled: () => boolean): Promise<DataPayload> => {
      const [accounts, categories] = await Promise.all([
        listAccounts(),
        listCategoriesV10(),
      ]);
      // With the provider: the viewed period. Without it (standalone unit
      // tests): legacy getCurrentPeriod() (returns null on 404).
      const period: PeriodRead | null = sel
        ? selectedPeriod
        : await getCurrentPeriod();
      if (isCancelled()) return { accounts, categories, actuals: [], period };
      const actuals: ActualV10Read[] = period
        ? await listActualV10(period.id)
        : [];
      return { accounts, categories, actuals, period };
    },
    // selectedPeriod/sel are the fetch inputs; refetchToken (external bump) and
    // selectedPeriodId (switch) drive re-fetch via the deps below.
    [sel, selectedPeriod],
  );

  // selectedPeriodId in deps: switching the viewed period re-fetches.
  // refetchToken in deps: external bump (AddSheet submit) re-runs the fetch.
  const { status, data, error, reload, refreshing } = useResource<DataPayload>(
    fetchTransactions,
    [refetchToken, selectedPeriodId, selectedPeriod, sel],
    { keepPreviousData: true },
  );

  // Stable today reference for the duration of this render — recreated each
  // render is fine (Date construction is cheap; useMemo would over-engineer).
  const today = useMemo(() => new Date(), []);

  // ─────────── computed view-model ───────────
  const vm = useMemo(() => {
    if (data === null) return null;
    const { accounts, categories, actuals, period } = data;
    const filtered = applyFilterChip(actuals, categories, chip);
    // Phase P2: group-by-day reference = the viewed period, not always today.
    // For the active period `today` lies inside it → «Сегодня»/«Вчера» labels
    // work as before. For a PAST/closed period today is outside the range, so
    // we anchor the relative labels to the period_end (its last day) — the
    // most-recent day of that period reads «Сегодня»-relative correctly.
    const groupRef =
      period && period.status !== 'active'
        ? parseLocalDateTx(period.period_end)
        : today;
    const dayGroups = groupByDay(filtered, groupRef);
    const summary = computeHeaderSummary(filtered);
    return { accounts, categories, dayGroups, summary, period };
  }, [data, chip, today]);

  // ─────────── handlers ───────────
  const handleChipChange = useCallback((c: TxFilterChip) => setChip(c), []);
  const handleRowTap = useCallback((tx: ActualV10Read) => setEditingTx(tx), []);
  const handleRowDelete = useCallback(
    async (tx: ActualV10Read) => {
      // View already gates intent (swipe / context-menu) — fire the DELETE directly.
      try {
        await deleteActual(tx.id);
        reload();
      } catch {
        setToastMsg('Не удалось удалить операцию — попробуйте снова');
      }
    },
    [reload],
  );
  const handleBack = useCallback(() => {
    if (router.canPop) router.pop();
  }, [router]);
  const handleEditClose = useCallback(() => setEditingTx(null), []);

  // Phase 30-02 (DEBT-02): hidden sentinel surfacing the current refetchToken.
  // Same role as in HomeMount — lets tests assert «registry re-fetched after
  // AddSheet submit» without inspecting fetch mocks. Hidden via inline style.
  const refetchSentinel = (
    <span
      data-testid="parent-refetched"
      data-refetch-token={refetchToken}
      // Phase 31: keepPreviousData surfaces a subtle 'refreshing' flag during a
      // period switch / refetch bump (previous data stays on screen). We expose
      // it on the hidden sentinel — zero visual impact, assertable in tests.
      data-refreshing={refreshing ? '1' : '0'}
      style={{ display: 'none' }}
      aria-hidden="true"
    />
  );

  // ─────────── render ───────────
  // keepPreviousData: once we have a vm we keep rendering it through a
  // re-fetch (status may briefly be 'loading' on a non-kept path, but with
  // keepPreviousData the previous data stays — see useResource). The full
  // loading plate only shows on the very first cold load.
  if (status === 'loading' && !vm) {
    return (
      <>
        {refetchSentinel}
        <StatePlate variant="loading" />
      </>
    );
  }
  if (status === 'error') {
    return (
      <>
        {refetchSentinel}
        <StatePlate
          variant="error"
          message={error ?? 'Не удалось загрузить транзакции'}
          onRetry={reload}
        />
      </>
    );
  }
  if (!vm) return refetchSentinel;

  // Liquid Glass native shell → native iOS Transactions view.
  return (
    <>
      {refetchSentinel}
      <NativeTransactionsView
        headerCount={vm.summary.count}
        headerSumCents={vm.summary.sumCents}
        filterChip={chip}
        onChipChange={handleChipChange}
        dayGroups={vm.dayGroups}
        categories={vm.categories}
        accounts={vm.accounts}
        onRowTap={handleRowTap}
        onRowDelete={handleRowDelete}
        onBack={handleBack}
        periods={sel?.periods}
        selectedPeriodId={selectedPeriodId}
        onSelectPeriod={sel?.setSelectedPeriodId}
      />
      <PosterSheet
        isOpen={editingTx !== null}
        onClose={handleEditClose}
        backgroundColor="var(--lgn-card-solid)"
        testId="tx-edit-sheet"
      >
        <EditPlaceholder tx={editingTx} onClose={handleEditClose} />
      </PosterSheet>
      <NativeToast
        message={toastMsg ?? ''}
        visible={toastMsg !== null}
        onDismiss={() => setToastMsg(null)}
        duration={4000}
      />
    </>
  );
}

// ─────────────────── Edit placeholder ───────────────────

interface EditPlaceholderProps {
  tx: ActualV10Read | null;
  onClose: () => void;
}

/**
 * Phase 25-08 stub for the transaction-edit modal. Real poster-styled
 * `TransactionEditor` retrofit lands in Phase 26 per CONTEXT D-Defer
 * (lines: «TransactionEditor poster retrofit — fall back to existing
 * v0.x editor wrapped in PosterSheet for Phase 25; full poster-styled
 * editor in Phase 26 if time permits»).
 */
function EditPlaceholder({ tx, onClose }: EditPlaceholderProps) {
  return (
    <div
      style={{
        padding: '24px 20px 32px',
        color: 'var(--lgn-ink)',
        fontFamily: 'var(--lgn-font), system-ui, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div
        style={{
          font: 'var(--lgn-t-footnote)',
          color: 'var(--lgn-ink-2)',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        Редактировать операцию
      </div>
      <div style={{ font: 'var(--lgn-t-title2)' }}>Скоро —</div>
      <div style={{ font: 'var(--lgn-t-subhead)', color: 'var(--lgn-ink-2)' }}>
        Редактор операции в разработке{tx ? ` · #${tx.id}` : ''}.
      </div>
      <div style={{ marginTop: 8 }}>
        <NativeButton onClick={onClose} variant="primary">
          Закрыть
        </NativeButton>
      </div>
    </div>
  );
}
