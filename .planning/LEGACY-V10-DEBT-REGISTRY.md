# Legacy ↔ V10 API Convergence — Debt Registry

> Single index for the iOS legacy enum-API → V10 canonical convergence (Workstream C / R3, Phase 70-01).
>
> **Owner decision (R6):** KEEP BOTH SHELLS forever (`MainShell` v06 ↔ `V10MainShell`). Convergence is at the **API / DTO level only** — no shell or View is deleted. Where a legacy enum and its V10 counterpart are NOT provably equivalent (different DTO shape, or V10 missing create/delete), the legacy enum stays in place, is marked `@available(*, deprecated, message:)`, and is ticketed below instead of being force-migrated.
>
> **Convention:** "canonical" = the enum a *new* call-site should prefer. A canonical pick does NOT imply the legacy enum is migratable today — see each ticket's equivalence verdict.

## Convergence audit summary

| Route | Legacy enum (file) | V10 enum (file) | Canonical | Equivalent? | Disposition | Ticket |
|-------|--------------------|-----------------|-----------|-------------|-------------|--------|
| GET /me | `MeAPI.current()` → `UserDTO` (`AuthAPI.swift` ~16; 1 call-site) | `MeV10API.shared.fetchMeV10()` → `MeV10Response` (`MeAPI.swift`) | MeV10 (superset) | **NO** — different DTO (`UserDTO` vs `MeV10Response`); `AuthStore` depends on the `UserDTO` shape | Deprecate `MeAPI`; leave call-site | DEBT-70-ME |
| GET /categories | `CategoriesAPI.list()` → `[CategoryDTO]` (`AuthAPI.swift` ~23; 5 call-sites) | `CategoriesV10API.list()` → `[CategoryV10DTO]` (`CategoriesV10API.swift`) | V10 (4-valued superset) | **NO** — `CategoryDTO` (2-valued `CategoryKind`) vs `CategoryV10DTO` (4-valued); v06 screens decode the 2-valued shape | Deprecate `CategoriesAPI`; leave 5 call-sites | DEBT-70-CAT |
| POST/PATCH/DELETE /actual | `ActualAPI` (`TransactionsAPI.swift`; create/update used by v06, **delete shared by BOTH shells**) | `ActualV10API` (list/create only) (`TransactionsAPI.swift`) | mixed — `ActualV10API` lacks update + delete | **PARTIAL** — `ActualAPI.delete` is the canonical shared delete already used by V10 VMs | Deprecate `ActualAPI.create` + `.update` only; **keep `.delete` un-deprecated** (canonical-shared) | DEBT-70-ACT |
| GET/POST/PATCH /subscriptions | `SubscriptionsAPI` (`ManagementAPI.swift`; create + update still called by v06) | `SubscriptionsV10API` (no create) (`SubscriptionsV10API.swift`) | mixed — V10 lacks create | **NO** — V10 has no create; v06 editor needs legacy create then V10 patch | Deprecate `SubscriptionsAPI`; leave create/update call-sites | DEBT-70-SUB |
| POST/PATCH/DELETE /categories (write) | `CategoriesWriteAPI` (`TransactionsAPI.swift`; create/update/delete in `CategoriesView`) | `CategoriesV10API.update` (no create/delete) (`CategoriesV10API.swift`) | mixed — V10 lacks create + delete | **NO** — V10 has no create/delete; v06 management needs them | Deprecate `CategoriesWriteAPI` with message naming the V10 create/delete gap | DEBT-70-CATW |

**Net call-site migrations performed this plan: 0.** Every legacy↔V10 pair is non-equivalent (DTO divergence or missing V10 verbs). `ActualAPI.delete` is the lone canonical-shared route and is intentionally left un-deprecated — it is already the delete both shells call.

---

## DEBT-70-ME — /me: MeAPI → MeV10API

- **Legacy enum:** `MeAPI.current()` → `UserDTO` — `ios/BudgetPlanner/Networking/Endpoints/AuthAPI.swift` (~line 16)
- **V10 enum (canonical):** `MeV10API.shared.fetchMeV10()` → `MeV10Response` — `ios/BudgetPlanner/Networking/Endpoints/MeAPI.swift`
- **Canonical pick:** `MeV10API` (`MeV10Response` is the superset; mirrors `app/api/schemas/me_v10.py`).
- **Equivalence blocker:** `UserDTO` and `MeV10Response` are different decoded shapes. `Auth/AuthStore.swift:70` consumes the `UserDTO` shape directly (owner gating, onboarding flags). Swapping to `MeV10Response` would change the type `AuthStore` stores and reasons over — a behavioral change, not a 1:1 swap. Per 69-03 drift-report, `UserDTO` also needs `incomeCents: Int?` + `onboardedAt` reconciliation (`String?` vs `Date?`) before any merge.
- **Current call-sites (1):** `Auth/AuthStore.swift:70` (`let user = try await MeAPI.current()`).
- **Disposition:** Deprecate `MeAPI`. Leave the call-site (warning expected, not an error).
- **Follow-up action (what makes migration safe):** Reconcile `UserDTO` ↔ `MeV10Response` after the D shared-domain extraction (R6) or once the write-DTO codegen tail (69-05) lands a single canonical user shape; then point `AuthStore` at `MeV10API` and delete `MeAPI`.

## DEBT-70-CAT — /categories (read): CategoriesAPI → CategoriesV10API

- **Legacy enum:** `CategoriesAPI.list()` → `[CategoryDTO]` — `ios/BudgetPlanner/Networking/Endpoints/AuthAPI.swift` (~line 23)
- **V10 enum (canonical):** `CategoriesV10API.list()` → `[CategoryV10DTO]` — `ios/BudgetPlanner/Networking/Endpoints/CategoriesV10API.swift`
- **Canonical pick:** `CategoriesV10API` (`CategoryV10DTO` is the 4-valued superset).
- **Equivalence blocker:** `CategoryDTO` carries the 2-valued `CategoryKind`; `CategoryV10DTO` carries the 4-valued `ActualKindV10` plus v1.0 fields (`code`/`ord` now required per 69-02/69-03 drift, plus `tag`). The v06 Home / Template / Categories / AI screens decode the 2-valued shape and branch on it; changing the decoded type is behavioral. This is the same 2-val-vs-4-val divergence flagged in the 69 drift-reports.
- **Current call-sites (5):**
  - `Features/Management/TemplateView.swift:21`
  - `Features/Home/HomeView.swift:21`
  - `Features/Management/CategoriesView.swift:30`
  - `Features/Management/SubscriptionsView.swift:43`
  - `Features/AI/AIChatView.swift:32`
- **Disposition:** Deprecate `CategoriesAPI`. Leave all 5 call-sites.
- **Follow-up action:** After the D shared-domain extraction gives a single category-projection layer (or the codegen tail fixes `CategoryV10DTO` optionality so v06 can decode it), migrate the 5 call-sites to `CategoriesV10API` and delete `CategoriesAPI`.

## DEBT-70-ACT — /actual (write): ActualAPI.create/update → ActualV10API

- **Legacy enum:** `ActualAPI` — `ios/BudgetPlanner/Networking/Endpoints/TransactionsAPI.swift` (~line 4). `create` + `update` used by v06; `delete` shared by BOTH shells.
- **V10 enum (canonical for create/list):** `ActualV10API` (`list` + `create` only; **no `update`, no `delete`**) — `ios/BudgetPlanner/Networking/Endpoints/TransactionsAPI.swift` (~line 44)
- **Canonical pick:** mixed. `ActualV10API.create` is canonical for v1.0 create (delta-balance + roundup hook). `ActualAPI.delete` is the **canonical shared delete** for both shells. `ActualAPI.update` has no V10 counterpart.
- **Equivalence blocker:** `ActualV10API` lacks `update` and `delete`. `ActualAPI.create` returns `ActualDTO` (2-valued); `ActualV10API.create` returns `ActualV10DTO` (4-valued + nullable `accountId`/`parentTxnId`). The v06 `TransactionEditor` decodes `ActualDTO`, so its create/update path cannot swap to V10 without a decoded-shape change.
- **Current call-sites:**
  - `ActualAPI.create` (2): `Features/Transactions/TransactionEditor.swift:319`, `Features/AI/AIChatView.swift:124`
  - `ActualAPI.update` (1): `Features/Transactions/TransactionEditor.swift:339`
  - `ActualAPI.delete` (canonical-shared, NOT deprecated): `Features/Transactions/TransactionsView.swift:252` (v06), `FeaturesV10/Transactions/TransactionsV10ViewModel.swift:165` (V10), referenced by `FeaturesV10/AddSheet/AddSheetViewModel.swift`.
- **Disposition:** Deprecate `ActualAPI.create` + `ActualAPI.update` only. **Leave `ActualAPI.delete` un-deprecated** with a `/// Canonical shared delete` doc-comment — both shells keep calling it.
- **Follow-up action:** Add `update` + `delete` to `ActualV10API` (V10 parity), reconcile `ActualDTO` ↔ `ActualV10DTO` (4-val kind, `tag`), then migrate v06 create/update and delete `ActualAPI.create`/`.update`. Once V10 owns delete, retire `ActualAPI` entirely.

## DEBT-70-SUB — /subscriptions: SubscriptionsAPI → SubscriptionsV10API

- **Legacy enum:** `SubscriptionsAPI` — `ios/BudgetPlanner/Networking/Endpoints/ManagementAPI.swift` (~line 4). `create` + `update` still called by v06.
- **V10 enum (canonical for read/patch):** `SubscriptionsV10API` (**no `create`**) — `ios/BudgetPlanner/Networking/Endpoints/SubscriptionsV10API.swift`
- **Canonical pick:** mixed. `SubscriptionsV10API` is canonical for read + patch; it has no create.
- **Equivalence blocker:** `SubscriptionsV10API` has no `create`. The v06 `SubscriptionsView` editor flow (documented at `SubscriptionsView.swift:521-524`) deliberately uses legacy `SubscriptionsAPI.create` for the create, then V10 patch for follow-up scalars/date. There is also a contract name-collision flagged in the 69 drift-reports (`SubscriptionRead` tier/billing shape vs `SubscriptionReadV10`, nested category vs flat `categoryId`).
- **Current call-sites (2):** `Features/Management/SubscriptionsView.swift:804` (`SubscriptionsAPI.create`), `Features/Management/SubscriptionsView.swift:832` (`SubscriptionsAPI.update`). (`.list`/`.delete` not currently called via this enum.)
- **Disposition:** Deprecate `SubscriptionsAPI`. Leave the create/update call-sites.
- **Follow-up action:** Add `create` to `SubscriptionsV10API` (V10 create parity) and resolve the `SubscriptionRead` vs `SubscriptionReadV10` name/shape collision; this is also the target domain for the R6 shared-store extraction (70-04 / 70-05). After both land, migrate `SubscriptionsView` fully to V10 and delete `SubscriptionsAPI`.

## DEBT-70-CATW — /categories (write): CategoriesWriteAPI → CategoriesV10API

- **Legacy enum:** `CategoriesWriteAPI` — `ios/BudgetPlanner/Networking/Endpoints/TransactionsAPI.swift` (~line 103). `create` / `update` / `delete` used in management.
- **V10 enum (canonical for update):** `CategoriesV10API.update` (**no `create`, no `delete`**) — `ios/BudgetPlanner/Networking/Endpoints/CategoriesV10API.swift`
- **Canonical pick:** mixed. `CategoriesV10API.update` is canonical for category patch; V10 has neither create nor delete.
- **Equivalence blocker:** `CategoriesV10API` exposes only `update`. The v06 `CategoriesView` needs create AND delete, which V10 does not provide; it also returns/decodes `CategoryV10DTO` (4-valued) while v06 write paths use the 2-valued `CategoryDTO`/`CategoryCreateRequest`/`CategoryUpdateRequest`.
- **Current call-sites (4):**
  - `Features/Management/CategoriesView.swift:41` (`CategoriesWriteAPI.create`)
  - `Features/Management/CategoriesView.swift:53` (`CategoriesWriteAPI.update` — rename)
  - `Features/Management/CategoriesView.swift:65` (`CategoriesWriteAPI.update` — archive)
  - `Features/Management/CategoriesView.swift:77` (`CategoriesWriteAPI.update` — unarchive)
- **Disposition:** Deprecate `CategoriesWriteAPI`; the deprecation message names the V10 create/delete gap explicitly.
- **Follow-up action:** Add `create` + `delete` to `CategoriesV10API` (write parity) and reconcile `CategoryV10DTO` write-DTO shapes (codegen tail 69-05). Then migrate the 4 `CategoriesView` call-sites and delete `CategoriesWriteAPI`.

---

## Comment debt — sources

The codebase carries dozens of inline `legacy ↔ V10` / `parallel to legacy` / `v0.x` orientation comments. This registry is their single index. **These comments are intentionally NOT deleted in 70-01** — they remain useful navigation aids until the corresponding DEBT-70-* ticket retires the legacy enum. Files known to carry such comments:

- `App/AppRouter.swift` — shell selection (`MainShell` v06 ↔ `V10MainShell`) commentary.
- `Networking/Endpoints/*API.swift` — `AuthAPI.swift`, `TransactionsAPI.swift` (`ActualV10API` "parallel to legacy ActualAPI" header), `ManagementAPI.swift`, `MeAPI.swift` (rename rationale), `CategoriesV10API.swift`, `SubscriptionsV10API.swift`.
- `Networking/DTO/*` — DTO mirrors that note the 2-val vs 4-val / `tag` / optionality divergence (cross-ref 69-02 / 69-03 drift-reports).
- `Features/*` (v06) — `Home/HomeView.swift`, `Transactions/TransactionsView.swift` + `TransactionEditor.swift`, `Management/CategoriesView.swift` + `TemplateView.swift` + `SubscriptionsView.swift` (editor flow notes at ~521-524), `AI/AIChatView.swift`.
- `FeaturesV10/*` (V10) — `Transactions/TransactionsV10ViewModel.swift` + `AddSheet/AddSheetViewModel.swift` ("reuses the existing `ActualAPI.delete`" notes).

When a DEBT-70-* ticket is closed (legacy enum deleted), strip the now-stale orientation comments in the listed files as part of that ticket's cleanup.
