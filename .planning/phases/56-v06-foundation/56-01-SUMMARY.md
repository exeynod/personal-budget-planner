---
phase: 56-v06-foundation
plan: 01
requirements: []
status: complete
commit: 68612c0
---

# Phase 56-01 Summary — v06 ↔ V10 theme toggle foundation

## What shipped

- `ios/BudgetPlanner/App/AppRouter.swift`: default `@AppStorage("ui.theme")` →
  `Theme.maximalPoster.rawValue` (раньше `"v10"`); удалён whitelist `["v06", "v10"]`
  и self-heal перезапись; условие switch: `themeRaw == "v06"` → `MainShell`, иначе
  → `V10MainShell`.
- `ios/BudgetPlanner/Features/Management/SettingsView.swift`: новая секция «Дизайн»
  с `Button(LabeledContent)` «Переключить на V10 → MAXIMAL POSTER», который пишет
  `themeRaw = Theme.maximalPoster.rawValue`.
- `ios/BudgetPlanner/FeaturesV10/Management/ThemePickerSheet.swift`: содержимое
  обёрнуто в `ScrollView` (4 опции под таб-баром); добавлен legacy-row «СТАРЫЙ IOS»
  с домик-иконкой, пишет `themeRaw = "v06"` + dismiss sheet.

## Verification

Manual smoke в симуляторе (iPhone 17 Pro, iOS 26.4):

1. ✅ Старт в v10 (default) — orange maximal_poster home.
2. ✅ Switch to v06: Settings v10 → ТЕМА → СТАРЫЙ IOS → native iOS home.
3. ✅ Switch back: v06 → Управление → Настройки → Переключить на V10 → orange MP home.
4. ✅ `com.exeynod.BudgetPlanner.plist`: `ui.theme` корректно обновляется.
5. ✅ Build: `xcodebuildmcp.build_run_sim` — SUCCEEDED, 0 errors, 0 new warnings.

## Strategy notes

- v1.1.2 — opening milestone; цель — сделать тумблер рабочим в обе стороны и снять
  AppRouter self-heal, чтобы дальнейшие v06 phases имели «вход» в native экраны.
- `MainShell` (v06) и `V10MainShell` сосуществуют — параллельная разработка
  без удаления V10.

## Out of scope

См. `56-CONTEXT.md` секция «Known Issues / Follow-ups».
