import hashlib
import hmac
import json
import time
from typing import AsyncGenerator
from urllib.parse import urlencode

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient


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
    return "1234567890:test_bot_token_for_testing_only"


@pytest.fixture
def owner_tg_id() -> int:
    return 123456789


@pytest.fixture
def internal_token() -> str:
    return "test_internal_secret_token"


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
    os.environ["DATABASE_URL"] = (
        "postgresql+asyncpg://budget:budget@localhost:5432/budget_test"
    )
    os.environ["DATABASE_URL_SYNC"] = (
        "postgresql://budget:budget@localhost:5432/budget_test"
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
