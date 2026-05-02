"""AUTH-01 / AUTH-02 — Telegram initData validation + OWNER_TG_ID whitelist.

Wave-0 RED stub. The ``app.core.auth`` and ``app.main_api`` modules do not yet
exist, so each test fails with ``ModuleNotFoundError`` until Plans 04 / 05 land.
"""

import pytest


# ---------------------------------------------------------------------------
# Unit tests for app.core.auth.validate_init_data (AUTH-01)
# ---------------------------------------------------------------------------


def test_validate_init_data_valid(bot_token, owner_tg_id):
    from app.core.auth import validate_init_data

    from tests.conftest import make_init_data

    init_data = make_init_data(tg_user_id=owner_tg_id, bot_token=bot_token)
    result = validate_init_data(init_data, bot_token)
    assert result["id"] == owner_tg_id


def test_validate_init_data_invalid_hash(bot_token):
    from app.core.auth import validate_init_data

    init_data = "auth_date=1000000000&user=%7B%22id%22%3A1%7D&hash=deadbeef"
    with pytest.raises(ValueError, match="Invalid hash"):
        validate_init_data(init_data, bot_token)


def test_validate_init_data_missing_hash(bot_token):
    from app.core.auth import validate_init_data

    init_data = "auth_date=1000000000&user=%7B%22id%22%3A1%7D"
    with pytest.raises(ValueError, match="Missing hash"):
        validate_init_data(init_data, bot_token)


def test_validate_init_data_expired(bot_token, owner_tg_id):
    from app.core.auth import validate_init_data

    from tests.conftest import make_init_data

    # 25 hours ago = 90000 seconds — exceeds the 24h freshness window.
    init_data = make_init_data(
        tg_user_id=owner_tg_id, bot_token=bot_token, age_seconds=90000
    )
    with pytest.raises(ValueError, match="auth_date expired"):
        validate_init_data(init_data, bot_token)


# ---------------------------------------------------------------------------
# Integration tests for /api/v1/me whitelist (AUTH-02)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_owner_whitelist_valid(async_client, bot_token, owner_tg_id):
    from tests.conftest import make_init_data

    init_data = make_init_data(tg_user_id=owner_tg_id, bot_token=bot_token)
    response = await async_client.get(
        "/api/v1/me",
        headers={"X-Telegram-Init-Data": init_data},
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_owner_whitelist_foreign(async_client, bot_token):
    from tests.conftest import make_init_data

    init_data = make_init_data(tg_user_id=999999, bot_token=bot_token)
    response = await async_client.get(
        "/api/v1/me",
        headers={"X-Telegram-Init-Data": init_data},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_no_init_data(async_client):
    response = await async_client.get("/api/v1/me")
    assert response.status_code == 403
