---
phase: 07-nav-refactor
plan: "01"
subsystem: frontend-tests
tags: [tdd, e2e, playwright, nav-refactor, red-gate]
dependency_graph:
  requires: []
  provides:
    - "E2E RED тесты для Phase 7 Nav Refactor (nav-v03.spec.ts)"
    - "Обновлённые home.spec.ts и ui-audit.spec.ts под nav v0.3"
  affects:
    - "frontend/tests/e2e/"
tech_stack:
  added: []
  patterns:
    - "TDD RED gate: тесты написаны до реализации, падают на текущем коде"
    - "self-contained mockApiRich: копия функции внутри spec-файла, не импорт"
key_files:
  created:
    - "frontend/tests/e2e/nav-v03.spec.ts"
  modified:
    - "frontend/tests/e2e/home.spec.ts"
    - "frontend/tests/e2e/ui-audit.spec.ts"
decisions:
  - "waitForLoad ждёт button[aria-label=\"Главная\"] — маркер работает для обоих nav (старого и нового)"
  - "mockApiRich скопирована внутрь nav-v03.spec.ts для самодостаточности теста"
  - "Добавлен mock для /api/v1/planned с 2 строками (source: manual и template) для txn-03"
metrics:
  duration: "7 minutes"
  completed_date: "2026-05-05T17:30:29Z"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 3
---

# Phase 7 Plan 01: RED E2E Tests for Nav Refactor Summary

**One-liner:** 10 Playwright e2e тестов для nav v0.3 (Транзакции/Аналитика/AI/Управление) — все FAILED на текущем коде (TDD RED gate), + обновлены home.spec.ts и ui-audit.spec.ts под новые aria-labels.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Написать RED тесты nav-v03.spec.ts | 0ff6579 | frontend/tests/e2e/nav-v03.spec.ts |
| 2 | Обновить существующие тесты под новый nav | fd6b9cd | frontend/tests/e2e/home.spec.ts, ui-audit.spec.ts |

## What Was Built

### nav-v03.spec.ts

Новый spec-файл с 10 тестами, покрывающими требования NAV-01, NAV-02, TXN-01..TXN-05, MGT-01, MGT-02 и placeholder:

- **nav-01**: Проверяет ровно 5 новых табов (Главная/Транзакции/Аналитика/AI/Управление) и отсутствие старых (История/Подписки/Ещё)
- **nav-02**: AI таб при активации имеет CSS классы `ai` и `active`
- **txn-01**: Таб Транзакции содержит SubTabBar с кнопками «История» и «План»
- **txn-02**: История группирует транзакции по дням с day-header, показывающим total
- **txn-03**: Под-таб «План» показывает source-badge (template / manual)
- **txn-04**: Фильтр-чипы «Все», «Расходы», «Доходы» видны в Транзакциях
- **txn-05**: FAB «Добавить транзакцию» в под-табе История открывает BottomSheet «Новая транзакция»
- **mgt-01**: Таб Управление показывает 4 пункта: Подписки, Шаблон бюджета, Категории, Настройки
- **mgt-02**: Клик «Подписки» в Управлении открывает SubscriptionsScreen (видна Netflix)
- **placeholder**: Аналитика и AI показывают текст «Скоро будет»

**RED gate подтверждён:** все 10 тестов FAILED (не ERROR) на текущем коде.

### home.spec.ts

Тест «home screen shows bottom navigation tabs» обновлён — старые лейблы (История/Подписки/Ещё) заменены на Транзакции/Аналитика/AI/Управление.

### ui-audit.spec.ts

- audit-03: `button[aria-label="История"]` → `button[aria-label="Транзакции"]`, скриншот `03-transactions.png`
- audit-04: `button[aria-label="Подписки"]` → `button[aria-label="Управление"]`, скриншот `04-management.png`
- audit-05: `button[aria-label="Ещё"]` → Управление → клик «Подписки» в меню, скриншот `05-management-subscriptions.png`
- audit-06: `button[aria-label="Ещё"]` → `button[aria-label="Управление"]`
- audit-07: `button[aria-label="Добавить факт-трату"]` → `button[aria-label="Добавить транзакцию"]`
- audit-10: fallback клик `button[aria-label="История"]` → `button[aria-label="Транзакции"]`

## Deviations from Plan

None — plan executed exactly as written.

## TDD Gate Compliance

| Gate | Status | Commit |
|------|--------|--------|
| RED (test commit) | PASSED | 0ff6579 — all 10 tests FAILED on current code |
| GREEN (feat commit) | N/A — Wave 0, GREEN gate is Phase 7 completion |

Wave 0 is intentionally RED-only. GREEN will be confirmed after Plans 02-06 implement the new nav.

## Verification

- `frontend/tests/e2e/nav-v03.spec.ts` — 10 тестов, синтаксических ошибок нет
- Все 10 тестов FAILED на текущем коде (RED state подтверждён)
- `home.spec.ts`: `grep -c "Транзакции"` = 1, `grep -c "История"` = 0
- `ui-audit.spec.ts`: `grep -c 'aria-label="Управление"'` = 3, `grep -c 'aria-label="Ещё"'` = 0
- TypeScript компилируется без ошибок: `npx tsc --noEmit` → 0 ошибок

## Self-Check: PASSED

- [x] `frontend/tests/e2e/nav-v03.spec.ts` — FOUND
- [x] `frontend/tests/e2e/home.spec.ts` — FOUND (modified)
- [x] `frontend/tests/e2e/ui-audit.spec.ts` — FOUND (modified)
- [x] Task 1 commit 0ff6579 — EXISTS
- [x] Task 2 commit fd6b9cd — EXISTS
