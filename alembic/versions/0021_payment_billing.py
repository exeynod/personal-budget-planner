"""Phase 34 REQ-34-01: payment + subscription_billing schema + RLS.

Revision ID: 0021_payment_billing
Revises: 0020_pdn_compliance
Create Date: 2026-05-11

Schema changes:
  1. NEW TABLE payment — YooKassa payment records with idempotency
     (yookassa_payment_id UNIQUE), lifecycle status, JSONB metadata.
  2. NEW TABLE subscription_billing — per-period billing intervals linking
     a user to an optional payment with tier (free/pro), period [start, end),
     status (active/past_due/canceled/expired). At most one active row per
     user is enforced by partial unique index.

FK convention note:
  Spec asked for FK → app_user(tg_user_id). Existing codebase RLS policies
  use the GUC `app.current_user_id` which is set to app_user.id (PK BIGINT),
  not tg_user_id (see app/db/session.py:63 and app/api/dependencies.py:330).
  All other multi-tenant tables (0006_multitenancy, 0012_v10_user_account)
  FK to app_user(id) ON DELETE RESTRICT/CASCADE. We follow that convention
  here — FK → app_user(id) — so RLS policies can re-use the existing GUC
  without a tg_user_id translation step. Cascade semantics preserved per
  spec intent (delete user → delete payments/billings).

RLS:
  Both tables get ENABLE + FORCE ROW LEVEL SECURITY + tenant_isolation_*
  policy mirroring 0012_v10_user_account pattern (USING + WITH CHECK with
  coalesce(NULLIF(current_setting,'')::bigint, -1)).

Downgrade:
  Drops policies, RLS, indexes, tables in reverse order (subscription_billing
  first due to FK → payment).
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0021_payment_billing"
down_revision = "0020_pdn_compliance"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ─── Step 1: CREATE TABLE payment ───
    op.execute(
        """
        CREATE TABLE payment (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
            yookassa_payment_id VARCHAR(64) NOT NULL UNIQUE,
            amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
            status VARCHAR(20) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','succeeded','canceled','refunded')),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            paid_at TIMESTAMPTZ,
            refunded_at TIMESTAMPTZ,
            metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb
        )
        """
    )
    op.execute("CREATE INDEX ix_payment_user_id ON payment(user_id)")
    op.execute("CREATE INDEX ix_payment_status ON payment(status)")
    # yookassa_payment_id UNIQUE constraint already creates the unique index.

    # ─── Step 2: CREATE TABLE subscription_billing ───
    op.execute(
        """
        CREATE TABLE subscription_billing (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
            tier VARCHAR(20) NOT NULL DEFAULT 'free'
                CHECK (tier IN ('free','pro')),
            period_start DATE NOT NULL,
            period_end DATE NOT NULL,
            payment_id BIGINT REFERENCES payment(id) ON DELETE SET NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','past_due','canceled','expired')),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT subscription_billing_period_check CHECK (period_end > period_start)
        )
        """
    )
    op.execute("CREATE INDEX ix_subscription_billing_user_id ON subscription_billing(user_id)")
    op.execute(
        "CREATE INDEX ix_subscription_billing_status_period_end "
        "ON subscription_billing(status, period_end)"
    )
    op.execute(
        "CREATE UNIQUE INDEX subscription_billing_one_active "
        "ON subscription_billing(user_id) WHERE status = 'active'"
    )

    # ─── Step 3: RLS — payment ───
    op.execute("ALTER TABLE payment ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE payment FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_isolation_payment ON payment "
        "USING (user_id = coalesce(NULLIF(current_setting('app.current_user_id', true), '')::bigint, -1)) "
        "WITH CHECK (user_id = coalesce(NULLIF(current_setting('app.current_user_id', true), '')::bigint, -1))"
    )

    # ─── Step 4: RLS — subscription_billing ───
    op.execute("ALTER TABLE subscription_billing ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE subscription_billing FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_isolation_subscription_billing ON subscription_billing "
        "USING (user_id = coalesce(NULLIF(current_setting('app.current_user_id', true), '')::bigint, -1)) "
        "WITH CHECK (user_id = coalesce(NULLIF(current_setting('app.current_user_id', true), '')::bigint, -1))"
    )

    # ─── Step 5: explicit GRANTs to budget_app role ───
    # Mirrors 0012_v10_user_account pattern — defence against manually-revoked
    # default privileges in prod (idempotent re-grant).
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE payment TO budget_app")
    op.execute("GRANT USAGE, SELECT ON SEQUENCE payment_id_seq TO budget_app")
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE subscription_billing TO budget_app")
    op.execute("GRANT USAGE, SELECT ON SEQUENCE subscription_billing_id_seq TO budget_app")


def downgrade() -> None:
    # subscription_billing first (FK → payment).
    op.execute("REVOKE ALL ON TABLE subscription_billing FROM budget_app")
    op.execute("DROP POLICY IF EXISTS tenant_isolation_subscription_billing ON subscription_billing")
    op.execute("ALTER TABLE subscription_billing NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE subscription_billing DISABLE ROW LEVEL SECURITY")
    op.execute("DROP INDEX IF EXISTS subscription_billing_one_active")
    op.execute("DROP INDEX IF EXISTS ix_subscription_billing_status_period_end")
    op.execute("DROP INDEX IF EXISTS ix_subscription_billing_user_id")
    op.execute("DROP TABLE IF EXISTS subscription_billing")

    op.execute("REVOKE ALL ON TABLE payment FROM budget_app")
    op.execute("DROP POLICY IF EXISTS tenant_isolation_payment ON payment")
    op.execute("ALTER TABLE payment NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE payment DISABLE ROW LEVEL SECURITY")
    op.execute("DROP INDEX IF EXISTS ix_payment_status")
    op.execute("DROP INDEX IF EXISTS ix_payment_user_id")
    op.execute("DROP TABLE IF EXISTS payment")
