"""v1.0 fix-up: composite FK on actual_transaction & subscription → account

Revision ID: 0017_v10_account_id_composite_fk
Revises: 0016_v10_actual_account_id
Create Date: 2026-05-10

Phase 22 review CR-03: migrations 0014 (subscription.account_id) and 0016
(actual_transaction.account_id) introduced *simple* FKs to ``account.id``
only. The rest of Phase 22 carefully built a same-tenant guarantee through
composite FKs:

  * 0013 — ``category(parent_id, user_id) → category(id, user_id)``
  * 0015 — ``actual_transaction(parent_txn_id, user_id) →
            actual_transaction(id, user_id)``

…but the two ``account_id`` FKs above were left simple, defeating the
cross-tenant guarantee on the ``account`` link itself. A compromised app
layer could insert ``actual_transaction(user_id=A, account_id=<acct of
user B>)``: RLS on ``account`` blocks the SELECT, but FK alone does not
enforce same-tenant.

Mitigation (Phase 22 BE-16 surface): make both FKs composite, pointing at
``account(id, user_id)``. Requires a composite UNIQUE on ``account`` first
(Postgres requires the FK target to be UNIQUE or PK on the referenced
column tuple).

Steps:
  1. Add ``UNIQUE(id, user_id)`` on ``account``  (``ux_account_id_user``).
     ``id`` is already PK so this UNIQUE is "free" data-wise — it only
     adds an index and serves as an FK target.
  2. Drop simple FK ``fk_actual_account``; add composite
     ``fk_actual_account_composite (account_id, user_id) →
     account(id, user_id) ON DELETE RESTRICT``.
  3. Drop simple FK ``fk_subscription_account``; add composite
     ``fk_subscription_account_composite (account_id, user_id) →
     account(id, user_id) ON DELETE RESTRICT``.

The downgrade is symmetric: drop the composite FKs, recreate the simple
ones, drop the unique constraint.

No data migration required — every existing
``actual_transaction.user_id`` / ``subscription.user_id`` already matches
the corresponding ``account.user_id`` (single-tenant prod, plus the v1.0
service layer never crosses the tenant boundary). On a misconfigured row,
the migration would fail at the composite-FK creation step — that is the
intended safety net.
"""
from __future__ import annotations

from alembic import op


revision = "0017_v10_account_id_composite_fk"
down_revision = "0016_v10_actual_account_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Composite UNIQUE on account (target of composite FK).
    op.create_unique_constraint(
        "ux_account_id_user",
        "account",
        ["id", "user_id"],
    )

    # 2. actual_transaction.account_id: simple → composite.
    op.drop_constraint(
        "fk_actual_account",
        "actual_transaction",
        type_="foreignkey",
    )
    op.execute(
        "ALTER TABLE actual_transaction "
        "ADD CONSTRAINT fk_actual_account_composite "
        "FOREIGN KEY (account_id, user_id) "
        "REFERENCES account (id, user_id) "
        "ON DELETE RESTRICT"
    )

    # 3. subscription.account_id: simple → composite.
    op.drop_constraint(
        "fk_subscription_account",
        "subscription",
        type_="foreignkey",
    )
    op.execute(
        "ALTER TABLE subscription "
        "ADD CONSTRAINT fk_subscription_account_composite "
        "FOREIGN KEY (account_id, user_id) "
        "REFERENCES account (id, user_id) "
        "ON DELETE RESTRICT"
    )


def downgrade() -> None:
    # Reverse order: drop composite FKs, recreate simple FKs, drop unique.
    op.drop_constraint(
        "fk_subscription_account_composite",
        "subscription",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "fk_subscription_account",
        "subscription",
        "account",
        ["account_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    op.drop_constraint(
        "fk_actual_account_composite",
        "actual_transaction",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "fk_actual_account",
        "actual_transaction",
        "account",
        ["account_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    op.drop_constraint(
        "ux_account_id_user",
        "account",
        type_="unique",
    )
