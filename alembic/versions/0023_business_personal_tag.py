"""business/personal tags for Persona E (самозанятые)"""
from alembic import op
import sqlalchemy as sa

revision = "0023_business_personal_tag"
down_revision = "0022_app_user_trial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Tag values: 'personal' (default) | 'business' | 'mixed'.
    op.execute("ALTER TABLE category ADD COLUMN tag VARCHAR(16) NOT NULL DEFAULT 'personal' CHECK (tag IN ('personal','business','mixed'));")
    op.execute("ALTER TABLE actual_transaction ADD COLUMN tag VARCHAR(16) NULL CHECK (tag IS NULL OR tag IN ('personal','business','mixed'));")
    # Index for filtering tax-deductible business transactions:
    op.execute("CREATE INDEX IF NOT EXISTS ix_actual_transaction_tag ON actual_transaction(user_id, tag) WHERE tag = 'business';")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_actual_transaction_tag;")
    op.execute("ALTER TABLE actual_transaction DROP COLUMN IF EXISTS tag;")
    op.execute("ALTER TABLE category DROP COLUMN IF EXISTS tag;")
