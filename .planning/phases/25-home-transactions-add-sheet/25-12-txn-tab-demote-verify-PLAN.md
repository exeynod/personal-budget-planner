---
phase: 25-home-transactions-add-sheet
plan: 12
type: execute
wave: 3
depends_on: [6, 7, 8, 9, 10, 11]
files_modified:
  - frontend/src/screensV10/__tests__/TxV10TabDemote.test.tsx
  - ios/BudgetPlannerTests/FeaturesV10/TxV10TabDemoteTests.swift
  - frontend/e2e/v10-phase25-acceptance.spec.ts
autonomous: true
gap_closure: true
requirements:
  - TXN-V10-06

must_haves:
  truths:
    - "TXN-V10-06 acceptance is enforced by automated tests on BOTH platforms — bottom nav has 4 tabs + center FAB; no Транзакции/Transactions/Реестр label appears in V10 BottomNav."
    - "Reverse-direction acceptance: Transactions registry IS still reachable, only via push-stack from Home «ВСЕ ОПЕРАЦИИ →» (and Category Detail in Phase 26)."
    - "End-to-end Playwright spec covers the full Phase 25 happy path: open V10MainShell → Home renders → tap «ВСЕ ОПЕРАЦИИ →» → TransactionsView appears → tap FAB → AddSheet opens → submit → sheet closes."
  artifacts:
    - path: "frontend/src/screensV10/__tests__/TxV10TabDemote.test.tsx"
      provides: "Vitest assertions: BottomNavV10 has 4 tabs + 1 FAB; no 'Транзакции' label; v0.6 BottomNav untouched (still 5 tabs)"
      min_lines: 30
    - path: "ios/BudgetPlannerTests/FeaturesV10/TxV10TabDemoteTests.swift"
      provides: "XCTest assertions: TabId enum has 4 cases excluding 'transactions'; v0.6 AppTab enum still has 'transactions' (untouched)"
      min_lines: 40
    - path: "frontend/e2e/v10-phase25-acceptance.spec.ts"
      provides: "Playwright spec: Phase 25 happy-path with mocked /me/onboarded + /actual/create + asserts no Транзакции tab in shell"
      min_lines: 80
  key_links:
    - from: "TxV10TabDemote.test.tsx"
      to: "BottomNavV10 (Plan 25-02 + 25-06) + v0.6 BottomNav (untouched)"
      via: "import + render + DOM-query assertion"
      pattern: "BottomNavV10\\|Транзакции"
    - from: "TxV10TabDemoteTests.swift"
      to: "TabId (Plan 23-07) + AppTab (v0.6)"
      via: "enum case enumeration"
      pattern: "TabId.allCases\\|AppTab.allCases"
---

<objective>
Lock TXN-V10-06 acceptance ("v0.6 Transactions tab fully demoted из bottom nav") via automated cross-platform tests, AND wrap Phase 25 with a Playwright happy-path acceptance spec covering Home → Transactions → AddSheet → submit. This plan closes the only requirement (TXN-V10-06) not yet asserted by automated tests after Plans 25-06..11 land.

Purpose: lock the demotion so any regression (e.g. someone re-adding a transactions tab to BottomNavV10) breaks CI.
Output: 2 new test files + 1 Playwright spec.
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
@frontend/src/componentsV10/TabBar.tsx
@frontend/src/screensV10/common/BottomNavV10.tsx
@frontend/src/components/BottomNav.tsx
@ios/BudgetPlanner/FeaturesV10/Common/TabBar.swift
@ios/BudgetPlanner/FeaturesV10/Common/BottomNavV10.swift
@ios/BudgetPlanner/Features/Common/BottomNav.swift

<interfaces>
<!-- Both platforms — verify what's been built for assertion coverage. -->

Web V10 (Plan 25-02 / 25-06):
```typescript
// frontend/src/componentsV10/TabBar.tsx
export type TabId = 'home' | 'savings' | 'ai' | 'mgmt';   // 4 cases — no 'transactions' (TXN-V10-06 satisfied at type level)
```

Web v0.6 (untouched):
```typescript
// frontend/src/components/BottomNav.tsx
export type TabId = 'home' | 'transactions' | 'analytics' | 'ai' | 'mgmt';   // 5 cases including 'transactions'
```

iOS V10 (Plan 23-07):
```swift
// ios/BudgetPlanner/FeaturesV10/Common/TabBar.swift
enum TabId: String, CaseIterable, Hashable { case home, savings, ai, mgmt }   // 4 cases — no .transactions
```

iOS v0.6 (untouched):
```swift
// ios/BudgetPlanner/Features/Common/BottomNav.swift
enum AppTab: String, CaseIterable { case home, transactions, analytics, ai, mgmt }   // verify name; could be different; check file
```
</interfaces>
</context>

<threat_model>
## Trust Boundaries
N/A — test-only plan, no production code modified.

## STRIDE Threat Register
N/A.
</threat_model>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Web vitest acceptance for TXN-V10-06</name>
  <files>frontend/src/screensV10/__tests__/TxV10TabDemote.test.tsx</files>
  <read_first>
    - frontend/src/screensV10/common/BottomNavV10.tsx (the V10 wrapper — props + how it renders TabBar)
    - frontend/src/componentsV10/TabBar.tsx (TabId type + tab labels)
    - frontend/src/components/BottomNav.tsx (v0.6 component — should NOT be modified by Phase 25; verify still has Транзакции tab)
    - frontend/src/screensV10/__tests__/V10MainShell.test.tsx (existing pattern for shell-level test mocks)
  </read_first>
  <behavior>
    Test 1: Render `<BottomNavV10 active='home' onTab={vi.fn()} onFab={vi.fn()} />` — assert exactly 4 tab buttons + 1 FAB button; assert no button has accessible name matching `/транзакции/i` or `/transactions/i` or `/реестр/i`.
    Test 2: Type-level — assert `TabId` (V10) has exactly 4 keys; assert TS would reject `'transactions'` literal — use a `// @ts-expect-error` line or a runtime assertion via `Object.keys` of a TabId-keyed mapping.
    Test 3: v0.6 BottomNav unchanged — render the v0.6 `<BottomNav ...>` and assert «Транзакции» button still exists (regression guard against accidental v0.6 demotion).
    Test 4: TransactionsMount IS reachable from Home — render `<HomeMount />` (via mocked APIs returning ready state with at least one category), find «ВСЕ ОПЕРАЦИИ →» link, click → assert PosterRouter top-of-stack now contains TransactionsMount/TransactionsView (use a stub/spy to detect the push).
  </behavior>
  <action>
    Create `frontend/src/screensV10/__tests__/TxV10TabDemote.test.tsx`:

    ```tsx
    import { describe, expect, it, vi, afterEach } from 'vitest';
    import { cleanup, render, screen, fireEvent } from '@testing-library/react';
    import { BottomNavV10 } from '../common/BottomNavV10';
    import { BottomNav as V06BottomNav } from '../../components/BottomNav';

    afterEach(cleanup);

    describe('TXN-V10-06 — V10 BottomNav demotion', () => {
      it('BottomNavV10 has exactly 4 tab buttons + 1 FAB; no Транзакции label', () => {
        render(<BottomNavV10 active="home" onTab={vi.fn()} onFab={vi.fn()} />);
        const buttons = screen.getAllByRole('button');
        // 4 tab buttons + 1 FAB = 5 buttons; depending on TabBar internals could be more (icons inside), so assert tab labels instead.
        const tabLabels = ['ГЛАВНАЯ', 'КОПИЛКА', 'AI', 'УПР.'];
        for (const lbl of tabLabels) {
          expect(screen.getByText(lbl)).toBeTruthy();
        }
        // Negative assertion — no v0.6 transactions tab labels.
        expect(screen.queryByText(/транзакции/i)).toBeNull();
        expect(screen.queryByText(/реестр/i)).toBeNull();
      });

      it('V10 TabId type has 4 cases (no transactions)', () => {
        // Type-level via runtime mapping
        const map: Record<'home'|'savings'|'ai'|'mgmt', boolean> = {
          home: true, savings: true, ai: true, mgmt: true,
        };
        expect(Object.keys(map).length).toBe(4);
        expect(Object.keys(map)).not.toContain('transactions');
      });

      it('v0.6 BottomNav still includes Транзакции (regression guard, NOT modified by Phase 25)', () => {
        // Use minimum prop subset that v0.6 BottomNav requires; verify file first.
        // If v0.6 BottomNav requires complex props (managementView etc), use a wrapper or skip with .todo and document.
        render(
          <V06BottomNav
            activeTab={'home' as never}
            onTabChange={vi.fn()}
            onFabClick={vi.fn()}
          />
        );
        expect(screen.getByText(/транзакции/i)).toBeTruthy();
      });
    });
    ```

    **Note**: if the v0.6 BottomNav signature differs from the example, simplify the test to dynamic-grep the source file via Node fs (read `frontend/src/components/BottomNav.tsx` and assert it contains «Транзакции» literal) — that's a static guard rather than a render guard, and dramatically simpler:

    ```typescript
    import fs from 'node:fs';
    import path from 'node:path';

    it('v0.6 BottomNav source still references Транзакции tab', () => {
      const src = fs.readFileSync(path.resolve(__dirname, '../../components/BottomNav.tsx'), 'utf8');
      expect(src).toMatch(/Транзакции/);
    });
    ```

    Choose the simpler static-grep approach if v0.6 BottomNav rendering requires complex props.

    **Plan 25-08 / 25-06 swap regression**: Add a final test asserting `frontend/src/screensV10/Home/HomeMount.tsx` imports TransactionsMount (NOT TransactionsViewPlaceholder) — static-grep guard:
    ```typescript
    it('HomeMount imports the real TransactionsMount, not the placeholder', () => {
      const src = fs.readFileSync(path.resolve(__dirname, '../Home/HomeMount.tsx'), 'utf8');
      expect(src).toMatch(/TransactionsMount/);
      expect(src).not.toMatch(/TransactionsViewPlaceholder/);
    });
    ```
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner/frontend && npm test -- screensV10/__tests__/TxV10TabDemote.test.tsx --run 2>&1 | tail -15</automated>
  </verify>
  <acceptance_criteria>
    - All TxV10TabDemote tests pass.
    - 1 test asserts BottomNavV10 has tabs Home/Savings/AI/Mgmt only.
    - 1 test asserts v0.6 still has Транзакции (regression guard).
    - 1 test asserts HomeMount imports TransactionsMount (Plan 25-08 swap regression guard).
  </acceptance_criteria>
  <done>Web cross-version demotion locked; tests pass.</done>
</task>

<task type="auto">
  <name>Task 2: iOS XCTest acceptance for TXN-V10-06</name>
  <files>ios/BudgetPlannerTests/FeaturesV10/TxV10TabDemoteTests.swift</files>
  <read_first>
    - ios/BudgetPlanner/FeaturesV10/Common/TabBar.swift (V10 TabId enum)
    - ios/BudgetPlanner/Features/Common/BottomNav.swift (v0.6 — verify enum name, e.g. AppTab; cases include `.transactions`)
    - ios/BudgetPlanner/FeaturesV10/Home/HomePlaceholders.swift (Plan 25-09 — TransactionsViewPlaceholderView body now returns TransactionsV10View — assert via Mirror or import-grep)
    - ios/BudgetPlannerTests/FeaturesV10/V10MainShellTests.swift (Plan 25-07 — pattern reference)
  </read_first>
  <action>
    Create `ios/BudgetPlannerTests/FeaturesV10/TxV10TabDemoteTests.swift`:

    ```swift
    import XCTest
    @testable import BudgetPlanner

    final class TxV10TabDemoteTests: XCTestCase {

        // V10 TabId enum has exactly 4 cases — no .transactions.
        func test_v10_TabId_has_no_transactions_case() {
            let allTabs = TabId.allCases.map { $0.rawValue }
            XCTAssertEqual(allTabs.count, 4)
            XCTAssertEqual(Set(allTabs), Set(["home", "savings", "ai", "mgmt"]))
            XCTAssertFalse(allTabs.contains("transactions"))
        }

        // v0.6 AppTab enum still includes .transactions — regression guard
        // (Phase 25 must NOT modify v0.6 nav).
        func test_v06_AppTab_still_includes_transactions() {
            // AppTab might be named differently; confirm by reading file before this test.
            let allV06Tabs = AppTab.allCases.map { $0.rawValue }
            XCTAssertTrue(allV06Tabs.contains("transactions"),
                "v0.6 AppTab.transactions must remain — Phase 25 only demotes the V10 nav, not v0.6.")
        }
    }
    ```

    **If v0.6 enum name is NOT `AppTab`**, adapt accordingly by reading `Features/Common/BottomNav.swift` first.

    If the v0.6 file's enum is private or otherwise inaccessible from XCTest, fall back to a string-grep assertion using `Bundle.main.url(forResource:)` or simply `FileManager.default.contents(atPath:)` to read the .swift file as data and assert `Транзакции` literal still appears. Document the fallback in code.
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner/ios && xcodebuild test -scheme BudgetPlanner -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:BudgetPlannerTests/TxV10TabDemoteTests 2>&1 | tail -15</automated>
  </verify>
  <acceptance_criteria>
    - All TxV10TabDemoteTests pass.
    - V10 TabId asserted to have exactly 4 cases (no transactions).
    - v0.6 AppTab/equivalent enum asserted to still contain .transactions.
  </acceptance_criteria>
  <done>iOS cross-version demotion locked; XCTests pass.</done>
</task>

<task type="auto">
  <name>Task 3: Playwright acceptance spec — Phase 25 happy path</name>
  <files>frontend/e2e/v10-phase25-acceptance.spec.ts</files>
  <read_first>
    - frontend/e2e/ existing specs (find one for v10 onboarding, e.g. `v10-onboarding-*.spec.ts`) — copy patterns for `page.route(...)` API mocking and v10 theme bootstrap (`?theme=v10` or `localStorage.setItem('ui.theme','v10')`)
    - frontend/playwright.config.ts (verify base URL + browsers configured)
  </read_first>
  <action>
    Create `frontend/e2e/v10-phase25-acceptance.spec.ts`:

    ```typescript
    import { expect, test } from '@playwright/test';

    /**
     * Phase 25 acceptance suite — locks HOME-V10-01..06, TXN-V10-01..06,
     * ADD-V10-01..05 against future regressions.
     *
     * Mocks /me as onboarded so V10MainShell goes straight to HomeMount,
     * skipping the OnboardingFlow (covered by 24-* specs).
     */

    test.describe('Phase 25 — Home + Transactions + Add Sheet acceptance', () => {
      test.beforeEach(async ({ page }) => {
        // Mock /me: onboarded user with income + accounts
        await page.route('**/api/v1/me', (route) =>
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              id: 1, telegram_id: 42,
              income_cents: 1_500_00 * 1000,        // 1.5M ₽
              onboarded_at: '2026-04-01T10:00:00Z',
              accounts: [],
            }),
          }),
        );
        // Mock /accounts
        await page.route('**/api/v1/accounts', (route) =>
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
              { id: 1, bank: 'Т-Банк', mask: '3477', kind: 'card', balance_cents: 50_000_00, primary: true, created_at: '2026-04-01T00:00:00Z' },
            ]),
          }),
        );
        // Mock /categories — at least one expense category for AddSheet picker
        await page.route('**/api/v1/categories**', (route) =>
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
              { id: 7, name: 'Кафе', kind: 'expense', code: 'cafe', is_archived: false, sort_order: 1, plan_cents: 5_000_00, rollover: 'misc', paused: false, parent_id: null, ord: 1, created_at: '2026-04-01T00:00:00Z' },
              { id: 99, name: 'savings', kind: 'expense', code: 'savings', is_archived: false, sort_order: 99, plan_cents: 0, rollover: 'misc', paused: false, parent_id: null, ord: 99, created_at: '2026-04-01T00:00:00Z' },
            ]),
          }),
        );
        // Mock /periods/current
        await page.route('**/api/v1/periods/current', (route) =>
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ id: 5, period_start: '2026-05-01', period_end: '2026-05-31', status: 'active' }),
          }),
        );
        // Mock /periods/5/actual — empty for clean state
        await page.route('**/api/v1/periods/5/actual**', (route) =>
          route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
        );
      });

      test('Home renders + push Transactions + open AddSheet', async ({ page }) => {
        await page.goto('/');
        // Wait for HomeMount ready state (eyebrow OR daily-pace text appears)
        await expect(page.getByText(/Дневной темп/i)).toBeVisible({ timeout: 5000 });
        await expect(page.getByText(/Кафе/i)).toBeVisible();

        // TXN-V10-06: BottomNav has no Транзакции tab
        await expect(page.getByText(/Транзакции/i)).toHaveCount(0);

        // HOME-V10-04: wallet link present
        await expect(page.getByText(/в кошельке/i)).toBeVisible();

        // Push Transactions via «ВСЕ ОПЕРАЦИИ →»
        await page.getByText(/ВСЕ ОПЕРАЦИИ/i).click();
        await expect(page.getByText(/Реестр\./i)).toBeVisible({ timeout: 3000 });
        await expect(page.getByText(/SECTION II/i)).toBeVisible();

        // TXN-V10-02: 6 filter chips present
        for (const chip of ['Все', 'Кафе', 'Продукты', 'Транспорт', 'Подписки', 'Копилка']) {
          await expect(page.getByText(chip, { exact: false })).toBeVisible();
        }

        // Pop back to Home
        await page.getByText(/← НАЗАД/i).first().click();
        await expect(page.getByText(/Дневной темп/i)).toBeVisible();

        // Open AddSheet via FAB
        // Find the FAB (yellow + button); selector by aria-label or by + glyph
        const fab = page.locator('[aria-label*="Добавить"], [aria-label*="add"], button:has-text("+")').first();
        await fab.click();
        await expect(page.getByText(/NEW ENTRY/i)).toBeVisible({ timeout: 3000 });
      });
    });
    ```

    **Note**: FAB selector heuristic; if the FAB component uses a specific `data-testid`, prefer that. Inspect `frontend/src/componentsV10/FAB.tsx` for a stable selector.

    Mock `POST /api/v1/actual` with `route.fulfill({status:200, body: ...})` returning a fake ActualV10Read — then test the full submit flow (click '5', click 'Кафе' chip, click СОХРАНИТЬ, assert sheet closes).

    **Defer**: full submit flow inside the spec is brittle without robust selectors. Minimum viable acceptance: assert «NEW ENTRY» appears on FAB tap. Document the deferred extended-flow tests in SUMMARY.
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner/frontend && npx playwright test e2e/v10-phase25-acceptance.spec.ts --reporter=list 2>&1 | tail -25</automated>
  </verify>
  <acceptance_criteria>
    - Playwright spec passes in headless mode (CI-compatible).
    - Spec asserts: Home renders, no Транзакции tab, push Transactions, 6 filter chips, pop back, FAB opens AddSheet.
    - If full submit flow brittle, assert opening AddSheet only and document deferred items.
  </acceptance_criteria>
  <done>End-to-end Playwright spec passes; Phase 25 happy path locked.</done>
</task>

</tasks>

<verification>
1. `cd frontend && npm test -- screensV10/__tests__/TxV10TabDemote.test.tsx --run` → passes.
2. `cd frontend && npx playwright test e2e/v10-phase25-acceptance.spec.ts` → passes (or assertions adjusted for FAB selector).
3. `cd ios && xcodebuild test -only-testing:BudgetPlannerTests/TxV10TabDemoteTests` → passes.
4. Full project test suites still green (`npm test -- --run` + full XCTest run).
</verification>

<success_criteria>
- TXN-V10-06 acceptance asserted by automated tests on web AND iOS.
- v0.6 BottomNav verified untouched (regression guard for both platforms).
- HomeMount Phase 25-08 swap (TransactionsMount instead of TransactionsViewPlaceholder) regression-guarded.
- Playwright happy-path covers Home → Transactions → AddSheet open.
- Any future regression (e.g. someone re-adding a transactions tab to V10 BottomNav) immediately breaks CI.
</success_criteria>

<output>
After completion, create `.planning/phases/25-home-transactions-add-sheet/25-12-txn-tab-demote-verify-SUMMARY.md` documenting:
- Test coverage matrix (V10 + v0.6 on both platforms).
- Static-grep guards used (when render-tests were brittle).
- Playwright spec scope (assertions covered + items deferred).
- Phase 25 final acceptance state — which REQs are now provably green vs which still rely on manual inspection (e.g. visual fidelity to prototype, count-up easing curve fidelity — flagged for Phase 28 polish).
</output>
</content>
</invoke>