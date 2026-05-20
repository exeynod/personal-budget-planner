---
phase: 69-contract-codegen
reviewed: 2026-05-21T00:00:00Z
depth: deep
files_reviewed: 22
files_reviewed_list:
  - app/api/routes/me.py
  - app/api/routes/billing.py
  - app/api/schemas/me_v10.py
  - app/api/schemas/billing.py
  - contract/dump_openapi.py
  - contract/gen_swift_dto.py
  - contract/openapi.json
  - contract/check_contract_sync.sh
  - tests/test_openapi_contract.py
  - Makefile
  - .github/workflows/ci.yml
  - frontend/src/api/generated/schema.ts
  - frontend/src/api/generated/adapters.ts
  - frontend/src/api/types.ts
  - frontend/src/api/v10/categories.ts
  - frontend/package.json
  - ios/BudgetPlanner/Networking/DTO/CategoryV10DTO.swift
  - ios/BudgetPlanner/Networking/DTO/AccountDTO.swift
  - ios/BudgetPlanner/Networking/DTO/TransactionDTO.swift
  - ios/BudgetPlanner/Networking/DTO/CommonDTO.swift
  - ios/BudgetPlanner/Networking/Generated/GeneratedDTO.swift
  - ios/project.yml
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
status: issues_found
---

# Phase 69: Code Review Report — Contract Codegen (R4)

**Reviewed:** 2026-05-21
**Depth:** deep (cross-file + ran generators + frontend tsc)
**Files Reviewed:** 22 source files (+ generated artifacts)
**Status:** issues_found (no blockers)

## Summary

Phase 69 introduces a deterministic OpenAPI → TS/Swift codegen pipeline plus a
CI sync-guard, and migrates the web + iOS read-DTOs onto the generated contract.
I verified the regression-risk areas the task flagged by reading the actual code,
running both generators against the committed `openapi.json`, and running the
frontend type-checker.

Verdict-relevant evidence:

- **B1 byte-identical wire — PASS.** All five newly-typed response models
  (`TierResponse`, `SubscriptionCancelResponse`, `ConsentGrantResponse`,
  `ConsentRevokeResponse`, `AccountDeleteResponse`) match field-for-field the
  exact dicts their handlers build (verified handler return statements vs schema
  fields vs committed `openapi.json`). No renamed/dropped/added keys. Optional
  vs required is correct (e.g. `TierResponse.trial_ends_at`/`pro_active_until`
  are nullable-but-required because the handler always emits the key).
  `GET /me/export` correctly stays `response_model=None` and is exempted in the
  contract test.
- **B4 nullability decode-safety — PASS.** The fields promoted to non-optional
  (`code`/`ord`/`created_at` on category; `created_at` on account) are all in
  the backend `required` set with no server default and no nullable union, so
  the live wire always emits them. I traced every iOS decode site of
  `CategoryV10DTO` (only `CategoriesV10API.list/update` and `PlanMonthAPI.patch`,
  both backed by Pydantic `CategoryRead` / `PlanMonthResponse.categories:
  list[CategoryRead]`) and `AccountDTO` — none can receive null/missing for the
  promoted fields. The defaulted fields (`plan_cents`/`rollover`/`paused`/
  `parent_id`/`tag`) stayed optional on both clients. `ActualV10DTO.created_at`
  was deliberately kept optional. The edited fixtures only replaced *artificial*
  `null` test values (never a real wire shape).
- **Generators — PASS (deterministic + in sync).** Re-running
  `gen_swift_dto.py` and `npm run gen:api` against the committed `openapi.json`
  produced byte-identical output (clean `git diff`). `is_money_field` keeps
  `*_cents` as `Int`/`number` (no float). No secrets in any generated/contract file.
- **Frontend tsc — PASS.** `tsc --noEmit` is green on the migrated
  generated-backed types, proving the B4 migration broke no web call-site.

The findings below are all non-blocking. The two warnings concern (1) a residual
drift class the sync-guard structurally cannot catch and (2) a non-atomic
`make contract` that can corrupt the committed contract on a mid-stream failure.

## Warnings

### WR-01: Sync-guard does not cover the handwritten DTO mirrors — Gen.* vs hand-DTO drift is invisible

**File:** `contract/check_contract_sync.sh:104-107`
**Issue:** The iOS executor mirrored the generated DTOs by hand (e.g.
`CategoryV10DTO`, `UserDTO`, `ActualV10DTO`, `AccountDTO`) rather than
typealiasing them to `Gen.*`. The guard only regenerates and diffs the three
*generated* artifacts (`openapi.json`, `schema.ts`, `GeneratedDTO.swift`). It
never compares the handwritten mirrors against `Gen.*`. A future contract change
that regenerates `Gen.CategoryRead` (e.g. a new required field) will pass the
guard while the handwritten `CategoryV10DTO` silently drifts — exactly the drift
class Phase 69 set out to kill, reintroduced one layer up. Concrete existing
divergences already present: `Gen.MeV10Response.onboardedAt: String?` vs
handwritten `UserDTO.onboardedAt: Date?`; `Gen.ActualRead.createdAt: Date` vs
`ActualV10DTO.createdAt: Date?`; `Gen.ActualRead.Tag` (nested enum) vs
`ActualV10DTO.tag: CategoryTag` (reused enum). These specific divergences are
intentional and benign today, but the guard provides no protection against a
*future* unintended one.
**Fix:** Either (a) add a lightweight assertion test that decodes a shared JSON
fixture into both `Gen.X` and the handwritten `XDTO` and asserts field-set
equality, or (b) add a comment-tracked allowlist of intentional Gen↔hand
divergences plus a CI check (even a grep-based field-count diff) so an
*unexpected* new field on `Gen.*` forces a human to reconcile the mirror.
Minimum acceptable: document in `contract/README.md` that the handwritten
mirrors are OUT of the guard's coverage so the next contract author knows to
hand-update them.

### WR-02: `make contract` truncates `contract/openapi.json` before the dump succeeds (non-atomic write)

**File:** `Makefile` (`contract:` target, the `... < contract/dump_openapi.py > contract/openapi.json` line)
**Issue:** The shell redirection `> contract/openapi.json` truncates the
committed file at command start, *before* the docker `exec` produces any output.
If the api container is down, the `exec` errors, or the in-container python
prints anything to stdout before failing, the committed `openapi.json` is left
empty or corrupt — and since this is the single source of truth feeding both
codegen generators, a corrupt dump silently propagates garbage into `schema.ts`
and `GeneratedDTO.swift` on the next regen. (CI is unaffected: it uses
`--dump=python`, which writes via `Path.write_text` after a full in-process
render, so it is atomic.)
**Fix:** Dump to a temp file and move on success:
```make
contract:
	@$(DC_TEST) exec -T api /app/.venv/bin/python - --stdout \
	  < contract/dump_openapi.py > contract/openapi.json.tmp \
	  && mv contract/openapi.json.tmp contract/openapi.json
```
(or have `dump_openapi.py` accept an explicit `--out` and write atomically
itself).

## Info

### IN-01: iOS test fixtures decode `created_at` as a bare date through a non-production decoder

**File:** `ios/BudgetPlannerTests/FeaturesV10/HomeDataTests.swift` (makeAccount), `ios/BudgetPlannerTests/FeaturesV10/PlanDataTests.swift` (makeCategory)
**Issue:** Migrated fixtures supply `"created_at": "2026-05-09"` (a bare DATE)
where the real wire sends a full ISO-8601 datetime, and `makeAccount` decodes
through a *local* `JSONDecoder` with `.formatted("yyyy-MM-dd", UTC)` rather than
the production `APIClient` custom multi-format/MSK strategy. The decode succeeds,
but the fixtures no longer exercise the same date path as production, slightly
lowering the fidelity of the now-required `created_at` decode. Not a correctness
defect (the field is genuinely always present on the wire).
**Fix:** Use a representative datetime string (`"2026-05-09T00:00:00+00:00"`)
and, where practical, route fixture decoding through the shared production
decoder so the test mirrors the runtime path.

### IN-02: `TierResponse` / `SubscriptionCancelResponse` omit the `extra="ignore"` config the other new schemas carry

**File:** `app/api/schemas/billing.py:49-71`
**Issue:** The three `me_v10` compliance response models set
`model_config = ConfigDict(extra="ignore")`, but `TierResponse` and
`SubscriptionCancelResponse` do not. Harmless for response serialization (FastAPI
filters output to declared fields regardless), but the inconsistency invites a
future reader to assume a meaningful difference.
**Fix:** Add `model_config = ConfigDict(extra="ignore")` to both for consistency,
or drop it from the `me_v10` ones — the response side does not need it either way.

### IN-03: Web `gen:api` has no determinism/idempotency CI assertion of its own beyond the sync-guard

**File:** `frontend/package.json` (`gen:api` script)
**Issue:** `openapi-typescript` determinism is relied upon implicitly by the
sync-guard. I verified it is byte-stable locally, but a future
`openapi-typescript` minor bump (`^7.13.0` is a caret range) could change output
formatting and break the guard with no isolated signal pointing at the tool
version. Low risk; noted for traceability.
**Fix:** Consider pinning `openapi-typescript` to an exact version (drop the
caret) so the generated `schema.ts` cannot shift under a transitive minor bump.

### IN-04: `gen_swift_dto.py` skips `HTTPValidationError`/`ValidationError` — confirm no in-scope read-DTO ever transitively references them

**File:** `contract/gen_swift_dto.py:263-301` (`compute_skipped`)
**Issue:** The generator correctly drops `HTTPValidationError` and
`ValidationError` (opaque `input` field) and propagates the skip to dependents.
Today no read-DTO references them, so nothing in scope is silently omitted. This
is correct behavior, but the skip is only surfaced via a `print` to stdout — if a
future schema embeds a `ValidationError`, its parent would be silently skipped
and the corresponding iOS decode would fail to compile (caught at build) or the
type would simply be missing.
**Fix:** None required now. Optionally have the script `exit non-zero` (or emit a
CI-visible warning) when a *non-error* schema gets transitively skipped, so an
accidental opaque-field introduction is loud rather than silent.

---

_Reviewed: 2026-05-21_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
