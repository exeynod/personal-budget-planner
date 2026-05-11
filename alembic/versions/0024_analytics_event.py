"""analytics event log for funnel + kill-metric tracking (Phase 38-02, REQ-38-02)"""
from alembic import op

revision = "0024_analytics_event"
down_revision = "0023_business_personal_tag"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # asyncpg запрещает multi-statement в одном prepared statement,
    # поэтому каждый DDL execute'им отдельным вызовом.
    op.execute(
        "CREATE TABLE analytics_event ("
        "  id BIGSERIAL PRIMARY KEY,"
        "  user_id BIGINT REFERENCES app_user(id) ON DELETE SET NULL,"
        "  event_name VARCHAR(64) NOT NULL,"
        "  event_props JSONB NOT NULL DEFAULT '{}'::jsonb,"
        "  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()"
        ")"
    )
    op.execute("CREATE INDEX ix_analytics_event_user_id ON analytics_event(user_id)")
    op.execute("CREATE INDEX ix_analytics_event_event_name ON analytics_event(event_name)")
    op.execute("CREATE INDEX ix_analytics_event_created_at ON analytics_event(created_at)")
    # No RLS — этот лог для внутренней аналитики, не tenant-scoped (anonymized).
    op.execute("GRANT SELECT, INSERT ON analytics_event TO budget_app")
    op.execute("GRANT USAGE, SELECT ON SEQUENCE analytics_event_id_seq TO budget_app")


def downgrade() -> None:
    op.execute(
        "DO $$ BEGIN "
        "IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'budget_app') "
        "THEN "
        "  REVOKE ALL ON analytics_event FROM budget_app; "
        "  REVOKE ALL ON SEQUENCE analytics_event_id_seq FROM budget_app; "
        "END IF; "
        "END $$;"
    )
    op.execute("DROP TABLE IF EXISTS analytics_event CASCADE;")
