"""partial unique index on subscription.posted_txn_id (P1-2 / BE-F4)

Double-post race defence-in-depth: at most one subscription row may reference
a given posted ActualTransaction, and (because posted_txn_id is set to the
freshly-created txn id) this guarantees a subscription cannot be posted twice
with two distinct transactions slipping past the FOR UPDATE row lock.

PARTIAL index (WHERE posted_txn_id IS NOT NULL) so the many un-posted
subscriptions (posted_txn_id NULL) are exempt — NULLs are never compared by a
unique index anyway, but the partial predicate keeps the index small and the
intent explicit.
"""
from alembic import op
import sqlalchemy as sa

revision = "0025_sub_posted_txn_uq"
down_revision = "0024_analytics_event"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "uq_subscription_posted_txn_id",
        "subscription",
        ["posted_txn_id"],
        unique=True,
        postgresql_where=sa.text("posted_txn_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_subscription_posted_txn_id",
        table_name="subscription",
    )
