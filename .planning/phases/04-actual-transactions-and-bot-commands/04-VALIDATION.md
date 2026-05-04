---
phase: 4
slug: actual-transactions-and-bot-commands
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-02
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.4.2 + pytest-asyncio 1.2.0 (carry-over from Phase 1-3) |
| **Config file** | `pyproject.toml [tool.pytest.ini_options]` (asyncio_mode=auto уже сконфигурирован) |
| **Quick run command** | `uv run pytest tests/test_actual_crud.py tests/test_actual_period.py tests/test_balance.py tests/test_bot_parsers.py -x -q` |
| **Full Phase 4 suite** | `uv run pytest tests/test_actual_crud.py tests/test_actual_period.py tests/test_balance.py tests/test_internal_bot.py tests/test_bot_parsers.py tests/test_bot_handlers_phase4.py -x -q` |
| **Full project suite** | `uv run pytest tests/ -v` |
| **DB-backed integration tests** | требуют `DATABASE_URL` указывающий на тестовый Postgres (см. Phase 2/3 conftest pattern). Локально: `docker compose up -d db` + `DATABASE_URL=postgresql+asyncpg://budget:budget@localhost:5432/budget_test`. Без БД — DB-тесты skip-ятся через `_require_db` self-skip pattern (`tests/test_categories.py:19-21`) |
| **Bot handler tests** | мокают httpx через `respx` (https://lundberg.github.io/respx/) ИЛИ ручной monkeypatch на `app.bot.api_client.bot_create_actual` etc. Предпочитаем monkeypatch — без новой зависимости |
| **Frontend tests** | None automated в Phase 4 (D-70 carryover D-44 Phase 3). Verification — через checkpoint:human-verify |
| **Estimated runtime** | unit ~5s; full Phase 4 (incl. DB) ~30-90s |

---

## Sampling Rate

- **After every backend task commit:** Run quick suite (~5s) — quick smoke на schemas/services
- **After every plan wave:** Run full Phase 4 suite — все tests зелёные
- **After bot plans:** `uv run pytest tests/test_bot_*.py -x -v` — bot-specific suite
- **After frontend plans:** Manual checkpoint:human-verify (см. 04-UI-SPEC.md «Acceptance»)
- **Before `/gsd-verify-work`:** Full project suite зелёный + manual UI walkthrough пройден
- **Max feedback latency:** 30 секунд для unit/integration; UI checks — manual

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 4-W0-01 | 04-01 | 0 | (test stubs) | — | RED tests created | unit | `uv run pytest tests/test_actual_crud.py tests/test_actual_period.py tests/test_balance.py tests/test_internal_bot.py tests/test_bot_parsers.py tests/test_bot_handlers_phase4.py -x --collect-only` (collects, fails on import = RED) | ❌ W0 | ⬜ pending |
| 4-svc-actual-01 | 04-02 | 1 | ACT-01, ACT-02 | T-archived-cat, T-kind-mismatch | actual CRUD + period auto-resolve | integration | `uv run pytest tests/test_actual_crud.py tests/test_actual_period.py -x -q` | ❌ W0 | ⬜ pending |
| 4-svc-actual-02 | 04-02 | 1 | ACT-05 | T-tx-future | PATCH tx_date пересчитывает period_id; future-date 400 | integration | `uv run pytest tests/test_actual_period.py::test_patch_recomputes tests/test_actual_period.py::test_future_date_400 -x -q` | ❌ W0 | ⬜ pending |
| 4-svc-balance-01 | 04-02 | 1 | ACT-04 (`/balance` data) | T-amount-overflow | compute_balance per category + total + sign rule D-02 | integration | `uv run pytest tests/test_balance.py -x -q` | ❌ W0 | ⬜ pending |
| 4-svc-internal-01 | 04-02 | 1 | ACT-03, ACT-05 (disambiguation) | T-internal-spoof | dispatcher: query 1→created, ≥2→ambiguous, 0→not_found, explicit category_id minнает disambiguation | integration | `uv run pytest tests/test_internal_bot.py::test_create_via_query tests/test_internal_bot.py::test_ambiguous_status -x -q` | ❌ W0 | ⬜ pending |
| 4-routes-public-01 | 04-03 | 2 | ACT-01, ACT-02, ACT-04, ACT-05 | T-auth-bypass | actual_router `/actual` + `/periods/{id}/actual` + `/actual/balance` под Depends(get_current_user) | integration | `uv run pytest tests/test_actual_crud.py tests/test_actual_period.py tests/test_balance.py -x` | depends on Wave 1 | ⬜ pending |
| 4-routes-internal-01 | 04-03 | 2 | ACT-03, ACT-04 | T-internal-spoof | internal_bot_router монтируется под internal_router; X-Internal-Token обязателен | integration | `uv run pytest tests/test_internal_bot.py -x` | depends on Wave 1 | ⬜ pending |
| 4-bot-parsers-01 | 04-04 | 3 | ACT-03 | T-amount-zero, T-overflow | parse_amount форматы + parse_add_command split | unit | `uv run pytest tests/test_bot_parsers.py -x -q` | ❌ W0 | ⬜ pending |
| 4-bot-handlers-01 | 04-04 | 3 | ACT-03, ACT-04, ACT-05 | T-non-owner-spam, T-callback-tampering | cmd_add/income/balance/today/app + disambiguation callback flow | integration (mocked api) | `uv run pytest tests/test_bot_handlers_phase4.py -x -q` | ❌ W0 | ⬜ pending |
| 4-fe-editor-01 | 04-05 | 3 | ACT-01 | — | ActualEditor form + ActualScreen list + apiClient + types | manual | checkpoint:human-verify (см. UI-SPEC §Acceptance.1) | manual | ⬜ pending |
| 4-fe-screen-01 | 04-06 | 3 | ACT-01 | — | ActualScreen + HomeScreen FAB + nav «Факт» | manual | checkpoint:human-verify (см. UI-SPEC §Acceptance.2) | manual | ⬜ pending |
| 4-final-01 | 04-07 | 4 | (integration) | — | E2E: open Mini App → tap FAB → save → bot /add → bot /balance → /today | manual | checkpoint:human-verify (см. UI-SPEC §Acceptance.3) | manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements (RED test stubs — Plan 04-01)

- [ ] `tests/test_actual_crud.py` — POST/PATCH/DELETE /actual + GET /periods/{id}/actual + filter (kind/category) + auth 403 + Pydantic 422 (amount<=0, description>500) + archived-cat 400 + kind-mismatch 400
- [ ] `tests/test_actual_period.py` — ACT-02 period_id вычислен из tx_date + cycle_start_day; ACT-05 PATCH с новым tx_date пересчитывает period_id; автосоздание исторического периода (D-52); future-date 400 (D-58)
- [ ] `tests/test_balance.py` — `GET /actual/balance` вычисляет per-category planned/actual/delta + total + balance_now (starting + act_inc - act_exp); пустой период → нули; D-02 sign rule (expense=plan-act, income=act-plan)
- [ ] `tests/test_internal_bot.py` — `POST /internal/bot/actual` (created/ambiguous/not_found ветки), `POST /internal/bot/balance`, `POST /internal/bot/today`; X-Internal-Token обязателен (без → 403); category_query ИЛИ category_id (model_validator)
- [ ] `tests/test_bot_parsers.py` — unit `parse_amount`: '1500' → 150000, '1500.50' → 150050, '1 500' → 150000, '1500р' → 150000, '1500₽' → 150000, '1500,50' → 150050, '0' → None, '-100' → None, 'abc' → None, '' → None, '1500.555' → None (3 decimals); unit `parse_add_command`: '/add 1500 продукты' → (150000, 'продукты', None), '/add 1500 продукты пятёрочка' → (150000, 'продукты', 'пятёрочка'), '/add 1500 кафе обед в столовой' → (150000, 'кафе', 'обед в столовой'), '/add' → None, '/add 1500' → None, '/add abc cat' → None
- [ ] `tests/test_bot_handlers_phase4.py` — мокаем `app.bot.api_client.bot_create_actual` etc.; cmd_add ОТ OWNER → создаёт + отвечает с подтверждением; cmd_add от не-OWNER → silent (нет message.answer вызова); cmd_add с невалидным форматом → отвечает usage; cmd_add с ambiguous response → строит inline-keyboard с N кнопок + сохраняет pending; cb_disambiguation с валидным token → re-call + answer; cb_disambiguation с истёкшим token → alert; cmd_balance/today/app — вызывают правильный internal endpoint и форматируют ответ

Все тестовые файлы пишутся against contracts (модули `app.services.actual`, `app.services.internal_bot`, `app.api.routes.actual`, `app.api.routes.internal_bot`, `app.bot.parsers`, `app.bot.disambiguation`, `app.bot.commands` ещё не существуют) → ImportError = ожидаемый RED.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| ActualScreen list рендеринг (group-by-date) | ACT-01 | UI-визуальная проверка | Открыть Mini App → Факт → проверить группировку «Сегодня / Вчера / N марта», свежие сверху |
| BottomSheet ActualEditor (открытие/закрытие, поля, validation) | ACT-01 | UI-flow + Telegram BackButton lifecycle (carryover D-40) | UI-SPEC §Acceptance.1 step 2-4 |
| Kind toggle сбрасывает категорию (если она другого kind) | ACT-01 | UI-flow | UI-SPEC §Acceptance.1 step 5 |
| FAB на HomeScreen открывает ActualEditor | ACT-01 | UI-flow | UI-SPEC §Acceptance.2 step 1 |
| FAB на ActualScreen → создание + появляется в списке | ACT-01, ACT-02 | UI-flow + period_id auto | UI-SPEC §Acceptance.2 step 2 |
| Edit existing actual → tx_date в новый период → сейв → строка пропадает из текущего periода (если ушла), либо остаётся | ACT-05 | UI behavior (cross-period move) | UI-SPEC §Acceptance.2 step 3 |
| Bot /add с однозначной категорией → подтверждение в чате | ACT-03 | bot↔api end-to-end | UI-SPEC §Acceptance.3 step 1 |
| Bot /add с неоднозначной категорией → inline-кнопки → выбор → подтверждение | ACT-05 | bot disambiguation flow | UI-SPEC §Acceptance.3 step 2 |
| Bot /balance возвращает форматированный текст с эмодзи (D-60) | ACT-04 | bot reply visual | UI-SPEC §Acceptance.3 step 3 |
| Bot /today возвращает список сегодняшних факт-трат (D-61) | ACT-04 | bot reply visual | UI-SPEC §Acceptance.3 step 4 |
| Bot /app — кнопка-ссылка открывает Mini App (D-62) | ACT-04 | bot reply visual | UI-SPEC §Acceptance.3 step 5 |
| E2E flow: Mini App add → bot /balance → новая трата отражается | ACT-01..05 | Multi-source consistency | UI-SPEC §Acceptance.4 (полный walkthrough) |

---

## Threat Test Coverage

| Threat ID | Tested by | Type |
|-----------|-----------|------|
| T-archived-cat | `test_actual_crud.py::test_create_with_archived_category_400` + `test_internal_bot.py::test_query_excludes_archived` | integration |
| T-kind-mismatch | `test_actual_crud.py::test_create_kind_mismatch_400` (POST kind='income' с expense category) | integration |
| T-tx-future | `test_actual_period.py::test_future_date_400` (tx_date = today + 30 дней → 400) | integration |
| T-internal-spoof | `test_internal_bot.py::test_no_internal_token_403` (POST без X-Internal-Token → 403) | integration |
| T-auth-bypass | `test_actual_crud.py::test_no_init_data_403` + `test_balance.py::test_no_init_data_403` (любой public endpoint без X-Telegram-Init-Data → 403) | integration |
| T-amount-zero | `test_actual_crud.py::test_amount_zero_422` + `test_bot_parsers.py::test_parse_amount_zero_returns_none` | integration + unit |
| T-amount-overflow | `test_bot_parsers.py::test_parse_amount_overflow_returns_none` (10^15 копеек → None) | unit |
| T-callback-tampering | `test_bot_handlers_phase4.py::test_cb_invalid_token_alerts` + `test_cb_invalid_format_silent` (callback_data с не-int category_id или неправильным префиксом → graceful answer без crash) | unit |
| T-non-owner-spam | `test_bot_handlers_phase4.py::test_cmd_add_non_owner_silent` (message.from_user.id != OWNER_TG_ID → return без message.answer) | unit |
| T-period-not-found | `test_balance.py::test_period_not_found_404` | integration |
| T-actual-not-found | `test_actual_crud.py::test_patch_not_found_404` + `test_delete_not_found_404` | integration |
| T-source-spoof | `test_actual_crud.py::test_source_always_mini_app` (POST с попыткой передать source='bot' игнорируется, возвращается 'mini_app') | integration |
| T-disambiguation-ttl | `test_bot_handlers_phase4.py::test_pop_pending_after_ttl_returns_none` (заглубляем `created_at` в past, проверяем None) | unit |
| T-overflow-cb-data | `test_bot_handlers_phase4.py::test_callback_data_format_within_64b` (длина "act:8hex:big_int" ≤ 64) | unit |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (frontend tasks → manual checkpoint, backend → pytest)
- [x] Sampling continuity: no 3 consecutive backend tasks без automated verify
- [x] Wave 0 covers all MISSING references (6 test files)
- [x] No watch-mode flags
- [x] Feedback latency < 30s для unit/integration
- [x] Frontend manual-verify documented в UI-SPEC
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** auto (will be reviewed in execution)
