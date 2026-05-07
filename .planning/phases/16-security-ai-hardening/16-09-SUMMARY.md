---
plan_id: 16-09-code-01-money-parser-dedup
phase: 16
plan: 09
subsystem: frontend/utils
tags: [code-quality, money-invariant, dedup, vitest, playwright]
requirements_closed: [CODE-01]
dependency_graph:
  requires: []
  provides:
    - "frontend/src/utils/format.ts:parseRublesToKopecks (single canonical, digit-walk)"
  affects:
    - "frontend/src/components/ActualEditor.tsx (now imports canonical)"
    - "frontend/src/components/PlanItemEditor.tsx (now imports canonical)"
    - "frontend/src/components/PlanRow.tsx (now imports canonical)"
tech_stack:
  added: []
  patterns:
    - "decimal-grade digit-walk integer parser (no parseFloat → no IEEE 754)"
    - "vitest it.each table-driven edge-case tests"
    - "Playwright route.fulfill amount_cents capture for cross-component parity"
key_files:
  created:
    - frontend/src/utils/format.test.ts
    - frontend/tests/e2e/money-parser-parity.spec.ts
  modified:
    - frontend/src/utils/format.ts
    - frontend/src/components/ActualEditor.tsx
    - frontend/src/components/PlanItemEditor.tsx
    - frontend/src/components/PlanRow.tsx
    - frontend/package.json
decisions:
  - "Closed D-16-09 — canonical impl is digit-walk (parseFloat dropped from format.ts)."
  - "Edge case '0.001' → null (refuse 3+ fractional digits, do NOT round to 0)."
  - "Whitespace strip pattern includes nbsp ' ' (U+00A0) alongside ASCII whitespace."
  - "PlanRow.tsx (third dup site, not in plan's frontmatter description but in objective body) is also unified — full surface coverage."
  - "package.json gains test/test:watch scripts (idempotent — plan task 1 step 3 conditional)."
metrics:
  duration_min: 6
  completed_at: 2026-05-07
  commit: 1c1bb7b
  test_count_added: 30  # 29 vitest + 1 Playwright
  files_changed: 7  # 4 src + 1 vitest + 1 e2e + 1 package.json
---

# Phase 16 Plan 09: CODE-01 Money Parser Dedup Summary

Single canonical decimal-grade digit-walk `parseRublesToKopecks` in `frontend/src/utils/format.ts`; 3 local duplicates across ActualEditor / PlanItemEditor / PlanRow removed; 29 vitest cases on edge inputs from REQUIREMENTS.md acceptance + 1 Playwright cross-editor parity e2e — closes CODE-01 (HIGH money-invariant from 2026-05-07 code review).

## What Was Done

1. **Replaced `parseRublesToKopecks` in `frontend/src/utils/format.ts`**
   - Old: `parseFloat`-based (IEEE 754 precision loss on round kopeck amounts;
     `'0.001'` → 0.001 → `Math.round(0.1)` = 0 cents).
   - New: integer-only digit-walk via `parseInt(intPart) * 100 + parseInt(fracPart.padEnd(2, '0'))`.
     Rejects 3+ fractional digits (`'0.001'` → null), multiple separators, negative sign,
     scientific notation, NaN, Infinity, leading `+`, comma-as-thousand-separator
     (ru-RU canonical thousand-sep is space).
   - Whitespace stripping covers nbsp (U+00A0) — guards against locale-formatted paste
     of `formatKopecks` output (`toLocaleString('ru-RU')` emits nbsp thousands-sep).

2. **Removed 3 local `parseRublesToKopecks` duplicates** in:
   - `frontend/src/components/ActualEditor.tsx` (was digit-walk, semantically closest
     to the canonical impl now adopted across the codebase).
   - `frontend/src/components/PlanItemEditor.tsx` (was parseFloat — divergent from
     ActualEditor on `'0.001'`; this is the divergence reported in the code review).
   - `frontend/src/components/PlanRow.tsx` (was parseFloat with `f <= 0` reject).
   All three now `import { parseRublesToKopecks } from '../utils/format'`.

3. **Added vitest unit tests** in `frontend/src/utils/format.test.ts` — 29 cases:
   - 12 valid inputs covering plan acceptance: `'100,50'` → 10050,
     `'1 000.5'` → 100050, `'1500.50'` → 150050, `'0.01'` → 1, `'1500'` → 150000,
     `'9999999.99'` → 999999999.
   - 15 invalid inputs returning null: empty, letters, multi-dot, negative,
     `'0'`, `'0.00'`, `'0.001'` (3+ fractional digits per money invariant),
     `'1,234,567'`, scientific, NaN, Infinity, leading-plus, whitespace-only.
   - 2 smoke tests for `formatKopecks` / `formatKopecksWithCurrency` (no regress).

4. **Added Playwright e2e parity test** in `frontend/tests/e2e/money-parser-parity.spec.ts`:
   - Mocks `/api/v1/me`, `/api/v1/periods/current`, `/api/v1/categories`, etc.
   - Captures POST `/api/v1/actual` body.amount_cents from ActualEditor flow
     (Транзакции → История → Fab «Добавить транзакцию»).
   - Captures POST `/api/v1/periods/1/planned` body.amount_cents from PlanItemEditor flow
     (Транзакции → План → Fab «Добавить строку плана»).
   - Asserts both = 10050 (and equal). Validates that the dedup actually wires both
     editors through the canonical parser.

5. **Added test scripts** in `frontend/package.json` — `"test": "vitest run"` and
   `"test:watch": "vitest"` (idempotent: plan 16-01 had already established jsdom
   vitest setup via `vite.config.ts` + `src/test/setup.ts`; this plan only added
   the npm-script aliases).

## Threats Mitigated

| Threat | Mitigation |
|--------|------------|
| T-16-09-01 (Tampering / data integrity — different parsers per editor) | Single canonical helper imported by all 3 editors. Same input string ⇒ same `amount_cents` (vitest unit + Playwright cross-editor parity tests prove parity). |
| T-16-09-02 (parseFloat IEEE 754 drift on round kopeck amounts) | Integer-only digit-walk: `parseInt(intPart) * 100 + parseInt(fracPart.padEnd(2,'0'))`. No float math; `Math.round` removed. |
| T-16-09-03 (`'0.001'` ambiguity — round to 0 vs null reject) | Locked semantics: 3+ fractional digits → null. Aligns with REQUIREMENTS.md acceptance and CLAUDE.md money invariant. |
| T-16-09-04 (Backend Pydantic gt=0 last-line) | Accepted (already in place). UI now rejects bad input before the network call instead of bouncing on 422. |

## Verification

Phase-level acceptance — all PASSED:

| # | Check | Result |
|---|-------|--------|
| 1 | `cd frontend && npx vitest run src/utils/format.test.ts` → ≥25 passed | **29 passed** |
| 2 | `cd frontend && npx playwright test tests/e2e/money-parser-parity.spec.ts` → 1 passed | **1 passed** (~2s) |
| 3 | `cd frontend && npx tsc --noEmit` → exit 0 | **clean** |
| 4 | `grep -c "function parseRublesToKopecks" frontend/src/components/*.tsx` → 0 | **0 dupes** |
| 5 | `grep -l "import.*parseRublesToKopecks.*utils/format" frontend/src/components/*.tsx \| wc -l` ≥ 3 | **3 files** (ActualEditor, PlanItemEditor, PlanRow) |

## Deviations from Plan

**Plan 16-09 was executed exactly as written** for the substantive work (parser impl,
3 dedup sites, vitest cases, e2e flow). One minor coordination / environment note:

### Notes (not deviations)

- **Plan 16-01 had already added vitest test infrastructure** (`vite.config.ts` jsdom
  config, `src/test/setup.ts`, `@testing-library/react` and `jsdom` devDependencies).
  Per the plan's idempotency directive, this plan only added the `test` / `test:watch`
  npm scripts to `package.json`. No conflict with 16-01.
- **Race-stable atomic commit:** the plan ran in parallel with several other Phase 16
  fixes (16-02 SEC-02, 16-03 AI-01, 16-08 DB-01) writing to the same repo. To avoid
  losing edits to a concurrent agent's `git restore` / `git reset`, the final
  `git add … && git commit …` was issued as a single atomic shell pipeline rather
  than a two-step add → commit. The first commit attempt (separate steps) saw its
  staged index cleared by another agent before commit; the atomic retry succeeded as
  `1c1bb7b`.

### Auto-fixed Issues

None — no Rule 1/2/3 deviations were necessary; the plan covered all required behavior.

### Authentication Gates

None — pure frontend refactor, no auth flows touched.

## Self-Check: PASSED

All claimed artifacts exist on disk and the canonical commit is in `git log`:

- `frontend/src/utils/format.ts` — modified, contains digit-walk impl (commit 1c1bb7b).
- `frontend/src/utils/format.test.ts` — created (29 cases, all green).
- `frontend/tests/e2e/money-parser-parity.spec.ts` — created (1 test, passing).
- `frontend/src/components/ActualEditor.tsx` — modified, imports canonical, dup removed.
- `frontend/src/components/PlanItemEditor.tsx` — modified, imports canonical, dup removed.
- `frontend/src/components/PlanRow.tsx` — modified, imports canonical, dup removed.
- `frontend/package.json` — modified (test scripts added).
- Commit `1c1bb7b` on `master` — verified via `git log --oneline | grep 1c1bb7b`.

## Files Changed

```
 frontend/package.json                              |  4 +-
 frontend/src/components/ActualEditor.tsx           | 11 +---
 frontend/src/components/PlanItemEditor.tsx         | 10 +---
 frontend/src/components/PlanRow.tsx                |  9 +-
 frontend/src/utils/format.ts                       | 41 ++++++++--
 frontend/src/utils/format.test.ts                  | 55 +++++++++++++
 frontend/tests/e2e/money-parser-parity.spec.ts     | 224 ++++++++++++++++++++++
 7 files changed, 322 insertions(+), 36 deletions(-)
```

Commit: `1c1bb7b` — `fix(16): CODE-01 single canonical parseRublesToKopecks digit-walk parser + dedup ActualEditor/PlanItemEditor/PlanRow + vitest + Playwright parity`
