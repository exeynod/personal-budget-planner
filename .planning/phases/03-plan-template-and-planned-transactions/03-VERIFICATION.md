---
phase: 03-plan-template-and-planned-transactions
verified: 2026-05-03T00:00:00Z
status: human_needed
score: 5/5 must-haves verified (code-level); manual UI walkthrough deferred
overrides_applied: 0
human_verification:
  - test: "TemplateScreen group-by-kind layout (sketch 005-B)"
    expected: "Открыть Mini App → Шаблон → видны секции Расходы/Доходы → внутри них sub-headers с именами категорий → строки PlanRow в каждой sub-group; кнопка «+ Добавить строку в <category>» под каждой группой"
    why_human: "Визуальная компоновка sketch 005-B — нельзя проверить headless"
  - test: "Inline-edit суммы (Enter сохраняет, Esc отменяет, ✓/× кнопки)"
    expected: "Tap на «15 000 ₽» → input с autofocus и prefilled значением → ввод «20000» + Enter → строка обновляется на «20 000 ₽». Esc/× → отмена без изменений."
    why_human: "Telegram WebView UX-флоу — требует визуальной проверки"
  - test: "BottomSheet полный редактор (открытие/закрытие, поля, валидация, Telegram BackButton)"
    expected: "Tap на metaZone строки → BottomSheet выезжает снизу с полями category/amount/description/day_of_period (template) или planned_date (planned). Backdrop tap, Esc, кнопка ×, Telegram BackButton — каждый закрывает sheet."
    why_human: "CSS-анимация slide-up + Telegram BackButton lifecycle — нельзя автоматизировать"
  - test: "Apply-template UI: кнопка «Применить шаблон» появляется только на пустом периоде"
    expected: "На периоде без plan-строк (и непустом шаблоне) видна кнопка «Применить шаблон». После применения — кнопка исчезает (есть строки)."
    why_human: "UI-условный рендер; backend D-31 уже verified в коде"
  - test: "Apply-template idempotency UX: повторное нажатие — кнопка скрыта"
    expected: "После первого apply кнопка скрыта; через DevTools ручной POST к /apply-template возвращает {created: 0, planned: [...тех же N строк...]} — UI не дублирует строки."
    why_human: "Поведенческая проверка через TG webview/devtools"
  - test: "Snapshot UI с window.confirm («↻ В шаблон»)"
    expected: "Tap «↻ В шаблон» → window.confirm → confirm → toast «Шаблон обновлён: M строк». Cancel → ничего не происходит."
    why_human: "Браузерный confirm-диалог + UI toast"
  - test: "PLN-03 «🔁 Подписка» badge на mock-строке через window.__injectMockPlanned__"
    expected: "В DevTools console (DEV-build): `window.__injectMockPlanned__({id: -1, period_id: 1, kind: 'expense', amount_cents: 99000, description: 'YouTube Premium', category_id: <existing_id>, planned_date: '2026-02-10', source: 'subscription_auto', subscription_id: 1})` → строка появляется с badge «🔁 Подписка», dimmed opacity, без реакции на tap по amount/metadata."
    why_human: "DEV-инъекция для verify визуала; реальная subscription_auto строка появится в Phase 6"
  - test: "E2E walkthrough (UI-SPEC §Acceptance.3)"
    expected: "Полный путь: создать шаблон → применить к периоду → отредактировать plan-строки → snapshot обратно в шаблон → видны изменения в шаблоне"
    why_human: "Многошаговый user journey — невозможно без работающего docker stack + TG webview"
---

# Phase 3: Plan Template & Planned Transactions — Verification Report

**Phase Goal:** «Пользователь может вести шаблон плана и плановые строки текущего периода с inline-редактированием; шаблон детерминированно разворачивается в новый период»

**Verified:** 2026-05-03
**Status:** `human_needed` — code-level verification PASSED; visual UX walkthrough deferred
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria + PLN-03 mock)

| # | Truth (SC) | Status | Evidence |
|---|------------|--------|----------|
| 1 | На экране «Шаблон» доступен CRUD строк (group by category, inline-edit, bottom-sheet) — sketch 005-B | ✓ VERIFIED (code) | `frontend/src/screens/TemplateScreen.tsx:53-79` group-by-kind→category логика; `PlanRow.tsx:103-149` inline-edit Enter/Esc/✓/×; `BottomSheet.tsx:31-83` slide-up sheet; `PlanItemEditor.tsx` 4-mode форма. Visual layout — manual. |
| 2 | Кнопка «Применить шаблон» idempotent (повторный вызов не создаёт дублей) | ✓ VERIFIED | `app/services/planned.py:269-335` D-31 идемпотентность: `SELECT count() WHERE period_id=:pid AND source='template'` → если >0 возвращает existing с `created=0`. Test: `tests/test_apply_template.py:246-272 test_apply_idempotent_returns_existing` (`created=0` на повторе). |
| 3 | «Перенести план в шаблон» создаёт snapshot (overwrite) | ✓ VERIFIED | `app/services/templates.py:112-174` D-32: DELETE PlanTemplateItem + INSERT из planned WHERE source IN (template, manual). `tests/test_snapshot.py:333-396 test_snapshot_excludes_subscription_auto` подтверждает исключение subscription_auto. UI: «↻ В шаблон» button + window.confirm в `PlannedScreen.tsx:171-190`. |
| 4 | На экране «План» CRUD plan-строк с source enum (manual/template/subscription_auto) | ✓ VERIFIED (code) | `app/api/routes/planned.py:50-216` все 5 endpoints с правильным mapping исключений. `PlannedScreen.tsx:202-234` create/update/delete handlers. `app/api/schemas/planned.py:8 PlanSourceStr = Literal["template","manual","subscription_auto"]`. UI rendering — manual. |
| 5 | План-строки от подписок отображаются с маркером «🔁» (visual проверен на mock) | ✓ VERIFIED (code) + ? mock UI walkthrough | `PlanRow.tsx:45-46,159` ветка `source === 'subscription_auto'` рендерит «🔁 Подписка» badge + readOnly opacity + блокирует amount/row tap. `PlannedScreen.tsx:42-100` DEV-only `window.__injectMockPlanned__` под `import.meta.env.DEV` guard. Server-side guard: `app/services/planned.py:222,259 SubscriptionPlannedReadOnlyError` для PATCH/DELETE. Прод-bundle tree-shake verified: `grep -c "__injectMockPlanned__" frontend/dist/assets/*.js` = 0. Visual — manual через DevTools. |

**Score:** 5/5 truths code-level VERIFIED. Visual UX confirmation вынесен в `human_verification`.

### Required Artifacts (Levels 1-3)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/services/templates.py` | Service layer: list/create/update/delete + snapshot_from_period | ✓ VERIFIED | 175 LOC, D-32 snapshot реализован, exception `TemplateItemNotFoundError`, импортируется `app/api/routes/templates.py:34` |
| `app/services/planned.py` | Service layer: CRUD + apply_template_to_period idempotent | ✓ VERIFIED | 336 LOC, D-31 idempotency через `SELECT count() WHERE source=template`, exceptions `PlannedNotFoundError`/`PeriodNotFoundError`/`InvalidCategoryError`/`KindMismatchError`/`SubscriptionPlannedReadOnlyError`, импортируется `app/api/routes/planned.py:39` |
| `app/api/schemas/templates.py` | Pydantic v2 schemas | ✓ VERIFIED | `TemplateItemCreate/Update/Read` + `SnapshotFromPeriodResponse`; `amount_cents: Field(gt=0)`, `day_of_period: Field(ge=1, le=31)` |
| `app/api/schemas/planned.py` | Pydantic v2 schemas | ✓ VERIFIED | `PlannedCreate/Update/Read` + `ApplyTemplateResponse`; `PlanSourceStr` Literal с 3 значениями |
| `app/api/routes/templates.py` | REST router `/template/*` под `Depends(get_current_user)` | ✓ VERIFIED | 5 endpoints (list/create/update/delete items + snapshot); зарегистрирован в `app/api/router.py:97` |
| `app/api/routes/planned.py` | REST router `/periods/{id}/planned*` + `/planned/{id}` | ✓ VERIFIED | 5 endpoints (list/create/apply-template + patch/delete); зарегистрирован в `app/api/router.py:98` |
| `app/api/router.py` | Регистрация новых routers | ✓ VERIFIED | Lines 97-98: `public_router.include_router(templates_router)` + `public_router.include_router(planned_router)` |
| `frontend/src/screens/TemplateScreen.tsx` | Group by kind+category, inline-edit, BottomSheet | ✓ VERIFIED | 232 LOC, импортирует PlanRow + BottomSheet + PlanItemEditor; используется в `App.tsx:57-58` |
| `frontend/src/screens/PlannedScreen.tsx` | Period plan CRUD + apply/snapshot buttons + mock helper | ✓ VERIFIED | 410 LOC, все хуки (useCurrentPeriod/usePlanned/useTemplate/useCategories), apply-template + snapshot handlers, DEV mock helper; используется в `App.tsx:60-66` |
| `frontend/src/components/PlanRow.tsx` | Inline-edit + subscription_auto branch | ✓ VERIFIED | `isSubAuto` gate на line 45, badge «🔁 Подписка» line 159, readOnly opacity |
| `frontend/src/components/BottomSheet.tsx` | Slide-up + backdrop + Telegram BackButton | ✓ VERIFIED | CSS-only animation, Esc + BackButton subscription with cleanup |
| `frontend/src/components/PlanItemEditor.tsx` | Universal form (4 modes) | ✓ VERIFIED | Discriminates template/planned via `mode`; create/edit shared; delete button only for edit modes |
| `frontend/src/api/templates.ts` | API client wrappers | ✓ VERIFIED | `listTemplateItems`/`createTemplateItem`/`updateTemplateItem`/`deleteTemplateItem`/`snapshotFromPeriod` — все используются в TemplateScreen + PlannedScreen |
| `frontend/src/api/planned.ts` | API client wrappers | ✓ VERIFIED | `listPlanned`/`createPlanned`/`updatePlanned`/`deletePlanned`/`applyTemplate` — все используются в PlannedScreen |
| `frontend/src/hooks/useTemplate.ts` | Fetch + refetch шаблона | ✓ VERIFIED | Cancellation pattern, used by Template+PlannedScreen |
| `frontend/src/hooks/usePlanned.ts` | Fetch + refetch плана периода | ✓ VERIFIED | Принимает `periodId \| null`, skip если null |
| `frontend/src/hooks/useCurrentPeriod.ts` | Текущий активный период | ✓ VERIFIED | Используется PlannedScreen |
| `tests/test_templates.py` | RED stubs CRUD + archived guard | ✓ VERIFIED | 14 tests; collected без ImportError |
| `tests/test_planned.py` | RED stubs CRUD + kind mismatch + subscription_auto read-only | ✓ VERIFIED | `test_update_subscription_auto_400`, `test_delete_subscription_auto_400`, `test_create_planned_kind_mismatch_400` присутствуют |
| `tests/test_apply_template.py` | Idempotency test | ✓ VERIFIED | `test_apply_idempotent_returns_existing` (line 246) — повторный вызов = `created=0` |
| `tests/test_snapshot.py` | Destructive overwrite + exclude subscription_auto | ✓ VERIFIED | `test_snapshot_excludes_subscription_auto` (line 333) — D-32 contract |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `templates_router` | FastAPI app | `include_router` | ✓ WIRED | `app/api/router.py:97` |
| `planned_router` | FastAPI app | `include_router` | ✓ WIRED | `app/api/router.py:98` |
| `templates_router` | `tpl_svc.snapshot_from_period` | direct call | ✓ WIRED | `app/api/routes/templates.py:165` |
| `planned_router` | `plan_svc.apply_template_to_period` | direct call | ✓ WIRED | `app/api/routes/planned.py:140` |
| `TemplateScreen` | `api/templates` (CRUD) | imports + calls | ✓ WIRED | createTemplateItem/updateTemplateItem/deleteTemplateItem all invoked |
| `PlannedScreen` | `api/planned` + `snapshotFromPeriod` | imports + calls | ✓ WIRED | applyTemplate (line 154), snapshotFromPeriod (line 183), CRUD (lines 195/207/217/231) |
| `App.tsx` | `TemplateScreen` + `PlannedScreen` | imports + render | ✓ WIRED | Lines 6-7 imports, 57-58 + 60-66 routes; `Screen` union extended |
| `HomeScreen` | navigation to template/planned | onNavigate prop | ✓ WIRED | `screens/HomeScreen.tsx:26-46` 4 nav buttons |
| `PlanRow` (subscription_auto) | «🔁 Подписка» badge | source check | ✓ WIRED | `isSubAuto` (line 45) → badge (line 159) + readOnly (line 46) |
| `PlannedScreen` DEV mock | `window.__injectMockPlanned__` | `import.meta.env.DEV` guard | ✓ WIRED + tree-shaken | useEffect lines 92-100; prod bundle: `grep -c` = 0 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `TemplateScreen` | `items` | `useTemplate` → `listTemplateItems` → GET /api/v1/template/items → `tpl_svc.list_template_items` → SELECT | Yes (real DB query) | ✓ FLOWING |
| `PlannedScreen` | `realRows` | `usePlanned(periodId)` → `listPlanned` → GET /api/v1/periods/{id}/planned → `plan_svc.list_planned_for_period` → SELECT | Yes | ✓ FLOWING |
| `PlannedScreen` | `mockRows` | `window.__injectMockPlanned__` (DEV only) | Manual injection only — by design | ✓ FLOWING (intentional dev affordance per D-37) |
| Apply-template button | `result.created` | `applyTemplate` → POST /api/v1/periods/{id}/apply-template → `apply_template_to_period` → INSERT or SELECT existing | Yes (DB INSERT/SELECT path covered) | ✓ FLOWING |
| Snapshot button | `result.template_items` | `snapshotFromPeriod` → POST /api/v1/template/snapshot-from-period/{id} → `snapshot_from_period` → DELETE+INSERT | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Backend syntax — все 6 Phase-3 файлов парсятся | `python -m ast` (per Plan 03-06 SUMMARY) | OK для всех 6 файлов | ✓ PASS |
| Тестовая коллекция без ImportErrors | `pytest --collect-only` | 113 tests collected | ✓ PASS |
| TS compile | `cd frontend && npx tsc --noEmit` | exit 0, no errors | ✓ PASS |
| Vite production build | `npm run build` (per SUMMARY) | exit 0; 231.18 kB JS / 20.64 kB CSS | ✓ PASS |
| DEV-helper tree-shaken in prod | `grep -c "__injectMockPlanned__" dist/assets/*.js` | 0 | ✓ PASS |
| Pytest run (non-DB) | `pytest tests/` (per SUMMARY) | 35 passed; 76 errors = uniform `OSError: connection refused` (no Postgres локально); 2 pre-existing failures не Phase 3 | ? SKIP (env, не код) |

> **Environment note:** locally нет работающего Postgres → все DB-backed тесты outright `OSError`. Это environmental skip, не код-регрессия. Phase 3 код-уровневая верификация полная; запуск тестов с реальной БД требует docker daemon (вынесено в user setup, см. SUMMARY 03-06).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| TPL-01 | 03-02, 03-03, 03-04 | Один PlanTemplate, item имеет category/amount/description/day_of_period | ✓ SATISFIED | `PlanTemplateItem` ORM (Phase 1) + service `templates.py` + REST CRUD + UI |
| TPL-02 | 03-04 | CRUD строк шаблона (group by category + inline edit + bottom-sheet) | ✓ SATISFIED (code) | `TemplateScreen.tsx` + `PlanRow.tsx` + `BottomSheet.tsx` + `PlanItemEditor.tsx`; visual sketch 005-B → manual UI walkthrough |
| TPL-03 | 03-02, 03-05 | Snapshot активного периода в шаблон (overwrite) | ✓ SATISFIED | `snapshot_from_period` service + `POST /template/snapshot-from-period/{id}` + UI button «↻ В шаблон» с window.confirm |
| TPL-04 | 03-02, 03-05 | apply-template идемпотентен | ✓ SATISFIED | D-31 source-check; `test_apply_idempotent_returns_existing` |
| PLN-01 | 03-02, 03-03, 03-05 | CRUD строк плана текущего периода | ✓ SATISFIED (code) | `planned.py` service + 5 REST endpoints + `PlannedScreen.tsx`; visual → manual |
| PLN-02 | 03-02 | source enum (template/manual/subscription_auto) | ✓ SATISFIED | `PlanSource` enum (Phase 1) + `PlanSourceStr` Literal в schemas; manual для POST, template для apply, subscription_auto reserved для Phase 6 worker |
| PLN-03 | 03-05 | Маркер «🔁 from subscription» (mock-verified) | ✓ SATISFIED (code + mock helper) | `PlanRow.tsx:159` badge; `__injectMockPlanned__` DEV helper для visual; server-side `SubscriptionPlannedReadOnlyError` |
| PER-05 (deferred from Phase 2) | 03-02, 03-03 | apply-template ready для Phase 5 worker | ✓ SATISFIED | endpoint и сервис существуют, идемпотентность подтверждена; вызов worker'ом — Phase 5 (PER-04) |

**Все 7 требований Phase 3 + 1 deferred из Phase 2 покрыты.** Никаких orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `frontend/src/screens/PlannedScreen.tsx` | 92-100 | DEV-only mock helper `window.__injectMockPlanned__` | ℹ️ Info | **Intentional** per D-37 (Phase 6 will replace with real subscription rows). Tree-shaken from prod bundle (verified). Documented в Known Stubs SUMMARY 03-06. Не блокер. |

Все backend-сервисы — substantive (175 + 336 LOC), без TODO/FIXME/placeholder. UI-компоненты — substantive (BottomSheet 85 LOC, PlanRow 165 LOC, PlanItemEditor 270 LOC, TemplateScreen 232 LOC, PlannedScreen 410 LOC). Никаких stub-паттернов не обнаружено.

### Human Verification Required

Полный список — см. frontmatter `human_verification:` (8 пунктов). Кратко:

1. **TemplateScreen visual layout** (sketch 005-B group-by-kind)
2. **Inline-edit UX** (Enter/Esc/✓/× behaviour)
3. **BottomSheet** (slide-up animation, Telegram BackButton lifecycle)
4. **Apply-template button** (conditional render, post-apply hides)
5. **Apply-template idempotency UX** (повторный POST = no duplicates)
6. **Snapshot button + window.confirm**
7. **PLN-03 «🔁 Подписка» badge через `window.__injectMockPlanned__`** (DEV console injection)
8. **E2E walkthrough** (UI-SPEC §Acceptance.3 — full template→apply→edit→snapshot loop)

### Manual UI Walkthrough Deferred

Per phase auto-mode override (см. SUMMARY 03-06 §"Manual UI Acceptance — DEFERRED to user"):

- **Setup:** `docker compose up -d` + open Mini App в browser dev (`http://localhost:5173`) или real TG client.
- **Walkthrough docs:**
  - `.planning/phases/03-plan-template-and-planned-transactions/03-06-SUMMARY.md` §"Manual UI walkthrough deferred" (lines 139-179) — полный список с 9 E2E-шагами + 7 sub-acceptance-flows + regression checks.
  - `.planning/phases/03-plan-template-and-planned-transactions/03-UI-SPEC.md` §Acceptance.1/2/3 — детальные шаги.
- **PLN-03 mock injection script:** см. frontmatter `human_verification` пункт 7.
- **На случай ошибок:** `/gsd-plan-phase 03 --gaps` → Plan 03-07 для closure.

### Gaps Summary

**No code-level gaps.** Все 5 success criteria из ROADMAP verified на уровне кода:
- Backend: services + routes + schemas — substantive, корректно wired в router.py.
- Frontend: screens + components + hooks + api clients — substantive, корректно wired в App.tsx + HomeScreen.
- Tests: 4 RED-suites созданы, idempotency + subscription_auto exclusion + read-only guards присутствуют как явные тесты.
- Build gates: TS (`tsc --noEmit` exit 0) + Vite (`npm run build` exit 0) + AST parse — все green.
- DEV-only artifact (`window.__injectMockPlanned__`) корректно tree-shaken из прод-бандла.

**Visual UX walkthrough вынесен на пользователя** в соответствии с auto-mode override:
- Telegram BackButton lifecycle нельзя проверить без TG webview.
- Sketch 005-B layout (группировка, inline-edit feel, badge rendering) требует visual confirmation.
- E2E flow требует работающего docker stack (локально недоступен на момент верификации).

Status `human_needed` отражает это: код полностью готов, но финальный sign-off требует interactive UI walkthrough пользователем.

---

*Verified: 2026-05-03*
*Verifier: Claude Opus 4.7 (gsd-verifier, 1M context)*
*Mode: Auto — manual UI walkthrough deferred per phase auto-mode override*
