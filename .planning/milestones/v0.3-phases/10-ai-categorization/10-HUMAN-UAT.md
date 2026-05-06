---
status: partial
phase: 10-ai-categorization
source: [10-VERIFICATION.md]
started: 2026-05-06T00:00:00Z
updated: 2026-05-06T00:00:00Z
---

## Current Test

[awaiting human testing in live environment with docker-compose + OPENAI_API_KEY]

## Tests

### 1. AI suggestion box appears on description input
expected: Open ActualEditor (new transaction form), type ≥3 characters (e.g., «кофе») — AI suggestion box appears after ~500ms with category name and confidence bar in purple (#a78bfa)
result: [pending]

### 2. Confidence bar renders proportionally
expected: 80% confidence → 80% fill width in confidence bar
result: [pending]

### 3. «Сменить» button shows standard dropdown
expected: Click «Сменить» in AI suggestion box → standard category dropdown appears
result: [pending]

### 4. Settings toggle disables AI suggestion
expected: In Settings, toggle «AI категоризация» off → suggestion box stops appearing in ActualEditor
result: [pending]

### 5. Category rename triggers embedding refresh
expected: Rename a category via PATCH /api/v1/categories/{id} → embedding regeneration triggered in background (visible in API logs)
result: [pending]

### 6. suggest-category endpoint contract
expected: GET /api/v1/ai/suggest-category?q=<text> returns {category_id, name, confidence} when ≥ 0.5, or {category_id: null} when below threshold
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
