// v1.1 planning rework — TemplateMount: data wrapper for the «Шаблон бюджета»
// screen (opened from the Management hub).
//
// Lifecycle:
//   1. On mount, parallel fetch: listCategoriesV10 + listTemplateItems +
//      listTemplateLines (all lines, grouped client-side by category).
//   2. Limit commit  → upsertTemplateItem(catId, {limit_cents}) → reload.
//   3. Add line       → createTemplateLine({...}) → reload.
//   4. Delete line    → deleteTemplateLine(id)    → reload.
//
// The template never touches the current period's actuals/balance, so there is
// no tx-cache invalidation here (mirrors api/v10/planTemplate.ts docstring).
//
// This is a v1.1 native-only surface — the Maximal Poster shell has no template
// screen, so we render NativeTemplateView regardless of variant.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Toast } from '../../componentsV10';
import { StatePlate, usePosterRouter } from '../common';
import {
  listCategoriesV10,
  listTemplateItems,
  upsertTemplateItem,
  listTemplateLines,
  createTemplateLine,
  deleteTemplateLine,
  type CategoryV10,
  type TemplateItemV11Read,
  type TemplateLineV11Read,
} from '../../api/v10';
import {
  NativeTemplateView,
  type AddTemplateLineDraft,
} from './NativeTemplateView';

export function TemplateMount() {
  const router = usePosterRouter();

  const [categories, setCategories] = useState<CategoryV10[]>([]);
  const [items, setItems] = useState<TemplateItemV11Read[]>([]);
  const [lines, setLines] = useState<TemplateLineV11Read[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setLoadError(null);

    async function load() {
      try {
        const [cats, itemList, lineList] = await Promise.all([
          listCategoriesV10(),
          listTemplateItems(),
          listTemplateLines(),
        ]);
        if (cancelled) return;
        // Stable order by ord ASC (same convention as Plan).
        const visible = [...cats].sort((a, b) =>
          (a.ord ?? '99').localeCompare(b.ord ?? '99'),
        );
        setCategories(visible);
        setItems(itemList);
        setLines(lineList);
        setStatus('ready');
      } catch (e) {
        if (cancelled) return;
        setLoadError(
          e instanceof Error ? e.message : 'Не удалось загрузить шаблон',
        );
        setStatus('error');
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const limitByCat = useMemo(
    () => new Map(items.map((i) => [i.category_id, i.limit_cents])),
    [items],
  );
  const linesByCat = useMemo(() => {
    const out = new Map<number, TemplateLineV11Read[]>();
    for (const l of lines) {
      const arr = out.get(l.category_id) ?? [];
      arr.push(l);
      out.set(l.category_id, arr);
    }
    return out;
  }, [lines]);

  const handleLimitCommit = useCallback(
    async (catId: number, cents: number) => {
      if ((limitByCat.get(catId) ?? 0) === cents) return; // no-op
      try {
        await upsertTemplateItem(catId, { limit_cents: cents });
        setToastMsg('✓ Лимит сохранён');
        setReloadToken((n) => n + 1);
      } catch {
        setToastMsg('Не удалось сохранить лимит');
      }
    },
    [limitByCat],
  );

  const handleAddLine = useCallback(async (draft: AddTemplateLineDraft) => {
    try {
      await createTemplateLine({
        category_id: draft.categoryId,
        kind: draft.kind,
        title: draft.title,
        amount_cents: draft.amountCents,
        day_of_period: draft.dayOfPeriod,
      });
      setToastMsg('✓ Строка добавлена');
      setReloadToken((n) => n + 1);
    } catch {
      setToastMsg('Не удалось добавить строку');
    }
  }, []);

  const handleDeleteLine = useCallback(async (lineId: number) => {
    try {
      await deleteTemplateLine(lineId);
      setToastMsg('Строка удалена');
      setReloadToken((n) => n + 1);
    } catch {
      setToastMsg('Не удалось удалить строку');
    }
  }, []);

  if (status === 'loading') {
    return <StatePlate variant="loading" testId="template-loading" />;
  }
  if (status === 'error') {
    return (
      <StatePlate
        variant="error"
        testId="template-error"
        message={loadError ?? 'Ошибка'}
        onRetry={() => setReloadToken((n) => n + 1)}
        onBack={() => router.pop()}
      />
    );
  }

  return (
    <>
      <NativeTemplateView
        categories={categories}
        limitByCat={limitByCat}
        linesByCat={linesByCat}
        onLimitCommit={handleLimitCommit}
        onAddLine={handleAddLine}
        onDeleteLine={handleDeleteLine}
        onBack={() => router.pop()}
      />
      <Toast
        message={toastMsg ?? ''}
        visible={toastMsg !== null}
        onDismiss={() => setToastMsg(null)}
      />
    </>
  );
}
