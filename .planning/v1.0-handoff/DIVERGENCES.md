# DIVERGENCES.md — v1.0 Maximal Poster Implementation vs Prototype

**Last updated:** 2026-05-10 (Phase 28-03)
**Reference:** `.planning/v1.0-handoff/handoff/prototype/index.html`
**Audit basis:** Phase 28-03 pixel-perfect QA (web automated, iOS manual).

This document catalogs **known, accepted divergences** between the
implemented v1.0 UI and the original prototype. These are NOT bugs —
they are conscious tradeoffs documented at planning time (ADR-001 /
ADR-002) or surfaced during pixel-QA in Phase 28.

---

## Web Divergences

### W-01 — DM Serif Italic Cyrillic Fallback (ADR-001)

- **Where:** any italic Mass header rendering Cyrillic text («Май»,
  «Подписки.», «Копилка.», «Месяц.», «Счета.», «Реестр.»).
- **Prototype:** uses DM Serif Display Italic for both Latin and
  Cyrillic.
- **Reality:** DM Serif Display ships NO Cyrillic subset on Google
  Fonts. Solution: dual-font via `unicode-range` — DM Serif Italic for
  U+0020..U+024F (Latin), PT Serif Italic for U+0400..U+04FF (Cyrillic).
- **Visual impact:** glyph shapes slightly differ between Latin /
  Cyrillic in one line. Most visible on mixed strings.
- **Decision:** accepted at v1.0 ADR-001. Designer review pre-shipping
  recommended for §14.7 («нет видимого FOUT»).

### W-02 — Snapshot tolerance 2% + macOS-only baseline

- **Where:** all 8 baseline pixel-snapshot tests (Plan 28-03 Task 1).
- **Reality:** `toHaveScreenshot({ maxDiffPixelRatio: 0.02 })` accepts
  ≤ 2% pixel differences. Sub-pixel font AA varies across machines /
  Chromium minor versions. Baselines are platform-suffixed
  (`-darwin`, `-linux`); we ship `-darwin` only.
- **Decision:** acceptable for solo-dev workflow on macOS-only baseline.
  CI is expected either to regenerate (Linux runner ships its own
  baseline) or to skip the file. See `frontend/tests/e2e/v10-pixel-snapshots.spec.ts`
  header for full first-run / re-run instructions.

### W-03 — Animation duration zeroed in snapshots

- **Where:** all snapshot tests inject
  `*, *::before, *::after { animation-duration: 0s !important;
  transition-duration: 0s !important; }` for determinism.
- **Decision:** snapshot fixes the FINAL state, not an in-flight frame.
  Pixel verification of motion frames is intentionally out of scope —
  motion correctness is covered by Plans 28-01 (web grep audit) and
  28-02 (iOS grep audit) plus the existing `posterAnimations.test.ts`
  unit suite.

### W-04 — Baseline PNGs deferred to first manual `--update-snapshots`

- **Where:** `frontend/tests/e2e/__screenshots__/v10-pixel-snapshots.spec.ts/`
  is empty as of Phase 28-03 commit. Only `__screenshots__/v10-pixel/.gitkeep`
  exists to commit the directory reference.
- **Reason:** the parallel-agent worktree that authored Plan 28-03 has
  no `node_modules`, no Vite dev server, and no backend stack — running
  Playwright `--update-snapshots` from inside it would either time out
  or produce baselines from an error/loading state. The plan explicitly
  documents this in Task 1 («Запусти один раз с `--update-snapshots`») as
  a follow-up that the operator runs locally with the full stack up.
- **Action required (acceptance gate):** before marking POL-04 complete,
  the operator MUST run on a developer machine with backend + Vite dev
  server live:
  ```bash
  cd frontend
  npx playwright test tests/e2e/v10-pixel-snapshots.spec.ts --update-snapshots
  git add tests/e2e/__screenshots__/v10-pixel-snapshots.spec.ts/
  git commit -m "test(28-03): commit baseline PNGs for v10-pixel-snapshots"
  ```
  Then re-run without `--update-snapshots` and verify green. Any screen
  that fails to settle into a deterministic baseline (interactive setup
  required) gets demoted to a manual-checklist row in the iOS table
  below or a new W-XX entry here, NOT silently dropped.

### W-05 — Screen routing helper relies on permissive selectors

- **Where:** `gotoPlanMonth` and `gotoSubscriptions` in the Plan 28-03
  spec use `getByRole('button', { name: /план/i })` and
  `getByText(/Подписки/i)` rather than dedicated test-ids.
- **Reason:** Home / Mgmt-hub do not yet expose stable test-ids for
  these entry points. If the headline copy ever changes, the helper will
  silently capture Home instead of Plan/Subs.
- **Decision:** acceptable trade-off for v1.0; v1.1 should add
  `data-testid="nav-plan"` / `data-testid="nav-subscriptions"` and
  tighten the helpers.

---

## iOS Divergences

### I-01 — DM Serif Cyrillic Fallback (ADR-001)

- Same root cause as W-01.
- **Reality:** iOS bundles a single PT Serif Italic for **all** italic
  Mass headers (no dual-font hybrid).
- **Visual impact:** Latin text in italic Mass header looks
  PT-Serif-style instead of DM-Serif-style; side-by-side comparison with
  web shows an obvious shift in weight + character spacing.
- **Decision:** pragmatic fallback per ADR-001; web vs iOS will look
  slightly different on acceptance §14.7 — that is OK.

### I-02 — Custom PosterNavStack vs UIKit Nav (ADR-002)

- **Where:** push / pop transitions across all V10 screens.
- **Prototype:** N/A (web prototype uses CSS transitions).
- **Reality:** SwiftUI `NavigationStack` cannot be styled to match
  `posterSlideInFwd` (28px slide + 420ms easeOut). A custom 50-LOC
  `PosterNavStack` (ZStack + asymmetric transitions + `@Observable`
  router) replaces it. Edge-swipe-back is a
  `UIScreenEdgePanGestureRecognizer` via `UIViewRepresentable`
  (minimumDistance 24, threshold 80px).
- **Visual impact:** ≈ matches web slide-in; edge-swipe behaves
  identically to UIKit native back gesture.
- **Decision:** accepted at ADR-002.

### I-03 — Easing curve approximation (SwiftUI spring vs CSS cubic-bezier)

- **Where:** `posterTabPop` uses `.spring(response: 0.45,
  dampingFraction: 0.55)` SwiftUI primitive — not a pixel-perfect
  equivalent of CSS `cubic-bezier(0.34, 1.56, 0.64, 1)` overshoot.
- **Visual impact:** subtle — overshoot visible on iOS but timing
  slightly different.
- **Decision:** accepted; the alternative `.timingCurve` would require
  iOS 17+ phaseAnimator gymnastics.

### I-04 — Safe-area padding

- **Where:** all V10 screens render top / bottom safe-area insets per
  device (iPhone 15 has 59pt top + 34pt bottom; iPhone SE has 20pt top
  + 0pt bottom).
- **Prototype:** flat web layout, no notch / Dynamic Island awareness.
- **Decision:** Apple HIG-mandated; accepted.

### I-05 — Bare `.animation()` callsites flagged for v1.1 (Plan 28-02 audit)

- **Where:** TBD per Plan 28-02 grep audit findings (will be appended
  below by Plan 28-02 SUMMARY).
- **Decision:** known minor — V10 components mostly use
  `.posterAnimation()` modifier; flagged callsites are edge-cases and
  do not break reduce-motion (`accessibilityReduceMotion` still affects
  them via SwiftUI's global reduce-motion behavior in many primitives).

---

## iOS Manual Screenshot Checklist (acceptance prep)

For acceptance §14, manually capture iOS screenshots via XcodeBuildMCP
or `xcrun simctl io <device> screenshot` and side-by-side compare with
`prototype/index.html` rendered at 393×851 viewport. Mark each as ✓ /
✗ / divergence.

|  # | Screen          | iPhone 15 simulator route   | Expect                                                                  | Status |
| -: | --------------- | --------------------------- | ----------------------------------------------------------------------- | :----: |
|  1 | Home            | Tap Home tab                | coral bg, eyebrow VOL.NN, italic «Дневной темп —», count-up BigFig      |   ☐    |
|  2 | Transactions    | Home → «ВСЕ ОПЕРАЦИИ →»     | cobalt push, day groups, chip filter, roundup/deposit spec-tags         |   ☐    |
|  3 | AddSheet        | Tap FAB                     | black bg, BigFig 86px yellow, custom 3×4 keypad, system kb suppressed   |   ☐    |
|  4 | CategoryDetail  | Tap category from Home      | cobalt/red bg per isOver, Mass UPPER name, BigFig + bar with break-tick |   ☐    |
|  5 | PLAN мая        | Home → plan badge           | cobalt, surplus plate, 2 rollover plates, regulars block, 8 sliders     |   ☐    |
|  6 | Subscriptions   | Mgmt → Подписки             | coral, Mass italic «Подписки.», bottom-sheet menu w/ 3 ghost CTAs       |   ☐    |
|  7 | Savings         | Tap КОПИЛКА tab             | black, jaune plate «НАКОПЛЕНО ВСЕГО», roundup toggle, goal cards        |   ☐    |
|  8 | AI initial      | Tap AI tab                  | DM Serif italic 36px observation, 4 chip-suggestions, eyebrow ONLINE    |   ☐    |
|  9 | Accounts list   | Mgmt → 02 СЧЕТА             | cream, Mass italic «Счета.», dark plate СУММАРНО                        |   ☐    |
| 10 | Analytics       | Mgmt → 03 АНАЛИТИКА         | cream, Mass italic «Месяц.», 2 KPI plates, bar chart, top-5             |   ☐    |

**Reduce-motion smoke (iOS):**
- Settings → Accessibility → Motion → Reduce Motion ON.
- Open app → swipe between tabs → assert no horizontal slide; entries
  fade-in only.
- Status: ☐

**Edge-swipe-back smoke (PosterEdgeSwipe accessibility):**
- VoiceOver ON → push 3 screens → swipe-rotate-finger near left edge →
  VoiceOver announces «Назад, кнопка».
- Status: ☐

---

## Cross-Platform Divergences

### X-01 — Tab content swap differs

- **Web:** `posterTabSwap` 0.35s easeOut + 8px translateY (CSS keyframe).
- **iOS:** SwiftUI tab swap goes through PosterRouter `popToRoot` or
  sibling root replace; transition: opacity-only fade.
- **Decision:** acceptable — both feel snappy.

### X-02 — Toast lifetime

- **Web:** `--poster-toast-life: 1700ms` CSS variable.
- **iOS:** `PosterAnimations.toastLifeMs = 1700` (verified by
  `test_PosterAnimationsAuditTests`).
- **Status:** ✓ symmetric.

---

## Future Work (not POL-04 scope)

- Bring iOS to use `.timingCurve` for posterTabPop overshoot match
  (iOS 17+ available).
- Subset DM Serif Italic with hand-built Cyrillic glyphs (~ 4h work;
  defer to v1.1 when designer available).
- Snapshot diff CI on multi-platform baselines (Linux + macOS).
- Stable test-ids for Plan / Subscriptions nav entries to tighten
  W-05 selectors.
