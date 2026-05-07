"""CON-02 regression: enforce_spending_cap atomic against concurrent /ai/chat.

Plan 16-07 (D-16-07): per-user asyncio.Lock around the entire stream
lifecycle ("check spend → LLM call → record_usage"). Without the lock
two concurrent /ai/chat requests for one user — both with cached spend
< cap at dependency-time — would each pass the router-level
``enforce_spending_cap``, both run the LLM, both INSERT to
``ai_usage_log``, doubling the spend past the cap.

Test matrix:

* ``test_concurrent_ai_chat_at_cap_yields_one_pass_one_429``:
  one user, cap=100 cents (1¢ = 0.01 USD), pre-seeded spend=99 cents.
  Two parallel POSTs — exactly one passes, exactly one 429s.
  ``ai_usage_log`` final SUM(est_cost_usd) == exactly 1.00 USD
  (0.99 pre + 0.01 from the single passer; the blocked request never
  reaches ``_record_usage``).

* ``test_concurrent_ai_chat_different_users_both_pass``:
  Two distinct users at cap-1¢. Per-user lock isolation: locks are
  keyed on user_id, so user A's serialisation MUST NOT block user B.
  Both requests succeed (200) in parallel.

Pre-fix expectation: same-user test FAILs with statuses == [200, 200] +
total spend == 1.01 USD (both requests passed the check + both
INSERTed). Post-fix: lock + post-acquire cache-invalidate +
``enforce_spending_cap_for_user`` re-check yields [200, 429] +
total == 1.00 USD.
"""
from __future__ import annotations

import asyncio
import math
import os
from datetime import datetime, timezone

import pytest
import pytest_asyncio
from sqlalchemy import func, select, text


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set — integration test requires DB")


# ── Stub LLM client ───────────────────────────────────────────────────────────

class _MeteredLLM:
    """Stub LLM that emits one token + one usage event @ 0.01 USD + done.

    Mirrors the OpenAI provider event protocol consumed by ``_event_stream``:
      - {"type": "token", "data": str}
      - {"type": "usage", "data": {model, prompt/cached/completion/total_tokens, est_cost_usd}}
      - {"type": "done", "data": ""}

    The 0.01 USD est_cost_usd lands in ``ai_usage_log`` via ``_record_usage``;
    combined with pre-seeded 0.99 USD it brings monthly spend to exactly the
    100-cent cap, which the next concurrent request must trip on its in-lock
    re-check.

    The 50ms sleep AFTER yielding the usage event keeps the lock held long
    enough that both racing requests have entered the route handler before
    the first one's ``_record_usage`` lands. Without it, request A may
    finish so fast that B never sees the contention path.
    """

    async def chat(self, messages, tools=None):
        yield {"type": "token", "data": "ok"}
        yield {
            "type": "usage",
            "data": {
                "model": "gpt-4.1-nano",
                "prompt_tokens": 100,
                "cached_tokens": 0,
                "completion_tokens": 50,
                "total_tokens": 150,
                "est_cost_usd": 0.01,  # = 1 cent (cap-tipping)
            },
        }
        # Hold the lock briefly so the two racers actually contend.
        await asyncio.sleep(0.05)
        yield {"type": "done", "data": ""}


# ── DB fixture ────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def db_client(async_client):
    """Truncate domain tables, override get_db with a real-DB session factory.

    Mirrors the pattern in tests/test_ai_cap_integration.py — the fixture
    returns ``(client, SessionLocal)`` so individual tests can seed data
    via the SessionLocal and drive HTTP via the client.
    """
    _require_db()
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from app.api.dependencies import get_db
    from app.main_api import app
    from tests.helpers.seed import _PHASE13_TRUNCATE_TABLES, _DEFAULT_TRUNCATE_TABLES

    admin_url = os.environ.get("ADMIN_DATABASE_URL") or os.environ["DATABASE_URL"]
    admin_engine = create_async_engine(admin_url, echo=False)
    async with admin_engine.begin() as conn:
        try:
            await conn.execute(
                text(f"TRUNCATE TABLE {_PHASE13_TRUNCATE_TABLES} RESTART IDENTITY CASCADE")
            )
        except Exception:
            await conn.execute(
                text(f"TRUNCATE TABLE {_DEFAULT_TRUNCATE_TABLES} RESTART IDENTITY CASCADE")
            )
    await admin_engine.dispose()

    engine = create_async_engine(os.environ["DATABASE_URL"], echo=False)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    async def real_get_db():
        async with SessionLocal() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = real_get_db

    # Also reset the per-user lock dict between tests so a stale lock from a
    # previous test (e.g. one that asserted 429 mid-stream) cannot leak into
    # this one.
    from app.services import spend_cap as _spend_cap_mod
    _spend_cap_mod._user_locks.clear()

    yield async_client, SessionLocal
    await engine.dispose()
    _spend_cap_mod._user_locks.clear()


# ── Test 1: same-user race ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_concurrent_ai_chat_at_cap_yields_one_pass_one_429(
    db_client, bot_token, owner_tg_id, monkeypatch,
):
    """Two parallel /ai/chat for one user at cap-1¢ → exactly one 200 + one 429.

    Pre-fix: both pass cached check → statuses==[200, 200], total==1.01 USD.
    Post-fix: lock + re-check → statuses==[200, 429], total==1.00 USD.
    """
    from tests.conftest import make_init_data
    from tests.helpers.seed import seed_user, seed_ai_usage_log
    from app.db.models import AiUsageLog, AppUser, UserRole
    from app.api.routes import ai as ai_route
    from app.services.spend_cap import invalidate_user_spend_cache

    client, SessionLocal = db_client

    # Seed: owner with cap=100 cents (= $1) + 99 cents already spent.
    async with SessionLocal() as s:
        user = await seed_user(
            s, tg_user_id=owner_tg_id, role=UserRole.owner,
            onboarded_at=datetime.now(timezone.utc),
        )
        await s.execute(
            text("UPDATE app_user SET spending_cap_cents = 100 WHERE id = :uid"),
            {"uid": user.id},
        )
        await s.commit()
        user_id = user.id

    async with SessionLocal() as s:
        # 0.99 USD = 99 cents pre-spend (1¢ shy of the 100¢ cap).
        await seed_ai_usage_log(s, user_id=user_id, est_cost_usd=0.99)

    await invalidate_user_spend_cache(user_id)

    # Stub LLM (no real OpenAI traffic). monkeypatch _get_llm_client so both
    # requests get the same stub instance.
    monkeypatch.setattr(ai_route, "_get_llm_client", lambda: _MeteredLLM())

    init_data = make_init_data(owner_tg_id, bot_token)

    async def _hit() -> int:
        # Streaming responses must be fully consumed for _record_usage to fire
        # in the success path (it runs inside the SSE generator).
        resp = await client.post(
            "/api/v1/ai/chat",
            json={"message": "ping"},
            headers={"X-Telegram-Init-Data": init_data},
        )
        # Drain body for streaming responses; aclose afterward.
        try:
            _ = resp.text
        finally:
            if hasattr(resp, "aclose"):
                await resp.aclose()
        return resp.status_code

    a, b = await asyncio.gather(_hit(), _hit(), return_exceptions=True)

    statuses = sorted([
        a if isinstance(a, int) else 500,
        b if isinstance(b, int) else 500,
    ])
    assert statuses == [200, 429], (
        f"Expected exactly one 200 + one 429; got {statuses!r} "
        f"(a={a!r}, b={b!r}). Pre-fix would yield [200, 200]."
    )

    # Final state: ai_usage_log SUM == 1.00 USD (0.99 pre + 0.01 from the
    # one passer). The 429-er never reached _record_usage.
    async with SessionLocal() as s:
        await s.execute(text("SET LOCAL row_security = off"))
        total = await s.scalar(
            select(func.coalesce(func.sum(AiUsageLog.est_cost_usd), 0.0))
            .where(AiUsageLog.user_id == user_id)
        )
    assert math.isclose(float(total), 1.00, abs_tol=0.001), (
        f"Expected ai_usage_log total = exactly 1.00 USD (one passer + 99¢ "
        f"pre-seed); got {total}. > 1.00 means BOTH requests recorded usage "
        f"(race not closed)."
    )


# ── Test 2: cross-user isolation ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_concurrent_ai_chat_different_users_both_pass(
    db_client, bot_token, owner_tg_id, monkeypatch,
):
    """Per-user lock isolation: two DIFFERENT users at cap-1¢ both pass in parallel.

    Failure mode caught: a single global Lock (instead of per-user dict)
    would serialise unrelated users — second user would 429 because A's
    INSERT reaches B's in-lock re-check.

    With per-user dict the locks are keyed on user_id, A's stream does not
    delay B's check, both 200.
    """
    from tests.conftest import make_init_data
    from tests.helpers.seed import seed_user, seed_ai_usage_log
    from app.db.models import AppUser, UserRole
    from app.api.routes import ai as ai_route
    from app.services.spend_cap import invalidate_user_spend_cache

    client, SessionLocal = db_client

    # User A — uses owner_tg_id (matches conftest fixtures + auto-resolves
    # via app.core.settings.OWNER_TG_ID for HMAC).
    tg_a = owner_tg_id
    tg_b = 999_002_333  # Distinct from owner + Plan 16-06 test range.

    async with SessionLocal() as s:
        ua = await seed_user(
            s, tg_user_id=tg_a, role=UserRole.owner,
            onboarded_at=datetime.now(timezone.utc),
        )
        ub = await seed_user(
            s, tg_user_id=tg_b, role=UserRole.member,
            onboarded_at=datetime.now(timezone.utc),
        )
        await s.execute(
            text("UPDATE app_user SET spending_cap_cents = 100 WHERE id IN (:a, :b)"),
            {"a": ua.id, "b": ub.id},
        )
        await s.commit()
        ua_id, ub_id = ua.id, ub.id

    async with SessionLocal() as s:
        await seed_ai_usage_log(s, user_id=ua_id, est_cost_usd=0.50)
        await seed_ai_usage_log(s, user_id=ub_id, est_cost_usd=0.50)

    await invalidate_user_spend_cache(ua_id)
    await invalidate_user_spend_cache(ub_id)

    monkeypatch.setattr(ai_route, "_get_llm_client", lambda: _MeteredLLM())

    init_a = make_init_data(tg_a, bot_token)
    init_b = make_init_data(tg_b, bot_token)

    async def _hit(init_data: str) -> int:
        resp = await client.post(
            "/api/v1/ai/chat",
            json={"message": "hi"},
            headers={"X-Telegram-Init-Data": init_data},
        )
        try:
            _ = resp.text
        finally:
            if hasattr(resp, "aclose"):
                await resp.aclose()
        return resp.status_code

    sa, sb = await asyncio.gather(_hit(init_a), _hit(init_b))
    assert sa == 200, f"User A blocked unexpectedly (got {sa}); per-user lock isolation violated"
    assert sb == 200, f"User B blocked unexpectedly (got {sb}); per-user lock isolation violated"
