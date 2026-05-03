# Phase 6: Subscriptions & Worker Jobs - Pattern Map

**Mapped:** 2026-05-03
**Files analyzed:** 20
**Analogs found:** 19 / 20

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `app/db/models.py` | model | CRUD | `app/db/models.py` (AppUser section) | self-modify |
| `alembic/versions/0002_*.py` | migration | transform | `alembic/versions/0001_initial.py` | role-match |
| `app/api/schemas/subscriptions.py` | schema | request-response | `app/api/schemas/actual.py` | exact |
| `app/services/subscriptions.py` | service | CRUD | `app/services/actual.py` | exact |
| `app/services/settings.py` | service | CRUD | `app/services/settings.py` (existing) | self-modify |
| `app/api/schemas/settings.py` | schema | request-response | `app/api/schemas/settings.py` (existing) | self-modify |
| `app/api/routes/subscriptions.py` | route/controller | request-response | `app/api/routes/actual.py` | exact |
| `app/api/routes/settings.py` | route/controller | request-response | `app/api/routes/settings.py` (existing) | self-modify |
| `app/api/router.py` | config | request-response | `app/api/router.py` (existing) | self-modify |
| `app/worker/jobs/notify_subscriptions.py` | worker | event-driven | `app/worker/jobs/close_period.py` | exact |
| `app/worker/jobs/charge_subscriptions.py` | worker | event-driven | `app/worker/jobs/close_period.py` | exact |
| `main_worker.py` | config | event-driven | `main_worker.py` (existing) | self-modify |
| `frontend/src/api/subscriptions.ts` | utility | request-response | `frontend/src/api/actual.ts` | exact |
| `frontend/src/api/types.ts` | model | transform | `frontend/src/api/types.ts` (existing) | self-modify |
| `frontend/src/hooks/useSubscriptions.ts` | hook | request-response | `frontend/src/hooks/useActual.ts` | exact |
| `frontend/src/components/SubscriptionEditor.tsx` | component | request-response | `frontend/src/components/ActualEditor.tsx` | exact |
| `frontend/src/screens/SubscriptionsScreen.tsx` | component | request-response | `frontend/src/screens/ActualScreen.tsx` | exact |
| `frontend/src/screens/SettingsScreen.tsx` | component | request-response | `frontend/src/screens/SettingsScreen.tsx` (existing) | self-modify |
| `frontend/src/App.tsx` | config | request-response | `frontend/src/App.tsx` (existing) | self-modify |
| `tests/test_subscriptions.py` | test | request-response | `tests/test_actual_crud.py` | exact |

---

## Pattern Assignments

### `app/db/models.py` — modify AppUser (add notify_days_before)

**Analog:** `app/db/models.py` lines 69-82 (AppUser model)

**Existing AppUser column pattern** (lines 69-82):
```python
class AppUser(Base):
    __tablename__ = "app_user"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tg_user_id: Mapped[int] = mapped_column(BigInteger, unique=True, nullable=False)
    tg_chat_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    cycle_start_day: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    onboarded_at: Mapped[Optional[datetime]] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )
```

**New column to add** (after cycle_start_day, same style):
```python
notify_days_before: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
```

---

### `alembic/versions/0002_add_notify_days_before.py` (new migration)

**Analog:** `alembic/versions/0001_initial.py` lines 1-19

**Migration header pattern** (lines 1-19):
```python
"""Initial schema: 6 domain tables + app_health + enums + indices

Revision ID: 0001
Revises:
Create Date: 2026-05-01
...
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None
```

**New migration structure** (copy header, set down_revision="0001", add single ALTER):
```python
"""Add notify_days_before to app_user (SET-02)

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-03
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "app_user",
        sa.Column("notify_days_before", sa.Integer(), server_default="2", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("app_user", "notify_days_before")
```

---

### `app/api/schemas/subscriptions.py` (new — service, CRUD)

**Analog:** `app/api/schemas/actual.py` (all lines)

**Imports pattern** (lines 1-6 from actual.py):
```python
from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field
```

**Create schema pattern** (lines 11-16 from actual.py):
```python
class ActualCreate(BaseModel):
    kind: KindStr
    amount_cents: int = Field(gt=0)
    description: Optional[str] = Field(default=None, max_length=500)
    category_id: int = Field(gt=0)
    tx_date: date
```

**Update schema (all Optional) pattern** (lines 19-25 from actual.py):
```python
class ActualUpdate(BaseModel):
    kind: Optional[KindStr] = None
    amount_cents: Optional[int] = Field(default=None, gt=0)
    ...
    tx_date: Optional[date] = None
```

**Read schema with ConfigDict** (lines 27-37 from actual.py):
```python
class ActualRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    period_id: int
    ...
```

**New file structure for subscriptions** — mirror this pattern:
```python
"""Schemas for subscriptions (SUB-01..SUB-05, D-71, D-72)."""
from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.api.schemas.categories import CategoryRead  # joined in SubscriptionRead

SubCycleStr = Literal["monthly", "yearly"]


class SubscriptionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    amount_cents: int = Field(gt=0)
    cycle: SubCycleStr
    next_charge_date: date
    category_id: int = Field(gt=0)
    notify_days_before: Optional[int] = Field(default=None, ge=0, le=30)
    is_active: bool = True


class SubscriptionUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    amount_cents: Optional[int] = Field(default=None, gt=0)
    cycle: Optional[SubCycleStr] = None
    next_charge_date: Optional[date] = None
    category_id: Optional[int] = Field(default=None, gt=0)
    notify_days_before: Optional[int] = Field(default=None, ge=0, le=30)
    is_active: Optional[bool] = None


class SubscriptionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    amount_cents: int
    cycle: SubCycleStr
    next_charge_date: date
    category_id: int
    notify_days_before: int
    is_active: bool
    category: CategoryRead


class ChargeNowResponse(BaseModel):
    planned_id: int
    next_charge_date: date
```

---

### `app/services/subscriptions.py` (new — service, CRUD)

**Analog:** `app/services/actual.py` (all lines)

**Module docstring + imports pattern** (lines 1-60 from actual.py):
```python
"""..module docstring..."""
from datetime import date
from typing import Optional

from dateutil.relativedelta import relativedelta
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.settings import settings as app_settings
from app.db.models import (
    Category,
    PlannedTransaction,
    PlanSource,
    SubCycle,
    Subscription,
)
from app.services import categories as cat_svc
from app.services.actual import _resolve_period_for_date
from app.services.periods import _today_in_app_tz
from app.services.settings import UserNotFoundError, get_cycle_start_day
```

**Domain exception pattern** (lines 63-80 from actual.py):
```python
class ActualNotFoundError(Exception):
    def __init__(self, actual_id: int) -> None:
        self.actual_id = actual_id
        super().__init__(f"Actual transaction {actual_id} not found")
```

Copy for subscriptions:
```python
class SubscriptionNotFoundError(Exception):
    def __init__(self, sub_id: int) -> None:
        self.sub_id = sub_id
        super().__init__(f"Subscription {sub_id} not found")


class AlreadyChargedError(Exception):
    def __init__(self, sub_id: int, charge_date: date) -> None:
        self.sub_id = sub_id
        self.charge_date = charge_date
        super().__init__(
            f"Subscription {sub_id} already charged for {charge_date}"
        )
```

**get_or_404 pattern** (lines 208-213 from actual.py):
```python
async def get_or_404(db: AsyncSession, actual_id: int) -> ActualTransaction:
    row = await db.get(ActualTransaction, actual_id)
    if row is None:
        raise ActualNotFoundError(actual_id)
    return row
```

**create pattern** (lines 216-258 from actual.py):
```python
async def create_actual(db: AsyncSession, *, kind, amount_cents, ...) -> ActualTransaction:
    cat = await _ensure_category_active(db, category_id)
    ...
    row = ActualTransaction(...)
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row
```

**update with patch.model_dump(exclude_unset=True) pattern** (lines 261-306 from actual.py):
```python
async def update_actual(db: AsyncSession, actual_id: int, patch: ActualUpdate) -> ActualTransaction:
    row = await get_or_404(db, actual_id)
    data = patch.model_dump(exclude_unset=True)
    ...
    for field, value in data.items():
        setattr(row, field, value)
    await db.flush()
    await db.refresh(row)
    return row
```

**hard delete pattern** (lines 309-317 from actual.py):
```python
async def delete_actual(db: AsyncSession, actual_id: int) -> ActualTransaction:
    row = await get_or_404(db, actual_id)
    await db.delete(row)
    await db.flush()
    return row
```

**charge_subscription + IntegrityError → domain exception pattern** (from CONTEXT.md specifics):
```python
async def charge_subscription(
    db: AsyncSession, sub_id: int
) -> tuple[PlannedTransaction, date]:
    sub = await get_or_404(db, sub_id)
    cat = await cat_svc.get_or_404(db, sub.category_id)
    cycle_start_day = await _get_cycle_start_day(db)
    period_id = await _resolve_period_for_date(
        db, sub.next_charge_date, cycle_start_day=cycle_start_day
    )
    planned = PlannedTransaction(
        period_id=period_id,
        kind=cat.kind,
        amount_cents=sub.amount_cents,
        category_id=sub.category_id,
        source=PlanSource.subscription_auto,
        subscription_id=sub.id,
        original_charge_date=sub.next_charge_date,
    )
    try:
        db.add(planned)
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise AlreadyChargedError(sub.id, sub.next_charge_date)
    new_next = _advance_charge_date(sub)
    sub.next_charge_date = new_next
    await db.flush()
    await db.refresh(planned)
    return planned, new_next


def _advance_charge_date(sub: Subscription) -> date:
    if sub.cycle == SubCycle.monthly:
        return sub.next_charge_date + relativedelta(months=1)
    else:
        return sub.next_charge_date + relativedelta(years=1)
```

---

### `app/services/settings.py` — extend (add notify_days_before)

**Analog:** `app/services/settings.py` lines 44-67 (existing get/update cycle_start_day)

**Existing function pair pattern** (lines 44-67):
```python
async def get_cycle_start_day(db: AsyncSession, tg_user_id: int) -> int:
    user = await _get_user_or_404(db, tg_user_id)
    return user.cycle_start_day


async def update_cycle_start_day(
    db: AsyncSession,
    tg_user_id: int,
    cycle_start_day: int,
) -> int:
    user = await _get_user_or_404(db, tg_user_id)
    user.cycle_start_day = cycle_start_day
    await db.flush()
    return user.cycle_start_day
```

Add parallel functions following the exact same structure:
```python
async def get_notify_days_before(db: AsyncSession, tg_user_id: int) -> int:
    user = await _get_user_or_404(db, tg_user_id)
    return user.notify_days_before


async def update_notify_days_before(
    db: AsyncSession,
    tg_user_id: int,
    value: int,
) -> int:
    user = await _get_user_or_404(db, tg_user_id)
    user.notify_days_before = value
    await db.flush()
    return user.notify_days_before
```

---

### `app/api/schemas/settings.py` — extend (add notify_days_before)

**Analog:** `app/api/schemas/settings.py` lines 1-23

**Existing schemas** (full file):
```python
class SettingsRead(BaseModel):
    cycle_start_day: int


class SettingsUpdate(BaseModel):
    cycle_start_day: int = Field(ge=1, le=28)
```

**Modified schemas** — add field to both:
```python
class SettingsRead(BaseModel):
    cycle_start_day: int
    notify_days_before: int


class SettingsUpdate(BaseModel):
    cycle_start_day: Optional[int] = Field(default=None, ge=1, le=28)
    notify_days_before: Optional[int] = Field(default=None, ge=0, le=30)
```

Note: `cycle_start_day` must become Optional to support partial updates (D-77). Both fields now optional; route validates that at least something is present if needed.

---

### `app/api/routes/subscriptions.py` (new — controller, request-response)

**Analog:** `app/api/routes/actual.py` (all lines)

**Router declaration pattern** (lines 57-60 from actual.py):
```python
actual_router = APIRouter(
    tags=["actual"],
    dependencies=[Depends(get_current_user)],
)
```

Copy for subscriptions (add prefix per D-71):
```python
subscriptions_router = APIRouter(
    prefix="/subscriptions",
    tags=["subscriptions"],
    dependencies=[Depends(get_current_user)],
)
```

**Route handler imports pattern** (lines 33-55 from actual.py):
```python
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_db
from app.api.schemas.actual import (ActualCreate, ActualRead, ActualUpdate, ...)
from app.services import actual as actual_svc
from app.services.actual import ActualNotFoundError, FutureDateError
from app.services.categories import CategoryNotFoundError
```

**Exception → HTTPException mapping pattern** (lines 115-141 from actual.py):
```python
try:
    row = await actual_svc.create_actual(db, ...)
except CategoryNotFoundError as exc:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
except InvalidCategoryError as exc:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
```

**charge-now endpoint** (409 for AlreadyChargedError):
```python
@subscriptions_router.post("/{sub_id}/charge-now", response_model=ChargeNowResponse)
async def charge_now(sub_id: int, db: Annotated[AsyncSession, Depends(get_db)]) -> ChargeNowResponse:
    try:
        planned, new_next = await sub_svc.charge_subscription(db, sub_id)
    except SubscriptionNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except AlreadyChargedError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return ChargeNowResponse(planned_id=planned.id, next_charge_date=new_next)
```

---

### `app/api/routes/settings.py` — extend PATCH (add notify_days_before)

**Analog:** `app/api/routes/settings.py` lines 40-64

**Existing PATCH handler** (lines 40-64):
```python
@settings_router.patch("", response_model=SettingsRead)
async def update_settings(
    body: SettingsUpdate,
    current_user: Annotated[dict, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SettingsRead:
    try:
        new_value = await settings_svc.update_cycle_start_day(
            db,
            tg_user_id=current_user["id"],
            cycle_start_day=body.cycle_start_day,
        )
    except UserNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return SettingsRead(cycle_start_day=new_value)
```

Extend to handle both fields (partial update — only update fields that are set):
```python
@settings_router.patch("", response_model=SettingsRead)
async def update_settings(body: SettingsUpdate, ...) -> SettingsRead:
    try:
        tg_user_id = current_user["id"]
        if body.cycle_start_day is not None:
            await settings_svc.update_cycle_start_day(db, tg_user_id, body.cycle_start_day)
        if body.notify_days_before is not None:
            await settings_svc.update_notify_days_before(db, tg_user_id, body.notify_days_before)
        cycle = await settings_svc.get_cycle_start_day(db, tg_user_id)
        notify = await settings_svc.get_notify_days_before(db, tg_user_id)
    except UserNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return SettingsRead(cycle_start_day=cycle, notify_days_before=notify)
```

Also extend GET `/settings` to include `notify_days_before` in response.

---

### `app/api/router.py` — register subscriptions_router

**Analog:** `app/api/router.py` lines 98-112

**Existing include_router pattern** (lines 99-112):
```python
# Register Phase 2 sub-routers under the same /api/v1 prefix.
public_router.include_router(categories_router)
public_router.include_router(periods_router)
public_router.include_router(onboarding_router)
public_router.include_router(settings_router)

# Phase 3 sub-routers
public_router.include_router(templates_router)
public_router.include_router(planned_router)

# Phase 4 sub-router
public_router.include_router(actual_router)
```

Add at end of public router registrations:
```python
# Phase 6 sub-router — subscriptions CRUD + charge-now
from app.api.routes.subscriptions import subscriptions_router
public_router.include_router(subscriptions_router)
```

Also update the docstring to list Phase 6 routes.

---

### `app/worker/jobs/notify_subscriptions.py` (new — worker, event-driven)

**Analog:** `app/worker/jobs/close_period.py` (all lines — complete template)

**Advisory lock + session pattern** (lines 47-124 from close_period.py):
```python
async def close_period_job() -> None:
    async with AsyncSessionLocal() as session:
        lock_acquired = False
        try:
            lock_result = await session.execute(
                text("SELECT pg_try_advisory_lock(:key)"),
                {"key": ADVISORY_LOCK_KEY},
            )
            lock_acquired = bool(lock_result.scalar())
            if not lock_acquired:
                logger.info("close_period.skipped.lock_not_acquired")
                return

            today = _today_in_app_tz()
            # ... business logic ...
            await session.commit()
            logger.info("close_period.done", ...)
        except Exception:
            await session.rollback()
            logger.exception("close_period.failed")
        finally:
            if lock_acquired:
                try:
                    await session.execute(
                        text("SELECT pg_advisory_unlock(:key)"),
                        {"key": ADVISORY_LOCK_KEY},
                    )
                    await session.commit()
                except Exception:
                    logger.exception("close_period.unlock_failed")
```

**Imports pattern** (lines 17-31 from close_period.py):
```python
import structlog
from sqlalchemy import select, text

from app.core.settings import settings
from app.db.models import BudgetPeriod, PeriodStatus
from app.db.session import AsyncSessionLocal
from app.services.periods import _today_in_app_tz
from app.services.settings import UserNotFoundError, get_cycle_start_day

logger = structlog.get_logger(__name__)

ADVISORY_LOCK_KEY = 20250501
```

**New file structure** — copy close_period pattern, set `ADVISORY_LOCK_KEY = 20250502`, add aiogram Bot push:
```python
from aiogram import Bot

from app.core.settings import settings
from app.db.models import AppUser, Subscription
from app.db.session import AsyncSessionLocal
from app.services.periods import _today_in_app_tz

ADVISORY_LOCK_KEY = 20250502


async def notify_subscriptions_job() -> None:
    async with AsyncSessionLocal() as session:
        lock_acquired = False
        bot: Bot | None = None
        try:
            # ... advisory lock acquire (same as close_period) ...
            today = _today_in_app_tz()

            # Fetch tg_chat_id — skip if None
            user_result = await session.execute(select(AppUser))
            user = user_result.scalar_one_or_none()
            if user is None or user.tg_chat_id is None:
                logger.info("notify_subscriptions.skipped.no_chat_id")
                return

            # Query subscriptions due in notify_days_before days
            stmt = select(Subscription).where(
                Subscription.is_active.is_(True),
                Subscription.next_charge_date == today + timedelta(days=<notify_days_before>),
            )
            # ... per-subscription send_message ...
            bot = Bot(token=settings.BOT_TOKEN)
            for sub in subs:
                await bot.send_message(chat_id=user.tg_chat_id, text=...)
                logger.info("notify_subscriptions.sent", sub_id=sub.id)

        except Exception:
            await session.rollback()
            logger.exception("notify_subscriptions.failed")
        finally:
            if bot:
                await bot.session.close()
            # ... advisory lock release (same as close_period) ...
```

Note: `notify_days_before` per subscription comes from `sub.notify_days_before` (already on Subscription model).

---

### `app/worker/jobs/charge_subscriptions.py` (new — worker, event-driven)

**Analog:** `app/worker/jobs/close_period.py` (all lines — same pattern as notify)

Uses `ADVISORY_LOCK_KEY = 20250503`. Full advisory lock pattern identical to close_period.py. Business logic differs: per-subscription transaction commit + UniqueViolationError skip (not fail entire job):

```python
# COMMIT per subscription — not batch — so one failure doesn't abort all
for sub in subs:
    try:
        async with AsyncSessionLocal() as sub_session:
            # resolve period, insert PlannedTransaction, advance next_charge_date
            # if IntegrityError (uq_planned_sub_charge_date) → log + skip
            await sub_session.commit()
    except IntegrityError:
        logger.info("charge_subscriptions.already_charged", sub_id=sub.id)
    except Exception:
        logger.exception("charge_subscriptions.sub_failed", sub_id=sub.id)
```

Key deviation from close_period: uses nested per-subscription sessions (one commit per sub) rather than a single batch commit, to match D-80 requirement.

---

### `main_worker.py` — register 2 new jobs

**Analog:** `main_worker.py` lines 79-94 (close_period registration + placeholder comments)

**Existing job registration pattern** (lines 79-88):
```python
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

**Placeholder comments to uncomment** (lines 91-94):
```python
# scheduler.add_job(notify_subscriptions, "cron", hour=9, minute=0,
#                   id="notify_subscriptions", timezone=MOSCOW_TZ)
# scheduler.add_job(charge_subscriptions, "cron", hour=0, minute=5,
#                   id="charge_subscriptions", timezone=MOSCOW_TZ)
```

Replace with real registrations + imports at top of file:
```python
from app.worker.jobs.notify_subscriptions import notify_subscriptions_job
from app.worker.jobs.charge_subscriptions import charge_subscriptions_job

# ... inside main():
scheduler.add_job(
    notify_subscriptions_job,
    "cron",
    hour=9,
    minute=0,
    id="notify_subscriptions",
    replace_existing=True,
    timezone=MOSCOW_TZ,
)
scheduler.add_job(
    charge_subscriptions_job,
    "cron",
    hour=0,
    minute=5,
    id="charge_subscriptions",
    replace_existing=True,
    timezone=MOSCOW_TZ,
)
```

---

### `frontend/src/api/subscriptions.ts` (new — utility, request-response)

**Analog:** `frontend/src/api/actual.ts` (all lines)

**Full file pattern** (actual.ts lines 1-27):
```typescript
import { apiFetch } from './client';
import type { ActualCreatePayload, ActualRead, ActualUpdatePayload, BalanceResponse } from './types';

export async function listActual(periodId: number, ...): Promise<ActualRead[]> {
  return apiFetch<ActualRead[]>(`/periods/${periodId}/actual${suffix}`);
}

export async function createActual(payload: ActualCreatePayload): Promise<ActualRead> {
  return apiFetch<ActualRead>('/actual', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateActual(id: number, patch: ActualUpdatePayload): Promise<ActualRead> {
  return apiFetch<ActualRead>(`/actual/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

export async function deleteActual(id: number): Promise<ActualRead> {
  return apiFetch<ActualRead>(`/actual/${id}`, { method: 'DELETE' });
}
```

New file structure:
```typescript
import { apiFetch } from './client';
import type { SubscriptionRead, SubscriptionCreatePayload, SubscriptionUpdatePayload, ChargeNowResponse } from './types';

export async function listSubscriptions(): Promise<SubscriptionRead[]> {
  return apiFetch<SubscriptionRead[]>('/subscriptions');
}

export async function createSubscription(payload: SubscriptionCreatePayload): Promise<SubscriptionRead> {
  return apiFetch<SubscriptionRead>('/subscriptions', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateSubscription(id: number, patch: SubscriptionUpdatePayload): Promise<SubscriptionRead> {
  return apiFetch<SubscriptionRead>(`/subscriptions/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

export async function deleteSubscription(id: number): Promise<SubscriptionRead> {
  return apiFetch<SubscriptionRead>(`/subscriptions/${id}`, { method: 'DELETE' });
}

export async function chargeNow(id: number): Promise<ChargeNowResponse> {
  return apiFetch<ChargeNowResponse>(`/subscriptions/${id}/charge-now`, { method: 'POST' });
}
```

---

### `frontend/src/api/types.ts` — extend (Phase 6 types)

**Analog:** `frontend/src/api/types.ts` lines 140-201 (Phase 4 block pattern)

**Phase section header pattern** (line 140):
```typescript
// ---------- Phase 4: Actual Transactions & Balance ----------
```

Add at end of file:
```typescript
// ---------- Phase 6: Subscriptions ----------

export type SubCycle = 'monthly' | 'yearly';

export interface SubscriptionRead {
  id: number;
  name: string;
  amount_cents: number;
  cycle: SubCycle;
  next_charge_date: string;  // ISO date
  category_id: number;
  notify_days_before: number;
  is_active: boolean;
  category: CategoryRead;
}

export interface SubscriptionCreatePayload {
  name: string;
  amount_cents: number;
  cycle: SubCycle;
  next_charge_date: string;
  category_id: number;
  notify_days_before?: number;
  is_active?: boolean;
}

export interface SubscriptionUpdatePayload {
  name?: string;
  amount_cents?: number;
  cycle?: SubCycle;
  next_charge_date?: string;
  category_id?: number;
  notify_days_before?: number;
  is_active?: boolean;
}

export interface ChargeNowResponse {
  planned_id: number;
  next_charge_date: string;
}
```

Also extend existing `SettingsRead` and `SettingsUpdatePayload`:
```typescript
export interface SettingsRead {
  cycle_start_day: number;
  notify_days_before: number;  // add
}

export interface SettingsUpdatePayload {
  cycle_start_day?: number;     // was required, now optional (partial PATCH)
  notify_days_before?: number;  // add
}
```

---

### `frontend/src/hooks/useSubscriptions.ts` (new — hook, request-response)

**Analog:** `frontend/src/hooks/useActual.ts` (all lines)

**Full hook pattern** (useActual.ts lines 1-71):
```typescript
import { useCallback, useEffect, useState } from 'react';
import { listActual } from '../api/actual';
import type { ActualRead } from '../api/types';

export interface UseActualResult {
  rows: ActualRead[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useActual(periodId: number | null): UseActualResult {
  const [rows, setRows] = useState<ActualRead[]>([]);
  const [loading, setLoading] = useState(periodId !== null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (periodId === null) { setRows([]); setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const data = await listActual(periodId);
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [periodId]);

  useEffect(() => {
    // cancelled flag pattern to prevent stale renders
    let cancelled = false;
    setLoading(true); setError(null);
    listActual(periodId)
      .then((data) => { if (!cancelled) setRows(data); })
      .catch((e: unknown) => { if (!cancelled) setError(...); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [periodId]);

  return { rows, loading, error, refetch };
}
```

New hook — subscriptions have no periodId, always fetch on mount:
```typescript
export interface UseSubscriptionsResult {
  subscriptions: SubscriptionRead[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useSubscriptions(): UseSubscriptionsResult { ... }
```

Use same cancelled flag + useCallback(refetch) pattern.

---

### `frontend/src/components/SubscriptionEditor.tsx` (new — component, request-response)

**Analog:** `frontend/src/components/ActualEditor.tsx` (all lines)

**Props interface pattern** (lines 5-31 from ActualEditor.tsx):
```typescript
export interface ActualEditorInitial { kind?, amount_cents?, description?, category_id?, tx_date? }
export interface ActualEditorSavePayload { kind, category_id, amount_cents, description, tx_date }
export interface ActualEditorProps {
  initial?: ActualEditorInitial;
  categories: CategoryRead[];
  onSave: (data: ActualEditorSavePayload) => Promise<void>;
  onDelete?: () => Promise<void>;  // edit mode only
  onCancel: () => void;
}
```

**Form state + handleSubmit pattern** (lines 80-130 from ActualEditor.tsx):
```typescript
const isEdit = onDelete !== undefined;

const [submitting, setSubmitting] = useState(false);
const [error, setError] = useState<string | null>(null);
const [confirmDelete, setConfirmDelete] = useState(false);

const handleSubmit = async () => {
  if (!canSubmit) return;
  setSubmitting(true);
  setError(null);
  try {
    await onSave({ ... });
  } catch (e) {
    setError(e instanceof Error ? e.message : String(e));
  } finally {
    setSubmitting(false);
  }
};
```

**Confirm-delete two-step pattern** (lines 132-149 from ActualEditor.tsx):
```typescript
const handleDeleteRequest = () => { if (!onDelete || submitting) return; setConfirmDelete(true); };
const handleDeleteConfirm = async () => {
  if (!onDelete) return;
  setConfirmDelete(false); setSubmitting(true); setError(null);
  try { await onDelete(); }
  catch (e) { setError(...); }
  finally { setSubmitting(false); }
};
```

**parseRublesToKopecks + formatKopecksToRubles helpers** (lines 49-62 from ActualEditor.tsx) — copy verbatim, reuse in SubscriptionEditor for amount field.

**Segmented cycle toggle** (new, analogous to kindToggle lines 153-170):
```tsx
<div className={styles.cycleToggle}>
  <button type="button" className={`${styles.cycleBtn} ${cycle === 'monthly' ? styles.cycleBtnActive : ''}`}
    onClick={() => setCycle('monthly')} disabled={submitting}>Мес</button>
  <button type="button" className={`${styles.cycleBtn} ${cycle === 'yearly' ? styles.cycleBtnActive : ''}`}
    onClick={() => setCycle('yearly')} disabled={submitting}>Год</button>
</div>
```

**Actions row + styles references** (lines 239-268 from ActualEditor.tsx):
```tsx
<div className={styles.actions}>
  {isEdit && !confirmDelete && (
    <button type="button" onClick={handleDeleteRequest} disabled={submitting} className={styles.deleteBtn}>Удалить</button>
  )}
  <button type="button" onClick={onCancel} disabled={submitting} className={styles.cancelBtn}>Отмена</button>
  <button type="button" onClick={handleSubmit} disabled={!canSubmit} className={styles.saveBtn}>
    {submitting ? 'Сохранение…' : 'Сохранить'}
  </button>
</div>
```

---

### `frontend/src/screens/SubscriptionsScreen.tsx` (new — component, request-response)

**Analog:** `frontend/src/screens/ActualScreen.tsx` (all lines)

**Screen state pattern** (lines 1-20 from ActualScreen.tsx):
```typescript
import { useState } from 'react';
import styles from './ActualScreen.module.css';

interface SheetState { open: boolean; mode: 'create' | 'edit'; item?: ActualRead; }
const CLOSED_SHEET: SheetState = { open: false, mode: 'create' };

export function ActualScreen({ onBack }: ActualScreenProps): JSX.Element {
  const [sheet, setSheet] = useState<SheetState>(CLOSED_SHEET);
  const [toast, setToast] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
```

**showToast helper** (lines 48-51 from ActualScreen.tsx):
```typescript
const showToast = (msg: string) => {
  setToast(msg);
  window.setTimeout(() => setToast(null), 2200);
};
```

**handleSave with mode check + refetch** (lines 63-85 from ActualScreen.tsx):
```typescript
const handleSave = async (data) => {
  setMutationError(null);
  try {
    if (sheet.mode === 'create') {
      await createActual(data);
      showToast('Транзакция добавлена');
    } else if (sheet.item) {
      await updateActual(sheet.item.id, data);
      showToast('Транзакция обновлена');
    }
    setSheet(CLOSED_SHEET);
    await refetch();
  } catch (e) {
    setMutationError(e instanceof Error ? e.message : String(e));
    throw e;  // re-throw so editor shows inline error too
  }
};
```

**BottomSheet + SubscriptionEditor composition pattern** (lines 153-173 from ActualScreen.tsx):
```tsx
<BottomSheet open={sheet.open} onClose={() => setSheet(CLOSED_SHEET)} title={...}>
  <ActualEditor
    initial={sheet.item ? { ... } : undefined}
    categories={categories}
    onSave={handleSave}
    onDelete={sheet.mode === 'edit' ? handleDelete : undefined}
    onCancel={() => setSheet(CLOSED_SHEET)}
  />
</BottomSheet>
```

**CSS token references for timeline/pills** (from CONTEXT.md §Reusable Assets):
- `var(--c-danger)` — charge in ≤ 2 days
- `var(--c-warn)` — charge in ≤ 7 days
- `var(--c-success)` — far future
- `var(--gradient-hero)` — hero block background

**Timeline CSS layout** (from CONTEXT.md §Specific Ideas):
```tsx
const todayPct = ((today - 1) / (days - 1)) * 100;
const chargePct = ((chargeDay - 1) / (days - 1)) * 100;
// Dot: position: absolute; left: `${chargePct}%`; transform: translateX(-50%)
// Today-line: position: absolute; left: `${todayPct}%`; height: 100%; border-left: 2px solid var(--c-accent)
```

---

### `frontend/src/screens/SettingsScreen.tsx` — extend (add notify_days_before)

**Analog:** `frontend/src/screens/SettingsScreen.tsx` lines 26-112

**Load + draft state pattern** (lines 26-55):
```typescript
const [current, setCurrent] = useState<number | null>(null);
const [draft, setDraft] = useState<number>(5);
const [loading, setLoading] = useState(true);

useEffect(() => {
  let active = true;
  setLoading(true);
  getSettings()
    .then((s) => {
      if (!active) return;
      setCurrent(s.cycle_start_day);
      setDraft(s.cycle_start_day);
    })
    ...
  return () => { active = false; };
}, []);
```

**dirty guard + handleSave pattern** (lines 56-73):
```typescript
const dirty = current !== null && draft !== current;

const handleSave = useCallback(async () => {
  if (!dirty || saving) return;
  setSaving(true);
  try {
    const updated = await updateSettings({ cycle_start_day: draft });
    setCurrent(updated.cycle_start_day);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1500);
  } ...
}, [dirty, draft, saving]);
```

Add parallel state for `notify_days_before` (draftNotify, currentNotify) following the same pattern. The `dirty` check should be `draftCycle !== currentCycle || draftNotify !== currentNotify`.

**Stepper component reuse** (line 95):
```tsx
<Stepper value={draft} min={1} max={28} onChange={setDraft} wrap />
```

Add second `<Stepper>` for notify_days_before with `min={0} max={30}`.

---

### `frontend/src/App.tsx` — extend (add subscriptions nav)

**Analog:** `frontend/src/App.tsx` lines 1-74

**Screen union type pattern** (lines 12-19):
```typescript
type Screen =
  | 'onboarding'
  | 'home'
  | 'categories'
  | 'template'
  | 'planned'
  | 'actual'
  | 'settings';
```

Add `'subscriptions'` to the union.

**Screen routing pattern** (lines 53-73):
```typescript
if (screen === 'actual') {
  return <ActualScreen onBack={() => setOverrideScreen('home')} />;
}
return <SettingsScreen onBack={() => setOverrideScreen('home')} />;
```

Add before the final return:
```typescript
if (screen === 'subscriptions') {
  return <SubscriptionsScreen onBack={() => setOverrideScreen('home')} />;
}
```

**HomeScreen onNavigate prop** (line 54 — HomeScreenProps.onNavigate type):
```typescript
onNavigate: (screen: 'categories' | 'template' | 'planned' | 'actual' | 'settings') => void;
```

Extend to include `'subscriptions'` in the union.

---

### `tests/test_subscriptions.py` (new — test, request-response)

**Analog:** `tests/test_actual_crud.py` (all lines)

**Self-skip pattern** (lines 27-29 from test_actual_crud.py):
```python
def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set — skipping DB-backed test")
```

**auth_headers fixture pattern** (lines 33-35):
```python
@pytest.fixture
def auth_headers(bot_token, owner_tg_id):
    from tests.conftest import make_init_data
    return {"X-Telegram-Init-Data": make_init_data(owner_tg_id, bot_token)}
```

**db_setup fixture pattern** (lines 38-72 from test_actual_crud.py) — copy verbatim, use identical TRUNCATE + dependency_overrides approach.

**TRUNCATE statement** (line 53-58) — include `subscription` table (already present in actual_crud test):
```python
await conn.execute(
    text(
        "TRUNCATE TABLE category, planned_transaction, "
        "actual_transaction, plan_template_item, subscription, "
        "budget_period, app_user RESTART IDENTITY CASCADE"
    )
)
```

**Test structure pattern** (lines 127-349 from test_actual_crud.py):
```python
@pytest.mark.asyncio
async def test_create_subscription(db_client, auth_headers, seed_categories):
    response = await db_client.post(
        "/api/v1/subscriptions",
        json={...},
        headers=auth_headers,
    )
    assert response.status_code in (200, 201)
    data = response.json()
    assert data["name"] == "Netflix"
    assert "id" in data
```

Cover all D-87 cases using this pattern: create, list, update, delete, archived-category 400, auth 403, charge-now creates PlannedTransaction + advances date, duplicate charge-now 409, GET /settings includes notify_days_before, PATCH /settings updates it.

---

## Shared Patterns

### Authentication (router-level)
**Source:** `app/api/routes/actual.py` lines 57-60
**Apply to:** `app/api/routes/subscriptions.py`
```python
subscriptions_router = APIRouter(
    prefix="/subscriptions",
    tags=["subscriptions"],
    dependencies=[Depends(get_current_user)],
)
```

### Service Layer Domain Exceptions
**Source:** `app/services/actual.py` lines 63-80
**Apply to:** `app/services/subscriptions.py`
```python
class SomethingNotFoundError(Exception):
    def __init__(self, entity_id: int) -> None:
        self.entity_id = entity_id
        super().__init__(f"Entity {entity_id} not found")
```

### Route → Domain Exception Mapping
**Source:** `app/api/routes/actual.py` lines 115-141
**Apply to:** `app/api/routes/subscriptions.py`, `app/api/routes/settings.py`
```python
try:
    row = await svc.create_something(db, ...)
except NotFoundError as exc:
    raise HTTPException(status_code=404, detail=str(exc)) from exc
except ValidationError as exc:
    raise HTTPException(status_code=400, detail=str(exc)) from exc
```

### Advisory Lock (worker jobs)
**Source:** `app/worker/jobs/close_period.py` lines 47-124
**Apply to:** `app/worker/jobs/notify_subscriptions.py`, `app/worker/jobs/charge_subscriptions.py`

Mandatory structure:
1. `AsyncSessionLocal()` context manager
2. `lock_acquired = False` before try
3. `pg_try_advisory_lock(:key)` — bail if False
4. Business logic
5. `except Exception: rollback + logger.exception`
6. `finally: if lock_acquired: pg_advisory_unlock + commit`

### React Mutation Pattern
**Source:** `frontend/src/screens/ActualScreen.tsx` lines 63-98
**Apply to:** `frontend/src/screens/SubscriptionsScreen.tsx`
```typescript
const handleSave = async (data) => {
  setMutationError(null);
  try {
    if (sheet.mode === 'create') { await createX(data); showToast('...'); }
    else { await updateX(sheet.item.id, data); showToast('...'); }
    setSheet(CLOSED_SHEET);
    await refetch();
  } catch (e) {
    setMutationError(e instanceof Error ? e.message : String(e));
    throw e;
  }
};
```

### CSS Modules Convention
**Source:** `frontend/src/components/ActualEditor.tsx` line 3
**Apply to:** All new frontend components and screens
```typescript
import styles from './ComponentName.module.css';
```

Every new `.tsx` file must have a co-located `.module.css` file.

### BIGINT Kopecks Formatting
**Source:** `frontend/src/components/ActualEditor.tsx` lines 49-62
**Apply to:** `frontend/src/components/SubscriptionEditor.tsx`
```typescript
function parseRublesToKopecks(input: string): number | null { ... }
function formatKopecksToRubles(cents: number | undefined | null): string { ... }
```

Copy these helpers verbatim — no float arithmetic allowed.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (none) | — | — | All files have usable analogs in the codebase |

---

## Metadata

**Analog search scope:** `app/`, `frontend/src/`, `tests/`, `alembic/`, `main_worker.py`
**Files scanned:** 18 source files read directly
**Pattern extraction date:** 2026-05-03
