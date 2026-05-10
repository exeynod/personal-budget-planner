# Phase 27 — Deferred Items

Items discovered during execution that are out of scope for the current plan
and tracked for resolution in a future wave.

## Build-time references awaiting Wave 4 plans

| Discovered by | File:line | Missing symbol | Resolves in | Status |
|---------------|-----------|----------------|-------------|--------|
| 27-07 | `ios/BudgetPlanner/FeaturesV10/Management/MgmtHubView.swift:137` | `AccessV10View` | 27-11 GREEN commit | RESOLVED — `AccessV10View.swift` landed in commit `6d4b163` (`feat(27-11): MgmtHubView + Settings/AccessV10 + AdminAPI (GREEN)`) before plan 27-07 metadata commit |

Per scope_boundary, plan 27-07 (iOS AI shell) does not auto-fix cross-plan
symbol gaps; the resolution above happened in parallel via the 27-11 agent's
own commits. Final iOS `make build` after all parallel-wave commits landed:
`Build Succeeded`.

## Plan 27-07 status

Plan 27-07 source files (`AiData.swift`, `AiV10View.swift`,
`AiV10ViewModel.swift`, `ObservationDTO.swift`, `AIObservationAPI.swift`,
`AiDataTests.swift`) compile cleanly. Verified via:

```
cd ios && make build 2>&1 | grep -E "error:" | grep -E "(AiV10View|AiV10ViewModel|AiData|ObservationDTO|AIObservationAPI|AiDataTests)"
```

→ no output (no errors in 27-07's owned files).
