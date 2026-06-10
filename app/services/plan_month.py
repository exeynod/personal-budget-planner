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
5. Mirror the new expense limits into ``period_category_plan`` rows of the
   CURRENT ACTIVE period (update-only) so ``compute_balance`` sees the new
   limit immediately after a rollover materialised pcp rows.

The route layer wraps the service call in a transaction (``db.commit()`` on
success, automatic rollback on exception) so steps 1-5 either all persist
or none do.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AppUser, Category, CategoryKind, PeriodCategoryPlan
from app.services.periods import get_current_active_period


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
        super().__init__(f"Σplan ({sum_plan_cents}) exceeds income ({income_cents})")


class IncomeLimitForbiddenError(Exception):
    """Raised when a non-zero ``plan_cents`` targets an INCOME category.

    SYSTEMIC invariant: income categories must NEVER carry a limit / plan-target.
    A "limit" only makes sense for expenses (a ceiling on spending); an income
    category has no spend ceiling, so setting ``plan_cents > 0`` on it is a
    domain error. The route layer maps this to HTTPException(400) with structured
    detail ``{error: 'income_limit_forbidden', category_id}`` — mirroring the
    ``PlanOverflowError`` convention so the frontend reads the code, not the text.
    """

    def __init__(self, category_id: int) -> None:
        self.category_id = category_id
        super().__init__(
            f"Category {category_id} is income — a plan limit is forbidden"
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

    Side effect (limits single-source fix): expense limits are also mirrored
    into existing ``period_category_plan`` rows of the user's CURRENT ACTIVE
    period (update-only, no row creation — see step 6 below), so
    ``compute_balance`` reflects the new limit immediately after a rollover.

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
            NULL). Nothing was modified. Σplan sums EXPENSE plans only —
            income categories never carry a plan.
        CategoryNotInTenantError: at least one ``category_id`` is missing
            (or belongs to another user). Nothing was modified.
        IncomeLimitForbiddenError: a tuple targets an INCOME category with a
            non-zero plan_cents — a limit on income is forbidden. Nothing was
            modified.
    """
    # 1. Bulk fetch all referenced categories belonging to this user FIRST —
    #    we need each category's ``kind`` to (a) reject income limits and
    #    (b) exclude income rows from the Σplan ≤ income validation.
    cat_ids = [p[0] for p in plans]
    result = await db.execute(
        select(Category).where(
            Category.id.in_(cat_ids),
            Category.user_id == user_id,
        )
    )
    cats_by_id = {c.id: c for c in result.scalars().all()}

    # 2. Detect missing / cross-tenant — fail-fast БЕЗ мутаций.
    for cid in cat_ids:
        if cid not in cats_by_id:
            raise CategoryNotInTenantError(cid)

    # 3. Validate kind + collect ONLY expense plans to apply.
    #    SYSTEMIC: income categories must NEVER carry a limit/plan-target.
    #      - non-zero plan_cents on an income category → hard error.
    #      - zero plan_cents on an income category → silently skipped (never
    #        mutated), so income rows can never acquire a limit.
    expense_plans: list[tuple[int, int]] = []
    for cid, pcents in plans:
        if cats_by_id[cid].kind == CategoryKind.income:
            if pcents != 0:
                raise IncomeLimitForbiddenError(cid)
            continue  # zero-limit income tuple — skip, never mutate.
        expense_plans.append((cid, pcents))

    # 4. Pre-validate Σplan ≤ income over EXPENSE plans only (skipped when
    #    income IS NULL — legacy user предан onboarding-edit redirect by
    #    frontend, не блокируется). Income categories carry no plan so they
    #    are excluded from the sum entirely.
    income = await db.scalar(select(AppUser.income_cents).where(AppUser.id == user_id))
    sum_plan = sum(p[1] for p in expense_plans)
    if income is not None and sum_plan > income:
        raise PlanOverflowError(income, sum_plan)

    # 5. Mutate plan_cents in-memory (expense rows only); flush so DB sees
    #    the new values.
    for cid, pcents in expense_plans:
        cats_by_id[cid].plan_cents = pcents

    # 6. Single source of limits: mirror the new expense limits into
    #    ``period_category_plan`` (pcp) rows of the CURRENT ACTIVE period.
    #
    #    Why: ``compute_balance`` resolves a category limit as
    #    ``pcp_map.get(cat_id, Category.plan_cents or 0)`` — the fallback to
    #    ``Category.plan_cents`` is PER CATEGORY. After a rollover,
    #    ``apply_template_to_period`` materialises pcp rows, so editing
    #    ``Category.plan_cents`` alone would stay invisible to the home/balance
    #    deltas until the period ends.
    #
    #    UPDATE-only semantics (deliberate):
    #      * pcp row exists → update ``limit_cents`` to the new value;
    #      * pcp row missing → do NOT create one. The per-category fallback
    #        already serves the fresh ``Category.plan_cents``, and inserting a
    #        row into a period that has no pcp rows yet would flip
    #        ``apply_template_to_period``'s idempotency check («any pcp row
    #        exists for the period») into a false no-op.
    if expense_plans:
        period = await get_current_active_period(db, user_id=user_id)
        if period is not None:
            pcp_rows = (
                (
                    await db.execute(
                        select(PeriodCategoryPlan).where(
                            PeriodCategoryPlan.user_id == user_id,
                            PeriodCategoryPlan.period_id == period.id,
                            PeriodCategoryPlan.category_id.in_(
                                [cid for cid, _ in expense_plans]
                            ),
                        )
                    )
                )
                .scalars()
                .all()
            )
            pcp_by_cat = {r.category_id: r for r in pcp_rows}
            for cid, pcents in expense_plans:
                pcp = pcp_by_cat.get(cid)
                if pcp is not None:
                    pcp.limit_cents = pcents

    await db.flush()
    # Stable order: insertion order from the request body — frontend can
    # zip против локальной копии без re-keying.
    ordered = [cats_by_id[cid] for cid in cat_ids]
    for c in ordered:
        await db.refresh(c)
    return ordered
