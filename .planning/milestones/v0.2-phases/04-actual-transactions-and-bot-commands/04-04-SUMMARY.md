---
phase: "04-actual-transactions-and-bot-commands"
plan: "04"
subsystem: "bot"
tags: ["bot-commands", "aiogram", "parsers", "disambiguation", "wave-3"]
dependency_graph:
  requires:
    - "04-03 (internal bot routes via POST /api/v1/internal/bot/*)"
  provides:
    - "app/bot/parsers.py — parse_amount + parse_add_command pure functions"
    - "app/bot/disambiguation.py — PendingActual + store_pending/pop_pending with TTL"
    - "app/bot/commands.py — Router + 5 command handlers + cb_disambiguation callback"
    - "app/bot/api_client.py — EXTENDED with bot_create_actual, bot_get_balance, bot_get_today"
    - "main_bot.py — EXTENDED with dp.include_router(commands_router)"
  affects:
    - "04-05 (frontend ActualScreen — bot side complete, user can now /add via Telegram)"
tech_stack:
  added: []
  patterns:
    - "aiogram Router pattern — separate Phase 4 router in commands.py, not modifying handlers.py"
    - "_post_internal helper — DRY POST helper with X-Internal-Token for all Phase 4 bot→api calls"
    - "silent OWNER guard — non-OWNER triggers return without message.answer (no spam, no info leak)"
    - "disambiguation token — uuid4().hex[:8], TTL 5 min, module-level dict, gc on store"
    - "InternalApiError catch-all — every handler wraps api call; user always gets graceful reply"
key_files:
  created:
    - "app/bot/parsers.py"
    - "app/bot/disambiguation.py"
    - "app/bot/commands.py"
  modified:
    - "app/bot/api_client.py"
    - "main_bot.py"
    - "tests/test_main_bot_entry.py"
decisions:
  - "commands.py is a new router — app/bot/handlers.py (Phase 2 /start) is untouched; two routers registered in main_bot.py"
  - "main_bot.py: `router` renamed to `start_router` for clarity; test assertions updated accordingly"
  - "_post_internal helper added to api_client.py for DRY; bind_chat_id kept as-is (Phase 2)"
  - "cb_disambiguation tries edit_text first, falls back to answer on exception (MagicMock in tests raises TypeError on await, triggering fallback)"
  - "format_kopecks uses Python f-string :, with , replaced by space (Russian thousands separator)"
metrics:
  duration: "15 minutes"
  completed_date: "2026-05-03"
  tasks_completed: 4
  tasks_total: 4
  files_created: 3
  files_modified: 3
---

# Phase 4 Plan 04: Bot Command Handlers (Wave 3) Summary

**One-liner:** 3 новых bot-модуля (parsers, disambiguation, commands) + расширения api_client и main_bot.py — пользователь может /add/income/balance/today/app в Telegram, disambiguation через inline-keyboard.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create parsers.py and disambiguation.py | 9286b1f | app/bot/parsers.py, app/bot/disambiguation.py |
| 2 | Extend api_client.py with 3 new functions | 7165b06 | app/bot/api_client.py |
| 3 | Create commands.py with all handlers | 1419be2 | app/bot/commands.py |
| 4 | Wire commands_router into main_bot.py | 3721e4c | main_bot.py, tests/test_main_bot_entry.py |

## What Was Built

### app/bot/parsers.py — Pure parsing helpers (D-49, D-50)

`parse_amount(s)` — конвертирует строку в копейки:
- Форматы: `1500`, `1500.50`, `1500,50`, `1 500`, `1500р`, `1500руб`, `1500₽`
- Суффиксы стрипаются case-insensitive, longest-first (руб перед р)
- Ошибки: None при <=0, NaN, overflow >10^12 копеек, 3+ знака после запятой

`parse_add_command(args)` — split args на `(amount_cents, category_query, description_or_None)`.

### app/bot/disambiguation.py — In-memory pending state (D-47)

- `PendingActual` dataclass с TTL через `is_expired` property
- `store_pending` → 8-hex UUID token; `pop_pending` → None если expired или missing
- `_gc()` очищает expired записи на каждый `store_pending` — O(n), практически 0 нагрузка

### app/bot/commands.py — Command handlers (D-59/D-60/D-61/D-62)

- `cmd_add` / `cmd_income` — через `_handle_add_or_income`: parse → bot_create_actual → handle status
- `cmd_balance` — `bot_get_balance` → `_format_balance_reply` (emoji ✓/⚠️/🔴, топ-5 категорий)
- `cmd_today` — `bot_get_today` → `_format_today_reply` (список трат + итоги)
- `cmd_app` — inline WebApp button (MINI_APP_URL)
- `cb_disambiguation` — извлекает token + category_id, `pop_pending`, re-call `bot_create_actual`

Все handlers: `_is_owner` check → silent return для не-OWNER.

### app/bot/api_client.py — Extended

- `_post_internal(path, payload)` — generic POST с X-Internal-Token, raises InternalApiError
- `bot_create_actual(...)` — POST /api/v1/internal/bot/actual; optional fields не включаются в payload если None
- `bot_get_balance(tg_user_id)` — POST /api/v1/internal/bot/balance
- `bot_get_today(tg_user_id)` — POST /api/v1/internal/bot/today
- `bind_chat_id` — без изменений (Phase 2 совместимость)

### main_bot.py — Extended

- `from app.bot.commands import router as commands_router` добавлен
- `from app.bot.handlers import router` переименован в `start_router` для clarity
- `dp.include_router(commands_router)` добавлен после `dp.include_router(start_router)`
- `test_main_bot_entry.py` обновлён — проверки на новые имена роутеров

## Test Results

```
tests/test_bot_parsers.py          18 passed
tests/test_bot_handlers_phase4.py  13 passed
tests/test_main_bot_entry.py        6 passed
Total: 37 passed, 0 failed
```

Wave 0 bot тесты (test_bot_parsers + test_bot_handlers_phase4) GREEN.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated test_main_bot_entry.py assertions for Phase 4 router names**
- **Found during:** Task 4
- **Issue:** `test_dp_include_router_present` checked for literal `dp.include_router(router)` — fails after renaming `router` → `start_router`
- **Fix:** Updated assertion to check `dp.include_router(start_router)` and `dp.include_router(commands_router)` — matches new Phase 4 dual-router structure
- **Files modified:** tests/test_main_bot_entry.py
- **Commit:** 3721e4c

## Known Stubs

Нет — все handlers полностью реализованы и делегируют в api_client → internal API.

## Threat Flags

Реализованные mitigations из threat register:
- T-04-30 (Spoofing): `_is_owner` check + silent return во всех cmd handlers
- T-04-31 (Tampering): `int(category_id_str)` + FK constraint на server; 404 → InternalApiError → graceful
- T-04-32 (Tampering): UUID4 8-hex 32-bit token; TTL 5 мин — brute force практически невозможен
- T-04-33 (Info Disclosure): format functions не содержат settings; api_client логирует только path + error str
- T-04-35 (Tampering): parse_amount cap 10^12 → None
- T-04-37 (Tampering): `_is_owner` в cb_disambiguation → silent dismiss
- T-04-38 (Resource Exhaustion): `_gc()` на каждый store_pending удаляет expired

## Self-Check: PASSED

- app/bot/parsers.py: FOUND
- app/bot/disambiguation.py: FOUND
- app/bot/commands.py: FOUND
- app/bot/api_client.py (extended): FOUND
- main_bot.py (extended): FOUND
- Commit 9286b1f: FOUND
- Commit 7165b06: FOUND
- Commit 1419be2: FOUND
- Commit 3721e4c: FOUND
- 37 bot tests GREEN
