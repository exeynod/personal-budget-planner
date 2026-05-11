# Plan 34-06 — Summary

**Status:** Shipped 2026-05-11
**Requirements:** REQ-34-04 (frontend slice)
**Commit:** `5fbdd7c`

## What was built

1. **`frontend/src/api/billing.ts`** — typed wrappers вокруг `apiFetch`:
   - `createPayment(req: PaymentCreateRequest): Promise<PaymentCreateResponse>`.
   - `getMySubscription(): Promise<SubscriptionRead | null>`.
   - `cancelMySubscription(): Promise<{status: string}>`.
   - Все три используют `apiFetch` из `./client` (auto-prefixes `/api/v1`).
2. **`frontend/src/components/PaymentButton.tsx`** — single button:
   - Props: `amountCents`, `description?`, `className?`.
   - On click → `createPayment(...)` → `window.location.assign(confirmation_url)`.
   - Loading state: "Перенаправление…"; error state: role="alert" div.
   - `data-testid="pay-via-yookassa"` для Playwright UAT.

## Verification evidence

- `cd frontend && npx tsc --noEmit 2>&1 | grep -E "billing\.ts|PaymentButton"` → empty (no new errors).
- Files added in 2 file change commit.

## Decisions / surprises

- `apiFetch` path lives в `./client` (NOT `./http` как первоначально предполагалось) — `frontend/src/api/me.ts` использует тот же импорт; обновлено в `billing.ts`.
- `return_url` берётся из `window.location.href` — после оплаты ЮKassa возвращает на текущий screen.

## Next plan

Plan 34-07 (operator onboarding doc) — manual setup checklist для registration на ЮKassa.
