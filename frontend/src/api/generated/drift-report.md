# Drift report — generated `schema.ts` vs handwritten DTOs

**Generated from:** `contract/openapi.json` (Phase 69 B1) via `npm run gen:api`
(openapi-typescript 7.13.0).
**Compared against:** `frontend/src/api/types.ts` + `frontend/src/api/v10/*`.
**Status:** REPORT ONLY — no consumer/types.ts code changed in 69-02. This report is the
migration checklist for **69-04** (read-DTO first).

## How openapi-typescript v7 renders required vs optional

openapi-typescript marks a generated field **optional (`?:`)** only when it is BOTH absent
from the OpenAPI `required` set AND has no `default`. A field with a server `default` is
emitted **non-optional** (it is always present on the wire — the server fills the default).
So for read DTOs:

- In `required` set, no default → **non-optional** (e.g. `code`, `ord`).
- Has `default` (omitted from `required`) → **non-optional, always present** (e.g.
  `plan_cents=0`, `rollover="misc"`, `paused=false`, `tag="personal"`).
- Neither required nor defaulted, nullable → **optional** `?: T | null` (e.g. `parent_id`).

This matters: the handwritten "pending schema" stubs typed defaulted fields as bare
optional `?:` — the generated truth is they are **always present** on the wire.

---

## CategoryRead / CategoryV10 (the headline drift)

The contract's `CategoryRead` is the v1.0 wire shape (B1 confirmed `code`/`ord` required;
`plan_cents`/`rollover`/`paused`/`parent_id`/`tag` defaulted). Two handwritten types map to
it:

- `types.ts:33 CategoryRead` — bare **v0.x** shape (6 fields). Missing ALL v1.0 fields.
- `types.ts:771 CategoryV10` — v1.0 stub with "pending schema" Optional fields. Missing
  `tag` entirely.

`v10/categories.ts` re-exports `CategoryV10` and carries the "schema gap" doc comment to
remove in 69-04.

| field         | generated (`CategoryRead`)                | handwritten `CategoryV10`              | handwritten `CategoryRead` (v0.x) | 69-04 action |
|---------------|-------------------------------------------|----------------------------------------|-----------------------------------|--------------|
| `id`          | `number` (required)                       | `number`                               | `number`                          | keep |
| `name`        | `string` (required)                       | `string`                               | `string`                          | keep |
| `kind`        | `"expense" \| "income"` (required)        | `CategoryKind`                         | `CategoryKind`                    | keep (alias equiv) |
| `is_archived` | `boolean` (required)                      | `boolean`                              | `boolean`                         | keep |
| `sort_order`  | `number` (required)                       | `number`                               | `number`                          | keep |
| `created_at`  | `string` (required)                       | `string`                               | `string`                          | keep |
| `code`        | **`string` (required, no default)**       | `code?: string \| null` (stub)         | **MISSING**                       | **drop `?`/`\|null` stub → required `string`**; add to v0.x `CategoryRead` |
| `ord`         | **`string` (required, no default)**       | `ord?: string` (stub)                  | **MISSING**                       | **drop `?` stub → required `string`** (CHAR(2) `'01'..'99'`); add to v0.x |
| `plan_cents`  | `number` (default=0, always present)      | `plan_cents?: number` (stub)           | **MISSING**                       | drop "pending schema" comment; non-optional on wire (server default 0) |
| `rollover`    | `"misc" \| "savings"` (default="misc")    | `rollover?: CategoryRollover` (stub)   | **MISSING**                       | drop comment; non-optional on wire (default "misc") |
| `paused`      | `boolean` (default=false, always present) | `paused?: boolean` (stub)              | **MISSING**                       | drop comment; non-optional on wire (default false) |
| `parent_id`   | `number \| null` **(optional)**           | `parent_id?: number \| null` (stub)    | **MISSING**                       | keep optional+nullable (matches); drop "pending" comment |
| `tag`         | **`"personal"\|"business"\|"mixed"` (default="personal", always present)** | **MISSING ENTIRELY** | **MISSING** | **ADD `tag` field** (Phase 36 on the wire, never typed). New `CategoryTag = 'personal'\|'business'\|'mixed'`. |

### CategoryV10 — explicit per-plan callouts

- **(a) `code` and `ord` become required.** Generated as non-optional `string`. The
  handwritten `code?: string | null` and `ord?: string` stubs are wrong: drop the `?`,
  drop the `| null` on `code`. They are required on the wire (no server default).
- **(b) `plan_cents` / `rollover` / `paused` / `parent_id` — defaulted/optional.**
  `plan_cents`/`rollover`/`paused` carry server defaults → openapi-typescript emits them
  **non-optional (always present)**; the only safe optional is `parent_id` (nullable, no
  default). 69-04 should drop the "pending schema" comments. The handwritten optional `?:`
  on the three defaulted fields is over-defensive but type-safe; tightening to non-optional
  is the correctness improvement (matches the wire). `parent_id?: number | null` already
  matches the generated optional shape.
- **(c) `tag` MISSING — add in 69-04.** The wire emits `tag: "personal"|"business"|"mixed"`
  (default `"personal"`, Phase 36). The handwritten `CategoryV10` (and the v0.x
  `CategoryRead`) LACK this field entirely. **69-04 must add it** plus a
  `CategoryTag`/`CategoryTagStr` union. This is the primary missing-field drift.

---

## SubscriptionRead / SubscriptionReadV10

Generated `SubscriptionReadV10` (contract) vs handwritten `SubscriptionRead` (types.ts:264)
+ `SubscriptionV10Ext` (types.ts:310) → `SubscriptionV10Read` intersection (types.ts:317).
The handwritten base + ext together cover the wire, but nullability differs.

| field               | generated (`SubscriptionReadV10`)        | handwritten                                   | 69-04 action |
|---------------------|------------------------------------------|-----------------------------------------------|--------------|
| `id`                | `number` (required)                      | `SubscriptionRead.id: number`                 | keep |
| `name`              | `string` (required)                      | `name: string`                                | keep |
| `amount_cents`      | `number` (required)                      | `amount_cents: number`                        | keep |
| `cycle`             | `SubCycle` ref (required)                | `cycle: SubCycle`                             | keep (enum equiv) |
| `next_charge_date`  | `string` (required)                      | `next_charge_date: string`                    | keep |
| `category_id`       | `number` (required)                      | `category_id: number`                         | keep |
| `notify_days_before`| `number` (required)                      | `notify_days_before: number`                  | keep |
| `is_active`         | `boolean` (required)                     | `is_active: boolean`                          | keep |
| `category`          | `CategoryRead` ref (required, **v1.0**)  | `category: CategoryRead` (**v0.x bare shape**)| **nested drift** — once `CategoryRead` gains v1.0 fields (above), the nested `category` inherits `code`/`ord`/`tag`/... |
| `account_id`        | `number \| null` **(optional)**          | `SubscriptionV10Ext.account_id?: number\|null`| keep optional+nullable (matches) |
| `day_of_month`      | `number \| null` **(optional)**          | `SubscriptionV10Ext.day_of_month?: number\|null`| keep optional+nullable (matches) |
| `posted_txn_id`     | `number \| null` **(optional)**          | `SubscriptionV10Ext.posted_txn_id?: number\|null`| keep optional+nullable (matches) |

**Note:** the legacy `SubscriptionRead` schema in the contract is a *different* tier/billing
shape (`tier`, `period_start`, `period_end`, `status`) — NOT the subscription-CRUD DTO. The
CRUD wire DTO is `SubscriptionReadV10`. 69-04 must map the handwritten `SubscriptionRead`
(CRUD) onto generated `SubscriptionReadV10`, not the same-named billing schema. **Name
collision flag** for 69-04.

---

## MeV10Response

Generated `MeV10Response` vs handwritten `types.ts:92 MeV10Response`. **No drift** —
field-for-field match including nullability.

| field                  | generated                | handwritten              | action |
|------------------------|--------------------------|--------------------------|--------|
| `tg_user_id`           | `number` (required)      | `number`                 | keep |
| `tg_chat_id`           | `number \| null` (opt)   | `number \| null`         | keep |
| `cycle_start_day`      | `number` (required)      | `number`                 | keep |
| `onboarded_at`         | `string \| null` (opt)   | `string \| null`         | keep |
| `chat_id_known`        | `boolean` (required)     | `boolean`                | keep |
| `role`                 | `string` (required)      | `UserRole`               | keep (alias equiv) |
| `ai_spend_cents`       | `number` (required)      | `number`                 | keep |
| `ai_spending_cap_cents`| `number` (required)      | `number`                 | keep |
| `income_cents`         | `number \| null` (opt)   | `number \| null`         | keep |

---

## ActualRead / ActualV10Read

Generated `ActualRead` (contract) vs handwritten `types.ts:200 ActualRead` (v0.x) +
`types.ts:672 ActualV10Read` (v1.0).

| field           | generated (`ActualRead`)                          | handwritten `ActualV10Read`        | handwritten `ActualRead` (v0.x) | 69-04 action |
|-----------------|---------------------------------------------------|------------------------------------|---------------------------------|--------------|
| `id`            | `number` (required)                               | `number`                           | `number`                        | keep |
| `period_id`     | `number` (required)                               | `number`                           | `number`                        | keep |
| `kind`          | `"expense"\|"income"\|"roundup"\|"deposit"` (req) | `ActualV10Kind`                    | `CategoryKind` (only 2 values!) | **v0.x ActualRead.kind is too narrow** — wire has 4 values; ActualV10Kind covers it |
| `amount_cents`  | `number` (required)                               | `number`                           | `number`                        | keep |
| `description`   | `string \| null` (required, nullable)             | `string \| null`                   | `string \| null`                | keep |
| `category_id`   | `number` (required)                               | `number`                           | `number`                        | keep |
| `tx_date`       | `string` (required)                               | `string`                           | `string`                        | keep |
| `source`        | `"mini_app" \| "bot"` (required)                  | `ActualSource`                     | `ActualSource`                  | keep |
| `created_at`    | `string` (required)                               | `string`                           | `string`                        | keep |
| `account_id`    | `number \| null` **(optional)**                   | `account_id: number \| null` (req!)| **MISSING**                     | generated optional vs handwritten required — **nullability mismatch**, see below |
| `parent_txn_id` | `number \| null` **(optional)**                   | `parent_txn_id: number \| null`(req!)| **MISSING**                   | generated optional vs handwritten required — **nullability mismatch** |
| `tag`           | **`string \| null` (optional)**                   | **MISSING**                        | **MISSING**                     | **ADD `tag?: string \| null`** — wire emits it, neither handwritten DTO has it |

### Actual nullability mismatches (avoid runtime crash in 69-04)

- `account_id` / `parent_txn_id`: generated as **optional** (`?: number | null`) but the
  handwritten `ActualV10Read` declares them **non-optional** (`number | null`, always
  present). The contract omits them from `required` (no default), so the field MAY be
  absent. 69-04 should keep them optional to match the wire — tightening to required
  risks a runtime `undefined` where code assumes `null`. Low risk (BE likely always
  emits), but the generated type is the conservative truth.
- `tag` (Actual): wire emits `tag: string | null` (optional). Both handwritten Actual DTOs
  lack it. 69-04 adds `tag?: string | null`. (Same Phase 36 tag concept as CategoryRead,
  but typed as free `string` on the actual-txn wire, not the 3-value enum.)

---

## Summary for 69-04 migration

**Missing-field drifts (must ADD):**
1. `CategoryRead`/`CategoryV10` — **`tag`** (`"personal"|"business"|"mixed"`, default
   "personal"). The headline drift. Add `CategoryTag` union.
2. `ActualRead`/`ActualV10Read` — **`tag`** (`string | null`, optional).

**Required/optional tightening (drop "pending schema" stubs):**
3. `CategoryV10.code` / `.ord` — drop `?` (and `code`'s `| null`); they are required on
   the wire.
4. `CategoryV10.plan_cents` / `.rollover` / `.paused` — non-optional on the wire (server
   defaults); drop "pending schema" comments. `parent_id` already matches (optional+nullable).
5. Bare v0.x `CategoryRead` (types.ts:33) — promote to the full v1.0 shape (or fold into
   the generated type) so the nested `SubscriptionReadV10.category` carries v1.0 fields.

**Name-collision / shape flags:**
6. Contract `SubscriptionRead` (tier/billing) ≠ handwritten `SubscriptionRead` (CRUD). The
   CRUD wire DTO is `SubscriptionReadV10`. Map carefully.
7. v0.x `ActualRead.kind` is `CategoryKind` (2 values) but the wire `kind` has 4
   (`expense|income|roundup|deposit`). Use `ActualV10Kind`.

**Nullability watch (avoid crash):**
8. `ActualV10Read.account_id` / `.parent_txn_id` — generated optional vs handwritten
   required; keep optional in 69-04 to match the wire.

**Matches (no action):** `MeV10Response` (exact), Subscription v10 ext fields
(`account_id`/`day_of_month`/`posted_txn_id` all optional+nullable).
