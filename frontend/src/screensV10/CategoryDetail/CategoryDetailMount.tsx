// Phase 26-02 Task 3: CategoryDetailMount — data fetcher + view glue.
//
// Lifecycle:
//   1. On mount, fetch categories + current period in parallel; resolve the
//      target category locally (cats.find(id)). Then fetch period actuals
//      sequentially once period.id is known.
//   2. Render <CategoryDetailView> wired to PATCH-backed toggle handlers
//      (rollover, paused) and a router-push handler for «+ ПОДНЯТЬ ЛИМИТ».
//   3. On any fetch error, render an error sub-view with a retry button.
//
// Mount layer is intentionally thin — all sort/filter/aggregate logic lives
// in pure functions in computeCategoryDetail.ts (unit-tested separately).
//
// NOTE for Plan 26-04 wiring: `+ ПОДНЯТЬ ЛИМИТ` currently pushes the WIP
// PlanViewPlaceholder; Plan 26-04 swaps it for `<PlanMount focusCategoryId={id} />`.
// Search for «PLAN_FOCUS_TODO» in this file when retrofitting.

import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
} from 'react';
import {
  listCategoriesV10,
  listActualV10,
  updateCategoryV10,
  type ActualV10Read,
  type CategoryV10,
} from '../../api/v10';
import { getCurrentPeriod } from '../../api/periods';
import { Eyebrow, PosterButton } from '../../componentsV10';
import { usePosterRouter } from '../common';
import { PlanViewPlaceholder } from '../_placeholders';
import { CategoryDetailView } from './CategoryDetailView';

// ─────────────────── Props ───────────────────

export interface CategoryDetailMountProps {
  categoryId: number;
}

// ─────────────────── State ───────────────────

interface DataPayload {
  category: CategoryV10;
  actuals: ActualV10Read[];
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: DataPayload };

// ─────────────────── Component ───────────────────

export function CategoryDetailMount({ categoryId }: CategoryDetailMountProps) {
  const router = usePosterRouter();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    async function load() {
      try {
        const [cats, period] = await Promise.all([
          listCategoriesV10(),
          getCurrentPeriod(),
        ]);
        if (cancelled) return;
        const cat = cats.find((c) => c.id === categoryId);
        if (!cat) {
          // T-26-02-03 mitigation: cross-tenant / non-existent id stays
          // server-side (RLS); to client it just looks like «не найдена».
          setState({
            status: 'error',
            message: 'Категория не найдена',
          });
          return;
        }
        const acts: ActualV10Read[] = period
          ? await listActualV10(period.id)
          : [];
        if (cancelled) return;
        setState({
          status: 'ready',
          data: { category: cat, actuals: acts },
        });
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : 'Не удалось загрузить категорию';
        setState({ status: 'error', message });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [categoryId, reloadToken]);

  // ─────────── PATCH-backed toggle handlers ───────────
  const handleToggleRollover = useCallback(async () => {
    if (state.status !== 'ready') return;
    const current = state.data.category;
    const next = (current.rollover ?? 'misc') === 'misc' ? 'savings' : 'misc';
    try {
      const updated = await updateCategoryV10(current.id, { rollover: next });
      setState((s) =>
        s.status === 'ready'
          ? { status: 'ready', data: { ...s.data, category: updated } }
          : s,
      );
    } catch {
      // T-26-02-04 mitigation: minimum-viable failure surface. Plan 28 polish
      // upgrades to a poster toast.
      if (typeof window !== 'undefined') {
        window.alert('Не удалось обновить «Остаток» — попробуйте снова');
      }
    }
  }, [state]);

  const handleTogglePause = useCallback(async () => {
    if (state.status !== 'ready') return;
    const current = state.data.category;
    try {
      const updated = await updateCategoryV10(current.id, {
        paused: !(current.paused ?? false),
      });
      setState((s) =>
        s.status === 'ready'
          ? { status: 'ready', data: { ...s.data, category: updated } }
          : s,
      );
    } catch {
      if (typeof window !== 'undefined') {
        window.alert('Не удалось переключить «Паузу» — попробуйте снова');
      }
    }
  }, [state]);

  const handlePushPlan = useCallback(
    (_catId: number) => {
      // PLAN_FOCUS_TODO (Plan 26-04): swap for `<PlanMount focusCategoryId={_catId} />`.
      router.push(<PlanViewPlaceholder />);
    },
    [router],
  );

  const handleBack = useCallback(() => {
    router.pop();
  }, [router]);

  // ─────────── render ───────────
  if (state.status === 'loading') return <LoadingPlate />;
  if (state.status === 'error') {
    return (
      <ErrorPlate
        message={state.message}
        onRetry={() => setReloadToken((t) => t + 1)}
        onBack={handleBack}
      />
    );
  }
  return (
    <CategoryDetailView
      category={state.data.category}
      actuals={state.data.actuals}
      onPushPlan={handlePushPlan}
      onTogglePause={handleTogglePause}
      onToggleRollover={handleToggleRollover}
      onBack={handleBack}
    />
  );
}

// ─────────────────── Loading / Error sub-views ───────────────────

const fillStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'var(--poster-cobalt)',
  color: 'var(--poster-paper)',
  padding: '56px 22px 90px',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  fontFamily: 'var(--poster-font-manrope), system-ui, sans-serif',
};

function LoadingPlate() {
  return (
    <div style={fillStyle} data-testid="cat-detail-loading">
      <Eyebrow color="var(--poster-paper)">ЗАГРУЗКА</Eyebrow>
      <div
        style={{
          fontFamily:
            'var(--poster-font-jet-brains-mono), ui-monospace, monospace',
          fontSize: 13,
          opacity: 0.7,
          marginTop: 18,
        }}
      >
        ···
      </div>
    </div>
  );
}

interface ErrorPlateProps {
  message: string;
  onRetry: () => void;
  onBack: () => void;
}

function ErrorPlate({ message, onRetry, onBack }: ErrorPlateProps) {
  return (
    <div style={fillStyle} data-testid="cat-detail-error">
      <Eyebrow color="var(--poster-paper)">ОШИБКА</Eyebrow>
      <div
        style={{
          fontFamily:
            'var(--poster-font-jet-brains-mono), ui-monospace, monospace',
          fontSize: 13,
          opacity: 0.85,
          marginTop: 18,
          wordBreak: 'break-word',
        }}
      >
        {message}
      </div>
      <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
        <PosterButton variant="primary" onClick={onRetry}>
          ПОВТОРИТЬ
        </PosterButton>
        <PosterButton variant="ghost" onClick={onBack}>
          НАЗАД
        </PosterButton>
      </div>
    </div>
  );
}
