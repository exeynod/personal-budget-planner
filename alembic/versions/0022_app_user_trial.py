"""app_user reverse-trial + pro_active_until fields"""
from alembic import op
import sqlalchemy as sa

revision = "0022_app_user_trial"
down_revision = "0021_payment_billing"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE app_user ADD COLUMN trial_ends_at TIMESTAMPTZ NULL;")
    op.execute("ALTER TABLE app_user ADD COLUMN pro_active_until TIMESTAMPTZ NULL;")
    # Backfill: existing users get a 14-day trial starting NOW (one-time gift on upgrade).
    op.execute("UPDATE app_user SET trial_ends_at = NOW() + INTERVAL '14 days' WHERE trial_ends_at IS NULL;")


def downgrade() -> None:
    op.execute("ALTER TABLE app_user DROP COLUMN IF EXISTS pro_active_until;")
    op.execute("ALTER TABLE app_user DROP COLUMN IF EXISTS trial_ends_at;")
