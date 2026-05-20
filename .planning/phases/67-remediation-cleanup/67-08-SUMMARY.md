---
phase: 67-remediation-cleanup
plan: 08
subsystem: backend
tags: [backend, ai, spend-cap, money, migration, no-float, validation, dedup, p2, r8]
requires:
  - "67-04: alembic chain head 0025 (subscription posted_txn unique)"
provides:
  - "ChatRequest.message length bounds (min=1, max=4000) → 422 on empty/oversize"
  - "suggest-category returns real cosine confidence on a miss (not hardcoded 0.0)"
  - "GET /me + PATCH /me symmetric on income_cents via shared build_me_response"
  - "single canonical get_db (app.db.session) re-exported from dependencies"
  - "AiUsageLog.cost_cents BIGINT (USD-cents) replacing est_cost_usd Float"
  - "spend_cap sums cost_cents directly (no float math)"
  - "embedding spend logged to ai_usage_log so the cap sees suggest-category cost"
  - "alembic 0026 migration (Float→BIGINT) with backfill + reversible downgrade"
affects:
  - "app/api/schemas/ai.py"
  - "app/ai/embedding_service.py"
  - "app/api/routes/ai_suggest.py"
  - "app/api/routes/ai.py"
  - "app/api/routes/me.py"
  - "app/api/router.py"
  - "app/api/dependencies.py"
  - "app/db/models.py"
  - "app/services/spend_cap.py"
  - "app/services/admin_ai_usage.py"
tech-stack:
  added: []
  patterns:
    - "Pydantic Field(min_length/max_length) length-bound on untrusted free text"
    - "Shared async response builder (build_me_response) for GET+PATCH symmetry"
    - "Single get_db definition; dependencies re-exports session.get_db (one object)"
    - "Money as BIGINT cents end-to-end (no Float DB column); per-row ceil(usd*100)"
    - "spend-cap visibility: write a discrete ai_usage_log row for embedding cost"
key-files:
  created:
    - "alembic/versions/0026_ai_usage_cost_cents.py"
    - "tests/test_ai_suggest.py"
    - "tests/test_me.py"
    - "tests/test_ai_usage_cost_cents.py"
  modified:
    - "app/api/schemas/ai.py"
    - "app/ai/embedding_service.py"
    - "app/api/routes/ai_suggest.py"
    - "app/api/routes/ai.py"
    - "app/api/routes/me.py"
    - "app/api/router.py"
    - "app/api/dependencies.py"
    - "app/db/models.py"
    - "app/services/spend_cap.py"
    - "app/services/admin_ai_usage.py"
    - "tests/helpers/seed.py"
    - "tests/test_spend_cap_service.py"
    - "tests/test_ai_usage_log_hook.py"
    - "tests/test_me_ai_spend.py"
    - "tests/test_spend_cap_concurrent.py"
    - "tests/test_e2e_multi_user_lifecycle.py"
decisions:
  - "cost_cents = ceil(est_cost_usd*100) per-row; spend_cap sums cents (per the plan's must_haves). Changes accumulation semantics from ceil(sum*100) to sum(ceil*100) — slightly over-counts (conservative for a spend cap), eliminates float drift. Adjusted affected aggregate-assertion tests accordingly."
  - "UsageBucket.est_cost_usd (in-process /ai/usage ring buffer + admin display) kept as USD float — it is per-process display telemetry, NOT the persisted money column. Only the DB column moved to cost_cents."
  - "KindStr alias LEFT in place: app/api/schemas/actual.py exports KindStr = ActualKindStr as a documented backward-compat alias actively imported by internal_bot.py / planned.py / actual.py. Removing it is structural churn beyond R8 hygiene and contradicts backend_notes ('do not invent work'). Documented as intentional."
  - "get_db single source = app.db.session.get_db; dependencies.py re-exports it (same object identity) so the historical import path keeps working with zero behavioural change."
  - "Embedding cost logged only when an embedding actually ran (suggest service flags embedding_used); the free substring fast-path is not charged."
metrics:
  duration: "~30m"
  completed: 2026-05-20
  tests-added: 11
  tasks: 3
  files-changed: 20
---

# Phase 67 Plan 08: Backend P2-4/5/6/7 + R8 hygiene Summary

Closed five backend review items with a no-float money discipline: bounded the untrusted `ChatRequest.message`, made `/ai/suggest-category` return the real cosine confidence on a miss with the docstring corrected to the actual 0.35 threshold, made `GET /me` and `PATCH /me` symmetric on `income_cents` through one shared builder, collapsed the duplicated `get_db` to a single source, migrated `ai_usage_log.est_cost_usd` (Float) to `cost_cents` (BIGINT USD-cents) with a reversible alembic migration, and started logging suggest-category embedding spend so the monthly cap actually sees it.

## What Was Built

### Task 1 — ChatRequest bounds + suggest confidence/docstring (P2-4, P2-5) — `2b43d8a`
- `ChatRequest.message` → `Field(min_length=1, max_length=4000)`: empty / >4000 chars now 422.
- `EmbeddingService.suggest_category`: on a below-threshold cosine hit it now returns `{category_id: None, name: None, confidence: <real cosine>}` instead of discarding the value as `None`; the route echoes the genuine confidence. Returns `None` only when the user has no embeddings at all.
- Docstrings (route + `SuggestCategoryResponse`) corrected from the stale `0.5` to the actual `SUGGEST_THRESHOLD = 0.35`.

### Task 2 — symmetric /me + single get_db (P2-6, R8) — `68fad7b`
- New `build_me_response(db, user) -> MeV10Response` is the single source for both `GET /me` (in `router.py`) and `PATCH /me` (in `routes/me.py`). `GET /me` now carries `income_cents` (was asymmetric). Removed the now-dead local `MeResponse` model + inline builder.
- `get_db`: single canonical definition lives in `app.db.session`; `app.api.dependencies` re-exports it (same function object), verified by `dep_get_db is session_get_db`.

### Task 3 — cost_cents BIGINT + embedding spend logging (R8, P2-7) — `13d84cb`
- `AiUsageLog.est_cost_usd: Float` → `cost_cents: BigInteger` (USD-cents); dropped the now-unused `Float` import.
- alembic `0026_ai_usage_cost_cents` (down_revision `0025_sub_posted_txn_uq`): adds `cost_cents`, backfills `CEIL(est_cost_usd*100)`, enforces NOT NULL + default 0, drops the Float column; downgrade re-adds the Float column as `cost_cents/100.0`. Verified the downgrade→upgrade roundtrip applies cleanly.
- `spend_cap._fetch_spend_cents_from_db` now `SUM(cost_cents)` directly (cents in, cents out).
- `_record_usage` write-path persists `cost_cents = ceil(est_cost_usd*100)`.
- `admin_ai_usage` aggregate sums `cost_cents`; the display `UsageBucket.est_cost_usd` is derived as `cents/100.0`.
- P2-7: `ai_suggest._log_embedding_cost` writes a discrete `ai_usage_log` row (model = `EMBEDDING_MODEL`, `cost_cents = ceil(estimate_embedding_cost_usd*100)`) and invalidates the spend cache, so the cap now accounts for suggest-category embedding spend. Logged only when a real embedding ran (the free substring fast-path is not charged).
- Test seed helper `seed_ai_usage_log` writes `cost_cents` (accepts legacy `est_cost_usd` via `ceil*100` for backward-compat).

## Verification

Tests run inside the docker `api` container (`/app/.venv/bin/python -m pytest`); the api image was rebuilt for each source change. Migration applied on container boot (alembic head `0026`).

- `tests/test_ai_suggest.py` (6) — green: bounds (422), real-confidence-on-miss, hit, 0.35 docstring.
- `tests/test_me.py` (4) — green: `income_cents` present on GET, GET/PATCH symmetry, `get_db` identity, builder exists.
- `tests/test_ai_usage_cost_cents.py` (3) — green: cost_cents BIGINT (no Float), embedding cost estimator, spend_cap sums cost_cents.
- Regression green: `test_spend_cap_service` (11), `test_ai_usage_log_hook` (3), `test_me_ai_spend`, `test_admin_ai_usage_api`, `test_me_returns_role`, `tests/api/test_ai_chat.py`, `tests/ai/test_embeddings.py`.
- Plan verify: `est_cost_usd` count in `models.py` + `spend_cap.py` = 0; migration 0026 contains `cost_cents`; `import app.api.dependencies, app.db.session` resolves.
- Migration downgrade/upgrade roundtrip: clean.

## Deviations from Plan

### Auto-fixed / scope adjustments

**1. [Rule 3 - Blocking] Extended cost_cents rename to all readers/writers**
- **Found during:** Task 3.
- **Issue:** The plan's `files_modified` listed models/spend_cap/migration/ai_suggest, but `est_cost_usd` was also read/written in `app/api/routes/ai.py` (`_record_usage` + `/ai/usage`), `app/services/admin_ai_usage.py` (aggregate query), and the test seed helper + several tests. Dropping the column without updating these would break the app.
- **Fix:** Updated the write-path (`_record_usage`), admin aggregate, seed helper, and the affected tests; the in-process `/ai/usage` ring buffer + `UsageBucket.est_cost_usd` display field intentionally stay USD float (per-process display telemetry, not the money column). The plan's action step 5 ("Update any other reader/writer") authorizes this.
- **Commit:** `13d84cb`.

**2. [Decision] Aggregation semantics changed to per-row cents**
- The plan's must_have mandates "spend_cap sums cost_cents directly". This changes monthly spend from `ceil(sum(usd)*100)` to `sum(ceil(usd_i*100))`. For tiny per-call embedding/chat costs this rounds each call up to ≥1 cent (conservative — the cap fires slightly earlier, never later). Adjusted multi-row aggregate-assertion tests (`test_spend_cap_service`, `test_me_ai_spend`, `test_spend_cap_concurrent`) to the new direct-cents semantics; single-row tests are unaffected (`ceil(usd*100)` per row == old value).

**3. [Decision] KindStr alias retained (not retired)**
- R8 said "retire KindStr legacy alias if present"; backend_notes said "do not invent work". The alias `KindStr = ActualKindStr` in `app/api/schemas/actual.py` is documented backward-compat and actively imported by `internal_bot.py`, `planned.py`, `actual.py`. Removing it is structural churn (rename all 2-valued kind sites) beyond hygiene scope, so it was left in place and documented here.

## Deferred Issues (out of scope — SCOPE BOUNDARY)

Logged to `.planning/phases/67-remediation-cleanup/deferred-items.md`:
- `tests/test_ai_cap_integration.py` (3) + `tests/test_spend_cap_concurrent.py` (2): assert 429 (cap) but get **402 PRO_TIER_REQUIRED** — `require_pro` fires before `enforce_spending_cap` for free-tier seeded users (Phase 35 Pro-gating). Not touched by this plan (no edits to `require_pro`/tier/router dep order); cost-column changes verified orthogonal.
- `tests/test_e2e_multi_user_lifecycle.py` (4): fail on `category.code` NOT NULL during category seeding (pre-existing seed-helper/schema mismatch), before the ai_usage_log line this plan edited.

## Threat Model Outcome

- T-67-08-01 (DoS via oversize prompt) → mitigated: `ChatRequest.message` min/max length.
- T-67-08-02 (cost-accounting repudiation / float drift) → mitigated: BIGINT `cost_cents` + embedding-spend logging make cap math integer-exact and embedding spend visible.
- T-67-08-03 (info disclosure via /me symmetry) → accepted: `income_cents` is the owner's own field, single-tenant.

No new threat surface introduced beyond the register.

## Self-Check: PASSED

- Files present: `alembic/versions/0026_ai_usage_cost_cents.py`, `tests/test_ai_suggest.py`, `tests/test_me.py`, `tests/test_ai_usage_cost_cents.py`, `67-08-SUMMARY.md`.
- Commits present: `2b43d8a`, `68fad7b`, `13d84cb`.
