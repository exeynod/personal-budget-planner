---
status: passed
verified: 2026-05-11
phase: 65-category-detail
---

# Phase 65 Verification

## Success Criteria (per ROADMAP)

- [x] Tap по категории в v06 CategoriesView → push в `CategoryDetailScreen`
  (NavigationLink).
- [x] Hero section: icon + kind label + total cents за активный период + count
  операций.
- [x] History section: `ForEach` транзакций отсортирован date desc (через
  `ActualAPI.list(periodId:, categoryId:)`).
- [x] Toolbar Menu: «Переименовать» / «Архивировать» (destructive) /
  «Восстановить» (если `is_archived`) — перенесены из inline-sheet.
- [~] **DEFERRED:** «Увеличить лимит» — Phase 61 (PlanMonthAPI).
- [~] **DEFERRED:** Migration на v1.0 `ActualV10API` — Phase 59.
- [⚠] **DISCOVERED → fixed in hotfix `6599c65`:** `CategoriesView` creation
  падал 500 на v1.0 backend (NOT-NULL `code`); добавлен server-side fallback в
  `create_category`. Полная migration отложена к Phase 59.

## Test results

- No new automated tests for Phase 65 — manual smoke в симуляторе.
- Zero regressions vs Phase 58 baseline: build clean.

## Commits

- `cb86886` — feat(65): CategoryDetail drill-down (v06 native)
- `6599c65` — fix(categories): auto-generate code+ord placeholders in
  create_category (hotfix discovered during 65 smoke)

## Next phase

- Phase 57: Onboarding 4-step (v06 native).
- Phase 59: Transactions migration (включает deferred Phase 65 items).
- Phase 66: Settings + AI + Management Polish.
