/** Mirrors Python `UserRole` enum (app/db/models.py). Phase 12 ROLE-05. */
export type UserRole = 'owner' | 'member' | 'revoked';

/** Mirrors `MeResponse` from app/api/router.py. */
export interface MeResponse {
  tg_user_id: number;
  tg_chat_id: number | null;
  /** Optional — поле планировалось для ManagementScreen profile card,
   * но бэкенд /me пока не отдаёт. Помечено optional, чтобы UI с graceful
   * fallback'ами на отсутствующее значение проходил tsc strict. */
  tg_username?: string | null;
  cycle_start_day: number;
  onboarded_at: string | null; // ISO datetime
  chat_id_known: boolean;
  /** Phase 12 ROLE-05: backend-driven role for admin-tab visibility (Phase 13). */
  role: UserRole;
  /**
   * Phase 15 AICAP-04 — current MSK-month spend in USD-cents (scale 100/USD).
   * Format: (ai_spend_cents / 100).toFixed(2) → "$X.XX".
   * Differs from AdminAiUsageRow.spending_cap_cents which uses 100_000/USD scale (Phase 13 legacy).
   */
  ai_spend_cents: number;
  /**
   * Phase 15 AICAP-04 — spending cap in USD-cents (scale 100/USD); 0 = AI off.
   * Default: 46500 ($465.00). Format: (ai_spending_cap_cents / 100).toFixed(2).
   */
  ai_spending_cap_cents: number;
}

export type CategoryKind = 'expense' | 'income';

/** Mirrors `CategoryRead` from app/api/schemas/categories.py. */
export interface CategoryRead {
  id: number;
  name: string;
  kind: CategoryKind;
  is_archived: boolean;
  sort_order: number;
  created_at: string;
}

export interface CategoryCreatePayload {
  name: string;
  kind: CategoryKind;
  sort_order?: number;
}

export interface CategoryUpdatePayload {
  name?: string;
  sort_order?: number;
  is_archived?: boolean;
}

export type PeriodStatus = 'active' | 'closed';

/** Mirrors `PeriodRead` from app/api/schemas/periods.py. */
export interface PeriodRead {
  id: number;
  period_start: string; // ISO date
  period_end: string;
  starting_balance_cents: number;
  ending_balance_cents: number | null;
  status: PeriodStatus;
  closed_at: string | null;
}

/** POST /onboarding/complete request. */
export interface OnboardingCompleteRequest {
  starting_balance_cents: number;
  cycle_start_day: number;
  seed_default_categories: boolean;
}

/** POST /onboarding/complete response. */
export interface OnboardingCompleteResponse {
  period_id: number;
  seeded_categories: number;
  onboarded_at: string;
}

/**
 * Phase 22 (BE-01) v1.0 extension of /api/v1/me.
 *
 * Mirrors `MeV10Response` from `app/api/schemas/me_v10.py`. Adds the
 * `income_cents` field (nullable; `null` when user has not yet
 * completed v1.0 onboarding — see DATA-MODEL §1.1 + Phase 22 0012
 * migration).
 *
 * Other fields stay in lock-step with the legacy `MeResponse` so old
 * call sites can swap-cast without re-reading every property.
 */
export interface MeV10Response {
  tg_user_id: number;
  tg_chat_id: number | null;
  cycle_start_day: number;
  onboarded_at: string | null;
  chat_id_known: boolean;
  role: UserRole;
  ai_spend_cents: number;
  ai_spending_cap_cents: number;
  /** v1.0 added — null when onboarding not complete. */
  income_cents: number | null;
}

export interface SettingsRead {
  cycle_start_day: number;
  notify_days_before: number;
  is_bot_bound: boolean;
  enable_ai_categorization: boolean;
}

export interface SettingsUpdatePayload {
  cycle_start_day?: number;
  notify_days_before?: number;
  enable_ai_categorization?: boolean;
}

/** Mirrors `SuggestCategoryResponse` from app/api/schemas/ai.py (AICAT-02). */
export interface AiSuggestResponse {
  category_id: number | null;
  name: string | null;
  confidence: number;
}

// ---------- Phase 3: Plan Template & Planned Transactions ----------

/** Source of a planned-transaction row (mirrors backend PlanSource enum). */
export type PlanSource = 'template' | 'manual' | 'subscription_auto';

/** Mirrors `TemplateItemRead` from app/api/schemas/templates.py. */
export interface TemplateItemRead {
  id: number;
  category_id: number;
  amount_cents: number;
  description: string | null;
  day_of_period: number | null;
  sort_order: number;
}

export interface TemplateItemCreatePayload {
  category_id: number;
  amount_cents: number;
  description?: string | null;
  day_of_period?: number | null;
  sort_order?: number;
}

export interface TemplateItemUpdatePayload {
  category_id?: number;
  amount_cents?: number;
  description?: string | null;
  day_of_period?: number | null;
  sort_order?: number;
}

export interface SnapshotFromPeriodResponse {
  template_items: TemplateItemRead[];
  replaced: number;
}

/** Mirrors `PlannedRead` from app/api/schemas/planned.py. */
export interface PlannedRead {
  id: number;
  period_id: number;
  kind: CategoryKind;
  amount_cents: number;
  description: string | null;
  category_id: number;
  planned_date: string | null; // ISO date
  source: PlanSource;
  subscription_id: number | null;
}

export interface PlannedCreatePayload {
  kind: CategoryKind;
  amount_cents: number;
  description?: string | null;
  category_id: number;
  planned_date?: string | null;
}

export interface PlannedUpdatePayload {
  kind?: CategoryKind;
  amount_cents?: number;
  description?: string | null;
  category_id?: number;
  planned_date?: string | null;
}

export interface ApplyTemplateResponse {
  period_id: number;
  created: number;
  planned: PlannedRead[];
}

// ---------- Phase 4: Actual Transactions & Balance ----------

export type ActualSource = 'mini_app' | 'bot';

export interface ActualRead {
  id: number;
  period_id: number;
  kind: CategoryKind;
  amount_cents: number;
  description: string | null;
  category_id: number;
  tx_date: string;       // ISO date
  source: ActualSource;
  created_at: string;    // ISO datetime
}

export interface ActualCreatePayload {
  kind: CategoryKind;
  amount_cents: number;
  description?: string | null;
  category_id: number;
  tx_date: string;
}

export interface ActualUpdatePayload {
  kind?: CategoryKind;
  amount_cents?: number;
  description?: string | null;
  category_id?: number;
  tx_date?: string;
}

export interface BalanceCategoryRow {
  category_id: number;
  name: string;
  kind: CategoryKind;
  planned_cents: number;
  actual_cents: number;
  delta_cents: number;
}

export interface BalanceResponse {
  period_id: number;
  period_start: string;
  period_end: string;
  starting_balance_cents: number;
  planned_total_expense_cents: number;
  actual_total_expense_cents: number;
  planned_total_income_cents: number;
  actual_total_income_cents: number;
  balance_now_cents: number;
  delta_total_cents: number;
  by_category: BalanceCategoryRow[];
}

// ---------- Phase 5: Dashboard & Period Lifecycle ----------

/**
 * GET /api/v1/periods response — list of all periods sorted by period_start desc.
 * Type alias for documentation; consumers can use PeriodRead[] directly.
 */
export type PeriodListResponse = PeriodRead[];

// ---------- Phase 6: Subscriptions ----------

export type SubCycle = 'monthly' | 'yearly';

/** Mirrors `SubscriptionRead` from app/api/schemas/subscriptions.py. */
export interface SubscriptionRead {
  id: number;
  name: string;
  amount_cents: number;
  cycle: SubCycle;
  next_charge_date: string; // ISO date YYYY-MM-DD
  category_id: number;
  notify_days_before: number;
  is_active: boolean;
  category: CategoryRead;
}

export interface SubscriptionCreatePayload {
  name: string;
  amount_cents: number;
  cycle: SubCycle;
  next_charge_date: string;
  category_id: number;
  notify_days_before?: number;
  is_active?: boolean;
}

export interface SubscriptionUpdatePayload {
  name?: string;
  amount_cents?: number;
  cycle?: SubCycle;
  next_charge_date?: string;
  category_id?: number;
  notify_days_before?: number;
  is_active?: boolean;
}

export interface ChargeNowResponse {
  planned_id: number;
  next_charge_date: string;
}

// ---------- Phase 26-06: V1.0 Subscription Extensions ----------

/**
 * Phase 26-06 — V1.0 ext fields layered onto SubscriptionRead (Phase 22 BE-12).
 *
 * Backend exposes day_of_month/account_id/posted_txn_id когда v1.0 schema
 * landed (Phase 22). Defensive typing — optional + nullable до full schema
 * deploy verification (mirrors CategoryV10 schema-gap pattern).
 */
export interface SubscriptionV10Ext {
  day_of_month?: number | null;
  account_id?: number | null;
  posted_txn_id?: number | null;
}

/** Phase 26-06 — extended SubscriptionRead emitted by /api/v1/subscriptions. */
export type SubscriptionV10Read = SubscriptionRead & SubscriptionV10Ext;

/**
 * Phase 26-06 — request body for PATCH /subscriptions/{id} (V10 super-set).
 * Backend (Phase 22) accepts both legacy fields AND day_of_month/account_id.
 */
export interface SubscriptionV10UpdatePayload {
  name?: string;
  amount_cents?: number;
  cycle?: SubCycle;
  next_charge_date?: string;
  category_id?: number;
  notify_days_before?: number;
  is_active?: boolean;
  day_of_month?: number;
  account_id?: number;
}

/** Phase 26-06 — response for POST /subscriptions/{id}/post. */
export interface SubscriptionPostResponse {
  txn_id: number;
  subscription_id: number;
  posted_at: string;
}

// ---------- Phase 26-04: PATCH /plan-month atomic batch ----------

/** Phase 26-04 — single category lift in atomic plan-month patch. */
export interface PlanMonthItem {
  category_id: number;
  plan_cents: number;
}

/** Phase 26-04 — request body for PATCH /api/v1/plan-month. */
export interface PlanMonthPatchPayload {
  plans: PlanMonthItem[];
}

/** Phase 26-04 — response for PATCH /api/v1/plan-month (returns updated CategoryRead[]). */
export interface PlanMonthResponse {
  categories: CategoryV10[];
}

// ---------- Phase 27-03: Savings (SAV-V10-01..04) ----------

/**
 * Phase 27-03 — per-user roundup config (mirrors backend SavingsConfig).
 * `roundup_base` is constrained to {10, 50, 100} ₽ both server-side
 * (Pydantic Literal + DB CHECK) and on the wire — matches the chip set
 * in SavingsView.
 */
export interface SavingsConfig {
  roundup_enabled: boolean;
  roundup_base: 10 | 50 | 100;
}

/** Phase 27-03 — single goal row (mirrors backend GoalRead).
 *
 *  `due` is ISO YYYY-MM-DD when set; the backend Pydantic schema serializes
 *  the underlying `date` to the ISO string form. `created_at` is full
 *  ISO datetime UTC.
 */
export interface GoalRead {
  id: number;
  name: string;
  target_cents: number;
  current_cents: number;
  due: string | null;
  created_at: string;
}

/** Phase 27-03 — GET /api/v1/savings response (mirrors SavingsSnapshotResponse). */
export interface SavingsSnapshot {
  total_cents: number;
  month_in_cents: number;
  config: SavingsConfig;
  goals: GoalRead[];
}

/** Phase 27-03 — PATCH /api/v1/savings/config request body. */
export interface SavingsConfigPatchPayload {
  roundup_enabled?: boolean;
  roundup_base?: 10 | 50 | 100;
}

/**
 * Phase 27-03 — POST /api/v1/savings/deposit request body.
 *
 * Backend's `DepositCreate.account_id` is `int = Field(gt=0)` — REQUIRED,
 * not optional. UI's DepositSheet enforces this via `isValidDepositDraft`
 * which gates the СОХРАНИТЬ button until an account is picked.
 *
 * `amount_cents` is positive on the wire — the backend service negates it
 * internally so deposits show as outflow on the source account.
 */
export interface DepositCreatePayload {
  amount_cents: number;
  account_id: number;
  goal_id?: number | null;
}

/**
 * Phase 27-03 — POST /api/v1/savings/deposit response (mirrors DepositResponse).
 *
 * `amount_cents` is the SIGNED storage amount (negative — deposits debit
 * the source). Frontend should display `Math.abs(amount_cents)` if it
 * shows the value back to the user.
 */
export interface DepositResponse {
  id: number;
  amount_cents: number;
  account_id: number | null;
  category_id: number;
  tx_date: string;
  description: string | null;
}

/** Phase 27-03 — POST /api/v1/goals request body (mirrors GoalCreate). */
export interface GoalCreatePayload {
  name: string;
  target_cents: number;
  due?: string | null;
}

// ---------- Phase 8: Analytics ----------

export interface TrendPoint {
  period_label: string;      // e.g. "Янв", "Фев"
  expense_cents: number;
  income_cents: number;
}

export interface TrendResponse {
  points: TrendPoint[];
}

export interface OverspendItem {
  category_id: number;
  name: string;
  planned_cents: number;
  actual_cents: number;
  // null = unplanned (план был 0); фронт показывает «Без плана».
  overspend_pct: number | null;
}

export interface TopOverspendResponse {
  items: OverspendItem[];
}

export interface TopCategoryItem {
  category_id: number;
  name: string;
  actual_cents: number;
  planned_cents: number;
}

export interface TopCategoriesResponse {
  items: TopCategoryItem[];
}

export type ForecastMode = 'forecast' | 'cashflow' | 'empty';

export interface ForecastResponse {
  mode: ForecastMode;
  // forecast (1M)
  starting_balance_cents?: number | null;
  planned_income_cents?: number | null;
  planned_expense_cents?: number | null;
  projected_end_balance_cents?: number | null;
  period_end?: string | null;
  // cashflow (3M+)
  total_net_cents?: number | null;
  monthly_avg_cents?: number | null;
  periods_count?: number | null;
  requested_periods?: number | null;
}

// ---------- Phase 9: AI Assistant ----------

export type AiRole = 'user' | 'assistant' | 'tool';

export interface ChatMessageRead {
  id: number;
  role: AiRole;
  content: string | null;
  tool_name: string | null;
  created_at: string; // ISO datetime
}

export interface ChatHistoryResponse {
  messages: ChatMessageRead[];
}

export type AiEventType =
  | 'token'
  | 'tool_start'
  | 'tool_end'
  | 'propose'
  | 'done'
  | 'error'
  | 'tool_error';

export interface ActualProposalTxn {
  amount_cents: number;
  kind: 'expense' | 'income';
  description: string;
  category_id: number | null;
  category_name: string | null;
  category_confidence: number;
  tx_date: string; // ISO date
}

export interface PlannedProposalTxn {
  amount_cents: number;
  kind: 'expense' | 'income';
  description: string;
  category_id: number | null;
  category_name: string | null;
  category_confidence: number;
  day_of_period: number | null;
}

export interface ActualProposalPayload {
  _proposal: true;
  kind_of: 'actual';
  txn: ActualProposalTxn;
}

export interface PlannedProposalPayload {
  _proposal: true;
  kind_of: 'planned';
  txn: PlannedProposalTxn;
}

export type ProposalPayload = ActualProposalPayload | PlannedProposalPayload;

// AI-02 (Plan 16-04): backend SSE event when tool-args fail Pydantic
// validation. `tool` is the offending tool name (for telemetry/UI hints);
// `message` is a humanized, sanitized text safe to render in chat.
export interface ToolErrorPayload {
  tool: string;
  message: string;
}

// Discriminated union: 'propose' carries an object, others a string.
export type AiStreamEvent =
  | { type: 'token'; data: string }
  | { type: 'tool_start'; data: string }
  | { type: 'tool_end'; data: string }
  | { type: 'propose'; data: ProposalPayload }
  | { type: 'tool_error'; data: ToolErrorPayload }
  | { type: 'done'; data: string }
  | { type: 'error'; data: string };

// ---------- Phase 13: Admin (Whitelist + AI Usage) ----------

/**
 * Mirrors `AdminUserResponse` from app/api/schemas/admin.py (Phase 13).
 * Used by GET /api/v1/admin/users.
 * Phase 15 AICAP-04: spending_cap_cents added (USD-cents scale 100/USD).
 */
export interface AdminUserResponse {
  id: number;
  tg_user_id: number;
  tg_chat_id: number | null;
  role: UserRole;
  last_seen_at: string | null; // ISO datetime UTC
  onboarded_at: string | null;
  created_at: string;
  /**
   * Phase 15 AICAP-04 — current AI cap in USD-cents (scale 100/USD).
   * 0 = AI off. Default 46500 ($465.00).
   * Exposed by backend AdminUserResponse since Plan 15-04.
   */
  spending_cap_cents: number;
}

/**
 * Mirrors `AdminUserCreateRequest` — body для POST /api/v1/admin/users.
 * Min 5 digits enforced backend-side via `ge=10_000` (Pydantic Field).
 * Frontend дополнительно валидирует UI-сторонне (InviteSheet form).
 */
export interface AdminUserCreateRequest {
  tg_user_id: number;
}

/**
 * Mirrors `CapUpdate` (app/api/schemas/admin.py) — body для PATCH
 * /api/v1/admin/users/{user_id}/cap (Phase 15 AICAP-04).
 *
 * Bounds: 0 ≤ spending_cap_cents ≤ 10_000_000 (= $100k cap).
 * Scale: USD-cents (100/USD) — NOT the Phase 13 legacy 100_000/USD scale.
 */
export interface CapUpdateRequest {
  spending_cap_cents: number;
}

/**
 * Mirrors `UsageBucket` from app/api/schemas/ai.py.
 * Reused for current_month / last_30d nested objects in admin AI usage row.
 */
export interface AiUsageBucket {
  requests: number;
  prompt_tokens: number;
  completion_tokens: number;
  cached_tokens: number;
  total_tokens: number;
  est_cost_usd: number;
}

/**
 * Mirrors `AdminAiUsageRow` (AIUSE-01..03) — one user breakdown.
 *
 * UI uses pct_of_cap to render warn-style (≥0.80) / danger-style (≥1.0)
 * in the linear progress bar (mirrors DashboardCategoryRow pattern).
 */
export interface AdminAiUsageRow {
  user_id: number;
  tg_user_id: number;
  name: string | null;
  role: UserRole;
  spending_cap_cents: number;
  current_month: AiUsageBucket;
  last_30d: AiUsageBucket;
  est_cost_cents_current_month: number;
  pct_of_cap: number;
}

/**
 * Mirrors `AdminAiUsageResponse` — wrapper для GET /api/v1/admin/ai-usage.
 */
export interface AdminAiUsageResponse {
  users: AdminAiUsageRow[];
  generated_at: string; // ISO datetime UTC
}

// ---------- Phase 25 (plan 25-03): v1.0 typed wire shapes ----------

/**
 * Phase 25-03 — wire-level kind enum for the v1.0 actual surface.
 *
 * Mirrors `ActualKindStr` from `app/api/schemas/actual.py` (4-valued
 * after Phase 25-01 lands). Legacy v0.x ActualRead still uses
 * `CategoryKind` (2-valued); the v10 client wraps a separate
 * ActualV10Read so v0.x consumers keep working untouched.
 */
export type ActualV10Kind = 'expense' | 'income' | 'roundup' | 'deposit';

/**
 * Phase 25-03 — extended ActualRead emitted by `POST /actual` and
 * `GET /periods/{id}/actual` after Phase 25-01.
 *
 * Fields mirror `ActualRead` (`app/api/schemas/actual.py`); `account_id`
 * and `parent_txn_id` are nullable (legacy v0.x rows have NULL).
 */
export interface ActualV10Read {
  id: number;
  period_id: number;
  kind: ActualV10Kind;
  amount_cents: number;
  description: string | null;
  category_id: number;
  tx_date: string; // ISO date
  source: ActualSource;
  created_at: string; // ISO datetime
  /** v1.0 added — nullable for legacy v0.x rows. */
  account_id: number | null;
  /** v1.0 added — non-null only on roundup children. */
  parent_txn_id: number | null;
}

/**
 * Phase 25-03 — request body for `POST /actual` (v1.0 path).
 *
 * `account_id` is optional: when present, the route delegates to
 * `create_actual_v10` (delta-balance + roundup hook); when absent,
 * legacy `create_actual` runs (per Phase 25-01 dispatch).
 */
export interface ActualV10CreatePayload {
  kind: ActualV10Kind;
  amount_cents: number;
  description?: string | null;
  category_id: number;
  tx_date: string; // ISO date
  account_id?: number | null;
}

/** Phase 25-03 — wire-level account.kind enum (mirrors `AccountKindStr`). */
export type AccountKindStr = 'card' | 'cash' | 'savings';

/**
 * Phase 25-03 — `AccountRead` mirror (Phase 22 BE-02, see
 * `app/api/schemas/accounts.py`).
 *
 * Note: the wire field is `primary` (not `is_primary`) — the backend
 * exposes the ORM `is_primary` attribute via `serialization_alias`.
 */
export interface AccountResponse {
  id: number;
  bank: string;
  mask: string | null;
  kind: AccountKindStr;
  balance_cents: number;
  primary: boolean;
  created_at: string; // ISO datetime
}

/**
 * Phase 27-04 — request body for `POST /api/v1/accounts` (ACCT-V10-02 form).
 *
 * Mirrors `AccountCreate` (`app/api/schemas/accounts.py`):
 *   - bank: 1..40 chars (str_strip_whitespace)
 *   - mask: optional ≤16 chars
 *   - kind: 'card' | 'cash' | 'savings'
 *   - balance_cents: bounded ±100M ₽ (BIGINT-safe; UI gate enforces ≥0)
 *   - primary: defaults false
 */
export interface AccountCreatePayload {
  bank: string;
  kind: AccountKindStr;
  mask?: string | null;
  balance_cents: number;
  primary?: boolean;
}

/**
 * Phase 25-03 — wire-level rollover policy enum.
 *
 * Mirrors `RolloverPolicy` (`app.db.models`); the backend stores it as
 * VARCHAR(8) with a CHECK constraint (alembic 0013) and currently
 * exposes it on the ORM `Category` model. **NOTE**: as of Phase 22 BE,
 * the public `CategoryRead` Pydantic schema (`app/api/schemas/
 * categories.py`) does NOT yet emit this field — see `CategoryV10`
 * comment below.
 */
export type CategoryRollover = 'misc' | 'savings';

/**
 * Phase 25-03 — v1.0 category wire shape.
 *
 * **Schema gap (documented in 25-03 SUMMARY)**: as of Phase 22 the
 * public `CategoryRead` Pydantic schema (`app/api/schemas/categories.py`)
 * still emits only the v0.x field set (`id, name, kind, is_archived,
 * sort_order, created_at`). The ORM model already has the v1.0 columns
 * (Phase 22 BE-04 / alembic 0013) — `code, plan_cents, ord, rollover,
 * paused, parent_id` — but they are NOT yet exposed on the wire.
 *
 * Until the response schema is extended (likely Phase 25-04 or a
 * follow-up backend tweak), the v1.0 fields below are typed as optional
 * + nullable so consumers can defensively handle both pre- and
 * post-extension responses without runtime type errors. UI code should
 * fall back to safe defaults (`plan_cents ?? 0`, `paused ?? false`,
 * `rollover ?? 'misc'`, `code ?? null`) until the schema lands.
 */
export interface CategoryV10 {
  id: number;
  name: string;
  kind: CategoryKind;
  is_archived: boolean;
  sort_order: number;
  created_at: string; // ISO datetime

  /** v1.0 — pending Phase 22 schema update (ORM has it, wire does not). */
  code?: string | null;
  /** v1.0 — pending Phase 22 schema update. */
  plan_cents?: number;
  /** v1.0 — pending Phase 22 schema update. CHAR(2) on DB ('01'..'99'). */
  ord?: string;
  /** v1.0 — pending Phase 22 schema update. */
  rollover?: CategoryRollover;
  /** v1.0 — pending Phase 22 schema update. */
  paused?: boolean;
  /** v1.0 — pending Phase 22 schema update; null when no parent. */
  parent_id?: number | null;
}
