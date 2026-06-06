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

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from 'react';
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
import { Eyebrow, PosterButton, Toast } from '../../componentsV10';
import {
  PosterSheet,
  useRefetchToken,
  usePosterRouter,
  useSelectedPeriodOptional,
} from '../common';
import { TransactionsView } from './TransactionsView';
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

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: DataPayload };

// ─────────────────── Component ───────────────────

export function TransactionsMount() {
  const router = usePosterRouter();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);
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

  // ─────────── fetch effect ───────────
  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    async function load() {
      try {
        const [accounts, categories] = await Promise.all([
          listAccounts(),
          listCategoriesV10(),
        ]);
        // With the provider: the viewed period. Without it (standalone unit
        // tests): legacy getCurrentPeriod() (returns null on 404).
        const period: PeriodRead | null = sel
          ? selectedPeriod
          : await getCurrentPeriod();
        const actuals: ActualV10Read[] = period
          ? await listActualV10(period.id)
          : [];
        if (cancelled) return;
        setState({
          status: 'ready',
          data: { accounts, categories, actuals, period },
        });
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error
            ? err.message
            : 'Не удалось загрузить транзакции';
        setState({ status: 'error', message });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // selectedPeriodId in deps: switching the viewed period re-fetches.
    // refetchToken in deps: external bump (AddSheet submit) re-runs the fetch.
  }, [reloadToken, refetchToken, selectedPeriodId, selectedPeriod, sel]);

  // Stable today reference for the duration of this render — recreated each
  // render is fine (Date construction is cheap; useMemo would over-engineer).
  const today = useMemo(() => new Date(), []);

  // ─────────── computed view-model ───────────
  const vm = useMemo(() => {
    if (state.status !== 'ready') return null;
    const { accounts, categories, actuals, period } = state.data;
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
  }, [state, chip, today]);

  // ─────────── handlers ───────────
  const handleChipChange = useCallback((c: TxFilterChip) => setChip(c), []);
  const handleRowTap = useCallback((tx: ActualV10Read) => setEditingTx(tx), []);
  const handleRowDelete = useCallback(async (tx: ActualV10Read) => {
    // View already gates intent (swipe / context-menu) — fire the DELETE directly.
    try {
      await deleteActual(tx.id);
      setReloadToken((t) => t + 1);
    } catch {
      setToastMsg('Не удалось удалить операцию — попробуйте снова');
    }
  }, []);
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
      style={{ display: 'none' }}
      aria-hidden="true"
    />
  );

  // ─────────── render ───────────
  if (state.status === 'loading') {
    return (
      <>
        {refetchSentinel}
        <LoadingPlate />
      </>
    );
  }
  if (state.status === 'error') {
    return (
      <>
        {refetchSentinel}
        <ErrorPlate
          message={state.message}
          onRetry={() => setReloadToken((t) => t + 1)}
        />
      </>
    );
  }
  if (!vm) return refetchSentinel;

  return (
    <>
      {refetchSentinel}
      <TransactionsView
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
        // Phase P2 (period switching): switcher renders only with ≥2 periods.
        periods={sel?.periods}
        selectedPeriodId={selectedPeriodId}
        onSelectPeriod={sel?.setSelectedPeriodId}
      />
      <PosterSheet
        isOpen={editingTx !== null}
        onClose={handleEditClose}
        backgroundColor="var(--poster-paper)"
        testId="tx-edit-sheet"
      >
        <EditPlaceholder tx={editingTx} onClose={handleEditClose} />
      </PosterSheet>
      <Toast
        message={toastMsg ?? ''}
        visible={toastMsg !== null}
        onDismiss={() => setToastMsg(null)}
        duration={4000}
      />
    </>
  );
}

// ─────────────────── Loading / Error / Edit placeholders ───────────────────

const fillStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'var(--poster-cobalt)',
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
          fontFamily:
            'var(--poster-font-jet-brains-mono), ui-monospace, monospace',
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
          fontFamily:
            'var(--poster-font-jet-brains-mono), ui-monospace, monospace',
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
        padding: '56px 22px',
        color: 'var(--poster-cobalt)',
        fontFamily: 'var(--poster-font-manrope), system-ui, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <Eyebrow color="var(--poster-cobalt)">EDIT TRANSACTION</Eyebrow>
      <div
        style={{
          fontFamily:
            'var(--poster-font-dm-serif), var(--poster-font-pt-serif), Georgia, serif',
          fontStyle: 'italic',
          fontSize: 32,
          lineHeight: 1.05,
        }}
      >
        Редактировать —
      </div>
      <div
        style={{
          fontFamily:
            'var(--poster-font-jet-brains-mono), ui-monospace, monospace',
          fontSize: 11,
          opacity: 0.7,
          letterSpacing: '0.06em',
        }}
      >
        WIP — TransactionEditor poster retrofit ships in Phase 26
        {tx ? ` · TX #${tx.id}` : ''}.
      </div>
      <div style={{ marginTop: 12 }}>
        <PosterButton onClick={onClose} variant="primary">
          ЗАКРЫТЬ
        </PosterButton>
      </div>
    </div>
  );
}
