---
plan_id: 16-02-sec-02-sse-error-sanitize
phase: 16
plan: 02
type: execute
wave: 1
depends_on: []
requirements: [SEC-02]
files_modified:
  - app/api/routes/ai.py
  - app/ai/providers/openai_provider.py
  - tests/api/test_ai_chat_error_sanitize.py
autonomous: true
must_haves:
  truths:
    - "Exception в `_event_stream` отдаёт пользователю generic-сообщение, БЕЗ имени класса исключения, file path, SQL текста"
    - "Полный exception идёт в `logger.exception('ai.event_stream_failed', ...)` — структурный лог, не наружу"
    - "Existing OpenAI-specific humanization (rate-limit, 401) продолжает работать через `_humanize_provider_error`"
  artifacts:
    - path: "app/api/routes/ai.py"
      provides: "Sanitized SSE error event"
      contains: "logger.exception"
    - path: "app/ai/providers/openai_provider.py"
      provides: "Re-exported _humanize_provider_error helper (already exists, может потребоваться export)"
      exports: ["_humanize_provider_error"]
    - path: "tests/api/test_ai_chat_error_sanitize.py"
      provides: "Pytest regression: triggernuть RuntimeError в _event_stream → SSE error НЕ содержит class-name / file path / SQL"
      exports: []
  key_links:
    - from: "app/api/routes/ai.py::_event_stream except Exception"
      to: "_humanize_provider_error(exc) ИЛИ generic constant"
      via: "yield с sanitized message"
      pattern: "except Exception.*\\n.*logger\\.exception"
---

<objective>
Закрыть SEC-02 (CRITICAL information disclosure): в `_event_stream` (`app/api/routes/ai.py:381-382`) при `except Exception as exc` ловится ВСЁ — `str(exc)` уходит на фронт через SSE и рендерится в `ChatMessage` (помножается на SEC-01 XSS). Заменить на generic-сообщение + полный `logger.exception`.

Purpose: Information disclosure — имена внутренних функций, тексты SQL, stack hints, ValidationError-куски конфига протекают пользователю. Параллельно с SEC-01 удваивает поверхность: контролируемая злоумышленником строка из exception попадает в dangerouslySetInnerHTML.

Output: Sanitized SSE-error path + regression-тест с mock LLM raising RuntimeError("internal SQL: SELECT FROM secret_table") → SSE НЕ содержит ни RuntimeError ни secret_table.
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
@/Users/exy/.claude/plans/serialized-prancing-spark.md

@app/api/routes/ai.py
@app/ai/providers/openai_provider.py
@tests/test_ai_cap_integration.py
@tests/conftest.py

<interfaces>
<!-- Current unsafe handler from app/api/routes/ai.py:381-382 -->
```python
except Exception as exc:
    yield f"data: {json.dumps({'type': 'error', 'data': str(exc)})}\n\n"
```

<!-- Existing humanizer from app/ai/providers/openai_provider.py:47-61 (already correct shape) -->
```python
def _humanize_provider_error(exc: Exception) -> str:
    """Преобразовать исключение OpenAI SDK в безопасное user-facing сообщение."""
    status = getattr(exc, "status_code", None)
    raw = str(exc).lower()
    if status == 401 or "401" in raw or "incorrect api key" in raw or "invalid_api_key" in raw:
        return "AI не настроен на сервере (проверь OPENAI_API_KEY)."
    if status == 429 or "429" in raw or "rate_limit" in raw:
        return "Слишком много запросов. Подожди минуту и повтори."
    if status and 500 <= status < 600:
        return "AI-провайдер временно недоступен. Попробуй позже."
    return "Не удалось получить ответ от AI. Попробуй позже."
```
</interfaces>
</context>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Backend exception → SSE stream → ChatMessage | Любое сырое exception text попадает на фронт. Особо критично в комбинации с SEC-01 (если LLM-controlled текст оказывается в exception via prompt-injection в SQL/Pydantic слое). |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-16-02-01 | Information Disclosure | `_event_stream` outer except (app/api/routes/ai.py:381-382) | mitigate | Per D-16-02: заменить `str(exc)` на `_humanize_provider_error(exc)` (если применимо) или константу `"Внутренняя ошибка, попробуй позже"`. Полный exc — только `logger.exception("ai.event_stream_failed", ...)`. |
| T-16-02-02 | Information Disclosure | Inner SSE error path (line 280: `event['data']` от LLM-провайдера) | mitigate | Тоже sanitize — пробросить через `_humanize_provider_error` если это сырое exception text. Текущий код уже использует sanitized data из openai_provider, но вторая точка fail-open опасна. |
| T-16-02-03 | Tampering / XSS | LLM-controlled exception message → ChatMessage (через SEC-01 XSS) | mitigate | Закрывается этим планом + SEC-01: даже если sanitization где-то даст trickle, escape во frontend закроет execution. |
| T-16-02-04 | Repudiation | Logger лишается контекста exception при sanitization | mitigate | `logger.exception(...)` сохраняет полный traceback в server-логах; sanitization применяется только к SSE-payload. |
</threat_model>

<tasks>

<task type="auto">
  <name>Task 1: Sanitize SSE error в _event_stream</name>
  <files>app/api/routes/ai.py, app/ai/providers/openai_provider.py</files>
  <action>
Per D-16-02: переиспользовать существующий `_humanize_provider_error` из `app/ai/providers/openai_provider.py:47`. Сделать его module-level public (rename — НЕ нужен, лидирующий `_` игнорируем для re-import — оставляем имя как есть, импортируем явно).

Точные шаги:
1. В `app/api/routes/ai.py`, в блоке импортов (после строки `from app.ai.tools import TOOL_FUNCTIONS, TOOLS_SCHEMA`), добавить:
```python
from app.ai.providers.openai_provider import _humanize_provider_error
```
(Импорт private-функции допустим внутри одного package; альтернатива — переименовать в `humanize_provider_error` без подчёркивания и обновить existing использование в `openai_provider.py:166`. Выбираем переименование, чтобы чисто public-API.)

2. В `app/ai/providers/openai_provider.py`:
   - Переименовать `_humanize_provider_error` → `humanize_provider_error` (def на строке 47, использование на строке 166).
   - Импорт в `app/api/routes/ai.py` соответственно: `from app.ai.providers.openai_provider import humanize_provider_error`.

3. В `app/api/routes/ai.py:381-382` заменить блок:
```python
except Exception as exc:
    yield f"data: {json.dumps({'type': 'error', 'data': str(exc)})}\n\n"
```
на:
```python
except Exception as exc:
    # SEC-02: never leak str(exc) to client. Full traceback → server log only.
    logger.exception("ai.event_stream_failed user_id=%s", user_id)
    safe_msg = humanize_provider_error(exc)
    yield f"data: {json.dumps({'type': 'error', 'data': safe_msg})}\n\n"
```

4. Существующий internal SSE error путь на строке 280 (`yield f"data: {json.dumps({'type': 'error', 'data': event['data']})}\n\n"`) — `event['data']` уже пришёл из openai_provider где обёрнут в `humanize_provider_error`. Дополнительно НЕ оборачиваем (double-humanize портит rate-limit message), но добавим defense-in-depth:
```python
elif etype == "error":
    # event['data'] from openai_provider already passed through humanize_provider_error.
    # Defense-in-depth: still treat as untrusted text — strip newlines/file-paths.
    safe = str(event.get("data") or "Не удалось получить ответ от AI. Попробуй позже.")
    yield f"data: {json.dumps({'type': 'error', 'data': safe})}\n\n"
    errored = True
    break
```
(Минимально: оставить event['data'], но завернуть в str() и default constants.)

5. НЕ удалять `_humanize_provider_error` тесты, если есть — переименуй ссылки в тестах под новый public-API.
  </action>
  <verify>
    <automated>grep -c "humanize_provider_error" app/api/routes/ai.py | grep -v "^0$" && grep -c "logger.exception.*ai.event_stream_failed" app/api/routes/ai.py | grep -v "^0$" && ! grep -E "data.*str\(exc\)" app/api/routes/ai.py</automated>
  </verify>
  <done>str(exc) удалён из SSE-payload; logger.exception вызывается; humanize_provider_error импортирован.</done>
</task>

<task type="auto">
  <name>Task 2: Pytest regression — SSE error sanitization</name>
  <files>tests/api/test_ai_chat_error_sanitize.py</files>
  <action>
Создать `tests/api/test_ai_chat_error_sanitize.py` — тест, который монкипатчит `_get_llm_client()` для возврата фабрики, чьё `chat()` бросает `RuntimeError("internal SQL: SELECT FROM secret_table; class=AsyncSession")`. SSE-event с `type=error` НЕ должен содержать `secret_table`, `RuntimeError`, `AsyncSession`, `SELECT`.

Точный код теста:
```python
"""SEC-02 regression: sensitive exception details must not leak to SSE.

This test FAILs against pre-fix code (str(exc) yields the full message).
PASSes after Plan 16-02 (humanize_provider_error + logger.exception).
"""
from __future__ import annotations

import json

import pytest


_SENSITIVE_TOKENS = (
    "secret_table",
    "RuntimeError",
    "AsyncSession",
    "SELECT FROM",
    "/app/",  # file path leak signal
)


class _RaisingLLMClient:
    """Stub LLM client whose .chat() raises a noisy RuntimeError."""

    async def chat(self, messages, tools=None):  # noqa: D401, ARG002
        raise RuntimeError(
            "internal SQL: SELECT FROM secret_table; class=AsyncSession at /app/db/session.py"
        )
        yield  # pragma: no cover — make this an async generator function


@pytest.mark.asyncio
async def test_sse_error_event_does_not_leak_exception_internals(
    db_client, auth_headers, monkeypatch
):
    """Mock LLM raises sensitive RuntimeError → SSE error data is generic."""
    from app.api.routes import ai as ai_route

    # Replace the LLM factory used inside _event_stream.
    monkeypatch.setattr(ai_route, "_get_llm_client", lambda: _RaisingLLMClient())

    response = await db_client.post(
        "/api/v1/ai/chat",
        json={"message": "Привет"},
        headers=auth_headers,
    )
    assert response.status_code == 200, response.text

    # Read the streamed body fully (no real network — TestClient buffers).
    body = response.text

    # Find the error SSE event.
    error_events = [
        line[len("data: "):]
        for line in body.splitlines()
        if line.startswith("data: ")
    ]
    error_payloads = []
    for raw in error_events:
        try:
            ev = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if ev.get("type") == "error":
            error_payloads.append(ev["data"])

    assert error_payloads, f"Expected an error SSE event, got: {body[:500]}"
    error_text = " ".join(str(p) for p in error_payloads)

    for token in _SENSITIVE_TOKENS:
        assert token not in error_text, (
            f"SEC-02 leak: token {token!r} found in SSE error payload: {error_text!r}"
        )

    # Positive: payload should be one of the humanize_provider_error constants OR generic.
    assert any(
        marker in error_text
        for marker in (
            "AI",
            "Не удалось",
            "Внутренняя ошибка",
            "временно недоступен",
        )
    ), f"Expected humanized message; got {error_text!r}"


@pytest.mark.asyncio
async def test_sse_error_logs_full_traceback(db_client, auth_headers, monkeypatch, caplog):
    """logger.exception('ai.event_stream_failed', ...) called with full traceback."""
    import logging

    from app.api.routes import ai as ai_route

    monkeypatch.setattr(ai_route, "_get_llm_client", lambda: _RaisingLLMClient())

    with caplog.at_level(logging.ERROR, logger="app.api.routes.ai"):
        response = await db_client.post(
            "/api/v1/ai/chat",
            json={"message": "Привет"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        # Drain body to ensure stream completes.
        _ = response.text

    # The full RuntimeError text MUST appear in server logs (logger.exception),
    # so on-call ops can debug — sanitization is for SSE only.
    assert any(
        "ai.event_stream_failed" in record.message
        and "RuntimeError" in (record.exc_text or "")
        for record in caplog.records
    ), f"Expected ai.event_stream_failed log with traceback; got {[r.message for r in caplog.records]}"
```

Должен использовать существующие fixtures `db_client` + `auth_headers` из `tests/conftest.py` (паттерн как в `tests/test_ai_cap_integration.py`). Если fixture называется иначе — посмотреть в conftest.py и заменить.

Тест FAIL до Task 1: `str(exc)` содержит `secret_table` → assert падает.
Тест PASS после Task 1: SSE содержит generic `"Не удалось получить ответ от AI. Попробуй позже."` или humanized message.
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner && pytest tests/api/test_ai_chat_error_sanitize.py -v 2>&1 | tail -20</automated>
  </verify>
  <done>2 теста (sanitize + log) PASS; CI-команда `pytest tests/api/test_ai_chat_error_sanitize.py` exit 0.</done>
</task>

</tasks>

<verification>
Phase-level acceptance:
1. `pytest tests/api/test_ai_chat_error_sanitize.py -v` → 2 passed.
2. `! grep -E "json.dumps.*'data': str\(exc\)" app/api/routes/ai.py` (нет старого pattern).
3. `grep -c "humanize_provider_error" app/api/routes/ai.py` ≥ 2 (импорт + использование).
4. `grep -c "logger.exception" app/api/routes/ai.py` ≥ 1 (новая запись `ai.event_stream_failed`).
5. Existing OpenAI-specific тесты (если есть `_humanize_provider_error` тесты) обновлены под новое имя — `pytest tests/ai/` PASS.
</verification>

<success_criteria>
SEC-02 закрыт:
- `str(exc)` НЕ попадает в SSE error event.
- Pytest проверяет sensitive tokens отсутствие (secret_table, RuntimeError, file paths).
- logger.exception("ai.event_stream_failed", ...) сохраняет полный traceback в логах.
- Existing OpenAI rate-limit / 401 humanization работает через `humanize_provider_error`.
</success_criteria>

<output>
After completion, create `.planning/phases/16-security-ai-hardening/16-02-SUMMARY.md`
</output>

## Commit Message
fix(16): SEC-02 sanitize SSE error in _event_stream + pytest regression for info-disclosure
