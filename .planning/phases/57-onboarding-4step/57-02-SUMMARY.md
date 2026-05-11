---
phase: 57-onboarding-4step
plan: 02
subsystem: ios/onboarding
tags:
  - ios
  - onboarding
  - v06
  - approuter
  - native-rebuild
status: code-complete-smoke-deferred
key_files:
  modified:
    - "ios/BudgetPlanner/App/AppRouter.swift"
    - "ios/BudgetPlanner.xcodeproj/project.pbxproj"
decisions:
  - "AppRouter conditional onboarding mount: `isLegacyV06Shell` → NativeOnboardingWizardView, else legacy OnboardingView. Phase 56 wiring preserved."
  - "Build verification implicit — simulator launched the app (executor reached smoke stage)."
  - "Manual smoke deferred — API сервер на localhost:8000 не запущен; AuthStore.bootstrap() падает в .error state, AppRouter рендерит DevTokenSetupView, wizard визуально не достижим."
metrics:
  completed_date: "2026-05-12"
  task_count: 3
  tasks_completed: 2
  tasks_deferred: 1
  files_changed: 2
---

# Phase 57 Plan 02 Summary — AppRouter wire + xcodegen + (partial) smoke

## What shipped

### Task 1: AppRouter routing + xcodegen ✅ (commit `d580974`)
- `ios/BudgetPlanner/App/AppRouter.swift` — `.onboardingRequired` case теперь
  conditional:
  - `if isLegacyV06Shell` → `NativeOnboardingWizardView(initialUser: user)`.
  - `else` → existing `OnboardingView(initialUser: user)` (V10 path не тронут).
- `xcodegen generate` (cwd `ios/`) — регенерация `BudgetPlanner.xcodeproj`,
  picked up все 5 новых файлов из `Features/Onboarding/Native*.swift`
  через recursive scan.
- `grep NativeOnboardingWizardView.swift ios/BudgetPlanner.xcodeproj/project.pbxproj`
  → matches >= 1.

### Task 2: Build SUCCEEDED (implicit)
- Симулятор iPhone 17 Pro загрузил app — это подтверждает что build прошёл
  без errors. Прямой build log не сохранён (executor сразу перешёл к smoke).
- 0 новых warnings в Phase 57 файлах (per 57-01 self-check).

### Task 3: Manual smoke ⚠ DEFERRED — blocked by API server offline

**Что произошло:**
1. Симулятор iPhone 17 Pro booted, app installed, launched.
2. AuthStore.bootstrap() пытался вызвать `POST /api/v1/auth/dev-exchange`
   на `http://localhost:8000`.
3. **Connection refused** — API сервер не запущен. Network call → timeout →
   AuthStore.state = .error.
4. AppRouter рендерит `DevTokenSetupView` для `.error`, НЕ
   `NativeOnboardingWizardView`.
5. Wizard визуально не подтверждён — smoke A–I из плана недостижим.

**Screenshots captured:**
- `screenshots/00-launched.png` — initial blank/launching state.
- `screenshots/01-step1-income.png` — spinner (`.bootstrapping`), wizard
  не рендерится (misleading filename — это не Step 1).
- `screenshots/02-after-wait.png` — DevTokenSetupView с red error
  «Сетевая ошибка: Превышен лимит времени на запрос».

## Verification of code paths (без runtime smoke)

- AppRouter `.onboardingRequired` branch содержит обе строки:
  `NativeOnboardingWizardView(initialUser: user)` AND
  `OnboardingView(initialUser: user)` — `grep -c` returns >= 1 each ✅.
- `.authenticated` branch с `MainShell` vs `V10MainShell` через `isLegacyV06Shell`
  — diff vs HEAD shows no change ✅.
- xcodeproj contains все 5 новых файлов ✅.
- Build для iPhone 17 Pro — SUCCEEDED (app launched in simulator) ✅.

## What's NOT verified

- Wizard visual rendering (Step 1 Income, Step 2 Accounts, Step 3 Plan, Step 4 Goals).
- Navigation push between steps (NavigationStack drill-down).
- Form input validation (Дальше gating).
- Submit → OnboardingV10API.postOnboardingComplete → MainShell transition.
- Persistence через UserDefaults draft при app kill/restart.

## Open follow-ups (deferred к user-side manual verification)

1. **Запуск API сервера** для smoke:
   ```bash
   docker compose up -d api db
   # or local FastAPI: cd backend && uvicorn app.main:app --reload
   ```
2. Manual smoke по плану Plan 57-02 Task 3 steps A–I (happy path + persistence).
3. Если smoke fails: вернуться в Phase 57 и завести fix-сабтаски.
4. Legacy `Features/Onboarding/OnboardingView.swift` — defer removal до Phase
   66 или отдельной closure-фазы (per CONTEXT D-LegacyCoexistence).

## Commits

| Hash | Message |
|------|---------|
| `d580974` | feat(57-02-01): mount NativeOnboardingWizardView in AppRouter for v06 shell |
| (no separate Task 2 commit — build was inline) | |
| (no Task 3 commit — manual smoke deferred) | |

## Self-Check: PARTIAL

- File modified: `ios/BudgetPlanner/App/AppRouter.swift` → FOUND
- Conditional routing: `isLegacyV06Shell` → `NativeOnboardingWizardView` → FOUND
- xcodeproj regenerated: 5 Native* files referenced → CONFIRMED
- Build: app launched in simulator → IMPLICIT SUCCESS
- Manual smoke: DEFERRED (API server offline blocker)
