"""BE-16 acceptance gate: RLS + composite-FK integration suite (Phase 22, plan 22.15).

Mirror of ``tests/test_multitenancy_isolation.py`` (Phase 11) extended for the
v1.0 surface added by Phase 22:

  • New RLS-protected tables: ``account``, ``goal``, ``savings_config``
    (policies ``tenant_isolation_<table>``, alembic 0012/0014/0015).
  • Composite FK ``category(parent_id, user_id) → category(id, user_id)``
    (alembic 0013, ``fk_category_parent_composite``).
  • Composite FK ``actual_transaction(parent_txn_id, user_id) → (id, user_id)``
    (alembic 0015, ``fk_actual_parent_txn_composite``).

Two-session architecture
------------------------
RLS does NOT enforce against SUPERUSER roles. The test conftest promotes
``ADMIN_DATABASE_URL`` → ``DATABASE_URL`` so the standard ``db_session`` fixture
runs as the SUPERUSER ``budget`` (needed by tests that TRUNCATE / bypass RLS
for seed data). To verify RLS policies *actually enforce* we open a second,
NOSUPERUSER NOBYPASSRLS session via the original runtime URL (preserved as
``RUNTIME_DATABASE_URL``). All RLS read / write isolation tests use this
``runtime_session``; ``db_session`` is kept for admin-side seeding only.

The meta-test ``test_v10_rls_runs_under_budget_app_role`` asserts the
runtime session is in fact ``budget_app`` — without it, the suite would
silently pass via SUPERUSER bypass.

Sections
--------
  A. RLS policy presence            (4 tests; pg_policy probe via admin session)
  B. RLS read isolation             (3 tests; SELECT under user A scope)
  C. RLS write isolation            (3 tests; UPDATE / DELETE / INSERT)
  D. Composite FK cross-tenant      (4 tests; parent_id / parent_txn_id)
  E. RLS bypass attempt             (1 test; explicit user_id WHERE)
  F. Cross-table consistency        (1 meta-test; current_user assertion)

Acceptance: this file's exit code is the BE-16 gate.
"""
from __future__ import annotations

import os
from datetime import date, datetime, timezone

import pytest
import pytest_asyncio
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError, IntegrityError, ProgrammingError
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)


pytestmark = pytest.mark.asyncio


# ---------------------------------------------------------------------------
# Helpers — self-contained fixtures.
#
# Why not reuse ``two_tenants`` from conftest? That fixture seeds Category
# without v1.0 NOT NULL columns (``code``, ``ord``) and currently fails on
# the v1.0 schema (see test_postgres_role_runtime collection error). We seed
# only what each test needs and clean up symmetrically.
# ---------------------------------------------------------------------------


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set — integration test requires DB")


async def _truncate_v1_tables(session: AsyncSession) -> None:
    """Truncate v1.0 domain tables in FK-safe order. Bypasses RLS via row_security=off."""
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


async def _seed_user(session: AsyncSession, *, tg_user_id: int) -> int:
    """Insert AppUser via ORM, return its PK id."""
    from app.db.models import AppUser, UserRole

    user = AppUser(
        tg_user_id=tg_user_id,
        role=UserRole.member,
        cycle_start_day=5,
        onboarded_at=datetime.now(timezone.utc),
    )
    session.add(user)
    await session.flush()
    await session.commit()
    return user.id


@pytest_asyncio.fixture
async def two_v10_users(db_session):
    """Truncate v1.0 tables, seed two AppUsers, yield {a_id, b_id}.

    Tests then seed v1.0 domain rows (Account/Goal/SavingsConfig/Category/
    ActualTransaction) per scenario — keeps each test self-describing.
    """
    _require_db()
    await _truncate_v1_tables(db_session)
    a_id = await _seed_user(db_session, tg_user_id=9_000_022_150)
    b_id = await _seed_user(db_session, tg_user_id=9_000_022_151)
    yield {"a_id": a_id, "b_id": b_id}


@pytest_asyncio.fixture
async def admin_session():
    """AsyncSession via ADMIN_DATABASE_URL (privileged role) for pg_catalog probes.

    pg_policy / pg_class meta-queries from ``budget_app`` may be subject to
    role-permission gotchas; using the admin URL guarantees catalog reads
    succeed regardless of grants on the runtime role. Falls back to
    ``DATABASE_URL`` if ``ADMIN_DATABASE_URL`` is unset (single-role envs).
    """
    _require_db()
    admin_url = os.environ.get("ADMIN_DATABASE_URL") or os.environ["DATABASE_URL"]
    engine = create_async_engine(admin_url, echo=False, pool_pre_ping=True)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with Session() as sess:
            yield sess
            await sess.rollback()
    finally:
        await engine.dispose()


@pytest_asyncio.fixture
async def runtime_session():
    """AsyncSession via RUNTIME_DATABASE_URL (NOSUPERUSER NOBYPASSRLS).

    conftest.py promotes ADMIN_DATABASE_URL → DATABASE_URL for general test
    convenience; the original runtime URL is preserved as RUNTIME_DATABASE_URL.
    All RLS-enforcement tests in this module need a non-superuser session
    because Postgres unconditionally bypasses RLS for SUPERUSER (even with
    FORCE ROW LEVEL SECURITY). Falls back to DATABASE_URL when RUNTIME is
    unset (single-role envs) — the suite then relies on the meta-test to
    fail loudly if that session also turns out to be SUPERUSER.
    """
    _require_db()
    runtime_url = (
        os.environ.get("RUNTIME_DATABASE_URL") or os.environ["DATABASE_URL"]
    )
    engine = create_async_engine(runtime_url, echo=False, pool_pre_ping=True)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with Session() as sess:
            try:
                yield sess
            finally:
                await sess.rollback()
    finally:
        await engine.dispose()


async def _seed_account(
    session: AsyncSession,
    *,
    user_id: int,
    bank: str,
    balance_cents: int,
    is_primary: bool = True,
) -> int:
    """Insert Account via admin session (RLS bypass), return id."""
    from app.db.models import Account, AccountKind
    from sqlalchemy import text as _text

    # Use admin path: row_security off — seed regardless of GUC.
    await session.execute(_text("SET LOCAL row_security = off"))
    acct = Account(
        user_id=user_id,
        bank=bank,
        kind=AccountKind.card,
        balance_cents=balance_cents,
        is_primary=is_primary,
    )
    session.add(acct)
    await session.flush()
    await session.commit()
    await session.refresh(acct)
    return acct.id


# ---------------------------------------------------------------------------
# Section A: RLS policy presence
# ---------------------------------------------------------------------------


async def test_account_has_tenant_isolation_policy(admin_session):
    """BE-16: pg_policy contains ``tenant_isolation_account`` on table account."""
    result = await admin_session.execute(
        text("SELECT polname FROM pg_policy WHERE polrelid = 'account'::regclass")
    )
    names = {r[0] for r in result.all()}
    assert "tenant_isolation_account" in names, (
        f"Expected tenant_isolation_account policy on account; got {names}"
    )


async def test_goal_has_tenant_isolation_policy(admin_session):
    """BE-16: pg_policy contains ``tenant_isolation_goal`` on table goal."""
    result = await admin_session.execute(
        text("SELECT polname FROM pg_policy WHERE polrelid = 'goal'::regclass")
    )
    names = {r[0] for r in result.all()}
    assert "tenant_isolation_goal" in names, (
        f"Expected tenant_isolation_goal policy on goal; got {names}"
    )


async def test_savings_config_has_tenant_isolation_policy(admin_session):
    """BE-16: pg_policy contains ``tenant_isolation_savings_config`` on savings_config."""
    result = await admin_session.execute(
        text(
            "SELECT polname FROM pg_policy "
            "WHERE polrelid = 'savings_config'::regclass"
        )
    )
    names = {r[0] for r in result.all()}
    assert "tenant_isolation_savings_config" in names, (
        f"Expected tenant_isolation_savings_config policy; got {names}"
    )


async def test_v10_tables_force_rls_enabled(admin_session):
    """BE-16: ENABLE + FORCE ROW LEVEL SECURITY set on all 3 v1.0 RLS tables."""
    for tbl in ("account", "goal", "savings_config"):
        result = await admin_session.execute(
            text(
                "SELECT relrowsecurity, relforcerowsecurity "
                "FROM pg_class WHERE relname = :t AND relkind = 'r'"
            ),
            {"t": tbl},
        )
        row = result.first()
        assert row is not None, f"pg_class missing entry for table {tbl}"
        rls, force_rls = row
        assert rls is True, f"{tbl}: ENABLE ROW LEVEL SECURITY missing"
        assert force_rls is True, f"{tbl}: FORCE ROW LEVEL SECURITY missing"


# ---------------------------------------------------------------------------
# Section B: RLS read isolation — A cannot SELECT B's rows
#
# Uses ``runtime_session`` (NOSUPERUSER NOBYPASSRLS) so RLS actually
# enforces. Seeding happens via ``db_session`` (admin/SUPERUSER) which
# bypasses RLS — that's what allows us to plant B's data in the first place.
# ---------------------------------------------------------------------------


async def test_user_a_cannot_select_user_b_accounts(
    db_session, runtime_session, two_v10_users
):
    """A under set_tenant_scope=A.id sees zero of B's account rows."""
    from app.db.session import set_tenant_scope

    a_id, b_id = two_v10_users["a_id"], two_v10_users["b_id"]

    # Seed B's account via admin session (RLS bypass).
    await _seed_account(db_session, user_id=b_id, bank="B-bank", balance_cents=12345)

    # Query under A's scope via runtime (NOSUPERUSER) session.
    await set_tenant_scope(runtime_session, a_id)
    result = await runtime_session.execute(
        text("SELECT user_id FROM account")
    )
    visible_user_ids = {row[0] for row in result.all()}
    assert b_id not in visible_user_ids, (
        f"Cross-tenant leak: A sees account rows belonging to B "
        f"(user_ids visible: {visible_user_ids})"
    )
    assert visible_user_ids.issubset({a_id})


async def test_user_a_cannot_select_user_b_goals(
    db_session, runtime_session, two_v10_users
):
    """A under set_tenant_scope=A.id sees zero of B's goal rows."""
    from app.db.models import Goal
    from app.db.session import set_tenant_scope

    a_id, b_id = two_v10_users["a_id"], two_v10_users["b_id"]

    # Seed B's goal via admin session.
    await db_session.execute(text("SET LOCAL row_security = off"))
    db_session.add(
        Goal(user_id=b_id, name="Отпуск", target_cents=500000, current_cents=0)
    )
    await db_session.commit()

    await set_tenant_scope(runtime_session, a_id)
    result = await runtime_session.execute(text("SELECT user_id FROM goal"))
    visible_user_ids = {row[0] for row in result.all()}
    assert b_id not in visible_user_ids, (
        f"Cross-tenant leak: A sees goal rows of B (user_ids: {visible_user_ids})"
    )
    assert visible_user_ids.issubset({a_id})


async def test_user_a_cannot_select_user_b_savings_config(
    db_session, runtime_session, two_v10_users
):
    """A under set_tenant_scope=A.id sees zero of B's savings_config rows."""
    from app.db.models import SavingsConfig
    from app.db.session import set_tenant_scope

    a_id, b_id = two_v10_users["a_id"], two_v10_users["b_id"]

    await db_session.execute(text("SET LOCAL row_security = off"))
    db_session.add(
        SavingsConfig(user_id=b_id, roundup_enabled=True, roundup_base=10)
    )
    await db_session.commit()

    await set_tenant_scope(runtime_session, a_id)
    result = await runtime_session.execute(
        text("SELECT user_id FROM savings_config")
    )
    visible_user_ids = {row[0] for row in result.all()}
    assert b_id not in visible_user_ids, (
        f"Cross-tenant leak: A sees savings_config rows of B "
        f"(user_ids: {visible_user_ids})"
    )


# ---------------------------------------------------------------------------
# Section C: RLS write isolation — A cannot UPDATE/DELETE/INSERT for B
# ---------------------------------------------------------------------------


async def test_user_a_cannot_update_user_b_account(
    db_session, runtime_session, two_v10_users
):
    """A's UPDATE … WHERE id = B.account.id under A's scope affects 0 rows.

    RLS USING-clause hides B's row from A → UPDATE matches nothing →
    rowcount == 0, B's balance unchanged.
    """
    from app.db.session import set_tenant_scope

    a_id, b_id = two_v10_users["a_id"], two_v10_users["b_id"]

    # Seed B's account via admin session.
    b_acct_id = await _seed_account(
        db_session, user_id=b_id, bank="B-bank", balance_cents=10000
    )

    # A tries to UPDATE B's row via the runtime (NOSUPERUSER) session.
    await set_tenant_scope(runtime_session, a_id)
    result = await runtime_session.execute(
        text("UPDATE account SET balance_cents = 99999 WHERE id = :acct_id"),
        {"acct_id": b_acct_id},
    )
    await runtime_session.commit()
    assert result.rowcount == 0, (
        f"RLS failure: A updated B's account row (rowcount={result.rowcount})"
    )

    # Verify B's row unchanged via admin session (read-anywhere).
    await db_session.execute(text("SET LOCAL row_security = off"))
    refreshed = (
        await db_session.execute(
            text("SELECT balance_cents FROM account WHERE id = :acct_id"),
            {"acct_id": b_acct_id},
        )
    ).scalar_one()
    assert refreshed == 10000, (
        f"B's balance was mutated cross-tenant: {refreshed}"
    )


async def test_user_a_cannot_delete_user_b_account(
    db_session, runtime_session, two_v10_users
):
    """A's DELETE … WHERE id = B.account.id under A's scope affects 0 rows."""
    from app.db.session import set_tenant_scope

    a_id, b_id = two_v10_users["a_id"], two_v10_users["b_id"]

    b_acct_id = await _seed_account(
        db_session, user_id=b_id, bank="B-bank", balance_cents=42000
    )

    await set_tenant_scope(runtime_session, a_id)
    result = await runtime_session.execute(
        text("DELETE FROM account WHERE id = :acct_id"),
        {"acct_id": b_acct_id},
    )
    await runtime_session.commit()
    assert result.rowcount == 0, (
        f"RLS failure: A deleted B's account (rowcount={result.rowcount})"
    )

    # Confirm via admin session.
    await db_session.execute(text("SET LOCAL row_security = off"))
    still_there = (
        await db_session.execute(
            text("SELECT 1 FROM account WHERE id = :acct_id"),
            {"acct_id": b_acct_id},
        )
    ).first()
    assert still_there is not None, "B's account was deleted cross-tenant"


async def test_user_a_cannot_insert_account_for_user_b(
    runtime_session, two_v10_users
):
    """A under scope=A tries INSERT account with user_id=B → RLS WITH CHECK rejects.

    Postgres raises ``new row violates row-level security policy`` —
    surfaces as ``ProgrammingError`` (asyncpg/InsufficientPrivilegeError) in
    SQLAlchemy. Use raw SQL so we control the user_id explicitly without
    ORM defaulting it.
    """
    a_id, b_id = two_v10_users["a_id"], two_v10_users["b_id"]
    from app.db.session import set_tenant_scope

    await set_tenant_scope(runtime_session, a_id)
    with pytest.raises((ProgrammingError, IntegrityError, DBAPIError)):
        await runtime_session.execute(
            text(
                "INSERT INTO account "
                "(user_id, bank, kind, balance_cents, \"primary\") "
                "VALUES (:uid, 'evil', 'card', 0, false)"
            ),
            {"uid": b_id},
        )
        await runtime_session.flush()
    await runtime_session.rollback()


# ---------------------------------------------------------------------------
# Section D: composite FK — cross-tenant linkage rejected
# ---------------------------------------------------------------------------


async def _seed_category(
    session: AsyncSession,
    *,
    user_id: int,
    name: str,
    code: str,
    ord_: str = "10",
) -> int:
    """Insert a Category row with all v1.0 NOT NULL columns. Returns id."""
    from app.db.models import CategoryKind
    from app.db.session import set_tenant_scope
    from tests.helpers.seed import seed_category

    await set_tenant_scope(session, user_id)
    # 68-05: route through seed_category (authoritative for code/ord). The model
    # defaults (plan_cents=0, rollover=misc, paused=False) match the previous
    # explicit values, so this is value-preserving.
    cat = await seed_category(
        session,
        user_id=user_id,
        name=name,
        kind=CategoryKind.expense,
        sort_order=int(ord_),
        code=code,
        ord=ord_,
    )
    await session.commit()
    await session.refresh(cat)
    return cat.id


async def test_category_parent_id_rejects_cross_tenant(
    db_session, two_v10_users
):
    """BE-16: composite FK on (parent_id, user_id) blocks A from referencing B's cat.

    A inserts a category with parent_id pointing at B's category id.
    Even if the row's user_id = A.id, the composite FK target
    (parent_id, user_id) → (id, user_id) does not match any (B.id, A.id)
    pair in the parent table → ForeignKeyViolation.
    """
    a_id, b_id = two_v10_users["a_id"], two_v10_users["b_id"]

    # Seed parent category for B.
    b_cat_id = await _seed_category(
        db_session, user_id=b_id, name="B-parent", code="b_parent", ord_="10"
    )

    # A tries to insert a child pointing at B's parent.
    from app.db.session import set_tenant_scope

    await set_tenant_scope(db_session, a_id)
    with pytest.raises((IntegrityError, DBAPIError)):
        await db_session.execute(
            text(
                "INSERT INTO category "
                "(name, kind, is_archived, sort_order, user_id, plan_cents, "
                "code, ord, rollover, paused, parent_id) "
                "VALUES "
                "(:name, 'expense'::category_kind, false, 11, :uid, 0, "
                ":code, '11', 'misc', false, :pid)"
            ),
            {
                "name": "A-child",
                "uid": a_id,
                "code": "a_child",
                "pid": b_cat_id,
            },
        )
        await db_session.flush()
    await db_session.rollback()


async def test_category_parent_id_within_same_tenant_succeeds(
    db_session, two_v10_users
):
    """BE-16 sanity: composite FK allows parent linkage within the same tenant."""
    a_id = two_v10_users["a_id"]

    parent_id = await _seed_category(
        db_session, user_id=a_id, name="A-parent", code="a_parent_ok", ord_="20"
    )

    from app.db.session import set_tenant_scope

    await set_tenant_scope(db_session, a_id)
    result = await db_session.execute(
        text(
            "INSERT INTO category "
            "(name, kind, is_archived, sort_order, user_id, plan_cents, "
            "code, ord, rollover, paused, parent_id) "
            "VALUES "
            "(:name, 'expense'::category_kind, false, 21, :uid, 0, "
            ":code, '21', 'misc', false, :pid) "
            "RETURNING id"
        ),
        {
            "name": "A-child-ok",
            "uid": a_id,
            "code": "a_child_ok",
            "pid": parent_id,
        },
    )
    child_id = result.scalar_one()
    await db_session.commit()
    assert child_id > 0


async def _seed_period(
    session: AsyncSession, *, user_id: int
) -> int:
    """Insert a BudgetPeriod for user; returns id."""
    from app.db.models import BudgetPeriod, PeriodStatus
    from app.db.session import set_tenant_scope

    await set_tenant_scope(session, user_id)
    period = BudgetPeriod(
        user_id=user_id,
        period_start=date(2026, 5, 1),
        period_end=date(2026, 5, 31),
        starting_balance_cents=0,
        status=PeriodStatus.active,
    )
    session.add(period)
    await session.flush()
    await session.commit()
    await session.refresh(period)
    return period.id


async def _seed_actual_txn(
    session: AsyncSession,
    *,
    user_id: int,
    period_id: int,
    category_id: int,
    amount_cents: int = -1000,
) -> int:
    """Insert an ActualTransaction; returns id."""
    from app.db.models import ActualKind, ActualSource, ActualTransaction
    from app.db.session import set_tenant_scope

    await set_tenant_scope(session, user_id)
    txn = ActualTransaction(
        user_id=user_id,
        period_id=period_id,
        kind=ActualKind.expense,
        amount_cents=amount_cents,
        category_id=category_id,
        tx_date=date(2026, 5, 10),
        source=ActualSource.mini_app,
    )
    session.add(txn)
    await session.flush()
    await session.commit()
    await session.refresh(txn)
    return txn.id


async def test_actual_parent_txn_id_rejects_cross_tenant(
    db_session, two_v10_users
):
    """BE-16: composite FK on (parent_txn_id, user_id) blocks cross-tenant child.

    Mirrors the category test: A creates an ActualTransaction with
    parent_txn_id pointing at B's transaction. (parent_txn_id, A.id) does
    not match (B.txn_id, B.id) in the target → ForeignKeyViolation.
    """
    a_id, b_id = two_v10_users["a_id"], two_v10_users["b_id"]

    # Build B's stack: category → period → expense txn.
    b_cat_id = await _seed_category(
        db_session, user_id=b_id, name="B-cat", code="b_cat_x", ord_="10"
    )
    b_period_id = await _seed_period(db_session, user_id=b_id)
    b_txn_id = await _seed_actual_txn(
        db_session,
        user_id=b_id,
        period_id=b_period_id,
        category_id=b_cat_id,
        amount_cents=-1500,
    )

    # Build A's stack so the INSERT has valid (period_id, category_id) for A.
    a_cat_id = await _seed_category(
        db_session, user_id=a_id, name="A-cat", code="a_cat_x", ord_="10"
    )
    a_period_id = await _seed_period(db_session, user_id=a_id)

    # A inserts a roundup-style child with parent_txn_id = B's txn id.
    from app.db.session import set_tenant_scope

    await set_tenant_scope(db_session, a_id)
    with pytest.raises((IntegrityError, DBAPIError)):
        await db_session.execute(
            text(
                "INSERT INTO actual_transaction "
                "(period_id, kind, amount_cents, category_id, tx_date, "
                " source, user_id, parent_txn_id) "
                "VALUES "
                "(:pid, 'roundup'::actualkind, -50, :cid, '2026-05-10', "
                " 'mini_app'::actualsource, :uid, :ptid)"
            ),
            {
                "pid": a_period_id,
                "cid": a_cat_id,
                "uid": a_id,
                "ptid": b_txn_id,
            },
        )
        await db_session.flush()
    await db_session.rollback()


async def test_actual_parent_txn_id_within_same_tenant_succeeds(
    db_session, two_v10_users
):
    """BE-16 sanity: composite FK allows parent_txn_id link within the same tenant."""
    a_id = two_v10_users["a_id"]

    a_cat_id = await _seed_category(
        db_session, user_id=a_id, name="A-cat-ok", code="a_cat_ok", ord_="11"
    )
    a_period_id = await _seed_period(db_session, user_id=a_id)
    parent_txn_id = await _seed_actual_txn(
        db_session,
        user_id=a_id,
        period_id=a_period_id,
        category_id=a_cat_id,
        amount_cents=-1234,
    )

    from app.db.session import set_tenant_scope

    await set_tenant_scope(db_session, a_id)
    result = await db_session.execute(
        text(
            "INSERT INTO actual_transaction "
            "(period_id, kind, amount_cents, category_id, tx_date, "
            " source, user_id, parent_txn_id) "
            "VALUES "
            "(:pid, 'roundup'::actualkind, -66, :cid, '2026-05-10', "
            " 'mini_app'::actualsource, :uid, :ptid) "
            "RETURNING id"
        ),
        {
            "pid": a_period_id,
            "cid": a_cat_id,
            "uid": a_id,
            "ptid": parent_txn_id,
        },
    )
    child_id = result.scalar_one()
    await db_session.commit()
    assert child_id > 0


# ---------------------------------------------------------------------------
# Section E: explicit user_id in WHERE does NOT bypass RLS
# ---------------------------------------------------------------------------


async def test_explicit_user_id_in_where_does_not_bypass_rls(
    db_session, runtime_session, two_v10_users
):
    """SELECT * FROM account WHERE user_id = B.id under A's scope returns 0 rows.

    Proves the RLS GUC, not the WHERE clause, drives isolation. An attacker
    knowing B's id cannot use it to query B's data — the RLS USING-clause
    filters BEFORE the WHERE applies.
    """
    from app.db.session import set_tenant_scope

    a_id, b_id = two_v10_users["a_id"], two_v10_users["b_id"]

    await _seed_account(db_session, user_id=b_id, bank="B-bank", balance_cents=999)

    await set_tenant_scope(runtime_session, a_id)
    result = await runtime_session.execute(
        text("SELECT count(*) FROM account WHERE user_id = :uid"),
        {"uid": b_id},
    )
    count = result.scalar_one()
    assert count == 0, (
        f"RLS bypass: explicit WHERE user_id=B returned {count} rows from A's scope"
    )


# ---------------------------------------------------------------------------
# Section F: meta-test — verify role context is non-superuser
# ---------------------------------------------------------------------------


async def test_v10_rls_runs_under_budget_app_role(runtime_session):
    """Meta-check: runtime_session must run under budget_app (NOSUPERUSER NOBYPASSRLS).

    Without this guard the rest of the suite would pass trivially via SUPERUSER
    bypass. Plan 12-05 (D-11-07-02) introduced the runtime role split — the
    runtime URL points at budget_app. If anyone ever points it at the admin
    superuser role, RLS would silently stop enforcing and isolation tests
    would lie. This test fails fast.
    """
    result = await runtime_session.execute(
        text(
            "SELECT current_user, rolsuper, rolbypassrls "
            "FROM pg_roles WHERE rolname = current_user"
        )
    )
    row = result.one()
    current_user, rolsuper, rolbypassrls = row[0], row[1], row[2]
    assert current_user == "budget_app", (
        f"Tests must run as 'budget_app' for RLS to enforce; got {current_user!r}. "
        "Check RUNTIME_DATABASE_URL points at the runtime role, not admin."
    )
    assert rolsuper is False, (
        f"runtime role must be NOSUPERUSER (got rolsuper={rolsuper})"
    )
    assert rolbypassrls is False, (
        f"runtime role must be NOBYPASSRLS (got rolbypassrls={rolbypassrls})"
    )
