"""Rule-engine for GET /api/v1/ai/observation (Phase 27, AI-V10-03).

Pure-Python observation builder for the AI screen initial-state. No LLM
call — server computes one human-readable RU sentence from the user's
current month/week state and caches it per-user for 1 hour.

Rule priority (highest first):
    1. Over-limit category (fact > plan_cents on a non-savings, non-adjustment
       category): "{Name} уже +N% к лимиту" — picks the category with
       the largest fact/plan ratio.
    2. Subscription charge tomorrow (cycle=monthly, day_of_month == (now+1).day):
       "Завтра списание подписок на X ₽".
    3. Last-7-days savings (ActualKind in {roundup, deposit}, tx_date in last 7d):
       "За неделю экономия Y ₽".
    4. Month surplus (AppUser.income_cents - Σ|expense fact| in current MSK month > 0):
       "{Month} в плюсе на Z ₽" — month name capitalised nominative.
    Fallback: "Веди учёт регулярно — {today}" where today = "9 мая" (genitive).

Cache:
    OBSERVATION_CACHE: dict[int, ObservationResult] keyed by AppUser.id.
    TTL = 1 hour. Cache is per-process; acceptable for single-tenant pet app
    (T-27-01-04 accept). Cleared on process restart.

Time zone:
    All "today/tomorrow/this month" boundaries computed in Europe/Moscow
    per CLAUDE.md convention (period calculations are MSK; DB stores UTC).

Money:
    BIGINT cents in storage; rendered as integer-rubles in the output
    text (no kopecks decimals — UI summary level only). roundup/deposit
    txns are stored with NEGATIVE amount_cents per savings sign-convention
    (see app/services/savings.py D-02) — we abs() them before summing.

Threat dispositions:
    T-27-01-01 (info-disclosure via cache): keyed by user_id only; queries
        filter by user_id; RLS scope on the AsyncSession backstop.
    T-27-01-02 (DoS via repeat GETs): 1h cache + lightweight aggregates
        (LIMIT 1 + indexed aggregates) keep cold-path cheap.
    T-27-01-03 (XSS in text): cat.name is user-controlled but React/SwiftUI
        escape on render — accepted at the trust boundary.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    ActualKind,
    ActualTransaction,
    AppUser,
    Category,
    SubCycle,
    Subscription,
)


# ---------- Constants ----------

MSK = ZoneInfo("Europe/Moscow")
CACHE_TTL = timedelta(hours=1)

# Russian month names, nominative case (capitalised before display).
MONTHS_RU_NOM = (
    "январь",
    "февраль",
    "март",
    "апрель",
    "май",
    "июнь",
    "июль",
    "август",
    "сентябрь",
    "октябрь",
    "ноябрь",
    "декабрь",
)

# Russian month names, genitive case (used in "{day} {month_gen}").
MONTHS_RU_GEN = (
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
)


# ---------- Public types ----------


@dataclass(frozen=True)
class ObservationResult:
    """Cached observation. ``generated_at`` is the MSK timestamp of the
    computation (used by callers to render a "сегодня в HH:MM" line)."""

    text: str
    generated_at: datetime


# In-memory per-process cache. Key = AppUser.id; value = ObservationResult.
# Populated by ``build_observation`` on cold-path miss; read on every call to
# ``build_observation`` to short-circuit when entry age < CACHE_TTL.
# Cleared on process restart — acceptable since the worker/api process
# restart frequency in production is ≤1/day and the cache is purely a
# performance optimisation, not correctness.
OBSERVATION_CACHE: dict[int, ObservationResult] = {}


# ---------- Public entrypoint ----------


async def build_observation(
    db: AsyncSession,
    *,
    user_id: int,
    now: Optional[datetime] = None,
) -> ObservationResult:
    """Return a cached or freshly computed observation for ``user_id``.

    Args:
        db: AsyncSession scoped to the requesting user (RLS already set
            via ``get_db_with_tenant_scope`` upstream).
        user_id: AppUser.id (PK). Cache key.
        now: Optional override for "current time" (Europe/Moscow). Tests
            inject deterministic values; production passes ``None`` and the
            service uses ``datetime.now(MSK)``.

    Returns:
        Cached ``ObservationResult`` if a fresh entry exists (less than
        ``CACHE_TTL`` old), otherwise a newly computed one (and the cache
        is updated). Always returns a non-empty ``.text``.
    """
    if now is None:
        now = datetime.now(MSK)
    elif now.tzinfo is None:
        # Treat naive timestamps as MSK so test callers can pass either.
        now = now.replace(tzinfo=MSK)

    cached = OBSERVATION_CACHE.get(user_id)
    if cached is not None and (now - cached.generated_at) < CACHE_TTL:
        return cached

    text = await _compute_text(db, user_id=user_id, now=now)
    result = ObservationResult(text=text, generated_at=now)
    OBSERVATION_CACHE[user_id] = result
    return result


# ---------- Rule engine ----------


async def _compute_text(
    db: AsyncSession,
    *,
    user_id: int,
    now: datetime,
) -> str:
    """Apply the rule priority sequence and return the first matching text."""
    today = now.date()
    month_start = today.replace(day=1)
    tomorrow = today + timedelta(days=1)
    week_ago = today - timedelta(days=7)

    # ---- Priority 1: over-limit category ----
    # SELECT cat.name, cat.plan_cents, SUM(|amount|) AS fact
    # FROM category JOIN actual_transaction ...
    # WHERE plan > 0, code NOT IN ('savings','adjustment'), kind = expense,
    #       tx_date >= month_start
    # GROUP BY cat HAVING SUM(|amount|) > cat.plan_cents
    # ORDER BY fact / plan DESC LIMIT 1
    over_limit_q = (
        select(
            Category.name.label("name"),
            Category.plan_cents.label("plan_cents"),
            func.coalesce(
                func.sum(func.abs(ActualTransaction.amount_cents)),
                0,
            ).label("fact_cents"),
        )
        .join(
            ActualTransaction,
            ActualTransaction.category_id == Category.id,
        )
        .where(
            Category.user_id == user_id,
            Category.plan_cents > 0,
            Category.is_archived.is_(False),
            Category.code != "savings",
            Category.code != "adjustment",
            ActualTransaction.user_id == user_id,
            ActualTransaction.kind == ActualKind.expense,
            ActualTransaction.tx_date >= month_start,
        )
        .group_by(Category.id, Category.name, Category.plan_cents)
        .having(
            func.coalesce(
                func.sum(func.abs(ActualTransaction.amount_cents)),
                0,
            )
            > Category.plan_cents
        )
        # Sort by overshoot ratio descending: largest %overshoot first.
        # plan_cents > 0 enforced in WHERE so NULLIF is defensive only.
        .order_by(
            (
                func.coalesce(
                    func.sum(func.abs(ActualTransaction.amount_cents)),
                    0,
                )
                * 1.0
                / func.nullif(Category.plan_cents, 0)
            ).desc()
        )
        .limit(1)
    )
    row = (await db.execute(over_limit_q)).first()
    if row is not None:
        name = row.name
        fact = int(row.fact_cents)
        plan = int(row.plan_cents)
        # +N% = (fact-plan)/plan * 100, integer ceiling-ish (round to nearest).
        pct = int(round((fact - plan) * 100.0 / plan))
        if pct < 1:  # rounding floor — never emit "+0%"
            pct = 1
        return f"{name} уже +{pct}% к лимиту"

    # ---- Priority 2: subscription charge tomorrow ----
    # SUM(amount_cents) where day_of_month == tomorrow.day AND cycle=monthly.
    # We require day_of_month NOT NULL so the new-style PLAN list is used
    # (legacy next_charge_date-only rows are ignored — they're handled by
    # the scheduler's "today" job).
    subs_tomorrow_q = select(
        func.coalesce(func.sum(Subscription.amount_cents), 0),
    ).where(
        Subscription.user_id == user_id,
        Subscription.is_active.is_(True),
        Subscription.cycle == SubCycle.monthly,
        Subscription.day_of_month == tomorrow.day,
    )
    subs_sum = int((await db.execute(subs_tomorrow_q)).scalar() or 0)
    if subs_sum > 0:
        rub = _format_rub(subs_sum)
        return f"Завтра списание подписок на {rub} ₽"

    # ---- Priority 3: last-7-days savings ----
    # roundup + deposit txns are stored as NEGATIVE amount_cents → abs().
    week_savings_q = select(
        func.coalesce(func.sum(func.abs(ActualTransaction.amount_cents)), 0),
    ).where(
        ActualTransaction.user_id == user_id,
        ActualTransaction.kind.in_([ActualKind.roundup, ActualKind.deposit]),
        ActualTransaction.tx_date >= week_ago,
    )
    week_sum = int((await db.execute(week_savings_q)).scalar() or 0)
    if week_sum > 0:
        rub = _format_rub(week_sum)
        return f"За неделю экономия {rub} ₽"

    # ---- Priority 4: month surplus ----
    # income - SUM(|expense fact|) for current MSK month > 0.
    user_row = await db.scalar(select(AppUser).where(AppUser.id == user_id))
    if user_row is not None and user_row.income_cents is not None:
        month_fact_q = select(
            func.coalesce(func.sum(func.abs(ActualTransaction.amount_cents)), 0),
        ).where(
            ActualTransaction.user_id == user_id,
            ActualTransaction.kind == ActualKind.expense,
            ActualTransaction.tx_date >= month_start,
        )
        month_fact = int((await db.execute(month_fact_q)).scalar() or 0)
        surplus = int(user_row.income_cents) - month_fact
        if surplus > 0:
            month_name = MONTHS_RU_NOM[now.month - 1].capitalize()
            rub = _format_rub(surplus)
            return f"{month_name} в плюсе на {rub} ₽"

    # ---- Fallback ----
    return f"Веди учёт регулярно — {_today_ru(now)}"


# ---------- Formatting helpers ----------


def _today_ru(now: datetime) -> str:
    """Render "9 мая" — day number + month name in genitive."""
    return f"{now.day} {MONTHS_RU_GEN[now.month - 1]}"


def _format_rub(cents: int) -> str:
    """Render kopecks → integer-rubles with thin-space thousand separators.

    Examples:
        599_00 → "599"
        70_000_00 → "70 000"
        1_050_00 → "1 050"

    UI summary level; intentionally rounds to whole rubles (floor) — the
    observation text is conversational, not an accounting display.
    """
    rub = abs(cents) // 100
    # Standard RU spacing: non-breaking thin space between thousands.
    # Using regular space here — frontends render it identically and the
    # text is short enough that line-break risk is minimal.
    return f"{rub:,}".replace(",", " ")
