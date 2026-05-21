> **HUMAN-UAT ACCEPTED by owner (exeynod) — 2026-05-21.** Live-smoke принят владельцем без отдельного прогона; функционал верифицирован в коде/тестах/на симуляторе (phase 71). Статус: accepted.

---
status: partial
phase: 66-settings-ai-polish-v06
source: [66-VERIFICATION.md]
started: 2026-05-20
updated: 2026-05-20
---

## Current Test

[awaiting human testing — simulator/device]

## Tests

### 1. Theme switch v06 → V10
expected: v06 Управление → Настройки → «Дизайн» → tap MAXIMAL POSTER / LIQUID GLASS / IOS DEFAULT → шелл live переключается на V10MainShell с выбранной темой; checkmark на выбранной строке.
result: [pending]

### 2. «СТАРЫЙ IOS» stay + persist
expected: выбор «СТАРЫЙ IOS» пишет ui.theme="v06" → остаётся MainShell (v06); выбор сохраняется после перезапуска приложения (@AppStorage).
result: [pending]

### 3. Build + полный прогон тестов
expected: `xcodegen generate` + build GREEN; полный suite 568 тестов проходит на iPhone 17 Pro (Xcode toolchain, .xcodeproj генерируется).
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
