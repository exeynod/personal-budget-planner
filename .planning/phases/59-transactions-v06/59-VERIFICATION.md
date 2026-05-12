---
phase: 59
status: passed
verified_at: 2026-05-12T11:25:00+03:00
human_smoke_status: approved
human_smoke_at: 2026-05-12T11:25:00+03:00
plans_complete:
  - 59-01
  - 59-02
  - 59-03
---

# Phase 59 VERIFICATION — Transactions (v06 native)

## Goal

> Миграция с legacy ActualAPI/PlannedAPI (2-valued kind) на v1.0 ActualV10API (4-valued kind). Фильтры по категории, history/planned subtabs через native Picker. Swipe-to-delete.

## Plans

| Plan | Wave | Status | Commit(s) |
|------|------|--------|-----------|
| 59-01 ViewModel migration to V10 + tests | 1 | ✓ complete | 44e8961, c34f54e, c8b97fb |
| 59-02 View body rewrite (3-segment picker, subtabs, filter Menu, V10 rows) | 2 | ✓ complete | db29828, 97dc087 |
| 59-03 Swipe-to-delete + confirmationDialog + banner | 3 | ✓ complete | d09244e |

## must_haves (goal-backward)

| Check | Status | Evidence |
|-------|--------|----------|
| `TransactionsView` loads from `ActualV10API` (NOT legacy) | ✓ | 59-01 grep gate: `ActualV10DTO` count = 6; `actuals: [ActualDTO]` = 0 |
| 3-segment kind picker в `.history` (Расходы/Доходы/Сбережения) | ✓ | 59-02 manual smoke approved 2026-05-12 11:05 |
| 2-segment в `.plan` (Расходы/Доходы) | ✓ | 59-02 implementation, sync via `subTab.onChange` reset of `savingsSegmentSelected` |
| Roundup actuals в Расходы с `arrow.up.forward` mini-icon | ✓ | 59-02 smoke |
| Deposit actuals в Сбережения, blue amount | ✓ | 59-02 smoke |
| Category filter `Menu` в trailing toolbar | ✓ | 59-02 smoke (filled при active) |
| Swipe-to-delete только в `.history` | ✓ | 59-03 smoke (Plan subtab без swipe) |
| `.confirmationDialog` перед DELETE | ✓ | 59-03 smoke step 2 |
| `deleteError` inline banner (НЕ заменяет list) | ✓ | 59-03 ZStack overlay implementation |
| Notification.txnCreated триггерит re-load | ✓ | 59-01 ViewModel observer (lifecycle init/deinit) |
| Day grouping `Europe/Moscow` TZ | ✓ | 59-01 grep gate + tests |
| Build clean, 0 errors, 0 new warnings | ✓ | `make build` Succeeded |
| ViewModel tests 15/15 pass | ✓ | xcodebuild test green |
| No `@AppStorage` (cold-launch defaults) | ✓ | 59-02 D-03 enforced |
| TransactionEditor untouched (Phase 64 scope) | ✓ | 59-02 bridge `legacyActualDTO(from:)` |
| FeaturesV10/Transactions untouched (V10 shell coexistence) | ✓ | grep — no changes |

## Threat coverage

| Threat ID | Description | Mitigation | Plan |
|-----------|-------------|------------|------|
| T-59-01 | Repudiation — accidental delete | `.confirmationDialog` two-step gate | 59-03 |
| T-59-02 | Concurrency — re-entrant load/delete | `inFlight: Bool` guard в VM | 59-01 |
| T-59-03 | Info disclosure via `.localizedDescription` | filtered Russian copy в banner | 59-01 (origin), 59-02 + 59-03 (re-asserted) |

## Smoke status

**Approved by user 2026-05-12 11:25 MSK** — все 8 пунктов checklist (swipe + dialog + banner + Plan-no-swipe) + финальная приёмка Phase 59 (3-segment picker, roundup icon, deposit color, filter Menu, Moscow TZ, Notification reload, V10 coexistence, TransactionEditor sheet) пройдены.

## Known limitations / handed off

- **TransactionEditor** остаётся на legacy ActualDTO API. Bridge `legacyActualDTO(from:)` в 59-02 обеспечивает tap-to-edit для `.expense`/`.income`. Полная миграция — Phase 64 (AddSheet нативный).
- **HomeView v06** ломается при `savings`/`other` категориях от backend (известно с Phase 58). Транзакции Phase 59 не блокируют HomeView, но миграция HomeView — отдельный future phase.
- **PlannedAPI** остаётся legacy 2-valued kind. Backend v1.0 PlannedV10API не существует. Кэплан subtab с 3-segment picker для savings = пустой стейт.
- **CategoryV10DTO.kind** на самом деле 2-valued (Plan-phase открыл во время planning: CONTEXT.md утверждение о 4-valued CategoryKind было ошибочным). Только `ActualKindV10` 4-valued. Документировано в 59-01 SUMMARY.

## Decision

Phase 59 — **PASSED**. Готова к закрытию в STATE.md/ROADMAP.md.
