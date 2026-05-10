---
phase: 23-design-system-foundation
plan: 12
type: execute
wave: 7
depends_on: [23-design-system-foundation/03, 23-design-system-foundation/07, 23-design-system-foundation/08, 23-design-system-foundation/10]
files_modified:
  - .planning/phases/23-design-system-foundation/23-12-VERIFICATION.md
autonomous: false
requirements: [DS-03, DS-04, DS-05, DS-06, DS-07, DS-08]
tags: [design-system, ios, smoke-test, manual, accessibility]
must_haves:
  truths:
    - "Simulator build launches with default theme 'v10' → V10MainShell renders PreviewGallery on coral background."
    - "All 5 fonts visibly render correctly (Manrope body, JetBrains Mono digits, Archivo Black uppercase, DM Serif Italic for «May», PT Serif Italic for «Май»)."
    - "Tap «Push test screen» → SecondScreen mounts with cobalt background; «Pop back» button returns; edge-swipe from leading edge ALSO returns (DS-07 + ADR-002)."
    - "Tap «Show poster sheet» → bottom sheet slides up; backdrop tap dismisses; drag-down beyond 100pt dismisses; drag below threshold snaps back."
    - "Toggle Settings → Accessibility → Reduce Motion ON; trigger any animation → opacity-only fade fires (no transforms) (DS-05)."
    - "Set `defaults write com.exeynod.BudgetPlanner ui.theme v06` → relaunch → existing v0.6 MainShell renders untouched (DS-08)."
    - "Set `defaults write com.exeynod.BudgetPlanner ui.theme garbage` → relaunch → V10MainShell renders (self-heal default, DS-08)."
    - "VoiceOver smoke: edge-swipe area announces «Назад · кнопка»."
  artifacts:
    - path: ".planning/phases/23-design-system-foundation/23-12-VERIFICATION.md"
      provides: "Human-verified results document for manual iOS acceptance"
  key_links:
    - from: "Human tester"
      to: "Simulator + real iPhone"
      via: "make run + manual gestures"
---

<objective>
Manual acceptance gate for all DS-* requirements that can only be verified visually or on device. Tests:
- **DS-03 fonts visual:** all 5 fonts render correctly; «Май» uses PT Serif Italic glyphs (NOT Times fallback).
- **DS-04+DS-05 animations:** all 11 animations exercised in PreviewGallery; reduce-motion OS toggle flattens motion.
- **DS-06 components:** all 10 components render without layout breakage at standard iPhone widths.
- **DS-07 nav:** `PosterNavStack` push 3 screens (gallery → SecondScreen → push again from SecondScreen) → swipe-back from leading edge → assert top of stack reverts; `PosterSheet` drag-to-close honored.
- **DS-08 shell switch:** UserDefaults flip to v06 boots existing MainShell; corrupt value self-heals to v10.
- **Accessibility:** VoiceOver hits «Назад» on edge-swipe area; UPPERCASE+letter-spacing has accessibilityLabel overrides where needed (limited scope in Phase 23 — Phase 28 polish does the full audit).

Output: `.planning/phases/23-design-system-foundation/23-12-VERIFICATION.md` with checklist filled in by tester.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/23-design-system-foundation/23-CONTEXT.md
@.planning/research/ADR-001-cyrillic-font-fallback.md
@.planning/research/ADR-002-poster-nav-stack-approach.md

<read_first>
- ADR-002 «manual real-device тест edge-swipe на iPhone 11/Pro: жест с левого края, threshold, animation reverse-progress»
- Plan 23.10 — V10MainShell + AppRouter + PreviewGallery
- iOS Makefile — `make run` boots simulator + installs + launches
</read_first>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Author 23-12-VERIFICATION.md template</name>
  <files>.planning/phases/23-design-system-foundation/23-12-VERIFICATION.md</files>
  <read_first>
    - This plan's must_haves block
  </read_first>
  <action>
    Create `.planning/phases/23-design-system-foundation/23-12-VERIFICATION.md` with empty checklist:
    ```markdown
    # Phase 23 — iOS Manual Acceptance Verification

    **Tester:** _____________________
    **Date:** _____________________
    **Device(s):** [ ] iPhone Pro Simulator (`make run`) [ ] Real iPhone Denis (Wi-Fi → BACKEND_URL)
    **Build:** Debug, theme=v10 default

    ## DS-03 Fonts Visual

    - [ ] Open PreviewGallery section "1. ADR-001 ROUTING"; «May» renders italic-serif Latin glyphs (DM Serif Italic distinctive shapes — wide italic strokes)
    - [ ] «Май» renders italic-serif cyrillic glyphs (PT Serif Italic distinctive shapes — NOT system Times Italic)
    - [ ] BigFig «142 380» uses JetBrains Mono digits (monospace, distinct from Manrope body)
    - [ ] Section eyebrow text is JetBrains Mono uppercase
    - [ ] PosterButton CTA "СОХРАНИТЬ" uses Archivo Black 900 weight
    - [ ] No Xcode console "[ImageManager] Could not find font" warnings

    ## DS-04+DS-05 Animations

    - [ ] All 11 animation triggers fire when tapped (visual change observable on yellow target rectangle)
    - [ ] posterRowIn — translateY 8px → 0 fade-in
    - [ ] posterRiseIn — translateY 14px → 0 fade-in
    - [ ] posterBarFill — scaleX 0 → 1 from leading edge
    - [ ] posterTabPop — scale 1 → 1.35 → 1 overshoot
    - [ ] posterPopIn — scale 0.86 → 1.04 → 1 fade-in
    - [ ] posterCheck — stroke-draw effect on checkmark in toast
    - [ ] posterDot — infinite ease-in-out loop visible (in toast on tap)
    - [ ] posterSlideInFwd — translate 28px right → 0
    - [ ] posterSlideInBack — translate -28px left → 0
    - [ ] posterTabSwap — translateY 8px → 0 fade-in
    - [ ] posterToastIn — translateY -8 → +2 → 0 with scale 0.9 → 1.04 → 1 overshoot
    - [ ] iOS Settings → Accessibility → Motion → Reduce Motion ON; relaunch app; trigger any animation → opacity-only fade observed (no transform)
    - [ ] Reduce Motion OFF; full motion restored

    ## DS-06 Components

    - [ ] All 10 components rendered in gallery without layout breakage at iPhone 13 Pro width (390pt)
    - [ ] PosterButton 3 variants visually distinct (yellow primary, transparent ghost with paper border, red destructive)
    - [ ] Chip active state inverts colors (yellow bg + cobalt text)
    - [ ] PosterSlider thumb slides smoothly; tap on number → keyboard input mode
    - [ ] TabBar 5-col grid; FAB centered as 3rd column
    - [ ] FAB press transforms scale + rotate(-90deg)
    - [ ] Toast renders top:64pt center with checkmark + auto-dismisses ~1.7s

    ## DS-07 Navigation (ADR-002)

    - [ ] Tap "Push test screen" in section 8 → SecondScreen pushes with slide-in-from-trailing transition
    - [ ] On SecondScreen, tap "Pop back" → return to gallery with slide-in-from-leading transition
    - [ ] Push again, then swipe from LEADING edge (left side of screen, ~24pt strip) → returns to gallery
    - [ ] Push 3 screens (gallery → second → second again from a button) → swipe-back from leading edge returns one level at a time
    - [ ] **Critical (ADR-002 risk):** edge-swipe does NOT conflict with TabView/system swipe — gesture fires reliably on iPhone Pro real device
    - [ ] PosterSheet "Show poster sheet" → bottom sheet slides up
    - [ ] Tap backdrop → sheet dismisses
    - [ ] Drag sheet down by 50pt → snaps back (below threshold)
    - [ ] Drag sheet down by 120pt → dismisses (above 100pt threshold)
    - [ ] Quick flick down (high velocity) → dismisses (velocity > 800)

    ## DS-08 Dual-Shell

    - [ ] App launches with default theme "v10" → V10MainShell + PreviewGallery visible
    - [ ] In simulator: `xcrun simctl spawn booted defaults write com.exeynod.BudgetPlanner ui.theme v06` → relaunch app → existing v0.6 MainShell renders (Home/Transactions/etc.)
    - [ ] `xcrun simctl spawn booted defaults write com.exeynod.BudgetPlanner ui.theme garbage` → relaunch → V10MainShell renders (self-heal worked)
    - [ ] Reset back to v10: `xcrun simctl spawn booted defaults delete com.exeynod.BudgetPlanner ui.theme` → relaunch → V10MainShell

    ## Accessibility

    - [ ] VoiceOver ON; navigate to leading edge of any non-root screen; rotor announces «Назад · кнопка» (per ADR-002)
    - [ ] FAB has aria-label «Добавить транзакцию» (announced by VoiceOver)
    - [ ] TabBar tabs are accessible (each labeled, isSelected trait correct on active)

    ## Open Issues / Notes

    _Tester records any divergence here. Phase 28 polish absorbs minor issues; major issues block Phase 23 completion._

    ---

    ## Sign-off

    - [ ] All DS-03 boxes checked
    - [ ] All DS-04+DS-05 boxes checked
    - [ ] All DS-06 boxes checked
    - [ ] All DS-07 boxes checked (ADR-002 risk closed)
    - [ ] All DS-08 boxes checked
    - [ ] Accessibility smoke complete (full audit deferred to Phase 28)

    Phase 23 iOS acceptance: ☐ approved / ☐ blocked

    Tester signature / git handle: _____________________
    ```
  </action>
  <acceptance_criteria>
    - File created with all 6 sections
    - `grep -c "^- \[ \]" .planning/phases/23-design-system-foundation/23-12-VERIFICATION.md` returns ≥ 30 (full checklist count)
    - `grep -F "DS-03" .planning/phases/23-design-system-foundation/23-12-VERIFICATION.md` returns ≥ 1
    - `grep -F "DS-08" .planning/phases/23-design-system-foundation/23-12-VERIFICATION.md` returns ≥ 1
    - `grep -F "ADR-002" .planning/phases/23-design-system-foundation/23-12-VERIFICATION.md` returns ≥ 1
  </acceptance_criteria>
  <verify>
    <automated>grep -c '^- \[ \]' .planning/phases/23-design-system-foundation/23-12-VERIFICATION.md | awk '{ if ($1 &gt;= 30) exit 0; else exit 1; }' &amp;&amp; grep -F 'ADR-002' .planning/phases/23-design-system-foundation/23-12-VERIFICATION.md</automated>
  </verify>
  <done>
    Verification template authored with 30+ checkboxes covering DS-03 through DS-08 + accessibility.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Tester runs simulator + (optional) real device + fills checklist</name>
  <what-built>
    Plans 23.01-23.10 implemented all DS-* requirements; this is the manual sign-off gate. Required because:
    - Cyrillic glyph routing visual verification cannot be automated reliably (requires human eye)
    - Edge-swipe gesture conflict detection (ADR-002 risk) requires real device — simulator may behave differently
    - Reduce-motion is OS-level — XCUITest can simulate via launchEnvironment but visual confirmation is faster manual
    - VoiceOver smoke requires audio output verification
  </what-built>
  <how-to-verify>
    1. **Simulator pass:**
       ```bash
       cd ios
       make run                              # boots iPhone 17 Pro simulator + builds + launches
       ```
       Walk through every checkbox in `.planning/phases/23-design-system-foundation/23-12-VERIFICATION.md`. Tick each box that passes; leave unchecked + add note in "Open Issues" for failures.

    2. **Real-device pass (recommended for ADR-002 risk closure):**
       Connect iPhone Denis (per memory:project-ios-app.md), set BACKEND_URL to Mac IP if testing real backend, build for device:
       ```bash
       cd ios
       xcodegen generate
       open BudgetPlanner.xcodeproj
       # In Xcode: select iPhone Denis device, ⌘R
       ```
       Repeat the DS-07 navigation tests — especially edge-swipe — on real hardware. ADR-002 explicitly flags this risk.

    3. **Fill out 23-12-VERIFICATION.md** with checkmarks; commit the file when done.

    4. **Critical failure scenarios** that must NOT happen:
       - «Май» rendering as Times Italic (means PT Serif TTF is missing or UIAppFonts mis-registered)
       - V10MainShell crashing at launch (means PosterAnimations / PosterTokens references are broken)
       - Edge-swipe failing to fire on real device (means UIScreenEdgePanGestureRecognizer config wrong — investigate `edges = .left` and parent gesture conflicts)
       - Theme=v06 boot failing (means existing MainShell ref broken — check `import` chain)

    Each critical failure → log to 23-12-VERIFICATION.md "Open Issues" + propose Plan 23.13+ gap closure.
  </how-to-verify>
  <resume-signal>
    Type "approved — Phase 23 iOS verified" if all 30+ boxes ticked. Otherwise list which boxes failed and the suspected root cause.
  </resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Tester → simulator/device | Manual verification, trusted operator |
| `defaults write` → UserDefaults | Same trust as developer machine |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-23-12-01 | Tampering | UserDefaults manual flip | accept | Same dev-machine trust as code commit; production users cannot reach this surface |
| T-23-12-02 | Spoofing | VoiceOver announcements | accept | iOS-supplied accessibility framework; no untrusted input |
| T-23-12-03 | Information Disclosure | screenshots from XcodeBuildMCP | accept | Local-only, gitignored under DerivedData |
</threat_model>

<verification>
1. 23-12-VERIFICATION.md exists with full checklist.
2. Tester completes manual verification + commits filled checklist.
3. Phase 23 closes only when ≥90% boxes pass; remaining items become Phase 28 polish targets.
</verification>

<success_criteria>
- DS-03/04/05/06/07/08 all manually verified.
- ADR-002 edge-swipe risk closed via real-device test.
- Verification doc committed to repo.
</success_criteria>

<output>
After tester signoff, create `.planning/phases/23-design-system-foundation/23-12-SUMMARY.md` with: simulator pass/fail counts, device pass/fail counts, list of carried-forward items to Phase 28.
</output>
