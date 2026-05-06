---
phase: 03-plan-template-and-planned-transactions
plan: 02
subsystem: backend-services
tags: [pydantic-v2, sqlalchemy, async, service-layer, domain-exceptions, idempotency, wave-1]

requires:
  - phase: 03-plan-template-and-planned-transactions
    provides: Wave-0 RED test contracts (45 tests across 4 files); ORM models PlanTemplateItem/PlannedTransaction; PlanSource/CategoryKind enums; cat_svc.get_or_404 + CategoryNotFoundError pattern from Phase 2

provides:
  - Pydantic-схемы templates.py + planned.py с валидаторами на amount_cents/day_of_period/description (D-36)
  - Service-слой templates.py — CRUD + snapshot_from_period с D-32 destructive-overwrite семантикой (исключает subscription_auto)
  - Service-слой planned.py — CRUD + apply_template_to_period с D-31 idempotency + D-37 read-only guard для subscription_auto
  - 6 domain exceptions (TemplateItemNotFoundError, PlannedNotFoundError, PeriodNotFoundError, InvalidCategoryError, KindMismatchError, SubscriptionPlannedReadOnlyError) для маппинга в HTTP-коды на route-слое
  - _clamp_planned_date helper для безопасного маппинга day_of_period → date в границах периода

affects: [03-03-routes-templates-planned, 03-04-frontend-template-screen, 03-05-frontend-planned-screen, 03-06-final-integration]

tech-stack:
  added: []
  patterns:
    - "Cross-import без circular dep: templates.py импортирует InvalidCategoryError + PeriodNotFoundError из planned.py; planned.py не импортирует из templates.py"
    - "Idempotency через source-tag check: SELECT count() WHERE source=template; > 0 → return existing (D-31)"
    - "Eager loading через selectinload(PlanTemplateItem.category) предотвращает MissingGreenlet при доступе item.category.kind в async context"
    - "Domain exceptions в каждом сервисном модуле — HTTP-агностичные, маппятся на route-слое (carryover Phase 2 паттерна)"

key-files:
  created:
    - app/api/schemas/templates.py
    - app/api/schemas/planned.py
    - app/services/planned.py
    - app/services/templates.py
  modified: []

key-decisions:
  - "Commit dependency-first order: planned.py перед templates.py (templates импортирует exceptions из planned). Plan task ordering (Task 2 templates → Task 3 planned) развёрнут в commit history (planned commit = d2c65a5, templates commit = dc39d44) чтобы post-commit verification работало на каждом HEAD"
  - "_clamp_planned_date возвращает period_end если candidate > period_end (а не None или ошибку) — соответствует D-31/D-32 пользовательской интуиции «строки, которые не вписались в короткий период, фиксируются на последний день»"
  - "В update_planned consistency check загружает category даже если category_id не меняется (когда меняется только kind) — корректность важнее одного лишнего SELECT"
  - "snapshot DELETE+flush ДО INSERT в одной session — иначе риск PK collision при reuse old IDs"

patterns-established:
  - "Pattern: source-based idempotency vs unique constraint — для apply-template источник (`source=template`) выступает natural dedup key, не требует миграцию (D-31 trade-off)"
  - "Pattern: hard delete для transactional rows (planned/template/actual), soft delete только для category — fixed CLAUDE.md convention"
  - "Pattern: helper `_ensure_category_active` в каждом сервисе, который мутирует категорию-зависимые сущности — единый guard для is_archived"

requirements-completed: [TPL-01, TPL-03, TPL-04, PLN-01, PLN-02]

duration: ~6min
completed: 2026-05-03
---

# Phase 03 Plan 02: Pydantic Schemas + Service Layer (Templates & Planned) Summary

**4 модуля backend-bottom-half для Phase 3: Pydantic-схемы и pure async service-слой с D-31 idempotent apply-template и D-32 destructive snapshot.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-05-03T03:02:31Z (auto mode)
- **Completed:** 2026-05-03T03:08:41Z
- **Tasks:** 3 (все committed atomically с --no-verify)
- **Files created:** 4 (2 schemas + 2 services)
- **Lines added:** ~620 (109 schemas + 335 planned + 174 templates)

## Accomplishments

- Все 5 truths из must_haves удовлетворены: schemas с валидаторами; templates service с snapshot D-32; planned service с apply-template D-31 + subscription_auto guard D-37; pure async без FastAPI imports; 6 domain exceptions определены.
- Wave-0 RED тесты теперь collect cleanly — все 45 tests из 4 файлов парсятся без ImportError (`pytest --collect-only` → `45 tests collected in 0.01s`).
- Все 3 артефакта frontmatter из must_haves созданы по контракту: exports list соответствует тому, что route layer (Plan 03-03) будет импортировать.
- Все ключевые links из must_haves реализованы:
  - `apply_template_to_period` использует `selectinload(PlanTemplateItem.category)` + `db.add_all` + `flush` (`app/services/planned.py:307-318`).
  - `snapshot_from_period` использует `delete(PlanTemplateItem)` + `add_all` атомарно в одной session (`app/services/templates.py:148-181`).
  - `create_manual_planned` / `update_planned` используют `_ensure_category_active` с явным `is_archived` check (`app/services/planned.py:122-128`).
- Mitigation покрытие threat register Phase 3:
  - T-03-05 (kind mismatch) — KindMismatchError в create_manual_planned + update_planned.
  - T-03-06 (edit subscription_auto) — SubscriptionPlannedReadOnlyError в update_planned + delete_planned.
  - T-03-07 (snapshot includes subscription_auto) — `source.in_([template, manual])` в snapshot_from_period.
  - T-03-08 (archived category) — `_ensure_category_active` в create + update.
  - T-03-09 (day_of_period > period length) — `_clamp_planned_date` к period_end.
  - T-03-10 (Pydantic input bounds) — `gt=0`, `ge=1, le=31`, `max_length=500` в schemas.

## Task Commits

1. **Task 1: Pydantic schemas (templates.py + planned.py)** — `1b46fbc` (feat)
2. **Task 3 (committed first by dependency): Service layer planned.py** — `d2c65a5` (feat)
3. **Task 2 (committed after planned): Service layer templates.py** — `dc39d44` (feat)

_Note: per orchestrator instructions, no STATE.md / ROADMAP.md updates and no separate metadata commit. Commits use `--no-verify`._

_Commit ordering deviation (Rule 3, see Deviations): templates.py imports exceptions from planned.py, so planned.py is committed first. Plan task numbering (Task 2 templates → Task 3 planned) is preserved in plan/SUMMARY narrative; the git log reflects dependency-first ordering so each HEAD state imports cleanly._

## Files Created

- `app/api/schemas/templates.py` (49 lines) — `TemplateItemCreate`, `TemplateItemUpdate`, `TemplateItemRead`, `SnapshotFromPeriodResponse`. Валидаторы: `amount_cents: Field(gt=0)`, `day_of_period: Field(default=None, ge=1, le=31)`, `description: Field(default=None, max_length=500)`, `sort_order: Field(default=0, ge=0)`. `ConfigDict(from_attributes=True)` на Read schemas. Update — все поля Optional.
- `app/api/schemas/planned.py` (60 lines) — `PlannedCreate`, `PlannedUpdate`, `PlannedRead`, `ApplyTemplateResponse` + 2 type aliases `PlanSourceStr` (`Literal["template", "manual", "subscription_auto"]`) и `KindStr` (`Literal["expense", "income"]`). PlannedRead включает `period_id`, `source`, `subscription_id` (для D-37 UI marker).
- `app/services/planned.py` (335 lines) — 5 domain exceptions + 4 helpers (`_clamp_planned_date`, `_ensure_category_active`, `_get_period_or_404`, `get_or_404`) + 5 CRUD функций (`list_planned_for_period`, `create_manual_planned`, `update_planned`, `delete_planned`, `apply_template_to_period`). Idempotency для apply-template: `SELECT count() WHERE source=template`; > 0 → return existing rows с `created=0`.
- `app/services/templates.py` (174 lines) — 1 domain exception (`TemplateItemNotFoundError`) + 2 helpers (`_ensure_category_active`, `get_or_404`) + 5 функций (`list_template_items`, `create_template_item`, `update_template_item`, `delete_template_item`, `snapshot_from_period`). Snapshot: `source.in_([PlanSource.template, PlanSource.manual])` фильтр исключает `subscription_auto` (D-32); DELETE+flush+INSERT атомарно в одной session.

## Decisions Made

- **Commit ordering: dependency-first.** Plan listed tasks as Task 2 (templates) → Task 3 (planned), но templates импортирует `InvalidCategoryError, PeriodNotFoundError` из planned. Изменение порядка коммитов гарантирует, что Python imports работают на каждом HEAD — `git checkout d2c65a5` (после planned commit) даёт рабочий планнед, `git checkout dc39d44` (после templates commit) даёт оба сервиса. Альтернатива (выделить exceptions в `app/services/exceptions.py`) была отклонена ради соответствия Phase 2 паттерну.
- **`_clamp_planned_date` clamps to `period_end` (не raises, не возвращает `None`).** Когда `day_of_period=31`, а февраль короче, кладём строку на последний день периода. Это явное поведение в D-31 spec и интуитивно для пользователя ("31-е → последний день месяца").
- **Update_planned загружает category даже когда меняется только `kind` (а не `category_id`).** Один лишний SELECT в редком случае (kind-only patch) проще и безопаснее, чем кэшировать `row.category` (which требовал бы selectinload в `get_or_404` — bloating reads).
- **`snapshot_from_period` делает `db.execute(delete(...))` + `flush()` ДО `add_all`.** В пределах одной session SQLAlchemy unit-of-work не гарантирует порядок DELETE/INSERT, поэтому явный flush() ставит DELETE на DB сторону до INSERT — иначе при reuse PK значений possible PK collision (теоретическая, но дешёвая страховка).
- **`hard delete` для template + planned, `soft delete` только для category.** Соответствует CLAUDE.md convention. delete_planned/delete_template_item возвращают detached instance для serialization caller'ом.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reversed task commit order: planned.py before templates.py**

- **Found during:** Task 2 commit preparation
- **Issue:** Plan ordered Task 2 (templates) before Task 3 (planned), но templates.py импортирует `InvalidCategoryError, PeriodNotFoundError` из planned.py. Если коммитить templates.py первым — на этом HEAD `git checkout dc39d44~1` Python import упадёт с `ModuleNotFoundError: app.services.planned`.
- **Fix:** Создал оба файла в working tree, затем закоммитил `app/services/planned.py` first (`d2c65a5`), потом `app/services/templates.py` (`dc39d44`). Plan narrative и task IDs сохранены — изменён только git log ordering.
- **Files modified:** none (только commit ordering)
- **Verification:** `git log --oneline -5` показывает 1b46fbc (schemas) → d2c65a5 (planned) → dc39d44 (templates); `/usr/bin/python3 -c "from app.services.templates import ..."` импортируется без ошибок на каждом HEAD начиная с d2c65a5.
- **Committed in:** structurally distributed across `d2c65a5` + `dc39d44`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** No scope change — все артефакты must_haves созданы, все behaviors из <behavior> блоков реализованы.

## Issues Encountered

- **Локальный sandbox python3.9 vs project requires_python>=3.12.** Pydantic v2 + SQLAlchemy 2.x имитируют свои runtime annotations (PEP 604 unions работают через `Optional[X]` в default-param annotations, но `list[X]` в return type — OK на 3.9 благодаря PEP 585 / `from __future__`). Импорты прошли без ошибок на 3.9 — code не использует PEP 604 `X | None` в местах runtime evaluation. Тесты `tests/test_*` всё ещё падают на runtime (нет route layer Plan 03-03), что ожидаемое RED состояние.

## Self-Check: PASSED

- `app/api/schemas/templates.py` — FOUND
- `app/api/schemas/planned.py` — FOUND
- `app/services/planned.py` — FOUND
- `app/services/templates.py` — FOUND
- Commit `1b46fbc` (schemas) — FOUND
- Commit `d2c65a5` (planned service) — FOUND
- Commit `dc39d44` (templates service) — FOUND
- Imports verified: `from app.services.templates import ...` + `from app.services.planned import ...` — OK
- AST verified: 7 async funcs in templates.py, 8 async funcs in planned.py, 1 + 5 exception classes
- No `import fastapi` / `from fastapi` в обоих сервисах (только docstring mentions)
- Wave-0 RED tests: `pytest --collect-only` → 45 tests collected (templates 14 + snapshot 6 + planned 17 + apply 8) — same as Plan 03-01 baseline; ImportError больше не блокирует collection

## Next Phase Readiness

- **Plan 03-03** can now wire `app/api/routes/templates.py` and `app/api/routes/planned.py`. Все service-функции signed точно так, как HTTP-call assertions в RED тестах ожидают:
  - `templates_router.get("/items")` → `list_template_items(db)` → `list[TemplateItemRead]`
  - `templates_router.post("/items")` → `create_template_item(db, body=...)` (raises `CategoryNotFoundError` 404 / `InvalidCategoryError` 400)
  - `templates_router.patch("/items/{id}")` → `update_template_item(db, id, patch)` (raises `TemplateItemNotFoundError` 404)
  - `templates_router.delete("/items/{id}")` → `delete_template_item(db, id)`
  - `templates_router.post("/snapshot-from-period/{period_id}")` → `snapshot_from_period(db, period_id=...)` → `SnapshotFromPeriodResponse`
  - `planned_router.get("/periods/{period_id}/planned")` → `list_planned_for_period(db, period_id, kind=..., category_id=...)`
  - `planned_router.post("/periods/{period_id}/planned")` → `create_manual_planned(db, period_id, body)` (raises 5 exception types)
  - `planned_router.post("/periods/{period_id}/apply-template")` → `apply_template_to_period(db, period_id=...)` → `ApplyTemplateResponse`
  - `planned_router.patch("/planned/{id}")` → `update_planned(db, id, patch)` (raises `SubscriptionPlannedReadOnlyError`)
  - `planned_router.delete("/planned/{id}")` → `delete_planned(db, id)`
- **Wave-1 verifier** should run все 4 RED файла end-to-end с DATABASE_URL set после Plan 03-03 lands; ожидание: transition RED → GREEN.
- No external service configuration required (User Setup: none).

---
*Phase: 03-plan-template-and-planned-transactions*
*Completed: 2026-05-03*
