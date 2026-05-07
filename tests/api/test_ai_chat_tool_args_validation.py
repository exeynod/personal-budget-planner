"""AI-02 (Plan 16-04) regression: tool-args validation MUST surface a
``tool_error`` SSE event + ``logger.warning('ai.tool_args_invalid ...')``.

Pre-fix behaviour: ``app/api/routes/ai.py:_event_stream`` swallowed bad JSON
into ``kwargs = {}`` and proceeded to call the tool — producing TypeError
or stale-state results invisible to the client. Mistyped or extra args
were also silently passed through.

Post-fix behaviour (Plan 16-04 / D-16-05):

- JSONDecodeError → SSE ``tool_error`` event + ``logger.warning``.
- Pydantic ``ValidationError`` (mistyped types) → same.
- ``extra='forbid'`` rejects unknown fields → same.
- A synthetic ``tool_result`` is fed back so the LLM message-pair
  invariant is preserved and the model can recover.

These tests reuse the existing ``db_client`` tuple-shape fixture from
``tests/api/test_ai_chat.py`` and ``tests/api/test_ai_chat_error_sanitize.py``,
because no ``auth_headers`` fixture exists in this repo. They monkeypatch
``app.api.routes.ai._get_llm_client`` to return a stub LLM whose async
generator yields a malformed ``tool_call_complete`` event followed by
``done``.
"""
from __future__ import annotations

import json
import logging
import os
from typing import AsyncGenerator

import pytest
import pytest_asyncio


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set — integration test requires DB")


@pytest_asyncio.fixture
async def db_client(async_client, bot_token, owner_tg_id):
    """Local clone of ``tests/api/test_ai_chat.py::db_client``.

    Bootstraps the owner via ``GET /api/v1/me``, flips ``onboarded_at`` to
    NOW (so ``require_onboarded`` doesn't 411 us), and yields
    ``(async_client, init_data_headers)``.
    """
    _require_db()
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.api.dependencies import get_db
    from app.main_api import app
    from tests.conftest import make_init_data
    from tests.helpers.seed import truncate_db

    db_url = os.environ["DATABASE_URL"]
    engine = create_async_engine(db_url, echo=False)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    await truncate_db()

    async def real_get_db() -> AsyncGenerator:
        async with SessionLocal() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = real_get_db

    init_data = make_init_data(owner_tg_id, bot_token)
    await async_client.get(
        "/api/v1/me",
        headers={"X-Telegram-Init-Data": init_data},
    )
    async with SessionLocal() as _onb_session:
        await _onb_session.execute(
            text("UPDATE app_user SET onboarded_at = NOW() WHERE tg_user_id = :tg"),
            {"tg": owner_tg_id},
        )
        await _onb_session.commit()

    yield async_client, {"X-Telegram-Init-Data": init_data}

    app.dependency_overrides.clear()
    await engine.dispose()


# --- SSE helpers --------------------------------------------------------------


def _parse_sse_events(body: str) -> list[dict]:
    """Extract ``data: <json>`` events from a raw SSE response body."""
    events: list[dict] = []
    for line in body.splitlines():
        if not line.startswith("data: "):
            continue
        try:
            events.append(json.loads(line[len("data: "):]))
        except json.JSONDecodeError:
            continue
    return events


# --- Stub LLM clients ---------------------------------------------------------


class _LLMClientWithBadJSON:
    """Stub LLM that emits a tool_call with malformed JSON arguments."""

    async def chat(self, messages, tools=None):  # noqa: ARG002
        yield {"type": "tool_start", "data": "query_transactions"}
        yield {
            "type": "tool_call_complete",
            "data": json.dumps(
                {
                    "id": "call_bad_json",
                    "name": "query_transactions",
                    # Intentionally malformed (unterminated object).
                    "arguments": "{not valid json",
                }
            ),
        }
        yield {"type": "tool_end", "data": ""}
        yield {"type": "done", "data": ""}


class _LLMClientWithMistypedArgs:
    """Stub LLM emitting valid JSON but wrong types for ProposeActualArgs."""

    async def chat(self, messages, tools=None):  # noqa: ARG002
        yield {"type": "tool_start", "data": "propose_actual_transaction"}
        yield {
            "type": "tool_call_complete",
            "data": json.dumps(
                {
                    "id": "call_bad_types",
                    "name": "propose_actual_transaction",
                    # amount_rub must be number; passing string triggers
                    # Pydantic ValidationError.
                    "arguments": json.dumps({"amount_rub": "abc"}),
                }
            ),
        }
        yield {"type": "tool_end", "data": ""}
        yield {"type": "done", "data": ""}


class _LLMClientWithExtraField:
    """Stub LLM that adds an unknown field — extra='forbid' must reject."""

    async def chat(self, messages, tools=None):  # noqa: ARG002
        yield {"type": "tool_start", "data": "query_transactions"}
        yield {
            "type": "tool_call_complete",
            "data": json.dumps(
                {
                    "id": "call_extra",
                    "name": "query_transactions",
                    "arguments": json.dumps(
                        {"limit": 5, "deprecated_field": "boom"}
                    ),
                }
            ),
        }
        yield {"type": "tool_end", "data": ""}
        yield {"type": "done", "data": ""}


# --- Tests --------------------------------------------------------------------


@pytest.mark.asyncio
async def test_bad_json_args_yields_tool_error_event(db_client, monkeypatch, caplog):
    """JSONDecodeError on tool args → SSE ``tool_error`` + warning log."""
    from app.api.routes import ai as ai_route

    client, headers = db_client

    monkeypatch.setattr(
        ai_route, "_get_llm_client", lambda: _LLMClientWithBadJSON()
    )

    with caplog.at_level(logging.WARNING, logger="app.api.routes.ai"):
        response = await client.post(
            "/api/v1/ai/chat",
            json={"message": "Покажи транзакции"},
            headers=headers,
        )
    assert response.status_code == 200, response.text
    events = _parse_sse_events(response.text)

    tool_errors = [e for e in events if e.get("type") == "tool_error"]
    assert tool_errors, f"Expected tool_error event; got {events!r}"
    assert tool_errors[0]["data"]["tool"] == "query_transactions"
    msg = tool_errors[0]["data"]["message"]
    # Humanized message contains "некорректн" (sanitized — no raw exc).
    assert "некорректн" in msg.lower(), msg

    # logger.warning written with structured prefix.
    assert any(
        "ai.tool_args_invalid" in record.getMessage()
        and "query_transactions" in record.getMessage()
        for record in caplog.records
    ), f"Expected ai.tool_args_invalid log; got {[r.getMessage() for r in caplog.records]}"


@pytest.mark.asyncio
async def test_mistyped_args_yields_tool_error_event(db_client, monkeypatch, caplog):
    """Pydantic ValidationError on mistyped types → SSE ``tool_error`` + warning log."""
    from app.api.routes import ai as ai_route

    client, headers = db_client

    monkeypatch.setattr(
        ai_route, "_get_llm_client", lambda: _LLMClientWithMistypedArgs()
    )

    with caplog.at_level(logging.WARNING, logger="app.api.routes.ai"):
        response = await client.post(
            "/api/v1/ai/chat",
            json={"message": "Занеси трату"},
            headers=headers,
        )
    assert response.status_code == 200, response.text
    events = _parse_sse_events(response.text)

    tool_errors = [e for e in events if e.get("type") == "tool_error"]
    assert tool_errors, f"Expected tool_error event; got {events!r}"
    assert tool_errors[0]["data"]["tool"] == "propose_actual_transaction"
    assert any(
        "ai.tool_args_invalid" in r.getMessage() for r in caplog.records
    ), f"Expected ai.tool_args_invalid log; got {[r.getMessage() for r in caplog.records]}"


@pytest.mark.asyncio
async def test_extra_field_rejected_by_extra_forbid(db_client, monkeypatch):
    """Unknown field on a known tool → ``extra='forbid'`` triggers tool_error."""
    from app.api.routes import ai as ai_route

    client, headers = db_client

    monkeypatch.setattr(
        ai_route, "_get_llm_client", lambda: _LLMClientWithExtraField()
    )

    response = await client.post(
        "/api/v1/ai/chat",
        json={"message": "Покажи"},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    events = _parse_sse_events(response.text)
    tool_errors = [e for e in events if e.get("type") == "tool_error"]
    assert tool_errors, (
        f"extra field must trigger tool_error; got {events!r}"
    )
    assert tool_errors[0]["data"]["tool"] == "query_transactions"
