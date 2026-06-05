// Phase 24-10 (ONB-V10-01 / ONB-V10-06 / ONB-V10-07): end-to-end tests for
// the V10 onboarding flow.
//
// Coverage matrix:
//   1. first-time user lands on Step 01 (trigger logic — onboarded_at null)
//   2. happy path: 4 steps + Final → 200 → draft cleared → home placeholder
//   3. draft persists across reload mid-flight (step 02 → reload → step 02)
//   4. 409 conflict wipes draft + transitions to home
//   5. 422 validation keeps draft + shows error toast
//
// All tests run on Chromium-mobile (Pixel 5 — see playwright.config.ts).
// The onboarding gate itself only calls /me + /onboarding/complete, but the
// success-path tests continue past the gate into the REAL <HomeMount/> (the
// onboarded branch), which fetches /accounts, /categories and the current
// period — those are mocked via mockHomeDataEmpty so the home renders a clean
// ready state instead of an error plate (no backend in CI).

import { test, expect, type Page } from "@playwright/test";
import {
  mockMe,
  mockMeNotOnboarded,
  mockHomeDataEmpty,
  mockOnboardingComplete200,
  mockOnboardingComplete409,
  mockOnboardingComplete422,
  ME_NOT_ONBOARDED,
  ME_ONBOARDED,
  STEP05_DRAFT,
  STORAGE_KEY,
} from "./fixtures/onboarding-mocks";

/**
 * Wipe the draft localStorage key once at the start of a test, NOT on every
 * navigation. `addInitScript` runs on every page load (including reloads),
 * so we guard with a sentinel sessionStorage flag — first load wipes the
 * key, subsequent loads/reloads no-op (preserving any draft the user
 * accumulated mid-test).
 *
 * sessionStorage is per-tab and isolated per Playwright BrowserContext,
 * so cross-test bleed is impossible.
 */
async function clearDraft(page: Page) {
  await page.addInitScript((key) => {
    try {
      const FLAG = "__draft_cleared_once__";
      if (window.sessionStorage.getItem(FLAG) === "1") return;
      window.sessionStorage.setItem(FLAG, "1");
      window.localStorage.removeItem(key);
    } catch {
      /* noop */
    }
  }, STORAGE_KEY);
}

/**
 * Pre-populate localStorage with a draft prior to first navigation.
 * Sentinel-guarded so it only seeds on the FIRST page load — subsequent
 * reloads (if any) read whatever the running app has saved meanwhile.
 */
async function seedDraft(page: Page, draft: object) {
  await page.addInitScript(
    ({ key, payload }) => {
      try {
        const FLAG = "__draft_seeded_once__";
        if (window.sessionStorage.getItem(FLAG) === "1") return;
        window.sessionStorage.setItem(FLAG, "1");
        window.localStorage.setItem(key, JSON.stringify(payload));
      } catch {
        /* noop */
      }
    },
    { key: STORAGE_KEY, payload: draft },
  );
}

// ============================================================
// 1. First-time user — Step 01 renders
// ============================================================

test("onboarding: first-time user sees Step 01 income screen", async ({
  page,
}) => {
  await clearDraft(page);
  await mockMeNotOnboarded(page);

  await page.goto("/");

  await expect(
    page.getByText("ШАГ 01 / 04 · ДОХОД", { exact: false }),
  ).toBeVisible({ timeout: 5000 });
  await expect(page.getByLabel("Доход в месяц, рубли")).toBeVisible();
});

// ============================================================
// 2. Full happy path — 4 steps + Final → 200 → home placeholder
// ============================================================

test("onboarding: full happy path → 200 → draft cleared → home placeholder", async ({
  page,
}) => {
  await clearDraft(page);
  // /me must return not-onboarded until onboarding/complete is POSTed, then
  // the post-submit refetch must return onboarded so the gate flips to
  // HomePlaceholder. Flip on the actual POST rather than a fixed /me call
  // count — the mount-time call count varies with React StrictMode double
  // effects and query dedup, which made the old `flipAfterCall: 2` brittle.
  let submitted = false;
  // Catch-all first (lowest priority) so HomeMount renders cleanly post-flip;
  // /me + /onboarding/complete are registered after → they win for their URLs.
  await mockHomeDataEmpty(page);
  await mockMe(page, {
    initial: ME_NOT_ONBOARDED,
    flipWhen: () => submitted,
    flipTo: ME_ONBOARDED,
  });
  await mockOnboardingComplete200(page, () => {
    submitted = true;
  });

  await page.goto("/");

  // Step 01 — fill income, click ДАЛЕЕ →
  await expect(
    page.getByText("ШАГ 01 / 04 · ДОХОД", { exact: false }),
  ).toBeVisible({ timeout: 5000 });
  await page.getByLabel("Доход в месяц, рубли").fill("120000");
  await page.getByRole("button", { name: /^ДАЛЕЕ →$/ }).click();

  // Step 02 — Т-Банк chip → balance form → ДОБАВИТЬ → ДАЛЕЕ →
  await expect(
    page.getByText("ШАГ 02 / 04 · СЧЕТА", { exact: false }),
  ).toBeVisible({ timeout: 5000 });
  await page.getByRole("button", { name: "Т-Банк" }).click();
  await page.getByLabel("Баланс счёта, рубли").fill("50000");
  await page.getByRole("button", { name: /^ДОБАВИТЬ$/ }).click();
  // Wait until the row appears in the list before advancing — exact match
  // on uppercase row name to avoid colliding with the «Т-Банк» chip
  // (Playwright text matchers are case-insensitive by default).
  await expect(page.getByText("Т-БАНК", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^ДАЛЕЕ →$/ }).click();

  // Step 03 — default allocation already valid (Σshares = 0.83 < income).
  // Just hit ДАЛЕЕ →. Wait for chrome label first to assert we got here.
  await expect(
    page.getByText("ШАГ 03 / 04 · ПЛАН", { exact: false }),
  ).toBeVisible({ timeout: 5000 });
  // NEXT enabled because reducer auto-allocates default plan with Σ < income.
  await page.getByRole("button", { name: /^ДАЛЕЕ →$/ }).click();

  // Step 04 — click ПРОПУСТИТЬ to skip the goal.
  await expect(
    page.getByText("ШАГ 04 / 04 · ЦЕЛЬ", { exact: false }),
  ).toBeVisible({ timeout: 5000 });
  await page.getByRole("button", { name: "Пропустить" }).click();

  // Final — assert hero copy + click НАЧАТЬ →
  await expect(page.getByText("ВСЁ.", { exact: false })).toBeVisible({
    timeout: 5000,
  });
  await expect(
    page.getByText("деньги — под контролем.", { exact: false }),
  ).toBeVisible();

  // Click submit and wait for the response.
  const responsePromise = page.waitForResponse(
    (resp) =>
      resp.url().includes("/api/v1/onboarding/complete") &&
      resp.request().method() === "POST",
  );
  await page.getByRole("button", { name: /^НАЧАТЬ →$/ }).click();
  const submitResponse = await responsePromise;
  expect(submitResponse.status()).toBe(200);

  // Draft cleared after success.
  await expect
    .poll(
      async () =>
        page.evaluate((k) => window.localStorage.getItem(k), STORAGE_KEY),
      { timeout: 5000 },
    )
    .toBeNull();

  // Home placeholder rendered after refetch flips /me to onboarded.
  await expect(page.getByTestId("home-plan-plate")).toBeVisible({
    timeout: 5000,
  });
});

// ============================================================
// 3. Draft persistence across mid-flight reload
// ============================================================

test("onboarding: draft persists across reload mid-flight", async ({
  page,
}) => {
  await clearDraft(page);
  await mockMeNotOnboarded(page);

  await page.goto("/");

  // Step 01
  await page.getByLabel("Доход в месяц, рубли").fill("80000");
  await page.getByRole("button", { name: /^ДАЛЕЕ →$/ }).click();

  // Step 02 — add an account.
  await expect(
    page.getByText("ШАГ 02 / 04 · СЧЕТА", { exact: false }),
  ).toBeVisible({ timeout: 5000 });
  await page.getByRole("button", { name: "Т-Банк" }).click();
  await page.getByLabel("Баланс счёта, рубли").fill("40000");
  await page.getByRole("button", { name: /^ДОБАВИТЬ$/ }).click();
  await expect(page.getByText("Т-БАНК", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^ДАЛЕЕ →$/ }).click();

  // Step 03 reached.
  await expect(
    page.getByText("ШАГ 03 / 04 · ПЛАН", { exact: false }),
  ).toBeVisible({ timeout: 5000 });

  // Verify draft saved to localStorage with step >= 3.
  const draftBefore = await page.evaluate(
    (k) => window.localStorage.getItem(k),
    STORAGE_KEY,
  );
  expect(draftBefore).not.toBeNull();
  const parsed = JSON.parse(draftBefore as string);
  expect(parsed.step).toBeGreaterThanOrEqual(3);
  expect(parsed.income_cents).toBe(8_000_000);
  expect(parsed.accounts).toHaveLength(1);

  // Reload — onboarded_at still null on /me; reducer rehydrates from draft.
  await page.reload();

  await expect(
    page.getByText("ШАГ 03 / 04 · ПЛАН", { exact: false }),
  ).toBeVisible({ timeout: 5000 });

  // Draft still present.
  const draftAfter = await page.evaluate(
    (k) => window.localStorage.getItem(k),
    STORAGE_KEY,
  );
  expect(draftAfter).not.toBeNull();
});

// ============================================================
// 4. 409 conflict — wipes draft, lands on home placeholder
// ============================================================

test("onboarding: 409 wipes draft + transitions to home placeholder", async ({
  page,
}) => {
  // Pre-seed a finished draft so Final renders directly.
  await seedDraft(page, STEP05_DRAFT);
  // /me returns not-onboarded → Final renders. After the 409 POST (already
  // onboarded), the refetch returns onboarded so the gate flips to
  // HomePlaceholder. Flip on the actual POST rather than a fixed /me call
  // count (StrictMode/query-dedup made the old `flipAfterCall: 2` brittle).
  let submitted = false;
  // Catch-all first (lowest priority) so HomeMount renders cleanly post-flip;
  // /me + /onboarding/complete are registered after → they win for their URLs.
  await mockHomeDataEmpty(page);
  await mockMe(page, {
    initial: ME_NOT_ONBOARDED,
    flipWhen: () => submitted,
    flipTo: ME_ONBOARDED,
  });
  await mockOnboardingComplete409(page, () => {
    submitted = true;
  });

  await page.goto("/");

  // Final view should render directly (step=5 in seeded draft).
  await expect(page.getByText("ВСЁ.", { exact: false })).toBeVisible({
    timeout: 5000,
  });

  // Click submit — server returns 409.
  const responsePromise = page.waitForResponse(
    (resp) =>
      resp.url().includes("/api/v1/onboarding/complete") &&
      resp.request().method() === "POST",
  );
  await page.getByRole("button", { name: /^НАЧАТЬ →$/ }).click();
  const submitResponse = await responsePromise;
  expect(submitResponse.status()).toBe(409);

  // Toast: «вы уже завершили онбординг»
  await expect(
    page.getByRole("status").filter({ hasText: /уже завершили онбординг/i }),
  ).toBeVisible({ timeout: 3000 });

  // Draft cleared on 409 path (Final.onStart → draft.clear() before
  // delayed onComplete).
  await expect
    .poll(
      async () =>
        page.evaluate((k) => window.localStorage.getItem(k), STORAGE_KEY),
      { timeout: 5000 },
    )
    .toBeNull();

  // After 1500ms onComplete(null) fires → mount refetches /me → onboarded
  // → home placeholder renders.
  await expect(page.getByTestId("home-plan-plate")).toBeVisible({
    timeout: 6000,
  });
});

// ============================================================
// 5. 422 validation — keeps draft + shows error
// ============================================================

test("onboarding: 422 keeps draft + shows error toast", async ({ page }) => {
  await seedDraft(page, STEP05_DRAFT);
  await mockMeNotOnboarded(page);
  await mockOnboardingComplete422(page);

  await page.goto("/");

  // Final renders directly.
  await expect(page.getByText("ВСЁ.", { exact: false })).toBeVisible({
    timeout: 5000,
  });

  const responsePromise = page.waitForResponse(
    (resp) =>
      resp.url().includes("/api/v1/onboarding/complete") &&
      resp.request().method() === "POST",
  );
  await page.getByRole("button", { name: /^НАЧАТЬ →$/ }).click();
  const submitResponse = await responsePromise;
  expect(submitResponse.status()).toBe(422);

  // Error toast — Final shows fixed russian copy: «Проверьте план: сумма
  // не может превышать доход»
  await expect(
    page.getByRole("status").filter({ hasText: /Проверьте план/i }),
  ).toBeVisible({ timeout: 3000 });

  // Draft NOT cleared on 422.
  const draftAfter = await page.evaluate(
    (k) => window.localStorage.getItem(k),
    STORAGE_KEY,
  );
  expect(draftAfter).not.toBeNull();

  // Still on Final view (no transition to home).
  await expect(page.getByText("ВСЁ.", { exact: false })).toBeVisible();
});
