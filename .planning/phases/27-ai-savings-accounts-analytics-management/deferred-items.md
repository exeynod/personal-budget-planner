# Phase 27 — Deferred Items

Items discovered during execution that are out of scope for the current plan
and tracked for resolution in a future wave.

## Build-time references awaiting Wave 4 plans

| Discovered by | File:line | Missing symbol | Resolves in |
|---------------|-----------|----------------|-------------|
| 27-07 | `ios/BudgetPlanner/FeaturesV10/Management/MgmtHubView.swift:137` | `AccessV10View` | Wave 4 — `AccessV10View.swift` (mgmt access tab plan, MGMT-V10-04 owner-gate) |

These references exist in plan 27-11 (mgmt hub) which composes the V10 shell
hierarchy. They will compile clean once the wave-4 plan that creates the
referenced screen lands. Per scope_boundary, plan 27-07 (iOS AI shell) does
not auto-fix cross-plan symbol gaps.

## Plan 27-07 status

Plan 27-07 source files (`AiData.swift`, `AiV10View.swift`,
`AiV10ViewModel.swift`, `ObservationDTO.swift`, `AIObservationAPI.swift`,
`AiDataTests.swift`) compile cleanly. Verified via:

```
cd ios && make build 2>&1 | grep -E "error:" | grep -E "(AiV10View|AiV10ViewModel|AiData|ObservationDTO|AIObservationAPI|AiDataTests)"
```

→ no output (no errors in 27-07's owned files).
