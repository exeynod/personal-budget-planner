"""/api/v1/internal/onboarding/reset endpoint (Phase 22, Plan 22.14, BE-15).

Admin-only reset path that wipes a user's v1.0-onboarding state so they can
re-run ``POST /api/v1/onboarding/complete``. Mounted under ``internal_router``
(prefix ``/internal``) which carries ``Depends(verify_internal_token)`` —
every request must present a valid ``X-Internal-Token`` header.

CONTEXT §Area 4: ``DELETE /api/v1/internal/onboarding/reset`` (admin-only).
CONTEXT §Area 3: wipe Account/Goal/SavingsConfig, plan_cents=0, reset
``User.income_cents=NULL`` для повторного onboarding в dev. Implementation
delegates to :func:`app.services.onboarding_v10.reset_v10`, which already
handles the per-user wipe in a single transaction (plan 22.11).

Edge protection:
- Caddy production config (``Caddyfile``, ``Caddyfile.cloudflare``) drops
  every external request matching ``/api/v1/internal/*`` with a 403 before
  it reaches FastAPI — verified during plan 22.14 review.
- ``verify_internal_token`` (inherited from ``internal_router``) compares the
  header against ``settings.INTERNAL_TOKEN`` via ``hmac.compare_digest``;
  bot/worker share the same secret over the docker network.
- This route additionally refuses to run when ``settings.INTERNAL_TOKEN`` is
  empty/placeholder (defense-in-depth: an unconfigured token must not silently
  allow every request that happens to send the header value ``""``).

Tenant scope:
    Admin reset operates on a target user_id supplied by the caller — there is
    no Telegram initData / Bearer token to identify the actor. We set the
    ``app.current_user_id`` GUC to the *target* user before invoking
    ``reset_v10`` so the RLS policies on ``account`` / ``goal`` /
    ``savings_config`` accept the DELETE statements (they check
    ``current_setting('app.current_user_id')::bigint == row.user_id``).

Request shape::

    DELETE /api/v1/internal/onboarding/reset?user_id=<int>
    X-Internal-Token: <secret>

Response (200 OK)::

    {"user_id": 1, "deleted_account_ids": [42, 43]}

Status codes:
    200: reset completed (idempotent — re-running on already-reset user yields
         empty ``deleted_account_ids``).
    403: missing / invalid X-Internal-Token (from ``verify_internal_token``).
    422: ``user_id`` query param missing (FastAPI default) or ``user_id <= 0``
         (this module's validator).
    503: ``INTERNAL_TOKEN`` not configured at app startup — defensive guard
         so a misconfigured deploy can't accidentally accept the empty
         header value.

Threat model (PLAN.md ``<threat_model>``):
    T-22-14-01 (spoofing) — mitigated via verify_internal_token + Caddy edge.
    T-22-14-02 (tampering, user_id=0/-1) — mitigated via explicit validator.
    T-22-14-04 (audit) — structlog binds ``user_id`` and ``deleted_count``.
"""
from __future__ import annotations

from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_db
from app.core.settings import settings
from app.db.session import set_tenant_scope
from app.services.onboarding_v10 import reset_v10


logger = structlog.get_logger(__name__)


# No router-level dependencies — they are inherited from the parent
# ``internal_router`` (``Depends(verify_internal_token)``) when included.
# Adding a duplicate here would double-execute the validator per request.
internal_onboarding_router = APIRouter(
    prefix="/onboarding",
    tags=["internal-onboarding"],
)


@internal_onboarding_router.delete(
    "/reset",
    status_code=status.HTTP_200_OK,
    responses={
        403: {"description": "Invalid or missing X-Internal-Token."},
        422: {"description": "user_id missing or non-positive."},
        503: {"description": "INTERNAL_TOKEN not configured."},
    },
)
async def reset_onboarding(
    db: Annotated[AsyncSession, Depends(get_db)],
    user_id: Annotated[
        int,
        Query(
            ...,
            description="AppUser.id whose v1.0-onboarding state to wipe.",
            gt=0,
        ),
    ],
) -> dict:
    """DELETE /api/v1/internal/onboarding/reset?user_id=<int> (BE-15 admin).

    Wipes Account / Goal / SavingsConfig rows for ``user_id``, zeros
    ``Category.plan_cents``, sets ``AppUser.income_cents = NULL`` and
    ``AppUser.onboarded_at = NULL``. Idempotent: re-running on an already-
    reset user is a no-op and returns ``deleted_account_ids: []``.

    Args:
        user_id: AppUser PK; query param.

    Returns:
        ``{"user_id": int, "deleted_account_ids": list[int]}``.

    Raises:
        HTTPException(503): ``INTERNAL_TOKEN`` not configured (placeholder /
            empty). Defense-in-depth — a misconfigured deploy must not
            accept reset requests.
        HTTPException(422): ``user_id <= 0`` (FastAPI returns 422 from
            ``Query(gt=0)`` validation; this body never runs in that case).
    """
    # Defense-in-depth: refuse to operate when the shared secret is unset or
    # still on the "changeme" placeholder. ``verify_internal_token`` would
    # technically still accept ``X-Internal-Token: changeme`` against a
    # ``changeme`` setting in dev, but reset is destructive enough that we
    # want a hard stop on misconfiguration before doing any DB writes.
    token = settings.INTERNAL_TOKEN or ""
    if token in ("", "changeme"):
        logger.error(
            "internal_onboarding_reset.token_not_configured",
            target_user_id=user_id,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="INTERNAL_TOKEN not configured; reset endpoint disabled",
        )

    # Set tenant GUC for the *target* user — RLS policies on account / goal /
    # savings_config check ``current_setting('app.current_user_id')`` against
    # the row's ``user_id``. Without this, the DELETE statements in
    # ``reset_v10`` would silently affect zero rows (RLS default-deny).
    await set_tenant_scope(db, user_id)

    try:
        result = await reset_v10(db, user_id=user_id)
    except Exception:  # noqa: BLE001 — surface any service failure as 500
        # WR-09 (Phase 22 review): structlog's ``logger.exception`` already
        # captures the active exception's type + traceback via exc_info,
        # so passing ``error=str(exc)`` only obscured the type. Drop the
        # named binding and let the structured log carry full context.
        logger.exception(
            "internal_onboarding_reset.failed",
            target_user_id=user_id,
        )
        raise

    deleted_ids = result.get("deleted_account_ids", [])
    logger.info(
        "internal_onboarding_reset.ok",
        target_user_id=user_id,
        deleted_account_count=len(deleted_ids),
        deleted_account_ids=deleted_ids,
    )
    return {"user_id": user_id, "deleted_account_ids": deleted_ids}


__all__ = ["internal_onboarding_router"]
