"""Phase 32 REQ-32-06: idempotent owner-role backfill (safety-net).

Revision ID: 0019_owner_backfill
Revises: 0018_cap_500
Create Date: 2026-05-11

Rationale:
  - v0.4 alembic 0006 уже backfill-ил OWNER_TG_ID → role='owner' во время
    initial multi-tenant rollout. Эта миграция — safety-net на случай,
    когда роль была изменена admin-tool'ом или ручным SQL.
  - Idempotent: no-op если уже owner. WHERE-clause проверяет tg_user_id
    AND role <> 'owner'.
  - OWNER_TG_ID берётся из ENV (`OWNER_TG_ID`). Если ENV не установлен
    или =0 — миграция логирует warning и skip-s (для dev/test без owner-config).
  - Downgrade: NO-OP. Унять role-owner без бизнес-логики = logical-pollution
    (нельзя восстановить «правильную» previous role без extra state).

Edge cases:
  - Multiple users with tg_user_id=OWNER_TG_ID: impossible — UNIQUE constraint.
  - User does not exist в DB: WHERE matches 0 rows — silent no-op.
  - User уже owner: WHERE role <> 'owner' filters out — no UPDATE.
"""
from __future__ import annotations

import os

from alembic import op


# revision identifiers, used by Alembic.
revision = "0019_owner_backfill"
down_revision = "0018_cap_500"
branch_labels = None
depends_on = None


def upgrade() -> None:
    owner_tg_id_raw = os.environ.get("OWNER_TG_ID", "0")
    try:
        owner_tg_id = int(owner_tg_id_raw)
    except (TypeError, ValueError):
        owner_tg_id = 0

    if owner_tg_id <= 0:
        # Dev / test path: no owner configured. Migration is no-op.
        # Production path: OWNER_TG_ID env должен быть set per HLD §7.
        op.execute(
            "DO $$ BEGIN RAISE NOTICE "
            "'0019_owner_backfill: OWNER_TG_ID not set, skipping owner-role backfill'; "
            "END $$"
        )
        return

    # Idempotent backfill: UPDATE only rows that aren't already owner.
    op.execute(
        "UPDATE app_user SET role = 'owner'::user_role "
        f"WHERE tg_user_id = {owner_tg_id} AND role <> 'owner'"
    )


def downgrade() -> None:
    # No-op: cannot reliably restore previous role without extra state.
    # Downgrade preserves data; only forward-compatible by design.
    pass
