// Phase 35-03 (REQ-35-03): typed wrapper for GET /api/v1/me/tier.
//
// Returns the effective tier (free/pro) + trial/pro window info used by the
// PaywallSheet UI. Mirrors the backend resolution in
// app/services/tier.py::effective_tier — frontend never duplicates the
// trial-vs-paid precedence logic.

import { apiFetch } from './client';

export interface TierInfo {
  tier: 'free' | 'pro';
  trial_ends_at: string | null;
  pro_active_until: string | null;
  is_trial_active: boolean;
}

export async function getMyTier(): Promise<TierInfo> {
  return apiFetch<TierInfo>('/me/tier');
}
