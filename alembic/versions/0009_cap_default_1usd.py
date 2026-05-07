"""adjust spending_cap_cents default to 100 ($1 USD/month)

Revision ID: 0009_cap_default_1usd
Revises: 0008_admin_phase13
Create Date: 2026-05-07

Money-scale alignment per v0.4-TEST-REPORT.md M-3:
  - Code in app/services/spend_cap.py uses scale 100/USD (1 USD == 100 storage units).
  - Phase 13 stub default 46500 was computed as RUB-копейки (5 USD × 93 RUB/USD ×
    100 коп/RUB = 46500), which mismatches the canonical USD-cents scale by ~93×.
  - Decision (2026-05-07): default = $1/month for closed-whitelist privacy-friendly
    semantics; owner can raise per-user via PATCH /admin/users/{id}/cap.

Migration intent:
  1. Change column default from 46500 → 100.
  2. Reset existing rows that still hold the old default (46500) to 100. Rows
     where the owner has already set a custom value (anything != 46500) are
     preserved as-is.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0009_cap_default_1usd"
down_revision = "0008_admin_phase13"
branch_labels = None
depends_on = None


NEW_DEFAULT = 100  # $1/month at scale 100/USD
OLD_DEFAULT = 46500  # Phase 13 stub (mis-scaled as RUB-копейки)


def upgrade() -> None:
    # 1. Reset rows still at the old default (preserve manual overrides).
    op.execute(
        sa.text(
            "UPDATE app_user SET spending_cap_cents = :new "
            "WHERE spending_cap_cents = :old"
        ).bindparams(new=NEW_DEFAULT, old=OLD_DEFAULT)
    )

    # 2. Change column default for new rows.
    op.alter_column(
        "app_user",
        "spending_cap_cents",
        server_default=str(NEW_DEFAULT),
    )


def downgrade() -> None:
    # Restore prior default. Existing rows that were migrated to 100 stay
    # at 100 (we don't know which were "manual 100" vs "auto-migrated 100").
    op.alter_column(
        "app_user",
        "spending_cap_cents",
        server_default=str(OLD_DEFAULT),
    )
