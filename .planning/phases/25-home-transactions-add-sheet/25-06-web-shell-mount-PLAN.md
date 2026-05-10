---
phase: 25-home-transactions-add-sheet
plan: 6
type: execute
wave: 1
depends_on: [2, 3, 4]
files_modified:
  - frontend/src/AppV10.tsx
  - frontend/src/screensV10/V10MainShell.tsx
  - frontend/src/screensV10/V10MainShell.module.css
  - frontend/src/screensV10/Onboarding/OnboardingMount.tsx
  - frontend/src/screensV10/__tests__/V10MainShell.test.tsx
autonomous: true
gap_closure: true
requirements:
  - HOME-V10-01
  - HOME-V10-02
  - HOME-V10-03
  - HOME-V10-04
  - HOME-V10-05
  - HOME-V10-06
  - TXN-V10-06
  - ADD-V10-01

must_haves:
  truths:
    - "AppV10 renders V10MainShell at root (after surface !== 'preview' branch); OnboardingMount lives inside V10MainShell so the same shell hosts both onboarding and Home."
    - "V10MainShell renders PosterRouterProvider with HomeMount as root once `me.onboarded_at != null`; OnboardingMount handles the `onboarded_at == null` branch."
    - "BottomNavV10 (4 tabs + center FAB: Home / Savings / FAB / AI / Mgmt) is mounted at V10MainShell level — visible on every push-stack screen."
    - "FAB tap → AddSheet opens via state binding (placeholder PosterSheet content for now — real AddSheet ships in Plan 25-10); BottomNavV10.isHidden=true while Add Sheet open."
    - "v0.6 Transactions tab is absent from BottomNavV10 (TXN-V10-06: 4-tab+FAB layout, NOT 5-tab). Reachable only via push-stack from Home → ВСЕ ОПЕРАЦИИ →."
    - "HomePlaceholder in OnboardingMount is REPLACED by import { HomeMount } from '../Home'; existing onboarding-completion refetch flow continues to work."
  artifacts:
    - path: "frontend/src/screensV10/V10MainShell.tsx"
      provides: "V10 root shell — PosterRouterProvider(root=HomeMount) + BottomNavV10 + FAB-controlled AddSheet PosterSheet binding"
      min_lines: 80
      exports: ["V10MainShell"]
    - path: "frontend/src/AppV10.tsx"
      provides: "Top-level switch — renders <V10MainShell /> for surface='mount' (was rendering OnboardingMount directly)"
      contains: "V10MainShell"
    - path: "frontend/src/screensV10/Onboarding/OnboardingMount.tsx"
      provides: "Same gateway — `onboarded_at != null` path now returns <HomeMount />; HomePlaceholder export kept for back-compat or removed"
      contains: "HomeMount"
  key_links:
    - from: "frontend/src/AppV10.tsx"
      to: "<V10MainShell>"
      via: "import + JSX render"
      pattern: "import.*V10MainShell.*from.*screensV10/V10MainShell"
    - from: "frontend/src/screensV10/V10MainShell.tsx"
      to: "PosterRouterProvider + HomeMount + BottomNavV10 + PosterSheet"
      via: "JSX composition"
      pattern: "PosterRouterProvider.*HomeMount|BottomNavV10|PosterSheet"
    - from: "frontend/src/screensV10/Onboarding/OnboardingMount.tsx"
      to: "<HomeMount />"
      via: "import from ../Home"
      pattern: "from\\s+'\\.\\./Home'"
---

<objective>
Wire all Wave-1/Wave-2/Wave-3 web primitives (HomeMount + PosterRouterProvider + BottomNavV10 + PosterSheet) into a single mounted shell so Home actually appears on screen after onboarding completes. Today HomeMount is built but unreferenced — `AppV10 → OnboardingMount → HomePlaceholder` still renders a stub. This plan replaces that path end-to-end.

Purpose: close HOME-V10-01..06 (built-but-not-mounted) and ADD-V10-01 («FAB visible on every screen») and TXN-V10-06 (bottom nav has no Transactions tab).
Output: `V10MainShell.tsx` (new, owns PosterRouter + BottomNav + sheet stack), `AppV10.tsx` (modified — renders V10MainShell instead of OnboardingMount directly), `OnboardingMount.tsx` (modified — `onboarded_at != null` branch returns `<HomeMount />` instead of HomePlaceholder), 1 component test.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/25-home-transactions-add-sheet/25-CONTEXT.md
@.planning/phases/25-home-transactions-add-sheet/25-must-haves.md
@.planning/phases/25-home-transactions-add-sheet/25-02-web-routing-bottomnav-SUMMARY.md
@.planning/phases/25-home-transactions-add-sheet/25-04-web-home-view-SUMMARY.md
@frontend/src/AppV10.tsx
@frontend/src/screensV10/Onboarding/OnboardingMount.tsx
@frontend/src/screensV10/Home/HomeMount.tsx
@frontend/src/screensV10/Home/index.ts
@frontend/src/screensV10/common/index.ts
@frontend/src/componentsV10/TabBar.tsx

<interfaces>
<!-- Already-built primitives the executor wires together. Don't re-design. -->

From frontend/src/screensV10/common/index.ts (Plan 25-02):
```typescript
export {
  PosterRouterProvider,
  PosterRouterView,
  usePosterRouter,
  type PosterRouterAPI,
  type PosterStackEntry,
} from './PosterRouter';

export { PosterSheet, type PosterSheetProps } from './PosterSheet';
// PosterSheet props: { isOpen: boolean; onClose: () => void; children: ReactNode; backgroundColor?: string }

export { BottomNavV10, type BottomNavV10Props } from './BottomNavV10';
// BottomNavV10 props: { active: TabId; onTab: (id: TabId) => void; onFab: () => void; isHidden?: boolean; dark?: boolean }
// TabId = 'home' | 'savings' | 'ai' | 'mgmt'
```

From frontend/src/screensV10/Home/index.ts (Plan 25-04):
```typescript
export { HomeMount } from './HomeMount';
// HomeMount is self-contained: uses usePosterRouter() inside, fetches accounts/categories/period/actuals,
// pushes TransactionsViewPlaceholder / AccountsListPlaceholder / PlanViewPlaceholder / CategoryDetailPlaceholder.
```

Existing AppV10 structure (DO NOT BREAK preview branch):
```typescript
const surface = useMemo<'preview' | 'mount'>(() => {
  if (typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('preview') === '1') return 'preview';
  return 'mount';
}, []);
if (surface === 'preview') return <PreviewApp />;
return <OnboardingMount />;  // <-- this becomes <V10MainShell />
```

Existing OnboardingMount.onboarded branch:
```typescript
return <HomePlaceholder />;  // <-- this becomes <HomeMount />
```
</interfaces>
</context>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| OnboardingMount → V10MainShell | trust transition after server flips onboarded_at; refetch is single source of truth |
| BottomNavV10 tab events → router | local dispatch; placeholder pushes for non-Home tabs |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-25-06-01 | Tampering | Race between OnboardingMount.refetch and V10MainShell mount | mitigate | OnboardingMount keeps owning the /me fetch + refetch; V10MainShell ONLY conditionally renders HomeMount when `me.onboarded_at != null` (or hosts OnboardingMount when null). Single source of truth preserved. |
| T-25-06-02 | Denial of Service | Multiple PosterSheet stack growth from FAB spam | mitigate | AddSheet placeholder is bound to single boolean `isAddSheetOpen`; subsequent FAB taps while open are no-ops. PosterSheet itself enforces single-instance modal. |
| T-25-06-03 | Information Disclosure | Preview surface leaking V10 mount state | accept | Preview branch returns BEFORE V10MainShell mount — physically separated paths. |
</threat_model>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create V10MainShell composing PosterRouter + BottomNavV10 + AddSheet placeholder</name>
  <files>frontend/src/screensV10/V10MainShell.tsx, frontend/src/screensV10/V10MainShell.module.css, frontend/src/screensV10/__tests__/V10MainShell.test.tsx</files>
  <read_first>
    - frontend/src/screensV10/common/index.ts (verify exports of PosterRouterProvider, BottomNavV10, PosterSheet)
    - frontend/src/screensV10/common/PosterRouter.tsx (understand PosterRouterProvider signature: `{ root: ReactNode; children?: ReactNode }`)
    - frontend/src/screensV10/common/BottomNavV10.tsx (props: `{ active, onTab, onFab, isHidden, dark }`; TabId = home|savings|ai|mgmt)
    - frontend/src/screensV10/common/PosterSheet.tsx (props: `{ isOpen, onClose, children, backgroundColor? }`)
    - frontend/src/screensV10/Home/HomeMount.tsx (verify it self-contains usePosterRouter + fetch + push routes)
    - frontend/src/screensV10/_placeholders.tsx (PlaceholderShell pattern to mirror for AddSheet temporary content)
    - frontend/src/AppV10.module.css (existing shell layout for reference)
  </read_first>
  <behavior>
    - V10MainShell with no props.
    - State: `[active, setActive] = useState<TabId>('home')`, `[isAddSheetOpen, setAddSheet] = useState(false)`.
    - Layout (CSS module):
      - Root wrapper `position: relative; width: 100vw; height: 100vh; overflow: hidden;`.
      - Content area `position: absolute; inset: 0 0 90px 0;` (90px reserved for BottomNavV10 height + safe-area).
      - PosterRouterProvider wraps `<HomeMount />` as root inside content area.
      - BottomNavV10 absolute-positioned bottom; passes `active`, `onTab=(id) => setActive(id)`, `onFab=() => setAddSheet(true)`, `isHidden={isAddSheetOpen}`, `dark={false}` (Home is coral; nav uses paper variant).
      - PosterSheet `isOpen={isAddSheetOpen}` `onClose={() => setAddSheet(false)}` `backgroundColor='#0E0E0E'` — content = temporary AddSheetPlaceholder (Eyebrow «NEW ENTRY · WIP» + Mass «Plan 25-10 wires the real AddSheet» + Close button).
      - When non-Home tab is tapped (savings/ai/mgmt), push the corresponding `_placeholders` view via `usePosterRouter().push(...)` from inside a wrapper component (BottomNavV10 doesn't have access to the router — solve by either putting BottomNavV10 INSIDE PosterRouterProvider as a child consumer, or by lifting the push handler via context).
        Implementation note: pass `onTab` from inside a child of PosterRouterProvider; recommended structure:
        ```tsx
        <PosterRouterProvider root={<HomeMount />}>
          <ShellChrome
            active={active}
            onTab={setActive}
            onFab={() => setAddSheet(true)}
            isAddSheetOpen={isAddSheetOpen}
          />
        </PosterRouterProvider>
        ```
        where ShellChrome reads `usePosterRouter()`, renders `PosterRouterView`, BottomNavV10 (with onTab that pushes placeholder if id !== 'home'), and the PosterSheet.
    - Tests (jsdom, vitest):
      - Renders without throwing; `[data-testid="v10-shell"]` in DOM.
      - BottomNavV10 visible by default (not hidden); has `active='home'` initially.
      - Clicking FAB → AddSheet opens (`[data-testid="poster-sheet"]` visible) AND BottomNavV10 hidden.
      - Closing AddSheet (Escape or backdrop click) → BottomNavV10 visible again.
      - Tap on Savings tab → router pushes SavingsPlaceholder; PosterRouter top entry changes (assert WIP placeholder text appears).
  </behavior>
  <action>
    Per D-Add (CONTEXT.md), FAB hidden inside AddSheet via sheet stack management. The shell binding is the single source of truth for that gate.

    1. Create `frontend/src/screensV10/V10MainShell.tsx`:
       ```tsx
       import { useState, type ReactNode } from 'react';
       import {
         PosterRouterProvider,
         PosterRouterView,
         BottomNavV10,
         PosterSheet,
         usePosterRouter,
       } from './common';
       import type { TabId } from '../componentsV10/TabBar';
       import { HomeMount } from './Home';
       import {
         AccountsListPlaceholder,           // reuse existing _placeholders for now
         PlanViewPlaceholder,
         TransactionsViewPlaceholder,       // for stub Mgmt push if needed
       } from './_placeholders';
       import { Eyebrow, Mass } from '../componentsV10';
       import styles from './V10MainShell.module.css';

       /** Temporary AddSheet content — real Plan 25-10 replaces this. */
       function AddSheetPlaceholderContent({ onClose }: { onClose: () => void }) {
         return (
           <div className={styles.sheetPlaceholder}>
             <Eyebrow>NEW ENTRY · WIP</Eyebrow>
             <Mass italic size={36} style={{ color: 'var(--poster-paper)' }}>
               AddSheet —
             </Mass>
             <p className={styles.sheetHint}>WIP — Real AddSheet ships in Plan 25-10.</p>
             <button type="button" className={styles.closeBtn} onClick={onClose}>
               × ЗАКРЫТЬ
             </button>
           </div>
         );
       }

       /** Inner chrome consumes the router from context (must live inside Provider). */
       function ShellChrome({
         active, onTab, onFab, isAddSheetOpen,
       }: {
         active: TabId;
         onTab: (id: TabId) => void;
         onFab: () => void;
         isAddSheetOpen: boolean;
       }) {
         const router = usePosterRouter();

         const handleTab = (id: TabId) => {
           onTab(id);
           // Per CONTEXT D-Defer (5-tab nav with WIP placeholders for non-Home),
           // tapping Savings/AI/Mgmt pushes a WIP poster screen via PosterRouter.
           if (id === 'home') {
             router.popToRoot();
           } else if (id === 'savings') {
             router.push(<AccountsListPlaceholder />);   // re-use until Phase 27 lands real Savings
           } else if (id === 'ai' || id === 'mgmt') {
             router.push(<PlanViewPlaceholder />);       // re-use until Phase 27 lands real AI/Mgmt
           }
         };

         return (
           <div className={styles.shellRoot} data-testid="v10-shell">
             <div className={styles.content}>
               <PosterRouterView />
             </div>
             <div className={styles.navWrap}>
               <BottomNavV10
                 active={active}
                 onTab={handleTab}
                 onFab={onFab}
                 isHidden={isAddSheetOpen}
                 dark={false}
               />
             </div>
           </div>
         );
       }

       export function V10MainShell() {
         const [active, setActive] = useState<TabId>('home');
         const [isAddSheetOpen, setAddSheet] = useState(false);

         return (
           <>
             <PosterRouterProvider root={<HomeMount />}>
               <ShellChrome
                 active={active}
                 onTab={setActive}
                 onFab={() => setAddSheet(true)}
                 isAddSheetOpen={isAddSheetOpen}
               />
             </PosterRouterProvider>
             <PosterSheet
               isOpen={isAddSheetOpen}
               onClose={() => setAddSheet(false)}
               backgroundColor="#0E0E0E"
             >
               <AddSheetPlaceholderContent onClose={() => setAddSheet(false)} />
             </PosterSheet>
           </>
         );
       }
       ```

    2. Create `frontend/src/screensV10/V10MainShell.module.css`:
       - `.shellRoot { position: relative; width: 100vw; height: 100vh; overflow: hidden; }`
       - `.content { position: absolute; inset: 0 0 90px 0; overflow: hidden; }`
       - `.navWrap { position: absolute; left: 0; right: 0; bottom: 0; }`
       - `.sheetPlaceholder { padding: 56px 22px; color: var(--poster-paper); }`
       - `.sheetHint { font-family: var(--poster-font-jet-brains-mono), ui-monospace, monospace; font-size: 11px; opacity: 0.6; margin-top: 14px; }`
       - `.closeBtn { margin-top: 32px; background: var(--poster-yellow); color: var(--poster-ink); border: none; padding: 14px 22px; font-family: var(--poster-font-archivo-black); letter-spacing: 0.18em; cursor: pointer; }`

    3. Create `frontend/src/screensV10/__tests__/V10MainShell.test.tsx`:
       - Mock `HomeMount` to a simple `<div data-testid="home-mount-stub">HOME</div>` (mock the Home barrel via `vi.mock('../Home', () => ({ HomeMount: () => <div data-testid="home-mount-stub">HOME</div> }))`).
       - Mock `getMeV10` and `getCurrentPeriod` to never be called (HomeMount is stubbed).
       - Tests:
         - "renders V10 shell with home mount stub" — assert `[data-testid="v10-shell"]`, `[data-testid="home-mount-stub"]`.
         - "BottomNavV10 visible by default" — assert TabBar buttons (use role='button' + name 'ГЛАВНАЯ'/'КОПИЛКА'/'AI'/'УПР.').
         - "FAB tap opens AddSheet and hides BottomNav" — find FAB button (the `+`), click, assert PosterSheet portal contains «WIP — Real AddSheet ships in Plan 25-10», assert BottomNavV10 root no longer in DOM (or `aria-hidden=true`).
         - "Escape key closes AddSheet" — fireEvent.keyDown(document, {key:'Escape'}); assert sheet gone, BottomNav visible.
         - "Tab to Savings pushes WIP placeholder" — click Savings button, assert «WIP — Accounts list (Phase 27)» text visible.
         - "5-tab layout (NO Transactions tab)" — assert button labels do NOT contain «Транзакции»/«Реестр»/«Transactions»; assert exactly 4 tab buttons + 1 FAB button (TXN-V10-06 acceptance).

    Use `afterEach(cleanup)` per Plan 25-02 SUMMARY note (no global auto-cleanup in vitest setup).
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner/frontend && npm test -- screensV10/__tests__/V10MainShell.test.tsx --run 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - File `frontend/src/screensV10/V10MainShell.tsx` exists; exports `V10MainShell`.
    - `grep -c "PosterRouterProvider\|BottomNavV10\|PosterSheet\|HomeMount" frontend/src/screensV10/V10MainShell.tsx` ≥ 4.
    - All component tests pass.
    - `grep -c "Транзакции\|Transactions\|Реестр" frontend/src/screensV10/V10MainShell.tsx` == 0 (no v0.6 tab references; TXN-V10-06).
  </acceptance_criteria>
  <done>V10MainShell renders HomeMount inside PosterRouter; BottomNavV10 is mounted; FAB binding works; AddSheet placeholder + close work; tests pass.</done>
</task>

<task type="auto">
  <name>Task 2: Wire V10MainShell into AppV10 + replace HomePlaceholder in OnboardingMount</name>
  <files>frontend/src/AppV10.tsx, frontend/src/screensV10/Onboarding/OnboardingMount.tsx</files>
  <read_first>
    - frontend/src/AppV10.tsx (current `surface !== 'preview'` branch returns `<OnboardingMount />`)
    - frontend/src/screensV10/Onboarding/OnboardingMount.tsx (lines 44-55 export `HomePlaceholder`; line 117 returns `<HomePlaceholder />` for onboarded users)
    - frontend/src/screensV10/Home/index.ts (verify `export { HomeMount }` is the public export)
    - frontend/src/screensV10/V10MainShell.tsx (created in Task 1; export `V10MainShell`)
  </read_first>
  <action>
    1. Modify `frontend/src/AppV10.tsx`:
       - Replace `import { OnboardingMount } from './screensV10/Onboarding/OnboardingMount';` with `import { V10MainShell } from './screensV10/V10MainShell';`.
       - Replace the `return <OnboardingMount />` at end with `return <V10MainShell />`.
       - Wrap remains in `<div className={styles.shellRoot} data-theme="v10">`.
       - Per D-Defer (CONTEXT) — preserve `?preview=1` branch UNCHANGED.

    2. Modify `frontend/src/screensV10/Onboarding/OnboardingMount.tsx`:
       - Replace the `HomePlaceholder` rendered for onboarded users with `<HomeMount />`.
       - Add `import { HomeMount } from '../Home';` at the top.
       - Keep the existing `HomePlaceholder` export (it can remain dead — other tests may reference it OR remove it if no other test imports it; grep first: `grep -rn "HomePlaceholder" frontend/src --include='*.tsx' --include='*.ts'`).
       - Update file header comment to note: "Phase 25-06: HomePlaceholder replaced by HomeMount; gateway logic unchanged."
       - **Important**: OnboardingMount is now itself USED INSIDE V10MainShell — wait, no. The architecture is:
         - `AppV10` → `<V10MainShell />` (always, post-onboarding decision lives here).
         - But OnboardingMount STILL renders the gateway UI (loading, error, OnboardingFlow vs HomeMount switch).
         - **So V10MainShell needs to host BOTH onboarding and Home.** The cleanest structure:
           - `V10MainShell` renders `OnboardingMount` (which internally fetches /me).
           - When `me.onboarded_at == null` → OnboardingMount renders OnboardingFlow inline (BottomNav hidden / shell chrome suppressed).
           - When `me.onboarded_at != null` → OnboardingMount renders HomeMount (which now lives inside V10MainShell's PosterRouter context).
         - **Problem**: HomeMount needs `usePosterRouter` (provided by V10MainShell), so when it's rendered inside OnboardingMount, OnboardingMount must itself be inside V10MainShell's PosterRouterProvider.

       **Resolution — clean architecture:**

       AppV10:
       ```tsx
       return (
         <div className={styles.shellRoot} data-theme="v10">
           <V10MainShell />
         </div>
       );
       ```

       V10MainShell:
       ```tsx
       export function V10MainShell() {
         const [active, setActive] = useState<TabId>('home');
         const [isAddSheetOpen, setAddSheet] = useState(false);
         return (
           <>
             <PosterRouterProvider root={<OnboardingMount />}>
               <ShellChrome
                 active={active}
                 onTab={setActive}
                 onFab={() => setAddSheet(true)}
                 isAddSheetOpen={isAddSheetOpen}
               />
             </PosterRouterProvider>
             <PosterSheet ...>
               <AddSheetPlaceholderContent ... />
             </PosterSheet>
           </>
         );
       }
       ```

       OnboardingMount: (already has loading/error/OnboardingFlow/HomePlaceholder branches) — replace `<HomePlaceholder />` with `<HomeMount />`. OnboardingMount renders inside V10MainShell's PosterRouterProvider, so HomeMount can use usePosterRouter.

       **Edge case — BottomNav during onboarding:** The CONTEXT says BottomNavV10 mounts at root level; but during onboarding (4 steps) the bottom nav should be HIDDEN. Add a second hide signal: `OnboardingMount` exposes `isOnboarding` via a context OR via a callback. **Simplest fix:** treat onboarding as another sheet — when `me.onboarded_at == null`, treat similarly to `isAddSheetOpen=true` for the BottomNav hide gate. Since OnboardingMount renders its own full-screen flow that covers BottomNav physically, hiding the nav explicitly is optional polish — defer if test/manual verification shows nav peeking through. **Decision: render BottomNav always for the post-onboarding case; OnboardingFlow has its own opaque background that visually obscures it. Document in SUMMARY as known minor visual divergence (BottomNav potentially visible behind onboarding) and verify visually in Plan 25-10 e2e.**

       Update Task 1 V10MainShell to use `OnboardingMount` (NOT HomeMount) as PosterRouter root. HomeMount is rendered BY OnboardingMount in its onboarded branch.

       **Resolution refinement** — update Task 1's V10MainShell snippet:
       ```tsx
       import { OnboardingMount } from './Onboarding/OnboardingMount';
       // ...
       <PosterRouterProvider root={<OnboardingMount />}>
       ```
       (NOT `<HomeMount />` — HomeMount lives one level deeper inside OnboardingMount.)

       Update V10MainShell.test.tsx in Task 1 accordingly: mock `getMeV10` so OnboardingMount enters `me.onboarded_at != null` ready state → renders HomeMount stub.

    3. **Audit HomePlaceholder consumers** (`grep -rn "HomePlaceholder" frontend/src/`) before deciding to keep or remove. If only OnboardingMount.tsx exports + uses it, safe to remove the export. If any test imports it, keep the export but mark as `@deprecated` in JSDoc.
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner/frontend && npx tsc --noEmit 2>&1 | tail -5 && npm test -- screensV10/__tests__ screensV10/Onboarding/__tests__ --run 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "V10MainShell" frontend/src/AppV10.tsx` ≥ 1.
    - `grep -c "OnboardingMount\|import.*OnboardingMount" frontend/src/AppV10.tsx` == 0 (replaced by V10MainShell).
    - `grep -c "HomeMount" frontend/src/screensV10/Onboarding/OnboardingMount.tsx` ≥ 1 (replaces HomePlaceholder in render).
    - `grep -c "<HomePlaceholder" frontend/src/screensV10/Onboarding/OnboardingMount.tsx` == 0 (no longer rendered — export may remain for backward-compat per audit).
    - tsc strict clean; existing OnboardingMount tests still green.
  </acceptance_criteria>
  <done>AppV10 renders V10MainShell which hosts PosterRouter+OnboardingMount+BottomNav+AddSheet placeholder; onboarded users see real HomeMount; pre-onboarded users see OnboardingFlow; tests pass.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` clean (strict).
2. `npm test -- --run` → full project test suite passes (no regressions; new V10MainShell tests included).
3. `grep -c "V10MainShell" frontend/src/AppV10.tsx` ≥ 1.
4. `grep -c "HomeMount" frontend/src/screensV10/Onboarding/OnboardingMount.tsx` ≥ 1.
5. `grep -v '^//' frontend/src/screensV10/V10MainShell.tsx | grep -c "Транзакции\|Реестр\|TransactionsPlaceholder"` == 0 (no v0.6 transactions tab in shell — TXN-V10-06).
6. `npm run build` succeeds.
</verification>

<success_criteria>
- AppV10 → V10MainShell → PosterRouterProvider(root=OnboardingMount) chain renders successfully.
- BottomNavV10 visible at shell level after onboarding completion (4 tabs + center FAB; NO Transactions tab).
- FAB tap opens AddSheet placeholder (PosterSheet with black bg); close works.
- HomeMount renders via OnboardingMount's onboarded branch — Home category list, eyebrow, count-up daily pace, wallet link, plan badge all visible.
- HOME-V10-01..06 acceptance: requirements built but unmounted are now mounted; user lands on real Home after onboarding.
- TXN-V10-06: bottom nav has 4 tabs + FAB (Home / Savings / FAB / AI / Mgmt), no Transactions tab.
- ADD-V10-01: FAB visible on every screen except inside AddSheet itself (isHidden gate).
</success_criteria>

<output>
After completion, create `.planning/phases/25-home-transactions-add-sheet/25-06-web-shell-mount-SUMMARY.md` documenting:
- Final shell composition (PosterRouter root = OnboardingMount, NOT HomeMount directly).
- BottomNav tab → push placeholder mapping (Savings/AI/Mgmt).
- AddSheet placeholder content (replaced in Plan 25-10).
- Any visual divergence noted (e.g. BottomNav peek-through during onboarding — defer to e2e).
</output>
</content>
</invoke>