---
phase: 03-plan-template-and-planned-transactions
plan: 03
subsystem: api-routes
tags: [fastapi, pydantic-v2, async, http-routing, exception-mapping, wave-2]

requires:
  - phase: 03-plan-template-and-planned-transactions
    provides: Pydantic schemas (templates.py + planned.py) + service layer (templates.py + planned.py) с 6 domain exceptions, _clamp_planned_date helper, D-31 idempotent apply-template, D-32 destructive snapshot. Wave-0 RED tests (test_templates.py, test_planned.py, test_apply_template.py, test_snapshot.py).

provides:
  - app/api/routes/templates.py — templates_router (5 endpoints под /template prefix)
  - app/api/routes/planned.py — planned_router (5 endpoints без prefix; обслуживает /periods/{id}/* и /planned/{id})
  - app/api/router.py — обновлён (импорты + 2 include_router + Phase 3 docstring)
  - 4 RED test файла из Wave 0 готовы перейти GREEN при наличии DATABASE_URL и запущенных миграций

affects: [03-04-frontend-template-screen, 03-05-frontend-planned-screen, 03-06-final-integration, 05-dashboard-and-period-close (worker close_period вызывает /apply-template)]

tech-stack:
  added: []
  patterns:
    - "Single APIRouter без prefix= для двух URL-групп с общим Depends — `planned_router` обслуживает `/periods/{id}/planned*` и `/planned/{id}` через явные path в декораторах"
    - "Thin route handler: try → service call → except domain → HTTPException; НЕТ business logic в route layer"
    - "Pydantic Read schema с ConfigDict(from_attributes=True) → model_validate(orm_row) для serialization"
    - "FastAPI разрешает coexistence статического `/periods/current` (periods_router prefix=/periods) и path-param `/periods/{period_id}/planned` (planned_router без prefix) — статический выигрывает на match"

key-files:
  created:
    - app/api/routes/templates.py
    - app/api/routes/planned.py
  modified:
    - app/api/router.py

key-decisions:
  - "planned_router без prefix=, явные path в декораторах — единственный способ объединить /periods/{id}/* и /planned/{id} под одним Depends(get_current_user) без дублирования router-level dep"
  - "Сохранён task ordering плана (Task 1 templates → Task 2 planned → Task 3 register) — нет circular dep на route-уровне (templates.py импортирует InvalidCategoryError/PeriodNotFoundError из service-слоя planned, но это уже зафиксировано в Plan 03-02 commit ordering)"
  - "Для DELETE возвращаем response_model=PlannedRead/TemplateItemRead (deleted state) — позволяет клиенту обновить локальный кэш без отдельного refetch и согласуется с паттерном из categories.py archive endpoint"
  - "POST endpoints возвращают status_code=200 (не 201) — соответствует паттерну Phase 2 (categories POST)"

patterns-established:
  - "Pattern: Two-group single-router — APIRouter без prefix с явными path в декораторах для семантически связанных, но URL-разделённых endpoints (period-scoped vs item-scoped)"
  - "Pattern: Exception-mapping table в module docstring — облегчает аудит покрытия domain exceptions (Phase 2 паттерн расширен)"

requirements-completed: [TPL-01, TPL-02, TPL-03, TPL-04, PLN-01, PLN-02, PLN-03]

duration: ~3min
completed: 2026-05-03
---

# Phase 03 Plan 03: REST routes для templates + planned + apply-template + snapshot Summary

**Тонкие FastAPI-роуты Wave 2: 10 endpoints за 2 router'ами с router-level Depends(get_current_user) и полным domain-exception → HTTP-mapping; backend Phase 3 готов к интеграционным тестам.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-03T03:11:50Z (auto mode)
- **Completed:** 2026-05-03T03:14:57Z
- **Tasks:** 3 (все committed atomically с --no-verify)
- **Files created:** 2 (templates.py + planned.py routes)
- **Files modified:** 1 (router.py — 2 import + 2 include_router + docstring)
- **Lines added:** ~406 (175 templates + 216 planned + 15 router.py)

## Accomplishments

- Все 5 truths из must_haves удовлетворены:
  - **Router-level `Depends(get_current_user)` на обоих новых роутерах** — наследуется от paramsl `dependencies=[...]` в APIRouter ctor (T-03-11 mitigation).
  - **Domain exception → HTTP status mapping полный** — 6 exception классов смаплены на 404/400 согласно spec табл; `Pydantic ValidationError` авто-маплится FastAPI на 422 (T-03-12 mitigation).
  - **Pydantic body validation возвращает 422** — `Field(gt=0)`, `Field(ge=1, le=31)`, `Field(max_length=500)` уже определены в schemas из Plan 03-02; routes пользуются `body: <Schema>` parameter type.
  - **Backend test suite Phase 3 готов перейти GREEN** — все URL paths в test_templates.py / test_planned.py / test_apply_template.py / test_snapshot.py точно соответствуют добавленным route definitions (verified через grep + AST endpoint-extraction).
  - **Phase 1+2 тесты не сломаны (regression)** — новые routes только добавляются (no edit existing paths); periods_router (`/periods/current`) и planned_router (`/periods/{period_id}/...`) coexist без конфликтов (FastAPI prefer статический match).
- Все 3 артефакта из must_haves созданы по контракту:
  - `app/api/routes/templates.py` экспортирует `templates_router` с 5 endpoints (3 на TPL-01/02, 1 на TPL-03 snapshot).
  - `app/api/routes/planned.py` экспортирует `planned_router` с 5 endpoints (3 period-scoped + 2 item-scoped).
  - `app/api/router.py` импортирует и регистрирует оба router'а через `public_router.include_router(...)`.
- Все ключевые links из must_haves реализованы:
  - `app/api/router.py:33-34` — импорты `templates_router`, `planned_router`.
  - `app/api/router.py:88-89` — `include_router(templates_router)`, `include_router(planned_router)`.
  - `app/api/routes/templates.py:42` — `dependencies=[Depends(get_current_user)]`.
  - `app/api/routes/planned.py:50` — `dependencies=[Depends(get_current_user)]`.
  - Exception mapping pattern: `try: await svc.X(...); except DomainExc: raise HTTPException(...) from exc` — везде идентично categories.py.

## Task Commits

Each task committed atomically with `--no-verify`:

1. **Task 1: Templates router (TPL-01, TPL-02, TPL-03)** — `90d6a67` (feat)
2. **Task 2: Planned router (PLN-01..03, TPL-04)** — `a83a563` (feat)
3. **Task 3: Register routers in app/api/router.py** — `2987aa6` (feat)

_Note: per orchestrator instructions, no STATE.md / ROADMAP.md updates and no separate metadata commit. SUMMARY.md committed separately below._

## Files Created/Modified

- **`app/api/routes/templates.py`** (175 lines) — `templates_router` with `prefix="/template"`, `tags=["templates"]`, router-level `Depends(get_current_user)`. 5 endpoints:
  - `GET /items` → `tpl_svc.list_template_items` → `list[TemplateItemRead]`
  - `POST /items` (200) → `tpl_svc.create_template_item(db, body=...)` → `TemplateItemRead` (catches CategoryNotFoundError 404, InvalidCategoryError 400)
  - `PATCH /items/{item_id}` → `tpl_svc.update_template_item` → `TemplateItemRead` (catches TemplateItemNotFoundError 404, CategoryNotFoundError 404, InvalidCategoryError 400)
  - `DELETE /items/{item_id}` → `tpl_svc.delete_template_item` → `TemplateItemRead` (deleted state; catches TemplateItemNotFoundError 404)
  - `POST /snapshot-from-period/{period_id}` (200) → `tpl_svc.snapshot_from_period` → `SnapshotFromPeriodResponse` (catches PeriodNotFoundError 404)

- **`app/api/routes/planned.py`** (216 lines) — `planned_router` без prefix, `tags=["planned"]`, router-level `Depends(get_current_user)`. 5 endpoints в двух группах:
  - Period-scoped:
    - `GET /periods/{period_id}/planned?kind=&category_id=` → `plan_svc.list_planned_for_period` → `list[PlannedRead]` (Query params: `kind: Optional[KindStr]`, `category_id: Optional[int] gt=0`)
    - `POST /periods/{period_id}/planned` (200) → `plan_svc.create_manual_planned` → `PlannedRead` (catches PeriodNotFoundError 404, CategoryNotFoundError 404, InvalidCategoryError 400, KindMismatchError 400)
    - `POST /periods/{period_id}/apply-template` (200) → `plan_svc.apply_template_to_period` → `ApplyTemplateResponse` (catches PeriodNotFoundError 404; D-31 idempotent на сервисе)
  - Item-scoped:
    - `PATCH /planned/{planned_id}` → `plan_svc.update_planned` → `PlannedRead` (catches PlannedNotFoundError 404, CategoryNotFoundError 404, InvalidCategoryError 400, KindMismatchError 400, SubscriptionPlannedReadOnlyError 400)
    - `DELETE /planned/{planned_id}` → `plan_svc.delete_planned` → `PlannedRead` (catches PlannedNotFoundError 404, SubscriptionPlannedReadOnlyError 400)

- **`app/api/router.py`** (modified +15 lines) —
  - Импорты `from app.api.routes.templates import templates_router` и `from app.api.routes.planned import planned_router` (alphabetical order).
  - 2 `public_router.include_router(...)` после settings_router с inline-комментарием объясняющим, почему `planned_router` без prefix.
  - Module docstring расширен Phase 3 routes секцией (5 endpoints с requirement IDs).

## Decisions Made

- **Сохранён task ordering плана (Task 1 templates → Task 2 planned → Task 3 register).** В Plan 03-02 пришлось менять commit ordering из-за circular dep на service-слое (templates.py импортирует exceptions из planned.py). На route-слое такой проблемы нет: templates.py route импортирует из service templates.py + service planned.py + service categories.py — все уже существуют после Plan 03-02. Поэтому commit history линеен относительно плана.
- **`planned_router` без `prefix=`.** Альтернатива (два разных router'а с разными prefixes — `periods_actions_router` для apply-template и `planned_items_router` для CRUD) дала бы дублирование `dependencies=[Depends(get_current_user)]`. Single router с явными path proще и не нарушает FastAPI семантику.
- **DELETE возвращает `response_model=...Read` с состоянием удалённой строки.** Frontend может обновить локальный state без дополнительного refetch. Согласуется с `archive_category` в categories.py (возвращает `CategoryRead` после soft-archive).
- **POST endpoints возвращают `status_code=200`, не 201.** Соответствует Phase 2 паттерну (`POST /categories` → 200). Pet-проект, не публичное HTTP API — консистентность важнее REST-канона.
- **Не добавил отдельный snapshot Pydantic для request body — endpoint берёт period_id только из path, body пустой.** Соответствует D-32: snapshot операция полностью derivable из period_id, никаких дополнительных параметров от клиента не нужно.

## Deviations from Plan

None — plan executed exactly as written.

Все 3 task'а реализованы согласно `<action>` блоков плана, без auto-fixes по Rules 1-3. Domain exception mapping табл из плана воспроизведена дословно. Phase 2 thin-handler pattern скопирован из `app/api/routes/categories.py` без modification.

## Issues Encountered

- **Sandbox python3 (3.9) vs project requires_python>=3.12 + FastAPI runtime.** На локальном python3.9 `app.api.dependencies` не импортируется из-за `str | None` PEP 604 syntax (RUNTIME-evaluated в `Header(default=None)` annotation). Поэтому verification `python3 -c "from app.api.routes.templates import templates_router; ..."` (как в `<verify>` блоках плана) на sandbox падает с TypeError. Workaround: использовал AST-based verification через `python3 -c "import ast; ..."` — извлёк endpoint paths из декораторов и проверил их соответствие path'ам из RED-тестов (`tests/test_*.py`). Все 10 endpoint paths совпали 1:1 с тестовыми ожиданиями.
- **uv / pytest недоступны в sandbox.** Полный `uv run pytest tests/ -v` (как в плане) запустить нельзя. Verification остаётся за orchestrator/verifier, который может запустить тесты в окружении с DATABASE_URL.

## User Setup Required

None — Phase 3 не требует внешней конфигурации.

## Self-Check: PASSED

- `app/api/routes/templates.py` — FOUND (175 lines)
- `app/api/routes/planned.py` — FOUND (216 lines)
- `app/api/router.py` — FOUND (117 lines, modified)
- Commit `90d6a67` (templates router) — FOUND
- Commit `a83a563` (planned router) — FOUND
- Commit `2987aa6` (router registration) — FOUND
- AST verified: templates.py содержит 5 декорированных async functions; все 5 plan'ом ожидаемых (method, path) tuples присутствуют
- AST verified: planned.py содержит 5 декорированных async functions; все 5 ожидаемых (method, path) tuples присутствуют
- AST verified: router.py импортирует `templates_router` + `planned_router` и вызывает `include_router(...)` для обоих
- Path-conflict check: `/periods/current` (статический, periods_router) vs `/periods/{period_id}/planned` (path-param, planned_router) — FastAPI разрешает coexistence; статический выигрывает на match для /current

## Next Phase Readiness

- **Plan 03-04 (frontend TemplateScreen)** может фетчить `/api/v1/template/items` через apiFetch + initData header — endpoint live и под auth.
- **Plan 03-05 (frontend PlannedScreen)** может фетчить `/api/v1/periods/{id}/planned`, делать `apply-template`, и mutate planned rows — все endpoints готовы.
- **Phase 5 worker `close_period`** (deferred from Phase 2 PER-05) сможет звать `POST /api/v1/periods/{new_period_id}/apply-template` через internal HTTP-call или прямо через `app.services.planned.apply_template_to_period(...)` — service-функция уже идемпотентна (D-31).
- **Verifier (Plan 03-06 или /gsd-verify-work)**: при наличии DATABASE_URL + alembic upgrade head, ожидаемое: 4 RED test файла Phase 3 transition в GREEN; Phase 1+2 тесты не regress'ят. Все 45 RED tests collected в Plan 03-02 self-check.
- **Backend Phase 3 surface complete** — после этой плана все REST endpoints из HLD §4.3, §4.4 (apply-template), §4.5 доступны. Bot/worker ещё не интегрированы (Phase 6 / Phase 5 соответственно).

---
*Phase: 03-plan-template-and-planned-transactions*
*Completed: 2026-05-03*
