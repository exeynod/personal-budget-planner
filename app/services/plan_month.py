"""Atomic plan-month update service (Phase 26 BE Plan 26-01, PLAN-V10-06).

Service-layer для PATCH /api/v1/plan-month. HTTP-framework-agnostic: raises
domain exceptions (``PlanOverflowError``, ``CategoryNotInTenantError``)
which the route layer maps to HTTP statuses (400 / 404). Same convention
as ``app.services.categories``.

Atomicity guarantees (T-26-01-04):
1. Pre-validate Σplan ≤ AppUser.income_cents (skipped if income IS NULL —
   legacy v0.x users without configured income — to avoid breaking the
   PATCH path before the new onboarding fills the column).
2. Bulk-fetch all referenced categories filtered by ``user_id`` (cross-tenant
   IDs disappear from the result-set, then surface as 404 — T-26-01-02).
3. Loop over requested IDs; if ANY is missing from the bulk-fetch result,
   raise ``CategoryNotInTenantError`` immediately — no mutations applied.
4. Apply ``plan_cents`` to each ORM row in-memory; flush + refresh.

The route layer wraps the service call in a transaction (``db.commit()`` on
success, automatic rollback on exception) so steps 1-4 either all persist
or none do.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AppUser, Category


class PlanOverflowError(Exception):
    """Raised when Σplan_cents > user.income_cents (income IS NOT NULL).

    Route layer maps to HTTPException(400) with structured detail
    ``{error: 'plan_overflow', income_cents, sum_plan_cents}`` so frontend
    can render the inline «Σplan превышает доход» message без парсинга
    свободного текста.
    """

    def __init__(self, income_cents: int, sum_plan_cents: int) -> None:
        self.income_cents = income_cents
        self.sum_plan_cents = sum_plan_cents
        super().__init__(
            f"Σplan ({sum_plan_cents}) exceeds income ({income_cents})"
        )


class CategoryNotInTenantError(Exception):
    """Raised when at least one category_id is missing OR cross-tenant.

    Route layer maps to HTTPException(404) — REST convention to не leak
    existence (T-26-01-02). The exception carries the FIRST offending id
    for the error detail; the caller should not infer "only one" — the
    request is rejected as a whole regardless of how many ids fail.
    """

    def __init__(self, category_id: int) -> None:
        self.category_id = category_id
        super().__init__(f"Category {category_id} not found")


async def update_plan_month_atomic(
    db: AsyncSession,
    *,
    user_id: int,
    plans: list[tuple[int, int]],
) -> list[Category]:
    """Apply ``plan_cents`` to each ``(category_id, plan_cents)`` tuple.

    Args:
        db: AsyncSession (already tenant-scoped via SET LOCAL by the route).
        user_id: app_user.id PK — primary defence against cross-tenant
            access (RLS is the secondary backstop).
        plans: list of (category_id, plan_cents) tuples. Order is preserved
            in the returned list.

    Returns:
        List of refreshed ``Category`` ORM rows in the same order as
        ``plans``. Caller is responsible for ``db.commit()``.

    Raises:
        PlanOverflowError: Σplan > user.income_cents (with income IS NOT
            NULL). Nothing was modified.
        CategoryNotInTenantError: at least one ``category_id`` is missing
            (or belongs to another user). Nothing was modified.
    """
    # 1. Pre-validate Σplan ≤ income (skipped when income IS NULL — legacy
    #    user предан onboarding-edit redirect by frontend, не блокируется).
    income = await db.scalar(
        select(AppUser.income_cents).where(AppUser.id == user_id)
    )
    sum_plan = sum(p[1] for p in plans)
    if income is not None and sum_plan > income:
        raise PlanOverflowError(income, sum_plan)

    # 2. Bulk fetch all referenced categories belonging to this user.
    cat_ids = [p[0] for p in plans]
    result = await db.execute(
        select(Category).where(
            Category.id.in_(cat_ids),
            Category.user_id == user_id,
        )
    )
    cats_by_id = {c.id: c for c in result.scalars().all()}

    # 3. Detect missing / cross-tenant — fail-fast БЕЗ мутаций.
    for cid in cat_ids:
        if cid not in cats_by_id:
            raise CategoryNotInTenantError(cid)

    # 4. Mutate plan_cents in-memory; flush so DB sees the new values.
    for cid, pcents in plans:
        cats_by_id[cid].plan_cents = pcents

    await db.flush()
    # Stable order: insertion order from the request body — frontend can
    # zip против локальной копии без re-keying.
    ordered = [cats_by_id[cid] for cid in cat_ids]
    for c in ordered:
        await db.refresh(c)
    return ordered
