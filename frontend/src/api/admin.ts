import { apiFetch } from './client';
import type {
  AdminAiUsageResponse,
  AdminUserCreateRequest,
  AdminUserResponse,
} from './types';

/**
 * GET /api/v1/admin/users
 *
 * Returns whitelist sorted owner-first then by last_seen_at desc.
 * 403 if caller is not owner (require_owner backend dep).
 */
export async function listAdminUsers(): Promise<AdminUserResponse[]> {
  return apiFetch<AdminUserResponse[]>('/admin/users');
}

/**
 * POST /api/v1/admin/users
 *
 * Invite a new member by tg_user_id (creates AppUser role=member,
 * onboarded_at=NULL). 409 if tg_user_id already exists; 422 if
 * tg_user_id < 10000 (validation).
 *
 * The invitee can run /start in the bot to begin onboarding (Phase 14).
 */
export async function inviteAdminUser(
  payload: AdminUserCreateRequest,
): Promise<AdminUserResponse> {
  return apiFetch<AdminUserResponse>('/admin/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * DELETE /api/v1/admin/users/{user_id}
 *
 * Revoke a member: cascade purges all data (categories, periods,
 * transactions, subscriptions, AI conversation, ai_usage_log) and
 * deletes the AppUser row. The user receives 403 on subsequent requests.
 *
 * Self-revoke (owner deleting own id) returns 403.
 * Unknown user_id returns 404.
 *
 * Returns void (204 No Content from backend).
 */
export async function revokeAdminUser(userId: number): Promise<void> {
  return apiFetch<void>(`/admin/users/${userId}`, { method: 'DELETE' });
}

/**
 * GET /api/v1/admin/ai-usage
 *
 * Returns per-user AI usage breakdown — current_month + last_30d windows
 * с spending_cap_cents и pct_of_cap для UI warn/danger индикатора.
 *
 * Sorted by est_cost_cents_current_month desc. 403 for non-owner.
 */
export async function getAdminAiUsage(): Promise<AdminAiUsageResponse> {
  return apiFetch<AdminAiUsageResponse>('/admin/ai-usage');
}
