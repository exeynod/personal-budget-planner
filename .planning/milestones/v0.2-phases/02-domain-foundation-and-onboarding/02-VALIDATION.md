---
phase: 2
slug: domain-foundation-and-onboarding
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-02
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.4.2 + pytest-asyncio 1.2.0 (carry-over from Phase 1) |
| **Config file** | `pyproject.toml [tool.pytest.ini_options]` (asyncio_mode=auto уже сконфигурирован) |
| **Quick run command** | `uv run pytest tests/test_period_engine.py tests/test_categories.py -x -q` |
| **Full suite command** | `uv run pytest tests/ -v` |
| **DB-backed integration tests** | требуют `DATABASE_URL` указывающий на тестовый Postgres. Локально: `docker compose up -d db` + `DATABASE_URL=postgresql+asyncpg://budget:budget@localhost:5432/budget_test`. Без БД — DB-тесты skip-ятся через self-skip pattern (как в `test_migrations.py`) |
| **Frontend tests** | None automated в Phase 2 (D-22). Verification — через checkpoint:human-verify |
| **Estimated runtime** | unit ~5s; full suite (incl. DB) ~30-60s |

---

## Sampling Rate

- **After every backend task commit:** Run `uv run pytest tests/test_period_engine.py tests/test_categories.py -x -q` (~5s) — quick smoke
- **After every plan wave:** Run `uv run pytest tests/ -v` — полный suite зелёный
- **After frontend plans:** Manual checkpoint:human-verify (см. 02-UI-SPEC.md «Acceptance»)
- **Before `/gsd-verify-work`:** Full backend suite зелёный + manual UI walkthrough пройден
- **Max feedback latency:** 30 секунд для unit/integration; UI checks — manual

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 2-W0-01 | 02-01 | 0 | (test stubs) | — | RED tests created | unit | `uv run pytest tests/test_period_engine.py -x --collect-only` (collects, fails on import = RED) | ❌ W0 | ⬜ pending |
| 2-period-01 | 02-02 | 1 | PER-01 | — | period_for pure function | unit | `uv run pytest tests/test_period_engine.py -x -q` | ❌ W0 | ⬜ pending |
| 2-cat-01 | 02-02 | 1 | CAT-01, CAT-02, CAT-03 | T-cat-archive | DELETE returns soft-archive; archived hidden from default list | integration | `uv run pytest tests/test_categories.py -x -q` | ❌ W0 | ⬜ pending |
| 2-set-01 | 02-03 | 1 | SET-01, PER-01 | T-cycle-validation | cycle_start_day ∈ [1,28], не пересчитывает прошлые периоды | integration | `uv run pytest tests/test_settings.py -x -q` | ❌ W0 | ⬜ pending |
| 2-onb-01 | 02-03 | 1 | ONB-01, PER-02, PER-03 | T-double-onboard | 409 Conflict при повторе; atomic transaction | integration | `uv run pytest tests/test_onboarding.py -x -q` | ❌ W0 | ⬜ pending |
| 2-per-01 | 02-03 | 1 | PER-02 | — | GET /periods/current возвращает активный после onboarding | integration | `uv run pytest tests/test_periods.py -x -q` | ❌ W0 | ⬜ pending |
| 2-route-01 | 02-04 | 2 | (route wiring) | T-internal-token | All `/api/v1/*` routes под Depends(get_current_user); `/internal/*` под verify_internal_token | integration | `uv run pytest tests/test_categories.py tests/test_settings.py tests/test_onboarding.py tests/test_periods.py -x` | depends on Wave 1 | ⬜ pending |
| 2-bot-01 | 02-05 | 2 | ONB-03 | T-chatbind-spoof | bot `/start` validates OWNER_TG_ID; chat-bind uses internal token | integration | `uv run pytest tests/test_telegram_chat_bind.py -x -q` | ❌ W0 | ⬜ pending |
| 2-fe-01 | 02-06 | 3 | ONB-01, ONB-02 | — | Onboarding scrollable + sections (sketch 006-B) | manual | checkpoint:human-verify (см. UI-SPEC §Acceptance.1) | manual | ⬜ pending |
| 2-fe-02 | 02-07 | 4 | CAT-01, CAT-02, SET-01 | — | Categories CRUD + Settings stepper | manual | checkpoint:human-verify (см. UI-SPEC §Acceptance.2-3) | manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements (RED test stubs — Plan 02-01)

- [ ] `tests/test_period_engine.py` — параметризованные unit-тесты для `period_for` (~9 кейсов)
- [ ] `tests/test_categories.py` — CRUD + soft-archive + seed (idempotent)
- [ ] `tests/test_periods.py` — GET /periods/current after onboarding
- [ ] `tests/test_onboarding.py` — POST /onboarding/complete + 409 on repeat + atomicity
- [ ] `tests/test_settings.py` — GET/PATCH /settings + 422 на cycle_start_day < 1 / > 28
- [ ] `tests/test_telegram_chat_bind.py` — POST /internal/telegram/chat-bind upsert + 403 без X-Internal-Token

Все тестовые файлы написаны against contracts (модули `app.services.*`, `app.api.routes.*`, etc., которые ещё не существуют) → ImportError = ожидаемый RED.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Onboarding scrollable layout с 4 секциями | ONB-01 | UI-визуальная проверка | Открыть Mini App в Telegram → проверить layout vs sketch 006-B |
| Bot bind UX: openTelegramLink → /start → возврат в Mini App | ONB-02, ONB-03 | Требует реальный Telegram | Walk-through из UI-SPEC §Acceptance.1 (steps 1-4) |
| Telegram MainButton enable/disable по валидности | ONB-01 | Требует Telegram WebApp environment | Walk-through из UI-SPEC §Acceptance.1 + UI-SPEC §Edge |
| Categories inline edit/archive UX | CAT-01, CAT-02 | UI-flow | UI-SPEC §Acceptance.2 |
| Settings cycle_start_day update + дисклеймер | SET-01 | UI-flow + tooltip | UI-SPEC §Acceptance.3 |
| Persistence через перезагрузку Mini App | ONB-01 | Lifecycle test | UI-SPEC §Acceptance.1 step «Перезагружаем Mini App» |

---

## Threat Test Coverage

| Threat ID | Tested by | Type |
|-----------|-----------|------|
| T-cat-archive | `test_categories.py::test_archive_hides_from_default_list` + `::test_include_archived_returns_archived` | integration |
| T-cycle-validation | `test_settings.py::test_invalid_cycle_day_400` (для 0, 29, -1) | integration |
| T-double-onboard | `test_onboarding.py::test_repeat_complete_returns_409` | integration |
| T-internal-token | `test_telegram_chat_bind.py::test_without_internal_token_403` | integration |
| T-chatbind-spoof | `test_telegram_chat_bind.py::test_non_owner_tg_user_id_handled` | integration |
| T-onboarding-atomicity | `test_onboarding.py::test_failure_rollback_no_categories_no_period` | integration (использует mock, чтобы вызвать exception в середине) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive backend tasks без automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s для unit/integration
- [ ] Frontend manual-verify documented в UI-SPEC
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** auto (will be reviewed in execution)
