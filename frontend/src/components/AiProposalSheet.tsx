/**
 * Bottom-sheet that surfaces an AI-prepared transaction proposal for
 * user review/approval. Reuses the unified TransactionEditor (entity="actual"
 * для actual, entity="planned" для planned), pre-filling it from the
 * proposal payload streamed via the SSE 'propose' event. The user edits as
 * needed and confirms via the normal POST endpoints — AI never silently
 * writes to the DB.
 */
import { useEffect, useState } from 'react';
import type { ProposalPayload, CategoryRead, PeriodRead } from '../api/types';
import { listCategories } from '../api/categories';
import { listPeriods } from '../api/periods';
import { createActual } from '../api/actual';
import { createPlanned } from '../api/planned';
import { BottomSheet } from './BottomSheet';
import { TransactionEditor } from './TransactionEditor';

export interface AiProposalSheetProps {
  proposal: ProposalPayload | null;
  onClose: () => void;
  /** Optional callback fired after a successful save (e.g. show toast). */
  onSaved?: (kind: 'actual' | 'planned') => void;
  /** Prefetched dropdowns from the parent screen — lets the sheet open
   *  instantly without an internal load round-trip. Falls back to its own
   *  fetch if absent (keeps the component reusable from other contexts). */
  prefetchedCategories?: CategoryRead[];
  prefetchedPeriods?: PeriodRead[];
}

export function AiProposalSheet({
  proposal,
  onClose,
  onSaved,
  prefetchedCategories,
  prefetchedPeriods,
}: AiProposalSheetProps) {
  const [categories, setCategories] = useState<CategoryRead[] | null>(
    prefetchedCategories ?? null,
  );
  const [activePeriod, setActivePeriod] = useState<PeriodRead | null>(
    prefetchedPeriods?.find((p) => p.status === 'active') ?? null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!proposal) return;
    // Fast path — parent screen already prefetched. No fetch, no flicker.
    if (prefetchedCategories && prefetchedPeriods) {
      setCategories(prefetchedCategories);
      setActivePeriod(
        prefetchedPeriods.find((p) => p.status === 'active') ?? null,
      );
      setLoadError(null);
      return;
    }
    // Fallback: standalone usage without prefetched props.
    let cancelled = false;
    setLoadError(null);
    setCategories(null);
    setActivePeriod(null);

    Promise.all([listCategories(), listPeriods()])
      .then(([cats, periods]) => {
        if (cancelled) return;
        setCategories(cats);
        const active = periods.find((p) => p.status === 'active') ?? null;
        setActivePeriod(active);
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      });

    return () => {
      cancelled = true;
    };
  }, [proposal, prefetchedCategories, prefetchedPeriods]);

  if (!proposal) return null;

  const isActual = proposal.kind_of === 'actual';
  const title = isActual ? 'AI: новая трата — проверь' : 'AI: пункт плана — проверь';

  return (
    <BottomSheet open={true} onClose={onClose} title={title}>
      {loadError && (
        <p style={{ color: 'var(--danger, #D8404B)' }}>
          Не удалось загрузить данные: {loadError}
        </p>
      )}
      {!loadError && categories === null && <p>Загрузка…</p>}
      {!loadError && categories !== null && proposal.kind_of === 'actual' && (
        <TransactionEditor
          entity="actual"
          initial={{
            kind: proposal.txn.kind,
            amount_cents: proposal.txn.amount_cents,
            description: proposal.txn.description,
            category_id: proposal.txn.category_id ?? undefined,
            tx_date: proposal.txn.tx_date,
          }}
          categories={categories}
          onSave={async (data) => {
            if (!data.kind || !data.tx_date) return;
            await createActual({
              kind: data.kind,
              amount_cents: data.amount_cents,
              description: data.description,
              category_id: data.category_id,
              tx_date: data.tx_date,
            });
            onSaved?.('actual');
            onClose();
          }}
          onCancel={onClose}
          aiEnabled={false}
        />
      )}
      {!loadError && categories !== null && proposal.kind_of === 'planned' && (
        activePeriod === null ? (
          <p>Активный период не найден — план добавить нельзя.</p>
        ) : (
          <TransactionEditor
            entity="planned"
            kind={proposal.txn.kind}
            initial={{
              category_id: proposal.txn.category_id ?? undefined,
              amount_cents: proposal.txn.amount_cents,
              description: proposal.txn.description,
              planned_date: proposal.txn.day_of_period
                ? buildPlannedDate(activePeriod.period_start, proposal.txn.day_of_period)
                : null,
            }}
            categories={categories}
            periodBounds={{
              start: activePeriod.period_start,
              end: activePeriod.period_end,
            }}
            onSave={async (data) => {
              if (!data.category_id) return;
              await createPlanned(activePeriod.id, {
                kind: proposal.txn.kind,
                amount_cents: data.amount_cents,
                description: data.description,
                category_id: data.category_id,
                planned_date: data.planned_date ?? null,
              });
              onSaved?.('planned');
              onClose();
            }}
            onCancel={onClose}
          />
        )
      )}
    </BottomSheet>
  );
}

/** Build an ISO date inside the active period from a 1-based day-of-month. */
function buildPlannedDate(periodStart: string, day: number): string {
  // periodStart is YYYY-MM-DD; replace last two digits with the desired day,
  // clamped into the period's month. TransactionEditor will validate against
  // periodBounds and surface an error if we somehow drift outside.
  const [y, m] = periodStart.split('-');
  const dd = String(Math.max(1, Math.min(31, day))).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
