---
phase: 05-dashboard-period-lifecycle
plan: "04"
subsystem: frontend-components
tags: [frontend, components, dashboard, ui-spec, css-modules]
dependency_graph:
  requires: ["05-03"]
  provides: [HeroCard, PeriodSwitcher, AggrStrip, DashboardCategoryRow]
  affects: ["05-05"]
tech_stack:
  added: []
  patterns: [css-modules, pure-presentational-components, design-token-only-styling]
key_files:
  created:
    - frontend/src/components/HeroCard.tsx
    - frontend/src/components/HeroCard.module.css
    - frontend/src/components/PeriodSwitcher.tsx
    - frontend/src/components/PeriodSwitcher.module.css
    - frontend/src/components/AggrStrip.tsx
    - frontend/src/components/AggrStrip.module.css
    - frontend/src/components/DashboardCategoryRow.tsx
    - frontend/src/components/DashboardCategoryRow.module.css
  modified: []
decisions:
  - "HeroCard рендерит ending_balance_cents ?? 0 для closed (null safety); isClosed prop controls label and amount source"
  - "PeriodSwitcher: hasPrev = idx < length-1, hasNext = idx > 0 (DESC sort invariant)"
  - "AggrStrip delta: expense = planned-actual, income = actual-planned (D-02 sign rule)"
  - "DashboardCategoryRow: isWarn = pct >= 0.8 && pct <= 1.0; isOverspend = pct > 1.0"
  - "No progress bar when planned_cents === 0 (hasPlanned guard)"
metrics:
  duration: "~20min"
  completed: "2026-05-03T16:10:00Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 8
  files_modified: 0
---

# Phase 5 Plan 04: Dashboard UI Components — HeroCard, PeriodSwitcher, AggrStrip, DashboardCategoryRow

**One-liner:** 4 pure-presentational dashboard components with CSS Modules — gradient HeroCard (active/closed modes), PeriodSwitcher with disabled-state navigation, AggrStrip with D-02 delta sign rule, and DashboardCategoryRow with warn/overspend progress bar states.

## What Was Built

### Task 1: HeroCard + PeriodSwitcher

**`HeroCard`** — premium gradient balance card (DSH-01, DSH-02, DSH-05):
- Props: `{ balance: BalanceResponse, period: PeriodRead, isClosed: boolean }`
- Active mode: shows `balance.balance_now_cents` with label "Баланс"
- Closed mode: shows `period.ending_balance_cents ?? 0` with label "Итог периода"
- Period range formatted as "5 апр – 4 мая 2026" using `ru-RU` locale
- Delta `balance.delta_total_cents` with sign: positive → `--color-success`, negative → `--color-danger`, zero → `--color-text-muted`
- Background `--gradient-hero` + overlay `--gradient-hero-glow`, `aria-hidden` on glow div

**`PeriodSwitcher`** — horizontal period navigation (DSH-06):
- Props: `{ periods: PeriodRead[], selectedId: number, onSelect: (id: number) => void }`
- `periods` assumed sorted DESC by `period_start` (newest first)
- `hasPrev = idx < length - 1` (older period exists); `hasNext = idx > 0` (newer exists)
- `‹` disabled when `!hasPrev`; `›` disabled when `!hasNext`
- "Закрыт" pill badge rendered when `current.status === 'closed'`
- Month label: `"май 2026" → "Май 2026"` (capitalize first letter)
- `aria-label="Предыдущий период"` / `aria-label="Следующий период"` on nav buttons

### Task 2: AggrStrip + DashboardCategoryRow

**`AggrStrip`** — 3-column aggregate strip below TabBar (DSH-01, DSH-02):
- Props: `{ balance: BalanceResponse, kind: CategoryKind }`
- Columns: "ПЛАН" / "ФАКТ" / "Δ" for active `kind`
- **D-02 sign rule**: expense → `planned - actual`; income → `actual - planned`
- Delta color: positive → success, negative → danger, zero → muted
- Background `--color-surface`, border-bottom `--color-border-subtle`

**`DashboardCategoryRow`** — category row with progress bar (DSH-01, DSH-03):
- Props: `{ row: BalanceCategoryRow }`
- Progress bar fill = `min(actual/planned * 100, 100)%`, height 4px
- Fill color: `< 80%` → primary, `≥ 80% and ≤ 100%` → warn, `> 100%` → danger
- **Warn state** (≥80%, ≤100%): `1px solid --color-warn` border on row
- **Overspend state** (>100%): `1px solid --color-danger` border + "123%" badge with `--color-danger-soft` background
- **No progress bar** when `planned_cents === 0` (`hasPlanned` guard)
- Category name truncates with ellipsis

## Component Prop Signatures for Plan 05-05 (HomeScreen consumer)

```typescript
// HeroCard
import { HeroCard } from '../components/HeroCard';
// { balance: BalanceResponse, period: PeriodRead, isClosed: boolean }
<HeroCard balance={balance} period={period} isClosed={period.status === 'closed'} />

// PeriodSwitcher
import { PeriodSwitcher } from '../components/PeriodSwitcher';
// { periods: PeriodRead[], selectedId: number, onSelect: (id: number) => void }
<PeriodSwitcher periods={periods} selectedId={selectedPeriodId} onSelect={setSelectedPeriodId} />

// AggrStrip
import { AggrStrip } from '../components/AggrStrip';
// { balance: BalanceResponse, kind: CategoryKind }
<AggrStrip balance={balance} kind={activeTab} />

// DashboardCategoryRow
import { DashboardCategoryRow } from '../components/DashboardCategoryRow';
// { row: BalanceCategoryRow }
{balance.by_category
  .filter(r => r.kind === activeTab)
  .map(r => <DashboardCategoryRow key={r.category_id} row={r} />)
}
```

## Design Token Usage

All 8 files use exclusively `var(--*)` tokens from `tokens.css`. No hardcoded hex colors or magic numbers. Exceptions:
- `2px` progress bar border-radius (non-semantic, too small for a token)
- `200ms ease-out` progress fill transition (animation timing, no token defined)
- `2px` badge top/bottom padding (sub-token, no `--space-0.5` exists)
- `margin-left: 2px` on `.currency` (micro-alignment, no token)

## TypeScript Compilation

```
$ tsc --noEmit
EXIT: 0  (no errors)
```

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | `822eca1` | feat(05-04): add HeroCard and PeriodSwitcher components |
| Task 2 | `ee465d1` | feat(05-04): add AggrStrip and DashboardCategoryRow components |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all components are pure presentational, receiving data via props. No hardcoded placeholder data. Wiring to real API data happens in Plan 05-05 (HomeScreen).

## Threat Flags

No new threat surface introduced. All components:
- Use React text rendering only — no `dangerouslySetInnerHTML` in any of the 4 components (T-05-16 mitigated)
- `aria-hidden` on decorative elements (glow overlay, progress bar container)
- `aria-label` on interactive buttons (T-05-20 mitigated)
- `onSelect` callback receives only IDs from the periods array (T-05-18 accepted)

## Self-Check: PASSED

- `frontend/src/components/HeroCard.tsx` — FOUND
- `frontend/src/components/HeroCard.module.css` — FOUND
- `frontend/src/components/PeriodSwitcher.tsx` — FOUND
- `frontend/src/components/PeriodSwitcher.module.css` — FOUND
- `frontend/src/components/AggrStrip.tsx` — FOUND
- `frontend/src/components/AggrStrip.module.css` — FOUND
- `frontend/src/components/DashboardCategoryRow.tsx` — FOUND
- `frontend/src/components/DashboardCategoryRow.module.css` — FOUND
- Commit `822eca1` — FOUND
- Commit `ee465d1` — FOUND
- TypeScript: EXIT 0 — PASSED
