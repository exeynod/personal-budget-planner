// TemplateMount: data wrapper for the «Шаблон» OVERVIEW screen.
//
// Reworked to mirror the PLAN flow: the overview is a READ-ONLY list of
// categories with their template summary (limit + Σ recurring lines). Tapping a
// row pushes <TemplateCategoryDetailMount> where the limit is edited and the
// category's recurring lines (day-of-month scheduled) are managed inline. All
// MUTATIONS now live in the detail mount — this mount only loads the summary.
//
// Data sources (loaded together on mount):
//   - listCategoriesV10()  → active categories
//   - getTemplateItems()   → per-category template limits  (summary)
//   - getTemplateLines()   → recurring template lines       (Σ summary)

import { useCallback, useEffect, useRef, useState } from 'react';
import { listCategoriesV10, type CategoryV10 } from '../../api/v10';
import {
  getTemplateItems,
  getTemplateLines,
  type TemplateItemRead,
  type TemplateLineRead,
} from '../../api/template';
import { usePosterRouter } from '../common';
import { NativeTemplateView, type TemplateViewProps } from './NativeTemplateView';
import { TemplateCategoryDetailMount } from './TemplateCategoryDetailMount';

export function TemplateMount() {
  const router = usePosterRouter();
  const [categories, setCategories] = useState<CategoryV10[]>([]);
  const [items, setItems] = useState<TemplateItemRead[]>([]);
  const [lines, setLines] = useState<TemplateLineRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // Drill into a category's template detail. On pop the overview refetches so
  // edited limits / new lines show up in the summary immediately.
  const handleCategoryTap = useCallback(
    (categoryId: number) => {
      router.push(<TemplateCategoryDetailMount categoryId={categoryId} />);
    },
    [router],
  );

  // Refetch the summary when we POP back to this overview from a detail edit
  // (stack depth decreased). The detail mount invalidates the template cache on
  // every mutation, so this re-fetch surfaces edited limits / new lines.
  const stackDepth = router.stack.length;
  const prevDepthRef = useRef(stackDepth);
  useEffect(() => {
    const popped = stackDepth < prevDepthRef.current;
    prevDepthRef.current = stackDepth;
    if (!popped) return;
    reload().catch(() => {
      /* keep the prior summary on a refresh failure */
    });
  }, [stackDepth, reload]);

  const viewProps: TemplateViewProps = {
    categories,
    items,
    lines,
    loading,
    error,
    onCategoryTap: handleCategoryTap,
    onBack: () => router.pop(),
  };

  return <NativeTemplateView {...viewProps} />;
}
