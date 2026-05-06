"""Factory helpers for tests — user_id-aware seeds (Phase 12 D-11-07-01).

After Phase 11, all domain tables require user_id NOT NULL FK. Tests must
seed AppUser first, then pass user_id to every domain row constructor.

Usage:
    async with SessionLocal() as session:
        user = await seed_user(session, tg_user_id=123456789)
        await session.commit()
        cat = await seed_category(session, user_id=user.id, name="Food",
                                   kind=CategoryKind.expense)
        await session.commit()
"""
from __future__ import annotations
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    ActualSource,
    ActualTransaction,
    AppUser,
    BudgetPeriod,
    Category,
    CategoryKind,
    PeriodStatus,
    PlanSource,
    PlanTemplateItem,
    PlannedTransaction,
    SubCycle,
    Subscription,
    UserRole,
)


async def seed_user(
    session: AsyncSession,
    *,
    tg_user_id: int,
    tg_chat_id: Optional[int] = None,
    role: UserRole = UserRole.owner,
    cycle_start_day: int = 5,
    onboarded_at: Optional[datetime] = None,
) -> AppUser:
    user = AppUser(
        tg_user_id=tg_user_id,
        tg_chat_id=tg_chat_id,
        role=role,
        cycle_start_day=cycle_start_day,
        onboarded_at=onboarded_at,
    )
    session.add(user)
    await session.flush()
    return user


async def seed_category(
    session: AsyncSession,
    *,
    user_id: int,
    name: str = "Тест",
    kind: CategoryKind = CategoryKind.expense,
    is_archived: bool = False,
    sort_order: int = 0,
) -> Category:
    c = Category(
        user_id=user_id, name=name, kind=kind,
        is_archived=is_archived, sort_order=sort_order,
    )
    session.add(c)
    await session.flush()
    return c


async def seed_budget_period(
    session: AsyncSession,
    *,
    user_id: int,
    period_start: date,
    period_end: date,
    starting_balance_cents: int = 0,
    status: PeriodStatus = PeriodStatus.active,
) -> BudgetPeriod:
    p = BudgetPeriod(
        user_id=user_id, period_start=period_start, period_end=period_end,
        starting_balance_cents=starting_balance_cents, status=status,
    )
    session.add(p)
    await session.flush()
    return p


async def seed_subscription(
    session: AsyncSession,
    *,
    user_id: int,
    name: str,
    amount_cents: int,
    cycle: SubCycle,
    next_charge_date: date,
    category_id: int,
    notify_days_before: int = 2,
    is_active: bool = True,
) -> Subscription:
    s = Subscription(
        user_id=user_id, name=name, amount_cents=amount_cents, cycle=cycle,
        next_charge_date=next_charge_date, category_id=category_id,
        notify_days_before=notify_days_before, is_active=is_active,
    )
    session.add(s)
    await session.flush()
    return s


async def seed_plan_template_item(
    session: AsyncSession,
    *,
    user_id: int,
    category_id: int,
    amount_cents: int,
    description: Optional[str] = None,
    day_of_period: Optional[int] = None,
    sort_order: int = 0,
) -> PlanTemplateItem:
    t = PlanTemplateItem(
        user_id=user_id, category_id=category_id, amount_cents=amount_cents,
        description=description, day_of_period=day_of_period, sort_order=sort_order,
    )
    session.add(t)
    await session.flush()
    return t


async def seed_planned_transaction(
    session: AsyncSession,
    *,
    user_id: int,
    period_id: int,
    kind: CategoryKind,
    amount_cents: int,
    category_id: int,
    source: PlanSource = PlanSource.manual,
    description: Optional[str] = None,
    planned_date: Optional[date] = None,
    subscription_id: Optional[int] = None,
    original_charge_date: Optional[date] = None,
) -> PlannedTransaction:
    p = PlannedTransaction(
        user_id=user_id, period_id=period_id, kind=kind, amount_cents=amount_cents,
        category_id=category_id, source=source, description=description,
        planned_date=planned_date, subscription_id=subscription_id,
        original_charge_date=original_charge_date,
    )
    session.add(p)
    await session.flush()
    return p


async def seed_actual_transaction(
    session: AsyncSession,
    *,
    user_id: int,
    period_id: int,
    kind: CategoryKind,
    amount_cents: int,
    category_id: int,
    tx_date: date,
    source: ActualSource = ActualSource.mini_app,
    description: Optional[str] = None,
) -> ActualTransaction:
    a = ActualTransaction(
        user_id=user_id, period_id=period_id, kind=kind, amount_cents=amount_cents,
        category_id=category_id, tx_date=tx_date, source=source, description=description,
    )
    session.add(a)
    await session.flush()
    return a


_DEFAULT_TRUNCATE_TABLES = (
    "category, planned_transaction, actual_transaction, plan_template_item, "
    "subscription, budget_period, ai_message, ai_conversation, "
    "category_embedding, app_user"
)


async def truncate_db(*, tables: str = _DEFAULT_TRUNCATE_TABLES) -> None:
    """Truncate domain tables for test isolation using the privileged role.

    Phase 12 split runtime (budget_app, NOSUPERUSER NOBYPASSRLS) from admin
    (budget). budget_app is granted only SELECT/INSERT/UPDATE/DELETE — TRUNCATE
    requires admin. Tests call this helper for cleanup; it builds a temporary
    engine on ADMIN_DATABASE_URL, runs the TRUNCATE, and disposes the engine.
    Falls back to DATABASE_URL when ADMIN_DATABASE_URL is unset (dev shells
    that have not configured the role split).
    """
    import os

    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine

    admin_url = os.environ.get("ADMIN_DATABASE_URL") or os.environ["DATABASE_URL"]
    engine = create_async_engine(admin_url, echo=False)
    try:
        async with engine.begin() as conn:
            await conn.execute(text(f"TRUNCATE TABLE {tables} RESTART IDENTITY CASCADE"))
    finally:
        await engine.dispose()
