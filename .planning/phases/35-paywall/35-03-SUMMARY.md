# Plan 35-03 — Summary

**Status:** Shipped 2026-05-11
**Requirements:** REQ-35-05
**Commit:** `698d3e7`

## What was built

1. **`ProTierRequiredError`** в `frontend/src/lib/api/errors.ts` — typed
   API error subclass с `currentTier` + `upgradeUrl` props.
2. **`getMyTier()`** helper в `frontend/src/lib/api/me.ts`.
3. **`PaywallSheet.tsx`** — bottom-sheet (DS §3 styling), 2 SKU (monthly
   299 ₽ + annual 1990 ₽ — annual highlight badge "-44%"), 5 feature
   bullets (AI chat / auto-cat / push / tax / CSV), single ЮKassa CTA.
4. **`PaywallSheet.test.tsx`** — 5 unit cases (render, dismiss, plan
   toggle, CTA click, loading state).

## Verification evidence

- `npm test -- PaywallSheet` → **5 passed**.

## Decisions / surprises

- TG Stars CTA отсутствует в этой итерации (deferred to v1.2 per CONTEXT).
- Annual SKU mapped в backend как single payment 1990 ₽; period detection
  в webhook → v1.2 (currently все = 30 дней).

## Next plan

Plan 35-04 (reverse-trial wire-up on user creation).
