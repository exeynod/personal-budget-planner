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
  createPlanned,
  type AccountResponse,
  type CategoryV10,
} from '../../api/v10';
import type { AddSheetMode } from '../native/AddSheetHost';
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
  /** Called with the newly-created tx/planned id after a successful POST. */
  onSubmitted: (txId: number) => void;
  /** Called when the user dismisses the sheet (clean form or confirmed cancel). */
  onClose: () => void;
}

export interface AddSheetController {
  /** Active surface mode (drives view chrome: title / CTA label). */
  mode: AddSheetMode;
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
  /** Returns true if the form is dirty (caller should show a confirm gate). */
  requestClose: () => boolean;
}

export function useAddSheetController({
  mode = 'fact',
  initialCategoryId,
  onSubmitted,
  onClose,
}: UseAddSheetControllerArgs): AddSheetController {
  const isPlan = mode === 'plan';
  // ── State (mirrors poster AddSheet) ───────────────────────────────
  const [amountString, setAmountString] = useState('');
  const [description, setDescription] = useState('');
  const [dateChip, setDateChip] = useState<AddSheetDateChip>('today');
  const [customDate, setCustomDate] = useState<string>('');
  const [categoryId, setCategoryId] = useState<number | null>(
    initialCategoryId ?? null,
  );

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

  // ADD-V10-04: hide the system savings category.
  const visibleCategories = useMemo(
    () => categories.filter((c) => c.code !== 'savings'),
    [categories],
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

    try {
      const res = await createActualV10({
        kind: 'expense',
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

  // ── Close (dirty gate handled by the view) ───────────────────────
  const requestClose = (): boolean => {
    if (isDirty) return true; // caller shows confirm overlay
    onClose();
    return false;
  };

  return {
    mode,
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
    requestClose,
  };
}
