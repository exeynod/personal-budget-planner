// ADR-0008 — monthly planning gate (full interstitial).
//
// Rendered by NativeShell when the home bootstrap reports `needs_planning` (gate
// mode), and from the Management hub «Спланировать» row at any time (manual
// mode). It is a FULL-screen liquid_glass interstitial that hosts its OWN
// PosterRouterProvider, so the user can push the existing plan / template
// editors (PlanMount → PlanCategoryDetailMount, TemplateMount) and pop back
// WITHOUT leaving the gate.
//
// Sections (ADR-0008 §Состав экрана):
//   1. «Провести сейчас» — due-today / overdue recurring payments, REUSING the
//      Home RecurringDuePrompt (pay / skip / postpone). Hidden when empty.
//   2. «План месяца» — summary (доход / Σ лимитов / осталось распределить) with
//      a CTA «Расписать план» that pushes PlanMount inside the gate's router,
//      plus a «Шаблон месяца» entry into TemplateMount.
//   3. «Готово» (pinned bottom) — POST /periods/{id}/confirm-plan, then signals
//      NativeShell to lift the gate (gate mode) or closes (manual mode).
//
// Modes:
//   - 'gate'   : no escape affordance; the only way out is «Готово» (which the
//                shell turns into a bootstrap refetch → gate lifts).
//   - 'manual' : closeable (the period may already be planned); «Готово» is
//                still confirm-plan (idempotent).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, CaretRight } from '@phosphor-icons/react';
import {
  PosterRouterProvider,
  PosterSheet,
  RefetchTokenProvider,
  StatePlate,
  usePosterRouter,
  useRefetchToken,
  useSelectedPeriodOptional,
} from '../common';
import { SectionHeader, InsetGroup } from '../native/NativePrimitives';
import { formatMoneyRubNative } from '../native/money';
import {
  AddSheetHostProvider,
  type AddSheetMode,
  type AddSheetKind,
} from '../native/AddSheetHost';
import { NativeAddSheet } from '../AddSheet';
import { RecurringDuePrompt } from '../Recurring/RecurringDuePrompt';
import { PlanMount } from '../Plan';
import { TemplateMount } from '../Management/TemplateMount';
import {
  listCategoriesV10,
  listPlanned,
  listRecurringDue,
  payRecurring,
  skipRecurring,
  postponeRecurring,
  type CategoryV10,
  type PlannedV11Read,
  type RecurringDueRow,
} from '../../api/v10';
import { getCurrentPeriod, confirmPlan } from '../../api/periods';
import type { PeriodRead } from '../../api/types';
import { periodMonthLabel } from './planningFormat';
import styles from './PlanningGate.module.css';

export type PlanningGateMode = 'gate' | 'manual';

export interface PlanningGateProps {
  /** Period being planned. Optional in manual launch when not yet resolved. */
  period?: PeriodRead | null;
  mode: PlanningGateMode;
  /** Called after «Готово» confirms (gate mode → lift gate; manual → close). */
  onDone: () => void;
  /** Called when the user closes the gate WITHOUT confirming (manual only). */
  onClose?: () => void;
}

// ─────────────────── Gate body (router root) ───────────────────

interface PlanData {
  incomePlannedCents: number;
  expenseLimitsCents: number;
  remainingToDistributeCents: number;
}

function PlanningGateBody({
  period,
  mode,
  onDone,
  onClose,
}: PlanningGateProps) {
  const router = usePosterRouter();
  const sel = useSelectedPeriodOptional();
  const refetchToken = useRefetchToken();

  // Resolve the period whose plan we confirm: prop → shell-selected → current.
  const [resolvedPeriod, setResolvedPeriod] = useState<PeriodRead | null>(
    period ?? null,
  );
  const [categories, setCategories] = useState<CategoryV10[]>([]);
  const [planned, setPlanned] = useState<PlannedV11Read[]>([]);
  const [recurringDue, setRecurringDue] = useState<RecurringDueRow[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [reloadToken, setReloadToken] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    async function load() {
      try {
        // Period: prop wins, else shell-selected active, else getCurrentPeriod.
        let p: PeriodRead | null = period ?? null;
        if (p == null && sel != null) {
          p =
            sel.periods.find((x) => x.id === sel.selectedPeriodId) ??
            sel.periods.find((x) => x.status === 'active') ??
            sel.periods[0] ??
            null;
        }
        if (p == null) p = await getCurrentPeriod();

        const cats = await listCategoriesV10();
        const plannedRows = p ? await listPlanned(p.id) : [];
        // Recurring due is best-effort — a failure leaves the section empty.
        let due: RecurringDueRow[] = [];
        try {
          due = await listRecurringDue();
        } catch {
          due = [];
        }

        if (cancelled) return;
        setResolvedPeriod(p);
        setCategories(cats);
        setPlanned(plannedRows);
        setRecurringDue(due);
        setStatus('ready');
      } catch {
        if (cancelled) return;
        setStatus('error');
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [period, sel, reloadToken, refetchToken]);

  // ── Plan summary (reuse the PlanMount/computePlan framing) ──
  const planData = useMemo<PlanData>(() => {
    const incomeIds = new Set(
      categories.filter((c) => c.kind === 'income').map((c) => c.id),
    );
    // Σ planned income (unposted) — the distributable denominator (mirrors
    // PlanMount.incomePlannedCents).
    let incomePlannedCents = 0;
    for (const pl of planned) {
      if (pl.kind !== 'income' || !incomeIds.has(pl.category_id)) continue;
      if (pl.posted_txn_id == null)
        incomePlannedCents += Math.abs(pl.amount_cents);
    }
    // Σ expense limits = Σ category.plan_cents (excl. system savings).
    const expenseLimitsCents = categories
      .filter((c) => c.kind === 'expense' && c.code !== 'savings')
      .reduce((s, c) => s + (c.plan_cents ?? 0), 0);
    const remainingToDistributeCents = incomePlannedCents - expenseLimitsCents;
    return {
      incomePlannedCents,
      expenseLimitsCents,
      remainingToDistributeCents,
    };
  }, [categories, planned]);

  // ── Recurring actions (mirror HomeMount) ──
  const reload = useCallback(() => setReloadToken((t) => t + 1), []);
  const onPay = useCallback(
    async (plannedId: number, amountCents?: number) => {
      try {
        await payRecurring(
          plannedId,
          amountCents != null ? { amount_cents: amountCents } : {},
        );
      } catch {
        /* reload re-syncs */
      } finally {
        reload();
      }
    },
    [reload],
  );
  const onSkip = useCallback(
    async (plannedId: number) => {
      try {
        await skipRecurring(plannedId);
      } catch {
        /* reload re-syncs */
      } finally {
        reload();
      }
    },
    [reload],
  );
  const onPostpone = useCallback(
    async (plannedId: number, newDate: string) => {
      try {
        await postponeRecurring(plannedId, newDate);
      } catch {
        /* reload re-syncs */
      } finally {
        reload();
      }
    },
    [reload],
  );

  // ── «Готово» → confirm-plan ──
  const onConfirm = useCallback(async () => {
    if (confirming) return;
    setConfirming(true);
    setConfirmError(null);
    try {
      if (resolvedPeriod != null) {
        await confirmPlan(resolvedPeriod.id);
      }
      onDone();
    } catch {
      setConfirmError('Не удалось подтвердить план. Попробуйте ещё раз.');
      setConfirming(false);
    }
  }, [confirming, resolvedPeriod, onDone]);

  const openPlanEditor = useCallback(() => {
    router.push(<PlanMount />);
  }, [router]);
  const openTemplate = useCallback(() => {
    router.push(<TemplateMount />);
  }, [router]);

  const monthLabel = periodMonthLabel(resolvedPeriod?.period_start);
  const remaining = planData.remainingToDistributeCents;

  if (status === 'loading') {
    return (
      <div className={styles.root} data-testid="planning-gate">
        <StatePlate variant="loading" testId="planning-gate-loading" />
      </div>
    );
  }

  return (
    <div className={styles.root} data-testid="planning-gate">
      <div className={styles.scroll}>
        <div className={styles.body}>
          {/* Header */}
          <div className={styles.header}>
            <div className={styles.headerText}>
              <div className={styles.eyebrow}>Пора спланировать месяц</div>
              <h1 className={styles.title}>План на {monthLabel}</h1>
              <p className={styles.subtitle}>
                Проведите регулярные платежи и распишите план — затем нажмите
                «Готово».
              </p>
            </div>
            {mode === 'manual' && (
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => onClose?.()}
                aria-label="Закрыть"
                data-testid="planning-gate-close"
              >
                <X size={18} weight="bold" />
              </button>
            )}
          </div>

          {status === 'error' && (
            <div
              className={styles.errorBanner}
              data-testid="planning-gate-error"
            >
              Не удалось загрузить данные. Можно всё равно нажать «Готово».
            </div>
          )}

          {/* 1. Провести сейчас — due recurring (hidden when empty). */}
          {recurringDue.length > 0 && (
            <div data-testid="planning-gate-recurring">
              <SectionHeader>Провести сейчас</SectionHeader>
              <RecurringDuePrompt
                due={recurringDue}
                categories={categories}
                periodStart={resolvedPeriod?.period_start ?? null}
                periodEnd={resolvedPeriod?.period_end ?? null}
                onPay={onPay}
                onSkip={onSkip}
                onPostpone={onPostpone}
              />
            </div>
          )}

          {/* 2. План месяца — summary + CTAs into the editors. */}
          <SectionHeader>План месяца</SectionHeader>
          <InsetGroup>
            <div className={styles.summaryRows}>
              <div className={styles.summaryRow}>
                <span className={styles.summaryLabel}>Плановый доход</span>
                <span className={styles.summaryValue}>
                  {formatMoneyRubNative(planData.incomePlannedCents)}
                </span>
              </div>
              <div className={styles.summaryRow}>
                <span className={styles.summaryLabel}>Сумма лимитов</span>
                <span className={styles.summaryValue}>
                  {formatMoneyRubNative(planData.expenseLimitsCents)}
                </span>
              </div>
              <div className={styles.summaryRow}>
                <span className={styles.summaryLabel}>
                  {remaining < 0 ? 'Превышение' : 'Осталось распределить'}
                </span>
                <span
                  className={`${styles.summaryValue} ${
                    remaining < 0 ? styles.summaryValueWarn : ''
                  }`}
                  data-testid="planning-gate-remaining"
                >
                  {formatMoneyRubNative(Math.abs(remaining))}
                </span>
              </div>
            </div>
          </InsetGroup>
          {planData.incomePlannedCents === 0 && (
            <div className={styles.summaryHint}>
              Добавьте плановые доходы, чтобы видеть, сколько можно
              распределить.
            </div>
          )}

          <InsetGroup>
            <button
              type="button"
              className={styles.cardCta}
              onClick={openPlanEditor}
              data-testid="planning-gate-open-plan"
            >
              Расписать план
              <span className={styles.cardCtaChevron}>
                <CaretRight size={16} weight="bold" />
              </span>
            </button>
            <button
              type="button"
              className={styles.cardCta}
              onClick={openTemplate}
              data-testid="planning-gate-open-template"
            >
              Шаблон месяца
              <span className={styles.cardCtaChevron}>
                <CaretRight size={16} weight="bold" />
              </span>
            </button>
          </InsetGroup>
        </div>
      </div>

      {/* Pinned «Готово». */}
      <div className={styles.footer}>
        {confirmError && (
          <div className={styles.errorBanner}>{confirmError}</div>
        )}
        <button
          type="button"
          className={styles.doneBtn}
          onClick={onConfirm}
          disabled={confirming}
          data-testid="planning-gate-done"
        >
          {confirming ? '…' : 'Готово'}
        </button>
      </div>
    </div>
  );
}

// ─────────────────── Mount (owns the gate's router) ───────────────────

/**
 * The gate hosts its OWN PosterRouterProvider whose root is the gate body, so
 * pushed editors (PlanMount, TemplateMount) render INSIDE the interstitial and
 * pop back to the gate. NativeShell renders <PlanningGate> instead of
 * <NativeChrome>; the gate therefore replaces the whole tab shell.
 *
 * Bug fix (add/edit/delete planned while gated): the shell's AddSheet is NOT
 * mounted in the gated branch, so inside the gate «Добавить в план» opened
 * nothing and there was no way to edit/delete a planned row. The gate therefore
 * hosts its OWN AddSheet (add/edit/delete planned) + a gate-local refetch token
 * the sheet bumps on submit so the pushed PlanMount / PlanCategoryDetailMount
 * reload and reflect the change.
 */
export function PlanningGate(props: PlanningGateProps) {
  const [isAddOpen, setAddOpen] = useState(false);
  const [addMode, setAddMode] = useState<AddSheetMode>('plan');
  const [addCategoryId, setAddCategoryId] = useState<number | undefined>(
    undefined,
  );
  const [addKind, setAddKind] = useState<AddSheetKind | undefined>(undefined);
  const [editPlanned, setEditPlanned] = useState<PlannedV11Read | undefined>(
    undefined,
  );
  const [gateRefetch, setGateRefetch] = useState(0);

  const closeSheet = useCallback(() => setAddOpen(false), []);

  const openAddSheet = useCallback(
    (mode: AddSheetMode = 'plan', categoryId?: number, kind?: AddSheetKind) => {
      setEditPlanned(undefined);
      setAddMode(mode);
      setAddCategoryId(categoryId);
      setAddKind(kind);
      setAddOpen(true);
    },
    [],
  );

  const openEditPlanned = useCallback((planned: PlannedV11Read) => {
    setAddMode('plan');
    setAddCategoryId(undefined);
    setAddKind(undefined);
    setEditPlanned(planned);
    setAddOpen(true);
  }, []);

  // The gate never edits a fact (no fact surface inside the interstitial) —
  // openEditSheet is a no-op here.
  const noopEditSheet = useCallback(() => {}, []);

  return (
    <RefetchTokenProvider value={gateRefetch}>
      <AddSheetHostProvider
        openAddSheet={openAddSheet}
        openEditSheet={noopEditSheet}
        openEditPlanned={openEditPlanned}
      >
        <PosterRouterProvider root={<PlanningGateBody {...props} />}>
          <PlanningGateRouterView />
        </PosterRouterProvider>

        {/* Gate-local AddSheet — add/edit/delete planned rows WITHOUT leaving
            the interstitial. onSubmitted bumps the gate refetch token so the
            pushed plan editors reload. */}
        <PosterSheet
          isOpen={isAddOpen}
          onClose={closeSheet}
          backgroundColor="#F2F2F7"
        >
          <NativeAddSheet
            mode={addMode}
            initialCategoryId={addCategoryId}
            kind={addKind}
            editPlanned={editPlanned}
            onSubmitted={() => {
              setAddOpen(false);
              setGateRefetch((t) => t + 1);
            }}
            onClose={closeSheet}
          />
        </PosterSheet>
      </AddSheetHostProvider>
    </RefetchTokenProvider>
  );
}

// Top-of-stack only; pushed editors slide over the gate body (same animation
// vocabulary as the shell — see NativeShell.module.css). We reuse the poster
// router's default view by importing the shared animated wrapper instead of
// re-implementing it.
function PlanningGateRouterView() {
  const { stack } = usePosterRouter();
  const top = stack[stack.length - 1];
  // Scroll container for PUSHED screens (PlanMount / TemplateMount). The gate
  // landing (PlanningGateBody) owns its own `.scroll`, but the pushed editors
  // do not — and the gate hosts its OWN router, OUTSIDE the shell's scrollable
  // `.content`. Without this wrapper a tall plan editor overflowed with NO
  // scroll container and was unreachable below the fold (could not scroll).
  // A viewport-tall overflow-y:auto box fixes pushed screens and is a no-op for
  // the landing (its `.root` is the same height → no double scroll).
  return (
    <div key={top.id} className={styles.routerView}>
      {top.node}
    </div>
  );
}
