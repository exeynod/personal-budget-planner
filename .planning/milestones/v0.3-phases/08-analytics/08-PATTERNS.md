# Phase 8: Analytics Screen — Pattern Map

**Mapped:** 2026-05-05
**Files analyzed:** 11 new/modified files + 4 new SVG chart components
**Analogs found:** 14 / 15

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `app/services/analytics.py` | service | CRUD/aggregate-read | `app/services/actual.py` (`compute_balance`) | exact |
| `app/api/routes/analytics.py` | route | request-response | `app/api/routes/subscriptions.py` | exact |
| `app/api/router.py` | config | — | `app/api/router.py` (existing) | exact |
| `frontend/src/api/analytics.ts` | API client | request-response | `frontend/src/api/periods.ts` | exact |
| `frontend/src/api/types.ts` | type definitions | — | `frontend/src/api/types.ts` (existing) | exact |
| `frontend/src/hooks/useAnalytics.ts` | hook | request-response | `frontend/src/hooks/usePeriods.ts` | exact |
| `frontend/src/screens/AnalyticsScreen.tsx` | screen/component | request-response | `frontend/src/screens/HomeScreen.tsx` | role-match |
| `frontend/src/screens/AnalyticsScreen.module.css` | styles | — | `frontend/src/screens/HomeScreen.module.css` | exact |
| `frontend/src/styles/tokens.css` | config | — | `frontend/src/styles/tokens.css` (existing) | exact |
| `frontend/src/components/LineChart.tsx` | component | transform | `frontend/src/components/DashboardCategoryRow.tsx` | partial |
| `frontend/src/components/LineChart.module.css` | styles | — | `frontend/src/components/DashboardCategoryRow.module.css` | partial |
| `frontend/src/components/HorizontalBars.tsx` | component | transform | `frontend/src/components/DashboardCategoryRow.tsx` | partial |
| `frontend/src/components/HorizontalBars.module.css` | styles | — | `frontend/src/components/DashboardCategoryRow.module.css` | partial |
| `frontend/src/components/ForecastCard.tsx` | component | request-response | `frontend/src/components/HeroCard.tsx` | role-match |
| `frontend/src/components/TopOverspendList.tsx` | component | transform | `frontend/src/components/DashboardCategoryRow.tsx` | role-match |

---

## Pattern Assignments

### `app/services/analytics.py` (service, aggregate-read)

**Analog:** `app/services/actual.py` (lines 323–430) and `app/services/subscriptions.py`

**Imports pattern** (`app/services/actual.py` lines 34–60):
```python
from __future__ import annotations

from datetime import date
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    ActualTransaction,
    BudgetPeriod,
    Category,
    CategoryKind,
    PlannedTransaction,
    PeriodStatus,
)
from app.services.planned import PeriodNotFoundError
from app.services.periods import _today_in_app_tz
from app.services.settings import get_cycle_start_day
```

**Aggregate query pattern** (`app/services/actual.py` lines 351–376):
```python
# Run multiple SELECT+GROUP BY queries, then merge results in Python.
planned_q = (
    select(
        PlannedTransaction.category_id,
        PlannedTransaction.kind,
        func.sum(PlannedTransaction.amount_cents).label("planned_cents"),
    )
    .where(PlannedTransaction.period_id == period_id)
    .group_by(PlannedTransaction.category_id, PlannedTransaction.kind)
)
actual_q = (
    select(
        ActualTransaction.category_id,
        ActualTransaction.kind,
        func.sum(ActualTransaction.amount_cents).label("actual_cents"),
    )
    .where(ActualTransaction.period_id == period_id)
    .group_by(ActualTransaction.category_id, ActualTransaction.kind)
)
planned_rows = (await db.execute(planned_q)).all()
actual_rows = (await db.execute(actual_q)).all()
```

**Period lookup pattern** (`app/services/actual.py` lines 347–349):
```python
period = await db.get(BudgetPeriod, period_id)
if period is None:
    raise PeriodNotFoundError(period_id)
```

**Analytics service functions to implement** — each is a pure async function taking `db: AsyncSession` plus query params, returning a plain `dict`. No HTTP imports. Domain exceptions map to HTTP codes in the route layer. Pattern:
```python
async def get_trend(
    db: AsyncSession,
    *,
    range_months: int,
    cycle_start_day: int,
) -> dict:
    """Returns list of {period_label, expense_cents, income_cents} for N periods."""
    ...

async def get_top_overspend(db: AsyncSession, *, period_ids: list[int]) -> dict:
    """Top-5 categories by overspend % = actual/plan*100, expense kind only."""
    ...

async def get_top_categories(db: AsyncSession, *, period_ids: list[int]) -> dict:
    """Top-5 expense categories by total actual_cents."""
    ...

async def get_forecast(
    db: AsyncSession,
    *,
    period_id: int,
    today: date,
) -> dict:
    """Forecast end-of-period balance using daily burn rate.
    Edge case: days_elapsed=0 → return {'insufficient_data': True}.
    """
    ...
```

**Note:** Period chip mapping (`1M` = current active period; `3M/6M/12M` = N last closed) is resolved in the route layer before calling service functions. The service receives resolved `period_ids: list[int]`.

---

### `app/api/routes/analytics.py` (route, request-response)

**Analog:** `app/api/routes/subscriptions.py`

**Imports pattern** (`app/api/routes/subscriptions.py` lines 14–35):
```python
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_db
from app.api.schemas.analytics import (
    TrendResponse,
    TopOverspendResponse,
    TopCategoriesResponse,
    ForecastResponse,
)
from app.services import analytics as analytics_service
from app.services.settings import UserNotFoundError, get_cycle_start_day
```

**Router declaration pattern** (`app/api/routes/subscriptions.py` lines 31–35):
```python
router = APIRouter(
    prefix="/analytics",
    tags=["analytics"],
    dependencies=[Depends(get_current_user)],
)
```

**Read-only GET endpoint pattern** (`app/api/routes/subscriptions.py` lines 38–44):
```python
@router.get("/trend", response_model=TrendResponse)
async def get_trend(
    range: str = "1M",           # query param: "1M" | "3M" | "6M" | "12M"
    db: Annotated[AsyncSession, Depends(get_db)] = ...,
    current_user: Annotated[dict, Depends(get_current_user)] = ...,
) -> TrendResponse:
    try:
        cycle_start = await get_cycle_start_day(db, current_user["id"])
    except UserNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    data = await analytics_service.get_trend(db, range_months=_parse_range(range), cycle_start_day=cycle_start)
    return TrendResponse(**data)
```

**Error handling pattern** (`app/api/routes/subscriptions.py` lines 103–113):
```python
    except LookupError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="resource not found",
        ) from exc
```

**Note:** All 4 analytics endpoints are GET with query params (`?range=3M`). No POST/PATCH/DELETE. No `db.commit()` calls — analytics is read-only. Period chips resolve in route layer using `get_cycle_start_day` from `app.services.settings`.

---

### `app/api/router.py` (register analytics router)

**Analog:** `app/api/router.py` (existing, lines 53–117)

**Import addition** (after line 53, after `subscriptions_router` import):
```python
from app.api.routes.analytics import router as analytics_router
```

**Registration addition** (after line 117, after Phase 6 block):
```python
# Phase 8 sub-router — Analytics aggregates (ANL-07).
public_router.include_router(analytics_router)
```

Pattern is identical to all other phase router registrations. No changes to `internal_router`.

---

### `frontend/src/api/analytics.ts` (API client, request-response)

**Analog:** `frontend/src/api/periods.ts` (full file, 18 lines)

**Full file pattern** (`frontend/src/api/periods.ts` lines 1–18):
```typescript
import { apiFetch } from './client';
import type {
  TrendResponse,
  TopOverspendResponse,
  TopCategoriesResponse,
  ForecastResponse,
} from './types';

export type AnalyticsRange = '1M' | '3M' | '6M' | '12M';

export async function getAnalyticsTrend(range: AnalyticsRange): Promise<TrendResponse> {
  return apiFetch<TrendResponse>(`/analytics/trend?range=${range}`);
}

export async function getTopOverspend(range: AnalyticsRange): Promise<TopOverspendResponse> {
  return apiFetch<TopOverspendResponse>(`/analytics/top-overspend?range=${range}`);
}

export async function getTopCategories(range: AnalyticsRange): Promise<TopCategoriesResponse> {
  return apiFetch<TopCategoriesResponse>(`/analytics/top-categories?range=${range}`);
}

export async function getForecast(): Promise<ForecastResponse> {
  return apiFetch<ForecastResponse>('/analytics/forecast');
}
```

**apiFetch pattern** (`frontend/src/api/client.ts` lines 83–101): `apiFetch<T>(path, init?)` — sets `Content-Type`, injects `X-Telegram-Init-Data`, returns parsed JSON or throws `ApiError`.

---

### `frontend/src/api/types.ts` (extend with analytics types)

**Analog:** `frontend/src/api/types.ts` (existing, Phase 6 section lines 206–246 as template for new section)

**Addition pattern** (append after `// ---------- Phase 6: Subscriptions ----------` block):
```typescript
// ---------- Phase 8: Analytics ----------

export interface TrendPoint {
  period_label: string;      // e.g. "Янв", "Фев"
  expense_cents: number;
  income_cents: number;
}

export interface TrendResponse {
  points: TrendPoint[];
}

export interface OverspendItem {
  category_id: number;
  name: string;
  planned_cents: number;
  actual_cents: number;
  overspend_pct: number;     // actual/plan*100, float
}

export interface TopOverspendResponse {
  items: OverspendItem[];
}

export interface TopCategoryItem {
  category_id: number;
  name: string;
  actual_cents: number;
  planned_cents: number;
}

export interface TopCategoriesResponse {
  items: TopCategoryItem[];
}

export interface ForecastResponse {
  insufficient_data: boolean;
  current_balance_cents: number;
  projected_end_balance_cents: number | null;
  will_burn_cents: number | null;
  period_end: string | null;   // ISO date
}
```

---

### `frontend/src/hooks/useAnalytics.ts` (hook, request-response)

**Analog:** `frontend/src/hooks/usePeriods.ts` (full file, 62 lines)

**Full hook pattern** (`frontend/src/hooks/usePeriods.ts` lines 1–62):
```typescript
import { useCallback, useEffect, useState } from 'react';
import {
  getAnalyticsTrend,
  getTopOverspend,
  getTopCategories,
  getForecast,
  type AnalyticsRange,
} from '../api/analytics';
import type {
  TrendResponse,
  TopOverspendResponse,
  TopCategoriesResponse,
  ForecastResponse,
} from '../api/types';

export interface UseAnalyticsResult {
  trend: TrendResponse | null;
  topOverspend: TopOverspendResponse | null;
  topCategories: TopCategoriesResponse | null;
  forecast: ForecastResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useAnalytics(range: AnalyticsRange): UseAnalyticsResult {
  const [trend, setTrend] = useState<TrendResponse | null>(null);
  const [topOverspend, setTopOverspend] = useState<TopOverspendResponse | null>(null);
  const [topCategories, setTopCategories] = useState<TopCategoriesResponse | null>(null);
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cancellation pattern from usePeriods — local `cancelled` flag prevents stale writes.
  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, o, c, f] = await Promise.all([
        getAnalyticsTrend(range),
        getTopOverspend(range),
        getTopCategories(range),
        getForecast(),
      ]);
      setTrend(t); setTopOverspend(o); setTopCategories(c); setForecast(f);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      getAnalyticsTrend(range),
      getTopOverspend(range),
      getTopCategories(range),
      getForecast(),
    ])
      .then(([t, o, c, f]) => {
        if (!cancelled) { setTrend(t); setTopOverspend(o); setTopCategories(c); setForecast(f); }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [range]);

  return { trend, topOverspend, topCategories, forecast, loading, error, refetch };
}
```

**Key difference from usePeriods:** `range` is a dependency in `useEffect`/`useCallback` — effect re-runs when user switches period chips.

---

### `frontend/src/screens/AnalyticsScreen.tsx` (screen, request-response)

**Analog:** `frontend/src/screens/HomeScreen.tsx` (structure) and `frontend/src/screens/SubscriptionsScreen.tsx` (section pattern)

**Imports pattern** (`HomeScreen.tsx` lines 1–17 style):
```typescript
import { useState } from 'react';
import { ChartLine, Warning } from '@phosphor-icons/react';
import { PageTitle } from '../components/PageTitle';
import { ForecastCard } from '../components/ForecastCard';
import { TopOverspendList } from '../components/TopOverspendList';
import { LineChart } from '../components/LineChart';
import { HorizontalBars } from '../components/HorizontalBars';
import { useAnalytics } from '../hooks/useAnalytics';
import type { AnalyticsRange } from '../api/analytics';
import styles from './AnalyticsScreen.module.css';
```

**Period chip state pattern** (mirrors `HomeScreen.tsx` lines 31–42 tab state):
```typescript
const [range, setRange] = useState<AnalyticsRange>('1M');
const { trend, topOverspend, topCategories, forecast, loading, error } = useAnalytics(range);
```

**Loading/error guard pattern** (`HomeScreen.tsx` lines 131–140, 181–188):
```typescript
{loading && <div className={styles.muted}>Загрузка…</div>}
{error && (
  <div className={styles.error}>
    Не удалось загрузить данные. Попробуй ещё раз.
  </div>
)}
```

**Empty-all-blocks pattern** (from CONTEXT.md decision: show global empty state if all blocks have no data):
```typescript
const allEmpty =
  !loading &&
  !error &&
  (!trend?.points.length) &&
  (!topOverspend?.items.length) &&
  (!topCategories?.items.length) &&
  forecast?.insufficient_data;

{allEmpty && (
  <div className={styles.emptyState}>
    <ChartLine size={48} weight="thin" color="var(--color-text-muted)" />
    <div className={styles.emptyHeading}>Нет данных за период</div>
  </div>
)}
```

**Section layout pattern** (`SubscriptionsScreen.tsx` lines 103–109):
```tsx
<div className={styles.section}>
  <div className={styles.sectionTitle}>Прогноз</div>
  {forecast && !forecast.insufficient_data && <ForecastCard forecast={forecast} />}
</div>
```

**Root structure**:
```tsx
return (
  <div className={styles.root}>
    <PageTitle title="Аналитика" />
    {/* Period chips */}
    <div className={styles.chips}>
      {(['1M','3M','6M','12M'] as AnalyticsRange[]).map((r) => (
        <button key={r} type="button"
          className={range === r ? styles.chipActive : styles.chip}
          onClick={() => setRange(r)}
        >{r}</button>
      ))}
    </div>
    {loading && ...skeleton blocks...}
    {error && ...error div...}
    {!loading && !error && (
      <>
        {forecast && <ForecastCard forecast={forecast} />}
        {topOverspend?.items.length ? <TopOverspendList items={topOverspend.items} /> : null}
        {trend?.points.length ? <LineChart points={trend.points} /> : null}
        {topCategories?.items.length ? <HorizontalBars items={topCategories.items} /> : null}
        {allEmpty && ...global empty state...}
      </>
    )}
  </div>
);
```

---

### `frontend/src/screens/AnalyticsScreen.module.css` (styles)

**Analog:** `frontend/src/screens/HomeScreen.module.css` (full file, 144 lines)

**Root container pattern** (`HomeScreen.module.css` lines 1–11):
```css
.root {
  padding: var(--space-4) var(--space-4) var(--space-12);
  min-height: 100dvh;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-sans);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
```

**Chip bar pattern** (new; closest model: `.tabBar` from `HomeScreen.module.css` lines 21–32 but horizontal scroll variant):
```css
.chips {
  display: flex;
  gap: var(--space-2);
  overflow-x: auto;
  scrollbar-width: none;
  padding-bottom: 2px;
}
.chip,
.chipActive {
  flex-shrink: 0;
  height: 32px;
  padding: 0 var(--space-3);
  border-radius: var(--radius-full);
  font-family: inherit;
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  cursor: pointer;
  border: 1px solid var(--color-border);
}
.chip {
  background: transparent;
  color: var(--color-text-muted);
}
.chipActive {
  background: var(--color-primary);
  color: #fff;
  border-color: var(--color-primary);
}
```

**Section pattern** (mirrors `SubscriptionsScreen.module.css` section pattern; use surface card):
```css
.section {
  background: var(--color-surface);
  border-radius: var(--radius-md);
  padding: var(--space-4);
}
.sectionTitle {
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: var(--space-3);
}
```

**Reuse from HomeScreen.module.css verbatim:** `.muted`, `.error`, `.emptyState`, `.emptyHeading`, `.emptyBody`.

---

### `frontend/src/styles/tokens.css` (add chart palette)

**Analog:** `frontend/src/styles/tokens.css` (existing, lines 1–78)

**Addition** — append to `:root` block after `--shadow-glow` (line 71), before closing `}`:
```css
  /* Chart palette — Phase 8 Analytics (ANL-07) */
  --chart-1: #4ea4ff;   /* primary blue — matches --color-primary */
  --chart-2: #2ecc71;   /* success green */
  --chart-3: #ffd166;   /* accent yellow */
  --chart-4: #ff5d5d;   /* danger red */
  --chart-5: #a78bfa;   /* purple */
  --chart-6: #38bdf8;   /* sky blue */
```

**Note:** CONTEXT.md says "add to styles/globals.css" but `globals.css` does not exist — the project's root-level CSS vars file is `tokens.css`. Add to `:root` in `tokens.css`.

---

### `frontend/src/components/ForecastCard.tsx` (component, request-response)

**Analog:** `frontend/src/components/HeroCard.tsx` (full file, 63 lines)

**Imports and props pattern** (`HeroCard.tsx` lines 1–11):
```typescript
import type { ForecastResponse } from '../api/types';
import { formatKopecks } from '../utils/format';
import { Warning } from '@phosphor-icons/react';
import styles from './ForecastCard.module.css';

export interface ForecastCardProps {
  forecast: ForecastResponse;
}
```

**Conditional colour pattern** (`HeroCard.tsx` lines 29–35 delta colouring):
```typescript
// Map to danger/success/muted based on projected_end_balance_cents sign
const balanceCls =
  (forecast.projected_end_balance_cents ?? 0) < 0
    ? styles.valueDanger
    : styles.valueSuccess;
```

**Surface card layout** (`HeroCard.tsx` lines 37–52):
```tsx
return (
  <div className={styles.card}>
    <div className={styles.label}>Прогноз на конец периода</div>
    {forecast.insufficient_data ? (
      <div className={styles.noData}>Недостаточно данных</div>
    ) : (
      <>
        <div className={`${styles.value} ${balanceCls}`}>
          {forecast.projected_end_balance_cents! < 0 && <Warning weight="fill" />}
          {formatKopecks(forecast.projected_end_balance_cents!)} ₽
        </div>
        <div className={styles.sub}>
          Сгорит {formatKopecks(forecast.will_burn_cents!)} ₽
        </div>
      </>
    )}
  </div>
);
```

---

### `frontend/src/components/TopOverspendList.tsx` (component, transform)

**Analog:** `frontend/src/components/DashboardCategoryRow.tsx` (full file, 68 lines)

**Props and imports pattern** (`DashboardCategoryRow.tsx` lines 1–9):
```typescript
import type { OverspendItem } from '../api/types';
import { formatKopecks } from '../utils/format';
import styles from './TopOverspendList.module.css';

export interface TopOverspendListProps {
  items: OverspendItem[];
}
```

**Left-border colouring pattern** (from CONTEXT.md specifics — matches `DashboardCategoryRow` warn/overspend border logic):
```typescript
// OverspendItem.overspend_pct: >100 → danger, ≥80 → warn, else neutral
const borderCls =
  item.overspend_pct > 100
    ? styles.borderDanger
    : item.overspend_pct >= 80
      ? styles.borderWarn
      : styles.borderNeutral;
```

**Row layout** (mirrors `DashboardCategoryRow.tsx` topRow pattern):
```tsx
{items.map((item) => (
  <div key={item.category_id} className={`${styles.row} ${borderCls}`}>
    <span className={styles.name}>{item.name}</span>
    <span className={styles.pct}>{Math.round(item.overspend_pct)}%</span>
    <span className={styles.amount}>{formatKopecks(item.actual_cents)} ₽</span>
  </div>
))}
```

---

### `frontend/src/components/LineChart.tsx` (component, transform)

**Analog:** No direct analog exists. Closest structural analog: `DashboardCategoryRow.tsx` for CSS module pattern.

**SVG structure pattern** (self-drawn, based on CONTEXT.md decisions):
```typescript
import styles from './LineChart.module.css';
import type { TrendPoint } from '../api/types';

interface LineChartProps {
  points: TrendPoint[];   // at least 2 points expected
  width?: number;         // viewBox width, defaults to 320
  height?: number;        // viewBox height, defaults to 160
}

export function LineChart({ points, width = 320, height = 160 }: LineChartProps) {
  // 1. Compute Y domain (0 to max expense_cents), auto-tick every 5000 * 100 kopecks.
  // 2. Map points to SVG coordinates.
  // 3. Build cubic bezier path string using SVG 'C' commands.
  // 4. Build gradient fill path (area under curve, closed back to baseline).
  // 5. Render: <svg viewBox> + <defs gradient> + <path fill> + <path stroke> + axis labels.
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={styles.chart}
      aria-hidden
    >
      <defs>
        <linearGradient id="lineChartFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.15" />
          <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* area fill */}
      <path d={areaPath} fill="url(#lineChartFill)" />
      {/* line */}
      <path d={linePath} fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" />
      {/* X-axis labels */}
      {points.map((p, i) => (
        <text key={i} x={xPos(i)} y={height - 4} className={styles.xLabel}>{p.period_label}</text>
      ))}
    </svg>
  );
}
```

**CSS module pattern** (from `DashboardCategoryRow.module.css` — use CSS vars, no hard-coded colours):
```css
.chart { width: 100%; height: auto; display: block; }
.xLabel {
  font-family: var(--font-sans);
  font-size: 10px;
  fill: var(--color-text-muted);
  text-anchor: middle;
}
.yLabel {
  font-family: var(--font-sans);
  font-size: 10px;
  fill: var(--color-text-dim);
  text-anchor: end;
}
```

---

### `frontend/src/components/HorizontalBars.tsx` (component, transform)

**Analog:** `frontend/src/components/DashboardCategoryRow.tsx` — same row+bar layout, horizontal orientation.

**Key difference from DashboardCategoryRow:** bars are sized relative to max item (not plan), use `--chart-1`..`--chart-5` cycling colours, no `transition` animation (static per CONTEXT.md).

```typescript
import type { TopCategoryItem } from '../api/types';
import { formatKopecks } from '../utils/format';
import styles from './HorizontalBars.module.css';

const CHART_COLORS = ['--chart-1','--chart-2','--chart-3','--chart-4','--chart-5'] as const;

export function HorizontalBars({ items }: { items: TopCategoryItem[] }) {
  const maxCents = Math.max(...items.map((i) => i.actual_cents), 1);
  return (
    <div className={styles.list}>
      {items.map((item, idx) => {
        const fillPct = (item.actual_cents / maxCents) * 100;
        const color = `var(${CHART_COLORS[idx % CHART_COLORS.length]})`;
        return (
          <div key={item.category_id} className={styles.row}>
            <div className={styles.label}>{item.name}</div>
            <div className={styles.barTrack}>
              <div
                className={styles.barFill}
                style={{ width: `${fillPct}%`, background: color }}
              />
            </div>
            <div className={styles.amount}>{formatKopecks(item.actual_cents)} ₽</div>
          </div>
        );
      })}
    </div>
  );
}
```

**Bar CSS** (mirrors `DashboardCategoryRow.module.css` lines 82–95 bar pattern, NO transition):
```css
.barTrack {
  height: 6px;
  border-radius: 3px;
  background: var(--color-border);
  overflow: hidden;
  flex: 1;
}
.barFill {
  height: 100%;
  border-radius: 3px;
  /* NO transition — static per CONTEXT.md decision */
}
```

---

## Shared Patterns

### Authentication (all backend routes)
**Source:** `app/api/routes/subscriptions.py` lines 31–35
**Apply to:** `app/api/routes/analytics.py`
```python
router = APIRouter(
    prefix="/analytics",
    tags=["analytics"],
    dependencies=[Depends(get_current_user)],
)
```
Router-level dependency enforces OWNER_TG_ID check on every endpoint with zero boilerplate per route.

### Pydantic schema pattern (read-only response schemas)
**Source:** `app/api/schemas/subscriptions.py` lines 40–54
**Apply to:** `app/api/schemas/analytics.py` (new file)
```python
class TrendResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    points: list[TrendPoint]

class TrendPoint(BaseModel):
    period_label: str
    expense_cents: int
    income_cents: int
```
All analytics schemas are response-only (no `Create`/`Update` variants). Use `ConfigDict(from_attributes=True)` for ORM compat even though service returns plain dicts.

### Cycle start day resolution (backend)
**Source:** `app/api/routes/subscriptions.py` lines 158–165
**Apply to:** All analytics endpoints that need period resolution
```python
try:
    cycle_start = await get_cycle_start_day(db, current_user["id"])
except UserNotFoundError as exc:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
```

### CSS token usage (all frontend styles)
**Source:** `frontend/src/styles/tokens.css` (full file)
**Apply to:** All new `.module.css` files
- Colours: `var(--color-*)` only — never hex literals
- Spacing: `var(--space-*)` only
- Typography: `var(--text-*)`, `var(--weight-*)`
- Borders: `var(--radius-*)`, `var(--color-border*)`
- Chart colours: `var(--chart-1)` through `var(--chart-6)` (new in this phase)

### apiFetch usage (all frontend API modules)
**Source:** `frontend/src/api/client.ts` lines 83–101
**Apply to:** `frontend/src/api/analytics.ts`
```typescript
import { apiFetch } from './client';
// apiFetch<T>(path) — injects auth header, throws ApiError on non-2xx
```

### Cancellation pattern (all frontend hooks)
**Source:** `frontend/src/hooks/usePeriods.ts` lines 41–58
**Apply to:** `frontend/src/hooks/useAnalytics.ts`
```typescript
useEffect(() => {
  let cancelled = false;
  // ... fetch ...
  .then((data) => { if (!cancelled) setState(data); })
  .catch((e: unknown) => { if (!cancelled) setError(...); })
  .finally(() => { if (!cancelled) setLoading(false); });
  return () => { cancelled = true; };
}, [dependency]);
```

### Money formatting (all frontend components)
**Source:** `frontend/src/utils/format.ts`
**Apply to:** `ForecastCard.tsx`, `TopOverspendList.tsx`, `HorizontalBars.tsx`, `LineChart.tsx` (Y-axis labels)
- `formatKopecks(cents)` — number without currency
- `formatKopecksWithCurrency(cents)` — with ₽
- `formatKopecksWithSign(cents)` — with +/− prefix

### Phosphor icons (empty states)
**Source:** `frontend/src/screens/AnalyticsScreen.tsx` (existing placeholder, line 1), `HomeScreen.tsx` lines 195–196
**Apply to:** `AnalyticsScreen.tsx` global empty state
```typescript
import { ChartLine, Warning } from '@phosphor-icons/react';
// Usage: <ChartLine size={48} weight="thin" color="var(--color-text-muted)" />
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `app/api/schemas/analytics.py` | schema | — | New read-only response schemas; pattern from `app/api/schemas/subscriptions.py` (SubscriptionRead) is sufficient |
| SVG `LineChart` path math | utility | transform | No SVG chart code exists in the codebase; use CONTEXT.md cubic bezier spec directly |

---

## Metadata

**Analog search scope:** `app/services/`, `app/api/routes/`, `app/api/schemas/`, `frontend/src/api/`, `frontend/src/hooks/`, `frontend/src/screens/`, `frontend/src/components/`, `frontend/src/styles/`, `frontend/src/utils/`
**Files scanned:** 18 source files read
**Pattern extraction date:** 2026-05-05
