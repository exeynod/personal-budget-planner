"""data: zero out legacy plan_cents on INCOME categories

Revision ID: 0033_drop_income_limits
Revises: 0032_backfill_accounts
Create Date: 2026-06-08

WHY (data migration — UPDATE rows only, no DDL):
    SYSTEMIC invariant: an income category must NEVER carry a "limit" /
    plan-target entity. A ``plan_cents`` value is a spending CEILING — that
    concept only makes sense for EXPENSE categories. An income category has no
    ceiling, so a non-zero ``category.plan_cents`` on an income row is a
    deprecated, meaningless artifact.

    The single source of truth for a per-category monthly limit is
    ``category.plan_cents`` (the ``period_category_plan`` table is unused, 0
    rows). Some legacy income categories still hold a non-zero ``plan_cents``
    from before this rule was enforced. The service layer now rejects setting a
    non-zero plan_cents on an income category (``IncomeLimitForbiddenError``);
    this migration cleans up the pre-existing legacy data so it matches the
    invariant.

    ``category.plan_cents`` is ``BigInteger NOT NULL DEFAULT 0`` (see
    app/db/models.py / alembic 0028) — NOT nullable — so the "no limit" value
    is 0, not NULL.

IDEMPOTENT:
    The ``IS DISTINCT FROM 0`` guard means a re-run touches nothing once the
    income rows are already 0. The income enum literal is ``'income'`` of PG
    type ``category_kind`` (alembic 0014 split the old ``categorykind`` into a
    2-valued ``category_kind`` for categories + 4-valued ``actualkind`` for
    transactions).
"""
from __future__ import annotations

from alembic import op

revision = "0033_drop_income_limits"
down_revision = "0032_backfill_accounts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Zero out any legacy limit on income categories. plan_cents is NOT NULL
    # (default 0) so "no limit" == 0. IS DISTINCT FROM 0 keeps it idempotent.
    op.execute(
        """
        UPDATE category
        SET plan_cents = 0
        WHERE id IN (
            SELECT id FROM category WHERE kind = 'income'::category_kind
        )
          AND plan_cents IS DISTINCT FROM 0
        """
    )


def downgrade() -> None:
    # No-op by design. The old per-income plan_cents numbers are a DEPRECATED
    # concept (income must not have a limit) and are not recoverable: we did not
    # snapshot them. There is nothing meaningful to restore on downgrade.
    pass
