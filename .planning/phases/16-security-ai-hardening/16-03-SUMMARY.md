---
phase: 16-security-ai-hardening
plan: 03
subsystem: ai
tags: [pydantic, openai, tool-calling, data-integrity, finance, validation]

# Dependency graph
requires:
  - phase: 09-ai
    provides: propose_actual_transaction / propose_planned_transaction tool surface
provides:
  - Backend rejection of non-positive amount_rub in both AI proposal-tools
  - Pytest regression suite for AI-01 (negative / zero / round-down-to-zero / valid amounts)
affects: [16-04-ai-02-tool-args-validation, post-v0.5-ui-mirror-validation]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Post-parse positive-check guard for finance-relevant tool args"]

key-files:
  created:
    - tests/ai/test_tools_amount_validation.py
  modified:
    - app/ai/tools.py

key-decisions:
  - "D-16-04: positive-check сразу после try/except парсинга — минимальный диф, без новых зависимостей"
  - "Семантика edge-кейса 0.001 rub: round() → 0 cents → отвергается тем же positive-check (data-integrity invariant)"
  - "Сохранён существующий error-message для unparseable input ('Не удалось распознать сумму') — не объединяем с positive-check"

patterns-established:
  - "Финансовые tool-output поля валидируются ДО формирования _proposal payload (defence-in-depth поверх Pydantic gt=0 на POST /actual / /planned)"

requirements-completed: [AI-01]

# Metrics
duration: 3min
completed: 2026-05-07
---

# Phase 16 Plan 03: AI-01 Amount Positive Summary

**Backend rejection of non-positive `amount_rub` in `propose_actual_transaction` + `propose_planned_transaction` with 17-test pytest regression**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-07T17:39:32Z
- **Completed:** 2026-05-07T17:42:09Z
- **Tasks:** 2
- **Files modified:** 1 (modified) + 1 (created) = 2 total

## Accomplishments
- Closed AI-01 (HIGH data-integrity boundary): LLM-controllable `amount_rub` ≤ 0 больше не создаёт ProposalPayload с отрицательным `amount_cents`.
- Минимальный диф (D-16-04): по 2 строки на функцию (`if amount_cents <= 0: return {"error": "Сумма должна быть > 0"}`) сразу после try/except парсинга `amount_cents`.
- Покрыли pytest-регрессией все 4 семантически разные ветки:
  1. negative → reject (`-1`, `-100`, `-100.5`)
  2. zero → reject (`0`, `0.0`)
  3. round-down-to-zero positive → reject (`0.001`, `0.004`)
  4. minimum positive → accept (`0.01` rub = 1 kopek)
  5. typical positive → accept (`500` rub = 50000 cents)
  6. unparseable → preserved existing branch (`"not-a-number"` → "Не удалось распознать сумму")

## Task Commits

Each task was committed atomically:

1. **Task 1: Validate amount_rub > 0 в обеих proposal-функциях** — `6d90390` (fix)
2. **Task 2: Pytest unit-тест на знак/ноль для proposal-tools** — `0f6f1fa` (test)

## Files Created/Modified

- `app/ai/tools.py` — добавлен positive-check `if amount_cents <= 0: return {"error": "Сумма должна быть > 0"}` сразу после `try/except` парсинга `amount_cents` в `propose_actual_transaction` (строки 401-402) и `propose_planned_transaction` (строки 466-467). 4 строки кода всего.
- `tests/ai/test_tools_amount_validation.py` — 17 unit-тестов, parametrized по 7 amount-значениям × 2 функции + 3 happy/edge cases.

## Decisions Made

- **Fixture choice:** Plan указывал `app_user_one`, но такой fixture в `tests/conftest.py` нет. Использован тот же helper-паттерн `_seed_user(db_session)` через `truncate_db` + `seed_user` из `tests/helpers/seed.py`, что и в существующем `tests/ai/test_tools.py`. Объект `AppUser` получается через `seed_user`, его `.id` передаётся как `user_id` в tool. Семантически идентично spec'у.
- **Edge case 0.001 rub:** реализован как `round-to-0 → reject` через тот же positive-check (`int(round(0.001 * 100))` = `0` → `<= 0` → error). Никакого специального кода — естественное поведение `round()`. Покрыто отдельным test-параметром.
- **Сохранена существующая ветка `try/except`:** unparseable input возвращает `"Не удалось распознать сумму"`, NOT `"Сумма должна быть > 0"` — это разные ошибки (parse vs sign), пользователь должен видеть конкретный диагноз. Покрыто отдельным test-кейсом.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test fixture name mismatch**
- **Found during:** Task 2 (test file creation)
- **Issue:** Plan referenced `app_user_one` fixture, не существует в проекте. В `tests/conftest.py` есть `single_user` (dict) и `two_tenants` (dict). Существующий `tests/ai/test_tools.py` использует helper `_seed_test_user(db_session)` через `tests.helpers.seed.seed_user`.
- **Fix:** Принят паттерн из `tests/ai/test_tools.py` — local helper `_seed_user(db_session)` внутри test-файла, использующий `truncate_db` + `seed_user`. План явно разрешал такую замену: "Если фикстура `app_user_one` называется иначе ... — заменить под существующий помощник, обеспечивающий объект `AppUser` с `.id`".
- **Files modified:** `tests/ai/test_tools_amount_validation.py`
- **Verification:** 17 тестов pass; все assertions проходят.
- **Committed in:** `0f6f1fa` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking — fixture name)
**Impact on plan:** План явно предусматривал эту подстановку. Никаких scope-изменений.

## Issues Encountered

- **Container baking, не bind-mount для `app/`:** компосе test override монтирует только `tests/` (read-only) внутрь api-контейнера. Изменения в `app/ai/tools.py` пришлось скопировать через `docker cp` для того, чтобы pytest-проверка увидела фикс. Это не deployment-issue — пользователь сам пересобирает контейнеры через `docker compose up --build` после правок (см. memory `feedback-restart-services.md`). Test-pass проверен, фикс корректен на host.

## Verification Results

Phase-level acceptance — все критерии PASS:

1. ✓ `pytest tests/ai/test_tools_amount_validation.py -v` → 17 passed (превышает «минимум 16 passed» из done-критерия Task 2).
2. ✓ `grep -c 'if amount_cents <= 0' app/ai/tools.py` → 2.
3. ✓ `grep -c 'Сумма должна быть > 0' app/ai/tools.py` → 2.
4. ✓ `pytest tests/ai/test_tools.py` → 6 passed (no regression на ранее работавшие позитивные пути).

Success criteria из плана — все ✓:
- ✓ Negative и zero amount_rub возвращают `{"error": "Сумма должна быть > 0"}` без `_proposal: True`.
- ✓ 0.001 rub → 0 cents → также reject (data-integrity invariant).
- ✓ Positive amounts (включая 0.01 rub) продолжают работать.
- ✓ Тест-suite зелёный.

## Threat Mitigation

| Threat ID | Status |
|-----------|--------|
| T-16-03-01 (Tampering, propose_actual_transaction) | mitigate ✓ — positive-check гарантирует, что route не эмитит SSE-propose с negative amount |
| T-16-03-02 (Tampering, propose_planned_transaction) | mitigate ✓ — идентичная защита |
| T-16-03-03 (Defense-in-depth UI mirror) | accept — out-of-scope (CONTEXT deferred), backlog item |
| T-16-03-04 (Pydantic gt=0 на POST endpoints) | accept — последняя линия обороны, не меняется этим планом |

## Next Phase Readiness

- AI-01 закрыт. Plan 16-04 (AI-02 tool-args validation) и 16-05 (AI-03 tool-loop guard) могут продолжаться независимо — они трогают `app/api/routes/ai.py`, не `app/ai/tools.py`.
- UI mirror-валидация `amount > 0` в `ActualEditor`/`PlanItemEditor` — defence-in-depth backlog (post v0.5).

## Self-Check: PASSED

**Files verified to exist:**
- ✓ FOUND: `/Users/exy/pet_projects/tg-budget-planner/app/ai/tools.py` (modified, 660 lines, contains 2× `if amount_cents <= 0` + 2× `Сумма должна быть > 0`)
- ✓ FOUND: `/Users/exy/pet_projects/tg-budget-planner/tests/ai/test_tools_amount_validation.py` (created, 142 lines)

**Commits verified to exist in `git log`:**
- ✓ FOUND: `6d90390` — `fix(16-03): AI-01 reject non-positive amount_rub in propose_*_transaction`
- ✓ FOUND: `0f6f1fa` — `test(16-03): AI-01 regression for propose_*_transaction amount validation`

---
*Phase: 16-security-ai-hardening*
*Completed: 2026-05-07*
