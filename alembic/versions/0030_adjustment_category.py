"""balance-adjustment system category backfill (H — корректировка остатка)

Balance reconcile (AGREED §H) writes an ordinary ``actual_transaction`` whose
sign = (real − computed) balance, so ``balance_now_cents`` becomes the entered
value. To keep that record OUT of the plan/fact ladder it lands on a system
category ``code='adjustment'`` that ``compute_balance`` excludes (alongside
``savings``). No new tables/columns/enum values — pure data backfill.

This migration seeds the ``adjustment`` category for every EXISTING user
(idempotent on ``(user_id, code='adjustment')``). New users get it in
onboarding (``services/onboarding_v10._upsert_adjustment_category``).

Runs BEFORE 0031 (REMOVALS) so ``category.rollover`` / ``category.paused``
columns still exist here — we set them to their default values for the seed.
"""

from alembic import op
import sqlalchemy as sa


revision = "0030_adjustment_category"
down_revision = "0029_planned_posted_txn"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Idempotent backfill — one adjustment category per user that doesn't
    # already have one. Columns rollover/paused/tag still exist at 0030.
    op.execute(
        sa.text(
            """
            INSERT INTO category
                (user_id, name, code, ord, kind, plan_cents, sort_order,
                 rollover, paused, tag, is_archived, created_at)
            SELECT u.id, 'Корректировка', 'adjustment', '98',
                   'expense'::category_kind, 0, 98,
                   'misc', false, 'personal', false, now()
            FROM app_user u
            WHERE NOT EXISTS (
                SELECT 1 FROM category c
                WHERE c.user_id = u.id AND c.code = 'adjustment'
            )
            """
        )
    )


def downgrade() -> None:
    # Best-effort: drop the seeded adjustment categories that have no
    # referencing actual_transaction rows (FK RESTRICT would block otherwise —
    # leave referenced ones in place, harmless dead rows).
    op.execute(
        sa.text(
            """
            DELETE FROM category c
            WHERE c.code = 'adjustment'
              AND NOT EXISTS (
                SELECT 1 FROM actual_transaction a WHERE a.category_id = c.id
              )
              AND NOT EXISTS (
                SELECT 1 FROM planned_transaction p WHERE p.category_id = c.id
              )
            """
        )
    )
