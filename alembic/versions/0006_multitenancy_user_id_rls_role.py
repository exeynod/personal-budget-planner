"""multitenancy: user_id FK + RLS + app_user.role + backfill

Revision ID: 0006_multitenancy_user_id_rls_role
Revises: 0005_enable_ai_categorization
Create Date: 2026-05-07

Phase 11: Multi-Tenancy DB Migration & RLS (MUL-01..05, ROLE-01).

What this revision does (single atomic Alembic transaction):
  1. CREATE TYPE user_role AS ENUM ('owner', 'member', 'revoked')
  2. ALTER TABLE app_user ADD COLUMN role user_role NOT NULL DEFAULT 'member'
     + UPDATE app_user SET role = 'owner' WHERE tg_user_id = :owner_tg_id
  3. На 9 доменных таблицах: ADD COLUMN user_id BIGINT NULL (изначально)
  4. Backfill user_id = (SELECT id FROM app_user WHERE tg_user_id = :owner_tg_id)
  5. Sanity check: RAISE если в любой таблице остались user_id IS NULL
  6. На 9 доменных таблицах: ALTER COLUMN user_id SET NOT NULL
  7. ADD FOREIGN KEY user_id → app_user(id) ON DELETE RESTRICT (9 таблиц)
  8. Drop старого UNIQUE budget_period(period_start), CREATE NEW scoped uniques
  9. CREATE INDEX ix_<table>_user_id на 9 таблицах
  10. ENABLE/FORCE ROW LEVEL SECURITY + CREATE POLICY на 9 таблицах

Operational note: миграция требует downtime (~30 сек) — `docker compose stop
api bot worker; alembic upgrade head; docker compose start`.
"""
from __future__ import annotations

import os
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0006_multitenancy_user_id_rls_role"
down_revision: Union[str, None] = "0005_enable_ai_categorization"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# 9 доменных таблиц (scope multi-tenant). app_user, app_health — out of scope.
DOMAIN_TABLES: tuple[str, ...] = (
    "category",
    "budget_period",
    "plan_template_item",
    "planned_transaction",
    "actual_transaction",
    "subscription",
    "category_embedding",
    "ai_conversation",
    "ai_message",
)


def _resolve_owner_tg_id() -> int:
    """Read OWNER_TG_ID from env; fail loud if missing or zero."""
    raw = os.environ.get("OWNER_TG_ID", "").strip()
    if not raw:
        raise RuntimeError(
            "0006_multitenancy: OWNER_TG_ID env var must be set for backfill. "
            "Aborting migration to avoid leaving DB in inconsistent state."
        )
    try:
        owner_id = int(raw)
    except ValueError as exc:
        raise RuntimeError(
            f"0006_multitenancy: OWNER_TG_ID={raw!r} is not an integer."
        ) from exc
    if owner_id == 0:
        raise RuntimeError(
            "0006_multitenancy: OWNER_TG_ID=0 (placeholder) — set real id."
        )
    return owner_id


def upgrade() -> None:
    owner_tg_id = _resolve_owner_tg_id()

    # ─── Phase 1: enum user_role + app_user.role + backfill owner role ───
    op.execute("CREATE TYPE user_role AS ENUM ('owner', 'member', 'revoked')")
    op.add_column(
        "app_user",
        sa.Column(
            "role",
            sa.Enum(
                "owner", "member", "revoked",
                name="user_role",
                create_type=False,
            ),
            nullable=False,
            server_default=sa.text("'member'::user_role"),
        ),
    )
    op.execute(
        sa.text(
            "UPDATE app_user SET role = 'owner' WHERE tg_user_id = :owner_tg_id"
        ).bindparams(owner_tg_id=owner_tg_id)
    )

    # ─── Phase 2: ADD COLUMN user_id BIGINT NULL на 9 доменных таблицах ───
    for table in DOMAIN_TABLES:
        op.add_column(
            table,
            sa.Column("user_id", sa.BigInteger(), nullable=True),
        )

    # Phases 3-8 добавятся в Tasks 2-3 (backfill, NOT NULL, FK, uniques, indexes, RLS).


def downgrade() -> None:
    # Заполнится в Task 3 целиком (симметричный teardown).
    pass
