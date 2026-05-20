---
phase: 68-tech-debt-cleanup
plan: 03
subsystem: frontend
tags: [typescript, tsc, vitest, type-check, test-gate, prop-drift, types-node, tech-debt]

# Dependency graph
requires:
  - phase: 67
    provides: "Phase 67 excluded test files from prod tsc -b (tsconfig.app.json exclude) to unblock the build — this plan re-covers them under a separate test project."
  - phase: 27-02
    provides: "AiView + AiViewProps contract (observation/observationError: string | null)"
  - phase: 30-07
    provides: "SettingsView homeColor/pickerOpen/onSelectHomeColor/onTogglePicker props (DEBT-08 Home color picker)"
  - phase: 54-01
    provides: "SettingsView theme/themePickerOpen/onSelectTheme/onToggleThemePicker props (LG-SW-02 web theme picker)"
provides:
  - "typecheck:test gate (tsc -p tsconfig.test.json --noEmit) — test files (and full src) are back under type-check; prop/type drift is caught at build time again."
  - "@types/node devDep — node:fs / node:path / __dirname resolve in tests (TxV10TabDemote)."
  - "Green web baseline: prod build + test-typecheck + vitest (738 tests) all green."
affects: [69-codegen-migration]

# Tech tracking
tech-stack:
  added:
    - "@types/node@^22 (devDependency) — Node builtin types for tests"
  patterns:
    - "Two type-check projects: prod `tsc -b` (tsconfig.app.json, tests EXCLUDED, fast) + `typecheck:test` (tsconfig.test.json, tests INCLUDED, own buildinfo). Prod build stays test-free; tests re-covered separately."
    - "Test fixtures are typed to the current component prop interface (e.g. baseProps: AiViewProps) so literal-narrowing doesn't reject valid null<->string overrides, and missing-required-prop drift surfaces immediately."

key-files:
  created:
    - frontend/tsconfig.test.json
    - .planning/phases/68-tech-debt-cleanup/68-03-SUMMARY.md
  modified:
    - frontend/package.json
    - frontend/package-lock.json
    - frontend/src/screensV10/Ai/__tests__/AiView.test.tsx
    - frontend/src/screensV10/Management/__tests__/SettingsView.test.tsx

key-decisions:
  - "Separate test project (tsconfig.test.json) over re-including tests in tsconfig.app.json — keeps the prod `tsc -b` build fast and test-free (Phase 67 exclude untouched) while re-covering tests. CONTEXT's Claude's-discretion choice."
  - "tsconfig.test.json include = ['src', 'src/test/setup.ts'] (whole tree, not just the 3 files) so the test gate type-checks ALL test files going forward, not only the ones touched here."
  - "types: ['node', '@testing-library/jest-dom'] — vitest globals are off (vite.config test.globals=false; tests import { describe, it, ... } from 'vitest'), so no 'vitest/globals' needed; jest-dom matchers come via the type augmentation in setup.ts which the project already includes."
  - "AiView.test fixed by typing baseProps as AiViewProps (not by casting overrides). The literal `observation: 'string'` / `observationError: null` baseProps narrowed `Partial<typeof baseProps>` too tightly, rejecting the valid null/string overrides the component contract (string | null) allows."
  - "SettingsView.test fixed by adding the 8 genuinely-required props that drifted in (Phase 30-07 color picker + Phase 54-01 theme picker). Production SettingsViewProps left untouched — drift fixed at the test (T-68-03-02 accept)."

patterns-established:
  - "Pattern: web has TWO tsc gates — `npm run build` (prod, tests excluded) and `npm run typecheck:test` (tests included). Both must be green; CI/local should run both."

requirements-completed: [A3]

# Metrics
duration: ~12min
completed: 2026-05-20
---

# Phase 68 Plan 03: Web tsc test-gate (A3) Summary

**Re-covered the test files under type-check via a dedicated `typecheck:test` gate (`tsconfig.test.json` + `@types/node`) without touching the fast, test-free prod `tsc -b`, then fixed the prop-drift in `AiView.test.tsx` (literal-narrowed baseProps) and `SettingsView.test.tsx` (8 missing required props from the Phase 30-07 color picker + Phase 54-01 theme picker) — prod build, test-typecheck (zero errors), and vitest (738 tests) are all green.**

## Performance

- **Duration:** ~12 min
- **Tasks:** 2
- **Files modified:** 5 (2 test, package.json + lock, 1 new tsconfig)

## Accomplishments

- **Task 1 — gate scaffolding (commit `dbe8b47`):**
  - `npm i -D @types/node@^22` (compatible with TS ^5.6 / Node 25 runtime) → `node:fs` / `node:path` / `__dirname` in `TxV10TabDemote.test.tsx` now resolve.
  - Created `frontend/tsconfig.test.json`: mirrors `tsconfig.app.json` compilerOptions, `include: ["src", "src/test/setup.ts"]` (whole tree so the gate covers ALL test files), `types: ["node", "@testing-library/jest-dom"]`, `noEmit: true`, and its **own** `tsBuildInfoFile` (`./node_modules/.tmp/tsconfig.test.tsbuildinfo`) to avoid clobbering the app build cache.
  - Added `"typecheck:test": "tsc -p tsconfig.test.json --noEmit"` to package.json. `build` and `test` left unchanged; `tsconfig.app.json` test-exclude untouched (prod build stays test-free).

- **Task 2 — prop-drift fix (commit `1c8b3dd`):**
  - Ran `typecheck:test` → 4 errors in 2 files (TxV10TabDemote was fixed by Task 1's `@types/node` alone, no fixture change).
  - `AiView.test.tsx`: typed `baseProps` as `AiViewProps` (imported the existing exported interface). The literal baseProps (`observation: 'Май…'`, `observationError: null`) had narrowed `Partial<typeof baseProps>` so that the `observation: null` / `observationError: 'string'` overrides in the loading/error tests were rejected — even though the real contract is `string | null`. Typing to the interface restores the correct widths. No casts.
  - `SettingsView.test.tsx`: `makeProps` was missing 8 required props that drifted in after the test was written — `homeColor` / `pickerOpen` / `onSelectHomeColor` / `onTogglePicker` (Phase 30-07 DEBT-08 Home color picker) and `theme` / `themePickerOpen` / `onSelectTheme` / `onToggleThemePicker` (Phase 54-01 LG-SW-02 theme picker). Added them with valid defaults (`homeColor: 'coral'`, `theme: 'maximal_poster'`, sheets closed, spies for handlers). Production `SettingsViewProps` untouched.
  - No `@ts-ignore` and no `any`-casts introduced — every fix is a real fixture correction to the current component contract.

## Verification — three gates

```
cd frontend
npm run build           → green (tsc -b + vite; tests still excluded; built in ~280ms)
npm run typecheck:test  → zero errors
npx vitest run          → 55 files / 738 tests passed
```

(The vitest run prints a `usePosterRouter must be used inside <PosterRouterProvider>` stack-trace — that is an intentional negative-path assertion in `posterRouter.test.tsx`; the suite still reports 738/738 passed.)

- `package.json` has `@types/node` devDep + `typecheck:test` script; `tsconfig.test.json` exists (Task 1 automated verify passed).

## Deviations from Plan

None — plan executed as written. (TxV10TabDemote.test.tsx needed no fixture change; its only errors were the `node:fs`/`node:path` ones resolved by Task 1's `@types/node`. The plan anticipated possible prop-drift there but there was none.)

## Threat surface

No new threat surface. T-68-03-01 (type-check coverage) is now mitigated — `typecheck:test` re-covers test files so prop/type drift fails the gate again, while the prod build stays test-free and fast. T-68-03-02 (stale fixtures) handled at the test, no production contract change.

## Self-Check: PASSED

- FOUND: frontend/tsconfig.test.json
- FOUND: frontend/package.json (typecheck:test + @types/node)
- FOUND: frontend/src/screensV10/Ai/__tests__/AiView.test.tsx (baseProps: AiViewProps)
- FOUND: frontend/src/screensV10/Management/__tests__/SettingsView.test.tsx (8 props added)
- FOUND commit: dbe8b47 (Task 1)
- FOUND commit: 1c8b3dd (Task 2)
