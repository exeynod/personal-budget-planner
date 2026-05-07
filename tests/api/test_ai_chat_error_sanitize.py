"""SEC-02 (Plan 16-02) regression: sensitive exception details must not leak to SSE.

Pre-fix, `app/api/routes/ai.py:_event_stream` ran:

    except Exception as exc:
        yield f"data: {json.dumps({'type': 'error', 'data': str(exc)})}\\n\\n"

— so any RuntimeError raised inside the LLM-call surface (or any helper it
called) sent its full message to the client over SSE, where ``ChatMessage``
rendered it via ``dangerouslySetInnerHTML``. Combined with SEC-01 this
turned every backend exception into a controllable XSS vector.

Post-fix, `_event_stream` calls ``logger.exception("ai.event_stream_failed",
...)`` (full traceback for ops) and yields ``humanize_provider_error(exc)``
to the client (a fixed set of safe constants).

These tests FAIL on the pre-fix code and PASS after Plan 16-02:

1. ``test_sse_error_event_does_not_leak_exception_internals`` — drains the
   SSE stream and asserts the error payload does not contain a curated set
   of forbidden tokens (class names, SQL fragments, file paths).
2. ``test_sse_error_logs_full_traceback`` — asserts that the full
   RuntimeError text DOES land in the server logs (logger.exception keeps
   the traceback so on-call ops can still debug — sanitization is for the
   SSE payload only).

Both tests reuse the existing ``db_client`` fixture from
``tests/api/test_ai_chat.py`` shape (``yield (async_client, headers)``)
and monkeypatch ``app.api.routes.ai._get_llm_client`` to return a stub
whose ``.chat()`` async-generator raises a noisy RuntimeError.
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

    Bootstraps the owner via ``GET /api/v1/me`` (so AppUser exists), flips
    ``onboarded_at`` to NOW (so the Phase 14 ``require_onboarded`` gate
    doesn't 411 us out), and yields ``(async_client, init_data_headers)``.
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
    # Bootstrap user via /me (creates AppUser row).
    await async_client.get(
        "/api/v1/me",
        headers={"X-Telegram-Init-Data": init_data},
    )

    # Phase 14 require_onboarded: bootstrap path leaves onboarded_at NULL
    # → /ai/* would 411. Flip it manually.
    async with SessionLocal() as _onb_session:
        await _onb_session.execute(
            text("UPDATE app_user SET onboarded_at = NOW() WHERE tg_user_id = :tg"),
            {"tg": owner_tg_id},
        )
        await _onb_session.commit()

    yield async_client, {"X-Telegram-Init-Data": init_data}

    app.dependency_overrides.clear()
    await engine.dispose()


# --- Stub LLM client that raises sensitive RuntimeError -----------------------

_SENSITIVE_TOKENS = (
    "secret_table",
    "RuntimeError",
    "AsyncSession",
    "SELECT FROM",
    "/app/",  # file path leak signal
)

_LEAKY_MESSAGE = (
    "internal SQL: SELECT FROM secret_table; "
    "class=AsyncSession at /app/db/session.py"
)


class _RaisingLLMClient:
    """Stub LLM client whose ``.chat()`` async-generator raises a noisy RuntimeError.

    Mirrors the real ``AbstractLLMClient.chat`` contract (async generator) so
    ``_event_stream`` consumes it via ``async for`` and surfaces the exception
    to its outer ``except Exception`` block — which is the SEC-02 target.
    """

    async def chat(self, messages, tools=None):  # noqa: D401, ARG002
        raise RuntimeError(_LEAKY_MESSAGE)
        yield  # pragma: no cover — make this an async generator function


# --- Tests --------------------------------------------------------------------


@pytest.mark.asyncio
async def test_sse_error_event_does_not_leak_exception_internals(
    db_client, monkeypatch
):
    """Mock LLM raises sensitive RuntimeError → SSE error payload is generic."""
    from app.api.routes import ai as ai_route

    client, headers = db_client

    monkeypatch.setattr(ai_route, "_get_llm_client", lambda: _RaisingLLMClient())

    response = await client.post(
        "/api/v1/ai/chat",
        json={"message": "Привет"},
        headers=headers,
    )
    assert response.status_code == 200, response.text

    # Drain the SSE body. httpx + ASGITransport buffer the stream by default
    # so .text contains all "data: ...\n\n" lines.
    body = response.text

    # Pre-fix this would contain the full leaky message — including all
    # sensitive tokens. Post-fix it must not.
    for token in _SENSITIVE_TOKENS:
        assert token not in body, (
            f"SEC-02 leak: token {token!r} found in raw SSE body: {body[:600]!r}"
        )

    # Find the error SSE event explicitly and assert humanized content.
    error_payloads: list[str] = []
    for line in body.splitlines():
        if not line.startswith("data: "):
            continue
        raw = line[len("data: "):]
        try:
            ev = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if ev.get("type") == "error":
            error_payloads.append(str(ev.get("data") or ""))

    assert error_payloads, (
        f"Expected an error SSE event, got body: {body[:600]!r}"
    )
    error_text = " ".join(error_payloads)

    # Defence-in-depth: also re-check tokens against the parsed payload only
    # (in case a future refactor moves data into a non-flat structure).
    for token in _SENSITIVE_TOKENS:
        assert token not in error_text, (
            f"SEC-02 leak: token {token!r} found in SSE error payload: "
            f"{error_text!r}"
        )

    # Positive assertion: payload must look like one of the
    # humanize_provider_error constants OR the inner-event generic fallback.
    expected_markers = (
        "AI",
        "Не удалось",
        "Внутренняя ошибка",
        "временно недоступен",
        "Слишком много",
    )
    assert any(marker in error_text for marker in expected_markers), (
        f"Expected humanized message; got {error_text!r}"
    )


@pytest.mark.asyncio
async def test_sse_error_logs_full_traceback(
    db_client, monkeypatch, caplog
):
    """``logger.exception('ai.event_stream_failed', ...)`` keeps full traceback.

    Sanitization applies to the SSE payload only — the server log MUST
    retain the original RuntimeError text + traceback so ops can debug.
    """
    from app.api.routes import ai as ai_route

    client, headers = db_client

    monkeypatch.setattr(ai_route, "_get_llm_client", lambda: _RaisingLLMClient())

    with caplog.at_level(logging.ERROR, logger="app.api.routes.ai"):
        response = await client.post(
            "/api/v1/ai/chat",
            json={"message": "Привет"},
            headers=headers,
        )
        assert response.status_code == 200, response.text
        # Drain body to ensure stream completes and the except-block fires.
        _ = response.text

    matching = [
        r for r in caplog.records
        if "ai.event_stream_failed" in r.getMessage()
    ]
    assert matching, (
        "Expected at least one 'ai.event_stream_failed' log record; "
        f"got messages: {[r.getMessage() for r in caplog.records]}"
    )
    # logger.exception(...) attaches exc_info — at least one record must
    # carry the RuntimeError text in its traceback for ops debug.
    has_traceback = any(
        rec.exc_info is not None
        and (rec.exc_text or "")
        and "RuntimeError" in (rec.exc_text or "")
        for rec in matching
    )
    # caplog may format exc_text lazily; if exc_text is empty, fall back
    # to checking exc_info on the record (which logger.exception always
    # populates).
    if not has_traceback:
        has_traceback = any(
            rec.exc_info is not None
            and rec.exc_info[1] is not None
            and "secret_table" in str(rec.exc_info[1])
            for rec in matching
        )
    assert has_traceback, (
        "Expected RuntimeError traceback in the 'ai.event_stream_failed' "
        "log record (logger.exception must capture exc_info), got "
        f"records: {[(r.getMessage(), r.exc_info, r.exc_text) for r in matching]}"
    )
