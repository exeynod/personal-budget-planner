---
phase: 67-remediation-cleanup
plan: 06
subsystem: frontend-web
tags: [web, localStorage, shell-dispatch, theme, cleanup-inventory, P1-6, R5]
requires:
  - "main.tsx dual-shell dispatcher (DS-08)"
  - "useTheme.ts multi-theme selector (Phase 50)"
provides:
  - "Orthogonal shell/theme localStorage keys (ui.shell vs ui.theme)"
  - "v06 web shell reachable independent of theme choice"
  - "DEAD-SHELL-INVENTORY.md reachability + KEEP/DELETE-LATER decision"
affects:
  - "frontend/src/main.tsx shell dispatch"
  - "frontend/src/screensV10/common/useTheme.ts (now sole owner of ui.theme)"
tech-stack:
  added: []
  patterns:
    - "Distinct localStorage keys per concern (shell vs theme); whitelist-validated reads"
    - "One-time migration shim from legacy shared key"
key-files:
  created:
    - .planning/phases/67-remediation-cleanup/DEAD-SHELL-INVENTORY.md
  modified:
    - frontend/src/main.tsx
    - frontend/src/screensV10/common/useTheme.ts
    - frontend/src/vite-env.d.ts
decisions:
  - "Split keys (ui.shell for dispatch, ui.theme for theme) rather than delete v06 shell"
  - "Keep VITE_UI_THEME env name for shell override (documented) to minimise build-config churn"
  - "v06 shell = KEEP (reachable, maintained); ~50-file deletion deferred to scoped follow-up pending R6/ARCH-A1 owner decision"
metrics:
  duration: "~3 min"
  completed: "2026-05-20"
  tasks: 2
  files: 4
---

# Phase 67 Plan 06: Web ui.theme split + dead-shell inventory Summary

Split the colliding `localStorage['ui.theme']` key into `ui.shell` (shell
dispatch, `v06`/`v10`) and `ui.theme` (visual theme, `maximal_poster`/…), so
picking a v10 theme no longer makes the legacy v06 web shell unreachable; plus a
reachability inventory recording KEEP for the ~50-file v06 shell.

## What was built

### Task 1 — Key split (P1-6 / FE-F4) — commit `cdbdd7c`
- `main.tsx` shell dispatcher (`readTheme()`) now reads `localStorage['ui.shell']`
  (`v06`/`v10`), with a one-time migration shim that adopts a legacy `v06`/`v10`
  value from `ui.theme` into `ui.shell` (without clobbering theme values).
- `VITE_UI_THEME` env still wins for shell dispatch (kept the name to avoid
  build-config churn; documented in `vite-env.d.ts`). New installs default to v10.
- `useTheme.ts` is now the **sole owner** of `ui.theme` (theme values only);
  stale "coexistence on one key" comments updated in both files.
- The `<html data-theme>` bootstrap IIFE keeps reading `ui.theme` (theme), now
  with no shell-value leakage.
- Whitelist validation preserved on both readers (T-67-06-01); the collision
  state that made a valid shell unreachable is removed (T-67-06-02).

### Task 2 — Dead-shell inventory (R5) — commit `317d7a7`
- `DEAD-SHELL-INVENTORY.md`: import-graph evidence that `App.tsx` is imported
  only by `main.tsx` (v06 branch + AppV10-failure fallback); V10 uses its own
  `api/v10/*` layer.
- Lists ~50+ v06-only files (13 screens, 16 hooks, 6 api modules, ~38
  components) and the cross-shell shared modules to NOT delete (`useCountUp`,
  9 shared `api/*`, `BottomNav` test fixture, standalone `preview/PreviewApp`).
- Decision: **KEEP** — after the key split the v06 shell is a reachable,
  maintained alternative (`ui.shell=v06` / `VITE_UI_THEME=v06`). Deletion is out
  of scope; a bounded follow-up is proposed, gated on the R6/ARCH-A1 owner
  decision about sunsetting one shell.

## Verification
- `cd frontend && npm run build` — GREEN (tsc -b + vite, built in ~252ms).
- `grep -q "ui.shell" src/main.tsx` — present.
- `useTheme.test.ts` — 6/6 passing (theme key behaviour unchanged).
- `DEAD-SHELL-INVENTORY.md` exists and contains `v06`.

## Deviations from Plan

None — plan executed as written. Additionally ran the existing `useTheme` test
suite (not in the plan's automated verify) to confirm the `ui.theme` owner was
unaffected by the split; 6/6 passing.

## Threat surface
Both `localStorage` readers retain strict whitelist validation; no new network
endpoints, auth paths, or trust-boundary surface introduced. No threat flags.

## Notes for next plans
- v06 web-shell deletion remains a documented follow-up (see
  DEAD-SHELL-INVENTORY.md §5); blocked on R6 owner decision.
- iOS and backend untouched, as scoped.

## Self-Check: PASSED
- FOUND: frontend/src/main.tsx (modified, contains `ui.shell`)
- FOUND: frontend/src/screensV10/common/useTheme.ts (modified)
- FOUND: frontend/src/vite-env.d.ts (modified)
- FOUND: .planning/phases/67-remediation-cleanup/DEAD-SHELL-INVENTORY.md
- FOUND commit: cdbdd7c (Task 1)
- FOUND commit: 317d7a7 (Task 2)
