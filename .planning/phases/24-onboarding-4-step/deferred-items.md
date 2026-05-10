# Deferred items discovered during 24-01 execution

## Pre-existing test failure (out of scope)

- **Test:** `BudgetPlannerTests/PeriodTests/testCycleDayClampedInFebruary`
- **File:** `ios/BudgetPlannerTests/PeriodTests.swift`
- **Symptom:** XCTAssertEqual failed: ("2026-01-31") is not equal to ("2026-02-15")
- **Origin:** Phase 18 (`5acaedd feat(18): iOS Core CRUD …`); pre-dates 24-01
- **Likely cause:** test fixture references "today" implicitly via Calendar.current — fails on certain dates (today is 2026-05-10 so the period_for(...) call lands on January when fixture expected February).
- **Action:** logged for whoever owns Period logic; 24-01 does not touch Period.

