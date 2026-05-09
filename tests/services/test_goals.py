"""Service tests for app/services/goals.py (Phase 22, Plan 22.08).

Covers BE-11 (Goal CRUD).

Service contract (per PLAN.md):
- list_goals(db, *, user_id) -> list[Goal]
- get_or_404(db, goal_id, *, user_id) -> Goal
- get_goal(db, *, user_id, goal_id) -> Goal | None  (non-raising sibling)
- create_goal(db, *, user_id, name, target_cents, due=None) -> Goal
- update_goal(db, goal_id, *, user_id, **fields) -> Goal
- delete_goal(db, goal_id, *, user_id) -> Goal

Validators (DATA-MODEL §6, raised as ``GoalValidationError`` ⊂ ValueError):
- target_cents > 0
- name length ∈ [1, 80]
- due > today (Europe/Moscow) if set

DB-backed: requires DATABASE_URL pointing at v1.0 schema HEAD
(0016_v10_actual_account_id). Self-skips otherwise.
"""
from __future__ import annotations

import os
from datetime import date, datetime, timedelta, timezone

import pytest
import pytest_asyncio


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set — skipping DB-backed test")


# ---------- Fixtures (self-contained) ----------


async def _truncate_v1_tables(session):
    from sqlalchemy import text

    await session.execute(text("RESET ROLE"))
    await session.execute(text("SET LOCAL row_security = off"))
    for tbl in (
        "ai_message",
        "ai_conversation",
        "category_embedding",
        "actual_transaction",
        "planned_transaction",
        "subscription",
        "savings_config",
        "goal",
        "account",
        "budget_period",
        "category",
        "auth_token",
        "ai_usage_log",
        "app_user",
    ):
        await session.execute(text(f"DELETE FROM {tbl}"))
    await session.commit()


async def _seed_user(session, *, tg_user_id: int):
    from app.db.models import AppUser, UserRole

    user = AppUser(
        tg_user_id=tg_user_id,
        role=UserRole.owner,
        cycle_start_day=5,
        onboarded_at=datetime.now(timezone.utc),
    )
    session.add(user)
    await session.flush()
    await session.commit()
    return user


@pytest_asyncio.fixture
async def owner_user(db_session):
    _require_db()
    await _truncate_v1_tables(db_session)
    user = await _seed_user(db_session, tg_user_id=9_000_011_001)
    yield {"id": user.id, "tg_user_id": user.tg_user_id}


@pytest_asyncio.fixture
async def two_users(db_session):
    _require_db()
    await _truncate_v1_tables(db_session)
    a = await _seed_user(db_session, tg_user_id=9_000_011_010)
    b = await _seed_user(db_session, tg_user_id=9_000_011_011)
    yield {"a_id": a.id, "b_id": b.id}


# =============================================================================
# Section 0: import sanity
# =============================================================================


@pytest.mark.asyncio
async def test_service_module_importable():
    """Sanity: module imports cleanly with all required symbols."""
    from app.services import goals as svc

    for name in (
        "list_goals",
        "get_goal",
        "get_or_404",
        "create_goal",
        "update_goal",
        "delete_goal",
        "GoalNotFoundError",
        "GoalValidationError",
    ):
        assert hasattr(svc, name), f"missing symbol: {name}"


# =============================================================================
# Section 1: create_goal — happy path + validators
# =============================================================================


@pytest.mark.asyncio
async def test_create_goal_with_valid_fields_succeeds(db_session, owner_user):
    """Valid inputs → row created with current_cents=0 default."""
    from app.db.session import set_tenant_scope
    from app.services.goals import create_goal

    await set_tenant_scope(db_session, owner_user["id"])
    g = await create_goal(
        db_session,
        user_id=owner_user["id"],
        name="Велосипед",
        target_cents=5_000_000,
    )
    assert g.id is not None
    assert g.user_id == owner_user["id"]
    assert g.name == "Велосипед"
    assert g.target_cents == 5_000_000
    assert g.current_cents == 0
    assert g.due is None


@pytest.mark.asyncio
async def test_create_goal_with_due_future_succeeds(db_session, owner_user):
    """due > today is OK."""
    from app.db.session import set_tenant_scope
    from app.services.goals import create_goal

    await set_tenant_scope(db_session, owner_user["id"])
    future = date.today() + timedelta(days=30)
    g = await create_goal(
        db_session,
        user_id=owner_user["id"],
        name="Отпуск",
        target_cents=10_000_000,
        due=future,
    )
    assert g.due == future


@pytest.mark.asyncio
async def test_create_goal_with_due_None_succeeds(db_session, owner_user):
    """due=None (omitted) is OK."""
    from app.db.session import set_tenant_scope
    from app.services.goals import create_goal

    await set_tenant_scope(db_session, owner_user["id"])
    g = await create_goal(
        db_session,
        user_id=owner_user["id"],
        name="Без срока",
        target_cents=100_000,
        due=None,
    )
    assert g.due is None


@pytest.mark.asyncio
async def test_create_goal_target_zero_raises_ValueError(db_session, owner_user):
    """target_cents=0 → ValueError (GoalValidationError ⊂ ValueError)."""
    from app.db.session import set_tenant_scope
    from app.services.goals import create_goal

    await set_tenant_scope(db_session, owner_user["id"])
    with pytest.raises(ValueError):
        await create_goal(
            db_session,
            user_id=owner_user["id"],
            name="X",
            target_cents=0,
        )


@pytest.mark.asyncio
async def test_create_goal_target_negative_raises(db_session, owner_user):
    """target_cents < 0 → ValueError."""
    from app.db.session import set_tenant_scope
    from app.services.goals import create_goal

    await set_tenant_scope(db_session, owner_user["id"])
    with pytest.raises(ValueError):
        await create_goal(
            db_session,
            user_id=owner_user["id"],
            name="X",
            target_cents=-100,
        )


@pytest.mark.asyncio
async def test_create_goal_name_too_long_raises(db_session, owner_user):
    """name length > 80 → ValueError."""
    from app.db.session import set_tenant_scope
    from app.services.goals import create_goal

    await set_tenant_scope(db_session, owner_user["id"])
    with pytest.raises(ValueError):
        await create_goal(
            db_session,
            user_id=owner_user["id"],
            name="x" * 81,
            target_cents=1000,
        )


@pytest.mark.asyncio
async def test_create_goal_name_empty_raises(db_session, owner_user):
    """name length 0 → ValueError."""
    from app.db.session import set_tenant_scope
    from app.services.goals import create_goal

    await set_tenant_scope(db_session, owner_user["id"])
    with pytest.raises(ValueError):
        await create_goal(
            db_session,
            user_id=owner_user["id"],
            name="",
            target_cents=1000,
        )


@pytest.mark.asyncio
async def test_create_goal_due_in_past_raises_ValueError(db_session, owner_user):
    """due < today → ValueError."""
    from app.db.session import set_tenant_scope
    from app.services.goals import create_goal

    await set_tenant_scope(db_session, owner_user["id"])
    past = date.today() - timedelta(days=1)
    with pytest.raises(ValueError):
        await create_goal(
            db_session,
            user_id=owner_user["id"],
            name="Прошлое",
            target_cents=1000,
            due=past,
        )


@pytest.mark.asyncio
async def test_create_goal_due_today_raises_ValueError(db_session, owner_user):
    """due == today → ValueError ("must be in the future")."""
    from app.db.session import set_tenant_scope
    from app.services.goals import create_goal

    await set_tenant_scope(db_session, owner_user["id"])
    with pytest.raises(ValueError):
        await create_goal(
            db_session,
            user_id=owner_user["id"],
            name="Сегодня",
            target_cents=1000,
            due=date.today(),
        )


@pytest.mark.asyncio
async def test_create_goal_name_at_boundary_80_chars_succeeds(
    db_session, owner_user
):
    """name length == 80 (boundary) → OK."""
    from app.db.session import set_tenant_scope
    from app.services.goals import create_goal

    await set_tenant_scope(db_session, owner_user["id"])
    g = await create_goal(
        db_session,
        user_id=owner_user["id"],
        name="x" * 80,
        target_cents=1000,
    )
    assert len(g.name) == 80


# =============================================================================
# Section 2: list_goals — tenant scoping + ordering
# =============================================================================


@pytest.mark.asyncio
async def test_list_goals_returns_empty_for_user_with_no_goals(
    db_session, owner_user
):
    from app.db.session import set_tenant_scope
    from app.services.goals import list_goals

    await set_tenant_scope(db_session, owner_user["id"])
    rows = await list_goals(db_session, user_id=owner_user["id"])
    assert rows == []


@pytest.mark.asyncio
async def test_list_goals_returns_all_for_user(db_session, owner_user):
    from app.db.session import set_tenant_scope
    from app.services.goals import create_goal, list_goals

    await set_tenant_scope(db_session, owner_user["id"])
    await create_goal(
        db_session, user_id=owner_user["id"], name="A", target_cents=100
    )
    await create_goal(
        db_session, user_id=owner_user["id"], name="B", target_cents=200
    )
    rows = await list_goals(db_session, user_id=owner_user["id"])
    names = [g.name for g in rows]
    assert names == ["A", "B"]  # ordered by created_at asc


@pytest.mark.asyncio
async def test_list_goals_scoped_to_user(db_session, two_users):
    """user_a does NOT see user_b's goals."""
    from app.db.models import Goal
    from app.db.session import set_tenant_scope
    from app.services.goals import list_goals

    db_session.add_all(
        [
            Goal(user_id=two_users["a_id"], name="A1", target_cents=100),
            Goal(user_id=two_users["a_id"], name="A2", target_cents=200),
            Goal(user_id=two_users["b_id"], name="B1", target_cents=300),
        ]
    )
    await db_session.flush()

    await set_tenant_scope(db_session, two_users["a_id"])
    rows = await list_goals(db_session, user_id=two_users["a_id"])
    assert {g.name for g in rows} == {"A1", "A2"}


# =============================================================================
# Section 3: get_or_404 / get_goal — tenant + miss handling
# =============================================================================


@pytest.mark.asyncio
async def test_get_or_404_returns_existing_goal(db_session, owner_user):
    from app.db.session import set_tenant_scope
    from app.services.goals import create_goal, get_or_404

    await set_tenant_scope(db_session, owner_user["id"])
    g = await create_goal(
        db_session, user_id=owner_user["id"], name="X", target_cents=100
    )
    fetched = await get_or_404(db_session, g.id, user_id=owner_user["id"])
    assert fetched.id == g.id


@pytest.mark.asyncio
async def test_get_or_404_missing_id_raises(db_session, owner_user):
    from app.db.session import set_tenant_scope
    from app.services.goals import GoalNotFoundError, get_or_404

    await set_tenant_scope(db_session, owner_user["id"])
    with pytest.raises(GoalNotFoundError):
        await get_or_404(db_session, 999_999, user_id=owner_user["id"])


@pytest.mark.asyncio
async def test_get_or_404_cross_tenant_returns_404(db_session, two_users):
    """user_b's goal lookup by user_a → GoalNotFoundError."""
    from app.db.models import Goal
    from app.db.session import set_tenant_scope
    from app.services.goals import GoalNotFoundError, get_or_404

    g_b = Goal(user_id=two_users["b_id"], name="B-only", target_cents=100)
    db_session.add(g_b)
    await db_session.flush()

    await set_tenant_scope(db_session, two_users["a_id"])
    with pytest.raises(GoalNotFoundError):
        await get_or_404(db_session, g_b.id, user_id=two_users["a_id"])


@pytest.mark.asyncio
async def test_get_goal_returns_none_on_miss(db_session, owner_user):
    """get_goal (non-raising) returns None for missing id."""
    from app.db.session import set_tenant_scope
    from app.services.goals import get_goal

    await set_tenant_scope(db_session, owner_user["id"])
    result = await get_goal(
        db_session, user_id=owner_user["id"], goal_id=999_999
    )
    assert result is None


# =============================================================================
# Section 4: update_goal — partial fields + re-validation
# =============================================================================


@pytest.mark.asyncio
async def test_update_goal_partial_fields(db_session, owner_user):
    """update_goal(name=…) leaves target_cents intact."""
    from app.db.session import set_tenant_scope
    from app.services.goals import create_goal, update_goal

    await set_tenant_scope(db_session, owner_user["id"])
    g = await create_goal(
        db_session,
        user_id=owner_user["id"],
        name="Old",
        target_cents=100_000,
    )
    updated = await update_goal(
        db_session, g.id, user_id=owner_user["id"], name="New"
    )
    assert updated.name == "New"
    assert updated.target_cents == 100_000  # unchanged


@pytest.mark.asyncio
async def test_update_goal_target_lower_than_current_allowed(
    db_session, owner_user
):
    """DATA-MODEL doesn't forbid lowering target below current — UI shows ≥100%."""
    from app.db.session import set_tenant_scope
    from app.services.goals import create_goal, update_goal

    await set_tenant_scope(db_session, owner_user["id"])
    g = await create_goal(
        db_session,
        user_id=owner_user["id"],
        name="X",
        target_cents=100_000,
    )
    g.current_cents = 80_000
    await db_session.flush()

    updated = await update_goal(
        db_session, g.id, user_id=owner_user["id"], target_cents=50_000
    )
    assert updated.target_cents == 50_000


@pytest.mark.asyncio
async def test_update_goal_invalid_target_raises(db_session, owner_user):
    """update_goal(target_cents=0) → ValueError."""
    from app.db.session import set_tenant_scope
    from app.services.goals import create_goal, update_goal

    await set_tenant_scope(db_session, owner_user["id"])
    g = await create_goal(
        db_session, user_id=owner_user["id"], name="X", target_cents=100
    )
    with pytest.raises(ValueError):
        await update_goal(
            db_session, g.id, user_id=owner_user["id"], target_cents=0
        )


@pytest.mark.asyncio
async def test_update_goal_due_in_past_raises(db_session, owner_user):
    """update_goal(due=<past>) → ValueError."""
    from app.db.session import set_tenant_scope
    from app.services.goals import create_goal, update_goal

    await set_tenant_scope(db_session, owner_user["id"])
    g = await create_goal(
        db_session, user_id=owner_user["id"], name="X", target_cents=100
    )
    with pytest.raises(ValueError):
        await update_goal(
            db_session,
            g.id,
            user_id=owner_user["id"],
            due=date.today() - timedelta(days=1),
        )


@pytest.mark.asyncio
async def test_update_goal_cross_tenant_404(db_session, two_users):
    """update_goal on cross-tenant id → GoalNotFoundError."""
    from app.db.models import Goal
    from app.db.session import set_tenant_scope
    from app.services.goals import GoalNotFoundError, update_goal

    g_b = Goal(user_id=two_users["b_id"], name="B-only", target_cents=100)
    db_session.add(g_b)
    await db_session.flush()

    await set_tenant_scope(db_session, two_users["a_id"])
    with pytest.raises(GoalNotFoundError):
        await update_goal(
            db_session,
            g_b.id,
            user_id=two_users["a_id"],
            name="hijacked",
        )


# =============================================================================
# Section 5: delete_goal
# =============================================================================


@pytest.mark.asyncio
async def test_delete_goal_deletes_row(db_session, owner_user):
    from sqlalchemy import select

    from app.db.models import Goal
    from app.db.session import set_tenant_scope
    from app.services.goals import create_goal, delete_goal

    await set_tenant_scope(db_session, owner_user["id"])
    g = await create_goal(
        db_session, user_id=owner_user["id"], name="X", target_cents=100
    )
    gid = g.id
    await delete_goal(db_session, gid, user_id=owner_user["id"])

    surviving = await db_session.scalar(select(Goal).where(Goal.id == gid))
    assert surviving is None


@pytest.mark.asyncio
async def test_delete_goal_cross_tenant_404(db_session, two_users):
    """delete_goal on cross-tenant id → GoalNotFoundError; row preserved."""
    from sqlalchemy import select

    from app.db.models import Goal
    from app.db.session import set_tenant_scope
    from app.services.goals import GoalNotFoundError, delete_goal

    g_b = Goal(user_id=two_users["b_id"], name="B-only", target_cents=100)
    db_session.add(g_b)
    await db_session.flush()
    gid = g_b.id

    await set_tenant_scope(db_session, two_users["a_id"])
    with pytest.raises(GoalNotFoundError):
        await delete_goal(db_session, gid, user_id=two_users["a_id"])

    # Verify the goal still exists for user_b.
    await set_tenant_scope(db_session, two_users["b_id"])
    survivor = await db_session.scalar(select(Goal).where(Goal.id == gid))
    assert survivor is not None


@pytest.mark.asyncio
async def test_delete_goal_missing_id_raises(db_session, owner_user):
    from app.db.session import set_tenant_scope
    from app.services.goals import GoalNotFoundError, delete_goal

    await set_tenant_scope(db_session, owner_user["id"])
    with pytest.raises(GoalNotFoundError):
        await delete_goal(db_session, 999_999, user_id=owner_user["id"])
