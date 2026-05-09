"""v1.0 user.income_cents + account table + RLS (Phase 22 BE-01, BE-02, BE-03, BE-16)

Revision ID: 0012_v10_user_account
Revises: 0011_auth_token
Create Date: 2026-05-10

Phase 22 atomic migration #1 of 4 (CONTEXT D-01):
  1. ADD COLUMN app_user.income_cents BIGINT NULL — monthly income in kopecks (BE-01).
  2. CREATE TABLE account — multi-tenant accounts (BE-02) with FK app_user, RLS (BE-16).
  3. Partial unique index ix_account_user_primary_one ensuring <=1 primary per user.

Backward compat: existing OWNER_TG_ID row gets income_cents=NULL (UI redirects
to onboarding-edit). No default account auto-created here — onboarding path
(plan 22.11) will atomically seed first Account.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0012_v10_user_account"
down_revision = "0011_auth_token"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ─── Step 1: app_user.income_cents BIGINT NULL ───
    # NULL = "не вводил доход" — UI редиректит на onboarding-edit (BE-01).
    op.add_column(
        "app_user",
        sa.Column("income_cents", sa.BigInteger(), nullable=True),
    )

    # ─── Step 2: CREATE TABLE account ───
    # Multi-tenant via user_id FK (ON DELETE RESTRICT — нельзя удалить юзера
    # с активными счетами; данные критичны для аудита).
    # kind как PgEnum (`account_kind`) — соответствует существующему стилю
    # `categorykind` (0001) и `user_role` (0006).
    op.create_table(
        "account",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.BigInteger(),
            sa.ForeignKey("app_user.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("bank", sa.String(length=40), nullable=False),
        sa.Column("mask", sa.String(length=16), nullable=True),
        sa.Column(
            "kind",
            sa.Enum("card", "cash", "savings", name="account_kind", create_type=True),
            nullable=False,
        ),
        sa.Column(
            "balance_cents",
            sa.BigInteger(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "primary",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        # T-22-01-03 mitigation: balance overflow / pathological inputs.
        sa.CheckConstraint(
            "char_length(bank) BETWEEN 1 AND 40",
            name="ck_account_bank_length",
        ),
        sa.CheckConstraint(
            "balance_cents >= -100000000000 AND balance_cents <= 100000000000",
            name="ck_account_balance_range",
        ),
    )

    # ─── Step 3: indexes ───
    # ix_account_user_id — все service-layer queries фильтруют по user_id.
    op.create_index("ix_account_user_id", "account", ["user_id"])
    # ix_account_user_primary_one — T-22-01-02 mitigation: ровно один primary
    # на пользователя через partial unique index. Postgres-specific.
    op.create_index(
        "ix_account_user_primary_one",
        "account",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text('"primary" = true'),
    )

    # ─── Step 4: RLS — ENABLE + FORCE + tenant_isolation_account policy ───
    # Naming: `tenant_isolation_<table>` per CONTEXT D-08 (новая convention
    # для v1.0 таблиц; старые из 0006 остаются под именем `<table>_user_isolation`).
    # USING + WITH CHECK с coalesce(NULLIF(...), '')::bigint, -1) — same hardened
    # pattern as 0006_multitenancy: без выставленного GUC current_setting
    # возвращает '' (не NULL), NULLIF превращает в NULL, coalesce → -1, не
    # матчит row → 0 rows. Без NULLIF cast '' к bigint падает.
    # FORCE — table owner тоже под policy (defence in depth).
    op.execute("ALTER TABLE account ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE account FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_isolation_account ON account "
        "USING (user_id = coalesce(NULLIF(current_setting('app.current_user_id', true), '')::bigint, -1)) "
        "WITH CHECK (user_id = coalesce(NULLIF(current_setting('app.current_user_id', true), '')::bigint, -1))"
    )

    # ─── Step 5: explicit GRANTs to budget_app ───
    # ALTER DEFAULT PRIVILEGES в 0007 уже автогрантит, но explicit grant
    # защищает от сценария, где default privs скинуты вручную в проде
    # (idempotent — повторный grant ОК).
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE account TO budget_app")
    op.execute("GRANT USAGE, SELECT ON SEQUENCE account_id_seq TO budget_app")


def downgrade() -> None:
    # Симметрия upgrade — reverse order.
    op.execute("REVOKE ALL ON TABLE account FROM budget_app")
    op.execute("DROP POLICY IF EXISTS tenant_isolation_account ON account")
    op.execute("ALTER TABLE account NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE account DISABLE ROW LEVEL SECURITY")
    op.drop_index("ix_account_user_primary_one", table_name="account")
    op.drop_index("ix_account_user_id", table_name="account")
    op.drop_table("account")
    op.execute("DROP TYPE IF EXISTS account_kind")
    op.drop_column("app_user", "income_cents")
