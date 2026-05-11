---
status: human_needed
verified: 2026-05-12
phase: 57-onboarding-4step
---

# Phase 57 Verification

## Success Criteria (per ROADMAP + must_haves)

- [x] Native iOS onboarding wizard — 4 step views под `NavigationStack` drill-down (Plan 57-01).
- [x] Использует v1.0 `OnboardingV10API.postOnboardingComplete` через
  `OnboardingFlow.toAPIBody()` (no data-model duplication).
- [x] AppRouter conditional mount: `themeRaw == "v06"` → NativeOnboardingWizardView,
  иначе legacy OnboardingView (Plan 57-02 Task 1).
- [x] xcodegen регенерировал project — все 5 новых файлов в target sources.
- [x] iOS build для iPhone 17 Pro симулятора — SUCCEEDED (implicit: app launched).
- [x] Legacy `Features/Onboarding/OnboardingView.swift` retained on disk per
  CONTEXT deferred-removal decision.
- [⚠] **HUMAN-VERIFY:** Manual smoke (happy path A–I из Plan 57-02 Task 3) —
  **DEFERRED**: blocked by offline API сервер на localhost:8000.

## Test results

- No new automated tests (UI-only wizard, manual smoke per план).
- Build SUCCEEDED для iPhone 17 Pro (implicit via simulator launch).
- Existing build warnings baseline preserved (0 new warnings в Phase 57 files
  per 57-01 grep verification).

## Manual verification required (BLOCKED — pending API server start)

Чтобы закрыть Phase 57 со статусом `passed`, нужно:

1. **Запустить API сервер**:
   ```bash
   docker compose up -d api db
   # или локально: cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

2. **Force-set state для wizard rendering** (через симулятор defaults):
   ```bash
   xcrun simctl spawn booted defaults write com.exeynod.BudgetPlanner ui.theme v06
   xcrun simctl spawn booted defaults write com.exeynod.BudgetPlanner DEV_FORCE_ONBOARDING 1
   xcrun simctl launch booted com.exeynod.BudgetPlanner
   ```

3. **Smoke по плану 57-02 Task 3 steps A–I**:
   - A. Step 1 Income: type `120000` → Дальше enabled → tap.
   - B. Step 2 Accounts: tap «Т-Банк» preset → primary account row → Дальше.
   - C. Step 3 Plan: 8 default categories с Stepper → increment one → Дальше.
   - D. Step 4 Goals: skip goal + toggle off roundup → Готово → "Сохранение…"
     → MainShell.
   - E-I. Persistence: re-trigger onboarding, type incoming, add account, **kill
     app**, relaunch → confirm wizard restores to Step 2+ с previously entered
     data.

4. **Capture screenshots** — overwrite текущие `screenshots/*` (current ones
   showing spinner / DevTokenSetupView misleading).

## Commits

- `c87f7d7` — feat(57-01-01): native onboarding wizard root + step routing scaffold
- `bc2fbba` — feat(57-01-02): native onboarding step views (Income / Accounts / Plan / Goals)
- `d580974` — feat(57-02-01): mount NativeOnboardingWizardView in AppRouter for v06 shell

## Next phase

- Phase 59: Transactions (v06 native) — миграция на ActualV10API (4-valued kind);
  включает deferred Phase 58 HomeView CategoryKind migration.

## Notes

- Phase 65 (CategoryDetail) — также shipped с manual smoke в симуляторе. Phase
  57 — первая фаза где executor попытался полный automated smoke в bg-режиме;
  выявлен gap в autonomous flow: dev-environment infra (docker compose up) не
  поднимается автоматически. Documented в `feedback-restart-services.md`
  memory — после правок executor пересобирает сервисы, но из cold state не
  стартует.
