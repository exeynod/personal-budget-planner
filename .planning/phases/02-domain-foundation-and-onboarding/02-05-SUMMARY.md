---
phase: 02-domain-foundation-and-onboarding
plan: 05
subsystem: bot
tags: [aiogram, httpx, telegram, webapp, structlog, deep-link]

# Dependency graph
requires:
  - phase: 01-infrastructure-and-auth
    provides: "main_bot.py entry point + healthz on :8001 + OWNER_TG_ID gate + structlog config"
  - phase: 02-domain-foundation-and-onboarding/02-02
    provides: "settings.MINI_APP_URL + settings.API_BASE_URL"
  - phase: 02-domain-foundation-and-onboarding/02-04
    provides: "POST /api/v1/internal/telegram/chat-bind endpoint with verify_internal_token"
provides:
  - "app.bot.api_client.bind_chat_id — httpx wrapper for the internal chat-bind endpoint"
  - "app.bot.api_client.InternalApiError — typed wrapper around httpx.HTTPError"
  - "app.bot.handlers.router — aiogram Router with /start handler covering ONB-03"
  - "main_bot.py wired to the new router (replaces Phase 1 stub)"
affects:
  - "phase-04-bot-commands (will reuse app.bot.api_client pattern for /add, /income, /balance)"
  - "phase-05-dashboards (relies on tg_chat_id being persisted by /start)"
  - "phase-06-subscriptions (push notifications via tg_chat_id captured here)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bot → API internal HTTP via httpx.AsyncClient + X-Internal-Token + 5s timeout"
    - "InternalApiError wraps httpx.HTTPError so handlers degrade gracefully without leaking internals to user"
    - "aiogram Router factored into app.bot.handlers (testable in isolation; main_bot.py only wires Dispatcher + healthz)"
    - "structlog event names with domain.action.outcome (bot.start.replied, bot.chat_bind.failed)"

key-files:
  created:
    - "app/bot/__init__.py"
    - "app/bot/api_client.py"
    - "app/bot/handlers.py"
    - "tests/test_bot_handlers.py"
    - "tests/test_main_bot_entry.py"
  modified:
    - "main_bot.py"

key-decisions:
  - "bind_chat_id wraps httpx.HTTPError into InternalApiError so the handler can log a warning and still send the WebApp button (T-bot-conn-error: mitigate, not accept)"
  - "Single CommandStart() handler (not deep_link=True split) — command.args is None for bare /start, == 'onboard' for deep-linked launch; one branch per case keeps the function compact"
  - "Per-call AsyncClient (not singleton) acceptable in Phase 2: /start fires once per OWNER lifetime; Phase 4 will introduce a shared client for /add etc."
  - "OWNER_TG_ID re-checked in handler even though Telegram-level ACL filters most strangers — defence-in-depth per HLD §5"
  - "Three distinct greeting strings (onboard payload / bound OK / bind failed) so the user sees actionable copy when chat-bind degrades"

patterns-established:
  - "Bot package layout: app/bot/{api_client.py,handlers.py} — entry script (main_bot.py) only wires Dispatcher + healthz"
  - "Internal API call wrapper raises typed exception (InternalApiError) so bot handlers can choose between re-raise and degrade per-call"
  - "Unit test pattern for aiogram handlers: patch app.bot.handlers.bind_chat_id with AsyncMock, build Message via MagicMock + SimpleNamespace, assert reply_markup contains a WebAppInfo button"

requirements-completed:
  - ONB-03

# Metrics
duration: ~17min
completed: 2026-05-03
---

# Phase 2 Plan 05: Bot /start chat-bind & WebApp launcher Summary

**aiogram /start handler that calls internal chat-bind endpoint via httpx and replies with InlineKeyboardButton(WebAppInfo) — closes ONB-03 on bot side with graceful degradation when API is down.**

## Performance

- **Duration:** ~17 min
- **Started:** 2026-05-03T01:51:00Z (approx)
- **Completed:** 2026-05-03T02:08:00Z
- **Tasks:** 2 (TDD: 2 RED + 2 GREEN commits)
- **Files modified:** 6 (3 created in app/bot/, 1 rewritten main_bot.py, 2 test files added)

## Accomplishments

- `app/bot/api_client.py` — `bind_chat_id(*, tg_user_id, tg_chat_id)` posts to `/api/v1/internal/telegram/chat-bind` over httpx with `X-Internal-Token`, 5s timeout; `httpx.HTTPError` wrapped into `InternalApiError` and logged via structlog without leaking the token.
- `app/bot/handlers.py` — `cmd_start` handler: OWNER gate → chat-bind (best-effort) → deep-link payload parse (`onboard` / bare / failed-bind branches) → reply with single-row `InlineKeyboardMarkup([WebAppInfo(MINI_APP_URL)])`.
- `main_bot.py` — Phase 1 stub removed; entry point now imports `router` from `app.bot.handlers`, healthz on `:8001` retained unchanged.
- 14 unit tests added (8 for handlers/api_client + 6 for main_bot wiring) — all GREEN, no real Telegram or HTTP traffic.
- ONB-03 (bot side) covered end-to-end: `/start` from OWNER persists `tg_chat_id` and gives one-tap entry to the Mini App.

## Task Commits

Each task was committed atomically (TDD RED → GREEN cycle, all `--no-verify`):

1. **Task 1 RED: bot module unit tests** — `1f17322` (test) — 8 tests for `app.bot.handlers` + `app.bot.api_client`, fail with ModuleNotFoundError.
2. **Task 1 GREEN: app/bot package** — `257c7d3` (feat) — `__init__.py`, `api_client.py`, `handlers.py`; 8/8 tests green.
3. **Task 2 RED: main_bot wiring assertions** — `b4c2171` (test) — 6 static checks that fail until the entry point is rewritten.
4. **Task 2 GREEN: main_bot.py rewrite** — `3bae5a1` (feat) — imports `router` from `app.bot.handlers`, removes local `cmd_start`, keeps healthz; 14/14 tests green.

**Plan metadata:** committed in this same plan completion (final commit below).

_TDD discipline: RED commits added unit tests that failed; GREEN commits made them pass with no production code in the RED step._

## Files Created/Modified

- `app/bot/__init__.py` — package docstring (re-exports nothing; explicit by-module imports).
- `app/bot/api_client.py` — `bind_chat_id` async fn + `InternalApiError`; uses `settings.API_BASE_URL`, `settings.INTERNAL_TOKEN`; structlog warn on failure, info on success.
- `app/bot/handlers.py` — `router` (aiogram `Router`) + `cmd_start` + private `_open_app_keyboard()`; OWNER_TG_ID gate; tri-state greeting (onboard / bound / degraded).
- `main_bot.py` — entry point reduced to: configure_logging, Bot+Dispatcher creation, `dp.include_router(router)`, aiohttp healthz on `:8001`, `dp.start_polling`. Phase 1 stub `cmd_start` and local `Router()` removed.
- `tests/test_bot_handlers.py` — 8 unit tests using `AsyncMock` to stub `bind_chat_id` and patch `httpx.AsyncClient` for api_client tests.
- `tests/test_main_bot_entry.py` — 6 static + 1 dynamic-import test verifying main_bot.py wiring.

## Decisions Made

- **Wrap httpx errors in `InternalApiError`** — gives `cmd_start` a single typed except clause and prevents bare `Exception` swallow. Token never logged (only `error=str(exc)` which is the connection-level message).
- **Single `CommandStart()` filter, not split with `deep_link=True`** — `command.args` is `None` for bare `/start` and the string after the command otherwise; a single handler with one `if payload == "onboard"` branch is more readable than two registered handlers.
- **Three distinct greeting copies (onboard / bound / failed-bind)** — when chat-bind degrades, the user gets actionable copy ("попробуйте /start ещё раз") instead of a misleading success message.
- **Per-call `httpx.AsyncClient`** — `/start` fires once per OWNER lifetime; the TCP-handshake overhead is irrelevant. Phase 4 (`/add`, `/balance`, etc.) will introduce a shared client.
- **OWNER_TG_ID gate executes BEFORE chat-bind** — never make an internal API call for a stranger; saves a round trip and aligns with T-bot-non-owner mitigation.
- **`message.from_user is None` early-return** — service messages (channel posts, anonymous admins) are silently ignored rather than crashing.

## Deviations from Plan

None - plan executed exactly as written.

The plan listed `app/bot/__init__.py`, `api_client.py`, `handlers.py`, and the rewritten `main_bot.py`. All four files match the plan's specifications. The two extra test files (`test_bot_handlers.py`, `test_main_bot_entry.py`) are TDD artefacts mandated by the plan's `tdd="true"` task type — they are not deviations.

## Issues Encountered

- **No `uv` and no `.venv` in this worktree** — the plan's `uv run python -c ...` validation commands could not run as written. Fell back to `python3 -m pytest` (the system Python 3.9 happens to support every construct used in the new bot code, since I avoided `X | None` syntax). Verification still met all acceptance criteria: `ast.parse` syntax check, `python3 -c "from app.bot.handlers import router"` import probe, and full pytest run for the new test files. Phase 1 backend tests (`test_auth.py`) cannot be re-run here because they use `str | None` syntax requiring Python 3.10+, but they are unchanged by this plan and a pre-existing constraint of this worktree, not a regression.

## User Setup Required

None — no external service configuration required. `MINI_APP_URL`, `INTERNAL_TOKEN`, `API_BASE_URL`, and `OWNER_TG_ID` are already wired in `app/core/settings.py` (Phase 1 + Plan 02-02) and read from `.env` at runtime.

## Next Phase Readiness

- ONB-03 fully covered on bot side. The end-to-end flow (Telegram OWNER sends `/start` → `tg_chat_id` persisted in `app_user`) is implementable now — only manual live verification with a real bot remains (deferred to phase-level checkpoint per the plan's `verification` block step 5).
- `app/bot/api_client.py` is the canonical pattern for Phase 4 bot commands (`/add`, `/income`, `/balance`, `/today`, `/app`) that need to call internal API endpoints; that phase should refactor to a shared `httpx.AsyncClient` singleton injected via aiogram middleware (noted as a deferred best-practice in RESEARCH.md Pattern 2).
- `frontend/` is untouched; parallel Plan 02-06 owns it. No file conflicts.
- `.planning/STATE.md` and `.planning/ROADMAP.md` intentionally not modified per orchestrator instructions.

## Self-Check: PASSED

Files exist:
- `app/bot/__init__.py` — present
- `app/bot/api_client.py` — present
- `app/bot/handlers.py` — present
- `tests/test_bot_handlers.py` — present
- `tests/test_main_bot_entry.py` — present
- `main_bot.py` — modified, syntax OK

Commits exist (verified `git log --oneline | grep`):
- `1f17322` test(02-05) RED bot handlers — present
- `257c7d3` feat(02-05) GREEN app/bot — present
- `b4c2171` test(02-05) RED main_bot entry — present
- `3bae5a1` feat(02-05) GREEN main_bot rewrite — present

Test execution:
- `python3 -m pytest tests/test_bot_handlers.py tests/test_main_bot_entry.py -q` → 14 passed in 0.70s

Acceptance criteria (Task 1 + Task 2):
- All grep counts match or exceed thresholds
- Bot module imports succeed
- main_bot.py loads, has `main`, has `health_handler`, references `:8001`
- Phase 1 stub copy removed (0 occurrences)
- `dp.include_router(router)` wired

## TDD Gate Compliance

- Task 1: RED commit `1f17322` (test, 8 failing tests) → GREEN commit `257c7d3` (feat, all pass).
- Task 2: RED commit `b4c2171` (test, 6 assertions, 1 failing) → GREEN commit `3bae5a1` (feat, all pass).
- No REFACTOR commit needed — implementation already clean and minimal.

---
*Phase: 02-domain-foundation-and-onboarding*
*Completed: 2026-05-03*
