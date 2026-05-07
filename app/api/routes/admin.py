"""Admin endpoints (Phase 13 ADM-03..06).

Owner-only via Depends(require_owner) at router level.
All endpoints under /api/v1/admin/* (mounted in app/api/router.py).

Endpoints:
  GET    /admin/users          list whitelist
  POST   /admin/users          invite by tg_user_id (creates role=member)
  DELETE /admin/users/{id}     revoke + cascade purge

Self-revoke (owner deleting own account) is forbidden — returns 403
with explicit detail. This guards against accidental admin lockout
(both UI hides the button AND backend enforces; defence in depth).

Plan 13-05 will extend this router with /admin/ai-usage breakdown.
"""
from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_db, require_owner
from app.api.schemas.admin import (
    AdminAiUsageResponse,
    AdminUserCreateRequest,
    AdminUserResponse,
)
from app.db.models import AppUser
from app.services import admin_ai_usage as ai_usage_svc
from app.services import admin_users as admin_svc

logger = logging.getLogger(__name__)

admin_router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(require_owner)],
)


@admin_router.get("/users", response_model=list[AdminUserResponse])
async def list_admin_users(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[AppUser]:
    """ADM-03 + ADM-06: список whitelist'а с last_seen_at.

    Sort: owner-first (закреплён вверху), затем members по `last_seen_at desc
    NULLS LAST`. Возвращает все строки `app_user` (≤ 50 в pet-scale).
    """
    return await admin_svc.list_users(db)


@admin_router.post(
    "/users",
    response_model=AdminUserResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_admin_user(
    payload: AdminUserCreateRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[AppUser, Depends(require_owner)],
) -> AppUser:
    """ADM-04 + ADM-06: invite by tg_user_id. 409 on duplicate.

    New row: role=member, onboarded_at=NULL, tg_chat_id=NULL.
    Phase 14 fills onboarded_at + tg_chat_id when invitee runs /start.
    """
    try:
        new_user = await admin_svc.invite_user(
            db, tg_user_id=payload.tg_user_id
        )
    except admin_svc.UserAlreadyExistsError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="tg_user_id already in whitelist",
        ) from exc
    logger.info(
        "audit.user_invited tg_user_id=%s new_id=%s by_owner=%s",
        payload.tg_user_id, new_user.id, current_user.id,
    )
    return new_user


@admin_router.delete(
    "/users/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_admin_user(
    user_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[AppUser, Depends(require_owner)],
) -> None:
    """ADM-05 + ADM-06: revoke + cascade purge.

    - Self-revoke forbidden (403) — guards against admin lockout.
    - Unknown user_id → 404.
    - Cascade purges 9 domain tables + ai_usage_log + AppUser row.
    - Logs structured `audit.user_revoked uid=… by_owner=… purged_rows={…}`
      line с per-table row counts (для ops-аудита; полная audit_log table
      deferred per CONTEXT.md).
    """
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Owner cannot revoke own account",
        )
    try:
        counts = await admin_svc.purge_user(db, user_id=user_id)
    except admin_svc.UserNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="user_id not found",
        ) from exc
    logger.info(
        "audit.user_revoked uid=%s by_owner=%s purged_rows=%s",
        user_id, current_user.id, counts,
    )


# ---------- AI Usage breakdown (AIUSE-01..03) ----------


@admin_router.get("/ai-usage", response_model=AdminAiUsageResponse)
async def admin_ai_usage(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AdminAiUsageResponse:
    """AIUSE-01..03: per-user AI usage breakdown.

    Returns каждого юзера в whitelist с:
      - current_month UsageBucket (от 1-го числа текущего месяца Europe/Moscow)
      - last_30d UsageBucket (последние 30 календарных дней UTC)
      - spending_cap_cents (Phase 13 stub default 46500 USD-копеек ≈ $5/мес)
      - est_cost_cents_current_month + pct_of_cap для UI warn/danger индикатора
        (≥ 0.80 → warn, ≥ 1.0 → danger в Plan 13-06 frontend)

    Sort: est_cost_cents_current_month desc; tg_user_id asc fallback.

    Authorization: router-level Depends(require_owner) → 403 для member.

    RLS bypass: Service открывает короткую SUPERUSER-session на
    ADMIN_DATABASE_URL для cross-tenant aggregation; runtime DSN видит
    только rows owner'а из-за RLS на ai_usage_log.
    """
    return await ai_usage_svc.build_admin_ai_usage_breakdown(db)
