/** Mirrors `MeResponse` from app/api/router.py. */
export interface MeResponse {
  tg_user_id: number;
  tg_chat_id: number | null;
  cycle_start_day: number;
  onboarded_at: string | null; // ISO datetime
  chat_id_known: boolean;
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
}

export interface SettingsUpdatePayload {
  cycle_start_day: number;
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
