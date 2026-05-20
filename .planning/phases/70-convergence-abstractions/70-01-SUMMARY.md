---
phase: 70-convergence-abstractions
plan: 01
subsystem: ios-networking
tags: [convergence, deprecation, debt-registry, legacy-v10, R3]
requires:
  - "iOS V10 canonical enums (MeV10API, CategoriesV10API, ActualV10API, SubscriptionsV10API)"
  - "69 codegen drift-reports (DTO divergence facts: 2-val vs 4-val kind, tag field, optionality)"
provides:
  - ".planning/LEGACY-V10-DEBT-REGISTRY.md — single index of legacy↔V10 convergence debt (5 DEBT-70-* tickets + comment-debt sources)"
  - "@available(*, deprecated) on legacy enum-APIs naming canonical V10 enum + ticket"
  - "ActualAPI.delete documented + preserved as canonical-shared delete (both shells)"
affects:
  - "ios/BudgetPlanner/Networking/Endpoints/AuthAPI.swift"
  - "ios/BudgetPlanner/Networking/Endpoints/ManagementAPI.swift"
  - "ios/BudgetPlanner/Networking/Endpoints/TransactionsAPI.swift"
tech-stack:
  added: []
  patterns:
    - "deprecate-and-ticket over force-migrate: legacy enum stays, carries @available message + DEBT id, registry tracks the safe-migration precondition"
    - "per-method deprecation (ActualAPI.create/update) to preserve a shared sibling route (.delete) callable warning-free"
key-files:
  created:
    - .planning/LEGACY-V10-DEBT-REGISTRY.md
  modified:
    - ios/BudgetPlanner/Networking/Endpoints/AuthAPI.swift
    - ios/BudgetPlanner/Networking/Endpoints/ManagementAPI.swift
    - ios/BudgetPlanner/Networking/Endpoints/TransactionsAPI.swift
    - .planning/STATE.md
    - .planning/ROADMAP.md
decisions:
  - "KEEP BOTH SHELLS (owner R6): convergence is API/DTO-level only — no shell or View deleted. All 5 legacy↔V10 pairs are non-equivalent (DTO shape divergence or missing V10 verbs), so 0 call-sites migrated."
  - "ActualAPI.delete left UN-deprecated (per-method deprecation on create/update only): ActualV10API has no delete, so both v06 (TransactionsView) and V10 (TransactionsV10ViewModel/AddSheet) route DELETE /actual/{id} through it — it is the canonical shared delete."
  - "Deprecation warnings are warnings, not errors: build does not use -warnings-as-errors, confirmed by BUILD SUCCEEDED with deprecation warnings present at the 12 legacy call-sites."
metrics:
  duration: ~20m
  completed: 2026-05-21
  tasks: 3
  files: 4
---

# Phase 70 Plan 01: C/R3 Legacy↔V10 API Convergence Summary

Deprecate-and-ticket convergence of the iOS legacy enum-API layer onto the V10 canonical surface, WITHOUT touching either shell. Every duplicated route was audited; the canonical V10 enum was named in an `@available(*, deprecated, message:)` on each legacy enum; and because all five legacy↔V10 pairs are non-equivalent (DTO shape divergence or V10 missing create/delete), zero call-sites were migrated — each non-equivalent pair is recorded in `.planning/LEGACY-V10-DEBT-REGISTRY.md` instead.

## What was deprecated

| Legacy enum | File | Canonical V10 | Ticket |
|-------------|------|---------------|--------|
| `MeAPI` | AuthAPI.swift | `MeV10API` | DEBT-70-ME |
| `CategoriesAPI` | AuthAPI.swift | `CategoriesV10API` | DEBT-70-CAT |
| `ActualAPI.create` + `.update` (per-method) | TransactionsAPI.swift | `ActualV10API.create` | DEBT-70-ACT |
| `SubscriptionsAPI` | ManagementAPI.swift | `SubscriptionsV10API` | DEBT-70-SUB |
| `CategoriesWriteAPI` | TransactionsAPI.swift | `CategoriesV10API.update` | DEBT-70-CATW |

`ActualAPI.delete` is intentionally **NOT** deprecated — it carries a `/// Canonical shared delete` doc-comment and remains the delete both shells call.

## Call-sites migrated

**Zero.** The audit (carried in the registry's convergence summary table) found every legacy↔V10 pair non-equivalent:
- `MeAPI`: `UserDTO` ≠ `MeV10Response` (AuthStore depends on UserDTO shape).
- `CategoriesAPI`: `CategoryDTO` 2-valued vs `CategoryV10DTO` 4-valued; 5 v06 screens decode the 2-valued shape.
- `ActualAPI`: `ActualV10API` lacks update + delete; `ActualDTO` 2-val vs `ActualV10DTO` 4-val.
- `SubscriptionsAPI`: `SubscriptionsV10API` has no create (v06 editor needs legacy create then V10 patch).
- `CategoriesWriteAPI`: `CategoriesV10API` lacks create + delete.

Deprecation warnings now appear at the 12 legacy call-sites (1 MeAPI, 5 CategoriesAPI, 3 ActualAPI create/update, 2 SubscriptionsAPI create/update, 4 CategoriesWriteAPI — minus overlaps); these are expected, are warnings not errors, and do not fail the build.

## Debt registry

- **Path:** `.planning/LEGACY-V10-DEBT-REGISTRY.md` (97 lines).
- **Ticket count:** 5 (`DEBT-70-ME`, `DEBT-70-CAT`, `DEBT-70-ACT`, `DEBT-70-SUB`, `DEBT-70-CATW`).
- Each ticket records: legacy enum + file, V10 canonical enum + file, canonical pick, the concrete equivalence-blocker, current call-sites (with line numbers), and the follow-up action that would make migration safe (typically the D shared-domain extraction or the 69-05 write-DTO codegen tail, plus the missing V10 create/delete verbs).
- Includes a top "Convergence audit summary" table and a "Comment debt — sources" index of files carrying inline `legacy↔V10` orientation comments (intentionally NOT deleted this plan).

## Build + test results

- `xcodebuild build -scheme BudgetPlanner` → **BUILD SUCCEEDED** (deprecation warnings present, not treated as errors).
- `xcodebuild test -scheme BudgetPlanner` → **609 tests, 0 failures** — exactly the Phase 67 baseline. Zero behavioral regression (consistent with zero call-site migration).
- Both shells (`MainShell` v06 + `V10MainShell`) build from the single BudgetPlanner target.

## Deviations from Plan

The Task 2 verify grep used a single-line pattern `@available(\*, deprecated`. swift-format (run as the plan instructs, on touched files only) wraps the attribute across two lines (`@available(` / `*, deprecated,`), so the literal single-line pattern reports 0. This is a formatting line-break, not a missing attribute: a multiline-aware check confirms all attributes present (AuthAPI 2, ManagementAPI 1, TransactionsAPI 3) and `ActualAPI.delete` retains its canonical-shared doc-comment and no deprecation. No code change was needed; the deprecations and the gate's intent are satisfied. Tracked as `[Rule 1 — verify-pattern]` (no behavioral impact).

Task 3 required no file edit (it was a no-op confirmation gate); no separate commit was produced for it.

## Self-Check: PASSED
