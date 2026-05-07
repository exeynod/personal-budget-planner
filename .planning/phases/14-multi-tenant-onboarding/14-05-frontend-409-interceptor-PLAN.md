---
phase: 14-multi-tenant-onboarding
plan: 05
type: execute
wave: 2
depends_on: [02]
files_modified:
  - frontend/src/api/client.ts
  - frontend/src/screens/OnboardingScreen.tsx
  - frontend/src/App.tsx
  - frontend/src/api/client.test.ts
autonomous: true
requirements: [MTONB-04, MTONB-02]
must_haves:
  truths:
    - "apiFetch throws OnboardingRequiredError (extends ApiError) when response is 409 with body `{detail: {error: \"onboarding_required\"}}`."
    - "Plain ApiError is still thrown for other 409s (e.g. AlreadyOnboardedError) so OnboardingScreen.handleSubmit's existing 409 == complete behaviour does not break."
    - "When OnboardingRequiredError is thrown anywhere in the app, the user is redirected to OnboardingScreen (catch-all in App.tsx)."
    - "OnboardingScreen hero copy ветвится по `me.role`: `member` → «Привет! Несколько шагов и вы готовы вести бюджет»; `owner` → текущая копия."
    - "The frontend continues to render OnboardingScreen as primary route when `me.onboarded_at == null` (no regression)."
  artifacts:
    - path: "frontend/src/api/client.ts"
      provides: "OnboardingRequiredError class + 409 detection in apiFetch"
      contains: "class OnboardingRequiredError"
    - path: "frontend/src/screens/OnboardingScreen.tsx"
      provides: "role-branched hero copy"
      contains: "user.role === 'member'"
    - path: "frontend/src/App.tsx"
      provides: "onOnboardingRequired catch-all routing"
      contains: "OnboardingRequiredError"
    - path: "frontend/src/api/client.test.ts"
      provides: "vitest unit test for 409 detection"
      contains: "OnboardingRequiredError"
  key_links:
    - from: "frontend/src/api/client.ts:apiFetch"
      to: "OnboardingRequiredError"
      via: "throw when status===409 && body.detail.error===onboarding_required"
      pattern: "throw new OnboardingRequiredError"
    - from: "frontend/src/App.tsx"
      to: "OnboardingScreen"
      via: "useState pendingOnboarding flag flipped by error handler"
      pattern: "OnboardingRequiredError"
---

<objective>
Implement the frontend onboarding gate companion (MTONB-04 client side + MTONB-02 hero copy). New `OnboardingRequiredError` class is thrown by `apiFetch` when backend returns 409 onboarding_required. App-level catch flips state so OnboardingScreen renders even outside the normal `me.onboarded_at == null` route. Hero copy in OnboardingScreen branches on `user.role`.

Purpose: When a member somehow makes a call to a gated endpoint between `/me` and the OnboardingScreen mount (race), the 409 must redirect predictably instead of showing a generic error banner. Hero copy personalisation makes the invited-member flow feel intentional rather than identical to owner-onboarding.
Output: 1 new error class + 1 hero copy branch + 1 catch-all hook + 1 unit test for the 409 detection logic.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/14-multi-tenant-onboarding/14-CONTEXT.md
@./CLAUDE.md

<interfaces>
From `frontend/src/api/client.ts` (current):
```typescript
export class ApiError extends Error {
  status: number;
  body: string;
  constructor(message: string, status: number, body: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  // ...sets X-Telegram-Init-Data, calls fetch, throws ApiError on !response.ok
}
```
ApiError carries the raw `body: string` — we will parse the JSON in OnboardingRequiredError detection.

From `frontend/src/api/types.ts`:
```typescript
export type UserRole = 'owner' | 'member' | 'revoked';
export interface MeResponse {
  tg_user_id: number;
  tg_chat_id: number | null;
  cycle_start_day: number;
  onboarded_at: string | null;
  chat_id_known: boolean;
  role: UserRole;
}
```

From `frontend/src/App.tsx` (current routing decision):
```typescript
const isOnboarded = user.onboarded_at !== null;
if (!isOnboarded) {
  return <OnboardingScreen user={user} ... />;
}
```
We will keep this primary path AND add a parallel `pendingOnboarding` state flipped by a catch-all 409 handler. When `pendingOnboarding === true`, force-render OnboardingScreen even if `user.onboarded_at != null` (defence against stale `me`).

From `frontend/src/screens/OnboardingScreen.tsx`:
- Hero block lives at lines 90-100 (`<header>` + `<div className={styles.intro}>`).
- Existing call site `await apiFetch('/onboarding/complete', ...)` already handles `e.status === 409` as already-onboarded — that path is for `AlreadyOnboardedError` (D-10). We must NOT regress it: only the NEW 409 sub-shape (with body.detail.error === 'onboarding_required') should be classified as OnboardingRequiredError.

Frontend test runner: vitest is used (look in `frontend/package.json`). If vitest isn't installed, fall back to a smoke test that imports the module and asserts the class shape via tsc + a tiny Node script. Verify via `cat frontend/package.json | grep -E "vitest|jest"`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add OnboardingRequiredError class + 409 sub-shape detection in apiFetch</name>
  <files>frontend/src/api/client.ts, frontend/src/api/client.test.ts</files>
  <read_first>
    - frontend/src/api/client.ts (full file — only the apiFetch error path and ApiError need changes)
    - frontend/package.json (look for `vitest` or `jest` in devDependencies; pick whichever is configured)
    - frontend/vitest.config.ts or frontend/vite.config.ts (confirm test runner)
  </read_first>
  <behavior>
    - `OnboardingRequiredError extends ApiError`.
    - `apiFetch` parses response body when `response.status === 409`. If JSON.parse succeeds AND `parsed?.detail?.error === 'onboarding_required'` → throw `OnboardingRequiredError`. Else → existing `ApiError`.
    - Other status codes unchanged.
    - Body parsing failure is non-fatal: just throw ApiError with raw body string.
    - Unit test verifies both the onboarding-required and the AlreadyOnboarded 409 paths to prove no false positive.
  </behavior>
  <action>
    **Edit `frontend/src/api/client.ts`:**

    Add new class definition AFTER `ApiError`:
    ```typescript
    /**
     * Phase 14 (MTONB-04 / D-14-01): apiFetch throws this when backend returns
     * 409 with body shape `{"detail": {"error": "onboarding_required"}}`.
     *
     * Caught by App.tsx's onboarding gate to force-render OnboardingScreen
     * even if the cached /me response hasn't yet flipped to onboarded_at===null.
     * Other 409 cases (e.g. AlreadyOnboardedError on /onboarding/complete)
     * remain plain ApiError so existing handlers keep working.
     */
    export class OnboardingRequiredError extends ApiError {
      constructor(body: string) {
        super('onboarding_required', 409, body);
        this.name = 'OnboardingRequiredError';
      }
    }
    ```

    Modify the error path in `apiFetch`:

    Before:
    ```typescript
    if (!response.ok) {
      throw new ApiError(`API ${path} → ${response.status}`, response.status, text);
    }
    ```
    After:
    ```typescript
    if (!response.ok) {
      // Phase 14 (D-14-01): detect 409 onboarding_required sub-shape.
      if (response.status === 409) {
        let parsed: { detail?: { error?: string } } | null = null;
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = null;
        }
        if (parsed?.detail?.error === 'onboarding_required') {
          throw new OnboardingRequiredError(text);
        }
      }
      throw new ApiError(`API ${path} → ${response.status}`, response.status, text);
    }
    ```

    **Create `frontend/src/api/client.test.ts`:**

    Use vitest (per package.json). Four tests:

    ```typescript
    import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

    vi.mock('@telegram-apps/sdk-react', () => ({
      retrieveLaunchParams: () => ({}),
      retrieveRawLaunchParams: () => '',
      openTelegramLink: () => undefined,
    }));

    import { apiFetch, ApiError, OnboardingRequiredError } from './client';

    describe('apiFetch 409 sub-shape detection', () => {
      let fetchSpy: ReturnType<typeof vi.spyOn>;

      beforeEach(() => {
        fetchSpy = vi.spyOn(globalThis, 'fetch');
      });
      afterEach(() => {
        fetchSpy.mockRestore();
      });

      function makeResponse(status: number, body: string): Response {
        return new Response(body, {
          status,
          headers: { 'content-type': 'application/json' },
        });
      }

      it('throws OnboardingRequiredError on 409 onboarding_required body', async () => {
        fetchSpy.mockResolvedValueOnce(
          makeResponse(409, JSON.stringify({ detail: { error: 'onboarding_required' } })),
        );
        await expect(apiFetch('/categories')).rejects.toBeInstanceOf(OnboardingRequiredError);
      });

      it('throws plain ApiError on 409 with different body shape (e.g. AlreadyOnboarded)', async () => {
        fetchSpy.mockResolvedValueOnce(
          makeResponse(409, JSON.stringify({ detail: 'User 123 is already onboarded' })),
        );
        const err = await apiFetch('/onboarding/complete').catch((e) => e);
        expect(err).toBeInstanceOf(ApiError);
        expect(err).not.toBeInstanceOf(OnboardingRequiredError);
        expect(err.status).toBe(409);
      });

      it('throws plain ApiError on 409 with malformed JSON body', async () => {
        fetchSpy.mockResolvedValueOnce(makeResponse(409, '<html>nginx 502</html>'));
        const err = await apiFetch('/anything').catch((e) => e);
        expect(err).toBeInstanceOf(ApiError);
        expect(err).not.toBeInstanceOf(OnboardingRequiredError);
      });

      it('throws plain ApiError on non-409 errors', async () => {
        fetchSpy.mockResolvedValueOnce(makeResponse(403, '{"detail":"Not authorized"}'));
        const err = await apiFetch('/me').catch((e) => e);
        expect(err).toBeInstanceOf(ApiError);
        expect(err).not.toBeInstanceOf(OnboardingRequiredError);
        expect(err.status).toBe(403);
      });
    });
    ```

    Run: `cd frontend && npx vitest run src/api/client.test.ts` — all 4 tests pass.

    If `vitest` is not installed (check `frontend/package.json` `devDependencies`), install it first: `cd frontend && npm install --save-dev vitest @vitest/ui` (record in summary).
  </action>
  <verify>
    <automated>
    cd frontend &amp;&amp; npx vitest run src/api/client.test.ts --reporter=basic 2>&amp;1 | tail -10 | grep -E "(passed|Test Files.*passed)" &amp;&amp; \
    grep -c "class OnboardingRequiredError" frontend/src/api/client.ts | grep -q "^1$" &amp;&amp; \
    grep -c "onboarding_required" frontend/src/api/client.ts | grep -q "^[1-9]$"
    </automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "export class OnboardingRequiredError extends ApiError" frontend/src/api/client.ts` == 1.
    - `grep -c "parsed?.detail?.error === 'onboarding_required'" frontend/src/api/client.ts` == 1.
    - `frontend/src/api/client.test.ts` exists with exactly 4 `it(...)` calls.
    - `cd frontend &amp;&amp; npx vitest run src/api/client.test.ts` exits 0 with 4 passed.
    - `cd frontend &amp;&amp; npx tsc --noEmit` passes (no type regression).
  </acceptance_criteria>
  <done>OnboardingRequiredError exported, 409 sub-shape detected, 4 unit tests GREEN.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Branch OnboardingScreen hero copy on user.role + add App-level catch-all</name>
  <files>frontend/src/screens/OnboardingScreen.tsx, frontend/src/App.tsx</files>
  <read_first>
    - frontend/src/screens/OnboardingScreen.tsx (full file — change ONLY the hero block + header title)
    - frontend/src/App.tsx (full file — add `pendingOnboarding` state + window unhandledrejection listener)
    - frontend/src/api/client.ts (just-edited — confirm `OnboardingRequiredError` export)
  </read_first>
  <behavior>
    1. **Hero copy ветвление:** When `user.role === 'member'` → render hero title "Привет!" / subtitle "Несколько шагов и вы готовы вести бюджет"; header title "Добро пожаловать в команду". When `user.role === 'owner'` → existing copy unchanged.
    2. **App-level catch-all:** Add a `useState` for `pendingOnboarding: boolean`. Install a `window.addEventListener('unhandledrejection', ...)` listener that detects `OnboardingRequiredError` and sets `pendingOnboarding = true`.
    3. After a successful `onComplete()` callback (refetch returns fresh `/me` with `onboarded_at` set), `pendingOnboarding` resets to false.
    4. The primary route (`!isOnboarded`) still triggers OnboardingScreen as today; `pendingOnboarding` is the defensive secondary route.
  </behavior>
  <action>
    **Part 1 — Edit `frontend/src/screens/OnboardingScreen.tsx`:**

    Replace the header title (lines ~91-93). Before:
    ```tsx
    <header className={styles.header}>
      <div className={styles.title}>Добро пожаловать</div>
    </header>
    ```
    After:
    ```tsx
    <header className={styles.header}>
      <div className={styles.title}>
        {user.role === 'member' ? 'Добро пожаловать в команду' : 'Добро пожаловать'}
      </div>
    </header>
    ```

    Replace the hero block (lines ~95-99). Before:
    ```tsx
    <div className={styles.intro}>
      <div className={styles.heroIcon}>💸</div>
      <div className={styles.heroTitle}>Несколько шагов</div>
      <div className={styles.heroHint}>Заполните по порядку — займёт минуту</div>
    </div>
    ```
    After:
    ```tsx
    <div className={styles.intro}>
      <div className={styles.heroIcon}>💸</div>
      {user.role === 'member' ? (
        <>
          <div className={styles.heroTitle}>Привет!</div>
          <div className={styles.heroHint}>Несколько шагов и вы готовы вести бюджет</div>
        </>
      ) : (
        <>
          <div className={styles.heroTitle}>Несколько шагов</div>
          <div className={styles.heroHint}>Заполните по порядку — займёт минуту</div>
        </>
      )}
    </div>
    ```

    **Part 2 — Edit `frontend/src/App.tsx`:**

    Update the React import:
    Before: `import { useState } from 'react';`
    After: `import { useEffect, useState } from 'react';`

    Add a new import:
    ```tsx
    import { OnboardingRequiredError } from './api/client';
    ```

    Inside the `App()` body, add state + effect AFTER `const aiConversation = useAiConversation();`:
    ```tsx
    const [pendingOnboarding, setPendingOnboarding] = useState<boolean>(false);

    useEffect(() => {
      function onUnhandled(ev: PromiseRejectionEvent) {
        // Phase 14 D-14-01: stale /me + 409 race → force OnboardingScreen.
        if (ev.reason instanceof OnboardingRequiredError) {
          ev.preventDefault();
          setPendingOnboarding(true);
        }
      }
      window.addEventListener('unhandledrejection', onUnhandled);
      return () => window.removeEventListener('unhandledrejection', onUnhandled);
    }, []);
    ```

    Modify the existing `if (!isOnboarded)` block:
    Before:
    ```tsx
    if (!isOnboarded) {
      return (
        <div className={styles.appWrapper}>
          <div className={styles.appRoot}>
            <OnboardingScreen
              user={user}
              onRefreshUser={refetch}
              onComplete={() => {
                setActiveTab('home');
                void refetch();
              }}
            />
          </div>
        </div>
      );
    }
    ```
    After:
    ```tsx
    if (!isOnboarded || pendingOnboarding) {
      return (
        <div className={styles.appWrapper}>
          <div className={styles.appRoot}>
            <OnboardingScreen
              user={user}
              onRefreshUser={refetch}
              onComplete={() => {
                setPendingOnboarding(false);
                setActiveTab('home');
                void refetch();
              }}
            />
          </div>
        </div>
      );
    }
    ```

    **Part 3 — Verify build and types:**
    ```bash
    cd frontend && npx tsc --noEmit && npm run build 2>&1 | tail -20
    ```
    Build must succeed; no new TS errors.

    **Part 4 — Manual UX sanity:** deferred to 14-06 verification (no checkpoint here). The hero copy and pendingOnboarding flag are testable manually but adding a Playwright/jest-dom test for the entire Mini App is out of scope; the unit test in Task 1 covers the apiFetch logic; build success + 14-06 integration test covers the rest.
  </action>
  <verify>
    <automated>
    cd frontend &amp;&amp; npx tsc --noEmit 2>&amp;1 | tail -10 &amp;&amp; \
    grep -c "user.role === 'member'" frontend/src/screens/OnboardingScreen.tsx | grep -qE "^[1-9]$" &amp;&amp; \
    grep -c "OnboardingRequiredError" frontend/src/App.tsx | grep -qE "^[1-9]$" &amp;&amp; \
    grep -c "pendingOnboarding" frontend/src/App.tsx | grep -qE "^[1-9]$" &amp;&amp; \
    cd frontend &amp;&amp; npm run build 2>&amp;1 | tail -5
    </automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "user.role === 'member'" frontend/src/screens/OnboardingScreen.tsx` ≥ 2 (one in header, one in hero).
    - `grep -c "Привет!" frontend/src/screens/OnboardingScreen.tsx` == 1.
    - `grep -c "Несколько шагов и вы готовы вести бюджет" frontend/src/screens/OnboardingScreen.tsx` == 1.
    - `grep -c "OnboardingRequiredError" frontend/src/App.tsx` ≥ 2 (import + instanceof check).
    - `grep -c "pendingOnboarding" frontend/src/App.tsx` ≥ 4 (state, setter call sites, condition).
    - `grep -c "unhandledrejection" frontend/src/App.tsx` == 1 (addEventListener call).
    - `cd frontend &amp;&amp; npx tsc --noEmit` exits 0.
    - `cd frontend &amp;&amp; npm run build` exits 0.
    - `cd frontend &amp;&amp; npx vitest run src/api/client.test.ts` still exits 0 with 4 passed (no regression on Task 1 tests).
  </acceptance_criteria>
  <done>OnboardingScreen hero copy ветвится по role; App.tsx катит OnboardingScreen на OnboardingRequiredError; build clean.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries
| Boundary | Description |
|----------|-------------|
| Mini App → /api/v1/* | Untrusted user; backend gate (14-02) primary defence. Frontend gate is UX, not security. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-14-05-01 | Tampering | Member modifies localStorage / runtime to fake `onboarded_at` and bypass OnboardingScreen | accept | Frontend has zero authority — backend 409 short-circuits any gated call. The UI bypass merely shows broken screens; user data stays safe. |
| T-14-05-02 | Information disclosure | Stack trace from OnboardingRequiredError reaches Sentry / logs with body content | accept | Body contains only the literal string `onboarding_required`; no PII. |
| T-14-05-03 | Denial of service | Infinite render loop if pendingOnboarding triggers another 409 inside OnboardingScreen | mitigate | OnboardingScreen calls only `/onboarding/complete` (NOT gated by 14-02), so cannot trigger OnboardingRequiredError. The /me polling inside OnboardingScreen also unaffected (/me is ungated). |
| T-14-05-04 | Tampering | OnboardingRequiredError matched by `instanceof` may fail if module is loaded twice (HMR / lazy chunks) | mitigate | Use `error?.constructor?.name === 'OnboardingRequiredError'` as a defensive secondary check — OPTIONAL hardening; instanceof is sufficient under Vite's single-module guarantee. Out of scope unless tests catch a regression. |
</threat_model>

<verification>
- `cd frontend &amp;&amp; npx vitest run src/api/client.test.ts` → 4 passed.
- `cd frontend &amp;&amp; npx tsc --noEmit` → exit 0.
- `cd frontend &amp;&amp; npm run build` → exit 0.
- Manual UI smoke (deferred to 14-06): seed a member with onboarded_at=NULL via API, open Mini App with their initData → see "Привет!" hero + "Добро пожаловать в команду" header.
</verification>

<success_criteria>
- `OnboardingRequiredError` exported from `frontend/src/api/client.ts`.
- `apiFetch` distinguishes onboarding_required 409 from other 409s.
- 4 vitest cases GREEN.
- Hero copy on OnboardingScreen branches on `user.role === 'member'`.
- App.tsx catches `OnboardingRequiredError` from any unhandled promise rejection and force-renders OnboardingScreen.
- Frontend build succeeds.
</success_criteria>

<output>
After completion, create `.planning/phases/14-multi-tenant-onboarding/14-05-SUMMARY.md`.
</output>
