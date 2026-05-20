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
import itertools
import re
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
    PlannedTransaction,
    SubCycle,
    Subscription,
    UserRole,
)

# NOTE: ``PlanTemplateItem`` was dropped in Phase 22 alembic 0013 / models.py
# (CONTEXT D-02). The legacy ``seed_plan_template_item`` helper used to insert
# rows into ``plan_template_item``; that table no longer exists. Plan 22.13
# stubs the seed helper as a deprecated no-op so existing tests that import
# ``seed_plan_template_item`` still load (they will skip via DATABASE_URL gate
# or be replaced by ``Category.plan_cents``-based seeds in Phase 23+).


# Sentinel: callers can explicitly pass onboarded_at=None (invite-flow tests),
# but the default seeds an already-onboarded user so legacy v0.2/v0.3 tests
# don't trip over Phase 14's require_onboarded gate.
_ONBOARDED_DEFAULT: object = object()


async def seed_user(
    session: AsyncSession,
    *,
    tg_user_id: int,
    tg_chat_id: Optional[int] = None,
    role: UserRole = UserRole.owner,
    cycle_start_day: int = 5,
    onboarded_at=_ONBOARDED_DEFAULT,
    pro_active_until: Optional[datetime] = None,
    trial_ends_at: Optional[datetime] = None,
) -> AppUser:
    """Seed an AppUser row.

    Tier (Phase 35 / 68-01): the user defaults to **free** tier
    (``pro_active_until`` / ``trial_ends_at`` both NULL) so existing callers
    are unchanged. Pass a future ``pro_active_until`` (paid Pro) or
    ``trial_ends_at`` (reverse-trial) to mint a **Pro** user — required by the
    AI spend-cap tests, which gate behind ``require_pro`` (402) BEFORE
    ``enforce_spending_cap`` (429). A free user trips the 402 before the cap is
    ever evaluated; a Pro user reaches the 429 cap path. See
    ``app/services/tier.py::is_pro``.
    """
    if onboarded_at is _ONBOARDED_DEFAULT:
        onboarded_at = datetime.now(timezone.utc)
    user = AppUser(
        tg_user_id=tg_user_id,
        tg_chat_id=tg_chat_id,
        role=role,
        cycle_start_day=cycle_start_day,
        onboarded_at=onboarded_at,
        pro_active_until=pro_active_until,
        trial_ends_at=trial_ends_at,
    )
    session.add(user)
    await session.flush()
    return user


# Process-wide monotonic counter for collision-resistant ``code`` defaults.
# A2 (Phase 68): ``Category.code`` is a NOT-NULL ``String(40)`` slug under a
# partial-unique index ``uq_category_user_code`` on ``(user_id, code) WHERE NOT
# is_archived``. Two active categories for the SAME user can legitimately share
# a ``sort_order`` (e.g. both default 0), so deriving ``code`` from ``sort_order``
# (the old anti-pattern ``f"c{sort_order}"``) would collide on that index.
# A monotonic counter guarantees uniqueness across repeated ``seed_category``
# calls for one user within a test. The counter starts at 1 so the very first
# call gets a non-zero suffix.
_CODE_COUNTER = itertools.count(1)


def _default_code(name: str) -> str:
    """Derive a collision-resistant slug for the NOT-NULL ``code`` column.

    Slugify ``name`` (lowercase ASCII-ish, non-alnum → '-') and append a
    process-wide monotonic suffix so two same-named active categories for one
    user never collide on ``uq_category_user_code``. Truncated to String(40).
    """
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "cat"
    suffix = f"-{next(_CODE_COUNTER)}"
    # Keep the suffix; truncate the base so the whole slug fits String(40).
    base = base[: 40 - len(suffix)]
    return f"{base}{suffix}"


def _default_ord(sort_order: int) -> str:
    """Derive a valid 2-digit ``ord`` matching the DB CHECK ``^[0-9]{2}$``.

    Clamp ``sort_order`` into 00..99 so any test ``sort_order`` (incl. 0 or
    values > 99 like the e2e ``sort_order=10``) yields a schema-valid ordinal.
    """
    return f"{max(0, min(sort_order, 99)):02d}"


async def seed_category(
    session: AsyncSession,
    *,
    user_id: int,
    name: str = "Тест",
    kind: CategoryKind = CategoryKind.expense,
    is_archived: bool = False,
    sort_order: int = 0,
    code: Optional[str] = None,
    ord: Optional[str] = None,
) -> Category:
    """Seed a Category row, populating the NOT-NULL ``code`` + ``ord`` columns.

    A2 (Phase 68 systemic fix): ``Category.code`` (``String(40)`` slug) and
    ``Category.ord`` (``String(2)``, DB CHECK ``^[0-9]{2}$``) are both NOT NULL.
    Callers historically worked around this with inline hacks (e.g.
    ``code="coffee", ord="00"`` or raw ``Category(...)`` constructors). This
    helper now supplies sensible, schema-valid auto-defaults so **no future
    test needs an inline seed hack**:

      - ``code``: when None → a collision-resistant slugified-name + monotonic
        suffix (NOT ``sort_order``-derived — that collides on the partial-unique
        ``(user_id, code) WHERE NOT is_archived`` index when one user has two
        active categories sharing a sort_order). Unique across repeated calls.
      - ``ord``: when None → ``sort_order`` clamped to 00..99 as a 2-digit
        string (satisfies ``ck_category_ord_format``).

    Pass ``code`` / ``ord`` explicitly only when a test asserts a specific
    value; otherwise rely on the defaults.
    """
    c = Category(
        user_id=user_id, name=name, kind=kind,
        is_archived=is_archived, sort_order=sort_order,
        code=code if code is not None else _default_code(name),
        ord=ord if ord is not None else _default_ord(sort_order),
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
):
    """DEPRECATED: ``plan_template_item`` table dropped in Phase 22 (alembic 0013).

    The v1.0 model uses ``Category.plan_cents`` as the per-category monthly
    plan source-of-truth (CONTEXT D-02). This helper is kept as a stub that
    raises ``NotImplementedError`` so legacy tests that imported it surface
    a clear failure rather than silently inserting nothing.

    Tests that need to set a category plan should update
    ``Category.plan_cents`` directly instead.
    """
    raise NotImplementedError(
        "seed_plan_template_item: plan_template_item table was dropped in "
        "Phase 22 (alembic 0013). Use Category.plan_cents instead — "
        "category.plan_cents = amount_cents."
    )


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


async def seed_two_role_tenants(
    session: AsyncSession,
    *,
    owner_tg_user_id: int,
    member_tg_user_id: int,
) -> dict[str, int]:
    """Seed an owner + a member in one session, return their PK ids.

    Used by Phase 13 admin RBAC tests where we need:
      - owner row to authenticate as caller of /api/v1/admin/*
      - member row that the caller will list / invite / revoke

    Both users have onboarded_at = NULL (Phase 14 will fill it).
    """
    owner = await seed_user(
        session,
        tg_user_id=owner_tg_user_id,
        role=UserRole.owner,
        cycle_start_day=5,
        onboarded_at=None,
    )
    member = await seed_user(
        session,
        tg_user_id=member_tg_user_id,
        role=UserRole.member,
        cycle_start_day=5,
        onboarded_at=None,
    )
    await session.commit()
    return {
        "owner_id": owner.id,
        "member_id": member.id,
        "owner_tg_user_id": owner_tg_user_id,
        "member_tg_user_id": member_tg_user_id,
    }


async def seed_member_not_onboarded(
    session: AsyncSession,
    *,
    tg_user_id: int,
    tg_chat_id: Optional[int] = None,
) -> AppUser:
    """Seed a member with onboarded_at=None (Phase 14 invite-flow target).

    Used by Phase 14 RED tests (test_require_onboarded.py,
    test_embedding_backfill.py) to construct the precise pre-onboarding
    state: role=member, tg_chat_id may or may not be bound, onboarded_at
    is NULL → require_onboarded gate fires.
    """
    user = AppUser(
        tg_user_id=tg_user_id,
        tg_chat_id=tg_chat_id,
        role=UserRole.member,
        cycle_start_day=5,
        onboarded_at=None,
    )
    session.add(user)
    await session.flush()
    return user


async def seed_ai_usage_log(
    session: AsyncSession,
    *,
    user_id: int,
    model: str = "gpt-4o-mini",
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    cached_tokens: int = 0,
    total_tokens: int = 0,
    est_cost_usd: float | None = None,
    cost_cents: int | None = None,
    ts: Optional[datetime] = None,
) -> None:
    """Insert a single ai_usage_log row via raw SQL (no ORM dependency).

    Phase 13 Plan 13-02 creates the ai_usage_log table; Plan 13-03 wires
    the SQLAlchemy model. This helper uses sqlalchemy.text() to stay
    decoupled from import-time model loading order during RED phase.

    Phase 67 R8: the ``est_cost_usd`` Float column was migrated to
    ``cost_cents`` (BIGINT, USD-копейки). This helper now writes ``cost_cents``.
    Legacy callers passing ``est_cost_usd`` are still supported — the USD value
    is converted to cents via ``ceil(usd * 100)`` (matching the production
    write-path), so historical per-row expectations hold under the new
    direct-cents aggregation. Pass ``cost_cents`` directly to be explicit.

    ts: when None, defaults to now(UTC). Caller passes explicit ts to
    produce records inside / outside current month + 30d windows for
    the admin /ai-usage breakdown tests.
    """
    import math

    from sqlalchemy import text

    if cost_cents is None:
        cents = math.ceil(float(est_cost_usd or 0.0) * 100.0)
    else:
        cents = int(cost_cents)

    when = ts or datetime.now(timezone.utc)
    await session.execute(
        text(
            "INSERT INTO ai_usage_log "
            "(user_id, model, prompt_tokens, completion_tokens, "
            " cached_tokens, total_tokens, cost_cents, created_at) "
            "VALUES (:user_id, :model, :pt, :ct, :ch, :tt, :cc, :ts)"
        ),
        {
            "user_id": user_id,
            "model": model,
            "pt": prompt_tokens,
            "ct": completion_tokens,
            "ch": cached_tokens,
            "tt": total_tokens,
            "cc": cents,
            "ts": when,
        },
    )
    await session.commit()


# Phase 22 (plan 22.13): ``plan_template_item`` table was dropped in alembic
# 0013 (CONTEXT D-02). Removed from truncate sets so TRUNCATE doesn't fail with
# "relation does not exist" against post-22 schema. Phase-22 v1.0 tables
# (account, goal, savings_config) added so phase-23+ tests can rely on a clean
# slate without seeding around stale rows.
_DEFAULT_TRUNCATE_TABLES = (
    "savings_config, goal, account, "
    "category, planned_transaction, actual_transaction, "
    "subscription, budget_period, ai_message, ai_conversation, "
    "category_embedding, app_user"
)

_PHASE13_TRUNCATE_TABLES = (
    "savings_config, goal, account, "
    "category, planned_transaction, actual_transaction, "
    "subscription, budget_period, ai_message, ai_conversation, "
    "category_embedding, ai_usage_log, app_user"
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


async def truncate_db_phase13() -> None:
    """Phase 13 variant: includes ai_usage_log table in truncate set.

    Used by tests/test_admin_users_api.py and tests/test_admin_ai_usage_api.py
    which seed ai_usage_log rows. Will fail with ProgrammingError until
    Plan 13-02 creates the ai_usage_log table — that is by design (RED phase).
    """
    await truncate_db(tables=_PHASE13_TRUNCATE_TABLES)
