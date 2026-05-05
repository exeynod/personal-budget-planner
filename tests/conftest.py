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
