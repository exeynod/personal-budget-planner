# Deferred Items — Phase 67 remediation-cleanup

Out-of-scope discoveries logged during plan execution. NOT fixed (SCOPE BOUNDARY).

| Discovered During | Item | Detail | Status |
|---|---|---|---|
| 67-04 Task 1 (baseline) | `tests/test_categories.py::test_seed_creates_14_categories` fails | `POST /onboarding/complete` returns 422 (schema validation) — pre-existing, unrelated to embedding refresh (P1-1) or double-post (P1-2). Baseline failure present before 67-04 changes. | deferred — needs onboarding payload/schema investigation |
| 67-08 Task 1 | `tests/test_ai_cap_integration.py` 3 cap tests fail (429→402) | `test_chat_unblocked_after_admin_patches_cap_higher`, `test_suggest_category_blocked_when_at_cap`, `test_cap_zero_blocks_chat_and_suggest` expect 429 (cap) but get 402 (PRO_TIER_REQUIRED). `require_pro` fires before `enforce_spending_cap` for free-tier seeded users (Phase 35 Pro-gating). NOT touched by 67-08 (P2-4/5/6/7/R8 don't modify require_pro/tier/router dep order). | deferred — tier-gating remediation |
| 67-08 Task 3 | `tests/test_spend_cap_concurrent.py` 2 tests fail (200/429→402/402) | `test_concurrent_ai_chat_at_cap_yields_one_pass_one_429`, `test_concurrent_ai_chat_different_users_both_pass` get 402 PRO_TIER_REQUIRED — same Pro-gating root cause as the cap-integration tests above. Cost-column migration verified orthogonal (cost_cents aggregation + 1¢ logging assertions updated). | deferred — tier-gating remediation |
| 67-08 Task 3 | `tests/test_e2e_multi_user_lifecycle.py` 4 tests fail (`category.code` NOT NULL) | `test_e2e_1/3/4/6` fail on `INSERT INTO category ... code NULL` — a pre-existing seed-helper/schema mismatch (`category.code` NOT NULL not populated by `seed_category`). Fails during category seeding, BEFORE the ai_usage_log line 67-08 edited. Orthogonal to cost_cents migration. | deferred — category seed helper |
