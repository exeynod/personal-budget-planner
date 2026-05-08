"""One-shot dev data extender — adds richer UAT data on top of dev_seed.

Run inside the api container:
    docker compose exec -T api /app/.venv/bin/python /app/scripts/seed_extra_dev.py

Idempotent: each insert checks for existing rows, only adds what's missing.
Safe to re-run without dupes.

Adds:
- ~12 extra ActualTransactions across various categories and dates within
  the active period (so analytics, top-overspend, history filters have data).
- 8 PlannedTransactions covering the active period (so plan/fact dashboard
  has non-zero deltas).
- 3 Subscriptions (Netflix, Spotify, Yandex Plus) with realistic
  next_charge_date in the next 1-7 days.

Owner-only seed: writes everything against settings.OWNER_TG_ID's app_user.id.
"""
from __future__ import annotations

import asyncio
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.settings import settings
from app.db.models import (
    ActualSource,
    ActualTransaction,
    AppUser,
    BudgetPeriod,
    Category,
    CategoryKind,
    PeriodStatus,
    PlanSource,
    PlannedTransaction,
    SubCycle,
    Subscription,
)
from app.db.session import AsyncSessionLocal, set_tenant_scope


_EXTRA_ACTUAL: list[tuple[str, str, int, int]] = [
    # (description, category_name, rub, days_ago)
    ("Перекрёсток продукты", "Продукты", 2300, 4),
    ("Магнит вечер", "Продукты", 870, 6),
    ("Кофе с собой", "Кафе и рестораны", 380, 0),
    ("Доставка обеда", "Кафе и рестораны", 720, 2),
    ("Метро поездки", "Транспорт", 660, 3),
    ("Бензин на заправке", "Транспорт", 3500, 5),
    ("Книга на литрес", "Книги", 590, 1),
    ("Подарок маме", "Подарки", 4500, 7),
    ("Цветы", "Подарки", 1200, 2),
    ("Анализы в клинике", "Здоровье", 3800, 6),
    ("Бассейн абонемент", "Спорт", 2200, 8),
    ("Концерт билеты", "Развлечения", 5500, 4),
]


_PLANNED_TXNS: list[tuple[str, str, int, int]] = [
    # (description, category_name, rub, day_of_period)
    ("План на продукты", "Продукты", 18000, 5),
    ("Кафе бюджет", "Кафе и рестораны", 6000, 5),
    ("Транспорт месяц", "Транспорт", 8000, 5),
    ("Развлечения", "Развлечения", 5000, 10),
    ("Здоровье буфер", "Здоровье", 4000, 15),
    ("Спорт абонемент", "Спорт", 3500, 1),
    ("Книги", "Книги", 2000, 20),
    ("Зарплата ожидание", "Зарплата", 150000, 5),
]


_SUBSCRIPTIONS: list[tuple[str, str, int, str, int]] = [
    # (name, category_name, rub, cycle, days_until_charge)
    ("Netflix", "Развлечения", 699, "monthly", 3),
    ("Spotify", "Развлечения", 199, "monthly", 7),
    ("Яндекс Плюс", "Развлечения", 399, "monthly", 14),
]


async def _resolve_owner(session: AsyncSession) -> tuple[int, BudgetPeriod, dict[str, Category]]:
    user = (
        await session.execute(
            select(AppUser).where(AppUser.tg_user_id == settings.OWNER_TG_ID)
        )
    ).scalar_one_or_none()
    if user is None:
        raise SystemExit(
            f"OWNER_TG_ID={settings.OWNER_TG_ID} not in DB — start the api once "
            "to trigger dev_seed first."
        )
    user_pk = user.id
    await set_tenant_scope(session, user_pk)

    period = (
        await session.execute(
            select(BudgetPeriod)
            .where(BudgetPeriod.user_id == user_pk)
            .where(BudgetPeriod.status == PeriodStatus.active)
            .limit(1)
        )
    ).scalar_one_or_none()
    if period is None:
        raise SystemExit("No active BudgetPeriod for OWNER — run api dev_seed first.")

    cats: dict[str, Category] = {
        row.name: row
        for row in (
            await session.execute(
                select(Category)
                .where(Category.user_id == user_pk)
                .where(Category.is_archived.is_(False))
            )
        ).scalars()
    }
    return user_pk, period, cats


async def _seed_actuals(
    session: AsyncSession, user_pk: int, period: BudgetPeriod, cats: dict[str, Category]
) -> int:
    """Append extra actuals if their description+date pair isn't already present."""
    existing_keys = {
        (row.description, row.tx_date)
        for row in (
            await session.execute(
                select(ActualTransaction).where(
                    ActualTransaction.period_id == period.id
                )
            )
        ).scalars()
    }
    today = date.today()
    inserted = 0
    for desc, cat_name, rub, days_ago in _EXTRA_ACTUAL:
        cat = cats.get(cat_name)
        if cat is None:
            continue
        tx_date = today - timedelta(days=days_ago)
        if tx_date < period.period_start:
            tx_date = period.period_start
        if (desc, tx_date) in existing_keys:
            continue
        session.add(
            ActualTransaction(
                period_id=period.id,
                kind=cat.kind,
                amount_cents=rub * 100,
                description=desc,
                category_id=cat.id,
                tx_date=tx_date,
                source=ActualSource.mini_app,
                user_id=user_pk,
            )
        )
        inserted += 1
    return inserted


async def _seed_planned(
    session: AsyncSession, user_pk: int, period: BudgetPeriod, cats: dict[str, Category]
) -> int:
    """Append planned-transactions if not already present (description+kind unique)."""
    existing_keys = {
        (row.description, row.kind)
        for row in (
            await session.execute(
                select(PlannedTransaction).where(
                    PlannedTransaction.period_id == period.id
                )
            )
        ).scalars()
    }
    inserted = 0
    for desc, cat_name, rub, day_of_period in _PLANNED_TXNS:
        cat = cats.get(cat_name)
        if cat is None:
            continue
        if (desc, cat.kind) in existing_keys:
            continue
        # planned_date = period_start + (day_of_period - 1) days, clamped.
        planned_date = period.period_start + timedelta(days=max(0, day_of_period - 1))
        if planned_date > period.period_end:
            planned_date = period.period_end
        session.add(
            PlannedTransaction(
                period_id=period.id,
                kind=cat.kind,
                amount_cents=rub * 100,
                description=desc,
                category_id=cat.id,
                planned_date=planned_date,
                source=PlanSource.manual,
                user_id=user_pk,
            )
        )
        inserted += 1
    return inserted


async def _seed_subscriptions(
    session: AsyncSession, user_pk: int, cats: dict[str, Category]
) -> int:
    """Append subscriptions if not already present (uniqueness by user_id+name)."""
    existing_names = {
        row.name
        for row in (
            await session.execute(
                select(Subscription).where(Subscription.user_id == user_pk)
            )
        ).scalars()
    }
    today = date.today()
    inserted = 0
    for name, cat_name, rub, cycle, days_until in _SUBSCRIPTIONS:
        if name in existing_names:
            continue
        cat = cats.get(cat_name)
        if cat is None:
            continue
        session.add(
            Subscription(
                name=name,
                amount_cents=rub * 100,
                cycle=SubCycle(cycle),
                next_charge_date=today + timedelta(days=days_until),
                category_id=cat.id,
                notify_days_before=2,
                is_active=True,
                user_id=user_pk,
            )
        )
        inserted += 1
    return inserted


async def main() -> None:
    async with AsyncSessionLocal() as session:
        user_pk, period, cats = await _resolve_owner(session)
        a = await _seed_actuals(session, user_pk, period, cats)
        p = await _seed_planned(session, user_pk, period, cats)
        s = await _seed_subscriptions(session, user_pk, cats)
        await session.commit()
        print(f"Seeded extras: actual_tx=+{a} planned_tx=+{p} subscriptions=+{s}")


if __name__ == "__main__":
    asyncio.run(main())
