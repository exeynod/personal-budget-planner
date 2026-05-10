---
phase: 25-home-transactions-add-sheet
plan: 2
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/src/screensV10/common/PosterRouter.tsx
  - frontend/src/screensV10/common/PosterRouter.module.css
  - frontend/src/screensV10/common/PosterSheet.tsx
  - frontend/src/screensV10/common/PosterSheet.module.css
  - frontend/src/screensV10/common/BottomNavV10.tsx
  - frontend/src/screensV10/common/BottomNavV10.module.css
  - frontend/src/screensV10/common/format.ts
  - frontend/src/screensV10/common/index.ts
  - frontend/src/screensV10/common/__tests__/format.test.ts
  - frontend/src/screensV10/common/__tests__/posterRouter.test.tsx
autonomous: true
requirements:
  - HOME-V10-05
  - TXN-V10-06
  - ADD-V10-01

must_haves:
  truths:
    - "usePosterRouter() returns {stack, push, pop, popToRoot} symmetric to iOS PosterRouter (lightweight useReducer-based stack of React nodes)."
    - "<PosterRouterView> renders top-of-stack with `posterSlideInFwd` / `posterSlideInBack` keyframe transitions."
    - "<PosterSheet> modal: backdrop opacity 0.45 + slide-up + drag-to-close (touch translation > 100px or velocity-based threshold)."
    - "<BottomNavV10> wraps existing <TabBar> exposing 5 tabs (home/savings/AI/mgmt + center FAB) and hides itself when isHidden prop is true."
    - "format.formatDay(date, today) returns «Сегодня»/«Вчера»/«N мая»; formatTimeHM returns «HH:MM»; formatPeriodEyebrow(date) returns «VOL.NN / MONTH YYYY · N ДНЕЙ»."
  artifacts:
    - path: "frontend/src/screensV10/common/PosterRouter.tsx"
      provides: "usePosterRouter hook + PosterRouterView component (web equivalent of iOS PosterRouter + PosterNavStack)"
      min_lines: 80
      exports: ["usePosterRouter", "PosterRouterProvider", "PosterRouterView", "type PosterStackEntry"]
    - path: "frontend/src/screensV10/common/PosterSheet.tsx"
      provides: "Web modal primitive symmetric to iOS PosterSheet"
      exports: ["PosterSheet"]
      min_lines: 60
    - path: "frontend/src/screensV10/common/BottomNavV10.tsx"
      provides: "5-tab bottom nav for V10 shell"
      exports: ["BottomNavV10"]
      min_lines: 30
    - path: "frontend/src/screensV10/common/format.ts"
      provides: "Day / time / period eyebrow formatters"
      exports: ["formatDay", "formatTimeHM", "formatPeriodEyebrow", "MONTHS_RU", "MONTHS_RU_GENITIVE"]
    - path: "frontend/src/screensV10/common/index.ts"
      provides: "Barrel re-export"
      exports: ["PosterRouter*", "PosterSheet", "BottomNavV10", "formatDay", "formatTimeHM", "formatPeriodEyebrow"]
  key_links:
    - from: "BottomNavV10"
      to: "componentsV10/TabBar"
      via: "<TabBar active dark onTab onFab />"
      pattern: "import.*TabBar"
    - from: "PosterRouter"
      to: "stylesV10/animations.css (posterSlideInFwd/Back keyframes from Phase 23)"
      via: "CSS class names on stack-entry wrappers"
      pattern: "poster-slide-in-fwd"
    - from: "PosterSheet"
      to: "useEffect — body scroll lock while open + escape key handler"
      via: "document event listeners"
      pattern: "addEventListener.*keydown"
---

<objective>
Build web routing + sheet + bottom nav primitives required by all Phase 25 UI plans (Home, Transactions, AddSheet). Symmetric to iOS `PosterRouter` / `PosterNavStack` / `PosterSheet` so paired plans (web ║ iOS) stay 1:1 in API shape.

Purpose: unblock all downstream Phase 25 web UI plans. Without these primitives Home cannot push Transactions, AddSheet cannot mount as a modal, and BottomNavV10 cannot replace v0.6 shell.
Output: 5 new files in `frontend/src/screensV10/common/` + barrel + format helpers + 2 unit-test files.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/25-home-transactions-add-sheet/25-CONTEXT.md
@.planning/phases/23-design-system-foundation/23-04-web-animations-SUMMARY.md
@.planning/phases/23-design-system-foundation/23-05-web-components-SUMMARY.md
@frontend/src/componentsV10/TabBar.tsx
@frontend/src/componentsV10/TabBar.module.css
@frontend/src/componentsV10/FAB.tsx
@frontend/src/stylesV10/animations.css
@ios/BudgetPlanner/FeaturesV10/Common/PosterRouter.swift
@ios/BudgetPlanner/FeaturesV10/Common/PosterSheet.swift

<interfaces>
<!-- iOS PosterRouter contract — web hook MUST mirror this shape. -->

iOS PosterRouter (target API to mirror in web):
```swift
@Observable final class PosterRouter {
    private(set) var stack: [PosterNavEntry]              // current stack
    private(set) var direction: PosterNavDirection        // .forward | .backward
    init(root: some View)
    func push(_ view: some View)
    func pop()
    func popToRoot()
    var canPop: Bool { stack.count > 1 }
}
```

Existing TabBar (componentsV10) — wrap don't replace:
```typescript
export type TabId = 'home' | 'savings' | 'ai' | 'mgmt';
export interface TabBarProps {
  active: TabId;
  dark?: boolean;        // dark=true → black bg + paper text + yellow active
  onTab: (id: TabId) => void;
  onFab: () => void;
}
```

Existing animations.css (Phase 23-04) — class names available:
- `.poster-slide-in-fwd` (translateX 28px → 0, 0.42s cubic-bezier(0.22,0.61,0.36,1))
- `.poster-slide-in-back` (translateX -28px → 0)
- `.poster-toast-in`, `.poster-row-in`, etc.
</interfaces>
</context>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser keyboard input → PosterSheet | Escape key closes sheet — must not interfere with parent shortcut handlers |
| touch/drag events → PosterSheet | drag-to-close threshold; must not fire while user is scrolling sheet content |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-25-02-01 | Tampering | router.push pushing arbitrary node graphs | accept | Stack stores ReactNode references — caller controls what's rendered; no XSS risk because all content is JSX (React escapes by default). |
| T-25-02-02 | Denial of Service | unbounded stack growth (push without pop) | mitigate | Hard cap `MAX_STACK = 16`; push beyond cap pops the oldest (queue-like). Cap covers normal nav (Home → Tx → CatDet → AcctDet → ...). |
| T-25-02-03 | Information Disclosure | Body scroll lock leaking content beneath sheet | accept | Standard pattern — set `document.body.style.overflow = 'hidden'` while sheet open; restore on close. |
</threat_model>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: format.ts helpers + tests</name>
  <files>frontend/src/screensV10/common/format.ts, frontend/src/screensV10/common/__tests__/format.test.ts</files>
  <behavior>
    - formatDay(2026-05-09, today=2026-05-09) === 'Сегодня'
    - formatDay(2026-05-08, today=2026-05-09) === 'Вчера'
    - formatDay(2026-05-07, today=2026-05-09) === '7 мая'
    - formatDay(2025-12-31, today=2026-05-09) === '31 декабря'
    - formatTimeHM(date with 14:32) === '14:32' (zero-padded)
    - formatPeriodEyebrow(2026-05-09) === 'VOL.05 / MAY 2026 · N ДНЕЙ' where N = days remaining in May 2026 from given date inclusive (today is one of the days_left).
    - period_number = (year - 2025) * 12 + month → май 2026 = (2026-2025)*12 + 5 = 17 → 'VOL.17' (use this exact formula per CONTEXT D-Home).
    - **Wait — re-check CONTEXT**: CONTEXT.md says «period_number = (year - 2025) * 12 + month». This produces VOL.17 for May 2026, NOT VOL.05. Verify by reading CONTEXT.md and use the canonical formula.
    - formatPeriodEyebrow uses zero-padded NN: VOL.17 (not VOL.5 / VOL.005).
    - daysLeft for 2026-05-09 in May: end-of-month is 2026-05-31 → 31-9 = 22 days remaining; pluralisation: «1 ДЕНЬ» / «2 ДНЯ» / «5 ДНЕЙ» (rules ru-RU).
  </behavior>
  <action>
    1. Create `frontend/src/screensV10/common/format.ts`:
       - `MONTHS_RU` array (nominative, UPPERCASE for eyebrow): `['ЯНВ','ФЕВ','МАР','АПР','МАЙ','ИЮН','ИЮЛ','АВГ','СЕН','ОКТ','НОЯ','ДЕК']`. **HOWEVER** prototype uses English MONTH («MAY 2026») — match prototype: `MONTHS_EN = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']`. Use the **English** form per prototype/index.html line 215 «VOL.04 / MAY 2026».
       - `MONTHS_RU_GENITIVE` array for day grouping: `['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря']`.
       - `formatDay(d: Date, today: Date): string`:
         - Compare `d.getFullYear/Month/Date` to `today.*` → 'Сегодня' if same.
         - Subtract 1 day from today; same → 'Вчера'.
         - Else: `${d.getDate()} ${MONTHS_RU_GENITIVE[d.getMonth()]}`.
       - `formatTimeHM(d: Date): string`: `${pad(d.getHours())}:${pad(d.getMinutes())}` where pad uses `String(n).padStart(2,'0')`.
       - `pluralDays(n: number): 'ДЕНЬ'|'ДНЯ'|'ДНЕЙ'`: same Slavic rules as existing `pluralAccounts` in `screensV10/Onboarding/format.ts` — copy the algorithm (mod10 ===1 && mod100 !==11 → 'ДЕНЬ' etc.).
       - `formatPeriodEyebrow(d: Date): string`:
         - `vol = (d.getFullYear() - 2025) * 12 + (d.getMonth()+1)` zero-padded to 2 digits.
         - `month = MONTHS_EN[d.getMonth()]`.
         - `year = d.getFullYear()`.
         - `lastDay = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate()`.
         - `daysLeft = lastDay - d.getDate() + 1` (today counts).
         - Return `\`VOL.${vol} / ${month} ${year} · ${daysLeft} ${pluralDays(daysLeft)}\``.

    2. Create `frontend/src/screensV10/common/__tests__/format.test.ts` covering each behavior bullet above using vitest patterns from existing `screensV10/Onboarding/__tests__/`.
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner/frontend && npm test -- screensV10/common/__tests__/format.test.ts --run 2>&1 | tail -15</automated>
  </verify>
  <done>All format functions exported; tests assert each behavior bullet; pluralDays returns correct ru-RU forms for 1/2/5/11/12/21/22/25.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: PosterRouter + PosterRouterView + tests</name>
  <files>frontend/src/screensV10/common/PosterRouter.tsx, frontend/src/screensV10/common/PosterRouter.module.css, frontend/src/screensV10/common/__tests__/posterRouter.test.tsx</files>
  <behavior>
    - usePosterRouter(initial: ReactNode) returns `{stack, direction, push, pop, popToRoot, canPop}` matching iOS contract.
    - push(node) appends to stack; direction becomes 'forward'.
    - pop() removes top entry; direction becomes 'backward'; no-op when stack.length === 1.
    - popToRoot() truncates to root entry; direction = 'backward'; no-op if already at root.
    - Stack cap MAX_STACK=16 enforced (push beyond shifts oldest out, no console.warn — silent — covered by test).
    - PosterRouterView renders ONLY the top-of-stack entry inside a `<div className={posterSlideInFwd|posterSlideInBack}>` wrapper to trigger the keyframe on each push/pop.
    - useReducer-based: state = `{stack, direction}`; actions = PUSH | POP | POP_TO_ROOT.
  </behavior>
  <action>
    1. Create `frontend/src/screensV10/common/PosterRouter.tsx`:
       ```typescript
       import { createContext, useCallback, useContext, useMemo, useReducer, type ReactNode } from 'react';
       import styles from './PosterRouter.module.css';

       export interface PosterStackEntry { id: number; node: ReactNode; }

       type Action =
         | { type: 'PUSH'; node: ReactNode }
         | { type: 'POP' }
         | { type: 'POP_TO_ROOT' };

       interface State { stack: PosterStackEntry[]; direction: 'forward' | 'backward'; nextId: number; }
       const MAX_STACK = 16;

       function reducer(s: State, a: Action): State { /* push/pop/popToRoot impl */ }

       export interface PosterRouterAPI {
         stack: PosterStackEntry[];
         direction: 'forward' | 'backward';
         push: (node: ReactNode) => void;
         pop: () => void;
         popToRoot: () => void;
         canPop: boolean;
       }

       const RouterCtx = createContext<PosterRouterAPI | null>(null);

       export function PosterRouterProvider({ root, children }: { root: ReactNode; children?: ReactNode }) {
         const [state, dispatch] = useReducer(reducer, { stack: [{id:0, node: root}], direction: 'forward', nextId: 1 });
         const api = useMemo<PosterRouterAPI>(() => ({
           stack: state.stack,
           direction: state.direction,
           push: (node) => dispatch({type:'PUSH', node}),
           pop: () => dispatch({type:'POP'}),
           popToRoot: () => dispatch({type:'POP_TO_ROOT'}),
           canPop: state.stack.length > 1,
         }), [state]);
         return <RouterCtx.Provider value={api}>{children ?? <PosterRouterView />}</RouterCtx.Provider>;
       }

       export function usePosterRouter(): PosterRouterAPI { /* throw if no provider */ }

       export function PosterRouterView() {
         const { stack, direction } = usePosterRouter();
         const top = stack[stack.length - 1];
         const animClass = direction === 'forward' ? 'poster-slide-in-fwd' : 'poster-slide-in-back';
         // key={top.id} to retrigger animation on push/pop.
         return <div key={top.id} className={`${styles.viewWrap} ${animClass}`}>{top.node}</div>;
       }
       ```

    2. Create `frontend/src/screensV10/common/PosterRouter.module.css`:
       - `.viewWrap`: `position: absolute; inset: 0; will-change: transform, opacity;` — covers parent box.

    3. Tests `__tests__/posterRouter.test.tsx`:
       - Render PosterRouterProvider with root `<div data-testid="root">root</div>`. Use `useImperativeHandle` via test consumer button to call `push(<div data-testid="b">b</div>)`. Assert `[data-testid="b"]` visible, `[data-testid="root"]` NOT in DOM (only top).
       - After 17 push calls (cap test) — assert `stack.length === 16`.
       - After push then pop — root visible again.
       - canPop true after push, false after popToRoot.
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner/frontend && npm test -- screensV10/common/__tests__/posterRouter.test.tsx --run 2>&1 | tail -15</automated>
  </verify>
  <done>Router exports work; tests cover push/pop/popToRoot/cap/canPop; type-checks clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: PosterSheet (web) + BottomNavV10 + barrel</name>
  <files>frontend/src/screensV10/common/PosterSheet.tsx, frontend/src/screensV10/common/PosterSheet.module.css, frontend/src/screensV10/common/BottomNavV10.tsx, frontend/src/screensV10/common/BottomNavV10.module.css, frontend/src/screensV10/common/index.ts</files>
  <behavior>
    PosterSheet:
    - PosterSheet({ isOpen, onClose, children }) renders backdrop opacity 0.45 + slide-up panel anchored bottom.
    - When isOpen=false, returns null (no portal/no DOM).
    - Backdrop tap (mousedown / touchend on backdrop, NOT on sheet body) → calls onClose.
    - Escape key while open → calls onClose.
    - Body scroll locked while open (`document.body.style.overflow = 'hidden'`); restored on close (no leak after unmount).
    - Drag handle: pointer-down on `.handle` + drag down — if translation > 100px or velocity > 800px/s on release, calls onClose; else snaps back to 0.

    BottomNavV10:
    - BottomNavV10({active, onTab, onFab, isHidden, dark}) wraps existing `<TabBar>`; when isHidden=true returns null.
    - dark prop default false (Home / coral) — passes through to TabBar dark prop.
  </behavior>
  <action>
    1. Create `frontend/src/screensV10/common/PosterSheet.tsx`:
       - Render via React portal `createPortal` to `document.body`.
       - State: `dragOffset`, `isDragging` (refs for pointer events).
       - Effects: body scroll lock on open, escape listener.
       - Apply `transform: translateY(${dragOffset}px)` on sheet body.
       - Use `.poster-toast-in` keyframe class? No — toast-in is for top toasts. Use new keyframe `posterSheetIn` defined inline via CSS module: `@keyframes sheetIn { from { transform: translateY(100%); } to { transform: translateY(0); } }` 0.35s cubic-bezier(0.32, 0.72, 0, 1).
       - `data-testid="poster-sheet"` on backdrop for Playwright.

    2. Create `frontend/src/screensV10/common/PosterSheet.module.css`:
       - `.backdrop`: fixed inset-0, background rgba(0,0,0,0.45), z-index 1000, animation fadein 0.2s.
       - `.sheet`: fixed bottom-0 left-0 right-0, max-height 90vh, background var(--paper) (or component-controlled background), animation sheetIn.
       - `.handle`: width 40px, height 4px, background rgba, margin auto, rounded 2px, padding for hit-area.
       - Keyframe `@keyframes sheetIn` slide-up.
       - Keyframe `@keyframes fadein`.

    3. Create `frontend/src/screensV10/common/BottomNavV10.tsx`:
       ```typescript
       import { TabBar, type TabId } from '../../componentsV10';
       export interface BottomNavV10Props {
         active: TabId;
         onTab: (id: TabId) => void;
         onFab: () => void;
         isHidden?: boolean;
         dark?: boolean;
       }
       export function BottomNavV10({ active, onTab, onFab, isHidden = false, dark = false }: BottomNavV10Props) {
         if (isHidden) return null;
         return <TabBar active={active} onTab={onTab} onFab={onFab} dark={dark} />;
       }
       ```
       — minimal wrapper; main job is the `isHidden` flag.

    4. Create `frontend/src/screensV10/common/BottomNavV10.module.css` (empty stub — TabBar already has its own CSS module; included for consistency / future overrides).

    5. Create `frontend/src/screensV10/common/index.ts` barrel:
       ```typescript
       export { PosterRouterProvider, PosterRouterView, usePosterRouter, type PosterRouterAPI, type PosterStackEntry } from './PosterRouter';
       export { PosterSheet, type PosterSheetProps } from './PosterSheet';
       export { BottomNavV10, type BottomNavV10Props } from './BottomNavV10';
       export { formatDay, formatTimeHM, formatPeriodEyebrow, pluralDays, MONTHS_EN, MONTHS_RU_GENITIVE } from './format';
       ```

    6. **No PosterSheet test in this plan** — Playwright in Plan 25-09 covers the integration assertion (sheet opens, escape closes, drag-to-close fires onClose). Pure unit-test of pointer events is brittle in jsdom; defer.
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner/frontend && npx tsc --noEmit 2>&1 | tail -5 && npm test -- screensV10/common --run 2>&1 | tail -10</automated>
  </verify>
  <done>PosterSheet, BottomNavV10, barrel files compile; tsc strict passes; format + router tests still green.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` clean (strict mode, all files type-check).
2. `npm test -- screensV10/common --run` → format.test.ts + posterRouter.test.tsx pass.
3. `grep -c "export.*PosterRouterProvider\|export.*PosterSheet\|export.*BottomNavV10\|export.*formatDay" frontend/src/screensV10/common/index.ts` ≥ 4.
4. `vite build` succeeds (no broken imports).
</verification>

<success_criteria>
- usePosterRouter / PosterRouterView render top-of-stack with forward/back animation classes.
- PosterSheet shows backdrop + slide-up + drag-to-close + escape key + body scroll lock.
- BottomNavV10 wraps TabBar with isHidden gate (used by AddSheet to hide nav while open).
- formatDay / formatTimeHM / formatPeriodEyebrow produce correct strings; tested.
- Symmetric to iOS contracts (`PosterRouter.push`, `PosterSheet`, `BottomNavV10`).
</success_criteria>

<output>
After completion, create `.planning/phases/25-home-transactions-add-sheet/25-02-web-routing-bottomnav-SUMMARY.md` listing exports + key types + any deviations from iOS contract.
</output>
