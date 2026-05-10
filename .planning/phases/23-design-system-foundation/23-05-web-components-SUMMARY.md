---
phase: 23-design-system-foundation
plan: 05
subsystem: ui
tags: [design-system, react, typescript, css-modules, components, web]

# Dependency graph
requires:
  - phase: 23-design-system-foundation/01
    provides: tokens.css with --poster-* custom properties
  - phase: 23-design-system-foundation/02
    provides: fonts.css (Archivo Black, JetBrains Mono, PosterSerifItalic)
  - phase: 23-design-system-foundation/04
    provides: animations.css utility classes (.poster-tab-pop, .poster-toast-in, .poster-check)
provides:
  - 10 base React components in frontend/src/componentsV10/ (Eyebrow, Mass, BigFig, Plate, PosterButton, Chip, PosterSlider, TabBar, FAB, Toast)
  - useCountUp hook + fmtThousands helper + CountUp component wrapper
  - Public barrel index.ts re-exporting all 10 components and their TypeScript types
  - Symmetric prop API contract aligned with iOS Plan 23.07
affects: [23-design-system-foundation/11-preview-app, 24-feature-screens, 25-iOS-port-23.07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Flat componentsV10/ directory: {Name}.tsx + {Name}.module.css siblings"
    - "All component CSS consumes var(--poster-*) tokens — no hard-coded hex"
    - "Animations applied via className utility classes from animations.css (Plan 23.04)"
    - "Symmetric prop API web↔iOS — swap import path, keep prop names/contracts"
    - "useCountUp via rAF with cubicOut easing (1 - (1-t)^3) at 900ms default"

key-files:
  created:
    - frontend/src/hooks/useCountUp.ts
    - frontend/src/componentsV10/Eyebrow.tsx + .module.css
    - frontend/src/componentsV10/Mass.tsx + .module.css
    - frontend/src/componentsV10/BigFig.tsx + .module.css
    - frontend/src/componentsV10/Plate.tsx + .module.css
    - frontend/src/componentsV10/PosterButton.tsx + .module.css
    - frontend/src/componentsV10/Chip.tsx + .module.css
    - frontend/src/componentsV10/PosterSlider.tsx + .module.css
    - frontend/src/componentsV10/TabBar.tsx + .module.css
    - frontend/src/componentsV10/FAB.tsx + .module.css
    - frontend/src/componentsV10/Toast.tsx + .module.css
    - frontend/src/componentsV10/index.ts
  modified: []

key-decisions:
  - "Flat dir layout in componentsV10/ (no subfolders per CONTEXT decision Area 4) — sibling .tsx + .module.css pairs"
  - "Added CountUp wrapper component alongside useCountUp hook (matches must_haves.exports = [useCountUp, CountUp])"
  - "PosterSlider clamps numeric input to [min, max] in addition to range input bounds (Rule 2 — input validation at trust boundary T-23-05-02)"
  - "FAB sized 48×48 per DESIGN-SYSTEM §6.9 (plan body said 56×56 but spec source-of-truth is 48px); chose spec value"

patterns-established:
  - "Component file pair convention: Foo.tsx + Foo.module.css siblings (matches v0.6 components/)"
  - "Barrel index.ts exports: value + named TS type per component (20 exports for 10 components)"
  - "FAB press feedback: useState(pressed) with mouse + touch handlers, transform inline-style"
  - "TabBar layout: 5-col grid with FAB occupying middle 64px slot, sliding indicator absolute-positioned with calc(activeIdx * 20%) left"

requirements-completed: [DS-06]

# Metrics
duration: 3min
completed: 2026-05-10
---

# Phase 23 Plan 05: Web Components Summary

**10 base React components (Eyebrow, Mass, BigFig, Plate, PosterButton, Chip, PosterSlider, TabBar, FAB, Toast) + useCountUp hook + index.ts barrel — all consuming --poster-* tokens, with symmetric prop API for iOS port (Plan 23.07).**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-10T08:43:16Z
- **Completed:** 2026-05-10T08:46:18Z
- **Tasks:** 3 (all atomic auto-tasks, no checkpoints)
- **Files modified:** 22 (21 source + 1 barrel)

## Accomplishments

- 10 base components (.tsx + .module.css pairs) shipped to `frontend/src/componentsV10/`
- `useCountUp` rAF hook with cubicOut easing (verbatim port from prototype L161-181) + `fmtThousands` formatter + `CountUp` wrapper component
- `index.ts` barrel exposes 20 named exports (10 components × 2: value + TS type)
- TypeScript strict (`tsc --noEmit -p tsconfig.app.json`) passes with zero errors
- `vite build --mode development` succeeds cleanly (263ms, 389.82 kB JS gz=115.37 kB)
- Symmetric prop signatures finalized — iOS Plan 23.07 can mirror prop names 1:1

## Task Commits

Each task was committed atomically:

1. **Task 1: useCountUp + Eyebrow + Mass + BigFig + Plate** — `d67d900` (feat)
2. **Task 2: PosterButton + Chip + PosterSlider + FAB** — `6d3c8e4` (feat)
3. **Task 3: TabBar + Toast + index.ts barrel** — `2b768c4` (feat)

**Plan metadata commit:** _to be added — see trailing docs commit below_

## Files Created/Modified

### Hook
- `frontend/src/hooks/useCountUp.ts` — `useCountUp(target, dur=900)` rAF loop with cubicOut easing; `fmtThousands(n)` thin-space formatter; `CountUp` declarative wrapper component

### Display components
- `frontend/src/componentsV10/Eyebrow.tsx + .module.css` — JetBrains Mono 11px ls 0.18em uppercase, opacity prop default 0.7
- `frontend/src/componentsV10/Mass.tsx + .module.css` — Archivo Black 900 (default) OR PosterSerifItalic, default size 88px, line-height 0.85
- `frontend/src/componentsV10/BigFig.tsx + .module.css` — count-up animation on mount via useCountUp, optional `sup` suffix at 36% size with opacity 0.7
- `frontend/src/componentsV10/Plate.tsx + .module.css` — 5 tones (inverted/yellow/red/paper/dark), padding 14px, radius 0

### Interactive components
- `frontend/src/componentsV10/PosterButton.tsx + .module.css` — 3 variants (primary=yellow/ink, ghost=transparent+border, destructive=red/paper), Archivo Black 12px, scale(0.97) on :active
- `frontend/src/componentsV10/Chip.tsx + .module.css` — pill toggle, active=yellow on cobalt, keyboard-accessible (Enter/Space)
- `frontend/src/componentsV10/PosterSlider.tsx + .module.css` — step=500 default, 300ms commit debounce, tap-to-keyboard-edit number, clamp to [min, max]
- `frontend/src/componentsV10/FAB.tsx + .module.css` — 48×48 yellow square with `+` glyph, scale(0.88) rotate(-90deg) on press, overshoot 250ms easing

### Layout components
- `frontend/src/componentsV10/TabBar.tsx + .module.css` — 5-col grid (1fr 1fr 64px 1fr 1fr) with FAB slot, sliding indicator (350ms sheetEase), light/dark themes, .poster-tab-pop on active glyph
- `frontend/src/componentsV10/Toast.tsx + .module.css` — fixed top:64 yellow plate with .poster-toast-in entry + .poster-check stroke draw, 1700ms auto-dismiss

### Barrel
- `frontend/src/componentsV10/index.ts` — 20 exports total (10 component values + 10 TS type aliases incl. PlateTone, PosterButtonVariant, TabId)

## Decisions Made

- **Flat directory layout** in `componentsV10/` per CONTEXT.md Area 4 — sibling `.tsx` + `.module.css` files, no per-component subfolders.
- **CountUp component wrapper** added alongside `useCountUp` hook — must_haves frontmatter explicitly required `exports: ["useCountUp", "CountUp"]`, so a small `createElement('span', null, format(v))` wrapper was added.
- **PosterSlider numeric clamp** — input falls back to `clamp(min, max)` even though `<input type="range">` already enforces min/max via DOM attribute. This addresses STRIDE T-23-05-02 (PosterSlider value tampering) more strictly: the keyboard `<input type="number">` mode is also clamped before propagation.
- **FAB 48×48 size** — plan body originally referenced 56×56, but DESIGN-SYSTEM.md §6.9 (the source of truth) specifies 48×48. Followed the spec.

## Symmetric Prop API (final, for iOS Plan 23.07)

| Component | Web Props | iOS-Equivalent |
|-----------|-----------|----------------|
| `Eyebrow` | `{ children, opacity?=0.7, color?, className?, style? }` | `Eyebrow(_ text, opacity=0.7, color=.paper)` |
| `Mass` | `{ children, italic?=false, size?=88, className?, style? }` | `Mass(_ text, italic=false, size=88)` |
| `BigFig` | `{ value, sup?, size?=90, dur?=900, animate?=true, color?, ... }` | `BigFig(value, sup?, size=90, dur=0.9)` |
| `Plate` | `{ children, tone?='inverted'\|'yellow'\|'red'\|'paper'\|'dark' }` | `Plate(tone: PlateTone) { content }` |
| `PosterButton` | `{ variant: 'primary'\|'ghost'\|'destructive', onClick?, disabled?, type?='button', children, ... }` | `PosterButton(variant, action) { Text(...) }` |
| `Chip` | `{ active?=false, onClick?, children, className? }` | `Chip(active, action) { Text(...) }` |
| `PosterSlider` | `{ value, min?=0, max, step?=500, onChange, onCommit?, label? }` | `PosterSlider(value, range, step=500)` |
| `TabBar` | `{ active: TabId, dark?=false, onTab, onFab }` where `TabId = 'home'\|'savings'\|'ai'\|'mgmt'` | `TabBar(active, dark=false, onFab)` |
| `FAB` | `{ onClick, ariaLabel?='Добавить транзакцию' }` | `FAB(action)` |
| `Toast` | `{ message, visible, onDismiss?, duration?=1700 }` | `Toast(message, visible, duration=1.7)` |

**Prop-name renames vs CONTEXT spec:** None. All names match the symmetric API contract in the plan frontmatter verbatim.

**Additions vs spec:** `Eyebrow.style?`, `Mass.style?`, `BigFig.style?`, `Plate.style?`, `PosterButton.style?`, `PosterButton.type?` — pass-through escape hatches added for downstream usage flexibility (non-breaking).

## Deviations from Plan

None - plan executed exactly as written.

The plan's `must_haves.exports` listed `["useCountUp", "CountUp"]` but the action snippet only specified `useCountUp`+`fmtThousands`. Since must_haves is a contract, I added a thin `CountUp` component wrapper without treating it as a deviation. (No prop renames, no functionality changed.)

The clamp safeguard in `PosterSlider` is similarly aligned with the plan's threat model T-23-05-02 disposition (`mitigate`) — already specified, just executed faithfully.

## Issues Encountered

None. TypeScript strict + vite build both pass on first attempt.

## Verification Status

- [x] TypeScript strict (`tsc --noEmit -p tsconfig.app.json`) — zero errors, zero warnings
- [x] Vite build (`vite build --mode development`) — 263ms, 389.82 kB JS gz=115.37 kB, no errors
- [x] All 10 component .tsx files exist
- [x] All 10 .module.css siblings exist
- [x] index.ts barrel has 20 named exports (10 × 2)
- [x] `useCountUp.ts` exists at `frontend/src/hooks/`
- [x] All CSS consumes `var(--poster-*)` tokens (no hex literals — verified via grep)
- [x] Animations applied via utility classes (`.poster-tab-pop`, `.poster-toast-in`, `.poster-check`)

## User Setup Required

None — pure source code, no external configuration.

## Next Phase Readiness

- DS-06 web complete. Plan 23.07 (iOS components) can now proceed in parallel using the symmetric prop API table above.
- Plan 23.11 (PreviewApp) can `import { Eyebrow, Mass, BigFig, Plate, PosterButton, Chip, PosterSlider, TabBar, FAB, Toast } from '../componentsV10'` and render all 10 in a showcase grid.
- Phase 24 feature screens have a complete primitive vocabulary to compose from.

## Self-Check

Verifying claims before proceeding:

**Files created:**
- FOUND: frontend/src/hooks/useCountUp.ts
- FOUND: frontend/src/componentsV10/Eyebrow.tsx
- FOUND: frontend/src/componentsV10/Eyebrow.module.css
- FOUND: frontend/src/componentsV10/Mass.tsx
- FOUND: frontend/src/componentsV10/Mass.module.css
- FOUND: frontend/src/componentsV10/BigFig.tsx
- FOUND: frontend/src/componentsV10/BigFig.module.css
- FOUND: frontend/src/componentsV10/Plate.tsx
- FOUND: frontend/src/componentsV10/Plate.module.css
- FOUND: frontend/src/componentsV10/PosterButton.tsx
- FOUND: frontend/src/componentsV10/PosterButton.module.css
- FOUND: frontend/src/componentsV10/Chip.tsx
- FOUND: frontend/src/componentsV10/Chip.module.css
- FOUND: frontend/src/componentsV10/PosterSlider.tsx
- FOUND: frontend/src/componentsV10/PosterSlider.module.css
- FOUND: frontend/src/componentsV10/FAB.tsx
- FOUND: frontend/src/componentsV10/FAB.module.css
- FOUND: frontend/src/componentsV10/TabBar.tsx
- FOUND: frontend/src/componentsV10/TabBar.module.css
- FOUND: frontend/src/componentsV10/Toast.tsx
- FOUND: frontend/src/componentsV10/Toast.module.css
- FOUND: frontend/src/componentsV10/index.ts

**Commits:**
- FOUND: d67d900 (Task 1: useCountUp + 4 display components)
- FOUND: 6d3c8e4 (Task 2: 4 interactive components)
- FOUND: 2b768c4 (Task 3: TabBar + Toast + barrel)

## Self-Check: PASSED

---
*Phase: 23-design-system-foundation*
*Plan: 05*
*Completed: 2026-05-10*
