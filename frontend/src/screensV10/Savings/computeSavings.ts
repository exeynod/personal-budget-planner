// Phase 27-03 Task 1 GREEN: pure compute / format helpers for SavingsView
// + sheet validation gates. No React, no fetch, deterministic — drives
// progress bars on goal cards and the «СОХРАНИТЬ» CTA enabled-state in
// NewGoalSheet / DepositSheet.

const MONTHS_RU_GEN = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
] as const;

/**
 * Goal progress as integer percent in [0, 100].
 *
 * Returns 0 when target_cents <= 0 (avoid division by zero / negative
 * progress). Clamps current > target to 100 (UI shows full bar even on
 * over-saved goals — backend doesn't auto-close goals on hit, so the
 * user can keep depositing).
 */
export function computeProgressPct(
  currentCents: number,
  targetCents: number,
): number {
  if (targetCents <= 0) return 0;
  if (currentCents <= 0) return 0;
  const pct = Math.round((currentCents / targetCents) * 100);
  return Math.max(0, Math.min(100, pct));
}

/**
 * Format ISO date (YYYY-MM-DD) as «до DD <month-genitive> YYYY».
 *
 * Returns null for null/undefined/invalid input — caller renders no text
 * when due is absent. Uses Russian genitive case for the month
 * (мая, декабря, ...) per UI mock.
 */
export function formatDueRu(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const [, y, mm, dd] = m;
  const monthIdx = parseInt(mm, 10) - 1;
  if (monthIdx < 0 || monthIdx > 11) return null;
  const day = parseInt(dd, 10);
  if (day < 1 || day > 31) return null;
  return `до ${day} ${MONTHS_RU_GEN[monthIdx]} ${y}`;
}

/**
 * Validates the NewGoalSheet draft before enabling «СОХРАНИТЬ».
 * - non-empty trimmed name
 * - target_cents strictly positive
 * - due is optional (UI date picker passes null when blank)
 */
export function isValidGoalDraft(d: {
  name: string;
  target_cents: number;
  due?: string | null;
}): boolean {
  return d.name.trim().length > 0 && d.target_cents > 0;
}

/**
 * Validates the DepositSheet draft before enabling «СОХРАНИТЬ».
 * - amount_cents strictly positive (backend rejects 0 with 422)
 * - account_id required (backend's DepositCreate.account_id is non-null)
 * - goal_id is optional (deposit without goal still bumps total)
 */
export function isValidDepositDraft(d: {
  amount_cents: number;
  account_id: number | null;
  goal_id?: number | null;
}): boolean {
  return d.amount_cents > 0 && d.account_id != null;
}
