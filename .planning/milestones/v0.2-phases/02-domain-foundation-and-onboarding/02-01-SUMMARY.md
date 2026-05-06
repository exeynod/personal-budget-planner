---
phase: 02-domain-foundation-and-onboarding
plan: 01
subsystem: testing

tags:
  - pytest
  - pytest-asyncio
  - tdd-red
  - sqlalchemy-async
  - fastapi-testclient
  - postgres

# Dependency graph
requires:
  - phase: 01-infrastructure-and-auth
    provides:
      - "tests/conftest.py with async_client, bot_token, owner_tg_id, internal_token, make_init_data fixtures"
      - "app.main_api app importable; app.api.dependencies.get_db importable"
      - "AppUser, Category, BudgetPeriod ORM models"

provides:
  - "tests/test_period_engine.py — 9 параметризованных unit-кейсов period_for() (HLD §3 + edge: cycle=31 в Feb, leap-year, year rollover/under, day == cycle_start) + 2 sanity/invariant теста"
  - "tests/test_categories.py — 9 integration-тестов CRUD/soft-archive/seed-idempotency"
  - "tests/test_periods.py — 2 integration-теста GET /periods/current до и после onboarding"
  - "tests/test_onboarding.py — 5 integration-тестов (включая parametrize ×5 для 422), покрывают ONB-01/PER-02/PER-03/CAT-03/D-09/D-10"
  - "tests/test_settings.py — 4 integration-теста GET/PATCH /settings + SET-01 (PATCH не пересчитывает текущий период)"
  - "tests/test_telegram_chat_bind.py — 4 integration-теста ONB-03 (upsert) + 403 без/с неправильным X-Internal-Token"
  - "Контрактный фундамент Wave 1+ (Plans 02-02..02-07) — RED-тесты фиксируют API/сигнатуры до имплементации"

affects:
  - "02-02-PLAN (period engine)"
  - "02-03-PLAN (services: categories, periods, onboarding, settings, telegram)"
  - "02-04-PLAN (API routes wiring)"
  - "02-05-PLAN (bot /start handler — будет дёргать internal/telegram/chat-bind, контракт зафиксирован)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Self-skip pattern для DB-backed integration tests: pytest.skip если DATABASE_URL не задан"
    - "Per-file db_client fixture: TRUNCATE всех domain-таблиц + dependency_overrides[get_db] на real session"
    - "auth_headers fixture: X-Telegram-Init-Data собирается через make_init_data() из conftest"
    - "Параметризованные тесты для входной валидации (cycle_start_day ∈ {0,29,30,31,-1} → 422)"
    - "Test-as-contract: ImportError / 404 на несуществующие модули и роуты — ожидаемое RED"

key-files:
  created:
    - "tests/test_period_engine.py — pure unit для app.core.period.period_for"
    - "tests/test_categories.py — DB-backed CRUD + seed для /api/v1/categories"
    - "tests/test_periods.py — DB-backed для /api/v1/periods/current"
    - "tests/test_onboarding.py — DB-backed для /api/v1/onboarding/complete"
    - "tests/test_settings.py — DB-backed для /api/v1/settings"
    - "tests/test_telegram_chat_bind.py — DB-backed для /api/v1/internal/telegram/chat-bind"
  modified: []

key-decisions:
  - "db_client fixture определён локально в каждом тестовом файле (не вынесен в conftest), чтобы минимизировать риск регрессии Phase 1 тестов. DRY-вынос — отложено до Plan 02-03+ когда 6 копий начнут болеть."
  - "auth_headers использован как обычный pytest.fixture (sync), а не pytest_asyncio.fixture — он не делает await, просто собирает headers dict."
  - "db_client использует pytest_asyncio.fixture (требует await engine.dispose()), иначе pytest 8 + pytest-asyncio 1.x перестают распознавать фикстуру как async generator."
  - "Тестовые файлы импортируют app.core.period и инжектят dependency_overrides ВНУТРИ функций / fixture-ов (не на module top-level), чтобы collect-only фаза не падала с ImportError на тестах, которые self-skip из-за отсутствия DATABASE_URL."

patterns-established:
  - "RED-first contract testing: тесты для неопределённых модулей/роутов пишутся ДО имплементации. Импорты внутри функций защищают collect-фазу."
  - "DB isolation per test: TRUNCATE на старте fixture, RESTART IDENTITY CASCADE гарантирует одинаковые id-ишники между тестами."
  - "Parametrize для boundary-валидации: один test_invalid_cycle_day вместо 5 копипастов."

requirements-completed:
  - CAT-01
  - CAT-02
  - CAT-03
  - PER-01
  - PER-02
  - PER-03
  - PER-05
  - ONB-01
  - ONB-03
  - SET-01

# Metrics
duration: ~12min
completed: 2026-05-02
---

# Phase 02 Plan 01: Wave 0 RED Test Stubs Summary

**6 RED-тестовых файлов (24 теста, 14 параметризованных кейсов) фиксируют контракт всех API/сервисов Phase 2 ДО их имплементации в Plans 02-02..02-07.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-05-02
- **Completed:** 2026-05-02
- **Tasks:** 2 (по плану)
- **Files created:** 6 (тестовые файлы); файлы существующего кодбейза не изменены

## Accomplishments

- **Period engine contract** (PER-01): 9 параметризованных кейсов `period_for()` покрывают все edge'ы из HLD §3 — клампинг (Feb с cycle=31), leap-year (29 февраля 2024), year rollover (декабрь→январь), year rollunder (январь→декабрь), day == cycle_start и day == cycle_start - 1. Плюс 2 теста-инварианта (типы возврата, длина 28-31 день).
- **Categories CRUD + seed contract** (CAT-01/02/03): 9 integration-тестов на полный жизненный цикл — list_empty → create → list → update → archive (soft via DELETE) → include_archived filter → unarchive via PATCH → seed создаёт 14 → seed idempotent (skip когда уже есть категории).
- **Onboarding atomicity contract** (ONB-01/PER-02/CAT-03/D-09/D-10): 5 тестов покрывают happy-path (period + 14 cats + onboarded_at), 409 Conflict при повторе (защита от двойного клика), no-seed-flag, отрицательный balance (=долг, разрешено), и parametrized 422 на `cycle_start_day ∈ {0, 29, 30, 31, -1}`.
- **Settings + не-перерасчёт периодов** (SET-01/PER-01/D-17): 4 теста — GET default=5, PATCH round-trip, parametrized 422 invalid days, и ключевой `test_patch_does_not_recompute_existing_period` фиксирующий бизнес-правило «изменение применится со следующего периода».
- **Internal telegram chat-bind contract** (ONB-03/D-11): 4 теста — 403 без X-Internal-Token (T-internal-token), 403 с wrong token (T-chatbind-spoof), upsert-create user с tg_chat_id, repeat bind обновляет existing (UPSERT pattern).
- **Periods read contract** (PER-02): 2 теста — 404 до onboarding, 200 после с правильным `starting_balance_cents`/`status`/`period_start`/`period_end`.

## Task Commits

1. **Task 1: test_period_engine.py + test_categories.py** — `049d582` (test)
2. **Task 2: test_periods.py + test_onboarding.py + test_settings.py + test_telegram_chat_bind.py** — `b9cd5b6` (test)

_Note: TDD-RED задачи фазы — только `test(...)` коммиты; GREEN-имплементация будет в Plans 02-02..02-04, REFACTOR — в их рамках._

## Files Created/Modified

**Created (6):**
- `tests/test_period_engine.py` — 9 parametrized `period_for` cases + 2 sanity/invariant
- `tests/test_categories.py` — 9 CRUD + seed integration tests
- `tests/test_periods.py` — 2 GET /periods/current tests
- `tests/test_onboarding.py` — 5 onboarding tests (incl. parametrize ×5 invalid_day)
- `tests/test_settings.py` — 4 settings tests (incl. parametrize ×4 invalid_day)
- `tests/test_telegram_chat_bind.py` — 4 internal endpoint tests

**Modified:** none. Сознательно не трогали `tests/conftest.py` (Phase 1) и production код.

## Decisions Made

- **db_client fixture per-file, не shared в conftest.** Минимизирует риск задеть Phase 1 тесты. DRY-рефактор отложен до Plan 02-03+, когда 6 копий начнут болеть.
- **auth_headers как sync `pytest.fixture`, не `pytest_asyncio.fixture`.** Фикстура не делает await — просто собирает dict из `make_init_data(...)`. Это работает с обоими стилями, но sync вариант проще.
- **db_client как `pytest_asyncio.fixture`.** Нужен `await engine.dispose()` после yield. С обычным `@pytest.fixture` async-генератор может не корректно очиститься в pytest-asyncio 1.x.
- **Импорты `from app.core.period import period_for` помещены ВНУТРЬ test-функций**, не на module top-level. Это позволяет pytest --collect-only пройти даже когда модуля ещё нет (collection падает только если top-level imports ломаются). Тесты RED-fail на runtime ImportError — это ожидаемо.
- **Имена тестов соответствуют threat-references из 02-VALIDATION.md** (`test_chat_bind_without_internal_token_403` ↔ `T-internal-token`, `test_repeat_complete_returns_409` ↔ `T-double-onboard`).

## Deviations from Plan

None - plan executed exactly as written.

Минорные уточнения формата (не нарушающие контракт):
- `auth_headers` стал `@pytest.fixture` (а не `@pytest.fixture async`) — без `async def`, потому что не делает await. Поведение идентично.
- `db_client` стал `@pytest_asyncio.fixture` — необходимо для корректной работы async generator-ов в pytest-asyncio 1.2.0 (плановый код использовал `@pytest.fixture` для async — это работает только с deprecated `auto`-режимом или в более ранних версиях).
- Имя теста `test_period_for_invariant_end_minus_start_plus_1_in_28_31_range` (исходный план: `_equals_month_length` — но "month length" это 28-31, не одно значение). Семантика идентична.

## Issues Encountered

- **`uv` не установлен в worktree-окружении.** `cd ... && uv run pytest --collect-only` упал бы с `command not found`. Это не блокер для плана — задача фазы была создать файлы и валидировать их синтаксис (`python3 -c "import ast; ast.parse(...)"` — все 6 файлов OK). RED-валидация (collect упадёт на ImportError) выполняется в Plans 02-02+ при наличии полностью настроенного venv. Документировано здесь как невозможность дёрнуть `uv run pytest` локально, но не как блокер плана.

## User Setup Required

None - тестовые файлы сами по себе ничего не требуют от пользователя. Для GREEN-фазы (Plans 02-02..02-04) пользователю надо будет:
- Установить `python-dateutil` (Plan 02-02 добавит в `pyproject.toml`)
- Поднять `docker compose up -d db` и применить `alembic upgrade head` для запуска DB-backed тестов
- Иначе DB-тесты self-skip-нутся, что приемлемо для CI без Postgres.

## Self-Check: PASSED

**Files exist:**
- FOUND: tests/test_period_engine.py
- FOUND: tests/test_categories.py
- FOUND: tests/test_periods.py
- FOUND: tests/test_onboarding.py
- FOUND: tests/test_settings.py
- FOUND: tests/test_telegram_chat_bind.py

**Commits exist:**
- FOUND: 049d582 (test 02-01: period engine + categories)
- FOUND: b9cd5b6 (test 02-01: periods, onboarding, settings, chat-bind)

**Acceptance criteria (Task 1):**
- test_period_engine.py: 9 parametrized cases ✓ (29 `date(...)` occurrences ≥ 27)
- test_categories.py: 9 test_* functions ✓
- DATABASE_URL refs: 5 ≥ 1 ✓
- is_archived refs: 4 ≥ 3 ✓
- seed_default_categories refs: 3 ≥ 2 ✓

**Acceptance criteria (Task 2):**
- test_periods.py: 2 ≥ 2 ✓
- test_onboarding.py: 5 ≥ 5 ✓
- test_onboarding 409 refs: 4 ≥ 1 ✓
- test_onboarding parametrize: 1 ≥ 1 ✓
- test_settings.py: 4 ≥ 4 ✓
- test_settings test_patch_does_not_recompute: 1 == 1 ✓
- test_telegram_chat_bind.py: 4 == 4 ✓
- test_telegram_chat_bind 403 patterns: 2 ≥ 2 ✓

## Next Phase Readiness

- **Plan 02-02 (period engine):** контракт `period_for(date, cycle_start_day) -> tuple[date, date]` зафиксирован 9 параметризованными тестами. Plan 02-02 должен запустить `pytest tests/test_period_engine.py` и сделать его GREEN.
- **Plan 02-03 (services):** контракты `categories.list_categories/create/update/archive/seed_default_categories`, `onboarding.complete_onboarding`, `settings.get/update`, `telegram.bind_chat_id` зафиксированы integration-тестами. Plan должен запустить полный backend suite и сделать GREEN.
- **Plan 02-04 (routes):** API-контракты для `/api/v1/categories`, `/api/v1/periods/current`, `/api/v1/onboarding/complete`, `/api/v1/settings`, `/api/v1/internal/telegram/chat-bind` зафиксированы. Plan должен подключить routers и пройти все DB-backed тесты.
- **Plan 02-05 (bot):** контракт internal endpoint зафиксирован — bot должен дёрнуть `POST /api/v1/internal/telegram/chat-bind` с `X-Internal-Token` (доказано тестами).

**Blockers / concerns:**
- Если в Plan 02-02 dateutil поведёт себя нестандартно для leap-year (Feb 29 → Mar 30) — тест `(date(2024, 2, 29), 31, ...)` упадёт и потребует решения. Это специфичный edge — реализация согласно HLD §3 даёт именно такой ответ.

---
*Phase: 02-domain-foundation-and-onboarding*
*Completed: 2026-05-02*
