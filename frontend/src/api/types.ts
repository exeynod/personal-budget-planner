/** Mirrors Python `UserRole` enum (app/db/models.py). Phase 12 ROLE-05. */
export type UserRole = 'owner' | 'member' | 'revoked';

/** Mirrors `MeResponse` from app/api/router.py. */
export interface MeResponse {
  tg_user_id: number;
  tg_chat_id: number | null;
  cycle_start_day: number;
  onboarded_at: string | null; // ISO datetime
  chat_id_known: boolean;
  /** Phase 12 ROLE-05: backend-driven role for admin-tab visibility (Phase 13). */
  role: UserRole;
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
  | 'error';

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

// Discriminated union: 'propose' carries an object, others a string.
export type AiStreamEvent =
  | { type: 'token'; data: string }
  | { type: 'tool_start'; data: string }
  | { type: 'tool_end'; data: string }
  | { type: 'propose'; data: ProposalPayload }
  | { type: 'done'; data: string }
  | { type: 'error'; data: string };

// ---------- Phase 13: Admin (Whitelist + AI Usage) ----------

/**
 * Mirrors `AdminUserResponse` from app/api/schemas/admin.py (Phase 13).
 * Used by GET /api/v1/admin/users.
 */
export interface AdminUserResponse {
  id: number;
  tg_user_id: number;
  tg_chat_id: number | null;
  role: UserRole;
  last_seen_at: string | null; // ISO datetime UTC
  onboarded_at: string | null;
  created_at: string;
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
