// TemplateCategoryDetailMount — data fetcher + view glue for the template-side
// per-category drill-down (pushed from NativeTemplateView).
//
// Lifecycle (mirrors Plan/PlanCategoryDetailMount, template side):
//   1. Fetch categories + template items + template lines in parallel; resolve
//      the target category locally (cats.find(id)).
//   2. Render <TemplateCategoryDetailView> scoped to that category. Lines INHERIT
//      the category (no picker); the expense limit edits inline.
//   3. Each mutation reloads the template (the api layer invalidates its cache on
//      every write) and surfaces errors via NativeToast.

import { useCallback, useEffect, useState } from 'react';
import { listCategoriesV10, type CategoryV10 } from '../../api/v10';
import {
  getTemplateItems,
  getTemplateLines,
  putTemplateItem,
  createTemplateLine,
  patchTemplateLine,
  deleteTemplateLine,
  type TemplateItemRead,
  type TemplateLineRead,
  type TemplateLineCreate,
  type TemplateLineUpdate,
} from '../../api/template';
import { usePosterRouter, StatePlate } from '../common';
import { NativeToast } from '../native/NativeToast';
import { TemplateCategoryDetailView } from './TemplateCategoryDetailView';
import { limitByCategory } from './computeTemplate';

export interface TemplateCategoryDetailMountProps {
  categoryId: number;
}

/** Sentinel «category not found» message (cross-tenant / non-existent id). */
const NOT_FOUND_MESSAGE = 'Категория не найдена';

export function TemplateCategoryDetailMount({
  categoryId,
}: TemplateCategoryDetailMountProps) {
  const router = usePosterRouter();

  const [category, setCategory] = useState<CategoryV10 | null>(null);
  const [items, setItems] = useState<TemplateItemRead[]>([]);
  const [lines, setLines] = useState<TemplateLineRead[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<'success' | 'error'>('success');

  const reload = useCallback(async () => {
    const [cats, itemRows, lineRows] = await Promise.all([
      listCategoriesV10(),
      getTemplateItems(),
      getTemplateLines(),
    ]);
    const cat = cats.find((c) => c.id === categoryId);
    if (!cat) throw new Error(NOT_FOUND_MESSAGE);
    setCategory(cat);
    setItems(itemRows);
    setLines(lineRows);
  }, [categoryId]);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setError(null);
    reload()
      .then(() => {
        if (!cancelled) setStatus('ready');
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(
          e instanceof Error ? e.message : 'Не удалось загрузить категорию',
        );
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const surfaceError = useCallback((fallback: string, e: unknown) => {
    setToastTone('error');
    setToastMsg(`Ошибка: ${e instanceof Error ? e.message : fallback}`);
  }, []);

  const handleLimitCommit = useCallback(
    async (catId: number, limitCents: number) => {
      // No-op when unchanged (mirrors the plan detail commit guard).
      const current = items.find((it) => it.category_id === catId)?.limit_cents;
      if ((current ?? 0) === limitCents) return;
      setBusy(true);
      try {
        await putTemplateItem(catId, limitCents);
        await reload();
        setToastTone('success');
        setToastMsg('✓ Лимит сохранён');
      } catch (e: unknown) {
        surfaceError('не удалось сохранить лимит', e);
        await reload().catch(() => {});
      } finally {
        setBusy(false);
      }
    },
    [items, reload, surfaceError],
  );

  const handleCreateLine = useCallback(
    async (payload: TemplateLineCreate) => {
      setBusy(true);
      try {
        await createTemplateLine(payload);
        await reload();
        setToastTone('success');
        setToastMsg('✓ Операция добавлена');
      } catch (e: unknown) {
        surfaceError('не удалось добавить операцию', e);
      } finally {
        setBusy(false);
      }
    },
    [reload, surfaceError],
  );

  const handleEditLine = useCallback(
    async (lineId: number, payload: TemplateLineUpdate) => {
      setBusy(true);
      try {
        await patchTemplateLine(lineId, payload);
        await reload();
        setToastTone('success');
        setToastMsg('✓ Сохранено');
      } catch (e: unknown) {
        surfaceError('не удалось сохранить', e);
      } finally {
        setBusy(false);
      }
    },
    [reload, surfaceError],
  );

  const handleDeleteLine = useCallback(
    async (lineId: number) => {
      setBusy(true);
      try {
        await deleteTemplateLine(lineId);
        await reload();
        setToastTone('success');
        setToastMsg('Операция удалена');
      } catch (e: unknown) {
        surfaceError('не удалось удалить операцию', e);
      } finally {
        setBusy(false);
      }
    },
    [reload, surfaceError],
  );

  const handleBack = useCallback(() => router.pop(), [router]);

  if (status === 'loading') {
    return <StatePlate variant="loading" testId="template-cat-detail-loading" />;
  }
  if (status === 'error' || category === null) {
    return (
      <StatePlate
        variant="error"
        testId="template-cat-detail-error"
        message={error ?? 'Не удалось загрузить категорию'}
        onBack={handleBack}
      />
    );
  }

  const isIncome = category.kind === 'income';
  const limitCents = limitByCategory(items).get(category.id) ?? 0;

  return (
    <>
      <TemplateCategoryDetailView
        category={category}
        limitCents={limitCents}
        lines={lines}
        busy={busy}
        // EXPENSE only: income has no limit/target, so it never gets the commit
        // handler (the view also guards on kind).
        onLimitCommit={isIncome ? undefined : handleLimitCommit}
        onCreateLine={handleCreateLine}
        onEditLine={handleEditLine}
        onDeleteLine={handleDeleteLine}
        onBack={handleBack}
      />
      <NativeToast
        message={toastMsg ?? ''}
        visible={toastMsg !== null}
        tone={toastTone}
        onDismiss={() => setToastMsg(null)}
        duration={2500}
      />
    </>
  );
}
