// v1.1 planning — TemplateMount: data wrapper for the «Шаблон» screen.
//
// Data sources (loaded together on mount):
//   - listCategoriesV10()  → active categories (limits + line category picker)
//   - getTemplateItems()   → per-category template limits
//   - getTemplateLines()   → recurring template lines
//
// Mutations (each reloads the template + surfaces errors via NativeToast):
//   - putTemplateItem(categoryId, limitCents)     (PUT  /template/items/{id})
//   - createTemplateLine(payload)                 (POST /template/lines)
//   - patchTemplateLine(id, payload)              (PATCH /template/lines/{id})
//   - deleteTemplateLine(id)                      (DELETE /template/lines/{id})
//
// Mirrors CategoriesMount's load/error/toast conventions; navigation uses the
// PosterRouter back affordance.

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
import { usePosterRouter } from '../common';
import { NativeToast } from '../native/NativeToast';
import {
  NativeTemplateView,
  type TemplateViewProps,
} from './NativeTemplateView';

export function TemplateMount() {
  const router = usePosterRouter();
  const [categories, setCategories] = useState<CategoryV10[]>([]);
  const [items, setItems] = useState<TemplateItemRead[]>([]);
  const [lines, setLines] = useState<TemplateLineRead[]>([]);
  const [loading, setLoading] = useState(true);
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
    // Active (non-archived) categories only; both kinds (income lines exist).
    setCategories(cats.filter((c) => !c.is_archived));
    setItems(itemRows);
    setLines(lineRows);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    reload()
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(
          e instanceof Error ? e.message : 'Не удалось загрузить шаблон',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const surfaceError = useCallback((fallback: string, e: unknown) => {
    setToastTone('error');
    setToastMsg(`Ошибка: ${e instanceof Error ? e.message : fallback}`);
  }, []);

  const handleSaveItem = useCallback(
    async (categoryId: number, limitCents: number) => {
      setBusy(true);
      try {
        await putTemplateItem(categoryId, limitCents);
        await reload();
        setToastTone('success');
        setToastMsg('✓ Лимит сохранён');
      } catch (e: unknown) {
        surfaceError('не удалось сохранить лимит', e);
      } finally {
        setBusy(false);
      }
    },
    [reload, surfaceError],
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

  const viewProps: TemplateViewProps = {
    categories,
    items,
    lines,
    loading,
    error,
    busy,
    onSaveItem: handleSaveItem,
    onCreateLine: handleCreateLine,
    onEditLine: handleEditLine,
    onDeleteLine: handleDeleteLine,
    onBack: () => router.pop(),
  };

  return (
    <>
      <NativeTemplateView {...viewProps} />
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
