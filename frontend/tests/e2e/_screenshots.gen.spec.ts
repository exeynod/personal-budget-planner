// Screenshot generator (NOT a CI test — run explicitly:
//   CI=1 npx playwright test _screenshots.gen.spec.ts
// Captures key v10 screens in BOTH themes (Maximal Poster + Liquid Glass) at a
// phone viewport for owner review. Output: .planning/ux-refactor-screenshots/.
import { test, expect, type Page } from '@playwright/test';
import {
  installOnboardedFixture,
  freezeMotion,
} from './fixtures/onboarded-user';

const OUT = '../.planning/ux-refactor-screenshots';
// Liquid Glass v2 (2026-06): `liquid_glass` now renders the native iOS shell
// (a separate design, NOT a poster CSS variant). Its screenshots live in the
// dedicated generator `native-liquid-glass.spec.ts`. This generator therefore
// captures only the Maximal Poster screens (the poster-asserting steps below
// would not match the native shell).
const THEMES = ['maximal_poster'] as const;

async function setup(page: Page, theme: string) {
  await installOnboardedFixture(page);
  await page.addInitScript((t) => {
    try {
      window.localStorage.setItem('ui.shell', 'v10');
      window.localStorage.setItem('ui.theme', t as string);
      window.localStorage.setItem('cookie_consent_v1', 'acknowledged');
    } catch {
      /* noop */
    }
  }, theme);
}

async function shot(page: Page, theme: string, name: string) {
  await freezeMotion(page);
  await page.screenshot({
    path: `${OUT}/${theme}/${name}.png`,
    fullPage: false,
  });
}

for (const theme of THEMES) {
  test(`screens — ${theme}`, async ({ page }) => {
    test.setTimeout(90_000);
    await setup(page, theme);

    // Home
    await page.goto('/');
    await expect(page.getByText(/Дневной темп/)).toBeVisible({ timeout: 8000 });
    await shot(page, theme, '01-home');

    // Transactions
    await page.getByText(/ВСЕ ОПЕРАЦИИ/).click();
    await expect(page.getByText('Реестр.')).toBeVisible({ timeout: 5000 });
    await shot(page, theme, '02-transactions');

    // Add sheet (FAB on Home)
    await page.goto('/');
    await expect(page.getByText(/Дневной темп/)).toBeVisible({ timeout: 8000 });
    await page.getByRole('button', { name: /Добавить транзакцию/ }).click();
    await expect(page.getByText(/NEW ENTRY/)).toBeVisible({ timeout: 5000 });
    await shot(page, theme, '03-add-sheet');

    // Category detail
    await page.goto('/');
    await expect(page.getByText(/Дневной темп/)).toBeVisible({ timeout: 8000 });
    await page.getByText(/Кафе/).first().click();
    await page.waitForTimeout(300);
    await shot(page, theme, '04-category-detail');

    // Savings (КОПИЛКА tab)
    await page.goto('/');
    await expect(page.getByText(/Дневной темп/)).toBeVisible({ timeout: 8000 });
    await page.getByRole('tab', { name: /КОПИЛКА/ }).click();
    await page.waitForTimeout(400);
    await shot(page, theme, '05-savings');

    // AI tab
    await page.goto('/');
    await expect(page.getByText(/Дневной темп/)).toBeVisible({ timeout: 8000 });
    await page.getByRole('tab', { name: /AI/ }).click();
    await page.waitForTimeout(400);
    await shot(page, theme, '06-ai');

    // Management hub + Settings (УПР. tab)
    await page.goto('/');
    await expect(page.getByText(/Дневной темп/)).toBeVisible({ timeout: 8000 });
    await page.getByRole('tab', { name: /УПР/ }).click();
    await page.waitForTimeout(400);
    await shot(page, theme, '07-management');
  });
}
