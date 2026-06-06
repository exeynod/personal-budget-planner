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
 * Phase 69 B4 — v1.0 `/api/v1/me` response, now sourced from the generated
 * OpenAPI schema (`generated/adapters.ts` → `components["schemas"]["MeV10Response"]`).
 *
 * Field-for-field match with the wire (`income_cents` nullable; `role`
 * narrowed to the `UserRole` domain union in the adapter).
 */
export type { MeV10Response } from './generated/adapters';

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
  tx_date: string; // ISO date
  source: ActualSource;
  created_at: string; // ISO datetime
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
 * Phase 26-06 — V1.0 subscription ext fields (day_of_month / account_id /
 * posted_txn_id). All optional+nullable on the wire (no server default). Kept
 * as a standalone helper interface for call-sites that pick only the ext set;
 * the full read DTO (`SubscriptionV10Read`) is generated-backed below.
 */
export interface SubscriptionV10Ext {
  day_of_month?: number | null;
  account_id?: number | null;
  posted_txn_id?: number | null;
}

/**
 * Phase 69 B4 — v1.0 subscription read shape emitted by GET /api/v1/subscriptions,
 * now sourced from the generated `components["schemas"]["SubscriptionReadV10"]`
 * (the CRUD DTO — NOT the same-named tier/billing schema). Its nested `category`
 * is the generated v1.0 `CategoryRead`; the ext fields are optional+nullable.
 */
export type { SubscriptionV10Read } from './generated/adapters';

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

// ---------- Phase 8: Analytics ----------

export interface TrendPoint {
  period_label: string; // e.g. "Янв", "Фев"
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
 * Phase 69 B4 — v1.0 actual surface, now sourced from the generated OpenAPI
 * schema (`generated/adapters.ts` → `components["schemas"]["ActualRead"]`).
 *
 * `kind` is 4-valued (`expense|income|roundup|deposit`). `account_id` /
 * `parent_txn_id` are optional+nullable on the wire (no server default) — kept
 * optional to match the wire and avoid a crash on legacy rows that omit them
 * (drift-report #8 / threat T-69-04-01). `tag` (`string | null`, Phase 36) is
 * present from the generated source.
 */
import type { ActualV10Read, ActualV10Kind } from './generated/adapters';

export type { ActualV10Read, ActualV10Kind };

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
 * Phase 69 B4 — v1.0 category wire shape, now sourced from the generated
 * OpenAPI schema (`generated/adapters.ts` → `components["schemas"]["CategoryRead"]`).
 *
 * `code`/`ord` are required; `plan_cents`/`rollover`/`paused`/`tag` are
 * server-defaulted (always present on the wire); `parent_id` is optional+nullable.
 * `tag` (`"personal"|"business"|"mixed"`, Phase 36) is included from the
 * generated source. The old stub Optionals are gone — the Phase 25 gap-fix
 * landed every field on the wire.
 */
import type {
  CategoryV10,
  CategoryRollover,
  CategoryTag,
} from './generated/adapters';

export type { CategoryV10, CategoryRollover, CategoryTag };
