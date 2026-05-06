# Phase 5: Dashboard & Period Lifecycle — Pattern Map

**Mapped:** 2026-05-03
**Files analyzed:** 11
**Analogs found:** 10 / 11

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `frontend/src/screens/HomeScreen.tsx` | screen/component | request-response | `frontend/src/screens/PlannedScreen.tsx` | exact |
| `frontend/src/components/HeroCard.tsx` | component | request-response | `frontend/src/components/CategoryRow.tsx` | role-match |
| `frontend/src/components/PeriodSwitcher.tsx` | component | request-response | `frontend/src/components/CategoryRow.tsx` | role-match |
| `frontend/src/components/AggrStrip.tsx` | component | request-response | `frontend/src/components/CategoryRow.tsx` | role-match |
| `frontend/src/components/DashboardCategoryRow.tsx` | component | request-response | `frontend/src/components/CategoryRow.tsx` | exact |
| `frontend/src/hooks/useDashboard.ts` | hook | request-response | `frontend/src/hooks/usePlanned.ts` | exact |
| `frontend/src/hooks/usePeriods.ts` | hook | request-response | `frontend/src/hooks/useCurrentPeriod.ts` | exact |
| `frontend/src/api/types.ts` | types | — | `frontend/src/api/types.ts` (modify) | exact |
| `app/api/routes/periods.py` | route/controller | request-response | `app/api/routes/actual.py` | exact |
| `app/worker/jobs/close_period.py` | worker job | event-driven | `main_worker.py` (heartbeat_job pattern) | role-match |
| `app/worker/main_worker.py` | scheduler config | event-driven | `main_worker.py` | exact |

---

## Pattern Assignments

### `frontend/src/screens/HomeScreen.tsx` (screen, request-response)

**Analog:** `frontend/src/screens/PlannedScreen.tsx`

**Imports pattern** (lines 1-21):
```typescript
import { useEffect, useMemo, useState } from 'react';
import { useCurrentPeriod } from '../hooks/useCurrentPeriod';
import { usePlanned } from '../hooks/usePlanned';
import { useCategories } from '../hooks/useCategories';
import type { CategoryKind, CategoryRead, PlannedRead } from '../api/types';
import { BottomSheet } from '../components/BottomSheet';
import styles from './PlannedScreen.module.css';
```

Для HomeScreen заменить на:
```typescript
import { useState, useMemo } from 'react';
import { useDashboard } from '../hooks/useDashboard';
import { usePeriods } from '../hooks/usePeriods';
import type { CategoryKind } from '../api/types';
import { HeroCard } from '../components/HeroCard';
import { PeriodSwitcher } from '../components/PeriodSwitcher';
import { AggrStrip } from '../components/AggrStrip';
import { DashboardCategoryRow } from '../components/DashboardCategoryRow';
import { BottomSheet } from '../components/BottomSheet';
import { Fab } from '../components/Fab';
import styles from './HomeScreen.module.css';
```

**Props interface pattern** (lines 22-25 PlannedScreen — adapt):
```typescript
export interface HomeScreenProps {
  onNavigate: (screen: 'categories' | 'template' | 'planned' | 'actual' | 'settings') => void;
}
```

**Loading/error guard pattern** (lines 262-285 PlannedScreen):
```tsx
if (perLoading) {
  return <div className={styles.muted}>Загрузка периода…</div>;
}
if (perError) {
  return <div className={styles.error}>Ошибка периода: {perError}</div>;
}
if (!period) {
  return (
    <div className={styles.root}>
      <div className={styles.empty}>Сначала завершите onboarding.</div>
    </div>
  );
}
```

**Toast pattern** (lines 142-145 PlannedScreen):
```typescript
const showToast = (msg: string) => {
  setToast(msg);
  window.setTimeout(() => setToast(null), 2200);
};
```

**Toast + apply-template mutation pattern** (lines 149-168 PlannedScreen):
```typescript
const handleApplyTemplate = async () => {
  if (!period || busy) return;
  setBusy(true);
  setMutationError(null);
  try {
    const result = await applyTemplate(period.id);
    showToast(`Применено ${result.created} строк`);
    await refetch();
  } catch (e) {
    setMutationError(e instanceof Error ? e.message : String(e));
  } finally {
    setBusy(false);
  }
};
```

**Tab filtering + sort pattern** (lines 109-140 PlannedScreen, adapt for dashboard):
```typescript
// В HomeScreen — фильтрация by_category по activeTab ('expense' | 'income')
const filteredCategories = useMemo(
  () => balance?.by_category.filter((r) => r.kind === activeTab)
         .sort((a, b) => /* sort_order из useCategories */ 0) ?? [],
  [balance, activeTab],
);
```

**JSX root pattern** (lines 287-408 PlannedScreen):
```tsx
return (
  <div className={styles.root}>
    {/* PeriodSwitcher сверху */}
    {/* Tabs Расходы / Доходы */}
    {/* AggrStrip */}
    {/* список DashboardCategoryRow */}
    {/* toast */}
    {/* FAB — только на активном периоде */}
    <BottomSheet open={sheetOpen} onClose={...} title="Новая транзакция">
      ...
    </BottomSheet>
  </div>
);
```

**FAB visibility pattern** (lines 103-105 HomeScreen existing):
```tsx
{period && period.status === 'active' && selectedPeriodId === currentPeriod?.id && (
  <Fab onClick={() => setSheetOpen(true)} ariaLabel="Добавить факт-трату" />
)}
```

---

### `frontend/src/components/HeroCard.tsx` (component, request-response)

**Analog:** `frontend/src/components/CategoryRow.tsx` (структура) + `BalanceResponse` тип

**Component structure pattern** (lines 1-10 CategoryRow):
```typescript
import type { BalanceResponse, PeriodRead } from '../api/types';
import { formatKopecksWithSign } from '../utils/format';
import styles from './HeroCard.module.css';

export interface HeroCardProps {
  balance: BalanceResponse;
  period: PeriodRead;
  isClosed: boolean;
}

export function HeroCard({ balance, period, isClosed }: HeroCardProps) {
```

**Conditional rendering pattern** (lines 54-56 CategoryRow):
```typescript
const cls = [styles.card, isClosed ? styles.closed : ''].filter(Boolean).join(' ');
```

**Closed-period display logic** (из CONTEXT.md decisions):
```tsx
const displayBalance = isClosed
  ? period.ending_balance_cents  // финальный баланс
  : balance.balance_now_cents;   // текущий
const deltaColor = balance.delta_total_cents >= 0 ? styles.positive : styles.negative;
```

---

### `frontend/src/components/PeriodSwitcher.tsx` (component, request-response)

**Analog:** `frontend/src/components/CategoryRow.tsx`

**Component structure pattern**:
```typescript
import type { PeriodRead } from '../api/types';
import styles from './PeriodSwitcher.module.css';

export interface PeriodSwitcherProps {
  periods: PeriodRead[];
  selectedId: number;
  onSelect: (id: number) => void;
}

export function PeriodSwitcher({ periods, selectedId, onSelect }: PeriodSwitcherProps) {
  const idx = periods.findIndex((p) => p.id === selectedId);
  const current = periods[idx];
  const hasPrev = idx < periods.length - 1;  // periods сортированы desc
  const hasNext = idx > 0;
```

**Disabled button pattern** (lines 78-96 CategoryRow):
```tsx
<button type="button" onClick={...} disabled={!hasPrev} className={styles.navBtn} aria-label="Предыдущий период">←</button>
<span className={styles.label}>{periodLabel} {current?.status === 'closed' && <span className={styles.badge}>Закрыт</span>}</span>
<button type="button" onClick={...} disabled={!hasNext} className={styles.navBtn} aria-label="Следующий период">→</button>
```

---

### `frontend/src/components/AggrStrip.tsx` (component, request-response)

**Analog:** `frontend/src/components/CategoryRow.tsx`

**Component structure pattern**:
```typescript
import type { BalanceResponse, CategoryKind } from '../api/types';
import { formatKopecks, formatKopecksWithSign } from '../utils/format';
import styles from './AggrStrip.module.css';

export interface AggrStripProps {
  balance: BalanceResponse;
  kind: CategoryKind;
}

export function AggrStrip({ balance, kind }: AggrStripProps) {
  const planned = kind === 'expense'
    ? balance.planned_total_expense_cents
    : balance.planned_total_income_cents;
  const actual = kind === 'expense'
    ? balance.actual_total_expense_cents
    : balance.actual_total_income_cents;
  const delta = kind === 'expense'
    ? planned - actual          // расходы: план − факт
    : actual - planned;         // доходы: факт − план
  const deltaColor = delta >= 0 ? styles.positive : styles.negative;
```

---

### `frontend/src/components/DashboardCategoryRow.tsx` (component, request-response)

**Analog:** `frontend/src/components/CategoryRow.tsx` — прямое расширение

**Imports pattern** (lines 1-4 CategoryRow):
```typescript
import type { BalanceCategoryRow } from '../api/types';
import styles from './DashboardCategoryRow.module.css';
```

**Props interface — NEW (не extends CategoryRowProps)**:
```typescript
export interface DashboardCategoryRowProps {
  row: BalanceCategoryRow;     // из BalanceResponse.by_category
  sortOrder?: number;          // для визуального порядка, не меняет данные
}
```

**Edge-state logic** (из CONTEXT.md decisions):
```typescript
const pct = row.planned_cents > 0 ? row.actual_cents / row.planned_cents : null;
const isWarn      = pct !== null && pct >= 0.8 && pct <= 1.0;
const isOverspend = pct !== null && pct > 1.0;

const rowCls = [
  styles.row,
  isWarn ? styles.warn : '',
  isOverspend ? styles.overspend : '',
].filter(Boolean).join(' ');

const barCls = [
  styles.progressBar,
  isWarn ? styles.barWarn : '',
  isOverspend ? styles.barOverspend : '',
].filter(Boolean).join(' ');
```

**CSS class composition pattern** (line 54 CategoryRow):
```typescript
const cls = [styles.row, category.is_archived ? styles.archived : ''].filter(Boolean).join(' ');
```

---

### `frontend/src/hooks/useDashboard.ts` (hook, request-response)

**Analog:** `frontend/src/hooks/usePlanned.ts` — точное соответствие

**Full hook pattern** (lines 1-71 usePlanned.ts):
```typescript
import { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError } from '../api/client';
import type { BalanceResponse } from '../api/types';

export interface UseDashboardResult {
  balance: BalanceResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useDashboard(periodId: number | null): UseDashboardResult {
  const [balance, setBalance] = useState<BalanceResponse | null>(null);
  const [loading, setLoading] = useState(periodId !== null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (periodId === null) { setBalance(null); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      // Активный период: GET /actual/balance
      // Архивный: GET /periods/{id}/balance (новый endpoint Phase 5)
      const url = /* определяется снаружи или через флаг */ `/periods/${periodId}/balance`;
      const data = await apiFetch<BalanceResponse>(url);
      setBalance(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [periodId]);

  useEffect(() => {
    if (periodId === null) { setBalance(null); setLoading(false); setError(null); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    // ... same cancellation pattern as usePlanned
    return () => { cancelled = true; };
  }, [periodId]);

  return { balance, loading, error, refetch };
}
```

**Cancellation pattern** (lines 45-68 usePlanned.ts):
```typescript
useEffect(() => {
  if (periodId === null) {
    setRows([]);
    setLoading(false);
    setError(null);
    return;
  }
  let cancelled = false;
  setLoading(true);
  setError(null);
  listPlanned(periodId)
    .then((data) => { if (!cancelled) setRows(data); })
    .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
    .finally(() => { if (!cancelled) setLoading(false); });
  return () => { cancelled = true; };
}, [periodId]);
```

---

### `frontend/src/hooks/usePeriods.ts` (hook, request-response)

**Analog:** `frontend/src/hooks/useCurrentPeriod.ts` — точное соответствие

**Full hook pattern** (lines 1-71 useCurrentPeriod.ts):
```typescript
import { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError } from '../api/client';
import type { PeriodRead } from '../api/types';

export interface UsePeriodsResult {
  periods: PeriodRead[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function usePeriods(): UsePeriodsResult {
  const [periods, setPeriods] = useState<PeriodRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<PeriodRead[]>('/periods');
      setPeriods(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch<PeriodRead[]>('/periods')
      .then((data) => { if (!cancelled) setPeriods(data); })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { periods, loading, error, refetch };
}
```

**404 → null pattern** (lines 36-39 useCurrentPeriod.ts):
```typescript
} catch (e) {
  if (e instanceof ApiError && e.status === 404) {
    setPeriod(null);   // не ошибка — онбординг не завершён
  } else {
    setError(e instanceof Error ? e.message : String(e));
  }
}
```

---

### `frontend/src/api/types.ts` (types, modify)

**Analog:** `frontend/src/api/types.ts` (существующий файл — добавить в конец)

**Existing section header pattern** (lines 140-142):
```typescript
// ---------- Phase 5: Dashboard & Period Lifecycle ----------
```

**New types to add** (копировать стиль PeriodRead lines 37-45):
```typescript
// ---------- Phase 5: Dashboard & Period Lifecycle ----------

/** GET /api/v1/periods response — list of all periods for PeriodSwitcher. */
export type PeriodListResponse = PeriodRead[];
// PeriodRead already defined above (lines 37-45) — reuse as-is.
// BalanceResponse already defined (lines 181-193) — reuse for archive endpoint.
```

`PeriodRead` и `BalanceResponse` уже определены — новых интерфейсов не требуется, достаточно добавить `PeriodListResponse` type alias.

---

### `app/api/routes/periods.py` (route/controller, request-response)

**Analog:** `app/api/routes/actual.py` + `app/api/routes/periods.py` (extend)

**Router declaration pattern** (lines 16-20 periods.py):
```python
periods_router = APIRouter(
    prefix="/periods",
    tags=["periods"],
    dependencies=[Depends(get_current_user)],
)
```

**New endpoint — GET /periods list** (копировать стиль actual.py lines 66-85):
```python
@periods_router.get("", response_model=list[PeriodRead])
async def list_periods(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[PeriodRead]:
    """GET /api/v1/periods — list all budget periods, newest first.

    Used by PeriodSwitcher (Phase 5, DSH-05) to populate the navigation
    dropdown. Returns an empty list (not 404) when no periods exist.
    """
    periods = await period_svc.list_all_periods(db)
    return [PeriodRead.model_validate(p) for p in periods]
```

**New endpoint — GET /periods/{id}/balance** (копировать стиль get_balance lines 144-170 actual.py):
```python
from app.services import actual as actual_svc
from app.services.actual import PeriodNotFoundError

@periods_router.get("/{period_id}/balance", response_model=BalanceResponse)
async def get_period_balance(
    period_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BalanceResponse:
    """GET /api/v1/periods/{period_id}/balance — balance for any period.

    Allows viewing archived period data in PeriodSwitcher (DSH-05).
    Returns 404 if period does not exist.
    """
    try:
        bal = await actual_svc.compute_balance(db, period_id)
    except PeriodNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    return BalanceResponse(**bal)
```

**Import additions needed**:
```python
from app.api.schemas.actual import BalanceResponse
from app.services import actual as actual_svc
from app.services.actual import PeriodNotFoundError
```

**Exception → HTTP pattern** (lines 115-141 actual.py):
```python
except SomeDomainError as exc:
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
    ) from exc
```

**router.py registration** — добавить в comment block `router.py` lines 24-29, router уже включён (line 100):
```python
# Phase 5 additions to periods_router (periods.py):
# - GET /periods               — PER-list (DSH-05)
# - GET /periods/{id}/balance  — ACT-04 variant for archived periods (DSH-05)
```

---

### `app/worker/jobs/close_period.py` (worker job, event-driven)

**Analog:** `main_worker.py` heartbeat_job pattern (lines 36-60)

**Job function pattern** (lines 36-60 main_worker.py):
```python
async def heartbeat_job() -> None:
    async with AsyncSessionLocal() as session:
        try:
            # ... business logic
            await session.commit()
            logger.info("worker.heartbeat.written")
        except Exception:
            await session.rollback()
            logger.exception("worker.heartbeat.failed")
```

**close_period job structure**:
```python
"""close_period worker job — PER-04.

Runs daily at 00:01 Europe/Moscow via APScheduler (main_worker.py).
Single DB transaction: close expired period + create next one.
Idempotency: no-op if no active period has ended before today_msk.
No pg_try_advisory_lock currently used in codebase — add here as first
instance per CONTEXT.md decision.
"""
import structlog
from sqlalchemy import select, text

from app.db.models import BudgetPeriod, PeriodStatus
from app.db.session import AsyncSessionLocal
from app.services import periods as period_svc

logger = structlog.get_logger(__name__)

ADVISORY_LOCK_KEY = 202505_01  # arbitrary unique int for close_period job


async def close_period_job() -> None:
    """PER-04: close expired active period + create next period.

    Uses pg_try_advisory_lock(key) to prevent concurrent runs.
    Idempotency check: skip if active period end_date >= today_msk.
    """
    async with AsyncSessionLocal() as session:
        try:
            # Advisory lock — non-blocking, bail if already running.
            lock_acquired = (
                await session.execute(
                    text("SELECT pg_try_advisory_lock(:key)"),
                    {"key": ADVISORY_LOCK_KEY},
                )
            ).scalar()
            if not lock_acquired:
                logger.info("close_period.skipped.lock_not_acquired")
                return

            # Idempotency: find active period that has expired.
            # ... fetch, close, create next, commit
            await session.commit()
            logger.info("close_period.done")
        except Exception:
            await session.rollback()
            logger.exception("close_period.failed")
        finally:
            # Release advisory lock even on error.
            await session.execute(
                text("SELECT pg_advisory_unlock(:key)"), {"key": ADVISORY_LOCK_KEY}
            )
```

**AsyncSessionLocal pattern** (lines 43-44 main_worker.py):
```python
async with AsyncSessionLocal() as session:
```

**structlog pattern** (lines 31-32, 57-59 main_worker.py):
```python
logger = structlog.get_logger(__name__)
logger.info("worker.heartbeat.written")
logger.exception("worker.heartbeat.failed")
```

**period_for utility** (используется в `app/services/periods.py` lines 49-50):
```python
from app.core.period import period_for
p_start, p_end = period_for(today, cycle_start_day)
```

---

### `app/worker/main_worker.py` (scheduler config, event-driven)

**Analog:** `main_worker.py` (modify existing)

**Job registration pattern** (lines 67-74 main_worker.py):
```python
scheduler.add_job(
    heartbeat_job,
    "interval",
    minutes=5,
    id="heartbeat",
    replace_existing=True,
    next_run_time=datetime.now(MOSCOW_TZ),
)
```

**Cron trigger pattern** (lines 76-82 main_worker.py — раскомментировать и заполнить):
```python
# Uncomment and add import for Phase 5:
from app.worker.jobs.close_period import close_period_job

scheduler.add_job(
    close_period_job,
    "cron",
    hour=0,
    minute=1,
    id="close_period",
    replace_existing=True,
    timezone=MOSCOW_TZ,
)
```

**MOSCOW_TZ already defined** (line 33 main_worker.py):
```python
MOSCOW_TZ = pytz.timezone(settings.APP_TZ)
```

---

## Shared Patterns

### Деньги — форматирование
**Source:** существующие хуки и типы
**Apply to:** HeroCard, AggrStrip, DashboardCategoryRow
```typescript
// Используются утилиты formatKopecks / formatKopecksWithSign
// Проверить наличие в frontend/src/utils/format.ts или аналоге
// НЕ использовать float — все суммы в BIGINT копейках
```

### CSS Modules
**Source:** `frontend/src/components/CategoryRow.tsx` (line 3), `frontend/src/screens/PlannedScreen.tsx` (line 20)
**Apply to:** все новые компоненты
```typescript
import styles from './ComponentName.module.css';
```

### Отмена stale-запросов (cancelled flag)
**Source:** `frontend/src/hooks/useCurrentPeriod.ts` lines 46-68
**Apply to:** useDashboard, usePeriods
```typescript
let cancelled = false;
// ...
return () => { cancelled = true; };
```

### FastAPI router dependency injection
**Source:** `app/api/routes/periods.py` lines 16-20, `app/api/routes/actual.py` lines 57-60
**Apply to:** router_periods.py новые endpoints
```python
dependencies=[Depends(get_current_user)]
# + per-handler:
db: Annotated[AsyncSession, Depends(get_db)]
```

### Pydantic model_validate
**Source:** `app/api/routes/actual.py` line 85, 141, 170
**Apply to:** все новые route handlers
```python
return PeriodRead.model_validate(period)
return BalanceResponse(**bal)  # dict unpacking — паттерн из actual.py line 170
```

### Worker job — try/except/rollback
**Source:** `main_worker.py` lines 43-60
**Apply to:** close_period_job
```python
async with AsyncSessionLocal() as session:
    try:
        # business logic
        await session.commit()
        logger.info("job.done")
    except Exception:
        await session.rollback()
        logger.exception("job.failed")
```

### App.tsx navigation pattern
**Source:** `frontend/src/App.tsx` lines 22-23, 53-54
**Apply to:** App.tsx — добавить `selectedPeriodId` state
```typescript
const [overrideScreen, setOverrideScreen] = useState<Screen | null>(null);
// Добавить:
const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);
// HomeScreen получает дополнительные props:
<HomeScreen
  onNavigate={(s) => setOverrideScreen(s)}
  selectedPeriodId={selectedPeriodId}
  onPeriodSelect={setSelectedPeriodId}
/>
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| — | — | — | Все файлы имеют достаточно близкие аналоги |

Единственное новшество — `pg_try_advisory_lock` в close_period_job. Паттерн описан в CONTEXT.md, SQL вызов прямой (`text("SELECT pg_try_advisory_lock(:key)")`), аналогов в текущей кодовой базе нет.

---

## Metadata

**Analog search scope:** `frontend/src/`, `app/api/routes/`, `app/services/`, `app/worker/`, `main_worker.py`
**Files scanned:** 14
**Pattern extraction date:** 2026-05-03
