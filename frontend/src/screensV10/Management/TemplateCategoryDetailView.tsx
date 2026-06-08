// Native iOS per-category TEMPLATE detail (pushed from NativeTemplateView).
//
// The template-side mirror of PlanCategoryDetailView: same shape (nav-bar +
// summary card + add CTA + list), but the recurring «lines» schedule by a
// DAY-OF-MONTH (1..27) instead of a calendar date, and editing happens via an
// INLINE editor (NOT the shared AddSheet).
//
//   - NativeNavBar with the category name + back chevron.
//   - Summary card: CategoryIcon + ladder.
//       expense → Лимит / Запланировано / Свободно + INLINE limit edit
//                 (autosave on blur / Enter → putTemplateItem)
//       income  → Запланировано only (income has NO limit/target).
//   - CTA: «Добавить операцию» → opens the inline line editor (this category;
//     kind inherited, so NO category picker).
//   - InsetGroup of this category's recurring lines (amount + «N-е число» +
//     title); tap a row to edit it inline; the editor carries a «Удалить».
//
// Pure presentational: TemplateCategoryDetailMount wires the data + mutations.
// Money math lives in computeTemplate.ts.

import { memo, useEffect, useState } from 'react';
import { Plus, ArrowsClockwise } from '@phosphor-icons/react';
import {
  NativeNavBar,
  SectionHeader,
  InsetGroup,
  InsetRow,
} from '../native/NativePrimitives';
import { PosterSheet } from '../common';
import { CategoryIcon } from '../native/CategoryIcon';
import { formatMoneyNative, formatSignedMoneyNative } from '../native/money';
import { parseRublesToKopecks } from '../../utils/format';
import { sanitizeMoneyInput } from '../../utils/parseMoney';
import { useEnterToDismiss } from '../common/useEnterToDismiss';
import { RecurringEditor } from '../Recurring/RecurringEditor';
import { scheduleLabel } from '../Recurring/recurringFormat';
import type {
  CategoryV10,
  AccountResponse,
  SubscriptionV10Read,
  RecurringCreatePayload,
  RecurringUpdatePayload,
} from '../../api/v10';
import type {
  TemplateLineRead,
  TemplateLineCreate,
  TemplateLineUpdate,
} from '../../api/template';
import {
  linesForCategory,
  sumLines,
  dayOfMonthLabel,
  clampTemplateDay,
  TEMPLATE_DAY_MIN,
  TEMPLATE_DAY_MAX,
} from './computeTemplate';
import styles from './TemplateCategoryDetailView.module.css';

// ─────────────────── Props ───────────────────

export interface TemplateCategoryDetailViewProps {
  category: CategoryV10;
  /** This category's template limit (cents). Expense only; income ignores it. */
  limitCents: number;
  /** ALL template lines (filtered to this category here). */
  lines: TemplateLineRead[];
  /** Recurring payments scoped to THIS category (ADR-0007). */
  recurring: SubscriptionV10Read[];
  /** Accounts for the recurring editor's optional «Счёт» picker. */
  accounts: AccountResponse[];
  /** True while any mutation is in flight (disables editor submits). */
  busy: boolean;

  /**
   * Commit this EXPENSE category's template limit (blur / Enter) →
   * putTemplateItem. Income categories have no limit and never receive this.
   */
  onLimitCommit?: (categoryId: number, limitCents: number) => void;
  /** Create a recurring line in THIS category. */
  onCreateLine: (payload: TemplateLineCreate) => void;
  /** Edit a recurring line. */
  onEditLine: (lineId: number, payload: TemplateLineUpdate) => void;
  /** Delete a recurring line. */
  onDeleteLine: (lineId: number) => void;
  /** Create a recurring payment in THIS category (ADR-0007 fork). */
  onCreateRecurring: (payload: RecurringCreatePayload) => void;
  /** Update a recurring payment. */
  onUpdateRecurring: (id: number, payload: RecurringUpdatePayload) => void;
  /** Delete a recurring payment (hard delete). */
  onDeleteRecurring: (id: number) => void;
  /** Pop the router stack (back chevron). */
  onBack: () => void;
}

// ─────────── Inline rubles ↔ cents helpers (mirror the plan detail) ───────────

/** Cents → editable rubles string for an input (comma decimal, no grouping). */
function centsToRublesInput(cents: number): string {
  const abs = Math.max(0, Math.trunc(cents));
  if (abs === 0) return '';
  const rub = Math.floor(abs / 100);
  const kop = abs % 100;
  return kop === 0 ? `${rub}` : `${rub},${kop.toString().padStart(2, '0')}`;
}

/** Rubles input → cents (0 on empty/invalid; clamps negatives to 0). */
function rublesInputToCents(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed === '') return 0;
  return parseRublesToKopecks(trimmed) ?? 0;
}

// ─────────── Inline line editor (create + edit share this) ───────────
//
// Scoped to ONE category (kind inherited from it) → NO category picker. Fields:
// amount (₽), day-of-month (1..27), title. Day clamps to [1..27] on commit.

interface LineDraft {
  title: string;
  amountRaw: string;
  dayRaw: string;
}

function LineEditor({
  category,
  initial,
  isEdit,
  busy,
  onSubmitCreate,
  onSubmitEdit,
  onDelete,
  onCancel,
}: {
  category: CategoryV10;
  initial: LineDraft;
  isEdit: boolean;
  busy: boolean;
  onSubmitCreate: (payload: TemplateLineCreate) => void;
  onSubmitEdit: (payload: TemplateLineUpdate) => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [amountRaw, setAmountRaw] = useState(initial.amountRaw);
  const [dayRaw, setDayRaw] = useState(initial.dayRaw);

  const amountCents = parseRublesToKopecks(amountRaw.trim());
  const dayTrim = dayRaw.trim();
  const dayParsed = dayTrim === '' ? null : Number(dayTrim);
  const dayValid =
    dayParsed == null ||
    (Number.isInteger(dayParsed) &&
      dayParsed >= TEMPLATE_DAY_MIN &&
      dayParsed <= TEMPLATE_DAY_MAX);

  const canSubmit =
    title.trim() !== '' && amountCents != null && dayValid && !busy;

  function submit() {
    if (amountCents == null) return;
    // Clamp the day-of-month into [1..27] on commit (belt-and-suspenders with
    // the input filter / validity gate).
    const day = clampTemplateDay(dayParsed);
    if (isEdit) {
      const payload: TemplateLineUpdate = {
        category_id: category.id,
        kind: category.kind,
        title: title.trim(),
        amount_cents: amountCents,
        day_of_period: day,
      };
      onSubmitEdit(payload);
    } else {
      const payload: TemplateLineCreate = {
        category_id: category.id,
        kind: category.kind,
        title: title.trim(),
        amount_cents: amountCents,
        day_of_period: day,
      };
      onSubmitCreate(payload);
    }
  }

  // Clamp the day field to the valid range when the user commits via Enter.
  function commitDayClamp() {
    if (dayTrim === '') return;
    const clamped = clampTemplateDay(Number(dayTrim));
    setDayRaw(clamped == null ? '' : String(clamped));
  }

  const submitOnEnter = useEnterToDismiss(() => {
    if (canSubmit) submit();
  });
  const dayOnEnter = useEnterToDismiss(commitDayClamp);

  return (
    <div className={styles.editor} data-testid="template-line-editor">
      <div className={styles.field}>
        <span className={styles.fieldLabel}>Название</span>
        <input
          type="text"
          className={styles.fieldInput}
          placeholder="Например, Аренда"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={submitOnEnter}
          maxLength={200}
          aria-label="Название операции"
          data-testid="template-line-title"
          autoFocus
        />
      </div>

      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Сумма, ₽</span>
          <input
            type="text"
            inputMode="decimal"
            className={styles.fieldInput}
            placeholder="0"
            value={amountRaw}
            onChange={(e) => setAmountRaw(sanitizeMoneyInput(e.target.value))}
            onKeyDown={submitOnEnter}
            aria-label="Сумма операции"
            data-testid="template-line-amount"
          />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>
            Число ({TEMPLATE_DAY_MIN}–{TEMPLATE_DAY_MAX})
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={TEMPLATE_DAY_MIN}
            max={TEMPLATE_DAY_MAX}
            step={1}
            className={styles.fieldInput}
            placeholder="—"
            value={dayRaw}
            onChange={(e) =>
              setDayRaw(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))
            }
            onBlur={commitDayClamp}
            onKeyDown={dayOnEnter}
            aria-label={`День месяца (${TEMPLATE_DAY_MIN}–${TEMPLATE_DAY_MAX})`}
            data-testid="template-line-day"
          />
        </div>
      </div>

      <div className={styles.editorActions}>
        {isEdit ? (
          <button
            type="button"
            className={styles.dangerBtn}
            disabled={busy}
            onClick={onDelete}
            data-testid="template-line-delete"
          >
            Удалить
          </button>
        ) : (
          <span />
        )}
        <span className={styles.editorActionsRight}>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={onCancel}
            data-testid="template-line-cancel"
          >
            Отмена
          </button>
          <button
            type="button"
            className={styles.primaryBtn}
            disabled={!canSubmit}
            onClick={submit}
            data-testid="template-line-submit"
          >
            {busy ? '…' : isEdit ? 'Сохранить' : 'Добавить'}
          </button>
        </span>
      </div>
    </div>
  );
}

// ─────────── Inline EXPENSE limit editor (autosave on blur / Enter) ───────────
//
// Controlled local state so Enter (via useEnterToDismiss) commits the CURRENT
// field value; resyncs to the persisted limit whenever it changes (post-save /
// post-revert reload).

function LimitEditor({
  category,
  limitCents,
  onCommit,
}: {
  category: CategoryV10;
  limitCents: number;
  onCommit: (categoryId: number, limitCents: number) => void;
}) {
  const [raw, setRaw] = useState(centsToRublesInput(limitCents));
  // Resync the field when the persisted limit changes (reload after save).
  useEffect(() => {
    setRaw(centsToRublesInput(limitCents));
  }, [limitCents]);

  function commit() {
    const next = rublesInputToCents(raw);
    if (next !== limitCents) onCommit(category.id, next);
  }

  const onEnter = useEnterToDismiss(commit);

  return (
    <div className={styles.limitEditRow}>
      <span className={styles.limitEditLabel}>Лимит</span>
      <span className={styles.limitInputWrap}>
        <input
          type="text"
          inputMode="decimal"
          className={styles.limitInput}
          value={raw}
          onChange={(e) => setRaw(sanitizeMoneyInput(e.target.value))}
          onBlur={commit}
          onKeyDown={onEnter}
          aria-label={`Лимит для «${category.name}» в рублях`}
          data-testid="template-cat-limit-input"
        />
        <span className={styles.limitCur}>₽</span>
      </span>
    </div>
  );
}

// ─────────────────── Component ───────────────────

function TemplateCategoryDetailViewInner(props: TemplateCategoryDetailViewProps) {
  const {
    category,
    limitCents,
    lines,
    recurring,
    accounts,
    busy,
    onLimitCommit,
    onCreateLine,
    onEditLine,
    onDeleteLine,
    onCreateRecurring,
    onUpdateRecurring,
    onDeleteRecurring,
    onBack,
  } = props;

  const isIncome = category.kind === 'income';

  const [creating, setCreating] = useState(false);
  const [editingLineId, setEditingLineId] = useState<number | null>(null);
  // ADR-0007 fork: choosing what kind of line to add, plus recurring create /
  // edit state. `forkOpen` is the «Регулярный / Без даты» action sheet.
  const [forkOpen, setForkOpen] = useState(false);
  const [creatingRecurring, setCreatingRecurring] = useState(false);
  const [editingRecurringId, setEditingRecurringId] = useState<number | null>(
    null,
  );

  const rows = linesForCategory(lines, category.id);
  const scheduledCents = sumLines(rows);
  // Expense ladder: «Свободно» = лимит − запланировано (may go negative = soft
  // overflow). Income has no limit, so no free/overflow.
  const freeCents = limitCents - scheduledCents;
  const overflow = !isIncome && scheduledCents > limitCents;

  // «+ Добавить» now opens the fork (Регулярный платёж / Без даты).
  function openFork() {
    setEditingLineId(null);
    setEditingRecurringId(null);
    setCreatingRecurring(false);
    setCreating(false);
    setForkOpen(true);
  }
  function chooseRecurring() {
    setForkOpen(false);
    setCreating(false);
    setEditingLineId(null);
    setCreatingRecurring(true);
  }
  function chooseLine() {
    setForkOpen(false);
    setCreatingRecurring(false);
    setEditingRecurringId(null);
    setCreating(true);
  }
  function startEdit(id: number) {
    setCreating(false);
    setCreatingRecurring(false);
    setEditingRecurringId(null);
    setEditingLineId(id);
  }
  function startEditRecurring(id: number) {
    setCreating(false);
    setCreatingRecurring(false);
    setEditingLineId(null);
    setEditingRecurringId(id);
  }
  function handleCreate(payload: TemplateLineCreate) {
    onCreateLine(payload);
    setCreating(false);
  }
  function handleEdit(lineId: number, payload: TemplateLineUpdate) {
    onEditLine(lineId, payload);
    setEditingLineId(null);
  }
  function handleDelete(lineId: number) {
    onDeleteLine(lineId);
    setEditingLineId(null);
  }
  function handleCreateRecurring(payload: RecurringCreatePayload) {
    onCreateRecurring(payload);
    setCreatingRecurring(false);
  }
  function handleUpdateRecurring(id: number, payload: RecurringUpdatePayload) {
    onUpdateRecurring(id, payload);
    setEditingRecurringId(null);
  }
  function handleDeleteRecurring(id: number) {
    onDeleteRecurring(id);
    setEditingRecurringId(null);
  }

  const editingRecurring =
    editingRecurringId == null
      ? null
      : (recurring.find((r) => r.id === editingRecurringId) ?? null);

  return (
    <div className={styles.root} data-testid="template-cat-detail">
      <NativeNavBar title={category.name} onBack={onBack} />

      {/* ─────────── Summary card ─────────── */}
      <div className={styles.summaryCard} data-testid="template-cat-summary">
        <div className={styles.summaryHead}>
          <CategoryIcon
            name={category.name}
            id={category.id}
            icon={category.icon}
            size={36}
          />
          <div className={styles.summaryHeadText}>
            <div className={styles.summaryName}>{category.name}</div>
            <div className={styles.summaryFact}>
              {formatMoneyNative(isIncome ? scheduledCents : limitCents)}
              <span className={styles.summaryCur}>₽</span>
            </div>
          </div>
        </div>

        {/* Ladder. */}
        <div className={styles.statsRow} data-testid="template-cat-ladder">
          {isIncome ? (
            <div className={styles.statCol}>
              <span className={styles.statLabel}>Запланировано</span>
              <span className={`${styles.statValue} ${styles.statPositive}`}>
                {formatMoneyNative(scheduledCents)}
              </span>
            </div>
          ) : (
            <>
              <div className={styles.statCol}>
                <span className={styles.statLabel}>Лимит</span>
                <span className={styles.statValue}>
                  {formatMoneyNative(limitCents)}
                </span>
              </div>
              <div className={styles.statCol}>
                <span className={styles.statLabel}>Запланировано</span>
                <span className={styles.statValue}>
                  {formatMoneyNative(scheduledCents)}
                </span>
              </div>
              <div className={`${styles.statCol} ${styles.statColEnd}`}>
                <span className={styles.statLabel}>Свободно</span>
                <span
                  className={`${styles.statValue} ${
                    overflow ? styles.statNegative : styles.statPositive
                  }`}
                >
                  {formatSignedMoneyNative(freeCents)}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Inline «Лимит» edit (EXPENSE only) — autosave on blur / Enter. */}
        {!isIncome && onLimitCommit && (
          <LimitEditor
            category={category}
            limitCents={limitCents}
            onCommit={onLimitCommit}
          />
        )}
      </div>

      {/* ─────────── CTA row ─────────── */}
      <div className={styles.ctaRow}>
        <button
          type="button"
          className={styles.ctaPrimary}
          data-testid="template-cat-add"
          onClick={openFork}
        >
          <Plus size={17} weight="bold" />
          Добавить
        </button>
      </div>

      {/* ─────────── Add-fork action sheet (ADR-0007) ─────────── */}
      <PosterSheet
        isOpen={forkOpen}
        onClose={() => setForkOpen(false)}
        testId="template-add-fork"
      >
        <div className={styles.forkSheet}>
          <div className={styles.forkTitle}>Что добавить?</div>
          <button
            type="button"
            className={styles.forkItem}
            data-testid="template-fork-recurring"
            onClick={chooseRecurring}
          >
            <span className={styles.forkItemMain}>
              <span className={styles.forkItemLabel}>Регулярный платёж</span>
              <span className={styles.forkItemSub}>
                Раз в N месяцев на заданное число, по календарю
              </span>
            </span>
          </button>
          <button
            type="button"
            className={styles.forkItem}
            data-testid="template-fork-line"
            onClick={chooseLine}
          >
            <span className={styles.forkItemMain}>
              <span className={styles.forkItemLabel}>Без даты</span>
              <span className={styles.forkItemSub}>
                Повторяемая оценка без календарной даты
              </span>
            </span>
          </button>
          <button
            type="button"
            className={`${styles.forkItem} ${styles.forkCancel}`}
            onClick={() => setForkOpen(false)}
          >
            Отмена
          </button>
        </div>
      </PosterSheet>

      {/* ─────────── Recurring payments list (ADR-0007) ─────────── */}
      <SectionHeader>Регулярные платежи</SectionHeader>

      {creatingRecurring && (
        <RecurringEditor
          category={category}
          accounts={accounts}
          busy={busy}
          onCreate={handleCreateRecurring}
          onUpdate={handleUpdateRecurring}
          onDelete={handleDeleteRecurring}
          onCancel={() => setCreatingRecurring(false)}
        />
      )}

      {editingRecurring && (
        <RecurringEditor
          category={category}
          existing={editingRecurring}
          accounts={accounts}
          busy={busy}
          onCreate={handleCreateRecurring}
          onUpdate={handleUpdateRecurring}
          onDelete={handleDeleteRecurring}
          onCancel={() => setEditingRecurringId(null)}
        />
      )}

      {recurring.length === 0 && !creatingRecurring ? (
        <div className={styles.empty} data-testid="template-cat-recurring-empty">
          Регулярных платежей пока нет
        </div>
      ) : (
        <InsetGroup>
          {recurring
            .filter((r) => r.id !== editingRecurringId)
            .map((r) => (
              <InsetRow
                key={r.id}
                testId={`template-recurring-row-${r.id}`}
                leading={
                  <CategoryIcon
                    name={category.name}
                    id={category.id}
                    icon={category.icon}
                  />
                }
                title={
                  <span className={styles.lineTitle}>
                    <ArrowsClockwise
                      size={13}
                      weight="bold"
                      className={styles.recurringBadge}
                    />
                    {r.name}
                  </span>
                }
                subtitle={
                  <span className={styles.lineMeta}>{scheduleLabel(r)}</span>
                }
                trailing={
                  <span
                    className={`${styles.lineAmount} ${
                      isIncome ? styles.lineAmountIncome : ''
                    }`}
                  >
                    {isIncome ? '+' : ''}
                    {formatMoneyNative(r.amount_cents)} ₽
                  </span>
                }
                chevron
                onClick={() => startEditRecurring(r.id)}
              />
            ))}
        </InsetGroup>
      )}

      {/* ─────────── Recurring lines list ─────────── */}
      <SectionHeader>Регулярные операции (без даты)</SectionHeader>

      {creating && (
        <InsetGroup>
          <LineEditor
            category={category}
            isEdit={false}
            busy={busy}
            initial={{ title: '', amountRaw: '', dayRaw: '' }}
            onSubmitCreate={handleCreate}
            onSubmitEdit={() => {}}
            onDelete={() => {}}
            onCancel={() => setCreating(false)}
          />
        </InsetGroup>
      )}

      {rows.length === 0 && !creating ? (
        <div className={styles.empty} data-testid="template-cat-empty">
          Регулярных операций пока нет
        </div>
      ) : (
        <InsetGroup>
          {rows.map((line) =>
            editingLineId === line.id ? (
              <LineEditor
                key={line.id}
                category={category}
                isEdit
                busy={busy}
                initial={{
                  title: line.title,
                  amountRaw: centsToRublesInput(line.amount_cents),
                  dayRaw:
                    line.day_of_period == null
                      ? ''
                      : String(line.day_of_period),
                }}
                onSubmitCreate={() => {}}
                onSubmitEdit={(payload) => handleEdit(line.id, payload)}
                onDelete={() => handleDelete(line.id)}
                onCancel={() => setEditingLineId(null)}
              />
            ) : (
              <InsetRow
                key={line.id}
                testId={`template-line-row-${line.id}`}
                leading={
                  <CategoryIcon
                    name={category.name}
                    id={category.id}
                    icon={category.icon}
                  />
                }
                title={<span className={styles.lineTitle}>{line.title}</span>}
                subtitle={
                  <span className={styles.lineMeta}>
                    {dayOfMonthLabel(line.day_of_period)}
                  </span>
                }
                trailing={
                  <span
                    className={`${styles.lineAmount} ${
                      isIncome ? styles.lineAmountIncome : ''
                    }`}
                  >
                    {isIncome ? '+' : ''}
                    {formatMoneyNative(line.amount_cents)} ₽
                  </span>
                }
                chevron
                onClick={() => startEdit(line.id)}
              />
            ),
          )}
        </InsetGroup>
      )}

      <div className={styles.footnote}>
        Эти операции добавляются в план каждого нового месяца на указанное число.
        Текущий месяц не затрагивается.
      </div>
    </div>
  );
}

export const TemplateCategoryDetailView = memo(TemplateCategoryDetailViewInner);
