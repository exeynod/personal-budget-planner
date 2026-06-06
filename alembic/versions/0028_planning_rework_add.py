"""planning rework ADD — revive plan_template_item, new plan_template_line + period_category_plan

UX-реворк планирования (AGREED-PLAN §B). Три новые таблицы шаблона/плана-месяца:

  * ``plan_template_item`` — лимит категории в шаблоне (per-user, не per-period).
    NB: имя таблицы то же, что у дропнутой в 0013 версии, но СХЕМА НОВАЯ
    (``limit_cents`` вместо ``amount_cents/day_of_period/sort_order``).
  * ``plan_template_line`` — повторяющиеся строки детализации шаблона.
  * ``period_category_plan`` — per-period снапшот лимита категории (источник
    лимита для ``compute_balance``; fallback на ``Category.plan_cents``).

Все три — multi-tenant via RLS: ENABLE + FORCE ROW LEVEL SECURITY +
``tenant_isolation_<table>`` policy + GRANT … TO budget_app + sequence grant
(зеркало pattern из 0014/0015, см. BACKEND-PLAN §1/§6).
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql  # noqa: F401 (used in upgrade)


revision = "0028_planning_rework_add"
down_revision = "0027_perf_composite_indexes"
branch_labels = None
depends_on = None


_RLS_USING = "user_id = coalesce(NULLIF(current_setting('app.current_user_id', true), '')::bigint, -1)"


def _enable_rls(table: str, seq: str) -> None:
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY tenant_isolation_{table} ON {table} "
        f"USING ({_RLS_USING}) WITH CHECK ({_RLS_USING})"
    )
    op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE {table} TO budget_app")
    op.execute(f"GRANT USAGE, SELECT ON SEQUENCE {seq} TO budget_app")


def upgrade() -> None:
    # ─── 1. plan_template_item (revive, new schema) ───
    op.create_table(
        "plan_template_item",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.BigInteger(),
            sa.ForeignKey("app_user.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "category_id",
            sa.BigInteger(),
            sa.ForeignKey("category.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("limit_cents", sa.BigInteger(), nullable=False, server_default="0"),
        sa.UniqueConstraint(
            "user_id", "category_id", name="uq_plan_template_item_user_cat"
        ),
    )
    op.create_index("ix_plan_template_item_user_id", "plan_template_item", ["user_id"])
    _enable_rls("plan_template_item", "plan_template_item_id_seq")

    # ─── 2. plan_template_line (new) ───
    op.create_table(
        "plan_template_line",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.BigInteger(),
            sa.ForeignKey("app_user.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "category_id",
            sa.BigInteger(),
            sa.ForeignKey("category.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("amount_cents", sa.BigInteger(), nullable=False),
        sa.Column("day_of_period", sa.SmallInteger(), nullable=True),
        # reuse existing PG enum ``actualkind`` (create_type=False — already exists)
        sa.Column(
            "kind",
            postgresql.ENUM(
                "expense",
                "income",
                "roundup",
                "deposit",
                name="actualkind",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.CheckConstraint(
            "day_of_period IS NULL OR (day_of_period BETWEEN 1 AND 31)",
            name="ck_tpl_line_day",
        ),
    )
    op.create_index(
        "ix_plan_template_line_user_cat",
        "plan_template_line",
        ["user_id", "category_id"],
    )
    _enable_rls("plan_template_line", "plan_template_line_id_seq")

    # ─── 3. period_category_plan (new) ───
    op.create_table(
        "period_category_plan",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.BigInteger(),
            sa.ForeignKey("app_user.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "period_id",
            sa.BigInteger(),
            sa.ForeignKey("budget_period.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "category_id",
            sa.BigInteger(),
            sa.ForeignKey("category.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("limit_cents", sa.BigInteger(), nullable=False, server_default="0"),
        sa.UniqueConstraint("period_id", "category_id", name="uq_period_category_plan"),
    )
    op.create_index(
        "ix_period_category_plan_user_period",
        "period_category_plan",
        ["user_id", "period_id"],
    )
    _enable_rls("period_category_plan", "period_category_plan_id_seq")


def downgrade() -> None:
    for table in (
        "period_category_plan",
        "plan_template_line",
        "plan_template_item",
    ):
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation_{table} ON {table}")
        op.drop_table(table)
