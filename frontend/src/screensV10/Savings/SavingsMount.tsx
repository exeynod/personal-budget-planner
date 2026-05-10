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
// Failure mode: window.alert (parity with SubscriptionsMount + Plan 28
// polish will replace with PosterToast).

import { useCallback, useEffect, useState } from 'react';
import {
  fetchSavingsSummary,
  patchSavingsConfig,
  postDeposit,
  createGoal,
  listAccounts,
  type SavingsSnapshot,
  type AccountResponse,
} from '../../api/v10';
import { usePosterRouter, PosterSheet } from '../common';
import { SavingsView } from './SavingsView';
import { NewGoalSheet } from './NewGoalSheet';
import { DepositSheet } from './DepositSheet';

type SheetMode =
  | { kind: 'none' }
  | { kind: 'newGoal' }
  | { kind: 'deposit'; goalId: number | null };

export function SavingsMount() {
  const router = usePosterRouter();

  const [snapshot, setSnapshot] = useState<SavingsSnapshot | null>(null);
  const [accounts, setAccounts] = useState<AccountResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [sheet, setSheet] = useState<SheetMode>({ kind: 'none' });
  const [submitting, setSubmitting] = useState(false);

  // ─────────── fetch effect ───────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([fetchSavingsSummary(), listAccounts()])
      .then(([snap, accs]) => {
        if (cancelled) return;
        setSnapshot(snap);
        setAccounts(accs);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(
          e instanceof Error ? e.message : 'Не удалось загрузить копилку',
        );
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  // ─────────── PATCH /savings/config (optimistic) ───────────
  const handleToggleRoundup = useCallback(
    async (enabled: boolean) => {
      if (!snapshot) return;
      // Optimistic update so toggle flips instantly.
      setSnapshot({
        ...snapshot,
        config: { ...snapshot.config, roundup_enabled: enabled },
      });
      try {
        const cfg = await patchSavingsConfig({ roundup_enabled: enabled });
        setSnapshot((s) => (s ? { ...s, config: cfg } : s));
      } catch {
        if (typeof window !== 'undefined') {
          window.alert('Не удалось переключить округление — попробуйте снова');
        }
        setReloadToken((n) => n + 1);
      }
    },
    [snapshot],
  );

  const handleSelectBase = useCallback(
    async (base: 10 | 50 | 100) => {
      if (!snapshot) return;
      setSnapshot({
        ...snapshot,
        config: { ...snapshot.config, roundup_base: base },
      });
      try {
        const cfg = await patchSavingsConfig({ roundup_base: base });
        setSnapshot((s) => (s ? { ...s, config: cfg } : s));
      } catch {
        if (typeof window !== 'undefined') {
          window.alert('Не удалось сменить базу округления');
        }
        setReloadToken((n) => n + 1);
      }
    },
    [snapshot],
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
        setReloadToken((n) => n + 1);
      } catch {
        if (typeof window !== 'undefined') {
          window.alert('Не удалось создать цель');
        }
      } finally {
        setSubmitting(false);
      }
    },
    [],
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
        setReloadToken((n) => n + 1);
      } catch {
        if (typeof window !== 'undefined') {
          window.alert('Не удалось пополнить копилку');
        }
      } finally {
        setSubmitting(false);
      }
    },
    [],
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
        onContributeToGoal={(goalId) =>
          setSheet({ kind: 'deposit', goalId })
        }
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
    </>
  );
}
