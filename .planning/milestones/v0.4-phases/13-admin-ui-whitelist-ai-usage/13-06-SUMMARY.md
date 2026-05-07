---
phase: 13-admin-ui-whitelist-ai-usage
plan: "06"
subsystem: frontend-foundation
tags: [frontend, typescript, api-client, react-hooks, optimistic-update]
requires:
  - phase: 13-04
    provides: "AdminUserResponse / AdminUserCreateRequest schemas + 3 endpoints (GET/POST/DELETE /admin/users)"
  - phase: 13-05
    provides: "AdminAiUsageRow / AdminAiUsageResponse schemas + GET /admin/ai-usage endpoint"
  - phase: 12
    provides: "UserRole TS type + MeResponse.role field already in frontend"
provides:
  - "frontend/src/api/types.ts: 5 new TS interfaces mirroring backend Pydantic schemas (AdminUserResponse, AdminUserCreateRequest, AiUsageBucket, AdminAiUsageRow, AdminAiUsageResponse)"
  - "frontend/src/api/admin.ts: 4 typed API functions (listAdminUsers, inviteAdminUser, revokeAdminUser, getAdminAiUsage) using apiFetch wrapper"
  - "frontend/src/hooks/useAdminUsers.ts: hook с invite + optimistic revoke + snapshot rollback (CONTEXT decision)"
  - "frontend/src/hooks/useAdminAiUsage.ts: hook fetch-on-mount с refetch для AI breakdown"
affects:
  - "Plan 13-07 (UI screens): consumes 2 hooks для AccessScreen / UsersList / AiUsageList / InviteSheet / RevokeConfirmDialog"
tech-stack:
  added: []
  patterns:
    - "mountedRef + cancelled-flag двойной guard (mirrors useSettings) для безопасного fetch-on-mount"
    - "Optimistic delete с snapshot capture внутри functional setState updater + rethrow on error для UI catch"
    - "Server-driven invite (no optimism — backend assigns id/created_at) с append-after-response"
key-files:
  created:
    - frontend/src/api/admin.ts
    - frontend/src/hooks/useAdminUsers.ts
    - frontend/src/hooks/useAdminAiUsage.ts
  modified:
    - frontend/src/api/types.ts
key-decisions:
  - "Optimistic применён только к revoke; invite ждёт server response т.к. id+created_at назначаются backend'ом и optimism не даёт UX wins (плюс тест 409 inline-error становится тривиален при waiting на response)"
  - "snapshot захватывается ВНУТРИ functional setState updater (не setUsers + read state) — это даёт точный prev snapshot даже при concurrent updates"
  - "В invite функции append в конец массива; owner-first sort обеспечивается backend'ом (ORDER BY role != 'owner') — не дублируем sort на frontend"
patterns-established:
  - "Admin hooks pattern: {data, loading, error, refetch} + optimistic mutations с rethrow для UI inline-error handling"
requirements-completed: [ADM-03, ADM-04, ADM-05, ADM-06, AIUSE-01, AIUSE-02, AIUSE-03]
duration: 2m 7s
completed: 2026-05-07
---

# Phase 13 Plan 06: Admin Frontend Foundation (Types + API + Hooks) Summary

**TS types + API client + 2 React hooks для admin whitelist & AI usage; чистый infra-слой без UI готовый к консумированию Plan 13-07.**

## Performance

- **Duration:** 2m 7s
- **Started:** 2026-05-07T09:05:21Z
- **Completed:** 2026-05-07T09:07:28Z
- **Tasks:** 3
- **Files modified:** 1 (types.ts)
- **Files created:** 3 (admin.ts, useAdminUsers.ts, useAdminAiUsage.ts)

## Accomplishments

- 5 TS interfaces расширяют `frontend/src/api/types.ts` с точным mirror backend Pydantic schemas (включая reuse `UserRole` union из Phase 12)
- 4 типизированные async API functions в `frontend/src/api/admin.ts` повторяют существующий paттерн `categories.ts` / `settings.ts` (apiFetch wrapper + JSDoc)
- `useAdminUsers` hook реализует optimistic revoke с snapshot rollback per CONTEXT decision: строка пропадает мгновенно, при ошибке восстанавливается + rethrows ApiError для UI catch
- `useAdminAiUsage` hook идентичен паттерну `useSettings` (mountedRef + cancelled flag + refetch callback)
- `tsc --noEmit` clean: 0 ошибок до и после изменений (baseline сохранён)

## Task Commits

1. **Task 1: Расширить types.ts admin types** — `322cf25` (feat)
2. **Task 2: Создать admin.ts API client** — `f68ae03` (feat)
3. **Task 3: Создать useAdminUsers + useAdminAiUsage hooks** — `d40bdae` (feat)

**Plan metadata:** будет добавлен orchestrator'ом

## Files Created/Modified

- `frontend/src/api/types.ts` (modified, +64 lines) — 5 admin interfaces в конце файла под header `// ---------- Phase 13: Admin (Whitelist + AI Usage) ----------`
- `frontend/src/api/admin.ts` (new, 62 lines) — `listAdminUsers / inviteAdminUser / revokeAdminUser / getAdminAiUsage`
- `frontend/src/hooks/useAdminUsers.ts` (new, 108 lines) — fetch + invite + optimistic revoke с rollback
- `frontend/src/hooks/useAdminAiUsage.ts` (new, 67 lines) — fetch + refetch для AI usage breakdown

## Decisions Made

- **Optimistic только для revoke**: invite ждёт server response (id+created_at назначаются backend'ом). Это упрощает 409 ApiError catch в InviteSheet (Plan 13-07): просто `await invite(...).catch(...)` без отдельного rollback path.
- **snapshot внутри functional setState**: гарантирует точный prev даже при concurrent updates, и работает для React 18 strict-mode double-invocation.
- **Append-only insert после invite**: owner-first sort обеспечивается backend'ом (`ORDER BY role != 'owner'` в `list_users` сервисе из Plan 13-04), фронту не нужен дубль логики; новый member идёт в конец списка где и должен быть.

## Deviations from Plan

None — plan executed exactly as written. Все 3 задачи выполнены строго по action-блокам, без auto-fix'ов, без блокеров, без architectural changes. Все acceptance criteria выполнены:

- 5 interfaces (Task 1 grep: 5)
- 4 export async functions (Task 2 grep: 4)
- `useAdminUsers` × 1, `useAdminAiUsage` × 1, `snapshot` × 5 (rollback evidence), `mountedRef` × 21 across both files (Task 3)
- `tsc --noEmit` exit=0 после каждой задачи

## Issues Encountered

None.

## Verification Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` (baseline before changes) | exit=0 |
| `npx tsc --noEmit` after Task 1 (types.ts) | exit=0 |
| `npx tsc --noEmit` after Task 2 (admin.ts) | exit=0 |
| `npx tsc --noEmit` after Task 3 (hooks) | exit=0 |
| `grep -c "export interface Admin\\|export interface AiUsage" types.ts` | 5 |
| `grep -c "export async function" admin.ts` | 4 |
| `grep -c "apiFetch" admin.ts` | 5 (1 import + 4 calls) |
| `grep -c "/admin/users\\|/admin/ai-usage" admin.ts` | 8 |
| `grep -c "snapshot" useAdminUsers.ts` | 5 (capture + rollback path) |
| `grep -c "mountedRef" useAdmin*.ts` | 12 + 9 = 21 |
| Field parity vs `app/api/schemas/admin.py` | manual 1:1 review pass |

### Field-by-field parity check vs backend Pydantic schemas

| Backend (admin.py) | Frontend (types.ts) | Match |
|--------------------|---------------------|-------|
| `AdminUserResponse.id: int` | `id: number` | ✓ |
| `tg_user_id: int` | `tg_user_id: number` | ✓ |
| `tg_chat_id: Optional[int]` | `tg_chat_id: number \| null` | ✓ |
| `role: Literal["owner","member","revoked"]` | `role: UserRole` (reused from Phase 12) | ✓ |
| `last_seen_at: Optional[datetime]` | `last_seen_at: string \| null` (ISO) | ✓ |
| `onboarded_at: Optional[datetime]` | `onboarded_at: string \| null` | ✓ |
| `created_at: datetime` | `created_at: string` | ✓ |
| `AdminUserCreateRequest.tg_user_id: int (ge=10_000)` | `tg_user_id: number` (UI-side validation отдельно) | ✓ |
| `UsageBucket.requests/prompt_tokens/...` | `AiUsageBucket.requests/prompt_tokens/...` | ✓ |
| `AdminAiUsageRow.user_id: int` | `user_id: number` | ✓ |
| `name: Optional[str]` | `name: string \| null` | ✓ |
| `spending_cap_cents: int` | `spending_cap_cents: number` | ✓ |
| `current_month: UsageBucket` | `current_month: AiUsageBucket` | ✓ |
| `last_30d: UsageBucket` | `last_30d: AiUsageBucket` | ✓ |
| `est_cost_cents_current_month: int` | `est_cost_cents_current_month: number` | ✓ |
| `pct_of_cap: float` | `pct_of_cap: number` | ✓ |
| `AdminAiUsageResponse.users: list[AdminAiUsageRow]` | `users: AdminAiUsageRow[]` | ✓ |
| `generated_at: datetime` | `generated_at: string` | ✓ |

## Threat Mitigations Applied

| Threat ID | Status | Notes |
|-----------|--------|-------|
| T-13-06-01 (Info Disclosure: state holds cap/cost) | accept | Single-tenant UI on owner device per CONTEXT |
| T-13-06-02 (Tampering: optimistic revoke partial failure) | mitigate | snapshot captured ВНУТРИ functional setState updater BEFORE await; restored на caught error через `setUsers(snapshot)` + rethrow |
| T-13-06-03 (Elevation: member opens devtools) | accept | Backend require_owner returns 403 — hook surfaces error |
| T-13-06-04 (server 409 silently swallowed) | mitigate | `invite()` НЕ catches — пробрасывает ApiError untouched; UI Plan 13-07 catches `e.status === 409` |

## User Setup Required

None — frontend-only changes; existing fetch wrapper handles initData injection.

## Next Phase Readiness

Plan 13-07 имеет всё необходимое:
- `useAdminUsers()` готов к рендеру списка + InviteSheet form submit + RevokeConfirmDialog action
- `useAdminAiUsage()` готов к рендеру AI breakdown с linear progress bar (см. CONTEXT decision: warn ≥0.80, danger ≥1.0)
- Все типы экспортируются — UI компоненты могут импортировать `AdminUserResponse`, `AdminAiUsageRow` и т.д.
- ApiError class из `client.ts` уже expose'ит `.status` для 409 handling

Никаких блокеров.

## Self-Check: PASSED

- File `frontend/src/api/types.ts` modified (5 admin interfaces appended) ✓
- File `frontend/src/api/admin.ts` exists ✓
- File `frontend/src/hooks/useAdminUsers.ts` exists ✓
- File `frontend/src/hooks/useAdminAiUsage.ts` exists ✓
- Commit `322cf25` exists in git log ✓
- Commit `f68ae03` exists in git log ✓
- Commit `d40bdae` exists in git log ✓
- `npx tsc --noEmit` clean (exit=0) ✓
- Field parity with backend Pydantic schemas verified row-by-row ✓
- All 7 plan requirements (ADM-03..06, AIUSE-01..03) backed by API surface ✓

---
*Phase: 13-admin-ui-whitelist-ai-usage*
*Completed: 2026-05-07*
