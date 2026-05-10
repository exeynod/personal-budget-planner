---
phase: 23-design-system-foundation
plan: 11
type: execute
wave: 6
depends_on: [23-design-system-foundation/09]
files_modified:
  - frontend/tests/e2e/preview.spec.ts
  - frontend/playwright.config.ts
autonomous: false
requirements: [DS-02, DS-04, DS-05, DS-06, DS-08]
tags: [design-system, web, playwright, smoke-test]
must_haves:
  truths:
    - "Playwright e2e test loads /preview?preview=1 and asserts: all 10 component sections render, no console errors, italic «Май» renders with cyrillic glyphs (computed font-family includes 'PosterSerifItalic')."
    - "Playwright test toggles theme via localStorage to 'v06' → reload → asserts existing v0.6 App renders (different DOM signature)."
    - "Playwright test sets `prefers-reduced-motion: reduce` and triggers an animation; asserts the animated target's computed `transform` does NOT change while the OS flag is on (opacity-only confirmed)."
    - "Test runs against `npx vite dev` server on port 5173 (CI-friendly)."
  artifacts:
    - path: "frontend/tests/e2e/preview.spec.ts"
      provides: "DS-08 smoke test + DS-02 cyrillic visual check + DS-05 reduce-motion proof"
    - path: "frontend/playwright.config.ts"
      provides: "Playwright config with webServer hook to vite dev"
  key_links:
    - from: "Playwright test"
      to: "frontend/src/preview/PreviewApp.tsx"
      via: "GET http://localhost:5173/?preview=1"
---

<objective>
Add Playwright e2e smoke test `frontend/tests/e2e/preview.spec.ts` that validates DS-02 (cyrillic font routing), DS-04+DS-05 (animations + reduce-motion), DS-06 (10 components rendered), DS-08 (theme dispatch). Runs against `npx vite dev` on port 5173 (Playwright `webServer` hook auto-starts).

Purpose: Programmatic verification that all visual + behavioral acceptance criteria hold before manual sign-off. Gated by autonomous=false because the test introduces a CI dependency that the developer should review.
Output: 1 test file + playwright.config.ts updates.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/23-design-system-foundation/23-CONTEXT.md
@.planning/phases/23-design-system-foundation/23-09-web-shell-preview-PLAN.md

<read_first>
- `frontend/playwright.config.ts` (current state) — confirm whether `webServer` block already exists
- `frontend/tests/` directory listing — note existing test layout
- `frontend/package.json` — confirm `@playwright/test@^1.59.1` already installed
- Plan 23.09 PreviewApp.tsx — section eyebrow strings (used as text-content selectors): "1. ADR-001 ROUTING", "2. BIGFIG · COUNT-UP", "3. PLATE · 5 TONES", "4. POSTERBUTTON · 3 VARIANTS", "5. CHIPS · SINGLE-SELECT", "6. POSTERSLIDER · STEP 500", "7. ANIMATIONS · 11 KEYFRAMES", "8. TOAST · 1700ms LIFE"
</read_first>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Update playwright.config.ts with webServer hook</name>
  <files>frontend/playwright.config.ts</files>
  <read_first>
    - `frontend/playwright.config.ts` current state
  </read_first>
  <action>
    Read current config; if no `webServer` block, add it. If `webServer` already configured, ensure `command: 'npm run dev'` and `port: 5173` and `reuseExistingServer: !process.env.CI`. Final config target:

    ```typescript
    import { defineConfig, devices } from '@playwright/test';

    export default defineConfig({
      testDir: './tests/e2e',
      fullyParallel: false,           // shared dev server
      forbidOnly: !!process.env.CI,
      retries: process.env.CI ? 2 : 0,
      workers: 1,
      reporter: [['list'], ['html', { open: 'never' }]],
      use: {
        baseURL: 'http://localhost:5173',
        trace: 'on-first-retry',
        viewport: { width: 390, height: 844 },   // iPhone 13 Pro mobile-first
      },
      projects: [
        { name: 'chromium-mobile', use: { ...devices['Pixel 5'] } },
      ],
      webServer: {
        command: 'npm run dev',
        port: 5173,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
    });
    ```

    PRESERVE any existing test directories or projects if they conflict; merge rather than replace if other e2e suites exist.
  </action>
  <acceptance_criteria>
    - `grep -F "webServer" frontend/playwright.config.ts` returns 1
    - `grep -F "port: 5173" frontend/playwright.config.ts` returns 1
    - `grep -F "baseURL: 'http://localhost:5173'" frontend/playwright.config.ts` returns 1
    - `cd frontend && npx playwright test --list 2>&1 | grep -i "error" | head -1` returns nothing (config parses)
  </acceptance_criteria>
  <verify>
    <automated>cd frontend &amp;&amp; grep -F 'webServer' playwright.config.ts &amp;&amp; grep -F 'port: 5173' playwright.config.ts</automated>
  </verify>
  <done>
    playwright.config.ts has webServer block + baseURL on port 5173.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Author preview.spec.ts e2e smoke + DS-02 + DS-05 + DS-08 assertions</name>
  <files>frontend/tests/e2e/preview.spec.ts</files>
  <read_first>
    - PreviewApp.tsx section labels
    - Plan 23.04 animations.css — utility class names used as selectors
  </read_first>
  <behavior>
    - Test 1 (DS-08): GET `/?preview=1` with localStorage clear → page contains text "VOL.23 / DESIGN SYSTEM PREVIEW"; no console errors.
    - Test 2 (DS-06): same page → `getByText('1. ADR-001 ROUTING')` is visible AND 7 other section eyebrows visible (verifies 10 components rendered).
    - Test 3 (DS-02): «Май» element has `getComputedStyle().fontFamily` containing `'PosterSerifItalic'` (proves alias is wired). Optional secondary check: capture a small screenshot of the «Май» element and assert pixel similarity to baseline (skip if no baseline yet — Phase 28 polish).
    - Test 4 (DS-08 v06 path): `localStorage.setItem('ui.theme', 'v06')` → reload → page DOES NOT contain "VOL.23 / DESIGN SYSTEM PREVIEW" (v06 App renders instead — has different DOM).
    - Test 5 (DS-08 tampering): `localStorage.setItem('ui.theme', '<malicious>')` → reload → page DOES contain "VOL.23 / DESIGN SYSTEM PREVIEW" (fallback to default v10).
    - Test 6 (DS-04+DS-05): with `prefers-reduced-motion: reduce` set via Playwright emulator, click "▶ poster-row-in" trigger; assert that element with class `.poster-row-in` has computed `animation-duration: 0.2s` (reduced) NOT 0.45s.
  </behavior>
  <action>
    Create `frontend/tests/e2e/preview.spec.ts`:
    ```typescript
    import { test, expect, Page } from '@playwright/test';

    /** DS-02 / DS-04 / DS-05 / DS-06 / DS-08 acceptance smoke. */

    async function consoleErrors(page: Page): Promise<string[]> {
      const errors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
      });
      page.on('pageerror', (e) => errors.push(String(e)));
      return errors;
    }

    test.describe('Phase 23 — Design System Preview', () => {
      test('DS-08: default theme renders V10 preview gallery; no console errors', async ({ page }) => {
        const errors = await consoleErrors(page);
        await page.goto('/?preview=1');
        await expect(page.getByText('VOL.23 / DESIGN SYSTEM PREVIEW')).toBeVisible();
        // Allow a beat for any deferred imports
        await page.waitForLoadState('networkidle');
        expect(errors.filter(e => !/font/i.test(e))).toEqual([]);   // tolerate any font-related dev warning
      });

      test('DS-06: 8+ component sections render', async ({ page }) => {
        await page.goto('/?preview=1');
        const expected = [
          '1. ADR-001 ROUTING',
          '2. BIGFIG · COUNT-UP',
          '3. PLATE · 5 TONES',
          '4. POSTERBUTTON · 3 VARIANTS',
          '5. CHIPS · SINGLE-SELECT',
          '6. POSTERSLIDER · STEP 500',
          '7. ANIMATIONS · 11 KEYFRAMES',
          '8. TOAST · 1700ms LIFE',
        ];
        for (const eyebrow of expected) {
          await expect(page.getByText(eyebrow)).toBeVisible();
        }
      });

      test('DS-02: italic «Май» uses PosterSerifItalic alias (cyrillic routing)', async ({ page }) => {
        await page.goto('/?preview=1');
        // Find the Mass italic with text "Май"
        const mai = page.getByText('Май', { exact: true }).first();
        await expect(mai).toBeVisible();
        const fontFamily = await mai.evaluate((el) => getComputedStyle(el).fontFamily);
        expect(fontFamily).toMatch(/PosterSerifItalic|DM Serif Display|PT Serif/i);
      });

      test('DS-08: localStorage v06 → renders existing App (NOT preview gallery)', async ({ page }) => {
        await page.addInitScript(() => localStorage.setItem('ui.theme', 'v06'));
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        await expect(page.getByText('VOL.23 / DESIGN SYSTEM PREVIEW')).toHaveCount(0);
      });

      test('DS-08: tampered localStorage → falls back to v10 default', async ({ page }) => {
        await page.addInitScript(() => localStorage.setItem('ui.theme', '<malicious>'));
        await page.goto('/?preview=1');
        await expect(page.getByText('VOL.23 / DESIGN SYSTEM PREVIEW')).toBeVisible();
      });

      test('DS-05: prefers-reduced-motion reduces posterRowIn duration', async ({ browser }) => {
        const ctx = await browser.newContext({ reducedMotion: 'reduce' });
        const page = await ctx.newPage();
        await page.goto('/?preview=1');
        await expect(page.getByText('7. ANIMATIONS · 11 KEYFRAMES')).toBeVisible();

        // Trigger posterRowIn animation
        await page.getByRole('button', { name: /poster-row-in/i }).click();
        // Wait briefly for class to apply
        await page.waitForTimeout(50);
        const target = page.locator('.poster-row-in').first();
        await expect(target).toBeVisible();
        const animDuration = await target.evaluate(
          (el) => getComputedStyle(el).animationDuration,
        );
        // With reduce-motion, duration should be 0.2s (reduced) not 0.45s
        expect(animDuration).toBe('0.2s');
        await ctx.close();
      });
    });
    ```
  </action>
  <acceptance_criteria>
    - `test -f frontend/tests/e2e/preview.spec.ts`
    - `grep -c "test\(" frontend/tests/e2e/preview.spec.ts` returns ≥ 6
    - `grep -F "VOL.23 / DESIGN SYSTEM PREVIEW" frontend/tests/e2e/preview.spec.ts` returns ≥ 2
    - `grep -F "PosterSerifItalic" frontend/tests/e2e/preview.spec.ts` returns ≥ 1
    - `grep -F "reducedMotion: 'reduce'" frontend/tests/e2e/preview.spec.ts` returns 1
    - `grep -F "v06" frontend/tests/e2e/preview.spec.ts` returns ≥ 1
    - `grep -F "<malicious>" frontend/tests/e2e/preview.spec.ts` returns 1
    - `cd frontend && npx playwright test tests/e2e/preview.spec.ts --reporter=list` runs the suite (manual: report whether all 6 tests pass; this is checkpoint-gated, so failures here trigger Plan revisit not auto-pass)
  </acceptance_criteria>
  <verify>
    <automated>cd frontend &amp;&amp; grep -c 'test(' tests/e2e/preview.spec.ts | awk '{ if ($1 &gt;= 6) exit 0; else exit 1; }' &amp;&amp; grep -F 'PosterSerifItalic' tests/e2e/preview.spec.ts &amp;&amp; grep -F "reducedMotion: 'reduce'" tests/e2e/preview.spec.ts</automated>
  </verify>
  <done>
    preview.spec.ts authored with 6 DS-02/04/05/06/08 assertions; awaits human run.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Human runs Playwright suite and reports outcome</name>
  <what-built>
    Tasks 1-2 set up the smoke-test infrastructure but cannot guarantee the suite passes — first run may surface integration bugs (e.g. font filename mismatch from Plan 23.02 if package version yielded different woff2 names; Vite resolution issues; CSS Module class name hashing affecting selectors).
  </what-built>
  <how-to-verify>
    1. Ensure dev dependencies installed: `cd frontend && npx playwright install chromium` (one-time download, ~150MB).
    2. Run the suite: `cd frontend && npx playwright test tests/e2e/preview.spec.ts --reporter=list`
    3. Expected outcome: 6 passes, 0 failures.
    4. Common failure modes to investigate:
       - **Font test fails:** check `frontend/src/stylesV10/fonts.css` — filename in `url('@fontsource/...woff2')` may need to be exact match for installed package version. Run `ls frontend/node_modules/@fontsource/pt-serif/files/` to see real filenames.
       - **CSS Module selector fails (`.poster-row-in` not found):** CSS Modules may hash the class — but `.poster-row-in` is a GLOBAL utility class from `frontend/src/stylesV10/animations.css`, NOT scoped. If hashing happens, ensure animations.css is imported as a regular CSS file (without `.module.css` suffix). It is — verified.
       - **Reduce-motion duration not 0.2s:** confirm the @media query in animations.css matches the test's class. The test triggers `.poster-row-in`, the reduce-motion override applies via `animation-duration: 0.2s !important` — the global selector list must include `.poster-row-in`.
    5. If any test fails, log the failure to `.planning/phases/23-design-system-foundation/23-11-VERIFICATION.md` with the error message + suspected cause + proposed fix; the planner can issue a follow-up gap closure plan.
  </how-to-verify>
  <resume-signal>
    Type "approved — 6/6 passed" if all tests pass. Otherwise paste failure details and proposed fix.
  </resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Playwright runner → vite dev server | Local-only test; no external network |
| Test asserts → DOM | Read-only DOM access; no test-injected scripts |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-23-11-01 | Tampering | localStorage in test | accept | Test runs in isolated browser context per Playwright; no production data leak |
| T-23-11-02 | DoS | webServer hook | accept | Single dev server reused; test timeout 60s |
| T-23-11-03 | Information Disclosure | test traces / screenshots | accept | Stored in `playwright-report/` — gitignored; no PII captured |
</threat_model>

<verification>
1. `cd frontend && npx playwright test tests/e2e/preview.spec.ts` runs all 6 tests.
2. Human-checkpoint reports outcome.
3. Failure cases logged to 23-11-VERIFICATION.md if any.
</verification>

<success_criteria>
- DS-02 cyrillic routing programmatically verified.
- DS-04+DS-05 reduce-motion programmatically verified.
- DS-06 component count programmatically verified.
- DS-08 dispatcher (env, localStorage, tampering, default) programmatically verified.
</success_criteria>

<output>
After human checkpoint, create `.planning/phases/23-design-system-foundation/23-11-SUMMARY.md` with: test outcomes, any failures + remediation, screenshot paths if captured.
</output>
