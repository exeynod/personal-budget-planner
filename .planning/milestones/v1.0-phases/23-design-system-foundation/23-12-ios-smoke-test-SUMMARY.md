---
plan: 23-12
phase: 23
status: complete
date: 2026-05-10
requirements: [DS-03, DS-04, DS-05, DS-06, DS-07, DS-08]
human_verification: needed
---

# Plan 23-12 — iOS Smoke Test Summary

## Verified ✓

| # | Item | Method | Result |
|---|------|--------|--------|
| 1 | iOS Xcode build clean | `cd ios && make build` | **Build Succeeded** (xcbeautify, iPhone 17 Pro simulator, Debug) |
| 2 | All 5 TTF fonts bundled | `ls ios/BudgetPlanner/Resources/Fonts/*.ttf` | 5 files present (Manrope, JetBrains Mono, Archivo Black, DM Serif Display Italic, PT Serif Italic) |
| 3 | UIAppFonts in plist | `grep UIAppFonts ios/BudgetPlanner/Info.plist` | Present with 5 entries (per plan 23-03) |
| 4 | All 10 components Swift files | `ls ios/BudgetPlanner/FeaturesV10/Common/*.swift` | 11 component-related files (per plan 23-07) + 5 nav primitive files (per plan 23-08) |
| 5 | PosterTokens generated | `cat ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift` | Coral, cobalt, yellow, etc. with hex values per design tokens (plan 23-01) |
| 6 | V10MainShell + AppRouter switch | grep `@AppStorage("ui.theme")` in `App/AppRouter.swift` | Present (plan 23-10) |
| 7 | PreviewGallery renders 10 components + 11 animations | grep component-name + animation-name hits in `FeaturesV10/PreviewGallery.swift` | 35 component refs + 28 animation refs (plan 23-10) |
| 8 | Cyrillic vs Latin glyph routing setup | PreviewGallery contains both «Май» (cyrillic, expects PT Serif Italic) and "May" (Latin, expects DM Serif Display Italic) | Strings present, fonts loaded by name from bundle |

## Deferred to Phase 28 Acceptance ⚠

These items require running a full simulator session or real device — not feasible in autonomous agent loop without authenticated backend:

| # | Item | Why deferred |
|---|------|--------------|
| 1 | Live `make run` simulator session of V10MainShell PreviewGallery | iOS app bootstraps via auth → calls `MeAPI.current()` against backend. Backend not running in this autonomous session, and `@AppStorage("ui.theme")="v10"` doesn't bypass the auth flow. Phase 28 acceptance will spin up full docker stack + iOS sim. |
| 2 | XcodeBuildMCP screenshot capture of PreviewGallery rendering | Requires (1) above. |
| 3 | PosterNavStack push 3 screens → swipe-back → assert top of stack — real device test (iPhone 11/Pro per ROADMAP SC #5) | UIScreenEdgePanGestureRecognizer behaves differently in simulator (mouse drag vs real edge swipe). ADR-002 explicitly requires real-device verification. |
| 4 | Accessibility VoiceOver verification («Назад» label + `.isButton` trait) | Requires real device + VoiceOver enabled. Manual procedure documented in ADR-002. |
| 5 | `prefers-reduced-motion` / `accessibilityReduceMotion` reducer test | Requires changing iOS Settings → Accessibility → Reduce Motion, observing PreviewGallery animations collapse to opacity-only. Manual test. |
| 6 | Cyrillic glyph routing visual smoke (PT Serif Italic actually rendering for «Май») | Web-side covered by Playwright in plan 23-11. iOS-side requires sim or device screenshot since SwiftUI doesn't expose computed font name programmatically. |
| 7 | iOS dual-shell flip — set `@AppStorage("ui.theme")="v06"` and verify legacy MainShell appears, then back to "v10" | Requires sim with backend or simulator preview UI wiring. |

## Phase 28 Acceptance Procedure (recommended)

Per ROADMAP SC #5/#6 + this plan's deferred list:

1. `make up` (docker compose) — backend stack running
2. `cd ios && make run` (or open `BudgetPlanner.xcodeproj` and Cmd-R to iPhone 17 Pro simulator)
3. Authenticate via TG initData mock or seed an `AppUser` row
4. Confirm V10MainShell renders PreviewGallery (default theme `"v10"`)
5. Visual smoke: cyrillic «Май» italic, Latin "May" italic — fonts distinct
6. Tap each animation trigger — observe motion (then enable Reduce Motion → re-verify all collapse)
7. Push 3 screens → manual edge-swipe-back × 3 — verify stack pops correctly
8. VoiceOver: navigate to back-area → hear «Назад, button»
9. Switch theme to `"v06"` via debug toggle — verify legacy MainShell renders unchanged
10. Run on real iPhone (Denis test device) for ADR-002 closure

## Files Touched

None — verification-only plan.

## Commits

None — this SUMMARY is the only artifact.

## Plan Status

✓ COMPLETE — all autonomous-verifiable acceptance criteria met. Live-simulator items documented for Phase 28.
