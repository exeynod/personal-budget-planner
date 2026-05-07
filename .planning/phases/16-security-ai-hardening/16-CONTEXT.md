# Phase 16: Security & AI Hardening — Context

**Gathered:** 2026-05-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Закрыть 2 CRITICAL и 7 HIGH из код-ревью 2026-05-07 (см. `~/.claude/plans/serialized-prancing-spark.md`). 9 atomic findings: SEC-01, SEC-02, CON-01, CON-02, AI-01, AI-02, AI-03, DB-01, CODE-01. Каждый — отдельный atomic plan с собственным регресс-тестом. Hotfix-style: без новых фич, без архитектурных переделов. Fix-bundle закрывается зелёным test-suite по всем 9 acceptance-критериям из REQUIREMENTS.md.

</domain>

<decisions>
## Implementation Decisions

### Frontend Security (SEC-01)
- **D-16-01:** Ручной HTML-escape `&<>"'` ДО подстановки в regex-парсер `parseMarkdown` в `frontend/src/components/ChatMessage.tsx`. Сначала escape всего входа, потом markdown-replace на уже безопасной строке. Минимальный диф, без новых deps. Альтернатива `react-markdown` + `rehype-sanitize` отвергнута — overkill для inline-парсера на 3 правила (`**bold**`, `- list`, `1. ordered`).

### Backend Security (SEC-02)
- **D-16-02:** Использовать существующий `_humanize_provider_error` из `app/ai/providers/openai_provider.py` для всех типов exception в `_event_stream`, не только OpenAI-специфичных. В `except Exception as exc:` отдавать пользователю константу `"Внутренняя ошибка, попробуй позже"` (или humanized-сообщение от helper'а, если применимо). Полный exc — только в `logger.exception("ai.event_stream_failed")`.

### Concurrency (CON-01, CON-02)
- **D-16-03 (CON-01):** Atomic UPDATE-with-WHERE в `complete_onboarding`: `UPDATE app_user SET onboarded_at=now() WHERE id=:id AND onboarded_at IS NULL RETURNING ...` вместо `SELECT … FOR UPDATE`. RETURNING None → второй параллельный запрос получает `AlreadyOnboardedError`. Меньше блокировок, идемпотентно, не требует SERIALIZABLE.
- **D-16-07 (CON-02):** Per-user `asyncio.Lock` через словарь `dict[int, asyncio.Lock]` (module-level в `app/services/spend_cap.py`, get-or-create) вокруг блока «check cap → LLM call → record_usage». Грубо, но дёшево. Pre-charge reservation row отвергнут — overkill для pet-app. Lock acquire/release — внутри `enforce_spending_cap` либо явной обёрткой над `_event_stream`, planner определит точку.

### AI Guardrails (AI-01, AI-02, AI-03)
- **D-16-04 (AI-01):** Валидация `amount_rub <= 0` СРАЗУ после парсинга `float(amount_rub)` в `propose_actual_transaction` и `propose_planned_transaction` (`app/ai/tools.py`). Возврат `{"error": "Сумма должна быть > 0"}` без дальнейшего вычисления `amount_cents`. Зеркальная UI-валидация в редакторах (defence-in-depth) — out of scope, в backlog.
- **D-16-05 (AI-02):** Pydantic-модели аргументов на каждый из 6 tool-функций (новый файл `app/ai/tool_args.py` или inline в `tools.py` — planner решит). Перед `tool_fn(**kwargs)` в `app/api/routes/ai.py:_event_stream` — `ToolArgsModel.model_validate(kwargs)` через mapping `tool_name → ArgsModel`. При `ValidationError` или `JSONDecodeError`: SSE-event типа `tool_error` (новый `AiEventType`), `logger.warning("ai.tool_args_invalid tool=%s err=%s", tool_name, exc)`. Frontend `frontend/src/api/types.ts` расширяется новым event-типом, `useAiConversation` обрабатывает как user-friendly error в чате. Old behavior (`kwargs={}` silent) удаляется.
- **D-16-06 (AI-03):** Hardcap total tool-executions per session = 8 (счётчик инкрементируется на каждом вызове `tool_fn`). Детект повтора: tracking `(tool_name, frozenset(kwargs.items()))` в set; если встретился второй раз в соседнем раунде → break. После break — yield assistant-message `"Не удалось завершить, переформулируй запрос"` и `done` event. `max_rounds=5` оставляется как защита поверх.

### Database Hygiene (DB-01)
- **D-16-08:** Заменить f-string `SET LOCAL` на `await set_tenant_scope(db, user_id)` в `app/services/spend_cap.py:_fetch_spend_cents_from_db`. Существующий helper из `app/db/session.py:62` уже использует безопасный `set_config(:uid, true)` с bind-параметром. SQL injection в текущем коде не реализуема (Python `int()` cast блокирует), но f-string — регресс-риск при будущих изменениях.

### Code Quality (CODE-01)
- **D-16-09:** Вынести `parseRublesToKopecks` в `frontend/src/utils/format.ts`. Реализация — digit-only walking: проход по строке, накопление цифр до встречи `,` или `.` (separator), затем 2 цифры дробной части (доцпление нулями), пробелы игнорировать (для `"1 000,50"`), любой другой символ → `null`. Ровно 2 знака после запятой; `"0.001"` → `null` (3 знака — не округляем до копеек), либо округление к копейкам — planner определит финальную семантику (по acceptance-критерию из REQUIREMENTS.md edge-кейс `"0.001"` явно тестируется). `ActualEditor.tsx` и `PlanItemEditor.tsx` импортируют helper, локальные определения удаляются.

### Claude's Discretion
- Точное расположение `tool_loop_guard` счётчика (модуль-level state vs параметр `_event_stream`) — planner решит.
- `tool_error` SSE-event payload structure: текст ошибки + tool_name (минимум), точная схема — planner.
- Расположение Pydantic ToolArgs — отдельный файл `app/ai/tool_args.py` или inline в `tools.py` — planner.
- Валидация `parseRublesToKopecks` semantics на edge-кейсе `"0.001"`: `null` или `0` после truncate — planner закрепит, vitest явно покрывает edge-кейс.
- Lock-словарь spend_cap.py: leak-prevention (когда удалять записи) — pet-app, оставляем grow-forever, либо weakref/LRU 256 — planner решит.

</decisions>

<specifics>
## Specific Ideas

- Adversarial markdown payload для SEC-01 теста: `**<img src=x onerror=window.__xss=1>**` (Playwright assert `window.__xss` undefined).
- SSE error sanitization для SEC-02 теста: triggernuть `RuntimeError("internal SQL: SELECT FROM secret_table")` в mock-LLM, проверить, что в SSE error-data НЕ содержится `"secret_table"` или `"RuntimeError"`.
- vitest edge-кейсы для CODE-01: `"100,50"` → 10050, `"1 000.5"` → 100050, `"0.01"` → 1, `"0.001"` → null (явно из REQUIREMENTS.md acceptance).

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Code Review Source
- `~/.claude/plans/serialized-prancing-spark.md` — Полный код-ревью с описанием каждой находки, файлами:строками, обоснованием severity, рекомендованным фиксом и verification-сценарием. Каждая декопсиция в этом CONTEXT.md ссылается на findings C1, C2, H1-H7 в этом файле.

### Phase Requirements
- `.planning/REQUIREMENTS.md` § "v1 Requirements" — 9 atomic REQs (SEC-01, SEC-02, CON-01, CON-02, AI-01, AI-02, AI-03, DB-01, CODE-01) с acceptance test types и file targets для каждого.
- `.planning/ROADMAP.md` § "Phase 16" — 5 success criteria (закрытие сoorce reflection из REQUIREMENTS).

### Existing Code Patterns
- `app/db/session.py:30-65` — `set_tenant_scope` helper для DB-01 (D-16-08).
- `app/ai/providers/openai_provider.py` (search для `_humanize_provider_error`) — sanitizer для SEC-02 (D-16-02).
- `app/services/spend_cap.py:96-114` — `get_user_spend_cents` + `_cache_lock` (uses `asyncio.Lock` уже) — паттерн для CON-02 (D-16-07).
- `app/ai/tools.py:565-655` — TOOLS_SCHEMA + TOOL_FUNCTIONS — для AI-02 Pydantic модели (D-16-05).
- `app/api/routes/ai.py:160-383` — `_event_stream` SSE-генератор и agent-loop — целевой файл для SEC-02, AI-02, AI-03 (D-16-02, D-16-05, D-16-06).
- `frontend/src/utils/format.ts` — место для D-16-09 (parseRublesToKopecks); существуют `formatKopecks*` форматтеры — единый стиль.
- `frontend/src/components/ChatMessage.tsx:19-24` — целевой файл SEC-01 (D-16-01).
- `frontend/src/api/types.ts:328-391` — `AiEventType`, `AiStreamEvent` discriminated union — расширяется новым `tool_error` для D-16-05.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `set_tenant_scope` (`app/db/session.py:30`) — DB-01 переиспользует напрямую.
- `_humanize_provider_error` (`app/ai/providers/openai_provider.py`) — SEC-02 переиспользует, либо обёртывает (planner решит).
- `asyncio.Lock` pattern в `spend_cap.py` (уже есть `_cache_lock`) — CON-02 добавляет per-user dict[int, Lock] рядом.
- `formatKopecks*` форматтеры в `utils/format.ts` — CODE-01 добавляет parser в тот же модуль для парности.
- `AiEventType` discriminated union в `types.ts` — AI-02 расширяет union новым `tool_error`.
- Pydantic v2 `.model_validate` (используется в `app/api/schemas/*.py`) — AI-02 переиспользует паттерн.

### Established Patterns
- **Single tenant scope context per request:** `get_db_with_tenant_scope` dependency ставит RLS-контекст; любой code path, который читает данные другого пользователя, должен явно вызвать `set_tenant_scope` повторно (DB-01 кейс).
- **SSE event protocol:** `data: {json}\n\n`, типы из `AiEventType`. Новый `tool_error` встраивается без breaking-change.
- **Tool result format:** dict, либо `{"error": "..."}` либо payload с `_proposal: True`. AI-01 возвращает error-форму.
- **Test fixtures для multi-tenant:** `_rls_test_role` conftest provisions NOSUPERUSER NOBYPASSRLS role — нужен для CON-02 теста при двух concurrent юзерах.

### Integration Points
- **SEC-02 ↔ AI-02 ↔ AI-03:** все три трогают `_event_stream` в `app/api/routes/ai.py`. Planner должен последовательно их применять, чтобы избежать merge-конфликтов (atomic commit per fix всё равно).
- **CON-02 ↔ Phase 15 spend_cap.py:** добавление per-user Lock в существующий модуль; нужно убедиться, что Lock не конфликтует с TTLCache invalidation.
- **AI-02 frontend integration:** `useAiConversation.ts` (`frontend/src/hooks/useAiConversation.ts`) обрабатывает SSE events; новый `tool_error` event требует новой ветки в reducer.
- **CODE-01 → ActualEditor + PlanItemEditor:** оба компонента имеют локальный inline `parseRublesToKopecks`; после выноса — двойная замена импортом.

</code_context>

<deferred>
## Deferred Ideas

- **CSP-заголовок Caddy** для defence-in-depth XSS поверх SEC-01 — отдельная infra-задача, в out-of-scope REQUIREMENTS.md.
- **Зеркальная UI-валидация `amount > 0`** в `ActualEditor`/`PlanItemEditor` — defence-in-depth для AI-01, в backlog (текущий phase закрывает только backend).
- **Pre-charge token reservation для AI cost** — полноценная альтернатива asyncio.Lock из CON-02 (D-16-07); если pet-app вырастет до multi-process worker, потребуется DB-level reservation row.
- **Audit log для невалидных tool-call** — AI-02 ограничивается `logger.warning`; полный security-audit pipeline (агрегация / алерты) — out-of-scope.
- **Миграция `est_cost_usd` Float→BIGINT** — архитектурный долг, не блокирует security-фиксы.
- **Embedding cache invalidation на rename категории** — отдельный backlog item, не security.
- **Lock-словарь GC** в spend_cap.py — если pet-app станет high-traffic, потребуется LRU eviction либо weakref. Сейчас оставляем grow-forever (5-50 пользователей по PROJECT.md).

</deferred>

---

*Phase: 16-security-ai-hardening*
*Context gathered: 2026-05-07*
