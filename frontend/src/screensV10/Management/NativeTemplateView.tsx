// Native iOS TEMPLATE OVERVIEW («Шаблон»).
//
// Reworked to MIRROR the PLAN overview (Plan/NativePlanView): a compact,
// READ-ONLY list of categories with their summary, where the WHOLE row taps
// into the per-category template detail (limit edit + recurring lines live
// there). The template is the «set-once, auto-applied to every NEW month»
// source; recurring lines schedule by a DAY-OF-MONTH (1..27), not a date.
//
// Structure (mirrors NativePlanView, minus «Регулярные платежи»/subscriptions
// and minus the «Осталось распределить» surplus card — the template has no
// period/income context):
//   - NativeNavBar «Шаблон» + back
//   - Расходы / Доходы segment
//   - short note: the template auto-applies to each NEW month (current month
//     untouched)
//   - «Категории»: each row = icon · name · summary · chevron
//       expense → «Лимит X · Запланировано Y»
//       income  → «Запланировано Y» (income has NO limit)
//
// Pure presentational: TemplateMount wires data + the drill-in push.

import { memo, useState } from 'react';
import { CaretRight } from '@phosphor-icons/react';
import {
  NativeNavBar,
  SectionHeader,
  InsetGroup,
  Segmented,
} from '../native/NativePrimitives';
import { CategoryIcon } from '../native/CategoryIcon';
import { formatMoneyNative } from '../native/money';
import type { CategoryV10 } from '../../api/v10';
import type { TemplateItemRead, TemplateLineRead } from '../../api/template';
import { limitByCategory, scheduledByCategory } from './computeTemplate';
import styles from './NativeTemplateView.module.css';

export interface TemplateViewProps {
  /** Active (non-archived) categories — both kinds. */
  categories: CategoryV10[];
  /** Per-category template limits. */
  items: TemplateItemRead[];
  /** Recurring template lines. */
  lines: TemplateLineRead[];
  loading: boolean;
  error: string | null;
  /** Drill into a category's template detail (push). */
  onCategoryTap: (categoryId: number) => void;
  onBack: () => void;
}

type Seg = 'expenses' | 'income';

function NativeTemplateViewInner(props: TemplateViewProps) {
  const { categories, items, lines, loading, error, onCategoryTap, onBack } =
    props;

  const [seg, setSeg] = useState<Seg>('expenses');

  const limitByCat = limitByCategory(items);
  const scheduledByCat = scheduledByCategory(lines);

  const expenseCats = categories.filter((c) => c.kind === 'expense');
  const incomeCats = categories.filter((c) => c.kind === 'income');

  // Compact READ-ONLY category row — the whole row taps into the per-category
  // template detail (where the limit is edited and recurring lines are added).
  //   expense → «Лимит X · Запланировано Y»
  //   income  → «Запланировано Y» (income has NO limit)
  function renderCategoryRow(c: CategoryV10) {
    const isIncome = c.kind === 'income';
    const limit = limitByCat.get(c.id) ?? 0;
    const scheduled = scheduledByCat.get(c.id) ?? 0;
    return (
      <button
        key={c.id}
        type="button"
        className={styles.catRow}
        onClick={() => onCategoryTap(c.id)}
        data-testid={`template-cat-${c.id}`}
      >
        <CategoryIcon name={c.name} id={c.id} icon={c.icon} />
        <span className={styles.catMain}>
          <span className={styles.catName}>{c.name}</span>
          <span
            className={styles.catSummary}
            data-testid={`template-cat-summary-${c.id}`}
          >
            {isIncome
              ? `Запланировано ${formatMoneyNative(scheduled)} ₽`
              : `Лимит ${formatMoneyNative(limit)} ₽ · Запланировано ${formatMoneyNative(scheduled)} ₽`}
          </span>
        </span>
        <span className={styles.catChevron} aria-hidden="true">
          <CaretRight size={16} weight="bold" />
        </span>
      </button>
    );
  }

  const segCats = seg === 'expenses' ? expenseCats : incomeCats;
  const emptyLabel =
    seg === 'expenses' ? 'Нет категорий расходов' : 'Нет категорий доходов';

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

      <div className={styles.segmentRow}>
        <Segmented<Seg>
          ariaLabel="Расходы или доходы"
          value={seg}
          onChange={setSeg}
          options={[
            { value: 'expenses', label: 'Расходы' },
            { value: 'income', label: 'Доходы' },
          ]}
        />
      </div>

      <SectionHeader>Категории</SectionHeader>
      {segCats.length === 0 ? (
        <div className={styles.empty} data-testid="template-cats-empty">
          {emptyLabel}
        </div>
      ) : (
        <InsetGroup>{segCats.map((c) => renderCategoryRow(c))}</InsetGroup>
      )}

      <div className={styles.footnote}>
        {seg === 'expenses'
          ? 'Откройте категорию, чтобы задать лимит и добавить регулярные операции на нужное число месяца.'
          : 'Откройте категорию дохода, чтобы добавить регулярные поступления на нужное число месяца.'}
      </div>
    </div>
  );
}

export const NativeTemplateView = memo(NativeTemplateViewInner);
