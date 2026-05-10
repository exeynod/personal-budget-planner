// Phase 31-02 — REG-03: pixel-snapshots regression sanity test.
//
// Цель: доказать, что машинерия `toHaveScreenshot` действительно ловит
// визуальные регрессии. Без такого теста зелёный прогон baseline-спеки
// (v10-pixel-snapshots.spec.ts) недостаточно убедителен — он мог бы
// проходить, даже если diff-логика сломана и всегда возвращает «match».
//
// Стратегия:
//   1. Сделать screenshot чистого Home → сохранить в baseline (один раз,
//      через `--update-snapshots`).
//   2. Перезагрузить страницу, мутировать `body { font-weight: 800 }` через
//      `page.addStyleTag` → визуальный diff гарантированно превысит 2%
//      tolerance (вся типографика становится bold). `toHaveScreenshot`
//      ДОЛЖЕН выбросить — мы это ловим в try/catch.
//   3. Если throw не произошёл — сам сanity-test fail-ит с явным сообщением
//      «diff-detection broken: bold mutation not caught».
//
// По умолчанию весь describe-блок `.skip()`-нут, чтобы:
//   - не требовать baseline-PNG в git (sanity-suite — manual smoke);
//   - не блокировать CI: основная регрессия покрыта v10-pixel-snapshots.spec.
//
// Как включить (manual run, один раз перед релизом):
//   PIXEL_SANITY=1 npx playwright test v10-pixel-snapshots-sanity \
//     --project=chromium-mobile --update-snapshots   # generate baseline
//   PIXEL_SANITY=1 npx playwright test v10-pixel-snapshots-sanity \
//     --project=chromium-mobile                       # assert diff catches
//
// После manual smoke baseline PNG в git НЕ комитим — это разовая проверка.

import { expect, test, type Page } from '@playwright/test';
import { freezeMotion, installOnboardedFixture } from './fixtures/onboarded-user';

const ENABLED = process.env.PIXEL_SANITY === '1';

async function gotoHome(page: Page) {
  await page.goto('/');
  await expect(page.getByText(/Дневной темп/)).toBeVisible({ timeout: 8000 });
  await freezeMotion(page);
}

test.describe('V10 pixel-snapshots sanity (Plan 31-02 / REG-03)', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!ENABLED, 'PIXEL_SANITY=1 not set — manual smoke only.');
    await installOnboardedFixture(page);
  });

  test('diff-detection: bold mutation triggers snapshot fail', async ({
    page,
  }) => {
    // ── Step 1: clean baseline ─────────────────────────────────────
    await gotoHome(page);
    await expect(page).toHaveScreenshot('home-sanity.png', {
      maxDiffPixelRatio: 0.02,
      fullPage: true,
    });

    // ── Step 2: mutate page visually (gross enough to exceed 2% tolerance) ──
    // Reload to flush any cached state, then re-mount with override.
    await gotoHome(page);
    // Inject a CSS override gross enough to guarantee >2% pixel-diff: bump
    // font-weight на body + сдвиг основной разметки на 12px → каждое
    // глифо-пятно сдвигается выше своего baseline. Дополнительно меняем
    // переменную --poster-paper, чтобы фон головы тоже отличался — это
    // покрывает случай, когда font-weight 800 уже близко к V10 жирным
    // 700/800 шрифтам и diff пропускает.
    await page.addStyleTag({
      content: `
        body, body *, body *::before, body *::after {
          font-weight: 800 !important;
          letter-spacing: 0.04em !important;
        }
        body {
          transform: translateY(12px) !important;
          background: #ff00ff !important;
        }
      `,
    });
    // Let layout settle after the style-tag injection (text-metrics +
    // font-weight reflow can shift glyph rasterisation by a frame).
    await page.waitForTimeout(200);

    // ── Step 3: expect snapshot to fail ────────────────────────────
    let detected = false;
    try {
      await expect(page).toHaveScreenshot('home-sanity.png', {
        maxDiffPixelRatio: 0.02,
        fullPage: true,
        timeout: 5_000,
      });
    } catch {
      detected = true;
    }
    expect(detected, 'pixel diff-detection broken: bold-mutation not caught').toBe(
      true,
    );
  });
});
