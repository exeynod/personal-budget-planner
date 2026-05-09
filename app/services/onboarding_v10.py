"""v1.0 atomic onboarding (Phase 22, BE-15 + BE-05).

Replaces the legacy ``app.services.onboarding.complete_onboarding`` flow for
v1.0 clients. The legacy module stays untouched so older clients (v0.x)
continue to work — Phase 22 only adds the v1.0 path.

Body shape (CONTEXT §Area 3, verbatim)::

    {
      "income_cents": int,                     # required, 1..100M ₽
      "accounts": [                            # required, ≥1
        {"bank": str, "kind": str,             # required
         "balance_cents": int,                 # required (may be 0)
         "mask": str?, "primary": bool?},      # optional
        ...
      ],
      "category_plans": {                      # required, all 8 codes optional
        "food": cents, "cafe": cents,
        "home": cents, "transit": cents,
        "fun": cents, "gifts": cents,
        "health": cents, "subs": cents,
      },
      "goal": {                                # optional
        "name": str, "target_cents": int,
        "due": ISODate?,
      },
      "savings_config": {                      # optional, defaults applied
        "roundup_enabled": bool, "base": int,  # defaults: false / 10
      },
    }

Atomicity (T-22-11-08):
    All mutations run in a single DB transaction owned by the caller. The
    service issues ``flush()`` calls for ID-resolution but never ``commit()``
    — the request handler / job that opens the transaction is responsible
    for the commit boundary. On any exception, the transaction rolls back
    and no partial state leaks.

Idempotency (T-22-11-01):
    409 Conflict if an Account row already exists for the user. Surface via
    ``OnboardingConflictError``. The route layer (plan 22.13) maps it to
    HTTPException(409). Reset via :func:`reset_v10` (admin only, plan 22.14).

System savings Category (CONTEXT §Area 2, verbatim)::

    code='savings', name='КОПИЛКА', kind=expense, ord='99',
    plan_cents=0, rollover='savings', paused=true

Eight default Categories (DATA-MODEL §1.3, verbatim) — codes
``food/cafe/home/transit/fun/gifts/health/subs`` with their UPPERCASE
russian display names. The legacy 14-category seed
(``app.services.categories.seed_default_categories``) is intentionally NOT
called here per CONTEXT D-04 — v1.0 owns its own schema.

Validators (DATA-MODEL §6):
    * income_cents > 0 and ≤ 100_000_000 ₽ (10_000_000_000 коп)
    * accounts non-empty; bank length ∈ [1, 40]; at most one explicit primary
    * category_plans keys ⊆ {8 default codes}; each value ≥ 0; ≤ income*4
    * Σ category_plans.values() ≤ income_cents
    * goal.target_cents > 0; goal.due > today MSK if supplied
    * savings_config.base ∈ {10, 50, 100}

Threat model: see plan 22.11 PLAN.md ``<threat_model>``. ASVS L1 V5.3.1
(input validation), V8.2.1 (data integrity).
"""
from __future__ import annotations

from datetime import date as date_type
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    Account,
    AccountKind,
    AppUser,
    Category,
    CategoryKind,
    Goal,
    RolloverPolicy,
)


# ---------- Constants ----------


# DATA-MODEL §1.3 — single source of truth for 8 default categories.
# ``ord`` is the CHAR(2) display ordinal (matches DB CHECK
# ``ck_category_ord_format``). ``sort_order`` mirrors it as int for the
# legacy column on the same row.
DEFAULT_CATEGORIES: list[dict[str, Any]] = [
    {"code": "food",    "name": "ПРОДУКТЫ",  "ord": "01"},
    {"code": "cafe",    "name": "КАФЕ",      "ord": "02"},
    {"code": "home",    "name": "ДОМ",       "ord": "03"},
    {"code": "transit", "name": "ТРАНСПОРТ", "ord": "04"},
    {"code": "fun",     "name": "РАЗВЛЕЧ.",  "ord": "05"},
    {"code": "gifts",   "name": "ПОДАРКИ",   "ord": "06"},
    {"code": "health",  "name": "ЗДОРОВЬЕ",  "ord": "07"},
    {"code": "subs",    "name": "ПОДПИСКИ",  "ord": "08"},
]
SYSTEM_SAVINGS_CATEGORY: dict[str, Any] = {
    "code": "savings",
    "name": "КОПИЛКА",
    "ord": "99",
    "plan_cents": 0,
    "rollover": "savings",
    "paused": True,
}

VALID_CATEGORY_CODES: frozenset[str] = frozenset(
    c["code"] for c in DEFAULT_CATEGORIES
)

# DATA-MODEL §6: income upper bound = 100M ₽ in копейки = 10_000_000_000.
INCOME_MAX_CENTS: int = 100_000_000_00

# SavingsConfig defaults (CONTEXT §Area 3 + plan 22.08 _DEFAULT_CONFIG).
_DEFAULT_SAVINGS_CONFIG: dict[str, Any] = {
    "roundup_enabled": False,
    "base": 10,
}


# ---------- Domain exceptions ----------


class OnboardingConflictError(Exception):
    """User already has accounts → 409 Conflict (T-22-11-01).

    Route layer (plan 22.13) maps to ``HTTPException(409)`` with body
    ``{"detail": "already onboarded — use /onboarding/reset"}``.
    """

    def __init__(self, user_id: int, account_count: int) -> None:
        self.user_id = user_id
        self.account_count = account_count
        super().__init__(
            f"User {user_id} already has {account_count} account(s); "
            "use /api/v1/internal/onboarding/reset (admin) before re-onboarding"
        )


class PlanExceedsIncomeError(ValueError):
    """Σ category_plans > income_cents (DATA-MODEL §6, T-22-11-04).

    Subclass of ValueError so callers that catch the broader 422 mapping
    keep working unchanged.
    """

    def __init__(self, sum_plan: int, income: int) -> None:
        self.sum_plan = sum_plan
        self.income = income
        super().__init__(
            f"Sum of category plans ({sum_plan} cents) exceeds income "
            f"({income} cents)"
        )


# ---------- Validators ----------


def _validate_income(income_cents: Any) -> int:
    """T-22-11-02: income_cents ∈ (0, 100M ₽]. Returns the validated int."""
    if not isinstance(income_cents, int) or isinstance(income_cents, bool):
        raise ValueError(
            f"income_cents must be int; got {type(income_cents).__name__}"
        )
    if income_cents <= 0:
        raise ValueError(f"income_cents must be > 0; got {income_cents}")
    if income_cents > INCOME_MAX_CENTS:
        raise ValueError(
            f"income_cents must be ≤ {INCOME_MAX_CENTS} (100M ₽); "
            f"got {income_cents}"
        )
    return income_cents


def _validate_account_kind(kind: Any) -> AccountKind:
    if isinstance(kind, AccountKind):
        return kind
    try:
        return AccountKind(kind)
    except (ValueError, TypeError):
        raise ValueError(f"Invalid account.kind={kind!r}")


def _validate_category_plans(
    category_plans: dict[str, int], income_cents: int
) -> None:
    """T-22-11-03/04: whitelist codes + Σ plan ≤ income; per-plan range checks.

    Raises:
        ValueError: unknown code, negative plan, or plan > income*4.
        PlanExceedsIncomeError: Σ plan > income.
    """
    if not isinstance(category_plans, dict):
        raise ValueError(
            f"category_plans must be dict; got {type(category_plans).__name__}"
        )
    upper = income_cents * 4
    for code, cents in category_plans.items():
        if code not in VALID_CATEGORY_CODES:
            raise ValueError(
                f"Unknown category code in category_plans: {code!r} "
                f"(valid: {sorted(VALID_CATEGORY_CODES)})"
            )
        if not isinstance(cents, int) or isinstance(cents, bool):
            raise ValueError(
                f"category_plans[{code!r}] must be int; got "
                f"{type(cents).__name__}"
            )
        if cents < 0:
            raise ValueError(
                f"category_plans[{code!r}] must be ≥ 0; got {cents}"
            )
        if cents > upper:
            raise ValueError(
                f"category_plans[{code!r}]={cents} exceeds income*4={upper}"
            )
    sum_plan = sum(category_plans.values())
    if sum_plan > income_cents:
        raise PlanExceedsIncomeError(sum_plan, income_cents)


def _validate_accounts(accounts: list[dict[str, Any]]) -> int:
    """Validate the accounts list and return the chosen primary index.

    Rules:
      * accounts non-empty
      * bank length ∈ [1, 40]; kind ∈ AccountKind enum
      * at most one explicit ``primary=true`` flag
      * if no explicit primary → index 0 becomes primary

    Returns:
        Index of the row that should be inserted with ``is_primary=True``.

    Raises:
        ValueError on any rule violation.
    """
    if not isinstance(accounts, list) or not accounts:
        raise ValueError("accounts must be a non-empty list")

    explicit_primary_idx: Optional[int] = None
    for idx, a in enumerate(accounts):
        if not isinstance(a, dict):
            raise ValueError(
                f"accounts[{idx}] must be dict; got {type(a).__name__}"
            )
        bank = a.get("bank")
        if not isinstance(bank, str) or not (1 <= len(bank) <= 40):
            raise ValueError(
                f"accounts[{idx}].bank length must be 1..40; "
                f"got {len(bank) if isinstance(bank, str) else type(bank).__name__}"
            )
        # kind validation surfaces clean ValueError now (vs ORM error later).
        _validate_account_kind(a.get("kind"))
        balance_cents = a.get("balance_cents", 0)
        if not isinstance(balance_cents, int) or isinstance(balance_cents, bool):
            raise ValueError(
                f"accounts[{idx}].balance_cents must be int; got "
                f"{type(balance_cents).__name__}"
            )
        if a.get("primary") is True:
            if explicit_primary_idx is not None:
                raise ValueError(
                    "At most one accounts[].primary may be true; got both "
                    f"accounts[{explicit_primary_idx}] and accounts[{idx}]"
                )
            explicit_primary_idx = idx

    return explicit_primary_idx if explicit_primary_idx is not None else 0


# ---------- Internal helpers ----------


async def _upsert_seed_categories(
    db: AsyncSession,
    *,
    user_id: int,
    category_plans: dict[str, int],
) -> dict[str, int]:
    """Insert or update the 8 default Categories for ``user_id``.

    Idempotent on ``(user_id, code)``: re-running after :func:`reset_v10`
    (which keeps Category rows alive but zeros plan_cents) updates the
    existing rows in place rather than triggering a UniqueViolation on the
    partial unique index ``uq_category_user_code``.

    Returns a ``{code: id}`` map covering all 8 default codes.
    """
    existing_rows = (
        await db.execute(
            select(Category).where(
                Category.user_id == user_id,
                Category.code.in_(list(VALID_CATEGORY_CODES)),
            )
        )
    ).scalars().all()
    by_code: dict[str, Category] = {row.code: row for row in existing_rows}

    result: dict[str, int] = {}
    for cat_def in DEFAULT_CATEGORIES:
        code = cat_def["code"]
        plan = int(category_plans.get(code, 0))
        existing = by_code.get(code)
        if existing is None:
            row = Category(
                user_id=user_id,
                name=cat_def["name"],
                code=code,
                ord=cat_def["ord"],
                kind=CategoryKind.expense,
                plan_cents=plan,
                rollover=RolloverPolicy.misc,
                paused=False,
                is_archived=False,
                sort_order=int(cat_def["ord"]),
            )
            db.add(row)
            await db.flush()
            result[code] = row.id
        else:
            # Refresh fields that onboarding owns (plan_cents, paused-flag,
            # archive-state). Name/code/ord are immutable per onboarding —
            # leave them alone so a customised category survives reset.
            existing.plan_cents = plan
            existing.paused = False
            existing.is_archived = False
            await db.flush()
            result[code] = existing.id
    return result


async def _upsert_savings_category(
    db: AsyncSession, *, user_id: int
) -> int:
    """Insert or refresh the system 'savings' Category (CONTEXT §Area 2).

    Idempotent on ``(user_id, code='savings')``: re-running after
    :func:`reset_v10` updates the existing row in place rather than
    triggering a UniqueViolation.
    """
    sav_def = SYSTEM_SAVINGS_CATEGORY
    existing = await db.scalar(
        select(Category).where(
            Category.user_id == user_id,
            Category.code == "savings",
        )
    )
    if existing is None:
        row = Category(
            user_id=user_id,
            name=sav_def["name"],
            code=sav_def["code"],
            ord=sav_def["ord"],
            kind=CategoryKind.expense,
            plan_cents=sav_def["plan_cents"],
            rollover=RolloverPolicy.savings,
            paused=sav_def["paused"],
            is_archived=False,
            sort_order=99,
        )
        db.add(row)
        await db.flush()
        return row.id
    # Restore exact CONTEXT §Area 2 attributes — reset/customisation must
    # not drift the system row away from the contract.
    existing.name = sav_def["name"]
    existing.kind = CategoryKind.expense
    existing.ord = sav_def["ord"]
    existing.plan_cents = sav_def["plan_cents"]
    existing.rollover = RolloverPolicy.savings
    existing.paused = sav_def["paused"]
    existing.is_archived = False
    existing.sort_order = 99
    await db.flush()
    return existing.id


# ---------- Public API ----------


async def complete_v10(
    db: AsyncSession,
    *,
    user_id: int,
    income_cents: int,
    accounts: list[dict[str, Any]],
    category_plans: dict[str, int],
    goal: Optional[dict[str, Any]] = None,
    savings_config: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Atomic v1.0 onboarding (BE-15).

    Single DB transaction; caller owns commit/rollback. The 11-step flow
    documented in plan 22.11 ``<objective>``::

        1. Validate income, plans, accounts (raise before any insert).
        2. Conflict check: any existing Account → 409.
        3. AppUser.income_cents = ..., onboarded_at = now().
        4. Insert Account rows (one is_primary=true).
        5. Seed 8 default Categories with plan_cents per body.
        6. Seed system 'savings' Category (kind=expense, ord='99', paused=true).
        7. Optional Goal create (validated by app.services.goals.create_goal).
        8. SavingsConfig upsert (defaults applied if absent).

    Args:
        user_id: AppUser PK (resolved by caller from tg_user_id auth).
        income_cents, accounts, category_plans: required body fields.
        goal, savings_config: optional body fields.

    Returns:
        Summary dict::

            {
              "user_id":                int,
              "income_cents":           int,
              "account_ids":            list[int],
              "category_ids_by_code":   {str: int, ...},
              "savings_category_id":    int,
              "goal_id":                int | None,
              "savings_config":         {"roundup_enabled": bool,
                                         "roundup_base":    int},
              "onboarded_at":           ISO-8601 str,
            }

    Raises:
        OnboardingConflictError → 409 (T-22-11-01).
        ValueError → 422 (validators T-22-11-02/03).
        PlanExceedsIncomeError (subclass of ValueError) → 422 (T-22-11-04).
    """
    # ---- 1. Validators (run BEFORE any DB write — fail fast). ----
    income_cents = _validate_income(income_cents)
    _validate_category_plans(category_plans, income_cents)
    primary_idx = _validate_accounts(accounts)

    # ---- 2. Conflict check (T-22-11-01, T-22-11-06 race safety net). ----
    existing_count = await db.scalar(
        select(func.count())
        .select_from(Account)
        .where(Account.user_id == user_id)
    )
    if existing_count and int(existing_count) > 0:
        raise OnboardingConflictError(user_id, int(existing_count))

    # ---- 3. AppUser update. ----
    user = await db.scalar(select(AppUser).where(AppUser.id == user_id))
    if user is None:
        raise ValueError(f"AppUser id={user_id} not found")
    user.income_cents = income_cents
    user.onboarded_at = datetime.now(timezone.utc)
    await db.flush()

    # ---- 4. Accounts. ----
    account_ids: list[int] = []
    for idx, a in enumerate(accounts):
        kind = _validate_account_kind(a["kind"])
        row = Account(
            user_id=user_id,
            bank=a["bank"],
            kind=kind,
            balance_cents=int(a.get("balance_cents", 0)),
            mask=a.get("mask"),
            is_primary=(idx == primary_idx),
        )
        db.add(row)
        await db.flush()
        account_ids.append(row.id)

    # ---- 5. Eight default Categories. ----
    # Idempotent w.r.t. ``(user_id, code)``: ``reset_v10`` keeps Category rows
    # alive (only zeros plan_cents) so re-onboarding has to UPDATE existing
    # rows rather than INSERT duplicates. The partial unique index
    # ``uq_category_user_code`` (and ``uq_category_user_id_name``) would
    # otherwise reject the second seed.
    category_ids_by_code: dict[str, int] = await _upsert_seed_categories(
        db, user_id=user_id, category_plans=category_plans
    )

    # ---- 6. System 'savings' Category (CONTEXT §Area 2). ----
    savings_category_id = await _upsert_savings_category(
        db, user_id=user_id
    )

    # ---- 7. Optional Goal. ----
    goal_id: Optional[int] = None
    if goal is not None:
        # Local import — avoids module-level circular dep with goals.py via savings.py.
        from app.services.goals import create_goal as _create_goal

        if not isinstance(goal, dict):
            raise ValueError(
                f"goal must be dict; got {type(goal).__name__}"
            )
        due_val = goal.get("due")
        if isinstance(due_val, str):
            try:
                due_val = date_type.fromisoformat(due_val)
            except ValueError as exc:
                raise ValueError(
                    f"goal.due must be ISO-8601 date; got {due_val!r}"
                ) from exc
        g = await _create_goal(
            db,
            user_id=user_id,
            name=goal["name"],
            target_cents=int(goal["target_cents"]),
            due=due_val,
        )
        goal_id = g.id

    # ---- 8. SavingsConfig (defaults if absent). ----
    # Local import — avoids module-level circular dep.
    from app.services.savings import upsert_config

    if savings_config is None:
        cfg_payload: dict[str, Any] = dict(_DEFAULT_SAVINGS_CONFIG)
    else:
        if not isinstance(savings_config, dict):
            raise ValueError(
                f"savings_config must be dict; got "
                f"{type(savings_config).__name__}"
            )
        cfg_payload = {
            "roundup_enabled": savings_config.get(
                "roundup_enabled", _DEFAULT_SAVINGS_CONFIG["roundup_enabled"]
            ),
            "base": savings_config.get(
                "base", _DEFAULT_SAVINGS_CONFIG["base"]
            ),
        }
    cfg = await upsert_config(
        db,
        user_id=user_id,
        roundup_enabled=cfg_payload.get("roundup_enabled"),
        roundup_base=cfg_payload.get("base"),
    )

    await db.flush()

    return {
        "user_id": user_id,
        "income_cents": income_cents,
        "account_ids": account_ids,
        "category_ids_by_code": category_ids_by_code,
        "savings_category_id": savings_category_id,
        "goal_id": goal_id,
        "savings_config": {
            "roundup_enabled": bool(cfg.roundup_enabled),
            "roundup_base": int(cfg.roundup_base),
        },
        "onboarded_at": user.onboarded_at.isoformat(),
    }


async def reset_v10(db: AsyncSession, *, user_id: int) -> dict[str, Any]:
    """Admin reset for v1.0 onboarding (BE-15 admin, T-22-11-05).

    Wipes all v1.0-onboarding state for ``user_id`` so re-onboarding is
    possible. Used by ``DELETE /api/v1/internal/onboarding/reset`` (plan
    22.14), which is gated by ``X-Internal-Token`` — caller authorization
    is the route layer's responsibility.

    Side effects (single transaction; caller commits):
        1. Nullify ``subscription.account_id`` (Subscription rows preserved
           but unlinked from accounts about to be deleted).
        2. Hard delete ``actual_transaction`` rows that reference any account
           owned by ``user_id`` (CASCADE child roundup txns via FK).
        3. Hard delete ``savings_config`` row (PK = user_id).
        4. Hard delete ``goal`` rows.
        5. Hard delete ``account`` rows.
        6. ``UPDATE app_user SET income_cents = NULL, onboarded_at = NULL``.
        7. ``UPDATE category SET plan_cents = 0`` (categories preserved).

    Categories are NOT deleted — historical PlannedTransaction / spent
    actual_transaction rows still reference them, and the next
    ``complete_v10`` call would refuse to seed duplicates anyway (the
    partial unique index ``uq_category_user_code`` would clash).

    Args:
        user_id: AppUser PK whose state is being wiped.

    Returns:
        ``{"deleted_account_ids": list[int]}`` — useful for admin audit
        log. Empty list if user had no accounts to begin with (reset is
        idempotent — re-running on an already-reset user is a no-op).

    Note on category deletion vs reset: per plan 22.11 PLAN.md tasks, the
    spec says "delete or zero" Category rows. We choose **zero** so the
    re-onboarding flow does not have to handle "no-categories-but-also-no-
    accounts" intermediate state. Trade-off: if a user customised category
    names between onboarding cycles, those customisations persist after
    reset. Acceptable for dev-only admin endpoint.
    """
    # 1. Nullify subscription.account_id (Subscription is preserved; only
    #    the link to to-be-deleted Account rows drops).
    await db.execute(
        text("UPDATE subscription SET account_id = NULL WHERE user_id = :uid"),
        {"uid": user_id},
    )
    # 2. Delete actual_transaction rows referencing accounts we are about
    #    to delete. The FK is ON DELETE RESTRICT so we must remove the
    #    children before the parent. Roundup children cascade-delete via
    #    parent_txn_id FK ON DELETE CASCADE — single statement is enough.
    await db.execute(
        text(
            "DELETE FROM actual_transaction "
            "WHERE user_id = :uid "
            "AND account_id IN (SELECT id FROM account WHERE user_id = :uid)"
        ),
        {"uid": user_id},
    )
    # 3. Delete savings_config (PK = user_id).
    await db.execute(
        text("DELETE FROM savings_config WHERE user_id = :uid"),
        {"uid": user_id},
    )
    # 4. Delete goals.
    await db.execute(
        text("DELETE FROM goal WHERE user_id = :uid"),
        {"uid": user_id},
    )
    # 5. Delete accounts and capture ids for audit return value.
    deleted = await db.execute(
        text(
            "DELETE FROM account WHERE user_id = :uid RETURNING id"
        ),
        {"uid": user_id},
    )
    deleted_ids = [r[0] for r in deleted.fetchall()]
    # 6. Reset user fields so the require_onboarded gate trips again.
    await db.execute(
        text(
            "UPDATE app_user "
            "SET income_cents = NULL, onboarded_at = NULL "
            "WHERE id = :uid"
        ),
        {"uid": user_id},
    )
    # 7. Zero out category.plan_cents (keep rows for FK integrity).
    await db.execute(
        text("UPDATE category SET plan_cents = 0 WHERE user_id = :uid"),
        {"uid": user_id},
    )
    await db.flush()

    # Expire the SQLAlchemy identity map for any AppUser / Category instances
    # the caller may have loaded earlier in the same session — raw-SQL UPDATEs
    # above don't update the ORM-managed Python attributes. Without this, a
    # subsequent ``db.scalar(select(AppUser).where(...))`` returns the cached
    # instance with stale ``income_cents`` / ``onboarded_at``. ``expire_all``
    # is cheap (just marks attrs dirty) and the next attribute access /
    # SELECT will refresh from the DB. Same applies to Category rows whose
    # ``plan_cents`` were zeroed above.
    db.expire_all()

    return {"deleted_account_ids": deleted_ids}


__all__ = [
    "DEFAULT_CATEGORIES",
    "SYSTEM_SAVINGS_CATEGORY",
    "VALID_CATEGORY_CODES",
    "INCOME_MAX_CENTS",
    "OnboardingConflictError",
    "PlanExceedsIncomeError",
    "complete_v10",
    "reset_v10",
]
