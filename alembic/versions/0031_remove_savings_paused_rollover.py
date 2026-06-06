"""REMOVALS — savings tables + category.paused + category.rollover (G1/G3/G4)

Owner decision (AGREED §G): выпиливание накоплений, паузы и rollover категорий.
Last revision in the planning-rework chain — ADD-фичи (0028-0030) приземлены
раньше, removals последними (упрощает review/rollback; данные savings — loss).

Dropped:
  * ``savings_config`` (PK=user_id, ON DELETE CASCADE) — drop policy + table.
  * ``goal`` (FK→app_user RESTRICT) — drop policy + index + table.
  * ``category.paused`` (bool) — column drop.
  * ``category.rollover`` (varchar+CHECK) — drop CHECK then column.

KEPT (cannot/should not drop):
  * ``account`` table + system ``code='savings'`` category — historical
    deposit/roundup ``actual_transaction`` rows reference savings via FK
    RESTRICT. ``compute_balance`` keeps excluding ``code='savings'``.
  * ``actualkind`` enum values ``roundup``/``deposit`` — PG has no DROP VALUE;
    historical rows keep them. Service layer stops creating new ones.
  * ``budget_period.misc_rollover_cents`` / ``rollover_processed_at`` —
    harmless leftover columns, out of scope.
"""

from alembic import op
import sqlalchemy as sa


revision = "0031_remove_savings_etc"
down_revision = "0030_adjustment_category"
branch_labels = None
depends_on = None


_RLS_USING = "user_id = coalesce(NULLIF(current_setting('app.current_user_id', true), '')::bigint, -1)"


def upgrade() -> None:
    # ─── savings_config ───
    op.execute(
        "DROP POLICY IF EXISTS tenant_isolation_savings_config ON savings_config"
    )
    op.drop_table("savings_config")

    # ─── goal ───
    op.execute("DROP POLICY IF EXISTS tenant_isolation_goal ON goal")
    op.drop_index("ix_goal_user_id", table_name="goal")
    op.drop_table("goal")

    # ─── category.paused ───
    op.drop_column("category", "paused")

    # ─── category.rollover (drop CHECK first) ───
    op.drop_constraint("ck_category_rollover_enum", "category", type_="check")
    op.drop_column("category", "rollover")


def downgrade() -> None:
    # Best-effort re-create (data NOT restored). Mirrors 0014/0015 structure.

    # ─── category.rollover ───
    op.add_column(
        "category",
        sa.Column(
            "rollover",
            sa.String(length=8),
            nullable=False,
            server_default="misc",
        ),
    )
    op.create_check_constraint(
        "ck_category_rollover_enum",
        "category",
        "rollover IN ('misc', 'savings')",
    )

    # ─── category.paused ───
    op.add_column(
        "category",
        sa.Column(
            "paused",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )

    # ─── goal ───
    op.create_table(
        "goal",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.BigInteger(),
            sa.ForeignKey("app_user.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("target_cents", sa.BigInteger(), nullable=False),
        sa.Column("current_cents", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("due", sa.Date(), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("target_cents > 0", name="ck_goal_target_positive"),
        sa.CheckConstraint(
            "char_length(name) BETWEEN 1 AND 80", name="ck_goal_name_length"
        ),
    )
    op.create_index("ix_goal_user_id", "goal", ["user_id"])
    op.execute("ALTER TABLE goal ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE goal FORCE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY tenant_isolation_goal ON goal "
        f"USING ({_RLS_USING}) WITH CHECK ({_RLS_USING})"
    )
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE goal TO budget_app")
    op.execute("GRANT USAGE, SELECT ON SEQUENCE goal_id_seq TO budget_app")

    # ─── savings_config ───
    op.create_table(
        "savings_config",
        sa.Column(
            "user_id",
            sa.BigInteger(),
            sa.ForeignKey("app_user.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "roundup_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "roundup_base", sa.SmallInteger(), nullable=False, server_default="10"
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "roundup_base IN (10, 50, 100)", name="ck_savings_config_base_enum"
        ),
    )
    op.execute("ALTER TABLE savings_config ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE savings_config FORCE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY tenant_isolation_savings_config ON savings_config "
        f"USING ({_RLS_USING}) WITH CHECK ({_RLS_USING})"
    )
    op.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE savings_config TO budget_app"
    )
