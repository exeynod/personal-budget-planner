// Phase 27-03 (SAV-V10-01..04): SavingsMount — data-fetcher + sheet wiring.
//
// Lifecycle:
//   1. On mount, parallel Promise.all([fetchSavingsSummary, listAccounts]).
//   2. Render <SavingsView> wired with snapshot + handlers.
//   3. Sheet state machine: 'none' | 'newGoal' | 'deposit' (with optional
//      preselected goalId from a card tap).
//   4. Mutations: PATCH /savings/config (toggle + base, optimistic),
//      POST /goals (NewGoalSheet save), POST /savings/deposit (DepositSheet save).
//   5. After successful POST: bump reload-token → effect refetches snapshot.
//
// Failure mode (P2-11 / R5): mutation errors surface via <Toast> (single slot,
// last error wins) — parity with SubscriptionsMount; replaces the old alert.

import { useCallback, useState } from 'react';
import { Toast } from '../../componentsV10';
import {
  fetchSavingsSummary,
  patchSavingsConfig,
  postDeposit,
  createGoal,
  listAccounts,
  type SavingsSnapshot,
  type AccountResponse,
} from '../../api/v10';
import { usePosterRouter, PosterSheet, useResource } from '../common';
import { SavingsView } from './SavingsView';
import { NewGoalSheet } from './NewGoalSheet';
import { DepositSheet } from './DepositSheet';

type SheetMode =
  | { kind: 'none' }
  | { kind: 'newGoal' }
  | { kind: 'deposit'; goalId: number | null };

interface SavingsPayload {
  snapshot: SavingsSnapshot;
  accounts: AccountResponse[];
}

export function SavingsMount() {
  const router = usePosterRouter();

  const [sheet, setSheet] = useState<SheetMode>({ kind: 'none' });
  const [submitting, setSubmitting] = useState(false);
  // P2-11: mutation error surface (single toast slot, last error wins).
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // ─────────── fetch (useResource) ───────────
  const fetchSavings = useCallback(async (): Promise<SavingsPayload> => {
    const [snapshot, accounts] = await Promise.all([
      fetchSavingsSummary(),
      listAccounts(),
    ]);
    return { snapshot, accounts };
  }, []);

  const { status, data, error, reload, setData } = useResource<SavingsPayload>(
    fetchSavings,
    [],
  );
  const loading = status === 'loading';
  const snapshot = data?.snapshot ?? null;
  const accounts = data?.accounts ?? [];

  // Patch only the snapshot inside the loaded payload (optimistic mutations).
  const patchSnapshot = useCallback(
    (next: SavingsSnapshot) => {
      setData((d) => (d ? { ...d, snapshot: next } : d));
    },
    [setData],
  );

  // ─────────── PATCH /savings/config (optimistic) ───────────
  const handleToggleRoundup = useCallback(
    async (enabled: boolean) => {
      if (!snapshot) return;
      // Optimistic update so toggle flips instantly.
      patchSnapshot({
        ...snapshot,
        config: { ...snapshot.config, roundup_enabled: enabled },
      });
      try {
        const cfg = await patchSavingsConfig({ roundup_enabled: enabled });
        patchSnapshot({ ...snapshot, config: cfg });
      } catch {
        setToastMsg('Не удалось переключить округление — попробуйте снова');
        reload();
      }
    },
    [snapshot, patchSnapshot, reload],
  );

  const handleSelectBase = useCallback(
    async (base: 10 | 50 | 100) => {
      if (!snapshot) return;
      patchSnapshot({
        ...snapshot,
        config: { ...snapshot.config, roundup_base: base },
      });
      try {
        const cfg = await patchSavingsConfig({ roundup_base: base });
        patchSnapshot({ ...snapshot, config: cfg });
      } catch {
        setToastMsg('Не удалось сменить базу округления');
        reload();
      }
    },
    [snapshot, patchSnapshot, reload],
  );

  // ─────────── POST /goals ───────────
  const handleCreateGoal = useCallback(
    async (payload: {
      name: string;
      target_cents: number;
      due: string | null;
    }) => {
      setSubmitting(true);
      try {
        await createGoal(payload);
        setSheet({ kind: 'none' });
        reload();
      } catch {
        setToastMsg('Не удалось создать цель');
      } finally {
        setSubmitting(false);
      }
    },
    [reload],
  );

  // ─────────── POST /savings/deposit ───────────
  const handleDeposit = useCallback(
    async (payload: {
      amount_cents: number;
      account_id: number;
      goal_id: number | null;
    }) => {
      setSubmitting(true);
      try {
        await postDeposit(payload);
        setSheet({ kind: 'none' });
        reload();
      } catch {
        setToastMsg('Не удалось пополнить копилку');
      } finally {
        setSubmitting(false);
      }
    },
    [reload],
  );

  return (
    <>
      <SavingsView
        snapshot={snapshot}
        loading={loading}
        error={error}
        onToggleRoundup={handleToggleRoundup}
        onSelectBase={handleSelectBase}
        onAddGoal={() => setSheet({ kind: 'newGoal' })}
        onDeposit={() => setSheet({ kind: 'deposit', goalId: null })}
        onContributeToGoal={(goalId) => setSheet({ kind: 'deposit', goalId })}
        canPop={router.canPop}
        onBack={() => router.pop()}
      />
      <PosterSheet
        isOpen={sheet.kind === 'newGoal'}
        onClose={() => setSheet({ kind: 'none' })}
        backgroundColor="var(--poster-paper)"
        testId="savings-new-goal-sheet"
      >
        <NewGoalSheet
          onSave={handleCreateGoal}
          onClose={() => setSheet({ kind: 'none' })}
          submitting={submitting}
        />
      </PosterSheet>
      <PosterSheet
        isOpen={sheet.kind === 'deposit'}
        onClose={() => setSheet({ kind: 'none' })}
        backgroundColor="var(--poster-paper)"
        testId="savings-deposit-sheet"
      >
        <DepositSheet
          accounts={accounts}
          goals={snapshot?.goals ?? []}
          initialGoalId={sheet.kind === 'deposit' ? sheet.goalId : null}
          onSave={handleDeposit}
          onClose={() => setSheet({ kind: 'none' })}
          submitting={submitting}
        />
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
