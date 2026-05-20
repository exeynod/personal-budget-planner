# Drift report — generated `GeneratedDTO.swift` vs handwritten `DTO/*.swift`

**Generated from:** `contract/openapi.json` (Phase 69 B1) via `python3 contract/gen_swift_dto.py`.
**Compared against:** `ios/BudgetPlanner/Networking/DTO/*.swift` (handwritten Codable).
**Status:** REPORT ONLY — no consumer/DTO code changed in 69-03. This is the migration
checklist for **69-05** (read-DTO first). The generated types live under the `Gen`
namespace (`Gen.CategoryRead`, `Gen.SubCycle`, …) so both sets compile together until 69-05.

## How the generator renders required vs optional

Nullability follows the OpenAPI `required` set ONLY:

- in `required`, not nullable → **non-optional** `let x: T` (decoded with `decode`)
- absent from `required` (server `default` OR genuinely optional) → **Swift optional**
  `let x: T?` (decoded with `decodeIfPresent`)

A server `default` keeps a field out of `required`, so it is emitted **optional** even
though the wire always carries it. This is intentional: a 69-05 fixture that omits a
defaulted field must still decode. (This is the one place the iOS generator differs from
the web `openapi-typescript`, which promotes defaulted fields to non-optional. On iOS we
keep them optional to stay fixture-safe; the value is still always present on the wire.)

All generated DTOs decode through the **existing** `APIClient` `JSONDecoder`
(`.convertFromSnakeCase` + the MSK-pinned date strategy). camelCase property names, no
`CodingKeys`, money fields stay `Int`. Transport untouched.

---

## CategoryRead / CategoryV10DTO  (the headline drift)

Handwritten `CategoryV10DTO` (`DTO/CategoryV10DTO.swift`) is a Phase-25-03 stub: it typed
the v1.0 fields as Optional with a **custom `init(from:)`** + `decodeIfPresent`/`try?`
defensive defaults, under the "pending Phase 22 schema" assumption. B1 confirmed the wire
now carries all of them. There is also a thinner `CategoryDTO` (`CommonDTO.swift`, v0.x
6-field shape) used by older call sites.

| field        | generated `Gen.CategoryRead`                | handwritten `CategoryV10DTO`                          | 69-05 action |
|--------------|---------------------------------------------|-------------------------------------------------------|--------------|
| `id`         | `Int` (required)                            | `let id: Int`                                         | keep |
| `name`       | `String` (required)                         | `let name: String`                                    | keep |
| `kind`       | `Gen.CategoryRead.Kind` (`expense\|income`) | `let kind: CategoryKind`                              | keep (enum equiv) |
| `isArchived` | `Bool` (required)                           | `let isArchived: Bool`                                | keep |
| `sortOrder`  | `Int` (required)                            | `let sortOrder: Int`                                  | keep |
| `createdAt`  | **`Date` (required, non-optional)**         | `let createdAt: Date?` + `decodeIfPresent`            | **drop `?` + `decodeIfPresent` → `decode`** (required on wire) |
| `code`       | **`String` (required, non-optional)**       | `let code: String?` + `decodeIfPresent`               | **drop `?` → required `String`** (no server default) |
| `ord`        | **`String` (required, non-optional)**       | `let ord: String?` + `decodeIfPresent`                | **drop `?` → required `String`** (CHAR(2) `'01'..'99'`) |
| `planCents`  | `Int?` (default=0 → optional)               | `let planCents: Int` + `?? 0` fallback                | drop the "pending schema" comment; stays Int (cents) |
| `rollover`   | `Gen.CategoryRead.Rollover?` (default misc) | `let rollover: CategoryRollover` + `?? .misc`         | drop comment; nested enum ≡ `CategoryRollover` |
| `paused`     | `Bool?` (default=false → optional)          | `let paused: Bool` + `?? false`                       | drop comment |
| `parentId`   | `Int?` (optional, nullable)                 | `let parentId: Int?` + `decodeIfPresent`              | matches — keep optional |
| `tag`        | **`Gen.CategoryRead.Tag?` (`personal\|business\|mixed`, default personal)** | **MISSING ENTIRELY** | **ADD `tag`** — wire field (Phase 36), never typed handwritten. Add a `CategoryTag` enum. |

### CategoryV10 — explicit per-plan callouts

- **(a) `code` / `ord` / `createdAt` become NON-optional.** They are in the OpenAPI
  `required` set with no server default. Drop the handwritten `?`, drop the custom
  `decodeIfPresent` stub for them, drop the "pending Phase 22 schema" comment.
- **(b) `planCents` / `rollover` / `paused` stay optional** (server defaults → excluded
  from `required` → generated `T?`). `parentId` stays optional+nullable (matches the
  handwritten DTO). The handwritten `?? 0` / `?? .misc` / `?? false` fallbacks remain
  valid; just drop the "pending schema" framing.
- **(c) `tag` MISSING — add in 69-05.** `CategoryRead` emits
  `tag: "personal"|"business"|"mixed"` (default `"personal"`, Phase 36). The handwritten
  `CategoryV10DTO` (and the v0.x `CategoryDTO`) LACK it entirely. **69-05 must add `tag`**
  plus a `CategoryTag` String enum. This is the primary missing-field drift.

---

## SubscriptionReadV10 / SubscriptionV10DTO

Handwritten `SubscriptionV10DTO` (`DTO/SubscriptionV10DTO.swift`) — custom `init(from:)`.

| field             | generated `Gen.SubscriptionReadV10`        | handwritten `SubscriptionV10DTO`        | 69-05 action |
|-------------------|--------------------------------------------|-----------------------------------------|--------------|
| `id`              | `Int` (required)                           | `let id: Int`                           | keep |
| `name`            | `String` (required)                        | `let name: String`                      | keep |
| `amountCents`     | `Int` (required)                           | `let amountCents: Int`                  | keep |
| `cycle`           | `Gen.SubCycle` (required)                  | `let cycle: SubCycle`                   | keep (enum equiv) |
| `nextChargeDate`  | `Date` (required)                          | `let nextChargeDate: Date`              | keep |
| `categoryId`      | `Int` (required)                           | `let categoryId: Int`                   | keep |
| `notifyDaysBefore`| `Int` (required)                           | `let notifyDaysBefore: Int`             | keep |
| `isActive`        | `Bool` (required)                          | `let isActive: Bool`                    | keep |
| `dayOfMonth`      | `Int?` (optional, nullable, 1..28)         | `let dayOfMonth: Int?`                  | matches — keep optional |
| `accountId`       | `Int?` (optional, nullable)                | `let accountId: Int?`                   | matches — keep optional |
| `postedTxnId`     | `Int?` (optional, nullable)                | `let postedTxnId: Int?`                 | matches — keep optional |
| `category`        | **`Gen.CategoryRead` (required, nested v1.0 object)** | **MISSING** (only `categoryId`) | **nested-object drift** — wire embeds a full `category: CategoryRead`; handwritten flattens to `categoryId` only. 69-05: decide keep-flat vs adopt nested `category` (inherits the v1.0 CategoryRead fields incl. `tag`). |

**Name-collision flag (carry to 69-05):** the contract ALSO has a *different*
`SubscriptionRead` schema — a tier/billing shape (`tier` / `period_start` / `period_end` /
`status`, from `GET /me/subscription`), generated as `Gen.SubscriptionRead`. That is NOT
the subscription-CRUD DTO. The CRUD wire DTO is `SubscriptionReadV10`. 69-05 must map the
handwritten `SubscriptionV10DTO` onto `Gen.SubscriptionReadV10`, not the same-stem billing
schema. (`Gen.SubscriptionPostResponse` ≡ handwritten `SubscriptionPostResponseDTO`.)

---

## MeV10Response / UserDTO

Generated `Gen.MeV10Response` vs handwritten `UserDTO` (`CommonDTO.swift`).

| field               | generated `Gen.MeV10Response` | handwritten `UserDTO`      | action |
|---------------------|-------------------------------|----------------------------|--------|
| `tgUserId`          | `Int` (required)              | `let tgUserId: Int`        | keep |
| `tgChatId`          | `Int?` (optional, nullable)   | `let tgChatId: Int?`       | keep |
| `cycleStartDay`     | `Int` (required)              | `let cycleStartDay: Int`   | keep |
| `onboardedAt`       | **`String?` (optional)**      | `let onboardedAt: Date?`   | **type drift**: wire/generated `String?`; handwritten decodes to `Date?`. Contract types `onboarded_at` as `str` (B1 note — legacy /me serialises via FastAPI default encoder). 69-05: keep `Date?` if the decoder still parses it, else align to `String?`. |
| `chatIdKnown`       | `Bool` (required)             | `let chatIdKnown: Bool`    | keep |
| `role`              | `String` (required)           | `let role: String`         | keep |
| `aiSpendCents`      | `Int` (required)              | `let aiSpendCents: Int`    | keep |
| `aiSpendingCapCents`| `Int` (required)              | `let aiSpendingCapCents: Int` | keep |
| `incomeCents`       | `Int?` (optional, nullable)   | **MISSING**                | **ADD `incomeCents: Int?`** — BE-01 field (nullable until onboarding complete); handwritten `UserDTO` lacks it. |

---

## ActualRead / ActualV10DTO

Handwritten: `ActualDTO` (v0.x, `kind: CategoryKind` — 2 values) + `ActualV10DTO` (v1.0,
`kind: ActualKindV10` — 4 values), both in `DTO/TransactionDTO.swift`.

| field         | generated `Gen.ActualRead`                              | handwritten `ActualV10DTO`     | handwritten `ActualDTO` (v0.x) | 69-05 action |
|---------------|---------------------------------------------------------|--------------------------------|--------------------------------|--------------|
| `id`          | `Int` (required)                                        | `let id: Int`                  | `let id: Int`                  | keep |
| `periodId`    | `Int` (required)                                        | `let periodId: Int`            | `let periodId: Int`            | keep |
| `kind`        | `Gen.ActualRead.Kind` (`expense\|income\|roundup\|deposit`) | `let kind: ActualKindV10`  | `let kind: CategoryKind` (2-val!) | **v0.x `ActualDTO.kind` too narrow** — wire has 4 values; use the 4-value enum |
| `amountCents` | `Int` (required)                                        | `let amountCents: Int`         | `let amountCents: Int`         | keep |
| `description` | `String?` (required-but-nullable → optional)            | `let description: String?`     | `let description: String?`     | keep |
| `categoryId`  | `Int` (required)                                        | `let categoryId: Int`          | `let categoryId: Int`          | keep |
| `txDate`      | `Date` (required)                                       | `let txDate: Date`             | `let txDate: Date`             | keep |
| `source`      | `Gen.ActualRead.Source` (`mini_app\|bot`)               | `let source: ActualSource`     | `let source: ActualSource`     | keep |
| `createdAt`   | **`Date` (required, non-optional)**                     | `let createdAt: Date?`         | `let createdAt: Date?`         | wire is required; handwritten optional is over-defensive (keep or tighten) |
| `accountId`   | `Int?` (optional, nullable)                             | `let accountId: Int?`          | **MISSING**                    | matches `ActualV10DTO` — keep optional |
| `parentTxnId` | `Int?` (optional, nullable)                             | `let parentTxnId: Int?`        | **MISSING**                    | matches `ActualV10DTO` — keep optional |
| `tag`         | **`Gen.ActualRead.Tag?` (`personal\|business\|mixed`)** | **MISSING**                    | **MISSING**                    | **ADD `tag`** — wire emits it (Phase 36); both handwritten Actual DTOs lack it. (Generated as the 3-value enum, optional+nullable.) |

---

## Summary for 69-05 migration

**Missing-field drifts (must ADD):**
1. `CategoryV10DTO` — **`tag`** (`personal|business|mixed`, default personal). Headline.
2. `UserDTO` — **`incomeCents: Int?`** (BE-01).
3. `ActualV10DTO` — **`tag`** (optional, 3-value).

**Required/optional tightening (drop "pending Phase 22 schema" stubs):**
4. `CategoryV10DTO.code` / `.ord` / `.createdAt` → drop `?` + `decodeIfPresent`; required
   on the wire (no server default).
5. `CategoryV10DTO.planCents` / `.rollover` / `.paused` → stay optional (server defaults);
   drop the "pending schema" framing. `parentId` already matches.

**Name-collision / shape flags:**
6. Contract `SubscriptionRead` (tier/billing, `Gen.SubscriptionRead`) ≠ subscription-CRUD
   `SubscriptionReadV10` (`Gen.SubscriptionReadV10`). Map `SubscriptionV10DTO` onto the V10.
7. `SubscriptionReadV10` embeds a nested `category: CategoryRead`; handwritten flattens to
   `categoryId`. Decide keep-flat vs adopt-nested in 69-05.
8. v0.x `ActualDTO.kind` is `CategoryKind` (2 values); wire `kind` has 4. Use `ActualKindV10`.

**Type-shape watch:**
9. `MeV10Response.onboardedAt` is `String?` on the wire/generated; handwritten `UserDTO`
   decodes `Date?`. Confirm the decoder still parses it (the custom date strategy accepts
   ISO-8601), else align.

**Skipped (not domain DTOs, intentional):** `HTTPValidationError` + `ValidationError` —
the Pydantic 422 error envelope. Untyped (`input`) / free-form (`ctx`) fields with no
concrete Swift type; the client never decodes them as typed. `HTTPValidationError` is
transitively skipped because it embeds `[ValidationError]`.
