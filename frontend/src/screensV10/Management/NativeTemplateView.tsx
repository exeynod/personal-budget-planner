// v1.1 planning — native iOS template-management view («Шаблон»).
//
// A pushed detail screen (back nav-bar + grouped inset sections):
//   - intro blurb: the template auto-applies to each NEW month; the current
//     month is NOT touched.
//   - «Лимиты по категориям» — every EXPENSE category with its template limit
//     (TemplateItemRead.limit_cents). Tap a row → inline rubles editor →
//     putTemplateItem(categoryId, limitCents).
//   - «Регулярные операции» — recurring template LINES (TemplateLineRead). Each
//     row = CategoryIcon + title + «N-й день · amount». «+ Добавить» creates a
//     line (category selector + title + amount + day); tap a row to edit; the
//     editor carries a «Удалить» affordance.
//
// Pure presentational: all data + mutations live in TemplateMount. Mirrors the
// NativeCategoriesView conventions (NativeNavBar + InsetGroup/InsetRow + inline
// editors + data-testid discipline + rubles↔cents money input).

import { memo, useState } from 'react';
import {
  NativeNavBar,
  SectionHeader,
  SectionHeaderAction,
  InsetGroup,
  InsetRow,
} from '../native/NativePrimitives';
import { CategoryIcon } from '../native/CategoryIcon';
import { formatMoneyNative } from '../native/money';
import { parseRublesToKopecks } from '../../utils/format';
import { sanitizeMoneyInput } from '../../utils/parseMoney';
import type { CategoryV10 } from '../../api/v10';
import type {
  TemplateItemRead,
  TemplateLineRead,
  TemplateLineCreate,
  TemplateLineUpdate,
} from '../../api/template';
import styles from './NativeTemplateView.module.css';

export type LineKind = 'expense' | 'income';

export interface TemplateViewProps {
  /** Active (non-archived) categories — both kinds; expense drive the limits. */
  categories: CategoryV10[];
  /** Per-category template limits. */
  items: TemplateItemRead[];
  /** Recurring template lines. */
  lines: TemplateLineRead[];
  loading: boolean;
  error: string | null;
  /** True while any mutation request is in flight. */
  busy: boolean;
  /** Upsert a category's template limit (cents). */
  onSaveItem: (categoryId: number, limitCents: number) => void;
  onCreateLine: (payload: TemplateLineCreate) => void;
  onEditLine: (lineId: number, payload: TemplateLineUpdate) => void;
  onDeleteLine: (lineId: number) => void;
  onBack: () => void;
}

/** «N-й день» day-of-period label, or «без дня» when unset. */
function dayLabel(day: number | null): string {
  return day == null ? 'без дня' : `${day}-й день`;
}

/**
 * Cents → editable rubles input string (comma decimal, no thousands separator),
 * round-trippable by `parseRublesToKopecks`. Empty for 0 (cleaner field).
 *   150000 → "1500"   ·   150050 → "1500,50"   ·   0 → ""
 */
function centsToInput(cents: number): string {
  if (cents <= 0) return '';
  const rub = Math.floor(cents / 100);
  const kop = cents % 100;
  return kop === 0 ? String(rub) : `${rub},${String(kop).padStart(2, '0')}`;
}

// ─────────── Inline limit editor (rubles → cents) ───────────

function LimitEditor({
  category,
  currentCents,
  busy,
  onSubmit,
  onCancel,
}: {
  category: CategoryV10;
  currentCents: number;
  busy: boolean;
  onSubmit: (limitCents: number) => void;
  onCancel: () => void;
}) {
  // Seed with the current limit in rubles (empty when 0 → cleaner field).
  const [raw, setRaw] = useState(centsToInput(currentCents));
  // 0 is a valid template limit (clears it) — empty string maps to 0.
  const trimmed = raw.trim();
  const parsed = trimmed === '' ? 0 : parseRublesToKopecks(trimmed);
  const valid = parsed != null;

  return (
    <div className={styles.editor} data-testid="template-item-editor">
      <span className={styles.editorLabel}>Лимит «{category.name}», ₽</span>
      <input
        type="text"
        inputMode="decimal"
        className={styles.field}
        placeholder="0"
        value={raw}
        onChange={(e) => setRaw(sanitizeMoneyInput(e.target.value))}
        aria-label={`Лимит категории ${category.name}`}
        data-testid="template-item-amount"
        autoFocus
      />
      <div className={styles.editorActions}>
        <button
          type="button"
          className={styles.secondaryBtn}
          onClick={onCancel}
          data-testid="template-item-cancel"
        >
          Отмена
        </button>
        <button
          type="button"
          className={styles.primaryBtn}
          disabled={!valid || busy}
          onClick={() => valid && onSubmit(parsed ?? 0)}
          data-testid="template-item-submit"
        >
          {busy ? '…' : 'Сохранить'}
        </button>
      </div>
    </div>
  );
}

// ─────────── Inline line editor (create + edit share this) ───────────

interface LineDraft {
  categoryId: number | null;
  kind: LineKind;
  title: string;
  amountRaw: string;
  dayRaw: string;
}

function LineEditor({
  categories,
  initial,
  busy,
  isEdit,
  onSubmitCreate,
  onSubmitEdit,
  onDelete,
  onCancel,
}: {
  categories: CategoryV10[];
  initial: LineDraft;
  busy: boolean;
  isEdit: boolean;
  onSubmitCreate: (payload: TemplateLineCreate) => void;
  onSubmitEdit: (payload: TemplateLineUpdate) => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const [categoryId, setCategoryId] = useState<number | null>(
    initial.categoryId,
  );
  const [kind, setKind] = useState<LineKind>(initial.kind);
  const [title, setTitle] = useState(initial.title);
  const [amountRaw, setAmountRaw] = useState(initial.amountRaw);
  const [dayRaw, setDayRaw] = useState(initial.dayRaw);

  // When the category changes, follow its kind (income/expense) for sanity.
  function pickCategory(id: number | null) {
    setCategoryId(id);
    const cat = categories.find((c) => c.id === id);
    if (cat) setKind(cat.kind);
  }

  const amountCents = parseRublesToKopecks(amountRaw.trim());
  const dayTrim = dayRaw.trim();
  const dayNum = dayTrim === '' ? null : Number(dayTrim);
  const dayValid =
    dayNum == null ||
    (Number.isInteger(dayNum) && dayNum >= 1 && dayNum <= 31);
  const canSubmit =
    categoryId != null &&
    title.trim() !== '' &&
    amountCents != null &&
    dayValid &&
    !busy;

  function submit() {
    if (categoryId == null || amountCents == null || !dayValid) return;
    if (isEdit) {
      const payload: TemplateLineUpdate = {
        category_id: categoryId,
        kind,
        title: title.trim(),
        amount_cents: amountCents,
        day_of_period: dayNum,
      };
      onSubmitEdit(payload);
    } else {
      const payload: TemplateLineCreate = {
        category_id: categoryId,
        kind,
        title: title.trim(),
        amount_cents: amountCents,
        day_of_period: dayNum,
      };
      onSubmitCreate(payload);
    }
  }

  return (
    <div className={styles.editor} data-testid="template-line-editor">
      <span className={styles.editorLabel}>Категория</span>
      <select
        className={styles.field}
        value={categoryId ?? ''}
        onChange={(e) =>
          pickCategory(e.target.value === '' ? null : Number(e.target.value))
        }
        aria-label="Категория операции"
        data-testid="template-line-category"
      >
        <option value="">— выберите категорию —</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} ({c.kind === 'income' ? 'доход' : 'расход'})
          </option>
        ))}
      </select>

      <span className={styles.editorLabel}>Название</span>
      <input
        type="text"
        className={styles.field}
        placeholder="Например, Аренда"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
        aria-label="Название операции"
        data-testid="template-line-title"
      />

      <div className={styles.fieldRow}>
        <div>
          <span className={styles.editorLabel}>Сумма, ₽</span>
          <input
            type="text"
            inputMode="decimal"
            className={styles.field}
            placeholder="0"
            value={amountRaw}
            onChange={(e) => setAmountRaw(sanitizeMoneyInput(e.target.value))}
            aria-label="Сумма операции"
            data-testid="template-line-amount"
          />
        </div>
        <div>
          <span className={styles.editorLabel}>День (1–31)</span>
          <input
            type="text"
            inputMode="numeric"
            className={styles.field}
            placeholder="—"
            value={dayRaw}
            onChange={(e) =>
              setDayRaw(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))
            }
            aria-label="День периода"
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

// ─────────── Main view ───────────

function NativeTemplateViewInner(props: TemplateViewProps) {
  const {
    categories,
    items,
    lines,
    loading,
    error,
    busy,
    onSaveItem,
    onCreateLine,
    onEditLine,
    onDeleteLine,
    onBack,
  } = props;

  // Which category limit is in edit-mode; whether the «+ line» editor is open;
  // which line row is in edit-mode (mutually exclusive editors).
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [creatingLine, setCreatingLine] = useState(false);
  const [editingLineId, setEditingLineId] = useState<number | null>(null);

  const limitByCat = new Map(items.map((it) => [it.category_id, it.limit_cents]));
  const catById = new Map(categories.map((c) => [c.id, c]));
  const expenseCats = categories.filter((c) => c.kind === 'expense');

  function startItemEdit(id: number) {
    setCreatingLine(false);
    setEditingLineId(null);
    setEditingItemId(id);
  }
  function startLineCreate() {
    setEditingItemId(null);
    setEditingLineId(null);
    setCreatingLine(true);
  }
  function startLineEdit(id: number) {
    setEditingItemId(null);
    setCreatingLine(false);
    setEditingLineId(id);
  }

  function handleSaveItem(categoryId: number, limitCents: number) {
    onSaveItem(categoryId, limitCents);
    setEditingItemId(null);
  }
  function handleCreateLine(payload: TemplateLineCreate) {
    onCreateLine(payload);
    setCreatingLine(false);
  }
  function handleEditLine(lineId: number, payload: TemplateLineUpdate) {
    onEditLine(lineId, payload);
    setEditingLineId(null);
  }
  function handleDeleteLine(lineId: number) {
    onDeleteLine(lineId);
    setEditingLineId(null);
  }

  return (
    <div className={styles.root} data-testid="native-template-view">
      <NativeNavBar title="Шаблон" onBack={onBack} />

      {loading && (
        <div className={styles.banner} data-testid="native-template-loading">
          Загрузка…
        </div>
      )}
      {error && (
        <div
          className={`${styles.banner} ${styles.bannerError}`}
          data-testid="native-template-error"
        >
          {error}
        </div>
      )}

      <div className={styles.intro} data-testid="native-template-intro">
        Шаблон автоматически применяется к каждому новому месяцу: лимиты по
        категориям и регулярные операции переносятся в новый период. Текущий
        месяц при изменении шаблона не затрагивается.
      </div>

      {/* ───── Per-category template limits (expense) ───── */}
      <SectionHeader>Лимиты по категориям</SectionHeader>
      <InsetGroup>
        {expenseCats.length === 0 ? (
          <InsetRow
            title={<span className={styles.muted}>Нет категорий расходов</span>}
            testId="template-items-empty"
          />
        ) : (
          expenseCats.map((cat) => {
            const limit = limitByCat.get(cat.id) ?? 0;
            return editingItemId === cat.id ? (
              <LimitEditor
                key={cat.id}
                category={cat}
                currentCents={limit}
                busy={busy}
                onSubmit={(cents) => handleSaveItem(cat.id, cents)}
                onCancel={() => setEditingItemId(null)}
              />
            ) : (
              <InsetRow
                key={cat.id}
                testId={`template-item-row-${cat.id}`}
                leading={
                  <CategoryIcon name={cat.name} id={cat.id} icon={cat.icon} />
                }
                title={cat.name}
                trailing={
                  <span
                    className={`${styles.limitValue} ${
                      limit === 0 ? styles.limitValueEmpty : ''
                    }`}
                  >
                    {limit === 0 ? 'не задан' : `${formatMoneyNative(limit)} ₽`}
                  </span>
                }
                chevron
                onClick={() => startItemEdit(cat.id)}
              />
            );
          })
        )}
      </InsetGroup>

      {/* ───── Recurring template lines ───── */}
      <SectionHeader
        trailing={
          <SectionHeaderAction
            onClick={startLineCreate}
            testId="template-line-add"
          >
            + Добавить
          </SectionHeaderAction>
        }
      >
        Регулярные операции
      </SectionHeader>

      {creatingLine && (
        <InsetGroup>
          <LineEditor
            categories={categories}
            isEdit={false}
            busy={busy}
            initial={{
              categoryId: null,
              kind: 'expense',
              title: '',
              amountRaw: '',
              dayRaw: '',
            }}
            onSubmitCreate={handleCreateLine}
            onSubmitEdit={() => {}}
            onDelete={() => {}}
            onCancel={() => setCreatingLine(false)}
          />
        </InsetGroup>
      )}

      <InsetGroup>
        {lines.length === 0 && !creatingLine ? (
          <InsetRow
            title={
              <span className={styles.muted}>Нет регулярных операций</span>
            }
            testId="template-lines-empty"
          />
        ) : (
          lines.map((line) => {
            const cat = catById.get(line.category_id);
            const catName = cat?.name ?? 'Категория';
            return editingLineId === line.id ? (
              <LineEditor
                key={line.id}
                categories={categories}
                isEdit
                busy={busy}
                initial={{
                  categoryId: line.category_id,
                  kind: line.kind,
                  title: line.title,
                  amountRaw: centsToInput(line.amount_cents),
                  dayRaw:
                    line.day_of_period == null
                      ? ''
                      : String(line.day_of_period),
                }}
                onSubmitCreate={() => {}}
                onSubmitEdit={(payload) => handleEditLine(line.id, payload)}
                onDelete={() => handleDeleteLine(line.id)}
                onCancel={() => setEditingLineId(null)}
              />
            ) : (
              <InsetRow
                key={line.id}
                testId={`template-line-row-${line.id}`}
                leading={
                  <CategoryIcon
                    name={catName}
                    id={line.category_id}
                    icon={cat?.icon}
                  />
                }
                title={line.title}
                subtitle={
                  <span className={styles.lineMeta}>
                    {catName} · {dayLabel(line.day_of_period)}
                  </span>
                }
                trailing={
                  <span
                    className={`${styles.lineAmount} ${
                      line.kind === 'income' ? styles.lineAmountIncome : ''
                    }`}
                  >
                    {line.kind === 'income' ? '+' : ''}
                    {formatMoneyNative(line.amount_cents)} ₽
                  </span>
                }
                chevron
                onClick={() => startLineEdit(line.id)}
              />
            );
          })
        )}
      </InsetGroup>

      <div className={styles.footnote}>
        Регулярные операции (аренда, зарплата, подписки) добавляются в план
        каждого нового месяца на указанный день периода.
      </div>
    </div>
  );
}

export const NativeTemplateView = memo(NativeTemplateViewInner);
