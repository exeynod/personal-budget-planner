/**
 * Phase 27-05 — typed wrappers for the v1.0 analytics surface.
 *
 * Backend endpoints (existing from Phase 8): `GET /api/v1/analytics/*`. The
 * v10 wrappers below expose the slice consumed by `screensV10/Analytics`
 * (Mount + View): top-categories list for the «Топ-5» section.
 *
 * Trend / forecast / top-overspend still flow through the v0.x wrapper at
 * `frontend/src/api/analytics.ts` — keep that for legacy AnalyticsScreen
 * call-sites and re-import only `getTopCategories` style if needed.
 *
 * **Wire-shape note**: backend `TopCategoriesResponse` (see
 * `app/api/schemas/analytics.py`) uses `{name, actual_cents, planned_cents}`
 * — not `{category_name, sum_cents, plan_cents}` as drafted in the plan. The
 * v10 wrapper normalises to a shape that mirrors the iOS sister API and the
 * `computeAnalytics.groupActualsByCategory` output for symmetry.
 */
import { apiFetch } from '../client';
import type { TopCategoriesResponse, AnalyticsRange } from '../types';

/**
 * Phase 27-05 — UI-facing top-category row used by `AnalyticsView`.
 *
 * Field-mapping from backend `TopCategoryItem`:
 *   category_id  ← item.category_id
 *   category_name ← item.name
 *   sum_cents    ← item.actual_cents
 *   plan_cents   ← item.planned_cents
 *   pct_of_plan  ← computed = clamp(actual/planned, 0..1)*100 when planned>0
 */
export interface TopCategoryItem {
  category_id: number;
  category_name: string;
  sum_cents: number;
  plan_cents: number;
  pct_of_plan: number | null;
}

/**
 * Re-export wire-level range for downstream Mount usage.
 *
 * Phase 27-05 maps the segmented period chip («МАР 26 / АПР 26 / МАЙ 26») to
 * a single `range='1M'` request — the backend already restricts to the
 * current active period for 1M, and Phase 27 deferred the multi-period
 * picker (would need a new `?period_start=...` query — see Phase 28 polish).
 */
export type { AnalyticsRange };

/**
 * GET /api/v1/analytics/top-categories?range=1M
 *
 * Returns normalised top spenders for the active period; for the segmented
 * UI the caller passes `range='1M'`. Items are guaranteed sorted desc by
 * `actual_cents` server-side.
 */
export async function fetchTopCategories(
  range: AnalyticsRange = '1M',
  limit = 5,
): Promise<TopCategoryItem[]> {
  const res = await apiFetch<TopCategoriesResponse>(
    `/analytics/top-categories?range=${range}`,
  );
  const items = res?.items ?? [];
  return items.slice(0, limit).map((it) => {
    const pct =
      it.planned_cents > 0
        ? Math.max(0, Math.min(100, Math.round((it.actual_cents / it.planned_cents) * 100)))
        : null;
    return {
      category_id: it.category_id,
      category_name: it.name,
      sum_cents: it.actual_cents,
      plan_cents: it.planned_cents,
      pct_of_plan: pct,
    };
  });
}
