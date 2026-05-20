---
status: partial
phase: 67-remediation-cleanup
source: [67-VERIFICATION.md]
started: 2026-05-20
updated: 2026-05-20
---

## Current Test

[awaiting human confirmation — iOS full-suite live run]

## Tests

### 1. iOS full suite green (verifier-env limitation)
expected: `cd ios && xcodegen generate && xcodebuild test -scheme BudgetPlanner -destination 'platform=iOS Simulator,name=iPhone 17 Pro'` → 609 tests, 0 failures. (Исполнители прогоняли зелёным по ходу фазы; верификатор не смог пере-запустить симулятор — поэтому требуется ручное подтверждение.)
result: [pending]

### 2. Backend migrations on real DB (sanity)
expected: alembic head = 0026; `uq_subscription_posted_txn_id` partial unique index присутствует; `ai_usage_log.cost_cents` BIGINT (est_cost_usd Float удалён), существующие строки backfilled `ceil(usd*100)`.
result: [pending — verified live in dev DB by executors; confirm on prod/staging before deploy]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps

(none — все in-scope находки ревью закрыты; это live-confirmation, не gaps)

## Related deferred items (NOT phase-67 gaps — pre-existing)

См. `deferred-items.md`:
- `test_ai_cap_integration` / `test_spend_cap_concurrent` — assert 429, получают 402 PRO_TIER_REQUIRED (Phase 35 Pro-gating ordering).
- `test_seed_creates_14_categories` / `test_e2e_multi_user_lifecycle` — `POST /onboarding/complete` 422 + `category.code` seed-helper drift.
- Web тест-файлы исключены из `tsc -b` prod-гейта (нужен `@types/node` + фикс фикстур) — отдельная задача.
- iOS `AISuggestCategoryAPI.swift:23` — stale doc-комментарий «0.5 threshold» (бэкенд 0.35); comment-only.
