import { useMemo, useState } from 'react';
import {
  createTemplateItem,
  deleteTemplateItem,
  updateTemplateItem,
} from '../api/templates';
import { useTemplate } from '../hooks/useTemplate';
import { useCategories } from '../hooks/useCategories';
import type { CategoryKind, CategoryRead, TemplateItemRead } from '../api/types';
import { PlanRow } from '../components/PlanRow';
import { BottomSheet } from '../components/BottomSheet';
import { PlanItemEditor, type EditorSavePayload } from '../components/PlanItemEditor';
import styles from './TemplateScreen.module.css';

export interface TemplateScreenProps {
  onBack: () => void;
}

interface SheetState {
  open: boolean;
  mode: 'create-template' | 'edit-template';
  item?: TemplateItemRead;
  presetCategoryId?: number;
}

interface CategoryGroup {
  kindTitle: 'Расходы' | 'Доходы';
  kind: CategoryKind;
  categories: { category: CategoryRead; items: TemplateItemRead[] }[];
}

const CLOSED_SHEET: SheetState = { open: false, mode: 'create-template' };

/**
 * Plan template CRUD screen (TPL-01, TPL-02; sketch 005-B winner B).
 *
 * Layout: header (back + title + global "+ Строка") → groups by kind
 * (Расходы first, Доходы second) → within each kind, sub-groups by category.
 * Each sub-group lists its template items via PlanRow (inline-edit amount,
 * tap-elsewhere opens BottomSheet) plus a "+ Добавить строку в <category>"
 * button that pre-fills the category in the editor.
 *
 * Uses the shared `useTemplate` + `useCategories(false)` hooks. After every
 * mutation we refetch — single-tenant, optimistic updates not needed
 * (T-fe-stale carry-over from Phase 2).
 */
export function TemplateScreen({ onBack }: TemplateScreenProps) {
  const { items, loading: tplLoading, error: tplError, refetch } = useTemplate();
  const { categories, loading: catLoading, error: catError } = useCategories(false);
  const [sheet, setSheet] = useState<SheetState>(CLOSED_SHEET);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const groups = useMemo<CategoryGroup[]>(() => {
    const catById = new Map(categories.map((c) => [c.id, c]));
    const byKind: Record<CategoryKind, CategoryGroup> = {
      expense: { kindTitle: 'Расходы', kind: 'expense', categories: [] },
      income: { kindTitle: 'Доходы', kind: 'income', categories: [] },
    };
    const itemsByCat = new Map<number, TemplateItemRead[]>();
    for (const it of items) {
      const arr = itemsByCat.get(it.category_id) ?? [];
      arr.push(it);
      itemsByCat.set(it.category_id, arr);
    }
    for (const [catId, catItems] of itemsByCat.entries()) {
      const cat = catById.get(catId);
      if (!cat) continue;
      catItems.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
      byKind[cat.kind].categories.push({ category: cat, items: catItems });
    }
    for (const k of ['expense', 'income'] as CategoryKind[]) {
      byKind[k].categories.sort(
        (a, b) =>
          a.category.sort_order - b.category.sort_order ||
          a.category.name.localeCompare(b.category.name, 'ru'),
      );
    }
    return [byKind.expense, byKind.income].filter((g) => g.categories.length > 0);
  }, [items, categories]);

  const wrap = async (fn: () => Promise<unknown>) => {
    setMutationError(null);
    try {
      await fn();
      await refetch();
    } catch (e) {
      setMutationError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleAmountSave = async (id: number, newAmountCents: number) => {
    await wrap(() => updateTemplateItem(id, { amount_cents: newAmountCents }));
  };

  const handleSave = async (data: EditorSavePayload) => {
    if (sheet.mode === 'create-template') {
      await createTemplateItem({
        category_id: data.category_id,
        amount_cents: data.amount_cents,
        description: data.description,
        day_of_period: data.day_of_period ?? null,
        ...(data.sort_order !== undefined ? { sort_order: data.sort_order } : {}),
      });
    } else if (sheet.item) {
      await updateTemplateItem(sheet.item.id, {
        category_id: data.category_id,
        amount_cents: data.amount_cents,
        description: data.description,
        day_of_period: data.day_of_period ?? null,
      });
    }
    setSheet(CLOSED_SHEET);
    await refetch();
  };

  const handleDelete = async () => {
    if (!sheet.item) return;
    await deleteTemplateItem(sheet.item.id);
    setSheet(CLOSED_SHEET);
    await refetch();
  };

  const openCreate = (categoryId?: number) =>
    setSheet({
      open: true,
      mode: 'create-template',
      item: undefined,
      presetCategoryId: categoryId,
    });
  const openEdit = (item: TemplateItemRead) =>
    setSheet({ open: true, mode: 'edit-template', item });

  const loading = tplLoading || catLoading;
  const loadError = tplError ?? catError;

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <button
          type="button"
          onClick={onBack}
          className={styles.backBtn}
          aria-label="Назад"
        >
          ←
        </button>
        <div className={styles.title}>Шаблон плана</div>
        <button
          type="button"
          onClick={() => openCreate(undefined)}
          className={styles.addBtn}
          disabled={categories.length === 0}
        >
          + Строка
        </button>
      </header>

      {loading && <div className={styles.muted}>Загрузка…</div>}
      {loadError && <div className={styles.error}>Ошибка: {loadError}</div>}
      {mutationError && <div className={styles.error}>Ошибка: {mutationError}</div>}

      {!loading && !loadError && categories.length === 0 && (
        <div className={styles.empty}>
          Сначала создайте категории в разделе «Категории».
        </div>
      )}

      {!loading && !loadError && categories.length > 0 && items.length === 0 && (
        <div className={styles.empty}>Шаблон пуст. Добавьте первую строку.</div>
      )}

      {groups.map((g) => (
        <section key={g.kind} className={styles.kindGroup}>
          <h3 className={styles.kindTitle}>{g.kindTitle}</h3>
          {g.categories.map(({ category, items: catItems }) => (
            <div key={category.id} className={styles.categoryGroup}>
              <h4 className={styles.categoryTitle}>{category.name}</h4>
              {catItems.map((item) => (
                <PlanRow
                  key={item.id}
                  item={{ kind: 'template', row: item }}
                  category={category}
                  onAmountSave={(cents) => handleAmountSave(item.id, cents)}
                  onOpenEditor={() => openEdit(item)}
                />
              ))}
              <button
                type="button"
                onClick={() => openCreate(category.id)}
                className={styles.addInGroup}
              >
                + Добавить строку в {category.name}
              </button>
            </div>
          ))}
        </section>
      ))}

      <BottomSheet
        open={sheet.open}
        onClose={() => setSheet(CLOSED_SHEET)}
        title={
          sheet.mode === 'edit-template'
            ? 'Изменить строку шаблона'
            : 'Новая строка шаблона'
        }
      >
        <PlanItemEditor
          mode={sheet.mode}
          initial={
            sheet.item
              ? {
                  category_id: sheet.item.category_id,
                  amount_cents: sheet.item.amount_cents,
                  description: sheet.item.description,
                  day_of_period: sheet.item.day_of_period,
                  sort_order: sheet.item.sort_order,
                }
              : sheet.presetCategoryId
                ? { category_id: sheet.presetCategoryId }
                : undefined
          }
          categories={categories}
          onSave={handleSave}
          onDelete={sheet.mode === 'edit-template' ? handleDelete : undefined}
          onCancel={() => setSheet(CLOSED_SHEET)}
        />
      </BottomSheet>
    </div>
  );
}
