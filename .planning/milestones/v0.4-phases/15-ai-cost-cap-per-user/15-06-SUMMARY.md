---
phase: 15-ai-cost-cap-per-user
plan: "06"
subsystem: frontend
tags: [frontend, react, ai-cap, settings, admin, typescript]
dependency_graph:
  requires: [15-04, 15-05]
  provides: [SettingsScreen AI расход block, CapEditSheet, UsersList cap-edit button, AccessScreen wiring]
  affects:
    - frontend/src/api/types.ts
    - frontend/src/api/admin.ts
    - frontend/src/hooks/useAdminUsers.ts
    - frontend/src/screens/SettingsScreen.tsx
    - frontend/src/screens/SettingsScreen.module.css
    - frontend/src/components/CapEditSheet.tsx
    - frontend/src/components/CapEditSheet.module.css
    - frontend/src/components/UsersList.tsx
    - frontend/src/components/UsersList.module.css
    - frontend/src/screens/AccessScreen.tsx
tech_stack:
  added: []
  patterns: [optimistic-merge after server response, USD/cents conversion (Math.round * 100), bottom-sheet form mirror pattern]
key_files:
  created:
    - frontend/src/components/CapEditSheet.tsx
    - frontend/src/components/CapEditSheet.module.css
  modified:
    - frontend/src/api/types.ts
    - frontend/src/api/admin.ts
    - frontend/src/hooks/useAdminUsers.ts
    - frontend/src/screens/SettingsScreen.tsx
    - frontend/src/screens/SettingsScreen.module.css
    - frontend/src/components/UsersList.tsx
    - frontend/src/components/UsersList.module.css
    - frontend/src/screens/AccessScreen.tsx
decisions:
  - "useAdminUsers.updateCap does server-merge (not optimistic snapshot) because server returns full AdminUserResponse; simpler and race-free"
  - "CapEditSheet input in USD dollars; Math.round(value * 100) avoids float mantissa issues"
  - "capBtn shown for all non-revoked rows including owner so owner can self-edit"
  - "MeResponse.ai_spend_cents uses scale 100/USD matching backend ai_spend_cents; differs from legacy AdminAiUsageRow.spending_cap_cents (100_000/USD) which is untouched"
  - "Deferred live UX validation — autonomous=false but per Phase 11/12/13/14 pattern, UAT deferred to milestone close"
metrics:
  duration: ~15m
  completed: "2026-05-07"
  tasks_completed: 3
  files_modified: 10
---

# Phase 15 Plan 06: Frontend AI Cap UI Summary

React frontend for AICAP-04: SettingsScreen shows self-spend/cap, AccessScreen lets owner edit spending cap per user via CapEditSheet bottom-sheet.

## What Was Built

### Task 1: Types + API + Hook foundation (commit 811e82d)

- `MeResponse.ai_spend_cents: number` + `MeResponse.ai_spending_cap_cents: number` — USD-cents (100/USD scale)
- `AdminUserResponse.spending_cap_cents: number` — backend Plan 15-04 already ships this field
- `CapUpdateRequest` interface for PATCH body
- `updateAdminUserCap(userId, spending_cap_cents)` in `api/admin.ts` — calls `PATCH /admin/users/{id}/cap`
- `useAdminUsers.updateCap(userId, cents)` — awaits server response, merges updated AdminUserResponse into local state

### Task 2: SettingsScreen AI расход block (commit 990fecf)

- New `<section>` card after «AI-категоризация» card
- `ai_spending_cap_cents > 0`: displays `$X.XX / $Y.YY` (spend / cap)
- `ai_spending_cap_cents === 0`: displays «AI отключён» with «Обратитесь к администратору» note
- Uses `useUser()` hook — `/me` returns the new fields since Plan 15-05
- CSS: `.aiSpendValue` (18px bold tabular-nums) + `.aiSpendOff` (16px muted)

### Task 3: CapEditSheet + AccessScreen + UsersList (commit 93a1e7d)

- `CapEditSheet.tsx` (128 lines): mirrors InviteSheet; input USD, `Math.round(value * 100)` → cents; prefills from `target.spending_cap_cents ?? 46500`; handles 403/422/404 inline
- `UsersList.tsx`: `onEditCap` prop added; «Лимит» button shown per row for all non-revoked users (including owner self-edit)
- `AccessScreen.tsx`: `capEditTarget` state, `handleUpdateCap` → `usersHook.updateCap` → toast «Лимит обновлён»; `<CapEditSheet>` rendered beside `<RevokeConfirmDialog>`
- `npm run build` passes: 365.78 kB JS bundle

## Commits

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Types + api + hook foundation | 811e82d |
| 2 | SettingsScreen AI расход block | 990fecf |
| 3 | CapEditSheet + AccessScreen + UsersList | 93a1e7d |

## Deviations from Plan

None — plan executed exactly as written.

## Deferred Live UX Validation

Per Phase 15 execution instructions (`autonomous=false` plan, deferred per Phase 11/12/13/14 pattern):

**Checkpoint: Task 4 (human-verify)** was NOT paused at mid-plan. Live UX smoke test deferred to Phase 15 milestone close (15-VERIFICATION.md).

Items to verify at milestone close:
1. SettingsScreen → «AI расход» shows `$0.00 / $465.00` for new owner
2. AccessScreen → Users tab → each row has «Лимит» button
3. CapEditSheet opens with prefilled value; submit → toast «Лимит обновлён»; list updates
4. Settings reopens showing updated cap after edit
5. Cap=0 → Settings shows «AI отключён»; /ai/chat returns 429

## Known Stubs

None — all fields wire to real data. `useUser()` fetches live `/me`; `updateAdminUserCap` calls real PATCH endpoint.

## Threat Flags

None — all new surface covered by plan's threat model (T-15-06-01 through T-15-06-04).

## Self-Check: PASSED

- frontend/src/api/types.ts: ai_spend_cents, ai_spending_cap_cents, CapUpdateRequest present
- frontend/src/api/admin.ts: updateAdminUserCap present
- frontend/src/hooks/useAdminUsers.ts: updateCap in interface + impl + return
- frontend/src/components/CapEditSheet.tsx: exists (128 lines), spending_cap_cents present
- frontend/src/screens/SettingsScreen.tsx: ai_spend_cents, AI отключён present
- frontend/src/screens/AccessScreen.tsx: CapEditSheet import + render present
- Commits 811e82d, 990fecf, 93a1e7d exist in git log
- npm run build: passed (no TS errors, 365kB JS bundle)
