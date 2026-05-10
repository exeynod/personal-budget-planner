// Phase 28-03 — POL-04 (web): pixel-perfect baseline snapshots for the
// 8 key V10 screens. The intent is to lock the visual surface so any
// later styling regression shows up as a Playwright snapshot diff.
//
// Phase 29-01 — UICONF-01: refactored to consume the shared
// `installOnboardedFixture` from `./fixtures/onboarded-user` so audit
// (29-02) and regression (31 REG-01) suites share the same mock surface.
//
// Storage layout (Playwright default):
//   tests/e2e/__screenshots__/v10-pixel-snapshots.spec.ts/
//     pixel-home-1-chromium-mobile-{platform}.png
//     pixel-transactions-1-chromium-mobile-{platform}.png
//     ...
// .gitkeep lives in tests/e2e/__screenshots__/v10-pixel/ to commit a
// folder reference; Playwright itself writes baselines into the
// auto-named folder above on the first `--update-snapshots` run.
//
// First run instructions (solo-dev workflow on macOS):
//   cd frontend
//   npx playwright test tests/e2e/v10-pixel-snapshots.spec.ts --update-snapshots
//   git add tests/e2e/__screenshots__/
//
// Re-run (must pass green without `--update-snapshots`):
//   npx playwright test tests/e2e/v10-pixel-snapshots.spec.ts
//
// CI note: baselines are platform-suffixed (`-darwin`, `-linux`). For
// solo-dev on macOS we ship `-darwin` baselines only; CI is expected
// either to regenerate (Linux runner ships its own baseline) or to
// skip this file. See DIVERGENCES.md §W-02.
//
// Determinism: every screen injects an animation/transition kill-switch
// before the snapshot to freeze BigFig count-up, FAB pulse, etc.

import { expect, test, type Page } from '@playwright/test';
import { freezeMotion, installOnboardedFixture } from './fixtures/onboarded-user';

// ─────────────────── per-screen setup helpers ───────────────────

async function gotoHome(page: Page) {
  await page.goto('/');
  await expect(page.getByText(/Дневной темп/)).toBeVisible({ timeout: 8000 });
  await freezeMotion(page);
}

async function gotoTransactions(page: Page) {
  await gotoHome(page);
  await page.getByText(/ВСЕ ОПЕРАЦИИ/).click();
  await expect(page.getByText('Реестр.')).toBeVisible({ timeout: 5000 });
  await freezeMotion(page);
}

async function gotoAddSheet(page: Page) {
  await gotoHome(page);
  await page.getByRole('button', { name: /Добавить транзакцию/ }).click();
  await expect(page.getByText(/NEW ENTRY/)).toBeVisible({ timeout: 5000 });
  await freezeMotion(page);
}

async function gotoCategoryDetail(page: Page) {
  await gotoHome(page);
  // Tap first category row (Кафе) — pushes CategoryDetail.
  await page.getByText(/Кафе/).first().click();
  await freezeMotion(page);
}

async function gotoPlanMonth(page: Page) {
  await gotoHome(page);
  // Phase 29-04 W-05 hardening: use the stable `data-nav="plan"` selector
  // on the Home «PLAN МАЯ» plate. The previous permissive regex
  // (`getByRole('button', { name: /план/i })`) matched Home itself when
  // the headline word «План» was present, causing the baseline PNG to
  // capture Home instead of PlanMonth. Re-run with --update-snapshots
  // after this change to regenerate plan-month-chromium-mobile-darwin.png.
  await page.locator('[data-nav="plan"]').first().click();
  // PlanMonth headline confirms we landed on the right screen before
  // freezing motion.
  await expect(page.getByText(/PLAN/)).toBeVisible({ timeout: 5000 });
  await freezeMotion(page);
}

async function gotoSubscriptions(page: Page) {
  await gotoHome(page);
  // Subscriptions live under УПР. tab → push site.
  await page.getByRole('tab', { name: /УПР/ }).click();
  // Tap "Подписки" entry from mgmt hub if present.
  const subsLink = page.getByText(/Подписки/i).first();
  if (await subsLink.isVisible().catch(() => false)) {
    await subsLink.click();
  }
  await freezeMotion(page);
}

async function gotoSavings(page: Page) {
  await gotoHome(page);
  await page.getByRole('tab', { name: /КОПИЛКА/ }).click();
  await freezeMotion(page);
}

async function gotoAi(page: Page) {
  await gotoHome(page);
  await page.getByRole('tab', { name: /AI/i }).click();
  await freezeMotion(page);
}

interface Screen {
  name: string;
  setup: (page: Page) => Promise<void>;
}

const SCREENS: Screen[] = [
  { name: 'home', setup: gotoHome },
  { name: 'transactions', setup: gotoTransactions },
  { name: 'add-sheet', setup: gotoAddSheet },
  { name: 'category-detail', setup: gotoCategoryDetail },
  { name: 'plan-month', setup: gotoPlanMonth },
  { name: 'subscriptions', setup: gotoSubscriptions },
  { name: 'savings', setup: gotoSavings },
  { name: 'ai-initial', setup: gotoAi },
];

// ─────────────────── tests ───────────────────

test.describe('V10 pixel-perfect baseline (Plan 28-03 / POL-04 web)', () => {
  test.beforeEach(async ({ page }) => {
    await installOnboardedFixture(page);
  });

  for (const screen of SCREENS) {
    test(`pixel: ${screen.name}`, async ({ page }) => {
      await screen.setup(page);
      // 2% tolerance covers sub-pixel font AA between Chromium versions
      // / hosts; the V10 layout itself is deterministic once motion is
      // frozen and BigFig count-up has settled.
      await expect(page).toHaveScreenshot(`${screen.name}.png`, {
        maxDiffPixelRatio: 0.02,
        fullPage: true,
      });
    });
  }
});
