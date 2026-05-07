"""FastAPI dependencies for authentication and authorization.

Phase 12 refactor (ROLE-02, ROLE-03, ROLE-04):
- get_current_user resolves AppUser ORM by tg_user_id; rejects revoked + unknown.
- require_owner enforces role=='owner' for admin-only endpoints (Phase 13+).
- get_current_user_id reads from resolved AppUser (single SELECT, no round-trip).

Phase 14 refactor (MTONB-04):
- require_onboarded gates domain endpoints; returns 409 onboarding_required
  when current_user.onboarded_at IS NULL.

Security design (HLD §7 + Phase 12 CONTEXT):
- Public endpoints (/api/v1/*): require valid Telegram initData + role IN (owner, member).
- Internal endpoints (/api/v1/internal/*): require X-Internal-Token (no role).
- DEV_MODE=true: bypass HMAC, upsert mock OWNER row with role=owner (D-05 carry-over).
"""
from __future__ import annotations

import hmac
from typing import Annotated, AsyncGenerator

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import validate_init_data
from app.core.settings import settings
from app.db.models import AppUser, UserRole
from app.db.session import AsyncSessionLocal, set_tenant_scope


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async DB session with automatic commit/rollback."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def _resolve_app_user(db: AsyncSession, tg_user_id: int) -> AppUser | None:
    """Look up AppUser ORM by tg_user_id (single SELECT)."""
    result = await db.execute(
        select(AppUser).where(AppUser.tg_user_id == tg_user_id)
    )
    return result.scalar_one_or_none()


async def _dev_mode_resolve_owner(db: AsyncSession) -> AppUser:
    """DEV_MODE helper: upsert OWNER row with role=owner, return ORM.

    Reads settings.OWNER_TG_ID once for dev convenience — NOT a production
    auth check. This helper is called ONLY when settings.DEV_MODE is True.
    """
    tg_user_id = settings.OWNER_TG_ID
    stmt = (
        pg_insert(AppUser)
        .values(tg_user_id=tg_user_id, role=UserRole.owner)
        .on_conflict_do_nothing(index_elements=["tg_user_id"])
    )
    await db.execute(stmt)
    user = await _resolve_app_user(db, tg_user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="DEV_MODE: failed to upsert OWNER user",
        )
    return user


async def get_current_user(
    x_telegram_init_data: Annotated[str | None, Header()] = None,
    db: Annotated[AsyncSession, Depends(get_db)] = None,  # type: ignore[assignment]
) -> AppUser:
    """Validate Telegram initData and return AppUser ORM (Phase 12 ROLE-02/03).

    Behaviour:
    - DEV_MODE=true: skip HMAC, upsert OWNER row with role=owner, return ORM.
    - HMAC valid → resolve AppUser by tg_user_id:
        * row not found → 403 (Phase 14 onboarding will pre-create invitees).
        * role == revoked → 403 (revoked access).
        * role IN (owner, member) → return AppUser instance.
    - HMAC invalid / missing → 403.

    Returns: AppUser ORM. Downstream deps may read .id, .role, .tg_user_id, etc.
    """
    # ---------- DEV_MODE: bypass HMAC, upsert OWNER row ----------
    # NOTE: OWNER_TG_ID is referenced from _dev_mode_resolve_owner (dev-only helper).
    # The production path below does NOT use OWNER_TG_ID — auth is role-based.
    if settings.DEV_MODE:
        return await _dev_mode_resolve_owner(db)

    # ---------- Production path: HMAC + role-based whitelist ----------
    if not x_telegram_init_data:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Missing X-Telegram-Init-Data header",
        )

    try:
        tg_payload = validate_init_data(x_telegram_init_data, settings.BOT_TOKEN)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc

    tg_user_id = tg_payload.get("id")
    if not isinstance(tg_user_id, int):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="initData missing user id",
        )

    user = await _resolve_app_user(db, tg_user_id)
    if user is None:
        # Unknown tg_user_id: no whitelist entry. Generic 403 detail —
        # do not distinguish "unknown" vs "revoked" (info disclosure).
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized",
        )

    if user.role == UserRole.revoked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized",
        )

    if user.role not in (UserRole.owner, UserRole.member):
        # Defensive: enum invariant violated.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized",
        )

    return user


async def verify_internal_token(
    x_internal_token: Annotated[str | None, Header()] = None,
) -> None:
    """Validate X-Internal-Token for /api/v1/internal/* endpoints (HLD §7.3)."""
    if not x_internal_token or not hmac.compare_digest(
        x_internal_token, settings.INTERNAL_TOKEN
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or missing X-Internal-Token",
        )


async def get_current_user_id(
    current_user: Annotated[AppUser, Depends(get_current_user)],
) -> int:
    """Return app_user.id (PK BIGINT) for the current user (Phase 12 refactor).

    Reads the resolved AppUser ORM from get_current_user — no extra SELECT.
    FastAPI dependency cache guarantees a single get_current_user execution
    per request, so callers chain freely.
    """
    return current_user.id


async def require_owner(
    current_user: Annotated[AppUser, Depends(get_current_user)],
) -> AppUser:
    """Enforce role == owner; reject member with 403 (Phase 12 ROLE-04).

    Used as additional Depends on admin-only endpoints. Phase 13 will register
    admin routes under /api/v1/admin/* with `Depends(require_owner)`.

    For non-admin routes, get_current_user is sufficient (member is allowed).
    """
    if current_user.role != UserRole.owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Owner role required for this endpoint",
        )
    return current_user


async def require_onboarded(
    current_user: Annotated[AppUser, Depends(get_current_user)],
) -> AppUser:
    """Gate domain endpoints behind completed onboarding (Phase 14 MTONB-04, D-14-01).

    Raises HTTPException(409) with onboarding_required error detail
    when current_user.onboarded_at IS NULL. Used as a router-level
    dependency on /categories, /actual, /planned, /templates,
    /subscriptions, /periods, /analytics, /ai, /ai/suggest-category,
    /settings.

    NOT applied to:
    - /me                      (frontend uses it to drive routing)
    - /onboarding/*            (target of redirect)
    - /internal/*              (X-Internal-Token, no user context)
    - /admin/*                 (require_owner; owner is always onboarded)
    - /health                  (infra probe)

    Returns the same AppUser passed in so dependency chains can re-use
    without an additional SELECT (FastAPI dep cache deduplicates
    get_current_user across the request).
    """
    if current_user.onboarded_at is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": "onboarding_required"},
        )
    return current_user


async def get_db_with_tenant_scope(
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> AsyncGenerator[AsyncSession, None]:
    """Yield AsyncSession with SET LOCAL app.current_user_id (Phase 11 MUL-02).

    Unchanged from Phase 11. SET LOCAL = transaction-scoped GUC; reset on
    COMMIT or ROLLBACK. Used for routes whose queries must be tenant-scoped
    via RLS + app filter.
    """
    async with AsyncSessionLocal() as session:
        try:
            await set_tenant_scope(session, user_id)
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
