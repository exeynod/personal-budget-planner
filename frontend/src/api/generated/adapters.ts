/**
 * Generated-schema → consumer-name adapter layer (Phase 69 B4).
 *
 * `openapi-typescript` (see `schema.ts`, regenerated via `npm run gen:api`)
 * emits every component under `components["schemas"]["X"]`. Rather than churn
 * every call-site to that verbose path, this hand-written module aliases the
 * generated read-DTO schemas onto the names the web consumers already import
 * (`CategoryV10`, `MeV10Response`, `ActualV10Read`, ...).
 *
 * RULES:
 *  - This file maps generated → consumer names ONLY. It is the single seam
 *    where the generated truth meets the handwritten barrel (`../types`).
 *  - `schema.ts` is generated — never hand-edit it. Edit THIS file (or the
 *    OpenAPI contract upstream) instead.
 *  - Phase 69 scope is READ-DTOs. Write/request payloads stay handwritten in
 *    `../types` (deferred to Phase 70 / backlog per 69-CONTEXT).
 *
 * Required-vs-optional is taken verbatim from the generated schema's
 * `required` set (= the real `openapi.json`). openapi-typescript renders a
 * field non-optional when it is in `required` OR carries a server `default`
 * (always present on the wire), and optional (`?: T | null`) only when it is
 * neither required nor defaulted but nullable. So for `CategoryRead`:
 *  - `code` / `ord`            — required, no default → non-optional `string`
 *  - `plan_cents` / `rollover` / `paused` / `tag` — server-defaulted → always
 *    present on the wire → non-optional
 *  - `parent_id`              — neither required nor defaulted → optional+nullable
 */
import type { components } from './schema';

type Schemas = components['schemas'];

// ---------- Category read-DTO (the headline drift, 69-04 Task 1) ----------

/**
 * v1.0 category wire shape — sourced from the generated `CategoryRead`.
 *
 * `code`/`ord` are required (in the OpenAPI `required` set, no default).
 *
 * The server-defaulted fields (`plan_cents`/`rollover`/`paused`/`tag`) and the
 * nullable `parent_id` are kept OPTIONAL here. The generated `CategoryRead`
 * renders the defaulted ones non-optional, but per 69-04 they STAY optional:
 * legacy / pre-gap-fix wire rows may omit them, and consumers
 * (`computeHomeData` et al.) defensively default — `computeHomeData.test.ts`
 * has an explicit "missing optional fields by defaulting" regression. Keeping
 * these optional preserves that defensive contract (threat T-69-04-01) without
 * any runtime behavior change. `tag` (Phase 36, `"personal"|"business"|"mixed"`)
 * is now present (optional) — the headline missing-field drift is closed.
 */
type CategoryV10DefaultedOptional =
  | 'plan_cents'
  | 'rollover'
  | 'paused'
  | 'parent_id'
  | 'tag';

export type CategoryV10 = Omit<
  Schemas['CategoryRead'],
  CategoryV10DefaultedOptional
> &
  Partial<Pick<Schemas['CategoryRead'], CategoryV10DefaultedOptional>>;

/** Generated `rollover` policy union (`"misc" | "savings"`). */
export type CategoryRollover = Schemas['CategoryRead']['rollover'];

/** Generated category `tag` union (`"personal" | "business" | "mixed"`). */
export type CategoryTag = Schemas['CategoryRead']['tag'];

// ---------- Me read-DTO (69-04 Task 2) ----------

/** Mirrors Python `UserRole` enum (app/db/models.py). Phase 12 ROLE-05. */
export type UserRole = 'owner' | 'member' | 'revoked';

/**
 * v1.0 `/api/v1/me` response — sourced from generated `MeV10Response`.
 *
 * `role` is overridden from the generated free-`string` to the domain
 * `UserRole` union: the contract serialises the enum as a plain string, but
 * the wire only ever emits `owner|member|revoked` and consumers narrow on it
 * (`me.role === 'owner'`). Every other field matches the generated shape
 * field-for-field (drift-report: "MeV10Response — no drift").
 */
export type MeV10Response = Omit<Schemas['MeV10Response'], 'role'> & {
  role: UserRole;
};

// ---------- Subscription read-DTO (69-04 Task 2) ----------

/**
 * v1.0 subscription wire shape — sourced from generated `SubscriptionReadV10`
 * (the CRUD DTO). NOTE: the contract's same-named `SubscriptionRead` is a
 * different tier/billing shape and is NOT the CRUD DTO — do not confuse them.
 * The nested `category` is the generated v1.0 `CategoryRead` (carries code /
 * ord / tag / ...). `account_id` / `day_of_month` / `posted_txn_id` are
 * optional+nullable, matching the prior handwritten `SubscriptionV10Ext`.
 */
export type SubscriptionV10Read = Schemas['SubscriptionReadV10'];

// ---------- Actual read-DTO (69-04 Task 2) ----------

/**
 * v1.0 actual-transaction wire shape — sourced from generated `ActualRead`
 * (4-valued `kind`). `account_id` / `parent_txn_id` are optional+nullable on
 * the wire (no server default) — kept optional to match the wire and avoid a
 * runtime crash on legacy rows that omit them. `tag` (`string | null`,
 * Phase 36) is present from the generated source.
 */
export type ActualV10Read = Schemas['ActualRead'];

/** Generated actual-surface `kind` union (4-valued). */
export type ActualV10Kind = Schemas['ActualRead']['kind'];
