---
phase: 12-role-based-auth-refactor
plan: "04"
subsystem: bot-auth
tags: [bot, role-based, owner-removal, db-lookup, threat-model-mitigation, tdd-green]
dependency_graph:
  requires:
    - app/db/models.py (UserRole enum, AppUser model — Phase 11)
    - app/db/session.py (AsyncSessionLocal — Phase 1)
    - tests/test_bot_role_resolution.py (RED tests — Plan 12-01)
    - app/bot/handlers.py (existing cmd_start)
    - app/bot/commands.py (existing commands + _is_owner)
  provides:
    - app/bot/auth.py (bot_resolve_user_role helper)
    - app/bot/handlers.py (cmd_start role-based check)
    - app/bot/commands.py (_check_user_role_async + 5 updated callsites)
    - tests/conftest.py (_dispose_global_engine autouse fixture)
  affects:
    - tests/test_bot_role_resolution.py (now GREEN — 4/4 passed)
    - tests/test_bot_handlers.py (regressions — Plan 12-06 carryover)
    - tests/test_bot_handlers_phase4.py (regressions — Plan 12-06 carryover)
tech_stack:
  added: []
  patterns:
    - "bot_resolve_user_role: direct DB lookup via shared AsyncSessionLocal (per phase 12 CONTEXT decision)"
    - "_check_user_role_async: async helper wrapping bot_resolve_user_role for all command handlers"
    - "_dispose_global_engine: autouse conftest fixture for per-function event loop test isolation"
key_files:
  created:
    - app/bot/auth.py
  modified:
    - app/bot/handlers.py
    - app/bot/commands.py
    - tests/conftest.py
decisions:
  - "Direct DB lookup via AsyncSessionLocal in bot_resolve_user_role (no internal HTTP call) — per Phase 12 CONTEXT §decisions"
  - "Same 'Бот приватный' reply for ALL non-allowed roles (revoked + None) — no information disclosure (T-12-04-02)"
  - "5 callsites updated: _handle_add_or_income (cmd_add/income), cmd_balance, cmd_today, cmd_app, cb_disambiguation"
  - "_dispose_global_engine autouse fixture added to conftest.py — needed for asyncpg cross-event-loop isolation in per-function pytest-asyncio tests (Rule 2 fix)"
  - "test_bot_handlers.py + test_bot_handlers_phase4.py regressions accepted as Plan 12-06 carryover (old tests don't mock bot_resolve_user_role)"
metrics:
  duration: "30 minutes"
  completed_date: "2026-05-06"
  tasks_completed: 3
  tasks_total: 3
  files_created: 1
  files_modified: 3
---

# Phase 12 Plan 04: Bot Role-Based Auth Refactor Summary

**One-liner:** New `app/bot/auth.py` with `bot_resolve_user_role` + full refactor of `_is_owner` → `_check_user_role_async` in all 6 bot handler callsites; 4 RED tests from Plan 12-01 → GREEN.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create app/bot/auth.py — bot_resolve_user_role helper | 8577fbe | app/bot/auth.py |
| 2 | Refactor handlers.py + commands.py — replace OWNER_TG_ID-eq | 2487d83 | app/bot/handlers.py, app/bot/commands.py |
| 3 | Run pytest test_bot_role_resolution.py — 4 tests GREEN | e9c6d2c | tests/conftest.py |

## Verification

```
grep -v '^\s*#\|^\s*"""' app/bot/handlers.py app/bot/commands.py | grep 'settings\.OWNER_TG_ID\|_is_owner' | wc -l
→ 0 ✓ (no OWNER_TG_ID-eq or _is_owner in runtime code paths)

grep -c 'bot_resolve_user_role' app/bot/auth.py app/bot/handlers.py app/bot/commands.py
→ auth.py:1, handlers.py:3, commands.py:3 ✓ (≥4 total)

pytest tests/test_bot_role_resolution.py -v
→ 4/4 PASSED ✓
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Added _dispose_global_engine autouse fixture to tests/conftest.py**
- **Found during:** Task 3 (pytest run)
- **Issue:** test_bot_role_resolution.py runs 4 tests with per-function pytest-asyncio event loops. The module-level `async_engine` in `app/db/session.py` holds asyncpg connections from the first test's event loop. When the second test starts with a NEW event loop, asyncpg raises `InterfaceError: cannot perform operation: another operation is in progress` (cross-loop connection access).
- **Fix:** Added `@pytest_asyncio.fixture(autouse=True) async def _dispose_global_engine()` to `tests/conftest.py`. After each test, it disposes the global `async_engine` if `app.db.session` is in `sys.modules`. This forces a clean connection pool for the next test's event loop. Best-effort (no test failure if dispose fails).
- **Files modified:** tests/conftest.py
- **Commit:** e9c6d2c

### Known Regressions (Plan 12-06 Carryover)

**test_bot_handlers.py: 2 regressions**
- `test_cmd_start_owner_calls_bind_and_replies_with_webapp_button` — mocks `settings.OWNER_TG_ID` as the sender but doesn't mock `bot_resolve_user_role`. Now `cmd_start` calls DB lookup, finds no AppUser row, returns `None` → silent reject. Test expected greeting reply but gets none.
- `test_cmd_start_parses_onboard_payload` — same root cause.

**test_bot_handlers_phase4.py: 7 regressions**
- All 7 failing tests (`test_cmd_add_*`, `test_cmd_balance_reply`, `test_cmd_today_*`, `test_cmd_app_*`, `test_cb_disambiguation_flow`) — mock sender as OWNER_TG_ID but don't seed an AppUser row. `_check_user_role_async` → `bot_resolve_user_role` → DB query → no row → `None` → `role not in (owner, member)` → silent return.

**Resolution path:** Plan 12-06 (fixture sweep) will update these tests to either:
1. Mock `bot_resolve_user_role` to return `UserRole.owner` for the test sender, OR
2. Seed an AppUser row in the test DB before each test.

## Threat Model Coverage

| Threat ID | Category | Status |
|-----------|----------|--------|
| T-12-04-01 | Elevation (stale revoke) | Mitigated — fresh SELECT per command, no caching |
| T-12-04-02 | Info Disclosure (role differentiation) | Mitigated — same "Бот приватный" for all non-allowed roles |
| T-12-04-03 | Elevation (member /add) | Accepted — Phase 12 design allows members to use /add |
| T-12-04-04 | Tampering (OWNER_TG_ID stale path) | Mitigated — grep confirms 0 occurrences in runtime paths |
| T-12-04-05 | DoS (extra SELECT per command) | Accepted — single indexed lookup, negligible for human-paced bot |
| T-12-04-06 | Spoofing (crafted tg_user_id) | Mitigated — tg_user_id from BOT_TOKEN-signed Telegram updates |

## Self-Check

Verified:
- `app/bot/auth.py` exists ✓
- `app/bot/handlers.py` contains `bot_resolve_user_role` import ✓
- `app/bot/commands.py` contains `_check_user_role_async` def ✓
- 0 OWNER_TG_ID-eq occurrences in non-comment bot code ✓
- 4/4 test_bot_role_resolution.py tests GREEN ✓
- Commits 8577fbe, 2487d83, e9c6d2c verified in git log ✓

## Self-Check: PASSED
