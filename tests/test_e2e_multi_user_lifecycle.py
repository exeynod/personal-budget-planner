"""Layer 4 — End-to-end multi-user lifecycle tests for v0.4.

Sequence covered (HTTP-only, no UI):
  E2E-1 owner happy path
  E2E-2 invite-flow (owner invites member, gate active before onboarding)
  E2E-3 member onboarding (seed + embeddings via mocked OpenAI)
  E2E-4 cross-tenant isolation (member-A cannot see/touch member-B data)
  E2E-5 cap enforcement (cap=0 → 429; PATCH cap → unblock)
  E2E-6 revoke + cascade purge (member's domain data deleted)

Runs inside the api container (DEV_MODE=true → HMAC bypass; we craft initData
anyway to exercise the production path where applicable, but multi-user
identity switching is done via DATABASE_URL direct seeds + initData per call).

Mocks ONLY the OpenAI provider — embedding_service.embed_texts and the LLM
client. All other code paths run against the real DB.
"""

from __future__ import annotations

import os
from datetime import date
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set — skipping DB-backed E2E test")


@pytest_asyncio.fixture
async def e2e_env(async_client, bot_token):
    """Build the lifecycle stack: real DB, real ASGI, mocked OpenAI.

    Yields a dict:
        {
          "client": async_client,
          "SessionLocal": async_sessionmaker,
          "make_init": callable(tg_user_id) -> initData str,
          "owner_tg": int,
          "member_a_tg": int,
          "member_b_tg": int,
          "embed_mock": AsyncMock,
        }
    """
    _require_db()
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.api.dependencies import get_db
    from app.main_api import app
    from tests.conftest import make_init_data

    db_url = os.environ["DATABASE_URL"]
    engine = create_async_engine(db_url, echo=False)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    from tests.helpers.seed import truncate_db_phase13

    await truncate_db_phase13()

    async def real_get_db():
        async with SessionLocal() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = real_get_db

    owner_tg = 9_500_000_001
    member_a_tg = 9_500_000_002
    member_b_tg = 9_500_000_003

    def make_init(tg_user_id: int) -> str:
        return make_init_data(tg_user_id, bot_token)

    # Mock OpenAI: embed_texts returns deterministic vectors,
    # so embedding backfill works against real DB.
    async def fake_embed_texts(texts):
        from app.ai.embedding_service import EMBEDDING_DIM

        return [[0.001 * i] * EMBEDDING_DIM for i in range(len(texts))]

    embed_mock = AsyncMock(side_effect=fake_embed_texts)

    with (
        patch("app.ai.embedding_service.EmbeddingService.embed_texts", embed_mock),
        patch(
            "app.ai.embedding_service.EmbeddingService.embed_text",
            new=AsyncMock(side_effect=lambda txt: [0.001] * 1536),
        ),
    ):
        yield {
            "client": async_client,
            "SessionLocal": SessionLocal,
            "make_init": make_init,
            "owner_tg": owner_tg,
            "member_a_tg": member_a_tg,
            "member_b_tg": member_b_tg,
            "embed_mock": embed_mock,
        }

    app.dependency_overrides.clear()
    await engine.dispose()


# ---------------------------------------------------------------------------
# E2E-1: Owner happy path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_e2e_1_owner_happy_path(e2e_env):
    """Owner: /me bootstrap → onboarding → categories → actual → balance → admin/users."""
    client = e2e_env["client"]
    owner_init = {"X-Telegram-Init-Data": e2e_env["make_init"](e2e_env["owner_tg"])}

    # 1. Bootstrap: GET /me upserts the AppUser row in DEV_MODE
    me_resp = await client.get("/api/v1/me", headers=owner_init)
    assert me_resp.status_code == 200
    me = me_resp.json()
    assert me["role"] == "owner"

    # Phase 33 CMP-33-04: grant ПДн consent so v1.0 onboarding passes the gate.
    # NOTE: under DEV_MODE the /me bootstrap upserts the OWNER_TG_ID row (not the
    # test's synthetic owner_tg), so we grant consent for every row in the
    # isolated test DB rather than filtering by tg_user_id.
    SessionLocal = e2e_env["SessionLocal"]
    from sqlalchemy import text

    async with SessionLocal() as session:
        await session.execute(text("UPDATE app_user SET pdn_consent_at = NOW()"))
        await session.commit()

    # 2. Complete onboarding — v1.0 contract (Phase 22 BE-15): income_cents +
    # accounts + category_plans. Seeds 8 default categories + 1 'savings' = 9.
    onb = await client.post(
        "/api/v1/onboarding/complete",
        json={
            "income_cents": 1_000_000,
            "accounts": [{"bank": "Tinkoff", "kind": "card", "primary": True}],
            "category_plans": {"food": 100_000, "cafe": 50_000},
        },
        headers=owner_init,
    )
    assert onb.status_code == 200, onb.text
    onb_body = onb.json()
    assert onb_body["income_cents"] == 1_000_000
    assert len(onb_body["category_ids_by_code"]) == 8  # 8 default codes
    assert onb_body["adjustment_category_id"] > 0  # system 'savings' category
    assert onb_body["onboarded_at"] is not None

    # 3. List categories — 8 defaults + 1 'savings' = 9.
    cats = await client.get("/api/v1/categories", headers=owner_init)
    assert cats.status_code == 200
    assert len(cats.json()) == 9
    expense_cat_id = next(
        (c["id"] for c in cats.json() if c["kind"] == "expense"), None
    )
    assert expense_cat_id is not None

    # 4. Create actual transaction (auto-creates the budget_period).
    actual = await client.post(
        "/api/v1/actual",
        json={
            "kind": "expense",
            "amount_cents": 50_000,
            "category_id": expense_cat_id,
            "tx_date": date.today().isoformat(),
            "description": "E2E-1 test",
        },
        headers=owner_init,
    )
    assert actual.status_code in (200, 201), actual.text

    # 5. Balance check — v1.0 onboarding does not pre-create a period, so the
    # period auto-created by the actual above carries starting_balance_cents=0.
    bal = await client.get("/api/v1/actual/balance", headers=owner_init)
    assert bal.status_code == 200
    bal_body = bal.json()
    assert bal_body["starting_balance_cents"] == 0
    assert (
        bal_body["actual_total_expense_cents"] >= 50_000
    )  # the actual we just created

    # 6. Admin endpoint accessible
    admin_users = await client.get("/api/v1/admin/users", headers=owner_init)
    assert admin_users.status_code == 200


# ---------------------------------------------------------------------------
# NOTE (prune): the E2E-2 (invite-gate), E2E-3 (member onboarding+embeddings),
# E2E-4 (cross-tenant), E2E-5 (cap enforcement) scenarios were collapsed out of
# this lifecycle smoke. Their behaviours are covered by dedicated suites:
#   - onboarding gate → test_require_onboarded.py / test_onboarding_gate.py
#   - member onboarding + embeddings → test_onboarding_v10.py +
#     test_embedding_backfill.py
#   - cross-tenant isolation → test_security_probes.py sp7 +
#     test_multitenancy_v1_0_columns.py
#   - cap enforcement → test_enforce_spending_cap_dep.py +
#     test_ai_cap_integration.py
# E2E-1 (owner full happy path) and E2E-6 (revoke cascade purge) remain as the
# two end-to-end smokes.
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# E2E-6: Revoke cascade purge
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_e2e_6_revoke_cascade_purge(e2e_env):
    """member with category, actual, ai_usage_log → admin DELETE → CASCADE wipes data."""
    from sqlalchemy import text

    SessionLocal = e2e_env["SessionLocal"]
    client = e2e_env["client"]
    owner_init = {"X-Telegram-Init-Data": e2e_env["make_init"](e2e_env["owner_tg"])}
    from app.db.models import CategoryKind

    # Bootstrap owner with full state
    await client.get("/api/v1/me", headers=owner_init)
    async with SessionLocal() as session:
        await session.execute(
            text("UPDATE app_user SET onboarded_at = NOW() WHERE tg_user_id = :tg"),
            {"tg": e2e_env["owner_tg"]},
        )
        await session.commit()

    # Invite member (returns id)
    invite = await client.post(
        "/api/v1/admin/users",
        json={"tg_user_id": e2e_env["member_b_tg"]},
        headers=owner_init,
    )
    assert invite.status_code in (200, 201)
    member_id = invite.json()["id"]

    # Seed member's domain rows directly: 1 category + 1 ai_usage_log row
    async with SessionLocal() as session:
        await session.execute(text("RESET ROLE"))
        await session.execute(text("SET LOCAL row_security = off"))
        from tests.helpers.seed import seed_category

        cat = await seed_category(
            session,
            user_id=member_id,
            name="Member-stuff",
            kind=CategoryKind.expense,
            sort_order=10,
        )
        await session.execute(
            text(
                # Phase 67 R8: cost_cents BIGINT (was est_cost_usd Float).
                "INSERT INTO ai_usage_log "
                "(user_id, model, prompt_tokens, completion_tokens, "
                "cached_tokens, total_tokens, cost_cents, created_at) "
                "VALUES (:uid, 'gpt-4o-mini', 100, 50, 0, 150, 1, NOW())"
            ),
            {"uid": member_id},
        )
        await session.commit()

    # DELETE member via admin endpoint
    revoke = await client.delete(
        f"/api/v1/admin/users/{member_id}",
        headers=owner_init,
    )
    assert revoke.status_code in (200, 204), revoke.text

    # Verify cascade purge
    async with SessionLocal() as session:
        await session.execute(text("RESET ROLE"))
        await session.execute(text("SET LOCAL row_security = off"))
        cat_count = (
            await session.execute(
                text("SELECT COUNT(*) FROM category WHERE user_id = :uid"),
                {"uid": member_id},
            )
        ).scalar_one()
        usage_count = (
            await session.execute(
                text("SELECT COUNT(*) FROM ai_usage_log WHERE user_id = :uid"),
                {"uid": member_id},
            )
        ).scalar_one()
        # AppUser row may be hard-deleted OR role flipped to revoked.
        user_row = (
            await session.execute(
                text("SELECT role FROM app_user WHERE id = :id"),
                {"id": member_id},
            )
        ).first()

    assert cat_count == 0, f"category not purged: {cat_count} rows remain"
    assert usage_count == 0, f"ai_usage_log not purged: {usage_count} rows remain"
    # Either soft-revoke (role=revoked) or hard delete (None) is acceptable
    # per Phase 13 ADM-05 cascade-purge semantics.
    if user_row is not None:
        role = user_row[0]
        assert role in ("revoked", None) or str(role).endswith("revoked"), (
            f"unexpected post-revoke role: {role!r}"
        )
