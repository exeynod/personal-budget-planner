---
plan_id: 16-04-ai-02-tool-args-validation
phase: 16
plan: 04
type: execute
wave: 2
depends_on: [16-02-sec-02-sse-error-sanitize]
requirements: [AI-02]
files_modified:
  - app/ai/tool_args.py
  - app/ai/tools.py
  - app/api/routes/ai.py
  - frontend/src/api/types.ts
  - frontend/src/hooks/useAiConversation.ts
  - tests/api/test_ai_chat_tool_args_validation.py
autonomous: true
must_haves:
  truths:
    - "Невалидный JSON в `tool.function.arguments` НЕ даёт silent `kwargs={}` — вместо этого SSE-event `{type: 'tool_error', data: {tool: <name>, message: <human>}}`"
    - "Mistyped args (`amount_rub: 'abc'`) → ValidationError → SSE `tool_error` event + `logger.warning('ai.tool_args_invalid ...')`"
    - "Frontend `useAiConversation` ловит `tool_error` event → выставляет `error` state с user-friendly текстом"
    - "Existing valid tool-calls (corrupted args НЕ происходят) продолжают работать без regression"
  artifacts:
    - path: "app/ai/tool_args.py"
      provides: "Pydantic ToolArgs models per tool"
      exports: ["ProposeActualArgs", "ProposePlannedArgs", "GetCategorySummaryArgs", "QueryTransactionsArgs", "TOOL_ARGS_MODELS"]
    - path: "app/api/routes/ai.py"
      provides: "Validation + tool_error SSE event"
      contains: "ToolArgsValidationError"
    - path: "frontend/src/api/types.ts"
      provides: "Extended AiEventType union with tool_error"
      contains: "tool_error"
    - path: "tests/api/test_ai_chat_tool_args_validation.py"
      provides: "Pytest covers JSONDecodeError + ValidationError + happy path"
      exports: []
  key_links:
    - from: "app/api/routes/ai.py::_event_stream tool_call dispatch (lines 313-330)"
      to: "TOOL_ARGS_MODELS[tool_name].model_validate(kwargs)"
      via: "valid → tool_fn(**model.model_dump()); invalid → SSE tool_error + logger.warning"
      pattern: "TOOL_ARGS_MODELS\\["
    - from: "frontend/src/hooks/useAiConversation.ts::handleEvent"
      to: "setError при event.type === 'tool_error'"
      via: "новая ветка в reducer"
      pattern: "tool_error"
---

<objective>
Закрыть AI-02 (HIGH): tool-args в `_event_stream` НЕ валидируются по TOOLS_SCHEMA. JSONDecodeError → silent `kwargs={}`, mistyped types — пропускаются. Это плохой UX + слепота к prompt-injection попыткам + неявный контракт tool-функций.

Purpose: Per D-16-05 — Pydantic-модели на каждый tool, валидация перед dispatch, новый SSE event-тип `tool_error` для frontend, `logger.warning("ai.tool_args_invalid ...")` audit-trail.

Output: Pydantic ToolArgs (новый файл), валидация в _event_stream, новый SSE event, frontend handler, pytest-regression. Зависит от Plan 16-02 (SEC-02): тот переименовывает `_humanize_provider_error` → `humanize_provider_error` и добавляет logger.exception в _event_stream — мы переиспользуем тот же импорт.
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
@app/ai/tools.py
@frontend/src/api/types.ts
@frontend/src/hooks/useAiConversation.ts
@tests/conftest.py
@tests/test_ai_cap_integration.py

<interfaces>
<!-- Current vulnerable dispatch from app/api/routes/ai.py:313-330 -->
```python
for tc in tool_calls_this_round:
    tool_name = tc.get("name", "")
    raw_args = tc.get("arguments", "{}") or "{}"
    try:
        kwargs = json.loads(raw_args)
    except json.JSONDecodeError:
        kwargs = {}  # SILENT — bad

    tool_fn = TOOL_FUNCTIONS.get(tool_name)
    if tool_fn:
        kwargs.pop("user_id", None)
        tool_result = await tool_fn(db, user_id=user_id, **kwargs)
```

<!-- TOOLS_SCHEMA structure from app/ai/tools.py:501+ — JSON-schema per OpenAI function-calling spec.
Tools registered in TOOL_FUNCTIONS dict (line 648):
  - get_period_balance: no args
  - get_category_summary: optional category_id (int)
  - query_transactions: limit (int, default 10), kind (enum), category_id (int)
  - get_forecast: no args
  - propose_actual_transaction: amount_rub (number, required), kind (enum), description (str), tx_date (str)
  - propose_planned_transaction: amount_rub (number, required), kind (enum), description (str), day_of_period (int)
-->

<!-- Frontend AiStreamEvent union from frontend/src/api/types.ts:342-391 -->
```ts
export type AiEventType =
  | 'token' | 'tool_start' | 'tool_end' | 'propose' | 'done' | 'error';

export type AiStreamEvent =
  | { type: 'token'; data: string }
  | { type: 'tool_start'; data: string }
  | { type: 'tool_end'; data: string }
  | { type: 'propose'; data: ProposalPayload }
  | { type: 'done'; data: string }
  | { type: 'error'; data: string };
```

<!-- Frontend reducer from frontend/src/hooks/useAiConversation.ts:74-89 -->
```ts
const handleEvent = (event: AiStreamEvent) => {
  if (event.type === 'token') {...}
  else if (event.type === 'tool_start') { setToolName(event.data); }
  else if (event.type === 'tool_end') { setToolName(null); }
  else if (event.type === 'propose') { setProposal(event.data); }
  else if (event.type === 'error') { setError(event.data); }
};
```
</interfaces>
</context>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| LLM tool_call.arguments → JSON parser → tool_fn kwargs | LLM-controllable JSON crosses into Python kwargs unpacking. Bad JSON / mistyped values cause silent malfunction or, worse, accidental kwargs collision (`user_id` override blocked, but other fields unprotected). |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-16-04-01 | Tampering | tool args dispatch (app/api/routes/ai.py:313-330) | mitigate | Pydantic-модели на каждый tool в `app/ai/tool_args.py`, mapping `tool_name → ArgsModel`. `model.model_validate(json.loads(raw_args))` перед `tool_fn(**model.model_dump())`. ValidationError или JSONDecodeError → SSE `tool_error` event, `logger.warning`. |
| T-16-04-02 | Information Disclosure | logger.warning сообщение | mitigate | Логируем `tool_name + exc.errors()` (Pydantic-структурный JSON), НЕ raw args (могут содержать LLM-controllable user PII). Если raw args нужны — обрезать до 200 chars + only при DEBUG. |
| T-16-04-03 | DoS via repeated bad-args | Прерывание agent-loop при tool_error | accept | Отдельно AI-03 (Plan 16-05) ставит счётчик total tool-calls ≤ 8 — это закроет DoS-вектор повтора bad args. |
| T-16-04-04 | Tampering / repudiation | Audit-trail для bad args | accept | `logger.warning` достаточно для pet-app; full security audit pipeline — out-of-scope (CONTEXT deferred). |
</threat_model>

<tasks>

<task type="auto">
  <name>Task 1: Pydantic ToolArgs модели</name>
  <files>app/ai/tool_args.py</files>
  <action>
Per D-16-05: создать новый файл `app/ai/tool_args.py` с Pydantic-моделями для каждого из 6 tools, плюс mapping. Inline-в `tools.py` отвергнут — отдельный файл чище и не раздувает 700-строковый `tools.py`.

Точный код:
```python
"""Pydantic argument-models per AI tool (Plan 16-04, AI-02).

Goal: replace silent `kwargs = {}` fallback in app/api/routes/ai.py with
strict validation.  Each model mirrors the relevant OpenAI function-calling
schema entry from app/ai/tools.py::TOOLS_SCHEMA.

Validation contract:
- All fields are Optional except where TOOLS_SCHEMA marks `required`.
- `model_dump(exclude_none=True)` strips Nones so tool_fn receives only
  what the LLM explicitly passed (preserves existing tool-fn defaults).
- Extra keys are forbidden (`extra='forbid'`) — defends against LLM
  hallucinating fields like deprecated `category_hint`.
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class _BaseToolArgs(BaseModel):
    """Common config: forbid extra keys."""
    model_config = ConfigDict(extra="forbid")


class GetPeriodBalanceArgs(_BaseToolArgs):
    """Tool: get_period_balance — no args."""


class GetCategorySummaryArgs(_BaseToolArgs):
    category_id: Optional[int] = Field(default=None, ge=1)


class QueryTransactionsArgs(_BaseToolArgs):
    limit: Optional[int] = Field(default=10, ge=1, le=50)
    kind: Optional[Literal["expense", "income"]] = None
    category_id: Optional[int] = Field(default=None, ge=1)


class GetForecastArgs(_BaseToolArgs):
    """Tool: get_forecast — no args."""


class ProposeActualArgs(_BaseToolArgs):
    amount_rub: float  # required (no default)
    kind: Optional[Literal["expense", "income"]] = "expense"
    description: Optional[str] = ""
    tx_date: Optional[str] = None


class ProposePlannedArgs(_BaseToolArgs):
    amount_rub: float  # required
    kind: Optional[Literal["expense", "income"]] = "expense"
    description: Optional[str] = ""
    day_of_period: Optional[int] = Field(default=None, ge=1, le=31)


# Mapping tool_name -> args model. Used in app/api/routes/ai.py dispatcher.
TOOL_ARGS_MODELS: dict[str, type[_BaseToolArgs]] = {
    "get_period_balance": GetPeriodBalanceArgs,
    "get_category_summary": GetCategorySummaryArgs,
    "query_transactions": QueryTransactionsArgs,
    "get_forecast": GetForecastArgs,
    "propose_actual_transaction": ProposeActualArgs,
    "propose_planned_transaction": ProposePlannedArgs,
}


def humanize_tool_args_error(tool_name: str, exc: Exception) -> str:
    """Convert ValidationError / JSONDecodeError to a user-facing message.

    Message goes to SSE `tool_error` event → ChatMessage. Must NOT contain
    raw exception text (SEC-02 principle); just say which tool + that args
    were invalid. Detailed errors stay in logger.warning only.
    """
    return (
        f"AI попытался вызвать инструмент с некорректными параметрами "
        f"({tool_name}). Переформулируй запрос."
    )
```
  </action>
  <verify>
    <automated>python -c "from app.ai.tool_args import TOOL_ARGS_MODELS, ProposeActualArgs; m = ProposeActualArgs.model_validate({'amount_rub': 100}); print(len(TOOL_ARGS_MODELS), m.amount_rub)" 2>&1 | tee /dev/stderr | grep -E "^6 100"</automated>
  </verify>
  <done>Файл создан; импорт работает; все 6 моделей в TOOL_ARGS_MODELS; happy-path validation проходит.</done>
</task>

<task type="auto">
  <name>Task 2: Интегрировать validation в _event_stream + новый SSE event</name>
  <files>app/api/routes/ai.py</files>
  <action>
Per D-16-05: в `_event_stream` (`app/api/routes/ai.py`), в блоке tool dispatch (строки 313-330), заменить silent `kwargs={}` на:
- json.loads → если падает → SSE `tool_error` + logger.warning + skip tool.
- model_validate → если падает (ValidationError) → то же.
- Иначе: `tool_fn(db, user_id=user_id, **model.model_dump(exclude_none=True))`.

Точные шаги:

1. В блоке импортов (рядом с `from app.ai.tools import ...`), добавить:
```python
from app.ai.tool_args import TOOL_ARGS_MODELS, humanize_tool_args_error
from pydantic import ValidationError
```

2. В функции `_event_stream`, заменить блок строк 313-330 (start: `for tc in tool_calls_this_round:`, end: до строки 332 `# Proposal-tool: surface payload to frontend...`) на:
```python
for tc in tool_calls_this_round:
    tool_name = tc.get("name", "")
    raw_args = tc.get("arguments", "{}") or "{}"

    # AI-02: strict args validation. Bad JSON or wrong types → SSE tool_error.
    args_model_cls = TOOL_ARGS_MODELS.get(tool_name)
    parsed_kwargs: dict | None = None
    args_error: Exception | None = None
    try:
        raw_kwargs = json.loads(raw_args)
        if not isinstance(raw_kwargs, dict):
            raise ValueError(f"tool args must be a JSON object, got {type(raw_kwargs).__name__}")
        if args_model_cls is None:
            # Unknown tool — fall through to "tool not found" branch below.
            parsed_kwargs = raw_kwargs
        else:
            raw_kwargs.pop("user_id", None)  # never let LLM override scope
            model = args_model_cls.model_validate(raw_kwargs)
            parsed_kwargs = model.model_dump(exclude_none=True)
    except (json.JSONDecodeError, ValidationError, ValueError) as exc:
        args_error = exc

    if args_error is not None:
        logger.warning(
            "ai.tool_args_invalid tool=%s err_type=%s err=%s raw_args=%.200s",
            tool_name,
            type(args_error).__name__,
            args_error,
            raw_args,
        )
        human_msg = humanize_tool_args_error(tool_name, args_error)
        yield (
            "data: "
            + json.dumps(
                {
                    "type": "tool_error",
                    "data": {"tool": tool_name, "message": human_msg},
                },
                ensure_ascii=False,
            )
            + "\n\n"
        )
        # Feed a synthetic tool result back to the LLM so it can recover gracefully
        # (or finish with a user-friendly text) — preserves existing message-pair
        # invariant (assistant.tool_calls must be followed by tool messages with
        # matching tool_call_id, otherwise OpenAI 400-errors on next turn).
        synth_result = {"error": human_msg}
        synth_result_str = json.dumps(synth_result, ensure_ascii=False)
        await conv_svc.append_message(
            db, conv.id, user_id=user_id, role="tool",
            tool_name=tool_name, tool_result=synth_result_str,
        )
        llm_messages.append(
            {
                "role": "tool",
                "tool_call_id": tc.get("id", ""),
                "content": synth_result_str,
            }
        )
        continue  # skip tool execution

    tool_fn = TOOL_FUNCTIONS.get(tool_name)
    if tool_fn:
        # parsed_kwargs already has user_id stripped (above).
        tool_result = await tool_fn(db, user_id=user_id, **parsed_kwargs)
    else:
        tool_result = {"error": f"Неизвестный инструмент: {tool_name}"}
```

3. Сохранить остальной код блока (Proposal-tool propose-event, append_message, llm_messages.append для tool result) как есть.

4. Добавить в начало файла комментарий-маркер для grep-проверки (опционально):
```python
# AI-02: strict tool-args validation via Pydantic (Plan 16-04).
```
  </action>
  <verify>
    <automated>grep -c "TOOL_ARGS_MODELS\[" app/api/routes/ai.py | grep -v "^0$" && grep -c "ai.tool_args_invalid" app/api/routes/ai.py | grep -v "^0$" && grep -c '"tool_error"' app/api/routes/ai.py | grep -v "^0$" && ! grep -E "kwargs = \{\}" app/api/routes/ai.py</automated>
  </verify>
  <done>Validation интегрирована; logger.warning("ai.tool_args_invalid...") вызывается; SSE tool_error event эмитится; silent `kwargs = {}` удалён.</done>
</task>

<task type="auto">
  <name>Task 3: Frontend AiEventType + tool_error handler</name>
  <files>frontend/src/api/types.ts, frontend/src/hooks/useAiConversation.ts</files>
  <action>
Расширить discriminated union новым `tool_error` типом и добавить ветку в `useAiConversation`.

Точные шаги:

1. В `frontend/src/api/types.ts`, найти строки 342-348:
```ts
export type AiEventType =
  | 'token'
  | 'tool_start'
  | 'tool_end'
  | 'propose'
  | 'done'
  | 'error';
```
Добавить `'tool_error'`:
```ts
export type AiEventType =
  | 'token'
  | 'tool_start'
  | 'tool_end'
  | 'propose'
  | 'done'
  | 'error'
  | 'tool_error';
```

2. Добавить интерфейс tool_error payload (после `ProposalPayload` block, перед `AiStreamEvent`):
```ts
export interface ToolErrorPayload {
  tool: string;
  message: string;
}
```

3. Расширить `AiStreamEvent` discriminated union:
```ts
export type AiStreamEvent =
  | { type: 'token'; data: string }
  | { type: 'tool_start'; data: string }
  | { type: 'tool_end'; data: string }
  | { type: 'propose'; data: ProposalPayload }
  | { type: 'tool_error'; data: ToolErrorPayload }
  | { type: 'done'; data: string }
  | { type: 'error'; data: string };
```

4. В `frontend/src/hooks/useAiConversation.ts`, в `handleEvent` (строки 74-89), добавить ветку перед `'error'`:
```ts
} else if (event.type === 'tool_error') {
  // AI-02: backend validated tool-args and rejected. Surface to the chat
  // as an inline error; do not abort the stream — backend feeds a synthetic
  // tool_result and the LLM may still produce a final assistant message.
  setError(event.data.message);
  setToolName(null);
}
```

5. Также проверить (для типобезопасности): если в `frontend/src/api/ai.ts` есть SSE parser, type-narrow на `event.type` уже работает через discriminated union — без изменений. Если есть явный switch на `AiEventType`, добавить case.
  </action>
  <verify>
    <automated>grep -c "tool_error" frontend/src/api/types.ts | grep -E "^[2-9]" && grep -c "tool_error" frontend/src/hooks/useAiConversation.ts | grep -v "^0$" && cd frontend && npx tsc --noEmit 2>&1 | tail -10</automated>
  </verify>
  <done>types.ts содержит ToolErrorPayload + расширенный AiStreamEvent; useAiConversation.ts ловит event.type === 'tool_error' и вызывает setError(event.data.message); tsc --noEmit без ошибок.</done>
</task>

<task type="auto">
  <name>Task 4: Pytest regression — bad JSON, ValidationError, happy path</name>
  <files>tests/api/test_ai_chat_tool_args_validation.py</files>
  <action>
Создать pytest-тест: mock LLM client вызывающий tool с невалидным JSON и mistyped args. SSE-stream должен содержать `tool_error` event + `logger.warning` записан.

Точный код:
```python
"""AI-02 regression: tool-args validation MUST surface tool_error SSE event.

This test FAILs against pre-fix code (silent kwargs={} → tool_fn raises
TypeError or returns {"error": ...} but no SSE tool_error event).
PASSes after Plan 16-04 (Pydantic validation + tool_error event).
"""
from __future__ import annotations

import json
import logging

import pytest


def _parse_sse_events(body: str) -> list[dict]:
    """Extract data: <json> events from raw SSE text body."""
    events: list[dict] = []
    for line in body.splitlines():
        if not line.startswith("data: "):
            continue
        try:
            events.append(json.loads(line[len("data: "):]))
        except json.JSONDecodeError:
            continue
    return events


class _LLMClientWithBadJSON:
    """Stub LLM that emits a tool_call with malformed JSON arguments."""

    async def chat(self, messages, tools=None):
        yield {
            "type": "tool_call_complete",
            "data": json.dumps(
                {
                    "id": "call_bad_json",
                    "name": "query_transactions",
                    "arguments": "{not valid json",
                }
            ),
        }
        yield {"type": "token", "data": "ok"}
        yield {"type": "done", "data": ""}


class _LLMClientWithMistypedArgs:
    """Stub LLM that emits valid JSON but wrong types for ProposeActualArgs."""

    async def chat(self, messages, tools=None):
        yield {
            "type": "tool_call_complete",
            "data": json.dumps(
                {
                    "id": "call_bad_types",
                    "name": "propose_actual_transaction",
                    # amount_rub must be number; passing string triggers ValidationError.
                    "arguments": json.dumps({"amount_rub": "abc"}),
                }
            ),
        }
        yield {"type": "token", "data": "ok"}
        yield {"type": "done", "data": ""}


class _LLMClientWithExtraField:
    """Stub LLM that adds an unknown field — extra='forbid' must reject it."""

    async def chat(self, messages, tools=None):
        yield {
            "type": "tool_call_complete",
            "data": json.dumps(
                {
                    "id": "call_extra",
                    "name": "query_transactions",
                    "arguments": json.dumps({"limit": 5, "deprecated_field": "boom"}),
                }
            ),
        }
        yield {"type": "token", "data": "ok"}
        yield {"type": "done", "data": ""}


@pytest.mark.asyncio
async def test_bad_json_args_yields_tool_error_event(
    db_client, auth_headers, monkeypatch, caplog
):
    from app.api.routes import ai as ai_route

    monkeypatch.setattr(ai_route, "_get_llm_client", lambda: _LLMClientWithBadJSON())

    with caplog.at_level(logging.WARNING, logger="app.api.routes.ai"):
        response = await db_client.post(
            "/api/v1/ai/chat",
            json={"message": "Покажи транзакции"},
            headers=auth_headers,
        )
    assert response.status_code == 200
    events = _parse_sse_events(response.text)

    tool_errors = [e for e in events if e.get("type") == "tool_error"]
    assert tool_errors, f"Expected tool_error event; got {events!r}"
    assert tool_errors[0]["data"]["tool"] == "query_transactions"
    assert "некорректн" in tool_errors[0]["data"]["message"].lower()

    # logger.warning written.
    assert any(
        "ai.tool_args_invalid" in record.message and "query_transactions" in record.message
        for record in caplog.records
    ), f"Expected ai.tool_args_invalid log; got {[r.message for r in caplog.records]}"


@pytest.mark.asyncio
async def test_mistyped_args_yields_tool_error_event(
    db_client, auth_headers, monkeypatch, caplog
):
    from app.api.routes import ai as ai_route

    monkeypatch.setattr(ai_route, "_get_llm_client", lambda: _LLMClientWithMistypedArgs())

    with caplog.at_level(logging.WARNING, logger="app.api.routes.ai"):
        response = await db_client.post(
            "/api/v1/ai/chat",
            json={"message": "Занеси трату"},
            headers=auth_headers,
        )
    assert response.status_code == 200
    events = _parse_sse_events(response.text)

    tool_errors = [e for e in events if e.get("type") == "tool_error"]
    assert tool_errors, f"Expected tool_error event; got {events!r}"
    assert tool_errors[0]["data"]["tool"] == "propose_actual_transaction"
    assert any(
        "ai.tool_args_invalid" in r.message for r in caplog.records
    )


@pytest.mark.asyncio
async def test_extra_field_rejected_by_extra_forbid(
    db_client, auth_headers, monkeypatch
):
    from app.api.routes import ai as ai_route

    monkeypatch.setattr(ai_route, "_get_llm_client", lambda: _LLMClientWithExtraField())

    response = await db_client.post(
        "/api/v1/ai/chat",
        json={"message": "Покажи"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    events = _parse_sse_events(response.text)
    tool_errors = [e for e in events if e.get("type") == "tool_error"]
    assert tool_errors, f"extra field must trigger tool_error; got {events!r}"
```

Использует существующие fixtures `db_client`, `auth_headers` (см. `tests/test_ai_cap_integration.py`).

FAIL до Task 2: silent `kwargs={}` → tool вызывается → возвращает свой error inline → SSE имеет `propose` или `tool_end`, но НЕ `tool_error`.
PASS после Task 2: validation отлавливает ошибки, эмитит `tool_error`.
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner && pytest tests/api/test_ai_chat_tool_args_validation.py -v 2>&1 | tail -20</automated>
  </verify>
  <done>3 теста (bad JSON, mistyped, extra field) PASS; pytest exit 0.</done>
</task>

</tasks>

<verification>
Phase-level acceptance:
1. `pytest tests/api/test_ai_chat_tool_args_validation.py -v` → 3 passed.
2. `python -c "from app.ai.tool_args import TOOL_ARGS_MODELS; assert len(TOOL_ARGS_MODELS) == 6"` → exit 0.
3. `cd frontend && npx tsc --noEmit` → exit 0 (типы сошлись).
4. `grep -c "TOOL_ARGS_MODELS" app/api/routes/ai.py` ≥ 1.
5. `! grep -E "^\s+kwargs = \{\}" app/api/routes/ai.py` (silent fallback удалён).
6. Existing AI tests (`pytest tests/ai/ tests/test_ai_cap_integration.py`) → PASS (no regress).
</verification>

<success_criteria>
AI-02 закрыт:
- Bad JSON args → SSE `tool_error` + logger.warning("ai.tool_args_invalid...").
- Mistyped args (Pydantic ValidationError) → то же.
- Extra fields отвергаются (extra='forbid').
- Frontend types.ts расширен ToolErrorPayload + tool_error в AiEventType.
- useAiConversation handle tool_error → setError.
- Existing valid tool-calls работают.
</success_criteria>

<output>
After completion, create `.planning/phases/16-security-ai-hardening/16-04-SUMMARY.md`
</output>

## Commit Message
fix(16): AI-02 Pydantic ToolArgs models + SSE tool_error event + frontend handler + pytest regression
