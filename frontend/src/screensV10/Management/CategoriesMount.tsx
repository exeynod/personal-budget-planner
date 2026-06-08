// 0034 — CategoriesMount: data wrapper for the category-management screen.
//
// Data source:
//   - GET /categories?include_archived=true → all of the user's categories
//     (active + archived) so the screen can group + show the archive section.
//
// Mutations (each refetches the list + surfaces errors via NativeToast):
//   - createCategoryV10  (POST  /categories)
//   - updateCategoryV10  (PATCH /categories/{id})  — rename / change icon / unarchive
//   - archiveCategoryV10 (DELETE /categories/{id}) — soft-archive
//
// Mirrors SettingsMount's load/error/toast conventions; navigation uses the
// PosterRouter back affordance.

import { useCallback, useEffect, useState } from 'react';
import {
  listCategoriesV10,
  createCategoryV10,
  updateCategoryV10,
  archiveCategoryV10,
  type CategoryV10,
} from '../../api/v10';
import { usePosterRouter } from '../common';
import { NativeToast } from '../native/NativeToast';
import {
  NativeCategoriesView,
  type CategoriesViewProps,
  type CategoryCreateInput,
  type CategoryEditInput,
} from './NativeCategoriesView';

export function CategoriesMount() {
  const router = usePosterRouter();
  const [categories, setCategories] = useState<CategoryV10[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<'success' | 'error'>('success');

  const reload = useCallback(async () => {
    // include_archived=true → screen owns the active/archived split.
    const rows = await listCategoriesV10(true);
    setCategories(rows);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    reload()
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(
          e instanceof Error ? e.message : 'Не удалось загрузить категории',
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

  const handleCreate = useCallback(
    async (input: CategoryCreateInput) => {
      setBusy(true);
      try {
        await createCategoryV10({
          name: input.name,
          kind: input.kind,
          icon: input.icon,
        });
        await reload();
        setToastTone('success');
        setToastMsg('✓ Категория создана');
      } catch (e: unknown) {
        surfaceError('не удалось создать категорию', e);
      } finally {
        setBusy(false);
      }
    },
    [reload, surfaceError],
  );

  const handleEdit = useCallback(
    async (id: number, input: CategoryEditInput) => {
      setBusy(true);
      try {
        await updateCategoryV10(id, { name: input.name, icon: input.icon });
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

  const handleArchive = useCallback(
    async (id: number) => {
      setBusy(true);
      try {
        await archiveCategoryV10(id);
        await reload();
        setToastTone('success');
        setToastMsg('Категория в архиве');
      } catch (e: unknown) {
        surfaceError('не удалось архивировать', e);
      } finally {
        setBusy(false);
      }
    },
    [reload, surfaceError],
  );

  const handleUnarchive = useCallback(
    async (id: number) => {
      setBusy(true);
      try {
        await updateCategoryV10(id, { is_archived: false });
        await reload();
        setToastTone('success');
        setToastMsg('Категория возвращена');
      } catch (e: unknown) {
        surfaceError('не удалось вернуть', e);
      } finally {
        setBusy(false);
      }
    },
    [reload, surfaceError],
  );

  const viewProps: CategoriesViewProps = {
    categories,
    loading,
    error,
    busy,
    onCreate: handleCreate,
    onEdit: handleEdit,
    onArchive: handleArchive,
    onUnarchive: handleUnarchive,
    onBack: () => router.pop(),
  };

  return (
    <>
      <NativeCategoriesView {...viewProps} />
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
