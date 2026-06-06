// v1.1 planning rework — native iOS «Шаблон бюджета» view.
//
// Pushed detail screen, opened from the Management hub. The template is the
// «set-once, edit-rarely» source the backend auto-applies to a new period:
//   - per-category limit (TemplateItem, upsert)
//   - recurring detail lines (TemplateLine: title, amount, day_of_period, kind).
//
// UX mirrors NativePlanView (inset-grouped categories with an inline ₽ field +
// a «Строки» disclosure that lists the recurring lines with CRUD + an add row).
// A Расход/Доход segment narrows the category list (categories carry `kind`).
//
// Pure presentational: TemplateMount owns all data + handlers. We never PATCH on
// keystroke for the limit — the user commits via blur / Enter (onLimitCommit),
// exactly like a native form field.

import { memo, useState } from 'react';
import { Trash } from '@phosphor-icons/react';
import {
  NativeNavBar,
  SectionHeader,
  InsetGroup,
  Segmented,
  type SegOption,
} from '../native/NativePrimitives';
import { CategoryIcon } from '../native/CategoryIcon';
import { formatMoneyNative } from '../native/money';
import type { CategoryV10 } from '../../api/v10';
import type { TemplateLineV11Read } from '../../api/v10';
import styles from './NativeTemplateView.module.css';

// ─────────── rubles ↔ cents (identical semantics to NativePlanView) ───────────

function rublesInputToCents(raw: string): number {
  const cleaned = raw
    .replace(/[\s  ]/g, '')
    .replace(',', '.')
    .replace(/[^0-9.]/g, '');
  if (cleaned === '' || cleaned === '.') return 0;
  const rub = Number.parseFloat(cleaned);
  if (!Number.isFinite(rub) || rub < 0) return 0;
  return Math.round(rub * 100);
}

function centsToRublesInput(cents: number): string {
  const abs = Math.max(0, Math.trunc(cents));
  const rub = Math.floor(abs / 100);
  const kop = abs % 100;
  return kop === 0 ? `${rub}` : `${rub},${kop.toString().padStart(2, '0')}`;
}

// ─────────── Props ───────────

/** Payload emitted by «+ добавить строку». */
export interface AddTemplateLineDraft {
  categoryId: number;
  kind: 'expense' | 'income';
  title: string;
  amountCents: number;
  dayOfPeriod: number | null;
}

export interface NativeTemplateViewProps {
  categories: CategoryV10[];
  /** Per-category template limit in cents, keyed by category_id. */
  limitByCat: Map<number, number>;
  /** Recurring template lines grouped by category_id. */
  linesByCat: Map<number, TemplateLineV11Read[]>;

  /** Upsert a per-category limit (rubles parsed → cents by the view). */
  onLimitCommit: (catId: number, cents: number) => void;
  /** Create a new recurring line. */
  onAddLine: (draft: AddTemplateLineDraft) => void;
  /** Delete a recurring line. */
  onDeleteLine: (lineId: number) => void;
  onBack: () => void;
}

const SEG_OPTIONS: ReadonlyArray<SegOption<'expense' | 'income'>> = [
  { value: 'expense', label: 'Расход' },
  { value: 'income', label: 'Доход' },
];

/** Clamp a free-typed day into 1..31, or null when empty/invalid. */
function parseDay(raw: string): number | null {
  const n = Number.parseInt(raw.replace(/[^0-9]/g, ''), 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(31, n);
}

function NativeTemplateViewInner(props: NativeTemplateViewProps) {
  const {
    categories,
    limitByCat,
    linesByCat,
    onLimitCommit,
    onAddLine,
    onDeleteLine,
    onBack,
  } = props;

  const [seg, setSeg] = useState<'expense' | 'income'>('expense');
  // Single-open accordion for the «Строки» disclosure.
  const [openCatId, setOpenCatId] = useState<number | null>(null);
  // Local draft of the limit input per category (uncommitted typing).
  const [limitDraft, setLimitDraft] = useState<Record<number, string>>({});
  // Add-line draft, scoped to the open category.
  const [addTitle, setAddTitle] = useState('');
  const [addAmount, setAddAmount] = useState('');
  const [addDay, setAddDay] = useState('');

  const visible = categories.filter((c) => c.kind === seg);

  function commitLimit(catId: number) {
    const raw = limitDraft[catId];
    if (raw == null) return;
    onLimitCommit(catId, rublesInputToCents(raw));
  }

  function resetAddDraft() {
    setAddTitle('');
    setAddAmount('');
    setAddDay('');
  }

  return (
    <div className={styles.root} data-testid="native-template-view">
      <NativeNavBar title="Шаблон бюджета" onBack={onBack} />

      <div className={styles.segWrap}>
        <Segmented
          options={SEG_OPTIONS}
          value={seg}
          onChange={(v) => {
            setSeg(v);
            setOpenCatId(null);
          }}
          ariaLabel="Тип категорий"
        />
      </div>

      <SectionHeader>
        {seg === 'expense' ? 'Расходы' : 'Доходы'} · {visible.length}
      </SectionHeader>

      {visible.length === 0 ? (
        <div className={styles.empty} data-testid="native-template-empty">
          Нет категорий этого типа.
        </div>
      ) : (
        <InsetGroup>
          {visible.map((c) => {
            const limitCents = limitByCat.get(c.id) ?? 0;
            const inputValue =
              limitDraft[c.id] ?? centsToRublesInput(limitCents);
            const lines = linesByCat.get(c.id) ?? [];
            const open = openCatId === c.id;
            return (
              <div
                key={c.id}
                className={styles.catRow}
                data-testid={`native-template-cat-${c.id}`}
              >
                <div className={styles.catTop}>
                  <CategoryIcon name={c.name} id={c.id} />
                  <span className={styles.catName}>{c.name}</span>
                  <span className={styles.catInputWrap}>
                    <input
                      type="text"
                      inputMode="decimal"
                      className={styles.catInput}
                      value={inputValue}
                      onChange={(e) =>
                        setLimitDraft((d) => ({ ...d, [c.id]: e.target.value }))
                      }
                      onBlur={() => commitLimit(c.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          commitLimit(c.id);
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                      aria-label={`Лимит шаблона для «${c.name}» в рублях`}
                      data-testid={`native-template-limit-${c.id}`}
                    />
                    <span className={styles.catCur}>₽</span>
                  </span>
                </div>

                {/* «Строки» disclosure */}
                <div className={styles.detailWrap}>
                  <button
                    type="button"
                    className={styles.detailToggle}
                    onClick={() => {
                      setOpenCatId(open ? null : c.id);
                      resetAddDraft();
                    }}
                    data-testid={`native-template-toggle-${c.id}`}
                  >
                    {open ? '▾' : '▸'} Строки
                    {lines.length > 0 ? ` · ${lines.length}` : ''}
                  </button>

                  {open && (
                    <div
                      className={styles.detailBody}
                      data-testid={`native-template-lines-${c.id}`}
                    >
                      {lines.map((l) => (
                        <div
                          key={l.id}
                          className={styles.lineRow}
                          data-testid={`native-template-line-${l.id}`}
                        >
                          <span className={styles.lineMain}>
                            <span className={styles.lineTitle}>{l.title}</span>
                            <span className={styles.lineSub}>
                              {formatMoneyNative(l.amount_cents)} ₽
                              {l.day_of_period != null
                                ? ` · ${l.day_of_period} числа`
                                : ''}
                            </span>
                          </span>
                          <button
                            type="button"
                            className={styles.lineDelete}
                            onClick={() => onDeleteLine(l.id)}
                            aria-label={`Удалить строку «${l.title}»`}
                            data-testid={`native-template-line-del-${l.id}`}
                          >
                            <Trash size={16} weight="bold" />
                          </button>
                        </div>
                      ))}

                      {/* + добавить строку */}
                      <div className={styles.addLine}>
                        <input
                          type="text"
                          className={styles.addInput}
                          placeholder="Название"
                          value={addTitle}
                          onChange={(e) => setAddTitle(e.target.value)}
                          data-testid={`native-template-add-title-${c.id}`}
                        />
                        <div className={styles.addRow}>
                          <input
                            type="text"
                            inputMode="decimal"
                            className={styles.addInputSm}
                            placeholder="₽"
                            value={addAmount}
                            onChange={(e) => setAddAmount(e.target.value)}
                            data-testid={`native-template-add-amount-${c.id}`}
                          />
                          <input
                            type="text"
                            inputMode="numeric"
                            className={styles.addInputSm}
                            placeholder="День (опц.)"
                            value={addDay}
                            onChange={(e) => setAddDay(e.target.value)}
                            data-testid={`native-template-add-day-${c.id}`}
                          />
                          <button
                            type="button"
                            className={styles.addBtn}
                            disabled={
                              addTitle.trim() === '' ||
                              rublesInputToCents(addAmount) <= 0
                            }
                            onClick={() => {
                              onAddLine({
                                categoryId: c.id,
                                kind: c.kind,
                                title: addTitle.trim(),
                                amountCents: rublesInputToCents(addAmount),
                                dayOfPeriod: parseDay(addDay),
                              });
                              resetAddDraft();
                            }}
                            data-testid={`native-template-add-submit-${c.id}`}
                          >
                            Добавить
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </InsetGroup>
      )}

      <div className={styles.footnote}>
        Лимиты и строки шаблона автоматически применяются к новому периоду.
      </div>
    </div>
  );
}

export const NativeTemplateView = memo(NativeTemplateViewInner);
