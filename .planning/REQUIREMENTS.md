# Requirements: TG Budget Planner — v0.5 Security & AI Hardening

**Defined:** 2026-05-07
**Core Value:** В один тап записать факт-трату и видеть актуальную дельту план/факт по категориям бюджета — быстрее, чем открывать Google-таблицу.
**Milestone Goal:** Закрыть 2 CRITICAL и 7 HIGH из код-ревью 2026-05-07 (см. `~/.claude/plans/serialized-prancing-spark.md`). Каждый фикс сопровождается регресс-тестом.

## v1 Requirements

Все требования v0.5 hotfix-style: формулируются как system-property («система отвергает X», «парсер экранирует Y»), не user-feature. Каждое — atomic, с конкретным acceptance test.

### Frontend Security

- [ ] **SEC-01**: Markdown-парсер в `ChatMessage` экранирует HTML до подстановки в `dangerouslySetInnerHTML` — XSS-полезная нагрузка вида `**<img src=x onerror=...>**` не выполняет JS.
  - **Acceptance:** Playwright-тест отправляет adversarial markdown через AI-чат, проверяет что `window.__xss` остаётся `undefined` и DOM не содержит `<img onerror>` атрибутов.
  - **File:** `frontend/src/components/ChatMessage.tsx`

### Backend Security

- [x] **SEC-02**: SSE-стрим `/ai/chat` НЕ возвращает `str(exc)` напрямую — пользователь видит generic-сообщение, полный exception идёт только в `logger.exception`.
  - **Acceptance:** pytest триггерит исключение в `_event_stream` (mock LLM raise с осмысленным сообщением); SSE error-event НЕ содержит имя класса исключения, file path, SQL текст.
  - **File:** `app/api/routes/ai.py:_event_stream`
  - **Closed:** Plan 16-02 (2026-05-07) — `humanize_provider_error` (public rename) + `logger.exception("ai.event_stream_failed")` + pytest regression `tests/api/test_ai_chat_error_sanitize.py` (2 cases).

### Concurrency Safety

- [ ] **CON-01**: `complete_onboarding` атомарно — два параллельных submit'а одного `tg_user_id` дают ровно один success, второй `AlreadyOnboardedError`, нет потерянного user-state.
  - **Acceptance:** pytest с `asyncio.gather(complete_onboarding(...), complete_onboarding(...))` для одного пользователя.
  - **File:** `app/services/onboarding.py:complete_onboarding`

- [ ] **CON-02**: `enforce_spending_cap` работает атомарно с записью usage-лога — два параллельных `/ai/chat` при cap-1¢ → ровно один проходит, второй блокируется.
  - **Acceptance:** pytest async, два запроса параллельно, проверка количества записей в `ai_usage_log` и итогового spend.
  - **Files:** `app/services/spend_cap.py`, `app/api/dependencies.py`, `app/api/routes/ai.py:_record_usage`

### AI Guardrails

- [x] **AI-01**: Proposal-tools отклоняют `amount_rub <= 0` — отрицательные/нулевые суммы НЕ создают `amount_cents` в ProposalPayload.
  - **Acceptance:** unit-тест `propose_actual_transaction(amount_rub=-1)` и `(amount_rub=0)` → возврат `{"error": ...}`. Идентично для `propose_planned_transaction`.
  - **File:** `app/ai/tools.py`

- [ ] **AI-02**: Tool-args в `/ai/chat` валидируются по schema — невалидный JSON или неверные типы не silently дают `kwargs={}`.
  - **Acceptance:** mock-LLM возвращает невалидный JSON в `tool.function.arguments` → SSE отдаёт явный `tool_error` event, в логах `logger.warning("ai.tool_args_invalid ...")`.
  - **Files:** `app/api/routes/ai.py:_event_stream`, новые Pydantic-валидаторы в `app/ai/tools.py`

- [ ] **AI-03**: Agent-loop защищён от tool-loop — total tool-executions per session ≤ 8 и повтор одного tool с одинаковыми args в соседних раундах прерывает цикл.
  - **Acceptance:** mock LLM с зацикленным tool_call → break после ≤8 total tool-calls, финальный user-friendly assistant-message.
  - **File:** `app/api/routes/ai.py:_event_stream` (agent-loop)

### Database Hygiene

- [ ] **DB-01**: `spend_cap.py` устанавливает `app.current_user_id` через тот же `set_tenant_scope` helper, что и `app/db/session.py` — никаких прямых `SET LOCAL` через f-string.
  - **Acceptance:** code-grep `SET LOCAL app.current_user_id` в `app/services/spend_cap.py` возвращает 0 совпадений; функция использует `await set_tenant_scope(db, user_id)`.
  - **File:** `app/services/spend_cap.py`

### Code Quality

- [ ] **CODE-01**: `parseRublesToKopecks` определён один раз в `frontend/src/utils/format.ts` — `ActualEditor` и `PlanItemEditor` импортируют его, без локальных дублей.
  - **Acceptance:** vitest-тесты для парсера на edge-кейсы `"100,50"`, `"1 000.5"`, `"0.01"`, `"0.001"`. Playwright e2e — ввод одинаковых строк в обоих редакторах даёт одинаковые `amount_cents`. grep на дублирующее определение функции возвращает 0.
  - **Files:** `frontend/src/utils/format.ts`, `frontend/src/components/ActualEditor.tsx`, `frontend/src/components/PlanItemEditor.tsx`

## v2 Requirements

Никаких — это hotfix-style milestone. Следующая milestone v0.6 определится после закрытия v0.5 от текущих UAT-итогов и backlog'а.

## Out of Scope

Явные исключения для v0.5 — не блокируют security-фиксы, идут в backlog.

| Feature | Reason |
|---------|--------|
| Миграция `est_cost_usd` Float→BIGINT | Архитектурный долг с Phase 13. Cap=$1 + цены OpenAI ~10⁻⁴ $/1k токенов делают накопленную Float-ошибку ничтожной. Backlog. |
| Embedding cache invalidation на rename категории | Кэш `text → vector` не привязан к category-ID; CategoryEmbedding обновляется отдельным upsert. Известный flow, не security-bug. Backlog. |
| CSP-заголовок Caddy для defence-in-depth XSS | Желателен как второй слой к SEC-01, но самого по себе SEC-01 (escape) достаточно. Отдельная infra-фаза. |
| Pre-charge token reservation для AI cost (RFC) | CON-02 закрывается per-user `asyncio.Lock` (грубо, но дёшево); полноценный reservation-row дизайн — отдельная фаза если pet-app вырастет. |
| Audit logging для невалидных tool-call попыток | AI-02 покрывает `logger.warning`; полноценный security-audit pipeline (с агрегацией / алертами) — out-of-scope. |

## Traceability

Заполняется gsd-roadmapper при создании ROADMAP.md.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SEC-01  | Phase 16 | Pending |
| SEC-02  | Phase 16 | Complete |
| CON-01  | Phase 16 | Pending |
| CON-02  | Phase 16 | Pending |
| AI-01   | Phase 16 | Complete |
| AI-02   | Phase 16 | Pending |
| AI-03   | Phase 16 | Pending |
| DB-01   | Phase 16 | Pending |
| CODE-01 | Phase 16 | Pending |

**Coverage:**
- v1 requirements: 9 total
- Mapped to phases: 9
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-07*
*Last updated: 2026-05-07 after initial v0.5 milestone definition*
