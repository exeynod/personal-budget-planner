"""Onboarding orchestration (ONB-01, PER-02, CAT-03).

Performs five steps atomically (all-or-nothing via the request-scoped DB
transaction held by ``get_db``):

  1. Verify user not already onboarded (``AlreadyOnboardedError`` → 409).
  2. Optionally seed default categories (idempotent inside service).
  3. Create the first budget period using ``period_for(today_msk, cycle_start_day)``.
  4. Set ``user.cycle_start_day`` + ``user.onboarded_at = now()``.
  5. Phase 14 (MTONB-03): backfill seed-category embeddings for AI suggest
     cold-start. Wrapped in try/except — provider failure does NOT roll
     back onboarding (returns embeddings_created=0).

If any step raises (excluding step 5's provider failure), the surrounding
transaction is rolled back by the ``get_db`` dependency — no partial
onboarding state is persisted.
This covers the T-onboarding-atomicity threat from 02-VALIDATION.md.

Service layer is HTTP-framework-agnostic: raises domain exceptions
(``AlreadyOnboardedError``, ``OnboardingUserNotFoundError``) which the
route layer (Plan 02-04) maps to 409 / 404 respectively.

Phase 11 (Plan 11-05): the *external* signature still accepts
``tg_user_id: int`` (legacy contract for the route layer — the OWNER_TG_ID
flow has not been replaced by role-based auth yet, that's Phase 12).
INTERNALLY we resolve ``app_user.id`` PK from the tg_user_id lookup and
forward it to the per-tenant service calls (``seed_default_categories``,
``create_first_period``) so newly-created Category / BudgetPeriod rows
get the correct ``user_id`` (T-11-05-04).
"""
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.settings import settings
from app.db.models import AppUser
from app.services import categories as cat_svc
from app.services import periods as period_svc
from app.services.ai_embedding_backfill import backfill_user_embeddings


class AlreadyOnboardedError(Exception):
    """User has already completed onboarding (D-10).

    Repeat-protection per D-10 / T-double-onboard: route layer maps this
    to ``HTTPException(409 Conflict)``.
    """

    def __init__(self, tg_user_id: int, onboarded_at: datetime) -> None:
        self.tg_user_id = tg_user_id
        self.onboarded_at = onboarded_at
        super().__init__(
            f"User {tg_user_id} is already onboarded at {onboarded_at.isoformat()}"
        )


class OnboardingUserNotFoundError(Exception):
    """Raised when no AppUser row exists for the given tg_user_id.

    Per Phase 1 D-11, ``GET /me`` upserts the AppUser row before any
    onboarding call. If we get here, the caller skipped that bootstrap;
    route layer maps this to a clear 404 with a hint.
    """

    def __init__(self, tg_user_id: int) -> None:
        self.tg_user_id = tg_user_id
        super().__init__(
            f"AppUser with tg_user_id={tg_user_id} not found; "
            "call GET /me first to upsert the row"
        )


async def complete_onboarding(
    db: AsyncSession,
    *,
    tg_user_id: int,
    starting_balance_cents: int,
    cycle_start_day: int,
    seed_default_categories: bool,
) -> dict[str, Any]:
    """Run all 4 onboarding steps atomically.

    Args:
        db: AsyncSession injected by FastAPI dependency.
        tg_user_id: identifies the AppUser row (single-tenant — must match
            OWNER_TG_ID per upstream auth).
        starting_balance_cents: signed kopecks (negative allowed per D-09).
        cycle_start_day: 1..28 (validated by Pydantic upstream).
        seed_default_categories: if True, attempt to seed (skipped silently
            by ``cat_svc.seed_default_categories`` if any category exists).

    Returns:
        ``{"period_id": int, "seeded_categories": int, "onboarded_at": iso-str}``

    Raises:
        AlreadyOnboardedError: when ``user.onboarded_at`` is not None
            (D-10 repeat-protection / T-double-onboard).
        OnboardingUserNotFoundError: when no AppUser exists for tg_user_id
            (caller must trigger ``GET /me`` first per Phase 1 D-11).
    """
    # 1. Locate user (resolve PK for downstream tenant-scoped calls).
    result = await db.execute(
        select(AppUser).where(AppUser.tg_user_id == tg_user_id)
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise OnboardingUserNotFoundError(tg_user_id)

    # D-10: idempotency / repeat-protection
    if user.onboarded_at is not None:
        raise AlreadyOnboardedError(tg_user_id, user.onboarded_at)

    # Phase 11: resolve PK once and forward to per-tenant service calls so
    # newly-created Category / BudgetPeriod rows get the correct user_id.
    user_pk: int = user.id

    # 2. Optional seed (idempotent inside service, scoped by user_id).
    seeded: list = []
    if seed_default_categories:
        seeded = await cat_svc.seed_default_categories(db, user_id=user_pk)

    # 3. Create first period (uses period_for + today_msk inside the service).
    period = await period_svc.create_first_period(
        db,
        user_id=user_pk,
        starting_balance_cents=starting_balance_cents,
        cycle_start_day=cycle_start_day,
    )

    # 4. Update user
    user.cycle_start_day = cycle_start_day
    user.onboarded_at = datetime.now(timezone.utc)
    await db.flush()

    # 5. Phase 14 MTONB-03: backfill embeddings for the 14 seed categories so
    #    the very first /ai/suggest-category call has hot indices. Wrapped in
    #    try/except by backfill_user_embeddings — provider failure logs WARN
    #    and returns 0 without rolling back onboarding.
    embeddings_created = 0
    if seed_default_categories and settings.ENABLE_AI_CATEGORIZATION:
        embeddings_created = await backfill_user_embeddings(db, user_id=user_pk)

    return {
        "period_id": period.id,
        "seeded_categories": len(seeded),
        "onboarded_at": user.onboarded_at.isoformat(),
        "embeddings_created": embeddings_created,
    }
