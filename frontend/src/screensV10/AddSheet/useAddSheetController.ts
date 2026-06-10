// Liquid Glass v2 — shared add-transaction controller hook.
//
// Extracts the AddSheet state machine + submit logic so the native iOS sheet
// (NativeAddSheet) can render a different presentation while reusing the EXACT
// same business logic the poster AddSheet uses:
//   - amount string machine (appendDigit / appendDot / backspace) +
//     parseAmountToCents (computeAddSheet.ts pure fns)
//   - 3/4-state CTA machine (ctaState)
//   - date chips + custom date + period-scope defaulting/bounds (Phase P2)
//   - account / category bootstrap fetch (listAccounts / listCategoriesV10)
//   - submit via createActualV10 (kind:'expense', account_id, tx_date) +
//     period auto-switch on a back-dated entry
//
// The created transaction POSTs IDENTICALLY to the poster path: same payload
// shape, same parse/validation, same period side-effects. The poster
// AddSheet.tsx keeps its own inline copy untouched (byte-identical → Maximal
// Poster pixel baseline `add-sheet` does not regress); this hook does NOT
// re-implement the API or the money math — it only reuses computeAddSheet.ts
// and api/v10.

import { useEffect, useMemo, useState } from 'react';
import {
  listAccounts,
  listCategoriesV10,
  createActualV10,
  updateActualV10,
  deleteActualV10,
  createPlanned,
  patchPlanned,
  deletePlanned,
  type AccountResponse,
  type ActualV10Read,
  type CategoryV10,
  type PlannedV11Read,
} from '../../api/v10';
import type { AddSheetKind, AddSheetMode } from '../native/AddSheetHost';
import { useSelectedPeriodOptional } from '../common';
import type { PeriodRead } from '../../api/types';
import {
  appendDigit,
  appendDot,
  backspace,
  parseAmountToCents,
  ctaState,
  defaultDateForChip,
  defaultDateForPeriod,
  periodDateInputBounds,
  findPeriodForDate,
  type AddSheetDateChip,
  type AddSheetCtaState,
} from './computeAddSheet';

export interface UseAddSheetControllerArgs {
  /**
   * Target surface:
   *  - `'fact'` (default): createActualV10 (real fact, account-gated).
   *  - `'plan'`: createPlanned into the selected period (no account; planned_date
   *    = chosen date, kind from the selected category).
   */
  mode?: AddSheetMode;
  /**
   * Optional category to pre-select when the sheet opens (CategoryDetail
   * «Добавить транзакцию» deep-link). Seeds the `categoryId` state; the view
   * may still change it via the picker. When it changes (sheet re-opened for a
   * different category) the selection re-syncs.
   */
  initialCategoryId?: number;
  /**
   * REQ 4a — force the income/expense context. When provided, the controller
   * seeds this kind AND filters `visibleCategories` to ONLY this kind (savings
   * still excluded). When omitted, the kind is derived from the pre-selected
   * category (`initialCategoryId` / `editActual`) and defaults to `'expense'`.
   */
  kind?: AddSheetKind;
  /**
   * REQ 7 — when set, the sheet opens in EDIT mode pre-filled with this
   * transaction; submit PATCHes via `updateActualV10` (instead of create) and
   * `onDelete` becomes available («Удалить»). The amount/category/date/
   * description seed from this row.
   */
  editActual?: ActualV10Read;
  /**
   * Bug fix (plan edit/delete) — when set, the sheet opens in EDIT mode for an
   * existing PLANNED row (mode is forced to `'plan'`): submit PATCHes via
   * `patchPlanned` and `onDelete` removes the row via `deletePlanned`. Manual
   * planned rows only (recurring rows are managed in the template).
   */
  editPlanned?: PlannedV11Read;
  /** Called with the newly-created/updated tx/planned id after a successful POST/PATCH. */
  onSubmitted: (txId: number) => void;
  /** Called when the user dismisses the sheet (clean form or confirmed cancel). */
  onClose: () => void;
}

export interface AddSheetController {
  /** Active surface mode (drives view chrome: title / CTA label). */
  mode: AddSheetMode;
  /** REQ 7 — true when editing an existing actual (chrome: title / delete). */
  isEdit: boolean;
  /** REQ 4a — the effective income/expense context the sheet is bound to. */
  kind: AddSheetKind;
  // amount
  amountString: string;
  amountCents: number;
  onAppendDigit: (digit: string) => void;
  onAppendDot: () => void;
  onBackspace: () => void;
  // description
  description: string;
  setDescription: (v: string) => void;
  // date
  dateChip: AddSheetDateChip;
  setDateChipToday: () => void;
  setDateChipYesterday: () => void;
  customDate: string;
  /** Select «Своя дата» mode (does NOT open any OS popup). */
  setDateChipCustom: () => void;
  /** Set the chosen custom ISO date (from the in-app NativeCalendar). */
  setCustomDate: (iso: string) => void;
  dateBounds: { min: string; max: string } | null;
  isScopedPeriod: boolean;
  viewedPeriod: PeriodRead | null;
  // category
  categories: CategoryV10[];
  visibleCategories: CategoryV10[];
  categoryId: number | null;
  setCategoryId: (id: number) => void;
  // account
  accounts: AccountResponse[];
  accountId: number | null;
  currentAccount: AccountResponse | null;
  setAccountId: (id: number) => void;
  // cta / submit
  cta: AddSheetCtaState;
  submitting: boolean;
  submitError: string | null;
  isDirty: boolean;
  onSubmit: () => Promise<void>;
  /**
   * REQ 7 — delete the edited transaction (only meaningful when `isEdit`).
   * No-op outside edit mode. On success calls `onSubmitted(id)` so the host
   * closes + bumps the refetch token, identically to a save.
   */
  onDelete: () => Promise<void>;
  /** Returns true if the form is dirty (caller should show a confirm gate). */
  requestClose: () => boolean;
}

/**
 * Render BIGINT cents back into the keypad amount-string («550» → «5.5», «500»
 * → «5», «5» → «0.05»). Used to pre-fill the keypad when editing an existing
 * actual. Trailing-zero kopecks are trimmed so whole rubles read cleanly.
 */
function centsToAmountString(cents: number): string {
  if (cents <= 0) return '';
  const rub = Math.floor(cents / 100);
  const kop = cents % 100;
  if (kop === 0) return String(rub);
  // Two-digit kopecks, trim a single trailing zero («50» → «5», «05» stays).
  const kopStr =
    kop % 10 === 0 ? String(kop / 10) : String(kop).padStart(2, '0');
  return `${rub}.${kopStr}`;
}

export function useAddSheetController({
  mode = 'fact',
  initialCategoryId,
  kind: forcedKind,
  editActual,
  editPlanned,
  onSubmitted,
  onClose,
}: UseAddSheetControllerArgs): AddSheetController {
  // Editing a planned row forces plan mode (PATCH /planned, no account leg).
  const isPlan = mode === 'plan' || editPlanned != null;
  const isEdit = editActual != null || editPlanned != null;
  // Category to seed the picker with: explicit deep-link wins, else the edited
  // row's category (fact OR planned).
  const seedCategoryId =
    initialCategoryId ??
    editActual?.category_id ??
    editPlanned?.category_id ??
    null;
  // ── State (mirrors poster AddSheet) ───────────────────────────────
  const [amountString, setAmountString] = useState(() => {
    if (editActual) return centsToAmountString(editActual.amount_cents);
    if (editPlanned)
      return centsToAmountString(Math.abs(editPlanned.amount_cents));
    return '';
  });
  const [description, setDescription] = useState(
    editActual?.description ?? editPlanned?.description ?? '',
  );
  const [dateChip, setDateChip] = useState<AddSheetDateChip>(
    editActual || (editPlanned && editPlanned.planned_date)
      ? 'custom'
      : 'today',
  );
  const [customDate, setCustomDate] = useState<string>(
    editActual?.tx_date ?? editPlanned?.planned_date ?? '',
  );
  const [categoryId, setCategoryId] = useState<number | null>(seedCategoryId);

  // CategoryDetail deep-link safety net: PosterSheet unmounts NativeAddSheet on
  // close, so the useState initializer above already seeds the right category on
  // each fresh open. This effect re-syncs if the prop ever changes while the
  // sheet stays mounted (defensive — keeps the picker honest either way).
  useEffect(() => {
    if (initialCategoryId != null) setCategoryId(initialCategoryId);
  }, [initialCategoryId]);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [accounts, setAccounts] = useState<AccountResponse[]>([]);
  const [categories, setCategories] = useState<CategoryV10[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);

  // Phase P2 (period switching) — same logic as poster AddSheet.
  const sel = useSelectedPeriodOptional();
  const selectedPeriodId = sel?.selectedPeriodId ?? null;
  const viewedPeriod = useMemo(
    () => sel?.periods.find((p) => p.id === selectedPeriodId) ?? null,
    [sel, selectedPeriodId],
  );
  const isScopedPeriod =
    viewedPeriod != null && viewedPeriod.status !== 'active';

  useEffect(() => {
    // Edit mode keeps the row's own tx_date — never override it with the
    // viewed-period default.
    if (isEdit) return;
    if (isScopedPeriod && viewedPeriod) {
      setDateChip('custom');
      setCustomDate(defaultDateForPeriod(viewedPeriod, today));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScopedPeriod, viewedPeriod?.id]);

  const dateBounds = useMemo(
    () =>
      isScopedPeriod && viewedPeriod
        ? periodDateInputBounds(viewedPeriod, today)
        : null,
    [isScopedPeriod, viewedPeriod, today],
  );

  // ── Initial parallel fetch (identical to poster) ──────────────────
  useEffect(() => {
    let cancelled = false;
    Promise.all([listAccounts(), listCategoriesV10()])
      .then(([accs, cats]) => {
        if (cancelled) return;
        setAccounts(accs);
        setCategories(cats);
        const primary = accs.find((a) => a.primary) ?? accs[0] ?? null;
        setAccountId(primary?.id ?? null);
      })
      .catch(() => {
        // Best-effort: bootstrap failure → empty categories → CTA gated to
        // 'no-account'/'no-cat'. Silent, mirrors poster.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Derived values ────────────────────────────────────────────────
  const amountCents = useMemo(() => {
    try {
      return parseAmountToCents(amountString);
    } catch {
      return 0;
    }
  }, [amountString]);

  const isDirty =
    amountString !== '' || description.trim() !== '' || categoryId !== null;

  // WR-25-01: pass accountId so the CTA falls into 'no-account' when bootstrap
  // failed or the user has zero accounts (prevents wallet-desync POST).
  // Plan mode writes a planned row (no account leg) → skip the account gate.
  const cta = isPlan
    ? ctaState(amountCents, categoryId)
    : ctaState(amountCents, categoryId, accountId);

  // REQ 4a — effective income/expense context. Precedence:
  //   1. explicit `kind` passed to openAddSheet (the active Home tab),
  //   2. else derive from the currently-selected category,
  //   3. else the edited row's kind (roundup/deposit → treated as expense),
  //   4. else default 'expense'.
  const selectedCategoryKind = useMemo(() => {
    if (categoryId === null) return null;
    const cat = categories.find((c) => c.id === categoryId);
    return cat ? cat.kind : null;
  }, [categories, categoryId]);

  const editRowKind = editActual?.kind ?? editPlanned?.kind ?? null;
  const editKind: AddSheetKind | null =
    editRowKind != null
      ? editRowKind === 'income'
        ? 'income'
        : 'expense'
      : null;

  const effectiveKind: AddSheetKind =
    forcedKind ?? selectedCategoryKind ?? editKind ?? 'expense';

  // ADD-V10-04: hide the system savings category.
  // REQ 4a: when a `kind` context is forced, also restrict the list to that
  // kind so the picker only ever shows categories the user can pick for the
  // active tab. Without a forced kind the full (non-savings) list shows — the
  // category's own kind drives the submit payload.
  const visibleCategories = useMemo(
    () =>
      categories.filter(
        (c) =>
          c.code !== 'savings' && (forcedKind == null || c.kind === forcedKind),
      ),
    [categories, forcedKind],
  );

  const currentAccount = useMemo(
    () => accounts.find((a) => a.id === accountId) ?? null,
    [accounts, accountId],
  );

  // ── Amount handlers (route through computeAddSheet reducers) ──────
  const onAppendDigit = (d: string) =>
    setAmountString((cur) => appendDigit(cur, d));
  const onAppendDot = () => setAmountString((cur) => appendDot(cur));
  const onBackspace = () => setAmountString((cur) => backspace(cur));

  // ── Date handlers ─────────────────────────────────────────────────
  const setDateChipToday = () => setDateChip('today');
  const setDateChipYesterday = () => setDateChip('yesterday');
  // «Своя дата»: select custom mode, default to today if no date chosen yet.
  // No OS popup — the view renders an in-app NativeCalendar grid.
  const setDateChipCustom = () => {
    setDateChip('custom');
    setCustomDate((cur) => cur || defaultDateForChip('today', today) || '');
  };

  // ── Submit (identical payload + period side-effects as poster) ────
  const onSubmit = async () => {
    if (cta !== 'ready' || categoryId === null || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    const tx_date =
      dateChip === 'custom'
        ? customDate || defaultDateForChip('today', today) || ''
        : (defaultDateForChip(dateChip, today) ?? '');

    // ── Plan mode: write a planned row into the selected period ──
    // (no account leg, no period auto-switch — the Plan screen is already
    // scoped to one period). planned_date = chosen date; kind from category.
    if (isPlan) {
      const targetPeriodId =
        viewedPeriod?.id ?? selectedPeriodId ?? sel?.periods[0]?.id ?? null;
      if (targetPeriodId == null) {
        setSubmitError('Нет открытого периода');
        setSubmitting(false);
        return;
      }
      const cat = categories.find((c) => c.id === categoryId);
      // ── Plan EDIT: PATCH the existing planned row instead of POSTing a new
      //    one (manual rows only — recurring rows never reach here). ──
      if (editPlanned != null) {
        try {
          const res = await patchPlanned(editPlanned.id, {
            category_id: categoryId,
            kind: cat?.kind ?? editPlanned.kind,
            amount_cents: amountCents,
            description: description.trim() === '' ? null : description.trim(),
            planned_date: tx_date || null,
          });
          onSubmitted(res.id);
        } catch (err) {
          setSubmitError(
            err instanceof Error ? err.message : 'Не удалось сохранить',
          );
        } finally {
          setSubmitting(false);
        }
        return;
      }
      try {
        const res = await createPlanned(targetPeriodId, {
          category_id: categoryId,
          kind: cat?.kind ?? 'expense',
          amount_cents: amountCents,
          description: description.trim() === '' ? null : description.trim(),
          planned_date: tx_date || null,
        });
        onSubmitted(res.id);
      } catch (err) {
        setSubmitError(
          err instanceof Error ? err.message : 'Не удалось сохранить',
        );
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Submit kind tracks the chosen category (income↔expense), preserving the
    // edited row's original roundup/deposit kind when its savings category is
    // untouched. New facts default to the selected category's kind.
    const submitCat = categories.find((c) => c.id === categoryId);
    const submitKind: ActualV10Read['kind'] =
      isEdit && editActual != null && editActual.category_id === categoryId
        ? editActual.kind
        : (submitCat?.kind ?? 'expense');

    // ── Edit mode: PATCH the existing actual instead of POSTing a new one ──
    if (isEdit && editActual != null) {
      try {
        const res = await updateActualV10(editActual.id, {
          kind: submitKind,
          amount_cents: amountCents,
          description: description.trim() === '' ? null : description.trim(),
          category_id: categoryId,
          tx_date,
        });
        // Phase P2: auto-switch the viewed period if the edit moved the date
        // outside it (mirrors the create path).
        if (sel && tx_date) {
          const inViewed =
            viewedPeriod != null &&
            findPeriodForDate([viewedPeriod], tx_date) !== null;
          if (!inViewed) {
            sel.reload();
            const target = findPeriodForDate(sel.periods, tx_date);
            if (target) sel.setSelectedPeriodId(target.id);
          }
        }
        onSubmitted(res.id);
      } catch (err) {
        setSubmitError(
          err instanceof Error ? err.message : 'Не удалось сохранить',
        );
      } finally {
        setSubmitting(false);
      }
      return;
    }

    try {
      const res = await createActualV10({
        kind: submitKind,
        amount_cents: amountCents,
        description: description.trim() === '' ? null : description.trim(),
        category_id: categoryId,
        tx_date,
        account_id: accountId,
      });
      // Phase P2: auto-switch the viewed period if the entry landed outside it.
      if (sel && tx_date) {
        const inViewed =
          viewedPeriod != null &&
          findPeriodForDate([viewedPeriod], tx_date) !== null;
        if (!inViewed) {
          sel.reload();
          const target = findPeriodForDate(sel.periods, tx_date);
          if (target) sel.setSelectedPeriodId(target.id);
        }
      }
      onSubmitted(res.id);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Не удалось сохранить',
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ── Delete (edit mode only) ───────────────────────────────────────
  // Deletes the edited fact (deleteActualV10) OR the edited planned row
  // (deletePlanned), depending on which edit context the sheet opened in.
  const onDelete = async () => {
    if (!isEdit || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (editPlanned != null) {
        await deletePlanned(editPlanned.id);
        onSubmitted(editPlanned.id);
      } else if (editActual != null) {
        await deleteActualV10(editActual.id);
        onSubmitted(editActual.id);
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Не удалось удалить');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Close (dirty gate handled by the view) ───────────────────────
  const requestClose = (): boolean => {
    if (isDirty) return true; // caller shows confirm overlay
    onClose();
    return false;
  };

  return {
    // editPlanned forces plan mode even when the caller passed mode='fact'.
    mode: isPlan ? 'plan' : mode,
    isEdit,
    kind: effectiveKind,
    amountString,
    amountCents,
    onAppendDigit,
    onAppendDot,
    onBackspace,
    description,
    setDescription,
    dateChip,
    setDateChipToday,
    setDateChipYesterday,
    customDate,
    setDateChipCustom,
    setCustomDate: (iso: string) => setCustomDate(iso),
    dateBounds,
    isScopedPeriod,
    viewedPeriod,
    categories,
    visibleCategories,
    categoryId,
    setCategoryId: (id: number) => setCategoryId(id),
    accounts,
    accountId,
    currentAccount,
    setAccountId: (id: number) => setAccountId(id),
    cta,
    submitting,
    submitError,
    isDirty,
    onSubmit,
    onDelete,
    requestClose,
  };
}
