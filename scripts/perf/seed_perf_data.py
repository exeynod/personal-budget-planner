"""Perf-load seeder — bulk synthetic data to reproduce latency at realistic volume.

Run inside the api container (scripts/ is not mounted in dev — docker cp first):
    docker cp scripts/perf/seed_perf_data.py <api>:/tmp/seed_perf_data.py
    docker compose ... exec -T -e PYTHONPATH=/app api /app/.venv/bin/python /tmp/seed_perf_data.py

Volume is env-tunable:
    PERF_MONTHS         historical CLOSED periods to create (default 24)
    PERF_TX_PER_PERIOD  actual transactions per period       (default 200)
    PERF_SUBS           subscriptions                        (default 15)

Idempotent-ish: skips periods whose period_start already exists; appends txns
only up to the target count per period. Re-runnable. Owner-scoped (OWNER_TG_ID).

Why: dev_seed/seed_extra give ~20 rows — far below real accumulated history.
Latency of aggregates (/home, /periods, /balance, /analytics, recurring cashflow)
scales with row counts; this seeder creates a realistic 2-year dataset so the
profiler can surface seq-scans / N+1 / missing-index effects that are invisible
at toy volume.
"""

from __future__ import annotations

import asyncio
import calendar
import os
import random
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
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
    SubCycle,
    Subscription,
)
from app.db.session import AsyncSessionLocal, set_tenant_scope

MONTHS = int(os.environ.get("PERF_MONTHS", "24"))
TX_PER_PERIOD = int(os.environ.get("PERF_TX_PER_PERIOD", "200"))
N_SUBS = int(os.environ.get("PERF_SUBS", "15"))

rng = random.Random(42)


def _month_bounds(year: int, month: int) -> tuple[date, date]:
    last = calendar.monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, last)


def _prior_month(year: int, month: int, k: int) -> tuple[int, int]:
    """Return (year, month) k months before (year, month)."""
    idx = (year * 12 + (month - 1)) - k
    return idx // 12, (idx % 12) + 1


async def _owner(
    session: AsyncSession,
) -> tuple[int, BudgetPeriod, list[Category], list[Category]]:
    user = (
        await session.execute(
            select(AppUser).where(AppUser.tg_user_id == settings.OWNER_TG_ID)
        )
    ).scalar_one_or_none()
    if user is None:
        raise SystemExit("OWNER not in DB — boot api once for dev_seed.")
    await set_tenant_scope(session, user.id)
    active = (
        await session.execute(
            select(BudgetPeriod)
            .where(BudgetPeriod.user_id == user.id)
            .where(BudgetPeriod.status == PeriodStatus.active)
            .limit(1)
        )
    ).scalar_one_or_none()
    if active is None:
        raise SystemExit("No active period — boot api dev_seed first.")
    cats = list(
        (
            await session.execute(
                select(Category)
                .where(Category.user_id == user.id)
                .where(Category.is_archived.is_(False))
            )
        ).scalars()
    )
    expense = [c for c in cats if c.kind == CategoryKind.expense]
    income = [c for c in cats if c.kind == CategoryKind.income]
    return user.id, active, expense, income


async def _existing_period_starts(session: AsyncSession, user_pk: int) -> set[date]:
    rows = (
        await session.execute(
            select(BudgetPeriod.period_start).where(BudgetPeriod.user_id == user_pk)
        )
    ).scalars()
    return set(rows)


def _make_actuals(
    period_id: int,
    p_start: date,
    p_end: date,
    user_pk: int,
    expense: list[Category],
    income: list[Category],
    n: int,
) -> list[ActualTransaction]:
    span = (p_end - p_start).days or 1
    out: list[ActualTransaction] = []
    # one salary income near the start
    if income:
        out.append(
            ActualTransaction(
                period_id=period_id,
                kind=CategoryKind.income,
                amount_cents=rng.randint(120_000, 220_000) * 100,
                description="Зарплата",
                category_id=income[0].id,
                tx_date=p_start + timedelta(days=rng.randint(0, 3)),
                source=ActualSource.mini_app,
                user_id=user_pk,
            )
        )
    for _ in range(max(0, n - 1)):
        cat = rng.choice(expense)
        out.append(
            ActualTransaction(
                period_id=period_id,
                kind=CategoryKind.expense,
                amount_cents=rng.randint(50, 8000) * 100,
                description=f"{cat.name} трата",
                category_id=cat.id,
                tx_date=p_start + timedelta(days=rng.randint(0, span)),
                source=rng.choice([ActualSource.mini_app, ActualSource.bot]),
                user_id=user_pk,
            )
        )
    return out


async def _count_actuals(session: AsyncSession, period_id: int) -> int:
    return (
        await session.execute(
            select(func.count())
            .select_from(ActualTransaction)
            .where(ActualTransaction.period_id == period_id)
        )
    ).scalar_one()


async def main() -> None:
    async with AsyncSessionLocal() as session:
        user_pk, active, expense, income = await _owner(session)
        if not expense:
            raise SystemExit("No expense categories.")
        existing_starts = await _existing_period_starts(session, user_pk)

        created_periods = 0
        created_actuals = 0

        # --- historical CLOSED periods (prior calendar months) ---
        base_y, base_m = active.period_start.year, active.period_start.month
        for k in range(1, MONTHS + 1):
            y, m = _prior_month(base_y, base_m, k)
            p_start, p_end = _month_bounds(y, m)
            if p_start in existing_starts:
                continue
            period = BudgetPeriod(
                user_id=user_pk,
                period_start=p_start,
                period_end=p_end,
                starting_balance_cents=0,
                ending_balance_cents=rng.randint(-50_000, 200_000) * 100,
                status=PeriodStatus.closed,
                closed_at=datetime.now(timezone.utc),
            )
            session.add(period)
            await session.flush()  # period.id
            rows = _make_actuals(
                period.id, p_start, p_end, user_pk, expense, income, TX_PER_PERIOD
            )
            session.add_all(rows)
            created_periods += 1
            created_actuals += len(rows)
            if created_periods % 6 == 0:
                await session.flush()

        # --- top up the ACTIVE period to TX_PER_PERIOD (heavier dashboard) ---
        have = await _count_actuals(session, active.id)
        need = max(0, TX_PER_PERIOD - have)
        if need:
            rows = _make_actuals(
                active.id,
                active.period_start,
                active.period_end,
                user_pk,
                expense,
                income,
                need,
            )
            session.add_all(rows)
            created_actuals += len(rows)

        # --- subscriptions ---
        existing_sub_names = {
            r
            for r in (
                await session.execute(
                    select(Subscription.name).where(Subscription.user_id == user_pk)
                )
            ).scalars()
        }
        created_subs = 0
        today = date.today()
        for i in range(N_SUBS):
            name = f"Подписка {i + 1}"
            if name in existing_sub_names:
                continue
            cat = rng.choice(expense)
            session.add(
                Subscription(
                    name=name,
                    amount_cents=rng.randint(99, 1500) * 100,
                    cycle=SubCycle.monthly,
                    next_charge_date=today + timedelta(days=rng.randint(1, 28)),
                    category_id=cat.id,
                    notify_days_before=2,
                    is_active=True,
                    user_id=user_pk,
                )
            )
            created_subs += 1

        await session.commit()

        total_periods = (
            await session.execute(
                select(func.count())
                .select_from(BudgetPeriod)
                .where(BudgetPeriod.user_id == user_pk)
            )
        ).scalar_one()
        total_actuals = (
            await session.execute(
                select(func.count())
                .select_from(ActualTransaction)
                .where(ActualTransaction.user_id == user_pk)
            )
        ).scalar_one()
        print(
            f"perf-seed done: +{created_periods} periods, +{created_actuals} actuals, "
            f"+{created_subs} subs | totals: periods={total_periods}, actuals={total_actuals}"
        )


if __name__ == "__main__":
    asyncio.run(main())
