"""admin phase13: spending_cap_cents + ai_usage_log table

Revision ID: 0008_admin_phase13
Revises: 0007_postgres_role_split
Create Date: 2026-05-07

Phase 13 schema additions:
  1. app_user.spending_cap_cents BIGINT NOT NULL DEFAULT 46500
     (USD копейки, ≈ $5/мес — stub для Phase 15 enforcement).
     Existing rows backfill through server_default at column creation.
  2. ai_usage_log table — persistent record per /ai/chat invocation
     (replaces the in-memory ring buffer for admin breakdown). One row
     per LLM call: tokens + est cost + UTC timestamp.
  3. RLS на ai_usage_log (защита защитой; admin endpoint в 13-05
     использует privileged-query pattern с set_config bypass).
  4. GRANTS на ai_usage_log для budget_app (runtime может INSERT/SELECT).

ON DELETE CASCADE на user_id FK — отличие от других доменных таблиц
(которые используют RESTRICT + service-layer purge per Plan 11-02 D-NOTE):
ai_usage_log — telemetry-метаданные без защищаемой бизнес-семантики;
каскадное удаление упрощает Phase 13 revoke flow (Plan 13-04 service
layer не должен явно DELETE из ai_usage_log).

Operational notes:
  - Migration runs as privileged role (ADMIN_DATABASE_URL → budget).
  - GRANT statements assume budget_app role exists (created in 0007).
  - Idempotency на CREATE TABLE через IF NOT EXISTS — НЕ используем
    чтобы alembic умел rollback'ать чисто; downgrade удаляет таблицу.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0008_admin_phase13"
down_revision: Union[str, None] = "0007_postgres_role_split"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# USD копейки (cents-of-USD): 46500 ≈ $5.00 — stub default per CONTEXT.
DEFAULT_SPENDING_CAP_CENTS = 46500


def upgrade() -> None:
    # ---- 1. AppUser.spending_cap_cents column ----
    # server_default fills existing rows + future inserts that omit the field.
    op.add_column(
        "app_user",
        sa.Column(
            "spending_cap_cents",
            sa.BigInteger(),
            nullable=False,
            server_default=str(DEFAULT_SPENDING_CAP_CENTS),
        ),
    )

    # ---- 2. ai_usage_log table ----
    op.create_table(
        "ai_usage_log",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.BigInteger(),
            sa.ForeignKey("app_user.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("model", sa.Text(), nullable=False),
        sa.Column(
            "prompt_tokens", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column(
            "completion_tokens", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column(
            "cached_tokens", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column(
            "total_tokens", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column(
            "est_cost_usd",
            sa.Float(asdecimal=False),
            nullable=False,
            server_default="0.0",
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    # Composite index on (user_id, created_at) — supports per-user
    # current-month and last-30d aggregations (Plan 13-05).
    # Postgres index сканится в обе стороны, поэтому ASC vs DESC
    # на однонаправленный индекс не критично (DESC добавили бы
    # выгоду только для merge-join в большом dataset).
    op.create_index(
        "ix_ai_usage_log_user_created",
        "ai_usage_log",
        ["user_id", "created_at"],
        unique=False,
    )

    # ---- 3. RLS on ai_usage_log (defence in depth) ----
    op.execute("ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE ai_usage_log FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY ai_usage_log_user_isolation ON ai_usage_log "
        "USING (user_id = coalesce(NULLIF(current_setting('app.current_user_id', true), '')::bigint, -1))"
    )

    # ---- 4. GRANTS for budget_app (runtime app role) ----
    # SELECT/INSERT для запись usage events + admin breakdown reads.
    # UPDATE/DELETE — для cascade safety при revoke (Plan 13-04 может
    # делать DELETE FROM ai_usage_log WHERE user_id=... как defensive).
    op.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON ai_usage_log TO budget_app"
    )
    op.execute(
        "GRANT USAGE, SELECT ON SEQUENCE ai_usage_log_id_seq TO budget_app"
    )


def downgrade() -> None:
    # Reverse order — drop dependent objects first.
    # REVOKE wrapped в DO-block чтобы downgrade был idempotent даже если
    # budget_app role была удалена ранее (например при тесте 0007 downgrade).
    op.execute(
        "DO $$ BEGIN "
        "IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'budget_app') "
        "THEN "
        "  REVOKE ALL ON ai_usage_log FROM budget_app; "
        "  REVOKE ALL ON SEQUENCE ai_usage_log_id_seq FROM budget_app; "
        "END IF; "
        "END $$;"
    )

    # Policy / RLS settings drop with the table — but explicit DROP POLICY
    # is harmless and signals intent.
    op.execute(
        "DROP POLICY IF EXISTS ai_usage_log_user_isolation ON ai_usage_log"
    )

    op.drop_index("ix_ai_usage_log_user_created", table_name="ai_usage_log")
    op.drop_table("ai_usage_log")

    op.drop_column("app_user", "spending_cap_cents")
