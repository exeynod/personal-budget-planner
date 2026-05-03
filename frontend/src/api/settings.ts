import { apiFetch } from './client';
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
  return apiFetch<SettingsRead>('/settings', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}
