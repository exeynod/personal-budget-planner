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
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from datetime import datetime, timedelta, timezone

from app.core.auth import validate_init_data
from app.core.settings import settings
from app.db.models import AppUser, AuthToken, UserRole

# R8 (Phase 67): get_db has a SINGLE canonical definition in app.db.session.
# Re-export it here so the historical import path
# ``from app.api.dependencies import get_db`` keeps working while there is only
# one function object (no duplicate session-lifecycle implementation to drift).
from app.db.session import get_db, set_tenant_scope

__all__ = [
    "get_db",
    "get_current_user",
    "get_current_user_id",
    "get_db_with_tenant_scope",
    "require_owner",
    "require_onboarded",
    "require_pro",
    "enforce_spending_cap",
    "enforce_spending_cap_for_user",
    "verify_internal_token",
]


async def _resolve_app_user(db: AsyncSession, tg_user_id: int) -> AppUser | None:
    """Look up AppUser ORM by tg_user_id (single SELECT)."""
    result = await db.execute(select(AppUser).where(AppUser.tg_user_id == tg_user_id))
    return result.scalar_one_or_none()


async def _dev_mode_resolve_owner(db: AsyncSession) -> AppUser:
    """DEV_MODE helper: upsert OWNER row with role=owner, return ORM.

    Reads settings.OWNER_TG_ID once for dev convenience — NOT a production
    auth check. This helper is called ONLY when settings.DEV_MODE is True.

    Always upgrades an existing row's role to owner (ON CONFLICT DO UPDATE).
    Test fixtures sometimes leave an OWNER_TG_ID row with role=member from
    a prior /me probe before seeding completes; ON CONFLICT DO NOTHING
    would silently leave that stale role in place and break dev_seed +
    onboarding flows that rely on the OWNER privilege.
    """
    tg_user_id = settings.OWNER_TG_ID
    # Phase 35 REQ-35-04: grant reverse-trial on initial INSERT only;
    # ON CONFLICT path leaves trial_ends_at untouched so a dev-restart of
    # an existing OWNER row does not refresh / extend the trial window.
    trial_ends = datetime.now(timezone.utc) + timedelta(days=14)
    stmt = (
        pg_insert(AppUser)
        .values(
            tg_user_id=tg_user_id,
            role=UserRole.owner,
            trial_ends_at=trial_ends,
        )
        .on_conflict_do_update(
            index_elements=["tg_user_id"],
            set_={"role": UserRole.owner},
        )
    )
    await db.execute(stmt)
    user = await _resolve_app_user(db, tg_user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="DEV_MODE: failed to upsert OWNER user",
        )
    return user


async def _resolve_bearer(db: AsyncSession, raw_authorization: str) -> AppUser | None:
    """Phase 17 (v0.6 IOSAUTH-01): Bearer token → AppUser.

    Возвращает AppUser если токен:
    - Имеет формат `Bearer <hex>` (при несовпадении — None, fallback на initData).
    - Найден в auth_token (по sha256 hash), не revoked.
    - Привязанный user не revoked.

    Side effect: обновляет last_used_at на каждой успешной auth (грубый
    audit-stream). Без Index update — таблица маленькая, write-amp низкий.

    Возвращает None если токен невалиден — caller (get_current_user) тогда
    либо fallback'ит на initData, либо рейзит 403.
    """
    import hashlib

    parts = raw_authorization.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None

    plaintext = parts[1].strip()
    if not plaintext:
        return None

    token_hash = hashlib.sha256(plaintext.encode("utf-8")).hexdigest()

    result = await db.execute(
        select(AppUser, AuthToken)
        .join(AuthToken, AuthToken.user_id == AppUser.id)
        .where(AuthToken.token_hash == token_hash)
        .where(AuthToken.revoked_at.is_(None))
    )
    row = result.first()
    if row is None:
        return None

    user, token = row
    if user.role == UserRole.revoked:
        return None
    if user.role not in (UserRole.owner, UserRole.member):
        return None

    token.last_used_at = datetime.now(timezone.utc)
    await db.flush()

    return user


async def _dev_mode_resolve_test_user(db: AsyncSession, tg_user_id: int) -> AppUser:
    """Phase 31 REG-01 helper: dev-only `X-Test-User` header → AppUser.

    Idempotent upsert on `tg_user_id` with `role=owner`. Used to allow
    Playwright fixtures (and any other dev-only integration test harness)
    to address a *specific* test user (e.g. 999000) instead of the single
    OWNER_TG_ID slot. Only invoked when ``settings.DEV_MODE is True`` —
    production codepath cannot reach this helper.

    The role choice mirrors ``_dev_mode_resolve_owner``: test fixtures need
    `owner` privilege so they can exercise admin-only routes if required.

    Phase 35 REQ-35-04: when this helper *inserts* a brand-new row (the user
    has never been seen before) the dev-only registration path becomes the
    de-facto onboarding entry point for Playwright/iOS-sim/local-dev users.
    Grant a 14-day reverse-trial (``trial_ends_at = NOW() + 14d``) on insert
    so downstream tier resolution treats new dev users the same way a
    production signup would. ON CONFLICT DO UPDATE deliberately does NOT
    touch ``trial_ends_at`` — re-resolving an existing user must not refresh
    or extend their trial window.
    """
    trial_ends = datetime.now(timezone.utc) + timedelta(days=14)
    stmt = (
        pg_insert(AppUser)
        .values(
            tg_user_id=tg_user_id,
            role=UserRole.owner,
            trial_ends_at=trial_ends,
        )
        .on_conflict_do_update(
            index_elements=["tg_user_id"],
            set_={"role": UserRole.owner},
        )
    )
    await db.execute(stmt)
    user = await _resolve_app_user(db, tg_user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="DEV_MODE: failed to upsert X-Test-User row",
        )
    return user


async def get_current_user(
    x_telegram_init_data: Annotated[str | None, Header()] = None,
    authorization: Annotated[str | None, Header()] = None,
    x_test_user: Annotated[str | None, Header()] = None,
    db: Annotated[AsyncSession, Depends(get_db)] = None,  # type: ignore[assignment]
) -> AppUser:
    """Validate auth credentials and return AppUser ORM (Phase 12 ROLE-02/03,
    extended in Phase 17 IOSAUTH-01 для Bearer-токенов от нативных клиентов).

    Auth precedence (Phase 17 + Phase 31 REG-01):
    1. **DEV-only**: ``X-Test-User: <tg_user_id>`` header, *only* when
       ``settings.DEV_MODE is True``. Bypasses HMAC, upserts AppUser by
       supplied tg_user_id (role=owner). Used by Playwright live-mode
       fixture (Phase 31-01) and ad-hoc integration tests. The header is
       **silently ignored** in production (DEV_MODE=false) — no error,
       no log, no behaviour change — so a leaked header from a malicious
       client cannot escalate.
    2. Authorization: Bearer <token> — нативный iOS-клиент. Lookup в
       auth_token, проверка revoked_at IS NULL, role IN (owner, member).
    3. X-Telegram-Init-Data — web Mini App. HMAC + role-based whitelist
       (legacy path, не сломан Phase 17 changes).

    DEV_MODE поведение (без изменений Phase 17):
    - DEV_MODE=true: skip HMAC, upsert OWNER row with role=owner, return ORM.
    - HMAC valid → resolve AppUser by tg_user_id:
        * row not found → 403 (Phase 14 onboarding will pre-create invitees).
        * role == revoked → 403 (revoked access).
        * role IN (owner, member) → return AppUser instance.
    - HMAC invalid / missing → 403.

    Returns: AppUser ORM. Downstream deps may read .id, .role, .tg_user_id, etc.
    """
    # ---------- Phase 31 REG-01: DEV-only X-Test-User bypass ----------
    # Highest precedence in DEV_MODE so a fixture can pin a specific test
    # user (e.g. tg_user_id=999000) without the OWNER_TG_ID auto-upsert
    # winning. Production path (DEV_MODE=false) skips this block entirely —
    # the header is effectively ignored, no information leak, no auth bypass.
    if settings.DEV_MODE and x_test_user:
        try:
            tg_user_id = int(x_test_user.strip())
        except (ValueError, AttributeError):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="X-Test-User must be an integer tg_user_id",
            )
        if tg_user_id <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="X-Test-User must be a positive integer",
            )
        return await _dev_mode_resolve_test_user(db, tg_user_id)

    # ---------- Phase 17: Bearer token (native iOS) ----------
    # Try Bearer first when Authorization header present. На успехе — return.
    # На неудаче — fallback на legacy initData paths (web-фронт остаётся жить).
    if authorization:
        bearer_user = await _resolve_bearer(db, authorization)
        if bearer_user is not None:
            return bearer_user

    # ---------- DEV_MODE: bypass HMAC, upsert OWNER row ----------
    # NOTE: OWNER_TG_ID is referenced from _dev_mode_resolve_owner (dev-only helper).
    # The production path below does NOT use OWNER_TG_ID — auth is role-based.
    #
    # ⇩ Phase 32 REQ-32-02 audit:
    #   - Production path (DEV_MODE=false) reads ONLY:
    #       initData → tg_user_id → SELECT FROM app_user → role check.
    #   - `OWNER_TG_ID` env var is ONLY a seed for `_dev_mode_resolve_owner`
    #     (DEV_MODE branch) and `dev_seed.py` / pytest fixtures. NO production
    #     branch (HMAC-validated init data) compares tg_user_id с OWNER_TG_ID
    #     directly — auth полностью основан на app_user.role (`owner` /
    #     `member` / `revoked`).
    #   - If a row with tg_user_id == OWNER_TG_ID does NOT exist в app_user,
    #     production path returns 403 — НЕТ implicit owner-bypass. See
    #     tests/test_no_owner_tg_id_in_prod.py for explicit regression cover.
    #
    # DEV_MODE behaviour:
    #   - No initData → bypass HMAC, return upserted OWNER (legacy convenience).
    #   - initData present → try HMAC validation; if it succeeds and the user
    #     exists in app_user with their declared role, return that user. This
    #     lets integration tests sign initData for a specific tg_user_id
    #     (member or owner) and exercise role-based gates like /admin/*
    #     without disabling DEV_MODE wholesale. If HMAC fails or no row
    #     exists, fall back to OWNER bypass — preserves the legacy
    #     auth_headers fixture path that seeds nothing and relied on the
    #     auto-OWNER convenience.
    if settings.DEV_MODE:
        if not x_telegram_init_data:
            return await _dev_mode_resolve_owner(db)
        try:
            tg_payload = validate_init_data(x_telegram_init_data, settings.BOT_TOKEN)
            tg_user_id = tg_payload.get("id")
            if isinstance(tg_user_id, int):
                resolved = await _resolve_app_user(db, tg_user_id)
                if resolved is not None and resolved.role != UserRole.revoked:
                    return resolved
        except ValueError:
            pass  # Fall through to OWNER bypass.
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


async def require_pro(
    user: Annotated[AppUser, Depends(get_current_user)],
) -> AppUser:
    """Gate endpoint behind Pro tier (Phase 35 REQ-35-02).

    Returns the user if they resolve to effective tier == ``pro`` (active
    subscription OR active reverse-trial), else raises HTTPException(402)
    with a structured detail so the frontend paywall UI can read the
    current tier and trial deadline.

    Pro evaluation delegated to :mod:`app.services.tier` so trial-vs-paid
    precedence stays in one place. Both ``trial_ends_at > now`` and
    ``pro_active_until > now`` evaluate as Pro.
    """
    from app.services.tier import effective_tier, is_pro

    if not is_pro(user):
        raise HTTPException(
            status_code=402,
            detail={
                "error": "PRO_TIER_REQUIRED",
                "message": "Эта функция доступна только в Pro-тарифе.",
                "current_tier": effective_tier(user),
                "trial_ends_at": (
                    user.trial_ends_at.isoformat() if user.trial_ends_at else None
                ),
            },
        )
    return user


async def enforce_spending_cap(
    current_user: Annotated[AppUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Gate AI endpoints behind monthly spend cap (Phase 15 AICAP-02).

    Per CONTEXT D-15-01: applied as router-level dependency on
    /api/v1/ai/* (chat) and /api/v1/ai/suggest-category. Aggregates
    monthly spend (cents) for current MSK month, compares to
    current_user.spending_cap_cents. On `spend >= cap` raises
    HTTPException(429) with structured detail and Retry-After.

    cap=0 semantics: any spend (>=0) trivially exceeds 0; AI fully off.
    Retry-After: seconds until next 1st 00:00 Europe/Moscow.

    NB: this dependency intentionally does NOT replace get_current_user
    or require_onboarded — chains are explicit at router level so each
    role-and-onboarding constraint surfaces independently.

    NOTE on db param: get_db (untenant-scoped) — we aggregate by user_id
    explicitly without RLS scope; ai_usage_log query filtered WHERE user_id=X.
    Plain get_db is cleaner than duplicating tenant scope setup here.
    """
    from app.services.spend_cap import (
        get_user_spend_cents,
        seconds_until_next_msk_month,
    )

    cap = int(current_user.spending_cap_cents or 0)
    spend = await get_user_spend_cents(db, user_id=current_user.id)
    if spend >= cap:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": "spending_cap_exceeded",
                "spent_cents": int(spend),
                "cap_cents": int(cap),
            },
            headers={"Retry-After": str(seconds_until_next_msk_month())},
        )


async def enforce_spending_cap_for_user(
    db: AsyncSession,
    *,
    user_id: int,
) -> None:
    """Imperative variant of enforce_spending_cap — for use INSIDE a per-user lock.

    CON-02 (Plan 16-07): the FastAPI router-level dependency
    ``enforce_spending_cap`` runs BEFORE ``acquire_user_spend_lock`` (because
    dependencies resolve before route body). That gives a fast-path 429 on
    obviously-over-cap requests but does NOT close the check-then-act race for
    requests still under cap at dependency-time.

    This function is meant to be called from inside ``async with lock`` in the
    ``/ai/chat`` route handler:

    1. invalidate the per-user TTLCache so we re-read post any concurrent
       ``_record_usage`` INSERT that just landed;
    2. re-aggregate ``ai_usage_log`` for the current MSK month;
    3. raise HTTPException(429) (same shape as ``enforce_spending_cap``) if
       spend >= cap.

    The DB session must already be tenant-scoped (the route uses
    ``get_db_with_tenant_scope`` which already calls ``set_tenant_scope``);
    this helper does not re-scope.
    """
    from app.services.spend_cap import (
        get_user_spend_cents,
        invalidate_user_spend_cache,
        seconds_until_next_msk_month,
    )

    # Force fresh read post-lock — another request may have just INSERTed
    # to ai_usage_log and released the lock.
    await invalidate_user_spend_cache(user_id)

    user = await db.scalar(select(AppUser).where(AppUser.id == user_id))
    cap = int((user.spending_cap_cents if user else None) or 0)
    spend = await get_user_spend_cents(db, user_id=user_id)
    if spend >= cap:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": "spending_cap_exceeded",
                "spent_cents": int(spend),
                "cap_cents": int(cap),
            },
            headers={"Retry-After": str(seconds_until_next_msk_month())},
        )


async def get_db_with_tenant_scope(
    db: Annotated[AsyncSession, Depends(get_db)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> AsyncSession:
    """Yield the request session with SET LOCAL app.current_user_id (Phase 11 MUL-02).

    F2 (perf): previously this dependency opened its **own** second
    ``AsyncSessionLocal()`` — so a single domain request did:

        1. get_current_user → ``get_db`` session → auth SELECT  (connection #1)
        2. get_db_with_tenant_scope → a *new* session → SET LOCAL  (connection #2)

    i.e. two pooled connections + two ``BEGIN`` + a redundant SET LOCAL
    round-trip before any useful work. We now reuse the SAME request-scoped
    session that ``get_current_user`` already opened (FastAPI caches the
    ``get_db`` dependency once per request), and simply set the tenant GUC on
    it. One connection, one transaction, one ``set_config`` round-trip.

    RLS semantics are preserved: ``set_tenant_scope`` issues
    ``SELECT set_config('app.current_user_id', :uid, true)`` (SET LOCAL —
    transaction-scoped) on this session BEFORE the route runs any domain
    query, exactly as before. The auth SELECT in ``get_current_user`` reads
    ``app_user``, which is deliberately OUTSIDE RLS scope (only the 9 domain
    tables carry the policy — see alembic 0006), so resolving the user before
    the scope is set cannot leak or be blocked. Commit/rollback are owned by
    the ``get_db`` generator's finalizer (single commit at request end), so we
    must NOT commit here — committing would clear the SET LOCAL GUC mid-request
    and break RLS for any subsequent query in the same handler.

    Untenant endpoints (/me, compliance, spend-cap aggregation) keep using
    plain ``get_db`` — they filter by user_id explicitly and need no GUC.
    """
    await set_tenant_scope(db, user_id)
    return db
