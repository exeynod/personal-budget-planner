"""Migration-safety acceptance tests for Phase 22 (BE-04, BE-05, BE-06, BE-08,
BE-11, BE-12, BE-14, BE-16) — alembic 0012-0016 chain.

Phase 22 plan 22.16 (final plan of Wave 4) — migration-safety gate.

This suite verifies, against a Postgres database that has already been brought
to ``alembic head`` by ``scripts/run-integration-tests.sh``, that:

  1. The DB ``alembic_version`` matches the migration scripts' head — read from
     ``ScriptDirectory.get_heads()`` (Этап 2 WI-3), not a hand-maintained
     allowlist.
  2. The forward chain 0011 → head landed every expected v1.0 schema artefact
     (tables, columns, enums, composite UNIQUE/FK, partial indexes).
  3. The data-backfill from 0013 (Category.code / .ord / .plan_cents and the
     drop/revival of ``plan_template_item``) is observable at runtime — the
     legacy columns are gone and the new ones are NOT NULL + populated for the
     seeded OWNER row (when present).

How to run
----------
The standard integration runner already brings the DB to head and passes::

    ./scripts/run-integration-tests.sh tests/test_migrations_v1_0.py -v

Backfill seeded-data assertions are best-effort: they assert *only when* an
owner row already exists in ``app_user``. If the DB is empty (fresh test
container with no dev_seed) the assertion self-skips — same pattern as
``tests/test_migration_backfill.py`` from Phase 11.

Session role
------------
``conftest.py`` runs the seed/teardown ``db_session`` under the admin role
(``ADMIN_DATABASE_URL``) so catalog probes (``information_schema``,
``pg_catalog``) and the ``SET LOCAL row_security = off`` reads here work. RLS
enforcement is covered by the dedicated ``tests/test_multitenancy_v1_0_columns.py``
(BE-16 acceptance gate); this file checks only *presence* of columns/indexes.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import text


pytestmark = pytest.mark.asyncio


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


REPO_ROOT = Path(__file__).resolve().parent.parent


async def _alembic_heads(session) -> set[str]:
    """Return the set of revision strings present in ``alembic_version``."""
    rows = (
        await session.execute(text("SELECT version_num FROM alembic_version"))
    ).all()
    return {r[0] for r in rows}


async def _table_columns(session, table: str) -> dict[str, str]:
    """Return ``{column_name: data_type}`` for ``table`` via information_schema."""
    rows = (
        await session.execute(
            text(
                "SELECT column_name, data_type "
                "FROM information_schema.columns "
                "WHERE table_schema = 'public' AND table_name = :tbl "
                "ORDER BY ordinal_position"
            ),
            {"tbl": table},
        )
    ).all()
    return {r[0]: r[1] for r in rows}


async def _table_exists(session, table: str) -> bool:
    res = await session.execute(
        text(
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_name = :tbl"
        ),
        {"tbl": table},
    )
    return res.scalar() is not None


async def _index_exists(session, index_name: str) -> bool:
    res = await session.execute(
        text(
            "SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = :idx"
        ),
        {"idx": index_name},
    )
    return res.scalar() is not None


async def _index_def(session, index_name: str) -> str | None:
    res = await session.execute(
        text(
            "SELECT indexdef FROM pg_indexes "
            "WHERE schemaname = 'public' AND indexname = :idx"
        ),
        {"idx": index_name},
    )
    return res.scalar()


async def _constraint_exists(session, constraint_name: str) -> bool:
    res = await session.execute(
        text("SELECT 1 FROM pg_constraint WHERE conname = :name"),
        {"name": constraint_name},
    )
    return res.scalar() is not None


async def _enum_values(session, type_name: str) -> list[str]:
    rows = (
        await session.execute(
            text(
                "SELECT enumlabel FROM pg_enum e "
                "JOIN pg_type t ON e.enumtypid = t.oid "
                "WHERE t.typname = :type "
                "ORDER BY e.enumsortorder"
            ),
            {"type": type_name},
        )
    ).all()
    return [r[0] for r in rows]


# ---------------------------------------------------------------------------
# Section A: forward-migration smoke (4 tests)
# ---------------------------------------------------------------------------


def _script_heads() -> set[str]:
    """Real alembic head(s) read from the migration scripts on disk.

    Replaces the former hardcoded ``v10_revs`` allowlist (Этап 2 WI-3): that set
    had to be hand-extended for EVERY new migration, so it silently rotted. The
    canonical head is whatever ``ScriptDirectory`` reports — single source of
    truth, no maintenance.

    Inside the api container cwd is ``/app`` and the migration env at
    ``/app/alembic`` shadows the installed ``alembic`` library; promote the venv
    site-packages ahead of it so ``alembic.config`` / ``alembic.script`` resolve
    to the library, not the migration directory.
    """
    import sys
    import sysconfig

    _site = sysconfig.get_paths().get("purelib")
    if _site:
        if _site in sys.path:
            sys.path.remove(_site)
        sys.path.insert(0, _site)

    from alembic.config import Config
    from alembic.script import ScriptDirectory

    cfg = Config(str(REPO_ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(REPO_ROOT / "alembic"))
    return set(ScriptDirectory.from_config(cfg).get_heads())


async def test_alembic_db_is_at_script_head(db_session):
    """The integration DB must be at the migration scripts' head revision.

    The actual upgrade ran during stack boot (api waits for ``alembic upgrade
    head`` before becoming healthy). We assert the live ``alembic_version``
    matches ``ScriptDirectory.get_heads()`` — reading the real head from disk
    instead of a brittle hand-maintained allowlist (Этап 2 WI-3).
    """
    db_heads = await _alembic_heads(db_session)
    assert db_heads, "alembic_version table is empty — alembic upgrade did not run"

    script_heads = _script_heads()
    assert script_heads, "ScriptDirectory reported no heads — alembic tree broken"
    # Exactly the scripts' head(s) must be applied. This both proves the DB is
    # current AND catches a forgotten `alembic upgrade head` on the test stack.
    assert db_heads == script_heads, (
        f"DB alembic_version {db_heads} != migration script head {script_heads}; "
        "the test DB is not at head (run `alembic upgrade head`)."
    )


async def test_after_upgrade_account_table_exists(db_session):
    """0012: ``account`` table with all required columns."""
    cols = await _table_columns(db_session, "account")
    expected = {
        "id",
        "user_id",
        "bank",
        "mask",
        "kind",
        "balance_cents",
        "primary",
        "created_at",
    }
    missing = expected - cols.keys()
    assert not missing, (
        f"account table missing columns: {missing}; have {sorted(cols.keys())}"
    )


async def test_after_upgrade_goal_table_dropped(db_session):
    """v1.1 (0031): ``goal`` table dropped (накопления выпилены)."""
    assert not await _table_exists(db_session, "goal"), (
        "goal table must be dropped after 0031"
    )


async def test_after_upgrade_savings_config_table_dropped(db_session):
    """v1.1 (0031): ``savings_config`` table dropped (накопления выпилены)."""
    assert not await _table_exists(db_session, "savings_config"), (
        "savings_config table must be dropped after 0031"
    )


async def test_after_upgrade_plan_template_tables_exist(db_session):
    """v1.1 (0028): plan-template + per-period-plan tables exist with columns."""
    item_cols = await _table_columns(db_session, "plan_template_item")
    assert {"id", "user_id", "category_id", "limit_cents"} <= item_cols.keys()
    line_cols = await _table_columns(db_session, "plan_template_line")
    assert {
        "id",
        "user_id",
        "category_id",
        "title",
        "amount_cents",
        "day_of_period",
        "kind",
    } <= line_cols.keys()
    pcp_cols = await _table_columns(db_session, "period_category_plan")
    assert {
        "id",
        "user_id",
        "period_id",
        "category_id",
        "limit_cents",
    } <= pcp_cols.keys()


# ---------------------------------------------------------------------------
# Section B: schema correctness — enums + new columns (5 tests)
# ---------------------------------------------------------------------------


async def test_actualkind_enum_has_4_values(db_session):
    """0014 BE-06: ``actualkind`` enum contains expense/income/roundup/deposit.

    Pre-Phase 22 the type was ``categorykind`` (2 values). Migration 0014
    renames it to ``actualkind`` and ADD VALUEs ``roundup`` and ``deposit``.
    """
    values = set(await _enum_values(db_session, "actualkind"))
    expected = {"expense", "income", "roundup", "deposit"}
    missing = expected - values
    assert not missing, (
        f"actualkind enum missing values: {missing}; have {sorted(values)}"
    )


async def test_category_kind_enum_has_2_values(db_session):
    """0014: separate ``category_kind`` enum keeps only expense/income.

    The Category.kind column is migrated to this new 2-valued type so that
    only ActualTransaction.kind carries the 4-valued semantics.
    """
    values = set(await _enum_values(db_session, "category_kind"))
    assert values == {"expense", "income"}, (
        f"category_kind must be exactly {{expense, income}}; got {sorted(values)}"
    )


async def test_category_has_v10_columns(db_session):
    """0013 BE-04 + v1.1: category — plan_cents/code/ord/parent_id.

    v1.1 (0031): rollover/paused columns dropped.
    """
    cols = await _table_columns(db_session, "category")
    expected = {"plan_cents", "code", "ord", "parent_id"}
    missing = expected - cols.keys()
    assert not missing, (
        f"category missing v1.0 columns: {missing}; have {sorted(cols.keys())}"
    )
    # v1.1: rollover/paused must be GONE.
    assert "rollover" not in cols, "category.rollover must be dropped (0031)"
    assert "paused" not in cols, "category.paused must be dropped (0031)"
    # NOT NULL after backfill — code/ord/plan_cents required.
    nullable_rows = (
        await db_session.execute(
            text(
                "SELECT column_name, is_nullable "
                "FROM information_schema.columns "
                "WHERE table_schema = 'public' AND table_name = 'category' "
                "AND column_name IN ('plan_cents', 'code', 'ord')"
            )
        )
    ).all()
    nullability = {r[0]: r[1] for r in nullable_rows}
    for col in ("plan_cents", "code", "ord"):
        assert nullability.get(col) == "NO", (
            f"category.{col} must be NOT NULL after backfill; got {nullability!r}"
        )


async def test_subscription_has_v10_columns(db_session):
    """0014 BE-12: subscription extension — day_of_month/account_id/posted_txn_id."""
    cols = await _table_columns(db_session, "subscription")
    expected = {"day_of_month", "account_id", "posted_txn_id"}
    missing = expected - cols.keys()
    assert not missing, (
        f"subscription missing v1.0 columns: {missing}; have {sorted(cols.keys())}"
    )


async def test_budget_period_has_rollover_columns(db_session):
    """0014 BE-14: budget_period — misc_rollover_cents + rollover_processed_at."""
    cols = await _table_columns(db_session, "budget_period")
    expected = {"misc_rollover_cents", "rollover_processed_at"}
    missing = expected - cols.keys()
    assert not missing, (
        f"budget_period missing rollover columns: {missing}; have {sorted(cols.keys())}"
    )


# ---------------------------------------------------------------------------
# Section C: composite FK + partial UNIQUE index (3 tests)
# ---------------------------------------------------------------------------


async def test_category_parent_composite_fk_exists(db_session):
    """0013 BE-16: composite FK ``fk_category_parent_composite``."""
    assert await _constraint_exists(db_session, "fk_category_parent_composite"), (
        "Expected fk_category_parent_composite on category(parent_id, user_id) "
        "→ category(id, user_id)"
    )
    assert await _constraint_exists(db_session, "ux_category_id_user"), (
        "Expected composite UNIQUE ux_category_id_user(id, user_id) on category "
        "(target for the composite FK)"
    )


async def test_actual_parent_txn_composite_fk_exists(db_session):
    """0015 BE-16: composite FK ``fk_actual_parent_txn_composite`` on
    actual_transaction(parent_txn_id, user_id) → (id, user_id).

    The simple FK ``fk_actual_parent_txn`` from 0014 must have been replaced.
    """
    assert await _constraint_exists(db_session, "fk_actual_parent_txn_composite"), (
        "Expected fk_actual_parent_txn_composite on actual_transaction"
        "(parent_txn_id, user_id) → (id, user_id)"
    )
    assert await _constraint_exists(db_session, "ux_actual_id_user"), (
        "Expected composite UNIQUE ux_actual_id_user(id, user_id) on "
        "actual_transaction (target for the composite FK)"
    )
    # Simple FK from 0014 must be gone (0015 dropped it before adding composite).
    assert not await _constraint_exists(db_session, "fk_actual_parent_txn"), (
        "Simple FK fk_actual_parent_txn must have been dropped by 0015 "
        "(replaced by fk_actual_parent_txn_composite)"
    )


async def test_account_partial_unique_primary_index_exists(db_session):
    """0012 T-22-01-02: partial unique index ensures ≤ 1 primary per user."""
    assert await _index_exists(db_session, "ix_account_user_primary_one"), (
        "Expected partial unique index ix_account_user_primary_one on account"
    )
    indexdef = await _index_def(db_session, "ix_account_user_primary_one")
    assert indexdef is not None
    assert "UNIQUE" in indexdef.upper(), (
        f"ix_account_user_primary_one must be UNIQUE; got: {indexdef}"
    )
    # Partial filter on "primary" = true.
    lower = indexdef.lower()
    assert '"primary"' in lower or "primary" in lower, (
        f"Index missing partial filter on primary column: {indexdef}"
    )
    assert "true" in lower, (
        f'Index partial filter must be `WHERE "primary" = true`: {indexdef}'
    )


# Section D (per-migration round-trip) was removed: it was MIGRATION_ROUNDTRIP-
# gated (always skipped in the standard runner) and targeted the historical
# 0012-0015 chain. Migration round-trip safety now lives in
# ``scripts/alembic-roundtrip.sh`` / ``make migration-roundtrip`` (upgrade head
# → downgrade -1 → upgrade head against the live stack). The forward-state
# schema/enum/FK/backfill assertions below remain this file's gate.


# ---------------------------------------------------------------------------
# Section E: backfill correctness on existing OWNER row (3 tests)
# ---------------------------------------------------------------------------
#
# These tests assert against the live integration DB's current state — they
# do NOT seed legacy 0011-baseline data and re-upgrade (that would require
# the round-trip flag and a clean DB). Instead they verify the *observable
# postcondition* of the backfill: any AppUser row that exists has
# income_cents NULL-able (column shape correct), any Category row has
# code/ord/rollover/paused populated, and the plan_template_item table is
# gone.
#
# When the DB has no seeded users (fresh container, no dev_seed) the
# row-level assertions self-skip — the schema-shape assertions still run.


async def test_app_user_income_cents_column_is_nullable_bigint(db_session):
    """BE-01 + 0012: app_user.income_cents is a NULLable BIGINT column.

    SHAPE-ONLY (Этап 2 WI-3, honest naming): this asserts the column *shape*,
    not a data-row invariant. ``income_cents = NULL`` is only the backfill
    *initial* state (existing OWNER row → NULL, UI redirects to onboarding-edit);
    once the operator completes onboarding the value is non-NULL, so there is no
    standing data-row invariant to assert. The runtime backfill behaviour is
    covered by the onboarding service tests.
    """
    cols = await _table_columns(db_session, "app_user")
    assert "income_cents" in cols, "app_user missing income_cents column"
    res = await db_session.execute(
        text(
            "SELECT data_type, is_nullable FROM information_schema.columns "
            "WHERE table_schema='public' AND table_name='app_user' "
            "AND column_name='income_cents'"
        )
    )
    data_type, is_nullable = res.one()
    assert is_nullable == "YES", (
        f"app_user.income_cents must be NULLable (backfill = NULL); "
        f"got is_nullable={is_nullable!r}"
    )
    assert data_type == "bigint", (
        f"app_user.income_cents must be BIGINT (деньги — копейки); got {data_type!r}"
    )


async def test_existing_categories_get_code_and_ord_backfilled(db_session):
    """BE-04 + 0013 backfill: every category row has populated code/ord.

    Backfill rules (CONTEXT §Area 1):
      - code = transliterate(lower(name)) with collision suffix '-2', '-3'
      - ord = lpad(sort_order, 2, '0') (e.g. '01', '02')
      - rollover = 'misc' (server_default)
      - paused = is_archived

    We don't pin specific code values because the seed data may have
    evolved across plans 22.01-22.15 — instead we assert that NO category
    row has NULL or empty values for the backfilled columns. That is the
    invariant guaranteed by the SET NOT NULL step in 0013.
    """
    # Bypass RLS for catalog read.
    await db_session.execute(text("SET LOCAL row_security = off"))
    res = await db_session.execute(text("SELECT count(*) FROM category"))
    n_categories = res.scalar()
    if n_categories == 0:
        pytest.skip("No category rows in test DB — backfill assertion trivially holds")

    # No row may have NULL code or ord (NOT NULL after backfill).
    null_codes = (
        await db_session.execute(
            text("SELECT count(*) FROM category WHERE code IS NULL OR code = ''")
        )
    ).scalar()
    assert null_codes == 0, (
        f"Backfill BE-04: {null_codes} category rows have NULL/empty code"
    )
    null_ord = (
        await db_session.execute(
            text(
                "SELECT count(*) FROM category WHERE ord IS NULL OR ord !~ '^[0-9]{2}$'"
            )
        )
    ).scalar()
    assert null_ord == 0, (
        f"Backfill BE-04: {null_ord} category rows have NULL/non-2-digit ord"
    )
    # v1.1: rollover column dropped (0031) — no rollover invariant to check.


async def test_existing_categories_plan_cents_source_of_truth(db_session):
    """BE-04 + v1.1: plan_cents NOT NULL; plan_template_item revived (0028).

    Verification:
      1. ``plan_template_item`` table EXISTS (revived in 0028 with new schema).
      2. ``category.plan_cents`` is NOT NULL (default 0).
      3. Where rows exist, ``plan_cents >= 0`` (sanity).
    """
    # 1. plan_template_item revived (v1.1, alembic 0028).
    assert await _table_exists(db_session, "plan_template_item"), (
        "plan_template_item table must be revived in 0028"
    )

    # 2. plan_cents NOT NULL.
    res = await db_session.execute(
        text(
            "SELECT is_nullable, column_default FROM information_schema.columns "
            "WHERE table_schema='public' AND table_name='category' "
            "AND column_name='plan_cents'"
        )
    )
    row = res.first()
    assert row is not None, "category.plan_cents column missing"
    is_nullable, column_default = row
    assert is_nullable == "NO", (
        f"category.plan_cents must be NOT NULL; got is_nullable={is_nullable!r}"
    )
    # server_default '0' ensures fresh inserts get 0 if not specified.
    assert column_default is not None and "0" in str(column_default), (
        f"category.plan_cents must default to 0; got column_default={column_default!r}"
    )

    # 3. Sanity: no negative plan_cents (BE-04 invariant — plan ≥ 0).
    await db_session.execute(text("SET LOCAL row_security = off"))
    n_neg = (
        await db_session.execute(
            text("SELECT count(*) FROM category WHERE plan_cents < 0")
        )
    ).scalar()
    assert n_neg == 0, (
        f"Found {n_neg} category rows with plan_cents < 0 — backfill bug?"
    )


# ---------------------------------------------------------------------------
# Section F: RLS smoke
#
# NOTE (prune): the former test_after_upgrade_rls_policies_present and
# test_after_upgrade_force_rls_enabled_on_new_tables were removed — they probed
# the exact same tenant_isolation_<table> policies + ENABLE/FORCE RLS flags on
# the exact same tables (account / plan_template_item / plan_template_line /
# period_category_plan) as tests/test_multitenancy_v1_0_columns.py Section A
# (test_*_has_tenant_isolation_policy + test_v10_tables_force_rls_enabled), which
# additionally proves RLS *enforces* under the non-superuser runtime role.
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Section G: bonus — actual_transaction.account_id (0016 fix-up; BE-07 prereq)
# ---------------------------------------------------------------------------


async def test_actual_transaction_account_id_added_by_0016(db_session):
    """0016 (Phase 22 fix-up, recorded in plans 22.05/22.06 SUMMARY):
    ``actual_transaction.account_id`` BIGINT NULL FK → account.id ON DELETE
    RESTRICT, plus ``ix_actual_account_id`` and ``fk_actual_account``.

    This isn't strictly part of the 0012-0015 chain in the plan, but the
    integration head includes 0016; failing to assert it would let a regression
    silently land. Skipped if 0016 is not in alembic_version (pre-22.06 DB).
    """
    heads = await _alembic_heads(db_session)
    if "0016_v10_actual_account_id" not in heads:
        pytest.skip(
            "0016_v10_actual_account_id not at head — skipping fix-up "
            "assertion (run after Wave 4 upgrades)"
        )
    cols = await _table_columns(db_session, "actual_transaction")
    assert "account_id" in cols, (
        "actual_transaction.account_id missing — 0016 didn't apply"
    )
    assert await _constraint_exists(db_session, "fk_actual_account"), (
        "fk_actual_account FK missing — 0016 didn't apply"
    )
    assert await _index_exists(db_session, "ix_actual_account_id"), (
        "ix_actual_account_id index missing — 0016 didn't apply"
    )
