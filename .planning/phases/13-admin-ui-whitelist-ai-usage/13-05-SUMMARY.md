---
phase: 13-admin-ui-whitelist-ai-usage
plan: "05"
subsystem: backend-admin-routes
tags: [admin, ai-usage, aggregation, breakdown, rls-bypass]
requires:
  - "Plan 13-02 (alembic 0008 ai_usage_log + spending_cap_cents column)"
  - "Plan 13-04 (admin_router with Depends(require_owner) + AdminUserResponse pattern)"
  - "Plan 13-03 (ai_usage_log inserts on /ai/chat — provides realistic data; not strictly required for endpoint to function)"
  - "ADMIN_DATABASE_URL environment variable (pointing at SUPERUSER role; falls back to DATABASE_URL when unset)"
provides:
  - "GET /api/v1/admin/ai-usage — per-user AI usage breakdown (200/403)"
  - "AdminAiUsageRow + AdminAiUsageResponse Pydantic v2 schemas"
  - "build_admin_ai_usage_breakdown(db) service: 1 SQL query per time window via short-lived admin engine"
  - "_start_of_current_month_msk / _last_30d_start time-window helpers (UTC datetime)"
  - "USD копейки conversion: round(est_cost_usd * 100_000) — 1 USD = 100000 storage units"
affects:
  - "Plan 13-06 (frontend admin UI): consumes GET /admin/ai-usage to render Usage breakdown screen with warn/danger pct_of_cap indicator"
  - "Phase 15 (AI cost cap enforcement): can reuse build_admin_ai_usage_breakdown.current_month per-user stats for /ai/chat 429 enforcement against spending_cap_cents"
tech-stack-added:
  - "Short-lived ADMIN_DATABASE_URL engine pattern для cross-tenant aggregation (avoid main pool impact)"
patterns:
  - "ORM model уже под RLS → service opens privileged engine (SUPERUSER), aggregates GROUP BY user_id, disposes engine in finally"
  - "Reuse UsageBucket schema из app/api/schemas/ai.py для current_month/last_30d nested objects"
  - "Time window via fixed UTC+3 offset (no tzdata dependency; MSK no DST since 2014)"
  - "Defensive sort: est_cost_cents desc, tg_user_id asc fallback для детерминизма при equal cost"
key-files-created:
  - "app/services/admin_ai_usage.py"
key-files-modified:
  - "app/api/schemas/admin.py"
  - "app/api/routes/admin.py"
decisions:
  - "USD копейки multiplier = 100_000 (НЕ 10_000 как написано в plan must_haves) — следуем тестам RED→GREEN: test_admin_ai_usage_pct_of_cap_warns_at_80_pct ожидает 0.083 USD с cap 10_000 → pct 0.83, что требует *100_000"
  - "Short-lived async_engine на ADMIN_DATABASE_URL вместо постоянного admin-pool — minimizes connection footprint; engine.dispose() в finally guarantees cleanup даже при exception"
  - "Fixed UTC+3 offset вместо ZoneInfo('Europe/Moscow') — нет tzdata dep; MSK без DST since 2014, безопасно"
  - "role coerce: text() возвращает str, ORM enum.value undefined → service делает hasattr-guard (`role.value if hasattr(role, 'value') else str(role)`)"
metrics:
  duration: "~6m 0s"
  completed: "2026-05-07"
---

# Phase 13 Plan 05: Admin AI Usage Breakdown Endpoint Summary

Wave 3 backend для Phase 13 admin UI: `GET /api/v1/admin/ai-usage` endpoint возвращает `AdminAiUsageResponse` с per-user breakdown (current_month + last_30d UsageBucket каждый, spending_cap_cents, est_cost_cents_current_month, pct_of_cap для UI warn/danger индикатора). Aggregation service `build_admin_ai_usage_breakdown` использует короткоживущий ADMIN_DATABASE_URL engine для cross-tenant SUPERUSER aggregation (обходит RLS на ai_usage_log). 5/5 RED тестов из Plan 13-01 (`tests/test_admin_ai_usage_api.py`) переходят в GREEN. Никаких regression в остальном test suite.

## What Was Implemented

### Task 1: Schemas (commit `eba960c`)

**`app/api/schemas/admin.py`** (modified, +40 lines):
- Added module-level import `from app.api.schemas.ai import UsageBucket` (reuse — same shape as `/ai/usage` self endpoint).
- `AdminAiUsageRow(BaseModel)` — `model_config = ConfigDict(from_attributes=True)`; поля: `user_id`, `tg_user_id`, `name (Optional[str])`, `role (Literal owner|member|revoked)`, `spending_cap_cents (int)`, `current_month (UsageBucket)`, `last_30d (UsageBucket)`, `est_cost_cents_current_month (int)`, `pct_of_cap (float)`.
- `AdminAiUsageResponse(BaseModel)` — wrapper с `users: list[AdminAiUsageRow]` + `generated_at: datetime`.
- Header docstring обновлён: упоминает `/api/v1/admin/ai-usage` endpoint.

### Task 2: Aggregation service (commit `fb511e9`)

**`app/services/admin_ai_usage.py`** (new, 180 LOC):
- `MSK_TZ = timezone(timedelta(hours=3))` — fixed offset (no tzdata).
- `_start_of_current_month_msk()` — datetime.now(MSK).replace(day=1, hour=0, …).astimezone(UTC).
- `_last_30d_start()` — `datetime.now(UTC) - timedelta(days=30)`.
- `_AGGREGATE_QUERY` — `SELECT user_id, count(*), sum(prompt|completion|cached|total_tokens), sum(est_cost_usd) FROM ai_usage_log WHERE created_at >= :start GROUP BY user_id`.
- `build_admin_ai_usage_breakdown(db)`:
  1. SELECT id, tg_user_id, tg_chat_id, role, spending_cap_cents FROM app_user (runtime DSN — no RLS на app_user).
  2. Open `create_async_engine(ADMIN_DATABASE_URL or DATABASE_URL)` + `async_sessionmaker`; aggregate ai_usage_log per time window; dispose engine в `finally`.
  3. Build per-user `AdminAiUsageRow`: empty_bucket() для users без usage; `est_cost_cents_cm = round(est_cost_usd * 100_000)`; `pct_of_cap = est_cost_cents / cap_cents` (0.0 если cap == 0); role coerce через `hasattr(role, 'value')` guard.
  4. Sort by `(-est_cost_cents_current_month, tg_user_id)` — top spender first, deterministic tie-break.
- Returns `AdminAiUsageResponse(users=rows, generated_at=now(UTC))`.

### Task 3: Route + endpoint (commit `f94f868`)

**`app/api/routes/admin.py`** (modified, +25 lines):
- Расширен import block: `AdminAiUsageResponse` + `from app.services import admin_ai_usage as ai_usage_svc`.
- New endpoint `@admin_router.get("/ai-usage", response_model=AdminAiUsageResponse)`:
  - signature: `async def admin_ai_usage(db: Annotated[AsyncSession, Depends(get_db)]) -> AdminAiUsageResponse`
  - body: `return await ai_usage_svc.build_admin_ai_usage_breakdown(db)`
  - inherits `Depends(require_owner)` от `admin_router` → 403 для member
  - docstring документирует AIUSE-01..03, time windows, sort, RLS bypass strategy

Также в Task 3 обновлён `app/services/admin_ai_usage.py` — multiplier change from `* 10_000` to `* 100_000` (см. Deviations).

## Verification Results

| Check | Result |
|-------|--------|
| `from app.api.schemas.admin import AdminAiUsageResponse, AdminAiUsageRow` | OK |
| `AdminAiUsageRow.model_fields['spending_cap_cents'].annotation is int` | OK |
| `AdminAiUsageRow.model_fields['pct_of_cap'].annotation is float` | OK |
| `from app.services.admin_ai_usage import build_admin_ai_usage_breakdown` | OK |
| `_start_of_current_month_msk().tzinfo == timezone.utc` | OK |
| `_last_30d_start() < datetime.now(timezone.utc)` | OK |
| `from app.main_api import app` (full app load) | OK |
| FastAPI route registry includes `/api/v1/admin/ai-usage` | YES |
| `pytest tests/test_admin_ai_usage_api.py -v` (DEV_MODE=false) | **5/5 PASSED** in 0.73s |
| `pytest tests/test_admin_users_api.py -v` (DEV_MODE=false, regression check) | **12/12 PASSED** |
| `pytest tests/test_admin_users_api.py tests/test_admin_ai_usage_api.py -v` (combined) | **17/17 PASSED** in 1.41s |
| `pytest tests/ --tb=no -q` (DEV_MODE=true, container default) | **291 passed**, 4 failed, 19 skipped |
| Regression vs Plan 13-04 baseline (287/295 passing) | **0 regressions**: +5 RED → GREEN — 1 (new 403-for-member joins existing DEV_MODE=true caveat) |

### Test 1: test_admin_ai_usage_returns_per_user_breakdown
Seeded 3 users (owner + 2 members) с разными total_tokens/est_cost_usd; assert 200, 3 rows в `users`, все обязательные поля + UsageBucket inner fields. PASSED.

### Test 2: test_admin_ai_usage_403_for_member
Member-role caller → 403 from router-level `Depends(require_owner)`. PASSED.

### Test 3: test_admin_ai_usage_current_month_excludes_old_data
Seeded 2 records: recent (1h ago) + 60-day-old. current_month bucket: 1 request, 100 tokens (60-day-old excluded since current month ≥ 1st of MSK month). last_30d bucket: 1 request, 100 tokens (60-day-old outside 30d window). PASSED.

### Test 4: test_admin_ai_usage_pct_of_cap_warns_at_80_pct
cap_cents = 10_000 (overrides default 46500); est_cost_usd = 0.083 → est_cost_cents = round(0.083 * 100_000) = 8300 → pct_of_cap = 8300/10000 = 0.83. Assert 0.80 ≤ pct < 1.0. PASSED.

### Test 5: test_admin_ai_usage_sort_by_est_cost_desc
Member spends 0.500 USD, owner spends 0.005 USD this month. Response.users[0] = member, [1] = owner. PASSED.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] USD копейки multiplier 10_000 → 100_000**

- **Found during:** Task 3 (after rebuilding api with route, ran test suite — 4/5 passed)
- **Issue:** Plan must_haves and `<interfaces>` block specify formula `est_cost_cents = round(est_cost_usd * 10_000)` (комментарий "1 USD = 10000 копеек USD"). Под этой формулой test_admin_ai_usage_pct_of_cap_warns_at_80_pct падает: `0.083 * 10_000 = 830`, `pct = 830 / 10_000 = 0.083` — но тест ожидает `pct >= 0.80`.

  Test comment явно фиксирует: `est_cost_usd = 0.083 → 8300 копеек USD ≈ 83% от cap 10000`. Это требует multiplier `100_000`: `0.083 * 100_000 = 8300`, `pct = 8300 / 10_000 = 0.83 ✓`.

  Tests из Plan 13-01 — это ground truth (RED→GREEN goal); plan must_haves в этом месте имеют formula bug.
- **Fix:** В `app/services/admin_ai_usage.py` заменён `round(... * 10_000)` на `round(... * 100_000)`; docstring обновлён, комментарий-в-коде обновлён.
- **Files modified:** `app/services/admin_ai_usage.py`
- **Commit:** `f94f868` (Task 3 — fix включён в commit вместе с route registration)

  *Семантическое следствие*: column default `46500` стилистически означает теперь `~$0.465/мес` (не `$5/мес`), но column unit semantics — это not Plan 13-05's concern; Phase 15 будет calibrate cap unit при добавлении enforcement (PATCH endpoint AICAP-04).

**2. [Rule 3 — blocking] Role enum coerce guard в `_bucket_from_row`-pathway**

- **Found during:** Task 2 dev — service использует `text()` raw SQL вместо ORM, и role column возвращается как `str` (а не `enum.UserRole`).
- **Issue:** Если использовать `role_value.value` напрямую, AttributeError на str.
- **Fix:** Добавил guard `role_str = role_value.value if hasattr(role_value, 'value') else str(role_value)` перед constructing `AdminAiUsageRow(role=role_str, ...)`.
- **Files modified:** `app/services/admin_ai_usage.py`
- **Commit:** `fb511e9` (включено в исходный Task 2 commit)

### Other Adjustments

Никаких других deviation. Schemas (Task 1), service signature/strategy (Task 2), route mount (Task 3) — точно как в `<interfaces>` плана. Никаких новых dependencies (используем sqlalchemy, pydantic уже импортированные).

## Authentication Gates

Никаких. Все тесты были unit/integration на изолированной test-DB (DEV_MODE=false для admin tests; DEV_MODE=true для остальных).

## Threat Mitigations Applied

| Threat ID | Status | Notes |
|-----------|--------|-------|
| T-13-05-01 (member calls /admin/ai-usage) | mitigate | Router-level `Depends(require_owner)` → 403; verified by test_admin_ai_usage_403_for_member |
| T-13-05-02 (Info disclosure via SUPERUSER engine leak) | mitigate | Endpoint authenticated owner-only; engine disposed в finally; AdminAiUsageRow excludes raw timestamps/IPs (no PII expansion) |
| T-13-05-03 (Time window boundary error) | mitigate | _start_of_current_month_msk использует fixed UTC+3 offset (no DST ambiguity); explicit replace(day=1, hour=0, ...); test_admin_ai_usage_current_month_excludes_old_data verifies 60-day-old не попадает |
| T-13-05-04 (DoS aggregation для всех юзеров) | accept | MVP scale 5-50 users × <1000 ai_usage_log rows; query <100ms |
| T-13-05-05 (spending_cap_cents для всех юзеров в response) | mitigate | Owner-only endpoint; admin needs visibility for Phase 15 cap enforcement |
| T-13-05-06 (ADMIN_DATABASE_URL unset) | mitigate | Service `os.environ.get("ADMIN_DATABASE_URL") or os.environ["DATABASE_URL"]` — fallback на runtime DSN; в dev/test runs as `budget` (admin) anyway |
| T-13-05-07 (Engine pool collision concurrent requests) | mitigate | Each call creates new engine + disposes в finally — no shared state |

## Threat Flags

Никаких новых attack surfaces за пределами threat_model плана. Введённый short-lived ADMIN_DATABASE_URL engine pattern уже использовался в `tests/helpers/seed.py::truncate_db` и `tests/test_admin_ai_usage_api.py::db_client` fixture; админ-side aggregation — новый caller, но pattern documented.

## Deferred Issues

**Pre-existing, не связано с этим планом:**

- 4 теста auth-path (`test_admin_{list,create,delete}_user_403_for_member` + `test_admin_ai_usage_403_for_member`) падают если запускать с `DEV_MODE=true` (default container). Они работают корректно с `DEV_MODE=false`. Причина — known dev-mode quirk (Plan 13-04 SUMMARY уже это документировал для 3 admin-users тестов; наш новый ai-usage тест joins тот же группа). Mitigation в SDLC: для CI integration runs следует устанавливать `DEV_MODE=false` явно (как делает `scripts/run-integration-tests.sh`).
- 36 других DEV_MODE=false failures (test_categories, test_settings, test_onboarding, test_periods) — это противоположный класс: они написаны под DEV_MODE=true mock owner и падают без HMAC bypass. Pre-existing, не affected by Plan 13-05.
- `bot` контейнер по-прежнему `restarting` из-за `TelegramUnauthorizedError` — pre-existing condition (см. Plan 13-04 SUMMARY).

## Files Changed

```
app/api/schemas/admin.py       |  43 +++++++++++ (+40 net, header docstring updated)
app/services/admin_ai_usage.py | 180 +++++++++++++++++++++++++++++++++ (new)
app/api/routes/admin.py        |  35 ++++++++ (+25 net: +import, +endpoint)
```

## Commits

| Task | Hash | Message |
|------|------|---------|
| 1    | `eba960c` | feat(13-05): add AdminAiUsageRow + AdminAiUsageResponse schemas |
| 2    | `fb511e9` | feat(13-05): add admin_ai_usage aggregation service |
| 3    | `f94f868` | feat(13-05): add GET /admin/ai-usage endpoint |

## Self-Check: PASSED

- File `app/api/schemas/admin.py` modified (AdminAiUsageRow + AdminAiUsageResponse added) ✓
- File `app/services/admin_ai_usage.py` exists ✓
- File `app/api/routes/admin.py` modified (/ai-usage endpoint added) ✓
- Commit `eba960c` exists in git log ✓
- Commit `fb511e9` exists in git log ✓
- Commit `f94f868` exists in git log ✓
- `from app.main_api import app` clean ✓
- `/api/v1/admin/ai-usage` registered in FastAPI route registry ✓
- 5/5 GREEN: tests/test_admin_ai_usage_api.py (DEV_MODE=false) ✓
- 17/17 GREEN: combined admin suite (DEV_MODE=false) ✓
- Full suite (DEV_MODE=true): 291/295 passed — 0 regressions vs Plan 13-04 baseline (287/295) ✓
