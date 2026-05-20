---
phase: 66-settings-ai-polish-v06
plan: 01
subsystem: ios-settings
tags: [ios, settings, theme-picker, v06, appstorage]
requires:
  - "Theme enum (FeaturesV10/Common/PosterTokens.swift)"
  - "@AppStorage('ui.theme') routing (App/AppRouter.swift)"
provides:
  - "ThemeOption pure helper (selected/rawValue/allOptions/ruLabel)"
  - "v06 Settings «Дизайн» native theme picker (4 selectable rows + checkmark)"
affects:
  - "ios/BudgetPlanner/Features/Management/SettingsView.swift"
tech-stack:
  added: []
  patterns:
    - "Foundation-only testable helper + SwiftUI Form rendering split (mirrors SubscriptionsViewData)"
    - "@AppStorage write-through theme switch (no manual notification)"
key-files:
  created:
    - "ios/BudgetPlanner/Features/Management/ThemeOption.swift"
    - "ios/BudgetPlannerTests/Features/Management/ThemeOptionTests.swift"
  modified:
    - "ios/BudgetPlanner/Features/Management/SettingsView.swift"
decisions:
  - "ThemeOption mirrors Theme.resolve: unknown raw → .maximalPoster; sentinel 'v06' → .legacyV06"
  - "Native Form Button rows + per-theme swatch + checkmark; no PosterRouter/.posterSheet (v06 outside poster context)"
metrics:
  duration: 2min
  completed: 2026-05-20
---

# Phase 66 Plan 01: v06 Settings Theme Picker Summary

Заменил в v06 `SettingsView` секции «Дизайн» одиночную кнопку «Переключить на V10» на полноценный native theme picker — 4 выбираемых ряда (MAXIMAL POSTER / LIQUID GLASS / IOS DEFAULT / СТАРЫЙ IOS) с per-theme swatch и checkmark у текущего выбора, пишущих `@AppStorage("ui.theme")` через чистый тестируемый `ThemeOption` helper.

## What Was Built

- **`ThemeOption`** (Foundation-only enum): `allOptions` (4 опции в порядке maximalPoster/liquidGlass/iosDefault/legacyV06), `selected(forRaw:)` (зеркалит `Theme.resolve` — неизвестный raw → `.maximalPoster`, sentinel `"v06"` → `.legacyV06`), `rawValue(for:)`, `ruLabel` («СТАРЫЙ IOS» для legacy, остальные = `Theme.ruLabel`).
- **`ThemeOptionTests`** — 14 unit-тестов: резолв всех raw, unknown/empty → maximalPoster, "v06" → legacyV06, rawValue для всех опций, round-trip по `allOptions`, порядок `allOptions`, ruLabel.
- **`designSection`** rewrite: `ForEach(ThemeOption.allOptions)` → Button-ряд с swatch + label + checkmark (`option == ThemeOption.selected(forRaw: themeRaw)`); каждый Button пишет `themeRaw = ThemeOption.rawValue(for: option)`; `accessibilityIdentifier("theme-<raw>")`; новый footer-пояснение. Без `PosterRouter`/`.posterSheet`/FeaturesV10-зависимостей.

## Verification

| Check | Result |
|-------|--------|
| `themeRaw = ThemeOption` в SettingsView | ✓ (line 200) |
| `ThemeOption.selected(forRaw:` в SettingsView | ✓ (line 196) |
| `PosterRouter\|posterSheet` count | 0 ✓ |
| Full test suite (iPhone 17 Pro) | 568 tests, 0 failures ✓ |
| Build (iPhone 17 Pro) | Build Succeeded ✓ |

VERIFY-ONLY (pre-existing, код не тронут):
- `aiSpendSection` AI cost cap display — present (SettingsView line 168) ✓
- AI chat SSE on `api/v1/ai/chat` + `/ai/history` + `/ai/conversation` — present (Networking/SSEClient.swift) ✓
- ManagementView rows accounts/savings/planEditor — present (ManagementView.swift) ✓

## Deviations from Plan

Verification check 7 в плане указывал `grep "ai/chat" ios/BudgetPlanner/Features/AI/`, но SSE-эндпоинт фактически живёт в `ios/BudgetPlanner/Networking/SSEClient.swift` (используется `AIChatView`). Подтверждено наличие `api/v1/ai/chat` + history/conversation там — verify-only цель удовлетворена, кода не менял. Не deviation в реализации, только уточнение пути проверки.

Otherwise: plan executed exactly as written.

## Commits

- `c9b5bb8` feat(66-01): ThemeOption pure helper + unit tests
- `9c33dde` feat(66-01): v06 Settings theme picker — 4 selectable rows + checkmark

## Notes

- `.xcodeproj` генерируется XcodeGen и gitignored — `xcodegen generate` выполнен перед build/test, в коммит не входит (только .swift источники).
- TDD: helper + тесты написаны вместе, тесты GREEN с первого прогона (14/14); RED-фаза не делалась отдельным коммитом — pure-helper паттерн фазы 62/63 (один feat-коммит helper+тесты).

## Self-Check: PASSED

All created files exist; both task commits present in git history.
