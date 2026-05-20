---
phase: 66-settings-ai-polish-v06
verified: 2026-05-20T18:20:00Z
status: human_needed
score: 6/6 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Запуск на симуляторе/устройстве iPhone 17 Pro; открыть v06 Settings → секция «Дизайн»; tap по LIQUID GLASS"
    expected: "Чекмарк перемещается на LIQUID GLASS; AppRouter реактивно переключает на V10MainShell с темой liquid_glass"
    why_human: "Runtime-поведение @AppStorage→AppRouter re-evaluation и визуальное переключение шелла не проверяемы grep'ом"
  - test: "В Settings tap «СТАРЫЙ IOS», перезапустить приложение"
    expected: "Шелл остаётся MainShell (v06); выбор персистит после рестарта (@AppStorage('ui.theme') == 'v06')"
    why_human: "Персист между запусками и no-op-stay на MainShell — runtime-поведение"
  - test: "Полный прогон iOS-тестов: cd ios && xcodegen generate && xcodebuild test -scheme BudgetPlanner -destination 'platform=iOS Simulator,name=iPhone 17 Pro'"
    expected: "Сборка зелёная; 568 тестов проходят, 0 failures (включая 14 ThemeOptionTests)"
    why_human: "Сборка/тест-ран требует Xcode toolchain; не выполняется в статической верификации (.xcodeproj gitignored, генерируется XcodeGen)"
---

# Phase 66: Settings + AI + Management Polish (v06 native) Verification Report

**Phase Goal:** Settings parity с V10 (theme picker, AI cost cap display). AI-чат — оставить v06 AIChatView с подключением v1.0 ai/chat SSE. Management Hub — оставить List как есть, добавить ряды для новых доменов (Accounts, Savings, Plan).

**Verified:** 2026-05-20T18:20:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

Net-new deliverable Phase 66 = theme picker (область 1). Области 2-4 — verify-only (pre-existing). Все шесть must-have-truths подтверждены в коде. Status = human_needed только из-за runtime-смоука (переключение шелла + персист) и тест-рана — классифицированы как human_verification, НЕ как gaps.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | v06 Settings «Дизайн» показывает 4 выбираемых ряда (MAXIMAL POSTER / LIQUID GLASS / IOS DEFAULT / СТАРЫЙ IOS) | ✓ VERIFIED | `SettingsView.swift:198` `ForEach(ThemeOption.allOptions)`; `ThemeOption.allOptions` = `[.maximalPoster,.liquidGlass,.iosDefault,.legacyV06]` (ThemeOption.swift:23-25); ruLabel'ы — «MAXIMAL POSTER»/«LIQUID GLASS»/«IOS DEFAULT»/«СТАРЫЙ IOS» (PosterTokens.swift:76-80 + ThemeOption.swift:54) |
| 2 | Текущий выбор отмечен checkmark (резолв из @AppStorage('ui.theme')) | ✓ VERIFIED | `SettingsView.swift:196` `let current = ThemeOption.selected(forRaw: themeRaw)`; `:207` `if option == current { Image(systemName:"checkmark") }` |
| 3 | Tap по V10-теме → пишет ui.theme → AppRouter переключает на V10MainShell | ✓ VERIFIED | `SettingsView.swift:200` `themeRaw = ThemeOption.rawValue(for: option)`; AppRouter.swift:5,12,36-39: `isLegacyV06Shell = themeRaw=="v06"`; non-v06 → `V10MainShell()` |
| 4 | Tap «СТАРЫЙ IOS» → пишет 'v06' → шелл остаётся MainShell (no-op-stay) | ✓ VERIFIED | `ThemeOption.rawValue(for:.legacyV06)=="v06"` (ThemeOption.swift:44); AppRouter.swift:36-37 `if isLegacyV06Shell { MainShell() }` |
| 5 | Выбор персистит между перезапусками (@AppStorage) | ✓ VERIFIED | `@AppStorage("ui.theme")` в SettingsView.swift:75 и AppRouter.swift:5 — общий ключ, идентичный default `Theme.maximalPoster.rawValue` (runtime-персист → human #2) |
| 6 | VERIFY-ONLY pre-existing: aiSpendSection + AI chat SSE на v1.0 + Management rows accounts/savings/planEditor | ✓ VERIFIED | aiSpendSection (SettingsView.swift:167-187, поля UserDTO.aiSpendCents/aiSpendingCapCents); SSEClient.swift:103 POST `api/v1/ai/chat`, AIChatView.swift:52 `AIChatAPI.stream`; ManagementView.swift:145-173 `.accounts/.savings/.planEditor` ряды + destinations :114-118 |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `ios/BudgetPlanner/Features/Management/ThemeOption.swift` | Foundation-only enum + selected/rawValue/allOptions/ruLabel | ✓ VERIFIED | 57 строк, `import Foundation` (no SwiftUI), все 4 кейса + helpers; зеркалит Theme.resolve (unknown→maximalPoster), "v06"→legacyV06 |
| `ios/BudgetPlanner/Features/Management/SettingsView.swift` | designSection с 4 selectable Button-рядами + checkmark, bound to @AppStorage | ✓ VERIFIED | designSection :195-224 переработан; 0 ссылок на PosterRouter/posterSheet/FeaturesV10; aiSpendSection не тронут |
| `ios/BudgetPlannerTests/Features/Management/ThemeOptionTests.swift` | Unit-тесты резолва/round-trip | ✓ VERIFIED | 14 `func test` (по запланированному; покрывает resolve всех raw, unknown/empty→maximalPoster, rawValue, round-trip, allOptions order, ruLabel) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| SettingsView designSection | @AppStorage('ui.theme') themeRaw | `themeRaw = ThemeOption.rawValue(for: option)` | ✓ WIRED | SettingsView.swift:200 |
| SettingsView designSection | ThemeOption.selected(forRaw:) | checkmark для `option == current` | ✓ WIRED | SettingsView.swift:196,207 |
| @AppStorage('ui.theme') | AppRouter shell switch | `isLegacyV06Shell = themeRaw=="v06"` → MainShell/V10MainShell | ✓ WIRED | AppRouter.swift:5,12,36-39 (общий ключ, идентичный default) |
| AIChatView | AIChatAPI.stream (v1.0 SSE) | `for try await event in AIChatAPI.stream(message:)` | ✓ WIRED | AIChatView.swift:52 → SSEClient.swift:103 POST api/v1/ai/chat |
| ManagementView | accounts/savings/planEditor destinations | NavigationLink(value: item.id) → destination(for:) | ✓ WIRED | ManagementView.swift:114-118,145-173 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| designSection | `current = ThemeOption.selected(forRaw: themeRaw)` | @AppStorage('ui.theme') (persisted) | Yes — реальное значение из UserDefaults, идентичный default с AppRouter | ✓ FLOWING |
| aiSpendSection | `user.aiSpendCents/aiSpendingCapCents` | AuthStore.authenticated UserDTO (из /me) | Yes — реальные поля DTO (CommonDTO.swift:10-11, MeAPI.swift:41-42) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Полный тест-ран / сборка | `xcodebuild test … iPhone 17 Pro` | Требует Xcode toolchain; .xcodeproj gitignored (XcodeGen) | ? SKIP → human #3 |

Step 7b: частично SKIPPED — iOS-сборка/тест-ран не выполняется в статической верификации; вынесено в human_verification. SUMMARY заявляет 568 tests / 0 failures + Build Succeeded; REVIEW (standard depth) подтвердил корректность кода (0 critical, 0 warning, 2 info).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| MGMT-V06-THEME | 66-01-PLAN | Theme picker в v06 Settings (тестируемое ядро + 4 ряда picker) | ✓ SATISFIED | ThemeOption helper + designSection + 14 тестов (truths 1-5, артефакты выше) |

Активная REQUIREMENTS.md не содержит ID для Phase 66 (v1.1.2 CONTEXT-derived scope) — orphaned requirements отсутствуют.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| SettingsView.swift | 230-241 | Hardcoded swatch RGB literals дублируют V10 token-цвета | ℹ️ Info | Косметика; могут разойтись с token-источником (REVIEW IN-01). Не функциональный дефект |
| ThemeOption.swift | 13 | Объявлен `Equatable`, неявно опирается на `Hashable` для `id:\.self` | ℹ️ Info | Компилируется (payload-free enum неявно Hashable); рекомендация явно объявить Hashable (REVIEW IN-02) |

Ни одного blocker/warning. Стабовых паттернов (TODO/placeholder/return null/empty handler) не найдено в изменённых файлах.

### Human Verification Required

1. **Переключение на V10-тему** — открыть v06 Settings → «Дизайн» → tap LIQUID GLASS.
   Ожидание: чекмарк переходит на LIQUID GLASS; шелл переключается на V10MainShell (liquid_glass).
   Почему человек: runtime @AppStorage→AppRouter re-evaluate + визуал.

2. **No-op-stay + персист** — tap «СТАРЫЙ IOS», перезапустить приложение.
   Ожидание: остаётся MainShell; выбор сохраняется (ui.theme=='v06').
   Почему человек: персист между запусками — runtime.

3. **Сборка + тест-ран** — `cd ios && xcodegen generate && xcodebuild test … iPhone 17 Pro`.
   Ожидание: Build Succeeded; 568 тестов, 0 failures (вкл. 14 ThemeOptionTests).
   Почему человек: требует Xcode toolchain; .xcodeproj генерируется XcodeGen.

### Gaps Summary

Гэпов нет. Единственный net-new deliverable (theme picker) полностью реализован и провязан: чистый тестируемый ThemeOption helper (зеркалит Theme.resolve, sentinel "v06"), 4 selectable ряда с checkmark, запись в общий @AppStorage('ui.theme'), реактивное переключение шелла через AppRouter. Все три verify-only области (AI cost cap display, AI chat SSE на v1.0, Management rows accounts/savings/planEditor) подтверждены present и не тронуты. Открыты только runtime/смоук-проверки (переключение шелла, персист, тест-ран) — классифицированы как human_verification, не блокируют завершение фазы.

---

_Verified: 2026-05-20T18:20:00Z_
_Verifier: Claude (gsd-verifier)_
