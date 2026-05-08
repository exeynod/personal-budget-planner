import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import {
  applyTemplate,
  createPlanned,
  deletePlanned,
  updatePlanned,
} from '../api/planned';
import { snapshotFromPeriod } from '../api/templates';
import { useCurrentPeriod } from '../hooks/useCurrentPeriod';
import { usePlanned } from '../hooks/usePlanned';
import { useTemplate } from '../hooks/useTemplate';
import { useCategories } from '../hooks/useCategories';
import { useSettings } from '../hooks/useSettings';
import type { CategoryKind, PlannedRead } from '../api/types';
import { type PlanRowItem } from '../components/PlanRow';
import { PlanGroupView, type CategoryEntry } from '../components/PlanGroupView';
import { BottomSheet } from '../components/BottomSheet';
import {
  PlanItemEditor,
  type EditorSavePayload,
} from '../components/PlanItemEditor';
import { ScreenHeader } from '../components/ScreenHeader';
import styles from './PlannedView.module.css';

export interface PlannedViewProps {
  onBack?: () => void;
  onNavigateToTemplate?: () => void;
  inTransactions?: boolean;
  activeKind?: CategoryKind;
  categoryFilter?: number | null;
}

export interface PlannedViewHandle {
  openCreateSheet: () => void;
}

interface SheetState {
  open: boolean;
  mode: 'create-planned' | 'edit-planned';
  item?: PlannedRead;
  presetCategoryId?: number;
}

const CLOSED_SHEET: SheetState = { open: false, mode: 'create-planned' };

declare global {
  interface Window {
    __injectMockPlanned__?: (row: PlannedRead) => void;
  }
}

export const PlannedView = forwardRef<PlannedViewHandle, PlannedViewProps>(
  function PlannedView({
    onBack,
    onNavigateToTemplate: _onNavigateToTemplate,
    inTransactions,
    activeKind,
    categoryFilter,
  }, ref) {
    const { period, loading: perLoading, error: perError } = useCurrentPeriod();
    const {
      rows: realRows,
      loading: _rowsLoading,
      error: rowsError,
      refetch: refetchPlanned,
    } = usePlanned(period?.id ?? null);
    const { items: templateItems } = useTemplate();
    const { categories } = useCategories(false);
    const { settings } = useSettings();

    const [mockRows, setMockRows] = useState<PlannedRead[]>([]);
    const [sheet, setSheet] = useState<SheetState>(CLOSED_SHEET);
    const [toast, setToast] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [mutationError, setMutationError] = useState<string | null>(null);

    useImperativeHandle(ref, () => ({
      openCreateSheet: () =>
        setSheet({ open: true, mode: 'create-planned', item: undefined, presetCategoryId: undefined }),
    }));

    // PLN-03 DEV-only mock-injection helper (D-37, T-03-23 mitigation).
    useEffect(() => {
      if (!import.meta.env.DEV) return;
      window.__injectMockPlanned__ = (row: PlannedRead) => {
        setMockRows((prev) => [...prev, row]);
      };
      return () => {
        delete window.__injectMockPlanned__;
      };
    }, []);

    // Combine real + mock rows for display only (mocks never leave local state —
    // T-03-24 mitigation).
    const allRows: PlannedRead[] = useMemo(
      () => [...realRows, ...mockRows],
      [realRows, mockRows],
    );

    const groups = useMemo(() => {
      const byKind: Record<CategoryKind, CategoryEntry[]> = { expense: [], income: [] };
      const byCat = new Map<number, PlannedRead[]>();
      for (const r of allRows) {
        const arr = byCat.get(r.category_id) ?? [];
        arr.push(r);
        byCat.set(r.category_id, arr);
      }
      for (const cat of categories) {
        const catRows = (byCat.get(cat.id) ?? []).slice().sort((a, b) => {
          const da = a.planned_date ?? '9999-12-31';
          const db = b.planned_date ?? '9999-12-31';
          if (da !== db) return da.localeCompare(db);
          return a.id - b.id;
        });
        byKind[cat.kind].push({
          category: cat,
          items: catRows.map((row) => ({ kind: 'planned' as const, row })),
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
    }, [allRows, categories]);

    const showToast = (msg: string) => {
      setToast(msg);
      window.setTimeout(() => setToast(null), 2200);
    };

    const handleApplyTemplate = async () => {
      if (!period || busy) return;
      setBusy(true);
      setMutationError(null);
      try {
        const result = await applyTemplate(period.id);
        if (result.created === 0 && result.planned.length === 0) {
          showToast('Шаблон пуст — нечего применять');
        } else if (result.created === 0) {
          showToast('Шаблон уже применён');
        } else {
          showToast(`Применено ${result.created} строк`);
        }
        await refetchPlanned();
      } catch (e) {
        setMutationError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    };

    const handleSnapshot = async () => {
      if (!period || busy) return;
      if (
        !window.confirm(
          'Перезаписать шаблон текущим планом? Существующий шаблон будет удалён.',
        )
      ) {
        return;
      }
      setBusy(true);
      setMutationError(null);
      try {
        const result = await snapshotFromPeriod(period.id);
        showToast(`Шаблон обновлён: ${result.template_items.length} строк`);
      } catch (e) {
        setMutationError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    };

    const handleAmountSave = async (item: PlanRowItem, newAmountCents: number) => {
      setMutationError(null);
      try {
        await updatePlanned(item.row.id, { amount_cents: newAmountCents });
        await refetchPlanned();
      } catch (e) {
        setMutationError(e instanceof Error ? e.message : String(e));
      }
    };

    const handleSave = async (data: EditorSavePayload) => {
      if (!period) return;
      if (sheet.mode === 'create-planned') {
        const cat = categories.find((c) => c.id === data.category_id);
        if (!cat) throw new Error('Категория не найдена');
        await createPlanned(period.id, {
          kind: cat.kind,
          amount_cents: data.amount_cents,
          description: data.description,
          category_id: data.category_id,
          planned_date: data.planned_date ?? null,
        });
      } else if (sheet.item) {
        const cat = categories.find((c) => c.id === data.category_id);
        if (!cat) throw new Error('Категория не найдена');
        await updatePlanned(sheet.item.id, {
          kind: cat.kind,
          amount_cents: data.amount_cents,
          description: data.description,
          category_id: data.category_id,
          planned_date: data.planned_date ?? null,
        });
      }
      setSheet(CLOSED_SHEET);
      await refetchPlanned();
    };

    const handleDelete = async () => {
      if (!sheet.item) return;
      await deletePlanned(sheet.item.id);
      setSheet(CLOSED_SHEET);
      await refetchPlanned();
    };

    const openCreate = (categoryId?: number) =>
      setSheet({
        open: true,
        mode: 'create-planned',
        item: undefined,
        presetCategoryId: categoryId,
      });
    const openEdit = (planItem: PlanRowItem) => {
      if (planItem.kind !== 'planned') return;
      setSheet({ open: true, mode: 'edit-planned', item: planItem.row });
    };

    const periodLabel = period
      ? `${new Date(period.period_start).toLocaleDateString('ru-RU', {
          month: 'long',
          year: 'numeric',
        })} · ${new Date(period.period_start).toLocaleDateString('ru-RU', {
          day: '2-digit',
          month: 'short',
        })} — ${new Date(period.period_end).toLocaleDateString('ru-RU', {
          day: '2-digit',
          month: 'short',
        })}`
      : '';

    const isEmptyPlanned = realRows.length === 0;
    const templateIsEmpty = templateItems.length === 0;

    if (perLoading) {
      return <div className={styles.muted}>Загрузка периода…</div>;
    }
    if (perError) {
      return <div className={styles.error}>Ошибка периода: {perError}</div>;
    }
    if (!period) {
      return (
        <div className={styles.root}>
          {!inTransactions && <ScreenHeader title="План" onBack={onBack ?? (() => undefined)} />}
          <div className={styles.empty}>Сначала завершите onboarding.</div>
        </div>
      );
    }

    return (
      <div className={inTransactions ? styles.rootInner : styles.root}>
        {!inTransactions && (
          <ScreenHeader
            title="План периода"
            subtitle={periodLabel}
            onBack={onBack ?? (() => undefined)}
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
        )}

        {isEmptyPlanned && !templateIsEmpty && (
          <button
            type="button"
            onClick={handleApplyTemplate}
            disabled={busy}
            className={styles.applyTemplate}
          >
            Применить шаблон
          </button>
        )}

        <button
          type="button"
          onClick={handleSnapshot}
          disabled={busy}
          className={styles.snapshotBtn}
        >
          ↻ В шаблон
        </button>

        {rowsError && <div className={styles.error}>Ошибка плана: {rowsError}</div>}
        {mutationError && <div className={styles.error}>Ошибка: {mutationError}</div>}

        <PlanGroupView
          groups={groups}
          activeKind={activeKind}
          categoryFilter={categoryFilter ?? null}
          onAmountSave={handleAmountSave}
          onOpenEditor={openEdit}
          onAdd={openCreate}
        />

        {toast && <div className={styles.toast}>{toast}</div>}

        <BottomSheet
          open={sheet.open}
          onClose={() => setSheet(CLOSED_SHEET)}
          title={
            sheet.mode === 'edit-planned'
              ? 'Изменить строку плана'
              : 'Новая строка плана'
          }
        >
          <PlanItemEditor
            // Force-remount on every open so internal useState picks up the
            // fresh `initial` values. Without the key, React re-uses the
            // previous instance: presetCategoryId from "+ в Категория" is
            // ignored, and the date / description from the last edited row
            // leak into the next create-row form.
            key={
              sheet.open
                ? `planned-${sheet.item?.id ?? 'new'}-${sheet.presetCategoryId ?? 0}`
                : 'closed'
            }
            mode={sheet.mode}
            initial={
              sheet.item
                ? {
                    category_id: sheet.item.category_id,
                    amount_cents: sheet.item.amount_cents,
                    description: sheet.item.description,
                    planned_date: sheet.item.planned_date,
                  }
                : sheet.presetCategoryId
                  ? { category_id: sheet.presetCategoryId }
                  : undefined
            }
            categories={categories}
            periodBounds={{ start: period.period_start, end: period.period_end }}
            onSave={handleSave}
            onDelete={sheet.mode === 'edit-planned' ? handleDelete : undefined}
            onCancel={() => setSheet(CLOSED_SHEET)}
            aiEnabled={settings?.enable_ai_categorization ?? false}
          />
        </BottomSheet>
      </div>
    );
  }
);
