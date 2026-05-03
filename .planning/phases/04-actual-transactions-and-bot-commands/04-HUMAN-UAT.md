---
status: partial
phase: 04-actual-transactions-and-bot-commands
source: [04-VERIFICATION.md]
started: 2026-05-03T00:00:00Z
updated: 2026-05-03T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Mini App one-tap expense flow
expected: Open Mini App HomeScreen → tap FAB "+ Трата" → fill ActualEditor (amount + category + date) → Save → row appears in ActualScreen list, toast shown
result: [pending]

### 2. Bot /add success path  
expected: `/add 1500 продукты пятёрочка` → bot replies with confirmation + remaining balance for category
result: [pending]

### 3. Bot disambiguation end-to-end
expected: `/add 500 prod` with 2+ matching categories → bot sends inline keyboard → tap category → transaction created + confirmation
result: [pending]

### 4. Bot /balance command
expected: `/balance` → formatted reply with plan/fact/delta per category for active period
result: [pending]

### 5. ACT-05 cross-period UX
expected: Edit existing actual transaction → change tx_date to different period → row disappears from current period list (period_id recalculated)
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
