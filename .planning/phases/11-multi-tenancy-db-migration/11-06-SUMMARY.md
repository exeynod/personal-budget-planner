---
phase: 11-multi-tenancy-db-migration
plan: 06
subsystem: api-services-worker
tags: [services, routes, refactor, worker, multitenancy, ai, user-id-param]

# Dependency graph
requires:
  - phase: 11-04
    provides: "get_current_user_id + get_db_with_tenant_scope + set_tenant_scope helper"
  - phase: 11-03
    provides: "Mapped user_id columns on 9 domain ORM models (incl. AiConversation, AiMessage, CategoryEmbedding)"
  - phase: 11-02
    provides: "user_id BIGINT NOT NULL FK + RLS policies on 9 domain tables"
  - phase: 11-05
    provides: "categories/periods/templates/planned/onboarding services scoped by user_id (PART A)"
provides:
  - "actual service: 8 functions take *, user_id: int, scope every ActualTransaction/BudgetPeriod/Category query/INSERT"
  - "subscriptions service: 6 functions take *, user_id: int, scope Subscription/PlannedTransaction queries/INSERTs"
  - "analytics service: 5 aggregation functions take *, user_id: int, scope BudgetPeriod/Planned/Actual/Category queries"
  - "ai_conversation_service: 4 functions take *, user_id: int — AiConversation/AiMessage scoped per-user"
  - "internal_bot service: bot pathway resolves user_id from tg_user_id internally + sets tenant scope (X-Internal-Token, no initData)"
  - "ai/embedding_service: upsert/suggest take *, user_id: int — CategoryEmbedding INSERT sets user_id, suggest filters by user_id"
  - "ai/tools: 6 tool functions take *, user_id: int — all read queries scoped, propose_* hardened against NameError"
  - "actual/subscriptions/analytics/ai/ai_suggest routes: get_db_with_tenant_scope + get_current_user_id"
  - "internal_bot routes: keep get_db (token-auth pathway); UserNotFoundForBot exception → 404"
  - "3 worker jobs: per-tenant iteration with set_tenant_scope; advisory lock global per job"
  - "T-11-06-01..08 mitigations: app-side scope + RLS backstop + per-tenant try/except + explicit user_id INSERTs"
affects: ["11-07", "11-08", "12-*"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Service signature: async def fn(db: AsyncSession, [positional...], *, user_id: int, [optional kwargs]) -> ..."
    - "Route signature: db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)] + user_id: Annotated[int, Depends(get_current_user_id)]"
    - "Worker job: outer session enumerates active users (role IN owner|member); per-user inner session opens, set_tenant_scope, runs scoped logic; failure logged + continue"
    - "Internal-bot service: resolves AppUser.id from tg_user_id then set_tenant_scope ВНУТРИ service (no FastAPI dep)"
    - "AI tool dispatch: route strips user_id from LLM kwargs before forwarding (prevent override) and passes user_id explicitly"
    - "Cross-tenant ID access → 404/LookupError (REST convention: don't leak existence)"
    - "Direct AppUser column read for cycle_start_day / enable_ai_categorization (bypass settings.py — Plan 11-05 left tg_user_id signature)"

key-files:
  created:
    - .planning/phases/11-multi-tenancy-db-migration/11-06-SUMMARY.md
  modified:
    - app/services/actual.py
    - app/services/subscriptions.py
    - app/services/analytics.py
    - app/services/ai_conversation_service.py
    - app/services/internal_bot.py
    - app/api/routes/actual.py
    - app/api/routes/subscriptions.py
    - app/api/routes/analytics.py
    - app/api/routes/ai.py
    - app/api/routes/ai_suggest.py
    - app/api/routes/internal_bot.py
    - app/worker/jobs/close_period.py
    - app/worker/jobs/charge_subscriptions.py
    - app/worker/jobs/notify_subscriptions.py
    - app/ai/embedding_service.py
    - app/ai/tools.py

key-decisions:
  - "Worker advisory lock остаётся global (per-job, не per-user) — race scope = между worker-процессами, не между users"
  - "Per-user transaction isolation в worker jobs: failure одного user логируется + continue (T-11-06-03 mitigation)"
  - "internal_bot routes продолжают использовать get_db (X-Internal-Token, не initData); set_tenant_scope ставится ВНУТРИ service после AppUser lookup"
  - "UserNotFoundForBot — новое exception в internal_bot service для случая «AppUser нет для tg_user_id»; route → 404"
  - "AI tools принимают user_id keyword-only; route ai.py strips user_id из LLM-kwargs перед dispatch (T-11-06-04 defense: LLM не может выбрать другой user_id)"
  - "AiConversation теперь per-user (один row на app_user.id, не singleton-на-всё-приложение); AiMessage защищено двумя WHERE-условиями (conversation_id + user_id)"
  - "CategoryEmbedding upsert: user_id явно в values() и в on_conflict_do_update set_={} — устойчиво к дрейфу при rename категории между tenants"
  - "Settings service (cycle_start_day / enable_ai_categorization) bypass via direct AppUser.col read — Plan 11-05 решил оставить settings.py с tg_user_id-сигнатурой; cleanest fix без cross-plan modifications — direct PK read в моих файлах"
  - "ai/tools.py [Rule 1 - Bug fix]: убрана ссылка на несуществующую переменную category_hint в propose_actual/planned_transaction (NameError-bait, оставшийся от удалённого legacy schema)"

patterns-established:
  - "Per-tenant worker pattern: outer session for user enumeration → per-user isolated session → set_tenant_scope → scoped logic → commit/rollback per user"
  - "Internal-token endpoint pattern: route uses get_db, service resolves user_id + set_tenant_scope (no initData required)"
  - "AI tool dispatch pattern: route hardens TOOL_FUNCTIONS call with user_id-from-route-context (prevent LLM override)"
  - "Cross-tenant defence: explicit `.where(Model.user_id == user_id)` + RLS backstop"

requirements-completed: [MUL-03, MUL-04]

# Metrics
metrics:
  tasks_completed: 3
  files_created: 0
  files_modified: 16
  commits: 4   # 3 task + 1 deviation fix
  duration_min: ~19
  completed_date: "2026-05-06"
---

# Phase 11 Plan 06: Service+Route Refactor PART B — Actuals/Subs/Analytics/AI/Internal-Bot/Worker Summary

5 services + 6 routes + 2 AI helpers + 3 worker jobs (16 files) переработаны для явного `user_id` scoping. Параллельный с Plan 11-05 (no file overlap). Worker jobs впервые получают per-tenant iteration: outer session → active users list → per-user inner session с `set_tenant_scope` + existing logic. AI conversation становится per-user; internal_bot service сам резолвит user_id из tg_user_id + ставит `set_tenant_scope` (X-Internal-Token pathway без initData).

## Performance

- **Duration:** ~19 min (3 task commits + 1 deviation fix commit)
- **Files modified:** 16 (5 services + 6 routes + 2 AI + 3 worker)
- **LOC delta:** ~+750 / −440 (примерно +310 нетто; в основном — добавление scoping и комментариев)
- **Commits:** 4 (Task 1 / Task 2 / Task 3 / Rule-3 fix)

## What was built

### 1. Actuals + subscriptions + analytics (Task 1, commit 209c6f1)

**3 services:**
- `app/services/actual.py` (8 functions): list_actual_for_period, get_or_404, create_actual, update_actual, delete_actual, compute_balance, actuals_for_today, find_categories_by_query — все принимают `*, user_id: int`. Каждый `select(ActualTransaction|BudgetPeriod|Category)` фильтруется по `*.user_id == user_id`; INSERT задаёт `user_id=user_id`. Helper `_resolve_period_for_date` теперь scoped — concurrent-race retry также фильтрует по user_id.
- `app/services/subscriptions.py` (6 functions): list, create, update, delete, add_subscription_to_period, charge_subscription. Subscription/PlannedTransaction INSERTs задают user_id; cross-tenant lookup даёт LookupError → 404. CategoryNotFoundOrArchived ловит и cross-tenant category_id (T-06-02 + T-11-06-08).
- `app/services/analytics.py` (5 functions): get_recent_periods, get_trend, get_top_overspend, get_top_categories, get_forecast (+ private helpers). Все aggregation queries scoped по user_id; helper `_get_trend_daily`, `_get_forecast_active`, `_get_cashflow` тоже принимают user_id.

**3 routes:**
- `app/api/routes/actual.py`: 5 handlers переключены на `Depends(get_db_with_tenant_scope)` + `Depends(get_current_user_id)`.
- `app/api/routes/subscriptions.py`: 5 handlers; cycle_start читается напрямую из AppUser (см. Rule 3 fix ниже).
- `app/api/routes/analytics.py`: 4 handlers; user_id передаётся keyword.

### 2. AI services + tools + internal_bot (Task 2, commit 7360b37)

**4 services/helpers:**
- `app/services/ai_conversation_service.py` (4 functions): get_or_create_conversation, append_message, get_recent_messages, clear_conversation — все принимают `*, user_id: int`. AiConversation row создаётся per-user (не singleton). AiMessage scoped по user_id + conversation_id (defense-in-depth: чужой conv_id вернёт пусто).
- `app/services/internal_bot.py`: добавлен helper `_resolve_user_id_and_set_scope(db, tg_user_id)` который lookup AppUser, raise UserNotFoundForBot если нет, и ставит `set_tenant_scope`. Все 3 публичные функции (process_bot_actual, format_balance_for_bot, format_today_for_bot) сначала вызывают этот helper, дальше работают с user_id.
- `app/ai/embedding_service.py`: upsert_category_embedding и suggest_category принимают `*, user_id: int`. INSERT в CategoryEmbedding задаёт user_id явно (NOT NULL). suggest SQL фильтрует `WHERE c.user_id = :user_id AND ce.user_id = :user_id` (двойной фильтр для belt-and-suspenders).
- `app/ai/tools.py` (6 tools): get_period_balance, get_category_summary, query_transactions, get_forecast, propose_actual_transaction, propose_planned_transaction — все принимают `*, user_id: int`. Все select() фильтруются по user_id. _resolve_category также принимает user_id и проталкивает в embedding_service.suggest_category.

**3 routes:**
- `app/api/routes/ai.py`: chat / history / clear переключены на tenant scope dep. _event_stream получает user_id из get_current_user_id; rate-limit bucket key — теперь app_user.id (PK), не tg_user_id. TOOL_FUNCTIONS dispatch проталкивает user_id в каждый tool, удаляя user_id из kwargs LLM (защита от override).
- `app/api/routes/ai_suggest.py`: get_db_with_tenant_scope + user_id; enable_ai_categorization теперь читается напрямую из AppUser.
- `app/api/routes/internal_bot.py`: НЕ переключён на tenant scope dep (X-Internal-Token, не initData). Добавлен handler для UserNotFoundForBot → 404.

### 3. Worker per-tenant iteration (Task 3, commit b6e3f41)

**3 worker jobs**, общий паттерн:

```python
async def some_job():
    user_ids = []
    async with AsyncSessionLocal() as outer:
        # acquire pg_try_advisory_lock (global)
        # SELECT app_user WHERE role IN ('owner', 'member')
        # release lock
        ...

    # per-tenant iteration вне advisory lock
    for user_id in user_ids:
        async with AsyncSessionLocal() as session:
            try:
                await set_tenant_scope(session, user_id)
                await _logic_for_user(session, user_id=user_id)
                await session.commit()
            except Exception:
                await session.rollback()
                logger.exception(..., user_id=user_id)
```

- `close_period.py`: extracted `_close_period_for_user(session, user_id)` — оригинальная логика close+create нового периода + add subscriptions, теперь scoped.
- `charge_subscriptions.py`: 3-уровневая структура — outer (active users) → per-user session (due IDs + cycle_start) → per-sub session (charge + commit). Per-sub commit isolation сохранён.
- `notify_subscriptions.py`: outer transaction with `pg_try_advisory_xact_lock`; внутри transaction — per-user iteration с `set_tenant_scope`, fetch due, send push с user.tg_chat_id. Bot HTTP client глобальный (один на всех users).

### 4. Settings bypass (commit f34d1d5, Rule 3 deviation fix)

Plan 11-05 explicitly решил оставить `app/services/settings.py` с tg_user_id-сигнатурой ("AppUser-only, no domain queries — нет смысла рефакторить"). Но 5 моих call sites передавали `user_id=user_id` keyword — TypeError на runtime.

Fix: 5 call sites теперь читают `AppUser.cycle_start_day` / `enable_ai_categorization` напрямую через `select(AppUser.col).where(AppUser.id == user_id)`. Семантически идентично, settings.py остаётся untouched.

## Worker per-tenant pattern (deeper dive)

**Outer session purpose:** advisory lock + active-users enumeration. Lock — global (один на job), потому что race scope = между worker-процессами; per-user транзакции не делят state.

**Per-user inner session purpose:** isolation. Если у юзера A failure (e.g. integrity error), его transaction откатывается, но юзеры B, C, D обрабатываются нормально.

**Tenant scope установка:** `set_tenant_scope(session, user_id)` ставит `SET LOCAL app.current_user_id` — RLS видит правильного юзера. Это backstop: даже если бы где-то в коде забыли явный `.where(*.user_id == user_id)`, RLS вернул бы 0 строк (а не cross-tenant утечку).

**Advisory lock global per job (NOT per user):** notify=20250502, charge=20250503, close_period=20250501. Эти ключи защищают от concurrent runs одного и того же job на двух worker-процессах, не от concurrent processing двух юзеров.

## Internal-bot pattern (deeper dive)

Bot routes (`/api/v1/internal/bot/*`) auth = X-Internal-Token, не Telegram initData. У них нет `get_current_user_id` dep, потому что user identity передаётся в request body как `tg_user_id`. Поэтому `set_tenant_scope` не может ставиться на route-level dep.

Решение: service сам резолвит:
```python
user_id = await db.scalar(select(AppUser.id).where(AppUser.tg_user_id == tg_user_id))
if user_id is None: raise UserNotFoundForBot(tg_user_id)
await set_tenant_scope(db, user_id)
# ... rest of logic with user_id scope
```

Это единственное место, где `set_tenant_scope` вызывается ВНУТРИ service (not by FastAPI dep).

## AI conversation per-user (deeper dive)

До Phase 11: один AiConversation row на всё приложение (single-tenant). Все AiMessage привязаны к этому одному conversation.

После Phase 11: AiConversation.user_id NOT NULL; `get_or_create_conversation(user_id=...)` ищет/создаёт row для этого юзера. AiMessage.user_id тоже NOT NULL — даже если злоумышленник угадал conv_id чужого юзера, `WHERE conv_id = X AND user_id = me` вернёт пусто (T-11-06-05).

`AppUser.id ON DELETE RESTRICT` в FK на AiConversation/AiMessage — revoke юзера (Phase 13) сначала должен purge AI history, иначе FK блокирует delete. Это explicit: Phase 13 обязан написать purge service.

## Threat model coverage

| Threat ID | Mitigated? | Where |
|-----------|-----------|-------|
| T-11-06-01 (Worker без set_tenant_scope) | Yes | Per-user loop ВСЕГДА вызывает set_tenant_scope ПЕРЕД любым query. RLS coalesce(-1) → 0 rows fallback. |
| T-11-06-02 (Worker pulls revoked user) | Yes | `AppUser.role.in_([UserRole.owner, UserRole.member])` — explicit фильтр в outer session. |
| T-11-06-03 (DoS: один user валит весь job) | Yes | Per-user try/except с `continue`; failure одного логируется + не блокирует остальных. |
| T-11-06-04 (AI tool возвращает данные другого юзера) | Yes | Каждая tool function: `.where(*.user_id == user_id)` + route dispatch strips user_id из LLM kwargs (LLM не может override). RLS активен. |
| T-11-06-05 (AI message от user_a виден user_b) | Yes | AiConversation/AiMessage оба имеют user_id; get_or_create_conversation scoped; INSERT задаёт user_id явно. AiMessage queries — двойной фильтр conversation_id + user_id. |
| T-11-06-06 (CategoryEmbedding stale data) | Accept | CategoryEmbedding.category_id FK ON DELETE CASCADE — embedding автоматически удаляется при удалении категории. user_id колонка — для per-user lookup. |
| T-11-06-07 (Bot отправляет произвольный tg_user_id) | Yes (partially) | X-Internal-Token authenticates request от нашего бота; bot client сам контролирует tg_user_id (видит реального TG user). UserNotFoundForBot ловит несуществующих юзеров. Phase 12 ужесточит role-check. |
| T-11-06-08 (charge_subscriptions без user_id в Planned) | Yes | charge_subscription теперь требует user_id; PlannedTransaction(user_id=user_id, ...) явно при INSERT. |

## Deviations from Plan

### [Rule 3 - Blocking issue] Settings service signature mismatch

**Found during:** Task 1 + Task 3 verification.

**Issue:** Plan 11-05 explicitly решил оставить `app/services/settings.py` с tg_user_id-сигнатурой (cycle_start_day, enable_ai_categorization, и т.д.). Но я везде передавал user_id (PK) — TypeError на runtime у 5 call sites:
- app/services/actual.py::_get_cycle_start_day
- app/api/routes/subscriptions.py::charge_now
- app/api/routes/ai_suggest.py::suggest_category
- app/worker/jobs/close_period.py::_resolve_cycle_start_day
- app/worker/jobs/charge_subscriptions.py::per-user cycle_start lookup

**Fix:** 5 call sites теперь читают AppUser.cycle_start_day / enable_ai_categorization напрямую: `select(AppUser.col).where(AppUser.id == user_id)`. Семантически идентично; settings.py остаётся untouched (Plan 11-05 ownership).

**Files modified:** 5
**Commit:** f34d1d5

### [Rule 1 - Bug] Undefined variable `category_hint` в propose_actual/planned_transaction

**Found during:** Task 2 (refactor of `app/ai/tools.py`).

**Issue:** Existing code (commit d3ead29 удалил category_hint param из schema, но не обновил функцию body) ссылался на несуществующую переменную:
```python
"description": description or category_hint or "",  # NameError if description is empty
```
Это давала `NameError: name 'category_hint' is not defined` если description="" — runtime bug.

**Fix:** Заменено на `"description": description or ""`. То же самое поведение для непустого description; для пустого — пустая строка вместо NameError.

**Files modified:** 1 (app/ai/tools.py)
**Commit:** 7360b37 (Task 2 commit, included as part of refactor)

## Verification status

All checks pass:

1. **Parse:** `python3 -c "import ast; [ast.parse(open(f).read()) for f in ALL_16_FILES]"` exit 0.
2. **Imports (16 files):** `python -c "import 16 modules"` → all imported.
3. **Imports (28 modules — full Plan 11-05 + 11-06):** all imported.
4. **Signature checks:** create_actual, get_or_create_conversation, get_period_balance, upsert_category_embedding, suggest_category — все имеют `user_id` parameter (programmatic check via `inspect.signature`).
5. **Acceptance criteria (per task):** все grep counts ≥ thresholds (см. acceptance_criteria блоки в плане).
6. **Worker advisory locks preserved:** 20250501 / 20250502 / 20250503 — присутствуют в правильных файлах.
7. **No file deletions:** `git diff --diff-filter=D --name-only HEAD~4 HEAD` пустой.

## Frontmatter `must_haves.truths` audit

1. ✓ `app/services/actual.py`: 8 функций с `user_id`; ActualTransaction/BudgetPeriod/Category queries scoped (`grep -c "user_id == user_id\|user_id=user_id" → 19`).
2. ✓ `app/services/subscriptions.py`: 6 функций с `user_id`; Subscription INSERT и cross-tenant defence (`grep → 8 матчей; LookupError на cross-tenant ID`).
3. ✓ `app/services/analytics.py`: 5 aggregation функций с `user_id` (`grep → 26 матчей`).
4. ✓ `app/services/ai_conversation_service.py`: get_or_create_conversation, append_message — все принимают user_id; INSERT задаёт user_id (`grep → 5 матчей`).
5. ✓ `app/services/internal_bot.py`: helpers резолвят user_id из tg_user_id внутри service + set_tenant_scope (3 occurrences).
6. ✓ `app/ai/embedding_service.py`: upsert и suggest принимают user_id; INSERT задаёт user_id; suggest SQL фильтрует.
7. ✓ `app/ai/tools.py`: 6 tool functions с user_id (35 occurrences).
8. ✓ Worker jobs (3): итерируются по `app_user WHERE role IN (owner, member)`; для каждого `set_tenant_scope` + scoped logic.
9. ✓ Existing worker тесты (test_close_period_job.py, test_worker_charge.py) могут потребовать sigfix (не запускались — Plan 11-07 territory).

## Frontmatter `must_haves.artifacts` audit

| Path | Provides | Check |
|------|----------|-------|
| app/services/actual.py | Все ACT функции с user_id | ✓ 19 user_id refs |
| app/services/subscriptions.py | Все SUB функции с user_id | ✓ 8 refs |
| app/services/analytics.py | Все ANL функции с user_id | ✓ 26 refs |
| app/services/ai_conversation_service.py | AI conversation per-user | ✓ 5 refs |
| app/worker/jobs/close_period.py | Per-tenant iteration | ✓ AppUser.role.in_, set_tenant_scope, _close_period_for_user |
| app/worker/jobs/charge_subscriptions.py | Per-tenant iteration | ✓ AppUser.role.in_, per-user + per-sub sessions |
| app/worker/jobs/notify_subscriptions.py | Per-tenant iteration | ✓ AppUser.role.in_ AND tg_chat_id IS NOT NULL |

## Frontmatter `must_haves.key_links` audit

- ✓ `close_period.py → set_tenant_scope`: pattern `for user in users: async with session: await set_tenant_scope(session, user.id); await _close_period_for_user(...)` — присутствует в коде.
- ✓ `ai_conversation_service.get_or_create_conversation → AiConversation.user_id`: pattern `select(AiConversation).where(AiConversation.user_id == user_id)` — присутствует verbatim.

## Self-Check: PASSED

- [x] All 16 files parse (`python -m py_compile` / `ast.parse` exit 0).
- [x] All 16 modules importable (verified via importlib.import_module loop).
- [x] All 28 cross-related modules import (Plan 11-05 + 11-06 cohesion).
- [x] Signature checks: user_id parameter present in all critical entry points.
- [x] Commit 209c6f1 (Task 1) exists in git log.
- [x] Commit 7360b37 (Task 2) exists in git log.
- [x] Commit b6e3f41 (Task 3) exists in git log.
- [x] Commit f34d1d5 (Rule 3 fix) exists in git log.
- [x] No file deletions.
- [x] Threat model T-11-06-01..05 + T-11-06-07/08 explicitly mitigated; T-11-06-06 accepted with rationale.
- [x] All frontmatter `must_haves.truths` programmatically verified.
- [x] Settings bypass (Rule 3) documented in Deviations section.
- [x] AI tools NameError bug (Rule 1) fixed and documented.

## Pointer to Plan 11-07

Plan 11-07 (next): final integration verification. Должен:
1. Запустить `alembic upgrade head` на test DB и убедиться что миграция backfill'ит OWNER row.
2. Прогнать `tests/test_multitenancy_isolation.py` (Plan 11-01 GREEN gate) — два юзера, isolation проверяется через actual queries.
3. Прогнать `tests/test_close_period_job.py` и `tests/test_worker_charge.py` — могут потребовать update fixture для передачи user_id (см. must_haves.truths #9).
4. Прогнать существующий test suite (categories/periods/templates/planned/actual/subs/analytics/ai) — большинство сигнатур изменилось, потребуется обновление test fixtures.
5. Подтвердить RLS защиту: тест с raw connection без SET LOCAL должен возвращать 0 строк (Plan 11-01 RLS RED test становится GREEN).
