---
phase: 68-tech-debt-cleanup
plan: 04
subsystem: ios
tags: [swift, doc-comment, ai-suggest, threshold, tech-debt, cosmetic]

# Dependency graph
requires:
  - phase: 67
    provides: "P2-5 set the backend AI-suggest confidence threshold to 0.35 (SUGGEST_THRESHOLD in app/api/routes/ai_suggest.py); the iOS doc-comment still said 0.5."
provides:
  - "AISuggestCategoryAPI.swift doc-comment + header note now state the real 0.35 threshold — no stale-doc drift before Phase 69."
affects: [69-codegen-migration]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - .planning/phases/68-tech-debt-cleanup/68-04-SUMMARY.md
  modified:
    - ios/BudgetPlanner/Networking/Endpoints/AISuggestCategoryAPI.swift

key-decisions:
  - "Updated BOTH stale references in the file (the SuggestCategoryDTO doc-comment ~line 23 AND the file-header note ~line 5 'filters confidence < 0.5'), not just the doc-comment the plan named — they describe the same backend value, so leaving the header at 0.5 would re-introduce the same drift (Rule 1 — same incorrect documentation)."
  - "Verified the live backend value before editing: app/api/routes/ai_suggest.py docstring reads 'confidence >= 0.35 (SUGGEST_THRESHOLD)' — so 0.35 is correct, not a guess."

requirements-completed: [A4]

# Metrics
duration: ~5min
completed: 2026-05-20
---

# Phase 68 Plan 04: iOS AI-suggest threshold doc-comment (A4) Summary

**Fixed the stale `0.5` → `0.35` AI-suggest confidence threshold in two comment locations in `AISuggestCategoryAPI.swift` (the `SuggestCategoryDTO` doc-comment and the file-header backend note), matching the real backend `SUGGEST_THRESHOLD = 0.35` set in Phase 67 P2-5 — comment-only, zero logic change, no formatting churn.**

## Performance

- **Duration:** ~5 min
- **Tasks:** 1
- **Files modified:** 1 (comment-only, 2 insertions / 2 deletions)

## Accomplishments

- **Task 1 — threshold comment fix (commit `6bd18b6`):**
  - Verified backend ground truth: `app/api/routes/ai_suggest.py` docstring — "Возвращает ближайшую категорию если confidence >= 0.35 (SUGGEST_THRESHOLD)". So `0.35` is the live value (Phase 67 P2-5), not `0.5`.
  - Updated the `SuggestCategoryDTO` doc-comment (~line 23): "below its 0.5 threshold" → "below its 0.35 threshold".
  - Also updated the file-header note (~line 5): "filters confidence < 0.5 → nulls category_id/name" → "< 0.35" — the plan named only the doc-comment, but the header carried the identical stale value; leaving it would re-introduce the same drift the plan exists to remove (Rule 1).
  - Ran swift-format on the touched file — no diff churn beyond the two comment lines (file was already conformant). No struct/field/logic change.

## Verification

```
grep "0.35" AISuggestCategoryAPI.swift          → present
grep -c "0.5 threshold" AISuggestCategoryAPI.swift → 0
git diff                                         → only the 2 comment lines changed
```

Plan automated verify passed: `0.35` present AND `0.5 threshold` count = 0. No build/test needed for a comment change (per plan environment note — A4 is comment-only, hand-written non-generated file, no xcodegen).

## Deviations from Plan

**1. [Rule 1 — stale documentation] Also fixed the file-header `0.5` reference**
- **Found during:** Task 1
- **Issue:** Beyond the named `SuggestCategoryDTO` doc-comment (~line 23), the file-header comment (~line 5) also said "filters confidence < 0.5", describing the same backend threshold.
- **Fix:** Changed it to "< 0.35" in the same commit. Leaving it would have left identical stale documentation in the very file the plan targets.
- **Files modified:** ios/BudgetPlanner/Networking/Endpoints/AISuggestCategoryAPI.swift
- **Commit:** `6bd18b6`

**Out-of-scope note (NOT fixed):** `cd ios && make format` runs `swift-format --recursive` over the whole `BudgetPlanner` + `BudgetPlannerTests` tree and reformatted ~80 unrelated files (pre-existing format drift). Per the scope boundary, those changes were reverted (`git checkout -- ios/` after stashing the target file) — only the comment-only target file was committed. The pre-existing tree-wide format drift is unrelated to A4 and left untouched.

## Threat surface

No new threat surface. T-68-04-01 (stale doc-comment, Repudiation) mitigated — the comment now matches the backend `0.35` threshold; no code path affected.

## Self-Check: PASSED

- FOUND: ios/BudgetPlanner/Networking/Endpoints/AISuggestCategoryAPI.swift (contains 0.35, no "0.5 threshold")
- FOUND: .planning/phases/68-tech-debt-cleanup/68-04-SUMMARY.md
- FOUND commit: 6bd18b6 (Task 1)
