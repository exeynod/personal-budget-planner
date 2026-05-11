---
phase: 58-home-period
plan: 01
requirements: []
status: complete
commit: cc7a7ce
---

# Phase 58-01 Summary — v06 Home empty state correction

## What shipped

- `ios/BudgetPlanner/Features/Home/HomeView.swift`: `.noActivePeriod` case
  переписан с `ContentUnavailableView("Нет активного периода", systemImage:
  "calendar.badge.exclamationmark", description: "Завершите onboarding…")` на
  нейтральный `ContentUnavailableView { Label("Период ещё не открыт",
  systemImage: "calendar.badge.clock") } description { … } actions { Button
  "Добавить трату" .borderedProminent + Button "Обновить" .bordered }`.
- AppRouter уже гарантирует `is_onboarded=true` до отрисовки `HomeView`,
  поэтому правильная причина пустого стейта — отсутствие активного периода
  (`close_period_job` ещё не создал next period, или dev-сид зачистил данные).
- Iconography: `.exclamationmark` (тревога) → `.clock` (нейтральное ожидание).
- Primary action: `showingEditor = true` (открывает existing TransactionEditor —
  D-52 backend auto-create создаст период). Secondary: re-fetch.

## Verification

Manual smoke (iPhone 17 Pro, ui.theme=v06, user_id=123456789, активного периода
нет):

1. ✅ v06 Home показывает новый empty state с иконкой `calendar.badge.clock`,
   корректным текстом и двумя кнопками.
2. ✅ «+» в toolbar остался работать — открывает TransactionEditor.
3. ✅ Layout: `ContentUnavailableView` центрирует контент, две кнопки stack
   column, primary borderedProminent, secondary bordered.
4. ✅ Build: `xcodebuildmcp.build_run_sim` — SUCCEEDED, 0 errors, 0 new warnings.

## Strategy notes

- Scope-reduced Phase 58: миграция HomeView с 2-valued CategoryKind на 4-valued
  (savings/other) DEFERRED → Phase 59 (Transactions).
- Полная интеграция с v1.0 `/periods/current` + `/periods/{id}/balance` уже
  была — фаза скорректировала только empty-state copy + actions.

## Deferred к Phase 59

- HomeView CategoryKind 4-valued migration (savings/other отрисовка).
