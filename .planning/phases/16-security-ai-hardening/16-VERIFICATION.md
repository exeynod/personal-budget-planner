---
phase: 16
phase_name: Security & AI Hardening
verified_at: 2026-05-07
status: passed
verifier: orchestrator-inline
plans_complete: 9
plans_total: 9
requirements_complete: 9
requirements_total: 9
---

# Phase 16 Verification — Security & AI Hardening

## Summary

Все 9 atomic findings (2 CRITICAL + 7 HIGH из код-ревью 2026-05-07) закрыты с регресс-тестами. Phase passes goal-backward verification — каждый REQ-ID в REQUIREMENTS.md mapped to closed plan + green tests.

## Goal Achievement

ROADMAP § Phase 16 success criteria — все 5 проверены:

1. **Sanitization layer** — XSS payload neutralized (Plan 16-01: vitest 5 + Playwright 1, RED→GREEN); SSE error generic-only (Plan 16-02: pytest sanitize regression).
2. **Concurrency safety** — `complete_onboarding` atomic claim (Plan 16-06: 2 asyncio.Barrier tests, container-rebuild verified pre/post); spend-cap race closed (Plan 16-07: pre-fix [200,200] → post-fix [200,429]).
3. **AI guardrails** — `amount_rub <= 0` rejected (Plan 16-03: 17 unit tests); tool-args schema validation + `tool_error` SSE (Plan 16-04: 3 new + 10 existing pytest); tool-loop guard ≤ 8 + repeat-detect (Plan 16-05: 3 mock-LLM tests).
4. **DB hygiene** — zero `SET LOCAL` f-strings; `set_tenant_scope` helper (Plan 16-08: 4 tests, grep gate clean).
5. **Money parser dedup** — single `parseRublesToKopecks` in `utils/format.ts` (Plan 16-09: 29 vitest edge-cases + Playwright cross-editor parity).

## Plans Closed

| Plan | REQ | Tests | Status |
|------|-----|-------|--------|
| 16-01-sec-01-xss-escape | SEC-01 | vitest 5 + Playwright 1 | ✓ |
| 16-02-sec-02-sse-error-sanitize | SEC-02 | pytest 2 (collect+code-review) | ✓ |
| 16-03-ai-01-amount-positive | AI-01 | pytest 17 + 6 regression | ✓ |
| 16-04-ai-02-tool-args-validation | AI-02 | pytest 3 new + 10 existing | ✓ |
| 16-05-ai-03-tool-loop-guard | AI-03 | pytest 3 mock-LLM + 13 regression | ✓ |
| 16-06-con-01-onboarding-atomic | CON-01 | pytest 2 race + 19 regression | ✓ |
| 16-07-con-02-spend-cap-lock | CON-02 | pytest 2 concurrent + 17 regression | ✓ |
| 16-08-db-01-set-tenant-scope-unify | DB-01 | pytest 4 (grep gate + behavioral) | ✓ |
| 16-09-code-01-money-parser-dedup | CODE-01 | vitest 29 + Playwright 1 parity | ✓ |

## Code in HEAD — grep verification

- `function escapeHtml` в `frontend/src/components/ChatMessage.tsx`: 1 match ✓
- `humanize_provider_error` в `app/api/routes/ai.py`: 3 matches ✓
- `if amount_cents <= 0` в `app/ai/tools.py`: 2 matches (oba proposal-tool) ✓
- `onboarded_at IS NULL` atomic UPDATE в `app/services/onboarding.py`: 1 match ✓
- `SET LOCAL app.current_user_id` в `app/services/spend_cap.py`: 0 matches ✓
- `set_tenant_scope` в `app/services/spend_cap.py`: 4 matches ✓
- `function parseRublesToKopecks` в `frontend/src/components/*.tsx`: 0 matches (deduped) ✓
- `import parseRublesToKopecks ... format` в editors: 3 importers (ActualEditor, PlanItemEditor, PlanRow) ✓

## Operational Notes

### Wave 1 shared-worktree race
6 параллельных gsd-executor агентов конкурировали за один master working tree (worktree-isolation Anthropic Agent flag не пробрасывается до gsd-executor `git commit`-flow). Результат:
- **Содержимое HEAD корректное** — все 9 фиксов на месте, все тесты passed.
- **Commit messages misaligned** в 2 коммитах: `0fbd3ce` помечен `fix(16-06)` но содержит SEC-02 backend файлы; `5f9baf2` помечен `fix(16-02)` но содержит SEC-01 ChatMessage.tsx. Документировано в SUMMARY.md соответствующих plans.
- Wave 2 запускался sequentially (16-04 → 16-05 → 16-07) — race не повторился.

### Test execution
Большинство тестов запущены внутри пересобранного `api`-контейнера (через `./scripts/run-integration-tests.sh` или `docker compose ... up -d --build api`). `bot` и `worker` контейнеры НЕ пересобирались по запросу пользователя.

### Pre-fix verification (RED→GREEN)
Plans 16-01, 16-06, 16-07 явно verified RED→GREEN cycle (тест FAILed на pre-fix коде, PASSed после fix). Это закрывает риск false-positive verification.

## Deferred Items

Out-of-scope для v0.5, остаются в backlog:
- Миграция `est_cost_usd` Float→BIGINT (architecture debt из Phase 13).
- Embedding cache invalidation на rename категории.
- CSP-заголовок Caddy (defence-in-depth для SEC-01).
- Pre-charge token reservation для AI cost (полная альтернатива asyncio.Lock из CON-02).
- Audit logging для невалидных tool-call (расширение `logger.warning` из AI-02).
- Зеркальная UI-валидация `amount > 0` в `ActualEditor`/`PlanItemEditor`.
- Lock-словарь GC в `spend_cap.py` (для high-traffic).

## Known Pre-existing Issue

`tests/test_admin_cap_endpoint::test_member_forbidden_403` падает на master — pre-existing admin RBAC регрессия, не связана с Phase 16. Логировано в `deferred-items.md` для Phase 17+.

## Verdict

**status: passed**

Все 9 REQs закрыты с green регресс-тестами; код в HEAD соответствует ROADMAP success criteria; нет блокирующих регрессий за пределами ранее существовавшего admin RBAC issue. Phase 16 готова к merge / deploy / human UAT.

Next: пользователь пересобирает `api`/`bot`/`worker` контейнеры через `docker compose --build` (с dev-override) и проводит smoke-тестирование.

---

*Phase verified: 2026-05-07*
*Plans: 9/9 complete*
*Atomic commits: 26 (от 8e36745 plan-фиксации до f7cf87f)*
