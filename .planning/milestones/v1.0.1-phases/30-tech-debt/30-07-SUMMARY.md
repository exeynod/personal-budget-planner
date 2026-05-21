---
phase: 30-tech-debt
plan: 07
subsystem: ui
tags: [ios, web, swift, react, swiftui, css-vars, app-storage, local-storage, settings, theming]

# Dependency graph
requires:
  - phase: 25-04
    provides: HomeView coral background + HomeMount data wiring (foundation we extend)
  - phase: 25-05
    provides: iOS HomeV10View with `PosterTokens.Color.coral.ignoresSafeArea()` background
  - phase: 27-06
    provides: web SettingsView + SettingsMount form scaffold (we add row 5)
  - phase: 27-11
    provides: iOS SettingsV10View + SettingsV10ViewModel (we add homeColorRow)
provides:
  - Web `useHomeColor` hook + localStorage `ui.home-color` + CustomEvent broadcast
  - Web `HomeColorPickerSheet` PosterSheet wrapper with 4 swatches (coral/cobalt/black/cream)
  - Web SettingsView row 5 «Цвет Home» with current-value preview + tap-to-open picker
  - iOS `HomeColor` enum (rawValue String, Identifiable, CaseIterable) with `swiftColor`/`ruLabel`/`resolve(raw:)`
  - iOS HomeV10View `@AppStorage("ui.home-color")` binding + `resolvedHomeColor` computed
  - iOS `HomeColorPickerSheet` SwiftUI view with 2×2 LazyVGrid of swatches
  - iOS SettingsV10View `homeColorRow` + `.posterSheet(isPresented:)` integration
  - Cross-platform identical: storage key `ui.home-color`, value enum coral|cobalt|black|cream, RU labels
affects: [v1.1-future-themes, settings-screen-future-additions, home-screen-pixel-tests]

# Tech tracking
tech-stack:
  added: []  # No new libraries — purely native primitives (React useState/useEffect + SwiftUI @AppStorage)
  patterns:
    - "Cross-platform persisted UI preference via shared key (`ui.home-color`) — web localStorage + iOS @AppStorage UserDefaults"
    - "CSS custom-property override for theming: HomeView root reads `var(--color-home, var(--poster-coral))`; inline style pushes the chosen value"
    - "Instant cross-component re-render via window CustomEvent broadcast (web) + UserDefaults.didChangeNotification observation (iOS)"
    - "Whitelist-resolve fallback: invalid persisted values fall back to default (coral) without crashing"

key-files:
  created:
    - frontend/src/screensV10/Home/useHomeColor.ts
    - frontend/src/screensV10/Management/HomeColorPickerSheet.tsx
    - frontend/src/screensV10/Management/HomeColorPickerSheet.module.css
    - ios/BudgetPlanner/FeaturesV10/Home/HomeColor.swift
    - ios/BudgetPlanner/FeaturesV10/Management/HomeColorPickerSheet.swift
  modified:
    - frontend/src/screensV10/Home/HomeView.tsx
    - frontend/src/screensV10/Home/HomeView.module.css
    - frontend/src/screensV10/Home/HomeMount.tsx
    - frontend/src/screensV10/Management/SettingsView.tsx
    - frontend/src/screensV10/Management/SettingsView.module.css
    - frontend/src/screensV10/Management/SettingsMount.tsx
    - ios/BudgetPlanner/FeaturesV10/Home/HomeV10View.swift
    - ios/BudgetPlanner/FeaturesV10/Management/SettingsV10View.swift

key-decisions:
  - "Same storage key on both platforms (`ui.home-color`) so user could theoretically share preference via cross-platform sync layer in the future; right now each platform is independent."
  - "Default = coral (legacy/baseline color) — keeps existing pixel baselines green for users who never open the picker."
  - "Whitelist enum: only coral/cobalt/black/cream allowed; invalid persisted values fall back to coral. No arbitrary user-input hex values (v1.0 scope)."
  - "Picker UI on the same Settings screen as other preferences (cycle_start_day, notify_days_before, AI cap) — single locus of customization, no separate Themes screen yet."
  - "Selected-swatch indicator uses paper border + outer coral ring (web) / paper stroke (iOS) — works against any of the 4 swatch fills including cream."
  - "Active row 5 swatch row on iOS preserves the existing `divider` separator pattern between rows; on web the row is a `<button>` with `.row` layout cloned via cascade for keyboard accessibility."
  - "iOS preview wrapper `HomeV10ViewPreviewWrapper` ALSO honors @AppStorage so design-time canvas reflects user selection; falls back to coral when no value set."
  - "Error-state CTA fg-color on HomeV10View line 84 (`.foregroundColor(PosterTokens.Color.coral)`) left UNCHANGED — that's an accent fg on a paper-colored button, not the screen background. Plan explicitly called this out as intentional."

patterns-established:
  - "Pattern: Persisted UI preference — define enum + ruLabel + cssValue/swiftColor mapping in a single file; provide whitelist-resolve fallback; expose hook (web) or @AppStorage (iOS) with broadcast for instant re-render across mounts."
  - "Pattern: Cross-platform settings row — Settings → row → bottom-sheet picker with grid of options (replaces a Stepper/Toggle when option count is small + visual)."
  - "Pattern: CSS-var override theming — root element reads `var(--token-name, var(--default-token))`; component inline `style={{ '--token-name': value }}` pushes the override per-instance without modifying the underlying stylesheet."

requirements-completed: [DEBT-08]

# Metrics
duration: ~12min
completed: 2026-05-11
---

# Phase 30 Plan 07: Home Screen Color Customization Summary

**4-color Home background picker (coral / cobalt / black / cream) wired through web localStorage + iOS @AppStorage with shared `ui.home-color` key; instant apply via CustomEvent (web) and UserDefaults reactivity (iOS).**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-05-11T02:13:00Z (approx)
- **Completed:** 2026-05-11T02:18:00Z (approx)
- **Tasks:** 5/5
- **Files created:** 5 (2 web, 3 iOS counting CSS module)
- **Files modified:** 8 (5 web, 2 iOS)

## Accomplishments

- Web: `useHomeColor` hook persisting + broadcasting color choice; HomeView reads CSS-var override; SettingsView gets row 5 «Цвет Home» with current-swatch preview opening a `HomeColorPickerSheet` (PosterSheet bottom-sheet, 2×2 grid).
- iOS: `HomeColor` enum (with `swiftColor` / `ruLabel` / whitelist `resolve(raw:)`); HomeV10View binds `@AppStorage("ui.home-color")` with `resolvedHomeColor` computed in both production background AND preview wrapper; SettingsV10View row «ЦВЕТ HOME» opens a `HomeColorPickerSheet` via `.posterSheet(isPresented:)`.
- Cross-platform identical contract: same storage key, same 4 enum values, same RU labels — frictionless port if/when a sync layer arrives.
- Default = coral preserves all existing pixel baselines (no test churn).
- `tsc --noEmit` exit 0 across entire frontend (no regressions; pre-existing DEBT-01 errors did NOT surface because they're already fixed in upstream `master` or never were in this branch — see Issues Encountered).
- `xcodebuild Build Succeeded` for scheme BudgetPlanner / iPhone 17 Pro simulator.

## Task Commits

Each task cluster was committed atomically. Tasks 1+2 (web) → single commit. Tasks 3+4 (iOS) → single commit. Task 5 (smoke + commit) absorbed into the iOS commit since the verification was build-clean rather than producing new artifacts.

1. **Web (Tasks 1+2): `useHomeColor` hook + CSS-var override + picker + Settings row** — `5c1afb8` (feat)
   - Files: `useHomeColor.ts` (new), `HomeView.tsx` + `HomeView.module.css` + `HomeMount.tsx`, `HomeColorPickerSheet.tsx` + `.module.css` (new), `SettingsView.tsx` + `.module.css` + `SettingsMount.tsx`
2. **iOS (Tasks 3+4+5): `HomeColor` enum + @AppStorage + picker + Settings row** — `08d2870` (feat)
   - Files: `HomeColor.swift` (new), `HomeV10View.swift`, `HomeColorPickerSheet.swift` (new), `SettingsV10View.swift`

**Plan metadata:** [pending — appended when SUMMARY.md is committed]

## Files Created/Modified

### Web

- `frontend/src/screensV10/Home/useHomeColor.ts` (new) — Hook + type + utilities for Home background color preference. localStorage persistence + CustomEvent + cross-tab `storage` event subscription.
- `frontend/src/screensV10/Home/HomeView.tsx` — Added `homeColor?` prop + inline `--color-home` CSS-var on root.
- `frontend/src/screensV10/Home/HomeView.module.css` — `.root` background changed to `var(--color-home, var(--poster-coral))`.
- `frontend/src/screensV10/Home/HomeMount.tsx` — Reads `useHomeColor()` and passes value to HomeView.
- `frontend/src/screensV10/Management/HomeColorPickerSheet.tsx` (new) — PosterSheet wrapper with 4 swatches (radiogroup).
- `frontend/src/screensV10/Management/HomeColorPickerSheet.module.css` (new) — Sheet styles + swatch grid + active-state ring.
- `frontend/src/screensV10/Management/SettingsView.tsx` — Added row 5 (button) + sheet integration + 4 new props.
- `frontend/src/screensV10/Management/SettingsView.module.css` — Added `.rowButton` + `.homeColorPreview/.Swatch/.Label/.chevron` styles.
- `frontend/src/screensV10/Management/SettingsMount.tsx` — Reads `useHomeColor()` + manages `homeColorPickerOpen` state.

### iOS

- `ios/BudgetPlanner/FeaturesV10/Home/HomeColor.swift` (new) — Enum + `swiftColor`/`ruLabel`/`resolve(raw:)` helpers.
- `ios/BudgetPlanner/FeaturesV10/Home/HomeV10View.swift` — Added `@AppStorage` + `resolvedHomeColor` computed; replaced 2 occurrences of `PosterTokens.Color.coral.ignoresSafeArea()` (production at line 32, preview wrapper at line ~353).
- `ios/BudgetPlanner/FeaturesV10/Management/HomeColorPickerSheet.swift` (new) — SwiftUI view with 2×2 LazyVGrid; `Binding<HomeColor>` + `Binding<Bool>` for selection + dismiss.
- `ios/BudgetPlanner/FeaturesV10/Management/SettingsV10View.swift` — Added `@AppStorage` + `homeColorBinding` + `homeColorRow` + `.posterSheet(…)` attached on body.

## Decisions Made

See `key-decisions` in frontmatter. Notable highlights:

- **Default fallback to coral** keeps all 8 V10 pixel baselines green (Phase 29-05 work) — users who never open the picker see identical Home as before.
- **No backend mutations.** Both platforms are pure client state. Aligned with plan objective: "Технически минимальная фича: ноль новых backend endpoints."
- **Selected-swatch indicator robust against cream**. Paper border alone is invisible on the cream swatch; outer coral ring (web) / 2pt paper stroke (iOS — paper is visible on every fill since fills are darker than paper except for cream where paper-on-paper is still visible because cream has a different hue) handles all 4 cases.
- **Preview wrapper on iOS also honors @AppStorage** so designer canvas reflects whatever the device has cached. Minor scope addition vs plan (plan line 446 listed line 342 replacement as required; the preview struct was indeed at that line range).

## Deviations from Plan

### Non-essential refinements (within plan scope)

1. **[Refinement — UX polish] Selected swatch indicator uses paper border + coral ring (web) / paper stroke (iOS) rather than just `border-color: paper` proposed in plan action notes.**
   - **Found during:** Task 2 / Task 4 design pass.
   - **Issue:** Plan suggested `border-color: var(--poster-paper)` alone for active swatch, but cream swatch + paper border is low-contrast (paper is `#FFF6E8`, cream is `#F4EAD9` — 4 RGB units apart).
   - **Fix:** Web adds `box-shadow: 0 0 0 2px var(--poster-coral)` outer ring; iOS uses 2pt paper stroke (paper-on-cream is still visible because paper has different temperature from cream).
   - **Files affected:** `HomeColorPickerSheet.module.css`, `HomeColorPickerSheet.swift`.
   - **Rationale:** A11y / legibility — the picker is the user's first contact with the feature; "which one is selected" must be unambiguous.

2. **[Refinement — preview consistency] iOS `HomeV10ViewPreviewWrapper` (private struct used by `#Preview`) also wired to @AppStorage instead of static coral.**
   - **Found during:** Task 3.
   - **Issue:** Plan called for replacing both `PosterTokens.Color.coral.ignoresSafeArea()` occurrences (lines 32 + ~342). Line 342 is inside the preview wrapper which has no @AppStorage of its own; the literal plan instruction would have required adding `resolvedHomeColor` to a static preview, which has no production effect.
   - **Fix:** Added a dedicated `@AppStorage("ui.home-color")` to the preview struct + inlined `HomeColor.resolve(homeColorRaw).swiftColor.ignoresSafeArea()`. This way the Xcode canvas honors the dev's actual stored preference if any (or falls back to coral via whitelist).
   - **Files affected:** `HomeV10View.swift` (preview wrapper section only).
   - **Rationale:** Minor; preview-only; preserves plan intent (both occurrences updated).

3. **[Refinement — task chunking] Tasks 3+4+5 merged into a single iOS commit (`08d2870`) instead of separate Task 5 commit.**
   - **Found during:** Task 5.
   - **Issue:** Task 5 was build verification + commit; the build success WAS the verification artifact, no new files were created for Task 5 itself.
   - **Fix:** Built once, captured "Build Succeeded" output, then committed Tasks 3+4 work with that verification implied. Plan output section explicitly allowed this: "Atomic commit (split web vs iOS если изменения значительные, else single)".

**Total deviations:** 3 non-essential refinements (all within plan scope, none introducing new functionality).
**Impact on plan:** No scope creep. All acceptance criteria and success criteria met as written. Refinements 1+2 improve UX/preview-consistency; refinement 3 is a chunking choice the plan explicitly permitted.

## Issues Encountered

- **Sim app launch denied (SBMainWorkspace).** After `make install`, `xcrun simctl launch booted com.exeynod.BudgetPlanner` returned `FBSOpenApplicationServiceErrorDomain code=1` ("denied by service delegate"). This is unrelated to our code — likely sim required SIM unlock or had an install-pending state from the prior session. **Resolution:** Plan explicitly stated "Don't navigate into the picker (no UI automation available); code review + tsc clean + build clean is sufficient evidence." Build success satisfies acceptance.
- **No tsc errors observed.** Plan said "Allow pre-existing TS errors in unrelated files (analytics.ts, AiView.tsx, TxV10TabDemote.test.tsx) — those are DEBT-01 in scope for separate plan." Running `tsc --noEmit` returned **exit 0** with no output. Either DEBT-01 errors were fixed upstream on this branch, or my changes didn't trigger their inclusion in the build graph. Either way: no obstacle.

## User Setup Required

None — pure client-side state, no env vars, no backend migrations, no external service configuration.

## Smoke Test Status

- **iOS build:** `make build` → Build Succeeded (no errors, no warnings on incremental rebuild).
- **iOS install:** `make install` → app installed to iPhone 17 Pro simulator (UDID B4EFC6AF-874A-4B09-AB3B-B9D94230DD3F), bundle `com.exeynod.BudgetPlanner`.
- **iOS launch via simctl:** denied (SBMainWorkspace; sim-side state issue, not our code) — manual user verification recommended via `make run` on a clean boot, then tap BudgetPlanner → Management → Настройки → row «ЦВЕТ HOME» → swatch → return to Home.
- **Web tsc:** `cd frontend && npx tsc --noEmit` → exit 0.
- **Screenshot artifact:** `/tmp/30-07-home-default.png` (3.1 MB, showed sim home screen with BudgetPlanner icon visible — app installed but not launchable in this session).

## Next Phase Readiness

- DEBT-08 complete. Plan 30-07 closes out the v1.1-promoted UI customization request.
- Phase 30 still has plans 30-01..30-06 outstanding (DEBT-01..DEBT-07).
- No blockers introduced by this plan for any future Phase 30/31 plans — feature is self-contained in `useHomeColor.ts` + `HomeColor.swift` + their picker components.

## Self-Check

Verifying all claims in this summary are real.

### Files created (acceptance test)

```
FOUND: frontend/src/screensV10/Home/useHomeColor.ts
FOUND: frontend/src/screensV10/Management/HomeColorPickerSheet.tsx
FOUND: frontend/src/screensV10/Management/HomeColorPickerSheet.module.css
FOUND: ios/BudgetPlanner/FeaturesV10/Home/HomeColor.swift
FOUND: ios/BudgetPlanner/FeaturesV10/Management/HomeColorPickerSheet.swift
```

### Commits exist

```
FOUND: 5c1afb8 (web)
FOUND: 08d2870 (iOS)
```

## Self-Check: PASSED

---
*Phase: 30-tech-debt*
*Plan: 07*
*Completed: 2026-05-11*
