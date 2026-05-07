---
gsd_state_version: 1.0
milestone: v0.5
milestone_name: Security & AI Hardening
status: executing
stopped_at: Completed Plan 16-04 (AI-02 Pydantic tool-args validation + tool_error SSE event)
last_updated: "2026-05-07T18:05:01Z"
last_activity: 2026-05-07 — Plan 16-04 AI-02 closed (Pydantic ToolArgs models + SSE tool_error event + frontend handler + 3 pytest cases)
progress:
  total_phases: 1
  completed_phases: 0
  total_plans: 9
  completed_plans: 7
  percent: 78
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-07 — v0.5 milestone started)

**Core value:** В один тап записать факт-трату и видеть актуальную дельту план/факт по категориям бюджета — быстрее, чем открывать Google-таблицу. После v0.3 — conversational AI-помощник + аналитика; после v0.4 — multi-tenant whitelist + AI cost cap.
**Current focus:** Phase 16 — Security & AI Hardening (hotfix milestone)

## Current Position

Phase: 16 of 16 (Security & AI Hardening)
Plan: 16-04 complete (AI-02 Pydantic tool-args validation); 16-01/02/03/04/06/08/09 closed; 16-05/07 still pending
Status: In progress
Last activity: 2026-05-07 — Plan 16-04 AI-02 closed (Pydantic ToolArgs models + tool_error SSE event + 3 pytest cases)

Progress: [████████░░] 78%

## Performance Metrics

**Velocity:**

- Total plans completed (v0.4): 36
- Average duration: ~10 min
- Total execution time: ~6 hours

**By Phase (v0.4):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 11 | 7 | ~84 min | ~12 min |
| 12 | 7 | ~95 min | ~14 min |
| 13 | 8 | ~33 min | ~4 min |
| 14 | 7 | ~75 min | ~11 min |
| 15 | 7 | ~80 min | ~11 min |

**Recent Trend:**

- Last v0.4 phase (15) — 7 plans, ~80 min total, frontend + backend + admin endpoint, 26/27 new tests green
- Trend (v0.4): стабильный, ~10 min/plan; live TG smoke consistently deferred

*Updated after each plan completion*

## Accumulated Context

### Decisions

Full decision log в PROJECT.md Key Decisions table.

Recent decisions affecting v0.5 planning:

- v0.5 (2026-05-07): Single consolidated Phase 16 для всех 9 atomic fixes — общий delivery boundary («code-review tickets closed»), общие файлы (`app/api/routes/ai.py:_event_stream` для SEC-02 / AI-02 / AI-03), фрагментация на backend/frontend не даёт value
- v0.5 (2026-05-07): Каждый fix сопровождается регресс-тестом — без теста fix не считается завершённым (pytest для backend, Playwright для XSS, vitest для money-парсера)
- v0.5 (2026-05-07): Out of scope в v0.5 — миграция `est_cost_usd` Float→BIGINT, embedding cache invalidation на rename категории, CSP-заголовок Caddy (всё ушло в backlog)
- v0.5 (2026-05-07): CON-02 закрывается per-user `asyncio.Lock` (грубо, но дёшево); полноценный pre-charge token reservation отложен до post-v0.5 если pet-app вырастет
- v0.5 (2026-05-07): AI-03 — total tool-calls per session ≤ 8 + детект повтора одного tool с одинаковыми args в соседних раундах
- 16-03 (2026-05-07): AI-01 закрыт через positive-check сразу после try/except парсинга amount_cents в propose_*_transaction (минимальный диф D-16-04, 4 строки кода). Edge-кейс 0.001 rub отвергается естественно через round() → 0 cents → fail. 17 pytest unit-тестов (parametrized + happy/edge), 0 регрессов.
- 16-02 (2026-05-07): SEC-02 закрыт. Renamed `_humanize_provider_error` -> `humanize_provider_error` (public) для переиспользования между провайдером и `_event_stream`. Outer `except Exception` теперь yield `humanize_provider_error(exc)` + `logger.exception("ai.event_stream_failed user_id=%s", user_id)`. Defense-in-depth на inner SSE error-path: `str()` coercion + generic fallback. Pytest regression `tests/api/test_ai_chat_error_sanitize.py` (2 тест-кейса) проверяет sanitised payload + сохранённый traceback в логах.
- 16-06 (2026-05-07): CON-01 закрыт. Atomic `UPDATE app_user SET onboarded_at=:now, cycle_start_day=:csd WHERE id=:id AND onboarded_at IS NULL RETURNING onboarded_at` per D-16-03 — заменяет SELECT-then-mutate в `complete_onboarding`. Loser видит claimed_row=None, refresh-ит user, raise AlreadyOnboardedError. Pytest regression `tests/test_onboarding_concurrent.py` (2 теста, asyncio.Barrier(2) для детерминистического race) — verified FAIL pre-fix (IntegrityError на uq_budget_period_user_id_period_start) → PASS post-fix через container rebuild. Race-test pattern переиспользуем для будущих CON-* фиксов.
- 16-04 (2026-05-07): AI-02 закрыт. Создан `app/ai/tool_args.py` — 6 Pydantic моделей (по одной на tool) extra='forbid' + `TOOL_ARGS_MODELS` mapping. `_event_stream` tool dispatch валидирует raw JSON через `model_validate(raw_kwargs)` → невалидный JSON / mistyped types / extra fields → SSE `tool_error` event + `logger.warning("ai.tool_args_invalid tool=%s err_type=%s err=%s raw_args=%.200s")` + synth `{error: ...}` tool_result message-pair (preserves OpenAI assistant.tool_calls invariant для recovery). Frontend `AiEventType` расширен `tool_error` + `ToolErrorPayload`; `useAiConversation.handleEvent` → `setError(event.data.message)` без abort стрима. Pytest regression `tests/api/test_ai_chat_tool_args_validation.py` (3 теста: bad JSON / mistyped / extra field) — все PASS в integration-контейнере; 0 регрессов в существующих 10 AI-тестах.

### Pending Todos

None yet.

### Blockers/Concerns

- Q-9 (HLD): Стратегия выноса pg_dump (S3 vs локальный том) — открыто, отложено за scope v0.5
- v0.4 UAT: 8 live-smoke items (v0.4-U-1..U-8) ждут owner-валидации в реальном TG — НЕ блокируют v0.5 фиксы (изолированный hotfix scope)

## Deferred Items

Items acknowledged and deferred at v0.4 milestone close on 2026-05-07:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| verification_gap | Phase 11 — 11-VERIFICATION.md | human_needed | 2026-05-07 (v0.4 close) |
| verification_gap | Phase 12 — 12-VERIFICATION.md | human_needed | 2026-05-07 (v0.4 close) |
| verification_gap | Phase 13 — 13-VERIFICATION.md | human_needed | 2026-05-07 (v0.4 close) |
| verification_gap | Phase 14 — 14-VERIFICATION.md | human_needed | 2026-05-07 (v0.4 close) |
| verification_gap | Phase 15 — 15-VERIFICATION.md | human_needed | 2026-05-07 (v0.4 close) |
| arch_debt | `est_cost_usd Float` → BIGINT migration | deferred | 2026-05-07 (v0.5 OoS) |
| arch_debt | Embedding cache invalidation on category rename | deferred | 2026-05-07 (v0.5 OoS) |
| security_defense | Caddy CSP header (defence-in-depth для XSS) | deferred | 2026-05-07 (v0.5 OoS) |
| arch_debt | Pre-charge AI token reservation (vs Lock) | deferred | 2026-05-07 (v0.5 OoS) |
| arch_debt | Audit pipeline для невалидных tool-call попыток | deferred | 2026-05-07 (v0.5 OoS) |

8 v0.4 UAT items (v0.4-U-1..U-8) consolidated в `v0.4-MILESTONE-AUDIT.md` — owner runs live smoke after rebuilding api/bot/worker containers; не блокирует v0.5.

## Session Continuity

Last session: 2026-05-07T18:05:01Z
Stopped at: Completed Plan 16-04 (AI-02 Pydantic tool-args validation + tool_error SSE event)
Resume file: None
