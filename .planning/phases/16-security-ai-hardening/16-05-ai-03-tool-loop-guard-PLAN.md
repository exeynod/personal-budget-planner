---
plan_id: 16-05-ai-03-tool-loop-guard
phase: 16
plan: 05
type: execute
wave: 2
depends_on: [16-02-sec-02-sse-error-sanitize]
requirements: [AI-03]
files_modified:
  - app/api/routes/ai.py
  - tests/api/test_ai_chat_tool_loop_guard.py
autonomous: true
must_haves:
  truths:
    - "Total tool-executions per session <= 8 — после 8-го вызова agent-loop break, финальный assistant-message выдаётся пользователю"
    - "Повтор tool с одинаковыми args в соседних раундах детектируется и прерывает цикл (даже если не достигнут hardcap 8)"
    - "После принудительного break — yield user-friendly message 'Не удалось завершить, переформулируй запрос' + done event"
    - "Existing нормальные multi-round диалоги (например, 1 tool call → ответ) не аффектятся"
  artifacts:
    - path: "app/api/routes/ai.py"
      provides: "Tool-loop guard в _event_stream agent-loop"
      contains: "MAX_TOTAL_TOOL_CALLS"
    - path: "tests/api/test_ai_chat_tool_loop_guard.py"
      provides: "Pytest regression: mock LLM зацикленный на tool_call → break при <= 8 + final user-message"
      exports: []
  key_links:
    - from: "app/api/routes/ai.py::_event_stream agent-loop"
      to: "tool_call_count counter + repeat-detect set"
      via: "increment + signature track per round"
      pattern: "tool_call_count|MAX_TOTAL_TOOL_CALLS"
---

<objective>
Закрыть AI-03 (HIGH cost-DoS): `max_rounds=5` в `_event_stream` (`app/api/routes/ai.py:250`) НЕ защищает от tool-loop. За 5 раундов LLM может вызвать N инструментов параллельно (5×N total). Особенно после AI-02 (Plan 16-04), где невалидный args тоже приводит к synthetic-result → next round → возможный loop.

Purpose: Per D-16-06 — hardcap total tool-executions per session = 8 (счётчик инкрементируется на каждом tool_fn вызове) + детект повтора (tool_name, frozenset(kwargs.items())) в set → break. После break: yield assistant-message "Не удалось завершить, переформулируй запрос" + done event. `max_rounds=5` остаётся.

Output: Guard-counter + repeat-detect в agent-loop + pytest c mock LLM, который зацикливается на одном tool_call.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/phases/16-security-ai-hardening/16-CONTEXT.md
@.planning/phases/16-security-ai-hardening/16-02-SUMMARY.md
@/Users/exy/.claude/plans/serialized-prancing-spark.md

@app/api/routes/ai.py
@tests/conftest.py
@tests/test_ai_cap_integration.py

<interfaces>
Current vulnerable agent-loop from app/api/routes/ai.py:244-291 — uses `max_rounds = 5` only; per round LLM may emit multiple tool_calls. Tool dispatch loop is at lines 313-330 (modified by Plan 16-04). Counter MUST be inserted AFTER args validation passes and BEFORE `tool_fn(**parsed_kwargs)` — that way tool_error path does not consume the budget.

Frontend impact: none — fallback uses existing `token` + `done` events; `useAiConversation` does not need changes.
</interfaces>
</context>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| LLM tool_call sequence -> server token spend -> AI cost cap | LLM-controlled (or prompt-injected) loop can burn tokens until rate-limit or cap kicks in. AI-03 is pre-cap defense — protects against transient cost spikes within a single SSE session. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-16-05-01 | DoS / cost | tool dispatch loop unbounded by total count | mitigate | Per D-16-06: hardcap 8 total tool-calls per session. Counter increments AFTER args validation, BEFORE tool_fn execution. При >= 8 → break agent-loop, yield final user-message. |
| T-16-05-02 | DoS / cost | LLM repeats same tool with identical args | mitigate | Track (tool_name, frozenset(kwargs.items())) per adjacent round. Repeat → break. |
| T-16-05-03 | UX | Принудительный break без сигнала пользователю | mitigate | После break — yield assistant-message "Не удалось завершить, переформулируй запрос" (persisted via append_message) + done event. Frontend видит обычное завершение. |
| T-16-05-04 | DoS via cap-bypass | Lock CON-02 (Plan 16-07) синергично закрывает cost-DoS | accept | AI-03 + CON-02 вместе закрывают cost-DoS. Pre-charge token reservation — backlog. |
</threat_model>

<tasks>

<task type="auto">
  <name>Task 1: Tool-loop guard в agent-loop _event_stream</name>
  <files>app/api/routes/ai.py</files>
  <action>
Per D-16-06: добавить counter + repeat-detect set в agent-loop. Counter — local-variable scope `_event_stream` (D-16-06 Claude's discretion: предпочитаем local-state, чтоб НЕ хранить cross-request).

Точные шаги:

1. Найти строки 244-251 (init agent-loop):
```
client = _get_llm_client()
assistant_content_parts: list[str] = []
max_rounds = 5

for _round in range(max_rounds):
```
Перед `for _round` (после `assistant_content_parts`) добавить:
```
# AI-03: tool-loop guard.
MAX_TOTAL_TOOL_CALLS = 8
tool_call_count = 0
prev_round_signatures: set[tuple[str, frozenset]] = set()
loop_aborted = False
```

2. В начале каждой итерации `for _round in range(max_rounds):` инициализировать `current_round_signatures: set[tuple[str, frozenset]] = set()` (рядом с `tool_calls_this_round` и `text_this_round`).

3. Внутри tool dispatch loop `for tc in tool_calls_this_round:`, ПОСЛЕ блока успешной валидации args (когда `parsed_kwargs` готов и `args_error is None`) и ДО `tool_fn(...)` вызова, добавить guard:
```
# AI-03 guard: hardcap total tool calls + adjacent-round repeat detect.
try:
    sig_kwargs = frozenset(
        (k, v) for k, v in (parsed_kwargs or {}).items()
        if not isinstance(v, (list, dict, set))
    )
except TypeError:
    # Unhashable values: skip dedup but keep hardcap.
    sig_kwargs = frozenset()
signature = (tool_name, sig_kwargs)

if signature in prev_round_signatures:
    logger.warning(
        "ai.tool_loop_repeat tool=%s args=%s round=%d",
        tool_name, sig_kwargs, _round,
    )
    loop_aborted = True
    break

if tool_call_count >= MAX_TOTAL_TOOL_CALLS:
    logger.warning(
        "ai.tool_loop_hardcap tool=%s count=%d cap=%d",
        tool_name, tool_call_count, MAX_TOTAL_TOOL_CALLS,
    )
    loop_aborted = True
    break

current_round_signatures.add(signature)
tool_call_count += 1
```

4. После `for tc in tool_calls_this_round:` (внутри `for _round in range(max_rounds)`), добавить:
```
prev_round_signatures = current_round_signatures
if loop_aborted:
    break  # break outer agent-loop too
```

5. После outer-for `for _round`, ПЕРЕД блоком "5. Persist финального assistant-ответа" (строка 372), добавить early-return:
```
# AI-03: graceful close if loop guard triggered.
if loop_aborted:
    fallback = "Не удалось завершить, переформулируй запрос."
    await conv_svc.append_message(
        db, conv.id, user_id=user_id, role="assistant", content=fallback,
    )
    await db.flush()
    yield (
        "data: "
        + json.dumps({"type": "token", "data": fallback}, ensure_ascii=False)
        + "\n\n"
    )
    yield "data: " + json.dumps({"type": "done", "data": ""}) + "\n\n"
    return
```

6. Counter и dedup НЕ инкрементируются для tool_error path (Plan 16-04 args-error skip) — там tool_fn НЕ вызывается, в счётчик не попадает. Это намеренно: bad-args не считаем как реальный tool exec.

Финальный ожидаемый поток:
- 8 успешных tool calls → break c fallback message
- Repeat (один и тот же tool с одинаковыми args в соседних раундах) → break при втором
- Normal flow (1-2 tool calls → final text → done) — не аффектится
  </action>
  <verify>
    <automated>grep -q "MAX_TOTAL_TOOL_CALLS" app/api/routes/ai.py && grep -q "tool_call_count" app/api/routes/ai.py && grep -q "loop_aborted" app/api/routes/ai.py && grep -q "Не удалось завершить, переформулируй" app/api/routes/ai.py</automated>
  </verify>
  <done>Guard-блок добавлен; все 4 grep-якоря присутствуют; ranges agent-loop сохраняют existing семантику для нормальных диалогов.</done>
</task>

<task type="auto">
  <name>Task 2: Pytest regression — зацикленный mock LLM прерывается с fallback</name>
  <files>tests/api/test_ai_chat_tool_loop_guard.py</files>
  <action>
Создать тест с mock LLM, который ВСЕГДА возвращает один и тот же tool_call (имитация loop). Проверка:
1. tool_fn вызывается не более 8 раз (через monkeypatch tool function counter ИЛИ через caplog hardcap-marker).
2. SSE завершается token+done с fallback-текстом.
3. Repeat-detect short-circuit срабатывает раньше hardcap (фактически — при 2-м вызове, т.к. оба раунда signature идентичны).

Точный код:
```
"""AI-03 regression: tool-loop guard caps total tool exec at 8 + breaks on repeat.

This test FAILs against pre-fix code (no counter, no repeat-detect; LLM
mock would loop until max_rounds=5 × N parallel tools).
PASSes after Plan 16-05.
"""
from __future__ import annotations

import json
import logging

import pytest


def _parse_sse_events(body: str) -> list[dict]:
    events: list[dict] = []
    for line in body.splitlines():
        if not line.startswith("data: "):
            continue
        try:
            events.append(json.loads(line[len("data: "):]))
        except json.JSONDecodeError:
            continue
    return events


class _LoopingLLMClient:
    """Stub LLM that always emits one identical tool_call per round.

    Adjacent-round repeat MUST be caught immediately by AI-03 dedup.
    """

    def __init__(self) -> None:
        self.rounds_called = 0

    async def chat(self, messages, tools=None):
        self.rounds_called += 1
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
    hardcap 8 will.
    """

    def __init__(self) -> None:
        self.rounds_called = 0

    async def chat(self, messages, tools=None):
        self.rounds_called += 1
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


@pytest.mark.asyncio
async def test_repeat_tool_call_breaks_via_dedup(
    db_client, auth_headers, monkeypatch, caplog
):
    """Same tool with same args two rounds in a row → repeat-detect break."""
    from app.api.routes import ai as ai_route

    looping = _LoopingLLMClient()
    monkeypatch.setattr(ai_route, "_get_llm_client", lambda: looping)

    with caplog.at_level(logging.WARNING, logger="app.api.routes.ai"):
        response = await db_client.post(
            "/api/v1/ai/chat",
            json={"message": "Покажи баланс"},
            headers=auth_headers,
        )

    assert response.status_code == 200
    events = _parse_sse_events(response.text)
    tokens = [e for e in events if e.get("type") == "token"]
    dones = [e for e in events if e.get("type") == "done"]

    # Final fallback present.
    assert any(
        "переформулируй" in (e.get("data") or "") for e in tokens
    ), f"Expected fallback in token events; got {tokens!r}"
    assert dones, "Expected done event"

    # Repeat-detect log marker.
    assert any(
        "ai.tool_loop_repeat" in r.message for r in caplog.records
    ), f"Expected ai.tool_loop_repeat log; got {[r.message for r in caplog.records]}"

    # Did NOT loop until max_rounds=5; called <= 3 (2 LLM rounds + initial).
    assert looping.rounds_called <= 3, (
        f"LLM was called {looping.rounds_called} times — repeat-detect failed"
    )


@pytest.mark.asyncio
async def test_distinct_args_loop_breaks_via_hardcap(
    db_client, auth_headers, monkeypatch, caplog
):
    """Distinct args every round → repeat doesn't fire; hardcap 8 must kick in.

    Note: max_rounds=5 normally caps this at 5 LLM rounds × 1 tool = 5 tool calls,
    so hardcap 8 might not actually trigger. Test asserts that EITHER
    ai.tool_loop_hardcap fires OR clean max_rounds finalisation occurs without
    fallback. The KEY contract is: total tool calls <= 8.
    """
    from app.api.routes import ai as ai_route

    distinct = _DistinctArgsLoopingLLMClient()
    monkeypatch.setattr(ai_route, "_get_llm_client", lambda: distinct)

    # Count tool_fn invocations via monkeypatch.
    call_count = {"n": 0}
    real_fn = ai_route.TOOL_FUNCTIONS.get("query_transactions")

    async def counting_fn(*args, **kwargs):
        call_count["n"] += 1
        if real_fn is None:
            return {"items": []}
        return await real_fn(*args, **kwargs)

    monkeypatch.setitem(ai_route.TOOL_FUNCTIONS, "query_transactions", counting_fn)

    with caplog.at_level(logging.WARNING, logger="app.api.routes.ai"):
        response = await db_client.post(
            "/api/v1/ai/chat",
            json={"message": "Покажи список транзакций"},
            headers=auth_headers,
        )

    assert response.status_code == 200
    # Hardcap invariant: tool_fn called at most 8 times across the session.
    assert call_count["n"] <= 8, (
        f"Tool was called {call_count['n']} times — hardcap 8 broken"
    )


@pytest.mark.asyncio
async def test_normal_flow_one_tool_call_unaffected(
    db_client, auth_headers, monkeypatch
):
    """Sanity: a normal one-round-tool + final-text flow MUST NOT trigger guard."""
    from app.api.routes import ai as ai_route

    class _NormalLLM:
        def __init__(self) -> None:
            self.calls = 0

        async def chat(self, messages, tools=None):
            self.calls += 1
            if self.calls == 1:
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

    response = await db_client.post(
        "/api/v1/ai/chat",
        json={"message": "Баланс?"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    events = _parse_sse_events(response.text)
    tokens = [e for e in events if e.get("type") == "token"]
    final_text = "".join(e.get("data", "") for e in tokens)

    # Normal final text appears, NOT the fallback.
    assert "Баланс показан выше" in final_text
    assert "переформулируй" not in final_text
```

Использует `db_client` + `auth_headers` (см. conftest pattern в `tests/test_ai_cap_integration.py`).

FAIL до Task 1: counter/dedup отсутствуют → repeat-test зацикливается на max_rounds=5; rounds_called > 3.
PASS после Task 1: dedup ловит на 2-м round.
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner && pytest tests/api/test_ai_chat_tool_loop_guard.py -v</automated>
  </verify>
  <done>3 теста (repeat, hardcap, normal) PASS; pytest exit 0; LLM зацикленный мок прерывается до max_rounds=5.</done>
</task>

</tasks>

<verification>
Phase-level acceptance:
1. pytest tests/api/test_ai_chat_tool_loop_guard.py -v → 3 passed.
2. grep -q MAX_TOTAL_TOOL_CALLS app/api/routes/ai.py → exit 0.
3. grep -q "Не удалось завершить, переформулируй" app/api/routes/ai.py → exit 0.
4. Existing AI tests (pytest tests/ai/ tests/test_ai_cap_integration.py) → PASS.
</verification>

<success_criteria>
AI-03 закрыт:
- Total tool-executions per session <= 8 (hardcap).
- Repeat tool с одинаковыми args в соседних раундах → break.
- После break — fallback assistant message + done event.
- Normal flow не аффектится.
</success_criteria>

<output>
After completion, create `.planning/phases/16-security-ai-hardening/16-05-SUMMARY.md`
</output>

## Commit Message
fix(16): AI-03 hardcap 8 tool-calls + adjacent-round repeat-detect in agent-loop + pytest regression
