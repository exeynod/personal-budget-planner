"""v1.0 fix-up: actual_transaction.account_id (Phase 22 BE-07 prerequisite)

Revision ID: 0016_v10_actual_account_id
Revises: 0015_v10_rls_finalize
Create Date: 2026-05-10

Schema gap recorded in plan 22.05/22.06 SUMMARY: ``actual_transaction.account_id``
was not added in migration 0014 even though plan 22.07 (roundup) and 22.13
(routers) need it for:

  * roundup child txn inheriting parent.account_id (DATA-MODEL §4)
  * direct ``apply_balance_delta`` calls during txn create / delete
  * delete-protection on Account (refuse delete if any actual_transaction
    references the account — currently guarded only against subscription refs)

This migration is the smallest possible fix: add the column + FK + index.
No data backfill is needed — column is NULL-able and existing rows will
simply have ``account_id IS NULL`` (legacy txns not associated with any
account, which is correct semantics for v0.x history).

Per CONTEXT §Area 2 trust delta-accounting: account.balance_cents is
maintained by the service layer; this migration only adds the FK
infrastructure so the service layer has a column to point to.

Threat dispositions inherited from plan 22.06's threat register:
  T-22-06-05 (Delete leaving orphan txns) → mitigated once this column
    lands; the ``hasattr`` probe in ``delete_account`` activates the
    actual_transaction.account_id ref check automatically.

Naming:
  - Constraint:  fk_actual_account
  - Index:       ix_actual_account_id (regular, NOT partial — most txns
                 will have a non-NULL account_id once 22.07 + 22.11 ship)
  - ON DELETE RESTRICT — нельзя удалить account, если есть факт-транзакции
                 на нём. Service-layer raises AccountHasTxnsError(409)
                 before reaching DB constraint.

Downgrade is symmetric: drop FK, drop index, drop column.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0016_v10_actual_account_id"
down_revision = "0015_v10_rls_finalize"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "actual_transaction",
        sa.Column("account_id", sa.BigInteger(), nullable=True),
    )
    op.create_foreign_key(
        "fk_actual_account",
        "actual_transaction",
        "account",
        ["account_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        "ix_actual_account_id",
        "actual_transaction",
        ["account_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_actual_account_id", table_name="actual_transaction")
    op.drop_constraint(
        "fk_actual_account",
        "actual_transaction",
        type_="foreignkey",
    )
    op.drop_column("actual_transaction", "account_id")
