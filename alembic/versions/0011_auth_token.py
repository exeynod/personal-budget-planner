"""auth_token: long-lived Bearer tokens для нативных клиентов (iOS, IOSAUTH-02)

Revision ID: 0011_auth_token
Revises: 0010_category_uq_active
Create Date: 2026-05-08

Phase 17 (v0.6 iOS App): web-фронт продолжает работать с TG initData
(X-Telegram-Init-Data). Native iOS-клиент не имеет доступа к initData,
поэтому добавляется альтернативный auth-механизм:

1. POST /api/v1/auth/dev-exchange (dev) принимает {secret} и при совпадении
   с DEV_AUTH_SECRET выдаёт случайный 64-char hex-токен для OWNER_TG_ID.
2. iOS шлёт его как Authorization: Bearer <token>; get_current_user (Plan 17-03)
   пробует Bearer первым, fallback на initData.

Хранится только sha256(token) — plaintext виден один раз в HTTP response.

ON DELETE CASCADE на user_id — при revoke flow (Phase 13 admin/users) токены
auto-purgeed без явного DELETE из service-слоя.

В Phase 21 dev-exchange будет заменён на TG Login Widget или Sign in with
Apple, но таблица AuthToken остаётся — она хранит "active sessions" для
любого механизма выдачи.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0011_auth_token"
down_revision = "0010_category_uq_active"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "auth_token",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column(
            "user_id",
            sa.BigInteger(),
            sa.ForeignKey("app_user.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("last_used_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.UniqueConstraint("token_hash", name="uq_auth_token_token_hash"),
    )
    op.create_index("ix_auth_token_token_hash", "auth_token", ["token_hash"])
    op.create_index("ix_auth_token_user", "auth_token", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_auth_token_user", table_name="auth_token")
    op.drop_index("ix_auth_token_token_hash", table_name="auth_token")
    op.drop_table("auth_token")
