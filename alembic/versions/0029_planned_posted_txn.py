"""planned_transaction.posted_txn_id — bridge план↔факт (AGREED §B / BACKEND-PLAN §1 0029)

Mirror of ``Subscription.posted_txn_id`` (0025): a nullable FK from a planned
row to the ``actual_transaction`` it was posted as, ON DELETE SET NULL (deleting
the actual reverts the planned row to "not posted"). A PARTIAL unique index
(WHERE posted_txn_id IS NOT NULL) guarantees one actual cannot be linked to two
planned rows — belt-and-braces for the post-race.

``planned_transaction`` is already under RLS (created 0001, ENABLE 0006); the
new nullable column inherits the existing policy — no extra DDL required.
"""

from alembic import op
import sqlalchemy as sa


revision = "0029_planned_posted_txn"
down_revision = "0028_planning_rework_add"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "planned_transaction",
        sa.Column("posted_txn_id", sa.BigInteger(), nullable=True),
    )
    op.create_foreign_key(
        "fk_planned_posted_txn",
        "planned_transaction",
        "actual_transaction",
        ["posted_txn_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "uq_planned_posted_txn_id",
        "planned_transaction",
        ["posted_txn_id"],
        unique=True,
        postgresql_where=sa.text("posted_txn_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_planned_posted_txn_id", table_name="planned_transaction")
    op.drop_constraint(
        "fk_planned_posted_txn", "planned_transaction", type_="foreignkey"
    )
    op.drop_column("planned_transaction", "posted_txn_id")
