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

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  listAccounts,
  listCategoriesV10,
  createActualV10,
  type AccountResponse,
  type CategoryV10,
} from '../../api/v10';
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
  /** Called with the newly-created tx id after a successful POST. */
  onSubmitted: (txId: number) => void;
  /** Called when the user dismisses the sheet (clean form or confirmed cancel). */
  onClose: () => void;
}

export interface AddSheetController {
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
  dateInputRef: React.MutableRefObject<HTMLInputElement | null>;
  onPickCustomDate: () => void;
  onChangeCustomDate: (e: ChangeEvent<HTMLInputElement>) => void;
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
  onSubmitted,
  onClose,
}: UseAddSheetControllerArgs): AddSheetController {
  // ── State (mirrors poster AddSheet) ───────────────────────────────
  const [amountString, setAmountString] = useState('');
  const [description, setDescription] = useState('');
  const [dateChip, setDateChip] = useState<AddSheetDateChip>('today');
  const [customDate, setCustomDate] = useState<string>('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [accounts, setAccounts] = useState<AccountResponse[]>([]);
  const [categories, setCategories] = useState<CategoryV10[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);
  const dateInputRef = useRef<HTMLInputElement | null>(null);

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
  const cta = ctaState(amountCents, categoryId, accountId);

  // ADD-V10-04: hide savings + paused categories.
  const visibleCategories = useMemo(
    () => categories.filter((c) => c.code !== 'savings' && c.paused !== true),
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

  const onPickCustomDate = () => {
    setDateChip('custom');
    const el = dateInputRef.current;
    if (!el) return;
    const anyEl = el as HTMLInputElement & { showPicker?: () => void };
    if (typeof anyEl.showPicker === 'function') {
      try {
        anyEl.showPicker();
      } catch {
        anyEl.click();
      }
    } else {
      anyEl.click();
    }
  };

  const onChangeCustomDate = (e: ChangeEvent<HTMLInputElement>) => {
    setCustomDate(e.target.value);
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
    dateInputRef,
    onPickCustomDate,
    onChangeCustomDate,
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
