# Deferred items discovered during 24-01 execution

## Pre-existing test failure (out of scope)

- **Test:** `BudgetPlannerTests/PeriodTests/testCycleDayClampedInFebruary`
- **File:** `ios/BudgetPlannerTests/PeriodTests.swift`
- **Symptom:** XCTAssertEqual failed: ("2026-01-31") is not equal to ("2026-02-15")
- **Origin:** Phase 18 (`5acaedd feat(18): iOS Core CRUD …`); pre-dates 24-01
- **Likely cause:** test fixture references "today" implicitly via Calendar.current — fails on certain dates (today is 2026-05-10 so the period_for(...) call lands on January when fixture expected February).
- **Action:** logged for whoever owns Period logic; 24-01 does not touch Period.

## Second pre-existing failure (logged during 24-05)

- **Test:** `BudgetPlannerTests/MoneyTests/testRoundRubles`
- **File:** `ios/BudgetPlannerTests/MoneyTests.swift`
- **Symptom:** XCTAssertEqual failed: ("100") is not equal to ("10 000")
- **Origin:** pre-dates 24-05; surfaced during full-suite run after Step02 work but the failure is unrelated to the onboarding feature (Money rounding helper).
- **Action:** logged for whoever owns Money helpers; 24-05 does not touch Money.

