import { useEffect, useMemo, useState } from 'react';
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
import type { CategoryKind, CategoryRead, PlannedRead } from '../api/types';
import { PlanRow } from '../components/PlanRow';
import { BottomSheet } from '../components/BottomSheet';
import {
  PlanItemEditor,
  type EditorSavePayload,
} from '../components/PlanItemEditor';
import styles from './PlannedScreen.module.css';

export interface PlannedScreenProps {
  onBack: () => void;
  onNavigateToTemplate?: () => void;
}

interface SheetState {
  open: boolean;
  mode: 'create-planned' | 'edit-planned';
  item?: PlannedRead;
  presetCategoryId?: number;
}

interface CategoryGroup {
  kindTitle: 'Расходы' | 'Доходы';
  kind: CategoryKind;
  categories: { category: CategoryRead; rows: PlannedRead[] }[];
}

const CLOSED_SHEET: SheetState = { open: false, mode: 'create-planned' };

declare global {
  interface Window {
    /**
     * DEV-only helper for PLN-03 visual verification (D-37).
     *
     * Inject a fake planned-row (e.g. `source: 'subscription_auto'`) into the
     * PlannedScreen state so the "🔁 Подписка" badge can be verified before
     * Phase 6 lands real subscription data. Tree-shaken in prod via
     * `import.meta.env.DEV` guard.
     */
    __injectMockPlanned__?: (row: PlannedRead) => void;
  }
}

/**
 * PlannedScreen (PLN-01..03 + TPL-03/04, sketch 005-B).
 *
 * Lists planned-transactions for the current period, grouped kind→category,
 * and exposes two action buttons:
 *   - «Применить шаблон» (D-38): conditional on empty plan + non-empty
 *     template; POSTs to `/periods/{id}/apply-template` (idempotent — D-31).
 *   - «↻ В шаблон» (D-39, TPL-03): always visible; window.confirm-guarded
 *     POST to `/template/snapshot-from-period/{id}` (destructive overwrite).
 *
 * Subscription_auto rows render read-only via `PlanRow` (D-37); manual/template
 * rows are inline-editable (amount) or open the BottomSheet PlanItemEditor for
 * full edit. Add-row affordances live per-category as dashed buttons.
 *
 * DEV-only `window.__injectMockPlanned__` (T-03-23 mitigation): set in a
 * useEffect guarded by `import.meta.env.DEV`; cleared on unmount. Not present
 * in prod builds.
 */
export function PlannedScreen({ onBack, onNavigateToTemplate }: PlannedScreenProps) {
  const { period, loading: perLoading, error: perError } = useCurrentPeriod();
  const {
    rows: realRows,
    loading: rowsLoading,
    error: rowsError,
    refetch: refetchPlanned,
  } = usePlanned(period?.id ?? null);
  const { items: templateItems } = useTemplate();
  const { categories } = useCategories(false);

  const [mockRows, setMockRows] = useState<PlannedRead[]>([]);
  const [sheet, setSheet] = useState<SheetState>(CLOSED_SHEET);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

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

  const groups = useMemo<CategoryGroup[]>(() => {
    const catById = new Map(categories.map((c) => [c.id, c]));
    const byKind: Record<CategoryKind, CategoryGroup> = {
      expense: { kindTitle: 'Расходы', kind: 'expense', categories: [] },
      income: { kindTitle: 'Доходы', kind: 'income', categories: [] },
    };
    const byCat = new Map<number, PlannedRead[]>();
    for (const r of allRows) {
      const arr = byCat.get(r.category_id) ?? [];
      arr.push(r);
      byCat.set(r.category_id, arr);
    }
    for (const [catId, catRows] of byCat.entries()) {
      const cat = catById.get(catId);
      if (!cat) continue;
      catRows.sort((a, b) => {
        const da = a.planned_date ?? '9999-12-31';
        const db = b.planned_date ?? '9999-12-31';
        if (da !== db) return da.localeCompare(db);
        return a.id - b.id;
      });
      byKind[cat.kind].categories.push({ category: cat, rows: catRows });
    }
    for (const k of ['expense', 'income'] as CategoryKind[]) {
      byKind[k].categories.sort(
        (a, b) =>
          a.category.sort_order - b.category.sort_order ||
          a.category.name.localeCompare(b.category.name, 'ru'),
      );
    }
    return [byKind.expense, byKind.income].filter((g) => g.categories.length > 0);
  }, [allRows, categories]);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  };

  // T-03-25 mitigation: `busy` blocks repeat clicks; backend D-31 idempotency
  // is the second line of defence.
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

  // T-03-26 mitigation: window.confirm before destructive overwrite.
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

  const handleAmountSave = async (id: number, newAmountCents: number) => {
    setMutationError(null);
    try {
      await updatePlanned(id, { amount_cents: newAmountCents });
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
  const openEdit = (row: PlannedRead) =>
    setSheet({ open: true, mode: 'edit-planned', item: row });

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
        <header className={styles.header}>
          <button
            type="button"
            onClick={onBack}
            className={styles.backBtn}
            aria-label="Назад"
          >
            ←
          </button>
          <div className={styles.title}>План</div>
        </header>
        <div className={styles.empty}>Сначала завершите onboarding.</div>
      </div>
    );
  }

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
        <div className={styles.titleBlock}>
          <div className={styles.title}>План текущего периода</div>
          <div className={styles.subtitle}>{periodLabel}</div>
        </div>
      </header>

      <div className={styles.actionsRow}>
        {isEmptyPlanned && !templateIsEmpty && (
          <button
            type="button"
            onClick={handleApplyTemplate}
            disabled={busy}
            className={styles.primaryAction}
          >
            Применить шаблон
          </button>
        )}
        <button
          type="button"
          onClick={handleSnapshot}
          disabled={busy}
          className={styles.secondaryAction}
        >
          ↻ В шаблон
        </button>
      </div>

      {rowsError && <div className={styles.error}>Ошибка плана: {rowsError}</div>}
      {mutationError && (
        <div className={styles.error}>Ошибка: {mutationError}</div>
      )}

      {!rowsLoading && isEmptyPlanned && templateIsEmpty && (
        <div className={styles.empty}>
          Шаблон пуст.{' '}
          {onNavigateToTemplate ? (
            <button
              type="button"
              onClick={onNavigateToTemplate}
              className={styles.linkBtn}
            >
              Перейдите в «Шаблон»
            </button>
          ) : (
            <>Перейдите в «Шаблон»</>
          )}{' '}
          чтобы заполнить.
        </div>
      )}

      {groups.map((g) => (
        <section key={g.kind} className={styles.kindGroup}>
          <h3 className={styles.kindTitle}>{g.kindTitle}</h3>
          {g.categories.map(({ category, rows }) => (
            <div key={category.id} className={styles.categoryGroup}>
              <h4 className={styles.categoryTitle}>{category.name}</h4>
              {rows.map((row) => (
                <PlanRow
                  key={row.id}
                  item={{ kind: 'planned', row }}
                  category={category}
                  onAmountSave={(cents) => handleAmountSave(row.id, cents)}
                  onOpenEditor={() => openEdit(row)}
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
        />
      </BottomSheet>
    </div>
  );
}
