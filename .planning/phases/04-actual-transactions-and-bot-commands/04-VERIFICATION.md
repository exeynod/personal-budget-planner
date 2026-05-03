---
phase: 04-actual-transactions-and-bot-commands
verified: 2026-05-03T00:00:00Z
status: human_needed
score: 11/11 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Open Mini App HomeScreen -> tap FAB -> fill ActualEditor form with amount + category + date -> tap Save"
    expected: "Transaction recorded, row appears in ActualScreen list after navigating there, toast shown"
    why_human: "Full UI flow including bottom-sheet open/close, form validation feedback, and live API call with initData cannot be verified without a running Telegram Mini App session"
  - test: "In Telegram, send /add 1500 продукты пятёрочка to the bot"
    expected: "Bot replies: '+ Записано: 1 500 руб — Продукты (пятёрочка)' with category balance line"
    why_human: "Requires a running bot connected to the API with DATABASE_URL and valid BOT_TOKEN"
  - test: "In Telegram, send /add 1500 тр (ambiguous query matching multiple categories)"
    expected: "Bot sends inline keyboard with one button per matching category; tapping a button creates the transaction (disambiguation flow ACT-05)"
    why_human: "Requires live bot session + real DB with seeded categories; end-to-end callback handler execution"
  - test: "In Telegram, send /balance"
    expected: "Bot replies with formatted balance card showing period dates, balance_now, delta, and top-5 categories with emoji indicators"
    why_human: "Requires active budget period in DB and running bot+api services"
  - test: "Create a transaction with tx_date for today, then PATCH it with a tx_date falling in a different historical period"
    expected: "Response shows updated period_id; transaction disappears from ActualScreen (current period filter) after refetch"
    why_human: "Cross-period ACT-05 UX behavior requires real DB with two periods and live frontend refetch"
---

# Phase 4: Actual Transactions and Bot Commands Verification Report

**Phase Goal:** Пользователь может в один тап записать факт-трату через Mini App или бот-команду, период факт-транзакции вычисляется автоматически
**Verified:** 2026-05-03
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Pydantic schemas экспортируют все классы (ActualCreate/Update/Read, BalanceResponse, BalanceCategoryRow, BotActualRequest/Response, CategoryCandidate, BotBalance/Today) | VERIFIED | `app/api/schemas/actual.py` + `app/api/schemas/internal_bot.py` confirmed via import smoke test passing |
| 2 | Service actual.py реализует CRUD + period auto-resolve (D-52) + future-date guard (D-58) + balance aggregation (D-02/D-60) + actuals_for_today + find_categories_by_query | VERIFIED | `app/services/actual.py` 484 lines with all 9 functions; `_resolve_period_for_date` lookup-or-create implemented; `_check_future_date` today+7d guard; `compute_balance` D-02 sign rule confirmed |
| 3 | Service internal_bot.py реализует process_bot_actual (created/ambiguous/not_found), format_balance_for_bot, format_today_for_bot | VERIFIED | `app/services/internal_bot.py` — all 3 functions confirmed; import OK; no FastAPI imports |
| 4 | actual_router зарегистрирован в public_router; 5 endpoints работают | VERIFIED | Router shows 5 routes; registered in `app/api/router.py` line 111; routes verified in app.routes |
| 5 | POST /actual всегда устанавливает source=ActualSource.mini_app (D-53) | VERIFIED | `app/api/routes/actual.py` line 123: `source=ActualSource.mini_app` hardcoded |
| 6 | PATCH /actual/{id} с tx_date пересчитывает period_id (ACT-05) | VERIFIED | `app/services/actual.py` lines 289-296: `if 'tx_date' in data and data['tx_date'] != row.tx_date: ... row.period_id = new_period_id` |
| 7 | internal_bot_router зарегистрирован под internal_router; 3 endpoints POST /internal/bot/* | VERIFIED | Router shows 3 routes; registered in `app/api/router.py` line 133; all 3 paths visible in app.routes |
| 8 | Bot handlers /add, /income, /balance, /today, /app + cb_disambiguation реализованы с OWNER-check | VERIFIED | `app/bot/commands.py` — all 6 handlers; `_is_owner` check in each; test_bot_handlers_phase4.py 13/13 PASSED |
| 9 | Disambiguation flow: ambiguous -> store_pending -> inline kbd with act:TOKEN:CATEGORY_ID -> callback -> pop_pending -> re-call API | VERIFIED | `app/bot/commands.py` lines 265-275 (store+kbd); line 351 (callback_query F.data.startswith("act:")); test_cb_disambiguation_flow PASSED |
| 10 | Frontend ActualScreen — список факт-трат + FAB + BottomSheet ActualEditor add/edit/delete; HomeScreen + FAB + nav Факт; App.tsx Screen union + routing | VERIFIED | All 5 files exist and are substantive; TypeScript build passes (0 errors); `actual` in Screen union; routing wired in App.tsx |
| 11 | parsers.py pure functions parse_amount + parse_add_command работают корректно | VERIFIED | 18/18 test_bot_parsers.py PASSED covering all edge cases (decimal, NBSP, suffixes, zero, overflow, multi-word description) |

**Score:** 11/11 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/api/schemas/actual.py` | Pydantic schemas: ActualCreate, ActualUpdate, ActualRead, BalanceResponse, BalanceCategoryRow | VERIFIED | 61 lines, all classes exported, from_attributes=True on ActualRead |
| `app/api/schemas/internal_bot.py` | Pydantic schemas: BotActualRequest (model_validator), BotActualResponse, CategoryCandidate, BotBalance/Today* | VERIFIED | 75 lines, model_validator on BotActualRequest confirmed |
| `app/services/actual.py` | CRUD + balance + period resolve + actuals_for_today + find_categories_by_query + exceptions | VERIFIED | 484 lines, pure (no FastAPI), all functions confirmed |
| `app/services/internal_bot.py` | process_bot_actual + format_balance_for_bot + format_today_for_bot | VERIFIED | 3 public functions confirmed; no FastAPI |
| `app/api/routes/actual.py` | 5 endpoints: list/create/update/delete actual + balance | VERIFIED | 241 lines; /actual/balance declared BEFORE /actual/{id} (URL conflict prevention) |
| `app/api/routes/internal_bot.py` | 3 endpoints: bot/actual, bot/balance, bot/today | VERIFIED | 169 lines; no own dependencies (inherits from parent) |
| `app/api/router.py` | Updated registration | VERIFIED | actual_router line 111, internal_bot_router line 133 |
| `app/bot/parsers.py` | parse_amount + parse_add_command | VERIFIED | 85 lines; all 18 parser tests pass |
| `app/bot/disambiguation.py` | PendingActual + store_pending + pop_pending + TTL 5min | VERIFIED | 79 lines; token is full uuid4().hex (32 chars); callback_data "act:TOKEN:CATEGORY_ID" = 43 chars (under 64-char limit) |
| `app/bot/commands.py` | Router + 5 cmd handlers + cb_disambiguation | VERIFIED | All 6 handlers, OWNER-check, disambiguation flow, 13/13 handler tests pass |
| `app/bot/api_client.py` | EXTENDED: bot_create_actual, bot_get_balance, bot_get_today | VERIFIED | Lines 103-157 confirmed; _post_internal helper; async functions verified |
| `main_bot.py` | EXTENDED: dp.include_router(commands_router) | VERIFIED | Line 51: `dp.include_router(commands_router)` |
| `frontend/src/api/types.ts` | Phase 4 types: ActualRead, ActualCreatePayload, BalanceResponse, etc. | VERIFIED | Extended file; TypeScript build clean |
| `frontend/src/api/actual.ts` | listActual, createActual, updateActual, deleteActual, getBalance | VERIFIED | 5 functions wrapping apiFetch |
| `frontend/src/hooks/useActual.ts` | useActual(periodId) hook | VERIFIED | Mirror of usePlanned with cancellation guard |
| `frontend/src/components/ActualEditor.tsx` | Form: kind toggle, amount, category select (filtered), description, tx_date | VERIFIED | tx_date input present; kind toggle resets categoryId on switch; autoFocus on create |
| `frontend/src/components/Fab.tsx` | FAB component (fixed, circular, accent) | VERIFIED | Stateless, props: onClick/ariaLabel/label |
| `frontend/src/screens/ActualScreen.tsx` | List + group-by-date + BottomSheet + FAB | VERIFIED | createActual/updateActual/deleteActual wired; handleSave/handleDelete; empty state text present |
| `frontend/src/screens/HomeScreen.tsx` | EXTENDED: + nav Факт + FAB + BottomSheet integration | VERIFIED | onNavigate('actual') + sheetOpen + createActual |
| `frontend/src/App.tsx` | Screen union + 'actual' route | VERIFIED | Screen type includes 'actual'; ActualScreen rendered on screen === 'actual' |
| `tests/test_actual_crud.py` | Integration tests actual CRUD | VERIFIED | 349 lines; 21+ tests collected |
| `tests/test_actual_period.py` | Integration tests ACT-02/ACT-05 period | VERIFIED | 155 lines; 3 tests collected |
| `tests/test_balance.py` | Integration tests compute_balance aggregation | VERIFIED | 211 lines; 4 tests collected |
| `tests/test_internal_bot.py` | Integration tests bot internal endpoints | VERIFIED | 210 lines; 6 tests collected |
| `tests/test_bot_parsers.py` | Unit tests parse_amount + parse_add_command | VERIFIED | 132 lines; 18/18 PASSED |
| `tests/test_bot_handlers_phase4.py` | Unit/integration tests bot handlers | VERIFIED | 292 lines; 13/13 PASSED |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `app/services/actual.py::_resolve_period_for_date` | `app/core/period.py::period_for` | function call | WIRED | `period_for(tx_date, cycle_start_day)` called in lookup-or-create branch |
| `app/services/actual.py::compute_balance` | PlannedTransaction + ActualTransaction | `func.sum` group_by | WIRED | SQLAlchemy aggregation queries confirmed |
| `app/services/internal_bot.py::process_bot_actual` | `app/services/actual.py::find_categories_by_query + create_actual` | imports | WIRED | `from app.services import actual as actual_svc` confirmed |
| `app/api/routes/actual.py` | `app/services/actual.py` | service function calls | WIRED | `from app.services import actual as actual_svc` + exception mapping |
| `app/api/routes/internal_bot.py` | `app/services/internal_bot.py` | service function calls | WIRED | `from app.services import internal_bot as internal_bot_svc` |
| `app/api/router.py` | `app/api/routes/actual.py + internal_bot.py` | include_router | WIRED | Lines 111 + 133 confirmed |
| `app/bot/commands.py` | `app/bot/api_client.py + parsers.py + disambiguation.py` | imports | WIRED | All 3 imports confirmed at lines 33-40 |
| `app/bot/api_client.py` | `POST /api/v1/internal/bot/*` | httpx POST with X-Internal-Token | WIRED | `_post_internal` sends to `/api/v1/internal/bot/actual|balance|today` |
| `main_bot.py` | `app/bot/commands.py::router` | dp.include_router | WIRED | Line 51: `dp.include_router(commands_router)` |
| `frontend/src/screens/ActualScreen.tsx` | `api/actual, hooks/useActual, hooks/useCategories, hooks/useCurrentPeriod, components/ActualEditor, BottomSheet, Fab` | imports + JSX usage | WIRED | All 7 imports confirmed; createActual/updateActual/deleteActual used in handlers |
| `frontend/src/App.tsx` | `screens/ActualScreen` | import + JSX route | WIRED | Lines 8 + 70-71 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `ActualScreen.tsx` | `rows` from `useActual` | `listActual(periodId)` → `GET /api/v1/periods/{id}/actual` → `actual_svc.list_actual_for_period` → DB query | Yes — SQLAlchemy SELECT with filters | FLOWING |
| `ActualScreen.tsx` | `categories` from `useCategories` | existing Phase 2/3 hook | Yes (verified in Phase 3) | FLOWING |
| `app/api/routes/actual.py::get_balance` | `BalanceResponse` | `actual_svc.compute_balance` → `func.sum` GROUP BY across planned + actual tables | Yes — real aggregation queries | FLOWING |
| `app/bot/commands.py::cmd_balance` | `result` dict | `bot_get_balance` → `_post_internal` → HTTP → `format_balance_for_bot` → `compute_balance` | Yes — chained through real API | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| parse_amount('1500') == 150000 | Python assertion | PASS | PASS |
| parse_amount('1500.555') is None | Python assertion | PASS | PASS |
| parse_amount('0') is None | Python assertion | PASS | PASS |
| parse_add_command('1500 продукты пятёрочка') | Python assertion | (150000, 'продукты', 'пятёрочка') | PASS |
| store_pending/pop_pending TTL | Python assertion | pop second time returns None | PASS |
| format_kopecks(150000) == '1 500' | Python assertion | PASS | PASS |
| All 18 test_bot_parsers tests | pytest | 18/18 passed (0.01s) | PASS |
| All 13 test_bot_handlers_phase4 tests | pytest | 13/13 passed (0.52s) | PASS |
| actual_router has 5 endpoints | Python inspection | 5 routes | PASS |
| internal_bot_router has 3 endpoints | Python inspection | 3 routes | PASS |
| App routes include /actual and /internal/bot/* | Python inspection | 4 actual paths + 3 bot paths | PASS |
| TypeScript build | npx tsc --noEmit | 0 errors | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ACT-01 | 04-03, 04-05, 04-06 | Bottom-sheet форма добавления факт-транзакции (Mini App): сумма, kind, категория, описание, дата | SATISFIED | ActualEditor.tsx with kind toggle/amount/category/description/tx_date; POST /actual endpoint; createActual API call |
| ACT-02 | 04-02, 04-03 | Период факт-транзакции вычисляется по tx_date + текущий cycle_start_day | SATISFIED | `_resolve_period_for_date` in actual.py; auto-creates period if needed (D-52); period_id set on create |
| ACT-03 | 04-04 | Бот-команды /add <сумма> <category_query> [описание] и /income | SATISFIED | cmd_add/cmd_income handlers; parse_add_command; bot_create_actual → POST /internal/bot/actual |
| ACT-04 | 04-04 | Бот-команды /balance, /today, /app выводят соответствующие данные | SATISFIED | cmd_balance/cmd_today/cmd_app; format_balance_for_bot/format_today_for_bot; D-60/D-61/D-62 reply formatters |
| ACT-05 | 04-02, 04-03, 04-04 | При неоднозначном category_query бот показывает inline-кнопки выбора | SATISFIED | process_bot_actual returns status='ambiguous' with candidates; store_pending → inline kbd with act:TOKEN:CATEGORY_ID; cb_disambiguation flow; test_cb_disambiguation_flow PASSED |

Note: ACT-05 in REQUIREMENTS.md is about disambiguation (inline-кнопки при неоднозначном category_query), not the PATCH tx_date recompute which is documented as D-52/ACT-05 in plan context. Both behaviors are implemented.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `app/services/actual.py` | 472 | `return []` | Info | Intentional guard — empty category query returns empty list; not a stub |

No blockers found.

### Human Verification Required

#### 1. Mini App one-tap expense flow (ACT-01 end-to-end)

**Test:** Open the Mini App in Telegram. Navigate to HomeScreen. Tap the FAB (+ button, bottom-right). Fill in the ActualEditor form: select kind=Расход, enter amount=1500, select any expense category, optionally add description, leave date as today. Tap Сохранить.
**Expected:** BottomSheet closes. Toast "Записано" appears. Navigate to Факт screen — the new transaction appears grouped under today's date.
**Why human:** Full UI flow requires a real Telegram Mini App session with initData authentication. The BottomSheet open/close animation, form validation feedback, and toast behavior cannot be verified programmatically.

#### 2. Bot /add command success path (ACT-03)

**Test:** In Telegram, send `/add 1500 продукты пятёрочка` to the bot (assuming an expense category "Продукты" exists in DB).
**Expected:** Bot replies with formatted message containing the amount (1 500 ₽), category name, description, and remaining category balance line.
**Why human:** Requires a running bot process with valid BOT_TOKEN connected to the API with DATABASE_URL and seeded categories.

#### 3. Bot disambiguation flow end-to-end (ACT-05 per REQUIREMENTS.md)

**Test:** In Telegram, send `/add 1500 тр` (or any query that matches 2+ categories). Then tap one of the inline keyboard buttons.
**Expected:** Step 1: Bot sends "Уточните категорию:" with inline keyboard. Step 2: Tapping a button records the transaction and bot replies with confirmation.
**Why human:** Requires live bot session, real DB with multiple matching categories, and interactive callback handling.

#### 4. Bot /balance command (ACT-04)

**Test:** In Telegram, send `/balance`.
**Expected:** Bot replies with formatted balance showing: 💰 Баланс, Δ периода, Топ-5 категорий with emoji indicators (✓/⚠️/🔴), period dates.
**Why human:** Requires active budget period in DB, planned and actual transactions to show meaningful data.

#### 5. ACT-05 cross-period PATCH behavior (UX verification)

**Test:** Create an actual transaction for today (active period). Then PATCH it with a tx_date that falls in a previous closed period. Check ActualScreen.
**Expected:** The transaction disappears from ActualScreen (since it's filtered by current period_id), confirming the period_id was recomputed.
**Why human:** Requires two existing periods in DB and frontend interaction to observe the refetch behavior.

### Gaps Summary

No gaps found. All 11 observable truths are verified. All required artifacts exist, are substantive (real implementations, not stubs), and are correctly wired. All key data flows through to real DB queries. The 5 human verification items relate to end-to-end UX and bot behavior that require running services with valid credentials and a real Telegram session.

---

_Verified: 2026-05-03_
_Verifier: Claude (gsd-verifier)_
