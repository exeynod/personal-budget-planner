import { apiFetch } from './client';
import { invalidate, CACHE_KEYS } from './cache';
import type { SettingsRead, SettingsUpdatePayload } from './types';

/**
 * GET /api/v1/settings
 *
 * Returns the owner's settings (currently just `cycle_start_day`).
 * Note: backend exposes only the owner row — single-tenant per CLAUDE.md.
 */
export async function getSettings(): Promise<SettingsRead> {
  return apiFetch<SettingsRead>('/settings');
}

/**
 * PATCH /api/v1/settings
 *
 * Updates `cycle_start_day` (1..28). Per SET-01 contract, the change applies
 * only to *future* periods — the current `budget_period` is not recomputed.
 * Returns the updated settings; caller should sync `current` from response.
 */
export async function updateSettings(payload: SettingsUpdatePayload): Promise<SettingsRead> {
  const res = await apiFetch<SettingsRead>('/settings', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  // Settings changes (cycle_start_day, income_cents, …) change /me — drop its
  // cache so the next read reflects the update instead of the 30s-stale value.
  invalidate(CACHE_KEYS.me);
  invalidate(CACHE_KEYS.home);
  return res;
}
