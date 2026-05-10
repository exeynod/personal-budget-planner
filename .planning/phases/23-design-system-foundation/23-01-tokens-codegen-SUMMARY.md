---
phase: 23-design-system-foundation
plan: 01
subsystem: design-system
tags: [design-system, codegen, tokens, foundation]
requirements: [DS-01]
dependency_graph:
  requires: []
  provides:
    - "design/tokens.json — single source of truth for palette/spacing/typography/shadows/easing"
    - "scripts/gen-tokens.ts — codegen entry-point (npm run gen:tokens)"
    - "frontend/src/stylesV10/tokens.css — CSS custom properties (--poster-*) for web V10 shell"
    - "ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift — Swift enum PosterTokens for iOS V10"
    - "Makefile target tokens-check — CI drift gate"
  affects:
    - "All Phase 23-27 plans must consume from generated outputs, NOT redefine tokens"
tech_stack:
  added: ["tsx@^4.19.2", "typescript@^5.6.2"]
  patterns: ["custom Node TS codegen (~110 LOC, stdlib-only)", "CSS custom properties", "SwiftUI enum-namespaced static let constants"]
key_files:
  created:
    - "design/tokens.json (68 lines)"
    - "scripts/gen-tokens.ts (110 lines)"
    - "frontend/src/stylesV10/tokens.css (51 lines, generated)"
    - "ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift (76 lines, generated)"
    - "package.json (14 lines, repo-root)"
    - "Makefile (9 lines, repo-root)"
    - "package-lock.json (transitive lockfile)"
  modified: []
decisions:
  - "Custom TS codegen (no style-dictionary) — mirrors CONTEXT Area 1 decision, avoids version churn for ~110 LOC of templating"
  - "Stdlib-only imports (node:fs / node:path / node:url) — no external deps in generator itself"
  - "Portable script-dir resolver via `import.meta.dirname ?? fileURLToPath(import.meta.url) ?? __dirname` because tsx may load CJS or ESM depending on Node version"
  - "Swift `extension SwiftUI.Color { init(hex: String) }` is namespaced via the SwiftUI module prefix — does NOT clash with existing `extension Color { init(hex: UInt32) }` in ios/BudgetPlanner/Design/Tokens.swift (different argument label)"
metrics:
  duration_minutes: ~25
  tasks_completed: 2
  files_created: 7
  generator_loc: 110
  tokens_total: 51
  completed_date: 2026-05-10
---

# Phase 23 Plan 01: Tokens Codegen Summary

DS-01 design-token round-trip foundation: single-source `design/tokens.json` flows to web CSS custom properties and iOS Swift constants via custom ~110-LOC TypeScript codegen, with `make tokens-check` Makefile gate to catch drift.

## What Was Built

**6 files (1 source, 1 generator, 2 build configs, 2 generated artifacts) + 1 lockfile committed across 2 atomic commits.**

### Task 1 — Source + build config (commit `136bffa`)

- **`design/tokens.json`** (68 lines) — canonical token registry extracted verbatim from `DESIGN-SYSTEM.md` §1-§4 + §7.1:
  - 8 palette colors (cream, ink, paper, black, coral, cobalt, yellow, red)
  - 11 spacing values (4, 8, 10, 12, 14, 18, 22, 24, 28, 40, 56)
  - 2 radii (none=0, device=48 — iOS frame preview only)
  - 3 shadows (tabBar, fab, thumb)
  - 6 font families (archivoBlack, dmSerifItalic, ptSerifItalic, manrope, jetBrainsMono, posterSerifItalic)
  - 10 font-sizes (eye … massItalic)
  - 5 letter-spacings (eye, cta, hero, mass, uppercaseBody)
  - 3 easing curves (easeOut, overshoot, sheetEase)
- **`package.json`** (repo-root, NEW — was missing) — scripts `gen:tokens`, `gen:tokens:watch`, `tokens-check`; devDeps `tsx@^4.19.2` + `typescript@^5.6.2`. Pinned via `package-lock.json`.
- **`Makefile`** (root, NEW) — targets `tokens` (alias for `npm run gen:tokens`) and `tokens-check` (regen + `git diff --exit-code` drift gate).

### Task 2 — Generator + emitted artifacts (commit `256a8de`)

- **`scripts/gen-tokens.ts`** (110 LOC, stdlib-only) — reads `design/tokens.json`, emits web CSS + iOS Swift via pure string templating. Imports limited to `node:fs`, `node:path`, `node:url`.
- **`frontend/src/stylesV10/tokens.css`** (51 lines, generated) — 51 CSS custom properties on `:root`, prefixed `--poster-*`.
- **`ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift`** (76 lines, generated) — `enum PosterTokens` with `Color`, `Space`, `Radius`, `FontSize`, `Font`, `Easing`, `Shadow` nested namespaces. Includes `extension SwiftUI.Color { init(hex: String) }` helper.

## Verification Results

All from PLAN's `<verification>` block (run sequentially):

| # | Check | Result |
|---|-------|--------|
| 1 | `python3 -c "import json; json.load(open('design/tokens.json'))"` | exit 0 |
| 2 | `npm run gen:tokens` | exit 0 — prints `✓ tokens.css and PosterTokens.swift regenerated` |
| 3 | `git diff --exit-code design/ frontend/src/stylesV10/tokens.css ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift` | exit 0 |
| 4 | `make tokens-check` | **exit 0** |
| 5 | Round-trip: edit `coral=#ABCDEF` in tokens.json → regen → both CSS (`--poster-coral: #ABCDEF`) and Swift (`Color(hex: "ABCDEF")`) updated; reverted | passed |

**Idempotency:** running `npm run gen:tokens` twice produces byte-identical output (md5 stable for both CSS and Swift).

**Drift detection:** editing `design/tokens.json` without committing regenerated outputs causes `make tokens-check` to exit non-zero with the `ERROR: generated tokens drifted from source` message and a git diff showing the divergence.

## Acceptance Criteria (all green)

- `wc -l scripts/gen-tokens.ts` → **110** (≤120 budget)
- `grep -E "^import" scripts/gen-tokens.ts | grep -v "from 'node:" | wc -l` → **0** (stdlib only)
- `head -1 frontend/src/stylesV10/tokens.css` → contains `AUTO-GENERATED`
- `grep -F -- "--poster-coral: #FF5A3C;" frontend/src/stylesV10/tokens.css` → 1 hit
- `grep -F -- "--poster-easing-ease-out: cubic-bezier(0.22, 0.61, 0.36, 1);" frontend/src/stylesV10/tokens.css` → 1 hit
- `grep -F 'static let coral = SwiftUI.Color(hex: "FF5A3C")' ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift` → 1 hit
- `grep -F 'static let s22: CGFloat = 22' ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift` → 1 hit
- `grep -F 'extension SwiftUI.Color' ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift` → 1 hit
- `jq '.color | length' design/tokens.json` → 8
- `jq '.spacing | length' design/tokens.json` → 11

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocker] Generator failed at startup with `ERR_INVALID_ARG_TYPE` on `import.meta.dirname`**

- **Found during:** Task 2 first run of `npm run gen:tokens`
- **Issue:** PLAN spec used `const ROOT = join(import.meta.dirname, '..');`. Under Node 25 + tsx 4.19, the script was loaded as CommonJS, where `import.meta.dirname` is `undefined`, causing `node:path` `join` to throw.
- **Fix:** Added portable resolver:
  ```ts
  const meta = import.meta as { dirname?: string; url?: string };
  const SCRIPT_DIR = meta.dirname ?? (meta.url ? dirname(fileURLToPath(meta.url)) : __dirname);
  ```
  Falls back through ESM (Node 20+) → ESM URL → CJS `__dirname`. Adds 3-line `node:url` import.
- **Files modified:** `scripts/gen-tokens.ts`
- **Commit:** `256a8de` (rolled into Task 2 commit since fix was needed before generator could produce any output)

**2. [Rule 1 — Bug] Shadow regex never matched on bare-zero offset (`0 12px 30px ...`)**

- **Found during:** Task 2 first generation review
- **Issue:** PLAN's regex `(-?\d+)px?\s+(-?\d+)px?\s+...` used `px?` which means literal `p` followed by optional `x` — i.e. the `p` was REQUIRED. Source values like `0 12px 30px rgba(...)` have a bare `0` (no `p`/`px` suffix) for the X-offset, so the whole match failed and all three Swift `Shadow.*` tuples emitted `(x: 0, y: 0, blur: 0, opacity: 0)`.
- **Fix:** Changed each `px?` to `(?:px)?` (non-capturing group, optional whole `px` suffix).
- **Files modified:** `scripts/gen-tokens.ts`
- **Commit:** `256a8de` (rolled into Task 2 commit)

After fix, shadows emit correctly:
```swift
static let tabBar = (x: CGFloat(0), y: CGFloat(12), blur: CGFloat(30), opacity: 0.45)
static let fab    = (x: CGFloat(0), y: CGFloat(6),  blur: CGFloat(16), opacity: 0.35)
static let thumb  = (x: CGFloat(0), y: CGFloat(2),  blur: CGFloat(6),  opacity: 0.25)
```

## Auth Gates

None.

## Known Stubs

None — all generated tokens reflect the real DESIGN-SYSTEM.md values.

## Threat Flags

None — Task 1's `<threat_model>` is fully covered by the implementation: generator is deterministic (T-23-01-01 mitigated by idempotency check + Makefile gate), JSON parsing throws on invalid input (T-23-01-02), tokens are public design metadata (T-23-01-03 accepted), and `tsx` is pinned with lockfile (T-23-01-05 mitigated).

## Self-Check: PASSED

- FOUND: design/tokens.json
- FOUND: scripts/gen-tokens.ts
- FOUND: frontend/src/stylesV10/tokens.css
- FOUND: ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift
- FOUND: package.json
- FOUND: package-lock.json
- FOUND: Makefile
- FOUND: commit 136bffa
- FOUND: commit 256a8de

## Commits

| Hash      | Type  | Message                                                              |
|-----------|-------|----------------------------------------------------------------------|
| `136bffa` | chore | add design tokens source + repo-root npm + Makefile target          |
| `256a8de` | feat  | implement gen-tokens.ts + emit web/iOS token artifacts              |

## DS-01 Round-Trip Status

**Confirmed working.** Designer flow:
1. Edit `design/tokens.json` (e.g. change `coral` hex)
2. Run `npm run gen:tokens`
3. Both `frontend/src/stylesV10/tokens.css` and `ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift` update with no manual edits
4. CI gate `make tokens-check` blocks merge if regen was skipped

DS-01 is satisfied; downstream Phase 23 plans (fonts, animations, components) and Phase 24-27 screens can now consume `--poster-*` and `PosterTokens.*` symbolic references instead of hard-coding hexes.
