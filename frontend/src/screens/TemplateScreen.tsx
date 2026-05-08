import { useMemo, useState } from 'react';
import {
  createTemplateItem,
  deleteTemplateItem,
  updateTemplateItem,
} from '../api/templates';
import { useTemplate } from '../hooks/useTemplate';
import { useCategories } from '../hooks/useCategories';
import { useSettings } from '../hooks/useSettings';
import type { CategoryKind, TemplateItemRead } from '../api/types';
import { type PlanRowItem } from '../components/PlanRow';
import { PlanGroupView, type CategoryEntry } from '../components/PlanGroupView';
import { BottomSheet } from '../components/BottomSheet';
import {
  TransactionEditor,
  type TransactionEditorSavePayload,
} from '../components/TransactionEditor';
import { ScreenHeader } from '../components/ScreenHeader';
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
  const { settings } = useSettings();
  const [sheet, setSheet] = useState<SheetState>(CLOSED_SHEET);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const groups = useMemo(() => {
    const byKind: Record<CategoryKind, CategoryEntry[]> = { expense: [], income: [] };
    const itemsByCat = new Map<number, TemplateItemRead[]>();
    for (const it of items) {
      const arr = itemsByCat.get(it.category_id) ?? [];
      arr.push(it);
      itemsByCat.set(it.category_id, arr);
    }
    for (const cat of categories) {
      const catItems = (itemsByCat.get(cat.id) ?? []).slice().sort(
        (a, b) => a.sort_order - b.sort_order || a.id - b.id,
      );
      byKind[cat.kind].push({
        category: cat,
        items: catItems.map((row) => ({ kind: 'template' as const, row })),
      });
    }
    for (const k of ['expense', 'income'] as CategoryKind[]) {
      byKind[k].sort(
        (a, b) =>
          a.category.sort_order - b.category.sort_order ||
          a.category.name.localeCompare(b.category.name, 'ru'),
      );
    }
    return [
      { kind: 'expense' as CategoryKind, entries: byKind.expense },
      { kind: 'income' as CategoryKind, entries: byKind.income },
    ];
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

  const handleAmountSave = async (item: PlanRowItem, newAmountCents: number) => {
    await wrap(() => updateTemplateItem(item.row.id, { amount_cents: newAmountCents }));
  };

  const handleSave = async (data: TransactionEditorSavePayload) => {
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
  const openEdit = (planItem: PlanRowItem) => {
    if (planItem.kind !== 'template') return;
    setSheet({ open: true, mode: 'edit-template', item: planItem.row });
  };

  const loading = tplLoading || catLoading;
  const loadError = tplError ?? catError;

  return (
    <div className={styles.root}>
      <ScreenHeader
        title="Шаблон плана"
        onBack={onBack}
        rightAction={
          <button
            type="button"
            onClick={() => openCreate(undefined)}
            className={styles.addBtn}
            disabled={categories.length === 0}
          >
            Добавить
          </button>
        }
      />

      {loading && <div className={styles.muted}>Загрузка…</div>}
      {loadError && <div className={styles.error}>Ошибка: {loadError}</div>}
      {mutationError && <div className={styles.error}>Ошибка: {mutationError}</div>}

      {!loading && !loadError && categories.length === 0 && (
        <div className={styles.empty}>
          Сначала создайте категории в разделе «Категории».
        </div>
      )}

      {!loading && !loadError && categories.length > 0 && (
        <PlanGroupView
          groups={groups}
          onAmountSave={handleAmountSave}
          onOpenEditor={openEdit}
          onAdd={openCreate}
        />
      )}

      <BottomSheet
        open={sheet.open}
        onClose={() => setSheet(CLOSED_SHEET)}
        title={
          sheet.mode === 'edit-template'
            ? 'Изменить строку шаблона'
            : 'Новая строка шаблона'
        }
      >
        <TransactionEditor
          entity="template"
          // Force-remount on every open — see PlannedView for the rationale.
          key={
            sheet.open
              ? `template-${sheet.item?.id ?? 'new'}-${sheet.presetCategoryId ?? 0}`
              : 'closed'
          }
          isEdit={sheet.mode === 'edit-template'}
          // Lock select to the row's/preset category kind. Without preset, leave
          // unset so both kinds appear (no active tab in TemplateScreen).
          kind={
            sheet.item
              ? categories.find((c) => c.id === sheet.item!.category_id)?.kind
              : sheet.presetCategoryId
                ? categories.find((c) => c.id === sheet.presetCategoryId)?.kind
                : undefined
          }
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
          aiEnabled={settings?.enable_ai_categorization ?? false}
        />
      </BottomSheet>
    </div>
  );
}
