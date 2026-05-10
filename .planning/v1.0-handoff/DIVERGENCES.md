# DIVERGENCES.md — v1.0 Maximal Poster Implementation vs Prototype

**Last updated:** 2026-05-11 (Phase 29-05)
**Reference:** `.planning/v1.0-handoff/handoff/prototype/index.html`
**Audit basis:** Phase 28-03 pixel-perfect QA (web automated, iOS manual), Phase 29 conformance audit (web Playwright + iOS XcodeBuildMCP) 2026-05-11.

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
- **Status update (Phase 29-04):** `gotoPlanMonth` migrated to
  `[data-nav="plan"]` structural selector (commit `510c798`); the
  `gotoSubscriptions` half of this risk still relies on
  `getByText(/Подписки/i)` and remains in W-05 scope for v1.1.

### W-06 — Home VOL counter pluralization (WARNING)

- **Where:** `frontend/src/screensV10/common/format.ts`
  (`formatPeriodEyebrow`) → emits «21 ДЕНЬ» (singular form).
- **Prototype/Spec:** `prototype/poster-screens.jsx:215` hardcodes
  `VOL.04 / MAY 2026 · {D.daysLeft} ДНЯ` — literal «ДНЯ» suffix
  regardless of count (deliberate poster-style invariance).
- **Reality:** Implementation grammatically pluralizes per Russian
  rules (1 ДЕНЬ / 2-4 ДНЯ / 5+ ДНЕЙ). Outputs «21 ДЕНЬ» where prototype
  would say «21 ДНЯ».
- **Visual impact:** 1-2 chars on eyebrow line; barely noticeable on the
  283×30px viewport region. Demoted to WARNING because the prototype
  itself doesn't pluralize and grammatically-correct Russian is arguably
  better UX than poster-style invariance.
- **Decision:** accepted v1.0.1 → defer to v1.1 (`POL-V11-06`,
  tag: `ui-polish`).

### W-07 — Transactions chip-bar overflow scroll vs wrap (WARNING)

- **Where:** `frontend/src/screensV10/Transactions/TransactionsView.module.css:55-67`
  → `display:flex; overflow-x: auto`.
- **Prototype/Spec:** `prototype/poster-screens.jsx:335`
  → `display:flex; flexWrap:'wrap'` — chips wrap to multiple rows.
- **Reality:** Chips scroll horizontally when filter list exceeds
  viewport width. Behavioural divergence with visible impact only when
  > 5 chips render.
- **Visual impact:** moderate; manifests when categories grow past the
  default 6. Stays invisible in the v1.0 baseline fixture (4 chips fit).
- **Decision:** accepted v1.0.1 → defer to v1.1 (`POL-V11-07`,
  tag: `ui-polish`).

### W-08 — AddSheet keypad `.` cell opacity (WARNING)

- **Where:** `frontend/src/screensV10/AddSheet/Keypad.tsx` +
  `Keypad.module.css`.
- **Prototype/Spec:** `prototype/poster-screens.jsx:1222`
  → `opacity: k === '.' ? 0.45 : 1` — decimal key dimmed.
- **Reality:** All keypad cells render at full opacity; the `.` key
  visually equal to digit keys.
- **Visual impact:** small; the dim-decimal nudge cues users that
  fractional kopeck input is rare. CSS read pending precise
  confirmation.
- **Decision:** accepted v1.0.1 → defer to v1.1 (`POL-V11-08`,
  tag: `ui-polish`).

### W-09 — CategoryDetail Mass headline 70 vs 68 (WARNING)

- **Where:** `frontend/src/screensV10/CategoryDetail/CategoryDetailView.tsx:98`
  → `<Mass size={70}>`.
- **Prototype/Spec:** `prototype/poster-screens.jsx:528`
  → `<Mass size={68}>`.
- **Reality:** 2px size delta. Within ±4px tolerance per CONTEXT.md
  severity rubric (BLOCKER threshold) → WARNING tier.
- **Visual impact:** imperceptible at typical viewing distance.
- **Decision:** accepted v1.0.1 → defer to v1.1 (`POL-V11-09`,
  tag: `ui-polish`).

### W-10 — Subscriptions Mass headline 70 vs 68 (WARNING)

- **Where:** `frontend/src/screensV10/Subscriptions/SubscriptionsView.tsx:69`
  → `<Mass size={70}>`.
- **Prototype/Spec:** `prototype/poster-screens.jsx:1095`
  → `<Mass size={68}>`.
- **Reality:** 2px size delta (same nature as W-09).
- **Visual impact:** imperceptible at typical viewing distance.
- **Decision:** accepted v1.0.1 → defer to v1.1 (`POL-V11-10`,
  tag: `ui-polish`).

### W-11 — Subscriptions empty-state font literal vs token (WARNING)

- **Where:** `frontend/src/screensV10/Subscriptions/SubscriptionsView.module.css:68`
  → `font-family: 'DM Serif Display', ...` literal.
- **Prototype/Spec:** DESIGN-SYSTEM.md §6.2 → reference canonical
  `var(--poster-font-dm-serif-italic)` token for italic Mass family.
- **Reality:** Literal font-family chain renders visually identical
  output (DM Serif Display Italic + PT Serif Italic dual-font is
  globally injected), but the empty-state CSS is not anchored to the
  token contract. Future-proof token-rename refactors would miss this
  callsite.
- **Visual impact:** zero (renders same).
- **Decision:** accepted v1.0.1 → defer to v1.1 (`POL-V11-11`,
  tag: `tech-debt` — token enforcement audit).

### W-12 — AI suggestion chips border-direction inverted (WARNING)

- **Where:** `frontend/src/screensV10/Ai/AiView.module.css:105`
  → `border-bottom` per chip.
- **Prototype/Spec:** `prototype/poster-screens.jsx:442-453`
  → `borderTop` per chip — first row carries top line, last row has
  no trailing separator.
- **Reality:** Bottom-borders mean last row carries a trailing line and
  first row has no top divider — opposite visual rhythm vs prototype.
- **Visual impact:** small; only the first / last chip in the list show
  the inversion.
- **Decision:** accepted v1.0.1 → defer to v1.1 (`POL-V11-12`,
  tag: `ui-polish`).

### W-13 — Home BigFig count-up captured mid-rAF in baseline (INFO)

- **Where:** `frontend/src/componentsV10/BigFig.tsx` (uses
  `requestAnimationFrame` count-up) + `tests/e2e/fixtures/onboarded-user.ts`
  `freezeMotion()` helper.
- **Prototype/Spec:** snapshot should freeze on the terminal count-up
  value (e.g. `0` ₽ daily-pace = floor(5000/22) ≈ 227).
- **Reality:** `freezeMotion()` injects
  `animation-duration: 0s !important; transition-duration: 0s !important`
  which kills CSS-driven animations only — JS-driven `requestAnimationFrame`
  count-up keeps running. Baseline PNGs occasionally capture a mid-flight
  value (`184`/`214` observed) instead of the terminal one.
- **Visual impact:** snapshot non-determinism on Home only; flaky baseline
  byte hash, 2% tolerance compensates.
- **Decision:** accepted v1.0.1 → defer to v1.1 (`POL-V11-13`,
  tag: `e2e-determinism`). Fix candidate: extend `freezeMotion` to
  monkey-patch `BigFig.value` to terminal synchronously.

### W-14 — Transactions empty-state copy «Реестр пуст —» (INFO)

- **Where:** `frontend/src/screensV10/Transactions/TransactionsView.tsx:142-143`.
- **Prototype/Spec:** `prototype/poster-screens.jsx:347-349`
  → «Ничего не найдено в фильтре «{filter}».» — surfaces only when
  filter narrows to zero, not for globally-empty registry.
- **Reality:** Implementation invented two distinct empty-states:
  «Реестр пуст — добавьте первую трату через FAB» for empty global,
  «Ничего не найдено в фильтре» for filter-empty. Justified design
  choice — surfaces correct affordance for each empty context.
- **Visual impact:** copy-only; no layout deviation.
- **Decision:** accepted v1.0.1 — implementation supersedes prototype
  (product decision). Tag: `n/a` — kept as historical reference, not
  v1.1 backlog.

### W-15 — AddSheet description input CSS-exact comparison deferred (INFO)

- **Where:** `frontend/src/screensV10/AddSheet/AddSheet.tsx` description
  input + `AddSheet.module.css` (dashed-underline 24px italic).
- **Prototype/Spec:** `prototype/poster-screens.jsx:1170-1180`
  → `fontFamily:'DM Serif Display', fontStyle:'italic', fontSize:24`
  inline-styled in the prototype JSX.
- **Reality:** Phase 29-04 fix `3c180ce` restyled description input to
  dashed-underline 24px italic — visually matches the prototype in
  baseline. CSS-level exact-match (kerning, line-height, baseline shift)
  not formally verified.
- **Visual impact:** none in baseline.
- **Decision:** accepted v1.0.1 → defer formal CSS audit to v1.1
  (`POL-V11-15`, tag: `ui-polish`).

### W-16 — Subscriptions row trailing `···` button vs span plate (INFO)

- **Where:** `frontend/src/screensV10/Subscriptions/SubscriptionsView.tsx:110-118`
  renders `<button>` with 22px char.
- **Prototype/Spec:** `prototype/poster-screens.jsx:1102` uses `<span>`
  with `background: rgba(0,0,0,0.18)` — small dark plate around dots.
- **Reality:** Implementation uses a bare `<button>` so the trailing
  dots are tappable (accessibility win + matches the future per-sub
  context-menu affordance). Visually missing the small dark plate
  wrapper.
- **Visual impact:** small; 22×22 hit-target region looks bare vs
  prototype's plated chip.
- **Decision:** accepted v1.0.1 → defer to v1.1 (`POL-V11-16`,
  tag: `ui-polish`). Note: bare-button is intentional for a11y; the
  v1.1 polish would wrap it in a plated `<span>` background while
  keeping click semantics.

### W-17 — AI suggestion chip copy diverges from prototype (INFO)

- **Where:** `frontend/src/screensV10/Ai/computeAi.ts` default chips.
- **Prototype/Spec:** «Сколько я потратил на еду?», «Запиши: кофе
  350 ₽», «На что трачу больше всего?», «Шаблон на отпуск».
- **Reality:** Implementation uses a different chip set tailored to
  the local AI prompt engine.
- **Visual impact:** copy-only; no layout deviation.
- **Decision:** accepted v1.0.1 — product copy decision, not visual
  conformance. Tag: `product-copy`, not v1.1 visual backlog.

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

### I-06 — iOS-2 Transactions back-chevron alongside eyebrow (WARNING)

- **Where:** `ios/BudgetPlanner/FeaturesV10/Transactions/TransactionsV10View.swift`
  (header row composition).
- **Prototype/Spec:** SCREENS.md §02 → eyebrow «SECTION II» standalone
  (no preceding back affordance in the eyebrow row).
- **Reality:** Header renders `← НАЗАД` chevron inline before the
  `SECTION II` eyebrow. The chevron is part of the `PosterNavStack`
  edge-swipe / back-button contract (already captured under I-02).
- **Visual impact:** small extra glyph in the top-left of the eyebrow
  row; doesn't break poster composition. The eyebrow text itself
  matches spec.
- **Decision:** accepted v1.0.1 — back-chevron is required by I-02
  navigation contract on iOS. Tag: `n/a` — covered by I-02; logged
  here for audit traceability.

### I-07 — iOS-7 Savings «В MAY» Latin month abbreviation (INFO)

- **Where:** `ios/BudgetPlanner/FeaturesV10/Savings/SavingsV10View.swift`
  subline binding.
- **Prototype/Spec:** SCREENS.md §11 → «В МАЕ + X ₽» (Cyrillic locale).
- **Reality:** Default `DateFormatter` short-month abbreviation
  produces «MAY» Latin; subline renders «В MAY + 0 ₽».
- **Visual impact:** small — 3 Latin chars in the otherwise-Cyrillic
  subline.
- **Decision:** accepted v1.0.1 → defer to v1.1 (`POL-V11-i07`,
  tag: `i18n`). One-line fix:
  `DateFormatter.locale = Locale(identifier: "ru_RU")` or hardcoded
  Russian month-name map.

### I-08 — iOS-8 AI error-state captured in audit screenshot (INFO)

- **Where:** `.planning/phases/29-ui-conformance/ios-screenshots/ai-initial.png`
  (Phase 29-03 audit input).
- **Prototype/Spec:** SCREENS.md §03 hero state — DM Serif italic 36px
  observation phrase on cream background.
- **Reality:** Audit screenshot captured the error-state path
  («Не удалось загрузить наблюдение») because the iOS simulator could
  not reach the dev backend at capture time. Source review confirms
  the `success` branch in `AiV10View.swift` renders the spec hero
  correctly when observation loads.
- **Visual impact:** audit-only — production app renders correctly when
  network is reachable.
- **Decision:** accepted v1.0.1 — not a real layout bug. Tag: `audit-artefact`.
  v1.1 audit re-capture should seed the observation API or stub it
  client-side before screenshotting.

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
  W-05 selectors. (Phase 29-04 closed the `nav-plan` half via
  `data-nav="plan"`; the `nav-subscriptions` half remains.)
- **Phase 29 audit v1.1 polish backlog** (W-06..W-17 / I-06..I-08):
  - `ui-polish` cluster (W-06 VOL plural, W-07 chip-bar wrap,
    W-08 keypad `.` opacity, W-09/W-10 Mass 70→68 size delta,
    W-12 AI chip border-direction, W-15 AddSheet desc CSS exact,
    W-16 Subscriptions `···` plate) — single v1.1 design polish pass.
  - `tech-debt` cluster (W-11 Subscriptions token enforcement) —
    bundle with broader token-rename audit.
  - `e2e-determinism` cluster (W-13 BigFig rAF count-up) — extend
    `freezeMotion` to monkey-patch BigFig terminal value.
  - `i18n` cluster (I-07 iOS Savings month locale) — one-line fix.
  - `audit-artefact` cluster (I-08 iOS AI error-state screenshot) —
    seed observation before next iOS re-capture.
  - **No-op cluster** (W-14 Transactions empty-state copy,
    W-17 AI chip copy, I-06 iOS back-chevron) — accepted as
    implementation supersedes prototype OR mandated by other
    divergence; not in v1.1 visual backlog.
