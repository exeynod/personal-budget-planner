"""Phase 32 REQ-32-03: bump AI spending_cap_cents default 100 -> 500 ($1 -> $5/mo).

Revision ID: 0018_cap_500
Revises: 0017_v10_account_id_composite_fk
Create Date: 2026-05-11

Rationale:
  - PRODUCT-STRATEGY v1.1 monetization foundation — $5/mo даёт
    comfortable headroom для conversational AI usage в paying tier.
  - Existing rows: leave untouched if cap уже > 100. Legacy 100-rows
    (default-inserted в v0.4-v1.0) bumped до 500 — invariant: existing
    users gain headroom, no surprise reduction.
  - Downgrade: SET DEFAULT 100 (symmetry); UPDATE НЕ перекидывает обратно
    (irreversible business decision; downgrade preserves data state).
"""
from __future__ import annotations

from alembic import op


# revision identifiers, used by Alembic.
revision = "0018_cap_500"
down_revision = "0017_v10_account_id_composite_fk"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Bump server_default.
    op.execute(
        "ALTER TABLE app_user "
        "ALTER COLUMN spending_cap_cents SET DEFAULT 500"
    )
    # 2. Update legacy rows whose cap was set by old default (100).
    #    Anything else (admin-customised) — preserve.
    op.execute(
        "UPDATE app_user SET spending_cap_cents = 500 "
        "WHERE spending_cap_cents = 100"
    )


def downgrade() -> None:
    # Restore default to 100 (symmetry). Existing rows NOT reverted —
    # downgrade preserves data; only schema-default changes.
    op.execute(
        "ALTER TABLE app_user "
        "ALTER COLUMN spending_cap_cents SET DEFAULT 100"
    )
