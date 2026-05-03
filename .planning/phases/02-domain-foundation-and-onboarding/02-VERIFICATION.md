---
phase: 02-domain-foundation-and-onboarding
verified: 2026-05-02
status: human_needed
score: 5/5 must-haves verified (code-level); 1 manual UI walkthrough deferred to user
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: n/a
  gaps_closed: []
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "End-to-end onboarding в реальном Telegram Mini App с боевым BOT_TOKEN"
    expected: "Открыть Mini App → отрисовываются 4 секции (sketch 006-B); тапнуть «Открыть @bot» → отправить /start в чате → вернуться в Mini App → секция 1 автоматически переключается в «Бот подключён» с ✓ в течение ~6 с (polling 2 с × 15); ввести сумму, шаг периода, тапнуть «Готово» → переход на HomeScreen; перезапуск Mini App → сразу HomeScreen"
    why_human: "Visual layout, polling timing и Telegram WebApp/MainButton lifecycle проверяются только в реальном клиенте Telegram"
  - test: "DB-проверка после onboarding"
    expected: "docker compose exec db psql -U budget -d budget_db -c \"SELECT cycle_start_day, onboarded_at, tg_chat_id FROM app_user; SELECT COUNT(*) FROM category; SELECT period_start, period_end, starting_balance_cents, status FROM budget_period;\" → onboarded_at IS NOT NULL, tg_chat_id IS NOT NULL, COUNT(category)=14, ровно 1 active период с введённым starting_balance, period_start/period_end рассчитаны через period_for(today_msk, cycle_start_day) и содержат сегодня"
    why_human: "Требует поднятый docker-compose стек и валидный BOT_TOKEN для бот-связки"
  - test: "Categories CRUD: создать → переименовать → архивировать → toggle 'Показать архивные' → восстановить"
    expected: "Создание категории появляется в нужной группе (Расходы/Доходы); inline rename (Enter сохраняет, Esc отменяет); window.confirm перед архивированием; архивированная исчезает из default-списка, но появляется при включённом toggle с opacity 0.5 и кнопкой 'Восстановить'; PATCH {is_archived:false} возвращает в активные"
    why_human: "UI-flow + window.confirm — проверяется в браузере/Mini App"
  - test: "Settings cycle_start_day: смена + проверка SET-01 boundary в БД"
    expected: "GET /settings возвращает текущий cycle_start_day; смена через Stepper включает MainButton 'Сохранить'; PATCH 200 → MainButton дизейблится; toast '✓ Сохранено' 1.5 с; БД-проверка: app_user.cycle_start_day обновлён, budget_period НЕ пересчитан (period_start/period_end остались старыми); попытка PATCH с cycle_start_day=29 через curl → 422"
    why_human: "Подтверждение SET-01/D-17 boundary требует SQL-запроса до и после; UI dirty-tracking + MainButton lifecycle — Telegram"
  - test: "Bot /start в реальном Telegram"
    expected: "OWNER отправляет /start → бот отвечает greeting + кнопкой «Открыть бюджет» (WebAppInfo) → tg_chat_id записан в app_user; /start от не-OWNER → 'Бот приватный'; /start onboard (deep-link) → специальное приветствие 'Готово, push-уведомления включены'"
    why_human: "Требует реального BOT_TOKEN, регистрации бота в @BotFather и OWNER аккаунта"
---

# Phase 2: Domain Foundation & Onboarding — Verification Report

**Phase Goal:** Пользователь может пройти первый запуск и получить базовую конфигурацию: bot bind, стартовый баланс, cycle_start_day, seed категорий — после этого активный период существует и категории доступны.

**Verified:** 2026-05-02
**Status:** human_needed (5/5 must-haves verified at code level; manual UI walkthrough deferred к пользователю по auto-mode директиве)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| #   | Truth (Roadmap SC) | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Onboarding scrollable с 4 пронумерованными секциями (sketch 006-B): bot bind / starting_balance / cycle_start_day / seed категорий | ✓ VERIFIED (code) | `frontend/src/screens/OnboardingScreen.tsx:91-167` рендерит 4 `<SectionCard number={1..4}>` в порядке: bot-bind, balance, cycle-day, seed-checkbox; root layout — single column с `header → intro → 4 cards → MainButton`, scrollable естественным образом (никакого виртуального wizard'а нет). MainButton enabled только при всех валидных значениях (line 33-38). |
| 2 | После /start `tg_chat_id` сохраняется и кнопка bot bind меняется на «✓ Привязано» | ✓ VERIFIED (code) | Backend: `app/bot/handlers.py:67-72` вызывает `bind_chat_id(tg_user_id, tg_chat_id)` → `app/services/telegram.py:29-37` делает PostgreSQL UPSERT на `app_user.tg_chat_id`. Frontend: `app/api/router.py:74` возвращает `chat_id_known: bool` в /me; `OnboardingScreen.tsx:42-58` поллит /me каждые 2с (макс 30с); при `chat_id_known=true` секция 1 переключается в «Бот подключён» (line 106) с символом `✓` через `SectionCard.done` prop (`SectionCard.tsx:20-23`). UI-формулировка «Бот подключён» + ✓ checkmark семантически эквивалентна roadmap-формулировке «✓ Привязано». |
| 3 | После onboarding: создан первый `budget_period` с `starting_balance`, в БД 14 seed-категорий, активный период покрывает текущую дату согласно cycle_start_day | ✓ VERIFIED (code) | `app/services/onboarding.py:61-122` атомарно (через get_db transaction): (1) проверяет `user.onboarded_at IS NULL`, (2) seed_default_categories → `app/services/categories.py:123-145` создаёт `SEED_CATEGORIES` (точно 14 элементов: 12 expense + 2 income — verified by `grep -c "^    ("` = 14), (3) `create_first_period` → `app/services/periods.py:35-60` вычисляет `period_for(today_msk, cycle_start_day)` через APP_TZ='Europe/Moscow' и создаёт `BudgetPeriod(status=active, starting_balance_cents=...)`, (4) `user.cycle_start_day = ..., user.onboarded_at = now(utc)`. period_for тест inline: для сегодня (2026-05-02) и csd=5 возвращает `(2026-04-05, 2026-05-04)` — содержит сегодня ✓. Тест `tests/test_categories.py:185-198 test_seed_creates_14_categories` явно проверяет COUNT=14. |
| 4 | Categories CRUD; архив скрывается из выбора, виден через include_archived | ✓ VERIFIED (code) | Service: `app/services/categories.py` — `list_categories(include_archived=False)` (line 50-62) WHERE is_archived=False по умолчанию; `archive_category` (line 114-120) делает soft-archive `is_archived=True`; `update_category` (line 99-111) поддерживает unarchive через `is_archived=False`. Routes: `app/api/routes/categories.py` — GET `?include_archived=<bool>` (line 27-37), POST (line 41-52), PATCH (line 56-72), DELETE → soft-archive (line 76-93). Frontend: `CategoriesScreen.tsx:124-131` toggle «Показать архивные» переключает `useCategories(includeArchived)` → пере-fetch с query-param. `CategoryRow.tsx:49-52` window.confirm перед архивированием. Тесты: `test_archive_hides_from_default_list` (line 128-142) и `test_include_archived_returns_archived` (line 146-162). |
| 5 | Settings: cycle_start_day editable (1..28); меняется только для будущих периодов (текущий не пересчитывается) | ✓ VERIFIED (code) | Service: `app/services/settings.py:49-67 update_cycle_start_day` — обновляет ТОЛЬКО `app_user.cycle_start_day`. Модуль НЕ импортирует `BudgetPeriod` (verified by grep: imports = `[sqlalchemy.select, AsyncSession, AppUser]` — никакого BudgetPeriod). Schema: `SettingsUpdate.cycle_start_day: int = Field(ge=1, le=28)` (`app/api/schemas/settings.py:22`) → out-of-range = 422 до сервиса. Route: `app/api/routes/settings.py:40-64` — тонкий handler. Frontend: `SettingsScreen.tsx:96-99` дисклеймер «Изменение применится со следующего периода. Текущий период продолжается с тем же днём начала.»; `Stepper(min=1, max=28)` (line 95). Критический тест: `tests/test_settings.py:100-128 test_patch_does_not_recompute_existing_period` — onboarding с csd=5 → PATCH csd=10 → period_start/period_end в /periods/current не изменились. |

**Score:** 5/5 truths verified at code level.

---

### Required Artifacts (Three-level check)

| Artifact | Expected | Exists | Substantive | Wired | Data Flows | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `app/core/period.py` | period_for(date, cycle_start_day) → tuple[date, date] | ✓ | ✓ (74 LOC, dateutil-based, _clamp_day_to_month helper) | ✓ (импорт в `services/periods.py:9`) | ✓ (inline run: 6/6 cases corrects) | ✓ VERIFIED |
| `app/services/categories.py` | CRUD + soft-archive + 14 seed | ✓ | ✓ (146 LOC, 6 async funcs + SEED_CATEGORIES + CategoryNotFoundError) | ✓ (used by `routes/categories.py` + `services/onboarding.py`) | ✓ (DB CRUD via SQLAlchemy) | ✓ VERIFIED |
| `app/services/periods.py` | create_first_period + get_current_active_period | ✓ | ✓ (60 LOC) | ✓ (used by `routes/periods.py` + `services/onboarding.py`) | ✓ (period_for + Europe/Moscow today) | ✓ VERIFIED |
| `app/services/settings.py` | get/update_cycle_start_day, no BudgetPeriod import | ✓ | ✓ (68 LOC, AST-verified no BudgetPeriod) | ✓ (used by `routes/settings.py`) | ✓ (writes app_user.cycle_start_day только) | ✓ VERIFIED |
| `app/services/telegram.py` | bind_chat_id via PG UPSERT | ✓ | ✓ (37 LOC, on_conflict_do_update) | ✓ (used by `routes/internal_telegram.py`) | ✓ (UPSERT idempotent) | ✓ VERIFIED |
| `app/services/onboarding.py` | atomic 4-step orchestration | ✓ | ✓ (123 LOC, AlreadyOnboardedError + OnboardingUserNotFoundError) | ✓ (used by `routes/onboarding.py`) | ✓ (transaction-per-request via get_db) | ✓ VERIFIED |
| `app/api/routes/categories.py` | GET/POST/PATCH/DELETE с include_archived | ✓ | ✓ (94 LOC, 4 handlers) | ✓ (registered in `app/api/router.py:80`) | ✓ (CategoryNotFoundError → 404) | ✓ VERIFIED |
| `app/api/routes/periods.py` | GET /periods/current → 200/404 | ✓ | ✓ (39 LOC) | ✓ (registered in `app/api/router.py:81`) | ✓ | ✓ VERIFIED |
| `app/api/routes/onboarding.py` | POST /onboarding/complete → 200/404/409/422 | ✓ | ✓ (75 LOC, 3 exception mappings) | ✓ (registered in `app/api/router.py:82`) | ✓ | ✓ VERIFIED |
| `app/api/routes/settings.py` | GET/PATCH /settings | ✓ | ✓ (65 LOC) | ✓ (registered in `app/api/router.py:83`) | ✓ | ✓ VERIFIED |
| `app/api/routes/internal_telegram.py` | POST /chat-bind, наследует verify_internal_token | ✓ | ✓ (56 LOC, no own dep) | ✓ (registered in `app/api/router.py:102`, mounted под internal_router) | ✓ | ✓ VERIFIED |
| `main_bot.py` | aiogram + dp.include_router(handlers.router) + healthz:8001 | ✓ | ✓ (69 LOC) | ✓ (Phase 1 stub удалён, см. commit `3bae5a1`) | ✓ | ✓ VERIFIED |
| `app/bot/handlers.py` | /start handler — OWNER gate + chat-bind + WebAppInfo | ✓ | ✓ (103 LOC, tri-state greeting) | ✓ (импорт в main_bot.py:23) | ✓ (вызывает api_client.bind_chat_id) | ✓ VERIFIED |
| `app/bot/api_client.py` | bind_chat_id с httpx + X-Internal-Token + 5s timeout | ✓ | ✓ (69 LOC, InternalApiError wrapping) | ✓ (импорт в handlers.py:32) | ✓ (POST /api/v1/internal/telegram/chat-bind) | ✓ VERIFIED |
| `frontend/src/screens/OnboardingScreen.tsx` | 4 SectionCard sections (sketch 006-B) + MainButton + chat-bind polling | ✓ | ✓ (170 LOC, 4 SectionCards, parseRubles, polling) | ✓ (импорт в App.tsx:3) | ✓ (apiFetch /onboarding/complete с initData header) | ✓ VERIFIED |
| `frontend/src/screens/HomeScreen.tsx` | placeholder (Phase 5 deferral) + nav buttons | ✓ | ✓ (37 LOC, intentional stub per Phase 5) | ✓ (импорт в App.tsx:4) | n/a (placeholder) | ✓ VERIFIED (intentional stub) |
| `frontend/src/screens/CategoriesScreen.tsx` | full CRUD UI (sketch 005-B) | ✓ | ✓ (135 LOC, group-by-kind, mutationError, includeArchived) | ✓ (импорт в App.tsx:5) | ✓ (api/categories.ts → apiFetch) | ✓ VERIFIED |
| `frontend/src/screens/SettingsScreen.tsx` | Stepper + dirty-tracking MainButton + SET-01 disclaimer | ✓ | ✓ (113 LOC) | ✓ (импорт в App.tsx:6) | ✓ (api/settings.ts → apiFetch) | ✓ VERIFIED |
| `frontend/src/api/client.ts` | apiFetch + X-Telegram-Init-Data injection | ✓ | ✓ (120 LOC, 3-strategy initData read) | ✓ (импорт во всех api/* и hooks/*) | ✓ (header injected per request) | ✓ VERIFIED |

---

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| OnboardingScreen → /api/v1/onboarding/complete | apiFetch + X-Telegram-Init-Data | POST с body{starting_balance_cents, cycle_start_day, seed_default_categories} | ✓ WIRED | `OnboardingScreen.tsx:74-77` → `client.ts:77-95` injects header → backend `routes/onboarding.py:55-72` |
| OnboardingScreen polling → /api/v1/me | apiFetch | useUser refetch() каждые 2с | ✓ WIRED | `OnboardingScreen.tsx:42-58` setInterval → `useUser.ts:17-28 refetch()` → `apiFetch('/me')` → backend `router.py:48-75 get_me` (chat_id_known returned) |
| CategoriesScreen → /api/v1/categories | apiFetch + include_archived query | GET/POST/PATCH/DELETE | ✓ WIRED | `api/categories.ts:10-52` → backend `routes/categories.py` 4 endpoints |
| SettingsScreen → /api/v1/settings | apiFetch | GET + PATCH | ✓ WIRED | `api/settings.ts:10-26` → backend `routes/settings.py:24-64` |
| bot /start → /api/v1/internal/telegram/chat-bind | httpx + X-Internal-Token | POST {tg_user_id, tg_chat_id} | ✓ WIRED | `app/bot/handlers.py:68 bind_chat_id` → `api_client.py:54 client.post(url_path)` с X-Internal-Token → backend `routes/internal_telegram.py:50 telegram_svc.bind_chat_id` → service UPSERT |
| onboarding service → period engine | period_for(today_msk, cycle_start_day) | direct python call в create_first_period | ✓ WIRED | `services/onboarding.py:107 create_first_period` → `services/periods.py:50 period_for(today, cycle_start_day)` |
| onboarding service → category seed | atomic step 2 | direct call | ✓ WIRED | `services/onboarding.py:103-104 cat_svc.seed_default_categories(db)` |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| OnboardingScreen | user.chat_id_known | useUser → apiFetch('/me') → router.get_me | ✓ (вычисляется из user.tg_chat_id IS NOT NULL) | ✓ FLOWING |
| CategoriesScreen | categories[] | useCategories → listCategories → apiFetch('/categories') → service list_categories → DB SELECT | ✓ (real DB query через SQLAlchemy) | ✓ FLOWING |
| SettingsScreen | current cycle_start_day | getSettings → apiFetch('/settings') → service get_cycle_start_day → DB SELECT app_user | ✓ (real DB query) | ✓ FLOWING |
| bot /start | tg_chat_id | message.chat.id из aiogram Message | ✓ (Telegram-provided) | ✓ FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| period_for() pure function для всех HLD §3 cases | inline `python3 -c "from app.core.period import period_for; ..."` (6 кейсов: HLD examples, leap-year csd=31, year rollover, corrected case) | 6/6 PASS, все периоды содержат d | ✓ PASS |
| Frontend TS type-check | `cd frontend && npx tsc --noEmit` | exit=0, zero output | ✓ PASS |
| Python syntax (всех новых модулей) | `python3 -c "import ast; ast.parse(...)"` × 6 service files + 5 route files | все файлы syntactically valid | ✓ PASS |
| SEED_CATEGORIES has 14 entries | `grep -c "^    (" app/services/categories.py` | 14 | ✓ PASS |
| settings service не импортирует BudgetPeriod | `grep -c "BudgetPeriod" app/services/settings.py` | 0 | ✓ PASS |
| Backend test suite full run (uv run pytest) | requires uv + Postgres (per env_note: not available in worktree) | unable to run locally | ? SKIP (deferred per env_note — trust SUMMARY) |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| CAT-01 | 02-02..04, 02-07 | CRUD категорий через REST API + UI (kind, name, sort_order) | ✓ SATISFIED | `app/api/routes/categories.py` 4 endpoints + `frontend/CategoriesScreen.tsx` + `api/categories.ts` (4 functions) |
| CAT-02 | 02-02..04, 02-07 | Мягкая архивация — is_archived=true скрывает из выбора | ✓ SATISFIED | `services/categories.py:50-62 list_categories(include_archived=False)` + `archive_category` + frontend toggle |
| CAT-03 | 02-02..04 | Дефолтный seed-набор 14 категорий | ✓ SATISFIED | `services/categories.py:17-34 SEED_CATEGORIES` (12 expense + 2 income) + `seed_default_categories` idempotent |
| PER-01 | 02-02..04 | Период определяется глобальной cycle_start_day (1..28, default=5) | ✓ SATISFIED | `app/core/period.py period_for` + `AppUser.cycle_start_day default=5` (db/models.py:75) + Pydantic Field(ge=1, le=28) |
| PER-02 | 02-03..04 | При onboarding пользователь вводит starting_balance для первого периода | ✓ SATISFIED | `services/onboarding.py:107` → `services/periods.py:35-60 create_first_period(starting_balance_cents, cycle_start_day)` |
| PER-03 | 02-03..04 | Каждый последующий период наследует starting_balance = ending_balance предыдущего | ⚠ DEFERRED | Phase 5 worker job close_period (PER-04 + PER-03 implementation). В Phase 2 только первый период; функция-кандидат `create_first_period` готова к re-use по архитектуре сервиса. |
| PER-05 | 02-03..04 | При создании нового периода развёртывается PlanTemplate (idempotent) | ⚠ DEFERRED | Зависит от PlanTemplate (Phase 3 TPL-01..04). В Phase 2 нет PlanTemplate, поэтому требование вакуумно — никакой template не существует для развёртки. Будет реализовано в Phase 3 + Phase 5 worker. |
| ONB-01 | 02-06 | Onboarding-экран — single-page scrollable с нумерованными секциями | ✓ SATISFIED | `OnboardingScreen.tsx` 4 SectionCards с number={1..4}, scrollable layout, MainButton enabled только при валидности |
| ONB-02 | 02-06 | Если chat_id неизвестен — секция bot bind активна с openTelegramLink | ✓ SATISFIED | `OnboardingScreen.tsx:60-62 handleOpenBot` → `openTelegramLink('https://t.me/${BOT_USERNAME}?start=onboard')` (`client.ts:103-119`) |
| ONB-03 | 02-04..05 | Бот при /start сохраняет tg_chat_id | ✓ SATISFIED | `app/bot/handlers.py:67-72 cmd_start` → `bind_chat_id` → `services/telegram.py:29-37` PG UPSERT |
| SET-01 | 02-02..04, 02-07 | Настройка cycle_start_day через UI, применяется только к будущим периодам | ✓ SATISFIED | `services/settings.py update_cycle_start_day` (без BudgetPeriod import) + `SettingsScreen.tsx:96-99` дисклеймер + критический тест `test_patch_does_not_recompute_existing_period` |

**Phase 2 satisfaction:** 9/11 requirements satisfied at code level; 2 requirements (PER-03, PER-05) explicitly deferred to Phase 3/5 per architectural plan (модели существуют в `db/models.py`, но Phase 2 scope per CONTEXT.md §Phase Boundary не включает worker `close_period` (PER-04) и PlanTemplate (TPL-*)).

**Note on PER-03/PER-05 deferral:** ROADMAP.md § Phase 2 Success Criteria НЕ упоминают PER-03/PER-05 на уровне поведения — только PER-01/02 (первый период со starting_balance). REQUIREMENTS.md mapping placed PER-03/PER-05 в Phase 2 как «архитектурно подходящих», но реальное end-to-end поведение требует Phase 5 worker (PER-04). Это рассогласование в REQUIREMENTS.md, не в коде Phase 2. **Не блокер для Phase 2 goal achievement** — roadmap success criteria все 5 покрыты.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `frontend/src/screens/HomeScreen.tsx` | 13-14 | "Дашборд будет в Phase 5" placeholder | ℹ️ Info | Намеренный stub из 02-06-SUMMARY § Known Stubs; будет заменён в Phase 5 (DSH-*). Не влияет на Phase 2 goal. |
| `frontend/src/screens/OnboardingScreen.tsx` | 126 | placeholder="0" | ℹ️ Info | HTML input attribute (UX hint), НЕ stub. |
| `app/services/onboarding.py` | 116 | `await db.flush()` без явного commit | ℹ️ Info | Commit owner — `get_db` dependency на успешном handler exit; явно документировано в docstring. Не stub. |

**No blocker or warning anti-patterns found.**

---

### Human Verification Required

См. `human_verification` в frontmatter. Критические manual-steps:

1. **End-to-end onboarding в Telegram** — отрисовка 4 секций, polling /me после /start, MainButton lifecycle, переход на HomeScreen.
2. **DB-проверка после onboarding** — `app_user.onboarded_at`, `tg_chat_id`, COUNT(category)=14, ровно 1 active period с правильными bounds.
3. **Categories CRUD** — create / inline-rename / archive (window.confirm) / toggle / unarchive.
4. **Settings cycle_start_day + SET-01 boundary** — смена через Stepper, MainButton lifecycle, SQL-проверка что budget_period НЕ пересчитан.
5. **Bot /start** — реальный Telegram + BOT_TOKEN, проверка tg_chat_id и WebApp кнопки; включая non-OWNER reject и deep-link payload `?start=onboard`.

Per `<environment_note>` в задаче пользователя: «Manual UI walkthroughs deferred to user». Code-level verification полностью пройдена; manual verification оставлена пользователю для финального подтверждения.

---

### Gaps Summary

**Нет блокирующих gap'ов на code-level.** Все 5 roadmap success criteria, 9 из 11 requirements, и все ключевые wirings (frontend → API → service → DB; bot → internal API → service → DB) имплементированы и связаны:

- Onboarding atomic 4-step orchestration с rollback на любую ошибку (test `tests/test_onboarding.py::test_repeat_complete_returns_409` фиксирует D-10 idempotency).
- Period engine pure function с 9 параметризованными HLD §3 кейсами (corrected test case в commit `45cb0a0`); inline runner подтвердил 6/6 cases на момент верификации.
- 14 seed categories точно соответствуют D-16 спецификации (`grep -c "^    ("` = 14).
- SET-01/D-17 boundary защищён AST-verified отсутствием `BudgetPeriod` импорта в `app/services/settings.py` + критический тест `test_patch_does_not_recompute_existing_period`.
- Bot ↔ API integration через `httpx + X-Internal-Token` с graceful degradation (InternalApiError + tri-state greeting).
- Frontend wiring: 3-strategy initData injection + ApiError класс с status field для 409 idempotent UX.

**Test execution state:** Все DB-backed integration тесты используют `pytest.skip` self-skip pattern когда `DATABASE_URL` не задан. Per environment_note задачи пользователя: «environment uses uv + Python 3.12 (as in Dockerfile). Local pytest invocations using system Python 3.9 fail due to PEP 604 syntax in models — environment, not code. Trust SUMMARY.md test reports.» SUMMARY-файлы документируют RED→GREEN cycle с inline-валидацией period_for и schema validation.

**Deferred items (НЕ gap):**
- PER-03 (next period inherits ending_balance) — требует Phase 5 worker `close_period`.
- PER-05 (apply PlanTemplate on new period) — требует Phase 3 PlanTemplate + Phase 5 worker.
- HomeScreen full dashboard — Phase 5 (DSH-*).
- Frontend test framework (Vitest + RTL) — рекомендуется в отдельный infra plan, документировано в 02-07-SUMMARY § TDD Gate Compliance.

**Status decision rationale:** All 5 roadmap success criteria are VERIFIED at code level (5/5 score). However, 5 manual UI verification items are documented (real Telegram client, BOT_TOKEN, docker-compose stack, SQL DB-проверки after onboarding/settings change). Per Step 9 decision tree: human verification items present → status MUST be `human_needed`, not `passed`.

---

_Verified: 2026-05-02_
_Verifier: Claude (gsd-verifier, Opus 4.7 1M)_
