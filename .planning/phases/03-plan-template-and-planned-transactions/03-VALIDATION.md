---
phase: 3
slug: plan-template-and-planned-transactions
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-02
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.4.2 + pytest-asyncio 1.2.0 (carry-over from Phase 1+2) |
| **Config file** | `pyproject.toml [tool.pytest.ini_options]` (asyncio_mode=auto уже сконфигурирован) |
| **Quick run command** | `uv run pytest tests/test_templates.py tests/test_planned.py -x -q` |
| **Full suite command** | `uv run pytest tests/ -v` |
| **DB-backed integration tests** | требуют `DATABASE_URL` указывающий на тестовый Postgres (см. Phase 2 conftest pattern). Локально: `docker compose up -d db` + `DATABASE_URL=postgresql+asyncpg://budget:budget@localhost:5432/budget_test`. Без БД — DB-тесты skip-ятся через self-skip pattern (`tests/test_categories.py:19-21`) |
| **Frontend tests** | None automated в Phase 3 (D-44 carryover D-22 Phase 2). Verification — через checkpoint:human-verify |
| **Estimated runtime** | unit ~5s; full suite (incl. DB) ~30-90s |

---

## Sampling Rate

- **After every backend task commit:** Run `uv run pytest tests/test_templates.py tests/test_planned.py -x -q` (~5s) — quick smoke
- **After every plan wave:** Run `uv run pytest tests/ -v` — полный suite зелёный
- **After frontend plans:** Manual checkpoint:human-verify (см. 03-UI-SPEC.md «Acceptance»)
- **Before `/gsd-verify-work`:** Full backend suite зелёный + manual UI walkthrough пройден
- **Max feedback latency:** 30 секунд для unit/integration; UI checks — manual

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 3-W0-01 | 03-01 | 0 | (test stubs) | — | RED tests created | unit | `uv run pytest tests/test_templates.py -x --collect-only` (collects, fails on import = RED) | ❌ W0 | ⬜ pending |
| 3-tpl-svc-01 | 03-02 | 1 | TPL-01, TPL-02 | T-archived-cat | List/create/update/delete + archived check | integration | `uv run pytest tests/test_templates.py::test_crud -x -q` | ❌ W0 | ⬜ pending |
| 3-pln-svc-01 | 03-02 | 1 | PLN-01, PLN-02 | T-kind-mismatch | CRUD planned + kind=category.kind enforcement | integration | `uv run pytest tests/test_planned.py::test_crud_manual -x -q` | ❌ W0 | ⬜ pending |
| 3-pln-svc-02 | 03-02 | 1 | PLN-03 | T-sub-readonly | subscription_auto rows reject update/delete (400) | integration | `uv run pytest tests/test_planned.py::test_subscription_auto_readonly -x -q` | ❌ W0 | ⬜ pending |
| 3-snap-svc-01 | 03-02 | 1 | TPL-03 | T-snapshot-pollution | Snapshot exclude subscription_auto + atomic overwrite | integration | `uv run pytest tests/test_snapshot.py -x -q` | ❌ W0 | ⬜ pending |
| 3-apply-svc-01 | 03-02 | 1 | TPL-04, PER-05 | T-apply-dupes | Idempotent: повторный вызов = 0 created | integration | `uv run pytest tests/test_apply_template.py -x -q` | ❌ W0 | ⬜ pending |
| 3-routes-01 | 03-03 | 2 | TPL-01..04, PLN-01..02 | T-auth-bypass | All `/api/v1/template/*` + `/api/v1/periods/{id}/planned*` + `/api/v1/planned/*` под `Depends(get_current_user)` | integration | `uv run pytest tests/test_templates.py tests/test_planned.py tests/test_apply_template.py tests/test_snapshot.py -x` | depends on Wave 1 | ⬜ pending |
| 3-fe-tpl-01 | 03-04 | 3 | TPL-02 | — | TemplateScreen group-by-kind + inline edit + BottomSheet | manual | checkpoint:human-verify (см. UI-SPEC §Acceptance.1) | manual | ⬜ pending |
| 3-fe-pln-01 | 03-05 | 3 | PLN-01, PLN-03 | — | PlannedScreen + apply-template button + 🔁 mock badge | manual | checkpoint:human-verify (см. UI-SPEC §Acceptance.2) | manual | ⬜ pending |
| 3-final-01 | 03-06 | 4 | (integration) | — | E2E: create template → apply → edit planned → snapshot back | manual | checkpoint:human-verify (см. UI-SPEC §Acceptance.3) | manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements (RED test stubs — Plan 03-01)

- [ ] `tests/test_templates.py` — CRUD template-items + filter, archived-category guard
- [ ] `tests/test_planned.py` — CRUD planned (manual) + kind=category.kind enforcement + subscription_auto read-only guard + filter by kind/category
- [ ] `tests/test_apply_template.py` — POST /periods/{id}/apply-template + idempotency (`created=0` на повторе) + empty-template handling + period-not-found
- [ ] `tests/test_snapshot.py` — POST /template/snapshot-from-period/{id} + destructive overwrite + exclude subscription_auto + period-not-found

Все тестовые файлы написаны against contracts (модули `app.services.templates`, `app.services.planned`, `app.api.routes.templates`, `app.api.routes.planned`, etc., которые ещё не существуют) → ImportError = ожидаемый RED.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| TemplateScreen group-by-kind layout (sketch 005-B) | TPL-02 | UI-визуальная проверка | Открыть Mini App → Шаблон → проверить группировку Расходы/Доходы, вложенные категории |
| Inline-edit amount (Enter сохраняет, Esc отменяет, ✓/× кнопки) | TPL-02 | UI-flow | UI-SPEC §Acceptance.1 step 3 |
| BottomSheet полный редактор (открытие/закрытие, поля, validation) | TPL-02, PLN-01 | UI-flow + Telegram BackButton lifecycle | UI-SPEC §Acceptance.1 step 4-5 |
| Apply-template UI: кнопка появляется только на пустом периоде | TPL-04 | UI condition | UI-SPEC §Acceptance.2 step 1-3 |
| Apply-template idempotency UX: повторное нажатие — кнопка скрыта | TPL-04 | UI verification | UI-SPEC §Acceptance.2 step 3 |
| Snapshot UI с window.confirm | TPL-03 | UI-flow | UI-SPEC §Acceptance.2 step 4 |
| PLN-03 «🔁 Подписка» badge на mock-строке | PLN-03 | Нет реальных subscription rows до Phase 6 | UI-SPEC §Acceptance.2 step 5: открыть DevTools console, инжектить mock через `window.__injectMockPlanned__({source: 'subscription_auto', ...})` (вспомогательная dev-helper функция, добавляется условно `import.meta.env.DEV`) |
| E2E flow: template → apply → edit planned → snapshot → applied changes visible in template | TPL-01..04, PLN-01 | Multi-step user journey | UI-SPEC §Acceptance.3 (полный walkthrough) |

---

## Threat Test Coverage

| Threat ID | Tested by | Type |
|-----------|-----------|------|
| T-archived-cat | `test_templates.py::test_create_with_archived_category_400` + `test_planned.py::test_create_with_archived_category_400` | integration |
| T-kind-mismatch | `test_planned.py::test_kind_mismatch_400` (передаём kind='income' для category.kind='expense') | integration |
| T-sub-readonly | `test_planned.py::test_update_subscription_auto_400` + `test_planned.py::test_delete_subscription_auto_400` | integration |
| T-snapshot-pollution | `test_snapshot.py::test_excludes_subscription_auto` (создаём mock subscription_auto row, snapshot, проверяем что её нет в template) | integration |
| T-apply-dupes | `test_apply_template.py::test_idempotent_returns_existing` (apply дважды, проверяем `created=0` на втором + total count == template_count) | integration |
| T-auth-bypass | `test_templates.py::test_no_init_data_403` + `test_planned.py::test_no_init_data_403` (любой endpoint без X-Telegram-Init-Data → 403) | integration |
| T-period-not-found | `test_apply_template.py::test_period_not_found_404` + `test_snapshot.py::test_period_not_found_404` | integration |
| T-amount-zero | `test_templates.py::test_amount_zero_422` + `test_planned.py::test_amount_negative_422` (Pydantic gt=0) | integration |
| T-day-of-period-out-of-range | `test_templates.py::test_day_of_period_32_422` (Pydantic le=31) | integration |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (frontend tasks → manual checkpoint, backend → pytest)
- [x] Sampling continuity: no 3 consecutive backend tasks без automated verify
- [x] Wave 0 covers all MISSING references (4 test files)
- [x] No watch-mode flags
- [x] Feedback latency < 30s для unit/integration
- [x] Frontend manual-verify documented в UI-SPEC
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** auto (will be reviewed in execution)
