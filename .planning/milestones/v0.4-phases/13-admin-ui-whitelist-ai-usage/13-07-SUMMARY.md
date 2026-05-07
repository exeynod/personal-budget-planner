---
phase: 13-admin-ui-whitelist-ai-usage
plan: "07"
subsystem: frontend-admin-ui
tags: [frontend, ui, react, mini-app, admin, owner-only, whitelist, ai-usage]
requires:
  - phase: 13-06
    provides: "AdminUserResponse / AdminAiUsageRow types + useAdminUsers / useAdminAiUsage hooks (optimistic revoke + rethrown ApiError)"
  - phase: 12
    provides: "useUser() hook with role field на /me; ManagementScreen уже импортирует useUser pattern"
provides:
  - "frontend/src/components/UsersList.tsx: row layout с owner-pinned crown, per-member trash button, lastSeenLabel helper, empty hint"
  - "frontend/src/components/InviteSheet.tsx: BottomSheet с tg_user_id input (≥5 digits client validation), inline 409/422/403 error mapping"
  - "frontend/src/components/RevokeConfirmDialog.tsx: cascade-list confirm с submitting-flag race protection"
  - "frontend/src/components/AiUsageList.tsx: per-user linear progress bar (warn ≥80%, danger ≥100%), USD/tokens formatting"
  - "frontend/src/screens/AccessScreen.tsx: SubTabBar split (Пользователи/AI Usage); orchestrates useAdminUsers + useAdminAiUsage; toast (3s) on invite/revoke success/error"
  - "frontend/src/screens/ManagementScreen.tsx: ManagementView union extended с 'access'; ITEMS conditionally filtered по useUser().role === 'owner'"
  - "frontend/src/App.tsx: AccessScreen routing branch under managementView === 'access'"
affects:
  - "Plan 13-08 (verification): manual smoke + integration tests can now exercise full UI flow"
  - "Phase 14 (member onboarding): invited users from this screen will pass через onboarding flow когда откроют Mini App"
tech-stack:
  added: []
  patterns:
    - "Conditional menu items via ownerOnly boolean + filter (ManagementScreen.ITEMS) — ROLE-aware UX gate"
    - "Toast as inline state (3s setTimeout auto-hide) inside owning screen — no separate component needed (CONTEXT decision)"
    - "BottomSheet reuse for both forms (Invite) и confirm dialogs (Revoke) — single primitive vs separate Modal layer"
    - "fabWrap composes from screen.module.css — proper Fab positioning без overflow clipping"
key-files:
  created:
    - frontend/src/components/UsersList.tsx
    - frontend/src/components/UsersList.module.css
    - frontend/src/components/InviteSheet.tsx
    - frontend/src/components/InviteSheet.module.css
    - frontend/src/components/RevokeConfirmDialog.tsx
    - frontend/src/components/RevokeConfirmDialog.module.css
    - frontend/src/components/AiUsageList.tsx
    - frontend/src/components/AiUsageList.module.css
    - frontend/src/screens/AccessScreen.tsx
    - frontend/src/screens/AccessScreen.module.css
  modified:
    - frontend/src/screens/ManagementScreen.tsx
    - frontend/src/App.tsx
key-decisions:
  - "CSS-vars adapted to project tokens.css (--color-surface, --color-border, --color-danger-soft, --space-N, --radius-md, --text-*) — план использовал draft-имена (--color-bg-card, --color-text-secondary), которые не существуют в проекте"
  - "Toast как inline state в AccessScreen — без отдельного Toast component (CONTEXT simplicity bias)"
  - "Crown с --color-accent (а не jobless yellow hex) для owner row + role badge с матчинг tone"
  - "fabWrap composes из screen.module.css вместо локального position: relative — гарантирует Fab не клипится скролл-контейнером"
  - "Revoke handler closes dialog (sets revokeTarget=null) даже на ошибке после toast — иначе пользователь видит «Удаление…» state застрявшим"
  - "Plan 13-07 Task 4 (human-verify checkpoint) DEFERRED to milestone close per execution_mode directive — все code tasks выполнены, build clean"
metrics:
  duration: "4m 20s"
  tasks: 3
  files_created: 10
  files_modified: 2
  completed: 2026-05-07
requirements-completed: [ADM-01, ADM-02, ADM-03, ADM-04, ADM-05, AIUSE-01, AIUSE-03]
---

# Phase 13 Plan 07: Frontend Admin UI (AccessScreen + UsersList + InviteSheet + RevokeConfirmDialog + AiUsageList) Summary

**Полная UI-цепочка whitelist + AI usage в Mini App, гейтнутая по `useUser().role === 'owner'` — owner может приглашать/отзывать членов и видеть их AI-расходы; member пункт «Доступ» вообще не видит.**

## Performance

- **Duration:** 4m 20s
- **Started:** 2026-05-07T09:11:04Z
- **Completed:** 2026-05-07T09:15:24Z
- **Tasks executed:** 3 (Task 4 human-verify deferred per execution_mode)
- **Files created:** 10
- **Files modified:** 2

## Accomplishments

- `UsersList` — owner-pinned crown (T-13-07-04 UI guard hides revoke), per-member trash inline button, last-seen-label helper («сегодня» / «вчера» / «N дн. назад» / «не заходил»)
- `InviteSheet` — numeric tg_user_id input (≥5 digits client validation, paste-friendly), inline error mapping для 409 (invite_exists) / 422 (validation) / 403 (auth) — sheet НЕ закрывается при conflict (CONTEXT decision)
- `RevokeConfirmDialog` — explicit cascade list (транзакции, категории, подписки, AI-чат, AI usage); `submitting` flag блокирует backdrop-tap race (T-13-07-05)
- `AiUsageList` — linear progress bar reusing DashboardCategoryRow visual pattern (warn ≥0.8, danger ≥1.0 + percent badge); current-month vs spending_cap primary block + 30d/tokens sub-row
- `AccessScreen` — SubTabBar (Пользователи / AI Usage); inline toast (3s auto-hide); FAB only on Users tab; optimistic revoke с rollback наследуется от useAdminUsers hook
- `ManagementScreen` — union `ManagementView` extended с `'access'`; `ITEMS` фильтруется по `isOwner`; `ICONS` map дополнен `ShieldCheck`
- `App.tsx` — добавлен `AccessScreen` import + routing branch под `managementView === 'access'` (mirrors existing patterns)
- `tsc --noEmit` clean (exit=0) после каждой задачи
- `npm run build` succeeds (361.55 kB JS / 73.38 kB CSS, 249ms vite build)
- `docker compose up -d --build frontend` отработал (init-container завершился `Exited (0)`, dist volume обновлён, Caddy сразу отдаёт новый bundle)

## Task Commits

1. **Task 1: UsersList + InviteSheet + RevokeConfirmDialog** — `b9ab205` (feat)
2. **Task 2: AiUsageList с linear progress bar** — `fe19733` (feat)
3. **Task 3: AccessScreen + ManagementScreen owner-gate + App.tsx routing** — `2735f9c` (feat)
4. **Task 4 (checkpoint:human-verify): live UI smoke** — DEFERRED to milestone close

## Files Created/Modified

### Created (10)

- `frontend/src/components/UsersList.tsx` (88 lines) — row layout + owner/member branching + lastSeenLabel
- `frontend/src/components/UsersList.module.css` (118 lines) — token-driven styles (surface/border/danger-soft)
- `frontend/src/components/InviteSheet.tsx` (98 lines) — numeric input + ApiError catch + 3 status-code branches
- `frontend/src/components/InviteSheet.module.css` (76 lines)
- `frontend/src/components/RevokeConfirmDialog.tsx` (74 lines) — cascade warning + submit-state guards
- `frontend/src/components/RevokeConfirmDialog.module.css` (75 lines)
- `frontend/src/components/AiUsageList.tsx` (89 lines) — linear bar + warn/danger color logic + USD/tokens format helpers
- `frontend/src/components/AiUsageList.module.css` (123 lines)
- `frontend/src/screens/AccessScreen.tsx` (122 lines) — orchestrator: SubTabBar + 2 hooks + 3 dialogs + toast
- `frontend/src/screens/AccessScreen.module.css` (61 lines)

### Modified (2)

- `frontend/src/screens/ManagementScreen.tsx` (+25/-3) — ManagementView union extension, ITEMS ownerOnly filter, ICONS update, useUser import
- `frontend/src/App.tsx` (+4/-0) — AccessScreen import + management sub-screen branch

## Decisions Made

- **CSS-vars adapted to project tokens.css**: план использовал draft-имена (`--color-bg-card`, `--color-text-secondary`, `--color-bg-muted`), которых нет в `frontend/src/styles/tokens.css`. Я перевёл все стили на актуальные токены: `--color-surface`, `--color-border`, `--color-danger-soft`, `--space-N`, `--radius-md`, `--text-*`. Это Rule 3 (blocking issue) — иначе компоненты получали бы серый/невидимый фон.
- **Toast — inline state**: вместо нового Toast component добавлен `useState<string|null>(null)` + `setTimeout(3000)` прямо в AccessScreen. CONTEXT решение, simpler primitive.
- **Crown w/ --color-accent**: жёлтый акцент-токен проекта вместо хардкода `#ffc83d` — соответствует существующей палитре (`--color-accent: #ffd166`).
- **fabWrap composes**: AccessScreen использует `composes: fabWrap from '../styles/screen.module.css'` вместо локального `position: relative` блока — гарантирует, что Fab не клипится скролл-контейнером (паттерн совпадает с CategoriesScreen).
- **Revoke handler closes dialog даже на ошибке**: после toast показывает ошибку, я сетю `setRevokeTarget(null)` — иначе пользователь видит «Удаление…» button state застрявшим (Hook откатил state, но dialog остался открытым).
- **Task 4 human-verify deferred**: per execution_mode policy, live UI smoke (Mini App в Telegram, ввод реального tg_user_id, click через invite/revoke flow) откладывается на milestone-close или Plan 13-08. Все code-tasks завершены, типы корректны, build clean, dist обновлён в Caddy.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Adapted plan's draft CSS variables to existing tokens.css**

- **Found during:** Task 1 (writing UsersList.module.css)
- **Issue:** Plan's CSS snippets reference `--color-bg-card`, `--color-text-secondary`, `--color-bg-muted` and similar variables that не существуют в `frontend/src/styles/tokens.css`. Если оставить как есть, компоненты получат `var(--color-bg-card, fallback)` — где fallback не задан, и фон будет transparent / inherits, ломая визуал.
- **Fix:** Все стили переведены на actual tokens проекта:
  - `--color-bg-card` → `--color-surface`
  - `--color-text-secondary` → `--color-text-muted`
  - `--color-bg-muted` → `--color-surface-2`
  - hex-fallbacks (`#ff5050`, `#ffb340`, `#ffc83d`) → `--color-danger`, `--color-warn`, `--color-accent`
  - hardcoded paddings/radii → `--space-N`, `--radius-md`, `--radius-full`
  - hardcoded font-sizes → `--text-xs/sm/base/md`
- **Files modified:** Все 6 .module.css файлов созданных в Tasks 1-3
- **Why this isn't architectural (Rule 4):** Project уже имеет полный design-token set; я не внедряю новый palette, а просто использую существующий вместо несовместимого draft из плана.

**2. [Rule 1 - Bug] Last-seen helper handles "today/future" edge case**

- **Found during:** Task 1 (writing lastSeenLabel)
- **Issue:** Plan-snippet writes `if (days === 0) return 'сегодня';` — но если backend timestamp в будущем (clock skew) или ровно сейчас, `days` мог бы быть `-1`, и мы бы вернули `${-1} дн. назад` («-1 дн. назад»).
- **Fix:** Изменил на `if (days <= 0) return 'сегодня';` + добавил `Number.isNaN(then)` guard для невалидных ISO.
- **Files modified:** `frontend/src/components/UsersList.tsx`
- **Why minor:** Defensive UX polish.

**3. [Rule 1 - Bug] Revoke error path не закрывал dialog**

- **Found during:** Task 3 (writing AccessScreen handleRevokeConfirm)
- **Issue:** Plan-snippet ловит error и делает `// Hook already rolled back state` — но `revokeTarget` остаётся ненулевым, и BottomSheet продолжает отображаться с вечно-disabled "Удаление…" кнопкой.
- **Fix:** В catch-блок добавил `setRevokeTarget(null)` после showToast.
- **Files modified:** `frontend/src/screens/AccessScreen.tsx`

### Plan-only-deviations (no rule)

- **AiUsageList sub-row formatting**: уточнил формат "30д: $X.XX" с конвертацией `last_30d.est_cost_usd` (float USD) → cents-of-USD через `Math.round(× 10_000)` для единого `formatUsd` helper. План говорил «30d: ${formatUsd(...)}», я просто сохранил unified API formatter.

## Authentication Gates

None — все code-changes frontend-only, без runtime API calls во время dev.

## Issues Encountered

None. tsc clean baseline → tsc clean после каждой задачи.

## Verification Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` baseline | exit=0 |
| `npx tsc --noEmit` after Task 1 (3 components) | exit=0 |
| `npx tsc --noEmit` after Task 2 (AiUsageList) | exit=0 |
| `npx tsc --noEmit` after Task 3 (AccessScreen + Mgmt + App) | exit=0 |
| `npm run build` (vite production) | exit=0, 249ms, 361.55 kB JS / 73.38 kB CSS |
| `docker compose up -d --build frontend` | image built + container exited(0), dist volume updated |
| `grep -c "ShieldCheck\|access" frontend/src/screens/ManagementScreen.tsx` | 4 (≥3 required) |
| `grep -c "isOwner" frontend/src/screens/ManagementScreen.tsx` | 2 (≥1 required) |
| `grep -c "AccessScreen" frontend/src/App.tsx` | 2 (≥2 required) |
| `grep -c "managementView === 'access'" frontend/src/App.tsx` | 1 (=1 required) |
| `grep -c "useAdminUsers\|useAdminAiUsage" frontend/src/screens/AccessScreen.tsx` | 5 (≥2 required) |
| `grep -c "isWarn\|isDanger\|pct_of_cap" frontend/src/components/AiUsageList.tsx` | 4 (≥3 required) |
| `grep -c "barFill\|barWarn\|barDanger" frontend/src/components/AiUsageList.module.css` | 4 (≥3 required) |
| `grep -c "ApiError" frontend/src/components/InviteSheet.tsx` | 4 (≥1 required) |
| `grep -c "безвозвратно\|транзакции\|AI" frontend/src/components/RevokeConfirmDialog.tsx` | 3 (≥3 required) |

## Threat Mitigations Applied

| Threat ID | Status | Notes |
|-----------|--------|-------|
| T-13-07-01 (Member sees «Доступ» due to stale role) | mitigate | useUser() reads role from /me; ManagementScreen filters via `isOwner`; refresh upon ManagementScreen mount (default useUser fetch-on-mount) |
| T-13-07-02 (Optimistic revoke leaves UI inconsistent) | mitigate | Делегировано Plan 13-06: useAdminUsers захватывает snapshot ВНУТРИ functional setState, restores on caught ApiError; AccessScreen catches и показывает toast |
| T-13-07-03 (Toast displays raw error) | accept | Single-tenant owner-only context; CONTEXT decision; Phase 15+ может санитизировать |
| T-13-07-04 (Self-revoke owner via direct DELETE) | mitigate | UsersList НЕ рендерит revoke-button для owner row; backend Plan 13-04 возвращает 403 — UI guard это convenience |
| T-13-07-05 (Revoke confirm autoclose race) | mitigate | RevokeConfirmDialog tracks `submitting` — `handleCancel` ignored if submitting; backdrop tap calls handleCancel что также blocked |

## Known Stubs

None. Все компоненты wired к реальным hooks (`useAdminUsers`, `useAdminAiUsage`), которые делают live API calls. Spending cap отображается из backend response (`u.spending_cap_cents`), не hardcoded.

## Threat Flags

None — все новая поверхность строго в рамках existing trust boundaries (admin endpoints под `require_owner`).

## TODO: Live UI Smoke (DEFERRED checkpoint)

Plan 13-07 Task 4 (`checkpoint:human-verify`) был запланирован как live smoke в Mini App:

1. Открыть Mini App как owner → вкладка «Управление» → пункт «Доступ» виден
2. Нажать «Доступ» → AccessScreen с saб-табами «Пользователи» / «AI Usage»
3. Tab «Пользователи»: owner row (без revoke), Fab → InviteSheet → ввод 5+ цифр → toast «Приглашение создано» + строка появляется
4. Тап trash icon у member → RevokeConfirmDialog → «Удалить» → строка исчезает + toast «Пользователь отозван»
5. Tab «AI Usage»: owner с current_month $0.00 / $5.00 если нет usage; progress bar styling по cap%

**Per execution_mode directive: deferred to Plan 13-08 verification или milestone close per Phase 11/12 pattern.** Все code-tasks завершены, build clean, dist обновлён в Caddy. Manual smoke требует open Telegram + Mini App context — не блокирует автоматизированный execution flow.

## User Setup Required

None — frontend-only changes, dist уже refreshed в Docker volume через `docker compose up -d --build frontend`. Caddy serves обновлённый bundle сразу.

## Next Phase Readiness

Phase 13 is functionally complete:

- Backend whitelist + AI usage endpoints (Plans 13-04, 13-05) ✓
- Frontend types/API/hooks foundation (Plan 13-06) ✓
- Frontend UI screens + routing (Plan 13-07 — this) ✓
- Outstanding: Plan 13-08 verification + milestone close (live smoke checkpoint resolution)

## Self-Check: PASSED

- File `frontend/src/components/UsersList.tsx` exists ✓
- File `frontend/src/components/UsersList.module.css` exists ✓
- File `frontend/src/components/InviteSheet.tsx` exists ✓
- File `frontend/src/components/InviteSheet.module.css` exists ✓
- File `frontend/src/components/RevokeConfirmDialog.tsx` exists ✓
- File `frontend/src/components/RevokeConfirmDialog.module.css` exists ✓
- File `frontend/src/components/AiUsageList.tsx` exists ✓
- File `frontend/src/components/AiUsageList.module.css` exists ✓
- File `frontend/src/screens/AccessScreen.tsx` exists ✓
- File `frontend/src/screens/AccessScreen.module.css` exists ✓
- File `frontend/src/screens/ManagementScreen.tsx` modified (ManagementView extended, ITEMS gated) ✓
- File `frontend/src/App.tsx` modified (AccessScreen routing branch) ✓
- Commit `b9ab205` exists in git log ✓
- Commit `fe19733` exists in git log ✓
- Commit `2735f9c` exists in git log ✓
- `npx tsc --noEmit` clean (exit=0) ✓
- `npm run build` succeeds (exit=0) ✓
- Docker frontend init-container rebuilt (Exited 0, "frontend dist exported") ✓

---
*Phase: 13-admin-ui-whitelist-ai-usage*
*Completed: 2026-05-07*
