"""Phase 33 CMP-33-01: ПДн consent + soft-delete + audit log.

Revision ID: 0020_pdn_compliance
Revises: 0019_owner_backfill
Create Date: 2026-05-11

Schema changes:
  1. app_user.pdn_consent_at TIMESTAMPTZ NULL — timestamp of ПДн consent grant.
  2. app_user.deleted_at TIMESTAMPTZ NULL — soft-delete (30-day cooling per CMP-33-02).
  3. NEW ENUM pdn_audit_event: granted / revoked / data_export /
     deletion_requested / deletion_completed.
  4. NEW TABLE pdn_audit_log: id BIGSERIAL PK, user_id_hash VARCHAR(64),
     event_type pdn_audit_event, occurred_at TIMESTAMPTZ DEFAULT now(),
     ip_hash VARCHAR(64) NULL, metadata JSONB NULL.
  5. Composite index (event_type, occurred_at DESC) for time-bucketed queries.
  6. GIN index on metadata for JSONB filtering.

RLS: pdn_audit_log is single-tenant audit (owner-only read). RLS NOT enabled —
no current_user_id GUC filter applies. Reads happen via admin-tooling under
`budget_admin` role.

Downgrade:
  - DROP TABLE pdn_audit_log;
  - DROP TYPE pdn_audit_event;
  - ALTER TABLE app_user DROP COLUMN deleted_at;
  - ALTER TABLE app_user DROP COLUMN pdn_consent_at;
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "0020_pdn_compliance"
down_revision = "0019_owner_backfill"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. + 2. app_user new columns
    op.add_column(
        "app_user",
        sa.Column("pdn_consent_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )
    op.add_column(
        "app_user",
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )

    # 3. ENUM type
    pdn_audit_event = postgresql.ENUM(
        "granted",
        "revoked",
        "data_export",
        "deletion_requested",
        "deletion_completed",
        name="pdn_audit_event",
    )
    pdn_audit_event.create(op.get_bind(), checkfirst=True)

    # 4. table
    op.create_table(
        "pdn_audit_log",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("user_id_hash", sa.String(64), nullable=False),
        sa.Column(
            "event_type",
            postgresql.ENUM(
                "granted",
                "revoked",
                "data_export",
                "deletion_requested",
                "deletion_completed",
                name="pdn_audit_event",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "occurred_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("ip_hash", sa.String(64), nullable=True),
        sa.Column("metadata", postgresql.JSONB, nullable=True),
    )

    # 5. composite index — event_type + occurred_at DESC
    op.create_index(
        "ix_pdn_audit_log_event_occurred",
        "pdn_audit_log",
        ["event_type", sa.text("occurred_at DESC")],
    )
    # 6. GIN index on metadata
    op.create_index(
        "ix_pdn_audit_log_metadata_gin",
        "pdn_audit_log",
        ["metadata"],
        postgresql_using="gin",
    )
    # User-id hash index for "all events of this user" queries.
    op.create_index(
        "ix_pdn_audit_log_user_id_hash",
        "pdn_audit_log",
        ["user_id_hash"],
    )


def downgrade() -> None:
    op.drop_index("ix_pdn_audit_log_user_id_hash", table_name="pdn_audit_log")
    op.drop_index("ix_pdn_audit_log_metadata_gin", table_name="pdn_audit_log")
    op.drop_index("ix_pdn_audit_log_event_occurred", table_name="pdn_audit_log")
    op.drop_table("pdn_audit_log")
    pdn_audit_event = postgresql.ENUM(name="pdn_audit_event")
    pdn_audit_event.drop(op.get_bind(), checkfirst=True)
    op.drop_column("app_user", "deleted_at")
    op.drop_column("app_user", "pdn_consent_at")
