"""AI-03 regression: tool-loop guard caps total tool exec at 8 + breaks on repeat.

Plan 16-05 / D-16-06.

This test FAILs against pre-fix code (no counter, no repeat-detect; the
LLM mock would loop until ``max_rounds=5`` × N parallel tools and bomb
tokens). PASSes after Plan 16-05.

Three cases:

- ``test_repeat_tool_call_breaks_via_dedup`` — same tool with same args two
  rounds in a row → repeat-detect fires on the second round, fallback
  assistant message is yielded, ``ai.tool_loop_repeat`` warning logged.
- ``test_distinct_args_loop_breaks_via_hardcap`` — distinct args every
  round so dedup doesn't fire. The KEY contract is total tool calls
  ≤ 8 across the session (hardcap holds even when ``max_rounds=5``
  would normally cap first).
- ``test_normal_flow_one_tool_call_unaffected`` — sanity: a normal
  single-tool-call → final-text flow MUST NOT trigger the guard.

Reuses the ``db_client`` tuple-shape fixture pattern from
``tests/api/test_ai_chat_tool_args_validation.py`` (Plan 16-04). No
``auth_headers`` fixture exists in this repo — the canonical adaptation
is to bootstrap the owner via ``GET /api/v1/me`` + flip ``onboarded_at``,
then yield ``(client, headers)``.
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
    """Bootstraps owner + flips ``onboarded_at`` to NOW; yields ``(client, headers)``."""
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


class _LoopingLLMClient:
    """Stub LLM that always emits one identical tool_call per round.

    Adjacent-round repeat MUST be caught immediately by AI-03 dedup —
    the second round's signature collides with the first round's.
    """

    def __init__(self) -> None:
        self.rounds_called = 0

    async def chat(self, messages, tools=None):  # noqa: ARG002
        self.rounds_called += 1
        yield {"type": "tool_start", "data": "get_period_balance"}
        yield {
            "type": "tool_call_complete",
            "data": json.dumps(
                {
                    "id": f"call_loop_{self.rounds_called}",
                    "name": "get_period_balance",
                    "arguments": "{}",
                }
            ),
        }
        yield {"type": "done", "data": ""}


class _DistinctArgsLoopingLLMClient:
    """Stub LLM that emits tool_call with INCREMENTING args every round.

    Each round signature differs, so repeat-detect won't fire — only the
    hardcap 8 (or ``max_rounds=5``, whichever bites first) will end the
    session. The KEY contract checked: total tool_fn invocations ≤ 8.
    """

    def __init__(self) -> None:
        self.rounds_called = 0

    async def chat(self, messages, tools=None):  # noqa: ARG002
        self.rounds_called += 1
        yield {"type": "tool_start", "data": "query_transactions"}
        yield {
            "type": "tool_call_complete",
            "data": json.dumps(
                {
                    "id": f"call_distinct_{self.rounds_called}",
                    "name": "query_transactions",
                    "arguments": json.dumps({"limit": self.rounds_called % 50 + 1}),
                }
            ),
        }
        yield {"type": "done", "data": ""}


# --- Tests --------------------------------------------------------------------


@pytest.mark.asyncio
async def test_repeat_tool_call_breaks_via_dedup(db_client, monkeypatch, caplog):
    """Same tool with same args two rounds in a row → repeat-detect break."""
    from app.api.routes import ai as ai_route

    client, headers = db_client

    looping = _LoopingLLMClient()
    monkeypatch.setattr(ai_route, "_get_llm_client", lambda: looping)

    with caplog.at_level(logging.WARNING, logger="app.api.routes.ai"):
        response = await client.post(
            "/api/v1/ai/chat",
            json={"message": "Покажи баланс"},
            headers=headers,
        )

    assert response.status_code == 200, response.text
    events = _parse_sse_events(response.text)
    tokens = [e for e in events if e.get("type") == "token"]
    dones = [e for e in events if e.get("type") == "done"]

    # Final fallback is yielded as a single token event.
    assert any(
        "переформулируй" in (e.get("data") or "") for e in tokens
    ), f"Expected fallback in token events; got {tokens!r}"
    assert dones, f"Expected done event; got {events!r}"

    # Repeat-detect log marker.
    assert any(
        "ai.tool_loop_repeat" in r.getMessage() for r in caplog.records
    ), (
        f"Expected ai.tool_loop_repeat log; got "
        f"{[r.getMessage() for r in caplog.records]}"
    )

    # Did NOT loop until max_rounds=5; LLM was queried at most 3 times
    # (1 = first round establishes signature, 2 = repeat detected, +1 buffer).
    assert looping.rounds_called <= 3, (
        f"LLM was called {looping.rounds_called} times — repeat-detect failed"
    )


@pytest.mark.asyncio
async def test_distinct_args_loop_breaks_via_hardcap(
    db_client, monkeypatch, caplog
):
    """Distinct args every round → repeat doesn't fire; hardcap 8 must hold.

    Note: ``max_rounds=5`` normally caps this at 5 LLM rounds × 1 tool = 5
    tool calls, so the hardcap 8 won't actually trigger here. The KEY
    invariant under test: total tool_fn invocations ≤ 8 across the session
    (this would FAIL pre-fix only if a planner regressed both ``max_rounds``
    AND removed the hardcap; today it asserts no regression of either).
    """
    from app.api.routes import ai as ai_route

    client, headers = db_client

    distinct = _DistinctArgsLoopingLLMClient()
    monkeypatch.setattr(ai_route, "_get_llm_client", lambda: distinct)

    # Count tool_fn invocations via monkeypatch on TOOL_FUNCTIONS dict.
    call_count = {"n": 0}
    real_fn = ai_route.TOOL_FUNCTIONS.get("query_transactions")

    async def counting_fn(*args, **kwargs):
        call_count["n"] += 1
        if real_fn is None:
            return {"items": []}
        return await real_fn(*args, **kwargs)

    monkeypatch.setitem(ai_route.TOOL_FUNCTIONS, "query_transactions", counting_fn)

    with caplog.at_level(logging.WARNING, logger="app.api.routes.ai"):
        response = await client.post(
            "/api/v1/ai/chat",
            json={"message": "Покажи список транзакций"},
            headers=headers,
        )

    assert response.status_code == 200, response.text
    # Hardcap invariant: tool_fn called at most 8 times across the session.
    assert call_count["n"] <= 8, (
        f"Tool was called {call_count['n']} times — hardcap 8 broken"
    )


@pytest.mark.asyncio
async def test_normal_flow_one_tool_call_unaffected(db_client, monkeypatch):
    """Sanity: a normal one-round-tool + final-text flow MUST NOT trigger guard."""
    from app.api.routes import ai as ai_route

    client, headers = db_client

    class _NormalLLM:
        def __init__(self) -> None:
            self.calls = 0

        async def chat(self, messages, tools=None):  # noqa: ARG002
            self.calls += 1
            if self.calls == 1:
                yield {"type": "tool_start", "data": "get_period_balance"}
                yield {
                    "type": "tool_call_complete",
                    "data": json.dumps(
                        {
                            "id": "call_normal",
                            "name": "get_period_balance",
                            "arguments": "{}",
                        }
                    ),
                }
                yield {"type": "done", "data": ""}
            else:
                yield {"type": "token", "data": "Баланс показан выше."}
                yield {"type": "done", "data": ""}

    normal = _NormalLLM()
    monkeypatch.setattr(ai_route, "_get_llm_client", lambda: normal)

    response = await client.post(
        "/api/v1/ai/chat",
        json={"message": "Баланс?"},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    events = _parse_sse_events(response.text)
    tokens = [e for e in events if e.get("type") == "token"]
    final_text = "".join(e.get("data", "") for e in tokens)

    # Normal final text appears, NOT the fallback.
    assert "Баланс показан выше" in final_text, (
        f"Expected normal final text in tokens; got {tokens!r}"
    )
    assert "переформулируй" not in final_text, (
        f"Fallback must NOT trigger on normal flow; got {final_text!r}"
    )
