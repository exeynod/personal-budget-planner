// Liquid Glass v2 — native iOS «Новая транзакция» sheet.
//
// Native presentation of the core add-fact flow. REUSES all business logic via
// `useAddSheetController` (amount machine, CTA machine, date/period helpers,
// account/category fetch, createActualV10 submit + period auto-switch) — the
// created transaction POSTs IDENTICALLY to the poster AddSheet. Only the chrome
// is native: an iOS sheet header (Отмена / title), a large amount display + a
// native numeric keypad, inset-grouped Категория / Счёт / Дата rows that open
// native pickers, and a primary «Добавить» CTA.
//
// Fidelity (brief §Conventions «NO invented functionality»): mirrors the poster
// AddSheet's fields EXACTLY — amount, description, date (Сегодня/Вчера/Своя
// дата), single-select category (savings + paused hidden), account, expense-
// only kind. No income toggle is added because the poster flow has none
// (kind:'expense' only) and a dead control is forbidden.

import { useState } from 'react';
import {
  Backspace,
  Check,
  CalendarBlank,
  CreditCard,
  Tag,
} from '@phosphor-icons/react';
import { InsetGroup, InsetRow } from '../native/NativePrimitives';
import { CategoryIcon } from '../native/CategoryIcon';
import { formatMoneyNative } from '../native/money';
import { MONTHS_RU_GENITIVE } from '../common';
import { AccountPickerSheet } from './AccountPickerSheet';
import { useAddSheetController } from './useAddSheetController';
import styles from './NativeAddSheet.module.css';

export interface NativeAddSheetProps {
  /** Called with the newly-created tx id after a successful POST. */
  onSubmitted: (txId: number) => void;
  /** Called when the user dismisses the sheet (clean form or confirmed cancel). */
  onClose: () => void;
}

const KEYS: ReadonlyArray<string> = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '.',
  '0',
  'back',
];

/** Render the amount string as «1 234,5 ₽» using the native grouping while
 * preserving the in-progress trailing-dot / partial-decimals state. */
function renderAmount(amountString: string): { main: string; muted: boolean } {
  if (amountString === '') return { main: '0', muted: true };
  const dotIdx = amountString.indexOf('.');
  if (dotIdx === -1) {
    // whole rubles → group thousands (cents = rub*100 so kopecks=0)
    const intVal = parseInt(amountString, 10);
    return { main: formatMoneyNative(intVal * 100), muted: false };
  }
  const intPart = amountString.slice(0, dotIdx) || '0';
  const decPart = amountString.slice(dotIdx + 1);
  const grouped = formatMoneyNative(parseInt(intPart, 10) * 100);
  // Show the literal in-progress decimal tail («1 234,», «1 234,5»).
  return { main: `${grouped},${decPart}`, muted: false };
}

/** «9 мая» short date for the Дата row trailing value. */
function formatShortDate(iso: string): string {
  const parts = iso.split('-').map(Number);
  const m = parts[1];
  const d = parts[2];
  return `${d} ${MONTHS_RU_GENITIVE[m - 1]}`;
}

function todayIsoLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function yesterdayIsoLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function NativeAddSheet({ onSubmitted, onClose }: NativeAddSheetProps) {
  const c = useAddSheetController({ onSubmitted, onClose });

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [catPickerOpen, setCatPickerOpen] = useState(false);
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [dateSheetOpen, setDateSheetOpen] = useState(false);

  const onClickClose = () => {
    if (c.requestClose()) setShowCancelConfirm(true);
  };

  const amount = renderAmount(c.amountString);

  // Selected-category display (row trailing).
  const selectedCat =
    c.categoryId != null
      ? (c.visibleCategories.find((cat) => cat.id === c.categoryId) ?? null)
      : null;

  // Account display value «BANK · MASK».
  const accountValue = c.currentAccount
    ? `${(c.currentAccount.bank ?? '').toUpperCase()}${
        c.currentAccount.mask ? ' · ' + c.currentAccount.mask : ''
      }`
    : '—';

  // Date row value: chip-aware («Сегодня» / «Вчера» / «9 мая»).
  let dateValue: string;
  if (c.dateChip === 'today') dateValue = 'Сегодня';
  else if (c.dateChip === 'yesterday') dateValue = 'Вчера';
  else dateValue = c.customDate ? formatShortDate(c.customDate) : 'Своя дата';

  const ctaReady = c.cta === 'ready';
  const ctaLabel =
    c.cta === 'empty'
      ? 'Введите сумму'
      : c.cta === 'no-cat'
        ? 'Выберите категорию'
        : c.cta === 'no-account'
          ? 'Нет счёта'
          : 'Добавить';

  const periodHint =
    c.isScopedPeriod && c.viewedPeriod
      ? `Запись в период · ${formatPeriodScope(c.viewedPeriod.period_start)}`
      : null;

  return (
    <div className={styles.sheet} data-testid="native-add-sheet">
      {/* ── Sheet header (Отмена / title) ── */}
      <div className={styles.header}>
        <button
          type="button"
          className={styles.cancelBtn}
          onClick={onClickClose}
          data-testid="native-add-cancel"
        >
          Отмена
        </button>
        <span className={styles.title}>Новая транзакция</span>
        {/* Right slot kept balanced; primary submit lives in the «Добавить»
            CTA below (matches the poster's single CTA — no duplicate action). */}
        <span className={styles.headerSpacer} aria-hidden="true" />
      </div>

      {/* ── Large amount display ── */}
      <div className={styles.amountBlock} data-testid="native-add-amount">
        <span
          className={`${styles.amountValue} ${
            amount.muted ? styles.amountMuted : ''
          }`}
        >
          {amount.main}
        </span>
        <span className={styles.amountCurrency}>₽</span>
      </div>

      {/* ── Description ── */}
      <div className={styles.fieldGroup}>
        <input
          type="text"
          className={styles.descInput}
          placeholder="Описание (кафе / продукты / …)"
          value={c.description}
          onChange={(e) => c.setDescription(e.target.value)}
          aria-label="Описание операции"
          data-testid="native-add-description"
        />
      </div>

      {/* ── Категория / Счёт / Дата rows ── */}
      <InsetGroup>
        <InsetRow
          leading={
            selectedCat ? (
              <CategoryIcon name={selectedCat.name} id={selectedCat.id} />
            ) : (
              <span className={styles.placeholderTile} aria-hidden="true">
                <Tag size={17} weight="fill" color="#fff" />
              </span>
            )
          }
          title="Категория"
          trailing={
            <span className={styles.rowValue}>
              {selectedCat ? selectedCat.name : 'Выбрать'}
            </span>
          }
          trailingMuted={!selectedCat}
          chevron
          onClick={() => setCatPickerOpen(true)}
          testId="native-add-category-row"
        />
        <InsetRow
          leading={
            <span
              className={styles.metaTile}
              style={{ background: 'var(--lgn-blue)' }}
              aria-hidden="true"
            >
              <CreditCard size={17} weight="fill" color="#fff" />
            </span>
          }
          title="Счёт"
          trailing={<span className={styles.rowValue}>{accountValue}</span>}
          trailingMuted={!c.currentAccount}
          chevron
          onClick={() => {
            if (c.accounts.length > 0) setAccountPickerOpen(true);
          }}
          testId="native-add-account-row"
        />
        <InsetRow
          leading={
            <span
              className={styles.metaTile}
              style={{ background: 'var(--lgn-accent)' }}
              aria-hidden="true"
            >
              <CalendarBlank size={17} weight="fill" color="#fff" />
            </span>
          }
          title="Дата"
          trailing={<span className={styles.rowValue}>{dateValue}</span>}
          chevron
          onClick={() => setDateSheetOpen(true)}
          testId="native-add-date-row"
        />
      </InsetGroup>

      {periodHint && (
        <div
          className={styles.periodHint}
          data-testid="native-add-period-scope"
        >
          {periodHint}
        </div>
      )}

      {/* ── Native numeric keypad ── */}
      <div
        className={styles.keypad}
        role="group"
        aria-label="Цифровая клавиатура"
        data-testid="native-add-keypad"
      >
        {KEYS.map((k) => {
          if (k === 'back') {
            return (
              <button
                key="back"
                type="button"
                className={styles.key}
                onClick={c.onBackspace}
                aria-label="Удалить последнюю цифру"
              >
                <Backspace size={24} weight="regular" />
              </button>
            );
          }
          if (k === '.') {
            return (
              <button
                key="dot"
                type="button"
                className={styles.key}
                onClick={c.onAppendDot}
                aria-label="."
              >
                ,
              </button>
            );
          }
          return (
            <button
              key={k}
              type="button"
              className={styles.key}
              onClick={() => c.onAppendDigit(k)}
            >
              {k}
            </button>
          );
        })}
      </div>

      {c.submitError !== null ? (
        <div className={styles.errorBanner}>{c.submitError}</div>
      ) : null}

      {/* ── Primary CTA ── */}
      <button
        type="button"
        className={`${styles.cta} ${ctaReady ? '' : styles.ctaDisabled}`}
        onClick={c.onSubmit}
        disabled={!ctaReady || c.submitting}
        data-testid="native-add-cta"
      >
        {ctaLabel}
      </button>

      {/* Hidden native date input driven by «Своя дата». */}
      <input
        ref={c.dateInputRef}
        type="date"
        className={styles.hiddenDateInput}
        value={c.customDate}
        onChange={c.onChangeCustomDate}
        min={c.dateBounds?.min}
        max={c.dateBounds?.max}
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* ── Date action-sheet ── */}
      {dateSheetOpen && (
        <ActionSheet
          title="Дата"
          onClose={() => setDateSheetOpen(false)}
          testId="native-add-date-sheet"
        >
          <ActionItem
            label="Сегодня"
            sub={formatShortDate(todayIsoLocal())}
            active={c.dateChip === 'today'}
            onClick={() => {
              c.setDateChipToday();
              setDateSheetOpen(false);
            }}
          />
          <ActionItem
            label="Вчера"
            sub={formatShortDate(yesterdayIsoLocal())}
            active={c.dateChip === 'yesterday'}
            onClick={() => {
              c.setDateChipYesterday();
              setDateSheetOpen(false);
            }}
          />
          <ActionItem
            label="Своя дата"
            sub={
              c.dateChip === 'custom' && c.customDate
                ? formatShortDate(c.customDate)
                : undefined
            }
            active={c.dateChip === 'custom'}
            onClick={() => {
              setDateSheetOpen(false);
              c.onPickCustomDate();
            }}
          />
        </ActionSheet>
      )}

      {/* ── Category action-sheet (single-select, savings/paused hidden) ── */}
      {catPickerOpen && (
        <ActionSheet
          title="Категория"
          onClose={() => setCatPickerOpen(false)}
          testId="native-add-category-sheet"
        >
          {c.visibleCategories.length === 0 ? (
            <div className={styles.sheetEmpty}>Нет категорий</div>
          ) : (
            c.visibleCategories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={styles.catRow}
                aria-pressed={c.categoryId === cat.id}
                data-testid={`native-add-cat-${cat.id}`}
                onClick={() => {
                  c.setCategoryId(cat.id);
                  setCatPickerOpen(false);
                }}
              >
                <CategoryIcon name={cat.name} id={cat.id} size={28} />
                <span className={styles.catName}>{cat.name}</span>
                {c.categoryId === cat.id && (
                  <span className={styles.catCheck}>
                    <Check size={18} weight="bold" />
                  </span>
                )}
              </button>
            ))
          )}
        </ActionSheet>
      )}

      {/* ── Account picker (reuses the shared AccountPickerSheet) ── */}
      <AccountPickerSheet
        isOpen={accountPickerOpen}
        accounts={c.accounts}
        selectedAccountId={c.accountId}
        onSelect={(id) => {
          c.setAccountId(id);
          setAccountPickerOpen(false);
        }}
        onClose={() => setAccountPickerOpen(false)}
      />

      {/* ── Dirty-close confirm ── */}
      {showCancelConfirm && (
        <div
          className={styles.confirmBackdrop}
          role="dialog"
          aria-modal="true"
          data-testid="native-add-cancel-confirm"
        >
          <div className={styles.confirmBox}>
            <div className={styles.confirmTitle}>Отменить запись?</div>
            <div className={styles.confirmHint}>
              Введённые данные будут потеряны.
            </div>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.confirmContinue}
                onClick={() => setShowCancelConfirm(false)}
              >
                Продолжить
              </button>
              <button
                type="button"
                className={styles.confirmCancel}
                onClick={() => {
                  setShowCancelConfirm(false);
                  onClose();
                }}
              >
                Отменить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────── Local action-sheet helpers ───────────────────

function ActionSheet({
  title,
  onClose,
  testId,
  children,
}: {
  title: string;
  onClose: () => void;
  testId?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={styles.actionBackdrop}
      role="presentation"
      onClick={onClose}
      data-testid={testId}
    >
      <div
        className={styles.actionSheet}
        role="menu"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.actionTitle}>{title}</div>
        <div className={styles.actionGroup}>{children}</div>
        <button type="button" className={styles.actionCancel} onClick={onClose}>
          Отмена
        </button>
      </div>
    </div>
  );
}

function ActionItem({
  label,
  sub,
  active,
  onClick,
}: {
  label: string;
  sub?: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={active}
      className={styles.actionItem}
      onClick={onClick}
    >
      <span className={styles.actionItemMain}>
        <span className={styles.actionItemLabel}>{label}</span>
        {sub && <span className={styles.actionItemSub}>{sub}</span>}
      </span>
      {active && (
        <span className={styles.actionCheck}>
          <Check size={18} weight="bold" />
        </span>
      )}
    </button>
  );
}

const MONTHS_NOM = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
] as const;

function formatPeriodScope(periodStartIso: string): string {
  const [y, m] = periodStartIso.split('-').map(Number);
  return `${MONTHS_NOM[m - 1]} ${y}`;
}
