import hashlib
import hmac
import json
import os
import time
from typing import AsyncGenerator
from urllib.parse import urlencode

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient


# Set test env vars at conftest import time so any module-level
# `from app.* import *` in test files loads `app.core.settings` with
# non-default values. `setdefault` lets CI/external env override.
# Required because `validate_production_settings()` (called from each
# entry point's lifespan/startup) refuses to start with the "changeme"
# defaults when DEV_MODE=False.
os.environ.setdefault("BOT_TOKEN", "1234567890:test_bot_token_for_testing_only")
os.environ.setdefault("OWNER_TG_ID", "123456789")
os.environ.setdefault("INTERNAL_TOKEN", "test_internal_secret_token")
os.environ.setdefault("DEV_MODE", "false")
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://budget:budget@localhost:5432/budget_test",
)
os.environ.setdefault(
    "DATABASE_URL_SYNC",
    "postgresql://budget:budget@localhost:5432/budget_test",
)
os.environ.setdefault("PUBLIC_DOMAIN", "localhost")
# Phase 10.1: validate_production_settings now requires a non-placeholder
# OPENAI_API_KEY whenever AI is enabled (independent of DEV_MODE). Tests
# don't make real OpenAI calls — those are mocked or skipped — so a fake
# token is enough to satisfy the boot-time validator.
os.environ.setdefault("OPENAI_API_KEY", "sk-test-fake-key-for-pytest-only")


def pytest_collection_modifyitems(config, items):
    """Auto-skip auth-failure tests when DEV_MODE=true.

    The dev override (docker-compose.dev.yml) intentionally bypasses HMAC
    initData validation — see app/core/settings.py validate_production_settings
    and CONTEXT D-05. Tests that assert 403 without initData are correct
    under prod settings but legitimately return 200 in dev. We skip them
    here so integration runs (./scripts/run-integration-tests.sh) stay green.

    Auth path is still covered by tests/test_auth.py against direct calls
    that don't go through the dev-overridden HTTP layer.
    """
    if os.environ.get("DEV_MODE", "").lower() != "true":
        return
    skip_auth = pytest.mark.skip(
        reason="DEV_MODE bypasses initData validation — auth path covered separately"
    )
    auth_keywords = (
        "requires_auth",
        "auth_403",
        "no_init_data",
        "requires_init_data",
        "owner_whitelist_foreign",
    )
    for item in items:
        if any(kw in item.name for kw in auth_keywords):
            item.add_marker(skip_auth)


def make_init_data(tg_user_id: int, bot_token: str, age_seconds: int = 0) -> str:
    """Generate valid Telegram initData for testing.

    Mirrors the HMAC-SHA256 algorithm from docs/HLD.md §7.1:
      1. Build sorted "key=value" lines joined by "\n" (data_check_string).
      2. secret_key = HMAC_SHA256("WebAppData", bot_token).
      3. hash      = HMAC_SHA256(data_check_string, secret_key).hexdigest().

    Parameters
    ----------
    tg_user_id:
        Telegram user id placed in the ``user`` JSON blob.
    bot_token:
        Bot token used to derive the secret key.
    age_seconds:
        Subtracted from ``time.time()`` to age ``auth_date``. Use a value
        greater than 86400 (24h) to test the expiry branch.
    """
    auth_date = int(time.time()) - age_seconds
    user_json = json.dumps({"id": tg_user_id, "first_name": "Test"})
    params = {
        "auth_date": str(auth_date),
        "user": user_json,
    }
    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(params.items()))
    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    calc_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    params["hash"] = calc_hash
    return urlencode(params)


@pytest.fixture
def bot_token() -> str:
    import os
    # If settings has already been loaded (e.g. due to a module-level import
    # in another test file triggering app.core.settings at collection time),
    # return the token that settings.BOT_TOKEN was initialised with so that
    # make_init_data() and validate_init_data() use the same key.
    try:
        from app.core.settings import settings as _s
        if _s.BOT_TOKEN and _s.BOT_TOKEN != "changeme":
            return _s.BOT_TOKEN
    except Exception:
        pass
    # Fallback: use env var if set, else the hard-coded test default.
    return os.environ.get("BOT_TOKEN", "1234567890:test_bot_token_for_testing_only")


@pytest.fixture
def owner_tg_id() -> int:
    import os
    # Mirror bot_token: if settings is already loaded, match its OWNER_TG_ID.
    try:
        from app.core.settings import settings as _s
        if _s.OWNER_TG_ID and _s.OWNER_TG_ID != 0:
            return _s.OWNER_TG_ID
    except Exception:
        pass
    return int(os.environ.get("OWNER_TG_ID", "123456789"))


@pytest.fixture
def internal_token() -> str:
    import os
    try:
        from app.core.settings import settings as _s
        if _s.INTERNAL_TOKEN and _s.INTERNAL_TOKEN != "changeme":
            return _s.INTERNAL_TOKEN
    except Exception:
        pass
    return os.environ.get("INTERNAL_TOKEN", "test_internal_secret_token")


@pytest_asyncio.fixture
async def _rls_test_role():
    """Ensure a non-superuser DB role 'budget_rls_test' exists for RLS tests.

    Phase 11 Plan 11-07: Postgres RLS only enforces against table owners when
    FORCE ROW LEVEL SECURITY is set, but **superusers always bypass RLS**.
    The dev/test stack runs as ``budget`` which is a superuser (created by
    the postgres entrypoint with POSTGRES_USER). To verify RLS actually
    enforces the policies (MUL-02), tests must temporarily switch role
    via ``SET LOCAL ROLE budget_rls_test`` (a NOSUPERUSER NOBYPASSRLS role).

    This is a TEST-ONLY artefact: production runtime currently uses the
    superuser ``budget`` role too — refactoring to a non-superuser app role
    is Phase 12 prerequisite (tracked in deferred-items).

    Yields the role name (str). Teardown is best-effort — role is left in
    place across tests (cheap, idempotent).
    """
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        pytest.skip("DATABASE_URL not set — integration test requires DB")

    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy import text

    role_name = "budget_rls_test"
    engine = create_async_engine(db_url, echo=False, pool_pre_ping=True)
    try:
        async with engine.connect() as conn:
            # Idempotent role create: drop & recreate to ensure clean state.
            await conn.execute(
                text(
                    "DO $$ BEGIN "
                    f"IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='{role_name}') THEN "
                    f"  CREATE ROLE {role_name} NOSUPERUSER NOBYPASSRLS; "
                    "END IF; END $$;"
                )
            )
            # Grants: read+write on all current and future tables in public.
            # Required so SET LOCAL ROLE doesn't break with permission denied.
            await conn.execute(
                text(f"GRANT USAGE ON SCHEMA public TO {role_name}")
            )
            await conn.execute(
                text(
                    "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES "
                    f"IN SCHEMA public TO {role_name}"
                )
            )
            await conn.execute(
                text(
                    "GRANT USAGE, SELECT ON ALL SEQUENCES "
                    f"IN SCHEMA public TO {role_name}"
                )
            )
            await conn.commit()
    except Exception as exc:
        await engine.dispose()
        pytest.skip(f"Could not provision RLS test role: {exc}")
    await engine.dispose()
    yield role_name


@pytest_asyncio.fixture
async def db_session():
    """Real async DB session for integration tests that need real Postgres.

    Skips if DATABASE_URL is unset OR points at the localhost fallback that
    isn't actually running (typical when pytest is invoked without
    docker-compose). For the in-container path, DATABASE_URL is injected by
    docker-compose to `db:5432/budget_db` and tests run end-to-end.

    Use scripts/run-integration-tests.sh to boot the stack, run pytest, and
    tear down — this fixture is the consumer of that DB.

    Each test gets a fresh session; changes are rolled back on teardown so
    tests don't bleed state into each other.
    """
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        pytest.skip("DATABASE_URL not set — integration test requires DB")

    from sqlalchemy.ext.asyncio import (
        AsyncSession,
        async_sessionmaker,
        create_async_engine,
    )

    engine = create_async_engine(db_url, echo=False, pool_pre_ping=True)
    try:
        # Probe — fail fast with a clean skip if the DB isn't reachable
        # (covers the "DATABASE_URL points at localhost but no compose" case).
        async with engine.connect() as conn:
            await conn.execute(__import__("sqlalchemy").text("SELECT 1"))
    except Exception as exc:
        await engine.dispose()
        pytest.skip(f"DB not reachable at {db_url}: {exc}")

    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as session:
        try:
            yield session
        finally:
            await session.rollback()
    await engine.dispose()


@pytest_asyncio.fixture
async def async_client(bot_token, owner_tg_id, internal_token):
    """async_client — HTTP client for FastAPI app with test settings injected.

    Uses ``app.dependency_overrides[get_db]`` to replace the real async engine
    with a no-op stub, preventing the production DB from being touched at
    import time. Tests that genuinely need a database must override
    ``get_db`` again themselves (and gate themselves on a
    ``TEST_DATABASE_URL`` env var).

    NOTE: ``from app.main_api import app`` and ``from app.api.dependencies
    import get_db`` will fail with ``ModuleNotFoundError`` until Plans 02–05
    introduce those modules. That failure is the intended Wave-0 RED state.
    """
    import os

    os.environ["BOT_TOKEN"] = bot_token
    os.environ["OWNER_TG_ID"] = str(owner_tg_id)
    os.environ["INTERNAL_TOKEN"] = internal_token
    os.environ["DEV_MODE"] = "false"
    # Use setdefault for DB URLs — when running inside docker-compose
    # (scripts/run-integration-tests.sh), DATABASE_URL is already set to
    # `db:5432` by compose. Hard-coding `localhost:5432` here would break
    # in-container resolution (no `localhost` postgres there).
    os.environ.setdefault(
        "DATABASE_URL",
        "postgresql+asyncpg://budget:budget@localhost:5432/budget_test",
    )
    os.environ.setdefault(
        "DATABASE_URL_SYNC",
        "postgresql://budget:budget@localhost:5432/budget_test",
    )
    os.environ["PUBLIC_DOMAIN"] = "localhost"

    from app.main_api import app
    from app.api.dependencies import get_db

    async def override_get_db() -> AsyncGenerator:
        # Stub: yields nothing — tests that need a real DB must override
        # this dependency again with their own session factory.
        yield None  # type: ignore[misc]

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def two_tenants(db_session):
    """Создаёт двух юзеров (user_a, user_b) с собственными seed-данными.

    Returns dict:
        {
            'user_a': {'id': int, 'tg_user_id': int,
                       'category_ids': list[int], 'sub_id': int},
            'user_b': {'id': int, 'tg_user_id': int,
                       'category_ids': list[int], 'sub_id': int},
        }

    Использует tg_user_id-ы 9_000_000_001 / 9_000_000_002 — не пересекаются
    с OWNER_TG_ID test default (123456789) и production диапазонами.

    Cleanup: до и после теста удаляет тестовых юзеров с RLS bypass'ом через
    SET LOCAL row_security = off (требует database role с привилегиями;
    в test env обычно есть). Сначала domain data (FK RESTRICT), потом app_user.
    """
    from datetime import date
    from sqlalchemy import text

    from app.db.models import (
        AppUser, UserRole, Category, CategoryKind,
        Subscription, SubCycle,
    )

    tg_a, tg_b = 9_000_000_001, 9_000_000_002

    async def _cleanup():
        # На случай если предыдущий тест переключил session_role на не-superuser
        # (через SET LOCAL ROLE budget_rls_test) — вернуть superuser, иначе
        # RLS блокирует cleanup DELETE'ы (нечего показывать → нечего удалять).
        await db_session.execute(text("RESET ROLE"))
        # Bypass RLS для administrative cleanup.
        await db_session.execute(text("SET LOCAL row_security = off"))
        # Получить id-ы юзеров если есть.
        result = await db_session.execute(
            text("SELECT id FROM app_user WHERE tg_user_id = ANY(:tgs)"),
            {"tgs": [tg_a, tg_b]},
        )
        user_ids = [row[0] for row in result.all()]
        if user_ids:
            # Сначала domain rows (FK RESTRICT) — order соответствует FK depth.
            for tbl in (
                "ai_message",
                "ai_conversation",
                "category_embedding",
                "actual_transaction",
                "planned_transaction",
                "subscription",
                "plan_template_item",
                "budget_period",
                "category",
            ):
                await db_session.execute(
                    text(f"DELETE FROM {tbl} WHERE user_id = ANY(:uids)"),
                    {"uids": user_ids},
                )
            await db_session.execute(
                text("DELETE FROM app_user WHERE id = ANY(:uids)"),
                {"uids": user_ids},
            )
        await db_session.commit()

    # Pre-test cleanup
    await _cleanup()

    # Create users
    user_a = AppUser(tg_user_id=tg_a, role=UserRole.member, cycle_start_day=5)
    user_b = AppUser(tg_user_id=tg_b, role=UserRole.member, cycle_start_day=5)
    db_session.add_all([user_a, user_b])
    await db_session.flush()

    # Categories — обе с одинаковыми именами (тест scoped unique)
    cat_a1 = Category(user_id=user_a.id, name="Продукты", kind=CategoryKind.expense, sort_order=10)
    cat_a2 = Category(user_id=user_a.id, name="Транспорт", kind=CategoryKind.expense, sort_order=20)
    cat_b1 = Category(user_id=user_b.id, name="Продукты", kind=CategoryKind.expense, sort_order=10)
    cat_b2 = Category(user_id=user_b.id, name="Транспорт", kind=CategoryKind.expense, sort_order=20)
    db_session.add_all([cat_a1, cat_a2, cat_b1, cat_b2])
    await db_session.flush()

    # Subscriptions — обе с одинаковыми именами (test scoped unique)
    sub_a = Subscription(
        user_id=user_a.id, name="Netflix",
        amount_cents=99900, cycle=SubCycle.monthly,
        next_charge_date=date(2026, 6, 1),
        category_id=cat_a1.id, notify_days_before=2, is_active=True,
    )
    sub_b = Subscription(
        user_id=user_b.id, name="Netflix",
        amount_cents=149900, cycle=SubCycle.monthly,
        next_charge_date=date(2026, 6, 1),
        category_id=cat_b1.id, notify_days_before=2, is_active=True,
    )
    db_session.add_all([sub_a, sub_b])
    await db_session.flush()
    await db_session.commit()

    try:
        yield {
            "user_a": {
                "id": user_a.id, "tg_user_id": tg_a,
                "category_ids": [cat_a1.id, cat_a2.id],
                "sub_id": sub_a.id,
            },
            "user_b": {
                "id": user_b.id, "tg_user_id": tg_b,
                "category_ids": [cat_b1.id, cat_b2.id],
                "sub_id": sub_b.id,
            },
        }
    finally:
        await _cleanup()
