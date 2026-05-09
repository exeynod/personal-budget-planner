import { test, expect, type Page } from '@playwright/test';

/**
 * SEC-01 regression: adversarial markdown from assistant must NOT execute JS.
 *
 * Strategy:
 *  - Mock the bootstrap API surface (/me, /periods, /categories, /ai/history, /ai/usage)
 *    so the SPA reaches the main shell and AI tab can be opened.
 *  - /api/v1/ai/history returns a single assistant message with payload
 *    `**<img src=x onerror=window.__xss=1>**`.
 *  - Click AI tab in BottomNav (app uses state-based tabs, not URL routing).
 *  - After messages render, evaluate `window.__xss` and inspect DOM for active
 *    <img onerror> nodes.
 *
 * Expected after SEC-01 fix:
 *  - window.__xss === undefined (no JS execution)
 *  - DOM contains zero `img[onerror]` elements
 *  - The literal angle-bracket text is visible (escaped to &lt;img...).
 */

const ADVERSARIAL = '**<img src=x onerror=window.__xss=1>**';

async function mockApi(page: Page) {
  await page.route('**/api/v1/**', (route) => {
    const url = route.request().url();

    if (url.includes('/api/v1/me')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tg_user_id: 123456789,
          tg_chat_id: null,
          cycle_start_day: 5,
          onboarded_at: '2026-04-05T00:00:00+00:00',
          chat_id_known: false,
          role: 'owner',
          ai_spend_cents: 0,
          ai_spending_cap_cents: 46500,
        }),
      });
    }
    if (url.includes('/api/v1/ai/history')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          messages: [
            {
              id: 1,
              role: 'assistant',
              content: ADVERSARIAL,
              tool_name: null,
              created_at: '2026-05-07T12:00:00Z',
            },
          ],
        }),
      });
    }
    if (url.match(/\/api\/v1\/periods\/\d+\/balance/)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ period_id: 1, balance_now_cents: 0, by_category: [] }),
      });
    }
    if (url.includes('/api/v1/periods/current')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 1,
          period_start: '2026-04-05',
          period_end: '2026-05-04',
          starting_balance_cents: 100000,
          ending_balance_cents: null,
          status: 'active',
          closed_at: null,
        }),
      });
    }
    if (url.includes('/api/v1/periods')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 1,
            period_start: '2026-04-05',
            period_end: '2026-05-04',
            starting_balance_cents: 100000,
            ending_balance_cents: null,
            status: 'active',
            closed_at: null,
          },
        ]),
      });
    }
    if (url.includes('/api/v1/categories')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 1, name: 'Еда', kind: 'expense', is_archived: false, sort_order: 1 },
        ]),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
}

test('SEC-01: adversarial markdown does not execute JS', async ({ page }) => {
  // Use mobile-portrait viewport so BottomNav stays inside the visible
  // 420px-wide phone-column (App.module.css uses radial-gradient + centered
  // column at >=540px which can place tabs off-screen in default 1280×720).
  await page.setViewportSize({ width: 390, height: 844 });

  // Telegram initData mock — same pattern as home.spec.ts (apps work without it
  // since /me is mocked, but addInitScript guards against SDK-side throws).
  await page.addInitScript(() => {
    (window as unknown as { Telegram: unknown }).Telegram = {
      WebApp: {
        initData: 'mock=true',
        initDataUnsafe: { user: { id: 123 } },
        ready: () => undefined,
        expand: () => undefined,
        themeParams: {},
      },
    };
  });

  await mockApi(page);
  await page.goto('/');

  // Wait for app shell to load (loading state cleared).
  await expect(page.locator('text=Загрузка…')).not.toBeVisible({ timeout: 10000 });

  // Navigate to AI tab. Direct aria-label CSS selector (а не getByRole с
  // {exact:true}) — последний на CI Linux runner иногда таймаутится из-за
  // конфликта между aria-label="AI" на <button> и текстом "AI" в дочернем
  // <span>. aria-label сам по себе уникален.
  // Сначала ждём что BottomNav смонтировался (после убывания "Загрузка…"
  // App может ещё рендерить screenSlot animation), потом dispatchEvent
  // обходит visibility check (safe-area inset/100dvh).
  const aiTab = page.locator('button[aria-label="AI"]').first();
  await expect(aiTab).toBeAttached({ timeout: 10000 });
  await aiTab.dispatchEvent('click');

  // Wait for the assistant chat bubble to mount. We poll for either
  //  (a) the literal escaped text (post-fix path), OR
  //  (b) any <img> tag in the assistant area (pre-fix XSS path).
  // Either condition means the message rendered — then we assert no XSS fired.
  await page.waitForFunction(
    () => {
      const bubbles = document.querySelectorAll('[class*="assistant"]');
      for (const b of Array.from(bubbles)) {
        if (b.textContent?.includes('<img src=x onerror=window.__xss=1>')) return true;
        if (b.querySelector('img')) return true;
      }
      return false;
    },
    null,
    { timeout: 5000 },
  );

  // CRITICAL ASSERTION: window.__xss must be undefined — XSS did NOT fire.
  // Pre-fix: <img onerror> renders in DOM and Chromium executes the handler,
  //   setting window.__xss = 1 — assertion FAILS (RED).
  // Post-fix: < becomes &lt; before reaching innerHTML, no <img> is parsed,
  //   handler never runs — window.__xss stays undefined (GREEN).
  const xss = await page.evaluate(() => (window as unknown as { __xss?: number }).__xss);
  expect(xss).toBeUndefined();

  // Defense-in-depth: never an active <img onerror> in DOM.
  const imgWithOnerror = await page.locator('img[onerror]').count();
  expect(imgWithOnerror).toBe(0);

  // And no <img> tag at all from this payload (escape converted < to &lt;).
  const anyImg = await page.locator('[class*="assistant"] img').count();
  expect(anyImg).toBe(0);
});
