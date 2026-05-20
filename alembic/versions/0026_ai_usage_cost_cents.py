"""ai_usage_log.est_cost_usd (Float) → cost_cents (BIGINT) — Phase 67 R8

Money must be BIGINT cents, never Float (CLAUDE.md). The legacy ``est_cost_usd``
Float column (Phase 13/v0.3) is migrated to ``cost_cents`` (USD-копейки,
1 USD = 100 cents — same scale as ``app_user.spending_cap_cents``).

Backfill: cost_cents = ceil(est_cost_usd * 100) per existing row — округление
вверх до цента, консервативно для spend-cap (cap срабатывает чуть раньше).
ceil реализуется как CEIL(est_cost_usd * 100) в SQL.

Downgrade: re-add est_cost_usd Float, est_cost_usd = cost_cents / 100.0
(потеря sub-cent точности — данные уже квантованы вверх до цента на upgrade).
"""
from alembic import op
import sqlalchemy as sa

revision = "0026_ai_usage_cost_cents"
down_revision = "0025_sub_posted_txn_uq"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add the new BIGINT column (nullable first so the table backfills).
    op.add_column(
        "ai_usage_log",
        sa.Column("cost_cents", sa.BigInteger(), nullable=True),
    )
    # 2. Backfill: ceil(est_cost_usd * 100). CEIL returns numeric; cast to bigint.
    op.execute(
        "UPDATE ai_usage_log "
        "SET cost_cents = CAST(CEIL(est_cost_usd * 100) AS BIGINT)"
    )
    # 3. Enforce NOT NULL + server_default for future inserts.
    op.alter_column(
        "ai_usage_log",
        "cost_cents",
        existing_type=sa.BigInteger(),
        nullable=False,
        server_default="0",
    )
    # 4. Drop the legacy Float column.
    op.drop_column("ai_usage_log", "est_cost_usd")


def downgrade() -> None:
    op.add_column(
        "ai_usage_log",
        sa.Column(
            "est_cost_usd",
            sa.Float(),
            nullable=False,
            server_default="0.0",
        ),
    )
    # cents → USD float (already cent-quantized on upgrade; sub-cent precision lost).
    op.execute(
        "UPDATE ai_usage_log SET est_cost_usd = cost_cents / 100.0"
    )
    op.drop_column("ai_usage_log", "cost_cents")
