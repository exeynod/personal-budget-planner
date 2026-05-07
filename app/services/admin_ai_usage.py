"""Admin AI usage breakdown service (Phase 13 AIUSE-01..03).

Strategy: open a short-lived admin-engine session (ADMIN_DATABASE_URL,
SUPERUSER role) to aggregate ai_usage_log cross-tenant in one SQL query
per time window. The runtime app role (budget_app, NOSUPERUSER NOBYPASSRLS)
cannot do this because RLS would hide rows from other users.

Time windows:
  current_month: 1st of current month at 00:00 Europe/Moscow → now()
  last_30d:      now() - 30 days (UTC) → now()

USD копейки (cents-of-USD storage): 1 USD == 100_000 storage units.
(Equivalent: 1 cent of USD = 1000 копеек of cent.) Formula:
  est_cost_cents = round(est_cost_usd * 100_000)
This matches the cap test in test_admin_ai_usage_api.py — est_cost_usd 0.083
with cap 10_000 yields pct_of_cap 0.83. Plan 13-02 default cap 46500 is a
stub (~$0.465); Phase 15 will calibrate the cap unit to the documented
"$5/month" semantic if the unit semantics are later refined.

The runtime AsyncSession passed in is used only to read app_user (no RLS
on app_user table). The aggregate query opens a separate engine on
ADMIN_DATABASE_URL and disposes it in finally — no impact on the main
connection pool, no cross-request engine sharing.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.api.schemas.admin import AdminAiUsageResponse, AdminAiUsageRow
from app.api.schemas.ai import UsageBucket


# MSK = UTC+3 (Europe/Moscow has not observed DST since 2014).
# Using a fixed offset avoids a tzdata runtime dependency in the container.
MSK_TZ = timezone(timedelta(hours=3))


def _start_of_current_month_msk() -> datetime:
    """Return the first second of the current month in MSK, as UTC datetime."""
    now_msk = datetime.now(MSK_TZ)
    msk_first = now_msk.replace(
        day=1, hour=0, minute=0, second=0, microsecond=0
    )
    return msk_first.astimezone(timezone.utc)


def _last_30d_start() -> datetime:
    """Return now() - 30 days as UTC datetime."""
    return datetime.now(timezone.utc) - timedelta(days=30)


def _empty_bucket() -> UsageBucket:
    return UsageBucket(
        requests=0,
        prompt_tokens=0,
        completion_tokens=0,
        cached_tokens=0,
        total_tokens=0,
        est_cost_usd=0.0,
    )


_AGGREGATE_QUERY = """
SELECT
    user_id,
    count(*) AS requests,
    coalesce(sum(prompt_tokens), 0)     AS prompt_tokens,
    coalesce(sum(completion_tokens), 0) AS completion_tokens,
    coalesce(sum(cached_tokens), 0)     AS cached_tokens,
    coalesce(sum(total_tokens), 0)      AS total_tokens,
    coalesce(sum(est_cost_usd), 0.0)    AS est_cost_usd
FROM ai_usage_log
WHERE created_at >= :start
GROUP BY user_id
"""


def _bucket_from_row(row) -> UsageBucket:
    """row[0] is user_id; aggregates start at row[1]."""
    return UsageBucket(
        requests=int(row[1] or 0),
        prompt_tokens=int(row[2] or 0),
        completion_tokens=int(row[3] or 0),
        cached_tokens=int(row[4] or 0),
        total_tokens=int(row[5] or 0),
        est_cost_usd=float(row[6] or 0.0),
    )


async def build_admin_ai_usage_breakdown(
    db: AsyncSession,
) -> AdminAiUsageResponse:
    """Aggregate per-user AI usage and return AdminAiUsageResponse.

    1. Read users (no RLS on app_user table — runtime DSN OK).
    2. Aggregate ai_usage_log under admin (SUPERUSER) role to bypass RLS.
    3. Build current_month + last_30d UsageBucket per user; users with
       no usage rows get _empty_bucket() and pct_of_cap = 0.0.
    4. Sort by est_cost_cents_current_month desc, then tg_user_id asc.
    """
    # 1. Fetch users via runtime session (no RLS on app_user table).
    users_result = await db.execute(
        text(
            "SELECT id, tg_user_id, tg_chat_id, role, spending_cap_cents "
            "FROM app_user"
        )
    )
    user_rows = list(users_result.all())

    # 2. Aggregate ai_usage_log under admin role (bypasses RLS).
    admin_url = os.environ.get("ADMIN_DATABASE_URL") or os.environ["DATABASE_URL"]
    engine = create_async_engine(admin_url, echo=False)
    sm = async_sessionmaker(engine, expire_on_commit=False)

    cm_start = _start_of_current_month_msk()
    l30_start = _last_30d_start()
    try:
        async with sm() as admin_session:
            cm_result = await admin_session.execute(
                text(_AGGREGATE_QUERY), {"start": cm_start}
            )
            cm_by_user = {row[0]: row for row in cm_result.all()}
            l30_result = await admin_session.execute(
                text(_AGGREGATE_QUERY), {"start": l30_start}
            )
            l30_by_user = {row[0]: row for row in l30_result.all()}
    finally:
        await engine.dispose()

    # 3. Stitch per-user rows.
    rows: list[AdminAiUsageRow] = []
    for ur in user_rows:
        uid, tg_user_id, _tg_chat_id, role_value, cap_cents = ur
        cm_bucket = (
            _bucket_from_row(cm_by_user[uid])
            if uid in cm_by_user
            else _empty_bucket()
        )
        l30_bucket = (
            _bucket_from_row(l30_by_user[uid])
            if uid in l30_by_user
            else _empty_bucket()
        )
        # Phase 15 alignment: scale = 100 cents/USD (matches spending_cap_cents
        # storage in app_user). Previous Phase 13 stub used 100_000 — that gave
        # pct_of_cap ratios off by 1000x once Phase 15 set the canonical cap
        # scale to 100/USD via spend_cap.py. CR-01 fix.
        est_cost_cents_cm = round(float(cm_bucket.est_cost_usd) * 100)
        pct = (
            float(est_cost_cents_cm) / float(cap_cents)
            if cap_cents and cap_cents > 0
            else 0.0
        )
        # role может приходить как str или enum (через text() — str).
        role_str = role_value.value if hasattr(role_value, "value") else str(role_value)
        rows.append(
            AdminAiUsageRow(
                user_id=uid,
                tg_user_id=tg_user_id,
                name=None,  # Phase 14 will populate from tg_chat_id metadata
                role=role_str,
                spending_cap_cents=int(cap_cents),
                current_month=cm_bucket,
                last_30d=l30_bucket,
                est_cost_cents_current_month=est_cost_cents_cm,
                pct_of_cap=pct,
            )
        )

    # 4. Sort: est_cost_cents desc, tg_user_id asc fallback (deterministic).
    rows.sort(
        key=lambda r: (-r.est_cost_cents_current_month, r.tg_user_id)
    )

    return AdminAiUsageResponse(
        users=rows,
        generated_at=datetime.now(timezone.utc),
    )
