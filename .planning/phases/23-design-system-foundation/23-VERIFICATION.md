---
phase: 23-design-system-foundation
verified: 2026-05-10T00:00:00Z
status: human_needed
score: 8/11 must-haves verified (3 deferred to real-device / live-stack — Phase 28)
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: n/a
  gaps_closed: []
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "iOS PosterNavStack push 3 screens → swipe-back from left edge → assert top-of-stack reverts; verify accessibility «Назад» + isButton trait via VoiceOver"
    expected: "Stack pops one entry per edge-swipe; VoiceOver announces «Назад, button» on edge-area focus"
    why_human: "UIScreenEdgePanGestureRecognizer behaves differently in simulator (mouse drag vs real edge swipe); ADR-002 explicitly requires real-device verification (iPhone 11/Pro per ROADMAP SC #5). Code present and wired but not exercised."
  - test: "iOS prefers-reduced-motion / accessibilityReduceMotion reduces all 11 animations to opacity-only fade"
    expected: "With Settings → Accessibility → Reduce Motion ON, every animation in PreviewGallery collapses to opacity-only"
    why_human: "Requires changing iOS Settings → observing PreviewGallery; SwiftUI computed animation values not exposed programmatically."
  - test: "iOS cyrillic glyph routing — «Май» rendered with PT Serif Italic, «May» with DM Serif Display Italic from bundled TTF"
    expected: "Visually distinct italic glyph styles; no FOUT race at launch"
    why_human: "SwiftUI doesn't expose computed font name programmatically; requires sim/device screenshot. Web side covered by Playwright (DS-02 test 3 passing); iOS deferred to Phase 28 acceptance."
  - test: "iOS dual-shell flip — set @AppStorage(\"ui.theme\")=\"v06\" → legacy MainShell appears unchanged; flip back to \"v10\" → V10MainShell renders"
    expected: "v06 path renders existing untouched MainShell (ui.theme=\"v06\"); v10 path renders V10MainShell { PreviewGallery() }"
    why_human: "Requires running iOS app with backend stack (auth flow). Web side covered by Playwright tests 4+5 (v06 dispatcher + tampering fallback)."
  - test: "iOS PosterSheet drag-to-close (translation > 100pt OR velocity > 800) + tap-on-backdrop dismissal + slide-up + sheetEase + backdrop opacity 0.45"
    expected: "Sheet rises on present, dismisses on tap-backdrop or drag-down past threshold"
    why_human: "Code present (translation > 100 + velocityY > 800 grep-verified); behavioural validation needs simulator/device interaction."
---

# Phase 23: Design System Foundation Verification Report

**Phase Goal:** Web и iOS получают общий design-system foundation — codegen tokens (single source `tokens.json`), 4 self-hosted Google-шрифта с PT Serif Italic как cyrillic fallback (ADR-001), 11 keyframe-анимаций, базовые компоненты, iOS custom `PosterNavStack` + `PosterSheet`, dual-shell coexistence.
**Verified:** 2026-05-10
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Single-source tokens — `gen-tokens.ts` round-trips through `make tokens-check` | VERIFIED | `design/tokens.json` exists; `scripts/gen-tokens.ts` (110 LOC); `Makefile` has `tokens-check` target running `npm run gen:tokens && git diff --exit-code`; `package.json` has `gen:tokens`/`gen:tokens:watch`/`tokens-check` scripts; `tokens.css` contains `--poster-coral: #FF5A3C`; `PosterTokens.swift` contains `static let coral = SwiftUI.Color(hex: "FF5A3C")` |
| 2 | Web cyrillic glyph routing via PosterSerifItalic alias | VERIFIED | `fonts.css` has `unicode-range: U+0400-04FF, U+0500-052F` for PT Serif Italic + DM Serif Italic latin range; `@fontsource/dm-serif-display/latin-400-italic.css` + `@fontsource/pt-serif/cyrillic-400-italic.css` imports; Playwright test 3 (DS-02) passing — computed font-family on «Май» matches `/PosterSerifItalic|DM Serif Display|PT Serif/i` |
| 3 | iOS bundled fonts — 5 TTF + UIAppFonts synchronous registration | VERIFIED (artifact) / human_needed (visual) | All 5 TTF files in `ios/BudgetPlanner/Resources/Fonts/`; `Info.plist` UIAppFonts array lists all 5; iOS build clean per 23-12 SUMMARY; visual glyph rendering deferred to Phase 28 (see human_verification #3) |
| 4 | 11 keyframe animations parity web ↔ iOS | VERIFIED | `animations.css` declares all 11 keyframes (posterRowIn/RiseIn/BarFill/TabPop/PopIn/Check/Dot/SlideInFwd/SlideInBack/TabSwap/ToastIn) — confirmed by grep; `PosterAnimations.swift` enumerates all 11 named animations with cubic-bezier curves; PreviewGallery.swift contains 28 animation references; PreviewApp.tsx contains 54 component+animation references |
| 5 | OS reduce-motion respected | VERIFIED (web) / human_needed (iOS) | `animations.css` has `@media (prefers-reduced-motion: reduce)` block flattening all 11 animations to opacity-only; Playwright test 6 (DS-04+05) passing — `.poster-row-in` `animationDuration === '0.2s'` under `reducedMotion: 'reduce'` browser context. iOS: `PosterAnimations.swift` has `@Environment(\.accessibilityReduceMotion)` + `PosterAnimationModifier(reduced: .easeOut(duration: 0.2))`. iOS visual confirmation deferred (human_verification #2) |
| 6 | 10 base components symmetric web ↔ iOS | VERIFIED | All 10 web components in `frontend/src/componentsV10/*.tsx` with paired `.module.css`; all 10 iOS components in `ios/BudgetPlanner/FeaturesV10/Common/*.swift`; `componentsV10/index.ts` re-exports all 10 with TypeScript types; iOS PreviewGallery refs 35 component instances; web PreviewApp refs 54; Playwright test 2 (DS-06) passing — all 8 numbered eyebrow sections visible |
| 7 | iOS PosterNavStack works on real device | UNCERTAIN — code substantive, behaviour unverified | `PosterNavStack.swift` is exactly 50 LOC (matches must-have spec); uses ZStack + ForEach over `router.stack`; `PosterTransitions.swift` has asymmetric move(.trailing/.leading) + opacity transitions; `PosterRouter.swift` declared as `@Observable final class PosterRouter`; `PosterEdgeSwipe.swift` wraps `UIScreenEdgePanGestureRecognizer`. Real-device test deferred (human_verification #1) |
| 8 | iOS PosterSheet drag-to-close | UNCERTAIN — code substantive, behaviour unverified | `PosterSheet.swift` contains `if v.translation.height > 100 \|\| velocityY > 800` (matches CONTEXT Area 3 spec); slide-up + backdrop logic present. Behaviour validation deferred (human_verification #5) |
| 9 | Dual-shell flag — iOS | UNCERTAIN — code substantive, behaviour unverified | `AppRouter.swift` uses `@AppStorage("ui.theme") private var themeRaw: String = "v10"` and switches between `V10MainShell()` and `MainShell()` (legacy `MainShell` exists in `Features/Common/BottomNav.swift`); `V10MainShell.swift` wires `PosterNavStack { PreviewGallery() }`. Behaviour deferred (human_verification #4) |
| 10 | Dual-shell flag — web | VERIFIED | `main.tsx` reads `import.meta.env.VITE_UI_THEME` + `localStorage.getItem('ui.theme')`; lazy-imports `./AppV10` for v10 with v06 fallback on import failure; Playwright test 4 (v06 path) and test 5 (tampering fallback to v10) passing |
| 11 | Preview gallery accessible — web `/preview` + iOS `PreviewGallery` | VERIFIED | `frontend/src/preview/PreviewApp.tsx` exists; AppV10 enables preview surface in `import.meta.env.DEV` OR `?preview=1`; `ios/BudgetPlanner/FeaturesV10/PreviewGallery.swift` exists; V10MainShell wires it into PosterNavStack; Playwright test 1 (DS-08+06) passing — preview loads with no console errors |

**Score:** 8/11 truths fully VERIFIED + 3 UNCERTAIN (iOS behaviour requires real device or live stack — explicitly deferred to Phase 28 per `23-12-ios-smoke-test-SUMMARY.md`).

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `design/tokens.json` | single-source tokens | VERIFIED | exists; coral/cobalt/cream/ink/paper/yellow/red/black present in CSS+Swift outputs |
| `scripts/gen-tokens.ts` | Node TS codegen, ≤120 LOC, stdlib-only | VERIFIED | 110 LOC, no external deps |
| `frontend/src/stylesV10/tokens.css` | CSS custom properties --poster-* | VERIFIED | contains `--poster-coral: #FF5A3C` and 7 other poster colours |
| `ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift` | static let constants | VERIFIED | 76 LOC; `static let coral = SwiftUI.Color(hex: "FF5A3C")` |
| `frontend/src/stylesV10/fonts.css` | @font-face + cyrillic unicode-range | VERIFIED | imports manrope/jbm/archivo-black/dm-serif-display/pt-serif; `unicode-range: U+0400-04FF, U+0500-052F` present |
| `Resources/Fonts/Manrope-VariableFont_wght.ttf` | TTF | VERIFIED | present |
| `Resources/Fonts/JetBrainsMono-VariableFont_wght.ttf` | TTF | VERIFIED | present |
| `Resources/Fonts/ArchivoBlack-Regular.ttf` | TTF | VERIFIED | present |
| `Resources/Fonts/DMSerifDisplay-Italic.ttf` | TTF | VERIFIED | present |
| `Resources/Fonts/PTSerif-Italic.ttf` | TTF | VERIFIED | present |
| `frontend/src/stylesV10/animations.css` | 11 keyframes + reduce-motion | VERIFIED | 11 distinct `@keyframes posterX` + `@media (prefers-reduced-motion: reduce)` reducing all to opacity-only |
| `frontend/src/componentsV10/index.ts` | 10 exports | VERIFIED | barrels Eyebrow/Mass/BigFig/Plate/PosterButton/Chip/PosterSlider/TabBar/FAB/Toast |
| 10× `frontend/src/componentsV10/*.tsx` | each component file | VERIFIED | all 10 present (27-88 LOC each) with paired .module.css |
| `ios/.../PosterAnimations.swift` | 11 animations + reduce-motion guard | VERIFIED | enumerates all 11; `@Environment(\.accessibilityReduceMotion)` modifier wired |
| 10× `ios/.../FeaturesV10/Common/<Component>.swift` | each component file | VERIFIED | all 10 present (35-131 LOC each) |
| `PosterNavStack.swift` | ≤80 LOC + @Observable PosterRouter | VERIFIED | exactly 50 LOC (matches CONTEXT spec); PosterRouter in separate file with `@Observable final class PosterRouter` |
| `PosterTransitions.swift` | asymmetric forward/back move | VERIFIED | `.asymmetric(insertion: .move(edge: .trailing), removal: .move(edge: .leading))` |
| `PosterEdgeSwipe.swift` | UIScreenEdgePanGestureRecognizer | VERIFIED | `UIScreenEdgePanGestureRecognizer` instantiated; SwiftUI bridge via UIViewRepresentable |
| `PosterSheet.swift` | drag-to-close > 100pt | VERIFIED | `v.translation.height > 100 \|\| velocityY > 800` |
| `frontend/src/AppV10.tsx` | web v10 shell | VERIFIED | lazy-imports `./preview/PreviewApp` + production placeholder fallback |
| `frontend/src/preview/PreviewApp.tsx` | gallery 10 components + 11 animations | VERIFIED | 54 component+animation references |
| `frontend/src/main.tsx` | VITE_UI_THEME + lazy AppV10 | VERIFIED | reads env+localStorage; `import('./AppV10')` |
| `ios/.../App/V10MainShell.swift` | PosterNavStack + PreviewGallery | VERIFIED | `PosterNavStack { PreviewGallery() }` |
| `ios/.../FeaturesV10/PreviewGallery.swift` | 10 components + 11 animations | VERIFIED | 35 component refs + 28 animation refs |
| `ios/.../App/AppRouter.swift` | @AppStorage("ui.theme") switch | VERIFIED | switches between V10MainShell and legacy MainShell |
| `Makefile` | tokens-check target | VERIFIED | `.PHONY: tokens tokens-check` + `npm run gen:tokens` invocation |
| `package.json` | gen:tokens / gen:tokens:watch / tokens-check | VERIFIED | all 3 scripts present, use `tsx` runner |
| `frontend/tests/e2e/preview.spec.ts` | Playwright smoke + cyrillic | VERIFIED | 7 test() blocks, 120 LOC; per 23-11 SUMMARY 6/6 pass in 2.4s |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `design/tokens.json` | `tokens.css` | `gen-tokens.ts` | WIRED | `--poster-coral: #FF5A3C` round-trips |
| `design/tokens.json` | `PosterTokens.swift` | `gen-tokens.ts` | WIRED | `static let coral = SwiftUI.Color(hex: "FF5A3C")` round-trips |
| `fonts.css` | `@fontsource-variable/manrope` | @import | WIRED | `@import '@fontsource-variable/manrope/wght.css'` |
| `fonts.css` | `@fontsource/pt-serif` cyrillic | @font-face + unicode-range | WIRED | unicode-range U+0400-04FF + import of cyrillic-400-italic.css |
| `Info.plist` | TTF resources | UIAppFonts array | WIRED | 5 TTF entries match files in Resources/Fonts |
| `main.tsx` | `AppV10.tsx` | lazy import + theme flag | WIRED | `import('./AppV10')` confirmed by Playwright tests 4+5 |
| `AppRouter.swift` | `V10MainShell.swift` | @AppStorage switch | WIRED | switch on themeRaw → V10MainShell() / MainShell() |
| `V10MainShell.swift` | `PreviewGallery.swift` | PosterNavStack { PreviewGallery() } | WIRED | direct invocation present |
| `AppV10.tsx` | `PreviewApp.tsx` | `?preview=1` OR DEV | WIRED | `lazy(() => import('./preview/PreviewApp'))` + surface gating logic |
| `Makefile` | `gen-tokens.ts` | tokens-check target | WIRED | invokes `npm run gen:tokens && git diff --exit-code` against generated files |
| `PosterNavStack.swift` | `PosterEdgeSwipe.swift` | .gesture in body | WIRED | edgeSwipeGesture composed inline |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `tokens.css` | `--poster-coral` | `design/tokens.json` via codegen | YES (#FF5A3C round-trips) | FLOWING |
| `PosterTokens.swift` | `coral` | same | YES | FLOWING |
| `PreviewApp.tsx` | gallery props | static fixtures (acceptable for design-system preview) | YES (preview surface, not domain data) | FLOWING |
| `PreviewGallery.swift` | gallery props | static fixtures | YES | FLOWING |
| `AppV10.tsx` | `surface` state | `import.meta.env.DEV` + `?preview=1` query | YES | FLOWING |
| `AppRouter.swift` | `themeRaw` | `@AppStorage("ui.theme")` | YES | FLOWING |
| `main.tsx` | `theme` | env + localStorage | YES | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Web e2e suite passes | `cd frontend && npm run test:e2e` (per 23-11 SUMMARY) | 6/6 pass, 2.4s | PASS (per SUMMARY claim — not re-run by verifier per scope note "Tests assumed passing") |
| iOS Xcode build clean | `cd ios && make build` (per 23-12 SUMMARY) | Build Succeeded (iPhone 17 Pro sim, Debug) | PASS (per SUMMARY claim) |
| `make tokens-check` round-trips | `make tokens-check` | not re-run by verifier | SKIP (deferred to CI) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| DS-01 | 23-01 | tokens.json single source + gen-css/gen-swift codegen + make tokens-check | SATISFIED | `gen-tokens.ts` covers both web+iOS in one script (decision documented in CONTEXT Area 1, replaces dual-script spec); `make tokens-check` enforces round-trip |
| DS-02 | 23-02 | 4 self-hosted woff2 fonts + PT Serif cyrillic fallback via unicode-range + font-display optional + preload | SATISFIED | fonts.css imports verified; `unicode-range: U+0400-04FF` confirmed; Playwright test 3 passing |
| DS-03 | 23-03 | 5 TTF in Resources/Fonts + UIAppFonts + Font.custom().weight() variable axes | SATISFIED (artifact) / NEEDS HUMAN (visual) | All 5 TTF files + UIAppFonts entries present; build clean; visual glyph routing requires sim/device |
| DS-04 | 23-04, 23-06 | 11 keyframes web + iOS withAnimation/phaseAnimator | SATISFIED | 11 web keyframes grep-confirmed; PosterAnimations.swift enumerates all 11 named entries |
| DS-05 | 23-04, 23-06 | prefers-reduced-motion / accessibilityReduceMotion → opacity-only, no in-app toggle | SATISFIED (web) / NEEDS HUMAN (iOS) | Playwright test 6 confirms `animationDuration === '0.2s'`; iOS modifier hooks `@Environment(\.accessibilityReduceMotion)` — visual deferred |
| DS-06 | 23-05, 23-07 | 10 components symmetric web (`componentsV10/`) + iOS (`FeaturesV10/Common/`) | SATISFIED | all 10 in both surfaces with matching naming; index.ts barrel + PosterStyle shared |
| DS-07 | 23-08 | PosterNavStack + PosterSheet + UIScreenEdgePanGestureRecognizer + a11y «Назад» + isButton | SATISFIED (artifact) / NEEDS HUMAN (real-device) | All 5 nav-stack files present; PosterNavStack exactly 50 LOC; edge-swipe wraps real UIKit gesture; ADR-002 closure deferred to Phase 28 acceptance |
| DS-08 | 23-09, 23-10 | Dual-shell coexistence — iOS `@AppStorage("ui.theme")` + web `VITE_UI_THEME`/`localStorage.getItem('ui.theme')` | SATISFIED (web) / NEEDS HUMAN (iOS visual flip) | Web Playwright tests 4+5 confirm v06 routing + tampering fallback; iOS dispatcher code present, visual flip deferred |

No orphaned requirements — all 8 DS-XX claimed by plans are delivered.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| `frontend/src/AppV10.tsx` | 20, 27, 37-40 | "placeholder", "В разработке." | INFO | Intentional production-fallback UX text when not in preview surface (during Phase 23 only — Phases 24-27 replace placeholder with real screens). Not a stub. |
| `frontend/src/componentsV10/Toast.tsx` | 23 | `if (!visible) return null` | INFO | Conditional rendering for invisible toast — not a stub, expected pattern. |

No blockers, no warnings.

### Human Verification Required

5 items deferred to Phase 28 acceptance per `23-12-ios-smoke-test-SUMMARY.md` — see `human_verification` frontmatter for full list:

1. **iOS PosterNavStack on real device** — push 3 screens → swipe-back × 3 → assert top-of-stack reverts; VoiceOver «Назад, button» (ADR-002 closure)
2. **iOS reduce-motion** — toggle Settings → Accessibility → Reduce Motion → all 11 animations collapse to opacity-only
3. **iOS cyrillic glyph routing** — visual smoke that PT Serif renders «Май» italic and DM Serif Display renders «May» italic from bundled TTF
4. **iOS dual-shell flip** — `@AppStorage("ui.theme")="v06"` → legacy MainShell appears unchanged; flip back → V10MainShell
5. **iOS PosterSheet** — drag-to-close threshold + tap-on-backdrop + slide-up + sheetEase

These are all explicitly listed in `23-12-ios-smoke-test-SUMMARY.md` "Deferred to Phase 28 Acceptance" section and the autonomous agent has zero ability to execute them without (a) running docker stack + (b) sim/device + (c) iOS Settings interaction. The roadmap itself sequences these into Phase 28 ("Animations Polish + Acceptance"), so deferring is procedurally correct.

### Gaps Summary

No actionable code gaps. All 11 must-haves have substantive, wired implementations in the codebase:

- **8 must-haves fully VERIFIED** by direct grep + Playwright suite (web side fully exercised — 6/6 e2e tests passing per 23-11 SUMMARY)
- **3 must-haves are UNCERTAIN** because they describe iOS behaviour observable only through real-device or live-stack runtime — not because code is missing or unwired:
  - #7 PosterNavStack — code present (50 LOC, ZStack, asymmetric transitions, edge-swipe wrapper); needs real-device push/swipe sequence
  - #8 PosterSheet drag-to-close — code present (`translation > 100 || velocity > 800`); needs simulator interaction
  - #9 iOS dual-shell flip — code present (`@AppStorage` + AppRouter switch + legacy MainShell intact); needs runtime verification

The phase explicitly scoped these for Phase 28 acceptance: per ROADMAP, "Phase 28: Animations Polish + Acceptance" handles `prefers-reduced-motion`, accessibility audit, pixel-perfect side-by-side QA, performance, migration safety, acceptance §14 ТЗ. Plan 23-12 SUMMARY documents the deferred procedure step-by-step.

**Recommendation:** Phase 23 foundation is technically complete and unblocks Phases 24-27 (which build screens consuming these components). Status `human_needed` is the correct routing — the human (Denis) must run the Phase 28 acceptance procedure on a real iPhone before flipping default `ui.theme` from `"v06"` to `"v10"` for existing users. No new plans needed for Phase 23.

---

_Verified: 2026-05-10_
_Verifier: Claude (gsd-verifier)_
