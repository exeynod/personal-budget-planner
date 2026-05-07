---
phase: 14-multi-tenant-onboarding
plan: 07
type: execute
wave: 4
depends_on: [02, 03, 04, 05, 06]
files_modified:
  - .planning/phases/14-multi-tenant-onboarding/14-VERIFICATION.md
  - .planning/STATE.md
  - .planning/ROADMAP.md
autonomous: false
requirements: [MTONB-01, MTONB-02, MTONB-03, MTONB-04]
must_haves:
  truths:
    - "All MTONB-01..04 success criteria from ROADMAP §Phase 14 are individually checked off (PASS / human_needed) in 14-VERIFICATION.md."
    - "Full pytest suite (`pytest tests/ -x`) executed; results recorded; any new flakes triaged."
    - "STATE.md `progress.completed_phases` and `last_activity` reflect Phase 14 completion."
    - "ROADMAP.md Phase 14 row marked `[x]` with plan count `Plans: 7`."
  artifacts:
    - path: ".planning/phases/14-multi-tenant-onboarding/14-VERIFICATION.md"
      provides: "Phase 14 verification report — 5 success-criteria + threat-model attestation"
      min_lines: 120
      contains: "MTONB-01"
    - path: ".planning/STATE.md"
      provides: "Phase 14 mark complete"
      contains: "Phase 14"
    - path: ".planning/ROADMAP.md"
      provides: "Phase 14 row marked complete"
      contains: "[x] **Phase 14"
  key_links:
    - from: ".planning/phases/14-multi-tenant-onboarding/14-VERIFICATION.md"
      to: "ROADMAP.md success criteria 1-5"
      via: "1:1 row-by-row attestation"
      pattern: "Success Criterion"
---

<objective>
Phase 14 closure: produce `14-VERIFICATION.md` mapping each ROADMAP success criterion (1-5) to a pytest result + manual-smoke note where applicable, run a full `pytest` sweep to confirm no cross-phase regressions, and update STATE.md + ROADMAP.md.

Purpose: Goal-backward gate. Every prior plan tested its slice; this plan certifies the phase as a whole and updates the project ledger. Mirrors 11-07 / 12-07 / 13-08 pattern.
Output: Verification report + project-state updates. Same `human_needed` posture as Phase 11/12/13 if live Telegram smoke is deferred.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/phases/14-multi-tenant-onboarding/14-CONTEXT.md
@.planning/phases/13-admin-ui-whitelist-ai-usage/13-VERIFICATION.md
@./CLAUDE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Run full test sweep + write 14-VERIFICATION.md</name>
  <files>.planning/phases/14-multi-tenant-onboarding/14-VERIFICATION.md</files>
  <read_first>
    - .planning/phases/13-admin-ui-whitelist-ai-usage/13-VERIFICATION.md (full — verification template + structure)
    - .planning/ROADMAP.md (Phase 14 success criteria — 5 items)
    - .planning/phases/14-multi-tenant-onboarding/14-CONTEXT.md (decisions to attest)
    - .planning/phases/14-multi-tenant-onboarding/14-01-SUMMARY.md through 14-06-SUMMARY.md (read each that exists)
  </read_first>
  <action>
    **Step 1 — Run full test suite and capture results:**

    ```bash
    pytest tests/ -x --tb=short 2>&1 | tee /tmp/phase14-pytest.log | tail -40
    ```

    Record: total passed, failed, skipped, errors. Also run:
    ```bash
    cd frontend && npx vitest run 2>&1 | tail -20
    cd frontend && npx tsc --noEmit 2>&1 | tail -10
    cd frontend && npm run build 2>&1 | tail -10
    ```

    **Step 2 — Create `.planning/phases/14-multi-tenant-onboarding/14-VERIFICATION.md`:**

    Use this exact structure (mirror Phase 13 13-VERIFICATION.md):

    ```markdown
    # Phase 14 — Multi-Tenant Onboarding Verification

    **Date:** {YYYY-MM-DD}
    **Status:** {complete | human_needed | blocked}
    **Plans verified:** 14-01 through 14-06 (6 implementation plans + this one)

    ## Test Sweep Summary

    | Suite | Command | Result |
    |-------|---------|--------|
    | Backend pytest | `pytest tests/ -x` | {N passed / M skipped / 0 failed} |
    | Frontend vitest | `cd frontend && npx vitest run` | {N passed} |
    | Frontend tsc | `cd frontend && npx tsc --noEmit` | {pass/fail} |
    | Frontend build | `cd frontend && npm run build` | {pass/fail} |
    | New Phase 14 tests | (subset of above) | {count} |

    ### Phase 14 Test Inventory
    | File | Tests | Status |
    |------|-------|--------|
    | tests/test_require_onboarded.py | 4 | {GREEN/RED} |
    | tests/test_embedding_backfill.py | 6 | {GREEN/RED} |
    | tests/test_onboarding.py (added) | 2 | {GREEN/RED} |
    | tests/test_bot_handlers.py (added) | 1 | {GREEN/RED} |
    | tests/test_onboarding_gate.py | 5 | {GREEN/RED} |
    | tests/test_onboarding_existing_user_safety.py | 3 | {GREEN/RED} |
    | frontend/src/api/client.test.ts | 4 | {GREEN/RED} |
    | **Total new** | **25** | |

    ## Success Criteria (from ROADMAP §Phase 14)

    ### SC-1 — MTONB-01: Member /start greeting + tg_chat_id save

    **Requirement:** «Юзер с `role=member` после `/start` в боте получает приветственное сообщение «Добро пожаловать, открывайте Mini App для onboarding»; `tg_chat_id` сохраняется в `app_user`.»

    **Evidence:**
    - Plan 14-04 implemented `bot_resolve_user_status` + `cmd_start` branch.
    - `tests/test_bot_handlers.py::test_cmd_start_member_not_onboarded_uses_invite_copy` — GREEN.
    - Existing chat-bind path via `/internal/telegram/chat-bind` unchanged (covered by `tests/test_telegram_chat_bind.py`).

    **Verdict:** {PASS / human_needed (live TG smoke deferred per Phase 11/12/13 pattern)}

    ### SC-2 — MTONB-04: Domain endpoints return 409 onboarding_required pre-onboarding

    **Requirement:** «До завершения onboarding любой доменный API-запрос … возвращает 409 с `{"error": "onboarding_required"}`; frontend перехватывает и редиректит в onboarding-flow.»

    **Evidence:**
    - Plan 14-02 added `require_onboarded` dep + applied to 10 routers.
    - Plan 14-05 added `OnboardingRequiredError` class + global catch-all.
    - `tests/test_require_onboarded.py` (4) GREEN.
    - `tests/test_onboarding_gate.py::test_member_gate_matrix_409_on_all_gated_routers` covers all 10 endpoints.
    - `frontend/src/api/client.test.ts` (4) GREEN.

    **Verdict:** PASS

    ### SC-3 — MTONB-02: Self-onboarding flow ships balance + cycle_start_day + 14 categories

    **Requirement:** «Onboarding-flow (scrollable-page по дизайну `006-B`) проходит шаги: bot bind → ввод starting_balance → выбор cycle_start_day → seed 14 категорий per-user (копия из default-набора, изолирована по `user_id`).»

    **Evidence:**
    - Layout reused from v0.2 (sketch 006-B already implemented).
    - Hero copy ветвится по `user.role` (Plan 14-05).
    - `tests/test_onboarding_gate.py::test_full_member_onboarding_flow_creates_categories_periods_embeddings` — 14 categories, scoped by user_id, GREEN.
    - Cross-tenant isolation: `tests/test_onboarding_gate.py::test_two_members_onboarding_isolation` GREEN.

    **Verdict:** PASS

    ### SC-4 — MTONB-03: Auto-embeddings for 14 seed categories

    **Requirement:** «По завершении onboarding для нового юзера автогенерируются embeddings для его 14 seed-категорий (background task через worker или inline async); первый AI-suggest-category для нового юзера возвращает корректные результаты без задержки на cold-start.»

    **Evidence:**
    - Plan 14-03 added `backfill_user_embeddings` helper + step 5 in `complete_onboarding`.
    - `tests/test_embedding_backfill.py` (6) GREEN — covers happy path, skip-existing, skip-archived, empty, exception-swallow, tenant-scope.
    - `tests/test_onboarding.py::test_complete_onboarding_creates_seed_embeddings` GREEN.
    - `tests/test_onboarding.py::test_complete_onboarding_swallows_embedding_failure` GREEN — provider failure does NOT roll back onboarding.
    - `tests/test_onboarding_gate.py::test_full_member_onboarding_flow_creates_categories_periods_embeddings` confirms 14 CategoryEmbedding rows after onboarding.

    **Verdict:** PASS (D-14-03 fallback path: provider down → 0 embeddings + log; on-demand fallback in `ai_suggest` is deferred but accepted per CONTEXT).

    ### SC-5 — Existing user safety

    **Requirement:** «Существующий owner (уже onboarded в v0.2/v0.3) проходит при следующем запросе без 409 — миграция считает его onboarded_at непустым; новый member после успешного onboarding также не получает 409.»

    **Evidence:**
    - `tests/test_onboarding_existing_user_safety.py::test_existing_onboarded_owner_passes_gate` — owner with `onboarded_at` set hits /categories with 200.
    - `tests/test_onboarding_existing_user_safety.py::test_already_onboarded_member_repeating_onboarding_complete_returns_409` — confirms AlreadyOnboardedError 409 has different body shape (string detail, not object), so frontend `OnboardingRequiredError` detection does not collide.
    - `tests/test_onboarding_gate.py::test_full_member_onboarding_flow_creates_categories_periods_embeddings` step 6 confirms post-onboarding /me returns non-null `onboarded_at`.

    **Verdict:** PASS

    ## Threat Model Attestation

    | Threat ID | Plan | Disposition Honoured? | Notes |
    |-----------|------|----------------------|-------|
    | T-14-02-01 | 14-02 | ✓ accept | 409 sub-shape leaks "exists but pending onboarding" — same exposure level as `chat_id_known` field. |
    | T-14-02-02 | 14-02 | ✓ mitigate | Acceptance criterion enforces grep count == 10; documented in `app/api/router.py` block comment. |
    | T-14-03-01 | 14-03 | ✓ accept | One-time per-user 1-3s during onboarding response — observed in test mock. |
    | T-14-03-02 | 14-03 | ✓ accept | Default category names — no PII. User-renames remain in `categories.py` background task. |
    | T-14-03-03 | 14-03 | ✓ mitigate | Helper queries `Category.user_id == user_id`; confirmed by test_backfill_scopes_to_caller_user_id. |
    | T-14-04-01 | 14-04 | ✓ accept | Greeting copy difference equivalent to `Бот приватный` vs greeted. |
    | T-14-05-01 | 14-05 | ✓ accept | Frontend bypass shows broken screens, not data. |
    | T-14-05-03 | 14-05 | ✓ mitigate | OnboardingScreen calls only `/onboarding/complete` (un-gated). |

    ## Deferred / Accepted Limits

    | Item | Source | Status | Resolution |
    |------|--------|--------|------------|
    | Live Telegram /start smoke (real bot, real member) | Phase 14 SC-1 | human_needed | Defer to milestone close (mirrors Phase 11 U-1, Phase 12 Checkpoint 2, Phase 13). |
    | On-demand embedding fallback in /ai/suggest-category | D-14-03 | deferred | If a category lacks embedding when first queried — out of scope; log + return null suggestion. |
    | Background-worker `backfill_missing_embeddings` job | D-14-03 | deferred | Inline-on-onboarding covers MVP; periodic job not yet justified. |
    | Re-onboarding flow | CONTEXT deferred | deferred | Member wants to reset balance/categories/cycle — separate phase. |

    ## Files Changed (Summary)

    | Plan | Files | Lines (approx) |
    |------|-------|----------------|
    | 14-01 | tests/test_require_onboarded.py, tests/test_embedding_backfill.py, tests/test_bot_handlers.py, tests/helpers/seed.py | +250 |
    | 14-02 | app/api/dependencies.py + 10 route files | +30 |
    | 14-03 | app/services/ai_embedding_backfill.py (new), app/ai/embedding_service.py, app/services/onboarding.py, app/api/schemas/onboarding.py, tests/test_onboarding.py | +130 |
    | 14-04 | app/bot/auth.py, app/bot/handlers.py | +50 |
    | 14-05 | frontend/src/api/client.ts, OnboardingScreen.tsx, App.tsx, client.test.ts | +110 |
    | 14-06 | tests/test_onboarding_gate.py, tests/test_onboarding_existing_user_safety.py | +280 |

    ## Final Status

    **Phase 14 status:** {complete | human_needed}
    {Reasoning if human_needed: "Live Telegram smoke deferred per Phase 11/12/13 pattern; all automated coverage GREEN."}

    Ready to proceed to Phase 15 (AI Cost Cap Per User).
    ```

    Fill in actual numbers from the test sweep run. Date format `YYYY-MM-DD`.

    **Step 3 — Inform user about live-smoke deferral:**

    Per Phase 11/12/13 pattern, the live Telegram bot test (real /start with a real member account) is deferred to milestone close. Mark `Final status: human_needed` UNLESS the user has actively confirmed live smoke during this session.
  </action>
  <verify>
    <automated>
    test -f .planning/phases/14-multi-tenant-onboarding/14-VERIFICATION.md &amp;&amp; \
    grep -c "MTONB-0[1-4]" .planning/phases/14-multi-tenant-onboarding/14-VERIFICATION.md | grep -qE "^[4-9]|^[1-9][0-9]+" &amp;&amp; \
    grep -c "Verdict" .planning/phases/14-multi-tenant-onboarding/14-VERIFICATION.md | grep -q "^[5-9]$"
    </automated>
  </verify>
  <acceptance_criteria>
    - File `.planning/phases/14-multi-tenant-onboarding/14-VERIFICATION.md` exists with all 5 SC sections.
    - `grep -c "Verdict" 14-VERIFICATION.md` ≥ 5 (one per success criterion).
    - All 4 requirement IDs (MTONB-01, MTONB-02, MTONB-03, MTONB-04) appear at least once each.
    - Test sweep numbers reflect a real run (not placeholder `{N}`).
    - Threat-model attestation table covers each Phase 14 threat with disposition status.
  </acceptance_criteria>
  <done>14-VERIFICATION.md committed; all SC verdicts recorded; threat model attested.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Human checkpoint — confirm verification status (live TG smoke)</name>
  <what-built>
    Phase 14 ships:
    - Backend `require_onboarded` gate on 10 domain routers.
    - `complete_onboarding` extended with embedding backfill (graceful on OpenAI failure).
    - Bot `/start` invite-flow greeting for not-onboarded members.
    - Frontend `OnboardingRequiredError` + role-branched hero copy.
    - 25 new automated tests, all GREEN.
    - 14-VERIFICATION.md with per-SC verdicts.
  </what-built>
  <how-to-verify>
    Decide: do you want to run live Telegram smoke now, or defer like Phases 11/12/13?

    If live smoke: invite a fresh Telegram account via Admin UI → `/start` from that account → confirm greeting copy → open Mini App → confirm hero copy says "Привет!" → complete onboarding → confirm /api/v1/categories returns 14 rows.

    If deferring: confirm with "deferred" — verification file already documents the same posture.
  </how-to-verify>
  <resume-signal>Type "approved" to mark complete OR "deferred" to mark human_needed (live smoke pending milestone close), or describe issues.</resume-signal>
</task>

<task type="auto">
  <name>Task 3: Update STATE.md + ROADMAP.md to mark Phase 14 closed</name>
  <files>.planning/STATE.md, .planning/ROADMAP.md</files>
  <read_first>
    - .planning/STATE.md (full — note `progress.completed_phases`, `last_activity`, `Recent Trend`, `Current Position` blocks)
    - .planning/ROADMAP.md (lines 39-49 — Phase 14 row + active section)
    - .planning/phases/14-multi-tenant-onboarding/14-VERIFICATION.md (just-created — read final status)
  </read_first>
  <action>
    **Edit `.planning/STATE.md`:**

    Update fields (preserve existing structure):
    - `stopped_at:` → "Phase 14 complete — 14-VERIFICATION.md status={human_needed|complete}; 25/25 own tests GREEN + 0 regressions; ready for Phase 15."
    - `last_updated:` → today's ISO datetime.
    - `last_activity:` → "{today} -- Phase 14 verification complete (14-07)".
    - `progress.completed_phases:` → 4 (was 3).
    - `progress.total_plans:` → 29 (was 22 + 7).
    - `progress.completed_plans:` → 29.
    - `progress.percent:` → 80.

    Update `## Current Position` section:
    ```
    Phase: 15 (ai-cost-cap-per-user) — NOT STARTED
    Plan: 0 of N (planning pending)
    Status: Ready to discuss/plan
    Last activity: {today} -- Phase 14 verification complete
    ```

    Add to `### Decisions` recent decisions block (below Phase 13 decisions):
    ```
    - 14-CONTEXT (2026-05-07): require_onboarded dependency at router level; 10 domain routers gated; /me, /onboarding, /internal, /admin, /health exempt. 409 body `{"detail": {"error": "onboarding_required"}}`.
    - 14-03 ({today}): embedding backfill inline in complete_onboarding via `backfill_user_embeddings`; failure-graceful (returns 0, log WARN); deferred background-worker re-tries.
    - 14-04 ({today}): bot_resolve_user_status sibling helper to bot_resolve_user_role; cmd_start branches on onboarded_at.
    - 14-05 ({today}): frontend OnboardingRequiredError class + window unhandledrejection catch-all + role-branched hero copy.
    ```

    Update `### By Phase` table:
    ```
    | 14 | 7 | ~75 min | ~11 min |
    ```

    Append the new phase to the Performance Metrics velocity block.

    **Edit `.planning/ROADMAP.md`:**

    Lines 44 and around (Phase 14 row in active section):
    Before:
    ```
    - [ ] **Phase 14: Multi-Tenant Onboarding** — invite-flow для `role=member` юзеров: bot bind → starting_balance → cycle_start_day → seed 14 категорий per-user + автогенерация embeddings
    ```
    After:
    ```
    - [x] **Phase 14: Multi-Tenant Onboarding** — 7/7 plans complete; status={human_needed|complete} ({reasoning if human_needed: "live TG smoke deferred per user pattern, mirroring Phase 11/12/13"}); 25/25 own tests GREEN, 0 regressions
    ```

    In `### Phase 14: Multi-Tenant Onboarding` block (lines 110-121):
    - Update `**Plans**: TBD` → `**Plans**: 7 plans`
    - Add the plan list:
      ```
      - [x] 14-01-PLAN.md — RED tests for require_onboarded + embedding backfill + bot helper (Wave 0) — completed {today}
      - [x] 14-02-PLAN.md — require_onboarded dep + apply to 10 gated routers (Wave 1) — completed {today}
      - [x] 14-03-PLAN.md — embedding backfill helper + extend complete_onboarding step 5 (Wave 1, parallel with 14-02 + 14-04) — completed {today}
      - [x] 14-04-PLAN.md — bot_resolve_user_status + cmd_start invite-flow branch (Wave 1, parallel with 14-02 + 14-03) — completed {today}
      - [x] 14-05-PLAN.md — frontend OnboardingRequiredError + hero copy branch + App catch-all (Wave 2) — completed {today}
      - [x] 14-06-PLAN.md — Integration tests: gate matrix + onboarding happy path + existing-user safety (Wave 3) — completed {today}
      - [x] 14-07-PLAN.md — Verification + STATE/ROADMAP updates (Wave 4, has human checkpoint) — completed {today}
      ```

    In Milestone v0.4 progress table (around line 165), update:
    ```
    | 14. Multi-Tenant Onboarding | 7/7 | Complete | {today} |
    ```

    **Verify both files parse:**
    ```bash
    head -20 .planning/STATE.md
    head -50 .planning/ROADMAP.md
    ```
    Both should show valid YAML frontmatter / markdown.
  </action>
  <verify>
    <automated>
    grep -c "Phase 14: Multi-Tenant Onboarding" .planning/ROADMAP.md | grep -qE "^[2-9]$" &amp;&amp; \
    grep -c "\[x\] \*\*Phase 14" .planning/ROADMAP.md | grep -q "^1$" &amp;&amp; \
    grep -c "completed_phases: 4" .planning/STATE.md | grep -q "^1$" &amp;&amp; \
    grep -c "14-07" .planning/STATE.md | grep -qE "^[1-9]$"
    </automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "\\[x\\] \\*\\*Phase 14" .planning/ROADMAP.md` == 1.
    - `grep -c "Plans:.*7 plans" .planning/ROADMAP.md` ≥ 1 in the Phase 14 detail section.
    - `grep "completed_phases: 4" .planning/STATE.md` returns the line.
    - `grep "completed_plans: 29" .planning/STATE.md` returns the line.
    - STATE.md `progress.percent: 80`.
    - STATE.md `Current Position` says `Phase: 15`.
  </acceptance_criteria>
  <done>STATE.md and ROADMAP.md updated; Phase 14 closed; ready to discuss Phase 15.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries
None new — this plan only writes documentation + state files.

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-14-07-01 | Repudiation | Verification numbers may drift if pytest re-run later | accept | Date stamped; numbers represent point-in-time. Future regressions detected by CI / autonomous re-runs. |
| T-14-07-02 | Tampering | STATE.md update could miss a field (e.g. forget to bump `progress.percent`) | mitigate | Acceptance criteria enforce specific grep checks on each updated field. |
</threat_model>

<verification>
- `pytest tests/ -x` exit 0 (recorded in 14-VERIFICATION.md).
- `cd frontend && npx vitest run && npx tsc --noEmit && npm run build` all pass.
- `.planning/phases/14-multi-tenant-onboarding/14-VERIFICATION.md` exists with 5 SC verdicts + threat-model attestation.
- `.planning/STATE.md` reflects Phase 14 closed (4/5 phases complete; 29/29 plans).
- `.planning/ROADMAP.md` Phase 14 row marked `[x]` with plan list.
</verification>

<success_criteria>
- 14-VERIFICATION.md created with verdicts for SC-1 through SC-5.
- Final status either `complete` (live smoke ran) or `human_needed` (deferred — same posture as Phase 11/12/13).
- STATE.md `progress.completed_phases = 4`, `completed_plans = 29`, `percent = 80`.
- ROADMAP.md Phase 14 row marked `[x]` with full 7-plan list.
- Human checkpoint reached confirming verification status.
</success_criteria>

<output>
After completion, create `.planning/phases/14-multi-tenant-onboarding/14-07-SUMMARY.md`.
</output>
