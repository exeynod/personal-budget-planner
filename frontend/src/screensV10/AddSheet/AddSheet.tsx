// Phase 25-10: AddSheet — full body rendered inside a PosterSheet
// (backgroundColor='#0E0E0E') triggered by the V10MainShell FAB.
//
// Acceptance per ADD-V10-01..05 + must-haves:
//   - ADD-V10-01: opens via PosterSheet on FAB tap; integrated by
//     V10MainShell (replaces AddSheetPlaceholderContent).
//   - ADD-V10-02: BigFig 86px yellow shows the amount; the ONLY input
//     surface is the custom 3×4 Keypad — no native input element for
//     the amount renders.
//   - ADD-V10-03: italic-серif placeholder description input + 3 date
//     chips (Сегодня / Вчера / Своя дата → native date picker).
//   - ADD-V10-04: category chip-scroll (filtered code !== 'savings' AND
//     !paused, single-select REQUIRED) + account row (primary by default).
//   - ADD-V10-05: 3-state CTA (empty → no-cat → ready) calls
//     createActualV10 with account_id, then onSubmitted(txId).
//   - T-25-10-02: dirty-close confirm gate for the × button.
//   - T-25-10-03: account_id sourced from listAccounts() only; primary first.
//   - T-25-10-04: amount built via Keypad → digit/dot tokens only;
//     parseAmountToCents validates input + createActualV10 enforces > 0.
//
// Refresh strategy after submit (per Plan note): caller is responsible for
// any refetch. AddSheet only signals success via onSubmitted(txId); the
// Plan 25-12 polish pass may add a global refresh-bump if user testing
// flags stale Home/Transactions data after submit.

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { Eyebrow, Mass, BigFig, Chip } from '../../componentsV10';
import {
  listAccounts,
  listCategoriesV10,
  createActualV10,
  type AccountResponse,
  type CategoryV10,
} from '../../api/v10';
import { formatTimeHM, MONTHS_RU_GENITIVE } from '../common';
import { Keypad } from './Keypad';
import {
  appendDigit,
  appendDot,
  backspace,
  parseAmountToCents,
  ctaState,
  defaultDateForChip,
  type AddSheetDateChip,
  type AddSheetCtaState,
} from './computeAddSheet';
import styles from './AddSheet.module.css';

export interface AddSheetProps {
  /** Called with the newly-created tx id after a successful POST. */
  onSubmitted: (txId: number) => void;
  /** Called when the user dismisses the sheet (close button + clean form,
   *  or confirms «ОТМЕНИТЬ» on the dirty-close gate). */
  onClose: () => void;
}

function formatShortDate(d: Date): string {
  // «9 МАЯ» (uppercase) for the eyebrow header.
  const day = d.getDate();
  const month = MONTHS_RU_GENITIVE[d.getMonth()].toUpperCase();
  return `${day} ${month}`;
}

/** Display `amountString` (e.g. "5.50") on the BigFig. The BigFig component
 * accepts `value: number` only — to preserve the visual «5.» state we render
 * the string ourselves through its `sup` slot trick: pass the integer part
 * as `value` and append «.» / decimal part as the suffix when needed. */
function renderAmountInBigFig(amountString: string) {
  if (amountString === '') {
    return (
      <BigFig
        value={0}
        sup="₽"
        size={86}
        color="var(--poster-yellow)"
        animate={false}
      />
    );
  }
  const dotIdx = amountString.indexOf('.');
  if (dotIdx === -1) {
    const intVal = parseInt(amountString, 10);
    return (
      <BigFig
        value={intVal}
        sup="₽"
        size={86}
        color="var(--poster-yellow)"
        animate={false}
      />
    );
  }
  const intPart = amountString.slice(0, dotIdx);
  const decPart = amountString.slice(dotIdx + 1);
  const intVal = intPart === '' ? 0 : parseInt(intPart, 10);
  // Render the decimals as part of the suffix so the BigFig main number
  // stays an integer (its formatter is integer-only).
  const tail = `.${decPart || ''}`;
  return (
    <BigFig
      value={intVal}
      sup={
        <>
          <span className={styles.bigFigDecimals}>{tail}</span>
          <span className={styles.bigFigCurrency}>₽</span>
        </>
      }
      size={86}
      color="var(--poster-yellow)"
      animate={false}
    />
  );
}

const CTA_LABEL: Record<AddSheetCtaState, string> = {
  empty: 'ВВЕДИТЕ СУММУ',
  'no-cat': 'ВЫБЕРИТЕ КАТЕГОРИЮ',
  // WR-25-01: surfaced when bootstrap fetch failed OR the user has zero
  // accounts. Without this gate, the CTA would jump to 'ready' and the
  // POST would silently fall into the legacy v0.x path (no wallet delta).
  'no-account': 'НЕТ СЧЁТА',
  ready: 'СОХРАНИТЬ ↵',
};

export function AddSheet({ onSubmitted, onClose }: AddSheetProps) {
  // ── State ────────────────────────────────────────────────────────
  const [amountString, setAmountString] = useState('');
  const [description, setDescription] = useState('');
  const [dateChip, setDateChip] = useState<AddSheetDateChip>('today');
  // customDate is set when user picks «Своя дата» via the date picker.
  const [customDate, setCustomDate] = useState<string>('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [accounts, setAccounts] = useState<AccountResponse[]>([]);
  const [categories, setCategories] = useState<CategoryV10[]>([]);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // We mount once for the «NEW ENTRY · {date} · {time}» eyebrow.
  const today = useMemo(() => new Date(), []);
  const dateInputRef = useRef<HTMLInputElement | null>(null);

  // ── Initial parallel fetch ───────────────────────────────────────
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
        // Best-effort: if the bootstrap fetch fails the user will see no
        // categories and cannot submit. Keep silent here — a follow-up
        // polish pass can surface a banner.
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
  // WR-25-01 (review fix): pass `accountId` so the CTA falls into the
  // 'no-account' state when bootstrap fetch failed or the user has no
  // accounts yet. Posting `account_id: null` from the v1.0 UI silently
  // falls into the legacy backend path → wallet balance never updates
  // (HOME-V10-04 desync). The gate makes the failure visible to the user.
  const cta = ctaState(amountCents, categoryId, accountId);

  // ADD-V10-04: filter out savings + paused.
  const visibleCategories = useMemo(
    () =>
      categories.filter(
        (c) => c.code !== 'savings' && c.paused !== true,
      ),
    [categories],
  );

  const currentAccount = useMemo(
    () => accounts.find((a) => a.id === accountId) ?? null,
    [accounts, accountId],
  );

  // ── Handlers ──────────────────────────────────────────────────────
  const onClickClose = () => {
    if (isDirty) {
      setShowCancelConfirm(true);
    } else {
      onClose();
    }
  };

  const onPickCustomDate = () => {
    setDateChip('custom');
    const el = dateInputRef.current;
    if (!el) return;
    // showPicker() is the modern API; fall back to .click() for Safari < 16.
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

  const onSubmit = async () => {
    if (cta !== 'ready' || categoryId === null || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    const tx_date =
      dateChip === 'custom'
        ? customDate ||
          defaultDateForChip('today', today) ||
          ''
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
      onSubmitted(res.id);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Не удалось сохранить',
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ── Account picker (lightweight inline cycler) ────────────────────
  // Phase 25-10 ships a cycler-style picker (tap row → next account).
  // Plan 25-12 polish pass may upgrade this to a dedicated PosterSheet.
  const onCycleAccount = () => {
    if (accounts.length === 0) return;
    const idx = accounts.findIndex((a) => a.id === accountId);
    const next = accounts[(idx + 1) % accounts.length];
    setAccountId(next.id);
  };

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className={styles.sheet} data-testid="add-sheet">
      {/* Header */}
      <div className={styles.header}>
        <Eyebrow color="var(--poster-paper)" opacity={0.7}>
          {`NEW ENTRY · ${formatShortDate(today)} · ${formatTimeHM(today)}`}
        </Eyebrow>
        <button
          type="button"
          className={styles.closeBtn}
          onClick={onClickClose}
          aria-label="Закрыть форму"
        >
          {'×'}
        </button>
      </div>

      {/* BigFig amount */}
      <div className={styles.amountBlock} data-testid="add-sheet-bigfig">
        {renderAmountInBigFig(amountString)}
      </div>

      {/* Phase 29-04 §3 AddSheet BLOCKER #1 — element-order swap:
       * the Keypad is the LAST input section before CTA per prototype
       * (poster-screens.jsx:1215-1225). The previous order rendered the
       * keypad ABOVE description/date/category/account; moved to bottom. */}

      {/* Description */}
      <div className={styles.descBlock}>
        <Eyebrow color="var(--poster-paper)" opacity={0.55}>
          Описание
        </Eyebrow>
        <input
          type="text"
          className={styles.descInput}
          placeholder="кафе / продукты / …"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          aria-label="Описание операции"
          data-testid="add-sheet-description"
        />
      </div>

      {/* Date chips */}
      <div className={styles.dateBlock}>
        <Eyebrow color="var(--poster-paper)" opacity={0.55}>
          Когда
        </Eyebrow>
        <div className={styles.dateChips} role="group" aria-label="Дата операции">
          <Chip
            active={dateChip === 'today'}
            onClick={() => setDateChip('today')}
          >
            Сегодня
          </Chip>
          <Chip
            active={dateChip === 'yesterday'}
            onClick={() => setDateChip('yesterday')}
          >
            Вчера
          </Chip>
          <Chip
            active={dateChip === 'custom'}
            onClick={onPickCustomDate}
          >
            {dateChip === 'custom' && customDate ? customDate : 'Своя дата'}
          </Chip>
          <input
            ref={dateInputRef}
            type="date"
            className={styles.hiddenDateInput}
            value={customDate}
            onChange={onChangeCustomDate}
            aria-hidden="true"
            tabIndex={-1}
          />
        </div>
      </div>

      {/* Category chip-scroll */}
      <div className={styles.catBlock}>
        <Eyebrow color="var(--poster-paper)" opacity={0.55}>
          Категория
        </Eyebrow>
        <div
          className={styles.catScroll}
          role="group"
          aria-label="Категория"
          data-testid="add-sheet-categories"
        >
          {visibleCategories.map((cat) => (
            <Chip
              key={cat.id}
              active={categoryId === cat.id}
              onClick={() => setCategoryId(cat.id)}
            >
              {cat.name}
            </Chip>
          ))}
        </div>
      </div>

      {/* Account row — Phase 29-04 §3 AddSheet BLOCKERs #2/#3:
       * - Eyebrow «Счёт» now lives ABOVE the row plate (was inline label).
       * - Display content is `{BANK uppercased} · {MASK}` with a single
       *   middle dot; right-side caption is mono «сменить ↓» (not chevron).
       * Mirrors prototype/poster-screens.jsx:1209-1213. */}
      <div className={styles.accountBlock}>
        <Eyebrow color="var(--poster-paper)" opacity={0.55}>
          Счёт
        </Eyebrow>
        <button
          type="button"
          className={styles.accountRow}
          onClick={onCycleAccount}
          data-testid="add-sheet-account-row"
        >
          <span className={styles.accountValue}>
            {currentAccount
              ? `${(currentAccount.bank ?? '').toUpperCase()}${currentAccount.mask ? ' · ' + currentAccount.mask : ''}`
              : '—'}
          </span>
          <span className={styles.accountSwitch}>сменить ↓</span>
        </button>
      </div>

      {/* Keypad (LAST input section per prototype) */}
      <div className={styles.keypadBlock}>
        <Keypad
          onAppendDigit={(d) =>
            setAmountString((cur) => appendDigit(cur, d))
          }
          onAppendDot={() => setAmountString((cur) => appendDot(cur))}
          onBackspace={() => setAmountString((cur) => backspace(cur))}
        />
      </div>

      {/* Optional submit error banner */}
      {submitError !== null ? (
        <div className={styles.errorBanner}>{submitError}</div>
      ) : null}

      {/* CTA */}
      <button
        type="button"
        className={`${styles.cta} ${
          cta === 'ready' ? styles.ctaReady : styles.ctaDisabled
        }`}
        onClick={onSubmit}
        disabled={cta !== 'ready' || submitting}
        data-testid="add-sheet-cta"
      >
        {CTA_LABEL[cta]}
      </button>

      {/* Cancel confirm overlay */}
      {showCancelConfirm ? (
        <div
          className={styles.confirmOverlay}
          role="dialog"
          aria-modal="true"
          data-testid="add-sheet-cancel-confirm"
        >
          <div className={styles.confirmBox}>
            <Mass italic size={28} style={{ color: 'var(--poster-paper)' }}>
              ОТМЕНИТЬ ЗАПИСЬ?
            </Mass>
            <div className={styles.confirmHint}>
              Введённые данные будут потеряны.
            </div>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={`${styles.confirmBtn} ${styles.confirmContinue}`}
                onClick={() => setShowCancelConfirm(false)}
              >
                ПРОДОЛЖИТЬ
              </button>
              <button
                type="button"
                className={`${styles.confirmBtn} ${styles.confirmCancel}`}
                onClick={() => {
                  setShowCancelConfirm(false);
                  onClose();
                }}
              >
                ОТМЕНИТЬ
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
