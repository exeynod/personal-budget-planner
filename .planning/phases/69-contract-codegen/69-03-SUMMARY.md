---
phase: 69-contract-codegen
plan: 03
subsystem: ios-networking
tags: [codegen, contract, dto, codable, openapi, ios]
requires:
  - "contract/openapi.json (69-01 B1, sort_keys=True deterministic dump)"
provides:
  - "contract/gen_swift_dto.py — deterministic OpenAPI -> vanilla Codable Swift generator"
  - "Gen-namespaced GeneratedDTO.swift (83 structs + SubCycle enum)"
  - "drift-report.md — the 69-05 read-DTO migration checklist"
  - "make gen-dto target (regen + xcodegen)"
affects:
  - "69-05 (read-DTO migration consumes the drift report + Gen.* types)"
  - "69-06 / B5 (git-diff sync-guard relies on the idempotent generated file)"
tech-stack:
  added: []
  patterns:
    - "custom build-time codegen (Python stdlib) -> vanilla Codable; dump-once / generate-per-stack (mirrors B2 openapi-typescript)"
    - "required-set-driven Swift optionality; Int-only money; Gen caseless-enum namespace"
key-files:
  created:
    - contract/gen_swift_dto.py
    - ios/BudgetPlanner/Networking/Generated/GeneratedDTO.swift
    - ios/BudgetPlanner/Networking/Generated/README.md
    - ios/BudgetPlanner/Networking/Generated/drift-report.md
  modified:
    - ios/project.yml
    - ios/Makefile
decisions:
  - "B3 tool choice: custom Python script -> vanilla Codable, NOT swift-openapi-generator (preserves URLSession transport + MSK date decoder)"
  - "Generated types nested in `enum Gen` namespace to avoid collision with handwritten DTOs during the generate-before-migrate window"
  - "Nullability driven by OpenAPI `required` set (defaulted fields stay Swift-optional for fixture safety) — differs from web openapi-typescript which promotes defaulted to non-optional"
  - "HTTPValidationError + ValidationError skipped (untyped/free-form Pydantic 422 envelope; transitive skip of dependents)"
metrics:
  duration: ~35m
  completed: 2026-05-20
  tasks: 2
  files: 6
---

# Phase 69 Plan 03: iOS codegen (B3) Summary

Custom Python generator (`contract/gen_swift_dto.py`) emits 83 vanilla `Codable, Equatable`
Swift DTOs (+ the `SubCycle` enum) from `contract/openapi.json` into a `Gen`-namespaced
`GeneratedDTO.swift`, decoded through the existing URLSession `APIClient` decoder unchanged;
idempotent + format-stable, iOS build + 609-test suite green, with a per-DTO drift report
that makes the 69-05 migration mechanical.

## What was built

- **`contract/gen_swift_dto.py`** (Python stdlib only): walks `components.schemas`,
  emits one `struct X: Codable, Equatable` per object schema (camelCase props matching the
  `.convertFromSnakeCase` decoder output), nested `String` enums for inline/`$ref` enums,
  `Date` for date/date-time, `Int` for every integer (money `*_cents` never `Double`),
  `[String: V]` for typed `additionalProperties` dictionaries. Schemas + properties emitted
  in sorted order → byte-identical regen. All types nested inside a caseless `enum Gen`.
- **`GeneratedDTO.swift`** — 816 lines, 83 structs + `Gen.SubCycle`.
- **`README.md`** — regen flow, the required-set nullability rule, the `Gen` namespace
  rationale, the B3 tool decision pointer, and the skipped-schema note.
- **`drift-report.md`** — per-DTO diff (CategoryV10 / SubscriptionV10 / Me / Actual) vs
  handwritten Codable; the 69-05 checklist.
- **`make gen-dto`** — regenerate + `xcodegen generate`.
- **`project.yml`** — comment marking `Networking/Generated/` as codegen output picked up
  by the recursive `- path: BudgetPlanner` sources path (verified not excluded).

## B3 tool decision (recorded)

**Custom build-time Python script → vanilla `Codable`. NOT Apple `swift-openapi-generator`.**
Against the 5 CONTEXT criteria: (1) **transport preservation (decisive)** —
swift-openapi-generator always emits a `Client`/`ClientTransport` layer + pulls
swift-openapi-runtime/urlsession; it cannot emit models-only, so it would wrap the
hand-written `APIClient.request<T>` and re-pin the MSK date strategy. The custom script
emits plain structs that decode through the EXISTING decoder. (2) **XcodeGen** — vanilla
`.swift` drops into the recursive sources path; the Apple plugin wants the SPM build-tool
plugin wired into the target. (3) **Determinism** — sorted output → byte-identical regen for
the B5 git-diff guard; the Apple plugin regenerates into DerivedData (uncommitted). (4)
**Consumer churn** — vanilla structs mirror the handwritten Codable shape → low 69-05 churn;
the Apple generator rewrites every call into `client.someOperation(...)`. (5)
**Maintainability** — one owned Python file, no third-party SPM/transport-version surface.

## Nullability contract

Optionality follows the OpenAPI `required` set: in `required` & not nullable →
non-optional `let x: T`; absent → Swift optional `let x: T?`. A server `default` keeps a
field out of `required` → emitted optional. Verified on `Gen.CategoryRead`:
`code` / `ord` / `createdAt` → **non-optional**; `planCents` / `rollover` / `paused` /
`parentId` / `tag` → **optional**. (On iOS we keep defaulted fields optional for
69-05 fixture safety — this is the deliberate divergence from the web openapi-typescript
output, which promotes defaulted fields to non-optional.)

## Collision strategy

All generated types are nested inside a caseless `enum Gen` (`Gen.CategoryRead`,
`Gen.SubCycle`, `Gen.ActualRead`, …). This lets the generated DTOs coexist with the
handwritten `DTO/*.swift` types (which share many names) so the build stays green before
69-05 migrates consumers onto the `Gen.*` types.

## Drift-report highlights (the 69-05 checklist)

- **`CategoryV10DTO`** — `code` / `ord` / `createdAt` become **non-optional** (drop the
  `decodeIfPresent` "pending Phase 22 schema" stubs); `planCents` / `rollover` / `paused`
  stay optional (server defaults); `parentId` matches. **`tag` is MISSING entirely** on the
  handwritten DTO but on the wire (`personal|business|mixed`, Phase 36) → add in 69-05.
- **`UserDTO`** — missing **`incomeCents: Int?`** (BE-01); `onboardedAt` is `String?` on the
  wire vs handwritten `Date?` (type-shape watch).
- **`SubscriptionV10DTO`** — name-collision flag: contract `SubscriptionRead` (tier/billing)
  ≠ subscription-CRUD `SubscriptionReadV10`; map onto V10. Wire embeds nested
  `category: CategoryRead`; handwritten flattens to `categoryId`.
- **`ActualV10DTO`** — missing **`tag`** (Phase 36, 3-value); v0.x `ActualDTO.kind` is
  2-value `CategoryKind` but the wire `kind` has 4.

## Gate results

- `python3 contract/gen_swift_dto.py` then regen → **byte-identical** (idempotent), and
  **format-stable** (swift-format is a no-op on the generator output — important for the B5
  git-diff guard).
- `cd ios && xcodegen generate` clean; `GeneratedDTO.swift` present in the pbxproj.
- **iOS build green** (`** BUILD SUCCEEDED **`).
- **Full iOS test suite green: 609 tests, 0 failures** — exactly the Phase 67 baseline,
  zero regression.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Transitive skip of schemas referencing an unsupported schema**
- **Found during:** Task 2 (first build).
- **Issue:** `HTTPValidationError` embeds `[ValidationError]`; `ValidationError` carries
  untyped (`input`) and free-form (`ctx`) fields with no concrete Swift type, so it was
  skipped — but `HTTPValidationError` still referenced the missing `Gen.ValidationError`,
  failing compilation (`'ValidationError' is not a member type of enum 'Gen'`).
- **Fix:** Added `compute_skipped()` — computes intrinsically-unsupported schemas, then
  propagates the skip to any schema that `$ref`s a skipped one (fixpoint loop). Both
  `HTTPValidationError` and `ValidationError` are now skipped (neither is a domain DTO; the
  client never decodes the 422 envelope as typed). Documented in README + drift-report.
- **Files modified:** contract/gen_swift_dto.py
- **Commit:** f86c9d0

**2. [Rule 2 - Critical] Typed-dictionary support for `additionalProperties`**
- **Found during:** Task 1 (first generate skipped `OnboardingV10Body`/`Response`).
- **Issue:** `category_plans` / `category_ids_by_code` use `additionalProperties: {integer}`;
  without dictionary support those two onboarding DTOs were skipped (lost coverage).
- **Fix:** Map typed `additionalProperties` → `[String: V]`. Recovered both schemas.
- **Files modified:** contract/gen_swift_dto.py
- **Commit:** f86c9d0

## Known Stubs

None introduced. The generated file is real codegen output; handwritten "pending Phase 22
schema" stubs are pre-existing and are precisely what the drift report flags for 69-05.

## Self-Check: PASSED

- FOUND: contract/gen_swift_dto.py
- FOUND: ios/BudgetPlanner/Networking/Generated/GeneratedDTO.swift
- FOUND: ios/BudgetPlanner/Networking/Generated/README.md
- FOUND: ios/BudgetPlanner/Networking/Generated/drift-report.md
- FOUND commit: f86c9d0
- FOUND commit: 90e0b8c
