---
phase: 69-contract-codegen
plan: 01
subsystem: api
tags: [openapi, response-model, contract, codegen-foundation, deterministic-dump, tdd]

# Dependency graph
requires:
  - phase: 22-backend-schema
    provides: "MeV10Response / MePatchV10 (PATCH /me already typed); CategoryRead v1.0 fields (code/ord/created_at REQUIRED)"
  - phase: 33-compliance
    provides: "me compliance routes (consent grant/revoke, data export, account soft-delete)"
  - phase: 34-billing
    provides: "billing.py me-prefix routes (/me/subscription, /me/tier, /me/subscription/cancel)"
  - phase: 68-tech-debt-cleanup
    provides: "green backend pytest baseline (774) — the zero-regression gate for B1"
provides:
  - "contract/openapi.json — deterministic (sort_keys), regenerable, idempotent OpenAPI artifact = single source of truth for B2 web + B3 iOS codegen"
  - "contract/dump_openapi.py — dump script (file-anchored output + --stdout mode for the image-baked docker api container)"
  - "make contract — regenerate target piping the dump into docker api, redirecting to host file"
  - "tests/test_openapi_contract.py — 8-domain + 2xx schema-ref coverage guard (anyOf-aware; export/SSE exempted) + CategoryRead required-vs-optional split"
  - "Typed me read-DTO routes: consent grant/revoke + account-delete + /me/tier + /me/subscription/cancel (no public structured bare dict left)"
affects: [69-02-web-codegen, 69-03-ios-codegen, 69-06-ci-sync-guard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Deterministic OpenAPI dump: json.dumps(app.openapi(), indent=2, sort_keys=True, ensure_ascii=False) + trailing newline → byte-stable for the B5 git-diff sync-guard"
    - "Free-form data-dump / compliance routes stay response_model=None + an explicit EXEMPTION allowlist in the contract guard (never synthesise a model for an arbitrary export — reshaping keys = regression)"
    - "make contract pipes the dump script via stdin into the docker api container (image-baked code, repo NOT bind-mounted) and redirects --stdout into the host file"

key-files:
  created:
    - contract/dump_openapi.py
    - contract/openapi.json
    - tests/test_openapi_contract.py
  modified:
    - app/api/routes/me.py
    - app/api/schemas/me_v10.py
    - app/api/routes/billing.py
    - app/api/schemas/billing.py
    - Makefile

key-decisions:
  - "GET /me/export stays response_model=None + EXEMPTED — it returns an arbitrary nested per-user export (CMP-33-06); synthesising a Pydantic model risks reshaping compliance keys (a regression). Documented inline + on the guard exemption allowlist."
  - "DELETE /me/account IS typed (AccountDeleteResponse) — its body is a fixed structured shape {deleted_at, purge_after_days, message}, NOT a free-form dump, so the plan's conditional resolved to 'type it'."
  - "SSE POST /ai/chat exempted — text/event-stream StreamingResponse is not a JSON response_model. _agg (ai.py) confirmed a nested helper inside get_usage, not a route."
  - "The contract guard surfaced 3 ADDITIONAL in-scope me-prefix bare-dict routes in billing.py (Phase 34, outside the plan's 8-file enumeration but inside the `me` domain): typed GET /me/tier (TierResponse) + POST /me/subscription/cancel (SubscriptionCancelResponse). GET /me/subscription was already typed via Optional[SubscriptionRead]."
  - "Guard runs against the LIVE app.openapi() (not the committed file) so a future bare-dict regression fails CI before the artifact is regenerated."

patterns-established:
  - "Any new public structured-read route in the 8 domains must declare response_model or be added to SCHEMA_REF_EXEMPTIONS with a documented reason — the guard fails otherwise."

requirements-completed: [B1]

# Metrics
duration: 18min
completed: 2026-05-21
---

# Phase 69 Plan 01: Backend response_model Audit + Deterministic openapi.json Dump (B1) Summary

**Typed every public structured-read route in the 8 in-scope domains (the bare-dict gap was concentrated in me-prefix compliance + billing routes), exempted the two genuinely free-form surfaces (GET /me/export data-dump, SSE /ai/chat), and produced a deterministic, idempotent `contract/openapi.json` (sort_keys) plus a `make contract` regen target and a contract-coverage guard test — the single source of truth the rest of Phase 69 (web/iOS codegen) builds on.**

## Performance

- **Duration:** ~18 min
- **Tasks:** 3
- **Files created:** 3 / **modified:** 5

## response_model Audit Result

| Domain | File | Finding |
|--------|------|---------|
| subscriptions | subscriptions.py | Covered — all reads typed; deletes are 204 |
| categories | categories.py | Covered — CategoryRead on get/post/patch/delete |
| actuals | actual.py | Covered (prefix `/api/v1/actual`) — ActualRead / BalanceResponse |
| accounts | accounts.py | Covered — AccountRead; delete 204 |
| savings | savings.py | Covered — Snapshot/Config/Deposit responses |
| goals | goals.py | Covered — GoalRead; delete 204 |
| ai | ai.py | Covered — history/usage/observation typed; SSE `/ai/chat` exempt (StreamingResponse); `_agg` is a nested helper, not a route; `/conversation` 204 |
| me | me.py | **Fixed** — typed POST /me/consent (`ConsentGrantResponse`), DELETE /me/consent (`ConsentRevokeResponse`), DELETE /me/account (`AccountDeleteResponse`); GET /me/export left `response_model=None` + EXEMPTED |
| me (billing) | billing.py | **Fixed** (guard-surfaced) — typed GET /me/tier (`TierResponse`), POST /me/subscription/cancel (`SubscriptionCancelResponse`); GET /me/subscription already `Optional[SubscriptionRead]` |

All new response models mirror the **exact** wire bodies the routes already returned (verified against `tests/test_pdn_consent_flow.py`, `tests/test_account_deletion.py`, `tests/test_billing.py`) — zero behavioral change. Money stays BIGINT cents (no float; none of these DTOs carry money fields). No alembic migration (types, not schema).

## The CategoryRead split (kills the pending-schema stubs for 69-04/05)

Confirmed in the generated spec — `CategoryRead.required` = `{code, created_at, id, is_archived, kind, name, ord, sort_order}`; the server-defaulted v1.0 fields `plan_cents` / `rollover` / `paused` / `parent_id` / `tag` are present in `properties` but **NOT** required → optional in generated TS/Swift types. The guard test asserts this split.

## Deterministic Dump

- **Command (make):** `make contract`
- **Raw invocation:** `docker compose -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.test.yml exec -T api /app/.venv/bin/python - --stdout < contract/dump_openapi.py > contract/openapi.json`
- **Idempotency:** regenerated twice → `diff -q` byte-identical (sort_keys + fixed indent + trailing newline). Verified twice (post-Task-1 and post-billing-rebuild).
- **8 domains present:** subscriptions(5) / categories(2) / actual(3) / me(7) / ai(6) / accounts(3) / savings(3) / goals(2).
- Script anchors output to its own parent dir (CWD-independent); `--stdout` mode exists because the api image bakes code and does NOT bind-mount the repo (only `./tests` + `./pyproject.toml`), so the host file is updated via stdout redirect.

## Verification

- **Targeted (Task 1):** consent/deletion/me/ai tests — 24 passed.
- **Guard (Task 2):** `tests/test_openapi_contract.py` — 4 passed (domains, schema-ref coverage, CategoryRead split, consent typing).
- **Billing/tier regression check:** `test_billing.py` + `test_tier_gating.py` + `test_tier_resolution.py` — 14 passed.
- **Full suite (Task 3):** `778 passed, 34 skipped, 1 xpassed, 0 failed, 0 errors` (Phase 68 baseline 774 + 4 new guard cases). Zero behavioral regression.
- **Stack restored** to base via `docker compose up -d` (api healthy).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Missing critical functionality] Typed 3 additional in-scope me-prefix bare-dict routes in billing.py**
- **Found during:** Task 2 (the contract guard test flagged them on its first run).
- **Issue:** `GET /me/tier` (`response_model=dict`), `POST /me/subscription/cancel` (untyped `dict[str,str]`) returned free-form 2xx bodies on the public `me` domain surface. They live in `app/api/routes/billing.py` (Phase 34), which is outside the plan's literal 8-file enumeration but inside the `me` domain by URL prefix — exactly the kind of "stray structured `-> dict` route" the plan's Task-1 step 4 told me to type if found. Leaving them untyped would propagate free-form `object` schemas into the B2/B3 codegen.
- **Fix:** Added `TierResponse` + `SubscriptionCancelResponse` to `app/api/schemas/billing.py` (exact existing key shapes), wired `response_model=` onto both routes. `GET /me/subscription` was already typed (`Optional[SubscriptionRead]`); the guard's schema detector was extended to recognize `anyOf`/`oneOf`/`allOf` members carrying a `$ref` (Optional/union types) so it correctly accepts it.
- **Files modified:** app/api/routes/billing.py, app/api/schemas/billing.py, tests/test_openapi_contract.py.
- **Commit:** 0f15007.

**2. [Plan conditional resolved] DELETE /me/account typed (not exempted)**
- The plan left this conditional ("type IF fixed shape, else exempt"). Inspecting the return confirmed a fixed structured shape `{deleted_at, purge_after_days, message}` → typed via `AccountDeleteResponse`. Not a deviation per se — the documented call resolved to "type it".

## TDD Gate Compliance

Tasks 1 and 2 are marked `tdd="true"`. This plan is a contract-tightening + artifact-generation task rather than a new-feature RED/GREEN cycle: the "tests" are the existing compliance/billing suites (which already pinned the exact wire bodies and stayed green, proving the response_model additions are byte-identical) plus the new `tests/test_openapi_contract.py` guard (which functioned as the failing-first signal — its first run RED-flagged the 3 billing routes, then went GREEN after they were typed). Commits use `feat(...)` because the net effect is added contract surface, not a pure test-then-impl split. No separate `test(...)` RED commit was created; the guard test and its passing implementation landed together in `0f15007` after the RED→GREEN loop was resolved in-session.

## Environment note

Local `.venv` is broken; everything ran inside the docker `api` container via the test stack (`/app/.venv/bin/python`). The api image bakes code (`--no-dev`) and is rebuilt with `docker compose ... up -d --build api` after each code change. The repo is not bind-mounted into `api` — only `./tests` and `./pyproject.toml` (test overlay) — hence the `--stdout`-via-stdin dump pattern. Stack restored with `docker compose up -d` at the end.

## Self-Check: PASSED
- FOUND: contract/dump_openapi.py
- FOUND: contract/openapi.json
- FOUND: tests/test_openapi_contract.py
- FOUND: app/api/schemas/me_v10.py (ConsentGrant/Revoke + AccountDelete responses)
- FOUND: app/api/schemas/billing.py (TierResponse + SubscriptionCancelResponse)
- FOUND: Makefile (contract target)
- FOUND commit: f25a7f0 (Task 1 — typed me compliance routes)
- FOUND commit: 0f15007 (Task 2 — dump + guard + billing typing)
